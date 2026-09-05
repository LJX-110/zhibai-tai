/**
 * SyncService —— 多设备同步编排（v0.4）
 *
 * 快照文件 data/workbench.json（版本化）：
 * {
 *   schemaVersion: 2,
 *   exportedAt,
 *   deviceId,
 *   ciphertext: base64(AES-GCM(PBKDF2(SyncPassword)))
 * }
 *
 * 流程：解密远端 → LWW 合并 + 冲突检测 → 写回本地 → 重放墓碑删除 → 加密推送。
 * 同一 Sync Password 在任意设备推导同一密钥，可跨设备恢复。
 *
 * v0.4：快照新增 tombstones，删除首次成为可同步的事实。
 * 此前合并取双边并集，本地删除的记录会被远端快照原样加回。
 */
import { db } from '../db/db'
import { BUSINESS_TABLE_KEYS, TOMBSTONES, isBusinessTable } from '../db/tables'
import { GitHubSnapshotProvider } from './github/GithubSyncProvider'
import { syncMetaRepo, syncQueueRepo } from '../repositories/sync-repo'
import {
  decryptSyncData,
  deriveSyncKey,
  encryptSyncData,
} from './encryption/sync-crypto'
import { encryptor } from './encryption/encryption'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useSyncStore } from '../stores/useSyncStore'
import { reloadAllStores } from '../stores/reload'
import { createId } from '../utils/id'
import type { ConflictRecord, Tombstone } from '../types/entities'

/**
 * 参与同步的业务表。
 * 单一事实源来自 db/tables.ts，避免此前「同步 23 张 / 备份 10 张」的分裂。
 */
export const SYNC_TABLES: readonly string[] = BUSINESS_TABLE_KEYS

export interface SyncFile {
  schemaVersion: number
  exportedAt: string
  deviceId: string
  ciphertext: string
}

type AnyRecord = { id: string; updatedAt?: string; createdAt?: string }

export function modifiedAt(r: AnyRecord): number {
  const t = r.updatedAt ?? r.createdAt ?? 0
  return new Date(t).getTime() || 0
}

/** 导出本地数据（业务表 + 墓碑表） */
async function exportData(): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) {
    tables[t] = await db.table(t).toArray()
  }
  tables[TOMBSTONES] = await db.table<Tombstone>(TOMBSTONES).toArray()
  return tables
}

/**
 * 合并两方数据（LWW），检测冲突（纯函数，不落库）。
 * 冲突：某记录在本地与远端都被修改（晚于 lastSyncedAt）且内容不同。
 */
export function mergeAndDetectConflicts(
  local: Record<string, unknown[]>,
  remote: Record<string, unknown[]>,
  since: number,
): { merged: Record<string, unknown[]>; conflicts: ConflictRecord[] } {
  const merged: Record<string, unknown[]> = {}
  const conflicts: ConflictRecord[] = []

  for (const t of SYNC_TABLES) {
    const localRows = (local[t] ?? []) as AnyRecord[]
    const remoteRows = (remote[t] ?? []) as AnyRecord[]
    const map = new Map<string, AnyRecord>()
    for (const r of localRows) map.set(r.id, r)

    for (const r of remoteRows) {
      const existing = map.get(r.id)
      if (!existing) {
        map.set(r.id, r)
        continue
      }
      const localChanged = modifiedAt(existing) > since
      const remoteChanged = modifiedAt(r) > since
      const differ = JSON.stringify(existing) !== JSON.stringify(r)
      if (localChanged && remoteChanged && differ) {
        conflicts.push({
          id: createId(),
          entity: t,
          entityId: r.id,
          localTs: modifiedAt(existing),
          remoteTs: modifiedAt(r),
          local: existing,
          remote: r,
          resolved: false,
          createdAt: new Date().toISOString(),
        })
        // LWW：取较新者
        map.set(r.id, modifiedAt(r) >= modifiedAt(existing) ? r : existing)
      } else if (modifiedAt(r) > modifiedAt(existing)) {
        map.set(r.id, r)
      }
    }
    merged[t] = [...map.values()]
  }

  return { merged, conflicts }
}

