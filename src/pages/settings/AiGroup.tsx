/**
 * 设置 · 智能（AI Core + 情报源 / 自建代理）
 *
 * 从 SettingsPage 拆出。状态自洽：本文件自己读 store、自己持有输入草稿与模型列表。
 * 说明小字按「只留核心信息」精简过一轮（用户反馈该板块小字过于冗长）。
 */
import { useState } from 'react'
import { Zap } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { encryptor, isWebCryptoAvailable } from '../../sync/encryption/encryption'
import { ProxyConfig, SourceManager } from '../../components/source/SourceManager'
import { resolveAIProvider, testAIProvider } from '../../services/ai/ai-service'
import { Button, Collapse, Input, Section, Select, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'

const AI_PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'agnes-2.5-flash' },
  // NVIDIA NIM：OpenAI 兼容，免费（约 40 RPM 限速），模型可在 build.nvidia.com/models 免费端点查看
  { name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'deepseek-ai/deepseek-v4-pro' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
]

export function AiGroup() {
  const settings = useSettingsStore()
  const toast = useToast().toast
  const [aiKeyDraft, setAiKeyDraft] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [keySaving, setKeySaving] = useState(false)
  const [testing, setTesting] = useState(false)
  /** Key 用 AES-GCM 加密后才落盘；crypto.subtle 只在 https / localhost 下存在。
   *  非安全上下文里 encryptor 会**明确抛错**（本项目拒绝退化为明文存储），
   *  所以这里先摆出来，别让用户点完才知道存不进去。 */
  const cryptoOk = isWebCryptoAvailable()

  /**
   * 保存 API Key。
   * 之前这里直接 `await encryptor.encrypt(...)` 且**没有 try/catch** ——
   * 加密一旦抛错（非 https 环境最常见），整个 handler 静默中断：没有提示、没有落盘，
   * 表现就是用户说的「Key 无法保存」。异步事件处理器不归错误边界管，
   * 所以这类写法必须自己兜住。
   */
  const saveKey = async () => {
    const raw = aiKeyDraft.trim()
    if (!raw || keySaving) return
    setKeySaving(true)
    try {
      const enc = await encryptor.encrypt(raw)
      settings.set({ aiKey: enc, aiKeyEnc: true })
      setAiKeyDraft('')
      void resolveAIProvider()
      toast('API Key 已加密保存（AES-GCM）', 'success')
    } catch (e) {
      toast(`保存失败：${e instanceof Error ? e.message : '未知错误'}`, 'danger')
    } finally {
      setKeySaving(false)
    }
  }

  /**
   * 测试连接。
   * 之前按钮挂着 `disabled={!settings.aiKey}` —— Key 没存进去时它就是个禁用按钮，
   * 点下去毫无反应，看起来像"按钮坏了"。改为**始终可点**：缺 Key 就用提示告诉用户，
   * 这比一个不会动的按钮有用得多。同时补上忙碌态（默认超时 30 秒，
   * 期间没有任何反馈的话用户只会以为没点上）。
   */
  const runTest = async () => {
    if (testing) return
    if (!useSettingsStore.getState().aiKey) {
      toast('尚未保存 API Key —— 先填 Key 点「加密保存」，再回来测试', 'info')
      return
    }
    setTesting(true)
    try {
      const r = await testAIProvider()
      toast(r.message, r.ok ? 'success' : 'danger')
    } catch (e) {
      toast(`测试失败：${e instanceof Error ? e.message : '未知错误'}`, 'danger')
    } finally {
      setTesting(false)
    }
  }

  /** 拉取当前 Provider 的模型列表（OpenAI 兼容 /v1/models；NVIDIA 等免费端点同样适用） */
  const fetchModels = async () => {
    const s = useSettingsStore.getState()
    if (!s.aiKey) {
      toast('先保存 API Key 再拉取模型列表', 'info')
      return
    }
    setModelsLoading(true)
    try {
      const key = s.aiKeyEnc ? await encryptor.decrypt(s.aiKey) : s.aiKey
      const res = await fetch(`${s.aiBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { data?: { id?: string }[] }
      const ids = (data.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x))
      if (ids.length === 0) throw new Error('接口返回空列表')
      setModels(ids)
      toast(`拉到 ${ids.length} 个模型，在下方下拉选择或直接填入`, 'success')
    } catch (e) {
      toast(`拉取模型失败：${e instanceof Error ? e.message : '未知错误'}（检查 Base URL 与 Key 权限）`, 'danger')
    } finally {
      setModelsLoading(false)
    }
  }

  return (
    <>
      <Section title="AI Core" hint="OpenAI 兼容">
        <div className="max-w-xl space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-20 shrink-0 text-sm text-ink-muted">Provider</span>
            <div className="switch-pill flex shrink-0 gap-1 rounded-tile p-0.5">
              {([
                ['local', '本地规则'],
                ['remote', '远程模型'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    settings.set({ aiProvider: v })
                    void resolveAIProvider()
                  }}
                  className={cn(
                    'whitespace-nowrap rounded-control px-3 py-1 text-sm transition-colors',
                    settings.aiProvider === v ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {/* 说明独占整行：与 switch 并排时会被压成每行三两个字 */}
            <span className="w-full text-xs text-ink-faint">远程需 Key（本地加密）</span>
            {settings.aiProvider === 'remote' && !settings.aiKey && (
              <span className="w-full text-xs text-cinnabar">未配 Key，仍在用本地规则</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">预设</span>
            <div className="flex flex-wrap gap-1">
              {AI_PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  variant={settings.aiBaseUrl === p.baseUrl ? 'primary' : 'tertiary'}
                  onClick={() => {
                    settings.set({ aiBaseUrl: p.baseUrl, aiModel: p.model })
                    toast(`已填入 ${p.name} 预设，填 Key 后点「测试连接」`, 'info')
                  }}
                  className="!px-2"
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">Base URL</span>
            <Input
              value={settings.aiBaseUrl}
              onChange={(e) => settings.set({ aiBaseUrl: e.target.value })}
              className="flex-1 font-mono !text-xs"
              placeholder="https://apihub.agnes-ai.com/v1"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">模型</span>
            <Input
              value={settings.aiModel}
              onChange={(e) => settings.set({ aiModel: e.target.value })}
              className="flex-1 font-mono !text-xs"
              placeholder="如 deepseek-chat"
            />
            <Button size="sm" variant="tertiary" onClick={() => void fetchModels()} disabled={modelsLoading || !settings.aiKey}>
              {modelsLoading ? '拉取中…' : '获取模型列表'}
            </Button>
          </div>
          {/* 拉取到的模型列表：下拉切换即填入（NVIDIA/Agnes 等 OpenAI 兼容端点通用）
              —— 不再挂"共 N 个模型"的小字：下拉本身已经说明了它能干什么 */}
          {models.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0" />
              <Select
                value={settings.aiModel}
                onChange={(e) => settings.set({ aiModel: e.target.value })}
                className="!w-auto max-w-[300px] font-mono !text-xs"
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">API Key</span>
            <Input
              type="password"
              placeholder={settings.aiKeyEnc ? '已加密保存 · 输入以更换' : 'sk-…'}
              value={aiKeyDraft}
              onChange={(e) => setAiKeyDraft(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveKey()
              }}
            />
            <Button
              variant="secondary"
              onClick={() => void saveKey()}
              disabled={!aiKeyDraft.trim() || keySaving || !cryptoOk}
            >
              {keySaving ? '保存中…' : '加密保存'}
            </Button>
          </div>
          {!cryptoOk && (
            <p className="ml-[92px] text-xs leading-relaxed text-cinnabar">
              当前环境不支持加密（需要 https 或 localhost），Key 无法安全保存。
              请改用 https 访问，或把它装成应用后再配置。
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0" />
            <Button variant="tertiary" onClick={() => void runTest()} disabled={testing}>
              <Zap size={13} /> {testing ? '测试中…' : '测试连接'}
            </Button>
            {settings.aiKey ? (
              <span className="text-xs text-ink-faint">
                {settings.aiKeyEnc ? 'Key 已加密保存' : 'Key 已保存（未加密）'}
              </span>
            ) : (
              <span className="text-xs text-ink-faint">AI 写入先预览，确认后落库</span>
            )}
          </div>
        </div>
      </Section>

      {/* 代理留在首屏：情报页抓取失败会把用户直接指到这里，指着的人不能隔着折叠 */}
      <ProxyConfig />

      {/* 不写 hint：折叠头已写明「情报源」，再加一句"源列表与抓取"是同义复述 */}
      <Collapse title="情报源">
        <SourceManager />
      </Collapse>
    </>
  )
}
