/**
 * 设置 · 数据（备份导出 / 导入恢复 / 诊断 / 危险操作）
 *
 * 从 SettingsPage 拆出。原文件 1259 行、四个分组全堆在一个组件里，
 * 这里按「**状态跟着分组走**」的原则独立成组件 —— 它需要的数据与操作
 * 在本文件内自洽，父组件只负责渲染，不再做 prop 传递。
 */
import { useMemo, useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { BUSINESS_TABLES } from '../../db/tables'
import { clearAllData, exportAllData, getDataStats, importAllData } from '../../services/data-admin'
import { reloadAllStores } from '../../stores/reload'
import { seedAllCategories } from '../../stores/useCategoryStore'
import {
  clearAllIntelligence,
  clearReadIntelligence,
  KEEP_LIMIT_OPTIONS,
} from '../../services/intelligence/retention'
import { APP_VERSION } from '../../app/version'
import { ErrorLogPanel } from './ErrorLogPanel'
import { useTaskStore } from '../../stores/useTaskStore'
import { cleanupDuplicateFixedTasks, previewDuplicateFixedTasks } from '../../services/task-repair'
import { toISODate } from '../../utils/id'
import { Button, Collapse, Dialog, Section, Select, useToast } from '../../components/ui'

export function DataGroup() {
  const settings = useSettingsStore()
  const toast = useToast().toast
  const intelTotal = useIntelligenceStore((s) => s.items.length)
  const tasks = useTaskStore((s) => s.items)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearIntelOpen, setClearIntelOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  // 重复副本的预览：纯函数算出"如果清理会删掉什么"，不写库
  const dup = useMemo(() => previewDuplicateFixedTasks(tasks), [tasks])

  const exportData = async () => {
    // 表遍历与墓碑都在 services/data-admin（那里是 BUSINESS_TABLES 单一事实源的消费方）
    const dump = await exportAllData()
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `yishu-backup-${toISODate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast(`已导出备份 JSON（全部 ${BUSINESS_TABLES.length} 张业务表）`, 'success')
  }

  const clearAll = async () => {
    try {
      // 清表 + 逐表写墓碑（见 services/data-admin：不写墓碑的话，
      // 一次同步就会把数据从远端原样加回来）
      await clearAllData()
      // 分类是业务数据，清空后立刻播回默认清单，否则情报/藏阁页签会全空
      await reloadAllStores()
      await seedAllCategories()
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
      // 覆盖写入 + 墓碑恢复都在 services/data-admin（顺序与备份格式与从前一致）
      const tables = await importAllData(pendingImport.dump)
      await reloadAllStores()
      setPendingImport(null)
      toast(`已恢复 ${tables} 张表；恢复前的数据已自动导出为安全备份`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败，文件可能已损坏', 'danger')
    }
  }

  /** 一键诊断：版本 / 浏览器 / 同步状态 / 各表数据量，复制给协作者排查问题 */
  const copyDiagnostics = async () => {
    const counts = await getDataStats()
    const detail = Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(' / ')
    const text = [
      `知白台 v${APP_VERSION}`,
      `浏览器：${navigator.userAgent}`,
      `时间：${new Date().toLocaleString('zh-CN')}`,
      `同步：${settings.syncStatus}${settings.lastSyncedAt ? ` · 上次 ${settings.lastSyncedAt}` : ' · 从未'}`,
      settings.syncError ? `同步错误：${settings.syncError}` : '',
      `数据：${detail}`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('诊断信息已复制，可直接粘贴', 'success')
    } catch {
      toast('复制失败，请手动截图系统页', 'danger')
    }
  }

  return (
    <>
      <Section
        title="数据"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={exportData}>
              <Download size={13} /> 导出备份
            </Button>
            <Button size="sm" variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Upload size={13} /> 导入恢复
            </Button>
          </div>
        }
      >
        {/* 备份 / 恢复 / 情报 / 修复 / 诊断 合成一段（Step 5-3D · 用户拍板"该合并的合并"）：
            它们都是"我的数据"的不同面，拆成三个 Section 只会把首屏拉长。
            顺序：备份是最高频的事 → 情报（上限 + 清理）→ 修复 → 诊断（排查用） */}
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
              <div key={s.key} className="flex items-center justify-between px-1 py-0.5 text-sm">
                <span className="text-ink">{s.label}</span>
                <span className="tabular text-ink-muted">
                  {s.count >= 0 ? `${s.count} 条` : '备份中无此表'}
                </span>
              </div>
            ))}
          </div>
        </Dialog>

        {/* 情报数据（原来单开一段） */}
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">保留上限</span>
          <Select
            value={String(settings.intelKeepLimit)}
            onChange={(e) => settings.set({ intelKeepLimit: Number(e.target.value) })}
            className="!w-auto !py-1.5 text-sm"
            aria-label="情报保留上限"
          >
            {KEEP_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n === 0 ? '不限制' : `${n} 条`}
              </option>
            ))}
          </Select>
          <span className="flex-1 text-xs text-ink-faint">
            超出后按「已读且最旧优先」清理
          </span>
        </div>
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">清理</span>
          <Button
            size="sm"
            variant="tertiary"
            disabled={intelTotal === 0}
            onClick={async () => {
              const { removed } = await clearReadIntelligence()
              await useIntelligenceStore.getState().load()
              toast(removed > 0 ? `已清理 ${removed} 条已读情报` : '没有已读情报可清理', removed > 0 ? 'success' : 'info')
            }}
          >
            <Trash2 size={13} /> 清理已读
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            disabled={intelTotal === 0}
            onClick={() => setClearIntelOpen(true)}
          >
            <Trash2 size={13} /> 清空情报
          </Button>
          <span className="text-xs text-ink-faint">当前 {intelTotal} 条</span>
        </div>

        {/* 数据修复（原来单开一段）：不是破坏性操作（只删重复的历史副本），
            但会让「已完成」少几条旧记录，所以仍走一层确认 */}
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">重复任务</span>
          <Button
            size="sm"
            variant="tertiary"
            disabled={dup.removable === 0}
            onClick={() => setDupOpen(true)}
          >
            <Trash2 size={13} /> 清理历史重复
          </Button>
          <span className="flex-1 text-xs text-ink-faint">
            {dup.removable > 0
              ? `${dup.groups} 个固定任务残留 ${dup.removable} 条旧副本`
              : '没有需要清理的重复'}
          </span>
        </div>
        <Dialog
          open={dupOpen}
          onClose={() => setDupOpen(false)}
          title="清理历史重复"
          footer={
            <>
              <Button variant="tertiary" onClick={() => setDupOpen(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const { removed, groups } = await cleanupDuplicateFixedTasks()
                  await useTaskStore.getState().load()
                  setDupOpen(false)
                  toast(
                    removed > 0 ? `已清理 ${groups} 个任务下的 ${removed} 条旧副本` : '没有需要清理的重复',
                    removed > 0 ? 'success' : 'info',
                  )
                }}
              >
                确认清理
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-ink-muted">
            将删除 <strong className="text-cinnabar">{dup.removable}</strong> 条历史副本
            （涉及 {dup.groups} 个固定任务）。每个任务保留最新的一条。
          </p>
          {/* 把代价说清楚：旧副本也是真实的完成历史，删了「已完成」里对应条目会一起消失 */}
          <p className="mb-3 text-xs text-ink-faint">
            这些副本也是当时的完成记录，清理后「已完成」列表里对应条目会一并消失。
            每一期的「已完成」本身不会被删掉，删的只是同一件事多出来的副本。
          </p>
          {dup.titles.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-tile border border-line p-2">
              {dup.titles.map((t) => (
                <div key={t} className="truncate px-1 py-0.5 text-sm text-ink-soft">{t}</div>
              ))}
            </div>
          )}
        </Dialog>

        {/* 诊断（原来在「数据」段里，保持位置：排查用，最低频） */}
        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">诊断</span>
          <Button size="sm" variant="tertiary" onClick={() => void copyDiagnostics()}>
            复制诊断信息
          </Button>
          <span className="flex-1 text-xs text-ink-faint">
            版本 / 浏览器 / 同步状态 / 数据量
          </span>
        </div>
      </Section>

      {/* 危险操作 + 故障记录**合成一个条目且不嵌套**（Step 5-3E 用户拍板：
          "不要一环套一环"）—— 折叠里平铺"清空数据"行与故障列表，两层折叠被拆平 */}
      <Collapse title="清空与故障" hint="不可恢复">
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">清空</span>
          <Button size="sm" variant="danger" onClick={() => setClearOpen(true)}>
            <Trash2 size={13} /> 清空数据
          </Button>
          <span className="flex-1 text-xs text-ink-faint">
            删除本机全部记录，不可恢复
          </span>
        </div>
        {/* 故障流水（本机）：渲染异常 / 事件回调 / 未处理的异步错误 */}
        <ErrorLogPanel />
      </Collapse>

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
      <Dialog open={clearIntelOpen} onClose={() => setClearIntelOpen(false)} title="清空全部情报？">
        <p className="text-sm leading-relaxed text-ink-soft">
          将删除本机全部 {intelTotal} 条情报，不可恢复。删除会随同步传播到其他设备；
          情报源与分类不受影响，之后拉取会重新积累。建议先「导出备份」。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setClearIntelOpen(false)}>取消</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const { removed } = await clearAllIntelligence()
              await useIntelligenceStore.getState().load()
              setClearIntelOpen(false)
              toast(`已清空 ${removed} 条情报`, 'success')
            }}
          >
            <Trash2 size={14} /> 确认清空
          </Button>
        </div>
      </Dialog>
    </>
  )
}
