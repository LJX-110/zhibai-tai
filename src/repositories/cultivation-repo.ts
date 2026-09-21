/** 修行状态数据访问（单行表，随快照跨设备同步） */
import { db } from '../db/db'
import type { CultivationState } from '../types/entities'
import { createSingletonRepository } from './singleton'
import { emptyCultivationState } from '../services/cultivation'

/** 初始行形态取自 `emptyCultivationState()` —— 境界门槛的单一事实源在 service 里，
 *  这里不重复写一份初始值，否则改门槛时会漏掉这一处。 */
const single = createSingletonRepository<CultivationState>(db.cultivation, 'cultivation', () => ({
  ...emptyCultivationState(),
  createdAt: '',
  updatedAt: '',
}))

/** 读取修行状态；从未落库时返回 null（由调用方决定是否建行） */
export const readCultivationState = (): Promise<CultivationState | null> => single.read()

/** 写入修行状态（存在则更新，不存在则建行） */
export const writeCultivationState = (
  patch: Partial<Omit<CultivationState, 'id'>>,
): Promise<void> => single.write(patch)
