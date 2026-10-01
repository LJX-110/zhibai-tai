import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
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
/** dev SW 自愈守卫的**持久快照**目录：放 node_modules 缓存区（清理工作区不会碰它；
 *  且它只服务于 dev 期，dev-dist 被清空也还有这里可回填 —— 见 devSwGuard 注释） */
const devSwCacheDir = resolve(externalRoot, 'node_modules/.cache/zbt-dev-sw')

/** 产物目录要分环境：CI（GitHub Actions）上 deploy.yml 上传的是仓库根下的
 *  dist/，产物若跟着本地规则写到仓库外，部署只会拿到空目录。 */
const outDir = process.env.CI ? 'dist' : resolve(externalRoot, 'dist')

/**
 * dev 期 service worker 的**自愈守卫**（2026-10-01 修 ENOENT 事故）
 *
 * ## 真实触发链（上游源码 + 运行日志 + 实测复现，三方核实过）
 * vite-plugin-pwa@1.3.0 的 dev 段（`dist/index.js` L568-L619）只在**本进程首次**
 * 收到 `/dev-sw.js?dev-sw` 请求时生成一次文件，并把内存标志 `swDevGenerated` 置 true；
 * 此后**永不重建**。于是：① 清理工作区时把 `dev-dist/` 当普通构建产物删掉；
 * ② 下一次请求走到 `readFile(dev-dist/sw.js)` → ENOENT → dev 永久 500
 * （空文件夹还会被 `mkdirSync` 补回来，看起来像"目录好好的"）。
 *
 * ## 两个容易被忽略的细节（决定了守卫必须这么写）
 *  · **请求名 ≠ 落盘名**：请求是 `/dev-sw.js?dev-sw`，文件却叫 `dev-dist/sw.js`
 *    （另有 `workbox-<hash>.js` 与 `suppress-warnings.js`）；
 *  · **只有"模块缓存未命中"的请求才会真的读盘** —— 平时 Vite 用模块图缓存直接返回，
 *    把缺文件的问题掩盖住；而**配置热重启会清空模块图、却保留上游那个进程级标志**
 *    （node_modules 模块实例不随重启重建）。所以"删文件 + 改配置重启"这一组合
 *    依然会 500 —— 只做内存快照救不回来，快照必须**落盘**。
 *
 * ## 本守卫只做一件事：让文件永远在
 * 在 Vite 内部中间件之前截获这几个文件的请求：
 *  · 文件在 → 顺手把它们各拷一份到 `node_modules/.cache/zbt-dev-sw/`（持久快照）；
 *  · 文件不在 → 先从持久快照回填，再 `next()` 放行。
 * 请求仍走插件的原生链路（不自己造 SW、不改响应内容），只是"删了也能立刻恢复"。
 *
 * ⚠️ 不覆盖 preview / build：两者读的是构建产物 `dist/`，与 dev-dist 无关。
 * ⚠️ 唯一兜不住的窗口：文件在本机从未被生成过（快照也为空）——放行即可，
 * 此时上游标志必为 false，插件会正常生成，随后守卫再补拍快照。
 */
