/**
 * 同步 · **代码层双设备往返**（Step 5-1 · D1 / D2 / D5）
 *
 * ## 这个测试到底测了什么（先说清，别当成"真机验证"）
 * 它**真的**跑了：`runSync()` 的完整编排 —— 设置守卫 → `exportData()` 导出 32 张业务表 →
 * PBKDF2 + AES-GCM 加密 → GitHub Git Data API 协议（blobs/trees/commits/refs，
 * 由本文件用内存假服务仿真）→ 拉取 → 解密 → LWW 合并 → 写回 Dexie →
 * 重放墓碑 → `reloadAllStores()` 回灌内存 → 同步元信息推进。
 *
 * 它**没有**跑的：真实 GitHub 网络（无凭据；用户明确要求不得索取 Token），
 * 以及真实手机 ↔ 浏览器两个物理设备。
 *
 * ⚠️ 因此本项的正式结论是 **NOT_RUNTIME_VERIFIED（真实设备往返未验证）** ——
 * 代码层往返全绿 ≠ 真机验证过。真机那一步要走设置页、用你自己的私有仓库做，
 * 我不代做、也不假装做过。
 *
 * ## 为什么值得这么写
 * `github-sync.test.ts` 覆盖的是 provider 的 HTTP 协议细节，
 * 但"**A 改的东西 B 能看到、B 删的东西 A 不会复活**"这条**数据收敛**没有端到端覆盖。
 * 而这恰恰是同步最容易出问题、又最难靠手点发现的部分（要两台设备 + 一个加密口令）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'
import { createId } from '../utils/id'

/* ------------------------------------------------------------------ *
 * 假的 GitHub：仿真 provider 用到的那几个 Git Data API 端点
 * ------------------------------------------------------------------ */

interface FakeRepo {
  blobs: Map<string, string>
  trees: Map<string, unknown>
  commits: Map<string, string>
  ref: string | null
}

function createFakeGitHub() {
  const repo: FakeRepo = { blobs: new Map(), trees: new Map(), commits: new Map(), ref: null }
  let seq = 0
  const sha = () => `sha${++seq}`

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const impl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input)
    const method = (init.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/git/, '').replace(/^\/repos\/[^/]+\/[^/]+/, '')

    if (method === 'GET' && /^\/ref\/heads\//.test(path)) {
      if (!repo.ref) return json({ message: 'Not Found' }, 404)
      return json({ object: { sha: repo.ref } })
    }
    if (method === 'GET' && path.startsWith('/commits/')) {
      const tree = repo.commits.get(path.slice('/commits/'.length))
      return tree ? json({ tree: { sha: tree } }) : json({ message: 'Not Found' }, 404)
    }
    if (method === 'GET' && path.startsWith('/trees/')) {
      const shaKey = path.slice('/trees/'.length).split('?')[0]
      const tree = repo.trees.get(shaKey)
      return tree ? json({ tree }) : json({ message: 'Not Found' }, 404)
    }
    if (method === 'GET' && path.startsWith('/blobs/')) {
      const content = repo.blobs.get(path.slice('/blobs/'.length))
      return content === undefined
        ? json({ message: 'Not Found' }, 404)
        : json({ content, encoding: 'base64' })
    }
    if (method === 'POST' && path === '/blobs') {
      const id = sha()
      repo.blobs.set(id, (JSON.parse(String(init.body)) as { content: string }).content)
      return json({ sha: id })
    }
    if (method === 'POST' && path === '/trees') {
      const body = JSON.parse(String(init.body)) as { tree: unknown[] }
      const id = sha()
      // 只关心"快照文件那一项"，树的其余部分（base_tree）对本测试无意义
      repo.trees.set(id, body.tree)
      return json({ sha: id })
    }
    if (method === 'POST' && path === '/commits') {
      const body = JSON.parse(String(init.body)) as { tree: string }
      const id = sha()
      repo.commits.set(id, body.tree)
      return json({ sha: id })
    }
    if (method === 'POST' && path === '/refs') {
      const body = JSON.parse(String(init.body)) as { sha: string }
      repo.ref = body.sha
      return json({ ok: true })
    }
    if (method === 'PATCH' && path.startsWith('/refs/heads/')) {
      const body = JSON.parse(String(init.body)) as { sha: string }
      repo.ref = body.sha
      return json({ ok: true })
    }
    if (method === 'GET' && /^\/repos\//.test(url.pathname)) return json({ ok: true })
    return json({ message: `未仿真的端点 ${method} ${path}` }, 500)
  }

  return { repo, impl }
}

