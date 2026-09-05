/**
 * 系统 —— 设置 / 布局模式 / 目标 / 数据管理 / 同步
 */
import { useRef, useState } from 'react'
import { Download, Monitor, Moon, RefreshCw, Sun, Trash2, Upload, Zap } from 'lucide-react'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { ThemeMode } from '../stores/useSettingsStore'
import { useSyncStore } from '../stores/useSyncStore'
import { useConflictStore } from '../stores/useConflictStore'
import type { SyncInterval } from '../stores/useSettingsStore'
import { useResolvedLayout } from '../layouts/useResolvedLayout'
import { db } from '../db/db'
import { BUSINESS_TABLES, TOMBSTONES } from '../db/tables'
import { markTombstones } from '../repositories/repo'
import { reloadAllStores } from '../stores/reload'
import { runSync } from '../sync/SyncService'
import { encryptor } from '../sync/encryption/encryption'
import { SourceManager } from '../components/source/SourceManager'
import { playSound } from '../services/sound'
import { browserNotify } from '../services/notification'
import { testAIProvider, resolveAIProvider } from '../services/ai/ai-service'
import type { LayoutMode } from '../stores/useAppStore'
import {
  Badge,
  Button,
  Dialog,
  Input,
  PageHeader,
  Section,
  useToast,
} from '../components/ui'
import { cn } from '../utils/cn'

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; desc: string }[] = [
  { value: 'desktop', label: '桌面工作台', desc: '左侧导航 · 宽内容区 · 多列信息' },
  { value: 'mobile', label: '移动终端', desc: '顶部状态 · 单列内容 · 底部导航' },
  { value: 'auto', label: '自动', desc: '按屏幕宽度自适应' },
]

const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', desc: '旧纸 · 墨 · 浅灰', icon: Sun },
  { value: 'dark', label: '深色', desc: '墨黑 · 黛青 · 灰白', icon: Moon },
  { value: 'system', label: '跟随系统', desc: '随设备自动切换', icon: Monitor },
]

/** AI Provider 预设：一键填 baseUrl+model（OpenAI 兼容协议），
 *  拿到 Agnes API 信息后点预设 → 填 Key → 测试连接即可用 */
const AI_PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'agnes-2.5-flash' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
]

type SettingsGroup = 'appearance' | 'ai' | 'data' | 'sync'
/** 设置分组：四组语义导航，替代 15+ 区块长滚动 */
const SETTINGS_GROUPS: { key: SettingsGroup; label: string }[] = [
  { key: 'appearance', label: '外观 · 目标' },
  { key: 'ai', label: '智能' },
  { key: 'data', label: '数据' },
  { key: 'sync', label: '同步' },
]

/** 分类管理已内联到使用处：情报分类在「情」页页签行尾 + 号管理；
 *  藏阁仅保留「类型」一套体系，不再有独立分类编辑。 */

