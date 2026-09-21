/**
 * 天机插件注册表 —— 宿主只认识接口，不认识任何具体板块
 *
 * 借鉴 DeepSeek Harness 的「能力接缝」思路（Service Definition + Provider + Consumer）：
 * 这里 `TianjiPlugin` 是接口，各板块文件是实现，天机面板/提问链路是消费者。
 * 结果是**加一个板块的能力不必再改中心文件** —— 现在的 `context.ts` 里不再出现
 * "课程/作业/财务/收藏"这类具体板块字样。
 *
 * 三条约束（都是踩过的坑，别破）：
 *  1. **插件之间不得互相 import**。只准依赖宿主提供的类型与工具 ——
 *     桌宠桥接插件的"零依赖红线"就是为此：一处坏引用会拖垮整个宿主。
 *  2. **注册顺序 = 明细区的注入顺序**。顺序变 = 上下文变 = 回答可能变，
 *     所以这个数组不是"随便排排"，改动前先想清楚为什么要动它。
 *  3. **插件不直接写库**。动作一律走 store 工厂（墓碑/LWW/加密快照/即时刷新都在工厂里），
 *     与改造前 `action-runner` 的规则完全一致。
 *
 * 当前只注册**有内容可贡献**的板块；奇与术暂为保留位 —— 等它们有了明细区或一键能力
 * 再加进来，不做空壳文件（项目惯例：不留死代码）。
 */
import type { ComponentType, SVGProps } from 'react'
import type { SectionId } from '../../../app/navigation'
import type { TianjiActionPayload } from '../action-protocol'
import type { useTodayStats } from '../../../hooks/useTodayStats'
import { overviewPlugin } from './overview'
import { actionPlugin } from './action'
import { studyPlugin } from './study'
import { financePlugin } from './finance'
import { collectionPlugin } from './collection'
import { cultivatePlugin } from './cultivate'
import { intelligencePlugin } from './intelligence'

export type TodayStats = ReturnType<typeof useTodayStats>

/** 能力图标：lucide 组件，接受 size / className 等 SVG 属性 */
export type CapabilityIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

/** 一键能力：返回 (标题, 正文)，失败时抛错由调用方降级 */
export interface TianjiCapability {
  key: string
  label: string
  icon: CapabilityIcon
  run(ctx: { stats: TodayStats }): Promise<{ title: string; body: string }>
}

/** 动作处理器：按 action 类型精确匹配入参（用 Extract 让 payload 类型跟着收窄） */
export type TianjiActionHandlers = {
  [K in TianjiActionPayload['action']]?: (
    a: Extract<TianjiActionPayload, { action: K }>,
  ) => Promise<boolean>
}

export interface TianjiPlugin {
  id: SectionId
  /**
   * 明细区行：按问题关键词决定补哪些明细。返回空数组表示"这次不用注入"。
   * 明细是**按问题**补的（prompt 长度与成本），基础概览不在这。
   */
  detail?(question: string): string[]
  /** 本板块的一键能力（横滚行的卡片） */
  capability?: TianjiCapability
  /** 本板块可被 AI 提议的动作 */
  actions?: TianjiActionHandlers
}

/** 注册顺序即明细区注入顺序（见文件头约束 2） */
export const TIANJI_PLUGINS: TianjiPlugin[] = [
  overviewPlugin,
  actionPlugin,
  studyPlugin,
  financePlugin,
  collectionPlugin,
  cultivatePlugin,
  intelligencePlugin,
]

/** 聚合明细区：宿主只做拼接，判定全在插件里 */
export function buildDetailContext(question: string): string[] {
  const out: string[] = []
  for (const p of TIANJI_PLUGINS) {
    const lines = p.detail?.(question)
    if (lines && lines.length > 0) out.push(...lines)
  }
  return out
}

/** 能力卡片列表（顺序即呈现顺序） */
export function capabilitiesOf(): TianjiCapability[] {
  return TIANJI_PLUGINS.map((p) => p.capability).filter((c): c is TianjiCapability => Boolean(c))
}

export function capabilityOf(key: string): TianjiCapability | undefined {
  return capabilitiesOf().find((c) => c.key === key)
}

/** 按动作类型找归属插件的执行器 */
export function actionHandlerFor(
  action: TianjiActionPayload['action'],
): ((a: TianjiActionPayload) => Promise<boolean>) | undefined {
  for (const p of TIANJI_PLUGINS) {
    const handler = p.actions?.[action] as
      | ((a: TianjiActionPayload) => Promise<boolean>)
      | undefined
    if (handler) return handler
  }
  return undefined
}
