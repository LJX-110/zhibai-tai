/**
 * 情报自动抓取调度 —— 按设置间隔定时刷新全部启用源并去重合并
 * 默认开启（useSettingsStore 的 intelAutoFetch 默认 true，刻意如此）；设置页可开关与调间隔
 *
 * 实际抓取逻辑全在 ./run（并发、退避、状态、落库），这里只负责「什么时候跑」。
 */
import { useSettingsStore } from '../../stores/useSettingsStore'
import { refreshAll } from './run'
import { playSound } from '../sound'

let timer: number | null = null

async function runFetch(): Promise<number> {
  const res = await refreshAll()
  // 定时抓取不弹失败提示（会每小时烦一次）；逐源的失败原因由 run 写进
  // source.lastError，源卡片上能直接看到，退避跳过的源也会在卡片上标明
  if (res.failures.length > 0) {
    console.warn('[知白台] 定时抓取部分源失败', res.failures.map((f) => `${f.sourceName}: ${f.message}`))
  }
  return res.added
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
    void runFetch()
      .then((n) => {
        if (n > 0) playSound('sync')
      })
      // 必须接住：定时器里的 rejection 没有调用方，会变成 unhandled rejection
      // 并在部分浏览器里弹到全局错误处理上。抓取失败本身已经在源卡片上可见，
      // 这里只需留一条控制台记录
      .catch((e: unknown) => {
        console.warn('[知白台] 定时抓取异常', e)
      })
  }, minutes * 60 * 1000)
}