export function SettingsPage() {
  const settings = useSettingsStore()
  const resolved = useResolvedLayout()
  const toast = useToast().toast
  const [clearOpen, setClearOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const exportData = async () => {
    // 以 BUSINESS_TABLES 单一事实源为准，导出全部业务表并附带墓碑
    const dump: Record<string, unknown> = {}
    for (const t of BUSINESS_TABLES) {
      dump[t.key] = await db.table(t.key).toArray()
    }
    dump.tombstones = await db.table(TOMBSTONES).toArray()
    dump._meta = {
      app: 'yishu-workbench',
      version: '0.4.0',
      tables: BUSINESS_TABLES.length,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `yishu-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('已导出备份 JSON（全部 23 张业务表）', 'success')
  }

  const clearAll = async () => {
    try {
      for (const t of BUSINESS_TABLES) {
        // 先取主键再清表，并为每行写墓碑：
        // 否则本机清空后一次同步，远端快照会把数据原样加回来（清空被"撤销"）。
        const ids = (await db.table(t.key).toCollection().primaryKeys()) as string[]
        await db.table(t.key).clear()
        await markTombstones(t.key, ids)
      }
      // 冲突记录与同步队列一并清空；墓碑保留 —— 它承载"清空"这一事实的跨设备传播
      await Promise.all([db.table('conflicts').clear(), db.table('syncQueue').clear()])
      // 内存态统一重载（覆盖全部 23 个领域 store）
      await reloadAllStores()
      setClearOpen(false)
      toast('已清空全部数据，其他设备下次同步将同样清空', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '清空失败，请重试', 'danger')
    }
  }

  /** 导入恢复：解析备份文件 → 预览各表行数 → 确认后覆盖写入 */
  const importInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{
    dump: Record<string, unknown[]>
    summary: { key: string; label: string; count: number }[]
  } | null>(null)

  const onImportFile = async (file: File) => {
    try {
      const dump = JSON.parse(await file.text()) as Record<string, unknown[]>
      if (!dump || typeof dump !== 'object') throw new Error('文件结构不正确')
      const summary = BUSINESS_TABLES.map((t) => {
        const rows = Array.isArray(dump[t.key]) ? (dump[t.key] as unknown[]).length : -1
        return { key: t.key, label: t.label, count: rows }
      })
      if (!summary.some((s) => s.count >= 0)) throw new Error('未识别到任何业务表数据')
      setPendingImport({ dump, summary })
    } catch (e) {
      toast(e instanceof Error ? e.message : '文件解析失败', 'danger')
    }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    try {
      // 安全网：写入前把当前数据自动导出一份，误操作可回退
      await exportData()
      let tables = 0
      for (const t of BUSINESS_TABLES) {
        const rows = pendingImport.dump[t.key]
        if (!Array.isArray(rows)) continue
        await db.table(t.key).clear()
        if (rows.length > 0) await db.table(t.key).bulkPut(rows as never[])
        tables++
      }
      // 墓碑随备份恢复（若包含），保持删除意图一致
      if (Array.isArray(pendingImport.dump.tombstones)) {
        await db.table(TOMBSTONES).clear()
        await db.table(TOMBSTONES).bulkPut(pendingImport.dump.tombstones as never[])
      }
      await reloadAllStores()
      setPendingImport(null)
      toast(`已恢复 ${tables} 张表；恢复前的数据已自动导出为安全备份`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败，文件可能已损坏', 'danger')
    }
  }

  const [tokenDraft, setTokenDraft] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  const [aiKeyDraft, setAiKeyDraft] = useState('')
  const pendingCount = useSyncStore((s) => s.pending)
  const conflicts = useConflictStore((s) => s.items)
  const pendingConflicts = conflicts.filter((c) => !c.resolved)

  const doSync = async () => {
    setSyncing(true)
    try {
      const res = await runSync()
      toast(`${res.message} · 拉取 ${res.pulled} 条`, 'success')
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

  const connected = Boolean(settings.githubRepo && settings.githubTokenEnc)
  const [group, setGroup] = useState<SettingsGroup>('appearance')

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="大象无形" title="系统 · 配置" />
      {/* 分组导航：一次点击定位任一设置 */}
      <div className="mb-5 flex w-fit gap-1 rounded-tile bg-nested/50 p-0.5">
        {SETTINGS_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            className={cn(
              'rounded-control px-3.5 py-1.5 text-sm transition-colors',
              group === g.key ? 'bg-paper text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      {group === 'appearance' && (<>
      <Section title="个人">
        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">称呼</span>
          <Input
            value={settings.profileName}
            onChange={(e) => settings.set({ profileName: e.target.value })}
            className="max-w-[220px]"
            placeholder="怎么称呼你"
          />
        </div>
      </Section>

      <Section title="主题">
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => settings.set({ theme: o.value })}
              className={cn(
                'rounded-paper border p-4 text-center transition-colors',
                settings.theme === o.value
                  ? 'border-cinnabar/50 bg-cinnabar/5'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <o.icon size={18} className="mx-auto mb-1.5 text-ink-soft" />
              <div className="text-sm font-medium text-ink">{o.label}</div>
              <div className="mt-0.5 text-[11px] text-ink-faint">{o.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="音效" hint="Web Audio 合成 · 默认关闭">
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">音效</span>
              <button
                role="switch"
                aria-checked={settings.soundEnabled}
                onClick={() => {
                  const next = !settings.soundEnabled
                  settings.set({ soundEnabled: next })
                  // 开启瞬间播一声确认：既是反馈也是"音效已可用"的自证
                  if (next) playSound('ui-confirm')
                }}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.soundEnabled ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.soundEnabled ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-ink-faint">
                <span>音量</span>
                <span className="tabular">{Math.round(settings.soundVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.soundVolume}
                onChange={(e) => settings.set({ soundVolume: Number(e.target.value) })}
                className="w-full accent-[var(--color-teal)]"
                aria-label="音效音量"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['seal', 'paper', 'compass', 'qimen'] as const).map((k) => (
                <Button key={k} size="sm" variant="tertiary" silent onClick={() => playSound(k)} className="!px-2">
                  {k}
                </Button>
              ))}
            </div>
          </div>
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">环境音</span>
              <button
                role="switch"
                aria-checked={settings.ambientEnabled}
                onClick={() => settings.set({ ambientEnabled: !settings.ambientEnabled })}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.ambientEnabled ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.ambientEnabled ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              极轻的低通噪声底（纸/风/静室感），Web Audio 实时合成；可随时关闭。默认关闭。
            </p>
          </div>
        </div>
      </Section>

      <Section title="通知" hint="轻量提示 · 非强制弹窗">
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">应用内通知</span>
              <button
                role="switch"
                aria-checked={settings.notifyEnabled}
                onClick={() => settings.set({ notifyEnabled: !settings.notifyEnabled })}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.notifyEnabled ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.notifyEnabled ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">到期待办 · 关注更新 · 情报更新</p>
          </div>
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">浏览器通知</span>
              <button
                role="switch"
                aria-checked={settings.browserNotify}
                onClick={async () => {
                  const next = !settings.browserNotify
                  settings.set({ browserNotify: next })
                  if (next) {
                    const ok = await browserNotify('知白台', '通知已开启')
                    if (!ok) toast('浏览器通知不可用或未授权', 'info')
                  }
                }}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.browserNotify ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.browserNotify ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">需浏览器授权，可随时关闭</p>
          </div>
        </div>
      </Section>


      <Section title="布局模式" hint={`当前：${resolved === 'desktop' ? '桌面工作台' : '移动终端'}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LAYOUT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => settings.set({ layoutMode: o.value })}
              className={cn(
                'rounded-paper border p-4 text-left transition-colors',
                settings.layoutMode === o.value
                  ? 'border-cinnabar/50 bg-cinnabar/5'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <div className="display text-sm font-semibold text-ink">{o.label}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-ink-muted">{o.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="目标">
        <div className="row">
          <span className="w-28 shrink-0 text-sm text-ink-muted">每日饮水目标</span>
          <Input
            type="number"
            min={0}
            step={100}
            value={settings.waterGoalMl}
            onChange={(e) => settings.set({ waterGoalMl: Number(e.target.value) || 0 })}
            className="max-w-[160px]"
          />
          <span className="text-xs text-ink-faint">ml</span>
        </div>
        <div className="row">
          <span className="w-28 shrink-0 text-sm text-ink-muted">番茄钟 · 专注</span>
          <Input
            type="number"
            min={1}
            value={settings.pomodoroFocusMin}
            onChange={(e) => settings.set({ pomodoroFocusMin: Number(e.target.value) || 25 })}
            className="max-w-[160px]"
          />
          <span className="text-xs text-ink-faint">分钟</span>
        </div>
        <div className="row">
          <span className="w-28 shrink-0 text-sm text-ink-muted">番茄钟 · 休整</span>
          <Input
            type="number"
            min={1}
            value={settings.pomodoroBreakMin}
            onChange={(e) => settings.set({ pomodoroBreakMin: Number(e.target.value) || 5 })}
            className="max-w-[160px]"
          />
          <span className="text-xs text-ink-faint">分钟</span>
        </div>
      </Section>

      </>
      )}
      {group === 'data' && (
      <Section
        title="数据"
        hint="Local-first · 存于本机 IndexedDB"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={exportData}>
              <Download size={13} /> 导出备份
            </Button>
            <Button size="sm" variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Upload size={13} /> 导入恢复
            </Button>
            <Button size="sm" variant="danger" onClick={() => setClearOpen(true)}>
              <Trash2 size={13} /> 清空数据
            </Button>
          </div>
        }
      >
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onImportFile(file)
            e.target.value = ''
          }}
        />
        {/* 导入确认：展示各表行数，明确覆盖语义 */}
        <Dialog
          open={pendingImport !== null}
          onClose={() => setPendingImport(null)}
          title="导入恢复"
          footer={
            <>
              <Button variant="tertiary" onClick={() => setPendingImport(null)}>取消</Button>
              <Button variant="primary" onClick={confirmImport}>确认恢复</Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-ink-muted">
            恢复将<strong className="text-cinnabar">覆盖</strong>下列各表现有数据；确认前会自动导出当前数据作为安全备份。
          </p>
          <div className="max-h-56 overflow-y-auto rounded-tile border border-line p-2">
            {pendingImport?.summary.map((s) => (
              <div key={s.key} className="flex items-center justify-between px-1 py-0.5 text-[13px]">
                <span className="text-ink">{s.label}</span>
                <span className="tabular text-ink-muted">
                  {s.count >= 0 ? `${s.count} 条` : '备份中无此表'}
                </span>
              </div>
            ))}
          </div>
        </Dialog>
        <p className="mt-2 text-[11px] text-ink-faint">
          数据存本机 IndexedDB；多端同步通过 GitHub 私有仓库快照（见下方「GitHub 同步」）。
        </p>
      </Section>
      )}

      {group === 'ai' && (<>
      <Section title="AI Core" hint="OpenAI 兼容 Provider（Agnes / DeepSeek / Kimi…）">
        <div className="max-w-xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">Provider</span>
            <div className="flex gap-1 rounded-tile bg-nested/50 p-0.5">
              {([
                ['local', '本地规则'],
                ['remote', '远程模型'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    settings.set({ aiProvider: v })
                    void resolveAIProvider()
                  }}
                  className={cn(
                    'rounded-control px-3 py-1 text-sm transition-colors',
                    settings.aiProvider === v ? 'bg-paper text-ink' : 'text-ink-muted',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-ink-faint">远程需配置 Key（加密存储，绝不硬编码）</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">预设</span>
            <div className="flex flex-wrap gap-1">
              {AI_PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  variant={settings.aiBaseUrl === p.baseUrl ? 'primary' : 'tertiary'}
                  onClick={() => {
                    settings.set({ aiBaseUrl: p.baseUrl, aiModel: p.model })
                    toast(`已填入 ${p.name} 预设，填 Key 后点「测试连接」`, 'info')
                  }}
                  className="!px-2"
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">Base URL</span>
            <Input
              value={settings.aiBaseUrl}
              onChange={(e) => settings.set({ aiBaseUrl: e.target.value })}
              className="flex-1 font-mono !text-xs"
              placeholder="https://apihub.agnes-ai.com/v1"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">模型</span>
            <Input
              value={settings.aiModel}
              onChange={(e) => settings.set({ aiModel: e.target.value })}
              className="flex-1 font-mono !text-xs"
              placeholder="agnes-2.5-flash / deepseek-chat"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-ink-muted">API Key</span>
            <Input
              type="password"
              placeholder={settings.aiKeyEnc ? '已加密保存 · 输入以更换' : 'sk-…'}
              value={aiKeyDraft}
              onChange={(e) => setAiKeyDraft(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                if (!aiKeyDraft.trim()) return
                const enc = await encryptor.encrypt(aiKeyDraft.trim())
                settings.set({ aiKey: enc, aiKeyEnc: true })
                setAiKeyDraft('')
                void resolveAIProvider()
                toast('API Key 已加密保存（AES-GCM）', 'success')
              }}
              disabled={!aiKeyDraft.trim()}
            >
              加密保存
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0" />
            <Button
              variant="tertiary"
              onClick={async () => {
                const r = await testAIProvider()
                toast(r.message, r.ok ? 'success' : 'danger')
              }}
              disabled={!settings.aiKey}
            >
              <Zap size={13} /> 测试连接
            </Button>
            <span className="text-[11px] text-ink-faint">所有 AI 写入均先预览，经你确认后才落库</span>
          </div>
        </div>
      </Section>
      <SourceManager />
      </>
      )}

      {group === 'sync' && (
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
          {pendingCount > 0 && (
            <span className="text-xs text-ink-muted">待同步 <span className="tabular text-ink">{pendingCount}</span> 条</span>
          )}
          {settings.lastSyncedAt && (
            <span className="tabular text-xs text-ink-faint">{settings.lastSyncedAt}</span>
          )}
          {settings.syncError && (
            <span className="text-xs text-cinnabar">错误：{settings.syncError}</span>
          )}
        </div>

        <div className="space-y-2 py-1">
          <div className="row">
            <span className="w-20 shrink-0 text-sm text-ink-muted">仓库</span>
            <Input
              placeholder="owner/repo（如 user/private-backup）"
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
              placeholder="GitHub Personal Access Token"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              className="max-w-[300px]"
            />
            <Button size="sm" variant="secondary" onClick={saveToken} disabled={!tokenDraft.trim()}>
              加密保存
            </Button>
            {settings.githubTokenEnc && (
              <span className="text-[11px] text-teal">已保存（加密）</span>
            )}
          </div>
          <div className="row">
            <span className="w-20 shrink-0 text-sm text-ink-muted">同步口令</span>
            <Input
              type="password"
              placeholder="Sync Password（数据加密，跨设备恢复用）"
              value={passwordDraft}
              onChange={(e) => setPasswordDraft(e.target.value)}
              className="max-w-[300px]"
            />
            <Button size="sm" variant="secondary" onClick={savePassword} disabled={passwordDraft.length < 6}>
              加密保存
            </Button>
            {settings.syncPasswordEnc && (
              <span className="text-[11px] text-teal">已保存（加密）</span>
            )}
          </div>
          <p className="flex items-center gap-1.5 pt-1 text-[11px] text-cinnabar">
            <span className="h-1.5 w-1.5 rounded-full bg-cinnabar" />
            Token 经 AES-GCM 加密后仅存本机；需仓库 <code className="rounded-control bg-nested px-1">contents:write</code> 权限。绝不写入代码/提交。
          </p>

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
            <span className="text-[11px] text-ink-faint">网络恢复自动同步 · 失败自动重试</span>
          </div>

          {/* 冲突 */}
          {pendingConflicts.length > 0 && (
            <div className="mt-2 rounded-paper border border-cinnabar/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="text-cinnabar">同步冲突 {pendingConflicts.length} 条</span>
                <span className="text-[11px] text-ink-faint">已按较新版本合并，可手动选择</span>
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
        </div>
      </Section>
      )}

      <p className="py-6 text-center text-[11px] tracking-[0.3em] text-ink-faint">
        知白台 V1.6 · Local-first
      </p>

      <Dialog open={clearOpen} onClose={() => setClearOpen(false)} title="清空全部数据？">
        <p className="text-sm leading-relaxed text-ink-soft">
          将删除本机 IndexedDB 中的全部记录（待办/笔记/喝水/番茄钟/收藏等），不可恢复。建议先「导出备份」。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setClearOpen(false)}>取消</Button>
          <Button variant="danger" onClick={clearAll}>
            <Trash2 size={14} /> 确认清空
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