function devSwGuard(tempDir: string, cacheDir: string): Plugin {
  /** 两类名字都覆盖：请求名（dev-sw.js）与落盘名（sw.js / workbox-*.js / suppress-warnings.js） */
  const GUARDED = /^(sw\.js|dev-sw\.js|workbox-[\w-]+\.js|suppress-warnings\.js)$/
  /** 请求名 → 落盘名（`/dev-sw.js` 对应 `sw.js`，其余同名） */
  const diskNameOf = (requestName: string) => (requestName === 'dev-sw.js' ? 'sw.js' : requestName)

  /** 把 tempDir 里所有受护文件各拷一份到持久快照目录（跨进程/热重启都留存） */
  const rememberAll = () => {
    try {
      mkdirSync(cacheDir, { recursive: true })
      for (const name of readdirSync(tempDir)) {
        if (GUARDED.test(name)) writeFileSync(resolve(cacheDir, name), readFileSync(resolve(tempDir, name)))
      }
    } catch {
      /* dev-dist 还不存在 / 读不到：等首次请求生成后再记 */
    }
  }

  /** 用持久快照回填一个文件；快照里也没有就返回 false */
  const restore = (diskName: string) => {
    try {
      const buf = readFileSync(resolve(cacheDir, diskName))
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(resolve(tempDir, diskName), buf)
      return true
    } catch {
      return false
    }
  }

  return {
    name: 'zbt:dev-sw-guard',
    apply: 'serve',
    configureServer(server) {
      // 启动时先把上一次进程留下的文件记下来（热重启后快照目录仍在，可覆盖空 dev-dist）
      rememberAll()
      server.middlewares.use(
        (req: Connect.IncomingMessage, _res: ServerResponse, next: Connect.NextFunction) => {
          if (req.method !== 'GET') return next()
          const name = basename((req.url ?? '').split('?')[0])
          if (!GUARDED.test(name)) return next()
          const disk = diskNameOf(name)
          if (existsSync(resolve(tempDir, disk))) {
            rememberAll()
          } else if (!restore(disk)) {
            // 本进程首见且无快照：放行让插件生成（发生在这条请求内），稍后补拍。
            // 定时器错峰两次：首次生成（workbox 全量）可能慢于第一个定时器，
            // 只拍一次可能拍到"文件还没写全"的中间态
            setTimeout(rememberAll, 2000)
            setTimeout(rememberAll, 8000)
          }
          next()
        },
      )
    },
  }
}

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
    // dev SW 自愈守卫：必须排在 Vite 内部中间件能接手之前（见函数头注释）
    devSwGuard(devDistDir, devSwCacheDir),
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
        // 同样改到仓库外，项目目录只留提交文件。
        // ⚠️ 该目录是**运行中 dev server 的活文件**：插件自身删了不重建（见 devSwGuard 注释），
        // 守卫负责自愈；清理工作区时不必绕开它，但删后请刷新一次页面让守卫回填。
        resolveTempFolder: () => devDistDir,
      },
      manifest: {
        name: '知白台',
        short_name: '知白台',
        description: '知白台 — 知其白，守其黑 · 个人效率系统',
        lang: 'zh-CN',
        // 侧栏＝安装后的标题栏/状态栏色，浅色黛蓝 / 深色绛红（tokens.css 的 --sidebar）。
        // manifest 只接受**一个**值，故取**品牌默认主题（浅色）**的取值 = 黛蓝 #2e5a8c；
        // 运行时由 <meta name="theme-color"> 覆盖它（index.html 预判脚本 + ThemeApplier），
        // 所以切到深色后 Android 状态栏照样会变绛红 —— 单一事实源见 src/app/theme.ts。
        theme_color: '#2e5a8c',
        /**
         * **品牌启动底色 = 纯白 #ffffff**（2026-10-01 用户拍板：**全面移除纸白 #F3EDE0**）。
         *
         * 这一行决定 Android **系统启动图（splash）**的底色：系统 splash = 本底色 + `icons[]`。
         * 此前取 #000000（旧默认主题是深色），于是用户冷启动看到的是
         * 「黑屏 → 一张图标 → 我们的启动屏」三段割裂。
         *
         * 现在底色与 `index.html` 的启动屏同色（都是纯白），图标是**与启动屏同一个太极**
         * （纯白底 + 黛蓝太极），于是 系统 splash → 启动屏 → 入台 → 工作台 是**同一段视觉**。
         *
         * ⚠️ manifest 只接受**一个**值（平台限制）：深色主题用户冷启动会看到一瞬纯白。
         * 这是刻意的取舍 —— 按 §十九，浅色是品牌默认体验。
         */
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
        // `pet/**` 显式排除：桌宠素材（106 个 animated WebP，保真档合计约 55MB）
        // **绝不能进预缓存** —— 否则每次版本升级整包重拉，且未开桌宠的用户也白付流量。
        // 现在 globPatterns 里没有 webp，但这条是"防回归"：将来有人加了 webp 也不会误收。
        globIgnores: ['sw-notify.js', 'pet/**'],
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
          {
            // 桌宠素材：按需逐段加载 + CacheFirst。
            // 单个约 521KB，故给足 maxEntries（106 个全量）与一年有效期：
            // 只有开启桌宠、且真播到某个动作时才会拉那一张，离线后复用缓存。
            urlPattern: /\/pet\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pet-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
