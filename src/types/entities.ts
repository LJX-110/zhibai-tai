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
  /**
   * 重复方式。**固定三式**（每日 / 每周 / 每月）构成一套统一的固定提醒体系：
   * 每条固定任务只有**一条记录**，完成/撤销作用在「本期」上（今天 / 本周 / 本月），
   * 由 `completedAt` 落在哪个周期自动判定是否再次出现 —— 绝不生成后继实例
   * （见 useTaskActions 的说明，生成实例会让刚完成的事立刻重新出现）。
   *  · daily   每日固定，无需锚点字段，复用本值（存量数据零迁移）
   *  · weekly  每周固定，锚点 weeklyDay
   *  · monthly 每月固定，锚点 monthlyDay
   * 判定收口在 utils/id.ts 的 isFixedSchedule / fixedDoneThisPeriod。
   * 搭配锚点字段使用；`repeat !== 'none'` 且无锚点时仍走旧的"完成后生成下一条"。
   */
  repeat: Repeat
  /** 每月固定日提醒（1-31，如每月 27 号交话费） */
  monthlyDay?: number | null
  /**
   * 每周固定提醒的星期几（0-6，0=周日…6=周六，如每周三做复盘）。
   * 取值域刻意与 JS Date.getDay() 同构（0=周日），也与项目里
   * weekdayCN()、WeeklySlot.weekday 同一套约定 —— 整条链路无需任何
   * ±1 换算，避免「0/1 错位」类 bug；存量任务无此字段时视为「非每周固定」。
   */
  weeklyDay?: number | null
  /**
   * 固定任务的**系列标识** —— 同一件"每期都要做"的事，各期共用这一个值。
   *
   * 为什么需要它：展示层要把「历史副本」与「当前这条」认成同一件事，早先靠
   * 「锚点 + 标题」当身份，于是两条标题相同的固定任务会**互相吞掉**（只显示最新那条），
   * 而改标题 / 改锚点日又会让旧记录**复活成重复条目** —— 两个方向都错。
   *
   * 现在：**新建的固定任务 seriesId = 自身 id**（永不变，与标题解耦），
   * 于是「同名不再相吞、改名不再复活」。存量数据没有此字段，展示层退回按
   * 「锚点 + 标题」推断（历史副本正是这样成组的），并由启动时的幂等迁移
   * （`services/task-repair.ts` 的 `migrateFixedTaskSeries`）逐条补上。
   */
  seriesId?: string | null
  /** 关联项目 / 关联课程 */
  projectId?: ID | null
  courseId?: ID | null
  createdAt: string
  updatedAt: string
  completedAt?: string | null
}

/** 笔记类型：记录（内省）/ 灵感（创作） */
export type NoteKind = 'note' | 'inspiration'

/** 笔记 / 灵感（kind 区分） */
export interface Note {
  id: ID
  kind: NoteKind
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
  /** 改名 / 调目标需要时间戳参与跨设备 LWW 判定 */
  updatedAt?: string
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
  /** 上课周次（1 起）。缺省或空数组 = 每周都上；
   *  单双周 / 前后八周不同课表靠它表达，缺了就只能拆成假课程 */
  weeks?: number[]
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
  /** 改名 / 调排课需要时间戳参与跨设备 LWW 判定 */
  updatedAt?: string
}

/**
 * 单次停课 —— 「这周的这节课不上」，不动课程本身的排课。
 *
 * ## 为什么需要它（这是一个真实的功能缺口）
 * 此前要停一次课，只能**删掉整个时段**或**改周次**。于是遇到「下周那节课老师停一次」时，
 * 只能做破坏性操作，而且**改完提醒照样响**（用户报过「课次取消当周仍触发通知」）。
 * 根因不是提醒算错，而是**根本没有「取消某一次课」这个概念** —— 提醒无从知道这件事被取消了。
 *
 * ## 为什么按「课程 + 日期 + 开始时间」定位，而不是「第 N 周周几」
 * 停课按**具体哪一天**发生（调课、放假、老师临时有事），而「第 N 周周几」是排课的抽象。
 * 用日期定位才能表达「这周三停、下周三照常」，也不必担心学期起始周被改。
 */
export interface CourseCancellation {
  id: ID
  courseId: ID
  /** 停课的那一天（yyyy-mm-dd） */
  date: string
  /** 停的是哪一节（同一天同课程可能有多节，故必须带开始时间） */
  start: string
  note?: string
  createdAt: string
  updatedAt?: string
}

