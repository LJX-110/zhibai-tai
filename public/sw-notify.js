/**
 * 通知点击处理 —— 经 vite.config.ts 的 workbox.importScripts 注入生成的 Service Worker。
 *
 * generateSW 模式产出的 SW 不含业务逻辑，系统通知被点击时默认什么都不发生；
 * 这里让点击聚焦已打开的窗口并跳到应用内对应板块（通知里的 data.hash）。
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const hash = (event.notification.data && event.notification.data.hash) || '#/'
  const target = new URL(hash, self.registration.scope).href
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})
