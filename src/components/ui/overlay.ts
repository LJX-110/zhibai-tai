/**
 * 弹层协调 —— 解决堆叠弹层一次 Escape 全关的问题
 *
 * 背景：Dialog / Sheet 与 CommandMenu 各自监听 window keydown 的 Escape，
 * 叠放时（如 CommandMenu 中打开「键盘速查」帮助弹窗）一次 Esc 会同时关闭所有层。
 *
 * 约定：模态弹层（Dialog/Sheet）打开时登记、关闭时注销；
 * CommandMenu 等非模态层在响应 Escape 前先查询「是否已有上层弹层」，
 * 有则让位（只关最上层），无则正常关闭自己。
 */
let overlays = 0

/** 模态弹层打开时登记 */
export function overlayOpened(): void {
  overlays += 1
}

/** 模态弹层关闭时注销 */
export function overlayClosed(): void {
  overlays = Math.max(0, overlays - 1)
}

/** 当前是否存在模态弹层（供非模态层判断是否让位） */
export function hasActiveOverlay(): boolean {
  return overlays > 0
}