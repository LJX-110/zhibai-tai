/**
 * 同步标记 —— 「本地有改动、还没推送到远端」的唯一事实源
 *
 * 为什么不放在 `auto.ts` 里：清标记必须发生在**真正推送成功之后**，
 * 而推送在 `SyncService`；若两边互相 import 会形成环。
 *
 * 另一个原因是 2026-10-19 修的 bug：手动同步（设置页 / 顶栏 / 命令面板）
 * 直接调 `runSync()`，从来不清这个标记 —— 于是每次手动同步成功后，
 * 设置页仍显示「有改动待同步，本地已改动、尚未推送到远端」，看起来像永远没推上去。
 *
 * `revision` 解决的是并发窗口：同步开始后、推送完成前用户又改了数据，
 * 这次改动不在本次快照里，成功后就不能把标记清掉（否则要等下一次写入才补推）。
 * 判据是「同步开始时记下的 revision 是否还等于现在的」。
 */

const DIRTY_KEY = 'zbt:sync-dirty:v1'

/** 读本机持久化的待同步标记；localStorage 不可用（隐私模式 / 非浏览器）时退化为 false */
function readStoredDirty(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DIRTY_KEY) === '1'
  } catch {
    return false
  }
}

/** 持久化待同步标记；写不进去（隐私模式）就只保留本会话语义，不影响同步本身 */
function writeStoredDirty(v: boolean): void {
  try {
    localStorage.setItem(DIRTY_KEY, v ? '1' : '0')
  } catch {
    /* 忽略：退化为仅本会话有效 */
  }
}

let dirty = readStoredDirty()
/** 每次数据写入都加一 —— 给「同步窗口内又改了数据」当判据 */
let revision = 0
const dirtyListeners = new Set<() => void>()

function emitDirty(): void {
  for (const fn of dirtyListeners) fn()
}

/** 是否有本地改动待同步（配合 subscribeDirty + useSyncExternalStore 使用） */
export function isDirty(): boolean {
  return dirty
}

/** 订阅「待同步」标记变化；返回取消订阅函数 */
export function subscribeDirty(fn: () => void): () => void {
  dirtyListeners.add(fn)
  return () => {
    dirtyListeners.delete(fn)
  }
}

/** 当前写入版本号 —— 同步开始前记下，成功后拿它判断期间有没有新写入 */
export function currentSyncRevision(): number {
  return revision
}

/** 数据发生变更：置脏并推进版本号（由 `notifyDataChanged` 调用） */
export function markDirty(): void {
  revision += 1
  if (dirty) return
  dirty = true
  writeStoredDirty(true)
  emitDirty()
}

/**
 * 推送成功后由 SyncService 调用。
 *
 * 只有 `revisionAtStart` 仍是当前版本（说明同步读到、推送的快照包含全部本地改动）
 * 时才清标记；期间有新写入则返回 false，标记留给下一次同步。
 */
export function markSynced(revisionAtStart: number): boolean {
  if (revision !== revisionAtStart) return false
  if (!dirty) return true
  dirty = false
  writeStoredDirty(false)
  emitDirty()
  return true
}