/**
 * 合并墓碑：同一条记录被多端删除时取较晚的删除时刻。
 * 墓碑只增不减，由 pruneTombstones 统一过期清理。
 */
export function mergeTombstones(
  local: Tombstone[],
  remote: Tombstone[],
): Tombstone[] {
  const map = new Map<string, Tombstone>()
  for (const t of [...local, ...remote]) {
    if (!t?.id || !isBusinessTable(t.entity)) continue
    const prev = map.get(t.id)
    if (!prev || new Date(t.deletedAt).getTime() > new Date(prev.deletedAt).getTime()) {
      map.set(t.id, t)
    }
  }
  return [...map.values()]
}

/** 墓碑保留期：超过此天数的删除标记视为已扩散到所有常用设备 */
const TOMBSTONE_TTL_DAYS = 180

export function pruneTombstones(tombstones: Tombstone[]): Tombstone[] {
  const deadline = Date.now() - TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000
  return tombstones.filter((t) => new Date(t.deletedAt).getTime() >= deadline)
}

/**
 * 重放删除：按墓碑清掉本地仍存在的记录。
 *
 * 关键判定 —— 只删除「删除时刻晚于记录最后修改时刻」的行。
 * 若某记录在 A 端删除后，B 端又编辑过它（updatedAt 更晚），
 * 说明用户意图是"删错了又改回来"，此时保留该记录并撤销墓碑。
 *
 * @returns 需要保留（未被撤销）的墓碑
 */
async function applyTombstones(tombstones: Tombstone[]): Promise<Tombstone[]> {
  if (tombstones.length === 0) return []

  // 按表聚合：entity -> (entityId -> 最晚删除时刻)
  const byEntity = new Map<string, Map<string, number>>()
  for (const t of tombstones) {
    if (!isBusinessTable(t.entity)) continue
    let m = byEntity.get(t.entity)
    if (!m) {
      m = new Map<string, number>()
      byEntity.set(t.entity, m)
    }
    const ts = new Date(t.deletedAt).getTime()
    const prev = m.get(t.entityId) ?? 0
    if (ts > prev) m.set(t.entityId, ts)
  }

  const kept: Tombstone[] = []
  for (const [entity, idMap] of byEntity) {
    const ids = [...idMap.keys()]
    const table = db.table<{ id: string; updatedAt?: string; createdAt?: string }>(entity)
    const rows = await table.where('id').anyOf(ids).toArray()
    const doomed: string[] = []
    const survived = new Set<string>()
    for (const row of rows) {
      const deletedAtMs = idMap.get(row.id) ?? 0
      if (modifiedAt(row) <= deletedAtMs) doomed.push(row.id)
      else survived.add(row.id)
    }
    if (doomed.length > 0) await table.bulkDelete(doomed)
    for (const t of tombstones) {
      if (t.entity !== entity) continue
      if (survived.has(t.entityId)) continue // 删除后被重新修改 → 撤销墓碑
      kept.push(t)
    }
  }
  return kept
}

