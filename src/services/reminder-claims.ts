/**
 * 提醒认领存储 —— 「这条提醒本期间已经说过了」的落盘
 *
 * ⚠️ 不能复用 `services/notification.ts` 的 `claimDailyNotice`：它只保留"今天"的记录，
 * 而固定任务的期间是本周 / 本月 —— 今天认领的「每月 27 号」明天就会被清掉，于是天天提醒。
 * 这里按「键 + 期间」存：键本身嵌着期间（今天 / 本周一 / 本月），期间没过就不会重复。
 *
 * 旧条目靠容量上限滚动淘汰（插入序近似最旧）。键里嵌着期间，所以旧条目永远不会被
 * 误判成命中，只是占一点存储 —— 因此淘汰策略只需要防无限增长，不需要精确过期。
 */
const CLAIM_KEY = 'zbt:reminder-claimed:v1'
const CLAIM_MAX = 300

function readClaims(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLAIM_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    /* 存档损坏按「无认领」处理，最坏是多提醒一次 */
  }
  return {}
}

/** 认领一个提醒：本期间未认领过则记录并返回 true，已认领返回 false */
export function claimReminder(key: string, period: string): boolean {
  try {
    const claims = readClaims()
    if (claims[key] === period) return false
    const entries = Object.entries(claims)
    const trimmed =
      entries.length >= CLAIM_MAX ? entries.slice(entries.length - CLAIM_MAX + 1) : entries
    trimmed.push([key, period])
    localStorage.setItem(CLAIM_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    /* 隐私模式写不进去：退化为仅本次会话内去重 */
    return true
  }
  return true
}
