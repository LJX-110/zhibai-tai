/**
 * 设置 store —— 持久化到 localStorage
 * 布局模式 / 目标 / 同步配置（Token 绝不硬编码，仅存本地并提示风险）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LayoutMode } from './useAppStore'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'
export type ThemeMode = 'light' | 'dark' | 'system'
/** 自动同步间隔 */
export type SyncInterval = 'immediate' | '30s' | '5m' | 'manual'

export interface SettingsState {
  profileName: string
  /** 浅色 / 深色 / 跟随系统 */
  theme: ThemeMode
  /** 桌面工作台 / 移动终端 / 自动 */
  layoutMode: LayoutMode
  /** 首次启动引导是否完成 */
  onboarded: boolean
  /** 喝水每日目标 ml */
  waterGoalMl: number
  /** 番茄钟时长（分钟） */
  pomodoroFocusMin: number
  pomodoroBreakMin: number
  /** GitHub 同步（仅私有仓库 + 加密快照一种方式） */
  syncMode?: 'repo'
  githubRepo?: string
  githubBranch?: string
  /** Token 经加密后存储（encryptor），绝不存明文进代码 */
  githubToken?: string
  githubTokenEnc?: boolean
  /** Sync Password（PBKDF2 推导数据密钥，跨设备恢复用）——经设备本地密钥加密存储 */
  syncPassword?: string
  syncPasswordEnc?: boolean
  /** 自动同步 */
  autoSync: boolean
  syncInterval: SyncInterval
  lastSyncedAt?: string | null
  syncStatus: SyncStatus
  syncError?: string

  /** 音效（Web Audio 合成，默认低音量） */
  soundEnabled: boolean
  soundVolume: number
  /** 环境音（Web Audio 合成，默认关；由 sound.ts 的 setAmbient 控制） */
  ambientEnabled: boolean
  /** 轻量通知（非强制弹窗） */
  notifyEnabled: boolean
  /** 使用浏览器 Notification（需授权） */
  browserNotify: boolean
  /**
   * 免打扰时段：该时段内提醒**只记入历史、不弹提示、不发系统通知。
   * 起止为 'HH:MM'；支持跨零点（如 23:00 → 07:00 覆盖整夜）。
   */
  quietEnabled: boolean
  quietFrom: string
  quietTo: string

  /** AI Core：Provider 配置（Key 加密存储，绝不硬编码） */
  aiProvider: 'local' | 'remote'
  aiBaseUrl: string
  aiModel: string
  aiKey?: string
  aiKeyEnc?: boolean

  /** 情报定时自动抓取（默认开） */
  intelAutoFetch: boolean
  intelFetchMinutes: number
  /** 情报保留上限（条）。情报是会持续自动增长的表，没有上限会让同步快照无限膨胀。 */
  intelKeepLimit: number
  /** 自建 CORS 代理（如 Cloudflare Worker）。配置后情报抓取优先经它转发，
   *  彻底摆脱公共代理的可用性波动；留空则仅直连（不做公共代理兜底）。
   *  B 站源（bilibili provider）同样依赖它：B 站接口不接受浏览器跨域直连。 */
  corsProxyUrl?: string

  /** 学期起始日（周一，yyyy-mm-dd）—— 课程表按它推算当前周次与单双周 */
  termStartDate?: string

  set: (patch: Partial<SettingsState>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profileName: '修者',
      theme: 'dark',
      layoutMode: 'auto',
      onboarded: false,
      waterGoalMl: 2000,
      pomodoroFocusMin: 25,
      pomodoroBreakMin: 5,
      syncMode: 'repo',
      githubRepo: '',
      githubBranch: 'main',
      githubToken: '',
      githubTokenEnc: false,
      syncPassword: '',
      syncPasswordEnc: false,
      /** 默认开启：移动端为主要使用场景时，手动同步几乎不会被想起，
       *  数据就一直躺在单台设备上（未配置同步目标时静默跳过，不打扰） */
      autoSync: true,
      syncInterval: '30s',
      lastSyncedAt: null,
      syncStatus: 'idle',
      syncError: undefined,
      soundEnabled: false,
      soundVolume: 0.5,
      ambientEnabled: false,
      notifyEnabled: true,
      browserNotify: false,
      quietEnabled: false,
      quietFrom: '23:00',
      quietTo: '07:00',
      aiProvider: 'local',
      aiBaseUrl: 'https://apihub.agnes-ai.com/v1',
      aiModel: 'agnes-2.5-flash',
      aiKey: '',
      aiKeyEnc: false,
      /** 定时自动抓取默认开启：手机是主要场景，指望用户想起来点按钮并不现实。
       *  未配置转发端点时大部分源会失败，但失败原因是逐源可查的（见情报源卡片）。 */
      intelAutoFetch: true,
      intelFetchMinutes: 60,
      intelKeepLimit: 500,
      termStartDate: undefined,
      set: (patch) => set(patch),
    }),
    { name: 'yishu-workbench:settings' },
  ),
)
