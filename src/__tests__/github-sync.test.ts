/**
 * GitHub 同步：错误翻译 + **空仓库首次同步**
 *
 * 这里锁的是一个真实踩到的 bug：GitHub 对「还没有任何提交」的空仓库读取 refs 时，
 * 返回的是 **409 「Git Repository is empty」**，不是 404。
 * 原先 `headRef()` 只认 404，于是**往刚建好的空私有仓库做首次同步必然失败**，
 * 而且报的是 GitHub 原文，用户看不出该干什么。
 *
 * 写入侧本来就是对的（空仓库 → 无 base_tree、parents 为空、POST 创建分支），
 * 缺的只是"识别空仓库"这一步 —— 两边一起钉住，免得将来只改一处。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubSnapshotProvider } from '../sync/github/GithubSyncProvider'
import { describeGitHubError } from '../sync/github/errors'
import type { SyncFile } from '../sync/SyncService'

const snapshot: SyncFile = {
  schemaVersion: 1,
  exportedAt: '2026-09-21T00:00:00.000Z',
  deviceId: 'device-a',
  ciphertext: 'encrypted-blob',
} as unknown as SyncFile

/** 按 URL 分流的假 GitHub；记录每次调用以便断言"建初始提交"的正确姿势 */
function fakeGithub(opts: { emptyRepo: boolean }) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })

    const json = async () => ({})
    // 空仓库：读取分支头返回 409（不是 404！）—— 这就是 bug 的现场
    if (opts.emptyRepo && url.includes('/git/ref/heads/')) {
      return { ok: false, status: 409, json: async () => ({ message: 'Git Repository is empty.' }) }
    }
    if (!opts.emptyRepo && url.includes('/git/ref/heads/')) {
      return { ok: true, status: 200, json: async () => ({ object: { sha: 'head-commit' } }) }
    }
    if (url.includes('/git/commits/')) {
      return { ok: true, status: 200, json: async () => ({ tree: { sha: 'head-tree' } }) }
    }
    if (url.includes('/git/trees/')) {
      return { ok: true, status: 200, json: async () => ({ tree: [] }) }
    }
    if (url.endsWith('/git/blobs')) return { ok: true, status: 200, json: async () => ({ sha: 'blob-1' }) }
    if (url.endsWith('/git/trees')) return { ok: true, status: 200, json: async () => ({ sha: 'tree-1' }) }
    if (url.endsWith('/git/commits')) return { ok: true, status: 200, json: async () => ({ sha: 'commit-1' }) }
    if (url.endsWith('/git/refs') || url.includes('/git/refs/heads/')) {
      return { ok: true, status: 200, json: async () => ({ ref: 'refs/heads/main' }) }
    }
    return { ok: true, status: 200, json }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('空仓库首次同步', () => {
  it('读取远端时空仓库按「无快照」处理，不抛错（409 不是 404）', async () => {
    fakeGithub({ emptyRepo: true })
    const p = new GitHubSnapshotProvider('u/r', 'tok')
    await expect(p.readSyncFile()).resolves.toBeNull()
  })

  it('写入时空仓库建**根提交**：无 base_tree、parents 为空、并创建分支', async () => {
    const { calls } = fakeGithub({ emptyRepo: true })
    const p = new GitHubSnapshotProvider('u/r', 'tok')
    await p.writeSyncFile(snapshot)

    const tree = calls.find((c) => c.url.endsWith('/git/trees') && c.method === 'POST')
    const commit = calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST')
    const ref = calls.find((c) => c.url.includes('/git/refs'))

    expect(tree?.body).not.toHaveProperty('base_tree')
    expect(commit?.body).toMatchObject({ parents: [] })
    // 分支不存在时用 POST 创建，而不是 PATCH 移动
    expect(ref?.url.endsWith('/git/refs')).toBe(true)
    expect(ref?.method).toBe('POST')
    expect(ref?.body).toMatchObject({ ref: 'refs/heads/main', sha: 'commit-1' })
  })

  it('非空仓库仍走既有路径：带 base_tree、有父提交、PATCH 移动 ref', async () => {
    const { calls } = fakeGithub({ emptyRepo: false })
    const p = new GitHubSnapshotProvider('u/r', 'tok')
    await p.writeSyncFile(snapshot)

    const tree = calls.find((c) => c.url.endsWith('/git/trees') && c.method === 'POST')
    const commit = calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST')
    const ref = calls.find((c) => c.url.includes('/git/refs') && c.method === 'PATCH')

    expect(tree?.body).toMatchObject({ base_tree: 'head-tree' })
    expect(commit?.body).toMatchObject({ parents: ['head-commit'] })
    expect(ref).toBeTruthy()
  })
})

describe('错误翻译 describeGitHubError', () => {
  it('401 → 令牌失效，要去重贴', () => {
    expect(describeGitHubError('GitHub 401: Bad credentials')).toContain('令牌无效或已过期')
  })

  it('403 → 权限 / 仓库名问题，说清两种令牌分别要开什么', () => {
    const s = describeGitHubError('GitHub 403: Resource not accessible by personal access token')
    expect(s).toContain('令牌看不到这个仓库')
    expect(s).toContain('Contents 读写')
  })

  it('404 → 找不到仓库', () => {
    expect(describeGitHubError('GitHub 404: Not Found')).toContain('找不到这个仓库')
  })

  it('409 空仓库 → 说清仓库是空的、且现在会自动建初始提交', () => {
    const s = describeGitHubError('GitHub 409: Git Repository is empty.')
    expect(s).toContain('还是空的')
    expect(s).toContain('自动建初始提交')
  })

  it('422 → 他端刚推过，重试即可', () => {
    expect(describeGitHubError('GitHub 422: Update is not a fast forward')).toContain('重试')
  })

  it('网络类 → 提示检查网络', () => {
    expect(describeGitHubError('同步请求超时（30s）')).toContain('连不上')
  })

  it('认不出的错误原样返回（不吞掉信息）', () => {
    expect(describeGitHubError('某种未知错误')).toBe('某种未知错误')
  })

  it('空串回落到「同步失败」而不是空白', () => {
    expect(describeGitHubError('')).toBe('同步失败')
  })
})
