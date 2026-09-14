/**
 * 前端 WBI 签名验证
 *
 * 手写 MD5 是这条链路上唯一「易错且致命」的部分（算错 = B 站直接拒绝签名），
 * 所以这里用**固化下来的权威摘要**逐字节对照，而不是拿自己的实现验自己。
 * 期望值来源：RFC 1321 公开测试向量，以及用 Node 内置 crypto 预先算出后固化的
 * 跨分块边界长度（54/55/56/63/64/65/119/120/127/128/129 —— MD5 补位与分块的分界，
 * 手写实现最容易在这里错）与真实的 WBI 查询串摘要。
 *
 * 不 import `node:crypto`：tsconfig.app.json 刻意不含 node 类型，
 * 为了一个测试把 node 全局注入应用配置不划算。
 */
import { describe, expect, it } from 'vitest'
import { keyFromUrl, md5Hex, mixinKeyOf, signedQuery, type WbiKeys } from '../services/intelligence/wbi'

describe('md5Hex 与权威摘要一致', () => {
  const vectors: [string, string][] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
    ['1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a'],
    // 真实场景：WBI 签名用的规范化查询串（百分号编码后的 ASCII，长度跨过 64 字节分块）
    [
      'keyword=%E9%B8%A3%E6%BD%AE&order=pubdate&page=1&page_size=12&search_type=video&wts=1789188990',
      '89963d135161a2ad1a470b689be7768b',
    ],
  ]

  for (const [input, expected] of vectors) {
    it(`len=${input.length}`, () => {
      expect(md5Hex(input)).toBe(expected)
    })
  }

  it('跨 64 字节分块边界长度全部一致', () => {
    const boundary: [number, string][] = [
      [54, 'eced9e0b81ef2bba605cbc5e2e76a1d0'],
      [55, 'ef1772b6dff9a122358552954ad0df65'],
      [56, '3b0c8ac703f828b04c6c197006d17218'],
      [57, '652b906d60af96844ebd21b674f35e93'],
      [63, 'b06521f39153d618550606be297466d5'],
      [64, '014842d480b571495a4a0363793f7367'],
      [65, 'c743a45e0d2e6a95cb859adae0248435'],
      [119, '8a7bd0732ed6a28ce75f6dabc90e1613'],
      [120, '5f61c0ccad4cac44c75ff505e1f1e537'],
      [127, '020406e1d05cdc2aa287641f7ae2cc39'],
      [128, 'e510683b3f5ffe4093d021808bc6ff70'],
      [129, 'b325dc1c6f5e7a2b7cf465b9feab7948'],
      [1000, 'cabe45dcc9ae5b66ba86600cca6b8ba8'],
    ]
    for (const [len, expected] of boundary) {
      expect(md5Hex('a'.repeat(len)), `len=${len}`).toBe(expected)
    }
  })
})

describe('keyFromUrl', () => {
  it('从完整 URL 取文件名并去掉扩展名', () => {
    expect(keyFromUrl('https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png')).toBe(
      '7cd084941338484aae1ad9425b84077c',
    )
  })

  it('空串不抛异常', () => {
    expect(keyFromUrl('')).toBe('')
  })
})

describe('signedQuery', () => {
  const keys: WbiKeys = {
    imgKey: '7cd084941338484aae1ad9425b84077c',
    subKey: '4932caff0ff746eab6f01bf08b70ac45',
  }

  it('mixinKey 固定为 32 位十六进制', () => {
    expect(mixinKeyOf(keys)).toMatch(/^[0-9a-f]{32}$/)
  })

  it('参数名按字典序排序，签名参数追加在末尾', () => {
    const query = signedQuery({ search_type: 'video', keyword: 'a' }, keys, 1700000000)
    const parts = query.split('&')
    // w_rid 是签名结果，按契约追加在最后（不参与排序）
    const wRid = parts.pop()
    expect(wRid).toMatch(/^w_rid=[0-9a-f]{32}$/)
    const names = parts.map((kv) => kv.split('=')[0])
    expect(names).toEqual([...names].sort())
    expect(names).toContain('wts')
    expect(query).toContain('wts=1700000000')
  })

  it('w_rid 等于「查询串 + mixinKey」的 md5（组合方式正确）', () => {
    const query = signedQuery({ search_type: 'video', keyword: '鸣潮', order: 'pubdate' }, keys, 1700000000)
    const [body, wRid] = query.split('&w_rid=')
    // md5 本身已由上面的权威向量钉死，这里验的是「拼装顺序」没写错
    expect(wRid).toBe(md5Hex(body + mixinKeyOf(keys)))
  })

  it('值里的 !\'()* 被剔除（B 站签名契约）', () => {
    const query = signedQuery({ q: "a!b'c(d)e*f" }, keys, 1700000000)
    expect(query).toContain('q=abcdef')
  })

  it('中文关键词按 UTF-8 百分号编码', () => {
    const query = signedQuery({ keyword: '鸣潮' }, keys, 1700000000)
    expect(query).toContain('keyword=%E9%B8%A3%E6%BD%AE')
  })

  it('同一输入同一时刻结果稳定（便于排障复现）', () => {
    const a = signedQuery({ keyword: 'x' }, keys, 1700000000)
    const b = signedQuery({ keyword: 'x' }, keys, 1700000000)
    expect(a).toBe(b)
  })
})
