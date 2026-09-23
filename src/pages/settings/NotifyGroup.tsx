/**
 * 设置 · 通知（总开关 / 每源开关 / 免打扰 / 能力诊断 / 最近通知）
 *
 * ## 为什么从 `AppearanceGroup` 搬出来
 * 通知**不是外观**。此前它和主题、圆角、音效挤在一个「外观」分组里，
 * 于是「我只想关掉喝水提醒」这件事在界面上根本无处可说 —— 只有一个总开关。
 * 搬到独立分组后，粒度、文案与开关才能按"通知"自己的逻辑组织。
 *
 * ## 三层控制（用户的心智是分层的，界面也照这个分层）
 * 1. **总开关** `notifyEnabled` —— 所有提醒的总闸；
 * 2. **每源开关** `notifySources` —— 一类一类地关（"上课要提醒、喝水别烦我"）；
 * 3. **免打扰时段** —— 按时段关，而不是按内容关。
 * 投递时三者由 `components/notification/deliver.ts` 统一裁决，**记住历史永远不省** ——
 * 被静音/免打扰的提醒照样能在「最近通知」里回看，否则用户只会以为"昨天什么都没提醒"。
 *
 * ## 依赖
 * 分类元数据取自 `services/notify-sources.ts`（与投递管线同一份清单）——
 * **加一类提醒只要改那一处**，界面会自动多出一个开关。
 */
import { useEffect, useState } from 'react'
import { Button, Input, Switch, useToast } from '../../components/ui'
import { useSettingsStore } from '../../stores/useSettingsStore'
import {
  browserNotify,
  clearNoticeHistory,
  getNotifyCapability,
  listNoticeHistory,
  requestNotifyPermission,
  sendTestNotification,
  type NoticeRecord,
  type NotifyCapability,
  type NotifyPermission,
} from '../../services/notification'
import {
  NOTIFY_SOURCES,
  hasCustomNotifySources,
  isNotifySourceOn,
  type NotifySource,
} from '../../services/notify-sources'

const PERM_LABEL: Record<NotifyPermission, string> = {
  unsupported: '不支持',
  default: '未授权',
  granted: '已授权',
  denied: '已拒绝',
}

