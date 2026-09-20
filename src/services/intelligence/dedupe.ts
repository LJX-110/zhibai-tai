/**
 * 情报去重键 —— 单一事实源
 *
 * 去重口径必须三处一致（情报页 / 命令面板 / 定时抓取），否则同一批条目
 * 会因入口不同而有的被过滤、有的被写进库。此前它放在
 * `components/source/SourceManager.tsx` 里，service 层为了用它反向 import 组件，
 * 把整个 UI 依赖图（React、lucide、stores）拖进服务模块。
 * 去重键是纯数据规则，不该住在这里之上，故下沉到服务层。
 */

/** 去重键：externalId 优先（稳定，不受标题编辑影响）→ url → 标题 + 日期 */
export function dedupeKey(it: {
  source?: string
  sourceName?: string
  externalId?: string
  url?: string
  title: string
  publishedAt?: string
}): string {
  const s = it.source ?? it.sourceName ?? ''
  if (it.externalId) return `${s}|${it.externalId}`
  if (it.url) return `${s}|${it.url}`
  return `${s}|${it.title}|${(it.publishedAt ?? '').slice(0, 10)}`
}
