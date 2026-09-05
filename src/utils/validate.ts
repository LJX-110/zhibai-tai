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
