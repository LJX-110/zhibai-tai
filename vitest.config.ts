import { defineConfig } from 'vitest/config'

export default defineConfig({
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
