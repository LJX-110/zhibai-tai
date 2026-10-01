/**
 * 通知中心 · 全局弹层（Step 5-3D）
 *
 * 通知中心此前只嵌在「系统 → 通知」里 —— 错过的事必须"自己想起来去翻"，
 * 而未读角标又需要一个**跨组件的开合状态**（设置页的分组是组件内 state）。
 * 现在两处入口（移动端顶栏铃铛 / 桌面侧栏）都开这一个弹层，
 * 内容仍是同一个 `NotificationCenter` —— 不复制第二套列表。
 */
import { NotificationCenter } from './NotificationCenter'
import { useNoticeCenterStore } from './notice-center-store'
import { Sheet } from '../ui'

export function NoticeCenterHost() {
  const open = useNoticeCenterStore((s) => s.open)
  const setOpen = useNoticeCenterStore((s) => s.setOpen)
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="通知中心">
      <NotificationCenter />
    </Sheet>
  )
}