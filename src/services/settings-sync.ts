/**
 * 偏好设置同步 —— 让「换了设备还要重设一遍」的那部分设置真正跨设备一致
 *
 * 背景：设置此前整体只落浏览器本地（zustand persist）。同步快照只覆盖业务表，
 * 于是一台设备上配好的自建代理、AI 模型、每日目标、番茄钟时长，
 * 换台设备全要重配 —— 分类不同步也是同一个根因。
 *
 * 做法：把「跨设备希望一致」的键写进业务表 appSettings（单行），
 * 随加密快照走 LWW 合并；主题 / 布局 / 底栏排列等设备级偏好留在本地。
 * 密钥与 Token 一律不在白名单内（它们各有独立的加密存储）。
 */
import { useSettingsStore, type SettingsState } from '../stores/useSettingsStore'
import { appSettingsRepo } from '../repositories/settings-repo'
import { notifyDataChanged } from '../sync/auto'
import { recordError } from './error-log'
// ⚠️ 这是**纯状态 store**（不导出组件），与 `stores/factory.ts` 引它是同一种用法：
// 服务层报错要让用户看见，而"弹提示"的唯一出口就是它。组件从 `../components/ui` 取。
import { useToastStore } from '../components/ui/toast-store'
import type { AppSettingsRow, SyncedSettings } from '../types/entities'

/** 参与同步的设置键（新增键请连同 SyncedSettings 一起补） */
const SYNCED_SETTING_KEYS = [
  'profileName',
  'waterGoalMl',
  'pomodoroFocusMin',
  'pomodoroBreakMin',
  'notifyEnabled',
  'soundEnabled',
  'soundVolume',
  'browserNotify',
  'intelAutoFetch',
  'intelFetchMinutes',
  'intelKeepLimit',
  'corsProxyUrl',
  'aiProvider',
  'aiBaseUrl',
  'aiModel',
  // 人设的**选择**跨设备（人设内容本体在 personas 业务表里，这里只同步"用哪一个"）
  'activePersonaId',
  'termStartDate',
] as const satisfies readonly (keyof SettingsState)[]

const ROW_ID = 'settings'
/**
 * 写库去抖窗口（ms）：音量滑杆这类连续变更不必每次都落一次盘。
 *
 * ⚠️ 它是**真实等待**，所以做成可注入（`__setWriteDebounceForTest`）：
 * 单测里有 4 个用例各等一次，900ms × 4 = 3.6 秒的真实耗时；
 * 全量并行跑时这段等待会被 CPU 竞争摊到十几秒，逼近 `testTimeout`
 * —— 这正是 Step 5-0 那次"偶发红"最可能的成因（vitest.config 的注释记了同一现象）。
 * 注入后等的是**同一段代码路径**（仍是 window.setTimeout 驱动的去抖），只是不必等真实时间。
 */
let writeDebounceMs = 800

/** 仅供测试下调去抖窗口。生产恒为 800ms。 */
export function __setWriteDebounceForTest(ms: number): void {
  writeDebounceMs = Math.max(0, ms)
}

/**
 * 仅供测试：**立刻**执行一次落盘（跳过去抖，也不受 `window` 守卫影响）。
 *
 * 为什么需要它：`scheduleWrite()` 第一行是 `if (typeof window === 'undefined') return`
 * （为 SSR / 非浏览器环境不排定时器）。而单元测试跑在 node 下 ——
 * 于是"白名单键真的写进 appSettings 了吗"这件事，靠等去抖是**测不到**的
 * （第一版双设备测试就因此误判成"activePersonaId 没同步过去"）。
 * 直接调用的仍是生产同一条 `writeNow()`，只是不必等时间、也不依赖浏览器全局。
 */
export async function __flushSyncedSettingsForTest(): Promise<void> {
  await writeNow()
}

let hydrating = false
let started = false
let timer: number | null = null

/**
 * 偏好设置落盘 / 读取失败的**唯一出口**（Step 5-1 · A2）。
 *
 * 上一版只 `console.warn` —— 存储满 / 隐私模式 / 配额受限时，用户改了目标学分、
 * 代理地址、模型名，以为存住了，其实下次打开就没了；故障流水里也查不到痕迹。
 * 现在三重留痕（控制台 + 故障流水 + 用户提示），且**共用同一个去重**：
 * `recordError` 对 5 秒窗口内的同一故障返回 `null`，
 * 于是"同一次故障只弹一次"是构造出来的，而不是靠各处自觉。
 *
 * ⚠️ 提示文案是**固定文本**，绝不拼接 `e.message` —— 那正是凭据可能混进界面的入口
 * （见 A3）。记录进流水的那条由 `recordError` 统一脱敏。
 */
function reportSettingsFailure(action: '写入' | '读取', e: unknown): void {
  console.warn(`[知白台] 偏好设置${action}失败`, e)
  const message = e instanceof Error ? e.message : String(e)
  const recorded = recordError({
    kind: 'rejection',
    message: `偏好设置${action}失败：${message}`,
    where: 'services/settings-sync',
  })
  if (!recorded) return // 5 秒内同一故障已提示过，不再重复打扰
  useToastStore.getState().push(
    action === '写入'
      ? '偏好设置没能存到本机 —— 可能是存储空间不足；可在「系统 · 数据」导出备份后清理'
      : '偏好设置读取失败 —— 已按默认值继续，你改过的设置下次打开可能丢失',
    'danger',
  )
}

type SyncedKey = (typeof SYNCED_SETTING_KEYS)[number]

function pick(state: SettingsState): SyncedSettings {
  const out: Partial<Record<SyncedKey, unknown>> = {}
  for (const key of SYNCED_SETTING_KEYS) {
    const value = state[key]
    if (value !== undefined) out[key] = value
  }
  return out as SyncedSettings
}

async function writeNow(): Promise<void> {
  try {
    const existing = await appSettingsRepo.get(ROW_ID)
    const now = new Date().toISOString()
    const row: AppSettingsRow = {
      id: ROW_ID,
      data: pick(useSettingsStore.getState()),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await appSettingsRepo.put(row)
    // 设置变化也要触发一次同步：否则改了目标/代理，别的设备要等下一次业务写入才拿到
    notifyDataChanged()
  } catch (e) {
    reportSettingsFailure('写入', e)
  }
}

function scheduleWrite(): void {
  if (typeof window === 'undefined') return
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => void writeNow(), writeDebounceMs)
}

/** 把库里的设置回灌进 store（启动时与同步/导入后各调用一次） */
export async function hydrateSyncedSettings(): Promise<void> {
  try {
    const row = await appSettingsRepo.get(ROW_ID)
    if (!row?.data) return
    hydrating = true
    try {
      useSettingsStore.setState(row.data as Partial<SettingsState>)
    } finally {
      hydrating = false
    }
  } catch (e) {
    reportSettingsFailure('读取', e)
  }
}

/** 订阅 store：白名单键变化即落库。幂等，重复调用无副作用。 */
export function initSyncedSettings(): void {
  if (started) return
  started = true
  useSettingsStore.subscribe((state, prev) => {
    // 回灌自身不应再触发写回，否则与远端来回抖动
    if (hydrating) return
    const changed = SYNCED_SETTING_KEYS.some((key) => state[key] !== prev[key])
    if (changed) scheduleWrite()
  })
}
