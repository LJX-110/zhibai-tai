# AGENTS.md — 知白台 项目约定

本文件供 AI 与协作者了解本项目约定，改动代码前请先阅读。

## 项目定位

本地优先（Local-first）的个人效率系统，纯前端 PWA，无后端、无账号。数据存于浏览器 IndexedDB，多设备靠 GitHub 仓库加密快照同步。

## 技术栈

- React 19 + TypeScript（`verbatimModuleSyntax`，须用 `import type` 导类型）
- Vite 8 + Tailwind CSS 4（CSS 变量设计令牌集中在 `src/styles/tokens.css`）
- Zustand（状态）+ Dexie（IndexedDB）+ 自研 SVG 图表（见 `src/components/ui/Ring.tsx`，无重量级图表库）
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

> **完整规范见 `../docs/编码规范.md`** —— 分层铁律 / 目录结构标准 / 命名 / 样式边界 / 文件规模 / 提交自检清单都在那里。
> **方案与进度见 `../docs/方案与实现.md`** —— **"还剩什么没做"只看它 §1（状态源）**；
> 天机（§2）/ 桌宠（§3）/ 通知与提醒（§4）/ 情报抓取（§5）四套方案也都在那一份里。
> 本节只列**最容易踩的坑**；两者冲突时以 `../docs/编码规范.md` 为准，并回头同步本节。

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

> ⚠️ `scripts/` 与 `docs/` **不入库**，放在本机 `work/` 区（约定见 `work/目录约定.md`）。
> 下面命令里的 `../scripts/...` 均需在**项目根目录**下执行。

```bash
npm run dev        # 本地开发
npm run typecheck  # 类型检查
npm run lint       # oxlint
npm test           # vitest 全量测试
npm run build      # 生产构建（本地产物写 work/dist，CI 写仓库内 dist/；见 vite.config.ts 的分环境 outDir）
npm run check:rules # 规范自检：单文件 ≤400 行 · @layer 外 CSS 规则 · 圆角/字号魔法值（不参与 CI）
python ../scripts/subset_fonts.py  # 书法字体子集化（改字符集后重跑；完整字体在 src/assets/fonts/full/，来源与 OFL 许可声明见 src/assets/fonts/OFL-LICENSE.md）
python ../scripts/subset_seal_font.py <源字体.ttf>  # 印章篆书子集化（改印文用字后重跑，源字体见 assets/fonts/seal-LICENSE.txt）
python ../scripts/check_seal_glyphs.py  # 校验印文用字在篆书字体里都有字形（缺字会让印章静默显示空白）
node ../scripts/probe_proxy.mjs    # 不部署即跑通代理转发链路（真实请求 api.bilibili.com，需外网，人工排查用）
node ../scripts/probe_bili_e2e.mjs  # 验证 B 站链路（前端 WBI 签名 + api.bilibili.com 真实接口）端到端可用，需外网，人工排查用
python ../scripts/generate_maskable_icon.py  # 生成 PWA/iOS 图标（public/icon-maskable.png、icon-180.png），改过 favicon 视觉后重跑
```

## 模块备忘

- 导航与 URL hash 双向同步在 `stores/useAppStore.ts`（深链接 `#/finance` 等）
- **字体许可是再分发前提，别删**：`src/assets/fonts/` 的书法字体（Ma Shan Zheng）是
  SIL OFL 1.1，来源与条款见同目录 `OFL-LICENSE.md`；印章小篆是政府资料开放授权，
  见 `seal-LICENSE.txt`。OFL 要求随字体一并保留该声明，两个文件都必须随仓库提交 /
  随构建产物分发，改字体（含重新子集化）时一并更新说明
  - 装饰字**只有马善政一款**：站酷小薇已于 2026-09-20 移除（字形集合与之完全相同、
    且在字体栈里排在后面，结构性不可达，白占 929KB）。**别再把它加回来**。
  - 页面字体子集**只裁到 GB2312 一级**，不要再往下裁 —— `--font-deco` 也作用在用户
    自己写的笔记/收藏标题上。
