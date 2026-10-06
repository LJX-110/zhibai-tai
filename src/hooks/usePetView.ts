/**
 * 桌宠 · 视图帧状态（渲染层要的那几个字段 + 重播语义）
 *
 * 从 `usePetLoop` 拆出（它顶到单文件 400 行上限，与 `usePetMovement` / `usePetDrag`
 * 同一条理由）。这里只回答一个问题：**现在屏幕上要显示哪一帧** ——
 * 素材名 / URL / 朝向 / 重播序号。位置不在其中（位置由 `usePetMovement` 直接写 DOM）。
 *
 * ## 重播序号（seq）为什么重要（2026-10-07 修用户上报的"点动作没反应"）
 * 渲染层用 `anim + seq` 做 `<img key>`：key 变 = 从第一帧重播。
 * 只按素材名做 key 时，点击回应 / 动作**抽到与上一段相同的素材**就不会重挂载，
 * 看起来像"点了没反应"。规则：
 *  · **插播**（`clicked` / `action`）→ 永远递增（同名也重播）；
 *  · idle / 语义状态保持 → 同名不递增（素材自己在循环，重播会变成周期性抽搐）；
 *  · 拖动姿态（`setDrag`）→ 永远递增（"被拎起来"要立刻从头演）。
 */
import { useCallback, useState } from 'react'
import type { Facing, PetPhase } from '../services/pet/state-machine'

export interface PetView {
  /** 素材名（`<img key>` 的一部分：不换 key 同一张动图不会从第一帧重播） */
  anim: string
  /** 素材 URL —— 由宿主适配层解析，渲染层不拼路径（见 `services/pet/adapter.ts`） */
  src: string
  facing: Facing
  /** 重播序号 —— key 的另一半，规则见文件头 */
  seq: number
}

/** 该相位是否"插播"（即便素材同名也要从第一帧重播） */
function isInterruption(phase: PetPhase): boolean {
  return phase === 'clicked' || phase === 'action'
}

/** 一段决策里视图关心的字段（`PetRuntime` 的切片，避免这里认识整个状态机） */
export interface ViewInput {
  anim: string
  facing: Facing
  phase: PetPhase
}

export interface PetViewStore {
  view: PetView | null
  /** 落一段决策；`src` 由调用方（唯一认识宿主的地方）解析好传入 */
  show: (next: ViewInput, src: string) => void
  /** 初始帧（挂载时直出；seq 从 0 起） */
  init: (anim: string, src: string, facing: Facing) => void
  /** 拖动姿态：换素材并**强制重播** */
  setDrag: (anim: string, src: string) => void
}

export function usePetView(): PetViewStore {
  const [view, setView] = useState<PetView | null>(null)

  const show = useCallback((next: ViewInput, src: string) => {
    setView((v) => ({
      anim: next.anim,
      src,
      facing: next.facing,
      // 换素材 或 插播 → 递增（key 变 → 从第一帧重播）；否则原样（动画继续循环）
      seq: (v?.seq ?? 0) + (v?.anim !== next.anim || isInterruption(next.phase) ? 1 : 0),
    }))
  }, [])

  const init = useCallback((anim: string, src: string, facing: Facing) => {
    setView({ anim, src, facing, seq: 0 })
  }, [])

  const setDrag = useCallback((anim: string, src: string) => {
    setView((v) => (v ? { ...v, anim, src, seq: v.seq + 1 } : v))
  }, [])

  return { view, show, init, setDrag }
}