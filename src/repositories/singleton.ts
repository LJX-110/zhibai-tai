/**
 * 单行表仓储 —— 「整张表只存一行」的公共读写
 *
 * 偏好设置 / 桌宠状态 / 修行状态都是单行表（固定主键，随快照整行 LWW 同步）。
 * 此前除 `settings-repo` 外，几张单行表各写一份 read/write，结构**完全同形**、
 * 只在类型名上有差别 —— 这种重复最容易「一处修了另一处没修」，故收拢到这里。
 *
 * 语义由本文件统一持有，调用方只管业务默认值：
 *  1. **读不到就返回 null，绝不伪造一行** —— 否则只读一次就会凭空多出一条待同步记录；
 *  2. **建行由调用方给的工厂产出**（业务默认值不在这里猜），createdAt / updatedAt
 *     由仓储工厂在缺失时自动补，LWW 才有依据。
 */
import type { Table } from 'dexie'
import { createRepository, type Repository } from './repo'

export interface SingletonRepository<T extends { id: string }> {
  repo: Repository<T>
  /** 读那一行；从未落库时返回 null */
  read: () => Promise<T | null>
  /** 更新那一行（不存在则先按 `createEmpty` 建行再更新） */
  write: (patch: Partial<Omit<T, 'id'>>) => Promise<void>
}

export function createSingletonRepository<T extends { id: string }>(
  table: Table<T, string>,
  id: string,
  /** 首次落库时的完整默认行（业务默认值由调用方持有） */
  createEmpty: () => T,
): SingletonRepository<T> {
  const repo = createRepository<T>(table)
  return {
    repo,
    read: async () => (await repo.get(id)) ?? null,
    write: async (patch) => {
      const existing = await repo.get(id)
      if (!existing) await repo.put(createEmpty())
      await repo.update(id, patch)
    },
  }
}
