/**
 * 同步加密测试 —— 验证同一 Sync Password 跨实例推导同一密钥并可解密
 */
import { describe, expect, it } from 'vitest'
import { decryptSyncData, deriveSyncKey, encryptSyncData } from '../sync/encryption/sync-crypto'

describe('sync-crypto (PBKDF2 → AES-GCM)', () => {
  it('同一 Sync Password 推导出相同密钥（跨设备可恢复）', async () => {
    const a = await deriveSyncKey('my-secret-pass')
    const b = await deriveSyncKey('my-secret-pass')
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    const encrypted = await encryptSyncData(a, { hello: '世界' })
    const decrypted = await decryptSyncData(b, encrypted)
    expect(decrypted).toEqual({ hello: '世界' })
  })

  it('不同密码无法解密同一密文', async () => {
    const a = await deriveSyncKey('password-a')
    const b = await deriveSyncKey('password-b')
    const encrypted = await encryptSyncData(a, { x: 1 })
    await expect(decryptSyncData(b, encrypted)).rejects.toThrow()
  })

  it('加密结果每次不同（随机 IV）', async () => {
    const key = await deriveSyncKey('same-pass')
    const c1 = await encryptSyncData(key, { data: '同内容' })
    const c2 = await encryptSyncData(key, { data: '同内容' })
    expect(c1).not.toBe(c2)
    expect(await decryptSyncData(key, c1)).toEqual(await decryptSyncData(key, c2))
  })
})
