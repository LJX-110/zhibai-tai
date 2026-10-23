/**
 * Provider 公共工具：配置解析与日期容错
 *
 * 两条都来自真实故障形态：
 *  · 配置 JSON 写坏时**静默回落到默认值**，来源会带着默认参数空跑，
 *    用户只看到「抓取成功但 0 条」，真正的问题被藏起来；
 *  · 上游日期写成 "昨天" / "Q4 2024" 时，`toISOString()` 抛 RangeError，
 *    **一条坏数据就让整个源失败**。
 * 这里锁住「配置错要报出来」「坏日期只丢日期、不丢条目」。
 */
import { describe, expect, it } from 'vitest'
import type { IntelligenceSource } from '../types/entities'
import { cfgOf, toIsoDate } from '../services/intelligence/providers/index'

const sourceOf = (config?: string) => ({ config } as unknown as IntelligenceSource)

describe('cfgOf', () => {
  it('没写配置返回空对象', () => {
    expect(cfgOf(sourceOf())).toEqual({})
  })

  it('配置写了但不是合法 JSON → 明确报 config 错（不静默回落）', () => {
    expect(() => cfgOf(sourceOf('{bad'))).toThrow(/^config:/)
  })
})

describe('toIsoDate', () => {
  it('合法日期转 ISO', () => {
    expect(toIsoDate('2026-10-23T00:00:00Z')).toBe('2026-10-23T00:00:00.000Z')
    expect(toIsoDate(1_700_000_000_000)).toBe('2023-11-14T22:13:20.000Z')
  })

  it('坏日期只返回 undefined，不抛错', () => {
    expect(toIsoDate('昨天')).toBeUndefined()
    expect(toIsoDate('2026-13-01')).toBeUndefined()
    expect(toIsoDate('')).toBeUndefined()
    expect(toIsoDate(undefined)).toBeUndefined()
  })
})
