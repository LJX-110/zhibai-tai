/**
 * 环境音（极轻，默认关）—— 与音效**分开**：它不参与音效的节流与音色体系，
 * 而是常驻的一层底噪（纸 / 风 / 静室感），由 `settings.ambientEnabled` 独立控制。
 *
 * 从 `sound.ts` 抽出来的直接原因：加了待播队列后 sound.ts 到 424 行，超了单文件 400 行硬限；
 * 而环境音本就是独立关注点，抽出去比硬压注释更合理。
 */
import { audio } from './sound'

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
