/** 桌宠状态数据访问（单行表，随快照跨设备同步） */
import { db } from '../db/db'
import type { PetState } from '../types/entities'
import { createSingletonRepository } from './singleton'

const single = createSingletonRepository<PetState>(db.petState, 'pet', () => ({
  id: 'pet',
  position: { x: 0, y: 0 },
  affinity: 0,
  lastAction: null,
  createdAt: '',
  updatedAt: '',
}))

/** 读取宠物状态；从未落库时返回 null（不伪造一行，避免"读一次就多出一条待同步记录"） */
export const readPetState = (): Promise<PetState | null> => single.read()

/** 写入宠物状态（存在则更新字段，不存在则建行） */
export const writePetState = (patch: Partial<Omit<PetState, 'id'>>): Promise<void> =>
  single.write(patch)
