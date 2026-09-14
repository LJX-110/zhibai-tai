/**
 * B 站链路端到端验证：前端签名 + 真实接口
 *
 * 验证目标：`src/services/intelligence/wbi.ts` 生成的 w_rid 能被 B 站接受。
 * 这是整条 B 站情报链路上唯一无法靠单测覆盖的风险点（服务端会真的校验签名）。
 *
 * 运行：node scripts/probe_bili_e2e.mjs    （需要外网）
 * 说明：Node 没有 CORS 限制，所以这里可直连 api.bilibili.com；
 * 浏览器端的 CORS 由转发端点解决，转发本身由 probe_proxy.mjs 验证。
 */
import { keyFromUrl, md5Hex, mixinKeyOf, signedQuery } from '../src/services/intelligence/wbi.ts'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

function stripHtml(text) {
  return String(text ?? '').replace(/<[^>]*>/g, '').trim()
}

async function readJson(res, label) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} 返回非 JSON（HTTP ${res.status}）`)
  }
}

// 1) 取 wbi 密钥
const nav = await readJson(
  await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: HEADERS }),
  'nav',
)
const imgKey = keyFromUrl(nav?.data?.wbi_img?.img_url ?? '')
const subKey = keyFromUrl(nav?.data?.wbi_img?.sub_url ?? '')
console.log('1) nav code =', nav?.code, '| 取到 wbi 密钥 =', Boolean(imgKey && subKey))
if (!imgKey || !subKey) {
  console.log('结论：拿不到 wbi 密钥，链路不可用')
  process.exit(1)
}

const keys = { imgKey, subKey }
console.log('   mixinKey 长度 =', mixinKeyOf(keys).length, '| md5 自检 =', md5Hex('abc') === '900150983cd24fb0d6963f7d28e17f72')

// 2) 签名一次搜索请求
const query = signedQuery(
  { search_type: 'video', keyword: '鸣潮', page: '1', page_size: '5', order: 'pubdate' },
  keys,
)
const res = await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`, {
  headers: HEADERS,
})
const body = await readJson(res, 'search')
const code = body?.code
const items = body?.data?.result ?? []
console.log('2) search HTTP', res.status, '| code =', code, '| message =', body?.message)
console.log('   结果条数 =', items.length)

// 3) 打印前三条，确认字段映射到统一情报模型所需的信息齐全
for (const it of items.slice(0, 3)) {
  console.log(
    '   -',
    stripHtml(it.title).slice(0, 28) || '（无标题）',
    '|',
    it.bvid ? `https://www.bilibili.com/video/${it.bvid}` : '（无 bvid）',
    '|',
    it.pubdate ? new Date(it.pubdate * 1000).toISOString().slice(0, 10) : '（无时间）',
    '|',
    stripHtml(it.author) || '（无作者）',
  )
}

const ok = code === 0 && items.length > 0
console.log(ok ? '\n结论：前端签名 + 直连链路可用（w_rid 被 B 站接受）' : '\n结论：链路仍有问题，需排查')
process.exit(ok ? 0 : 1)
