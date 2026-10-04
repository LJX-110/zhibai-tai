# AGENTS.md — 知白台 项目约定

本文件是给 AI 与协作者的**速查**（最容易踩的坑与硬红线）。完整规范各见其文：

- `../docs/编码规范.md` —— 分层 / 命名 / 样式 / 文件规模 / 提交自检清单
- `../docs/方案与实现.md` —— **§1 是"还剩什么"的唯一状态源**；§2 天机 · §3 桌宠 · §4 通知 · §5 情报
- `../docs/Step5-2C-产品标准.md` —— **"新功能对齐老功能"的唯一依据**
- `../docs/Step5-3-设计规范.md` —— 令牌选用（什么时候用哪个）+ Microcopy 纪律

冲突时以 `编码规范.md` 为准，并回头同步本文件。

## 定位与技术栈

本地优先（Local-first）的个人效率系统，纯前端 PWA，无后端、无账号；数据存 IndexedDB，
多设备靠 GitHub 仓库加密快照同步。**手机是第一产品形态**；桌面只保证"能打开、不崩、布局正常"，
**不做桌面 App**（Tauri / Electron / Windows 桌宠已决：不做）。

- React 19 + TS（`verbatimModuleSyntax`，类型必须 `import type`）· Vite 8 · Tailwind 4
- Zustand + Dexie **v15**（**32 张业务表**，清单在 `src/db/tables.ts`）
- 运行时依赖刻意只有 6 个（clsx / dexie / lucide-react / react / react-dom / zustand）→ 新需求先用现有的解
- 测试 Vitest（node + fake-indexeddb）· Lint oxlint · PWA vite-plugin-pwa

## 数据流（单向，不许反向）

```
pages → components → stores(Zustand) → repositories(Dexie) → services
```

- `types/entities.ts` = 领域实体**单一事实源**；`db/tables.ts` = 表清单**单一事实源**（同步/备份/清空共用）
- `repositories/repo.ts` = CRUD 工厂：**删除写墓碑、写入补时间戳**（LWW 合并依据）
- `sync/` = 解密远端 → LWW 合并 + 冲突检测 → 写回 → 重放墓碑 → 加密推送

## 硬性约定（违反会被规则或 CI 拦下）

1. 业务实体必须有 `updatedAt`/`createdAt`（缺了会导致跨设备合并丢修改，曾有 P0）；新表**必须**在 `db/tables.ts` 注册。
2. **删除走墓碑**（`tombstones`），不物理清而不留痕。
3. **业务数据一律经 store 工厂落库**（add/save/saveMany/update）；禁 `store.setState({ items })` 直改内存 —— 不落库刷新即丢、不触发同步。
4. **zustand v5 selector 禁 `.filter()/.map()`** 等生成新引用（`useSyncExternalStore` 判定快照永变 → 无限重渲染，曾有真实崩溃）；派生数据在组件体内算。
5. **兜底必须留痕**：catch 静默返回默认值 = 用户永远不知道出事 —— 报界面（`services/ai/health.ts` 三态）或记流水（`services/error-log.ts`，**写盘前 `redactSecrets` 脱敏**）。
6. **凡有列表必须能给出口**（走 `repo.remove`，自动写墓碑）；**会持续增长的表必须设保留上限**（`services/intelligence/retention.ts`：先写墓碑再删，否则远端快照会加回）。
7. 组件与非组件分文件；单文件 ≤ **400 行**；注释写"为什么"；不携带 `P0-B`、`v0.x` 等内部版本代号。
8. **改动前先备份原文件到 `备份/YYYY-MM-DD_<主题>/`**；不自建 AGENTS 外文档。
9. **"一处修了、别处漏了"是最高频复发形态** → 能做成机器可查的就做成规则：`npm run check:rules` 现为 5 条 —— 单文件 ≤400 行 / `@layer` 内 CSS / 圆角字号魔法值 / **取课点必须走 `activeSlotsOfDay`** / 死导出。
   ⚠️ 规则 5 有漏报（同名局部定义会给死导出"续命"）→ 查死代码**必须排除 `__tests__`**；重复实现要人工扫。
