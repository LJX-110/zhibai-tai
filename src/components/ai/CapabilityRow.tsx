/**
 * 天机 · 系统能力行（欢迎页上的一排按钮）
 *
 * 放在欢迎页（首次打开天机的界面）而不是塞进输入框旁边：
 *  · 权限请求**必须由用户手势触发**，所以必须有个明确的"点它"；
 *  · 授权是低频动作，不该每轮对话都占着界面。
 *
 * 点一下 → 请求授权 + 取值 → 值写进上下文（下次提问就能用）。
 * 已取到的值会显示时间，**5 分钟后自动作废**（界面据此提示"需重新取一次"）。
 *
 * 三条不做的：不自动请求权限（浏览器也不允许）、不显示原始坐标（只显示状态）、
 * 不在不支持的环境里渲染按钮（`getSnapshots` 只含支持的）。
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { CapabilitySnapshot } from '../../services/capabilities'
import {
  getSnapshots,
  isFresh,
  refreshCapabilityStates,
  requestCapability,
  subscribeCapabilities,
} from '../../services/capabilities'
import { useToast } from '../ui'
import { cn } from '../../utils/cn'

/**
 * 空快照要用**同一个引用**：`getServerSnapshot` 若每次返回新的 `[]`，
 * React 会认为 store 一直在变（"The result of getServerSnapshot should be cached"），
 * 严重时无限重渲染。别写成内联的 `() => []`。
 */
const NO_SNAPSHOTS: CapabilitySnapshot[] = []

export function CapabilityRow() {
  const snaps = useSyncExternalStore(subscribeCapabilities, getSnapshots, () => NO_SNAPSHOTS)
  const toast = useToast().toast

  // 挂载时查一次权限状态（**只查询、不触发授权**）
  useEffect(() => {
    void refreshCapabilityStates()
  }, [])

  if (snaps.length === 0) return null

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="eyebrow text-ink-faint">系统能力</span>
      {snaps.map((s) => {
        const fresh = isFresh(s)
        return (
          <button
            key={s.kind}
            type="button"
            onClick={() => {
              void requestCapability(s.kind).then((v) => {
                toast(v ? `${s.label}已取到，可以直接问相关的问题了` : `没取到${s.label}（可能被拒绝或不可用）`, v ? 'success' : 'info')
              })
            }}
            title={s.state === 'denied' ? `曾被拒绝授权；再点一次会重新请求` : `点它取一次${s.label}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-xs transition-colors',
              fresh
                ? 'border-teal/35 bg-teal/10 text-teal'
                : s.state === 'denied'
                  ? 'border-cinnabar/35 bg-cinnabar/5 text-cinnabar'
                  : 'border-line bg-raised text-ink-muted hover:text-ink',
            )}
          >
            {s.label}
            <span className="opacity-70">{fresh ? '已取' : s.state === 'denied' ? '被拒' : '未取'}</span>
          </button>
        )
      })}
      {/* 说明按「只留核心信息」精简：窄屏不占首行，桌面端给一句 */}
      <span className="hidden text-xs text-ink-faint md:inline">
        取了才用，5 分钟后作废；不取也能正常用
      </span>
    </div>
  )
}
