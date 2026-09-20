/**
 * 同步合并 —— LWW 合并与冲突检测、远端变化统计（全部为纯函数，不落库）
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：从 SyncService.ts 原样搬出，
 * SyncService.ts 仍从原路径 re-export，外部调用方无需改动。
 */
import { createId } from '../utils/id'
import type { ConflictRecord } from '../types/entities'
import { SYNC_TABLES, modifiedAt, type AnyRecord } from './snapshot'

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
