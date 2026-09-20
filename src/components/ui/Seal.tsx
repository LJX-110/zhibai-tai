/**
 * Seal —— 印章（方案二 · 朱文小玺）
 *
 * 形制：细线双环、无纹样；印文居中，靠字本身撑住。
 * 字体：统一使用本地打包的小篆字体 `ZBT Seal` —— 子集化自**《全字库说文解字》EBAS**
 * （中国台湾「全字库」/ CNS11643 官方字体，《说文解字》小篆字形，子集后约 47KB，
 * 授权：政府资料开放授权条款第 1 版，可免费商用，来源见 assets/fonts/seal-LICENSE.txt）。
 *
 * 为什么有一张字形映射表：该字体按《说文》**正体字**收字，现代简体码位缺失过半，
 * 如「联」「毕」「购」都要取繁体字形才拿得到篆书。映射只作用于印章本身，
 * 不影响页面其它任何文字（其它位置仍是原本的楷体 / 行楷 / 系统字体）。
 */
import { cn } from '../../utils/cn'

export interface SealProps {
  /** 印文（默认「异」） */
  char?: string
  size?: number
  tone?: 'cinnabar' | 'bronze' | 'plain' | 'teal'
  /** 旋转（模拟盖印歪斜；展示型尺寸建议 −2°） */
  rotate?: number
  className?: string
  title?: string
}

/**
 * 印色语义（**单一事实源** —— 改色或新增用法前先读这里，别凭感觉挑色）：
 *   cinnabar 绛红 —— 完成 · 确认 · 危险：落印（事毕）、支出、逾期、今日签
 *   bronze   鎏金 —— 荣誉 · 次要完成：列表勾选、作业完成、已下单
 *   teal     黛蓝 —— 已处理 · 正向：收入、已收货
 *   plain    墨   —— 中性 · 未激活：占位、禁用
 *
 * 注意「勾选用 bronze、落印用 cinnabar」是**刻意分层**：行内小勾安静，
 * 全行落印才是重音。不要为了"统一"把两者改成同色，那会让落印失去分量。
 */
const toneStroke: Record<NonNullable<SealProps['tone']>, string> = {
  cinnabar: 'var(--color-cinnabar)',
  bronze: 'var(--color-gold-deep)',
  plain: 'var(--color-ink-muted)',
  teal: 'var(--color-teal)',
}

/**
 * 界面用字 → 字体实际字形。
 * 上半部分是简繁同字的转换（字体只收《说文》正体）；
 * 后半部分是字体缺字后的**近义替代**，改的是印文用字，不是显示方式：
 *   藏 → 蓄（「潜行」签：沉下心积蓄）
 *   势 → 力（「燎原」签：星火已成势）
 *   泄 → 宣（「开闸」签：宜开闸疏泄）
 */
const SEAL_GLYPH_MAP: Record<string, string> = {
  联: '聯',
  进: '進',
  补: '補',
  练: '練',
  变: '變',
  敛: '斂',
  养: '養',
  断: '斷',
  净: '淨',
  谋: '謀',
  试: '試',
  静: '靜',
  炼: '煉',
  牵: '牽',
  开: '開',
  礼: '禮',
  毕: '畢',
  异: '異',
  购: '購',
  藏: '蓄',
  势: '力',
  泄: '宣',
}

// 篆书子集实测常量（fontTools 量自 seal-zhuanshu.woff2）：
//   SEAL_UNITS_PER_EM —— 字身单位（em = 4096）
//   SEAL_INK_CENTER   —— 印文墨盒中心相对基线的平均偏移（font units，正值在基线上方）
// 二者用于反推文本基线，使印文墨心精确落在视图中心 y=32，且大小印一致。
const SEAL_UNITS_PER_EM = 4096
const SEAL_INK_CENTER = 1222

