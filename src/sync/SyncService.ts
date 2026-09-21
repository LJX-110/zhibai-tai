/**
 * SyncService —— 多设备同步编排
 *
 * 流程：解密远端 → LWW 合并 + 冲突检测 → 写回本地 → 重放墓碑删除 → 加密推送。
 * 同一 Sync Password 在任意设备推导同一密钥，可跨设备恢复。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：原先 469 行拆为同目录四份 ——
 *   snapshot.ts   快照结构 / 参与同步的表 / 本机表数据导出与写回 / 本机元信息
 *   merge.ts      LWW 合并、冲突检测、远端变化统计（纯函数）
 *   tombstones.ts 墓碑合并、过期清理、重放删除
 *   SyncService.ts 本文件，只留一次同步的编排
 * 所有公共符号仍从本路径导出，外部调用方无需改动。
 */
import { db } from '../db/db'
import { BUSINESS_TABLES, TOMBSTONES } from '../db/tables'
import { GitHubSnapshotProvider } from './github/GithubSyncProvider'
import { describeGitHubError } from './github/errors'
import { syncMetaRepo } from '../repositories/sync-repo'
import {
  decryptSyncData,
  deriveSyncKey,
  encryptSyncData,
} from './encryption/sync-crypto'
import { encryptor, isWebCryptoAvailable } from './encryption/encryption'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useSyncStore } from '../stores/useSyncStore'
import { reloadAllStores } from '../stores/reload'
import type { Tombstone } from '../types/entities'
import {
  SYNC_TABLES,
  ensureMeta,
  exportData,
  restoreLocalOnly,
  type SyncFile,
} from './snapshot'
import { diffRemoteImports, mergeAndDetectConflicts } from './merge'
import { applyTombstones, mergeTombstones, pruneTombstones } from './tombstones'

export { SYNC_TABLES, stripLocalOnly, modifiedAt } from './snapshot'
export type { SyncFile } from './snapshot'
export { mergeAndDetectConflicts, diffRemoteImports } from './merge'
export type { ImportDiff } from './merge'
export { mergeTombstones, pruneTombstones } from './tombstones'

export interface SyncRunResult {
  ok: boolean
  pulled: number
  pushed: number
  conflicts: number
  message?: string
}

/** 同步并发锁：手动 + 自动同步可能同时触发，合并/推送须串行（模块级单例） */
let syncInFlight = false

/**
 * 执行一次完整同步。
 * 远端快照刚被其他设备更新（sha 竞争）时，整体重跑一次"拉取-合并-推送"：
 * 重跑会拿到对方的最新快照重新合并，保证双方数据都不丢；仅重试一次，避免无限循环。
 */
export async function runSync(): Promise<SyncRunResult> {
  if (syncInFlight) {
    return { ok: true, pulled: 0, pushed: 0, conflicts: 0, message: '同步进行中，已跳过本次' }
  }
  syncInFlight = true
  try {
    try {
      return await runSyncOnce()
    } catch (e) {
      if (e instanceof Error && e.message.includes('远端快照正被其他设备更新')) {
        return runSyncOnce()
      }
      throw e
    }
  } finally {
    syncInFlight = false
  }
}

