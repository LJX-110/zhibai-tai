/**
 * 天机 · 长期记忆 store
 *
 * ## 写入纪律（规格 §C9/C10）
 *  · **只有用户明确保存的内容才进这里** —— 任何"自动把聊天记下来"的路径都不做；
 *  · 天机可以**提议**记一条（`memory.save` 工具，需用户确认后才落库）；
 *  · 停用（`enabled: false`）只影响"是否注入上下文"，数据保留。
 */
import { memoryRepo } from '../repositories/persona-repo'
import type { Memory } from '../types/entities'
import { createId, nowISO } from '../utils/id'
import { createCrudStore } from './factory'

/** 长期记忆（多行表）：add / save / update / remove 全套来自工厂 */
export const useMemoryStore = createCrudStore<Memory>(memoryRepo)

/** 构造一条新记忆（标签用空格 / 逗号分隔的输入串） */
export function makeMemory(text: string, tagsInput: string, source: Memory['source'] = 'user'): Memory {
  const now = nowISO()
  return {
    id: createId(),
    text: text.trim(),
    tags: tagsInput
      .split(/[\s,，]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    enabled: true,
    source,
    createdAt: now,
    updatedAt: now,
  }
}