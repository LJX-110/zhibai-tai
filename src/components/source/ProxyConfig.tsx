/**
 * ProxyConfig —— 自建 CORS 代理地址（单独导出，供「系统 · 智能」首屏直接挂载）
 *
 * 代理是情报抓取「能不能用」的唯一开关，情报页抓取失败时正是把用户指到这里。
 * 所以它不能再当情报源区块里的一行 —— 那是折叠层，指路会把用户带到空地方。
 * 说明文案在窄屏也保留：首屏上它是「为什么值得填」的唯一解释，不能只给桌面看。
 */
import { useSettingsStore } from '../../stores/useSettingsStore'
import { Input } from '../ui'

export function ProxyConfig() {
  const corsProxyUrl = useSettingsStore((s) => s.corsProxyUrl)
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-line bg-paper/50 px-3 py-2">
      <span className="text-sm text-ink">自建代理</span>
      <Input
        placeholder="https://你的站点.netlify.app（或 Cloudflare Pages）"
        value={corsProxyUrl ?? ''}
        onChange={(e) => useSettingsStore.getState().set({ corsProxyUrl: e.target.value.trim() || undefined })}
        className="min-w-[220px] flex-1 !py-1 font-mono !text-xs"
        aria-label="自建 CORS 代理地址"
      />
      <span className="text-xs leading-relaxed text-ink-faint">
        中文源与 B 站都需要它 · 部署见仓库 proxy/（首选 Netlify）
      </span>
    </div>
  )
}
