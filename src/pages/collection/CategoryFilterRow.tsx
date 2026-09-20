/**
 * 藏 · 筛选行（全部 / 自定义分类 / 行尾「管理分类＋」）
 * 筛选只有一维：分类（用途，可增删同步）；介质（type，固定枚举）不进筛选行
 * —— 此前它与分类默认名高度重合（如分类「小说」与类型「小说」），并排会造成同名重复。
 */
import { Plus } from 'lucide-react'
import { Chip, ScrollRow, Tooltip } from '../../components/ui'

export function CategoryFilterRow({
  value,
  onChange,
  categories,
  onManage,
}: {
  value: string
  onChange: (v: string) => void
  categories: string[]
  onManage: () => void
}) {
  return (
    <div className="mb-3">
      <ScrollRow className="pb-1" activeSelector={'[data-active="true"]'} activeKey={value}>
        {/* 不带计数：与「项目中心」的状态筛选保持完全一致
            （此前只有藏品这排带数字徽标，两处并排看密度不同，用户反馈过） */}
        <Chip active={value === 'all'} onClick={() => onChange('all')}>
          全部
        </Chip>
        {categories.map((c) => (
          <Chip key={`cat-${c}`} active={value === c} onClick={() => onChange(c)}>
            {c}
          </Chip>
        ))}
        <Tooltip label="管理分类">
          {/* h-8 与 Chip 同高，混排时不出现"一颗小一圈"的突兀感 */}
          <button
            onClick={onManage}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile bg-raised text-ink-muted transition-colors hover:bg-nested hover:text-ink"
            aria-label="管理分类"
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      </ScrollRow>
    </div>
  )
}
