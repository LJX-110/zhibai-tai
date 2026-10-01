import { defineConfig } from 'vitest/config'

export default defineConfig({
  /**
   * ⚠️ 必须与 `vite.config.ts` 的 `define` 对齐。
   *
   * 构建期由 Vite 注入 `__APP_VERSION__`，而**测试环境不会自动注入** ——
   * 结果是任何 import 到 `app/version.ts` 的模块在测试里一调用就抛
   * `ReferenceError: __APP_VERSION__ is not defined`。
   * 这正是 `services/data-admin.ts`（导出/导入/清空）此前**一条测试都没有**的原因：
   * 不是没人写，而是写不出来。Step 5-1 补齐密钥隔离测试时踩到它，顺手对齐。
   */
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    environment: 'node',
    // .tsx 页面冒烟测试（ui-smoke）走 jsdom（文件内 @vitest-environment jsdom 覆盖）
    include: ['src/**/*.test.?(c|m)[jt]s?(x)'],
    setupFiles: ['./vitest.setup.ts'],

    /* ⚠️ 超时必须放宽，且**必须在配置层**放宽。
     *
     * 这个仓库的测试要过真实 Dexie（fake-indexeddb）+ 若干 900ms 去抖，还要动态 import
     * 整个模块图（情报 provider 注册表最重）。单文件跑通常 1s 内，但**全量并行跑时
     * 多个文件互相抢 CPU**，实测会把 5s 默认值吃满 —— 表现是"偶发红"，
     * 而且每次红的文件都不一样（intel-auto / cultivation-store / intel-fetch 都轮到过）。
     *
     * 这类红**本身就是隐患**：它会掩盖真正的失败，也会让人养成"重跑一次就好"的习惯。
     * 所以要治配置，不是治某一个文件。此前 settings-sync / intel-auto 各自在文件里
     * `vi.setConfig` 放宽，属于同一原因的补丁 —— 现在统一提到这里，文件内不再各写一份。 */
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
