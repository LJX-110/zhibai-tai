/**
 * 设置 store —— 持久化到 localStorage
 * 布局模式 / 目标 / 同步配置（Token 绝不硬编码，仅存本地并提示风险）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LayoutMode } from './useAppStore'
import { INTELLIGENCE_CATEGORIES } from '../services/intelligence/providers/index'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'
export type ThemeMode = 'light' | 'dark' | 'system'
/** 自动同步间隔 */
export type SyncInterval = 'immediate' | '30s' | '5m' | 'manual'

interface SettingsState {
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
  /** GitHub 同步 */
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

  /** v0.4 音效（Web Audio 合成，默认低音量） */
  soundEnabled: boolean
  soundVolume: number
  /** 环境音（未来扩展，默认关） */
  ambientEnabled: boolean
  /** v0.4 轻量通知（非强制弹窗） */
  notifyEnabled: boolean
  /** 使用浏览器 Notification（需授权） */
  browserNotify: boolean

  /** v1.0 AI Core：Provider 配置（Key 加密存储，绝不硬编码） */
  aiProvider: 'local' | 'remote'
  aiBaseUrl: string
  aiModel: string
  aiKey?: string
  aiKeyEnc?: boolean

  /** 情报定时自动抓取（默认关） */
  intelAutoFetch: boolean
  intelFetchMinutes: number
  /** 自建 CORS 代理（如 Cloudflare Worker）。配置后情报抓取优先经它转发，
   *  彻底摆脱公共代理的可用性波动；留空则走 直连 → 公共代理 兜底链 */
  corsProxyUrl?: string

  /** 情报分类（在情报页页签处内联增删；藏阁不再有第二套分类——藏阁仅按「类型」筛选） */
  intelCategories: string[]
  addIntelCategory: (name: string) => void
  removeIntelCategory: (name: string) => void
  resetIntelCategories: () => void

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
      githubRepo: '',
      githubBranch: 'main',
      githubToken: '',
      githubTokenEnc: false,
      syncPassword: '',
      syncPasswordEnc: false,
      autoSync: false,
      syncInterval: '30s',
      lastSyncedAt: null,
      syncStatus: 'idle',
      syncError: undefined,
      soundEnabled: false,
      soundVolume: 0.5,
      ambientEnabled: false,
      notifyEnabled: true,
      browserNotify: false,
      aiProvider: 'local',
      aiBaseUrl: 'https://apihub.agnes-ai.com/v1',
      aiModel: 'agnes-2.5-flash',
      aiKey: '',
      aiKeyEnc: false,
      intelAutoFetch: false,
      intelFetchMinutes: 60,
      intelCategories: [...INTELLIGENCE_CATEGORIES].filter((c) => c !== '全部' && c !== '自定义'),
      addIntelCategory: (name) =>
        set((s) => {
          const t = name.trim()
          if (!t || s.intelCategories.includes(t)) return {}
          return { intelCategories: [...s.intelCategories, t] }
        }),
      removeIntelCategory: (name) =>
        set((s) => ({ intelCategories: s.intelCategories.filter((c) => c !== name) })),
      resetIntelCategories: () =>
        set({ intelCategories: [...INTELLIGENCE_CATEGORIES].filter((c) => c !== '全部' && c !== '自定义') }),
      set: (patch) => set(patch),
    }),
    { name: 'yishu-workbench:settings' },
  ),
)
