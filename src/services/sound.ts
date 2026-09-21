/**
 * SoundService —— 统一音效（Web Audio 合成，无需音频文件）
 *
 * ── 音色分三族 ──
 * 同族共用波形 / 包络形状 / 频段，族内只变音高与音数（听感一致）；
 * 跨族变波形与包络长度（一听就能分出是哪类事）。此前每个事件各调各的参数，
 * 同是"轻点"却一个 760Hz/方波一个 480Hz/正弦，听感散。
 *
 *  · tap   轻点 —— 三角波单音，高频（620–880Hz）、≤70ms、快衰减。
 *           用于"碰一下"的动作：点击、开合、提示。
 *  · chime 完成 —— 三角波上行 2–3 音，中频（520–1040Hz），逐音变长变轻。
 *           用于"办成了"的节点：确认、同步成功、升级、待办完成。
 *  · deep  低沉 —— 正弦（可叠低通噪声），低频（140–640Hz）、长包络。
 *           器物与仪式质感：落印、翻纸、罗盘、奇门；
 *           error 同族但走"下行"轮廓（240→190Hz），低频下行天然读作警示，
 *           不必换波形也能与同族的正向音区分。
 *
 * ── 音名 ──
 * 全部旧名保留（调用点遍布页面与布局，改名只制造无谓的同步成本）。
 * 新代码可直接用族名：tap / chime / deep，即三族的基准音。
 *
 * ── 触发场景（全站矩阵；新场景先来这里对号入座，再挑族） ──
 *  · tap 族（碰一下）   Button 点击 · 侧栏/底栏切换 · 弹层开合 · 轻通知
 *  · chime 族（办成了） 待办完成 · 收藏/情报整理入库 · 同步完成 · 购买 · 升级 · 番茄钟结束
 *  · deep 族（器物感）  落印/盖章（最强）· 翻纸 · 罗盘 · 起盘 · **出错（下行轮廓）**
 *
 * 反馈逻辑有两条收口规则，别在调用点各写各的：
 *  1. **报错只有一条通路**：`ui/Toast.tsx` 在 tone === 'danger' 时播 `error`。
 *     全站没有任何调用点直接播 error —— 报错最容易被人忽略，收敛在一处才能保证
 *     「只要弹了红色提示就一定有声」，而不用逐个调用点记得加。
 *  2. **成功的声音由动作本身发出，不由 toast 发**：完成/入库等动作在调用点播
 *     chime 族，随后弹的成功 toast 不再出声 —— 否则一次操作响两下。
 *
 * 音量默认开（见 useSettingsStore.soundEnabled）；设置中可开关与调节；
 * 环境音由 settings.ambientEnabled 控制（见 setAmbient）。
 */
import { useSettingsStore } from '../stores/useSettingsStore'

export type SoundEvent =
  | 'ui-click'
  | 'ui-confirm'
  | 'ui-open'
  | 'ui-close'
  | 'seal'
  | 'paper'
  | 'compass'
  | 'qimen'
  | 'sync'
  | 'success'
  | 'error'
  | 'notification'
  | 'task-done'
  | 'intel-new'
  | 'purchase'
  | 'levelup'
  /* 族级别名：三族的基准音 */
  | 'tap'
  | 'chime'
  | 'deep'

/** 当前音量（0-1），从设置实时读取 */
function currentVolume(): number {
  const s = useSettingsStore.getState()
  return s.soundEnabled ? s.soundVolume : 0
}

let ctx: AudioContext | null = null
/** 是否已通过用户手势解锁过。浏览器自动播放策略要求 resume() 必须在手势中调用，
 *  未解锁时 ctx 恒为 suspended，此时任何播放都不会出声；armed 用于在此前提下
 *  安全跳过（既不报错，也不在 suspended 上下文上调度 —— 那种调度要么永不响、
 *  要么恢复后延迟怪响）。首个 pointerdown/keydown 会把 armed 置真并 resume。 */
let armed = false

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

/** 单个正弦音（attack/decay 包络） */
function tone(
  c: AudioContext,
  freq: number,
  { dur = 0.12, vol = 0.5, type = 'sine', delay = 0, decay = 0.18 }: {
    dur?: number
    vol?: number
    type?: OscillatorType
    delay?: number
    decay?: number
  } = {},
) {
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + decay)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + decay + 0.05)
}

