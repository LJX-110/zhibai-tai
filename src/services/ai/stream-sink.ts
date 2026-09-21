/**
 * 流式 sink —— 能力层与 UI 之间的增量通道
 *
 * 解决的问题：`capabilities.ts` 里有 12 个高层能力全部汇入同一个 `remoteOr`。
 * 若给它们各加一个 `onDelta` 参数，接口膨胀一倍，而调用方（能力卡片 / 解卦 /
 * 情报问答）要的其实是同一件事。所以改成「作用域内声明当前 sink」：
 * 调用方用 `withStreamSink(sink, fn)` 包住一次会话，`remoteOr` 在发起请求时取走它。
 *
 * 与 `aiService.use()` 一样，这是「模块级可变状态 + 显式恢复」：
 *  · 并发风险由调用方的 busy 守卫挡住（天机同时只有一次会话在跑），
 *    **不要**在无守卫处并发发起两个带 sink 的调用——增量会串流；
 *  · `withStreamSink` 在 `finally` 里恢复原值，异常路径也不会把状态留在脏位。
 */
export interface StreamSink {
  /** 每收到一段增量调用一次（高频；调用方自行节流） */
  onDelta(delta: string): void
  /** 供用户中止（Provider 支持时透传） */
  signal?: AbortSignal
}

let current: StreamSink | null = null

/** `remoteOr` 发起请求时读取；业务代码不该直接用 */
export function currentStreamSink(): StreamSink | null {
  return current
}

/** 在 `fn` 执行期间把远程输出的增量转给 `sink`，结束后恢复原状 */
export async function withStreamSink<T>(sink: StreamSink | null, fn: () => Promise<T>): Promise<T> {
  const prev = current
  current = sink
  try {
    return await fn()
  } finally {
    current = prev
  }
}
