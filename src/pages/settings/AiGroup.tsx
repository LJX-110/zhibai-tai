/**
 * 设置 · 智能（AI Core + 情报源 / 自建代理）
 *
 * 从 SettingsPage 拆出。状态自洽：本文件自己读 store、自己持有输入草稿与模型列表。
 *
 * ## 分层（2026-09-28 收口）
 * 首屏只留「用得上」的四件事：**Provider / API Key / 模型 / 连接测试**。
 * Base URL 这类开发者概念的输入收进「高级设置」折叠 —— 预设按钮已覆盖大多数选择。
 *
 * ## 为什么把「浏览器能不能直连」写在界面上
 * 纯前端只能直连**返回 CORS 头**的端点（实测：DeepSeek / Kimi 可以，
 * Agnes / NVIDIA 不返回任何 `Access-Control-*`）。不标注的话，用户会照着预设配好
 * 再看到一句"连接失败"，还以为是自己填错了 —— 这是环境限制，不是他的错。
 */
import { useState } from 'react'
import { Zap } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { encryptor, isWebCryptoAvailable } from '../../sync/encryption/encryption'
import { ProxyConfig, SourceManager } from '../../components/source/SourceManager'
import { listAIModels, resolveAIProvider, testAIProvider } from '../../services/ai/ai-service'
import { Button, Collapse, Input, Section, Select, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'

/**
 * 预设服务。`cors` 是**实测结论**（不是猜测）：
 *  · ok      —— OPTIONS 预检返回 `access-control-allow-origin`，浏览器可直连
 *  · blocked —— 实测不发任何 `Access-Control-*` 头，浏览器里必然连不上
 *  · unknown —— 网络层未能测通，不做结论
 */
const AI_PRESETS: { name: string; baseUrl: string; model: string; cors: 'ok' | 'blocked' | 'unknown' }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', cors: 'ok' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', cors: 'ok' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', cors: 'unknown' },
  { name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'agnes-2.5-flash', cors: 'blocked' },
  { name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'deepseek-ai/deepseek-v4.1-flash', cors: 'blocked' },
]

export function AiGroup() {
  const settings = useSettingsStore()
  const toast = useToast().toast
  const [aiKeyDraft, setAiKeyDraft] = useState('')
  /** 拉到的模型列表**连同它的 baseUrl**：换端点后旧列表自动失效（见 listAIModels 注释） */
  const [models, setModels] = useState<{ baseUrl: string; ids: string[] } | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [keySaving, setKeySaving] = useState(false)
  const [testing, setTesting] = useState(false)
  /** Key 用 AES-GCM 加密后才落盘；crypto.subtle 只在 https / localhost 下存在。
   *  非安全上下文里 encryptor 会**明确抛错**（本项目拒绝退化为明文存储），
   *  所以这里先摆出来，别让用户点完才知道存不进去。 */
  const cryptoOk = isWebCryptoAvailable()

  const activePreset = AI_PRESETS.find((p) => p.baseUrl === settings.aiBaseUrl)
  /** 只有真的选了「浏览器连不上」的服务才提示，未选 / 选了能用的都不打扰 */
  const blockedNotice = settings.aiProvider === 'remote' && activePreset?.cors === 'blocked'
  const availableModels = models && models.baseUrl === settings.aiBaseUrl ? models.ids : []

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

  /** 拉取当前 Provider 的模型列表（实现已收进 Provider 层：带超时、可单测） */
  const fetchModels = async () => {
    if (modelsLoading) return
    if (!useSettingsStore.getState().aiKey) {
      toast('先保存 API Key 再拉取模型列表', 'info')
      return
    }
    setModelsLoading(true)
    try {
      const r = await listAIModels()
      setModels(r.ok ? { baseUrl: r.baseUrl, ids: r.models } : null)
      toast(r.message, r.ok ? 'success' : r.fatal ? 'danger' : 'info')
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
            <span className="w-full text-xs text-ink-faint">远程需 Key（本地加密存储）</span>
            {settings.aiProvider === 'remote' && !settings.aiKey && (
              <span className="w-full text-xs text-cinnabar">未配 Key，仍在用本地规则</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-20 shrink-0 text-sm text-ink-muted">服务</span>
            <div className="flex flex-wrap gap-1">
              {AI_PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  variant={settings.aiBaseUrl === p.baseUrl ? 'primary' : 'tertiary'}
                  onClick={() => {
                    settings.set({ aiBaseUrl: p.baseUrl, aiModel: p.model })
                    toast(`已切换 ${p.name} 预设，填 Key 后点「测试连接」`, 'info')
                  }}
                  className="!px-2"
                >
                  {p.name}
                </Button>
              ))}
            </div>
            {blockedNotice && (
              <span className="w-full text-xs leading-relaxed text-cinnabar">
                当前浏览器无法直接连接此服务（服务端未开放跨域）—— 请改用 DeepSeek / Kimi
              </span>
            )}
          </div>

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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-20 shrink-0 text-sm text-ink-muted">模型</span>
            <Input
              value={settings.aiModel}
              onChange={(e) => settings.set({ aiModel: e.target.value })}
              className="min-w-[8rem] flex-1 font-mono !text-xs"
              placeholder="如 deepseek-chat"
            />
            <Button size="sm" variant="tertiary" onClick={() => void fetchModels()} disabled={modelsLoading}>
              {modelsLoading ? '拉取中…' : '拉取模型列表'}
            </Button>
          </div>
          {/* 拉到的列表挂在「模型」行下方（比并排多一个下拉更省横向空间）；
              只在属于当前 baseUrl 时显示 —— 换端点后旧列表必须失效 */}
          {availableModels.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0" />
              <Select
                value={availableModels.includes(settings.aiModel) ? settings.aiModel : ''}
                onChange={(e) => {
                  if (e.target.value) settings.set({ aiModel: e.target.value })
                }}
                className="!w-auto max-w-[300px] font-mono !text-xs"
                aria-label="从拉取到的模型中选择"
              >
                <option value="">从列表选择…</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-20 shrink-0" />
            <Button variant="tertiary" onClick={() => void runTest()} disabled={testing}>
              <Zap size={13} /> {testing ? '测试中…' : '测试连接'}
            </Button>
            <span className="text-xs text-ink-faint">
              {settings.aiKey
                ? settings.aiKeyEnc
                  ? 'Key 已加密保存'
                  : 'Key 已保存（未加密）'
                : '测试需先保存 Key'}
            </span>
          </div>
        </div>
      </Section>

      {/* Base URL 是开发者概念：预设按钮覆盖了常规选择，手改地址收进折叠 */}
      <Collapse title="高级设置">
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">Base URL</span>
          <Input
            value={settings.aiBaseUrl}
            onChange={(e) => settings.set({ aiBaseUrl: e.target.value })}
            className="min-w-[12rem] flex-1 font-mono !text-xs"
            placeholder="https://api.deepseek.com/v1"
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          任意 OpenAI 兼容端点都可填入（以 /v1 结尾）；模型名直接写在上面「模型」一栏。
          端点需允许浏览器跨域，否则只能换服务 —— 纯前端无法绕过。
        </p>
      </Collapse>

      {/* 代理留在首屏：情报页抓取失败会把用户直接指到这里，指着的人不能隔着折叠 */}
      <ProxyConfig />

      {/* 不写 hint：折叠头已写明「情报源」，再加一句"源列表与抓取"是同义复述 */}
      <Collapse title="情报源">
        <SourceManager />
      </Collapse>
    </>
  )
}