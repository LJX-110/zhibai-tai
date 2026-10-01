/**
 * 桌宠 · 配置载入与派生（Step 5-1 · E5 拆出）
 *
 * `usePetLoop` 从 400 行的边线上拆下来的第一块 —— 它是一段**语义完整**的职责：
 * 「把 config.json 读进来，并把两个由它派生的东西（cfgRef / 首屏预热名单）一起交给调用方」。
 *
 * ## 两条纪律（拆出来时原样保留）
 *  1. **失败显式上报、不上屏**：配置读不到就不留一个"半死不活"的宠物 ——
 *     记进故障流水（`recordError`）并保持 `cfg === null`，渲染层据此不渲染；
 *  2. **预热名单必须 memo**：`cfg` 载入后不再变，引用稳定才能安全地进渲染层 effect 依赖；
 *     不 memo 的话每次渲染都是新数组，那个 effect 会被反复触发，预热变成反复请求。
 *
 * ⚠️ `cfgRef` 与 `cfg` 并存不是冗余：`cfg` 参与渲染（尺寸、预热），
 * `cfgRef` 供**定时链与订阅回调**取最新值（它们不在渲染期，读不到 state）。
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { loadPetConfig } from '../services/pet/config'
import { warmupAnims } from '../services/pet/animation-policy'
import { recordError } from '../services/error-log'
import type { PetConfig } from '../services/pet/types'

export interface PetConfigState {
  /** 已载入的配置（未就绪 / 失败时为 null —— 调用方据此不渲染宠物） */
  cfg: PetConfig | null
  /** 同一份配置的 ref，供非渲染期（定时链 / 订阅回调）读取 */
  cfgRef: RefObject<PetConfig | null>
  /** 首屏预热名单（待机池 + 点击应答池，从配置派生），引用稳定 */
  warmup: string[]
}

export function usePetConfig(): PetConfigState {
  const [cfg, setCfg] = useState<PetConfig | null>(null)
  const cfgRef = useRef<PetConfig | null>(null)

  // 载入配置：失败显式上报 + 不上屏（不留一个"半死不活"的宠物）
  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    void loadPetConfig(ctrl.signal)
      .then((c) => {
        if (!alive) return
        cfgRef.current = c
        setCfg(c)
      })
      .catch((e: unknown) => {
        if (!alive) return
        recordError({
          kind: 'error',
          message: `桌宠配置加载失败：${e instanceof Error ? e.message : String(e)}`,
          where: 'pet/config',
        })
      })
    return () => {
      alive = false
      ctrl.abort()
    }
  }, [])

  const warmup = useMemo(() => (cfg ? warmupAnims(cfg) : []), [cfg])

  return { cfg, cfgRef, warmup }
}
