/**
 * SourceManager —— 情报源管理（系统）
 * 增删/启停/测试/立即抓取 + 推荐来源目录（本地 Provider Catalog）
 */
import { useState } from 'react'
import { Download, Pencil, Plus, Power, Trash2, Zap } from 'lucide-react'
import { useSourceStore } from '../../stores/useSourceStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { PROVIDER_CATALOG, fetchFromSource, testSource } from '../../services/intelligence/providers/registry'
import { classifyFetchError, type FetchErrorInfo } from '../../services/intelligence/providers/scraper'
import { initIntelAutoFetch } from '../../services/intelligence/auto'
import type { IntelligenceItem, IntelligenceProviderId, IntelligenceSource } from '../../types/entities'
import { createId } from '../../utils/id'
import { cn } from '../../utils/cn'
import { Badge, Button, Dialog, EmptyState, Input, Section, Select, useToast } from '../ui'

const PROVIDER_LABEL: Record<IntelligenceProviderId, string> = {
  github: 'GitHub',
  rss: 'RSS',
  atom: 'Atom',
  json: 'JSON',
  rest: 'REST',
  mock: '示例',
  game: '游戏',
  anime: '动漫',
  official: '官方',
  web: 'Web',
  custom: '自定义',
  steam: 'Steam',
  rawg: 'RAWG',
  jikan: 'Jikan',
}

const PROVIDER_ORDER: IntelligenceProviderId[] = [
  'steam',
  'rawg',
  'jikan',
  'github',
  'rss',
  'atom',
  'json',
  'rest',
  'web',
  'custom',
  'mock',
  'game',
  'anime',
  'official',
]

const CONFIG_HINT: Partial<Record<IntelligenceProviderId, string>> = {
  steam: 'JSON：{"appid":730}（Steam 应用 ID）',
  rawg: 'JSON：{"key":"你的 RAWG key"}',
  jikan: 'JSON：{"mode":"season|top|search","type":"anime|manga","q":"关键词"}',
  github: 'JSON：{"queries":["topic:local-first"]}',
  web: 'JSON：{"itemSel":"article","titleSel":"h2","linkSel":"a","summarySel":"p","timeSel":"time"}',
  json: 'JSON：{"listPath":"items","titleKey":"title","urlKey":"url","summaryKey":"summary","dateKey":"date"}',
  rest: 'JSON：{"listPath":"data.list","titleKey":"name","urlKey":"html_url"}',
}

interface FormState {
  name: string
  provider: IntelligenceProviderId
  url: string
  category: string
  config: string
}

const EMPTY: FormState = { name: '', provider: 'rss', url: '', category: '科技', config: '' }

