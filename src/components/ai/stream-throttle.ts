/**
 * 天机 · 流式增量的节流装配（Step 5-1 · E5 从 `use-tianji-chat.ts` 拆出）
 *
 * ## 它解决什么
 * 模型是按 token 吐的，一段长回答会有几百次 `onToken`。每次都 `setState` 会让面板
 * 触发几百轮渲染 —— 于是这里把增量先收进装配器（`stream-assembly`），
 * 再以 `ms` 为间隔**刷一次**到界面上。
 *
 * ## 为什么是"每次运行新建一个实例"而不是 hook 里放一个
 * 每个实例自带一个**独立的装配器与定时器**：一次运行结束（或中止）时 `clear()` 掉，
 * 下一次运行从零开始累积。共用一个实例会让上一轮的尾巴漏进下一轮的首帧。
 *
 * ## 与 `stream-assembly` 的分工
 * · `stream-assembly`：**只做文本拼接**（剥围栏、认工具调用分隔），纯函数式、可单测；
 * · 本模块：**只管何时把拼好的文本推给 React**（节流 + 定时器生命周期）。
 * 分开之后"节流策略"与"文本语义"可以各自改而不互相牵连。
 */
import { createStreamAssembler } from '../../services/ai/stream-assembly'

/**
 * 默认刷新间隔（ms）——60ms 约合每秒 16 帧，肉眼看是"连续吐字"又不至于刷爆渲染。
 * 调用方（`use-tianji-chat`）显式传自己的常量，所以这个默认值只在没传时兜底 ——
 * 不导出，免得成为第二个"看起来是权威、其实没人读"的常量。
 */
const STREAM_FLUSH_MS = 60

/**
 * 刻意只有两个方法：**接口面越小越不容易腐坏**。
 * 全文由 Agent 的返回值给出（不是从装配器里取），所以"取全文 / 立刻刷新"这两个
 * 曾经设想过的方法在实际链路上没有消费者 —— 不留没人用的接口。
 */
export interface StreamThrottle {
  /** 收到一段增量（高频；内部按间隔合并） */
  push(delta: string): void
  /** 丢弃挂起的定时器（一次运行结束 / 中止时调；不再刷界面） */
  clear(): void
}

export function createStreamThrottle(
  commit: (text: string) => void,
  ms = STREAM_FLUSH_MS,
): StreamThrottle {
  const asm = createStreamAssembler()
  let timer: number | undefined

  const cancel = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
  }

  return {
    push: (delta) => {
      asm.push(delta)
      // 已有挂起的刷新就不再排第二个 —— 一个间隔内无论收多少段，只刷一次
      if (timer === undefined) {
        timer = window.setTimeout(() => {
          timer = undefined
          commit(asm.text())
        }, ms)
      }
    },
    clear: cancel,
  }
}
