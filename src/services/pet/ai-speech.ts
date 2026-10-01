/**
 * 桌宠 · AI 台词（Step 5-3E · 用户拍板："台词随机用 AI 生成"）
 *
 * ## 它是什么
 * 气泡里那句短话，**由人设（鲸鱼娘）生成** —— 不是聊天窗口：无会话、无历史面板，
 * 只有一句"它此刻想说的话"。人设与天机同源（`personas` 表 → `voice.ts` 的三个语气字段）。
 *
 * ## 四条硬约束（每一处失败都回退到本地台词库，绝不阻塞气泡）
 *  · **未配 AI / 调用失败 / 超时** → 返回 null，调用方用 `sayings` 的本地台词；
 *  · **每日上限 20 条**（本机计数）：每句都是一次模型调用，不能让"陪聊"变成账单；
 *  · **预取队列**（最多 1 条）：日常搭话是"到点了要立刻说"，等 8 秒再冒泡是坏体验 ——
 *    所以优先从队列取上一轮备好的句子，取走后再悄悄备下一条；
 *  · **页面隐藏不发请求**（由调用方判断可见性，这里只管节流与队列）。
 *
 * 只输出台词本身（提示词里明确要求）；模型造反（超长 / 空）同样按失败回退。
 */

/** 语气三要素 —— 与 `services/pet/voice.ts` 的 PetVoice 对齐（只取生成台词需要的三个） */
export interface PetLineVoice {
  self: string
  master: string
  food: string
}

export interface PetLineRequest {
  voice: PetLineVoice
  /** 场景提示（如「被主人戳了一下」「刚结束一次专注」）—— 决定这句话该说什么 */
  scene: string
}

/** 单次请求超时：8 秒还拿不到就回退本地台词（气泡不能干等） */
const TIMEOUT_MS = 8000
/** 每日上限（条）；超出后当天一律走本地台词 */
const DAILY_LIMIT = 20
/** 台词长度上限（防模型不守约；超过按失败处理） */
const MAX_LEN = 60
/** 计数存档键（本机；不进业务表、不进同步 —— 它是"今天用了多少"这种过程量） */
const COUNT_KEY = 'zbt:pet-ai-lines:v1'

/** 已备好的一句话（最多一条）；`peekPetLine` 取走即清空 */
let queue: string | null = null
/** 是否有请求在飞（防并发重复请求） */
let inFlight = false
/** 最近生成过的句子（喂回提示词，避免连着说一样的话） */
const recent: string[] = []

interface DayCount {
  date: string
  count: number
}

function todayKey(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function readCount(): DayCount {
  try {
    const raw = localStorage.getItem(COUNT_KEY)
    const parsed = raw ? (JSON.parse(raw) as DayCount) : null
    if (parsed && parsed.date === todayKey() && Number.isFinite(parsed.count)) return parsed
  } catch {
    /* 存档坏了按 0 计 —— 只是少几条额度，不影响说话 */
  }
  return { date: todayKey(), count: 0 }
}

function bumpCount(): void {
  const c = readCount()
  try {
    localStorage.setItem(COUNT_KEY, JSON.stringify({ date: c.date, count: c.count + 1 }))
  } catch {
    /* 写不进去就"不限次"了一点点：可接受（隐私模式下本就不该联网） */
  }
}

/** 今天已用条数（设置页 / 排查用） */
export function aiLineCountToday(): number {
  return readCount().count
}

function withinLimit(): boolean {
  return readCount().count < DAILY_LIMIT
}

/** 提示词：人设语气 + 场景 + 最近说过（只要求输出台词本身） */
function buildPrompt(req: PetLineRequest): string {
  return [
    '你在扮演知白台里的桌宠「知白」（一条蓝鲸娘形象的小角色）。',
    `自称「${req.voice.self}」，称呼用户「${req.voice.master}」，最喜欢「${req.voice.food}」。`,
    '请写**一句**中文台词：不超过 24 个字，口语化，活泼但不油腻；不加引号、不加表情符号、不解释。',
    `场景：${req.scene}`,
    recent.length > 0 ? `最近说过（别重复）：${recent.join(' / ')}` : '',
    '只输出这句台词本身。',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 清洗模型输出：先压换行 / 去首尾空白，再剥引号（顺序不能反 —— 尾随空格会让 `$` 匹配不到引号） */
function clean(text: string): string | null {
  const t = text
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .replace(/^["'“”「『]+|["'“”」』]+$/g, '')
    .trim()
  if (!t || t.length > MAX_LEN) return null
  return t
}

/**
 * 生成一句（**会等**；给"戳它一下"这类显式请求用）。
 * 失败 / 超时 / 达上限 → null，调用方回退本地台词。
 */
export async function requestPetLine(req: PetLineRequest): Promise<string | null> {
  if (!withinLimit()) return null
  let provider
  try {
    // 动态 import：未开「AI 台词」的用户不该把 AI 模块拉进首屏路径
    const { resolveAIProvider } = await import('../ai/ai-service')
    provider = await resolveAIProvider()
  } catch {
    return null
  }
  try {
    const raw = await Promise.race([
      provider.complete(buildPrompt(req)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ])
    if (typeof raw !== 'string') return null
    const line = clean(raw)
    if (!line) return null
    bumpCount()
    recent.unshift(line)
    if (recent.length > 3) recent.pop()
    return line
  } catch {
    // 调用失败（网络 / 鉴权 / CORS）→ 静默回退本地台词；AI 健康态由天机那侧标记
    return null
  }
}

/** 取走已备好的一句（null = 还没备好 → 调用方用本地台词） */
export function peekPetLine(): string | null {
  const line = queue
  queue = null
  return line
}

/**
 * 后台预取一条（不阻塞当前气泡）。已有存货 / 请求在飞 / 达每日上限时直接返回。
 * ⚠️ 只在页面可见时调用（调用方判断）；失败静默 —— 下次机会再试。
 */
export function prefetchPetLine(req: PetLineRequest): void {
  if (queue !== null || inFlight || !withinLimit()) return
  inFlight = true
  void requestPetLine(req)
    .then((line) => {
      if (line) queue = line
    })
    .finally(() => {
      inFlight = false
    })
}

/** 供测试重置模块内状态 */
export function __resetPetAiSpeechForTest(): void {
  queue = null
  inFlight = false
  recent.length = 0
  try {
    localStorage.removeItem(COUNT_KEY)
  } catch {
    /* 同上 */
  }
}