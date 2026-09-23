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
import type { ComponentType, ReactNode, SVGProps } from 'react'
import type { SectionId } from '../../../app/navigation'
import type { ActionFields, FieldSpec, TianjiActionSpec } from '../action-protocol'
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

/**
 * 一个可被 AI 提议的动作 —— **规格、落库、预览三件一起申报**。
 *
 * 为什么要合成一个定义（P2 开放化）：
 *  · 只在协议里加 `action` 名是不够的 —— 那样**卡片渲染**仍得改中心文件，
 *    加动作依然要找两处。把预览也交给归属插件，"加一种动作只改自己的插件"才成立。
 *  · `fields` 里读值走 `textOf / numberOf / listOf`，类型断言**收敛在插件内部**，
 *    协议侧完全不认识任何具体字段。
 */
export interface TianjiActionDef {
  /** 动作中文名（卡片与提示用） */
  label: string
  /** 字段规格：协议据此**通用**校验与规整（插件不必写解析代码） */
  fields: Record<string, FieldSpec>
  /** 「已加入…」这句回执里的简短摘要（如待办用标题、收支用「¥12.3 · 餐饮」） */
  summary: (fields: ActionFields) => string
  /** 落库（字段已通过校验）。一律走 store 工厂，绝不直接碰 Dexie */
  run: (fields: ActionFields) => Promise<boolean>
  /** 预览（卡片主体）—— 让用户在点确认前看清要写什么 */
  preview: (fields: ActionFields) => ReactNode
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
  /** 本板块可被 AI 提议的动作（键即模型要写的 action 名） */
  actions?: Record<string, TianjiActionDef>
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

/**
 * 动作名 → 规格表（供协议解析用）。
 * **只含已申报的动作** —— 未申报的名字会被协议静默跳过，正是"开放"的含义：
 * 加动作只改自己的插件，协议与卡片文件都不用动。
 */
export function actionSpecs(): Record<string, TianjiActionSpec> {
  const out: Record<string, TianjiActionSpec> = {}
  for (const p of TIANJI_PLUGINS) {
    for (const [name, def] of Object.entries(p.actions ?? {})) {
      out[name] = { fields: def.fields }
    }
  }
  return out
}

/** 动作名 → 完整定义（落库与预览都用它）。找不到即该动作未申报 → 调用方跳过 */
export function actionDefFor(name: string): TianjiActionDef | undefined {
  for (const p of TIANJI_PLUGINS) {
    const def = p.actions?.[name]
    if (def) return def
  }
  return undefined
}
