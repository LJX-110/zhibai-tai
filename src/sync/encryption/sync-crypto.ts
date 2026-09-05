/**
 * 同步加密 —— Sync Password → PBKDF2 → AES-GCM
 * 固定应用盐（盐非机密），同一 Sync Password 在任意设备推导出同一密钥，
 * 从而可用同一凭据在多设备间恢复数据。
 *
 * 与 GitHub Token 的加密分离：
 * - Token 用设备本地不可导出密钥加密（新设备需重输）
 * - 数据快照用 Sync Password 推导密钥加密（可跨设备恢复）
 */
import { encryptor } from './encryption'

/** 应用固定盐（非机密，用于跨设备推导同一密钥） */
const SALT = new TextEncoder().encode('yishu-workbench-sync-salt-v1')
const ITERATIONS = 200_000

/** 由 Sync Password 推导 AES-GCM 密钥（跨设备一致） */
export async function deriveSyncKey(password: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function bufToB64(buf: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(s)
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 加密任意 JSON 数据 → base64 */
export async function encryptSyncData(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  const merged = new Uint8Array(iv.length + ct.byteLength)
  merged.set(iv)
  merged.set(new Uint8Array(ct), iv.length)
  return bufToB64(merged)
}

/** 解密 base64 → JSON 数据 */
export async function decryptSyncData(key: CryptoKey, cipher: string): Promise<unknown> {
  const merged = b64ToBuf(cipher)
  const iv = merged.slice(0, 12)
  const data = merged.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return JSON.parse(new TextDecoder().decode(plain)) as unknown
}

/** 是否支持 Web Crypto */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

/**
 * 存储 Sync Password：用设备本地密钥加密后存设置（不明文落盘）
 * 新设备首次恢复时用户需重新输入。
 */
export async function encryptSyncPassword(password: string): Promise<string> {
  return encryptor.encrypt(password)
}

export async function decryptSyncPassword(cipher: string): Promise<string> {
  return encryptor.decrypt(cipher)
}
