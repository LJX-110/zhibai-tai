/**
 * Dexie 数据库 —— IndexedDB schema
 * v1 → v2：新增 财(financeRecords/purchases/budgets) 与 项目(projects) 表，
 *          已有表保持不变（migration 不丢旧数据）
 * v2 → v3：新增 情报源 / 同步队列 / 同步元数据 / 加密密钥
 * v3 → v4：新增 冲突记录 / 活动轨迹 / 关注
 * v4 → v5：新增 删除墓碑（tombstones，让删除可跨设备传播）
 * v5 → v6：清理 9 处无效布尔索引（IndexedDB 不接受 boolean key，
 *          这些索引从建库起就是空的，本版重声明 schema 去掉布尔键）
 *
 * 所有版本均为纯增量或仅重建索引：不改动记录数据，升级不丢失任何旧数据。
 */
import Dexie, { type Table } from 'dexie'
import type {
  ActivityItem,
  AIResource,
  AppSettingsRow,
  BodyMetricDef,
  BodyMetricLog,
  Budget,
  Category,
  CollectionItem,
  ConflictRecord,
  Course,
  DivinationRecord,
  Exam,
  FinanceRecord,
  Follow,
  Habit,
  HabitLog,
  Homework,
  IntelligenceItem,
  IntelligenceSource,
  Note,
  PomodoroSession,
  Project,
  Purchase,
  SyncMeta,
  SyncQueueRecord,
  Task,
  Tombstone,
  WaterLog,
} from '../types/entities'

export class WorkbenchDB extends Dexie {
  tasks!: Table<Task, string>
  notes!: Table<Note, string>
  habits!: Table<Habit, string>
  habitLogs!: Table<HabitLog, string>
  bodyMetrics!: Table<BodyMetricDef, string>
  bodyMetricLogs!: Table<BodyMetricLog, string>
  waterLogs!: Table<WaterLog, string>
  pomodoroSessions!: Table<PomodoroSession, string>
  courses!: Table<Course, string>
  homeworks!: Table<Homework, string>
  exams!: Table<Exam, string>
  collectionItems!: Table<CollectionItem, string>
  intelligenceItems!: Table<IntelligenceItem, string>
  divinationRecords!: Table<DivinationRecord, string>
  aiResources!: Table<AIResource, string>

  // v0.2 新增
  financeRecords!: Table<FinanceRecord, string>
  purchases!: Table<Purchase, string>
  budgets!: Table<Budget, string>
  projects!: Table<Project, string>

  // v0.2.5 新增
  intelligenceSources!: Table<IntelligenceSource, string>
  syncQueue!: Table<SyncQueueRecord, string>
  syncMeta!: Table<SyncMeta, string>
  /** 本地加密密钥（AES-GCM，不可导出） */
  cryptoKeys!: Table<{ id: string; key: CryptoKey }, string>

  // v0.3 新增
  conflicts!: Table<ConflictRecord, string>
  activityItems!: Table<ActivityItem, string>
  follows!: Table<Follow, string>

  // v0.4 新增：墓碑表，让删除可在设备间传播
  tombstones!: Table<Tombstone, string>

  // v0.6 新增：分类（原存于设置项，无法同步）+ 参与同步的偏好设置单行表
  categories!: Table<Category, string>
  appSettings!: Table<AppSettingsRow, string>

  constructor() {
    super('yishu-workbench')
    this.version(1).stores({
      tasks: 'id, done, dueDate, priority, createdAt',
      notes: 'id, kind, pinned, createdAt',
      habits: 'id, order',
      habitLogs: 'id, habitId, date',
      bodyMetrics: 'id, order',
      bodyMetricLogs: 'id, metricId, date',
      waterLogs: 'id, date, createdAt',
      pomodoroSessions: 'id, startAt, courseId, taskId',
      courses: 'id',
      homeworks: 'id, courseId, done, dueDate',
      exams: 'id, courseId, date',
      collectionItems: 'id, type, favorite, createdAt',
      intelligenceItems: 'id, sourceType, favorite, publishedAt, read',
      divinationRecords: 'id, date, type',
      aiResources: 'id, type, enabled',
      journals: 'id, date',
    })
    // v0.2：仅新增表，不动 v1 表
    this.version(2).stores({
      financeRecords: 'id, kind, category, date, createdAt',
      purchases: 'id, category, date, createdAt',
      budgets: 'id, month',
      projects: 'id, status, favorite, updatedAt',
    })
    // v0.2.5：情报源 / 持久化同步队列 / 同步元数据 / 加密密钥（均为新增表）
    this.version(3).stores({
      intelligenceSources: 'id, provider, enabled, category',
      syncQueue: 'id, entity, ts',
      syncMeta: 'id',
      cryptoKeys: 'id',
    })
    // v0.3：冲突记录 / 活动轨迹 / 关注（均为新增表）
    this.version(4).stores({
      conflicts: 'id, entity, entityId, resolved, createdAt',
      activityItems: 'id, entityType, timestamp',
      follows: 'id, type, createdAt',
    })
    // v0.4：删除墓碑（仅新增表，不动既有结构）
    this.version(5).stores({
      tombstones: 'id, entity, entityId, deletedAt',
    })
    /* v0.5：清理 9 处无效布尔索引。
     * IndexedDB 不接受 boolean 类型的 key——这些字段（done/pinned/favorite/
     * read/enabled/resolved）建索引时被静默跳过，索引恒为空，属纯死重；
     * 全仓也没有任何 .where() 布尔查询（布尔过滤一律走内存 .filter）。
     * 本版本重声明各表 schema（去掉布尔键，其余索引原样保留），
     * Dexie 升级时只重建索引结构，不动任何记录。 */
    this.version(6).stores({
      tasks: 'id, dueDate, priority, createdAt',
      notes: 'id, kind, createdAt',
      homeworks: 'id, courseId, dueDate',
      collectionItems: 'id, type, createdAt',
      intelligenceItems: 'id, sourceType, publishedAt',
      aiResources: 'id, type',
      intelligenceSources: 'id, provider, category',
      conflicts: 'id, entity, entityId, createdAt',
    })
    /* v0.6：新增「分类」与「偏好设置」两张业务表（仅新增，不动既有结构）。
     * 分类此前只存在设置项里，从不参与同步；偏好设置此前也只有浏览器本地一份。
     * 两者注册进 BUSINESS_TABLES 后才真正进入快照、墓碑与备份链路。 */
    this.version(7).stores({
      categories: 'id, scope, order',
      appSettings: 'id',
    })
    /* 删除 journals 表：该表自建库起只有读取方（今日统计 / 成长曲线），
     * 全仓没有任何写入路径，数据恒为空数组 —— 属预留未落地的功能，故连同读写链路一并移除。
     * Dexie 删表必须在更高的版本号里显式声明 `表名: null`：直接删 v1 的索引既不会触发删除，
     * 又会篡改历史版本 schema（已装用户的旧库升级时不会真正删表）。 */
    this.version(8).stores({
      journals: null,
    })
  }
}

export const db = new WorkbenchDB()
