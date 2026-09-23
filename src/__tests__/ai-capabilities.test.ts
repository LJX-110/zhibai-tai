/**
 * 系统能力接缝（定位 / 剪贴板）
 *
 * 这块最要紧的不是"能不能取到值"，而是**取不到时说了什么** ——
 * 模型非常自然地会"猜"一个城市名或一段剪贴板内容，而用户会以为那是真实读数。
 * 所以下面重点钉住三类措辞：未授权要说"别编造"、被拒要说"需重新授权"、过期不注入。
 */
import { describe, expect, it } from 'vitest'
import { buildCapabilityContext, capabilityLine } from '../components/ai/capability-context'
import { isFresh } from '../services/capabilities'
import { VALUE_TTL_MS, type CapabilitySnapshot } from '../services/capabilities'

const snap = (o: Partial<CapabilitySnapshot> = {}): CapabilitySnapshot => ({
  kind: 'geo',
  label: '定位',
  state: 'idle',
  value: null,
  at: null,
  ...o,
})

describe('capabilityLine：措辞契约', () => {
  it('**未取到值时明确要求模型不要编造** —— 这是防幻觉的关键一句', () => {
    const line = capabilityLine(snap({ state: 'idle', value: null }), 0)
    expect(line).toContain('尚未取到')
    expect(line).toContain('不要编造')
  })

  it('被拒绝时说明"需用户重新授权"，同样不许编造', () => {
    const line = capabilityLine(snap({ state: 'denied' }), 0)
    expect(line).toContain('拒绝')
    expect(line).toContain('不要假设或编造')
  })

  it('已授权且值新鲜 → 带上值与"几分钟前"', () => {
    const now = 10 * 60_000
    const line = capabilityLine(snap({ state: 'granted', value: '纬度 31.230，经度 121.470', at: now - 120_000 }), now)
    expect(line).toContain('纬度 31.230')
    expect(line).toContain('2 分钟前')
  })

  it('**值过期时退回"尚未取到"** —— 十分钟前的坐标比没有更糟（模型会当成现在的）', () => {
    const now = 60 * 60_000
    const stale = snap({ state: 'granted', value: '纬度 31.230，经度 121.470', at: now - VALUE_TTL_MS - 1 })
    const line = capabilityLine(stale, now)
    expect(line).not.toContain('31.230')
    expect(line).toContain('尚未取到')
  })

  it('浏览器不支持的能力不产生任何行（不打扰模型）', () => {
    expect(capabilityLine(snap({ state: 'unsupported' }), 0)).toBe('')
  })
})

describe('buildCapabilityContext：按问题门控', () => {
  const fresh = snap({ state: 'granted', value: '纬度 31.230，经度 121.470', at: 1000 })

  it('问位置类问题才注入定位', () => {
    for (const q of ['附近有什么好吃的', '我在哪', '去公司有多远', '通勤要多久']) {
      expect(buildCapabilityContext(q, { snaps: [fresh], now: 1000 })).toHaveLength(1)
    }
  })

  it('**无关的问题不注入** —— 白占 prompt 且平白暴露信息', () => {
    for (const q of ['今天有什么课', '帮我记一笔 20 元', '上周花了多少']) {
      expect(buildCapabilityContext(q, { snaps: [fresh], now: 1000 })).toEqual([])
    }
  })

  it('剪贴板有独立的关键词门控（问位置不会带上剪贴板）', () => {
    const clip = snap({ kind: 'clipboard', label: '剪贴板', state: 'granted', value: '一段文本', at: 1000 })
    expect(buildCapabilityContext('我在哪', { snaps: [fresh, clip], now: 1000 })).toHaveLength(1)
    expect(buildCapabilityContext('把我刚复制的记下来', { snaps: [fresh, clip], now: 1000 })).toHaveLength(1)
  })

  it('没有快照时返回空数组（不崩）', () => {
    expect(buildCapabilityContext('附近', { snaps: [], now: 0 })).toEqual([])
  })
})

describe('isFresh：时效', () => {
  it('刚取到算新鲜', () => {
    expect(isFresh(snap({ value: 'x', at: 1000 }), 1000)).toBe(true)
  })
  it('超过 TTL 不算', () => {
    expect(isFresh(snap({ value: 'x', at: 0 }), VALUE_TTL_MS)).toBe(false)
  })
  it('没取过值不算（value 为 null）', () => {
    expect(isFresh(snap({ value: null, at: Date.now() }))).toBe(false)
  })
})
