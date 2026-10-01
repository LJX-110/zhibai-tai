/**
 * 长期记忆检索（**纯函数**，Step 4-2 · C9）
 *
 * ## 为什么不引入向量库
 * 硬约束"不增加运行时依赖"，而向量检索必然带来 embedding 模型 + 索引存储
 * （前者要联网、后者要同步）。第一版按规格用**关键词 / 标签 / 时间**检索：
 * 中文没有天然空格，所以用**字符二元组（bigram）**做最小可用的切分 ——
 * 它不需要分词词典，对"不吃香菜""周三有课"这类短事实的命中率足够。
 *
 * ## 两条纪律
 *  · **只取启用的**（停用 = 不注入，但数据保留）；
 *  · **没有命中就不硬塞**：宁可这次不给记忆，也不要把无关内容塞进每次请求
 *    （既污染 prompt，又让模型把不相干的事说成"我记得"）。
 */
import type { Memory } from '../../types/entities'

/** 单次注入的记忆条数上限（再多也没有边际收益，只会稀释注意力） */
const MEMORY_INJECT_LIMIT = 6

/** 中文取字符二元组；英文/数字取整词（长度 ≥2） */
function keywordsOf(text: string): string[] {
  const out = new Set<string>()
  const lower = text.toLowerCase()
  for (const word of lower.match(/[a-z0-9]{2,}/g) ?? []) out.add(word)
  const han = lower.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let i = 0; i + 1 < han.length; i++) out.add(han.slice(i, i + 2))
  if (han.length === 1) out.add(han)
  return [...out]
}

/** 单条记忆与问题的相关度（0 = 无关；分数只用于排序，没有绝对含义） */
function memoryScore(m: Memory, question: string): number {
  const keys = keywordsOf(question)
  if (keys.length === 0) return 0
  const hay = `${m.text} ${m.tags.join(' ')}`.toLowerCase()
  let score = 0
  for (const k of keys) {
    if (hay.includes(k)) score += 1
    // 标签命中权重更高：标签是用户显式给的检索入口
    if (m.tags.some((t) => t.toLowerCase().includes(k))) score += 1
  }
  return score
}

/**
 * 选出本次要注入的记忆。
 *
 * 排序：相关度 → 更新时间新者优先。**相关度为 0 的一律不注入**（见文件头纪律）。
 */
export function selectMemories(
  memories: readonly Memory[],
  question: string,
  limit = MEMORY_INJECT_LIMIT,
): Memory[] {
  return memories
    .filter((m) => m.enabled && m.text.trim() !== '')
    .map((m) => ({ m, score: memoryScore(m, question) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.updatedAt.localeCompare(a.m.updatedAt))
    .slice(0, Math.max(0, limit))
    .map((x) => x.m)
}