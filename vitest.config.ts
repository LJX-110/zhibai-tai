import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // .tsx 页面冒烟测试（ui-smoke）走 jsdom（文件内 @vitest-environment jsdom 覆盖）
    include: ['src/**/*.test.?(c|m)[jt]s?(x)'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
