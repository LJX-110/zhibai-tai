/**
 * 密钥隔离（Step 5-1 · D3 / D4 / D5 / D6）
 *
 * 四个出口逐一验证"凭据不会跟出去"：
 *  · **export**（用户点「导出备份」拿到的 JSON）
 *  · **snapshot**（推到 GitHub 的那份密文及其明文内容）
 *  · **settings 同步行**（appSettings：白名单之外的键一个都不该进去）
 *  · **Agent context**（喂给模型的文本）
 *
 * 手法：把"看起来像凭据"的值**真的写进设置 store**，再走一遍各出口，断言它们不出现。
 * 值都是假串（`sk-` / `ghp_` / 口令），不含任何真实凭据。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'

const FAKE_AI_KEY = 'sk-proj-FAKEKEYFOR-TEST-0000000000'
const FAKE_GH_TOKEN = 'ghp_FAKETOKENFORTEST0000000000000000'
const FAKE_SYNC_PASSWORD = 'fake-sync-password-123'

let db: typeof import('../db/db')['db']
let settings: typeof import('../stores/useSettingsStore')['useSettingsStore']
let settingsSync: typeof import('../services/settings-sync')

async function boot() {
  vi.resetModules()
  db = (await import('../db/db')).db
  settings = (await import('../stores/useSettingsStore')).useSettingsStore
  settingsSync = await import('../services/settings-sync')
  // 三个秘密照"已加密保存"的样子放进去（密文由设备密钥解开，这里只关心它们不去别的出口）
  settings.getState().set({ aiKey: FAKE_AI_KEY, aiKeyEnc: false })
  settings.getState().set({ githubToken: FAKE_GH_TOKEN, githubTokenEnc: false })
  settings.getState().set({ syncPassword: FAKE_SYNC_PASSWORD, syncPasswordEnc: false })
}

beforeEach(async () => {
  await Dexie.delete('yishu-workbench')
})

describe('D4 · 导出备份不含凭据', () => {
  it('导出 JSON 里出现不了任何凭据，且导出的表就是 32 张业务表 + 墓碑 + _meta', async () => {
    await boot()
    const { exportAllData } = await import('../services/data-admin')
    const { BUSINESS_TABLE_KEYS } = await import('../db/tables')

    const dump = await exportAllData()
    const json = JSON.stringify(dump)

    expect(json).not.toContain(FAKE_AI_KEY)
    expect(json).not.toContain(FAKE_GH_TOKEN)
    expect(json).not.toContain(FAKE_SYNC_PASSWORD)

    // 导出的键集合是**闭集**：多出一个键就是"有东西被顺手带出去了"
    const keys = Object.keys(dump).filter((k) => k !== '_meta' && k !== 'tombstones')
    expect(keys.sort()).toEqual([...BUSINESS_TABLE_KEYS].sort())
  })
})

describe('D5 · 同步快照只含业务数据', () => {
  it('快照明文与密文里都没有凭据', async () => {
    await boot()
    const { exportData } = await import('../sync/snapshot')
    const { deriveSyncKey, encryptSyncData, decryptSyncData } = await import('../sync/encryption/sync-crypto')

    const rows = await exportData()
    expect(JSON.stringify(rows)).not.toContain(FAKE_AI_KEY)
    expect(JSON.stringify(rows)).not.toContain(FAKE_GH_TOKEN)
    expect(JSON.stringify(rows)).not.toContain(FAKE_SYNC_PASSWORD)

    const key = await deriveSyncKey('whatever-password')
    const cipher = await encryptSyncData(key, { tables: rows })
    expect(cipher).not.toContain(FAKE_AI_KEY)
    // 密文解回来也不该有（即"没有通过编码/加密藏进去"）
    expect(JSON.stringify(await decryptSyncData(key, cipher))).not.toContain(FAKE_GH_TOKEN)
  })
})

describe('D3 · 设置同步行不含凭据', () => {
  it('appSettings 行里没有 aiKey / githubToken / syncPassword，但有 activePersonaId', async () => {
    await boot()
    settings.getState().set({ activePersonaId: 'p-1' })
    await settingsSync.__flushSyncedSettingsForTest()

    const row = await db.appSettings.get('settings')
    expect(row).toBeTruthy()
    const data = (row as unknown as { data: Record<string, unknown> }).data
    expect(data.aiKey).toBeUndefined()
    expect(data.githubToken).toBeUndefined()
    expect(data.syncPassword).toBeUndefined()
    // 白名单内的键要在（否则"该同步的没同步"）
    expect(data.activePersonaId).toBe('p-1')
    expect(JSON.stringify(data)).not.toContain(FAKE_AI_KEY)
    expect(JSON.stringify(data)).not.toContain(FAKE_GH_TOKEN)
  })
})

describe('D6 · Agent context 不含凭据、也不整份序列化设置', () => {
  it('buildContext 的输出里没有凭据', async () => {
    await boot()
    const { buildContext } = await import('../components/ai/context')
    const text = buildContext('我本月花了多少钱？今天有什么课？')
    expect(text).not.toContain(FAKE_AI_KEY)
    expect(text).not.toContain(FAKE_GH_TOKEN)
    expect(text).not.toContain(FAKE_SYNC_PASSWORD)
  })

  it('人设与记忆也不把设置带进来（上下文只读少数几个白名单字段）', async () => {
    await boot()
    const { buildAgentSystemPrompt } = await import('../services/persona/prompt')
    const { pickActivePersona } = await import('../services/persona/prompt')
    const { defaultWhaleGirlPersona } = await import('../services/persona/defaults')
    const text = buildAgentSystemPrompt(pickActivePersona([defaultWhaleGirlPersona('2026-09-01')], null), [])
    expect(text).not.toContain(FAKE_AI_KEY)
    expect(text).not.toContain(FAKE_GH_TOKEN)
  })

  it('**结构性守卫**：context 侧代码不得 `JSON.stringify(settings)` 之类整体序列化', () => {
    const mods = import.meta.glob('../components/ai/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >
    for (const [file, raw] of Object.entries(mods)) {
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, file).not.toMatch(/JSON\.stringify\(\s*useSettingsStore\.getState\(\)/)
      expect(code, file).not.toMatch(/\.\.\.useSettingsStore\.getState\(\)/)
      // 只允许按字段读取（getState().某字段），不允许整体 spread 进提示词
      expect(code, file).not.toMatch(/JSON\.stringify\([^)]*settings\b/)
    }
  })
})
