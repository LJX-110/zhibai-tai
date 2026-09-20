/**
 * 情 · 关注管理
 * 关注此前只能加不能删、也看不到加了什么，是个单向入口 —— 这里补齐删除与列表。
 */
import { Star, X } from 'lucide-react'

/** 关注项的最小结构（只需 id 与关键词，避免为一个面板绑死整个实体类型） */
export interface FollowItem {
  id: string
  keyword: string
}

export function FollowPanel({
  follows,
  onRemove,
}: {
  follows: FollowItem[]
  onRemove: (item: FollowItem) => void
}) {
  return (
    <div className="mb-3 rounded-tile border border-line bg-raised px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm text-ink">
        <Star size={13} className="shrink-0 text-bronze" />
        已关注 {follows.length} 个关键词
        <span className="ml-auto text-xs text-ink-faint">点 × 取消</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {follows.map((f) => (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 rounded-control border border-line bg-paper px-2 py-1 text-xs text-ink-soft"
          >
            {f.keyword}
            <button
              onClick={() => onRemove(f)}
              className="text-ink-faint transition-colors hover:text-cinnabar"
              aria-label={`取消关注 ${f.keyword}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {follows.length === 0 && (
          <span className="text-xs text-ink-faint">
            还没有关注。在情报详情里点「关注」即可追踪某个来源或主题
          </span>
        )}
      </div>
    </div>
  )
}
