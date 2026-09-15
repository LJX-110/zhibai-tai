/**
 * 移动端底栏固定常量验证
 *
 * 底栏已改为固定 4 格 + 更多（不再可配置）：
 * 观 · 行 · 财 · 情 常驻底部，其余板块统一收进「更多」抽屉。
 * 本测试守住这份清单不被误改（改了会让手机主入口消失）。
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_MOBILE_TABS } from '../app/navigation'

describe('DEFAULT_MOBILE_TABS（底栏固定四格）', () => {
  it('固定为 观 · 行 · 财 · 情', () => {
    expect(DEFAULT_MOBILE_TABS).toEqual(['overview', 'action', 'finance', 'intelligence'])
  })

  it('恰好 4 格，与移动端槽位一致', () => {
    expect(DEFAULT_MOBILE_TABS).toHaveLength(4)
  })
})