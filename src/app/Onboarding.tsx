/**
 * Onboarding —— 首次启动引导
 * 欢迎 → 主题 → 布局 → 喝水目标 → 完成
 */
import { useState } from 'react'
import { Check, Moon, Palette, Sun, Monitor, LayoutGrid, Smartphone, Droplet } from 'lucide-react'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { ThemeMode } from '../stores/useSettingsStore'
import type { LayoutMode } from '../stores/useAppStore'
import { Button, Input } from '../components/ui'
import { cn } from '../utils/cn'

const THEMES: { value: ThemeMode; label: string; icon: typeof Sun; desc: string }[] = [
  { value: 'light', label: '浅色', icon: Sun, desc: '旧纸 · 墨 · 浅灰' },
  { value: 'dark', label: '深色', icon: Moon, desc: '墨黑 · 黛青 · 灰白' },
  { value: 'system', label: '跟随系统', icon: Monitor, desc: '随设备自动切换' },
]

const LAYOUTS: { value: LayoutMode; label: string; icon: typeof LayoutGrid; desc: string }[] = [
  { value: 'desktop', label: '桌面工作台', icon: LayoutGrid, desc: '侧栏 · 宽内容区' },
  { value: 'mobile', label: '移动终端', icon: Smartphone, desc: '底部导航 · 单列' },
  { value: 'auto', label: '自动', icon: Monitor, desc: '按宽度自适应' },
]

const STEPS = ['迎', '色', '局', '水', '成']

export function Onboarding() {
  const settings = useSettingsStore()
  const [step, setStep] = useState(0)
  const [theme, setTheme] = useState<ThemeMode>(settings.theme)
  const [layout, setLayout] = useState<LayoutMode>(settings.layoutMode)
  const [water, setWater] = useState(String(settings.waterGoalMl))

  const finish = () => {
    settings.set({
      theme,
      layoutMode: layout,
      waterGoalMl: Number(water) || 2000,
      onboarded: true,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-paper p-4">
      <div className="w-full max-w-md py-8">
        {/* 步骤指示 */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  'display flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors',
                  i < step
                    ? 'border-cinnabar bg-cinnabar text-on-cinnabar'
                    : i === step
                      ? 'border-cinnabar text-cinnabar'
                      : 'border-line text-ink-faint',
                )}
              >
                {i < step ? <Check size={13} /> : s}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" />}
            </div>
          ))}
        </div>

        <div className="text-center">
          {step === 0 && (
            <div className="animate-[page-fade_240ms_ease]">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink">
                <Palette size={28} className="text-bronze" />
              </div>
              <h1 className="display text-2xl font-semibold text-ink">
                个人异术工作台
              </h1>
              <p className="mx-auto mt-3 max-w-[300px] text-sm leading-relaxed text-ink-muted">
                一座现代的「Personal OS」，以东方异术的视觉语言，安放你的日常。
                数据全部保存在本机，离线可用，随时打开。
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="animate-[page-fade_240ms_ease]">
              <h2 className="display text-xl font-semibold text-ink">选择主题</h2>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={cn(
                      'rounded-paper border p-4 text-center transition-colors',
                      theme === t.value
                        ? 'border-cinnabar/50 bg-cinnabar/5'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <t.icon size={20} className="mx-auto mb-2 text-ink-soft" />
                    <div className="text-sm font-medium text-ink">{t.label}</div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-[page-fade_240ms_ease]">
              <h2 className="display text-xl font-semibold text-ink">选择布局</h2>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLayout(l.value)}
                    className={cn(
                      'rounded-paper border p-4 text-center transition-colors',
                      layout === l.value
                        ? 'border-cinnabar/50 bg-cinnabar/5'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <l.icon size={20} className="mx-auto mb-2 text-ink-soft" />
                    <div className="text-sm font-medium text-ink">{l.label}</div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">{l.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-[page-fade_240ms_ease]">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal/10">
                <Droplet size={24} className="text-teal" />
              </div>
              <h2 className="display text-xl font-semibold text-ink">每日喝水目标</h2>
              <p className="mt-2 text-sm text-ink-muted">给自己定一个可达成的量</p>
              <div className="mx-auto mt-5 flex max-w-[200px] items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={water}
                  onChange={(e) => setWater(e.target.value)}
                  className="text-center"
                  autoFocus
                />
                <span className="text-sm text-ink-faint">ml</span>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-[page-fade_240ms_ease]">
              <div className="display text-4xl font-semibold text-ink">入席</div>
              <p className="mt-3 text-sm text-ink-muted">
                案台已备，笔墨已研。从今天开始，安顿你的日常。
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          {step > 0 && (
            <Button variant="tertiary" onClick={() => setStep((s) => s - 1)}>
              上一步
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              下一步
            </Button>
          ) : (
            <Button variant="ritual" onClick={finish}>
              进入工作台
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
