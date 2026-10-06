import { create } from 'zustand'
import type { FiberBatch, FiberBatchInput } from '../types/fiber-batch'
import { db, plain } from '../utils/db'
import { emitSettlementChange, refreshStaleSettlements } from '../utils/settlementEngine'

interface FiberStore {
  fiberBatches: FiberBatch[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadFiberBatches: () => Promise<void>
  addFiberBatch: (input: FiberBatchInput) => Promise<FiberBatch | null>
  reviseBeatingDegree: (id: number, beatingDegree: number) => Promise<boolean>
}

export const useFiberStore = create<FiberStore>((set, get) => ({
  fiberBatches: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadFiberBatches: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const fiberBatches = await db.fiberBatches.orderBy('batchNo').toArray()
      set({ fiberBatches, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '纤维料批读取失败，请检查浏览器存储权限' })
    }
  },
  addFiberBatch: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.fiberBatches.add(payload))
      const created: FiberBatch = { ...payload, id, schemaRev: 2, rev: 1 }
      set((state) => ({ fiberBatches: [created, ...state.fiberBatches] }))
      return created
    } catch {
      set({ error: '料批登记失败，请检查批次编号是否重复' })
      return null
    }
  },
  reviseBeatingDegree: async (id, beatingDegree) => {
    set({ error: null })
    try {
      const current = await db.fiberBatches.get(id)
      if (!current) throw new Error('料批不存在')
      await db.fiberBatches.update(id, { beatingDegree, rev: (current.rev ?? 1) + 1, schemaRev: 2 })
      set((state) => ({
        fiberBatches: state.fiberBatches.map((batch) =>
          batch.id === id ? { ...batch, beatingDegree, rev: (batch.rev ?? 1) + 1 } : batch,
        ),
        error: null,
      }))
      // 打浆度主数据变化，关联结算失效并进入待对账
      await refreshStaleSettlements()
      emitSettlementChange()
      return true
    } catch {
      set({ error: '打浆度修订失败' })
      return false
    }
  },
}))
