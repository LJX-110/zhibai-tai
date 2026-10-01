/**
 * 学 · 学分选课的**统一课程行**（2026-09-28 重做）
 *
 * ## 为什么并成一行
 * 旧版把条目按方向 / 状态摊成六个区块（限选 / 公选 / 体育 / 候选 / 不可选 / 事项），
 * 同一门课在两处出现、状态靠方块记号与文字标签表达 —— "很多小板块"就是这么攒出来的。
 * 现在：**一行一课**，方向、状态、学分、教师、备注全在这一行里。
 *
 * ## 一行的信息（规格指定的最小集）
 * 方向印 · 状态印 · 课程名 · 学分 · 教师（有才显示）· 备注（有才显示）· 删除
 *
 * ## 两枚印章都是体系里的 `Seal` 符箓（2026-09-29）
 *  · **方向**（限选/公选/体育）原先是一段纯文字，和后面的印章并列时"一个像标签、一个像印章"；
 *  · **状态**（选/候/否）原先是一枚手搓的 `<span class="rounded-full border">`，字用楷体。
 * 现在两枚都交给 `components/ui/Seal`：圆形 · 细线环 · 无实底 · 印文取自小篆 ——
 * 与财（收/支）、待办落印、今日签是同一套语言。
 *
 * **层级靠颜色而不是尺寸**：方向一律中性墨色（分类信息），颜色语义留给状态三态；
 * 两枚都只有 20px，视觉上明显低于课程标题。全称由 `aria-label`（Seal 的 `title`）
 * 与筛选行（全部 | 已选 | 候选 | 不可选）承担 —— 圆里塞不下两个汉字还不抢焦点。
 */
import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { CoursePlan } from '../../types/entities'
import { Seal } from '../../components/ui/Seal'
import { RowActions } from '../../components/ui/RowActions'
import { KIND_LABEL, KIND_SEAL, STATUS_LABEL, STATUS_SEAL, trim } from './plan-shared'

export function PlanRow({
  item,
  onDetail,
  onEdit,
  onRemove,
}: {
  item: CoursePlan
  onDetail: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const seal = STATUS_SEAL[item.status]
  const kind = KIND_SEAL[item.kind]
  return (
    <div className="row group">
      {/* 方向印（限选 / 公选 / 体育）：中性墨色 —— 一眼把课与「选课目标」三行对上 */}
      <Seal size={20} char={kind.char} tone={kind.tone} title={KIND_LABEL[item.kind]} />
      {/* 状态印（选 / 候 / 否）：颜色即语义 */}
      <Seal size={20} char={seal.char} tone={seal.tone} title={STATUS_LABEL[item.status]} />
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <span className="text-sm text-ink">{item.title}</span>
        {item.teacher && <span className="ml-2 text-xs text-ink-faint">{item.teacher}</span>}
        {/* 公选分类与备注都是"有才显示"的补充信息：与教师同一档小字 */}
        {item.group && item.kind === 'public' && (
          <span className="ml-2 text-xs text-ink-faint">· {item.group}</span>
        )}
        {item.note && <span className="ml-2 text-xs text-ink-faint">· {item.note}</span>}
      </button>
      <span className="tabular shrink-0 text-xs text-ink-muted">
        {item.credit != null ? `${trim(item.credit)} 学分` : null}
      </span>
      {/* 操作区走共用的 `RowActions`（2026-09-29 · 批 B；5-3E 修正）
          改前这里**只有**一个 hover-reveal 的删除按钮 —— 于是"能编辑"这件事
          完全没有可见线索（能力其实一直在：点课程名就进编辑），用户会以为不能改。
          现在**与待办行同形制**（5-3E 用户拍板）：详情 / 编辑 / 删除 三个图标直显，
          窄屏也不收进「更多」—— `alwaysInline` 就是这条约定（见 RowActions 注释）。 */}
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
    </div>
  )
}