/**
 * Gist 云笺 Provider —— 轻量同步（单 secret Gist 单文件）
 * 仅需一个 **gist 权限** Token：首次同步自动创建 Gist，之后 PATCH 更新。
 * 快照结构与仓库模式完全一致（SyncFile：加密密文），复用同一加密/合并/冲突管线。
 *
 * 通道：直连 → 自建代理兜底（与情报抓取同一候选链语义）。
 * 国内网络直连 api.github.com 经常超时（GitHub 情报 0 条的同一原因），
 * 因此同步同样需要自建代理这条退路；且自建代理需部署新版（支持 PATCH/POST 与
 * Authorization 转发，见 proxy/core.js）。
 */
import type { SyncFile } from '../SyncService'
import { proxyRequest } from '../../services/intelligence/providers/proxy'

const GIST_API = 'https://api.github.com/gists'
const FILE_NAME = 'workbench.json'

export class GistSnapshotProvider {
  id = 'gist'
  name = 'GitHub Gist 云笺'
  private token: string
  private gistId: string
  /** 自建 CORS 代理（settings.corsProxyUrl），为空则仅直连 */
  private proxyUrl: string
  /** 首次自动创建后回填 Gist ID（调用方持久化到 settings） */
  private onGistId: (id: string) => void

  constructor(
    token: string,
    gistId: string,
    onGistId: (id: string) => void,
    proxyUrl = '',
  ) {
    this.token = token
    this.gistId = gistId
    this.onGistId = onGistId
    this.proxyUrl = proxyUrl
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    }
  }

  private async request(
    path: string,
    init?: { method?: string; body?: string },
  ): Promise<Record<string, unknown>> {
    const res = await proxyRequest(
      `${GIST_API}${path}`,
      this.proxyUrl,
      {
        method: init?.method ?? 'GET',
        headers: this.headers(),
        body: init?.body,
      },
    )
    if (!res.ok) {
      let message = ''
      try {
        const j = JSON.parse(res.text) as { message?: string } | null
        message = j?.message ?? ''
      } catch {
        /* 非 JSON 错误体也能接受 */
      }
      throw new Error(`GitHub ${res.status}${message ? `: ${message}` : ''}`)
    }
    if (!res.text) return {}
    try {
      return JSON.parse(res.text) as Record<string, unknown>
    } catch {
      // GET 单个 gist 一定有 JSON；空体（如某些成功写操作）直接视为 {}
      return {}
    }
  }

  async readSyncFile(): Promise<SyncFile | null> {
    // 本地没有 gistId（从未同步 / 换设备 / 清缓存）时先自动找回，
    // 否则两端用同一 Token 却各自读写自己的空 gist，数据永远互不可见
    if (!this.gistId) await this.autoDiscover()
    if (!this.gistId) return null // 仍未找到 → 视为远端为空
    try {
      const j = await this.request(`/${this.gistId}`)
      const files = j.files as Record<string, { content?: string }> | undefined
      const raw = files?.[FILE_NAME]?.content
      if (!raw) return null
      return JSON.parse(raw) as SyncFile
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null // gist 被删 → 视为空，可重建
      throw e
    }
  }

  /** 按文件名在当前 Token 的 gist 列表里自动找回（幂等；失败不阻塞，回落到「无远端」） */
  private async autoDiscover(): Promise<void> {
    if (this.gistId) return
    try {
      const res = await proxyRequest(
        `${GIST_API}?per_page=100`,
        this.proxyUrl,
        { method: 'GET', headers: this.headers() },
      )
      if (!res.ok) return
      const list = JSON.parse(res.text) as unknown
      if (!Array.isArray(list)) return
      const hit = (list as { id: string; files?: Record<string, { filename?: string }> }[]).find(
        (g) => g.files?.[FILE_NAME],
      )
      if (hit?.id) {
        this.gistId = hit.id
        this.onGistId(hit.id)
      }
    } catch {
      /* 网络失败不阻塞：仍按「无远端」处理，推送时另行创建或手动关联 */
    }
  }

  async writeSyncFile(syncFile: SyncFile): Promise<void> {
    const body = JSON.stringify({
      description: `知白台数据同步（自动生成）`,
      public: false,
      files: { [FILE_NAME]: { content: JSON.stringify(syncFile) } },
    })
    if (!this.gistId) {
      await this.createGist(body)
      return
    }
    try {
      await this.request(`/${this.gistId}`, { method: 'PATCH', body })
    } catch (e) {
      // gist 在远端被手动删除 → PATCH 404；与 readSyncFile「404=视为空」语义一致，
      // 清空本地 id 后走 POST 自动重建，否则同步将永久失败
      if (e instanceof Error && e.message.includes('404')) {
        this.gistId = ''
        this.onGistId('')
        await this.createGist(body)
        return
      }
      throw e
    }
  }

  /** 新建 Gist 并回填 id（首次同步 / 被删后重建共用） */
  private async createGist(body: string): Promise<void> {
    const j = await this.request('', { method: 'POST', body })
    const newId = (j as { id: string }).id
    this.gistId = newId
    this.onGistId(newId)
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('/' + (this.gistId || ''))
      return true
    } catch {
      return false
    }
  }
}
