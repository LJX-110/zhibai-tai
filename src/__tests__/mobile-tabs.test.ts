/**
 * 移动端底栏配置规范化验证
 *
 * 底栏是持久化的设置项，升级/手改后可能残留失效 id 或重复项；
 * 一旦塌成空格，用户就彻底失去入口 —— 这里守住兜底行为。
 */
import { describe, expect, it } from 'vitest'
import { MOBILE_TAB_SLOTS, normalizeMobileTabs } from '../app/navigation'

describe('normalizeMobileTabs', () => {
  it('保留合法顺序', () => {
    expect(normalizeMobileTabs(['intelligence', 'overview', 'action', 'study'])).toEqual([
      'intelligence',
      'overview',
      'action',
      'study',
    ])
  })

  it('剔除失效 id 并按默认清单补齐到 4 格', () => {
    const out = normalizeMobileTabs(['overview', 'nope' as never])
    expect(out).toHaveLength(MOBILE_TAB_SLOTS)
    // 首位保留用户选择，其余按默认清单（观 行 学 情）补齐
    expect(out[0]).toBe('overview')
    expect(out).toEqual(['overview', 'action', 'study', 'intelligence'])
  })

  it('去重并截断到 4 格', () => {
    const out = normalizeMobileTabs(['overview', 'overview', 'action', 'study', 'finance', 'occult'])
    expect(out).toEqual(['overview', 'action', 'study', 'finance'])
  })

  it('空配置回落为默认四格', () => {
    expect(normalizeMobileTabs(undefined)).toEqual([
      'overview',
      'action',
      'study',
      'intelligence',
    ])
  })
})
