/**
 * 系统能力接缝 · 类型定义（Service Definition）
 *
 * ## 为什么与业务插件**分开**
 * 板块插件（`components/ai/plugins/*`）提供的是**数据**；系统能力要动的是**设备的权限**。
 * 两者的授权模型完全不同：前者不需要许可，后者**必须逐个显式授权**，
 * 而且浏览器要求**用户手势**才能触发。混在一起会让"授权"这件事失去边界。
 *
 * ## 为什么不做成"模型调工具"
 * `AIProvider` 是**纯文本进出**（`complete` / `completeStream`），**不支持工具调用**。
 * 所以现实形态是：**关键词门控 + 用户显式授权 + 把结果写进上下文**。
 * 这不是退而求其次 —— PWA 里任何权限都必须在用户手势里请求，模型无法代替用户点那一下。
 *
 * ## 三条硬约束
 *  1. **授权是设备级的** —— 存 localStorage，**不进加密快照同步**。
 *     手机上授权了定位，不该让桌面也变成"已授权"。
 *  2. **绝不自动请求权限** —— 浏览器不给手势就直接拒，且偷偷弹权限框体验极差。
 *     未授权时上下文里只写"未授权"，由用户决定要不要点。
 *  3. **取不到就是取不到** —— 不返回假坐标、不返回空串冒充成功。
 */
export type CapabilityKind = 'geo' | 'clipboard'

/** 权限状态（与浏览器 `permissions.query` 的语义对齐） */
export type CapabilityState = 'unsupported' | 'idle' | 'granted' | 'denied'

export interface CapabilitySnapshot {
  kind: CapabilityKind
  label: string
  state: CapabilityState
  /**
   * 最近一次取到的值（人类可读，可直接写进上下文）。
   * 未取过、或已过期 → null。**过期要作废**：给模型一个十分钟前的坐标比不给更糟。
   */
  value: string | null
  /** 取值时刻（ms）；未取过为 null */
  at: number | null
}

export interface Capability {
  kind: CapabilityKind
  /** 界面上的按钮文案 */
  label: string
  /** 一句话说清"点了会发生什么"（授权前必须让用户知道） */
  hint: string
  /** 浏览器是否支持（不支持就不该出现在界面上） */
  supported: () => boolean
  /** 当前权限状态。**只查询、不触发授权** */
  state: () => Promise<CapabilityState>
  /**
   * **必须由用户手势调用**：请求授权并取值。
   * 失败返回 null（不抛）—— 用户拒绝授权是正常路径，不是异常。
   */
  request: () => Promise<string | null>
}

/** 取值的有效期：超过它就视为过期，不再写进上下文 */
export const VALUE_TTL_MS = 5 * 60 * 1000
