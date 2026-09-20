/**
 * 加密 —— Web Crypto AES-GCM
 * 密钥不可导出，存于 IndexedDB（cryptoKeys）；Token 加密后再落 localStorage。
 */
import { db } from '../../db/db'
import { b64ToBuf, bufToB64 } from '../../utils/base64'

export interface Encryptor {
  encrypt(plain: string): Promise<string>
  decrypt(cipher: string): Promise<string>
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

/**
 * 统一入口。Web Crypto 不可用时**明确失败并抛出可读错误**，
 * 不静默降级为 base64（即明文）存储 Token —— 那等于把凭据以明文落盘。
 * 是否可用的唯一事实源是 `isWebCryptoAvailable`。
 */
export const encryptor: Encryptor = isWebCryptoAvailable()
  ? new WebCryptoEncryptor()
  : {
      encrypt: async () => {
        throw new Error('当前浏览器环境不支持加密，无法安全保存同步凭据')
      },
      decrypt: async () => {
        throw new Error('当前浏览器环境不支持加密，无法读取已保存的同步凭据')
      },
    }
