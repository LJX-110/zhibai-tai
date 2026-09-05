/**
 * 冲突解决 —— Phase 1 占位
 * 采用 Last-Write-Wins（LWW）作为默认策略，后续可替换为字段级合并。
 */
export interface Conflict<L, R> {
  local: L
  remote: R
}

export function resolveLWW<L, R>(conflict: Conflict<L, R>): R {
  // 默认以远端为准；未来可按实体配置合并策略
  return conflict.remote
}
