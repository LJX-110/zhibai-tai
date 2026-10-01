/**
 * 设置 · 桌宠
 *
 * 只放**设备级**偏好：开关本身。
 * `petEnabled` 刻意**不进** `SYNCED_SETTING_KEYS` 白名单 ——
 * 它是设备级偏好：同一账号在手机上开着、在桌面浏览器里未必想开
 * （与主题 / 布局模式同类先例）。
 *
 * 好感度是**跑在业务表里**的（会跨设备同步），所以这里只读不写：
 * 加分全部走 `usePetStore.grantAffinity(event)` —— 规则集中在
 * `services/pet/affinity.ts`（只升不降、不设门槛、每日有上限）。
 */
import { useEffect, useState } from 'react'
import { Button, Chip, Collapse, Switch } from '../../components/ui'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { usePetStore } from '../../stores/usePetStore'
import { affinityTier, daysTogether } from '../../services/pet/affinity'
import { PET_SCALE_STEPS, petScaleKeyOf } from '../../services/pet/geometry'
import { requestPlayAnim, requestResetPosition } from '../../services/pet/commands'
import { loadPetConfig } from '../../services/pet/config'
import { animationCatalog, type AnimationGroup } from '../../services/pet/animation-catalog'
import { aiLineCountToday } from '../../services/pet/ai-speech'