- **移动端底栏固定不可配置**：`app/navigation.ts` 的 `DEFAULT_MOBILE_TABS` 写死为「观 / 行 / 财 / 学」4 格
  + 1 个固定「更多」（修 / 藏 / 情 / 奇 / 术 / 系统全收进「更多」抽屉）。代码注释明确「不再可配置」，
  没有 `normalizeMobileTabs`，也没有「系统 · 外观 · 移动端底栏」配置入口
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
- ⚠️ **GitHub「空仓库」返回 409，不是 404**：对还没有任何提交的仓库读取 refs，
  GitHub 返回 **409「Git Repository is empty」**。判定"分支不存在"必须**同时**识别
  404 与「409 且消息含 empty」（`GithubSyncProvider.headRef()` 已处理）。
  写入侧在空仓库时会自动建根提交 + `POST /git/refs` 创建分支，**首次同步无需手动建 README**。
  ⚠️ 认 409 时**必须校验消息含 empty**，否则会把真正的 409 冲突误吞成"空仓库"。
- **同步错误在落界面前要译成人话**：provider 抛的是 GitHub 原文（给开发者看的），
  经 `sync/github/errors.ts` 的 `describeGitHubError()` 转成「该干什么」后再写进 `syncError`。
  provider 内部仍用原文做 404/409/422 分支判断 —— **两处用途不同，别合并**。
- GitHub 同步走 Git Data API（`sync/github/GithubSyncProvider.ts`），ref fast-forward 冲突自动重跑
- **`intelligenceSources.lastFetchedAt / lastError` 是本机字段**：导出快照时剥离、
  写回时保留本机值（`SyncService.LOCAL_ONLY_FIELDS`），否则两台设备会互相覆盖
- **"今天上哪些课"只有一个正确取法**：`activeSlotsOfDay(courses, weekday, currentWeek(termStartDate))`
  （`services/study.ts`）。它按 `slotOnWeek` 过滤 `weeks`（单双周 / 限定周次）。
  **禁止手写 `schedule.filter(s => s.weekday === 今天)`** —— 那会漏掉周次，
  首页「今日课程」曾因此长期显示这周本来不上的课（提醒链路早修了，首页漏了）。
  `npm run check:rules` 规则 4 已把这条做成机器可查。
- 课程表周次逻辑集中在 `services/study.ts`（当前周 / 单双周 / 时段冲突）。
  **所有"到点提醒"由 `components/notification/ReminderEngine` 统一调度**（判定在 `services/reminders.ts`
  的纯函数里，按「键 + 期间」认领见 `services/reminder-claims.ts`）；原 `components/study/ClassReminder`
  已删除，其"提前 15 分钟逐节提醒"并入引擎的 `class-ahead` 源。**不要在别处另起一套提醒判定**。
  `NotificationGate` 只留事件驱动三类（关注更新 / 同步失败 / 同步冲突）。
  **学期首周的设置入口必须常驻且可点**（`StudyPage` 操作行里的「首周」，靠日期 input 铺满 `label` 热区）——
  它此前是 `w-0 opacity-0` 的零宽度输入框（**没有热区、点了没反应**），且只在"未设置"时出现
  （设一次就永久消失，而承诺的"点周景改"并不存在）。后果是 `termStartDate` 恒空 →
  `currentWeek()` 返回 `null` → **单双周与周次过滤整体失效**。这是"输入框隐形入口"这类写法的反面教材
