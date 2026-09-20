/**
 * 输入校验工具 —— 表单保存前的统一数值防线
 *
 * 此前各表单普遍用 `if (!Number(x)) return` 静默拦截：
 *  · 负数照样入库（!(-5) 为 false）；
 *  · 拒绝时无任何提示，用户以为已保存；
 *  · 浮点尾差直接落库（0.1 + 0.2 类问题进入金额字段）。
 */
/** 解析正金额：空/非法/非正返回 null；结果四舍五入到分 */
export function parsePositiveAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/**
 * 金额解析（**允许 0**）。
 *
 * 与 parsePositiveAmount 的差别只在 0：这里 0 是合法值，空字符串也视为 0。
 * 用于「价格可留空」的场景（购买清单未定价时记 0）—— 那些地方若沿用
 * parsePositiveAmount，编辑一个未定价条目时输入框里的 "0" 会被判为非法，
 * 保存按钮就永久禁用了（用户反馈的「保存按钮不可点击、改不了名称」根因）。
 */
export function parseAmountAllowZero(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}
