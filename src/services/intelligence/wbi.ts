/**
 * B 站 WBI 签名（浏览器端实现）
 *
 * 为什么要放在前端：签名只需要 md5，而浏览器的 Web Crypto 不提供 md5。
 * 但这不该成为「必须自建签名服务」的理由 —— 自带一份 ASCII 版 MD5（约 3KB）后，
 * 浏览器就能自己算 `w_rid`，转发端点只需负责跨域，职责被压到最小：
 * 换成任何国内可达的转发通道都能用，不再绑死在某个云服务的运行时上。
 *
 * 签名输入是我们自己拼的、已百分号编码的 ASCII 查询串，
 * 因此这里只处理单字节字符，省掉 UTF-8 编码那一段。
 */

/** WBI 置换表（B 站社区公开的固定表） */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

/** 每轮左移位数（0-15 / 16-31 / 32-47 / 48-63 各一组） */
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

/** 正弦常量表（T[i] = floor(abs(sin(i+1)) * 2^32) 的有符号 32 位形式） */
const SINES = [
  -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426,
  -1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162,
  1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632,
  643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
  568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784,
  1735328473, -1926607734, -378558, -2022574463, 1839030562, -35309556,
  -1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222,
  -722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
  -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606,
  -1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649,
  -145523070, -1120210379, 718787259, -343485551,
]

function safeAdd(x: number, y: number): number {
  const low = (x & 0xffff) + (y & 0xffff)
  const high = (x >> 16) + (y >> 16) + (low >> 16)
  return (high << 16) | (low & 0xffff)
}

function rol(num: number, cnt: number): number {
  return (num << cnt) | (num >>> (32 - cnt))
}

/** ASCII 字符串 → 32 位小端整数数组 */
function toWords(ascii: string): number[] {
  const words: number[] = []
  for (let i = 0; i < ascii.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | ((ascii.charCodeAt(i) & 0xff) << ((i % 4) * 8))
  }
  return words
}

function compress(input: number[], bitLen: number): [number, number, number, number] {
  const words = input.slice()
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << bitLen % 32)
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen

  let a = 1732584193
  let b = -271733879
  let c = -1732584194
  let d = 271733878

  for (let i = 0; i < words.length; i += 16) {
    const oa = a
    const ob = b
    const oc = c
    const od = d
    for (let step = 0; step < 64; step++) {
      let f: number
      let g: number
      if (step < 16) {
        f = (b & c) | (~b & d)
        g = step
      } else if (step < 32) {
        f = (b & d) | (c & ~d)
        g = (5 * step + 1) % 16
      } else if (step < 48) {
        f = b ^ c ^ d
        g = (3 * step + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * step) % 16
      }
      const word = words[i + g] || 0
      const tmp = d
      d = c
      c = b
      b = safeAdd(b, rol(safeAdd(safeAdd(a, f), safeAdd(word, SINES[step])), SHIFTS[step]))
      a = tmp
    }
    a = safeAdd(a, oa)
    b = safeAdd(b, ob)
    c = safeAdd(c, oc)
    d = safeAdd(d, od)
  }
  return [a, b, c, d]
}

function wordToHex(word: number): string {
  let hex = ''
  for (let i = 0; i < 4; i++) {
    hex += ((word >> (i * 8 + 4)) & 0x0f).toString(16) + ((word >> (i * 8)) & 0x0f).toString(16)
  }
  return hex
}

/** md5 十六进制摘要（输入须为 ASCII / 已编码字符串） */
export function md5Hex(ascii: string): string {
  return compress(toWords(ascii), ascii.length * 8).map(wordToHex).join('')
}

export interface WbiKeys {
  imgKey: string
  subKey: string
}

/** 从 nav 接口返回的 img_url / sub_url 中取出文件名（去路径去扩展名） */
export function keyFromUrl(url: string): string {
  const file = url.slice(url.lastIndexOf('/') + 1)
  return file.split('.')[0] ?? ''
}

/** 拼出 32 位 mixinKey */
export function mixinKeyOf(keys: WbiKeys): string {
  const source = keys.imgKey + keys.subKey
  return MIXIN_KEY_ENC_TAB.map((i) => source[i]).join('').slice(0, 32)
}

/**
 * 生成带签名的查询串。
 * 契约（错一个都过不了）：参数名按字典序排序、值需去掉 `!'()*`、
 * 追加 `wts` 时间戳、对「查询串 + mixinKey」求 md5 作为 `w_rid`。
 */
export function signedQuery(
  params: Record<string, string>,
  keys: WbiKeys,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const all: Record<string, string> = { ...params, wts: String(nowSeconds) }
  const query = Object.keys(all)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(all[k].replace(/[!'()*]/g, ''))}`)
    .join('&')
  return `${query}&w_rid=${md5Hex(query + mixinKeyOf(keys))}`
}
