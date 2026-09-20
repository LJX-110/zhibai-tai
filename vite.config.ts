import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** 版本号单一事实源：package.json。
 *  此前应用内有三处手写版本（页脚 V1.6 / 导出备份 0.4.0 / package.json 0.3.0），
 *  互相矛盾，排查线上问题时无法确认用户到底跑的是哪一版。 */
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

/** 仓库外的「非提交物」根目录：依赖、缓存、构建产物一律放这里，
 *  知白台 目录内只保留要提交并部署到 GitHub 的正式文件。 */
const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const externalRoot = resolve(projectRoot, '..')
const devDistDir = resolve(externalRoot, 'dev-dist')

/** 产物目录要分环境：CI（GitHub Actions）上 deploy.yml 上传的是仓库根下的
 *  dist/，产物若跟着本地规则写到仓库外，部署只会拿到空目录。 */
const outDir = process.env.CI ? 'dist' : resolve(externalRoot, 'dist')

// https://vite.dev/config/
export default defineConfig({
  // 构建期注入，应用内统一从 src/app/version.ts 读取
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir,
    // outDir 落在项目根之外时 Vite 默认拒绝清空并告警；
    // 该目录专用于构建产物，显式声明清空是预期行为
    emptyOutDir: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    // PWA：manifest + service worker，离线可用、可添加到主屏幕
    VitePWA({
      // prompt 模式：SW 发现新版本时通知页面显示「点击刷新」横幅，
      // 而不是 autoUpdate 的后台悄悄换（用户感知不到更新，长期停在旧版）
      registerType: 'prompt',
      includeAssets: ['favicon-v2.svg'],
      // dev 模式默认不注入 manifest（vite-plugin-pwa 源码：
      // devEnvironment && !devOptions.enabled → webManifestData() 返回 void）
      // 启动 dev 服务器安装 PWA 会拿不到图标，变成灰底白字的字母回退图。
      // 开启后 dev 同样可见 manifest + 可安装，本地调试与线上体验一致。
      devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true,
        // 插件默认把 dev 期的 service worker 写进项目内 dev-dist/，
        // 同样改到仓库外，项目目录只留提交文件
        resolveTempFolder: () => devDistDir,
      },
      manifest: {
        name: '知白台',
        short_name: '知白台',
        description: '知白台 — 知其白，守其黑 · 个人效率系统',
        lang: 'zh-CN',
        // V1.6 冷色定稿：主题色=黛蓝（安装后标题栏），启动底色=纯白
        theme_color: '#2e5a8c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: './icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: './icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          // 常规图标含圆角/留白，复用为 maskable 会被平台遮罩裁掉外圈；
          // 专用 maskable 版（全底铺色、内容收缩在安全区内）见 icon-maskable.png
          {
            src: './icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 字体不进预缓存：两个中文全字集字体占构建产物 77%（4.7MB），
        // 每次版本升级都会整包重拉。改为运行时 CacheFirst——
        // 首次在线访问后进入 fonts 缓存，此后离线可用、升级零流量。
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 点击系统通知要能聚焦窗口并跳到对应板块：generateSW 产出的 SW
        // 本身不含业务逻辑，用 importScripts 注入 public/sw-notify.js；
        // 该文件也会被上面的 glob 匹配到，故排除出预缓存清单避免重复注入
        globIgnores: ['sw-notify.js'],
        importScripts: ['sw-notify.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\.(?:woff2?)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
