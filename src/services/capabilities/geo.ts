/**
 * 系统能力 · 定位（`navigator.geolocation`）
 *
 * ⚠️ **诚实说明（这一条决定了整个能力的形态）**：
 *  · 只能拿到**设备当前经纬度**；
 *  · **没有**逆地理编码 —— 把坐标变成"XX 市 XX 区"需要第三方服务，本项目不引入；
 *  · **没有**后台定位 —— PWA 只在页面前台、且用户手势时才可请求。
 *
 * 所以它的现实形态是：**用户点了才取一次、只给坐标、用完即弃（5 分钟过期）**。
 * 别把它当成"常驻定位"，也别在文案里暗示能知道"你在哪条街"。
 */
import type { Capability, CapabilityState } from './types'

/** 把坐标降到"够用但不精确"：约 3 位小数 ≈ 100m 级。再精细对"附近"这类问题没有意义，却更敏感 */
function coordsText(pos: GeolocationPosition): string {
  const lat = pos.coords.latitude.toFixed(3)
  const lon = pos.coords.longitude.toFixed(3)
  const acc = Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null
  return `纬度 ${lat}，经度 ${lon}${acc ? `（精度约 ${acc} 米）` : ''}`
}

export const geoCapability: Capability = {
  kind: 'geo',
  label: '定位',
  hint: '取一次当前坐标（约 100 米级）。没有逆地理编码，所以给不出街道名；5 分钟后作废。',

  supported: () => typeof navigator !== 'undefined' && 'geolocation' in navigator,

  state: async (): Promise<CapabilityState> => {
    if (!geoCapability.supported()) return 'unsupported'
    // permissions API 在部分浏览器不可用（Safari 早期版本），此时按"未知"处理 ——
    // 未知不等于已授权，叫它 idle，让界面显示成"可点"
    const perms = navigator.permissions
    if (!perms?.query) return 'idle'
    try {
      const r = await perms.query({ name: 'geolocation' as PermissionName })
      if (r.state === 'granted') return 'granted'
      if (r.state === 'denied') return 'denied'
      return 'idle'
    } catch {
      return 'idle'
    }
  },

  request: () =>
    new Promise<string | null>((resolve) => {
      if (!geoCapability.supported()) {
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(coordsText(pos)),
        () => resolve(null), // 拒绝 / 超时 / 不可用：统一按"没取到"处理，不抛
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      )
    }),
}
