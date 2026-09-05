/**
 * SoundService —— 统一音效（Web Audio 合成，无需音频文件）
 * 事件：ui-click / ui-confirm / ui-open / ui-close / seal / paper / compass / qimen / sync / success / error / notification
 * 音量默认低；设置中可开关与调节；环境音（未来扩展）由 settings.ambient 控制
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

/** 当前音量（0-1），从设置实时读取 */
function currentVolume(): number {
  const s = useSettingsStore.getState()
  return s.soundEnabled ? s.soundVolume : 0
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
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

const PATTERNS: Record<SoundEvent, (c: AudioContext, v: number) => void> = {
  'ui-click': (c, v) => tone(c, 760, { dur: 0.04, vol: 0.25 * v, type: 'triangle' }),
  'ui-confirm': (c, v) => {
    tone(c, 620, { dur: 0.07, vol: 0.28 * v, type: 'triangle' })
    tone(c, 880, { dur: 0.1, vol: 0.24 * v, type: 'triangle', delay: 0.06 })
  },
  'ui-open': (c, v) => tone(c, 520, { dur: 0.09, vol: 0.22 * v, type: 'sine', decay: 0.12 }),
  'ui-close': (c, v) => tone(c, 400, { dur: 0.09, vol: 0.2 * v, type: 'sine', decay: 0.14 }),
  seal: (c, v) => {
    // 印章：低频落印 + 一点纸面
    tone(c, 140, { dur: 0.1, vol: 0.5 * v, type: 'sine', decay: 0.14 })
    paperNoise(c, { dur: 0.06, vol: 0.14 * v })
  },
  paper: (c, v) => paperNoise(c, { dur: 0.1, vol: 0.2 * v }),
  compass: (c, v) => {
    tone(c, 480, { dur: 0.28, vol: 0.16 * v, type: 'sine', decay: 0.3 })
    tone(c, 600, { dur: 0.2, vol: 0.1 * v, type: 'sine', delay: 0.08, decay: 0.2 })
  },
  qimen: (c, v) => {
    tone(c, 220, { dur: 0.4, vol: 0.2 * v, type: 'sine', decay: 0.5 })
    tone(c, 330, { dur: 0.3, vol: 0.12 * v, type: 'sine', delay: 0.1, decay: 0.4 })
    tone(c, 440, { dur: 0.2, vol: 0.08 * v, type: 'sine', delay: 0.2, decay: 0.3 })
  },
  sync: (c, v) => {
    tone(c, 660, { dur: 0.08, vol: 0.22 * v, type: 'triangle' })
    tone(c, 990, { dur: 0.14, vol: 0.18 * v, type: 'triangle', delay: 0.07 })
  },
  success: (c, v) => {
    tone(c, 660, { dur: 0.09, vol: 0.24 * v, type: 'triangle' })
    tone(c, 880, { dur: 0.14, vol: 0.2 * v, type: 'triangle', delay: 0.08 })
  },
  error: (c, v) => {
    // 低柔双音（三角波），与水墨气质一致，不用刺耳的方波
    tone(c, 240, { dur: 0.16, vol: 0.18 * v, type: 'triangle' })
    tone(c, 200, { dur: 0.2, vol: 0.15 * v, type: 'triangle', delay: 0.1 })
  },
  notification: (c, v) => {
    tone(c, 520, { dur: 0.08, vol: 0.2 * v, type: 'sine' })
    tone(c, 700, { dur: 0.12, vol: 0.16 * v, type: 'sine', delay: 0.09 })
  },
}

/** 播放一次音效（尊重开关与音量） */
export function playSound(ev: SoundEvent): void {
  const v = currentVolume()
  if (v <= 0) return
  const c = audio()
  if (!c) return
  try {
    PATTERNS[ev]?.(c, v)
  } catch {
    /* 音效失败不影响功能 */
  }
}

/** 主动初始化音频上下文（需在用户手势中调用一次） */
export function primeAudio(): void {
  audio()
}

/** 直接播放（供组件绑定事件） */
export const sfx = {
  click: () => playSound('ui-click'),
  confirm: () => playSound('ui-confirm'),
  open: () => playSound('ui-open'),
  close: () => playSound('ui-close'),
  seal: () => playSound('seal'),
  paper: () => playSound('paper'),
  compass: () => playSound('compass'),
  qimen: () => playSound('qimen'),
  sync: () => playSound('sync'),
  success: () => playSound('success'),
  error: () => playSound('error'),
  notification: () => playSound('notification'),
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
