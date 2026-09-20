/**
 * 分类 store —— 情报 / 藏阁共用
 *
 * 分类是业务数据（要跨设备一致），因此走业务表而不是设置项：
 * 注册进 BUSINESS_TABLES 后自动获得墓碑 + LWW 合并 + 加密快照同步 + 备份导出。
 * 组件只读 store，增删一律经下面这组动作，保证落库与同步触发不遗漏。
 *
 * 幂等唯一键：id = `${scope}::${name}`（组合主键）。
 * 早年用随机 id 是重大缺陷：同名分类跨设备 id 不同，同步合并成两条
 * （界面重复）、按 id 删除只删一条（永远删不干净）、墓碑也覆盖不到
 * 别名副本（删除无法跨设备传播）。组合主键让"同 scope 同名称"在
 * 任意设备收敛为同一条记录，上述问题从根上消失。
 */
import { createCrudStore } from './factory'
import { categoryRepo } from '../repositories/category-repo'
import { db } from '../db/db'
import type { Category, CategoryScope } from '../types/entities'
import { DEFAULT_CATEGORIES, LEGACY_COLLECTION_CATEGORIES, legacyCategoryNames } from '../services/categories'

export const useCategoryStore = createCrudStore<Category>(categoryRepo)

/** 组合主键：同 scope + 同名称在任意设备是同一记录（幂等增删/合并/墓碑的前提） */
export function categoryId(scope: CategoryScope, name: string): string {
  return `${scope}::${name}`
}

/** 取某体系的分类名（按排序位；派生数据在组件体内计算，不进 selector） */
export function categoryNames(items: Category[], scope: CategoryScope): string[] {
  return items
    .filter((c) => c.scope === scope)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.name)
}

export async function addCategory(scope: CategoryScope, name: string): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false
  const st = useCategoryStore.getState()
  if (!st.loaded) await st.load()
  // 查重必须落到 IndexedDB：此前只看 store.items 内存快照，
  // 快速连点时第二次点击在 await 前读到的还是旧列表，同名被建出两条。
  // 组合主键下即使并发，put 也会收敛为同一条。
  if (await db.categories.get(categoryId(scope, trimmed))) return false
  const items = useCategoryStore.getState().items
  const order = items
    .filter((c) => c.scope === scope)
    .reduce((max, c) => Math.max(max, c.order), 0) + 1
  const now = new Date().toISOString()
  return useCategoryStore.getState().add({
    id: categoryId(scope, trimmed),
    scope,
    name: trimmed,
    order,
    createdAt: now,
    updatedAt: now,
  })
}

export async function removeCategory(scope: CategoryScope, name: string): Promise<boolean> {
  const hit = await db.categories.get(categoryId(scope, name))
  if (!hit) return false
  return useCategoryStore.getState().remove(hit.id)
}

/** 恢复默认：清掉该体系全部分类（走墓碑，删除同样会同步到其他设备）后重新播种 */
export async function resetCategories(scope: CategoryScope): Promise<void> {
  const items = useCategoryStore.getState().items.filter((c) => c.scope === scope)
  for (const c of items) {
    await useCategoryStore.getState().remove(c.id)
  }
  await seedCategories(scope)
}

/**
 * 幂等播种：该体系一条分类都没有时，写入默认清单。
 * 同时把旧版本存在设置项里的自定义分类一并补进来，升级不丢分类。
 */
export async function seedCategories(scope: CategoryScope): Promise<void> {
  const st = useCategoryStore.getState()
  if (!st.loaded) await st.load()
  if (useCategoryStore.getState().items.some((c) => c.scope === scope)) return
  const names = [...new Set([...DEFAULT_CATEGORIES[scope], ...legacyCategoryNames(scope)])]
  const now = new Date().toISOString()
  await useCategoryStore.getState().saveMany(
    names.map((name, i) => ({
      id: categoryId(scope, name),
      scope,
      name,
      order: i,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

/** 各体系各自补齐默认分类（启动时调用一次；先纠偏旧 id 再播种） */
export async function seedAllCategories(): Promise<void> {
  // 纠正旧版随机 id 会造成"重复/删不掉/不同步"，必须在读取分类前收敛
  await migrateCategoryIds()
  await seedCategories('intel')
  await seedCategories('collection')
  // 术的类型数据化：内置 7 类从这里播种；「ai」分类行已从界面移除，不再播种
  await seedCategories('ai_type')
  await migrateCollectionCategoryNames()
}

/**
 * 一次性迁移：藏阁分类的旧默认清单与「类型」重名 7 项，界面上无法分辨。
 * 只在用户**原封未动**（当前分类集合恰好等于旧默认集合）时替换成新的用途词，
 * 自己增删过的一律不动 —— 迁移不该覆盖用户已经做出的选择。
 * 走 remove/saveMany，即经 repo 工厂写墓碑，删除会同步到其他设备。
 */
export async function migrateCollectionCategoryNames(): Promise<boolean> {
  const st = useCategoryStore.getState()
  if (!st.loaded) await st.load()
  const current = categoryNames(useCategoryStore.getState().items, 'collection')
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')
  if (!sameSet(current, LEGACY_COLLECTION_CATEGORIES)) return false

  for (const c of useCategoryStore.getState().items.filter((x) => x.scope === 'collection')) {
    await useCategoryStore.getState().remove(c.id)
  }
  const now = new Date().toISOString()
  await useCategoryStore.getState().saveMany(
    DEFAULT_CATEGORIES.collection.map((name, i) => ({
      id: categoryId('collection', name),
      scope: 'collection' as const,
      name,
      order: i,
      createdAt: now,
      updatedAt: now,
    })),
  )
  return true
}

/**
 * 一次性数据纠偏：把早期随机 id 的分类记录收敛为组合主键。
 * 组合主键落地之前的存量数据（可能多端上传过随机 id 副本）需要收敛，
 * 否则旧的重复副本会继续制造"重复/删不掉"。同 scope 同名取 updatedAt 最新
 * 者为留存（写入组合主键），其余副本删除并写墓碑（删除跨设备传播，各端清一遍）。
 */
export async function migrateCategoryIds(): Promise<number> {
  const rows = await db.categories.toArray()
  if (rows.length === 0) return 0

  // 按 (scope,name) 聚合，选出 §updatedAt 最新 的留存行
  const keepById = new Map<string, Category>() // key -> 留存行
  for (const c of rows) {
    const key = categoryId(c.scope, c.name)
    const prev = keepById.get(key)
    if (!prev || (c.updatedAt ?? '') > (prev.updatedAt ?? '')) keepById.set(key, c)
  }

  const st = useCategoryStore.getState()
  let changed = 0
  for (const c of rows) {
    const key = categoryId(c.scope, c.name)
    const winner = keepById.get(key)!
    if (c.id === winner.id && c.id === key) continue // 已是组合主键的留存行，不动
    if (c.id === winner.id) {
      // 留存行但 id 还是随机值：重写为组合主键（先 remove 走墓碑，再 add）
      await st.remove(c.id)
      await st.add({ ...winner, id: key, updatedAt: new Date().toISOString() })
      changed++
    } else {
      // 非留存副本：直接删除（墓碑由 remove 写入），避免界面重复
      await st.remove(c.id)
      changed++
    }
  }
  return changed
}