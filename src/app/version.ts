/**
 * 应用版本 —— 唯一来源是 package.json（构建时由 vite 的 define 注入）
 *
 * 此前页脚、导出备份的 _meta、package.json 各写一份版本号且互相矛盾，
 * 排查问题时无法确认用户实际跑的是哪一版。现在只改 package.json 一处。
 *
 * 这里用 `declare const` 声明构建期常量：它是模块内的环境声明，
 * 运行时代码被替换为字面量，不会残留任何引用。
 */
declare const __APP_VERSION__: string

export const APP_VERSION = __APP_VERSION__
