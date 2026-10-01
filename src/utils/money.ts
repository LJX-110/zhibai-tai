/**
 * 金额展示 —— **全站唯一的格式化实现**
 *
 * 规格（2026-09-28 定）：固定两位小数 + 千分位；负数带 `-`、正数**不带** `+`：
 *   `0` → `0.00` ／ `1` → `1.00` → `1.2` → `1.20` ／ `-1.2` → `-1.20` ／ `1234.5` → `1,234.50`
 *
 * 为什么单独成文件：此前它住在财页内部的 `summary.ts`，而「观 · 本周回顾」的
 * **本月结余**直接 `${income - expense}` 拼字符串 —— 同一语义两处显示格式不一致
 * （一处两位小数、一处跟着浮点数裸露）。数字形态各写一份必然漂移，所以实现只留这一份：
 * **任何页面都不许再手写 `toFixed` / 模板串拼金额**（AI 上下文文本也算 ——
 * 它同样会显示给用户看）。
 *
 * 非法值（null / undefined / NaN / ±Infinity）一律按 `0` 处理 ——
 * 展示层不该因为一条脏数据整块空白；金额本身的正确性由写入侧校验保证。
 */
export function money(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}