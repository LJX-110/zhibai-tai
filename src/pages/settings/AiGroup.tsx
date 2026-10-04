/**
 * 设置 · AI 组（2026-10-01 三段收口；2026-10-02 版式统一）
 *
 * 只留三段，按「用户要理解的概念数」收敛：
 *  · **模型与连接** —— 用哪个服务、端点、Key、模型、测试（**Base URL 并入本段**，不再是单独入口）
 *  · **AI 人设** —— 它是谁（`TianjiPersonaGroup` 自带段头）
 *  · **AI 记忆** —— 它记得什么（`TianjiMemoryGroup` 自带段头）
 * 「抓取与代理」已移入「系统 · 数据」组（与同步、情报数据管理同组）——
 * AI 页只回答"AI 怎么连、它是谁、记得什么"。
 *
 * ## 为什么把「浏览器能不能直连」写在预设上
 * 纯前端只能直连**返回 CORS 头**的端点（实测：DeepSeek / Kimi / Agnes 可以，
 * NVIDIA 不返回任何 `Access-Control-*`）。不标注的话，用户会照着预设配好
 * 再看到一句"连接失败"，还以为是自己填错了 —— 这是环境限制，不是他的错。
 * 故不可直连的预设**直接置灰**（title 里写明原因）。
 *
 * ## 2026-10-02 版式统一（用户反馈"AI 页太乱"）
 * 七行控件收入**一张面板卡**（`SettingsPanel` + `SettingsRow`），label 列与留白
 * 从此有唯一口径；按钮加载态统一 `<Loading>`；Key 增加「清除」出口（删除能力要留出口）。
 */
import { useState } from 'react'
import { Zap } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { encryptor, isWebCryptoAvailable } from '../../sync/encryption/encryption'
import { listAIModels, resolveAIProvider, testAIProvider } from '../../services/ai/ai-service'
import { Button, Input, Section, Select, useToast } from '../../components/ui'
import { Loading } from '../../components/ui/Loading'
import { SettingsPanel, SettingsRow } from './SettingsRow'
import { TianjiPersonaGroup } from './TianjiPersonaGroup'
import { TianjiMemoryGroup } from './TianjiMemoryGroup'
import { cn } from '../../utils/cn'

/**
 * 预设服务。`cors` 是**实测结论**（不是猜测）：
 *  · ok      —— OPTIONS 预检返回 `access-control-allow-origin`，浏览器可直连
 *  · blocked —— 不发任何 `Access-Control-*` 头，浏览器里必然连不上
 *  · unknown —— 网络层未能测通，不做结论
 *
 * ⚠️ 2026-10-01 复测修正：**Agnes 是可直连的**（预检 204 + `ACAO: *`，
 * POST 实请求同样带 `ACAO: *`；此前把它标成 blocked 是误判 —— 那次探测多半
 * 撞上了它的 Cloudflare 风控，裸请求会被挂住）。NVIDIA 复测仍无 ACAO：
 * 预检 405/200 都不带 `Access-Control-Allow-Origin`，实请求 403 也不带 —— 浏览器确实连不上。
 */
const AI_PRESETS: { name: string; baseUrl: string; model: string; cors: 'ok' | 'blocked' | 'unknown' }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', cors: 'ok' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', cors: 'ok' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', cors: 'unknown' },
  { name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'agnes-2.5-flash', cors: 'ok' },
  { name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'deepseek-ai/deepseek-v4.1-flash', cors: 'blocked' },
]

