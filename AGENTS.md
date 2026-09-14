# AGENTS.md — 知白台 项目约定

本文件供 AI 与协作者了解本项目约定，改动代码前请先阅读。

## 项目定位

本地优先（Local-first）的个人效率系统，纯前端 PWA，无后端、无账号。数据存于浏览器 IndexedDB，多设备靠 GitHub 仓库加密快照同步。

## 技术栈

- React 19 + TypeScript（`verbatimModuleSyntax`，须用 `import type` 导类型）
- Vite 8 + Tailwind CSS 4（CSS 变量设计令牌集中在 `src/styles/tokens.css`）
- Zustand（状态）+ Dexie（IndexedDB）+ Zod（校验）+ Recharts（图表）
- 测试：Vitest（`node` 环境 + `fake-indexeddb`）；Lint：oxlint；PWA：vite-plugin-pwa

## 目录结构（数据流单向）

```
pages → components → stores(Zustand) → repositories(Dexie) → services
```

- `src/db/tables.ts` — 业务表清单，**单一事实源**（同步 / 备份导出 / 清空共用，禁止在别处另维护表清单）
- `src/types/entities.ts` — 全部领域实体的单一事实源（勿另建 schemas 副本）
- `src/repositories/repo.ts` — 通用 CRUD 工厂；业务表删除须写墓碑、写入自动补时间戳，为多设备 LWW 合并提供依据
- `src/sync/` — 同步编排：解密远端 → LWW 合并 + 冲突检测 → 写回 → 重放墓碑 → 加密推送

## 硬性约定

1. **业务实体必须有 `updatedAt`/`createdAt`**（缺时间戳将导致跨设备合并时修改丢失，曾有 P0 事故）。
2. **删除走墓碑**（`tombstones` 表），不要直接物理清业务记录而不写墓碑。
3. 新增参与同步/备份/清空的业务表时，**必须**在 `db/tables.ts` 注册。
4. 类型导入一律 `import type`；新代码保持 `noUnusedLocals` 严格无警告。
5. 注释写"为什么"，不写"是什么"；不携带 `P0-B`、`v0.x` 等内部版本代号。
6. 修改前先备份原文件到 `备份/` 目录；不自建 AGENTS 外文档。
7. **zustand v5 selector 纪律**：`useXStore((s) => ...)` 不得在 selector 里 `.filter()/.map()` 等
   生成新引用——底层 `useSyncExternalStore` 会判定快照永变导致无限重渲染
   （React error #185，曾有真实崩溃）。派生数据在组件体内计算。
8. **业务数据一律经 store 工厂（add/save/saveMany/update）落库**，禁止
   `store.setState({ items })` 直改内存——不落库刷新即丢、不触发自动同步
   （此前情报抓取三处同款 bug）。
9. **凡有列表，必须能给出口**：新增任何「只增不减」的实体或列表时，同步提供删除/清理入口
   （走 repo 的 `remove`，自动写墓碑）。曾经有 6 类实体只能加不能删：情报条目、占卜记录、
   AI 资源、身体指标、关注、日志。
10. **会持续自动增长的表必须设保留上限**。裁剪走 `services/intelligence/retention.ts` 的
    `pruneIntelligence`（模式对齐 `services/activity.ts`：先写墓碑再删，否则远端快照会加回）。
    抓取路径统一用 `saveFetchedItems` 落库 + 裁剪，三处调用点不要各写各的。

## 移动端优先约定（手机为主要场景）

1. **页内页签不超过 4 个**。超出的是「看不见的功能」——窄屏上横滚的页签等于藏起来。
   功能不删，收进页内子视图（例：「学」把课程管理收进课程表，6 个页签 → 4 个）。
2. **首屏必须能看到该页当前的核心操作**（记一笔 / 开始专注 / 起一卦），次要项折叠。
   分组内按使用频率分层，低频设置折叠进「更多」（例：系统页把音效/通知/清空数据折叠）。
3. **横向滚动必须可发现**：用 `components/ui/ScrollRow`（右缘 mask 渐隐 + 选中项自动居中），
   `Tabs` 已内置。裸 `overflow-x-auto` 用户不知道右边还有东西。
4. **信息密度**：`Section` 的 `hint`、`EmptyState` 的 `step` 已在移动端自动隐藏；
   新增的说明性小字优先用 `hidden md:inline` 只在桌面显示。
5. 长列表必须增量渲染（情报流按 40 条一页 + 「加载更多」），不要把几百条带图的行一次塞进 DOM。

## 常用命令

