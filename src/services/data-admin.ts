/**
 * 数据管理基础设施 —— 全量导出 / 导入恢复 / 清空 / 各表行数
 *
 * ## 为什么立成 service，而不是让设置页直接碰 Dexie
 * 这四件事都是**跨表**的管理操作：以 `BUSINESS_TABLES`（表清单的单一事实源）为准遍历，
 * 且**清空必须成对写墓碑**。它们不适合套业务 store 工厂（那是"一张表一条记录"的 CRUD，
 * 会在 28 张表上写 28 次），但也不该让页面 `import { db }` ——
 * 页面只管"点了按钮之后要发生什么"，"怎么动数据库"属于服务层。
 *
 * ## 边界：本模块**只做数据库读写**
 * 文件下载、toast、store 重载都留在调用方 —— 那些是界面行为。
 * 混进来会让"清空"这类危险操作既难测、也难复用。
 *
 * ## ⚠️ 两条不能改的约定
 *  · **导出格式**（字段名 / `_meta` 结构 / 遍历顺序）与历史备份文件必须保持兼容 ——
 *    用户手里的旧备份要能导回来；
 *  · **墓碑**：删数据先写墓碑，否则本机清空后一次同步，远端快照会把数据原样加回来
 *    （用户眼里的"清空被撤销"）。
 */
import { APP_VERSION } from '../app/version'
import { db } from '../db/db'
import { BUSINESS_TABLES, TOMBSTONES } from '../db/tables'
import { markTombstones } from '../repositories/repo'
import { nowISO } from '../utils/id'

/** 备份文件的形状（键即表名；另有 `tombstones` 与 `_meta`）。**字段名不要改** */
export type BackupDump = Record<string, unknown>

/** 导出全部业务表 + 墓碑 + 元信息（遍历顺序即 `BUSINESS_TABLES` 的顺序） */
export async function exportAllData(): Promise<BackupDump> {
  const dump: BackupDump = {}
  for (const t of BUSINESS_TABLES) {
    dump[t.key] = await db.table(t.key).toArray()
  }
  dump.tombstones = await db.table(TOMBSTONES).toArray()
  dump._meta = {
    app: 'yishu-workbench',
    version: APP_VERSION,
    tables: BUSINESS_TABLES.length,
    exportedAt: nowISO(),
  }
  return dump
}

/**
 * 清空全部业务表。
 *
 * **每张表都要"先取主键、再清表、再写墓碑"** —— 顺序不能反，也不可省略最后一 步：
 * 否则本机清空后一次同步，远端快照会把数据原样加回来。
 * 墓碑本身**保留**：它承载"清空"这一事实的跨设备传播。
 * 冲突记录一并清空（本机表，不参与同步）。
 */
export async function clearAllData(): Promise<void> {
  for (const t of BUSINESS_TABLES) {
    const ids = (await db.table(t.key).toCollection().primaryKeys()) as string[]
    await db.table(t.key).clear()
    await markTombstones(t.key, ids)
  }
  await db.table('conflicts').clear()
}

/** 各业务表的行数（键用中文 label，直接进诊断文本） */
export async function getDataStats(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const t of BUSINESS_TABLES) {
    counts[t.label] = await db.table(t.key).count()
  }
  return counts
}

/**
 * 用备份**覆盖**写入业务表（破坏性：调用方必须先做好安全备份）。
 * 返回实际恢复了几张表（备份里为空的表也算"处理过"）。
 * 墓碑随备份一起恢复（若备份携带），保持删除意图一致。
 */
export async function importAllData(dump: BackupDump): Promise<number> {
  let restoredTables = 0
  for (const t of BUSINESS_TABLES) {
    const rows = dump[t.key]
    if (!Array.isArray(rows)) continue
    await db.table(t.key).clear()
    if (rows.length > 0) await db.table(t.key).bulkPut(rows as never[])
    restoredTables++
  }
  if (Array.isArray(dump.tombstones)) {
    await db.table(TOMBSTONES).clear()
    await db.table(TOMBSTONES).bulkPut(dump.tombstones as never[])
  }
  return restoredTables
}
