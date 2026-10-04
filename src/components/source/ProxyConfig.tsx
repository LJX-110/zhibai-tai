/**
 * ProxyConfig —— 自建 CORS 代理地址（单独导出，供「系统 · 数据」组直接挂载；
 * 2026-10-01 随「抓取与代理」从 AI 组移入）
 *
 * 代理是情报抓取「能不能用」的唯一开关，情报页抓取失败时正是把用户指到这里。
 * 所以它不能再当情报源区块里的一行 —— 那是折叠层，指路会把用户带到空地方。
 * 说明文案在窄屏也保留：首屏上它是「为什么值得填」的唯一解释，不能只给桌面看。
 *
 * ## Step 5-1 · B3：地址在**输入那一刻**就校验
 * 此前是每敲一个字就往 store 里写一次（`onChange` 直写），填错时表现为"抓取失败"，
 * 而失败会被归类成"跨域/网络" —— 用户于是去查网络，真问题在输入框里。
 * 现在改成**本地草稿 + 失焦/回车提交**：合法才写入并规整（去掉结尾 `/`），
 * 不合法就当场说明原因，**不写入**（保留上一个可用值）。
 *
 * ## Step 5-1 · E4：320px 不再挤压
 * 输入框在窄屏独占一行（`basis-full`），宽屏才与说明并排 —— 220px 的 `min-w`
 * 在 320 屏上会把说明文字挤成一列两个字。
 *
 * ## 2026-10-02：未配置时直接给「三段部署步骤」
 * 用户反馈"自建代理我不会" —— 步骤必须**在要填地址的地方**就能看到，
 * 而不是让人去翻仓库。完整版见 `proxy/README.md`（唯一权威指南）。
 */
import { useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { normalizeProxyUrl } from '../../services/intelligence/providers/proxy'
import { Input } from '../ui'

export function ProxyConfig() {
  const corsProxyUrl = useSettingsStore((s) => s.corsProxyUrl)
  const [draft, setDraft] = useState(corsProxyUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  /** 上一次"来自 store"的值：用于识别外部改动（同步/导入/清除）并跟一次 */
  const [fromStore, setFromStore] = useState(corsProxyUrl ?? '')

  // 渲染期守卫同步（不写 effect）：外部把值改了、而草稿没被动过时，跟着更新。
  // 草稿被用户改过（draft !== fromStore）就不覆盖，免得同步一到就吞掉正在输入的内容。
  const current = corsProxyUrl ?? ''
  if (current !== fromStore && draft === fromStore) {
    setFromStore(current)
    setDraft(current)
    setError(null)
  }

  const commit = () => {
    const raw = draft.trim()
    if (!raw) {
      setError(null)
      setFromStore('')
      useSettingsStore.getState().set({ corsProxyUrl: undefined })
      return
    }
    const normalized = normalizeProxyUrl(raw)
    if (!normalized) {
      setError('地址不合法：要是 http/https 开头的完整地址，且不要带 ?query —— 请求参数由应用自己拼')
      return
    }
    setError(null)
    setFromStore(normalized)
    setDraft(normalized)
    useSettingsStore.getState().set({ corsProxyUrl: normalized })
  }

  return (
    <div className="mb-3 rounded-tile border border-line bg-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink">自建代理</span>
        <Input
          placeholder="https://你的站点.netlify.app"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          className="min-w-0 flex-1 basis-full !py-1 font-mono !text-xs sm:basis-0"
          aria-label="自建 CORS 代理地址"
          aria-invalid={error !== null}
        />
        <span className="text-xs leading-relaxed text-ink-faint">
          中文源与 B 站都需要它 · 完整步骤见仓库 proxy/README.md
        </span>
      </div>
      {error && <p className="mt-1 text-xs leading-relaxed text-cinnabar">{error}</p>}
      {/* 未配置时给三段最短可行步骤（配好后整块消失，不再占地方） */}
      {!current && (
        <ol className="mt-2 space-y-1 border-t border-line pt-2 text-xs leading-relaxed text-ink-muted">
          <li>
            1. 用 GitHub 账号登录 netlify.com → <span className="text-ink-soft">Add new site → Import an existing project</span> →
            选知白台仓库（仓库里 <code className="rounded-control bg-nested px-1">netlify.toml</code> 已配好，构建命令留空、发布目录 public）。
          </li>
          <li>
            2. 部署后到 Site configuration → Environment variables 加 <code className="rounded-control bg-nested px-1">ALLOWED_HOSTS</code>
            （<b className="text-ink-soft">必填</b>，逗号分隔要抓的主机名；用 B 站源必须含 api.bilibili.com），然后 Trigger deploy 重新部署。
          </li>
          <li>
            3. 把站点地址 <code className="rounded-control bg-nested px-1">https://xxx.netlify.app/proxy</code> 填进上面的输入框。
          </li>
        </ol>
      )}
    </div>
  )
}