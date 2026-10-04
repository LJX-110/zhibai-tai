/**
 * 设置 · 同步（GitHub 私有仓库 + 加密快照）
 *
 * 从 SettingsPage 拆出。状态自洽：草稿、同步动作、冲突列表都在本文件内。
 *
 * ## 2026-10-02 收口（用户反馈"数据页乱 + 同步经常失败"）
 *  · 状态卡 = 点 + 标签 + 明细 + **出错时「重试」**，上次时间改用友好格式（`formatDateTime`）；
 *  · 字段行收入 `SettingsPanel`（与 AI 页同一套版式）；
 *  · **修正误导文案**：此前写"失败时在下方「抓取与代理」填转发地址"——
 *    同步根本不经过应用内抓取代理（Token 不过任何第三方）。同步只认浏览器直连 api.github.com，
 *    网络不通时该用系统级代理 / VPN；
 *  · Token / 同步口令补「清除」出口（删除能力要留出口），清除走确认弹窗。
 */
import { Loading } from '../../components/ui/Loading'
import { useState, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { SyncInterval } from '../../stores/useSettingsStore'
import { useConflictStore } from '../../stores/useConflictStore'
import { runSync } from '../../sync/SyncService'
import { encryptor } from '../../sync/encryption/encryption'
import { isDirty, subscribeDirty } from '../../sync/auto'
import { SYNC_TONE_CLASS, syncSummary } from '../../sync/status'
import { formatDateTime } from '../../utils/id'
import { Badge, Button, Collapse, Dialog, Input, Section, Select, Switch, useToast } from '../../components/ui'
import { SettingsPanel, SettingsRow } from './SettingsRow'
import { cn } from '../../utils/cn'

export function SyncGroup() {
  const settings = useSettingsStore()
  const toast = useToast().toast
  const [syncing, setSyncing] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  /** 清除凭据的确认目标（null = 弹窗关着） */
  const [clearTarget, setClearTarget] = useState<'token' | 'password' | null>(null)
  const conflicts = useConflictStore((s) => s.items)
  const pendingConflicts = conflicts.filter((c) => !c.resolved)
  const connected = Boolean(settings.githubRepo && settings.githubTokenEnc && settings.syncPasswordEnc)
  // 「有改动待同步」这个标记在 sync/auto 的模块作用域里（已持久化），不是 store ——
  // 只能用订阅方式取值（与 services/ai/health.ts 同一套路）
  const dirty = useSyncExternalStore(subscribeDirty, isDirty, () => false)
  const summary = syncSummary({
    connected,
    status: settings.syncStatus,
    dirty,
    error: settings.syncError,
  })

  const doSync = async () => {
    setSyncing(true)
    try {
      // 同步成功不弹 toast：状态行与顶栏圆点已反馈，避免每个动作都被打断
      const r = await runSync()
      // 并发锁：自动同步正在进行时手动点会被跳过 —— 必须让用户知道"没白点"
      if (r.message === '同步进行中，已跳过本次') toast('同步正在进行 —— 已跳过本次，稍等片刻', 'info')
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

  /** 清除凭据（走确认弹窗）：只影响本机；重新填入同一口令 / 有效 Token 即可恢复 */
  const doClear = () => {
    if (clearTarget === 'token') {
      settings.set({ githubToken: undefined, githubTokenEnc: false })
      toast('Token 已清除 —— 重新填入后恢复同步', 'success')
    } else if (clearTarget === 'password') {
      settings.set({ syncPassword: undefined, syncPasswordEnc: false })
      toast('同步口令已清除 —— 重新填入同一口令即可恢复', 'success')
    }
    setClearTarget(null)
  }

  // 同步只用「仓库完整」模式：仓库 + contents 权限 Token + Sync Password（数据加密密钥）

  return (
    <Section
      title="GitHub 同步"
      hint={settings.lastSyncedAt ? `上次同步 ${formatDateTime(settings.lastSyncedAt)}` : '尚未同步'}
      action={
        <Button size="sm" variant="secondary" onClick={doSync} disabled={syncing || !connected}>
          <Loading size={13} spinning={syncing} />
          {syncing ? '同步中…' : '立即同步'}
        </Button>
      }
    >
      {/* 首次同步三步引导（2026-10-01 收口）：改回**折叠**（用户："没必要展开的可以不展开"）——
          标题即说明，首屏不再被三步占满一屏；仓库配好后整块消失 */}
      {!settings.githubRepo?.trim() && (
        <Collapse title="第一次同步？三步开启" hint="建仓库 · 拿 Token · 填回这里" className="!pb-0 mb-3">
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

      <SettingsPanel>
        {/* 状态卡：判据是「**是否已是最新**」，不是"上次尝试的结果" ——
            上次同步成功但之后又改过数据，现在并不最新，显示「已同步」会误导用户。
            2026-10-02：错误时就地给「重试」；上次时间改友好格式 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2.5">
          <span className={cn('inline-flex items-center gap-1.5 text-sm', SYNC_TONE_CLASS[summary.tone].text)}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', SYNC_TONE_CLASS[summary.tone].dot)} />
            {summary.label}
          </span>
          {summary.tone === 'error' && (
            <Button size="sm" variant="tertiary" onClick={doSync} disabled={syncing}>
              <RefreshCw size={12} /> 重试
            </Button>
          )}
          {settings.lastSyncedAt && (
            <span className="tabular ml-auto text-xs text-ink-faint">{formatDateTime(settings.lastSyncedAt)}</span>
          )}
        </div>
        {summary.detail && (
          <p
            className={cn(
              'px-2.5 pb-2 text-xs leading-relaxed',
              summary.tone === 'error' ? 'text-cinnabar' : 'text-ink-faint',
            )}
          >
            {summary.detail}
          </p>
        )}

        {/* ⚠️ 这几行必须 flex-wrap：320px 上「标签 + 输入 + 按钮 + 状态字」挤在一行
            会把输入框压到只剩几十像素（Token / 口令这种必须能看清内容的字段尤其致命） */}
        <SettingsRow label="仓库">
          <Input
            placeholder="owner/repo"
            value={settings.githubRepo ?? ''}
            onChange={(e) => settings.set({ githubRepo: e.target.value })}
            className="min-w-0 flex-1 basis-full sm:basis-0"
          />
        </SettingsRow>
        <SettingsRow label="分支">
          <Input
            value={settings.githubBranch ?? 'main'}
            onChange={(e) => settings.set({ githubBranch: e.target.value })}
            className="min-w-0 flex-1 basis-full sm:basis-0"
          />
        </SettingsRow>
        <SettingsRow label="Token">
          <Input
            type="password"
            placeholder="GitHub Token"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            className="min-w-0 flex-1 basis-full sm:basis-0"
          />
          <Button size="sm" variant="secondary" onClick={saveToken} disabled={!tokenDraft.trim()}>
            加密保存
          </Button>
          {settings.githubTokenEnc && (
            <>
              <span className="shrink-0 text-xs text-teal">已保存（加密）</span>
              <button
                type="button"
                onClick={() => setClearTarget('token')}
                aria-label="清除 Token"
                className="link-underline shrink-0 rounded-control px-1 py-0.5 text-xs text-ink-faint hover:text-cinnabar"
              >
                清除
              </button>
            </>
          )}
        </SettingsRow>
        <SettingsRow label="同步口令">
          <Input
            type="password"
            placeholder="同步密码"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            className="min-w-0 flex-1 basis-full sm:basis-0"
          />
          <Button size="sm" variant="secondary" onClick={savePassword} disabled={passwordDraft.length < 6}>
            加密保存
          </Button>
          {settings.syncPasswordEnc && (
            <>
              <span className="shrink-0 text-xs text-teal">已保存（加密）</span>
              <button
                type="button"
                onClick={() => setClearTarget('password')}
                aria-label="清除同步口令"
                className="link-underline shrink-0 rounded-control px-1 py-0.5 text-xs text-ink-faint hover:text-cinnabar"
              >
                清除
              </button>
            </>
          )}
        </SettingsRow>
        <p className="flex items-center gap-1.5 px-2.5 pb-2 text-xs text-cinnabar">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar" />
          加密后仅存本机；需仓库 <code className="rounded-control bg-nested px-1">contents:write</code> 权限
        </p>
        {/* 2026-10-02 修正：此前写"失败时在下方抓取与代理填转发地址"是**错的** ——
            同步只认浏览器直连 api.github.com（Token 不过任何第三方），
            抓取代理只服务情报源 */}
        <p className="flex items-start gap-1.5 px-2.5 pb-2.5 text-xs leading-relaxed text-bronze">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bronze" />
          同步需浏览器能直连 api.github.com；网络不通时用系统级代理 / VPN（Token 不经过应用内转发）
        </p>
      </SettingsPanel>

      {/* 自动同步 */}
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-paper border border-line bg-panel px-3 py-2">
        <span className="text-sm text-ink-soft">自动同步</span>
        {/* 用共用 Switch（位移走 translate-x）；此前这里手抄了一份用 `left` 过渡的开关 —— 
            既重复实现，又在动画 `left`（只允许 transform / opacity） */}
        <Switch
          checked={settings.autoSync}
          onChange={() => settings.set({ autoSync: !settings.autoSync })}
          label="自动同步开关"
        />
        <Select
          value={settings.syncInterval}
          onChange={(e) => settings.set({ syncInterval: e.target.value as SyncInterval })}
          className="!w-auto !py-1 text-xs"
          aria-label="自动同步间隔"
        >
          <option value="immediate">间隔：立即</option>
          <option value="30s">间隔：30 秒</option>
          <option value="5m">间隔：5 分钟</option>
          <option value="manual">手动</option>
        </Select>
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

      {/* 清除凭据：确认后才动（凭据是同步的钥匙，误清 = 本机同步停摆） */}
      <Dialog
        open={clearTarget !== null}
        onClose={() => setClearTarget(null)}
        title={clearTarget === 'password' ? '清除同步口令？' : '清除 GitHub Token？'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setClearTarget(null)}>取消</Button>
            <Button variant="danger" onClick={doClear}>确认清除</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          {clearTarget === 'password'
            ? '清除后本机无法解密远端快照、也无法推送；其他设备不受影响。重新填入同一个口令即可恢复。'
            : '清除后本机无法推送与拉取；其他设备不受影响。重新生成并填入 Token 即可恢复。'}
        </p>
      </Dialog>
    </Section>
  )
}