10. **要"跨设备一致"的必须是业务表**，不放设置项；时间统一走 `utils/id`（`nowISO`/`todayISO`/`formatHM`），`Date.now()` 不进组件/hook 的渲染体。

## 移动端优先

1. 页内页签 ≤ **4 个**（超出的收进页内子视图，功能不删）；首屏必须能看到当前核心操作，低频项折叠。
2. 横向滚动必须用 `components/ui/ScrollRow`（右缘 mask + 选中自动居中）；**禁裸 `overflow-x-auto`**。
3. `Section.hint` / `EmptyState.step` 移动端自动隐藏；新增说明小字优先 `hidden md:inline`。
4. 长列表必须增量渲染（情报流 40 条/页 + 「加载更多」）。
5. 触控：`touch-target` = 44px 且**会真改布局 → 禁机械全员 44px**；正解是"≥2 个操作收进 `RowActions`"。

## 常用命令（在项目根目录 `知白台/` 执行）

```bash
npm run dev / typecheck / lint / test / build / preview
npm run check:rules        # 规则 1–5（不参与 CI）
python ../scripts/subset_fonts.py            # 书法字体子集化（改字符集后重跑；完整字体与 OFL 见 src/assets/fonts/）
python ../scripts/subset_seal_font.py <源.ttf>   # 印章篆书子集化（改印文用字后重跑）
python ../scripts/check_seal_glyphs.py       # 校验印文用字在篆书字体里有字形（漏 = 印章静默空白）
python ../scripts/generate_maskable_icon.py  # 生成 PWA/iOS 图标（改过 favicon 视觉后重跑）
node ../scripts/pet-assets-audit.mjs         # 桌宠素材审计（引用 / reserve / 未归类）
node ../scripts/proxy-security-test.mjs      # 代理安全回归（ALLOWED_HOSTS / 不代传凭据）
# 以下三个探针需先起 preview（4173）：theme-boot-probe / ai-cors-probe / mobile-acceptance
```

> ⚠️ `scripts/` 与 `docs/` **不入库**，在 `work/` 区（见 `work/目录约定.md`）。

## 模块备忘（改前必读）

### 通用 / UI

- **版本号唯一来源 `package.json`**（构建注入 `__APP_VERSION__`，应用内读 `src/app/version.ts`）；构建产物：CI 落仓库内 `dist/`，本地落 `work/dist`（分环境 outDir，**别删 CI 分支**）。
- **层级只用 `styles/tokens.css` 的 `--z-*` 令牌**（八层，禁写死 `z-50`）；**弹层背景滚动锁在 `ui/overlay.ts`（计数式）**。
- **列表操作按钮用 `.hover-reveal`，其祖先必须带 `group`**（触屏无 hover；禁写 `opacity-0 group-hover:opacity-100`）。
- **金额唯一实现** `utils/money.ts` 的 `money(n)`；**动画只动 `transform`/`opacity`**（尊重 `prefers-reduced-motion`；禁补间 width/height）。
- 筛选药丸只有一种形制（`components/ui/Chip`）；`Section.title` 嵌在折叠层里时**可省略**。
- **删除能力要留出口**（Inspector 详情面板 / 行内 `.hover-reveal` / 「系统 · 数据」的清理入口）。

### 修行 / 课程

