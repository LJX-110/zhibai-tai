/**
 * GitHub Sync Provider —— 通过 Contents API 读写私有仓库中的同步文件 data/workbench.json
 * 文件内容为版本化结构：{ schemaVersion, exportedAt, deviceId, ciphertext }
 * Token 由调用方注入（来自设置，经加密存储），绝不硬编码。
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
    }
  }

  private base() {
    return `https://api.github.com/repos/${this.repo}/contents/${this.path}?ref=${this.branch}`
  }

  /** 读取远端同步文件；不存在返回 null */
  async readSyncFile(): Promise<SyncFile | null> {
    const res = await fetch(this.base(), { headers: this.headers() })
    if (res.status === 404) return null
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      throw new Error(body?.message ?? `GitHub ${res.status}`)
    }
    const data = (await res.json()) as { content?: string }
    if (!data.content) return null
    const json = atob(data.content.replace(/\s/g, ''))
    return JSON.parse(json) as SyncFile
  }

  /** 读取文件当前 sha（不存在/失败返回 undefined，视作新建） */
  private async fetchSha(): Promise<string | undefined> {
    try {
      const res = await fetch(this.base(), { headers: this.headers() })
      if (!res.ok) return undefined
      const data = (await res.json()) as { sha?: string }
      return data.sha
    } catch {
      return undefined
    }
  }

  /** 写入（或更新）同步文件；sha 过期（他端刚推送过）时自动重取重试一次 */
  async writeSyncFile(syncFile: SyncFile): Promise<void> {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(syncFile))))
    const attempt = async (): Promise<Response> => {
      const sha = await this.fetchSha()
      const payload = {
        message: `sync workbench v${syncFile.schemaVersion} ${syncFile.exportedAt.slice(0, 10)}`,
        content,
        branch: this.branch,
        ...(sha ? { sha } : {}),
      }
      return fetch(this.base(), {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(payload),
      })
    }

    let res = await attempt()
    // 409/422：本地缓存的 sha 已过期，说明另一设备刚推送过。
    // 快照本身是合并后的全量数据，用最新 sha 重放写入（后写者胜）；
    // 若重试仍失败则向上抛出，由 SyncService 整体重跑一次拉取-合并-推送。
    if (res.status === 409 || res.status === 422) {
      res = await attempt()
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      throw new Error(
        res.status === 409 || res.status === 422
          ? '远端快照正被其他设备更新，请稍后重试同步'
          : (body?.message ?? `GitHub 写入失败 ${res.status}`),
      )
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
