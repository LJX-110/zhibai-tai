/**
 * 领域实体类型 —— 全部业务数据模型的单一事实源
 *
 * 时间戳约定：业务实体均带 createdAt / updatedAt，
 * 多设备同步（LWW 合并）依赖它判定新旧；早期记录可能缺失，故字段可选。
 */

export type ID = string

export type Priority = 'low' | 'mid' | 'high'
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

/** 待办 */
export interface Task {
  id: ID
  title: string
  description?: string
  done: boolean
  priority: Priority
  /** 截止日期 yyyy-mm-dd */
  dueDate?: string | null
  tags: string[]
  repeat: Repeat
  /** 每月固定日提醒（1-31，如每月 27 号交话费） */
  monthlyDay?: number | null
  /** 关联项目 / 关联课程 */
  projectId?: ID | null
  courseId?: ID | null
  createdAt: string
  updatedAt: string
  completedAt?: string | null
}

/** 笔记 / 灵感（kind 区分） */
export interface Note {
  id: ID
  kind: 'note' | 'inspiration'
  title: string
  body: string
  tags: string[]
  pinned: boolean
  /** 关联项目 */
  projectId?: ID | null
  createdAt: string
  updatedAt: string
}

/** 斩三尸 —— 坏习惯定义 */
export interface Habit {
  id: ID
  name: string
  /** 每日目标次数 */
  targetPerDay: number
  unit?: string
  order: number
  createdAt: string
  /** 改名 / 调目标等修改需要时间戳参与同步新旧判定 */
  updatedAt?: string
}

/** 斩三尸 —— 每日记录 */
export interface HabitLog {
  id: ID
  habitId: ID
  date: string
  count: number
  note?: string
  createdAt?: string
  updatedAt?: string
}

/** 身体指标定义（用户自定义） */
export interface BodyMetricDef {
  id: ID
  name: string
  unit: string
  target?: number | null
  order: number
  createdAt: string
}

/** 身体指标每日记录 */
export interface BodyMetricLog {
  id: ID
  metricId: ID
  date: string
  value: number
  note?: string
  createdAt?: string
  updatedAt?: string
}

/** 喝水记录 */
export interface WaterLog {
  id: ID
  date: string
  amountMl: number
  /** 时间点 ISO */
  createdAt: string
  updatedAt?: string
}

/** 番茄钟 Session */
export interface PomodoroSession {
  id: ID
  startAt: string
  endAt: string
  durationMin: number
  type: 'focus' | 'break'
  courseId?: ID | null
  taskId?: ID | null
  /** 关联项目 */
  projectId?: ID | null
  tags: string[]
  createdAt?: string
  updatedAt?: string
}

/** 每周固定时段 */
export interface WeeklySlot {
  weekday: number
  start: string
  end: string
}

/** 课程 */
export interface Course {
  id: ID
  name: string
  teacher?: string
  room?: string
  schedule: WeeklySlot[]
  credit: number
  note?: string
  createdAt: string
}

/** 作业 */
export interface Homework {
  id: ID
  title: string
  courseId?: ID | null
  done: boolean
  dueDate?: string | null
  note?: string
  createdAt: string
}

/** 考试 */
export interface Exam {
  id: ID
  title: string
  courseId?: ID | null
  date: string
  time?: string
  location?: string
  note?: string
  createdAt?: string
  updatedAt?: string
}

/** 收藏类型 */
export type CollectionType =
  | 'novel'
  | 'anime'
  | 'game'
  | 'film'
  | 'book'
  | 'github'
  | 'project'
  | 'ui_ref'
  | 'inspiration'
  | 'custom'

/** 统一收藏模型 */
export interface CollectionItem {
  id: ID
  title: string
  type: CollectionType
  category?: string
  tags: string[]
  url?: string
  cover?: string
  description?: string
  /** 0-5 */
  rating?: number
  status?: string
  notes?: string
  favorite: boolean
  /** 关联项目 */
  projectId?: ID | null
  createdAt: string
  updatedAt: string
}

/** 收藏类型 */
export type SourceType = 'github' | 'rss' | 'official' | 'web' | 'game' | 'anime'

/** 情报条目（信息中枢，统一模型） */
export interface IntelligenceItem {
  id: ID
  title: string
  /** 来源展示名（如 GitHub / Steam / 某 RSS） */
  source: string
  /** 早期版本用字段，保留兼容 */
  sourceName?: string
  sourceType: SourceType
  /** 外部唯一 id（用于去重：source + externalId） */
  externalId?: string
  category?: string
  tags: string[]
  url?: string
  image?: string
  summary?: string
  author?: string
  publishedAt?: string
  read: boolean
  favorite: boolean
  aiSummary?: string
  createdAt: string
  updatedAt?: string
  /** 闭环预留：情报 → 灵感 / 任务 / 项目 */
  convertedToNoteId?: ID | null
  convertedToTaskId?: ID | null
  projectId?: ID | null
}

/** 占卜类型 */
export type DivinationType = 'daily_sign' | 'hexagram' | 'bagua' | 'qimen'