- ⚠️ **「境界」`realmOf(累计功行)`（只升不降）与「今日炁象」`cultivationGrade(今日)`（当天快照、只喂首页罗盘）是两回事**，混成一个数就会出现"今天没记录、境界白修"；`settleDaily` 同一天只补差额。
- **"今天上哪些课"唯一取法**：`activeSlotsOfDay(courses, weekday, currentWeek(termStartDate))`（`services/study.ts`，按 `slotOnWeek` 过滤周次/单双周）。**禁手写 `schedule.filter(weekday)`**（首页曾因此显示这周本来不上的课）；`classReminders` 有**两处取课点，两处都要传**停课与调课。
- **固定任务三式形制一致**：daily / weekly（`weeklyDay` **0=周日**）/ monthly（`monthlyDay` 1-31），判定收口 `utils/id.ts` 的 `isFixedSchedule` / `fixedDoneThisPeriod`；**一律走 `effectiveDone`，禁读裸 `done`**；**身份是 `seriesId` 不是标题**；提醒看"今天到不到期"，清单看"本期做没做"。
- 选课规划口径 `planProgress`：只数 `status === 'selected'`；**`remaining = max(goal - selected, 0)`（超额不倒扣）**；`CoursePlan` 与 `Course` **刻意互不依赖**；行内状态一律圆形印章（`STATUS_SEAL`：选/候/否）；出勤与成绩**无可信数据源，如实不做**。
- **学期首周入口必须常驻可点**（`StudyPage` 操作行「首周」；`termStartDate` 恒空 → `currentWeek()` null → 单双周过滤整体失效）。
- **所有"到点提醒"由 `components/notification/ReminderEngine` 统一调度**（判定在 `services/reminders.ts` 纯函数，按「键+期间」认领在 `reminder-claims.ts`）；`NotificationGate` 只留事件驱动三类（关注更新/同步失败/同步冲突），**不要在别处另起一套提醒判定**。

### 天机（AI）

- **板块能力走插件注册表**（`components/ai/plugins/index.ts`）：注册顺序 = 明细区注入顺序；四条红线：**插件之间不得互相 import / 插件不直接写库 / 工具必须只读 / 不注册空壳**。
- **是小 Agent Loop，不是一次性问答**（`services/agent/loop.ts`，`MAX_ITERATIONS = 8`，文本 JSON 协议；结束原因必须让用户看见）；**高风险写入永不作为工具**（金额/删除/批量 → 只走确认卡片）；**加工具只改归属插件**。
- **人设与记忆是数据不是提示词**（`personas` / `memories` 两张业务表）：人设经 `buildAgentSystemPrompt(persona, memories)` 进**每轮**；**UNKNOWN 字段不得当作事实**；记忆只在用户明确保存时写入；`activePersonaId` 进同步白名单。
- **AI Key 不进同步**（只 AES-GCM 加密存本地）；聊天记录 / streaming / loading 等 UI 状态一律不同步。
- **输出已全部流式**：自由问答与能力卡共用 `stream-assembly` + `stream-sink`（预览与落库同源；动作 JSON 收齐后才解析）；⚠️ `withStreamSink` 是模块级状态，**无 busy 守卫不得并发**。
- **AI 端点必须能浏览器直连**（纯前端没有转发）：DeepSeek / Kimi / **Agnes**（5-4B 复测 `ACAO: *`）可直连；**NVIDIA 不返回任何 `Access-Control-*`，必失败**（预设置灰并在界面写明原因）；模型列表/连通性走 Provider 可选接口（`listModels`/`testConnection`，`/models` 10s 探测 + 超时/网络失败回退一次极短补全，401/403/429/5xx 原样抛）——**别把 `fetch('/models')` 写回设置页组件**。

### 桌宠

- **不许碰业务层**：核心（geometry / runtime / motion / state-machine / interaction / state）**只认数字与 `PetBounds`** —— 不读 `window`、不 import store、不写 Dexie；宿主差异走 `PetHost` 三档接口。
- **位置是设备级**（localStorage，**不进业务表、不触发同步**）；移动端必须扣顶/底栏（`data-pet-reserve-top/bottom` + `reserveInsets()`，保底 120px）。
- **尺寸只有一个真相**：`geometry.ts` 的 `effectiveSize`；⛔ **无重力、无惯性、无甩抛**（物理整套移除，别再引入）；**`ready`（落位完成）之前不做任何位置校正**（会抢先写坏本机存档）。
- **状态驱动优先于随机表演**：UI 只写 `services/agent/status.ts` 的 AgentStatus、桌宠只读；优先级 ERROR > WAITING > WORKING > THINKING > SUCCESS > FOCUSED > SLEEP > IDLE；随机动作链只在 idle；**漫游默认关**。
- 菜单只有一种形态（`PetMenu` 紧凑浮层，条目在 `menu-items.ts`）；弹层 z 必须高于 `--z-pet`(55) → 用 `--z-overlay`(60)。

### 通知 / 情报

