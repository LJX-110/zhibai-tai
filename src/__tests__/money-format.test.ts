/**
 * 金额格式化 —— 规格测试（Step 4-2 · A1）
 *
 * 这些用例钉住的是**全站统一口径**：任何时候重新实现一份金额格式化，
 * 或某处改回手写 `toFixed`，这组断言都会立刻暴露。用例按规格书 §十 列出的
 * 四个必备值（0 / 1 / 1.2 / -1.2）加边界（千分位、负数、脏值）。
 */
import { describe, expect, it } from 'vitest'
import { money } from '../utils/money'

describe('money —— 全站唯一的金额格式化', () => {
  it('0 → 0.00', () => {
    expect(money(0)).toBe('0.00')
  })

  it('整数补满两位 → 1.00', () => {
    expect(money(1)).toBe('1.00')
  })

  it('一位小数补零 → 1.20', () => {
    expect(money(1.2)).toBe('1.20')
  })

  it('负数保留符号 → -1.20', () => {
    expect(money(-1.2)).toBe('-1.20')
  })

  it('正数不加 + 号（符号只表示负）', () => {
    expect(money(128.5)).toBe('128.50')
  })

  it('千分位分隔 → 1,234.50', () => {
    expect(money(1234.5)).toBe('1,234.50')
  })

  it('负数同样千分位 → -1,234.50', () => {
    expect(money(-1234.5)).toBe('-1,234.50')
  })

  it('超过两位的小数进位收敛（浮点残差不外泄）', () => {
    // 0.1 + 0.2 = 0.30000000000000004 —— 展示层必须收成 0.30
    expect(money(0.1 + 0.2)).toBe('0.30')
    // 1.006 二进制上确实是 1.006…（1.005 存不进二进制，照实按 1.00 处理，不假装能纠正）
    expect(money(1.006)).toBe('1.01')
  })

  it('null / undefined / NaN / ±Infinity 一律按 0.00（脏数据不整块空白）', () => {
    expect(money(null)).toBe('0.00')
    expect(money(undefined)).toBe('0.00')
    expect(money(Number.NaN)).toBe('0.00')
    expect(money(Number.POSITIVE_INFINITY)).toBe('0.00')
    expect(money(Number.NEGATIVE_INFINITY)).toBe('0.00')
  })
})