export function PetGroup() {
  const enabled = useSettingsStore((s) => s.petEnabled)
  const wander = useSettingsStore((s) => s.petWander)
  const set = useSettingsStore((s) => s.set)
  const scale = useSettingsStore((s) => s.petScale)
  const speech = useSettingsStore((s) => s.petSpeechEnabled)
  const aiSpeech = useSettingsStore((s) => s.petAiSpeech)
  const affinity = usePetStore((s) => s.affinity)
  const createdAt = usePetStore((s) => s.createdAt)

  /**
   * 「动作」目录（Step 5-3E）：从 `public/pet/config.json` 拉一次摊平 ——
   * **代码里不写死任何素材名**（桌宠的既有纪律）；点一个名字发一条播放命令。
   */
  const [catalog, setCatalog] = useState<AnimationGroup[] | null>(null)
  useEffect(() => {
    let alive = true
    void loadPetConfig()
      .then((c) => {
        if (alive) setCatalog(animationCatalog(c))
      })
      .catch(() => {
        // 读不到就不列动作（不弹错）：真正的"配置坏了"由桌宠侧记录并停用，设置页重复报错只会吵
        if (alive) setCatalog([])
      })
    return () => {
      alive = false
    }
  }, [])
  const actionCount = catalog?.reduce((n, g) => n + g.names.length, 0) ?? 0

  // 相识天数按"初次落库"算；没有记录时按 0（显示为"今天刚认识"）
  const days = daysTogether(createdAt, new Date())
  // 好感不是"一个数字"了：等级 + 本级进度（Step 5-2C E-5）
  const tier = affinityTier(affinity)

  return (
    <>
      <div className="row flex-wrap">
        <span className="w-20 shrink-0 text-sm text-ink-muted">桌宠</span>
        <Switch
          size="md"
          checked={enabled}
          label="桌宠开关"
          onChange={() => set({ petEnabled: !enabled })}
        />
        <span className="flex-1 text-xs text-ink-faint">
          {enabled ? (
            <>
              相识 {days} 天
              {affinity > 0 &&
                (tier.span == null
                  ? ` · 好感 ${affinity} · Lv.${tier.level} 已满级`
                  : ` · 好感 ${affinity} · Lv.${tier.level} ${tier.current}/${tier.span}`)}
            </>
          ) : (
            '关闭时不加载任何素材'
          )}
        </span>
      </div>
      {/* 大小：三档（Step 5-2C E-2 用户拍板）。
          改前这里**没有任何控件** —— `petScale` 一直是连续滑杆语义却没有 UI，
          等于"有这个设置但用户碰不到"。 */}
      <div className="row flex-wrap">
        <span className="w-20 shrink-0 text-sm text-ink-muted">大小</span>
        <div className="flex gap-1">
          {PET_SCALE_STEPS.map((step) => (
            <Chip
              key={step.key}
              active={petScaleKeyOf(scale) === step.key}
              onClick={() => set({ petScale: step.value })}
            >
              {step.label}
            </Chip>
          ))}
        </div>
      </div>
      {/* 台词：只关"常驻表现"，不关互动与动画（Step 5-2C F 批）；
          「AI 台词」是 Step 5-3E 用户拍板 —— 气泡里的话由人设（鲸鱼娘）生成，
          未配 AI / 请求失败自动回退本地台词库 */}
      <div className="row flex-wrap">
        <span className="w-20 shrink-0 text-sm text-ink-muted">台词</span>
        <Switch
          size="md"
          checked={speech}
          label="桌宠台词开关"
          onChange={() => set({ petSpeechEnabled: !speech })}
        />
        <span className="flex items-center gap-1.5">
          <Switch
            size="md"
            checked={aiSpeech}
            disabled={!speech}
            label="AI 台词"
            onChange={() => set({ petAiSpeech: !aiSpeech })}
          />
          <span className="text-xs text-ink-muted">AI 台词</span>
        </span>
        <span className="flex-1 text-xs text-ink-faint">
          {!speech
            ? '不主动说话 · 点它仍会回应'
            : aiSpeech
              ? `人设生成 · 今日 ${aiLineCountToday()}/20`
              : '只走本地台词'}
        </span>
      </div>
      {/* 动作（Step 5-3E 重做 · 用户拍板）：**列动作名，点一个它立刻做给你看** ——
          此前理解的"随机动作开关 + 频率"方向错了，已撤回 */}
      <Collapse
        title="动作"
        hint={catalog === null ? '加载中…' : `${actionCount} 个动作`}
        className="!pb-0"
      >
        {catalog !== null && catalog.length === 0 ? (
          <p className="text-xs text-ink-faint">动作列表不可用（桌宠配置未加载）</p>
        ) : (
          <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
            {catalog?.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-xs text-ink-faint">{g.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.names.map((n) => (
                    <Chip key={n} onClick={() => requestPlayAnim(n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
            {!enabled && (
              <p className="text-xs text-ink-faint">桌宠未开启 —— 打开后这些动作才会真的播放。</p>
            )}
          </div>
        )}
      </Collapse>
      {/* 位置：只提供"恢复默认位置"；平时位置由拖动决定并存在本机（不进同步） */}
      <div className="row flex-wrap">
        <span className="w-20 shrink-0 text-sm text-ink-muted">位置</span>
        <Button size="sm" variant="tertiary" onClick={requestResetPosition}>
          恢复默认位置
        </Button>
        <span className="flex-1 text-xs text-ink-faint">回到底部右下角 · 拖动位置只存本机</span>
      </div>
      {/* 漫游：关着时位置只由拖动决定（默认关，Step 4-2） */}
      <div className="row flex-wrap">
        <span className="w-20 shrink-0 text-sm text-ink-muted">漫游</span>
        <Switch
          size="md"
          checked={wander}
          label="桌宠漫游开关"
          disabled={!enabled}
          onChange={() => set({ petWander: !wander })}
        />
        {/* ⚠️ 据实描述（Step 5-3C 素材审计）：`public/pet/` 共 106 张素材、零死素材，
            但**没有任何行走循环 / 方向帧**；`moves.actions` 只有「螃蟹走路」「原地漂浮踏步」
            「原地左转奔跑」——后两个命名即"原地"。位移是 rAF 线性插值，所以视觉是**平移**，
            不是走路。在补上朝左/朝右的 walk cycle 之前，这里如实写作"移动"，不写"走动"。 */}
        <span className="flex-1 text-xs text-ink-faint">
          {wander ? '空闲时自己移动' : '不自己移动 · 拖到哪就待在哪'}
        </span>
      </div>
    </>
  )
}