export function SourceManager() {
  const sources = useSourceStore((s) => s.items)
  const intelAuto = useSettingsStore((s) => s.intelAutoFetch)
  const intelMinutes = useSettingsStore((s) => s.intelFetchMinutes)
  const intelCategories = useSettingsStore((s) => s.intelCategories)
  const toast = useToast().toast
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<IntelligenceSource | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY })
  const [testing, setTesting] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    source: IntelligenceSource
    items: IntelligenceItem[]
    error?: FetchErrorInfo
    loading: boolean
  } | null>(null)

  const openNew = (preset?: { provider: IntelligenceProviderId; name: string; category: string; config?: string }) => {
    setEditing(null)
    setForm({
      name: preset?.name ?? '',
      provider: preset?.provider ?? 'rss',
      url: '',
      category: preset?.category ?? '科技',
      config: preset?.config ?? '',
    })
    setOpen(true)
  }
  const openEdit = (s: IntelligenceSource) => {
    setEditing(s)
    setForm({
      name: s.name,
      provider: s.provider,
      url: s.url ?? '',
      category: s.category,
      config: s.config ?? '',
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString()
    await useSourceStore.getState().save({
      id: editing?.id ?? createId(),
      name: form.name.trim(),
      provider: form.provider,
      url: form.url.trim() || undefined,
      category: form.category.trim() || '科技',
      enabled: editing?.enabled ?? true,
      config: form.config.trim() || undefined,
      lastFetchedAt: editing?.lastFetchedAt,
      lastError: editing?.lastError,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    })
    setOpen(false)
    toast('情报源已保存', 'success')
  }

  const remove = async (s: IntelligenceSource) => {
    await useSourceStore.getState().remove(s.id)
    toast('已删除')
  }
  const toggleEnabled = async (s: IntelligenceSource) => {
    await useSourceStore.getState().update(s.id, {
      enabled: !s.enabled,
      updatedAt: new Date().toISOString(),
    })
  }
  /** 测试：拉取 → 预览（成功显示条目，失败分类展示 CORS/认证/解析/空） */
  const test = async (s: IntelligenceSource) => {
    setTesting(s.id)
    setPreview({ source: s, items: [], loading: true })
    try {
      const items = await testSource(s)
      setPreview({ source: s, items, loading: false })
    } catch (e) {
      setPreview({ source: s, items: [], error: classifyFetchError(e), loading: false })
    } finally {
      setTesting(null)
    }
  }
  /** 立即抓取并并入情报流 */
  const fetchNow = async (s: IntelligenceSource) => {
    setTesting(s.id)
    try {
      const fresh = await fetchFromSource(s)
      const existing = useIntelligenceStore.getState().items
      const known = new Set(existing.map((x) => dedupeKey(x)))
      const merged = [...fresh.filter((x) => !known.has(dedupeKey(x))), ...existing]
      useIntelligenceStore.setState({ items: merged })
      toast(`抓取 ${s.name}：新增 ${fresh.length} 条`, 'success')
    } catch {
      toast('抓取失败', 'danger')
    } finally {
      setTesting(null)
    }
  }

  return (
    <Section
      title="情报源"
      hint={`${sources.length} 个 · 启停/测试/抓取`}
      action={
        <Button size="sm" variant="primary" onClick={() => openNew()}>
          <Plus size={13} /> 新增源
        </Button>
      }
    >
      {/* 定时自动抓取 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-line bg-panel px-3 py-2">
        <span className="text-sm text-ink">定时自动抓取</span>
        <button
          role="switch"
          aria-checked={intelAuto}
          onClick={() => {
            useSettingsStore.getState().set({ intelAutoFetch: !intelAuto })
            initIntelAutoFetch()
          }}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors',
            intelAuto ? 'bg-teal' : 'bg-nested',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
              intelAuto ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </button>
        <span className="text-[11px] text-ink-faint">间隔</span>
        <Select
          value={String(intelMinutes)}
          onChange={(e) => {
            useSettingsStore.getState().set({ intelFetchMinutes: Number(e.target.value) })
            initIntelAutoFetch()
          }}
          className="!w-auto !py-1 text-xs"
          disabled={!intelAuto}
          aria-label="抓取间隔"
        >
          <option value="30">30 分钟</option>
          <option value="60">1 小时</option>
          <option value="360">6 小时</option>
        </Select>
        <span className="ml-auto text-[11px] text-ink-faint">
          {intelAuto ? `每 ${intelMinutes} 分钟自动拉取启用源` : '默认关闭'}
        </span>
      </div>

      {sources.length > 0 ? (
        <div>
          {sources.map((s) => (
            <div key={s.id} className="row group">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-tile text-xs',
                  s.enabled ? 'bg-teal/10 text-teal' : 'bg-nested/60 text-ink-faint',
                )}
              >
                {PROVIDER_LABEL[s.provider].slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('text-sm font-medium', s.enabled ? 'text-ink' : 'text-ink-faint')}>
                    {s.name}
                  </span>
                  <Badge tone="plain">{PROVIDER_LABEL[s.provider]}</Badge>
                  <Badge tone="teal">{s.category}</Badge>
                  {!s.enabled && <Badge tone="plain">停用</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-faint">
                  {s.url && <span className="truncate">{s.url}</span>}
                  {s.lastFetchedAt && <span className="tabular">抓取于 {s.lastFetchedAt.slice(0, 16).replace('T', ' ')}</span>}
                  {s.lastError && <span className="text-cinnabar">上次失败</span>}
                </div>
              </div>
              <Button size="sm" variant="tertiary" onClick={() => fetchNow(s)} disabled={testing === s.id} className="!px-2">
                <Download size={13} /> {testing === s.id ? '抓取中' : '抓取'}
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => test(s)} disabled={testing === s.id} className="!px-2">
                <Zap size={13} /> 测试
              </Button>
              <button
                onClick={() => toggleEnabled(s)}
                className={cn('rounded-control p-1.5 transition-colors', s.enabled ? 'text-teal' : 'text-ink-faint hover:text-teal')}
                aria-label={s.enabled ? '停用' : '启用'}
              >
                <Power size={14} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => openEdit(s)} aria-label="编辑">
                <Pencil size={14} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => remove(s)} aria-label="删除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有情报源"
          action={
            <Button variant="primary" onClick={() => openNew()}>
              <Plus size={13} /> 新增源
            </Button>
          }
        />
      )}

      {/* 推荐来源目录 */}
      <div className="mt-4">
        <div className="section-title text-sm">
          <span className="display">推荐来源</span>
          <span className="hint">本地 Provider Catalog · 点击即添加</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDER_CATALOG.map((p) => (
            <button
              key={`${p.name}-${p.config ?? ''}`}
              onClick={() => openNew(p)}
              className="rounded-paper border border-line p-3 text-left transition-colors hover:border-line-strong"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <Badge tone="plain">{PROVIDER_LABEL[p.provider]}</Badge>
              </div>
              <div className="mt-0.5 text-[11px] text-ink-muted">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '改情报源' : '新增情报源'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!form.name.trim()}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as IntelligenceProviderId })}>
              {PROVIDER_ORDER.map((p) => (
                <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
              ))}
            </Select>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="分类">
              {intelCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          {(form.provider === 'rss' || form.provider === 'custom') && (
            <Input placeholder="Feed URL（rss/custom 必填）" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          )}
          {CONFIG_HINT[form.provider] && (
            <Input
              placeholder={CONFIG_HINT[form.provider]}
              value={form.config}
              onChange={(e) => setForm({ ...form, config: e.target.value })}
              className="font-mono !text-xs"
            />
          )}
          <p className="text-[11px] text-ink-faint">
            Steam/Jikan 无需 Key（Steam 需 App ID）；RAWG 需在配置填 key（绝不写源码）。GitHub 用公共搜索 API。
          </p>
        </div>
      </Dialog>

      {/* 测试预览：连接 → 预览 → 字段映射确认 → 保存 */}
      <Dialog
        open={preview != null}
        onClose={() => setPreview(null)}
        title={`测试 · ${preview?.source.name ?? ''}`}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setPreview(null)}>关闭</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (preview?.source) {
                  const src = preview.source
                  toast(
                    preview.items.length > 0
                      ? `连接成功：${preview.items.length} 条可映射`
                      : '连接成功但无数据',
                    preview.items.length > 0 ? 'success' : 'info',
                  )
                  void useSourceStore.getState().update(src.id, { lastError: undefined, updatedAt: new Date().toISOString() })
                }
                setPreview(null)
              }}
              disabled={!preview || preview.loading}
            >
              确认保存
            </Button>
          </>
        }
      >
        {preview?.loading ? (
          <p className="py-8 text-center text-sm text-ink-faint">连接与解析中…</p>
        ) : preview?.error ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-tile border border-cinnabar/40 bg-cinnabar/5 px-4 py-3">
              <span className="seal seal--done">{preview.error.kind.toUpperCase()}</span>
              <span className="text-sm text-ink">{preview.error.message}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              失败分类：CORS（浏览器跨域）/ auth（认证）/ timeout（超时）/ parse（解析）/ empty（空数据）/ http（状态码）。CORS 受限时建议改用 RSS / JSON 接口，或接入服务端代理。
            </p>
          </div>
        ) : preview ? (
          preview.items.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-faint">
                共拉取 <span className="text-ink">{preview.items.length}</span> 条 · 已按统一模型映射：
              </p>
              {preview.items.slice(0, 5).map((it) => (
                <div key={it.id} className="rounded-tile border border-line px-3 py-2">
                  <div className="text-sm font-medium text-ink">{it.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                    {it.url && <span className="truncate">链接 {it.url}</span>}
                    {it.publishedAt && <span className="tabular">{it.publishedAt.slice(0, 10)}</span>}
                    {it.category && <span>{it.category}</span>}
                  </div>
                </div>
              ))}
              {preview.items.length > 5 && (
                <p className="text-[11px] text-ink-faint">… 其余 {preview.items.length - 5} 条略</p>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-ink-faint">连接成功，但没有解析到条目（empty）</p>
          )
        ) : null}
      </Dialog>
    </Section>
  )
}

/** 去重键：source + externalId | url | title + publishedAt */
export function dedupeKey(it: { source?: string; sourceName?: string; externalId?: string; url?: string; title: string; publishedAt?: string }): string {
  const s = it.source ?? it.sourceName ?? ''
  if (it.externalId) return `${s}|${it.externalId}`
  if (it.url) return `${s}|${it.url}`
  return `${s}|${it.title}|${(it.publishedAt ?? '').slice(0, 10)}`
}
