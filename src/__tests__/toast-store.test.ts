/**
 * Toast 上限与挤出规则 —— 手机是第一形态：底部导航上方最多叠两条。
 *
 * 这里钉三件事：
 *  · 上限 2：第三条进来就挤掉**最旧的非危险**一条
 *  · 危险提示在场时，先被挤掉的是普通回执（报错不能被"操作回执"顶走）
 *  · 极端批量报错也有界（全是危险时砍最旧）
 *
 * 状态层不依赖 DOM，也不需要渲染 —— 直接操作 `toast-store`；
 * `notification` / `sound` 是投递与音效的副作用通道，这里 mock 掉，
 * 只验证"屏上留几条、留哪几条"。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/notification', () => ({ recordNotice: vi.fn() }))
vi.mock('../services/sound', () => ({ playSound: vi.fn() }))

import { useToastStore } from '../components/ui/toast-store'

const messages = () => useToastStore.getState().toasts.map((t) => t.message)

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('Toast 上限', () => {
  it('同时最多两条：第三条把最旧的一条挤掉', () => {
    const { push } = useToastStore.getState()
    push('提示一', 'info')
    push('提示二', 'info')
    push('提示三', 'info')
    expect(messages()).toEqual(['提示二', '提示三'])
  })

  it('挤掉的是最旧的非危险，不是刚进来的那条', () => {
    const { push } = useToastStore.getState()
    push('同步失败', 'danger')
    push('已保存一', 'info')
    push('已保存二', 'info')
    expect(messages()).toEqual(['同步失败', '已保存二'])
  })

  it('全是危险时同样有界（砍最旧）', () => {
    const { push } = useToastStore.getState()
    push('错一', 'danger')
    push('错二', 'danger')
    push('错三', 'danger')
    expect(messages()).toEqual(['错二', '错三'])
  })

  it('同文案同色调只续时间，不叠一条', () => {
    const { push } = useToastStore.getState()
    push('待办已保存', 'success')
    push('待办已保存', 'success')
    expect(messages()).toEqual(['待办已保存'])
  })
})
