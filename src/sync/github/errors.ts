/**
 * GitHub 同步错误 → 人话
 *
 * provider 抛出的原始消息形如 `GitHub 403: Resource not accessible by personal access token`：
 * 它是给开发者看的，用户看到只知道"失败了"，不知道该去点哪里。这里按**该干什么**翻译。
 *
 * 顺序有讲究：先判 401/403/404 这些"配置问题"，再判业务冲突（422/409），
 * 因为配置问题一次性就能修好，而冲突只需要重试。
 */
export function describeGitHubError(raw: string): string {
  const msg = raw.trim()
  if (!msg) return '同步失败'

  if (msg.includes('401')) {
    return 'GitHub 令牌无效或已过期 —— 重新生成一个令牌，贴回「设置 → 同步」'
  }
  if (msg.includes('403')) {
    return '令牌看不到这个仓库 —— 检查①仓库名必须是「用户名/仓库名」②令牌权限：细粒度令牌给该仓库开 Contents 读写，经典令牌勾 repo；仓库在组织下还要在令牌上点 Configure SSO 授权'
  }
  if (msg.includes('404')) {
    return '找不到这个仓库 —— 检查仓库名是否写成「用户名/仓库名」，以及该令牌是否有权访问它'
  }
  if (/409/.test(msg) && /empty/i.test(msg)) {
    return '这个仓库还是空的 —— 在 GitHub 上随便提交一个文件（比如 README）后再同步；现在的版本会自动建初始提交，直接重试一次即可'
  }
  if (msg.includes('422')) {
    return '远端快照刚被其他设备更新 —— 稍等几秒重试即可（会自动重新拉取合并）'
  }
  if (msg.includes('超时') || msg.includes('timeout') || /Failed to fetch|NetworkError/i.test(msg)) {
    return '连不上 GitHub —— 检查网络/代理，稍后重试'
  }
  return msg
}
