/**
 * 术数结构化解读 —— interpretation
 * 纯函数：把排盘结果转为克制的结构说明（非吉凶断言）
 * 原则：只描述结构与关系，不做伪科学判断
 */
import type { LiuyaoAnalysis } from './liuyao'
import type { QimenPan } from './qimen'

/** 六爻结构解读 */
export function interpretLiuyao(a: LiuyaoAnalysis): string[] {
  const lines: string[] = []
  lines.push(`卦象：${a.benGua.name}（${a.palace}宫 · ${a.palaceElement}），世爻 ${a.shiYao}、应爻 ${a.yingYao}。`)
  const dong = a.lines.filter((l) => l.changing)
  if (dong.length === 0) {
    lines.push('六爻皆静，暂无动爻，格局稳定。')
  } else {
    lines.push(`动爻 ${dong.length} 处（${dong.map((l) => `${l.index}爻${l.qin}`).join('、')}），变化集中于这些位置。`)
  }
  const shi = a.lines.find((l) => l.position === '世')
  const ying = a.lines.find((l) => l.position === '应')
  if (shi && ying) {
    lines.push(`世爻纳${shi.zhi}（${shi.element}${shi.qin}），应爻纳${ying.zhi}（${ying.element}${ying.qin}），二者关系：${relation(shi.element, ying.element)}。`)
  }
  if (a.bianGua) lines.push(`变卦 ${a.bianGua.name}，提示事态走向。`)
  lines.push('以上为结构说明，具体取舍请结合实际情况自行判断。')
  return lines
}

/** 奇门结构解读 */
export function interpretQimen(pan: QimenPan): string[] {
  const lines: string[] = []
  lines.push(`${pan.dun}遁${pan.ju}局 · 节气 ${pan.jieqi ?? '—'} · 旬首 ${pan.xunShou ?? '—'}。`)
  if (pan.zhifu) lines.push(`值符 ${pan.zhifu}，值使 ${pan.zhishi ?? '—'}（示意）。`)
  lines.push('本盘为简化排盘，用于学习排盘结构；正式占断需按节气与日柱定局，此处不作吉凶判断。')
  return lines
}

/** 五行生克关系描述 */
function relation(a: string, b: string): string {
  const SHENG: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
  const KE: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }
  if (a === b) return `${a}同气`
  if (SHENG[a] === b) return `${a}生${b}`
  if (KE[a] === b) return `${a}克${b}`
  if (SHENG[b] === a) return `${b}生${a}`
  return `${b}克${a}`
}
