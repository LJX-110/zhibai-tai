/**
 * 桌宠 · 同步边界回归（本轮最要紧的一条不变式）
 *
 * **位置不是业务数据。** 它曾写在业务表 `petState.position` 里、并在每次落库时
 * `notifyDataChanged()` —— 于是漫游每几秒就刷新一次同步脏标记；而默认 30s 间隔下
 * `schedule()` 是"clearTimeout 后重设"，被持续刷新就意味着 **同步永远不会发生**
 * （用户看到的是"有改动待同步"长期不消失，或者干脆永远不推）。
 *
 * 这里钉两件事，缺一不可：
 *  ① 写**本机位置**既不写业务表、也不把同步脏标记弄脏；
 *  ② **业务字段（好感度）照常**写库并置脏 —— 用的都是**真实实现**，
 *     不是"把 notifyDataChanged 删掉"那种粗暴通过。
 *
 * ⚠️ 断言 `isDirty()` 能成立的前提：vitest 每个测试文件各有独立模块图，
 * 所以本文件里的脏标记**初始一定是 false**；也因此「位置」那组用例必须排在
 * 「业务字段」之前（后者会把它置脏）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../repositories/pet-repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../repositories/pet-repo')>()
  return {
    ...actual,
    // 打桩只为两件事：断言"谁写了业务表"，以及让测试不依赖真实 IndexedDB
    readPetState: vi.fn().mockResolvedValue(null),
    writePetState: vi.fn().mockResolvedValue(undefined),
  }
})

import { isDirty } from '../sync/auto'
import { writePetState } from '../repositories/pet-repo'
import { usePetStore } from '../stores/usePetStore'
import { createBrowserHost } from '../services/pet/adapter'

const mockWrite = vi.mocked(writePetState)

beforeEach(() => {
  mockWrite.mockClear()
  localStorage.clear()
})

describe('位置：设备级状态，不进同步', () => {
  it('**桌宠 store 里已经没有 position / setPosition**（位置不再是业务状态）', () => {
    const s = usePetStore.getState()
    expect('position' in s).toBe(false)
    expect('setPosition' in s).toBe(false)
  })

  it('写本机位置只落 localStorage：**既不写业务表，也不让同步脏标记变脏**', () => {
    // 本文件此刻还没人碰过同步 —— 初始必须是干净的
    expect(isDirty()).toBe(false)
    const host = createBrowserHost()
    host.persistLocalPosition({ x: 12, y: 34 })
    expect(mockWrite).not.toHaveBeenCalled()
    expect(isDirty()).toBe(false)
    expect(host.loadLocalPosition()).toEqual({ x: 12, y: 34 })
  })

  it('本机存档缺失 / 损坏时不抛错，返回 null（调用方落回锚点）', () => {
    const host = createBrowserHost()
    expect(host.loadLocalPosition()).toBeNull()
    localStorage.setItem('zbt:pet-position:v1', '{坏掉的 JSON')
    expect(host.loadLocalPosition()).toBeNull()
    localStorage.setItem('zbt:pet-position:v1', '{"x":"a","y":2}')
    expect(host.loadLocalPosition()).toBeNull()
  })
})

describe('业务字段：照常写库并触发同步（证明没有"把通知删掉"糊过去）', () => {
  it('好感度加分写业务表，且 **patch 里不含 position**', async () => {
    const gained = await usePetStore.getState().grantAffinity('click')
    expect(gained).toBeGreaterThan(0)
    expect(mockWrite).toHaveBeenCalled()
    const patch = mockWrite.mock.calls[0][0]
    expect('position' in patch).toBe(false)
    expect(patch.affinity).toBeGreaterThan(0)
  })

  it('**并把同步脏标记置起来** —— 业务数据的同步链路完好', async () => {
    await usePetStore.getState().grantAffinity('click')
    // 落库是 fire-and-forget（不阻塞界面），置脏在随后的微任务里才到
    await vi.waitFor(() => expect(isDirty()).toBe(true))
  })
})
