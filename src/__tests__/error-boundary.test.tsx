// @vitest-environment jsdom
/**
 * ErrorBoundary —— 白屏兜底与**切换路由后的自愈**
 *
 * 这个组件此前**零测试**，而它恰好是"页面白屏 / 点了没反应"类反馈的最后一道兜底：
 * 它一旦失灵，用户看到的就是一片空白，连报错文案都没有。
 *
 * 2026-09-23 顺手把自愈从 `componentDidUpdate` + `setState`（lint 判为隐患：更新后再推 state）
 * 改为 `getDerivedStateFromProps`（同一次渲染内算出下一个 state）。语义等价，但少了
 * "更新后再 setState"这一步 —— 所以**必须把等价性钉住**，尤其是那条最容易写错的方向：
 * 捕获到错误后的第一次重渲染**不能**被误判成"key 变了"而立刻把错误清掉，
 * 否则表现就是"出错了却什么都不显示"（比不做自愈更糟）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../app/ErrorBoundary'

/** 会抛错的子组件；`boom=false` 时正常渲染 */
function Bomb({ boom }: { boom: boolean }) {
  if (boom) throw new Error('炸了')
  return <p>一切正常</p>
}

beforeEach(() => {
  // React 会把边界捕获的异常照样打到 console.error，这里静音避免刷屏
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary：兜底与自愈', () => {
  it('子组件抛错 → 显示可读错误卡片，而不是白屏', () => {
    render(
      <ErrorBoundary title="这里出了岔子">
        <Bomb boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('这里出了岔子')).toBeTruthy()
    expect(screen.getByText('炸了')).toBeTruthy()
    // 文案要告诉用户"数据没丢" —— 否则第一反应是"我的东西没了"
    expect(screen.getByText(/数据仍保存在本地/)).toBeTruthy()
  })

  it('**捕获错误后的第一次重渲染不得把错误清掉**（写错方向就是"出错却什么都不显示"）', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Bomb boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()

    // 同 key 再渲染一次（父组件无关更新）→ 错误必须还在
    rerender(
      <ErrorBoundary resetKey="a">
        <Bomb boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('**resetKey 变化 → 自动恢复**（切换板块后不该继续卡在错误页）', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Bomb boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()

    rerender(
      <ErrorBoundary resetKey="b">
        <Bomb boom={false} />
      </ErrorBoundary>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('一切正常')).toBeTruthy()
  })

  it('resetKey 变化但子树仍然抛错 → 依旧显示错误卡片（自愈不能把真错误藏起来）', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Bomb boom />
      </ErrorBoundary>,
    )
    rerender(
      <ErrorBoundary resetKey="b">
        <Bomb boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('点「重试」清掉错误态，让子树自己再试一次', () => {
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('重试'))
    // 子树仍会抛（boom 一直为 true）→ 错误态立刻回来，但"重试"这条路本身是通的
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('hideRetry 时只留「重新加载」（根边界用：整树都坏了，重试没意义）', () => {
    render(
      <ErrorBoundary hideRetry>
        <Bomb boom />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('重试')).toBeNull()
    expect(screen.getByText('重新加载')).toBeTruthy()
  })
})
