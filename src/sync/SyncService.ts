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
import { BUSINESS_TABLES, BUSINESS_TABLE_KEYS, TOMBSTONES, isBusinessTable } from '../db/tables'
import { GitHubSnapshotProvider } from './github/GithubSyncProvider'
import { GistSnapshotProvider } from './gist/GistSyncProvider'
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

/**
 * 只看本机、不参与跨设备比对的字段（「本机这次抓得怎么样」）。
 * 跟着快照走只会两台设备互相覆盖，还会凭空制造 LWW 冲突记录。
 * 策略：导出时剥离，写回本地时保留本机原值。
 */
const LOCAL_ONLY_FIELDS: Record<string, readonly string[]> = {
  intelligenceSources: ['lastFetchedAt', 'lastError'],
}

/** 导出前剥离本机独有字段（纯函数，便于单测） */
export function stripLocalOnly(table: string, rows: unknown[]): unknown[] {
  const fields = LOCAL_ONLY_FIELDS[table]
  if (!fields || rows.length === 0) return rows
  return rows.map((row) => {
    const copy = { ...(row as Record<string, unknown>) }
    for (const f of fields) delete copy[f]
    return copy
  })
}

/** 写回本地前，把本机独有的字段值还原回来（远端快照里这些字段不该覆盖本机） */
async function restoreLocalOnly(
  table: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const fields = LOCAL_ONLY_FIELDS[table]
  if (!fields || rows.length === 0) return rows
  const ids = rows.map((r) => String(r.id))
  const localRows = await db
    .table<Record<string, unknown>, string>(table)
    .where('id')
    .anyOf(ids)
    .toArray()
  const byId = new Map(localRows.map((r) => [String(r.id), r]))
  return rows.map((row) => {
    const local = byId.get(String(row.id))
    if (!local) return row
    const next = { ...row }
    for (const f of fields) {
      if (local[f] !== undefined) next[f] = local[f]
      else delete next[f]
    }
    return next
  })
}

export function modifiedAt(r: AnyRecord): number {
  const t = r.updatedAt ?? r.createdAt ?? 0
  return new Date(t).getTime() || 0
}

