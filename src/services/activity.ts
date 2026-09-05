/**
 * 活动轨迹服务 —— 统一记录（引用不复制）
 * 上限控制：仅保留最近 600 条，避免无限增长
 */
import { db } from '../db/db'
import { activityRepo } from '../repositories/activity-repo'
import { markTombstones } from '../repositories/repo'
import { createId } from '../utils/id'
import type { ActivityType } from '../types/entities'

const MAX_ITEMS = 600

export interface RecordActivityInput {
  entityType: ActivityType
  entityId: string
  title: string
  metadata?: string
}

/** 记录一条活动（去抖：同一实体同一标题 60s 内不重复） */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const now = new Date()
  const last = await db.activityItems
    .where('entityType')
    .equals(input.entityType)
    .reverse()
    .first()
  if (last && last.entityId === input.entityId && last.title === input.title) {
    const lastTs = new Date(last.timestamp).getTime()
    if (now.getTime() - lastTs < 60_000) return
  }
  // 必须经 repo 落库：补 createdAt/updatedAt（LWW 依据，项目硬性约定），
  // 此前直写表导致活动记录无时间戳、同步合并行为不可预期
  await activityRepo.put({
    id: createId(),
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: now.toISOString(),
    title: input.title,
    metadata: input.metadata,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
  // 裁剪：删除须写墓碑，否则下次同步会被远端快照原样加回（上限失效）
  const count = await db.activityItems.count()
  if (count > MAX_ITEMS) {
    const oldest = await db.activityItems.orderBy('timestamp').limit(count - MAX_ITEMS).toArray()
    const ids = oldest.map((o) => o.id)
    await db.transaction('rw', db.activityItems, db.tombstones, async () => {
      await markTombstones('activityItems', ids)
      await db.activityItems.bulkDelete(ids)
    })
  }
}

/** 按日期取活动（倒序） */
export async function listActivities(limit = 30): Promise<{ timestamp: string; title: string; entityType: ActivityType; entityId: string; metadata?: string }[]> {
  const items = await db.activityItems.orderBy('timestamp').reverse().limit(limit).toArray()
  return items.map((i) => ({
    timestamp: i.timestamp,
    title: i.title,
    entityType: i.entityType,
    entityId: i.entityId,
    metadata: i.metadata,
  }))
}
