import { create } from 'zustand'
import type { FiberBatch, FiberBatchInput } from '../types/fiber-batch'
import { db, plain } from '../utils/db'

interface FiberStore {
  fiberBatches: FiberBatch[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadFiberBatches: () => Promise<void>
  addFiberBatch: (input: FiberBatchInput) => Promise<FiberBatch | null>
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
      const created: FiberBatch = { ...payload, id, schemaRev: 2 }
      set((state) => ({ fiberBatches: [created, ...state.fiberBatches] }))
      return created
    } catch {
      set({ error: '料批登记失败，请检查批次编号是否重复' })
      return null
    }
  },
}))