async function ensureMeta(): Promise<{ deviceId: string; version: number }> {
  const existing = await syncMetaRepo.get('meta')
  if (existing) return { deviceId: existing.deviceId, version: existing.version }
  const deviceId = `dev-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
  const meta = { id: 'meta' as const, deviceId, version: 0, lastSyncedAt: null, lastPushedAt: null }
  await syncMetaRepo.put(meta)
  return { deviceId, version: 0 }
}

export interface SyncRunResult {
  ok: boolean
  pulled: number
  pushed: number
  conflicts: number
  message?: string
}

/**
 * 执行一次完整同步。
 * 远端快照刚被其他设备更新（sha 竞争）时，整体重跑一次"拉取-合并-推送"：
 * 重跑会拿到对方的最新快照重新合并，保证双方数据都不丢；仅重试一次，避免无限循环。
 */
export async function runSync(): Promise<SyncRunResult> {
  try {
    return await runSyncOnce()
  } catch (e) {
    if (e instanceof Error && e.message.includes('远端快照正被其他设备更新')) {
      return runSyncOnce()
    }
    throw e
  }
}

async function runSyncOnce(): Promise<SyncRunResult> {
  const settings = useSettingsStore.getState()
  const repo = (settings.githubRepo ?? '').trim()
  const rawToken = (settings.githubToken ?? '').trim()
  const branch = (settings.githubBranch ?? 'main').trim() || 'main'
  // 解密：Token 与 Sync Password 均经设备本地密钥加密存储
  const token = settings.githubTokenEnc ? await encryptor.decrypt(rawToken) : rawToken
  const rawPassword = (settings.syncPassword ?? '').trim()
  const password = settings.syncPasswordEnc ? await encryptor.decrypt(rawPassword) : rawPassword

  if (!repo || !token) throw new Error('请先配置 GitHub 仓库与 Token')
  if (!password) throw new Error('请设置 Sync Password（用于数据加密）')
  if (!isCryptoReady()) throw new Error('当前环境不支持 Web Crypto，无法同步')

  settings.set({ syncStatus: 'syncing', syncError: undefined })
  const provider = new GitHubSnapshotProvider(repo, token, branch)

  try {
    const { deviceId } = await ensureMeta()
    const meta = (await syncMetaRepo.get('meta'))!
    const since = meta.lastSyncedAt ? new Date(meta.lastSyncedAt).getTime() : 0

    const key = await deriveSyncKey(password)
    const local = await exportData()

    // 拉远端（解密）
    const remoteFile = await provider.readSyncFile()
    let remote: Record<string, unknown[]> | null = null
    if (remoteFile) {
      const decrypted = (await decryptSyncData(key, remoteFile.ciphertext)) as {
        tables?: Record<string, unknown[]>
      }
      remote = decrypted.tables ?? null
    }

    // 合并 + 冲突检测（纯函数）
    const { merged, conflicts } = remote
      ? mergeAndDetectConflicts(local, remote, since)
      : { merged: local, conflicts: [] }
    if (conflicts.length > 0) {
      await db.conflicts.bulkPut(conflicts)
    }

    // 墓碑合并：删除标记同样走 LWW（同一记录取较晚的删除时刻）
    const mergedTombstones = remote
      ? mergeTombstones(
          (local[TOMBSTONES] ?? []) as Tombstone[],
          (remote[TOMBSTONES] ?? []) as Tombstone[],
        )
      : ((local[TOMBSTONES] ?? []) as Tombstone[])

    // 写回本地（并集）
    for (const t of SYNC_TABLES) {
      const rows = merged[t]
      if (rows && rows.length > 0) await db.table(t).bulkPut(rows as never[])
    }

    // 重放删除：必须在并集写回之后执行，否则被删记录会被远端副本复活
    const liveTombstones = pruneTombstones(
      await applyTombstones(mergedTombstones),
    )
    const tombstoneTable = db.table<Tombstone>(TOMBSTONES)
    await tombstoneTable.clear()
    if (liveTombstones.length > 0) await tombstoneTable.bulkPut(liveTombstones)
    merged[TOMBSTONES] = liveTombstones

    // 加密推送
    const syncFile: SyncFile = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      deviceId,
      ciphertext: await encryptSyncData(key, { tables: merged }),
    }
    await provider.writeSyncFile(syncFile)

    const pushedRows = Object.values(merged).reduce((s, a) => s + a.length, 0)
    const now = new Date().toISOString()
    await syncMetaRepo.put({
      id: 'meta',
      deviceId,
      version: (meta.version ?? 0) + 1,
      lastSyncedAt: now,
      lastPushedAt: now,
    })
    await syncQueueRepo.clear()
    await reloadAllStores()
    await useSyncStore.getState().refresh()

    settings.set({ syncStatus: 'success', lastSyncedAt: now })
    return {
      ok: true,
      pulled: remote ? Object.values(remote).reduce((s, a) => s + a.length, 0) : 0,
      pushed: pushedRows,
      conflicts: conflicts.length,
      message: remote ? '已合并远端并推送' : '首次同步完成',
    }
  } catch (e) {
    settings.set({ syncStatus: 'error', syncError: e instanceof Error ? e.message : '同步失败' })
    throw e
  }
}

function isCryptoReady(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}
