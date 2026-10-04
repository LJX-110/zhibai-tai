/**
 * 学 · 学分选课的**统一课程行**（2026-09-28 重做；2026-10-02 增标签与排序模式）
 *
 * ## 一行的信息（最小集 + 本轮新增）
 * 方向印 · 状态印 · 课程名 · 二级分类 · 标签（可点 → 搜索）· 学分 · 教师 · 备注 · 操作
 *
 * ## 两枚印章都是体系里的 `Seal` 符箓（2026-09-29）
 * **层级靠颜色而不是尺寸**：方向一律中性墨色（分类信息），颜色语义留给状态三态。
 *
 * ## 2026-10-02
 *  · **二级分类**对全部方向展示（原仅公选）——字段本身不变，仍是自由文本；
 *  · **标签**是可点的小块（点一下填入搜索框，跨分类找课）；放在标题列的下方，
 *    不占第一行的横向空间（窄屏上标题不应被标签挤没）；
 *  · **排序模式**：右侧换成 ↑↓（详情/编辑/删除暂时收起 —— 一行五个按钮在手机上是灾难），
 *    边界方向自动禁用（判据由 `movePlanItem` 的边界语义给出）。
 */
import { ArrowDown, ArrowUp, Eye, Pencil, Trash2 } from 'lucide-react'
import type { CoursePlan } from '../../types/entities'
import { Seal } from '../../components/ui/Seal'
import { RowActions } from '../../components/ui/RowActions'
import { KIND_LABEL, KIND_SEAL, STATUS_LABEL, STATUS_SEAL, trim } from './plan-shared'

export function PlanRow({
  item,
  onDetail,
  onEdit,
  onRemove,
  sortMode = false,
  canUp = false,
  canDown = false,
  onMove,
  onTag,
}: {
  item: CoursePlan
  onDetail: () => void
  onEdit: () => void
  onRemove: () => void
  /** 排序模式：右侧换成 ↑↓，其余操作暂时收起 */
  sortMode?: boolean
  canUp?: boolean
  canDown?: boolean
  onMove?: (dir: -1 | 1) => void
  /** 点标签 → 填入搜索框（由页面负责） */
  onTag?: (tag: string) => void
}) {
  const seal = STATUS_SEAL[item.status]
  const kind = KIND_SEAL[item.kind]
  return (
    <div className="row group">
      {/* 方向印（限选 / 公选 / 体育）：中性墨色 —— 一眼把课与「选课目标」三行对上 */}
      <Seal size={20} char={kind.char} tone={kind.tone} title={KIND_LABEL[item.kind]} />
      {/* 状态印（选 / 候 / 否）：颜色即语义 */}
      <Seal size={20} char={seal.char} tone={seal.tone} title={STATUS_LABEL[item.status]} />
      <div className="min-w-0 flex-1">
        <button className="block w-full text-left" onClick={onEdit}>
          <span className="text-sm text-ink">{item.title}</span>
          {item.teacher && <span className="ml-2 text-xs text-ink-faint">{item.teacher}</span>}
          {/* 二级分类与备注都是"有才显示"的补充信息：与教师同一档小字 */}
          {item.group && <span className="ml-2 text-xs text-ink-faint">· {item.group}</span>}
          {item.note && <span className="ml-2 text-xs text-ink-faint">· {item.note}</span>}
        </button>
        {item.tags && item.tags.length > 0 && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {item.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTag?.(t)}
                aria-label={`按标签「${t}」筛选`}
                className="rounded-control bg-nested px-1.5 py-0.5 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                {t}
              </button>
            ))}
          </span>
        )}
      </div>
      <span className="tabular shrink-0 text-xs text-ink-muted">
        {item.credit != null ? `${trim(item.credit)} 学分` : null}
      </span>
      {sortMode ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={!canUp}
            onClick={() => onMove?.(-1)}
            aria-label="上移"
            className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            disabled={!canDown}
            onClick={() => onMove?.(1)}
            aria-label="下移"
            className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowDown size={14} />
          </button>
        </span>
      ) : (
        /* 操作区走共用的 `RowActions`（2026-09-29 · 批 B；5-3E 修正）
            改前这里**只有**一个 hover-reveal 的删除按钮 —— 于是"能编辑"这件事
            完全没有可见线索（能力其实一直在：点课程名就进编辑），用户会以为不能改。
            现在**与待办行同形制**：详情 / 编辑 / 删除 三个图标直显，窄屏也不收进「更多」 */
        <div className="hover-reveal flex shrink-0 items-center gap-0.5">
          <RowActions
            alwaysInline
            moreTitle={item.title}
            actions={[
              // 详情排第一：与待办、财·流水同序（看 → 改 → 删），三处语言一致
              { key: 'detail', label: '详情', icon: Eye, onClick: onDetail },
              { key: 'edit', label: '编辑', icon: Pencil, onClick: onEdit },
              { key: 'remove', label: '删除', icon: Trash2, onClick: onRemove, danger: true },
            ]}
          />
        </div>
      )}
    </div>
  )
}