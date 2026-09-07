/**
 * 六十四卦数据 —— 卦名 / 卦辞 / 三爻结构
 *梅花易数与六爻共用：梅花按上卦-下卦键取卦，六爻按爻线数组取卦。
 * 卦辞为通行本原文的精简摘引（够断语氛围，不作全文引用）。
 */

export interface Trigram {
  key: string
  name: string
  symbol: string
  /** 先天数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8 */
  num: number
  element: '金' | '木' | '水' | '火' | '土'
  /** 爻线（自下而上，1=阳 0=阴） */
  lines: [number, number, number]
}

/** 八经卦（先天数序） */
export const TRIGRAMS: Trigram[] = [
  { key: 'qian', name: '乾', symbol: '☰', num: 1, element: '金', lines: [1, 1, 1] },
  { key: 'dui', name: '兑', symbol: '☱', num: 2, element: '金', lines: [1, 1, 0] },
  { key: 'li', name: '离', symbol: '☲', num: 3, element: '火', lines: [1, 0, 1] },
  { key: 'zhen', name: '震', symbol: '☳', num: 4, element: '木', lines: [1, 0, 0] },
  { key: 'xun', name: '巽', symbol: '☴', num: 5, element: '木', lines: [0, 1, 1] },
  { key: 'kan', name: '坎', symbol: '☵', num: 6, element: '水', lines: [0, 1, 0] },
  { key: 'gen', name: '艮', symbol: '☶', num: 7, element: '土', lines: [0, 0, 1] },
  { key: 'kun', name: '坤', symbol: '☷', num: 8, element: '土', lines: [0, 0, 0] },
]

export const trigramByNum = (n: number): Trigram => {
  const m = ((n % 8) + 8) % 8
  return TRIGRAMS.find((t) => t.num === (m === 0 ? 8 : m)) ?? TRIGRAMS[7]
}

export const trigramByLines = (lines: [number, number, number]): Trigram =>
  TRIGRAMS.find((t) => t.lines[0] === lines[0] && t.lines[1] === lines[1] && t.lines[2] === lines[2]) ?? TRIGRAMS[7]

export interface HexagramInfo {
  /** 上下卦键：`${upper}-${lower}` */
  key: string
  name: string
  /** 上下卦象名（如 天水） */
  xiang: string
  /** 卦辞精简摘引 */
  guoci: string
}

const H = (
  upper: string,
  lower: string,
  name: string,
  guoci: string,
): HexagramInfo => {
  const u = TRIGRAMS.find((t) => t.key === upper)!
  const l = TRIGRAMS.find((t) => t.key === lower)!
  return { key: `${upper}-${lower}`, name, xiang: `${u.name}${l.name}`, guoci }
}

