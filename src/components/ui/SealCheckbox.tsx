/**
 * SealCheckbox —— 圆形印章勾选（全站「列表行完成」的唯一勾选形制）
 *
 * 为什么单独抽出来：待办行与作业行原本各写一套一模一样的按钮（都是
 * `h-5 w-5 rounded-full` + 未完成空圆 / 完成 18px 印章 + role=checkbox），
 * 两处注释都写着「与待办同一形制」，但实现是两份拷贝 —— 改一处漏一处，
 * 迟早又对不上形。现在两处都从这里取，形制只此一份。
 *
 * 与 ui/Checkbox 的分工（**不要合并成一个组件**）：
 *   · SealCheckbox（本组件）= 圆形 + 篆书印章，用于「列表行完成」，是高频主形态；
 *   · Checkbox            = 方角 + `seal-check` 实底朱砂印，用于表单里的布尔项。
 *   两者尺寸同为 22px，但形不同、语义场景不同 —— 圆是「这一行的事做完了」，
 *   方是「这个选项勾上」。用户已确认的形制差异，不因"统一"而抹平。
 *
 * 视觉契约（改动前请对照 TaskItem / StudyPage 的既有截图）：
 *   未完成 = 22px 空圆（border-line-strong + bg-raised，悬停转朱砂边）
 *   已完成 = 22px 圆内嵌 22px 印章（tone 固定 bronze —— 行内小勾要安静，
 *            全行「落印」的重音留给调用方自己盖，见 TaskItem 的 seal-stamp 覆盖层）
 * 形制收口不影响落印覆盖层：本组件只管勾选框本身。
 */
import { cn } from '../../utils/cn'
import { Seal } from './Seal'

export interface SealCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** 印文用字：待办「异」、作业「毕」。用字需在篆书子集里（校验脚本 work/scripts/check_seal_glyphs.py） */
  char: string
  /** 悬停/读屏用的动作说明，默认按勾选态给「标记完成 / 标记未完成」 */
  title?: string
  className?: string
}

export function SealCheckbox({ checked, onChange, char, title, className }: SealCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        // 22px 框配 22px 印章：原先 20px 框内嵌 18px 印章，完成态的**视觉外径只有 ~16.3px**
        // （印章环 r=29/64 ≈ 0.906×），比未完成态的 20px 空圆小一圈 —— 看着"缩了"，
        // 这正是「印章太小」的根因。现在两者外径一致，且整体大一号、篆字各自认得清。
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-fast',
        className,
      )}
      title={title ?? (checked ? '标记未完成' : '标记完成')}
    >
      {checked ? (
        <Seal size={22} char={char} tone="bronze" />
      ) : (
        /* 未完成态也用圆形：与完成后的圆形印章同一形制。
           此前是圆角方框，和印章"对不上形" */
        <span className="h-full w-full rounded-full border border-line-strong bg-raised transition-colors hover:border-cinnabar/50" />
      )}
    </button>
  )
}