/** 导出本地数据（业务表 + 墓碑表） */
async function exportData(): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) {
    tables[t] = stripLocalOnly(t, await db.table(t).toArray())
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

/** 本次同步「远端带来」的变化统计（纯函数）：
 *  added=远端有、本地无；updated=两边都有但内容不同。
 *  此前直接把远端快照记录总数当「拉取 N 条」，两台设备数据本就一致时
 *  也会显示一个很大的数字，用户以为拉到了新数据其实没有任何变化。 */
export interface ImportDiff {
  added: number
  updated: number
  byTable: { table: string; added: number; updated: number }[]
}

export function diffRemoteImports(
  local: Record<string, unknown[]>,
  remote: Record<string, unknown[]>,
): ImportDiff {
  let added = 0
  let updated = 0
  const hint: Record<string, { added: number; updated: number }> = {}
  for (const t of SYNC_TABLES) {
    const localRows = (local[t] ?? []) as AnyRecord[]
    const remoteRows = (remote[t] ?? []) as AnyRecord[]
    const localMap = new Map(localRows.map((r) => [r.id, r]))
    let ta = 0
    let tu = 0
    for (const r of remoteRows) {
      const l = localMap.get(r.id)
      if (!l) {
        ta++
        continue
      }
      if (JSON.stringify(l) !== JSON.stringify(r)) tu++
    }
    if (ta > 0 || tu > 0) hint[t] = { added: ta, updated: tu }
    added += ta
    updated += tu
  }
  const byTable = Object.entries(hint)
    .map(([table, v]) => ({ table, ...v }))
    .sort((a, b) => b.added + b.updated - (a.added + a.updated))
    .slice(0, 3)
  return { added, updated, byTable }
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
 * @returns kept：需要保留（未被撤销）的墓碑；doomedIds：实际被删除的 表内记录id 列表
 */
async function applyTombstones(
  tombstones: Tombstone[],
): Promise<{ kept: Tombstone[]; doomedIds: string[] }> {
  if (tombstones.length === 0) return { kept: [], doomedIds: [] }

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
  const doomedIds: string[] = []
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
    doomedIds.push(...doomed.map((id) => `${entity}:${id}`))
    for (const t of tombstones) {
      if (t.entity !== entity) continue
      if (survived.has(t.entityId)) continue // 删除后被重新修改 → 撤销墓碑
      kept.push(t)
    }
  }
  return { kept, doomedIds }
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

/** 同步并发锁：手动 + 自动同步可能同时触发，合并/推送须串行（模块级单例） */
let syncInFlight = false

/**
 * 执行一次完整同步。
 * 远端快照刚被其他设备更新（sha 竞争）时，整体重跑一次"拉取-合并-推送"：
 * 重跑会拿到对方的最新快照重新合并，保证双方数据都不丢；仅重试一次，避免无限循环。
 */
export async function runSync(): Promise<SyncRunResult> {
  if (syncInFlight) {
    return { ok: true, pulled: 0, pushed: 0, conflicts: 0, message: '同步进行中，已跳过本次' }
  }
  syncInFlight = true
  try {
    try {
      return await runSyncOnce()
    } catch (e) {
      if (e instanceof Error && e.message.includes('远端快照正被其他设备更新')) {
        return runSyncOnce()
      }
      throw e
    }
  } finally {
    syncInFlight = false
  }
}

async function runSyncOnce(): Promise<SyncRunResult> {
  const settings = useSettingsStore.getState()
  const rawPassword = (settings.syncPassword ?? '').trim()
  const password = settings.syncPasswordEnc ? await encryptor.decrypt(rawPassword) : rawPassword
  if (!password) {
    // 配置缺失类失败同样落状态，供设置页状态行/错误文本展示
    settings.set({ syncStatus: 'error', syncError: '请设置 Sync Password（用于数据加密）' })
    throw new Error('请设置 Sync Password（用于数据加密）')
  }
  if (!isCryptoReady()) throw new Error('当前环境不支持 Web Crypto，无法同步')

  // 同步模式：gist=云笺轻量（Token 一项 + 自动建 Gist） repo=私有仓库完整
  const mode = settings.syncMode ?? 'repo'
  let provider: { readSyncFile(): Promise<SyncFile | null>; writeSyncFile(f: SyncFile): Promise<void> }
  if (mode === 'gist') {
    const rawG = (settings.gistToken ?? '').trim()
    const gistToken = settings.gistTokenEnc ? await encryptor.decrypt(rawG) : rawG
    if (!gistToken) {
      settings.set({ syncStatus: 'error', syncError: '请先配置 Gist Token（仅需 gist 权限）' })
      throw new Error('请先配置 Gist Token（仅需 gist 权限）')
    }
    settings.set({ syncStatus: 'syncing', syncError: undefined })
    provider = new GistSnapshotProvider(
      gistToken,
      settings.gistId ?? '',
      (id) => useSettingsStore.getState().set({ gistId: id }),
      settings.corsProxyUrl,
    )
  } else {
    const repo = (settings.githubRepo ?? '').trim()
    const rawToken = (settings.githubToken ?? '').trim()
    const branch = (settings.githubBranch ?? 'main').trim() || 'main'
    const token = settings.githubTokenEnc ? await encryptor.decrypt(rawToken) : rawToken
    if (!repo || !token) {
      settings.set({ syncStatus: 'error', syncError: '请先配置 GitHub 仓库与 Token' })
      throw new Error('请先配置 GitHub 仓库与 Token')
    }
    settings.set({ syncStatus: 'syncing', syncError: undefined })
    provider = new GitHubSnapshotProvider(repo, token, branch)
  }

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
      // 快照版本不匹配时拒绝静默当作"远端为空"：否则会用本地-only 快照
      // 覆盖推送，其他设备的数据面临被覆盖风险且无提示
      if (remoteFile.schemaVersion !== 2) {
        throw new Error(`远端快照版本不兼容（v${remoteFile.schemaVersion}，本应用支持 v2），请升级应用或检查同步目标`)
      }
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

    // 写回本地（并集）；本机独有的字段（抓取状态等）以本机为准
    for (const t of SYNC_TABLES) {
      const rows = merged[t]
      if (rows && rows.length > 0) {
        const restored = await restoreLocalOnly(t, rows as Record<string, unknown>[])
        await db.table(t).bulkPut(restored as never[])
      }
    }

    // 重放删除：必须在并集写回之后执行，否则被删记录会被远端副本复活
    const { kept, doomedIds } = await applyTombstones(mergedTombstones)
    const liveTombstones = pruneTombstones(kept)
    const tombstoneTable = db.table<Tombstone>(TOMBSTONES)
    await tombstoneTable.clear()
    if (liveTombstones.length > 0) await tombstoneTable.bulkPut(liveTombstones)
    merged[TOMBSTONES] = liveTombstones

    // 已删除的记录从推送快照中移除（此前只删本地、快照仍残留，
    // 云端密文随删除无限膨胀）。合并对象里残留的行一并剔除。
    if (doomedIds.length > 0) {
      const doomedSet = new Set(doomedIds)
      for (const t of SYNC_TABLES) {
        const rows = (merged[t] ?? []) as { id: string }[]
        merged[t] = rows.filter((r) => !doomedSet.has(`${t}:${r.id}`))
      }
    }

    // 加密推送
    const syncFile: SyncFile = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      deviceId,
      ciphertext: await encryptSyncData(key, { tables: merged }),
    }
    await provider.writeSyncFile(syncFile)

    // 「远端带来」的真实变化（此前把快照记录总数当拉取量，数字大却无新增，误导用户）
    const diff = remote ? diffRemoteImports(local, remote) : null
    const changed = (diff?.added ?? 0) + (diff?.updated ?? 0)
    const tableDetail =
      diff && diff.byTable.length > 0
        ? `（${diff.byTable
            .map((b) => `${BUSINESS_TABLES.find((t) => t.key === b.table)?.label ?? b.table} 增${b.added}·改${b.updated}`)
            .join('，')}）`
        : ''
    const message = !remote
      ? '首次同步完成'
      : changed > 0
        ? `已合并远端：新增 ${diff!.added} · 更新 ${diff!.updated}${doomedIds.length > 0 ? ` · 清理 ${doomedIds.length} 条已删` : ''}${tableDetail}`
        : doomedIds.length > 0
          ? `已同步，清理 ${doomedIds.length} 条已删记录`
          : '已同步，本地与远端一致，无新增'

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
      pulled: changed,
      pushed: pushedRows,
      conflicts: conflicts.length,
      message,
    }
  } catch (e) {
    settings.set({ syncStatus: 'error', syncError: e instanceof Error ? e.message : '同步失败' })
    throw e
  }
}

function isCryptoReady(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}
