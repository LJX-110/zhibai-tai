/**
 * 墓碑（删除标记）—— 合并、过期清理、重放删除
 *
 * 快照新增 tombstones 后，删除首次成为可同步的事实：
 * 此前合并取双边并集，本地删除的记录会被远端快照原样加回。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：从 SyncService.ts 原样搬出，
 * SyncService.ts 仍从原路径 re-export，外部调用方无需改动。
 */
import { db } from '../db/db'
import { isBusinessTable } from '../db/tables'
import type { Tombstone } from '../types/entities'
import { modifiedAt } from './snapshot'

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
 * @returns kept：需要保留（未被撤销）的墓碑；doomedIds：实际被删除的 表内记录id 列表
 */
export async function applyTombstones(
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
