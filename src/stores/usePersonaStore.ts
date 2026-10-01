/**
 * 天机 · 人设 store
 *
 * ## 默认人设怎么进库
 * 启动时 `ensureDefaultPersona`（Bootstrap 调用）检查库里有默认 id 的行：
 * 没有就播种 `defaultWhaleGirlPersona`；有就**不覆盖**（用户可能改过 / 重置过）。
 *
 * ## 为什么整份用业务表
 * 人设是用户资产（见 `types/entities.ts` 的 Persona 注释）：随快照跨设备同步。
 * 瞬时 UI 状态（正在编辑哪个、草稿）留在组件里，不进 store 更不进表。
 */
import { personaRepo } from '../repositories/persona-repo'
import { notifyDataChanged } from '../sync/auto'
import { PERSONA_ID_DEEPSEEK_WHALE_GIRL, defaultWhaleGirlPersona } from '../services/persona/defaults'
import type { Persona } from '../types/entities'
import { createId, nowISO } from '../utils/id'
import { createCrudStore } from './factory'

/** 人设（多行表）：add / save / update / remove / saveMany 全套来自工厂 */
export const usePersonaStore = createCrudStore<Persona>(personaRepo)

/**
 * 确保默认人设存在（幂等：已有就跳过）。
 * 返回 true = 本次播种了（Bootstrap 展示用）；false = 本来就有或失败。
 */
export async function ensureDefaultPersona(): Promise<boolean> {
  const existing = await personaRepo.get(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
  if (existing) return false
  const now = nowISO()
  const ok = await usePersonaStore.getState().add(defaultWhaleGirlPersona(now))
  if (ok) void notifyDataChanged()
  return ok
}

/** 重置默认人设：把内置行的内容恢复到出厂值（保留创建时间与 id） */
export async function resetDefaultPersona(): Promise<boolean> {
  const row = await personaRepo.get(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
  if (!row) return ensureDefaultPersona()
  const now = nowISO()
  return usePersonaStore
    .getState()
    .save({ ...defaultWhaleGirlPersona(now, row.createdAt), id: row.id })
}

/** 新建一份空白人设（用户从表单创建时用） */
export function emptyPersona(name = '新的人设'): Persona {
  const now = nowISO()
  return {
    id: createId(),
    name,
    selfClaim: '',
    userName: '',
    relationship: '',
    personality: '',
    speech: '',
    behavior: '',
    emotion: '',
    appearance: '',
    ability: '',
    hobby: '',
    habit: '',
    likes: '',
    ooc: '',
    forbidden: '',
    unknown: '',
    agentStyle: '',
    taskAttitude: '',
    toolBehavior: '',
    memoryBehavior: '',
    proactivity: '',
    createdAt: now,
    updatedAt: now,
  }
}