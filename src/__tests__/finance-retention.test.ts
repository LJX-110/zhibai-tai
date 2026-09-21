/**
 * 补两个测试盲区：财的分类标签（纯函数）+ 情报保留策略（裁剪顺序）
 *
 * 情报那块是"算错了不报错"的典型：裁剪顺序错了只会**悄悄删掉用户还想看的东西**
 * （未读的被删、已读的留着），界面上完全看不出来，且删除不可撤销。
 * 而"删了却没写墓碑"的危害更隐蔽 —— 下次同步会被远端快照原样加回，上限形同虚设。
 */
import { describe, expect, it } from 'vitest'
import { categoryLabel, FINANCE_CATEGORIES } from '../services/finance'
import { clearReadIntelligence, KEEP_LIMIT_OPTIONS, pruneIntelligence } from '../services/intelligence/retention'
import { useIntelligenceStore } from '../stores/useIntelligenceStore'
import { db } from '../db/db'
import type { FinanceCategory, IntelligenceItem } from '../types/entities'

describe('财的分类标签 categoryLabel', () => {
  it('每个分类都映射出中文名（无空标签）', () => {
    for (const c of FINANCE_CATEGORIES) {
      expect(categoryLabel(c.value)).toBe(c.label)
      expect(categoryLabel(c.value)).not.toBe(c.value)
    }
  })

  it('未知分类原样返回而不是空白', () => {
    expect(categoryLabel('不存在的分类' as FinanceCategory)).toBe('不存在的分类')
  })
})

describe('情报保留策略 pruneIntelligence', () => {
  const item = (id: string, read: boolean, at: string) =>
    ({
      id,
      title: `情报 ${id}`,
      sourceId: 's1',
      sourceType: 'github',
      url: `https://example.com/${id}`,
      read,
      publishedAt: at,
      createdAt: at,
      updatedAt: at,
    }) as unknown as IntelligenceItem

  it('未超过上限时不删（含上限 0 = 不限制）', async () => {
    await useIntelligenceStore.getState().add(item('k1', true, '2026-09-01T00:00:00Z'))
    await expect(pruneIntelligence(0)).resolves.toEqual({ removed: 0 })
    await expect(pruneIntelligence(500)).resolves.toEqual({ removed: 0 })
    expect(await db.intelligenceItems.count()).toBe(1)
    await useIntelligenceStore.getState().remove('k1')
  })

  it('超限后**已读优先删**，同组内删更旧的 —— 留下的是「未读 + 较新」', async () => {
    // 3 条已读（一旧一新）+ 1 条未读，上限 2 → 应删掉最旧的两条已读
    await useIntelligenceStore.getState().add(item('p_old', true, '2026-01-01T00:00:00Z'))
    await useIntelligenceStore.getState().add(item('p_mid', true, '2026-05-01T00:00:00Z'))
    await useIntelligenceStore.getState().add(item('p_new', true, '2026-09-01T00:00:00Z'))
    await useIntelligenceStore.getState().add(item('p_unread', false, '2026-02-01T00:00:00Z'))

    await expect(pruneIntelligence(2)).resolves.toEqual({ removed: 2 })

    const left = (await db.intelligenceItems.toArray()).map((x) => x.id).sort()
    expect(left).toEqual(['p_new', 'p_unread'])

    for (const id of ['p_new', 'p_unread']) await useIntelligenceStore.getState().remove(id)
  })

  it('删除**必须写墓碑** —— 否则下次同步会被远端快照加回，上限形同虚设', async () => {
    await useIntelligenceStore.getState().add(item('t1', true, '2026-01-01T00:00:00Z'))
    await useIntelligenceStore.getState().add(item('t2', false, '2026-09-01T00:00:00Z'))
    await pruneIntelligence(1)

    const tombs = await db.tombstones.toArray()
    expect(tombs.some((t) => t.entityId === 't1')).toBe(true)
    await useIntelligenceStore.getState().remove('t2')
  })
})

describe('清理已读 clearReadIntelligence', () => {
  it('只删已读，未读与收藏的留着', async () => {
    const mk = (id: string, read: boolean, fav = false) =>
      ({
        id,
        title: id,
        sourceId: 's1',
        sourceType: 'github',
        read,
        favorite: fav,
        publishedAt: '2026-09-01T00:00:00Z',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      }) as unknown as IntelligenceItem

    await useIntelligenceStore.getState().add(mk('c_read', true))
    await useIntelligenceStore.getState().add(mk('c_unread', false))
    await useIntelligenceStore.getState().add(mk('c_fav', true, true))

    const { removed } = await clearReadIntelligence()
    expect(removed).toBe(2) // 已读的两条（含收藏的那条也读过了）

    const left = (await db.intelligenceItems.toArray()).map((x) => x.id)
    expect(left).toEqual(['c_unread'])
    await useIntelligenceStore.getState().remove('c_unread')
  })
})

describe('上限档位 KEEP_LIMIT_OPTIONS', () => {
  it('含 0 且语义为「不限制」', () => {
    expect(KEEP_LIMIT_OPTIONS).toContain(0)
    expect(KEEP_LIMIT_OPTIONS.length).toBeGreaterThan(1)
  })
})
