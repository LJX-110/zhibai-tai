/** 系统能力接缝的**唯一出口**（外部只从这里 import，不直接拿具体实现） */
export {
  capabilityOf,
  getSnapshots,
  isFresh,
  refreshCapabilityStates,
  requestCapability,
  subscribeCapabilities,
} from './registry'
export { VALUE_TTL_MS, type Capability, type CapabilityKind, type CapabilitySnapshot, type CapabilityState } from './types'
