/**
 * 藏 · 介质数据化
 *
 * 介质由「写死的枚举」改为 categories 业务表里 scope = `collection_medium` 的数据行，
 * 与「术的类型」（`ai_type`）同一套机制。这里锁三件最容易改坏的事：
 *  ① 存量旧值（枚举键 novel）必须仍能显示出中文名 —— 迁移没跑到或用户跳过时不能显示空白；
 *  ② 自定义介质名原样透传 —— 数据化的意义就在这里；
 *  ③ **介质与用途仍是两个独立维度**，默认清单不得再重合出同名项（这是当初拆开的原因）。
 */
import { describe, expect, it } from 'vitest'
import {
  COLLECTION_MEDIUM_LEGACY_LABEL,
  DEFAULT_CATEGORIES,
} from '../services/categories'
import { typeLabel, typeStripe } from '../pages/collection/shared'
import type { CollectionType } from '../types/entities'

describe('介质显示名 typeLabel', () => {
  it('存量枚举键映射为中文名（迁移未跑到时不显示空白）', () => {
    expect(typeLabel('novel')).toBe('小说')
    expect(typeLabel('ui_ref')).toBe('UI 参考')
    expect(typeLabel('custom')).toBe('自定义')
  })

  it('自定义介质名原样透传', () => {
    expect(typeLabel('播客')).toBe('播客')
    expect(typeLabel('漫画')).toBe('漫画')
  })

  it('空值给「未分类」而不是空白', () => {
    expect(typeLabel('')).toBe('未分类')
  })

  it('迁移映射覆盖全部旧枚举键（漏一个就有旧记录显示成枚举键）', () => {
    const keys: CollectionType[] = [
      'novel',
      'anime',
      'game',
      'film',
      'book',
      'github',
      'project',
      'ui_ref',
      'inspiration',
      'custom',
    ]
    for (const k of keys) expect(COLLECTION_MEDIUM_LEGACY_LABEL[k]).toBeTruthy()
  })
})

describe('介质默认清单', () => {
  it('覆盖全部旧枚举名 —— 迁移后每个旧值都能在下拉里选中，不会「保存即改名」', () => {
    const mediums = DEFAULT_CATEGORIES.collection_medium
    for (const name of Object.values(COLLECTION_MEDIUM_LEGACY_LABEL)) {
      expect(mediums).toContain(name)
    }
  })

  it('介质与用途（collection）不共用数据、且无同名项', () => {
    const mediums = new Set(DEFAULT_CATEGORIES.collection_medium)
    const categories = new Set(DEFAULT_CATEGORIES.collection)
    // 两个维度必须是两份独立清单（共用会让界面出现两个同名下拉）
    expect(mediums).not.toEqual(categories)
    const overlap = [...categories].filter((c) => mediums.has(c))
    expect(overlap).toEqual([])
  })
})

describe('介质签条色 typeStripe', () => {
  it('同一介质恒得同一色（列表卡与详情头必须一致）', () => {
    expect(typeStripe('播客')).toBe(typeStripe('播客'))
    expect(typeStripe('小说')).toBe(typeStripe('小说'))
  })

  it('GitHub / 项目保留既有强调色，新旧两种写法都对得上', () => {
    expect(typeStripe('github')).toBe('bg-teal/60')
    expect(typeStripe('GitHub')).toBe('bg-teal/60')
    expect(typeStripe('project')).toBe('bg-cinnabar/55')
    expect(typeStripe('项目')).toBe('bg-cinnabar/55')
  })
})
