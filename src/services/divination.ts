/**
 * 奇 —— 占卜基础数据与框架
 * 第一版：每日签（按日期确定性生成）+ 八卦视觉数据 + 六爻抛钱框架
 * 为后续真实算法模块预留接口（generateHexagram 等）
 */

export interface DailySign {
  title: string
  text: string
  tag: string
  /** 宜（短句） */
  do: string
  /** 忌（短句） */
  dont: string
  /** 一句建议 */
  advice: string
}

/** 每日签库（克制、正面、可复用；按日期哈希确定性取签） */
export const DAILY_SIGNS: DailySign[] = [
  { title: '静水', text: '今日宜静不宜动，先安顿内心，再处理外务。', tag: '守', do: '静坐复盘', dont: '仓促决断', advice: '先安顿内心，外务自然有序。' },
  { title: '潜行', text: '时机未至，不必急于显露，沉下心积蓄。', tag: '藏', do: '积蓄准备', dont: '急于表现', advice: '沉住气，时机自会等你。' },
  { title: '破晓', text: '晦暗将散，主动踏出一步，局面自会开朗。', tag: '进', do: '主动开局', dont: '犹豫观望', advice: '迈出第一步，路就亮了。' },
  { title: '拾遗', text: '旧日未竟之事今日容易收尾，宜补缺。', tag: '补', do: '收尾旧事', dont: '再开新摊', advice: '补完旧账，腾出心力。' },
  { title: '会友', text: '与人交流易有收获，多听少辩，贵人自来。', tag: '和', do: '多听多问', dont: '争辩输赢', advice: '贵人在倾听里出现。' },
  { title: '磨刃', text: '今日适合打磨技艺、精进基础，不求速成。', tag: '练', do: '打磨基础', dont: '贪多求快', advice: '慢即是快，基本功不骗人。' },
  { title: '观潮', text: '大浪将至，先观其势，勿贸然逆流而动。', tag: '待', do: '观察形势', dont: '逆流硬撑', advice: '看清浪头再下水。' },
  { title: '点灯', text: '纵使环境晦暗，也当为自己点一盏灯。', tag: '明', do: '照看身心', dont: '自我苛责', advice: '环境再暗，灯在自己手里。' },
  { title: '分筹', text: '事有轻重，先分清主次，再逐一下手。', tag: '序', do: '列单排序', dont: '齐头并进', advice: '一次只做一件事，做完再做下一件。' },
  { title: '生发', text: '萌动之势已起，种下的种子今日可见微光。', tag: '萌', do: '记录想法', dont: '否定念头', advice: '种子先落地，再谈开花。' },
  { title: '回望', text: '回看走过的路，才发现经验已经长成。', tag: '省', do: '复盘来路', dont: '重复踩坑', advice: '经验不在过去，在总结里。' },
  { title: '结网', text: '今日宜连接资源、编织关系，网成则鱼至。', tag: '联', do: '主动连接', dont: '单打独斗', advice: '资源是织出来的。' },
  { title: '守拙', text: '不逞聪明，以笨功夫取胜，反而稳妥。', tag: '拙', do: '下笨功夫', dont: '耍小聪明', advice: '笨功夫才是真捷径。' },
  { title: '易辙', text: '原路不通，果断换一条路，不是放弃。', tag: '变', do: '果断调整', dont: '死磕原路', advice: '换条路不是认输。' },
  { title: '藏锋', text: '锋芒收一收，锋芒在鞘中才最利。', tag: '敛', do: '收敛锋芒', dont: '处处争先', advice: '收在鞘中，才最利。' },
  { title: '澄心', text: '心湖澄澈，杂念沉淀，思路自然清明。', tag: '清', do: '整理案台', dont: '杂事缠身', advice: '环境清爽，思路自清。' },
  { title: '汲泉', text: '泉在深处，今日宜补水休整、蓄养精神。', tag: '养', do: '按时休整', dont: '熬夜透支', advice: '身体是案台，先养后用。' },
  { title: '落子', text: '思虑已足，今日宜落子定案，落子不悔。', tag: '断', do: '拍板定案', dont: '反复横跳', advice: '想清楚了就落子，落了就不悔。' },
  { title: '拂尘', text: '拂去积尘，删繁就简，案头与心事同理。', tag: '净', do: '清理冗余', dont: '囤积拖延', advice: '删掉的和做成的一样重要。' },
  { title: '望远', text: '登高望远，先谋全局，再落一子。', tag: '谋', do: '规划全局', dont: '埋头死磕', advice: '抬头看路，低头赶路。' },
  { title: '深耕', text: '一寸深胜过一丈宽，今日宜向深处用功。', tag: '耕', do: '深入一处', dont: '浅尝辄止', advice: '一寸深胜过一丈宽。' },
  { title: '借力', text: '独木难支，今日宜开口请教、善假于物。', tag: '借', do: '请教他人', dont: '闭门造车', advice: '会借力的人走得远。' },
  { title: '熄火', text: '炉火过旺则焚，今日宜准点熄火休息。', tag: '歇', do: '准点休息', dont: '连轴硬转', advice: '歇够了才转得动。' },
  { title: '试锋', text: '新刃初成，宜小试其锋，不宜倾力豪赌。', tag: '试', do: '小步试验', dont: '全押下注', advice: '先试一寸，再进一尺。' },
  { title: '归整', text: '散物归位，诸事归档，乱起于散、治于整。', tag: '合', do: '归档整理', dont: '乱塞乱放', advice: '文件归位，心事归位。' },
  { title: '听雨', text: '日程不必填满，留白之处自有回声。', tag: '静', do: '允许留白', dont: '填满日程', advice: '留白处有回声。' },
  { title: '燎原', text: '星火已成势，今日宜顺流推进一步。', tag: '势', do: '顺势推进', dont: '逆势强求', advice: '风口上的事，顺水推舟。' },
  { title: '淬火', text: '利刃经淬，难事经磨，今日之苦皆为开锋。', tag: '炼', do: '迎难而练', dont: '怕苦绕行', advice: '淬过的刃才开锋。' },
  { title: '拾阶', text: '山高阶密，不望山顶，只看脚下这一级。', tag: '步', do: '拆解台阶', dont: '直望山顶', advice: '台阶级级，脚下即路。' },
  { title: '澄辨', text: '言路纷杂，先辨真伪，再下判断。', tag: '辨', do: '核实信息', dont: '道听途说', advice: '先辨真伪，再下判断。' },
  { title: '涵养', text: '输出既多，今日宜回头输入、涵养源头。', tag: '养', do: '读书输入', dont: '只掏不存', advice: '输出多了，记得回填。' },
  { title: '移舟', text: '原地水浅，移舟换岸，风自来。', tag: '移', do: '换个环境', dont: '原地内耗', advice: '换个位置，风就顺了。' },
  { title: '收帆', text: '顺风满帆亦须知返，见好就收是境界。', tag: '收', do: '见好就收', dont: '得寸进尺', advice: '收得住的人走得久。' },
  { title: '点睛', text: '画已九成，差的是最后那一笔细节。', tag: '精', do: '打磨细节', dont: '差不多就行', advice: '差的那一笔，就是全部差距。' },
  { title: '引线', text: '针在囊中，线在手里，今日宜牵线成事。', tag: '牵', do: '牵线搭桥', dont: '坐等上门', advice: '线牵好了，事就成了半。' },
  { title: '培土', text: '根深方耐风雨，今日宜培土固基。', tag: '培', do: '打牢地基', dont: '急着起楼', advice: '土培厚了，楼才立得住。' },
  { title: '顺流', text: '水势既顺，稳住舵向即可，不必拼命划桨。', tag: '行', do: '顺势而为', dont: '强行扭转', advice: '顺流时稳住方向即可。' },
  { title: '守约', text: '小诺亦重，今日宜践约守时，以小信立大信。', tag: '信', do: '说到做到', dont: '轻诺失信', advice: '守小约，立大信。' },
  { title: '拓野', text: '熟路虽稳，野地藏新机，今日宜开垦一片新域。', tag: '开', do: '尝试新域', dont: '困守舒适', advice: '野地走一趟，图就大了。' },
  { title: '凝神', text: '神聚则事成，今日宜护住一段不受打扰的时间。', tag: '注', do: '整块专注', dont: '碎片分心', advice: '一段专注，胜过三段零碎。' },
  { title: '解结', text: '疙瘩越捂越紧，今日宜直面而解之。', tag: '解', do: '直面疙瘩', dont: '绕着走', advice: '结要解开，不是捂紧。' },
  { title: '积露', text: '露珠虽微，聚之成盏；零碎之功，不可轻看。', tag: '聚', do: '零碎积累', dont: '轻视小量', advice: '露水聚多了，也能盛满一碗。' },
  { title: '正冠', text: '冠正而后仪整，仪整而后事顺。', tag: '礼', do: '整仪容言辞', dont: '邋遢应付', advice: '冠正而后事顺。' },
  { title: '开闸', text: '水满则涨，今日宜开闸疏泄，说与可信之人。', tag: '泄', do: '倾诉表达', dont: '憋在心里', advice: '闸开了，水就不涨了。' },
  { title: '满盈', text: '器满则溢，今日宜盘点知足，止也是进。', tag: '止', do: '知足盘点', dont: '得陇望蜀', advice: '满则溢，止即是进。' },
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
