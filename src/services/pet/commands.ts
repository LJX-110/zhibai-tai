/**
 * 桌宠 · 外部命令通道（Step 5-2C F 批）
 *
 * ## 为什么要有它
 * 「恢复默认位置」这个动作在**设置页**，而执行它的是**宠物那一棵树**里的 `usePetLoop`
 * （它持有位置 ref、paint、几何）。两者不在同一棵组件树里。
 *
 * 三条可选路子：
 *  ① 给 store 加一个"看起来像业务数据的"桥接字段 —— 会污染数据层，且这个字段没有语义；
 *  ② 让设置页直接去写 DOM —— 越过分层，必坏；
 *  ③ **一条命令通道**：设置页"发命令"，宠物侧"订阅并执行" —— 与本项目 `completion.ts`
 *     的 `onCompletion` 同一套做法（服务只宣布，谁执行由视图订阅决定）。
 *
 * 采用 ③：**不新增 store 字段、不进业务表、不进同步**。
 * 命令是**过程量**，没有落库理由 —— 位置本身仍由 `PetHost.persistLocalPosition` 存本机。
 */
type Listener = () => void
/** 播放命令：参数是要播的动画名（来自 config 的动画池，见 `animation-catalog`） */
type AnimListener = (name: string) => void

const resetListeners = new Set<Listener>()
const playListeners = new Set<AnimListener>()

/** 请求"恢复默认位置"（设置页调用） */
export function requestResetPosition(): void {
  for (const fn of resetListeners) fn()
}

/** 订阅该命令（宠物侧调用）；返回退订函数 */
export function onResetPosition(fn: Listener): () => void {
  resetListeners.add(fn)
  return () => resetListeners.delete(fn)
}

/**
 * 请求"立刻播某个动作"（Step 5-3E · 设置页「动作」列表 / 菜单调用）。
 * 名字必须是 config 里真实存在的动画名 —— 宠物侧还会再校验一次（`playOnce`），
 * 不信任调用方（设置页将来可能从旧配置缓存里拿到过期的名字）。
 */
export function requestPlayAnim(name: string): void {
  for (const fn of playListeners) fn(name)
}

/** 订阅"播动作"命令（宠物侧调用）；返回退订函数 */
export function onPlayAnim(fn: AnimListener): () => void {
  playListeners.add(fn)
  return () => playListeners.delete(fn)
}
