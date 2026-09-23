/**
 * @vitest-environment jsdom
 *
 * 音效（`services/sound.ts`）
 *
 * 用假的 AudioContext 测**调度行为**（有没有真的创建发声节点），而不是测"听感"。
 * 重点是两个容易静默失效的地方：
 *  ① 开关/音量为 0 时必须干净跳过（不创建任何节点、不报错）；
 *  ② **上下文挂起时不能把音丢掉** —— 提醒是在定时器里触发的，此时浏览器会拒绝
 *     `resume()`；排队补播之前，这一条提醒的声音会被**永久丢弃**（用户报的"通知没提示音"）。
 *
 * ⚠️ 每个用例都要 `vi.resetModules()`：sound 模块有模块级状态（armed / pending / 节流时间戳）。
 * 但**重置后必须重新 import 设置 store**，否则测试改的 store 与 sound 读的不是同一个实例
 * （第一版就是这样挂的）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type FakeNode = {
  connect: () => void
  frequency?: { setValueAtTime: () => void; value: number }
  gain?: { setValueAtTime: () => void; exponentialRampToValueAtTime: () => void; value: number }
  Q?: { value: number }
  start?: () => void
  stop?: () => void
  buffer?: unknown
}

/** 记录被创建的发声节点数量（= 真的调度了声音） */
let created = 0
/** 测试里需要改 state（真实类型上它是只读的），故用一个可写视图 */
let live: { state: 'running' | 'suspended' } | null = null

class FakeAudioContext {
  state: 'running' | 'suspended' = 'running'
  currentTime = 0
  sampleRate = 44100
  destination: FakeNode = { connect: () => {} }
  constructor() {
    live = this as unknown as { state: 'running' | 'suspended' }
  }
  private make(): FakeNode {
    created += 1
    return {
      connect: () => {},
      frequency: { setValueAtTime: () => {}, value: 440 },
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, value: 0 },
      Q: { value: 1 },
      start: () => {},
      stop: () => {},
    }
  }
  createOscillator() {
    return this.make()
  }
  createGain() {
    return this.make()
  }
  createBuffer(_c: number, len: number) {
    return { getChannelData: () => new Float32Array(len) }
  }
  createBufferSource() {
    return this.make()
  }
  createBiquadFilter() {
    return this.make()
  }
  /** 真实浏览器里 resume 成功后 state 变 running —— 假的也照做，才能测到"补播" */
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
  suspend() {
    this.state = 'suspended'
    return Promise.resolve()
  }
}

beforeEach(() => {
  created = 0
  live = null
  vi.resetModules()
  Object.defineProperty(window, 'AudioContext', {
    value: FakeAudioContext,
    writable: true,
    configurable: true,
  })
})

/** 建立"已解锁 + 上下文已创建"的 sound 模块，并把发声计数清零 */
async function setup(opts: { enabled?: boolean; volume?: number } = {}) {
  const settings = await import('../stores/useSettingsStore')
  settings.useSettingsStore.getState().set({
    soundEnabled: opts.enabled ?? true,
    soundVolume: opts.volume ?? 0.7,
  })
  const mod = await import('../services/sound')
  // 首个用户手势解锁（armed）—— 否则 playSound 会直接跳过
  window.dispatchEvent(new Event('pointerdown'))
  // 触发一次让上下文真正建立；随后清零计数，用例只测自己关心的那一次
  mod.playSound('ui-click')
  created = 0
  return mod
}

describe('音效开关', () => {
  it('关闭时不出声：不创建任何节点，也不抛错', async () => {
    const { playSound } = await setup({ enabled: false })
    expect(() => playSound('notification')).not.toThrow()
    expect(created).toBe(0)
  })

  it('音量为 0 时同样不出声', async () => {
    const { playSound } = await setup({ volume: 0 })
    playSound('notification')
    expect(created).toBe(0)
  })

  it('开启时真的调度了发声节点', async () => {
    const { playSound } = await setup()
    playSound('notification')
    expect(created).toBeGreaterThan(0)
  })
})

describe('节流', () => {
  it('同一事件 50ms 内重复触发只播一次', async () => {
    const { playSound } = await setup()
    playSound('notification')
    const after1 = created
    playSound('notification')
    expect(created).toBe(after1)
  })

  it('不同事件互不影响', async () => {
    const { playSound } = await setup()
    playSound('notification')
    const after1 = created
    playSound('levelup')
    expect(created).toBeGreaterThan(after1)
  })
})

describe('上下文挂起（通知没声音的根因）', () => {
  it('**挂起时不立即出声，但 resume 成功后补播** —— 不再永久丢失', async () => {
    const { playSound } = await setup()
    const ctx = live!
    ctx.state = 'suspended' // 模拟：提醒触发时上下文挂起（页面在后台 / 未激活）
    playSound('notification')
    const atSuspended = created
    await new Promise((r) => setTimeout(r, 0)) // resume 是异步的
    expect(ctx.state).toBe('running')
    expect(created).toBeGreaterThan(atSuspended) // ← 补播发生了
  })

  it('补播后队列清空，不会重复轰鸣', async () => {
    const { playSound } = await setup()
    live!.state = 'suspended'
    playSound('notification')
    await new Promise((r) => setTimeout(r, 0))
    const afterFlush = created
    // 再触发别的事件（此时已 running）只应播这一次；紧接着重复触发应被节流
    playSound('levelup')
    const delta = created - afterFlush
    playSound('levelup')
    expect(created - afterFlush).toBe(delta)
  })
})
