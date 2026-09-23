/**
 * 设置 · 桌宠
 *
 * 只放**设备级**偏好：开关本身。
 * `petEnabled` 刻意**不进** `SYNCED_SETTING_KEYS` 白名单 ——
 * 它在 PWA 与未来的桌面壳之间含义不同（同一账号在手机上开着、在桌面上未必想开），
 * 属于设备级偏好，与主题/布局模式同类先例。
 *
 * 好感度是**跑在业务表里**的（会跨设备同步），所以这里只读不写：
 * 加分全部走 `usePetStore.grantAffinity(event)` —— 规则集中在
 * `services/pet/affinity.ts`（只升不降、不设门槛、每日有上限）。
 */
import { Switch } from '../../components/ui'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { usePetStore } from '../../stores/usePetStore'
import { daysTogether } from '../../services/pet/affinity'

export function PetGroup() {
  const enabled = useSettingsStore((s) => s.petEnabled)
  const set = useSettingsStore((s) => s.set)
  const affinity = usePetStore((s) => s.affinity)
  const createdAt = usePetStore((s) => s.createdAt)

  // 相识天数按"初次落库"算；没有记录时按 0（显示为"今天刚认识"）
  const days = daysTogether(createdAt, new Date())

  return (
    <div className="row flex-wrap">
      <span className="w-20 shrink-0 text-sm text-ink-muted">桌宠</span>
      <Switch
        size="md"
        checked={enabled}
        label="桌宠开关"
        onChange={() => set({ petEnabled: !enabled })}
      />
      <span className="flex-1 text-xs text-ink-faint">
        {enabled ? '已在页面角落待着' : '关闭时不加载任何素材'}
        {enabled && (
          <span className="ml-1">
            · 相识 {days} 天
            {affinity > 0 && ` · 好感 ${affinity}`}
          </span>
        )}
      </span>
    </div>
  )
}