- **固定任务有三式，形制必须一致**：**每日**（`repeat: 'daily'`，无锚点字段）· **每周**（`weeklyDay`，
  **0=周日…6=周六**）· **每月**（`monthlyDay`，1-31）。统一判定收口在 `utils/id.ts` 的
  `isFixedSchedule` / `fixedDoneThisPeriod`。三式在编辑器条件渲染、行内徽标、待办页「每日/每周/每月固定」
  折叠区、顶部提醒上都要同一形制，改一处跟三处。
  ⚠️ **提醒看"今天到不到期"，清单看"本期做没做"** —— 两回事，别混（每月 27 号的事在今天只该在清单里，不该响）
- **单行表（偏好 / 桌宠 / 修行）走 `repositories/singleton.ts`**：统一持有两条语义 ——
  **读不到返回 null，绝不伪造行**（否则读一次就凭空多一条待同步记录）、
  **建行由调用方给工厂**（业务默认值不在仓储里猜）。别再各写一份 read/write。
- ⚠️ **「修行境界」与「今日炁象」是两回事，别混**：
  · **境界** = `realmOf(累计功行)`（`services/merit.ts`）：功行逐日累加、**只升不降**，是"等级"；
  · **今日炁象** = `cultivationGrade(今日五维总分)`（`services/cultivation.ts`）：当天快照、明天重计，
    **只喂首页罗盘**，绝不参与境界判定。
  混成一个数就会出现"今天没记录、境界白修"。
  结算纯函数 `settleDaily` **同一天只补差额**（不是一天记一笔固定值），跨天才把当日计数落账。
- ⚠️ **分类体系（categories 表）共 5 个 scope**：`intel` / `collection` / `ai` / `ai_type` / `collection_medium`。
  **新增 scope 必须同时改三处**：`CategoryScope` 类型、`DEFAULT_CATEGORIES` 默认清单、
  **`seedAllCategories` 里的 `seedCategories('<scope>')` 调用**（漏最后一步 = 下拉空掉）。
  `collection_medium`（介质）与 `collection`（用途）**刻意不共用数据**：共用会出现两个同名下拉。
- **`npm run check:rules` 现为 5 条**：单文件 ≤400 行 / `@layer` 内 CSS / 圆角字号魔法值 /
  **取课点必须走 `activeSlotsOfDay`**（规则 4）/ **死导出**（规则 5，警示级）。
  规则 4 起因：首页曾手写 `schedule.filter(weekday)`，漏了单双周——提醒链路早修过，首页漏了半年。
  查死代码**必须排除 `__tests__`**：测试会给死代码"续命"，让它看起来仍被引用。
- **天机的板块能力走插件注册表**（`components/ai/plugins/*.ts`，`index.ts` 是注册表）：
  每个板块自带 `detail`（明细区）/ `capability`（一键能力）/ `actions`（AI 提议动作的落库）。
  **注册顺序 = 明细区注入顺序**（`overview, action, study, finance, collection, cultivate, intelligence`），
  改顺序 = 改上下文 = 可能改回答。三条红线：**插件之间不得互相 import**；
  **插件不直接写库**（走 store 工厂）；奇 / 术暂无内容，**不注册空壳**。
  `context.ts` 只留跨板块的基础概览 + 聚合，不含任何具体板块逻辑。
- **天机输出已全部流式**：自由问答与能力卡片共用同一个装配器（`services/ai/stream-assembly.ts`）
  与作用域 sink（`services/ai/stream-sink.ts`）。**预览与落库同源**，所以流式与非流式内容一致是构造出来的。
  动作 JSON 只在收齐后解析，**流式过程中绝不中途解析**。
  ⚠️ `withStreamSink` 是模块级状态，**不要在无 busy 守卫处并发两个带 sink 的调用**（增量会串流）
- **筛选药丸只有一种形制**：一律走 `components/ui/Chip`（`px-3 py-1.5 text-sm rounded-tile`，
  **不带计数徽标**）—— 项目中心 / 藏品 / 情报 / 记账 / 购买 / 设置页分组全部对齐它。
  另：`Section` 的 `title` **可省略**，嵌在折叠层里时外层已有标题，内层再写一遍就是同屏两行一样的字

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