/* ------------------------------------------------------------------ *
 * 一台"设备" = 一次全新的模块图（测试环境里库名随机 → 天然是另一台设备）
 * ------------------------------------------------------------------ */

async function bootDevice(github: ReturnType<typeof createFakeGitHub>) {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(github.impl))
  const mod = {
    db: (await import('../db/db')).db,
    sync: await import('../sync/SyncService'),
    settings: (await import('../stores/useSettingsStore')).useSettingsStore,
    tasks: (await import('../stores/useTaskStore')).useTaskStore,
    notes: (await import('../stores/useNoteStore')).useNoteStore,
    finance: (await import('../stores/useFinanceStore')).useFinanceStore,
    courses: (await import('../stores/useStudyStore')).useCourseStore,
    plans: (await import('../stores/useCoursePlanStore')).useCoursePlanStore,
    personas: (await import('../stores/usePersonaStore')).usePersonaStore,
    memories: (await import('../stores/useMemoryStore')).useMemoryStore,
    collection: (await import('../stores/useCollectionStore')).useCollectionStore,
    projects: (await import('../stores/useProjectStore')).useProjectStore,
    reload: await import('../stores/reload'),
    settingsSync: await import('../services/settings-sync'),
  }
  // ⚠️ 必须显式启动"设置落盘订阅"（真实应用里由 Bootstrap 调 `initSyncedSettings()`）。
  // 少了这一步，白名单键永远不会被写进 appSettings 行 —— 第一版就漏了它，
  // 表现为"activePersonaId 没同步过去"，其实订阅根本没起。
  mod.settingsSync.initSyncedSettings()
  // ⚠️ 必须显式启动"设置落盘订阅"（真实应用里由 Bootstrap 调 `initSyncedSettings()`）。
  // 少了这一步，白名单键永远不会被写进 appSettings 行 —— 第一版就漏了它，
  // 表现为"activePersonaId 没同步过去"，其实订阅根本没起。
  mod.settingsSync.initSyncedSettings()
  // 同一份"同步目标 + 口令"，正是真实用户在每台设备上各填一次的东西
  mod.settings.getState().set({
    githubRepo: 'me/private-repo',
    githubBranch: 'main',
    githubToken: 'ghp_TOKEN_NOT_REAL',
    syncPassword: 'test-password-123',
    githubTokenEnc: false,
    syncPasswordEnc: false,
    autoSync: false,
  })
  return mod
}

type Device = Awaited<ReturnType<typeof bootDevice>>

/**
 * 测试数据一律用**过去**的时间（2026-09-01）。
 *
 * ⚠️ 这一条不是随手写的：第一版用了 `2026-09-29T00:00:00Z`，而跑测试时的"现在"是
 * `2026-09-28T18:2x UTC`（本地 09-29 凌晨）—— 于是"记录的 updatedAt"比"墓碑的 deletedAt"
 * 还晚，`applyTombstones` 据此判定成「删错了又改回来」，**主动撤销墓碑、把记录复活**。
 * 这恰好暴露了一个真实的设计边界：**设备时钟偏差会让删除被撤销**（见报告 P2）。
 * 测试数据用过去时间，才是"正常用户"的样子。
 */
const iso = (d: string) => `${d}T00:00:00.000Z`
const PAST = iso('2026-09-01')
/** 编辑用"现在"（真实时钟），保证晚于 PAST、又不落在未来 */
const justNow = () => new Date().toISOString()

