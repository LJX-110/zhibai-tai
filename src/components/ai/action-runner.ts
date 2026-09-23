/**
 * 天机动作的落库执行 —— 一律走 store 工厂，绝不直接碰 Dexie。
 *
 * 走 store 工厂才能自动获得：墓碑（删除可传播）/ LWW 合并 / 加密快照同步 /
 * 备份导出，并在写入后触发其它页面即时刷新（notifyDataChanged）。
 *
 * 动作本体在各板块插件里（`plugins/action.ts` / `plugins/finance.ts`），
 * 这里按 action 类型找到归属插件 —— 加一种动作不必改本文件。
 * 返回是否写入成功，供面板决定后续提示。
 */
import type { TianjiActionPayload } from './action-protocol'
import { actionDefFor } from './plugins'

export async function applyTianjiAction(a: TianjiActionPayload): Promise<boolean> {
  const def = actionDefFor(a.action)
  if (!def) return false
  return def.run(a.fields)
}