export function NotifyGroup() {
  const settings = useSettingsStore()
  const set = useSettingsStore((s) => s.set)
  const toast = useToast().toast
  const [cap, setCap] = useState<NotifyCapability | null>(null)
  const [history, setHistory] = useState<NoticeRecord[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  // 打开设置页时体检一次：把"卡在哪一步"提前摆出来（权限 / 运行模式 / Service Worker）
  useEffect(() => {
    if (!settings.browserNotify) return
    let alive = true
    void getNotifyCapability().then((c) => {
      if (alive) setCap(c)
    })
    return () => {
      alive = false
    }
  }, [settings.browserNotify])

  const testNotify = async () => {
    const ok = await sendTestNotification()
    toast(ok ? '已发送，请看系统通知' : '发送失败 · 权限 / 运行模式 / Service Worker 三处都要就绪', ok ? 'success' : 'danger')
    setCap(await getNotifyCapability())
  }

  const custom = hasCustomNotifySources(settings.notifySources)
  /** 关掉某一源：从"全开"的缺省状态显式记下 false */
  const toggleSource = (key: NotifySource) => {
    const on = isNotifySourceOn(settings.notifySources, key)
    set({ notifySources: { ...settings.notifySources, [key]: !on } })
  }

  return (
    <>
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="rounded-tile border border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">应用内通知</span>
            <Switch
              checked={settings.notifyEnabled}
              onChange={() => set({ notifyEnabled: !settings.notifyEnabled })}
              label="应用内通知"
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">到期待办 · 上课 · 关注更新</p>
        </div>

        <div className="rounded-tile border border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">浏览器通知</span>
            <Switch
              checked={settings.browserNotify}
              label="浏览器通知"
              onChange={async () => {
                if (settings.browserNotify) {
                  set({ browserNotify: false })
                  return
                }
                // 授权只能在用户手势里发起；拿不到授权就把开关回滚，
                // 否则会留下一个「显示已开、实际永不提醒」的死开关
                const perm = await requestNotifyPermission()
                if (perm !== 'granted') {
                  set({ browserNotify: false })
                  toast(
                    perm === 'unsupported'
                      ? '当前浏览器不支持系统通知'
                      : perm === 'denied'
                        ? '通知权限已被拒绝，请在浏览器站点设置里开启'
                        : '未获得通知授权',
                    'danger',
                  )
                  return
                }
                set({ browserNotify: true })
                void browserNotify('知白台', '通知已开启', '#/')
              }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">需浏览器授权</p>

          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <p className="text-xs leading-relaxed text-ink-faint">
              权限 {PERM_LABEL[cap?.permission ?? 'unsupported']} · 运行{' '}
              {cap?.standalone ? '已安装为应用' : '浏览器标签页'} · Service Worker{' '}
              {cap?.swReady ? '已就绪' : '未就绪'}
            </p>
            <Button size="sm" variant="tertiary" onClick={() => void testNotify()}>
              发送测试通知
            </Button>
          </div>

          {/* 通知历史：toast 2.6 秒就消失，错过时能从这里回看 */}
          <div className="mt-2">
            <button
              onClick={() => {
                // 展开时现读，避免显示的是上次打开时的旧记录
                setHistory(listNoticeHistory())
                setHistoryOpen((v) => !v)
              }}
              className="flex w-full items-center gap-2 py-1 text-xs text-ink-faint transition-colors hover:text-ink-muted"
              aria-expanded={historyOpen}
            >
              最近通知 · {history.length}
              <span className="ml-auto">{historyOpen ? '收起' : '展开'}</span>
            </button>
            {historyOpen && (
              <div className="mt-1 space-y-1">
                {history.length === 0 ? (
                  <p className="py-1 text-xs text-ink-faint">还没有通知记录</p>
                ) : (
                  <>
                    {history.map((n) => (
                      <p key={n.id} className="truncate text-xs text-ink-muted" title={n.message}>
                        {/* 来源标记：`app` 是操作回执（"已保存"），其余才是真提醒 ——
                            不区分的话这份历史会退化成操作日志，翻不到错过的提醒 */}
                        <span className="mr-1 text-ink-faint">
                          {n.source && n.source !== 'app'
                            ? NOTIFY_SOURCES.find((s) => s.key === n.source)?.label ?? '提醒'
                            : '回执'}
                        </span>
                        {n.message}
                      </p>
                    ))}
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() => {
                        clearNoticeHistory()
                        setHistory([])
                      }}
                    >
                      清空记录
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 每源开关：想关一类就关一类，不必把全部提醒一起关掉 */}
      <div className="mt-3 rounded-tile border border-line p-4">
        <button
          onClick={() => setSourcesOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-sm text-ink"
          aria-expanded={sourcesOpen}
        >
          <span className="font-medium">分类提醒</span>
          <span className="text-xs text-ink-faint">
            {settings.notifyEnabled
              ? custom
                ? '已自定义'
                : '全部开启'
              : '总开关已关闭'}
          </span>
          <span className="ml-auto text-xs text-ink-faint">{sourcesOpen ? '收起' : '展开'}</span>
        </button>
        {sourcesOpen && (
          <div className="mt-3 space-y-1.5">
            {NOTIFY_SOURCES.map((s) => (
              <div key={s.key} className="flex items-center gap-3 py-0.5">
                <span className="w-20 shrink-0 text-sm text-ink-muted">{s.label}</span>
                <Switch
                  size="md"
                  checked={isNotifySourceOn(settings.notifySources, s.key)}
                  onChange={() => toggleSource(s.key)}
                  disabled={!settings.notifyEnabled}
                  label={`${s.label}提醒`}
                />
                <span className="flex-1 text-xs text-ink-faint" title={s.detail}>
                  {s.desc}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs leading-relaxed text-ink-faint">
              关掉的只是"打扰"，提醒仍会记进「最近通知」。此偏好只在本机生效
              —— 两台设备各自关一项时不会互相覆盖。
            </p>
          </div>
        )}
      </div>

      {/* 免打扰时段：该时段内提醒只记入历史，不弹提示、不发系统通知 */}
      <div className="mt-3 rounded-tile border border-line p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">免打扰时段</span>
          <Switch
            checked={settings.quietEnabled}
            onChange={() => set({ quietEnabled: !settings.quietEnabled })}
            label="免打扰时段"
          />
        </div>
        {settings.quietEnabled && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="time"
              value={settings.quietFrom}
              onChange={(e) => set({ quietFrom: e.target.value })}
              aria-label="免打扰开始时间"
            />
            <span className="text-ink-faint">至</span>
            <Input
              type="time"
              value={settings.quietTo}
              onChange={(e) => set({ quietTo: e.target.value })}
              aria-label="免打扰结束时间"
            />
          </div>
        )}
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          {settings.quietEnabled
            ? `${settings.quietFrom} — ${settings.quietTo} 期间不打扰，提醒仍可在「最近通知」里回看。`
            : '开启后，该时段内不弹提示、不发系统通知，但提醒仍记入历史。'}
        </p>
      </div>
    </>
  )
}
