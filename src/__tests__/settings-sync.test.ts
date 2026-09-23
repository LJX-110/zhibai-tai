/**
 * @vitest-environment jsdom
偏好设置同步（`services/settings-sync.ts`）
 *
 * 这个文件管的正是"**哪些设置跨设备一致**"，所以最该钉住的是**边界**：
 *  · 白名单内的键要真的写进业务表（否则换台设备还得重配一遍）；
 *  · 白名单外的键（主题/布局等**设备级偏好**）不能写进去 —— 不该让一台设备的主题
 *    把另一台覆盖掉；
 *  · **密钥 / Token 绝不在同步范围内**（注释里明确写了，得有测试守住）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ROW_ID = 'settings'
/** 写库去抖 800ms —— 测试里统一等这么久 */
const DEBOUNCE = 900

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 每个用例都重新 import **整套模块**：
 *  · settings-sync 有模块级状态（hydrating / started / timer），不重置第二个用例起就不会再订阅；
 *  · 库名在测试环境是**每文件随机**的，重置模块会重建连接 ——
 *    所以仓储也必须**在重置之后** import，否则写进的是上一个库（读不到）。
 */
async function fresh() {
  const repo = await import('../repositories/settings-repo')
  const store = await import('../stores/useSettingsStore')
  const sync = await import('../services/settings-sync')
  return { repo: repo.appSettingsRepo, store: store.useSettingsStore, sync }
}

beforeEach(() => {
  vi.resetModules()
})

describe('hydrateSyncedSettings：把库里的设置灌回本地', () => {
  it('库里有的键覆盖本地值（换设备即恢复）', async () => {
    const { repo, store, sync } = await fresh()
    await repo.put({
      id: ROW_ID,
      data: { waterGoalMl: 2500, pomodoroFocusMin: 50, aiModel: '远端模型' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never)
    store.getState().set({ waterGoalMl: 1500 })

    await sync.hydrateSyncedSettings()

    expect(store.getState().waterGoalMl).toBe(2500)
    expect(store.getState().pomodoroFocusMin).toBe(50)
    expect(store.getState().aiModel).toBe('远端模型')
  })

  it('库里没有数据时不动本地设置（不把本地抹成默认）', async () => {
    const { store, sync } = await fresh()
    store.getState().set({ waterGoalMl: 1800 })
    await sync.hydrateSyncedSettings()
    expect(store.getState().waterGoalMl).toBe(1800)
  })
})

describe('写入边界：只有白名单内的键进业务表', () => {
  it('改白名单内的键（音量）会落库', async () => {
    const { repo, store, sync } = await fresh()
    sync.initSyncedSettings()
    store.getState().set({ soundVolume: 0.42 })
    await wait(DEBOUNCE)
    const row = await repo.get(ROW_ID)
    expect(row).toBeTruthy()
    const data = (row as unknown as { data?: Record<string, unknown> })?.data ?? {}
    expect(data.soundVolume).toBe(0.42)
  })

  it('**改设备级偏好（主题）不落库** —— 不该让一台设备的主题覆盖另一台', async () => {
    const { repo, store, sync } = await fresh()
    sync.initSyncedSettings()
    store.getState().set({ theme: 'dark' })
    await wait(DEBOUNCE)
    const row = await repo.get(ROW_ID)
    // 要么整行没写，要么写了也不含 theme —— 两种都不算越界
    const data = ((row as unknown as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>
    expect(data.theme).toBeUndefined()
  })

  it('**密钥 / Token 绝不同步** —— 白名单里出现它们的任何一项都算安全回归', async () => {
    const { repo, store, sync } = await fresh()
    sync.initSyncedSettings()
    // 把可能存在的敏感键塞进 store（即便类型上不存在也要挡住）
    store.getState().set({
      apiKey: 'sk-绝不能同步',
      token: 'tok-绝不能同步',
      password: 'pw',
    } as never)
    await wait(DEBOUNCE)
    const row = await repo.get(ROW_ID)
    const r = ((row as unknown as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>
    expect(r.apiKey).toBeUndefined()
    expect(r.token).toBeUndefined()
    expect(r.password).toBeUndefined()
  })
})

describe('去抖', () => {
  it('连续变更只落一次盘（音量滑杆不该每次都写）', async () => {
    const { repo, store, sync } = await fresh()
    sync.initSyncedSettings()
    const put = vi.spyOn(repo, 'put')
    store.getState().set({ soundVolume: 0.3 })
    store.getState().set({ soundVolume: 0.4 })
    store.getState().set({ soundVolume: 0.5 })
    await wait(DEBOUNCE)
    expect(put.mock.calls.length).toBeLessThanOrEqual(1)
  })
})
