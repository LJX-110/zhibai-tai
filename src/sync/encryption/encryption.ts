/**
 * 加密 —— Web Crypto AES-GCM
 * 密钥不可导出，存于 IndexedDB（cryptoKeys）；Token 加密后再落 localStorage。
 */
import { db } from '../../db/db'

export interface Encryptor {
  encrypt(plain: string): Promise<string>
  decrypt(cipher: string): Promise<string>
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

class WebCryptoEncryptor implements Encryptor {
  private key: CryptoKey | null = null

  private async getKey(): Promise<CryptoKey> {
    if (this.key) return this.key
    const existing = await db.cryptoKeys.get('aes')
    if (existing) {
      this.key = existing.key
      return existing.key
    }
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // 不可导出
      ['encrypt', 'decrypt'],
    )
    await db.cryptoKeys.put({ id: 'aes', key })
    this.key = key
    return key
  }

  async encrypt(plain: string): Promise<string> {
    const key = await this.getKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = new TextEncoder().encode(plain)
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
    const merged = new Uint8Array(iv.length + ct.byteLength)
    merged.set(iv)
    merged.set(new Uint8Array(ct), iv.length)
    return bufToB64(merged)
  }

  async decrypt(cipher: string): Promise<string> {
    const key = await this.getKey()
    const merged = b64ToBuf(cipher)
    const iv = merged.slice(0, 12)
    const data = merged.slice(12)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(plain)
  }
}

/** 是否可用 Web Crypto */
export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

/** 统一入口（不可用时回退 base64，仅提示不保密） */
export const encryptor: Encryptor = isWebCryptoAvailable()
  ? new WebCryptoEncryptor()
  : {
      encrypt: async (plain) => btoa(unescape(encodeURIComponent(plain))),
      decrypt: async (cipher) => decodeURIComponent(escape(atob(cipher))),
    }
