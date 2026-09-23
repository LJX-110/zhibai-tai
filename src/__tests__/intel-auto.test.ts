/**
 * 情报自动抓取的**调度**（`services/intelligence/auto.ts`）
 *
 * 抓取逻辑（并发/退避/落库）由 `intel-fetch.test.ts` 覆盖，这里只管一件事：
 * **什么时候跑、跑多密**。三条契约都有真实后果：
 *  ① 设置里关掉 → **不能**注册定时器（否则"关掉还在偷偷联网"）；
 *  ② 间隔有 10 分钟下限 → 设置里填 1 分钟也不能每分钟打一遍别人的源（限流与封禁）；
 *  ③ 重复 init 不能叠加定时器 —— 设置页改一次间隔就调一次 init，
 *     旧定时器没清掉的话抓取频率会随修改次数**成倍增长**。
 *
 * 跑在 jsdom 下：本文件用 `window.setInterval`，node 环境里没有 window。
 *
 * ⚠️ 三条踩过的坑（都写在这里，别再踩）：
 *  · **不要用 `vi.useFakeTimers()`** —— 动态 import 会载入整个模块图（含 Dexie/DB），
 *    假定时器下这条链上的任何 setTimeout 都不会推进，于是"单跑绿、全量跑挂"。
 *    本文件只需要断言"注册了几次、间隔多少"，**根本用不到假定时器**。
 *  · **不要 `vi.resetModules()`** —— 那会让每个用例都重新载入整个模块图（几秒起步）。
 *    这里也不需要隔离：`initIntelAutoFetch` 的契约本来就是"先清旧的再注册"，
 *    同一模块实例跑多个用例是安全的（各自 setState 设定前置条件即可）。
 *  · **断言要看"本函数新增了几次"，不能看总数** —— 导入模块图时别处也会注册定时器，
 *    用 `toHaveBeenCalledTimes` 会把那些噪音算进来。
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function fresh() {
  const auto = await import('../services/intelligence/auto')
  const store = await import('../stores/useSettingsStore')
  return { auto, store }
}

let spySet: ReturnType<typeof vi.spyOn>
let spyClear: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // 真定时器（故意不用 fake）、也不 resetModules：理由见文件头
  spySet = vi.spyOn(window, 'setInterval')
  spyClear = vi.spyOn(window, 'clearInterval')
  vi.clearAllMocks()
})

afterEach(() => {
  // 这里注册的是**真** interval（如 30 分钟），不清掉会挂在 worker 里
  for (const r of spySet.mock.results) {
    if (r.type === 'return') window.clearInterval(r.value as number)
  }
  vi.restoreAllMocks()
})

describe('initIntelAutoFetch：按设置启动/停止定时抓取', () => {
  it('设置里关掉 → **不注册定时器**（关掉就不该还在偷偷联网）', async () => {
    const { auto, store } = await fresh()
    store.useSettingsStore.setState({ intelAutoFetch: false })
    // 只看**本函数**新增的注册：动态 import 整个模块图时别处也会注册定时器，
    // 直接 not.toHaveBeenCalled() 会把那些噪音算进来（实测全量跑就是这样红的）
    const before = spySet.mock.calls.length
    auto.initIntelAutoFetch()
    expect(spySet.mock.calls.length - before).toBe(0)
  })

  it('打开 → 按设置的分钟数注册', async () => {
    const { auto, store } = await fresh()
    store.useSettingsStore.setState({ intelAutoFetch: true, intelFetchMinutes: 30 })
    const before = spySet.mock.calls.length
    auto.initIntelAutoFetch()
    const added = spySet.mock.calls.slice(before)
    expect(added).toHaveLength(1)
    expect(added[0][1]).toBe(30 * 60 * 1000)
  })

  it('**间隔有 10 分钟下限** —— 填 1 分钟也不能每分钟打一遍别人的源', async () => {
    const { auto, store } = await fresh()
    store.useSettingsStore.setState({ intelAutoFetch: true, intelFetchMinutes: 1 })
    const before = spySet.mock.calls.length
    auto.initIntelAutoFetch()
    expect(spySet.mock.calls[before][1]).toBe(10 * 60 * 1000)
  })

  it('**重复 init 不叠加定时器**（设置页每改一次间隔就要调一次）', async () => {
    const { auto, store } = await fresh()
    store.useSettingsStore.setState({ intelAutoFetch: true, intelFetchMinutes: 30 })

    const before = spySet.mock.results.length
    auto.initIntelAutoFetch()
    auto.initIntelAutoFetch()
    auto.initIntelAutoFetch()

    const ids = spySet.mock.results.slice(before).map((r: { value: unknown }) => r.value as number)
    expect(ids).toHaveLength(3) // 三次都注册了
    const clearedIds = spyClear.mock.calls.map((c: unknown[]) => c[0] as number)
    // 前两次注册的都被下一次清掉了 → 没有堆积
    expect(clearedIds).toContain(ids[0])
    expect(clearedIds).toContain(ids[1])
    // 最后一次注册的必须还活着（否则桌宠定时抓取就彻底停了）
    expect(clearedIds).not.toContain(ids[2])
  })

  it('先开后关：关掉时把已有定时器清掉', async () => {
    const { auto, store } = await fresh()
    store.useSettingsStore.setState({ intelAutoFetch: true, intelFetchMinutes: 30 })
    auto.initIntelAutoFetch()

    const beforeSet = spySet.mock.calls.length
    const beforeClear = spyClear.mock.calls.length
    store.useSettingsStore.setState({ intelAutoFetch: false })
    auto.initIntelAutoFetch()
    expect(spyClear.mock.calls.length - beforeClear).toBe(1)
    expect(spySet.mock.calls.length - beforeSet).toBe(0)
  })
})
