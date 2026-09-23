/**
 * 无障碍偏好查询
 *
 * 只有这一个函数，单独成文件是为了**消除重复**：此前 `usePetLoop` 与 `PetStage`
 * 各写了一份 `prefersReducedMotion()`（逐字相同）—— 这种重复最典型的后果不是
 * "多几行"，而是**将来只改其中一份**：比如给其中一份加上"运行时监听变化"，
 * 另一处就静默地继续用旧行为。
 *
 * ⚠️ 不做"运行时订阅变化"：本项目的动效在挂载时判一次就够
 * （会话中途改系统偏好是极低频行为），真要支持再在此处加监听、调用方不必改。
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}
