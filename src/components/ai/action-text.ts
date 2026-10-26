/**
 * 天机 · 气泡正文的呈现逻辑（纯函数，无 React）
 *
 * 动作块与工具块的剥离统一收在 `services/agent/protocol-text.ts`：
 * 气泡、复制、落库前的历史三处共用同一份清洗结果，避免"预览干净、历史脏"。
 */
import { stripProtocolBlocks } from '../../services/agent/protocol-text'
import type { TianjiActionPayload } from './action-protocol'
import { actionDefFor } from './plugins'

/** 把气泡里「协议块」剥掉：动作交给下方预览卡片，工具交给 Agent Loop，气泡只留自然语言。 */
export function stripActionFences(text: string): string {
  return stripProtocolBlocks(text)
}

/**
 * 一条动作的简短摘要（用于「已加入…」这句回执）。
 * 由插件给出 —— 只有它知道"这件事叫什么"该读哪个字段。
 */
export function actionTitle(a: TianjiActionPayload): string {
  const def = actionDefFor(a.action)
  if (!def) return a.action
  return def.summary(a.fields)
}
