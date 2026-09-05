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

## 常用命令

```bash
npm run dev        # 本地开发
npm run typecheck  # 类型检查
npm run lint       # oxlint
npm test           # vitest 全量测试
npm run build      # 构建产物到 dist/
```

## 部署

`.github/workflows/deploy.yml`：push 到 main 自动构建并发布 GitHub Pages，base 取仓库名（子路径部署）。