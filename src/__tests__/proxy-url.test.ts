/**
 * 自建代理地址的校验与规整（Step 5-1 · B3）
 *
 * 这里只管**客户端输入**这一侧：用户填错时必须当场说清楚，
 * 而不是等抓取失败后把原因归到"跨域/网络"（那条路会把人带偏）。
 * 服务端（`proxy/core.js`）的白名单与 header 策略另有一份可执行验收：
 * `work/scripts/proxy-security-test.mjs`。
 */
import { describe, expect, it } from 'vitest'
import { normalizeProxyUrl } from '../services/intelligence/providers/proxy'

describe('normalizeProxyUrl —— 合法地址', () => {
  it('接受 http/https 基址，并去掉结尾斜杠', () => {
    expect(normalizeProxyUrl('https://my-proxy.example.netlify.app')).toBe('https://my-proxy.example.netlify.app')
    expect(normalizeProxyUrl('https://my-proxy.example.netlify.app/')).toBe('https://my-proxy.example.netlify.app')
    expect(normalizeProxyUrl('https://my-proxy.example.netlify.app///')).toBe('https://my-proxy.example.netlify.app')
    expect(normalizeProxyUrl('http://localhost:8787')).toBe('http://localhost:8787')
    expect(normalizeProxyUrl('  http://192.168.1.5:8787/  ')).toBe('http://192.168.1.5:8787')
  })

  it('保留路径（有些部署把函数挂在子路径下）', () => {
    expect(normalizeProxyUrl('https://x.example/edge/proxy')).toBe('https://x.example/edge/proxy')
    expect(normalizeProxyUrl('https://x.example/edge/proxy/')).toBe('https://x.example/edge/proxy')
  })
})

describe('normalizeProxyUrl —— 非法地址一律拒绝（返回 null）', () => {
  it('空串 / 纯空白', () => {
    expect(normalizeProxyUrl('')).toBeNull()
    expect(normalizeProxyUrl('   ')).toBeNull()
  })

  it('非 http(s) 协议', () => {
    expect(normalizeProxyUrl('ftp://x.example')).toBeNull()
    expect(normalizeProxyUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeProxyUrl('javascript:alert(1)')).toBeNull()
  })

  it('缺协议的裸域名（fetch 会当相对路径，必然失败）', () => {
    expect(normalizeProxyUrl('my-proxy.example.netlify.app')).toBeNull()
    expect(normalizeProxyUrl('localhost:8787')).toBeNull()
  })

  it('**自带 query / hash**（请求参数由应用自己拼 `?url=`，自带说明填错了）', () => {
    expect(normalizeProxyUrl('https://x.example/?url=https%3A%2F%2Fa')).toBeNull()
    expect(normalizeProxyUrl('https://x.example/proxy?url=a')).toBeNull()
    expect(normalizeProxyUrl('https://x.example/#/foo')).toBeNull()
  })

  it('完全不是地址的字符串', () => {
    expect(normalizeProxyUrl('随便写的')).toBeNull()
    expect(normalizeProxyUrl('://')).toBeNull()
  })
})
