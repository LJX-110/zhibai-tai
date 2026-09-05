/**
 * 情报自动抓取调度 —— 按设置间隔定时拉取全部启用源并去重合并
 * 默认关闭；设置页可开关与调间隔
 */
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useSourceStore } from '../../stores/useSourceStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { fetchAllFromSources } from './providers/registry'
import { dedupeKey } from '../../components/source/SourceManager'
import { playSound } from '../sound'

let timer: number | null = null

async function runFetch(): Promise<number> {
  const sources = useSourceStore.getState().items.filter((s) => s.enabled)
  if (sources.length === 0) return 0
  const fresh = await fetchAllFromSources(sources)
  const known = new Set(useIntelligenceStore.getState().items.map((x) => dedupeKey(x)))
  const added = fresh.filter((x) => !known.has(dedupeKey(x)))
  if (added.length > 0) {
    useIntelligenceStore.setState({ items: [...added, ...useIntelligenceStore.getState().items] })
  }
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
      if (n > 0) {
        playSound('sync')
        // 轻提示新情报
        useIntelligenceStore.setState((prev) => ({ ...prev }))
      }
    })
  }, minutes * 60 * 1000)
}

/** 立即抓取一次（手动） */
export async function fetchNow(): Promise<number> {
  return runFetch()
}