/** 六十四卦（按上卦分组书写，键 = 上-下） */
export const HEXAGRAMS: HexagramInfo[] = [
  // 上乾
  H('qian', 'qian', '乾', '元亨利贞'),
  H('qian', 'dui', '履', '履虎尾，不咥人，亨'),
  H('qian', 'li', '同人', '同人于野，亨，利涉大川'),
  H('qian', 'zhen', '无妄', '无妄，往吉'),
  H('qian', 'xun', '姤', '女壮，勿用取女'),
  H('qian', 'kan', '讼', '有孚窒惕，中吉终凶'),
  H('qian', 'gen', '遁', '亨，小利贞'),
  H('qian', 'kun', '否', '不利君子贞，大往小来'),
  // 上兑
  H('dui', 'qian', '夬', '扬于王庭，孚号有厉'),
  H('dui', 'dui', '兑', '亨，利贞'),
  H('dui', 'li', '革', '巳日乃孚，元亨利贞，悔亡'),
  H('dui', 'zhen', '随', '元亨利贞，无咎'),
  H('dui', 'xun', '大过', '栋桡，利有攸往，亨'),
  H('dui', 'kan', '困', '亨，贞，大人吉，无咎'),
  H('dui', 'gen', '咸', '亨，利贞，取女吉'),
  H('dui', 'kun', '萃', '亨，王假有庙，利见大人'),
  // 上离
  H('li', 'qian', '大有', '元亨'),
  H('li', 'dui', '睽', '小事吉'),
  H('li', 'li', '离', '利贞，亨，畜牝牛吉'),
  H('li', 'zhen', '噬嗑', '亨，利用狱'),
  H('li', 'xun', '鼎', '元吉，亨'),
  H('li', 'kan', '未济', '小狐汔济，濡其尾，无攸利'),
  H('li', 'gen', '旅', '小亨，旅贞吉'),
  H('li', 'kun', '晋', '康侯用锡马蕃庶，昼日三接'),
  // 上震
  H('zhen', 'qian', '大壮', '利贞'),
  H('zhen', 'dui', '归妹', '征凶，无攸利'),
  H('zhen', 'li', '丰', '王假之，勿忧，宜日中'),
  H('zhen', 'zhen', '震', '亨，震来虩虩，笑言哑哑'),
  H('zhen', 'xun', '恒', '亨，无咎，利贞'),
  H('zhen', 'kan', '解', '利西南，无所往，其来复吉'),
  H('zhen', 'gen', '小过', '亨，利贞，可小事不可大事'),
  H('zhen', 'kun', '豫', '利建侯行师'),
  // 上巽
  H('xun', 'qian', '小畜', '亨，密云不雨，自我西郊'),
  H('xun', 'dui', '中孚', '豚鱼吉，利涉大川，利贞'),
  H('xun', 'li', '家人', '利女贞'),
  H('xun', 'zhen', '益', '利有攸往，利涉大川'),
  H('xun', 'xun', '巽', '小亨，利有攸往，利见大人'),
  H('xun', 'kan', '涣', '王假有庙，利涉大川，利贞'),
  H('xun', 'gen', '渐', '女归吉，利贞'),
  H('xun', 'kun', '观', '盥而不荐，有孚颙若'),
  // 上坎
  H('kan', 'qian', '需', '有孚，光亨贞吉，利涉大川'),
  H('kan', 'dui', '节', '亨，苦节不可贞'),
  H('kan', 'li', '既济', '亨小，利贞，初吉终乱'),
  H('kan', 'zhen', '屯', '元亨利贞，勿用有攸往'),
  H('kan', 'xun', '井', '改邑不改井，无丧无得'),
  H('kan', 'kan', '坎', '习坎，有孚，维心亨'),
  H('kan', 'gen', '蒙', '匪我求童蒙，童蒙求我'),
  H('kan', 'kun', '比', '吉，原筮元永贞，无咎'),
  // 上艮
  H('gen', 'qian', '大畜', '利贞，不家食吉，利涉大川'),
  H('gen', 'dui', '损', '有孚元吉，可贞，利有攸往'),
  H('gen', 'li', '贲', '亨，小利有攸往'),
  H('gen', 'zhen', '颐', '贞吉，观颐，自求口实'),
  H('gen', 'xun', '蛊', '元亨，利涉大川'),
  H('gen', 'kan', '蒙', '匪我求童蒙，童蒙求我'),
  H('gen', 'gen', '艮', '艮其背，不获其身'),
  H('gen', 'kun', '剥', '不利有攸往'),
  // 上坤
  H('kun', 'qian', '泰', '小往大来，吉亨'),
  H('kun', 'dui', '临', '元亨利贞，至于八月有凶'),
  H('kun', 'li', '明夷', '利艰贞'),
  H('kun', 'zhen', '复', '亨，出入无疾，朋来无咎'),
  H('kun', 'xun', '升', '元亨，用见大人，勿恤'),
  H('kun', 'kan', '师', '贞，丈人吉，无咎'),
  H('kun', 'gen', '谦', '亨，君子有终'),
  H('kun', 'kun', '坤', '元亨，利牝马之贞'),
]

const hexKey = (upper: string, lower: string) => `${upper}-${lower}`
const HEX_MAP = new Map(HEXAGRAMS.map((h) => [h.key, h]))

/** 按上下卦取卦 */
export const hexagramOf = (upper: Trigram, lower: Trigram): HexagramInfo =>
  HEX_MAP.get(hexKey(upper.key, lower.key)) ?? HEXAGRAMS[0]

/** 按六爻线数组取卦（自下而上，供六爻复用） */
export const hexagramByLines = (lines: number[]): HexagramInfo => {
  const lower = trigramByLines([lines[0] ?? 0, lines[1] ?? 0, lines[2] ?? 0])
  const upper = trigramByLines([lines[3] ?? 0, lines[4] ?? 0, lines[5] ?? 0])
  return hexagramOf(upper, lower)
}
