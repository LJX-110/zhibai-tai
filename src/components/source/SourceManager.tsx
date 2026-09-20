/**
 * SourceManager —— 情报源管理（系统）
 * 增删/启停/测试/立即抓取 + 推荐来源目录（本地 Provider Catalog）
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：单行、表单弹窗、测试预览、手机端操作弹层、
 * 定时抓取开关、自建代理各自成文件放在本目录下；本文件只留状态、抓取动作与组合。
 * `ProxyConfig` 仍从本文件导出 —— 「系统 · 智能」首屏按这个路径直接挂载它。
 */
import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useSourceStore } from '../../stores/useSourceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { categoryNames, useCategoryStore } from '../../stores/useCategoryStore'
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import { retrySource, testSource } from '../../services/intelligence/run'
import { initIntelAutoFetch } from '../../services/intelligence/auto'
import type { IntelligenceProviderId, IntelligenceSource } from '../../types/entities'
import { createId, nowISO } from '../../utils/id'
import { Button, EmptyState, Section, useToast } from '../ui'
import { AutoFetchBar } from './AutoFetchBar'
import { MobileActionDialog } from './MobileActionDialog'
import { SourceFormDialog } from './SourceFormDialog'
import { SourceRow } from './SourceRow'
import { TestPreviewDialog, type PreviewState } from './TestPreviewDialog'
import { EMPTY, type FormState } from './shared'

export { ProxyConfig } from './ProxyConfig'

export function SourceManager() {
  const sources = useSourceStore((s) => s.items)
  const intelAuto = useSettingsStore((s) => s.intelAutoFetch)
  const intelMinutes = useSettingsStore((s) => s.intelFetchMinutes)
  const intelCategoryRows = useCategoryStore((s) => s.items)
  const intelCategories = useMemo(() => categoryNames(intelCategoryRows, 'intel'), [intelCategoryRows])
  const compact = useResolvedLayout() === 'mobile'
  const toast = useToast().toast
  const [open, setOpen] = useState(false)
  const [actionFor, setActionFor] = useState<IntelligenceSource | null>(null)
  const [editing, setEditing] = useState<IntelligenceSource | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY })
  const [testing, setTesting] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)

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
    const now = nowISO()
    await useSourceStore.getState().save({
      id: editing?.id ?? createId(),
      name: form.name.trim(),
      provider: form.provider,
      url: form.url.trim() || undefined,
      category: form.category.trim() || '科技',
      enabled: editing?.enabled ?? true,
      config: form.config.trim() || undefined,
      // 本机抓取状态原样带过：编辑名称/分类不应把「上次成功时间」「连续失败次数」清空
      lastFetchedAt: editing?.lastFetchedAt,
      lastSuccessAt: editing?.lastSuccessAt,
      lastError: editing?.lastError,
      failCount: editing?.failCount,
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
      updatedAt: nowISO(),
    })
  }
  /** 测试：拉取 → 预览（成功显示条目，失败显示分类与可照做的下一步） */
  const test = async (s: IntelligenceSource) => {
    setTesting(s.id)
    setPreview({ source: s, items: [], loading: true })
    const res = await testSource(s)
    setPreview(res.ok ? { source: s, items: res.items, loading: false } : { source: s, items: [], error: res.failure, loading: false })
    setTesting(null)
  }
  /** 立即抓取并并入情报流（经 run.retrySource：忽略退避 + 落库 + 裁剪 + 记录状态） */
  const fetchNow = async (s: IntelligenceSource) => {
    setTesting(s.id)
    try {
      const res = await retrySource(s)
      if (res.failure) {
        toast(`抓取「${s.name}」失败：${res.failure.message}`, 'danger')
        return
      }
      if (res.added === 0) {
        // 没有新条目就不要谎报"新增 N 条"
        toast(`抓取 ${s.name}：无新条目`, 'info')
      } else {
        toast(
          `抓取 ${s.name}：新增 ${res.added} 条` + (res.removed > 0 ? `（已保留上限，清理 ${res.removed} 条）` : ''),
          'success',
        )
      }
    } catch (e) {
      toast(`抓取失败：${e instanceof Error ? e.message : '网络不可达'}`, 'danger')
    } finally {
      // 源状态（上次成功 / 连续失败次数）由 run 统一写库并刷新内存，这里无需再 load
      setTesting(null)
    }
  }

  /** 测试确认：清掉该源的失败态（下次抓取重新计） */
  const confirmPreview = () => {
    if (preview?.source) {
      const src = preview.source
      toast(
        preview.items.length > 0
          ? `连接成功：${preview.items.length} 条可映射`
          : '连接成功但无数据',
        preview.items.length > 0 ? 'success' : 'info',
      )
      void useSourceStore.getState().update(src.id, { lastError: undefined, failCount: 0, updatedAt: nowISO() })
    }
    setPreview(null)
  }

  return (
    <Section
      // 不写 title：这一块嵌在「系统 · 智能」的折叠层里，折叠头已经写着「情报源」，
      // 内层再写一遍就是同屏两行一样的字（用户截图反馈过）
      hint={`${sources.length} 个 · 启停/测试/抓取`}
      action={
        <Button size="sm" variant="primary" onClick={() => openNew()}>
          <Plus size={13} /> 新增源
        </Button>
      }
    >
      {/* 定时自动抓取 */}
      <AutoFetchBar
        auto={intelAuto}
        minutes={intelMinutes}
        onToggle={() => {
          useSettingsStore.getState().set({ intelAutoFetch: !intelAuto })
          initIntelAutoFetch()
        }}
        onMinutes={(n) => {
          useSettingsStore.getState().set({ intelFetchMinutes: n })
          initIntelAutoFetch()
        }}
      />

      {sources.length > 0 ? (
        <div>
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              s={s}
              compact={compact}
              testing={testing === s.id}
              onFetch={() => void fetchNow(s)}
              onTest={() => void test(s)}
              onToggle={() => void toggleEnabled(s)}
              onEdit={() => openEdit(s)}
              onRemove={() => void remove(s)}
              onMore={() => setActionFor(s)}
            />
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

      {/* 手机端单源操作：整行按钮摊不开，改为弹层集中承载 */}
      <MobileActionDialog
        source={actionFor}
        onClose={() => setActionFor(null)}
        onTest={(s) => void test(s)}
        onToggle={(s) => void toggleEnabled(s)}
        onEdit={openEdit}
        onRemove={(s) => void remove(s)}
      />

      <SourceFormDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing != null}
        form={form}
        onForm={setForm}
        categories={intelCategories}
        onSave={() => void save()}
      />

      {/* 测试预览：连接 → 预览 → 字段映射确认 → 保存 */}
      <TestPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onRetest={(s) => void test(s)}
        onConfirm={confirmPreview}
      />
    </Section>
  )
}
