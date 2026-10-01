/**
 * 「跳到系统页的某个分组」意图（Step 5-3E）
 *
 * ## 为什么需要它
 * `SettingsPage` 的分组是**组件内 `useState`** —— 从桌宠菜单点「桌宠设置」时，
 * 既要把页面切到「系统」，还要落在「桌宠」那一组。把一个 `useState` 提升成全局 store
 * 只为这一件事太重；这里用**一条意图通道**（与 `services/pet/commands.ts` 同一套做法）：
 * 谁要跳 → `requestSettingsGroup('pet')`；设置页订阅并切组。
 *
 * ⚠️ 放在 `services/` 而不是 `pages/settings/`：**组件不该反向 import 页面**
 * （分层是 pages → components → stores → repositories → services）；调用方两边都能引它。
 *
 * 不落库、不进同步 —— 它是过程量。
 */
export type SettingsGroup = 'appearance' | 'alerts' | 'pet' | 'ai' | 'data'

const listeners = new Set<(g: SettingsGroup) => void>()

/** 请求切到某个设置分组（调用方通常还要 `setSection('system')` 把页面带过去） */
export function requestSettingsGroup(group: SettingsGroup): void {
  for (const fn of listeners) fn(group)
}

/** 订阅该意图（SettingsPage 调用）；返回退订函数 */
export function onSettingsGroupRequest(fn: (g: SettingsGroup) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}