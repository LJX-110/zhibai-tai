/**
 * 「刷新到最新」—— 系统页页头「刷新」按钮与 PWA 更新横幅**共用的唯一出口**
 *
 * ## 它治的是什么（2026-10-07 用户上报："手机版刷新好多次才是最新的"）
 * `registerType: 'prompt'` 下，新 Service Worker 会一直停在 `waiting`
 * （这正是 prompt 模式的设计：不悄悄换版本）。要它接管，只有两条路：
 * **旧页面全部关闭**，或**页面主动发 `SKIP_WAITING`**。
 * 此前更新横幅只调 `window.location.reload()` —— 页面重载了，等待中的 SW 还在等，
 * 于是"刷几次都还是旧版"。
 *
 * ## 采取的动作（顺序即优先级）
 *  1. **已有等待中的新版本** → 走插件的官方出口 `updateSW`（内部发 `SKIP_WAITING`），
 *     等 `controllerchange`（新 SW 真的接管）后刷新页面 —— 这一步才是"变最新"的关键；
 *  2. **没有** → 主动 `registration.update()` 查一次，给它 1.2s（发现）/ 4s（装完）的窗口；
 *  3. **无论如何**都要刷新一次页面 —— 即使没有新版本，也把应用内存态整体重载
 *     （本地数据在 IndexedDB，刷新不丢东西；用户按了按钮就必须有可见反馈）。
 *
 * ## 两条纪律
 *  · `updateSW` 由 `UpdateBanner` 注册时登记（见 `bindUpdateSW`）—— **只登记一次**，
 *    这里不重新 `registerSW`（重复注册会绕过插件的单例，出现第二套更新状态）；
 *  · 本模块只做"刷新"，**不清缓存**：清 `caches` 会把 63MB 桌宠素材与字体全部作废，
 *    那是"修网络"的手段，不是"拿最新版"的手段。
 */

/** `registerSW` 返回的官方出口：激活等待中的新 SW（可选是否由它自己刷新页面） */
type UpdateSW = (reloadPage?: boolean) => Promise<void>

let updateSWFn: UpdateSW | null = null

/** 由 `UpdateBanner` 在注册 SW 后登记（同一出口，避免两套更新状态） */
export function bindUpdateSW(fn: UpdateSW): void {
  updateSWFn = fn
}

/** 已进入刷新流程（按钮连点 / 横幅与按钮同时触发时的去重） */
let refreshing = false
/** 已发出一次刷新（`controllerchange` 与兜底可能同时到达，只认第一次） */
let reloaded = false

function reloadNow(): void {
  if (reloaded) return
  reloaded = true
  window.location.reload()
}

/** `update()` 查到新版本后，等它"发现"与"装完"的窗口（ms） */
const DISCOVER_WAIT_MS = 1200
const INSTALL_WAIT_MS = 4000
/** `SKIP_WAITING` 发出后等 `controllerchange` 的时间（ms）——超时走兜底刷新 */
const SKIP_WAIT_MS = 800

/** 等新 SW 装完进 `waiting`；没发现更新 / 超时 / 装失败 → false */
function waitUntilWaiting(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (reg.waiting) return Promise.resolve(true)
  return new Promise((resolve) => {
    let sealed = false
    let discoverTimer: number | undefined
    let installTimer: number | undefined
    const finish = (ok: boolean) => {
      if (sealed) return
      sealed = true
      window.clearTimeout(discoverTimer)
      window.clearTimeout(installTimer)
      resolve(ok)
    }
    // `update()` 已查过一次：这段时间内没有 updatefound，就按"没有更新"处理
    discoverTimer = window.setTimeout(() => finish(false), DISCOVER_WAIT_MS)
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      if (!installing) return finish(false)
      window.clearTimeout(discoverTimer)
      installTimer = window.setTimeout(() => finish(false), INSTALL_WAIT_MS)
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') finish(true)
        else if (installing.state === 'redundant') finish(false)
      })
    })
  })
}

/** 刷新到最新。失败安全：任何一步出错都落到"直接刷新页面"，按钮不能没反应 */
export async function refreshToLatest(): Promise<void> {
  if (refreshing) return
  refreshing = true
  try {
    const sw = navigator.serviceWorker
    if (sw) {
      const reg = await sw.getRegistration()
      if (reg) {
        // 新 SW 接管 → 立刻刷新（这是"真的换到新版"的信号）
        sw.addEventListener('controllerchange', reloadNow, { once: true })
        let activable = reg.waiting !== null
        if (!activable) {
          try {
            await reg.update()
          } catch {
            /* 离线 / 脚本取不到：当作没有更新，走下面的兜底刷新 */
          }
          activable = await waitUntilWaiting(reg)
        }
        if (activable) {
          // false：刷新由本模块统一负责（避免插件与兜底各刷一次）
          void updateSWFn?.(false)
          await new Promise((r) => window.setTimeout(r, SKIP_WAIT_MS))
        }
      }
    }
  } catch {
    /* 任何异常都落到兜底刷新 */
  }
  reloadNow()
}