async function runSyncOnce(): Promise<SyncRunResult> {
  const settings = useSettingsStore.getState()
  const rawPassword = (settings.syncPassword ?? '').trim()
  const password = settings.syncPasswordEnc ? await encryptor.decrypt(rawPassword) : rawPassword
  if (!password) {
    // 配置缺失类失败同样落状态，供设置页状态行/错误文本展示
    settings.set({ syncStatus: 'error', syncError: '请设置 Sync Password（用于数据加密）' })
    throw new Error('请设置 Sync Password（用于数据加密）')
  }
  if (!isWebCryptoAvailable()) throw new Error('当前环境不支持 Web Crypto，无法同步')

  let provider: { readSyncFile(): Promise<SyncFile | null>; writeSyncFile(f: SyncFile): Promise<void> }
  const repo = (settings.githubRepo ?? '').trim()
  const rawToken = (settings.githubToken ?? '').trim()
  const branch = (settings.githubBranch ?? 'main').trim() || 'main'
  const token = settings.githubTokenEnc ? await encryptor.decrypt(rawToken) : rawToken
  if (!repo || !token) {
    settings.set({ syncStatus: 'error', syncError: '请先配置 GitHub 仓库与 Token' })
    throw new Error('请先配置 GitHub 仓库与 Token')
  }
  settings.set({ syncStatus: 'syncing', syncError: undefined })
  provider = new GitHubSnapshotProvider(repo, token, branch)

  try {
    const { deviceId } = await ensureMeta()
    const meta = (await syncMetaRepo.get('meta'))!
    const since = meta.lastSyncedAt ? new Date(meta.lastSyncedAt).getTime() : 0

    const key = await deriveSyncKey(password)
    const local = await exportData()

    // 拉远端（解密）
    const remoteFile = await provider.readSyncFile()
    let remote: Record<string, unknown[]> | null = null
    if (remoteFile) {
      // 快照版本不匹配时拒绝静默当作"远端为空"：否则会用本地-only 快照
      // 覆盖推送，其他设备的数据面临被覆盖风险且无提示
      if (remoteFile.schemaVersion !== 2) {
        throw new Error(`远端快照版本不兼容（v${remoteFile.schemaVersion}，本应用支持 v2），请升级应用或检查同步目标`)
      }
      const decrypted = (await decryptSyncData(key, remoteFile.ciphertext)) as {
        tables?: Record<string, unknown[]>
      }
      remote = decrypted.tables ?? null
    }

    // 合并 + 冲突检测（纯函数）
    const { merged, conflicts } = remote
      ? mergeAndDetectConflicts(local, remote, since)
      : { merged: local, conflicts: [] }
    if (conflicts.length > 0) {
      await db.conflicts.bulkPut(conflicts)
    }

    // 墓碑合并：删除标记同样走 LWW（同一记录取较晚的删除时刻）
    const mergedTombstones = remote
      ? mergeTombstones(
          (local[TOMBSTONES] ?? []) as Tombstone[],
          (remote[TOMBSTONES] ?? []) as Tombstone[],
        )
      : ((local[TOMBSTONES] ?? []) as Tombstone[])

    // 写回本地（并集）；本机独有的字段（抓取状态等）以本机为准
    for (const t of SYNC_TABLES) {
      const rows = merged[t]
      if (rows && rows.length > 0) {
        const restored = await restoreLocalOnly(t, rows as Record<string, unknown>[])
        await db.table(t).bulkPut(restored as never[])
      }
    }

    // 重放删除：必须在并集写回之后执行，否则被删记录会被远端副本复活
    const { kept, doomedIds } = await applyTombstones(mergedTombstones)
    const liveTombstones = pruneTombstones(kept)
    const tombstoneTable = db.table<Tombstone>(TOMBSTONES)
    await tombstoneTable.clear()
    if (liveTombstones.length > 0) await tombstoneTable.bulkPut(liveTombstones)
    merged[TOMBSTONES] = liveTombstones

    // 已删除的记录从推送快照中移除（此前只删本地、快照仍残留，
    // 云端密文随删除无限膨胀）。合并对象里残留的行一并剔除。
    if (doomedIds.length > 0) {
      const doomedSet = new Set(doomedIds)
      for (const t of SYNC_TABLES) {
        const rows = (merged[t] ?? []) as { id: string }[]
        merged[t] = rows.filter((r) => !doomedSet.has(`${t}:${r.id}`))
      }
    }

    // 加密推送
    const syncFile: SyncFile = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      deviceId,
      ciphertext: await encryptSyncData(key, { tables: merged }),
    }
    await provider.writeSyncFile(syncFile)

    // 「远端带来」的真实变化（此前把快照记录总数当拉取量，数字大却无新增，误导用户）
    const diff = remote ? diffRemoteImports(local, remote) : null
    const changed = (diff?.added ?? 0) + (diff?.updated ?? 0)
    const tableDetail =
      diff && diff.byTable.length > 0
        ? `（${diff.byTable
            .map((b) => `${BUSINESS_TABLES.find((t) => t.key === b.table)?.label ?? b.table} 增${b.added}·改${b.updated}`)
            .join('，')}）`
        : ''
    const message = !remote
      ? '首次同步完成'
      : changed > 0
        ? `已合并远端：新增 ${diff!.added} · 更新 ${diff!.updated}${doomedIds.length > 0 ? ` · 清理 ${doomedIds.length} 条已删` : ''}${tableDetail}`
        : doomedIds.length > 0
          ? `已同步，清理 ${doomedIds.length} 条已删记录`
          : '已同步，本地与远端一致，无新增'

    const pushedRows = Object.values(merged).reduce((s, a) => s + a.length, 0)
    const now = new Date().toISOString()
    await syncMetaRepo.put({
      id: 'meta',
      deviceId,
      version: (meta.version ?? 0) + 1,
      lastSyncedAt: now,
      lastPushedAt: now,
    })
    await reloadAllStores()
    await useSyncStore.getState().refresh()

    settings.set({ syncStatus: 'success', lastSyncedAt: now })
    return {
      ok: true,
      pulled: changed,
      pushed: pushedRows,
      conflicts: conflicts.length,
      message,
    }
  } catch (e) {
    // 原始 GitHub 报文是给开发者看的（"Resource not accessible by personal access token"），
    // 用户看到只知道失败了、不知道该点哪里 —— 落到界面前翻译成「该干什么」
    settings.set({
      syncStatus: 'error',
      syncError: describeGitHubError(e instanceof Error ? e.message : ''),
    })
    throw e
  }
}
