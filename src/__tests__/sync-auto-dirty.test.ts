/**
 * 同步 · 「有改动待同步」标记的持久化（2026-10-02）
 *
 * 此前 `dirty` 是 auto.ts 的模块级内存变量：离线改完数据、刷新页面后归零，
 * 网络恢复也不会补推 —— 用户感受为「改了没同步 / 同步老是失败」。
 * 现在标记持久化到 localStorage，本文件钉住两条行为：
 *  ① 写盘后可跨"重新加载"恢复；
 *  ② localStorage 不可用（隐私模式）时优雅退化，不抛错、不影响同步本身。
 *
 * ⚠️ 不能 `vi.stubGlobal('localStorage')`：vitest.setup.ts 用
 * `Object.defineProperty({ writable: false })` 注入内存版存储，属性不可重定义。
 * 因此这里直接操作该实例（必要时只对它做方法级 spy）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const DIRTY_KEY = 'zbt:sync-dirty:v1'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  try {
    localStorage.removeItem(DIRTY_KEY)
  } catch {
    /* 忽略 */
  }
})

describe('待同步标记持久化（离线改动的补推依据）', () => {
  it('写入即落盘；「重新加载页面」后标记仍在（此前刷新即丢）', async () => {
    localStorage.removeItem(DIRTY_KEY)
    vi.resetModules()
    const auto = await import('../sync/auto')
    expect(auto.isDirty()).toBe(false)

    auto.notifyDataChanged()
    expect(auto.isDirty()).toBe(true)
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1')

    // 模拟页面重载：清模块缓存重新导入 —— 标记从 localStorage 恢复
    vi.resetModules()
    const reloaded = await import('../sync/auto')
    expect(reloaded.isDirty()).toBe(true)
  })

  it('localStorage 不可用（隐私模式）→ 退化为仅本会话语义，不抛错', async () => {
    const origGet = localStorage.getItem.bind(localStorage)
    const origSet = localStorage.setItem.bind(localStorage)
    // 只让"我们这个键"读写抛错，模拟隐私模式只拒这一处（不影响其它键）
    vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => {
      if (k === DIRTY_KEY) throw new Error('denied')
      return origGet(k)
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === DIRTY_KEY) throw new Error('denied')
      origSet(k, v)
    })

    vi.resetModules()
    const auto = await import('../sync/auto')
    expect(auto.isDirty()).toBe(false)

    expect(() => auto.notifyDataChanged()).not.toThrow()
    expect(auto.isDirty()).toBe(true)
  })
})