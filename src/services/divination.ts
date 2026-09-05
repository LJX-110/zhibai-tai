/**
 * 奇 —— 占卜基础数据与框架
 * 第一版：每日签（按日期确定性生成）+ 八卦视觉数据 + 六爻抛钱框架
 * 为后续真实算法模块预留接口（generateHexagram 等）
 */

export interface DailySign {
  title: string
  text: string
  tag: string
}

/** 每日签库（克制、正面、可复用） */
export const DAILY_SIGNS: DailySign[] = [
  { title: '静水', text: '今日宜静不宜动，先安顿内心，再处理外务。', tag: '守' },
  { title: '潜行', text: '时机未至，不必急于显露，沉下心积蓄。', tag: '藏' },
  { title: '破晓', text: '晦暗将散，主动踏出一步，局面自会开朗。', tag: '进' },
  { title: '拾遗', text: '旧日未竟之事今日容易收尾，宜补缺。', tag: '补' },
  { title: '会友', text: '与人交流易有收获，多听少辩，贵人自来。', tag: '和' },
  { title: '磨刃', text: '今日适合打磨技艺、精进基础，不求速成。', tag: '练' },
  { title: '观潮', text: '大浪将至，先观其势，勿贸然逆流而动。', tag: '待' },
  { title: '点灯', text: '纵使环境晦暗，也当为自己点一盏灯。', tag: '明' },
  { title: '分筹', text: '事有轻重，先分清主次，再逐一下手。', tag: '序' },
  { title: '生发', text: '萌动之势已起，种下的种子今日可见微光。', tag: '萌' },
  { title: '回望', text: '回看走过的路，才发现经验已经长成。', tag: '省' },
  { title: '结网', text: '今日宜连接资源、编织关系，网成则鱼至。', tag: '联' },
  { title: '守拙', text: '不逞聪明，以笨功夫取胜，反而稳妥。', tag: '拙' },
  { title: '易辙', text: '原路不通，果断换一条路，不是放弃。', tag: '变' },
  { title: '藏锋', text: '锋芒收一收，锋芒在鞘中才最利。', tag: '敛' },
]

/** 按日期确定性生成每日签（同一天结果一致） */
export function signOf(date: string): DailySign {
  const hash = [...date].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7)
  return DAILY_SIGNS[hash % DAILY_SIGNS.length]
}

/** 八卦基础数据（方位/卦象符号/五行） */
export interface Bagua {
  key: string
  name: string
  symbol: string
  direction: string
  nature: string
}

export const BAGUA: Bagua[] = [
  { key: 'qian', name: '乾', symbol: '☰', direction: '西北', nature: '天' },
  { key: 'dui', name: '兑', symbol: '☱', direction: '西', nature: '泽' },
  { key: 'li', name: '离', symbol: '☲', direction: '南', nature: '火' },
  { key: 'zhen', name: '震', symbol: '☳', direction: '东', nature: '雷' },
  { key: 'xun', name: '巽', symbol: '☴', direction: '东南', nature: '风' },
  { key: 'kan', name: '坎', symbol: '☵', direction: '北', nature: '水' },
  { key: 'gen', name: '艮', symbol: '☶', direction: '东北', nature: '山' },
  { key: 'kun', name: '坤', symbol: '☷', direction: '西南', nature: '地' },
]

export type Coin = 'yang' | 'yin' | 'changing-yang' | 'changing-yin'

export interface HexagramLine {
  index: number
  coin: Coin
}

/**
 * 六爻抛钱法框架
 * 三枚铜钱，抛一次得一动爻：
 * 3 正 → 老阳（动） · 2 正 1 反 → 少阴 · 1 正 2 反 → 少阳 · 0 正 → 老阴（动）
 */
export function tossCoins(seed: number): HexagramLine[] {
  // 简单伪随机，保证同一种子结果一致
  let s = seed >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const lines: HexagramLine[] = []
  for (let i = 0; i < 6; i++) {
    const heads = [rnd(), rnd(), rnd()].filter((r) => r < 0.5).length
    const coin: Coin =
      heads === 3 ? 'changing-yang' : heads === 0 ? 'changing-yin' : heads === 1 ? 'yang' : 'yin'
    lines.push({ index: i, coin })
  }
  return lines
}
