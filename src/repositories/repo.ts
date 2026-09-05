/**
 * Repository 工厂 —— 通用 CRUD 数据访问层
 *
 * 两个正确性保证：
 *  1. 业务表删除在同一事务内写墓碑，删除才能跨设备传播；
 *  2. 业务表写入自动补 createdAt/updatedAt（仅缺失时补），LWW 合并才有依据。
 * 非业务表（同步基础设施）自动跳过，按 table.name 判定，调用点无需关心。
 */
import type { Table, UpdateSpec } from 'dexie'
import { db } from '../db/db'
import { isBusinessTable, TOMBSTONES } from '../db/tables'
import type { Tombstone } from '../types/entities'

export interface Repository<T extends { id: string }> {
  list: () => Promise<T[]>
  get: (id: string) => Promise<T | undefined>
  put: (item: T) => Promise<string>
  /** 批量新增或覆盖（抓取/导入等批量场景，一次事务写入） */
  putMany: (items: T[]) => Promise<string>
  /** 更新非主键字段（业务表会自动刷新 updatedAt，供 LWW 判定） */
  update: (id: string, changes: Partial<Omit<T, 'id'>>) => Promise<number>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

/** 墓碑主键：`表名:记录id`，同一记录重复删除只留一条 */
export function tombstoneId(entity: string, entityId: string): string {
  return `${entity}:${entityId}`
}

/** 批量写墓碑。同步层回放删除、批量删除共用此函数。 */
export async function markTombstones(
  entity: string,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length === 0) return
  const deletedAt = new Date().toISOString()
  const rows: Tombstone[] = entityIds.map((entityId) => ({
    id: tombstoneId(entity, entityId),
    entity,
    entityId,
    deletedAt,
  }))
  await db.table<Tombstone, string>(TOMBSTONES).bulkPut(rows)
}

function nowIso(): string {
  return new Date().toISOString()
}

/** 补齐缺失的时间戳；已有值不动，保留业务自己写入的语义 */
function stampOnWrite<T>(item: T): T {
  const rec = item as unknown as Record<string, unknown>
  const now = nowIso()
  if (rec['createdAt'] === undefined) rec['createdAt'] = now
  if (rec['updatedAt'] === undefined) rec['updatedAt'] = now
  return item
}

/** update 必然是一次修改，强制刷新 updatedAt */
function withUpdatedAt<T>(
  changes: Partial<Omit<T, 'id'>>,
): Partial<Omit<T, 'id'>> {
  const rec = { ...changes } as unknown as Record<string, unknown>
  rec['updatedAt'] = nowIso()
  return rec as unknown as Partial<Omit<T, 'id'>>
}

/**
 * @param table Dexie 表对象。表名用于判定是否属于业务表（同步/墓碑范围），
 *              因此调用方无需额外传名字，17 处调用点保持原样。
 */
export function createRepository<T extends { id: string }>(
  table: Table<T, string>,
): Repository<T> {
  const entity = table.name
  const tracked = isBusinessTable(entity)

  return {
    list: () => table.toArray(),
    get: (id) => table.get(id),
    put: (item) => table.put(tracked ? stampOnWrite(item) : item),
    putMany: (items) =>
      table.bulkPut(items.map((it) => (tracked ? stampOnWrite(it) : it))),
    // Dexie 的 UpdateSpec 类型较严格，此处仅一处边界转换
    update: (id, changes) =>
      table.update(
        id,
        (tracked ? withUpdatedAt(changes) : changes) as unknown as UpdateSpec<T>,
      ),
    remove: async (id) => {
      if (!tracked) {
        await table.delete(id)
        return
      }
      // 删除与墓碑写入同一事务：要么都成，要么都不成，
      // 避免出现"本地已删但墓碑没写"导致同步后被远端复活。
      await db.transaction('rw', table, db.tombstones, async () => {
        await table.delete(id)
        await markTombstones(entity, [id])
      })
    },
    clear: async () => {
      if (!tracked) {
        await table.clear()
        return
      }
      await db.transaction('rw', table, db.tombstones, async () => {
        const ids = (await table.toCollection().primaryKeys()) as string[]
        await table.clear()
        await markTombstones(entity, ids)
      })
    },
  }
}