/**
 * 印文横向墨心偏移（font units；正 = 墨迹偏右）。
 *
 * 为什么需要它：篆书子集里 **advance 全是 4096**（等宽字形），但**墨迹中心**逐字不同 ——
 * 实测从 −424（開）到 +624（待），跨度约 25% em。而 `textAnchor="middle"` 对齐的是
 * advance 中点、不是墨迹，于是同一枚印章里有的字看着偏左、有的偏右
 * （抽签页大印「辨」不在环心即此，实测 +468）。
 *
 * 取值方式：fontTools 取字形 bounds，(xMin+xMax)/2 − unitsPerEm/2；
 * 生成/复核脚本：`work/scripts/seal_ink_table.py` 与 `check_seal_glyphs.py`（同一套字体）。
 * ⚠️ **新增印文用字时必须补测**，表里没有的字按 0 处理（会偏，但不崩）。
 */
const SEAL_INK_DX: Record<string, number> = {
  信: 351,
  借: -103,
  力: -2,
  合: 16,
  和: 430,
  培: 469,
  守: 120,
  宣: 175,
  序: -2,
  待: 624,
  拙: 356,
  支: -70,
  收: 151,
  斂: 142,
  斷: 6,
  明: 65,
  歇: -20,
  止: 204,
  步: 342,
  注: 476,
  淨: -2,
  清: -1,
  煉: -147,
  牽: -107,
  畢: -421,
  異: -360,
  省: -387,
  禮: 106,
  移: 139,
  精: 96,
  練: 195,
  耕: -80,
  聚: 8,
  聯: 99,
  萌: 232,
  蓄: 12,
  行: 40,
  補: 464,
  解: -135,
  試: 102,
  謀: 526,
  變: 56,
  購: -120,
  辨: 468,
  進: 124,
  開: -424,
  靜: 145,
  養: 90,
}

export function Seal({
  char = '异',
  size = 28,
  tone = 'cinnabar',
  rotate = 0,
  className,
  title,
}: SealProps) {
  const stroke = toneStroke[tone]
  // 小尺寸（<24px）省去内环：细线在 18px 下会糊成实心圈
  const detail = size >= 24
  const glyph = SEAL_GLYPH_MAP[char] ?? char

  // 印文纵向居中（字体实测校准，不用 dominantBaseline）：
  // ZBT Seal 的 ascent/descent 元数据不规范，dominantBaseline=central 会把字顶偏上；
  // 故按子集实测的「墨心偏移」反推基线，让印文墨盒中心永远落在视图中心 y=32。
  // 该偏移与字号成正比，所以大小印都精确居中、且彼此一致——
  // 旧写死 y=42 在「无内环档 fontSize=40」会比「有内环档 fontSize=30」整体偏上约 2 单位。
  const glyphSize = detail ? 30 : 40
  const baseline = 32 + (SEAL_INK_CENTER * glyphSize) / SEAL_UNITS_PER_EM

  // 横向：先按字修正墨心，再让墨心（而非 advance 中点）落在视图中心 x=32。
  // 与纵向同样「按字号等比」——所以大小印都精确居中、且彼此一致。
  const textX = 32 - ((SEAL_INK_DX[glyph] ?? 0) * glyphSize) / SEAL_UNITS_PER_EM

  // 环形描边：保小印描得实，不改动大印比例观感。
  // 描边写在 64 视图坐标里会随 svg 缩放：18/22px 下 1.6 单位只剩 ~0.45px，
  // 被抗锯齿成灰蒙蒙虚线（即用户反馈的"小尺寸发虚"）。这里给屏幕像素下限，
  // 小印也描实；大印（>~48px）仍按比例变粗，保留原有细线比例。
  const outerStroke = Math.max(1.6, (1.2 * 64) / size) // 屏幕 ~1.2px 下限
  const innerStroke = detail ? Math.max(0.6, (0.7 * 64) / size) : 0 // 屏幕 ~0.7px 下限

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn('shrink-0 select-none', className)}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
      role="img"
      aria-label={title ?? `${char}印`}
    >
      <circle cx="32" cy="32" r="29" fill="none" stroke={stroke} strokeWidth={outerStroke} />
      {detail && (
        <circle cx="32" cy="32" r="25.4" fill="none" stroke={stroke} strokeWidth={innerStroke} opacity="0.5" />
      )}
      <text
        x={textX}
        y={baseline}
        textAnchor="middle"
        fontSize={glyphSize}
        fill={stroke}
        style={{ fontFamily: "'ZBT Seal', serif" }}
      >
        {glyph}
      </text>
    </svg>
  )
}
