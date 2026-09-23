// @vitest-environment jsdom
/**
 * 通知投递管线（`components/notification/deliver.ts`）
 *
 * 这一层存在的理由是"三条策略此前散在四处、每条都只覆盖一部分"。所以测试的重点不是
 * "能不能弹出来"，而是**每条策略真的管住了所有来源**，以及一条最容易写错的不变式：
 *
 *   **被静音 / 免打扰 ≠ 没发生过。** 被挡下的提醒**仍要进历史** ——
 *   否则用户第二天只看到"昨天什么都没提醒"，而真相是"被设置挡掉了"，
 *   他只会以为提醒坏了。这条比"别打扰我"更难写对，因为它需要"记但不说"。
 *
 * 另外守一条边界：**操作回执不进历史**。全站一百多处 `push('已保存')`，
 * 每次都记的话 50 条缓冲会被回执挤满，"昨天那条错过的提醒"反而翻不到。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { deliverNotice } from '../components/notification/deliver'
import { listNoticeHistory, clearNoticeHistory } from '../services/notification'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useToastStore } from '../components/ui/toast-store'

/** 重置到"一切默认"：总开关开、无每源开关、不在免打扰时段 */
function resetSettings(over: Partial<Parameters<typeof useSettingsStore.setState>[0]> = {}) {
  useSettingsStore.setState({
    notifyEnabled: true,
    browserNotify: false,
    quietEnabled: false,
    quietFrom: '23:00',
    quietTo: '07:00',
    notifySources: {},
    ...over,
  })
}

beforeEach(() => {
  clearNoticeHistory()
  useToastStore.setState({ toasts: [] })
  resetSettings()
})

describe('正常投递', () => {
  it('弹 toast 并返回 delivered；历史里带得下来源', () => {
    const out = deliverNotice({ source: 'task', title: '待办提醒', text: '有 2 项今天到期' })
    expect(out).toBe('delivered')
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['有 2 项今天到期'])
    const history = listNoticeHistory()
    expect(history).toHaveLength(1)
    expect(history[0].source).toBe('task')
  })

  it('**一条提醒只记一次历史**（正常投递与记历史不能各记一遍）', () => {
    deliverNotice({ source: 'class', title: '即将上课', text: '高数 10 分钟后' })
    expect(listNoticeHistory()).toHaveLength(1)
  })
})

describe('总开关：关掉不等于没发生', () => {
  it('关掉后不弹 toast、返回 muted，但**仍进历史**', () => {
    resetSettings({ notifyEnabled: false })
    const out = deliverNotice({ source: 'task', title: '待办提醒', text: '有 2 项今天到期' })
    expect(out).toBe('muted')
    expect(useToastStore.getState().toasts).toHaveLength(0)
    const history = listNoticeHistory()
    expect(history).toHaveLength(1)
    expect(history[0].message).toBe('有 2 项今天到期')
    expect(history[0].source).toBe('task')
  })
})

describe('每源开关：一类一类地关', () => {
  it('关掉「身体」后，身体类被静音，**其他源照常**', () => {
    resetSettings({ notifySources: { health: false } })

    expect(deliverNotice({ source: 'health', title: '喝水提醒', text: '今天还差 600ml' })).toBe('muted')
    expect(deliverNotice({ source: 'task', title: '待办提醒', text: '有 1 项逾期' })).toBe('delivered')

    // 只弹了"待办"那条
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['有 1 项逾期'])
    // 两条都在历史里 —— 关掉的那条也要能回看
    expect(listNoticeHistory().map((n) => n.source).sort()).toEqual(['health', 'task'])
  })

  it('**缺省视为开启**：`notifySources` 里没有该源时照常提醒（新源不能静默变哑）', () => {
    resetSettings({ notifySources: { health: false } })
    expect(deliverNotice({ source: 'sync', title: '同步失败', text: '网络超时' })).toBe('delivered')
  })

  it('总开关关掉时，每源开关的状态不再影响结果（都只记历史）', () => {
    resetSettings({ notifyEnabled: false, notifySources: { task: true } })
    expect(deliverNotice({ source: 'task', title: 'x', text: 'y' })).toBe('muted')
  })
})

describe('免打扰时段', () => {
  it('落在时段内 → quiet：不弹、不响、不发系统通知，但进历史', () => {
    // 用当天真实时间构造，避免"测试在夜里跑就红"
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    resetSettings({ quietEnabled: true, quietFrom: `${hh}:00`, quietTo: `${hh}:59` })

    const out = deliverNotice({
      source: 'intel',
      title: '关注更新',
      text: '你的关注有 3 条更新',
      system: true,
      sound: true,
    })
    expect(out).toBe('quiet')
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(listNoticeHistory()).toHaveLength(1)
  })

  it('时段外照常投递（对照组）', () => {
    const now = new Date()
    // 造一个必然不覆盖当前时刻的窗口：把起止都设在"当前小时 +2"
    const hh = String((now.getHours() + 2) % 24).padStart(2, '0')
    resetSettings({ quietEnabled: true, quietFrom: `${hh}:00`, quietTo: `${hh}:30` })
    expect(deliverNotice({ source: 'intel', title: 'x', text: 'y' })).toBe('delivered')
  })

  it('**总开关关掉时不看免打扰**（返回值要能区分 muted 与 quiet，便于诊断）', () => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    resetSettings({
      notifyEnabled: false,
      quietEnabled: true,
      quietFrom: `${hh}:00`,
      quietTo: `${hh}:59`,
    })
    expect(deliverNotice({ source: 'intel', title: 'x', text: 'y' })).toBe('muted')
  })
})

describe('操作回执与提醒的分界', () => {
  it('不传 source 的 toast（操作回执）**不进历史**', () => {
    useToastStore.getState().push('待办已保存', 'success')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(listNoticeHistory()).toEqual([])
  })

  it('传了 source 的就地报错（顶栏同步失败）会进历史', () => {
    useToastStore.getState().push('同步失败：网络超时', 'danger', '#/system', 'sync')
    const history = listNoticeHistory()
    expect(history).toHaveLength(1)
    expect(history[0].source).toBe('sync')
  })
})
