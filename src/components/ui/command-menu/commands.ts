/**
 * 命令面板 · 快速命令的清单与分组工具
 * 命令本身是纯数据 + 回调（`run`），所以这里只负责"造清单"，不碰渲染。
 */
import {
  Archive,
  CheckSquare,
  Coins,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Star,
} from 'lucide-react'
import { ALL_SECTIONS, type SectionId } from '../../../app/navigation'
import { useAppStore } from '../../../stores/useAppStore'
import { useWaterStore } from '../../../stores/useWaterStore'
import { saveDailySignRecord } from '../../../stores/useDivinationStore'
import { refreshAll } from '../../../services/intelligence/run'
import { runSync } from '../../../sync/SyncService'
import { createId, todayISO, nowISO } from '../../../utils/id'
import type { useToast } from '../Toast'

export interface Command {
  id: string
  label: string
  group: string
  hint?: string
  run: () => void
}

type ToastFn = ReturnType<typeof useToast>['toast']

export function buildCommands({
  go,
  toast,
  close,
}: {
  go: (s: SectionId) => void
  toast: ToastFn
  close: () => void
}): Command[] {
  const now = nowISO()
  return [
    {
      id: 'open-hotkeys',
      label: '键盘速查',
      group: '帮助',
      hint: '？',
      run: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })),
    },
    {
      id: 'task',
      label: '新建待办',
      group: '新建',
      hint: '→ 行 · 今日',
      run: () => go('action'),
    },
    {
      id: 'note',
      label: '新建笔记 / 灵感',
      group: '新建',
      hint: '→ 行 · 记事本',
      run: () => go('action'),
    },
    {
      id: 'water',
      label: '记录喝水 +300ml',
      group: '新建',
      hint: '立即记录',
      run: async () => {
        await useWaterStore.getState().add({
          id: createId(),
          date: todayISO(),
          amountMl: 300,
          createdAt: now,
        })
        toast('已记录 +300ml', 'success')
        close()
      },
    },
    {
      id: 'expense',
      label: '记一笔支出',
      group: '新建',
      hint: '→ 财 · 本月',
      run: () => go('finance'),
    },
    {
      id: 'collection',
      label: '添加收藏',
      group: '新建',
      hint: '→ 藏 · 藏品',
      run: () => go('collection'),
    },
    {
      id: 'project',
      label: '新建项目',
      group: '新建',
      hint: '→ 藏 · 项目中心',
      run: () => go('collection'),
    },
    {
      id: 'pomo',
      label: '开始番茄钟',
      group: '新建',
      hint: '→ 学 · 番茄钟',
      run: () => go('study'),
    },
    {
      id: 'habit',
      label: '记录斩三尸',
      group: '新建',
      hint: '→ 修 · 斩三尸',
      run: () => go('cultivate'),
    },
    {
      id: 'focus',
      label: '进入专注模式',
      group: '新建',
      hint: '隐藏侧栏 · 只留任务与番茄钟',
      run: () => {
        useAppStore.getState().setFocusMode(true)
        close()
      },
    },
    {
      id: 'add-follow',
      label: '管理关注',
      group: '新建',
      hint: '→ 情 · 关注流',
      run: () => go('intelligence'),
    },
    {
      id: 'new-game',
      label: '新建游戏收藏',
      group: '新建',
      hint: '→ 藏 · 藏品',
      run: () => go('collection'),
    },
    {
      id: 'new-anime',
      label: '新建动漫收藏',
      group: '新建',
      hint: '→ 藏 · 藏品',
      run: () => go('collection'),
    },
    {
      id: 'fetch-intel',
      label: '抓取全部情报',
      group: '情报',
      hint: '从所有启用源拉取',
      run: async () => {
        // 与情报页、定时抓取共用同一个编排：并发受限、失败源退避、
        // 整轮单飞（此处与定时器同时触发时不会把同一批源连打两遍）
        const res = await refreshAll()
        const failed = res.failures.length
        const skipped = res.skipped.length
        const parts = [`新增 ${res.added} 条`]
        if (failed > 0) parts.push(`${failed} 个源失败（详情见「情」页）`)
        if (skipped > 0) parts.push(`${skipped} 个源退避中`)
        toast(parts.join(' · '), failed > 0 && res.added === 0 ? 'danger' : 'success')
        close()
      },
    },
    {
      id: 'sync-github',
      label: '同步 GitHub',
      group: '情报',
      hint: '拉取并推送私有仓库快照',
      run: async () => {
        close()
        try {
          // 同步成功静默：顶栏状态点可见；只在失败时报错
          await runSync()
        } catch (e) {
          toast('同步失败：' + (e instanceof Error ? e.message : ''), 'danger')
        }
      },
    },
    {
      id: 'save-sign',
      label: '记录今日签',
      group: '情报',
      hint: '存档到奇·历史',
      run: async () => {
        // 与占卜页共用同一实现，避免两处逻辑漂移
        const { saved } = await saveDailySignRecord(todayISO())
        toast(saved ? '今日签已入档' : '今日签已记', saved ? 'success' : undefined)
        close()
      },
    },
    ...ALL_SECTIONS.map((s) => ({
      id: `nav-${s.id}`,
      label: `${s.index} ${s.label} · ${s.desc}`,
      group: '跳转',
      run: () => go(s.id),
    })),
  ]
}

export function groupBy(arr: Command[]): [string, Command[]][] {
  const map = new Map<string, Command[]>()
  for (const c of arr) {
    const list = map.get(c.group) ?? []
    list.push(c)
    map.set(c.group, list)
  }
  return [...map.entries()]
}

export function groupIcon(group: string) {
  const map: Record<string, typeof Search> = {
    任务: CheckSquare,
    笔记: Archive,
    收藏: Star,
    项目: Star,
    情报: Sparkles,
    课程: GraduationCap,
    消费: Coins,
  }
  return map[group]
}

/** 命令面板快捷入口的默认图标（「新建」组用加号） */
export const NEW_ICON = Plus
