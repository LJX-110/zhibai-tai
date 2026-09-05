/**
 * 活动轨迹服务 —— 统一记录（引用不复制）
 * 上限控制：仅保留最近 600 条，避免无限增长
 */
import { db } from '../db/db'
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
  await db.activityItems.add({
    id: createId(),
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: now.toISOString(),
    title: input.title,
    metadata: input.metadata,
  })
  // 裁剪
  const count = await db.activityItems.count()
  if (count > MAX_ITEMS) {
    const oldest = await db.activityItems.orderBy('timestamp').limit(count - MAX_ITEMS).toArray()
    await db.activityItems.bulkDelete(oldest.map((o) => o.id))
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
