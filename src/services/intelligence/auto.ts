/**
 * 情报自动抓取调度 —— 按设置间隔定时拉取全部启用源并去重合并
 * 默认关闭；设置页可开关与调间隔
 */
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useSourceStore } from '../../stores/useSourceStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { fetchAllFromSources } from './providers/registry'
import { saveFetchedItems } from './retention'
import { dedupeKey } from '../../components/source/SourceManager'
import { playSound } from '../sound'

let timer: number | null = null

async function runFetch(): Promise<number> {
  const sources = useSourceStore.getState().items.filter((s) => s.enabled)
  if (sources.length === 0) return 0
  const res = await fetchAllFromSources(sources)
  // 定时抓取不弹失败提示（会每小时烦一次）；逐源的失败原因由
  // registry 写进 source.lastError，「系统 · 情报源」卡片上能直接看到
  if (res.failures.length > 0) {
    console.warn('[知白台] 定时抓取部分源失败', res.failures)
  }
  const known = new Set(useIntelligenceStore.getState().items.map((x) => dedupeKey(x)))
  const added = res.items.filter((x) => !known.has(dedupeKey(x)))
  // 经 saveFetchedItems 落库并顺带按上限裁剪：定时抓取是数据增长最快的入口，
  // 这里漏掉裁剪，快照就会在用户毫无察觉的情况下持续膨胀
  if (added.length > 0) await saveFetchedItems(added)
  return added.length
}

/** 按设置启动/停止定时抓取 */
export function initIntelAutoFetch(): void {
  const s = useSettingsStore.getState()
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
  if (!s.intelAutoFetch) return
  const minutes = Math.max(10, s.intelFetchMinutes)
  timer = window.setInterval(() => {
    void runFetch().then((n) => {
      if (n > 0) playSound('sync')
    })
  }, minutes * 60 * 1000)
}

/** 立即抓取一次（手动） */
export async function fetchNow(): Promise<number> {
  return runFetch()
}
