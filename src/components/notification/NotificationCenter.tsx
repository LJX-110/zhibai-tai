/**
 * 通知中心 —— 应用内通知的**查看 / 追踪**（Step 5-3C）
 *
 * ## 与 Toast 的分工（这是本轮信息架构的一条硬边界）
 * Toast 回答"**此刻**发生了什么"（2.6 秒后消失）；
 * 通知中心回答"我刚**错过了**什么"。两者同源 ——
 * 投递管线（`components/notification/deliver.ts`）是唯一出口，
 * 它既落一条持久通知、也弹一次 toast。所以这里看到的每一条都是**真的发生过**的事，
 * 包含那些被静音 / 免打扰挡下的（"没打扰我"与"没发生过"是两件事）。
 *
 * ## 三件必须做对的事
 * 1. **点一条就跳过去**：有 `hash` 的（提醒类）点击直达对应板块，并顺手标记已读 ——
 *    否则"看到"与"处理"之间还隔着一次手动勾选；
 * 2. **未读要能一次清掉**：积压十几条时逐条点是惩罚（`全部已读`）；
 * 3. **过期要有出口**：`pruneNotices`（30 天）做成**显式按钮**而不是"打开就偷偷清" ——
 *    删掉别人的东西却不打招呼，比留着更让人不安。
 *
 * ⚠️ 老记录（v1 没有 `read` 字段）在 service 层被当作**已读** ——
 * 否则升级后第一次打开会突然冒出几十条未读。
 */
import { useCallback, useState } from 'react'
import { BellOff, CheckCheck, Clock, Trash2 } from 'lucide-react'
import { Button, Chip, useToast } from '../ui'
import { cn } from '../../utils/cn'
import {
  dismissNotice,
  listNoticeHistory,
  markAllNoticesRead,
  markNoticeRead,
  pruneNotices,
  unreadNoticeCount,
  type NoticeRecord,
  type NoticeTone,
} from '../../services/notification'
import { NOTIFY_SOURCES } from '../../services/notify-sources'

/** 来源标签：`app` 是操作回执，其余取统一清单的中文名（与设置页同一份） */
function sourceLabel(source?: string): string {
  if (!source || source === 'app') return '回执'
  return NOTIFY_SOURCES.find((s) => s.key === source)?.label ?? '提醒'
}

/** 严重度 → 色点（与 Toast 的三个 tone 同语义） */
const DOT: Record<NoticeTone, string> = {
  info: 'bg-bronze',
  success: 'bg-teal',
  danger: 'bg-cinnabar',
}

/** ISO → `MM-DD HH:mm`（本地时间；非法值给空串，绝不抛） */
function stamp(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 是不是今天（按本地日期比；`now` 由调用方传入，保持函数本身可确定化） */
function isToday(iso: string, now: Date): boolean {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return false
  return d.toDateString() === now.toDateString()
}

export function NotificationCenter() {
  const [list, setList] = useState<NoticeRecord[]>(() => listNoticeHistory())
  const [onlyUnread, setOnlyUnread] = useState(false)
  const toast = useToast().toast
  const refresh = useCallback(() => setList(listNoticeHistory()), [])

  const unread = unreadNoticeCount(list)
  const shown = onlyUnread ? list.filter((n) => !n.read) : list
  const now = new Date()
  const today = shown.filter((n) => isToday(n.at, now))
  const earlier = shown.filter((n) => !isToday(n.at, now))

  const row = (n: NoticeRecord) => (
    <div key={n.id} className="row flex items-center gap-2">
      <span className={cn('h-1.5 w-1.5 shrink-0 rotate-45', DOT[n.tone ?? 'info'], n.read && 'opacity-40')} />
      <button
        // 跳转与"标记已读"同一个动作：看到即认领，中间不再插一次手动勾选
        onClick={() => {
          if (!n.read) {
            markNoticeRead(n.id)
            refresh()
          }
          if (n.hash) location.hash = n.hash
        }}
        className="min-w-0 flex-1 text-left"
        title={n.message}
      >
        <span className="flex items-baseline gap-1.5">
          <span className={cn('truncate text-sm', n.read ? 'text-ink-muted' : 'text-ink')}>
            {n.title ?? n.message}
          </span>
          {(n.count ?? 1) > 1 && <span className="shrink-0 text-xs text-ink-faint">×{n.count}</span>}
        </span>
        {n.title && <span className="block truncate text-xs text-ink-muted">{n.message}</span>}
      </button>
      <span className="shrink-0 text-right text-xs leading-tight text-ink-faint">
        <span className="block">{sourceLabel(n.source)}</span>
        <span className="block">{stamp(n.at)}</span>
      </span>
      <button
        onClick={() => {
          dismissNotice(n.id)
          refresh()
        }}
        aria-label="删除这条通知"
        className="shrink-0 text-ink-faint transition-colors hover:text-cinnabar"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )

  return (
    <div className="space-y-1">
      <div className="row flex flex-wrap items-center gap-2">
        <Chip active={!onlyUnread} onClick={() => setOnlyUnread(false)}>
          全部 {list.length}
        </Chip>
        <Chip active={onlyUnread} onClick={() => setOnlyUnread(true)}>
          未读 {unread}
        </Chip>
        <Button
          size="sm"
          variant="tertiary"
          className="ml-auto"
          disabled={unread === 0}
          onClick={() => {
            markAllNoticesRead()
            refresh()
          }}
        >
          <CheckCheck size={12} /> 全部已读
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          title="清掉 30 天前的通知"
          onClick={() => {
            const removed = pruneNotices()
            refresh()
            toast(removed > 0 ? `已清理 ${removed} 条过期通知` : '没有过期通知', 'info')
          }}
        >
          <Clock size={12} /> 清理过期
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="row flex items-center gap-1.5 text-xs text-ink-faint">
          <BellOff size={12} />
          {onlyUnread ? '没有未读通知' : '还没有通知'}
        </p>
      ) : (
        <>
          {today.length > 0 && <p className="row text-xs text-ink-faint">今天</p>}
          {today.map(row)}
          {earlier.length > 0 && <p className="row text-xs text-ink-faint">更早</p>}
          {earlier.map(row)}
        </>
      )}
    </div>
  )
}
