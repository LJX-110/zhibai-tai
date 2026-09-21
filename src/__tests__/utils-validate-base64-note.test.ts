/**
 * 三个零覆盖工具模块的补测 —— 它们都属于「算错了不报错，只出错结果」那一类：
 *  · validate：导入/表单的数值防线，错了等于把坏数据放进库（体检报告点名为最高风险盲区）；
 *  · base64：加密凭据与同步快照的唯一编解码实现，错了表现为"同步莫名失败"；
 *  · note：展示标题的三级回落，错了表现为"一屏笔记全叫（无题）、搜不到"。
 * 全为纯函数，逐条钉住文件头注释里写出的那些失败模式。
 */
import { describe, expect, it } from 'vitest'
import { parseAmountAllowZero, parsePositiveAmount } from '../utils/validate'
import { b64ToBuf, bufToB64 } from '../utils/base64'
import { noteTitle, withDerivedTitle } from '../utils/note'
import type { Note } from '../types/entities'

describe('金额校验 parsePositiveAmount', () => {
  it('正常值四舍五入到分（浮点尾差不落库）', () => {
    expect(parsePositiveAmount('0.1')).toBe(0.1)
    expect(parsePositiveAmount('1.006')).toBe(1.01)
    expect(parsePositiveAmount('12.344')).toBe(12.34)
    expect(parsePositiveAmount('3')).toBe(3)
  })

  it('分位「正好一半」时的已知边界（不是本函数要解决的，但钉住以免被误改）', () => {
    // 1.005 * 100 在二进制浮点下是 100.49999… → 向下取到 1.00。
    // 金额输入本就是两位小数，实际不会触发；若要严格逢 5 进 1 需改用 EPSILON 修正，
    // 那会改动已落库金额的解析结果 —— 不值得，故维持现状并记录。
    expect(parsePositiveAmount('1.005')).toBe(1)
  })

  it('负数 / 零 / 空 / 非数字一律返回 null —— 不是靠 !Number(x) 静默拦截', () => {
    // 负数是最经典的漏网：!Number('-5') 为 false，旧写法会让它直接入库
    expect(parsePositiveAmount('-5')).toBeNull()
    expect(parsePositiveAmount('0')).toBeNull()
    expect(parsePositiveAmount('')).toBeNull()
    expect(parsePositiveAmount('   ')).toBeNull()
    expect(parsePositiveAmount('abc')).toBeNull()
    expect(parsePositiveAmount('Infinity')).toBeNull()
  })

  it('前后空白不影响解析', () => {
    expect(parsePositiveAmount('  8.5  ')).toBe(8.5)
  })
})

describe('金额校验 parseAmountAllowZero（与上一个只在 0 上有别）', () => {
  it('0 与空串都是合法的 0 —— 未定价条目才能保存', () => {
    // 这是「保存按钮永久禁用」的根因：沿用了会拒 0 的校验，编辑未定价条目就改不动
    expect(parseAmountAllowZero('0')).toBe(0)
    expect(parseAmountAllowZero('')).toBe(0)
  })

  it('负数仍然拒绝', () => {
    expect(parseAmountAllowZero('-1')).toBeNull()
    expect(parseAmountAllowZero('-0.01')).toBeNull()
  })
})

describe('base64 编解码', () => {
  it('往返一致（含全字节值 0-255，不能丢高位）', () => {
    const src = new Uint8Array(256)
    for (let i = 0; i < 256; i++) src[i] = i
    const round = b64ToBuf(bufToB64(src))
    expect(round).toHaveLength(256)
    for (let i = 0; i < 256; i++) expect(round[i]).toBe(i)
  })

  it('空数组与单字节', () => {
    expect(b64ToBuf(bufToB64(new Uint8Array(0)))).toHaveLength(0)
    expect(b64ToBuf(bufToB64(new Uint8Array([7])))[0]).toBe(7)
  })

  it('超过 0x8000 分块边界不爆栈（大快照走的就是这条路）', () => {
    const big = new Uint8Array(0x8000 + 1234)
    for (let i = 0; i < big.length; i++) big[i] = i % 251
    const round = b64ToBuf(bufToB64(big))
    expect(round).toHaveLength(big.length)
    expect(round[0x8000]).toBe(0x8000 % 251)
    expect(round[big.length - 1]).toBe((big.length - 1) % 251)
  })

  it('编解码互为逆运算（随机取样）', () => {
    for (let len of [1, 7, 4096]) {
      const src = new Uint8Array(len)
      for (let i = 0; i < len; i++) src[i] = (i * 37 + 11) % 256
      expect(bufToB64(b64ToBuf(bufToB64(src)))).toBe(bufToB64(src))
    }
  })
})

describe('笔记展示标题 noteTitle', () => {
  const note = (title: string, body: string) => ({ title, body }) as Pick<Note, 'title' | 'body'>

  it('显式标题优先', () => {
    expect(noteTitle(note('读书笔记', '正文内容'))).toBe('读书笔记')
  })

  it('标题留空 → 取正文首行（跳过空行）', () => {
    expect(noteTitle(note('', '第一行\n第二行'))).toBe('第一行')
    expect(noteTitle(note('   ', '\n\n真正的第一行\n'))).toBe('真正的第一行')
  })

  it('全空 → （无题），不是空白', () => {
    expect(noteTitle(note('', ''))).toBe('（无题）')
    expect(noteTitle(note('', '   \n  \n'))).toBe('（无题）')
  })

  it('首行过长截断到 30 字并加省略号', () => {
    const long = '一二三四五六七八九十'.repeat(5) // 50 字
    const out = noteTitle(note('', long))
    expect(out).toHaveLength(31) // 30 + …
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('落库前补标题 withDerivedTitle', () => {
  const note = (title: string, body: string) => ({ title, body }) as Pick<Note, 'title' | 'body'>

  it('已有标题时原样返回（不覆盖用户写的）', () => {
    const n = note('我的标题', '正文')
    expect(withDerivedTitle(n)).toBe(n)
  })

  it('标题留空 → 用正文首行补齐（搜索与列表才有据可依）', () => {
    expect(withDerivedTitle(note('', '第一行\n')).title).toBe('第一行')
  })

  it('正文也空 → 标题仍留空，不写死（无题）（那是展示层的事，不污染数据）', () => {
    expect(withDerivedTitle(note('', '')).title).toBe('')
  })
})
