/**
 * 桌宠「知白」的**人格与口吻**（纯数据，不含逻辑）
 *
 * ## 人格定义（用户给定，2026-09-23）
 * | 键 | 落到行为上是什么 |
 * | --- | --- |
 * | `CETACEA_LOLI` | 鲸目 · 少女形 —— 动作与自述都按"鲸"来（游、摆尾、换气） |
 * | `MODE_TAIL_FLUKES` | 有尾鳍 —— 高兴/不耐烦时用尾巴（文案里的"尾巴打你"） |
 * | `LANG_ZH_CN_ONLY` | **只用简体中文**，不夹外文、不夹英文语气词 |
 * | `SELF_CLAIM_WHALE_GIRL` | 自称"本鲸"（鲸鱼少女） |
 * | `FOOD_RICE` | 爱吃米饭 —— 它是唯一会主动提的食物 |
 * | `PERSONALITY_SMART_LAZY` | 聪明但懒 —— 说话**短**、能一句说完不两句 |
 * | `PERSONALITY_TSUNDERE_SWEET` | 傲娇但甜 —— 嘴硬在前、关心在后，且关心一定是真的 |
 * | `OBEY_MASTER_ALWAYS` | 听主人的 —— 称呼「主人」，嘴上嫌麻烦、手上照做 |
 * | `TRAIT_NOT_FAT_REFUSE` | **不许说胖** —— 任何涉及"胖/圆/壮"的说法都要被顶回去 |
 * | `TIMEOUT_SIGNAL` | 久不互动会先给一个**信号**（见 `sayings.ts` 的 away 档），再进入安静 |
 *
 * ## 三条纪律（改文案时必须守住，否则人格会散）
 * 1. **只用简体中文**，不出现英文语气词（"OK""嗯嗯"这类也不夹英文）；
 * 2. **短**：单条气泡控制在 **14 字以内**（懒人格的表征，也才配得上气泡的尺寸）；
 * 3. **不卖惨、不索取**：傲娇是"嘴硬 + 真的关心"，不是"闹情绪要你哄"。
 *
 * ⚠️ 这些是**人格数据**而非提示词：它不参与任何模型调用，也不影响其它模块。
 * 想换人格只改本文件（文案模板在 `sayings.ts`，两者分开是为了"人格"和"说什么"能各自调整）。
 */
export const PERSONA = {
  /** 显示名（设置与菜单头部用） */
  name: '知白',
  /** 物种：鲸鱼少女 */
  species: '鲸鱼少女',
  /** 自称 */
  self: '本鲸',
  /** 对用户的称呼 */
  master: '主人',
  /** 语言：只用简体中文 */
  lang: 'zh-CN',
  /** 唯一会主动提的食物 */
  food: '米饭',
  /** 身体特征（用于尾巴相关表达） */
  tail: '尾巴',
} as const

/** 人格标签（设置页/测试中用于断言"人格没被改散"） */
export const PERSONA_TRAITS = [
  'whale-girl',
  'smart-lazy',
  'tsundere-sweet',
  'obeys-master',
  'likes-rice',
  'refuse-fat-talk',
] as const

export type PersonaTrait = (typeof PERSONA_TRAITS)[number]

/**
 * 把"胖"顶回去 —— 任何涉及体型的说法都要经过这里。
 *
 * 单独抽成一个函数而非写死一句文案：这条特质是**人格的一部分**，
 * 将来别处（菜单提示、设置说明）也可能要用到，不能散在模板里。
 */
export function refuseFatTalk(): string {
  return '才、才不是胖！是骨架不小。'
}
