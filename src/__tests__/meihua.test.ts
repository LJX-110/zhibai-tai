/**
 * 梅花易数起卦 + 六十四卦数据
 *
 * 这两块此前**零覆盖**，而且属于最危险的一类：算错了不会报错，只会给出一个**错误的卦**，
 * 页面上照样渲染得煞有介事。所以这里不写"不抛错就算过"，而是用**手工推演的期望值**
 * 逐项钉住每一步：
 *
 *   爻线（自下而上）→ 互卦（2/3/4 为下、3/4/5 为上）→ 变卦（翻动爻）→ 体用取法 →
 *   五行生克给出的断语。
 *
 * 另有一处**静默兜底**是本文件的重点保护对象：`hexagramOf` 找不到键时返回 `HEXAGRAMS[0]`
 * （乾），也就是说少写一卦不会报错，只会让某个组合永远显示"乾"。下面用「64 种组合逐一
 * 回查」把这条兜底钉死在"永远走不到"上。
 */
import { describe, expect, it } from 'vitest'
import {
  HEXAGRAMS,
  TRIGRAMS,
  hexagramOf,
  trigramByLines,
  trigramByNum,
} from '../services/occult/hexagrams64'
import { MEIHUA_METHOD_LABEL, castMeihua, type MeihuaMethod } from '../services/occult/meihua'

