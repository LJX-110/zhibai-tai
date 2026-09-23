/**
 * 设置 store —— 持久化到 localStorage
 * 布局模式 / 目标 / 同步配置（Token 绝不硬编码，仅存本地并提示风险）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LayoutMode } from './useAppStore'
import type { NotifySource } from '../services/notify-sources'

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
  /**
   * **每源开关**：键为 `NotifySource`，缺省（无此项）视为**开启**。
   *
   * 为什么要有它：此前只有一个总开关，想不要"喝水提醒"就得把全部提醒关掉。
   * 粒度定义见 `services/notify-sources.ts`；投递时由
   * `components/notification/deliver.ts` 统一查一次。
   *
   * ⚠️ **刻意不进同步白名单**（与免打扰时段同类，属设备级偏好）：
   * 它是对象，而快照是**行级 LWW** —— 两台设备各关一项会互相覆盖，
   * 结果就是"我明明关过它怎么又开了"。总开关与浏览器通知才是所有设备都该遵守的。
   */
  notifySources: Partial<Record<NotifySource, boolean>>

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

  /**
   * 桌宠开关。**默认关**（不想看的人不该看见它），且是**设备级偏好**：
   * 不进 `settings-sync.ts` 的同步白名单 —— "这台设备要不要看见宠物"与
   * "宠物在哪、多亲"（那是业务表 petState，跨设备一致）是两件事。
   */
  petEnabled: boolean

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
      /** 音效默认开：这是用户明确要的反馈通道，而它此前默认关闭、又埋在「更多设置」里，
       *  等于一个没人知道存在的功能（用户反馈"音效仍无法听见"的根因就是它）。
       *  合成音音量本就压得很低（族基准 0.2 上下），不会变成打扰；不想听随时关。
       *  音量给 0.7：合成音峰值 = 族基准 × 音量，0.5 时约 0.11，在手机外放上偏弱。 */
      soundEnabled: true,
      soundVolume: 0.7,
      ambientEnabled: false,
      notifyEnabled: true,
      browserNotify: false,
      quietEnabled: false,
      quietFrom: '23:00',
      quietTo: '07:00',
      // 空对象 = 全部开启；只有用户显式关掉某项才会写入键
      notifySources: {},
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
      petEnabled: false,
      set: (patch) => set(patch),
    }),
    { name: 'yishu-workbench:settings' },
  ),
)
