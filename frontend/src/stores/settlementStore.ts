import { create } from 'zustand'
import type { BatchSettleResult, ReconcileReport, Settlement, SettlementTask } from '../types/settlement'
import { db } from '../utils/db'
import {
  batchSettleMonth,
  createSettlement,
  loadBundle,
  reconcileSettlement,
  refreshStaleSettlements,
  subscribeSettlements,
  syncAllTaskPeriods,
  syncTasksForPeriod,
  type MasterBundle,
} from '../utils/settlementEngine'

interface SettlementStore {
  settlements: Settlement[]
  tasks: SettlementTask[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  lastBatchResult: BatchSettleResult | null
  init: () => Promise<void>
  reload: () => Promise<void>
  syncPeriod: (period: string) => Promise<void>
  runBatch: (period: string) => Promise<BatchSettleResult>
  reconcile: (id: number) => Promise<{ ok: boolean; report: ReconcileReport | null }>
  settleRuns: (runIds: number[]) => Promise<boolean>
  getBundle: () => Promise<MasterBundle>
}

let initPromise: Promise<void> | null = null
let subscribed = false

async function loadData(): Promise<{ settlements: Settlement[]; tasks: SettlementTask[] }> {
  const [settlements, tasks] = await Promise.all([
    db.settlements.orderBy('sealedAt').reverse().toArray(),
    db.settlementTasks.orderBy('period').reverse().toArray(),
  ])
  return { settlements, tasks }
}

export const useSettlementStore = create<SettlementStore>((set, get) => ({
  settlements: [],
  tasks: [],
  isLoading: false,
  loaded: false,
  error: null,
  lastBatchResult: null,

  init: async () => {
    if (get().loaded) return
    if (!initPromise) {
      set({ isLoading: true, error: null })
      initPromise = (async () => {
        await syncAllTaskPeriods()
        await refreshStaleSettlements()
        const data = await loadData()
        set({ ...data, isLoading: false, loaded: true })
      })().catch((error) => {
        initPromise = null
        set({ isLoading: false, error: error instanceof Error ? error.message : '结算档案读取失败' })
      })
      if (!subscribed) {
        subscribed = true
        subscribeSettlements(() => {
          void get().reload()
        })
      }
    }
    await initPromise
  },

  reload: async () => {
    try {
      const data = await loadData()
      set({ ...data, error: null })
    } catch {
      set({ error: '结算档案刷新失败，请重试' })
    }
  },

  syncPeriod: async (period) => {
    try {
      await syncTasksForPeriod(period)
      await get().reload()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '批组同步失败' })
    }
  },

  runBatch: async (period) => {
    set({ error: null })
    try {
      const result = await batchSettleMonth(period)
      set({ lastBatchResult: result })
      await get().reload()
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量结案失败'
      set({ error: message })
      return { period, settled: 0, skipped: [] }
    }
  },

  reconcile: async (id) => {
    set({ error: null })
    try {
      const result = await reconcileSettlement(id)
      return result
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '重新对账失败，请重试' })
      return { ok: false, report: null }
    }
  },

  settleRuns: async (runIds) => {
    set({ error: null })
    try {
      await createSettlement(runIds)
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '结案失败' })
      return false
    }
  },

  getBundle: () => loadBundle(),
}))
