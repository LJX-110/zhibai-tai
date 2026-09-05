/**
 * GitHub Sync Provider —— Git Data API 读写私有仓库快照 data/workbench.json
 * 文件内容为版本化结构：{ schemaVersion, exportedAt, deviceId, ciphertext }
 * Token 由调用方注入（来自设置，经加密存储），绝不硬编码。
 *
 * 为何用 Git Data API（blob/tree/commit/ref）而非 Contents API：
 *  · Contents API 读取超过 1MB 的文件会受限，快照随数据增长必然撞墙；
 *  · blob API 支持到 100MB，且「提交 + ref fast-forward 更新」是原子操作；
 *  · 竞争处理：PATCH ref 默认 force=false，他端刚推送过时本次更新非
 *    fast-forward，GitHub 直接拒绝（422）→ 抛可重试错误，
 *    由 SyncService 整体重跑「拉取-合并-推送」完成收敛。
 *
 * 兼容性：旧快照由 Contents API 写入，但文件本身就在仓库里，
 * Git Data API 按 blob 读取，新旧格式无缝衔接。
 */
import type { SyncFile } from '../SyncService'
import type { SyncProvider } from '../types'

export class GitHubSnapshotProvider implements SyncProvider {
  id = 'github'
  name = 'GitHub 私有仓库'
  private path = 'data/workbench.json'
  private repo: string
  private token: string
  private branch: string

  constructor(repo: string, token: string, branch = 'main') {
    this.repo = repo
    this.token = token
    this.branch = branch
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    }
  }

  private api(path: string): string {
    return `https://api.github.com/repos/${this.repo}/git/${path}`
  }

  /** 统一请求：非 2xx 时抛出「GitHub <状态码>: <message>」，状态码始终在场（404 分支判断依赖它） */
  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(this.api(path), { headers: this.headers(), ...init })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      throw new Error(`GitHub ${res.status}${body?.message ? `: ${body.message}` : ''}`)
    }
    return (await res.json()) as Record<string, unknown>
  }

  /** 读取分支头：commit sha 与根 tree sha；分支不存在返回 null */
  private async headRef(): Promise<{ commitSha: string; treeSha: string } | null> {
    try {
      const ref = await this.request(`ref/heads/${this.branch}`)
      const commitSha = (ref as { object: { sha: string } }).object.sha
      const commit = await this.request(`commits/${commitSha}`)
      const treeSha = (commit as { tree: { sha: string } }).tree.sha
      return { commitSha, treeSha }
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null
      throw e
    }
  }

  /** 在树中定位快照文件的 blob sha；不存在返回 undefined */
  private async findSnapshotBlob(treeSha: string): Promise<string | undefined> {
    const tree = await this.request(`trees/${treeSha}?recursive=1`)
    const entries = (tree as { tree: { path: string; type: string; sha: string }[] }).tree
    return entries.find((e) => e.path === this.path && e.type === 'blob')?.sha
  }

  /** 读取远端同步文件；不存在返回 null */
  async readSyncFile(): Promise<SyncFile | null> {
    const head = await this.headRef()
    if (!head) return null
    const blobSha = await this.findSnapshotBlob(head.treeSha)
    if (!blobSha) return null
    // blob API 恒以 base64 返回，支持大文件（Contents API 超 1MB 受限，故弃用）
    const blob = await this.request(`blobs/${blobSha}`)
    const content = (blob as { content: string }).content
    const bin = atob(content.replace(/\s/g, ''))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as SyncFile
  }

  /** 写入（或更新）同步文件：blob → tree → commit → ref 原子落盘 */
  async writeSyncFile(syncFile: SyncFile): Promise<void> {
    // UTF-8 → base64（TextEncoder 替代已废弃的 unescape 组合）
    const bytes = new TextEncoder().encode(JSON.stringify(syncFile))
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)

    // 1. 上传内容 blob
    const blob = await this.request('blobs', {
      method: 'POST',
      body: JSON.stringify({ content: btoa(bin), encoding: 'base64' }),
    })
    const blobSha = (blob as { sha: string }).sha

    // 2. 分支头（空仓库/新分支时为 null）
    const head = await this.headRef()

    // 3. 建树：基于当前头树，仅替换快照文件一项
    const tree = await this.request('trees', {
      method: 'POST',
      body: JSON.stringify({
        ...(head ? { base_tree: head.treeSha } : {}),
        tree: [{ path: this.path, mode: '100644', type: 'blob', sha: blobSha }],
      }),
    })
    const treeSha = (tree as { sha: string }).sha

    // 4. 提交：父提交为当前头（空仓库则无父）
    const commit = await this.request('commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `sync workbench v${syncFile.schemaVersion} ${syncFile.exportedAt.slice(0, 10)}`,
        tree: treeSha,
        parents: head ? [head.commitSha] : [],
      }),
    })
    const newSha = (commit as { sha: string }).sha

    // 5. 移动分支 ref。force=false（默认）= 仅允许 fast-forward：
    //    读取头之后他端又推送过 → 本次更新被 GitHub 拒绝（422），
    //    抛出可重试错误，由 SyncService 整体重跑「拉取-合并-推送」收敛。
    //    分支不存在（首次同步/空仓库）则创建；并发建分支的 422 同样交由整体重跑。
    const refAction = head
      ? { path: `refs/heads/${this.branch}`, method: 'PATCH' as const, body: { sha: newSha, force: false } }
      : { path: 'refs', method: 'POST' as const, body: { ref: `refs/heads/${this.branch}`, sha: newSha } }
    try {
      await this.request(refAction.path, {
        method: refAction.method,
        body: JSON.stringify(refAction.body),
      })
    } catch (e) {
      if (e instanceof Error && e.message.includes('422')) {
        throw new Error('远端快照正被其他设备更新，请稍后重试同步')
      }
      throw e
    }
  }

  /** 连通性检查：验证 token 与仓库 */
  async ping(): Promise<boolean> {
    if (!this.repo || !this.token) return false
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}`, {
        headers: this.headers(),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // 记录级接口（本实现用快照）——保留占位以符合 SyncProvider 抽象
  push = async () => ({ ok: false, pushed: 0, pulled: 0, message: '使用快照同步' })
  pull = async (since: number) => ({ records: [], since })
}
