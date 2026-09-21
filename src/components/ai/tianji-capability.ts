/**
 * 天机的「快捷能力」调用入口 —— 能力本体在各板块插件里
 *
 * 这里只做三件事：把注册表里的能力整理成面板要的形状、按 key 找到能力、跑它。
 * 加一个新能力 = 在对应板块插件里写 `capability` + 注册，**不必改本文件**。
 *
 * 只保留能力名：横滚行里名字本身就够辨认，每条再挂两行解释会把行高撑到 52px、
 * 挤掉真正的内容（用户明确要求移除这类小字说明）。
 */
import { useTodayStats } from '../../hooks/useTodayStats'
import { capabilitiesOf, capabilityOf, type CapabilityIcon } from './plugins'

export type TianjiCapabilityKey = string

export const TIANJI_CAPABILITIES: {
  key: string
  label: string
  icon: CapabilityIcon
}[] = capabilitiesOf().map(({ key, label, icon }) => ({ key, label, icon }))

/** 运行快捷能力，返回 (标题, 正文)；失败时抛错由调用方降级处理 */
export async function runTianjiCapability(
  key: string,
  stats: ReturnType<typeof useTodayStats>,
): Promise<{ title: string; body: string }> {
  const cap = capabilityOf(key)
  if (!cap) throw new Error(`未知的天机能力：${key}`)
  return cap.run({ stats })
}