/**
 * 单次调课 —— 「这节课挪到别的时间上」，不动课程本身的排课。
 *
 * ## 与 CourseCancellation 为什么分两张表
 * 两者是**不同的事**，不是同一件事的不同参数：
 *  · 停课 = 这一次不上了 —— 原时间空掉，别处不多出东西；
 *  · 调课 = 这一次换时间上 —— 原时间空掉 **且** 新时间多出一节。
 * 合成一张表就得用"可选的目标字段"表达两种语义，每个读取方都要先判空才知道
 * 自己面对的是哪一种；分表之后，取课点只需各问一句，判据不混。
 *
 * ## 定位方式刻意与停课一致
 * `courseId + date + start` 定位**一次课**（`date` 存原定上课那天）。
 * 同一次课不该既停又调，故界面上两个动作互斥（已调的那次只给「恢复」）。
 *
 * ## 为什么把 toEnd 也存下来
 * 用户只挑"挪到几点开始"，时长理应沿用原来那节。存 toEnd 而不是读时去推算，
 * 是为了让**读取方零计算**：取课点直接拿 toStart/toEnd 造时段，不必再去原课程里
 * 反查那一节的时长（原时段可能已被编辑甚至删除，那时候就推不出来了）。
 */
export interface CourseReschedule {
  id: ID
  courseId: ID
  /** 原定上课的那一天（yyyy-mm-dd） */
  date: string
  /** 原定的开始时间（HH:mm） */
  start: string
  /** 挪到哪一天（yyyy-mm-dd） */
  toDate: string
  /** 挪到几点开始（HH:mm） */
  toStart: string
  /** 挪过去之后的结束时间（HH:mm）—— 写库时按原时长算好 */
  toEnd: string
  note?: string
  createdAt: string
  updatedAt?: string
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
  updatedAt?: string
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

/**
 * 收藏介质的**旧枚举**。
 * 介质已数据化（2026-09-21）：`CollectionItem.type` 现在存的是介质名（如「小说」），
 * 介质本体的增删改在 categories 表的 `collection_medium` scope 里。
 * 本枚举仅用于①存量数据迁移 ②历史值兜底显示，新数据不再产生这些键。
 */
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
  /** 介质名（在 categories 表 `collection_medium` scope 内管理，可增删、跨设备同步） */
  type: string
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
export type SourceType = 'github' | 'rss' | 'official' | 'web' | 'game' | 'anime' | 'bilibili' | 'ai'

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
export type DivinationType = 'daily_sign' | 'hexagram' | 'bagua' | 'qimen' | 'dayan'

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
  /** AI 个性化解读（每日签/梅花等，生成后缓存，离线可回看） */
  aiReading?: string
  detail?: string
  raw?: string
  tags: string[]
  createdAt: string
  updatedAt?: string
}

/** 支出收入分类：预设常用分类，也允许用户自填（Category 是自由文本） */
export type FinanceCategory = string

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
  /** 状态：want=想买（清单）· ordered=已下单/等快递 · done=已到手。
   *  记录「准备买的东西」与取件进度，缺省视为想买。 */
  status?: 'want' | 'ordered' | 'done'
  /** 来源流水 id（由财页「购买」自动生成时记录；编辑流水取消购买可据此联动清理） */
  financeId?: string
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
  | 'web'
  | 'custom'
  | 'steam'
  | 'rawg'
  | 'jikan'
  | 'bilibili'
  | 'ai'

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
  /**
   * 上次**成功**抓到数据的时刻。
   * 与 lastFetchedAt 的区别是语义：lastFetchedAt 每次尝试都写（失败也写），
   * 用它判断「源还活着吗」会把持续失败的源显示成刚刚抓过；
   * 用户真正想知道的是「这个源最后一次正常出数据是什么时候」。
   */
  lastSuccessAt?: string
  /** 连续失败次数：成功即清零。界面据此显示失败程度，抓取编排据此退避（避免红叉源被反复重试） */
  failCount?: number
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
  /** 术（AI 资源新增 / 天机提议采纳）—— 九板块里此前唯一没记流水的一个 */
  | 'ai'

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

/** AI 资源类型：内置枚举 + 用户自定义类型名（自定义名走 categories 表 scope 'ai_type' 跨设备同步） */
export type AIResourceType =
  | 'model'
  | 'tool'
  | 'skill'
  | 'agent'
  | 'plugin'
  | 'prompt'
  | 'workflow'

/** 术类型旧枚举键 → 数据化后的显示名（仅供一次性迁移旧数据使用） */
export const AI_TYPE_LEGACY_LABEL: Record<AIResourceType, string> = {
  model: '模型',
  tool: 'Tool',
  skill: 'Skill',
  agent: 'Agent',
  plugin: 'Plugin',
  prompt: 'Prompt',
  workflow: 'Workflow',
}

