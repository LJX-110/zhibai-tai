/**
 * 已下线的「AI 生成情报」Provider —— 仅作存量兼容
 *
 * 旧版在真实抓取全失败时，会让模型**编**一批标题、来源、数字都像真的条目，
 * 只靠一个「AI 补足」标签区分。这与「情报只来自真实来源」直接冲突：
 * 用户没有可靠办法分辨哪条是真的，抓取失败也被伪装成了成功。
 *
 * 现在不生成任何内容：源若还在库里（`provider: 'ai'`），
 * 抓取时**明确报错并指出改法**，而不是静默返回空数组或继续编造。
 * 新源也不再提供这个选项（见 `shared.ts` 的 `PROVIDER_ORDER`）；
 * 启动迁移会把存量源停用并写明原因（`registry.ts` 的 `retireAiSources`）。
 */
import type { IntelligenceProvider } from './index'

export const aiProvider: IntelligenceProvider = {
  id: 'ai',
  name: 'AI 情报（已下线）',
  fetch: async () => {
    throw new Error(
      'config: AI 生成情报已下线（情报必须来自真实来源）；请把该源改成 RSS / JSON，或删除它',
    )
  },
}