/** 在一台设备上写入 D2 要求的 9 类数据并设定 activePersonaId */
async function seedEverything(d: Device, tag: string) {
  const now = PAST
  await d.tasks.getState().add({
    id: `task-${tag}`,
    title: `待办 ${tag}`,
    description: '',
    done: false,
    priority: 'mid',
    dueDate: '2026-10-01',
    tags: [],
    repeat: 'none',
    projectId: null,
    courseId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  } as never)
  await d.notes.getState().add({
    id: `note-${tag}`,
    kind: 'note',
    title: `笔记 ${tag}`,
    body: '正文',
    tags: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.finance.getState().add({
    id: `fin-${tag}`,
    kind: 'expense',
    amount: 12.5,
    category: '餐饮',
    date: '2026-09-29',
    isPurchase: false,
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.courses.getState().add({
    id: `course-${tag}`,
    name: `课程 ${tag}`,
    schedule: [{ weekday: 1, start: '08:00', end: '09:40' }],
    credit: 3,
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.plans.getState().save({
    id: `plan-${tag}`,
    kind: 'limited',
    title: `选课 ${tag}`,
    credit: 2,
    status: 'selected',
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.personas.getState().save({
    id: `persona-${tag}`,
    name: `人设 ${tag}`,
    selfClaim: '本鲸',
    userName: '主人',
    relationship: '',
    personality: '',
    speech: '',
    behavior: '',
    emotion: '',
    appearance: '',
    ability: '',
    hobby: '',
    habit: '',
    likes: '',
    ooc: '',
    forbidden: '',
    unknown: '',
    agentStyle: '',
    taskAttitude: '',
    toolBehavior: '',
    memoryBehavior: '',
    proactivity: '',
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.memories.getState().save({
    id: `mem-${tag}`,
    text: `记忆 ${tag}`,
    tags: ['饮食'],
    enabled: true,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.collection.getState().add({
    id: `col-${tag}`,
    type: '小说',
    title: `收藏 ${tag}`,
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  } as never)
  await d.projects.getState().add({
    id: `proj-${tag}`,
    name: `项目 ${tag}`,
    description: '',
    status: 'active',
    progress: 10,
    milestones: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  } as never)
  d.settings.getState().set({ activePersonaId: `persona-${tag}` })
}

async function countAll(d: Device): Promise<Record<string, number>> {
  return {
    tasks: await d.db.tasks.count(),
    notes: await d.db.notes.count(),
    finance: await d.db.financeRecords.count(),
    courses: await d.db.courses.count(),
    plans: await d.db.coursePlans.count(),
    personas: await d.db.personas.count(),
    memories: await d.db.memories.count(),
    collection: await d.db.collectionItems.count(),
    projects: await d.db.projects.count(),
  }
}

const ROWS_PER_TABLE = { tasks: 1, notes: 1, finance: 1, courses: 1, plans: 1, personas: 1, memories: 1, collection: 1, projects: 1 }

beforeEach(async () => {
  await Dexie.delete('yishu-workbench')
})

describe('设备 A 推送 → 设备 B 首拉恢复（D1 / D2）', () => {
  it('A 写入 9 类数据 → sync → B 首拉 → 数据齐全，且 activePersonaId 也跟过去', async () => {
    const github = createFakeGitHub()

    // ── 设备 A ──
    const a = await bootDevice(github)
    await seedEverything(a, 'a')
    /**
     * 把白名单设置**确定性地**落一次盘。
     *
     * 生产里它由 800ms 去抖触发（且 `scheduleWrite` 有 `window` 守卫，node 环境不会跑），
     * 所以这里直接走 `__flushSyncedSettingsForTest()` —— 同一条 `writeNow()`，
     * 只是不必等时间、也不依赖浏览器全局。这样测的才是"设置到底进没进快照"。
     */
    await a.settingsSync.__flushSyncedSettingsForTest()
    const settingsRow = await a.db.appSettings.get('settings')
    expect((settingsRow?.data as { activePersonaId?: string } | undefined)?.activePersonaId).toBe('persona-a')

    const r1 = await a.sync.runSync()
    expect(r1.ok).toBe(true)
    // 首次同步：远端还不存在 → 建根提交
    expect(github.repo.ref).toBeTruthy()

    // ── 设备 B（全新空库）──
    const b = await bootDevice(github)
    expect(await b.db.tasks.count()).toBe(0)
    const r2 = await b.sync.runSync()
    expect(r2.ok).toBe(true)
    expect(await countAll(b)).toEqual(ROWS_PER_TABLE)

    // 内容也对（不只是"有条数"）
    await b.reload.reloadAllStores()
    expect(b.tasks.getState().items[0].title).toBe('待办 a')
    expect(b.personas.getState().items[0].name).toBe('人设 a')
    expect(b.memories.getState().items[0].text).toBe('记忆 a')
    // 设置白名单里的 activePersonaId 必须跟着人设一起过来
    expect(b.settings.getState().activePersonaId).toBe('persona-a')
  })

  it('B 改动与删除能推回并让**第三台设备**收敛（含墓碑，D2 的删除一行）', async () => {
    const github = createFakeGitHub()

    const a = await bootDevice(github)
    await seedEverything(a, 'a')
    await a.sync.runSync()

    // ── 设备 B：拉下来 → 改一条 → 加一条 → 删一条（走真墓碑）──
    const b = await bootDevice(github)
    await b.sync.runSync()
    await b.reload.reloadAllStores()
    const taskId = b.tasks.getState().items[0].id
    await b.tasks.getState().update(taskId, { title: '待办 a（B 改过）', updatedAt: justNow() })
    await b.notes.getState().add({
      id: 'note-b2',
      kind: 'note',
      title: '笔记（B 新增）',
      body: '',
      tags: [],
      pinned: false,
      createdAt: justNow(),
      updatedAt: justNow(),
    } as never)
    await b.collection.getState().remove(b.collection.getState().items[0].id)
    await b.settingsSync.__flushSyncedSettingsForTest()
    const r3 = await b.sync.runSync()
    expect(r3.ok).toBe(true)
    expect(await b.db.tombstones.count()).toBeGreaterThan(0)

    // ── 设备 C：全新拉取，应当看到 B 的改动与删除 ──
    const c = await bootDevice(github)
    await c.sync.runSync()
    await c.reload.reloadAllStores()
    expect(c.tasks.getState().items[0].title).toBe('待办 a（B 改过）')
    expect(c.notes.getState().items.map((n) => n.title)).toContain('笔记（B 新增）')
    // B 删掉的收藏**不该被远端快照复活**
    expect(c.collection.getState().items).toHaveLength(0)
  })

  it('并发/竞争：他端刚推过导致 ref 非快进 → 自动重跑一次收敛（不无限重试）', async () => {
    const github = createFakeGitHub()
    const a = await bootDevice(github)
    await seedEverything(a, 'a')
    await a.sync.runSync()

    const b = await bootDevice(github)
    await b.sync.runSync()
    await b.reload.reloadAllStores()

    // 让 B 第一次 PATCH 撞 422，第二次放行 —— 仿真"设备 A 刚好也推了一次"
    const original = github.impl
    let firstPatch = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'PATCH' && firstPatch) {
          firstPatch = false
          return new Response(JSON.stringify({ message: 'Update is not a fast forward' }), { status: 422 })
        }
        return original(input as string, init)
      }),
    )

    await b.tasks.getState().update(b.tasks.getState().items[0].id, { title: '待办 a（B 再改）', updatedAt: justNow() })
    const res = await b.sync.runSync()

    expect(res.ok).toBe(true)
    expect(firstPatch).toBe(false) // 确实撞过一次
    const c = await bootDevice(github)
    await c.sync.runSync()
    await c.reload.reloadAllStores()
    expect(c.tasks.getState().items[0].title).toBe('待办 a（B 再改）')
  })

  it('快照 schemaVersion 不兼容时**明确报错**，不当成"远端为空"去覆盖', async () => {
    const github = createFakeGitHub()
    const a = await bootDevice(github)
    await seedEverything(a, 'a')
    await a.sync.runSync()

    // 手工把远端快照换成 v1
    const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    const snapshotSha = [...github.repo.blobs.entries()].find(([, content]) =>
      decode(content).includes('schemaVersion'),
    )
    expect(snapshotSha).toBeTruthy()
    const old = JSON.parse(decode(snapshotSha![1])) as Record<string, unknown>
    github.repo.blobs.set(snapshotSha![0], btoa(JSON.stringify({ ...old, schemaVersion: 1 })))

    const c = await bootDevice(github)
    await expect(c.sync.runSync()).rejects.toThrow(/版本不兼容/)
    // 本地数据没有被清空、也没有被当成"远端为空"覆盖
    expect(await c.db.tasks.count()).toBe(0)
    void createId
  })
})