describe('六十四卦数据完整性', () => {
  it('八经卦：先天数 1-8 齐全，三爻组合互不相同', () => {
    expect(TRIGRAMS).toHaveLength(8)
    expect(TRIGRAMS.map((t) => t.num).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const shapes = new Set(TRIGRAMS.map((t) => t.lines.join('')))
    expect(shapes.size).toBe(8)
  })

  it('trigramByNum 按先天数取卦，0 与 8 都归坤', () => {
    expect(trigramByNum(1).name).toBe('乾')
    expect(trigramByNum(8).name).toBe('坤')
    // 余 0 作 8 是本项目的取模约定（起卦四式都依赖它）
    expect(trigramByNum(0).name).toBe('坤')
    expect(trigramByNum(16).name).toBe('坤')
    expect(trigramByNum(9).name).toBe('乾')
  })

  it('trigramByLines 按爻线反查', () => {
    expect(trigramByLines([1, 1, 1]).name).toBe('乾')
    expect(trigramByLines([0, 0, 0]).name).toBe('坤')
    expect(trigramByLines([1, 0, 1]).name).toBe('离')
    expect(trigramByLines([0, 1, 1]).name).toBe('巽')
  })

  it('恰好 64 卦，键唯一，卦象名 = 上卦名 + 下卦名', () => {
    expect(HEXAGRAMS).toHaveLength(64)
    expect(new Set(HEXAGRAMS.map((h) => h.key)).size).toBe(64)
    for (const h of HEXAGRAMS) {
      const [upper, lower] = h.key.split('-')
      const u = TRIGRAMS.find((t) => t.key === upper)!
      const l = TRIGRAMS.find((t) => t.key === lower)!
      expect(h.xiang).toBe(`${u.name}${l.name}`)
      expect(h.guoci.length).toBeGreaterThan(0)
      expect(h.name.length).toBeGreaterThan(0)
    }
  })

  it('8×8 组合全部有对应卦（防 hexagramOf 静默回退到乾）', () => {
    for (const u of TRIGRAMS) {
      for (const l of TRIGRAMS) {
        // 少了任何一卦，这里都会拿到 HEXAGRAMS[0]（乾）从而键不匹配
        expect(hexagramOf(u, l).key).toBe(`${u.key}-${l.key}`)
      }
    }
  })
})

describe('起卦四式 · 两数起卦', () => {
  it('乾为天遇动爻 2：互卦仍乾，变卦天火同人', () => {
    const c = castMeihua('numbers', { n1: 1, n2: 1 })
    expect(c.n1).toBe(1)
    expect(c.n2).toBe(1)
    // 动爻 = (1+1) % 6 → 但余 0 才作 6，故此处为 2
    expect(c.dongYao).toBe(2)
    expect(c.benGua.key).toBe('qian-qian')
    expect(c.benGua.name).toBe('乾')
    // 六爻全阳 → 互卦仍是乾为天
    expect(c.huGua.key).toBe('qian-qian')
    // 翻第 2 爻（自下而上）→ 下卦由乾(111) 变离(101) → 上乾下离 = 天火同人
    expect(c.bianGua.key).toBe('qian-li')
    expect(c.bianGua.name).toBe('同人')
    // 动爻在下卦 → 下为用、上为体；乾金对乾金 → 比和
    expect(c.ti.trigram.name).toBe('乾')
    expect(c.yong.trigram.name).toBe('乾')
    expect(c.verdict).toBe('吉')
    expect(c.relation).toContain('比和')
  })

  it('天火同人（上乾下离）遇动爻 4：互卦天风姤，变卦风火家人', () => {
    const c = castMeihua('numbers', { n1: 1, n2: 3 })
    expect(c.dongYao).toBe(4)
    expect(c.benGua.key).toBe('qian-li')
    expect(c.benGua.name).toBe('同人')
    // 爻线（自下而上）= 离[1,0,1] + 乾[1,1,1]；互卦取下卦 2/3/4 与上卦 3/4/5
    expect(c.huGua.key).toBe('qian-xun')
    expect(c.huGua.name).toBe('姤')
    // 动爻 4 在上卦 → 上为用、下为体：体离火、用乾金 → 火克金 → 体克用
    expect(c.ti.trigram.name).toBe('离')
    expect(c.yong.trigram.name).toBe('乾')
    expect(c.verdict).toBe('小吉')
    expect(c.relation).toContain('体（火）克用（金）')
    // 翻第 4 爻：上卦由乾(111) 变巽(011) → 巽上离下 = 风火家人
    expect(c.bianGua.key).toBe('xun-li')
    expect(c.bianGua.name).toBe('家人')
  })

  it('输入为非正整数时取绝对值并截断；为 0 则明确报错', () => {
    expect(castMeihua('numbers', { n1: -1, n2: 1.9 }).n1).toBe(1)
    expect(castMeihua('numbers', { n1: -1, n2: 1.9 }).n2).toBe(1)
    expect(() => castMeihua('numbers', { n1: 0, n2: 3 })).toThrow('请输入两个非零数字')
    expect(() => castMeihua('numbers', { n1: undefined, n2: 3 })).toThrow()
  })

  it('余数为 0 时取 8（坤）与 6（上爻）', () => {
    const c = castMeihua('numbers', { n1: 8, n2: 16 })
    expect(c.n1).toBe(8)
    expect(c.n2).toBe(8)
    // (8+16) % 6 = 0 → 作 6
    expect(c.dongYao).toBe(6)
    expect(c.benGua.key).toBe('kun-kun')
    // 动爻 6 是最上爻：坤(000) 的上爻由阴变阳 → 自下而上 (001) = 艮 → 艮上坤下 = 山地剥。
    // 这里很容易顺手写成"震"，但震是 (100)（阳在最下），翻的是初爻不是上爻。
    expect(c.bianGua.key).toBe('gen-kun')
    expect(c.bianGua.name).toBe('剥')
  })
})

describe('起卦四式 · 字占', () => {
  it('偶数平分：前后各半', () => {
    const c = castMeihua('words', { words: '你好世界' })
    expect(c.seed).toContain('（4 字）')
    // 4 字 → 前 2 后 2 → 兑(2) / 兑(2)；(2+2)%6 = 4
    expect(c.n1).toBe(2)
    expect(c.n2).toBe(2)
    expect(c.dongYao).toBe(4)
    expect(c.benGua.key).toBe('dui-dui')
  })

  it('奇数前少一字：前半 ceil、后半 floor', () => {
    const c = castMeihua('words', { words: '你好世' })
    // 3 字 → 前 2（兑）后 1（乾）
    expect(c.n1).toBe(2)
    expect(c.n2).toBe(1)
    expect(c.benGua.key).toBe('dui-qian')
    expect(c.benGua.name).toBe('夬')
  })

  it('标点与空白不计入字数', () => {
    const withPunct = castMeihua('words', { words: '你好，世界！' })
    const plain = castMeihua('words', { words: '你好世界' })
    expect(withPunct.n1).toBe(plain.n1)
    expect(withPunct.n2).toBe(plain.n2)
    expect(withPunct.dongYao).toBe(plain.dongYao)
    // 原文入档时已去掉标点，便于回看"当时默念的是什么"
    expect(withPunct.seed).toContain('「你好世界」')
  })

  it('只有标点 / 全空 → 报错', () => {
    expect(() => castMeihua('words', { words: '，。！？' })).toThrow('请默念心中所想之事')
    expect(() => castMeihua('words', {})).toThrow()
  })
})

describe('起卦四式 · 年月日时与抽签', () => {
  it('年月日时起卦落在合法域，且依据入档', () => {
    const c = castMeihua('time', {})
    expect(c.n1).toBeGreaterThanOrEqual(1)
    expect(c.n1).toBeLessThanOrEqual(8)
    expect(c.n2).toBeGreaterThanOrEqual(1)
    expect(c.n2).toBeLessThanOrEqual(8)
    expect(c.dongYao).toBeGreaterThanOrEqual(1)
    expect(c.dongYao).toBeLessThanOrEqual(6)
    expect(c.seed).toContain('公历')
    expect(c.seed).toContain('简化起卦法')
  })

  it('抽签起卦每次都落在合法域，且都能查到对应卦', () => {
    const keys = new Set(HEXAGRAMS.map((h) => h.key))
    for (let i = 0; i < 60; i++) {
      const c = castMeihua('draw', {})
      expect(c.n1).toBeGreaterThanOrEqual(1)
      expect(c.n1).toBeLessThanOrEqual(8)
      expect(c.n2).toBeGreaterThanOrEqual(1)
      expect(c.n2).toBeLessThanOrEqual(8)
      expect(c.dongYao).toBeGreaterThanOrEqual(1)
      expect(c.dongYao).toBeLessThanOrEqual(6)
      // 不能落到"查不到就返回乾"的兜底上
      expect(keys.has(c.benGua.key)).toBe(true)
      expect(keys.has(c.huGua.key)).toBe(true)
      expect(keys.has(c.bianGua.key)).toBe(true)
    }
  })

  it('占问之事去掉首尾空白后入档；空串视为未填', () => {
    expect(castMeihua('draw', { question: '  此事可行否  ' }).question).toBe('此事可行否')
    expect(castMeihua('draw', { question: '   ' }).question).toBeUndefined()
  })
})

describe('体用生克断语', () => {
  /** 用两数起卦构造指定的体用五行关系，逐一核对断语 */
  const cases: { n1: number; n2: number; ti: string; yong: string; verdict: string; piece: string }[] = [
    // 上乾金 / 下乾金，动爻 2（下卦）→ 体乾金、用乾金
    { n1: 1, n2: 1, ti: '金', yong: '金', verdict: '吉', piece: '比和' },
    // 上离火 / 下坤土，动爻 5（上卦）→ 体坤土、用离火，火生土
    { n1: 3, n2: 8, ti: '土', yong: '火', verdict: '大吉', piece: '生体' },
    // 上震木 / 下离火，动爻 1（下卦）→ 体震木、用离火，木生火
    { n1: 4, n2: 3, ti: '木', yong: '火', verdict: '小凶', piece: '生用' },
    // 上乾金 / 下离火，动爻 4（上卦）→ 体离火、用乾金，火克金
    { n1: 1, n2: 3, ti: '火', yong: '金', verdict: '小吉', piece: '克用' },
    // 上离火 / 下乾金，动爻 4（上卦）→ 体乾金、用离火，火克金（用压体）
    { n1: 3, n2: 1, ti: '金', yong: '火', verdict: '凶', piece: '克体' },
  ]

  for (const c of cases) {
    it(`体${c.ti} / 用${c.yong} → ${c.verdict}`, () => {
      const cast = castMeihua('numbers', { n1: c.n1, n2: c.n2 })
      expect(cast.ti.element).toBe(c.ti)
      expect(cast.yong.element).toBe(c.yong)
      expect(cast.verdict).toBe(c.verdict)
      expect(cast.relation).toContain(c.piece)
      // 总断把本卦/互卦/变卦与断语串成一句，四个部分都得在
      expect(cast.summary).toContain(cast.benGua.name)
      expect(cast.summary).toContain(cast.huGua.name)
      expect(cast.summary).toContain(cast.bianGua.name)
      expect(cast.summary).toContain(c.verdict)
    })
  }
})

describe('起卦元信息', () => {
  it('四种起法都有中文标签', () => {
    for (const m of ['time', 'numbers', 'words', 'draw'] as MeihuaMethod[]) {
      expect(MEIHUA_METHOD_LABEL[m]).toBeTruthy()
    }
  })
})