/** 占卜记录（按 type 区分：签 / 卦 / 六爻 / 奇门） */
export interface DivinationRecord {
  id: ID
  type: DivinationType
  date: string
  title: string
  /** 输入（如起卦种子/时间） */
  input?: string
  /** 结果（结构化文本） */
  result?: string
  /** 解卦/解读 */
  interpretation?: string
  detail?: string
  raw?: string
  tags: string[]
  createdAt: string
  updatedAt?: string
}

/** 收支分类 */
export type FinanceCategory =
  | 'dining'
  | 'transport'
  | 'study'
  | 'fun'
  | 'shopping'
  | 'subscription'
  | 'salary'
  | 'other'

/** 收支记录 */
export interface FinanceRecord {
  id: ID
  kind: 'income' | 'expense'
  amount: number
  category: FinanceCategory
  date: string
  merchant?: string
  note?: string
  /** 是否为购买物品 */
  isPurchase: boolean
  createdAt: string
  updatedAt?: string
}

/** 购买物品 */
export interface Purchase {
  id: ID
  title: string
  price: number
  category: FinanceCategory
  date: string
  url?: string
  note?: string
  createdAt: string
  updatedAt?: string
}

/** 月度预算 */
export interface Budget {
  id: ID
  month: string
  amount: number
  createdAt: string
  updatedAt: string
}

/** 项目里程碑 */
export interface ProjectMilestone {
  id: string
  title: string
  done: boolean
  dueDate?: string
}

/** 项目状态 */
export type ProjectStatus =
  | 'planning'
  | 'developing'
  | 'maintaining'
  | 'paused'
  | 'done'

/** GitHub / 个人项目中心 */
export interface Project {
  id: ID
  name: string
  repo?: string
  description?: string
  stack: string[]
  status: ProjectStatus
  /** 0-100 */
  progress: number
  startDate?: string
  goal?: string
  nextStep?: string
  milestones: ProjectMilestone[]
  notes?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

/** 情报 Provider 类型 */
export type IntelligenceProviderId =
  | 'github'
  | 'rss'
  | 'atom'
  | 'json'
  | 'rest'
  | 'mock'
  | 'game'
  | 'anime'
  | 'official'
  | 'web'
  | 'custom'
  | 'steam'
  | 'rawg'
  | 'jikan'

/** 情报源（可在「系统」管理，增删启停测试） */
export interface IntelligenceSource {
  id: ID
  name: string
  provider: IntelligenceProviderId
  /** 抓取地址（rss/custom 用） */
  url?: string
  category: string
  enabled: boolean
  /** JSON 字符串形式的扩展配置（如 GitHub 搜索词 / Steam appid / RAWG key / Jikan mode） */
  config?: string
  lastFetchedAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

/**
 * 删除墓碑 —— 让"删除"成为可同步的事实
 * 墓碑随快照在设备间流转：本地删掉的记录凭它从远端快照中清除，删除才会传播。
 */
export interface Tombstone {
  id: ID
  /** 业务表名 */
  entity: string
  /** 被删除记录的 id */
  entityId: string
  /** 删除时刻 ISO，用于过期清理 */
  deletedAt: string
}

/** 持久化同步队列记录 */
export interface SyncQueueRecord {
  id: ID
  entity: string
  op: 'create' | 'update' | 'delete'
  ts: number
  payload?: unknown
}

/** 同步元数据（设备 / 版本 / 时间，供 LWW） */
export interface SyncMeta {
  id: 'meta'
  deviceId: string
  /** 数据版本号，每次成功同步 +1 */
  version: number
  lastSyncedAt?: string | null
  lastPushedAt?: string | null
}

/** 同步冲突记录（检测到双方同时修改时记录，LWW 默认取新） */
export interface ConflictRecord {
  id: ID
  entity: string
  entityId: string
  localTs: number
  remoteTs: number
  local: unknown
  remote: unknown
  resolved: boolean
  resolvedAt?: string | null
  createdAt: string
}

/** 活动轨迹统一模型（引用不复制） */
export type ActivityType =
  | 'task'
  | 'note'
  | 'pomodoro'
  | 'water'
  | 'finance'
  | 'collection'
  | 'intelligence'
  | 'project'
  | 'habit'
  | 'divination'

export interface ActivityItem {
  id: ID
  entityType: ActivityType
  entityId: string
  timestamp: string
  title: string
  metadata?: string
  createdAt?: string
  updatedAt?: string
}

/** 我的关注（游戏/动漫/GitHub/AI/人物/主题/标签） */
export interface Follow {
  id: ID
  name: string
  type: 'game' | 'anime' | 'github' | 'ai' | 'person' | 'topic' | 'tag'
  keyword: string
  createdAt: string
  updatedAt?: string
}

/** AI 资源类型 */
export type AIResourceType =
  | 'model'
  | 'tool'
  | 'skill'
  | 'agent'
  | 'plugin'
  | 'prompt'
  | 'workflow'

/** AI 资源（术） */
export interface AIResource {
  id: ID
  name: string
  type: AIResourceType
  provider?: string
  description?: string
  /** JSON 字符串形式的配置 */
  config?: string
  tags: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** 日省 / 今日记录 */
export interface Journal {
  id: ID
  date: string
  content: string
  /** 心情 0-5 */
  mood?: number
  createdAt: string
  updatedAt: string
}
