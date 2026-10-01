/**
 * 系统 · **通知与提醒**（Step 5-3C 重排 / 5-3E 再排）
 *
 * ## 三段，各自回答一个问题（顺序 = 用户拍板的顺序，2026-09-30）
 * ```
 * 音效       叫我的声音   —— 开关 · 音量 · 四类语义试听（先能听见）
 * 提醒       什么时候叫我 —— 总开关 · 免打扰 · 分类 · 浏览器通知
 * 通知中心   我错过了什么 —— 可查看 / 已读 / 点击跳转 / 清理过期（放最后、可收起）
 * ```
 *
 * ## 为什么通知中心放最后且默认收起
 * 它是**读**（历史与未读），不是**改**（开关与规则）；放最上面会把"改设置"挤下去，
 * 而它平时看的人少 —— 收起来后标题上的未读数就是唯一需要的提示。
 */
import { useSettingsStore } from '../../stores/useSettingsStore'
import { playSound } from '../../services/sound'
import { Button, Collapse, Section, Switch } from '../../components/ui'
import { NotificationCenter } from '../../components/notification/NotificationCenter'
import { useUnreadNotices } from '../../hooks/useUnreadNotices'
import { NotifyGroup } from './NotifyGroup'

/**
 * 四类试听 —— 标签写"**用户听到的是哪种声音**"，不写内部事件键：
 * 设置页是给用户看的，而且此前标签（磬/木鱼/钟/云锣）与实际音色
 * （`seal`/`paper`/`compass`/`qimen` 全是钟族与噪声）并不对应，
 * 其中两个还是 150Hz 与 0.1 秒低增益噪声 —— 点了像没反应。
 */
const AUDITIONS = [
  { key: 'notification', label: '提醒' },
  { key: 'task-done', label: '完成' },
  { key: 'success', label: '成功' },
  { key: 'error', label: '警示' },
] as const

export function AlertsGroup() {
  const settings = useSettingsStore()
  // 通知中心折起来之后，未读数就是标题行上唯一需要的提示（与顶栏铃铛同源）
  const unread = useUnreadNotices()
  return (
    <>
      <Section title="音效">
        {/* 行式内容（不套卡）：本段只服务"开不开 / 多大声 / 听一下"三件事 */}
        <div className="row flex-wrap">
          <span className="flex-1 text-sm text-ink">音效</span>
          <Switch
            checked={settings.soundEnabled}
            label="音效"
            onChange={() => {
              const next = !settings.soundEnabled
              settings.set({ soundEnabled: next })
              // 开启瞬间播一声确认：既是反馈也是"音效已可用"的自证
              if (next) playSound('ui-confirm')
            }}
          />
        </div>
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">音量</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.soundVolume}
            onChange={(e) => settings.set({ soundVolume: Number(e.target.value) })}
            className="min-w-[8rem] flex-1 accent-[var(--color-teal)]"
            aria-label="音效音量"
          />
          <span className="tabular text-xs text-ink-faint">
            {Math.round(settings.soundVolume * 100)}%
          </span>
        </div>
        <div className="row flex-wrap">
          <span className="w-20 shrink-0 text-sm text-ink-muted">试听</span>
          {AUDITIONS.map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant="tertiary"
              // `silent` 关掉按钮自身的 ui-click，否则两声叠在一起听不清试听的是哪个
              silent
              onClick={() => playSound(key)}
              className="!px-2"
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="row flex-wrap">
          <span className="flex-1 text-sm text-ink">环境音</span>
          <span className="text-xs text-ink-faint">极轻的底噪</span>
          <Switch
            checked={settings.ambientEnabled}
            label="环境音"
            onChange={() => settings.set({ ambientEnabled: !settings.ambientEnabled })}
          />
        </div>
      </Section>

      <Section title="提醒" hint="总开关 · 免打扰 · 分类">
        <NotifyGroup />
      </Section>

      {/* 通知中心放最后、默认收起（Step 5-3E 用户拍板）：它是"读"，不该挤在"改"前面 */}
      <Collapse
        title="通知中心"
        hint={unread > 0 ? `${unread} 条未读` : '没有未读'}
      >
        <NotificationCenter />
      </Collapse>
    </>
  )
}
