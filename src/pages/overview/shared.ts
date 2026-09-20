/**
 * 观 · 首页专属的类型与常量
 */

/** 炁象维度（克制，非堆数字） */
export interface QiDim {
  key: string
  label: string
  sub: string
  value: number
  max: number
  tone: 'teal' | 'cinnabar' | 'bronze' | 'plain'
}

export const DIM_COLOR: Record<QiDim['tone'], string> = {
  cinnabar: 'var(--color-cinnabar)',
  teal: 'var(--color-teal)',
  bronze: 'var(--color-gold-btn)',
  plain: 'var(--color-ink-muted)',
}
