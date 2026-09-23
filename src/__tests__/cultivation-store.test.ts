/**
 * 修行 store 的落库纪律 —— 「**载入之后再取快照**」
 *
 * 背景（这是本轮审计抓到的一个真 bug）：`grantSeclusion` 原先写成
 * `const s = get(); await s.load()`。`get()` 返回的是调用那一刻的状态副本，
 * 载入完成后手里那份仍是旧值 —— 未载入时 `bonus = 0`、`seclusionCount = 0`，
 * 于是结算会以**空基数**写库，把历史累计的闭关功行静默抹掉。
 *
 * 触发路径真实存在：`Bootstrap` 有 3 秒安全阀（`Promise.race`），冷启动数据慢时
 * 工作台会在 `reloadAllStores()` 完成前渲染；此时直接去学页跑一次**绑定了待办的**
 * 番茄钟（`usePomodoroTimerStore` 的完成分支）即命中。
 *
 * `settleMerit` 早有 `loaded` 守卫（且 hook 依赖里补了 `loaded` 补跑），
 * 唯独 `grantSeclusion` 漏了同一道纪律 —— 所以这里钉住它。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 每个用例重新 import **整套模块**：
 *  · store 有模块级单例状态，不重置的话第二个用例起就在上一次的残留上跑；
 *  · 库名在测试环境是**每文件随机**的，重置模块会重建连接 ——
 *    所以仓储也必须**在重置之后** import，否则读到的是另一个库。
 */
async function fresh() {
  const repo = await import('../repositories/cultivation-repo')
  const store = await import('../stores/useCultivationStore')
  return { repo, store }
}

/** 「页面刚打开、load() 还没跑完」的内存态 */
const UNLOADED = {
  loaded: false,
  total: 0,
  bonus: 0,
  todayDate: '',
  todayCounted: 0,
  seclusionCount: 0,
} as const

beforeEach(() => {
  vi.resetModules()
})

describe('grantSeclusion：闭关结算', () => {
  it('**载入未完成时不得用空基数覆盖历史** —— 这是本文件存在的理由', async () => {
    const { repo, store } = await fresh()
    // 库里已有历史：累计 100 功行、闭关 3 次共得 50 额外
    await repo.writeCultivationState({
      total: 100,
      bonus: 50,
      seclusionCount: 3,
      todayDate: '2026-09-22',
      todayCounted: 20,
    })
    // 模拟「Bootstrap 的安全阀已放行、但 store 还没载入」那一刻
    store.useCultivationStore.setState({ ...UNLOADED })

    const gain = await store.useCultivationStore.getState().grantSeclusion(60)

    expect(gain).toBe(50) // 基础 20 + 60/10×5
    // 旧实现会得到 50（= 0 + 50），历史那 50 点闭关功行凭空消失
    expect(store.useCultivationStore.getState().bonus).toBe(100)
    expect(store.useCultivationStore.getState().seclusionCount).toBe(4)

    // 落库也要对 —— 只改内存不改库，下次刷新照样丢
    const row = await repo.readCultivationState()
    expect(row?.bonus).toBe(100)
    expect(row?.seclusionCount).toBe(4)
    // 顺带钉住：结算额外功行不得顺手改 total / todayDate（那是 settleDaily 的职责）
    expect(row?.total).toBe(100)
    expect(row?.todayDate).toBe('2026-09-22')
    expect(row?.todayCounted).toBe(20)
  })

  it('连续闭关逐次累加（不覆盖，也不乘倍）', async () => {
    const { repo, store } = await fresh()
    store.useCultivationStore.setState({ ...UNLOADED })

    expect(await store.useCultivationStore.getState().grantSeclusion(60)).toBe(50)
    expect(await store.useCultivationStore.getState().grantSeclusion(25)).toBe(30)
    expect(await store.useCultivationStore.getState().grantSeclusion(90)).toBe(65)

    const row = await repo.readCultivationState()
    expect(row?.bonus).toBe(145) // 50 + 30 + 65
    expect(row?.seclusionCount).toBe(3)
  })

  it('载入已完成时同样累加（回归：修 bug 不能把正常路径改坏）', async () => {
    const { repo, store } = await fresh()
    await repo.writeCultivationState({ total: 40, bonus: 10, seclusionCount: 1 })

    // 正常路径：先 load() 再结算（hook 挂载时就会做）
    await store.useCultivationStore.getState().load()
    expect(store.useCultivationStore.getState().loaded).toBe(true)
    expect(store.useCultivationStore.getState().bonus).toBe(10)

    expect(await store.useCultivationStore.getState().grantSeclusion(10)).toBe(25)
    expect(store.useCultivationStore.getState().bonus).toBe(35)
    expect((await repo.readCultivationState())?.bonus).toBe(35)
  })

  it('时长为 0 时给基础分，不会因为 gain<=0 而静默写库', async () => {
    const { repo, store } = await fresh()
    store.useCultivationStore.setState({ ...UNLOADED })
    // 负值被 seclusionReward 夹到 0 分钟 → 仍给基础 20（"肯坐下来"本身就是门槛）
    expect(await store.useCultivationStore.getState().grantSeclusion(-5)).toBe(20)
    expect((await repo.readCultivationState())?.seclusionCount).toBe(1)
  })
})