/**
 * AI 组 —— **按"用户要做的事"分条，不按内部模块分**（Step 5-3C 起，2026-10-01 定稿三段）
 *
 * ⚠️ **不做成二级页签**：页签只是把"条目多"换个地方堆，用户仍要理解同样多的概念。
 */

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
  /** 只有真的选了「浏览器连不上」的服务才提示，未选 / 选了能用的都不打扰。
   *  ⚠️ 类型必须是**字符串或 null**，不能是 boolean：下面用 `??` 兜底，
   *  boolean 会原样透过 `??`（false / true 都被 React 渲染成空）——
   *  曾经的写法让状态行只剩一个孤点、文案永远不显示（2026-10-01 修）。 */
  const blockedNotice =
    settings.aiProvider === 'remote' && activePreset?.cors === 'blocked'
      ? '该服务未开放跨域，浏览器无法直连 —— 换个预设，或用「抓取与代理」里的自建转发'
      : null
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
   * 清除 API Key（2026-10-02）：Key 是加密存本机的凭据，"换一个"之外也要能"拿掉"——
   * 清除后 Provider 立刻回落到本地规则，不再带着一个可能已废弃的 Key 发请求。
   */
  const clearKey = () => {
    settings.set({ aiKey: undefined, aiKeyEnc: false })
    setAiKeyDraft('')
    void resolveAIProvider()
    toast('已清除 API Key —— 天机回到本地规则', 'success')
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
      <Section title="模型与连接" hint="OpenAI 兼容">
        <div className="max-w-xl">
          <SettingsPanel>
            <SettingsRow label="Provider">
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
            </SettingsRow>

            <SettingsRow label="服务">
              <div className="flex flex-wrap gap-1">
                {AI_PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    size="sm"
                    variant={settings.aiBaseUrl === p.baseUrl ? 'primary' : 'tertiary'}
                    // 不可直连的预设**直接置灰**（2026-10-01 收口）：此前能选中、选中后才红字报错，
                    // 属于"先让你踩坑再解释"；现在按钮自己说明原因（title）
                    disabled={p.cors === 'blocked'}
                    title={
                      p.cors === 'blocked'
                        ? '该服务不返回跨域头，浏览器无法直连；自建转发目前不代传凭据，暂不可用于 AI'
                        : undefined
                    }
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
            </SettingsRow>

            {/* Base URL 并入本段（2026-10-01 用户拍板）：端点地址与「服务」预设是同一件事，
                不再单独占一个「高级」入口 —— 换服务后想微调端点，就地就能改 */}
            <SettingsRow label="Base URL">
              <Input
                value={settings.aiBaseUrl}
                onChange={(e) => settings.set({ aiBaseUrl: e.target.value })}
                className="min-w-0 flex-1 basis-full font-mono !text-xs sm:basis-0"
                placeholder="https://api.deepseek.com/v1"
                aria-label="Base URL"
              />
            </SettingsRow>

            <SettingsRow label="API Key">
              <Input
                type="password"
                placeholder={settings.aiKeyEnc ? '已加密保存 · 输入以更换' : 'sk-…'}
                value={aiKeyDraft}
                onChange={(e) => setAiKeyDraft(e.target.value)}
                className="min-w-0 flex-1 basis-full sm:basis-0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveKey()
                }}
              />
              <Button
                variant="secondary"
                onClick={() => void saveKey()}
                disabled={!aiKeyDraft.trim() || keySaving || !cryptoOk}
              >
                <Loading size={13} spinning={keySaving} />
                {keySaving ? '保存中…' : '加密保存'}
              </Button>
              {settings.aiKey && (
                <button
                  type="button"
                  onClick={clearKey}
                  aria-label="清除 API Key"
                  className="link-underline shrink-0 rounded-control px-1 py-0.5 text-xs text-ink-faint hover:text-cinnabar"
                >
                  清除
                </button>
              )}
            </SettingsRow>
            {!cryptoOk && (
              <p className="px-2.5 pb-2 text-xs leading-relaxed text-cinnabar">
                当前环境不支持加密（需要 https 或 localhost），Key 无法安全保存。
                请改用 https 访问，或把它装成应用后再配置。
              </p>
            )}

            <SettingsRow label="模型">
              <Input
                value={settings.aiModel}
                onChange={(e) => settings.set({ aiModel: e.target.value })}
                className="min-w-0 flex-1 basis-full font-mono !text-xs sm:basis-0"
                placeholder="如 deepseek-chat"
              />
              <Button size="sm" variant="tertiary" onClick={() => void fetchModels()} disabled={modelsLoading}>
                <Loading size={13} spinning={modelsLoading} />
                {modelsLoading ? '拉取中…' : '拉取模型列表'}
              </Button>
            </SettingsRow>
            {/* 拉到的列表挂在「模型」行下方（比并排多一个下拉更省横向空间）；
                只在属于当前 baseUrl 时显示 —— 换端点后旧列表必须失效 */}
            {availableModels.length > 0 && (
              <SettingsRow label="">
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
              </SettingsRow>
            )}

            <SettingsRow label="">
              <Button variant="tertiary" onClick={() => void runTest()} disabled={testing}>
                <Zap size={13} /> {testing ? '测试中…' : '测试连接'}
              </Button>
            </SettingsRow>

            {/* 状态行（2026-10-01 收口）：原先散在 Provider 行与「服务」行的两处提示合成一行。
                2026-10-02 并入面板底部 —— 它是这一整段的结论，不再悬空在两行之间 */}
            <div className="flex flex-wrap items-center gap-x-2 border-t border-line px-2.5 py-2 text-xs">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  blockedNotice ? 'bg-cinnabar' : settings.aiKey ? 'bg-teal' : 'bg-line-strong',
                )}
              />
              <span className={cn('leading-relaxed', blockedNotice ? 'text-cinnabar' : 'text-ink-faint')}>
                {blockedNotice ?? (settings.aiKey ? 'Key 已保存 · 点「测试连接」确认可用性' : '未配 Key · 天机走本地规则')}
              </span>
            </div>
          </SettingsPanel>
        </div>
      </Section>

      {/* 人设与记忆各自成段（2026-10-01）：AI 页 = 模型与连接 / AI 人设 / AI 记忆 三段 */}
      <TianjiPersonaGroup />
      <TianjiMemoryGroup />
    </>
  )
}