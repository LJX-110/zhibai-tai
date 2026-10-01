/**
 * 未读通知数（订阅式）—— 给全局入口的角标用（Step 5-3D）
 *
 * 为什么单独成 hook：通知的真相在 `services/notification.ts`（localStorage），
 * 组件只需要"有几条未读"这一个数字；订阅与缓存都在那一层收口，
 * 这里只负责把它接成 React 能用的形状（`useSyncExternalStore`）。
 */
import { useSyncExternalStore } from 'react'
import { subscribeNotices, unreadNoticeCountCached } from '../services/notification'

export function useUnreadNotices(): number {
  return useSyncExternalStore(subscribeNotices, unreadNoticeCountCached)
}