/** 轻柔纸面噪声（低通滤波白噪） */
function paperNoise(c: AudioContext, { dur = 0.09, vol = 0.18, delay = 0 }: { dur?: number; vol?: number; delay?: number } = {}) {
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2200
  const g = c.createGain()
  g.gain.value = vol
  src.connect(filter)
  filter.connect(g)
  g.connect(c.destination)
  src.start(t0)
}

/* ============================================================
   三族的合成参数 —— 改这里 = 改整族听感（族内各音只给音高）
   ============================================================ */

/** tap 轻点族：一个短促三角波。vol 0.24 是"听得见但不抢戏"的基准 */
function tap(c: AudioContext, v: number, freq: number, over: { dur?: number } = {}) {
  tone(c, freq, { type: 'triangle', dur: over.dur ?? 0.05, decay: 0.1, vol: 0.24 * v })
}

/** chime 完成族：上行音阶，逐音变长（收束）且变轻（不刺耳） */
function chime(c: AudioContext, v: number, freqs: number[]) {
  freqs.forEach((f, i) => {
    tone(c, f, {
      type: 'triangle',
      dur: 0.08 + i * 0.03,
      decay: 0.16 + i * 0.06,
      vol: (0.22 - i * 0.02) * v,
      delay: i * 0.07,
    })
  })
}

/** deep 低沉族：一个长包络正弦，低频才有"器物"的分量感 */
function deep(
  c: AudioContext,
  v: number,
  freq: number,
  over: { dur?: number; decay?: number; vol?: number; delay?: number } = {},
) {
  tone(c, freq, {
    type: 'sine',
    dur: over.dur ?? 0.24,
    decay: over.decay ?? 0.3,
    vol: (over.vol ?? 0.2) * v,
    delay: over.delay,
  })
}

/** deep 族的材质点缀：低通噪声（纸面 / 落印的摩擦感） */
function grain(c: AudioContext, v: number, dur = 0.08, vol = 0.16) {
  paperNoise(c, { dur, vol: vol * v })
}

const PATTERNS: Record<SoundEvent, (c: AudioContext, v: number) => void> = {
  /* ---- tap 轻点族 ---- */
  'ui-click': (c, v) => tap(c, v, 760),
  'ui-open': (c, v) => tap(c, v, 620, { dur: 0.07 }),
  'ui-close': (c, v) => tap(c, v, 480, { dur: 0.07 }),
  notification: (c, v) => tap(c, v, 700, { dur: 0.06 }),
  tap: (c, v) => tap(c, v, 760),

  /* ---- chime 完成族 ---- */
  'ui-confirm': (c, v) => chime(c, v, [620, 880]),
  sync: (c, v) => chime(c, v, [660, 990]),
  success: (c, v) => chime(c, v, [660, 880]),
  'task-done': (c, v) => chime(c, v, [587, 784, 988]),
  levelup: (c, v) => chime(c, v, [520, 660, 880]),
  purchase: (c, v) => chime(c, v, [600, 780]),
  'intel-new': (c, v) => chime(c, v, [640, 800]),
  chime: (c, v) => chime(c, v, [660, 880]),

  /* ---- deep 低沉族 ---- */
  // 落印：全站最"实"的一声，故音量高于族内其余音（是刻意的强弱极，不是漏改）
  seal: (c, v) => {
    deep(c, v, 150, { dur: 0.1, decay: 0.16, vol: 0.38 })
    grain(c, v, 0.06, 0.14)
  },
  paper: (c, v) => grain(c, v, 0.1, 0.2),
  compass: (c, v) => {
    deep(c, v, 480, { dur: 0.28, decay: 0.34, vol: 0.16 })
    deep(c, v, 600, { dur: 0.2, decay: 0.24, vol: 0.1, delay: 0.08 })
  },
  qimen: (c, v) => {
    // 三音上行：起盘由静入动
    ;[220, 330, 440].forEach((f, i) =>
      deep(c, v, f, { dur: 0.4 - i * 0.1, decay: 0.5 - i * 0.1, vol: 0.2 - i * 0.06, delay: i * 0.1 }),
    )
  },
  error: (c, v) => {
    // 低频下行（软三角波气质，不用刺耳的方波）：同族里的"负向"轮廓
    deep(c, v, 240, { dur: 0.16, decay: 0.2, vol: 0.22 })
    deep(c, v, 190, { dur: 0.2, decay: 0.24, vol: 0.18, delay: 0.1 })
  },
  deep: (c, v) => deep(c, v, 200),
}

