/**
 * 天机 · 系统能力的上下文注入
 *
 * 为什么单开一个文件、而不是塞进 `plugins/`：
 * 系统能力**不是业务板块**（见 `services/capabilities/types.ts` 的说明）。
 * 把它混进板块注册表会让"授权"这件事失去边界 —— 板块插件从不需要许可。
 *
 * ## 三条写法上的讲究
 *  1. **按问题门控**：没问位置就别注入坐标，白占 prompt 且平白暴露信息；
 *  2. **未授权要说"未授权"**，并**明确要求模型不要编造** ——
 *     否则模型会很自然地"猜"一个城市名，而用户会以为那是真的读数；
 *  3. **过期不注入**（`isFresh`）：十分钟前的坐标不如没有，模型会当成现在的。
 */
import { getSnapshots, isFresh, type CapabilitySnapshot } from '../../services/capabilities'

/** 各类能力的关键词门控 */
const GATE: Record<string, RegExp> = {
  geo: /附近|周边|位置|定位|在哪|有多远|距离|通勤|怎么走|路线/,
  clipboard: /剪贴板|刚复制|刚才复制|复制的内容|粘贴/,
}

function minutesAgo(at: number | null, now: number): number {
  if (at === null) return 0
  return Math.max(0, Math.round((now - at) / 60_000))
}

/** 一条能力的上下文行（导出以便单测直接断言措辞） */
export function capabilityLine(s: CapabilitySnapshot, now = Date.now()): string {
  const name = s.label
  if (s.state === 'unsupported') return ''
  if (s.state === 'denied') {
    return `【系统能力 · ${name}】用户曾拒绝授权。**不要假设或编造${name}信息**；如需，请说明需用户重新授权。`
  }
  if (isFresh(s, now) && s.value) {
    return `【系统能力 · ${name}】用户已授权，最近一次取值（${minutesAgo(s.at, now)} 分钟前）：${s.value}`
  }
  return `【系统能力 · ${name}】**尚未取到**（用户还没在天机面板点「${name}」授权）。**不要编造${name}信息**；如需，请让用户点一次。`
}

/**
 * 按问题拼出系统能力上下文（没有相关能力/没有相关问法时返回空数组）
 *
 * `opts.snaps` 可注入（单测用）—— 否则要造一个假的 navigator 才能测门控逻辑
 */
export function buildCapabilityContext(
  question: string,
  opts: { snaps?: CapabilitySnapshot[]; now?: number } = {},
): string[] {
  const out: string[] = []
  const now = opts.now ?? Date.now()
  for (const s of opts.snaps ?? getSnapshots()) {
    const gate = GATE[s.kind]
    if (!gate || !gate.test(question)) continue
    const line = capabilityLine(s, now)
    if (line) out.push(line)
  }
  return out
}
