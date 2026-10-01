/**
 * 情报默认源与「不得伪造情报」（Step 5-1 · C1 / C2 / C5）
 *
 * 三件事必须被钉住，因为它们都是**开箱体验与数据可信度**级别的约定：
 *  1. `日漫新番`（jikan）**不得默认启用** —— 实测该端点连续 504，
 *     默认开着就是让新用户第一眼看到必然失败的红叉；但 provider 不删，用户可自启；
 *  2. **不存在「AI 生成热门仓库当情报」** —— 情报只能来自真实来源；
 *  3. 存量迁移只降级"从未成功抓取过"的候选源，不碰用户已经用起来的源。
 *
 * 第 2 条除行为断言外，还加了一条**源码文本断言**：只要那个 AI 兜底的痕迹
 * （`aiService` / `AI 补足`）再次出现在 github provider 里就会红 ——
 * 行为测试只能覆盖"这次这条路径"，文本断言挡的是"以后换个写法又加回来"。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'
import type { WorkbenchDB } from '../db/db'
import type { IntelligenceSource } from '../types/entities'
import { createId } from '../utils/id'

let db: WorkbenchDB
let registry: typeof import('../services/intelligence/providers/registry')
let githubSrc: string

beforeEach(async () => {
  vi.resetModules()
  await Dexie.delete('yishu-workbench')
  db = (await import('../db/db')).db
  registry = await import('../services/intelligence/providers/registry')
  const mods = import.meta.glob('../services/intelligence/providers/github.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  githubSrc = Object.values(mods)[0] ?? ''
})

function sourceOf(name: string, over: Partial<IntelligenceSource> = {}): IntelligenceSource {
  const now = new Date().toISOString()
  return {
    id: createId(),
    name,
    provider: 'rss',
    url: 'https://example.com/feed',
    category: '科技',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe('默认源：只有实测可靠的才默认启用（C1 / C5）', () => {
  it('默认启用的**只有** GitHub 热榜与少数派', () => {
    const on = registry.defaultSources().filter((s) => s.enabled).map((s) => s.name)
    expect(on.sort()).toEqual(['GitHub 热榜', '少数派'].sort())
  })

  it('**日漫新番（jikan）不得默认启用**，但 provider 与源定义都还在（降为候选，不是删除）', () => {
    const jikan = registry.defaultSources().find((s) => s.name === '日漫新番')
    expect(jikan).toBeTruthy()
    expect(jikan?.enabled).toBe(false)
    expect(jikan?.provider).toBe('jikan')
    // provider 本体没删
    expect(registry.PROVIDERS.jikan).toBeTruthy()
  })

  it('需自建代理的源一律默认停用（没配代理前拉取必失败）', () => {
    const names = ['鸣潮 · B站动态', '网文圈 · B站动态', '量子位 · AI', 'IT之家 · 科技']
    for (const n of names) {
      expect(registry.defaultSources().find((s) => s.name === n)?.enabled, n).toBe(false)
    }
  })

  it('已被降级的默认源不会被「补启用」逻辑重新打开', async () => {
    // 老用户库里存着一条"日漫新番 已停用 且从未抓过"的记录
    const stale = sourceOf('日漫新番', { enabled: false })
    await db.intelligenceSources.put(stale)
    const { revived } = await registry.reviveDisabledDefaults(await db.intelligenceSources.toArray())
    expect(revived).toEqual([])
    expect((await db.intelligenceSources.get(stale.id))?.enabled).toBe(false)
  })
})

describe('存量降级：retireUnreliableDefaults（C1）', () => {
  it('从未成功抓过的候选源 → 关掉', async () => {
    const s = sourceOf('日漫新番', { enabled: true })
    await db.intelligenceSources.put(s)
    const changed = await registry.retireUnreliableDefaults(await db.intelligenceSources.toArray())
    expect(changed).toEqual([s.id])
    expect((await db.intelligenceSources.get(s.id))?.enabled).toBe(false)
  })

  it('**成功抓取过的**不动 —— 它对这个用户是可用的', async () => {
    const s = sourceOf('日漫新番', { enabled: true, lastSuccessAt: '2026-09-01T00:00:00.000Z' })
    await db.intelligenceSources.put(s)
    const changed = await registry.retireUnreliableDefaults(await db.intelligenceSources.toArray())
    expect(changed).toEqual([])
    expect((await db.intelligenceSources.get(s.id))?.enabled).toBe(true)
  })

  it('用户自己试过（有 lastFetchedAt）就不擅自关 —— 尊重现状', async () => {
    const s = sourceOf('日漫新番', { enabled: true, lastFetchedAt: '2026-09-01T00:00:00.000Z' })
    await db.intelligenceSources.put(s)
    const changed = await registry.retireUnreliableDefaults(await db.intelligenceSources.toArray())
    expect(changed).toEqual([])
  })

  it('不碰非候选源（哪怕它从未成功）', async () => {
    const s = sourceOf('我自己加的源', { enabled: true })
    await db.intelligenceSources.put(s)
    const changed = await registry.retireUnreliableDefaults(await db.intelligenceSources.toArray())
    expect(changed).toEqual([])
  })
})

describe('GitHub provider 不得伪造情报（C2）', () => {
  it('源码里不再有任何 AI 兜底的痕迹（只看代码，注释里的历史说明不算）', () => {
    // 剥掉块注释与行注释再断言：注释要能自由地写"这里删掉了什么"，
    // 而**代码**里再出现这些标识就是重新加回来了。
    const code = githubSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toContain('aiService')
    expect(code).not.toContain('AI 补足')
    expect(code).not.toContain('aiFallbackRepo')
    // 仍然是真的抓 GitHub
    expect(code).toContain('api.github.com/search/repositories')
  })

  it('全部查询失败 → **抛错**（交给 run 记 lastError），不返回伪造条目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const provider = registry.PROVIDERS.github
    const source = sourceOf('GitHub 热榜', { provider: 'github', url: undefined })
    await expect(provider.fetch(source)).rejects.toThrow()
    vi.unstubAllGlobals()
  })
})
