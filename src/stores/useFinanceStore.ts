/** 财 store */
import {
  budgetRepo,
  financeRepo,
  purchaseRepo,
} from '../repositories/finance-repo'
import type { Budget, FinanceRecord, Purchase } from '../types/entities'
import { createCrudStore } from './factory'

export const useFinanceStore = createCrudStore<FinanceRecord>(financeRepo)
export const usePurchaseStore = createCrudStore<Purchase>(purchaseRepo)
export const useBudgetStore = createCrudStore<Budget>(budgetRepo)
