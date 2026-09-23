import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
/// <reference types="vite-plugin-pwa/client" />
import './index.css'
import { App } from './app/App.tsx'
import { installGlobalErrorHandlers } from './services/error-log'
import { useToastStore } from './components/ui/toast-store'
import { UpdateBanner } from './components/pwa/UpdateBanner'

/* 全局故障兜底 —— 必须在 render 之前装上，否则启动阶段（Bootstrap 载数据、
   SW 注册）抛的错就漏掉了。ErrorBoundary 只捕渲染期异常，事件回调与未处理的
   Promise 拒绝是它管不到的盲区，这里正是补那一块：记入本机流水 + 打扰一次。
   提示里点一下直达设置页，「已记录」是告诉用户"这不是一闪而过的、你能回看" */
installGlobalErrorHandlers({
  notify: (record) =>
    useToastStore
      .getState()
      .push(`出了点问题（已记录）：${record.message}`, 'danger', '#/system'),
})

/* 加载入口是模块副作用：Vite dev 下 HMR 全量刷新会让本模块重复执行，
   对同一 #root 二次 createRoot 会触发 React 警告并在随后卸载旧树时抛
   removeChild NotFoundError（曾以「应用启动异常」错误条闪现在每次重载）。
   用 window 级单例根：模块再执行也只复用既有 root。 */
declare global {
  interface Window {
    __zbtRoot?: Root
  }
}

const rootEl = document.getElementById('root')!
if (!window.__zbtRoot) {
  window.__zbtRoot = createRoot(rootEl)
}
window.__zbtRoot.render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)