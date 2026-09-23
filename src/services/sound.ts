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
 * 环境音是**独立模块**（`services/ambient.ts`）由 settings.ambientEnabled 控制，不在本文件。
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

/** 取得（必要时创建）音频上下文 —— 环境音模块复用同一个，不另建 */
export function audio(): AudioContext | null {
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
   音色原型：道教法器（2026-09-22 重做）

   原先是三个电子族（tap / chime / deep，正弦与三角波），听感是"哔"声，
   与全站的道家视觉语言没有关系。现按**法器**重做音色，仍全部用 Web Audio 合成
   —— **零新增依赖、零音频素材**，与项目"不引入运行时依赖"的红线一致。

   法器 → 语义的对应（不是随便配的）：
     木鱼  短促干脆、无音高感   → 轻点、开关、勾选
     磬    青铜钵，泛音长鸣     → 完成、登记、升级（"做成了一件事"）
     钟    低沉、有缓慢拍频     → 提醒、落印、起盘（有分量的时刻）
     云锣  清亮、尾音短         → 通知、情报更新

   ⚠️ **只用五声音阶（宫商角徵羽）**：任意两音同时或先后响都不会刺耳。
   这是国乐/道乐的基本约束，也天然解决"多个音效串起来会打架"的问题。
   所以下面的音高一律从 `PENTA` 里取，**不要写裸频率**。
   ============================================================ */

/** 五声音阶（宫商角徵羽），低/高八度各一 */
const PENTA = {
  gong: [261.63, 523.25], // 宫 C
  shang: [293.66, 587.33], // 商 D
  jue: [329.63, 659.25], // 角 E
  zhi: [392.0, 783.99], // 徵 G
  yu: [440.0, 880.0], // 羽 A
} as const

/** 木鱼：极短的木质击打。噪声占比高而音高比重很低 —— 木鱼本就不是"音高乐器" */
function muyu(c: AudioContext, v: number, freq: number, { delay = 0, vol = 0.22 } = {}) {
  woodNoise(c, { dur: 0.03, vol: vol * v * 0.9, delay })
  tone(c, freq, { type: 'triangle', dur: 0.02, decay: 0.06, vol: vol * 0.3 * v, delay })
}

/** 磬：基音 + 非谐泛音 + 长衰减。金属感来自非谐比例（2.76 / 5.40 是钟磬类的典型值） */
function qing(c: AudioContext, v: number, freq: number, { delay = 0, vol = 0.18, dur = 1.5 } = {}) {
  const partials: [number, number][] = [
    [1, 1],
    [2.76, 0.3],
    [5.4, 0.11],
  ]
  for (const [ratio, amp] of partials) {
    tone(c, freq * ratio, { type: 'sine', dur, decay: dur * 0.7, vol: vol * amp * v, delay })
  }
}

/** 磬音序列：上行、逐音变长且变轻（收束感，末音不刺耳） */
function qingSeq(c: AudioContext, v: number, freqs: number[], step = 0.09) {
  freqs.forEach((f, i) => {
    qing(c, v, f, { delay: i * step, dur: 0.9 + i * 0.3, vol: 0.17 - i * 0.015 })
  })
}

/** 钟：两个相差 1.5Hz 的低频基音产生**缓慢拍频**（"嗡"），这是大钟的听感特征 */
interface ZhongOpts { dur?: number; decay?: number; vol?: number; delay?: number }
function zhong(c: AudioContext, v: number, freq: number, { dur = 0.45, decay = 0.6, vol = 0.18, delay = 0 }: ZhongOpts = {}) {
  tone(c, freq, { type: 'sine', dur, decay, vol: vol * v, delay })
  tone(c, freq + 1.5, { type: 'sine', dur, decay, vol: vol * 0.5 * v, delay })
  tone(c, freq * 2.02, { type: 'sine', dur: dur * 0.5, decay: decay * 0.5, vol: vol * 0.15 * v, delay })
}

/** 钟音序列（起盘、下行告警这类"由静入动"的轮廓） */
function zhongSeq(c: AudioContext, v: number, freqs: number[], { step = 0.1, vol = 0.18 } = {}) {
  freqs.forEach((f, i) => {
    zhong(c, v, f, { dur: 0.4 - i * 0.08, decay: 0.5 - i * 0.08, vol: vol - i * 0.04, delay: i * step })
  })
}

/** 云锣：清亮、尾音短，用于"来了个新东西"这类提示 */
function yunluo(c: AudioContext, v: number, freq: number, { delay = 0, vol = 0.15 } = {}) {
  tone(c, freq, { type: 'sine', dur: 0.45, decay: 0.45, vol: vol * v, delay })
  tone(c, freq * 2.4, { type: 'sine', dur: 0.26, decay: 0.28, vol: vol * 0.5 * v, delay })
}

/** 木质噪声（木鱼/落印的"木"与"石"来自极短的带通噪声） */
function woodNoise(c: AudioContext, { dur = 0.03, vol = 0.16, delay = 0 } = {}) {
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1800
  filter.Q.value = 1.2
  const g = c.createGain()
  g.gain.value = vol
  src.connect(filter)
  filter.connect(g)
  g.connect(c.destination)
  src.start(t0)
}

/** deep 族的材质点缀：低通噪声（纸面 / 落印的摩擦感） */
function grain(c: AudioContext, v: number, dur = 0.08, vol = 0.16) {
  paperNoise(c, { dur, vol: vol * v })
}

const PATTERNS: Record<SoundEvent, (c: AudioContext, v: number) => void> = {
  /* ---- 木鱼族：轻点、开关、勾选 ---- */
  'ui-click': (c, v) => muyu(c, v, PENTA.jue[1]),
  'ui-open': (c, v) => muyu(c, v, PENTA.zhi[1]),
  'ui-close': (c, v) => muyu(c, v, PENTA.shang[1]),
  notification: (c, v) => yunluo(c, v, PENTA.yu[1]),
  tap: (c, v) => muyu(c, v, PENTA.jue[1]),

  /* ---- 磬族：完成、登记、升级 ---- */
  'ui-confirm': (c, v) => qingSeq(c, v, [PENTA.jue[1], PENTA.zhi[1]]),
  sync: (c, v) => qingSeq(c, v, [PENTA.zhi[1], PENTA.yu[1]]),
  success: (c, v) => qingSeq(c, v, [PENTA.jue[1], PENTA.yu[1]]),
  // 三音上行 角→徵→羽：一件事收尾的"落定"感
  'task-done': (c, v) => qingSeq(c, v, [PENTA.jue[1], PENTA.zhi[1], PENTA.yu[1]]),
  // 四音上行 宫→角→徵→高宫：全站最重的一次肯定（升阶）
  levelup: (c, v) => qingSeq(c, v, [PENTA.gong[1], PENTA.jue[1], PENTA.zhi[1], PENTA.gong[0] * 4]),
  purchase: (c, v) => qingSeq(c, v, [PENTA.shang[1], PENTA.zhi[1]]),
  'intel-new': (c, v) => yunluo(c, v, PENTA.gong[1]),
  chime: (c, v) => qingSeq(c, v, [PENTA.jue[1], PENTA.yu[1]]),

  /* ---- 钟族：提醒、落印、起盘 ---- */
  // 落印：全站最"实"的一声，故音量高于族内其余音（是刻意的强弱极，不是漏改）
  seal: (c, v) => {
    zhong(c, v, 150, { dur: 0.1, decay: 0.16, vol: 0.34 })
    grain(c, v, 0.06, 0.14)
  },
  paper: (c, v) => grain(c, v, 0.1, 0.2),
  compass: (c, v) => {
    zhong(c, v, PENTA.zhi[0], { dur: 0.26, decay: 0.32, vol: 0.14 })
    zhong(c, v, PENTA.yu[0], { dur: 0.2, decay: 0.24, vol: 0.09, delay: 0.08 })
  },
  // 起盘由静入动：低宫 → 宫 → 徵 三音上行
  qimen: (c, v) => zhongSeq(c, v, [PENTA.gong[0] / 2, PENTA.gong[0], PENTA.zhi[0]]),
  // 低频下行（宫 → 低徵）：同族里的"负向"轮廓，仍不出五声，故不刺耳
  error: (c, v) => {
    zhong(c, v, PENTA.gong[0], { dur: 0.16, decay: 0.2, vol: 0.2 })
    zhong(c, v, PENTA.gong[0] / 1.5, { dur: 0.2, decay: 0.24, vol: 0.16, delay: 0.1 })
  },
  deep: (c, v) => zhong(c, v, PENTA.gong[0] / 1.2),
}

/** 同一事件在多少毫秒内的重复触发视为「连点/重复」而合并：
 *  防同一操作响两下（双击、React StrictMode 双调用、事件重复绑定），
 *  也防疯狂连点制造音频节点风暴。不同事件各自独立计时，互不干扰。 */
const THROTTLE_MS = 50
const lastPlayedAt: Partial<Record<SoundEvent, number>> = {}

/**
 * 待播队列 —— **「通知没提示音」的根因修复**。
 *
 * 提醒是在 `setInterval` 里触发的，**不在用户手势内**。此时若 AudioContext 处于挂起态
 * （页面在后台、或从未被激活），浏览器会**拒绝 `resume()`** —— 原来那句
 * `void c.resume()` 只管发起、不管结果，于是这一条提醒的声音就被**永久丢弃**了，
 * 而且没有任何报错线索（用户只听到"通知弹了但没响"）。
 *
 * 修法：上下文没运行时**先把请求记下来**，等它真正 running 再补播（同事件合并，不排队轰鸣）。
 */
const pending = new Set<SoundEvent>()

/** 上下文已运行 → 补播队列里的音效 */
function flushPending(c: AudioContext): void {
  if (c.state !== 'running' || pending.size === 0) return
  const v = currentVolume()
  if (v <= 0) {
    pending.clear()
    return
  }
  for (const ev of pending) {
    lastPlayedAt[ev] = performance.now()
    try {
      PATTERNS[ev]?.(c, v)
    } catch {
      /* 音效失败不影响功能 */
    }
  }
  pending.clear()
}

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
    if (!armed) return // 从未解锁：此刻必然无声，跳过也不该在挂起上下文上调度
    pending.add(ev)
    void c.resume().then(() => flushPending(c)).catch(() => {})
    return
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
      // resume() 必须在用户手势内调用，否则浏览器拒绝；成功后补播此前排队的音效
      if (c.state === 'suspended') void c.resume().then(() => flushPending(c)).catch(() => {})
      else flushPending(c)
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
    const c = ctx // 收窄后再用：回调里 TS 不会保留外层 `if (!ctx) return` 的收窄
    if (document.hidden) {
      if (ctx.state === 'running') void ctx.suspend().catch(() => {})
    } else if (armed && c.state === 'suspended') {
      void c.resume().then(() => flushPending(c)).catch(() => {})
    } else if (armed && c.state === 'running') {
      flushPending(c)
    }
  })
}

/** 直接播放（供组件绑定事件） */
export const sfx = {
  click: () => playSound('ui-click'),
}