- 通知四层（判定 → 去重 → 投递 → 触发）：**投递唯一出口 `services/notification.ts` 的 deliver**；**被静音 / 免打扰 ≠ 没发生**（照记历史，只不打扰）；周期性判据是"**计数变多**"；**Web Push 已废除**（应用关闭时提醒兜不住，如实记）。
- 情报抓取链路：**自建转发端点 → 直连**，**不做公共代理兜底**；代理逻辑单一事实源 `proxy/core.js`（三形态只是薄壳）；**首选 Netlify**（`*.workers.dev`/`*.vercel.app` 国内被污染）；**不得改回 RSSHub**；**禁止 AI 造假情报**。
- B 站走 `bilibili` provider，**WBI 签名在前端算**，代理只做纯转发（不代传 Authorization）。
- `intelligenceSources.lastFetchedAt / lastError` 是**本机字段**（导出剥离、写回保留，`sync/snapshot.ts` 的 `LOCAL_ONLY_FIELDS`）。

### 同步 / 安全

- ⚠️ **GitHub「空仓库」返回 409 不是 404**：判定"分支不存在"须**同时**识别 404 与「409 且消息含 empty」（`headRef()` 已处理）；写入侧自动建根提交 + 建分支。认 409 **必须校验消息含 empty**，否则真冲突会被误吞。
- **同步错误落界面前译人话**（`sync/github/errors.ts` 的 `describeGitHubError()`）；provider 内部仍用原文做分支判断 —— **两处用途不同，别合并**。
- GitHub 同步走 **Git Data API**（`sync/github/GithubSyncProvider.ts`，blob → tree → commit → ref）。竞争处理有两道：**读-写窗口 CAS**（写入前校验头仍是 `readSyncFile` 记住的那个，变了抛可重试错误 —— 否则本次提交会"快进成功"却静默缺掉他端改动）+ ref 非快进 422；`runSync` 对竞争类错误**最多 3 次尝试、退避 + 抖动**（2026-10-02）。
- **「待同步」标记持久化**（`sync/auto.ts`，`localStorage['zbt:sync-dirty:v1']`）：刷新不再丢；启动 / 回前台 / 网络恢复时若仍有积压会自动补推。
- 同步请求 30s 超时；快照带 `schemaVersion` 校验；冲突记录留本地可查；墓碑随快照传播。
- 推送到 GitHub 需代理（本机）：`$env:HTTPS_PROXY="http://127.0.0.1:7890"` **仅一次会话，不留持久 git 配置**（git 不读 Windows 系统代理）。

### 分类 / 设置 / 印章 / 字体

- 分类是业务表（`categories`，5 个 scope：intel / collection / ai / ai_type / collection_medium）；**新增 scope 必须同改三处**：类型、`DEFAULT_CATEGORIES`、**`seedAllCategories` 里的调用**（漏最后一步 = 下拉空掉）；在 情 / 藏 页页签行尾「+」就地增删，**不要再往设置里加分类字段**。
- 偏好同步白名单 `services/settings-sync.ts` 的 `SYNCED_SETTING_KEYS`；主题 / 布局 / 底栏等设备级偏好**不入**。
- 单行表（偏好 / 桌宠 / 修行）走 `repositories/singleton.ts`：**读不到返回 null 绝不伪造行；建行由调用方给工厂**。
- **印章一律圆形符箓、禁方印**；小篆缺字经 `SEAL_GLYPH_MAP` 映射（选→選）；**加印文用字要同时改字体子集 + 映射表**（`check_seal_glyphs.py` 从三处来源反推）。
- **字体许可是再分发前提，别删**（`OFL-LICENSE.md` / `seal-LICENSE.txt` 随仓库与构建产物分发）；装饰字**只有马善政一款**；**页面字体子集只裁到 GB2312 一级**，别再往下裁。
- 移动端底栏**固定不可配置**（观/行/财/学 + 「更多」），别再添加配置入口。

## 部署

`.github/workflows/deploy.yml`：push 到 main 自动构建并发布 GitHub Pages（base 取仓库名，子路径部署）。
CI 顺序：`lint` → `test` → `build` —— **任一失败即拦截发布**（2026-10-04 起为发布门禁）；
`check:rules` 的脚本在仓库外 `work/scripts/`，无法上 CI，只能本地跑。