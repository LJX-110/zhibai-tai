/**
 * 设置 · 同步（GitHub 私有仓库 + 加密快照）
 *
 * 从 SettingsPage 拆出。状态自洽：草稿、同步动作、冲突列表都在本文件内。
 * 说明小字按「只留核心信息」精简（用户反馈该板块小字冗长）。
 */
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { SyncInterval } from '../../stores/useSettingsStore'
import { useConflictStore } from '../../stores/useConflictStore'
import { runSync } from '../../sync/SyncService'
import { encryptor } from '../../sync/encryption/encryption'
import { Badge, Button, Collapse, Input, Section, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'

export function SyncGroup() {
  const settings = useSettingsStore()
  const toast = useToast().toast
  const [syncing, setSyncing] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  const conflicts = useConflictStore((s) => s.items)
  const pendingConflicts = conflicts.filter((c) => !c.resolved)

  const doSync = async () => {
    setSyncing(true)
    try {
      // 同步成功不弹 toast：状态行与顶栏圆点已反馈，避免每个动作都被打断
      await runSync()
    } catch (e) {
      toast('同步失败：' + (e instanceof Error ? e.message : ''), 'danger')
    } finally {
      setSyncing(false)
    }
  }

  /** 保存 Token：加密后落本地存储 */
  const saveToken = async () => {
    if (!tokenDraft.trim()) return
    const enc = await encryptor.encrypt(tokenDraft.trim())
    settings.set({ githubToken: enc, githubTokenEnc: true })
    setTokenDraft('')
    toast('Token 已加密保存（AES-GCM）', 'success')
  }

  /** 保存 Sync Password：设备本地密钥加密（跨设备恢复用同一密码） */
  const savePassword = async () => {
    if (passwordDraft.length < 6) return toast('Sync Password 至少 6 位', 'danger')
    const enc = await encryptor.encrypt(passwordDraft.trim())
    settings.set({ syncPassword: enc, syncPasswordEnc: true })
    setPasswordDraft('')
    toast('Sync Password 已加密保存（PBKDF2 推导数据密钥）', 'success')
  }

  // 同步只用「仓库完整」模式：仓库 + contents 权限 Token + Sync Password（数据加密密钥）
  const connected = Boolean(settings.githubRepo && settings.githubTokenEnc && settings.syncPasswordEnc)

  return (
    <Section
      title="GitHub 同步"
      hint={settings.lastSyncedAt ? `上次同步 ${settings.lastSyncedAt}` : '尚未同步'}
      action={
        <Button size="sm" variant="secondary" onClick={doSync} disabled={syncing || !connected}>
          <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
          {syncing ? '同步中…' : '立即同步'}
        </Button>
      }
    >
      {/* 状态行 */}
      <div className="mb-2 flex flex-wrap items-center gap-3 rounded-paper bg-raised px-3 py-2 text-sm">
        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            settings.syncStatus === 'error'
              ? 'text-cinnabar'
              : settings.syncStatus === 'syncing'
                ? 'text-bronze'
                : settings.syncStatus === 'success'
                  ? 'text-teal'
                  : 'text-ink-muted',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              !connected
                ? 'bg-ink-faint'
                : settings.syncStatus === 'syncing'
                  ? 'bg-bronze animate-pulse'
                  : settings.syncStatus === 'success'
                    ? 'bg-teal'
                    : settings.syncStatus === 'error'
                      ? 'bg-cinnabar'
                      : 'bg-ink-muted',
            )}
          />
          {!connected ? '未连接' : settings.syncStatus === 'syncing' ? '同步中' : settings.syncStatus === 'success' ? '已同步' : settings.syncStatus === 'error' ? '同步失败' : '已连接'}
        </span>
        {settings.lastSyncedAt && (
          <span className="tabular text-xs text-ink-faint">{settings.lastSyncedAt}</span>
        )}
        {settings.syncError && (
          <span className="text-xs text-cinnabar">错误：{settings.syncError}</span>
        )}
      </div>

      {/* 同步方式固定为「仓库完整」：私有仓库 + 加密快照（已移除 gist 云笺） */}
      <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-faint">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
        私有仓库 + 加密快照
      </p>

      {/* 首次同步三步引导：仓库为空时最需要，配齐后自动收起 */}
      {!settings.githubRepo?.trim() && (
        <Collapse title="第一次同步？三步开启" hint="建仓库 · 拿 Token · 填回这里" className="mb-3">
          <ol className="space-y-2.5 text-sm leading-relaxed text-ink-soft">
            <li className="flex gap-2">
              <span className="display flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal text-xs text-on-teal">1</span>
              <span>
                <b className="text-ink">建私有仓库</b>：GitHub 右上角 <code className="rounded-control bg-nested px-1">+</code> → New repository，
                勾选 <b className="text-ink">Private</b>，其余留空 → Create。
              </span>
            </li>
            <li className="flex gap-2">
              <span className="display flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal text-xs text-on-teal">2</span>
              <span>
                <b className="text-ink">生成 Token</b>：GitHub → Settings → Developer settings →
                Personal access tokens → <b className="text-ink">Fine-grained</b> → 仓库权限勾选{' '}
                <code className="rounded-control bg-nested px-1">Contents: Read and write</code>（只读即可时选 Contents: Read）→ Generate。
              </span>
            </li>
            <li className="flex gap-2">
              <span className="display flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal text-xs text-on-teal">3</span>
              <span>
                <b className="text-ink">填回这里</b>：下方「仓库」填 <code className="rounded-control bg-nested px-1">你的用户名/仓库名</code>，
                Token 粘贴后点「加密保存」，再设 ≥6 位同步口令，点右上「立即同步」即可。
              </span>
            </li>
          </ol>
        </Collapse>
      )}

      <div className="space-y-2 py-1">
        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">仓库</span>
          <Input
            placeholder="owner/repo"
            value={settings.githubRepo ?? ''}
            onChange={(e) => settings.set({ githubRepo: e.target.value })}
            className="max-w-[300px]"
          />
        </div>
        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">分支</span>
          <Input
            value={settings.githubBranch ?? 'main'}
            onChange={(e) => settings.set({ githubBranch: e.target.value })}
            className="max-w-[300px]"
          />
        </div>
        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">Token</span>
          <Input
            type="password"
            placeholder="GitHub Token"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            className="max-w-[300px]"
          />
          <Button size="sm" variant="secondary" onClick={saveToken} disabled={!tokenDraft.trim()}>
            加密保存
          </Button>
          {settings.githubTokenEnc && (
            <span className="text-xs text-teal">已保存（加密）</span>
          )}
        </div>

        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">同步口令</span>
          <Input
            type="password"
            placeholder="同步密码"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            className="max-w-[300px]"
          />
          <Button size="sm" variant="secondary" onClick={savePassword} disabled={passwordDraft.length < 6}>
            加密保存
          </Button>
          {settings.syncPasswordEnc && (
            <span className="text-xs text-teal">已保存（加密）</span>
          )}
        </div>
        <p className="flex items-center gap-1.5 pt-1 text-xs text-cinnabar">
          <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
          加密后仅存本机；需仓库 <code className="rounded-control bg-nested px-1">contents:write</code> 权限
        </p>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-bronze">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bronze" />
          国内直连常超时；同步失败请在「智能 · 自建代理」填转发地址。
        </p>
        </div>

        {/* 自动同步 */}
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-paper bg-raised px-3 py-2">
          <span className="text-sm text-ink-soft">自动同步</span>
          <button
            onClick={() => settings.set({ autoSync: !settings.autoSync })}
            className={cn(
              'relative h-5 w-10 rounded-full transition-colors',
              settings.autoSync ? 'bg-teal' : 'bg-nested',
            )}
            aria-label="自动同步开关"
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-paper shadow-soft transition-all',
                settings.autoSync ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
          <select
            value={settings.syncInterval}
            onChange={(e) => settings.set({ syncInterval: e.target.value as SyncInterval })}
            className="rounded-control bg-paper px-2 py-1 text-xs text-ink outline-none"
          >
            <option value="immediate">间隔：立即</option>
            <option value="30s">间隔：30 秒</option>
            <option value="5m">间隔：5 分钟</option>
            <option value="manual">手动</option>
          </select>
          <span className="text-xs text-ink-faint">网络恢复自动同步 · 失败自动重试</span>
        </div>

        {/* 冲突 */}
        {pendingConflicts.length > 0 && (
          <div className="mt-2 rounded-paper border border-cinnabar/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="text-cinnabar">同步冲突 {pendingConflicts.length} 条</span>
              <span className="text-xs text-ink-faint">已按较新版本合并，可手动选择</span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {pendingConflicts.slice(0, 20).map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-control bg-raised px-2 py-1 text-xs">
                  <Badge tone="cinnabar">{c.entity}</Badge>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{String((c.remote as { title?: string })?.title ?? c.entityId)}</span>
                  <button
                    onClick={() => useConflictStore.getState().resolve(c.id, 'remote')}
                    className="shrink-0 text-teal link-underline"
                  >
                    取远端
                  </button>
                  <button
                    onClick={() => useConflictStore.getState().resolve(c.id, 'local')}
                    className="shrink-0 text-bronze link-underline"
                  >
                    取本地
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
    </Section>
  )
}
