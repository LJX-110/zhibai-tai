/**
 * 系统能力 · 剪贴板（`navigator.clipboard.readText()`）
 *
 * ⚠️ **隐私红线：绝不把整段剪贴板喂给模型**。
 * 剪贴板里可能是密码、验证码、私聊内容、身份证号 —— 用户点"读取剪贴板"时，
 * 心里想的是"把我刚复制的那句话记下来"，不是"把我的剪贴板全文上传给模型"。
 *
 * 所以这里做两件事：
 *  1. **截断**（超过 `MAX_LEN` 只取前一段），并在返回值里明说"已截断"；
 *  2. **去掉首尾空白、折叠连续空行** —— 从网页复制的文本常带大量空白与换行，
 *     直接塞进 prompt 会白烧 token。
 *
 * 若将来要放宽，必须同时改 UI 文案让用户知情 —— 别偷偷放宽。
 */
import type { Capability, CapabilityState } from './types'

/** 送进上下文的最大字符数。够装下"一句话/一个标题/一段待办"，装不下整篇文章 */
const MAX_LEN = 200

function clean(raw: string): string {
  const one = raw.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim()
  if (one.length <= MAX_LEN) return one
  return `${one.slice(0, MAX_LEN)}…（已截断，原文 ${one.length} 字）`
}

export const clipboardCapability: Capability = {
  kind: 'clipboard',
  label: '剪贴板',
  hint: `读取当前剪贴板文本，只取前 ${MAX_LEN} 字，不会上传全文。`,

  supported: () => typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText),

  state: async (): Promise<CapabilityState> => {
    if (!clipboardCapability.supported()) return 'unsupported'
    const perms = navigator.permissions
    if (!perms?.query) return 'idle'
    try {
      // clipboard-read 在部分浏览器不支持查询，会抛 —— 按 idle 处理
      const r = await perms.query({ name: 'clipboard-read' as PermissionName })
      if (r.state === 'granted') return 'granted'
      if (r.state === 'denied') return 'denied'
      return 'idle'
    } catch {
      return 'idle'
    }
  },

  request: async () => {
    if (!clipboardCapability.supported()) return null
    try {
      const text = await navigator.clipboard.readText()
      const cleaned = clean(text)
      // 空剪贴板不假装成功 —— 返回 null 让界面说"剪贴板是空的"
      return cleaned ? cleaned : null
    } catch {
      // 无手势 / 用户拒绝 / 权限被策略拦截：统一按"没取到"处理
      return null
    }
  },
}