/** AI 资源（术） */
export interface AIResource {
  id: ID
  name: string
  /** 可为内置枚举外的自定义类型名（自定义类型在 categories 表 'ai_type' scope 内管理） */
  type: string
  provider?: string
  description?: string
  /** 用法分类（自由文本，走 categories 业务表可增删、跨设备同步） */
  category?: string
  /** JSON 字符串形式的配置 */
  config?: string
  tags: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 分类体系（情报 / 藏阁共用一张表，用 scope 区分）
 *
 * 注册为业务表即自动获得：墓碑（删除可传播）+ LWW 合并 + 加密快照同步 + 备份导出。
 * 此前分类存在设置项里（只落浏览器本地），永远不参与同步 ——
 * 手机上加的分类，电脑上必然看不到。
 */
export type CategoryScope = 'intel' | 'collection' | 'ai' | 'ai_type' | 'collection_medium'

export interface Category {
  id: ID
  scope: CategoryScope
  name: string
  /** 同 scope 内的排序位 */
  order: number
  createdAt: string
  updatedAt: string
}

/**
 * 参与同步的偏好设置白名单。
 * 只收「跨设备希望一致」的项：目标、番茄钟时长、通知、代理、AI 模型配置。
 * 不含任何密钥 / Token（那些走各自加密存储），也不含设备级偏好
 * （主题、布局、底栏排列 —— 手机与电脑本就应该不同）。
 */
export interface SyncedSettings {
  profileName?: string
  waterGoalMl?: number
  pomodoroFocusMin?: number
  pomodoroBreakMin?: number
  notifyEnabled?: boolean
  soundEnabled?: boolean
  soundVolume?: number
  browserNotify?: boolean
  intelAutoFetch?: boolean
  intelFetchMinutes?: number
  /** 情报保留上限（条）。0 = 不限制；超出后按「已读且最旧优先」裁剪 */
  intelKeepLimit?: number
  corsProxyUrl?: string
  aiProvider?: 'local' | 'remote'
  aiBaseUrl?: string
  aiModel?: string
  /** 学期起始日（课程表周次/单双周判定用） */
  termStartDate?: string
}

/** 偏好设置行 —— 单行表，同步时以整行为单位做 LWW */
export interface AppSettingsRow {
  id: 'settings'
  data: SyncedSettings
  createdAt: string
  updatedAt: string
}

/**
 * 修行状态 —— 单行表（id 固定 'cultivation'），跨设备一致。
 *
 * 把「境界」从**每日快照**改成**持续累积**：
 * 旧口径下境界由「今日总分」定阶（0-100），今天不记录就掉回最低阶，历史最高还只存本机
 * localStorage —— 本质是每日快照，谈不上"累积"。
 *
 * 现在：境界由**累计「功行」**定阶，只升不降（2026-09-22 重做，见 `services/merit.ts`）。
 * 功行 = `total`（每日净行逐日累加）+ `bonus`（闭关等额外功行）。
 * ⚠️ 字段名沿用 `total`/`bonus`（**语义已变，但结构未变，故存量数据零迁移**）：
 * 旧值（改名前的修行总量）量级与新口径相当，直接沿用即可 —— 迁移时无需折算。
 *
 * ⚠️ 每日累加必须**只补差额**：`todayDate` 记日期、`todayCounted` 记今天已计入多少分。
 * 今天多次打开应用时只补 `今日总分 - 已计入` 的那部分，绝不重复累加；跨天则把
 * `todayCounted` 落进 `total` 后归零。这是"一天只加一次"且"当天越用越高"能同时成立的关键。
 */
export interface CultivationState {
  id: 'cultivation'
  /** 已结算的每日功行累计（不含今天未结部分）—— 即「功行」总量 */
  total: number
  /** 闭关等额外功行（单独计，不参与每日对账） */
  bonus: number
  /** 今日已计入的日期（yyyy-mm-dd） */
  todayDate: string
  /** 今日已计入的分数 */
  todayCounted: number
  /** 闭关次数 */
  seclusionCount: number
  createdAt: string
  updatedAt: string
}

/**
 * 桌宠状态 —— 单行表（id 固定 'pet'），跨设备一致。
 *
 * ⚠️ 为什么是业务表而不是设置项：位置与好感度是**业务状态**不是偏好，
 * 且位置会高频变化，塞进偏好设置会让设置快照无谓抖动（偏好走整行 LWW + 去抖）。
 * 「开关 petEnabled」反而留在本地设置不动 —— 开关是"这台设备要不要看见它"，状态是"它在哪、多亲"。
 */
export interface PetState {
  id: 'pet'
  /** 宠物包围盒左上角坐标（视口 px；桌面壳里是工作区 px） */
  position: { x: number; y: number }
  /** 好感度（加分规则见 `services/pet/affinity.ts`：只升不降、不设门槛） */
  affinity: number
  /**
   * 好感度账本的**日期戳** —— 跨天时把下面的当日额度清零。
   * 单独存一个日期而不是"上次加分时刻"：换设备/时区时日期比时刻可靠，
   * 也不会因为"今天还没加分"而误判成隔了很久。
   */
  affinityDay?: string
  /** 当日各事件已用额度（事件 → 次数）；跨天由 `affinityDay` 判定后清零 */
  affinityUsed?: Record<string, number>
  /** 已发过的一次性里程碑天数（7 / 30 …）—— 避免换设备后重复发 */
  milestones?: number[]
  /**
   * 仅记录**跨会话保持**的状态（busy / 休眠 / 隐藏），普通动画切换不写 ——
   * 逐帧同步"当前动画"既让快照风暴，又在另一台设备打开时早已过期。
   */
  lastAction?: string | null
  createdAt: string
  updatedAt: string
}
