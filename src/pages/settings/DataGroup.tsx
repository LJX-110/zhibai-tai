/**
 * 设置 · 数据（备份导出 / 导入恢复 / 诊断 / 危险操作）
 *
 * 从 SettingsPage 拆出。原文件 1259 行、四个分组全堆在一个组件里，
 * 这里按「**状态跟着分组走**」的原则独立成组件 —— 它需要的数据与操作
 * 在本文件内自洽，父组件只负责渲染，不再做 prop 传递。
 */
import { useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { db } from '../../db/db'
import { BUSINESS_TABLES, TOMBSTONES } from '../../db/tables'
import { markTombstones } from '../../repositories/repo'
import { reloadAllStores } from '../../stores/reload'
import { seedAllCategories } from '../../stores/useCategoryStore'
import {
  clearAllIntelligence,
  clearReadIntelligence,
  KEEP_LIMIT_OPTIONS,
} from '../../services/intelligence/retention'
import { APP_VERSION } from '../../app/version'
import { toISODate, nowISO } from '../../utils/id'
import { Button, Collapse, Dialog, Section, Select, useToast } from '../../components/ui'

export function DataGroup() {
  const settings = useSettingsStore()
  const toast = useToast().toast
  const intelTotal = useIntelligenceStore((s) => s.items.length)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearIntelOpen, setClearIntelOpen] = useState(false)

  const exportData = async () => {
    // 以 BUSINESS_TABLES 单一事实源为准，导出全部业务表并附带墓碑
    const dump: Record<string, unknown> = {}
    for (const t of BUSINESS_TABLES) {
      dump[t.key] = await db.table(t.key).toArray()
    }
    dump.tombstones = await db.table(TOMBSTONES).toArray()
    dump._meta = {
      app: 'yishu-workbench',
      version: APP_VERSION,
      tables: BUSINESS_TABLES.length,
      exportedAt: nowISO(),
    }
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
      for (const t of BUSINESS_TABLES) {
        // 先取主键再清表，并为每行写墓碑：
        // 否则本机清空后一次同步，远端快照会把数据原样加回来（清空被"撤销"）。
        const ids = (await db.table(t.key).toCollection().primaryKeys()) as string[]
        await db.table(t.key).clear()
        await markTombstones(t.key, ids)
      }
      // 冲突记录一并清空；墓碑保留 —— 它承载"清空"这一事实的跨设备传播
      await db.table('conflicts').clear()
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

  /** 一键诊断：版本 / 浏览器 / 同步状态 / 各表数据量，复制给协作者排查问题 */
  const copyDiagnostics = async () => {
    const counts: Record<string, number> = {}
    for (const t of BUSINESS_TABLES) {
      counts[t.label] = await db.table(t.key).count()
    }
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
      <Section title="情报数据">
        {/* 没有上限 + 没有删除入口 = 同步快照必然越滚越大，最后表现为同步莫名失败 */}
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
      </Section>

      {/* hint 原先写「Local-first · 存于本机 IndexedDB」：与下方正文首句逐字重复，
          而正文还多给了「多端同步走 GitHub 快照」的指路，留正文、去标题行 */}
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
        <p className="mt-2 text-xs text-ink-faint">
          数据存本机；多端同步走 GitHub 快照。
        </p>
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

      {/* 破坏性操作移出首屏：既让首屏变干净，也把「不可恢复」这件事藏在一层确认之后 */}
      <Collapse title="危险操作" hint="不可恢复">
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">清空</span>
          <Button size="sm" variant="danger" onClick={() => setClearOpen(true)}>
            <Trash2 size={13} /> 清空数据
          </Button>
          <span className="flex-1 text-xs text-ink-faint">
            删除本机全部记录，不可恢复
          </span>
        </div>
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