/** 同一事件在多少毫秒内的重复触发视为「连点/重复」而合并：
 *  防同一操作响两下（双击、React StrictMode 双调用、事件重复绑定），
 *  也防疯狂连点制造音频节点风暴。不同事件各自独立计时，互不干扰。 */
const THROTTLE_MS = 50
const lastPlayedAt: Partial<Record<SoundEvent, number>> = {}

/** 播放一次音效（尊重开关与音量） */
export function playSound(ev: SoundEvent): void {
  const v = currentVolume()
  if (v <= 0) return // 静音或关闭：干净跳过，不报错
  const c = audio()
  if (!c) return
  // 未解锁且上下文未运行：此刻播放必然无声（浏览器策略），直接跳过，避免
  // 在 suspended 的上下文上调度节点（那种调度要么永不响、要么恢复后延迟怪响）。
  // 首个人手手势会经 unlock 把 armed 置真并 resume，此后才真正出声。
  if (c.state !== 'running') {
    if (!armed) return
    // 已解锁但上下文仍被挂起（resume 曾被拒 / 页面刚回前台）：借这次调用再 resume 一次。
    // playSound 几乎总在手势回调里触发，此时 resume 是浏览器允许的 ——
    // 没有这一步的话，一次 resume 失败就会让 armed 恒为真而上下文恒为挂起，
    // 表现是"开关开着却再也听不见任何声音"，且无任何线索。
    void c.resume().catch(() => {})
  }
  // 同事件节流：合并 50ms 内的重复触发（双击 / StrictMode 双调用 / 狂点）
  const now = performance.now()
  const last = lastPlayedAt[ev]
  if (last !== undefined && now - last < THROTTLE_MS) return
  lastPlayedAt[ev] = now
  try {
    PATTERNS[ev]?.(c, v)
  } catch {
    /* 音效失败不影响功能 */
  }
}

/* 首次用户手势解锁音频 —— 音效"从未播放"的根因修复。
 * Chrome 自动播放策略：非手势中创建的 AudioContext 恒为 suspended，
 * 无激活时 resume() 也会被拒（且返回被拒的 Promise，不 await 会变成未处理 rejection）。
 * 若首个 playSound 恰好发生在异步回调（启动通知 / 抓取完成），上下文被锁死，
 * 此后即使点测试按钮也可能无声。此处在首个 pointerdown/keydown（必为手势）创建
 * 并恢复上下文，同时把 armed 置真，让 playSound 在 resume 完成前也能安全调度。 */
if (typeof window !== 'undefined') {
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    const c = audio()
    if (c) {
      armed = true
      // resume() 必须在用户手势内调用，否则浏览器拒绝；catch 兜底避免未处理 rejection
      if (c.state === 'suspended') void c.resume().catch(() => {})
    }
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

/* 页面隐藏时挂起音频上下文：既静默（切到后台还响提示音很突兀）又省电。
 * 回到前台且曾解锁过再恢复。不处理「从未交互就隐藏」的情况：那时 ctx 尚未运行，
 * 也绝不在无手势时强行 resume（会被浏览器拒绝并报错）。 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) {
      if (ctx.state === 'running') void ctx.suspend().catch(() => {})
    } else if (armed && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
  })
}

/** 直接播放（供组件绑定事件） */
export const sfx = {
  click: () => playSound('ui-click'),
}

/* ---------------- 环境音（极轻，默认关） ---------------- */

let ambientNodes: { src: AudioBufferSourceNode; gain: GainNode; ctx: AudioContext } | null = null

/** 开关环境音：极轻的低通噪声底（纸/风/静室感），淡入淡出 */
export function setAmbient(on: boolean): void {
  const c = audio()
  if (!c) return
  if (on && !ambientNodes) {
    const len = c.sampleRate * 2
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 300
    const gain = c.createGain()
    gain.gain.value = 0
    gain.gain.linearRampToValueAtTime(0.05, c.currentTime + 2.5)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(c.destination)
    src.start()
    ambientNodes = { src, gain, ctx: c }
  } else if (!on && ambientNodes) {
    const { src, gain, ctx } = ambientNodes
    ambientNodes = null
    try {
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8)
      window.setTimeout(() => {
        try {
          src.stop()
        } catch {
          /* 已停 */
        }
      }, 1000)
    } catch {
      /* 忽略 */
    }
  }
}
