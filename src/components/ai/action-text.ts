/**
 * 天机 · 动作**文本层**工具 —— 围绕模型回答里那段动作 JSON 的两件事
 *
 * 为什么单独成文件（2026-09-23）：这两个函数此前和预览卡片同住 `action-cards.tsx`，
 * 于是那个文件既导出组件又导出普通函数 —— Fast Refresh 因此失去完整性
 * （改一次卡片布局，整个对话面板的状态被重置）。分成两个文件后各司其职：
 *  · 本文件：**纯文本层面**的处理（剥围栏、生成摘要），不渲染任何东西；
 *  · `action-cards.tsx`：只导出组件。
 *
 * ⚠️ 与 `action-protocol.ts` 的边界：那边是**不认识具体动作**的通用解析引擎，
 * 而 `actionTitle` 要问"这件事叫什么"，必须查插件注册表 —— 所以它属于这一侧，
 * **不要**为了"看起来更内聚"把它塞回协议文件（那会让协议依赖插件注册表）。
 */
import type { TianjiActionPayload } from './action-protocol'
import { actionDefFor } from './plugins'

/** 把气泡里「动作块」剥掉：动作已由下方预览卡片呈现，气泡里不该再露原始 JSON。 */
export function stripActionFences(text: string): string {
  return text
    .replace(/```(?:[a-zA-Z0-9_-]*)?\s*\n?([\s\S]*?)```/gi, (whole, body: string) => {
      const t = body.trim()
      try {
        const v = JSON.parse(t)
        const arr = Array.isArray(v) ? v : [v]
        if (arr.some((x) => x && typeof x === 'object' && typeof (x as Record<string, unknown>).action === 'string')) {
          return '' // 是动作块 → 交给预览卡片，气泡里不显示
        }
      } catch {
        /* 非动作块（如代码样例）原样保留 */
      }
      return whole
    })
    .trim()
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
