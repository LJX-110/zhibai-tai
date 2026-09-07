/**
 * Gist 云笺 Provider —— 轻量同步（单 secret Gist 单文件）
 * 仅需一个 **gist 权限** Token：首次同步自动创建 Gist，之后 PATCH 更新。
 * 快照结构与仓库模式完全一致（SyncFile：加密密文），复用同一加密/合并/冲突管线。
 * 30s 超时（AbortController），避免弱网挂起。
 */
import type { SyncFile } from '../SyncService'

const GIST_API = 'https://api.github.com/gists'
const FILE_NAME = 'workbench.json'

export class GistSnapshotProvider {
  id = 'gist'
  name = 'GitHub Gist 云笺'
  private token: string
  private gistId: string
  /** 首次自动创建后回填 Gist ID（调用方持久化到 settings） */
  private onGistId: (id: string) => void

  constructor(token: string, gistId: string, onGistId: (id: string) => void) {
    this.token = token
    this.gistId = gistId
    this.onGistId = onGistId
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    }
  }

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const res = await fetch(`${GIST_API}${path}`, { headers: this.headers(), signal: ctrl.signal, ...init })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(`GitHub ${res.status}${body?.message ? `: ${body.message}` : ''}`)
      }
      return (await res.json()) as Record<string, unknown>
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error('同步请求超时（30s）')
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  async readSyncFile(): Promise<SyncFile | null> {
    if (!this.gistId) return null // 尚未创建 → 视为远端为空
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

  async writeSyncFile(syncFile: SyncFile): Promise<void> {
    const body = JSON.stringify({
      description: `知白台数据同步（自动生成）`,
      public: false,
      files: { [FILE_NAME]: { content: JSON.stringify(syncFile) } },
    })
    if (!this.gistId) {
      const j = await this.request('', { method: 'POST', body })
      const newId = (j as { id: string }).id
      this.gistId = newId
      this.onGistId(newId)
      return
    }
    await this.request(`/${this.gistId}`, { method: 'PATCH', body })
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('/' + (this.gistId || ''), {})
      return true
    } catch {
      return false
    }
  }
}
