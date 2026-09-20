/**
 * Uint8Array ↔ base64 互转 —— 单一事实源
 *
 * 用 0x8000 分块拼接，而不是一次性 `String.fromCharCode(...buf)`：
 * 大快照展开成参数会直接爆栈（RangeError: Maximum call stack size exceeded）。
 * 本地凭据加密（encryption）与同步快照加密（sync-crypto）共用这一份实现。
 */
export function bufToB64(buf: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(s)
}

export function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