```bash
npm run dev        # 本地开发
npm run typecheck  # 类型检查
npm run lint       # oxlint
npm test           # vitest 全量测试
npm run build      # 构建产物到 dist/
python scripts/subset_fonts.py  # 书法字体子集化（改字符集后重跑；完整字体在 src/assets/fonts/full/）
node scripts/probe_proxy.mjs    # 不部署即跑通代理转发链路（真实请求 api.bilibili.com，需外网，人工排查用）
```

## 模块备忘

- 导航与 URL hash 双向同步在 `stores/useAppStore.ts`（深链接 `#/finance` 等）
- **移动端底栏可配置**：`app/navigation.ts` 的 `DEFAULT_MOBILE_TABS` + `normalizeMobileTabs`
  （4 个槽位 + 固定「更多」），配置界面在「系统 · 外观 · 移动端底栏」
- **分类是业务表**（`categories`，`scope: intel | collection`），不是设置项：
  在 `情` / `藏` 页页签行尾「+」就地增删，走 `stores/useCategoryStore` 的
  `addCategory/removeCategory/resetCategories`。**不要再往设置里加分类字段**，
  设置项只落浏览器本地，分类必须跨设备一致
- **偏好设置同步白名单**：`services/settings-sync.ts` 的 `SYNCED_SETTING_KEYS`
  写入 `appSettings` 单行表随快照同步；主题 / 布局 / 底栏排列等设备级偏好**不入**白名单
- 情报抓取链路：**自建转发端点 → 直连**。公共 CORS 代理在国内已全部不可用
  （allorigins / r.jina.ai / codetabs / thingproxy 超时，cors.lol / cors.eu.org 429），
  因此**不做公共代理兜底**：直连不行就快速失败并提示去配自建代理
  （`providers/proxy.ts` 的 `proxyCandidates` 同时试 `<base>/?url=` 与 `<base>/proxy?url=`）
- **代理逻辑单一事实源是 `proxy/core.js`（`handleProxy`）**，三种部署形态
  （`cloudflare-worker/worker.js` / `functions/[[path]].ts` / `netlify/functions/proxy.mjs`）
  只是几行薄壳，改行为只改 core。**首选 Netlify 形态**：`*.workers.dev` 与
  `*.vercel.app` 国内 DNS 被污染不可达，`*.netlify.app` / `*.pages.dev` 可达
- **B 站源走 `bilibili` provider，但 WBI 签名（`w_rid`）在前端算**，代理只做纯转发：
  前端拼出带签名的完整 `api.bilibili.com` URL 交给代理。代理侧不需要 md5，
  也没有 `/bili/*` 路由。**不可改回 RSSHub 路线** —— rsshub.app 国内不可达，
  公共代理同样不可达，整条链路必然失败
- GitHub 同步走 Git Data API（`sync/github/GithubSyncProvider.ts`），ref fast-forward 冲突自动重跑
- **`intelligenceSources.lastFetchedAt / lastError` 是本机字段**：导出快照时剥离、
  写回时保留本机值（`SyncService.LOCAL_ONLY_FIELDS`），否则两台设备会互相覆盖
- 课程表周次逻辑集中在 `services/study.ts`（当前周 / 单双周 / 时段冲突 / 上课提醒），
  上课提醒由 `components/study/ClassReminder` 全局挂载

## UI 约定（易踩的坑）

- **层级必须用 `styles/tokens.css` 的 `--z-*` 令牌**，不要各组件写死 `z-50`。
  移动底栏曾是 `z-[60]`，把 `z-50` 的 Sheet / Dialog 压在下半屏，弹层内容被底栏遮死
- **列表操作按钮用 `.hover-reveal`**（`index.css`）：用 `@media (hover: hover)` 守卫，
  触屏常显。**禁止写 `opacity-0 group-hover:opacity-100`** —— 触屏没有 hover 事件，
  按钮会永远不可见，用户会以为功能没做
- **版本号唯一来源是 `package.json`**：构建时由 vite 的 `define` 注入为 `__APP_VERSION__`，
  应用内统一从 `src/app/version.ts` 读取。此前页脚 / 导出备份 / package.json 三处各写一份且互相矛盾
- **删除能力要留出口**：`灵感/笔记/情报/占卜存档/AI 资源` 等条目的删除入口分别在
  Inspector 详情面板或列表行的 `.hover-reveal` 按钮上；情报另有「清理已读 / 清空情报」
  在「系统 · 数据 · 情报数据」

## 部署

`.github/workflows/deploy.yml`：push 到 main 自动构建并发布 GitHub Pages，base 取仓库名（子路径部署）。