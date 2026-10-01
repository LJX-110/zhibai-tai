/**
 * 桌宠 · 语气参数（**来自当前人设**，纯函数；Step 4-2 · B6/D3）
 *
 * ## 为什么要有这一层
 * 规格 D3：**状态决定"发生了什么"，人格决定"她怎么表现"**。
 * 桌宠的台词模板里到处要用"自称 / 称呼 / 主食 / 尾巴"这几个词 ——
 * 它们必须跟着**用户选中的那个人设**走，而不是在模板里写死。
 *
 * ## 解析而不是新增字段
 * 人设是自然语言（用户随时改），所以这里用**宽容的解析 + 内置兜底**：
 *  · `SELF_CLAIM_人家 / 本鲸（强调时）` → 取最后一个候选 `本鲸`；
 *  · `CALL_USER_主人` → 去掉 `TAG_` 前缀取 `主人`；
 *  · `FOOD_白饭（主食，标志性道具）` → 取 `白饭`。
 * 解析不出来（用户写的是别的话）就回退到内置默认 —— **绝不因为改人设让桌宠失语**。
 */
import type { Persona } from '../../types/entities'
import { PERSONA as BUILTIN } from './persona'

export interface PetVoice {
  /** 自称（"本鲸"） */
  self: string
  /** 对用户的称呼（"主人"） */
  master: string
  /** 唯一会主动提的食物（"白饭"） */
  food: string
  /** 身体特征（涉及尾巴的表达） */
  tail: string
}

/** 内置兜底（与 `persona.ts` 的 PERSONA 同源，不另写一份字面量） */
export const DEFAULT_VOICE: PetVoice = {
  self: BUILTIN.self,
  master: BUILTIN.master,
  food: BUILTIN.food,
  tail: BUILTIN.tail,
}

/** 去掉 `TAG_` 前缀（人设里的字段值常带 `SELF_CLAIM_` / `CALL_USER_` 这类标签） */
function stripTag(s: string): string {
  return s.replace(/^[A-Z][A-Z0-9_]*_/, '').trim()
}

/** 取第一个非空、且长度合理的片段（过长说明用户写的是一句话，不适合塞进台词） */
function pick(parts: string[], maxLen: number): string | null {
  for (const p of parts) {
    const v = p.trim()
    if (v && v.length <= maxLen) return v
  }
  return null
}

/** 从「自称」字段解析：优先取 `/` 后的最后一个候选（"人家 / 本鲸" → "本鲸"） */
function selfClaimOf(raw: string): string | null {
  const body = stripTag(raw).split('（')[0]
  const candidates = body.split(/[／|/]/)
  return pick([...candidates].reverse(), 6)
}

/** 从「称呼你」字段解析（"CALL_USER_主人" → "主人"） */
function userNameOf(raw: string): string | null {
  return pick([stripTag(raw).split('（')[0]], 6)
}

/** 从「主食 / 道具」字段解析带 `FOOD_` 标签的那一行（"FOOD_白饭（主食…）" → "白饭"） */
function foodOf(raw: string): string | null {
  for (const line of raw.split('\n')) {
    if (!/FOOD_/.test(line)) continue
    const v = stripTag(line.trim().split('（')[0])
    if (v && v.length <= 6) return v
  }
  return null
}

/** 人设 → 语气参数（解析失败逐项回退，绝不整体失效） */
export function voiceFromPersona(persona: Persona | null): PetVoice {
  if (!persona) return DEFAULT_VOICE
  return {
    self: selfClaimOf(persona.selfClaim) ?? DEFAULT_VOICE.self,
    master: userNameOf(persona.userName) ?? DEFAULT_VOICE.master,
    food: foodOf(persona.likes) ?? DEFAULT_VOICE.food,
    tail: DEFAULT_VOICE.tail,
  }
}