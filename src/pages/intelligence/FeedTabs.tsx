/**
 * 情 · 聚合页签（行尾 + 号就地管理分类）
 * 横向滚动用 ScrollRow：自带右缘渐隐遮罩，裸 overflow-x-auto 用户不知道右边还有页签；
 * activeSelector/activeKey 让选中项自动居中，切换后不必手动横滑找当前位置。
 */
import { Plus } from 'lucide-react'
import { Chip, ScrollRow, Tooltip } from '../../components/ui'

export function FeedTabs({
  tabs,
  active,
  onChange,
  onManage,
}: {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
  onManage: () => void
}) {
  return (
    <ScrollRow className="-mx-1 mb-3 px-1 pb-1" activeSelector={'[data-active="true"]'} activeKey={active}>
      {tabs.map((t) => (
        <Chip key={t} active={active === t} onClick={() => onChange(t)}>
          {t}
        </Chip>
      ))}
      <Tooltip label="管理分类">
        {/* h-8 w-8 与 Chip 同高（Chip 约 32px），混排时不出现"一颗小一圈"的突兀感 */}
        <button
          onClick={onManage}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile bg-raised text-ink-muted transition-colors hover:bg-nested hover:text-ink"
          aria-label="管理分类"
        >
          <Plus size={14} />
        </button>
      </Tooltip>
    </ScrollRow>
  )
}
