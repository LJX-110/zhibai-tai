/**
 * 学 · 学分选课的共享件（**非组件**：常量 / 类型 / 格式化）
 *
 * 单独成文件的两个理由：
 *  ① 组件文件只该导出组件（`only-export-components` 的纪律）；
 *  ② 主页面、条目行、条目弹窗都要用这几个中文字典 —— 各写一份必然漂移
 *     （曾经 `money` 在四处各写一份、`BUY_STATUS` 两份，规则 5 查不出来）。
 */
import type { SealProps } from '../../components/ui/Seal'
import type { CoursePlanKind, CoursePlanStatus } from '../../types/entities'

/** `Seal` 的色调闭集（转引，免得各处再写一遍字面量） */
type SealTone = NonNullable<SealProps['tone']>

/* 方向 / 状态的中文字典与展示顺序（2026-10-02 上移到 services/study-plan.ts，
 * 让天机工具（courses.plan）与页面说同一套词）—— 这里只转出，消费方 import 路径不变 */
export { KIND_LABEL, KIND_ORDER, STATUS_LABEL } from '../../services/study-plan'

/**
 * 状态印章 —— 圆形 · 细边 · 单字 · 低面积
 *
 * ## 2026-09-29：改用体系里的 `Seal` 符箓（秦篆），不再手搓圆
 * 上一版是一枚自己拼的 `<span className="rounded-full border …">`，字用**楷体**渲染 ——
 * 形状对、语言不对：全站其它印章（财的收/支、待办落印、今日签）都是**圆形符箓 + 小篆**。
 * 现在统一交给 `components/ui/Seal`：单线环、无实底、印文取自 `ZBT Seal`，
 * 于是"低面积、不抢标题"是**组件本身保证**的（不必再靠一串 CSS 工具类自觉）。
 *
 * 字取单字（选 / 候 / 否），全称由筛选行（全部 | 已选 | 候选 | 不可选）与 aria/title 承担 ——
 * 圆里塞不下两个汉字还不抢焦点。
 */
export const STATUS_SEAL: Record<CoursePlanStatus, { char: string; tone: SealTone }> = {
  // 已选 = 已定：绛红（项目里"印章 / 完成"的语言）
  selected: { char: '选', tone: 'cinnabar' },
  // 候选 = 待定：鎏金（"在考虑中"）
  candidate: { char: '候', tone: 'bronze' },
  // 不可选 = 关闭：墨（最轻，视觉上退到背景里）
  unavailable: { char: '否', tone: 'plain' },
}

/**
 * 方向印章 —— 课程计划行**前面**那一枚（限选 / 公选 / 体育）。
 *
 * 原先这里是纯文字「限选」，与后面的状态圆印并列时一个像标签、一个像印章，
 * 语言不统一。现在同样是 `Seal`，但一律用**中性墨色**：
 * 方向是分类信息，不该和"状态"抢颜色语义（颜色留给 选/候/否 三态）。
 */
export const KIND_SEAL: Record<CoursePlanKind, { char: string; tone: SealTone }> = {
  limited: { char: '限', tone: 'plain' },
  public: { char: '公', tone: 'plain' },
  pe: { char: '体', tone: 'plain' },
}

/** 条目表单的草稿。学分用字符串存 —— 输入过程中的空串/半截数字不该被 `Number` 吃掉 */
export interface PlanDraft {
  kind: CoursePlanKind
  group: string
  title: string
  credit: string
  teacher: string
  status: CoursePlanStatus
  note: string
  /** 标签草稿（原始输入；保存时经 `normalizeTags` 归一化，2026-10-02 新增） */
  tags: string
}

export const emptyDraft = (kind: CoursePlanKind, group = ''): PlanDraft => ({
  kind,
  group,
  title: '',
  credit: '',
  teacher: '',
  status: 'candidate',
  note: '',
  tags: '',
})

/** 学分去掉多余的 .0（12.0 → 12），保留一位小数（12.5 → 12.5） */
export function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1)
}
