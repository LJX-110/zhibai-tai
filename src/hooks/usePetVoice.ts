/**
 * 桌宠语气参数（来自**当前人设**）
 *
 * 单一来源：`settings.activePersonaId` → `personas` 业务表。
 * 人设没选 / 被删了 / 字段解析不出来时，`voiceFromPersona` 会逐项回退到内置默认 ——
 * 桌宠不会因为"人设改坏了"而失语（见 `services/pet/voice.ts`）。
 */
import { useMemo } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'
import { usePersonaStore } from '../stores/usePersonaStore'
import { DEFAULT_VOICE, voiceFromPersona, type PetVoice } from '../services/pet/voice'

export function usePetVoice(): PetVoice {
  const activeId = useSettingsStore((s) => s.activePersonaId)
  const personas = usePersonaStore((s) => s.items)
  const loaded = usePersonaStore((s) => s.loaded)
  return useMemo(() => {
    // 没载入完就先给默认 —— 免得先亮出"重"的默认值再跳到人设值
    if (!loaded || !activeId) return DEFAULT_VOICE
    return voiceFromPersona(personas.find((p) => p.id === activeId) ?? null)
  }, [loaded, activeId, personas])
}