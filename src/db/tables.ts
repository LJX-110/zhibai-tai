/**
 * 业务表清单 —— 单一事实源
 *
 * 同步、备份导出、清空数据共用这一份清单，任何一侧都不再单独维护
 * （此前曾出现「同步 23 张 / 备份 10 张」的分裂，导致备份遗漏 13 张表）。
 */

export interface TableMeta {
  key: string
  /** 中文显示名（设置页统计与清空确认用） */
  label: string
}

/** 参与同步、备份导出与清空操作的业务表（共 23 张） */
export const BUSINESS_TABLES: readonly TableMeta[] = [
  { key: 'tasks', label: '待办' },
  { key: 'notes', label: '笔记/灵感' },
  { key: 'habits', label: '斩三尸' },
  { key: 'habitLogs', label: '斩三尸记录' },
  { key: 'bodyMetrics', label: '身体指标' },
  { key: 'bodyMetricLogs', label: '身体记录' },
  { key: 'waterLogs', label: '喝水' },
  { key: 'pomodoroSessions', label: '番茄钟' },
  { key: 'courses', label: '课程' },
  { key: 'homeworks', label: '作业' },
  { key: 'exams', label: '考试' },
  { key: 'collectionItems', label: '收藏' },
  { key: 'intelligenceItems', label: '情报' },
  { key: 'intelligenceSources', label: '情报源' },
  { key: 'divinationRecords', label: '占卜' },
  { key: 'aiResources', label: 'AI 资源' },
  { key: 'journals', label: '日志' },
  { key: 'financeRecords', label: '收支' },
  { key: 'purchases', label: '购买' },
  { key: 'budgets', label: '预算' },
  { key: 'projects', label: '项目' },
  { key: 'activityItems', label: '活动轨迹' },
  { key: 'follows', label: '关注' },
]

/** 业务表名数组（同步遍历用） */
export const BUSINESS_TABLE_KEYS: readonly string[] = BUSINESS_TABLES.map(
  (t) => t.key,
)

/** 墓碑表名：删除标记，参与同步但不参与业务渲染 */
export const TOMBSTONES = 'tombstones'

export function isBusinessTable(key: string): boolean {
  return BUSINESS_TABLE_KEYS.includes(key)
}
