/**
 * 同步快照 —— 文件结构、参与同步的表、以及本机表数据的导出/写回
 *
 * 快照文件 data/workbench.json（版本化）：
 * {
 *   schemaVersion: 2,
 *   exportedAt,
 *   deviceId,
 *   ciphertext: base64(AES-GCM(PBKDF2(SyncPassword)))
 * }
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：从 SyncService.ts 原样搬出，
 * SyncService.ts 仍从原路径 re-export，外部调用方无需改动。
 */
import { db } from '../db/db'
import { BUSINESS_TABLE_KEYS, TOMBSTONES } from '../db/tables'
import { syncMetaRepo } from '../repositories/sync-repo'
import type { Tombstone } from '../types/entities'

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

export type AnyRecord = { id: string; updatedAt?: string; createdAt?: string }

/**
 * 只看本机、不参与跨设备比对的字段（「本机这次抓得怎么样」）。
 * 跟着快照走只会两台设备互相覆盖，还会凭空制造 LWW 冲突记录。
 * 策略：导出时剥离，写回本地时保留本机原值。
 */
const LOCAL_ONLY_FIELDS: Record<string, readonly string[]> = {
  // lastSuccessAt / failCount 同样是「本机这次抓得怎么样」：
  // 让它们跟着快照走，两台设备的失败计数会互相覆盖，A 机才失败一次、
  // B 机同步回来就变成失败 5 次，退避时间凭空变长
  intelligenceSources: ['lastFetchedAt', 'lastError', 'lastSuccessAt', 'failCount'],
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
export async function restoreLocalOnly(
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
export async function exportData(): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) {
    tables[t] = stripLocalOnly(t, await db.table(t).toArray())
  }
  tables[TOMBSTONES] = await db.table<Tombstone>(TOMBSTONES).toArray()
  return tables
}

/** 取（或首次生成）本机同步元信息：设备号 + 快照版本号 */
export async function ensureMeta(): Promise<{ deviceId: string; version: number }> {
  const existing = await syncMetaRepo.get('meta')
  if (existing) return { deviceId: existing.deviceId, version: existing.version }
  const deviceId = `dev-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
  const meta = { id: 'meta' as const, deviceId, version: 0, lastSyncedAt: null, lastPushedAt: null }
  await syncMetaRepo.put(meta)
  return { deviceId, version: 0 }
}
