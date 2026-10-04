/**
 * 设置页 · 统一版式（AI / 数据 / 同步 / 代理 专用；2026-10-02 定稿）
 *
 * ## 为什么要有它
 * 「系统」页此前每个分组各写各的行式 —— 有的用 `.row`、有的是手写 flex + `w-20`，
 * label 列宽、换行规则、留白三处口径不一。这就是「AI / 数据两页乱」在代码里的根因：
 * 不是某个控件丑，而是**同一页里没有同一套行**。这里把它收成两个版式件：
 *
 *   SettingsPanel  分组内容的面板皮（圆角 / 描边 / 面板底色；行间分隔由 `.row` 承担）
 *   SettingsRow    一行：label 列（固定 5rem）+ 控件区（控件仍直接作为 flex 子项，
 *                  窄屏时自带 `basis-full` 的输入框照旧折行占满整行 —— 既有约定不破坏）
 *
 * ## 三条纪律
 *  · 只是**版式**，不是第二套控件 —— 控件一律仍用 ui/ 的 Button / Input / Switch / Select / Chip；
 *  · 说明性小字由调用方自带（项目纪律：新增解释性小字优先 `hidden md:inline`）；
 *  · 行间分隔与悬停底沿用既有 `.row` 类（全站列表行同一语言），不另造样式。
 *
 * ## 本轮覆盖范围
 * AI / 数据 / 同步 / 代理 四处。外观 / 桌宠 / 通知本轮不动（用户未提，避免扩大改动面）。
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

/** 分组面板：把同一 Section 的若干行收进一张卡，建立「分组 → 面板 → 行」层级 */
export function SettingsPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-paper border border-line bg-panel', className)}>
      {children}
    </div>
  )
}

/**
 * 设置行：label 列 + 控件。
 * `label` 传空串 = 续行（控件与上一行的控件列对齐，如「测试连接」这类动作行）。
 */
export function SettingsRow({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('row flex-wrap', className)}>
      <span className="w-20 shrink-0 text-sm text-ink-muted">{label}</span>
      {children}
    </div>
  )
}