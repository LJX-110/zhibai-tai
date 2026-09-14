/** 偏好设置数据访问（单行表，随快照跨设备同步） */
import { db } from '../db/db'
import type { AppSettingsRow } from '../types/entities'
import { createRepository } from './repo'

export const appSettingsRepo = createRepository<AppSettingsRow>(db.appSettings)
