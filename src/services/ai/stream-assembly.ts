/**
 * 流式装配器 —— 增量与最终结果的唯一来源
 *
 * 借鉴 DeepSeek Harness（packages/llm/llm/src/assembler.ts）的设计：
 * 它自我描述为 "the single canonical assembly algorithm used by the agent loop
 * to build an assistant message from a chunk stream"。
 *
 * 这个模块解决的是流式改造里**最难也最容易被做错**的一件事：
 *
 *   流式模式下，用户在屏幕上看到的是一段段增量拼出来的预览；
 *   收齐后落库的是另一次调用拿到的一段完整文本。
 *   若这两条路径各自为政，内容就可能不一致（丢片段、顺序错、重复），而且
 *   差异只在长回答下偶发，极难排查。
 *
 * 解法是让**预览与最终结果共用同一个累加器**：UI 看到的 `text()` 与调用方落库的
 * `finish()` 是同一个字符串。一致性由此是**构造出来**的，不靠事后比对。
 *
 * DSH 还有 `block-end`（携带完整权威块的帧）与 `usage / finish.reason`。
 * 这里暂时只有纯文本增量 —— 天机的回答是纯文本 + 末尾动作 JSON 块，
 * 动作解析本来就明确禁止在流式中途进行（见 tianji-ask / action-protocol），
 * 所以「收齐再解析」之下一个字符串累加器就是正确形状；等需要 reasoning / 多块时再扩。
 */

export interface StreamAssembler {
  /** 累加一段增量。空串直接忽略（SSE 心跳/空 delta 不应污染「是否收到过内容」的判定）。 */
  push(delta: string): void
  /** 当前已累计的完整文本（与最终结果同源） */
  text(): string
  /** 结束并返回最终文本 —— 与 `text()` 相同，语义上标记「这是要落库的那份」 */
  finish(): string
  /** 是否收到过任何非空增量（区分「远程一个字都没吐」与「正常为空回答」） */
  readonly received: boolean
}

export function createStreamAssembler(): StreamAssembler {
  let acc = ''
  let received = false
  return {
    push(delta) {
      if (!delta) return
      acc += delta
      received = true
    },
    text: () => acc,
    finish: () => acc,
    get received() {
      return received
    },
  }
}
