/** 财：收支 / 购买 / 预算 数据访问 */
import { db } from '../db/db'
import type { Budget, FinanceRecord, Purchase } from '../types/entities'
import { createRepository } from './repo'

export const financeRepo = createRepository<FinanceRecord>(db.financeRecords)
export const purchaseRepo = createRepository<Purchase>(db.purchases)
export const budgetRepo = createRepository<Budget>(db.budgets)
