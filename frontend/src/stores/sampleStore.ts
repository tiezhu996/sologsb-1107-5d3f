import { create } from 'zustand'
import type { EvennessLevel, PaperSample, PaperSampleInput } from '../types/paper-sample'
import { db, plain } from '../utils/db'
import { emitSettlementChange, refreshStaleSettlements } from '../utils/settlementEngine'

interface SampleStore {
  paperSamples: PaperSample[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadSamples: () => Promise<void>
  addSample: (input: PaperSampleInput) => Promise<PaperSample | null>
  reviseSampleResult: (id: number, stripeCount: number, evenness: EvennessLevel) => Promise<boolean>
}

export const useSampleStore = create<SampleStore>((set, get) => ({
  paperSamples: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadSamples: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const paperSamples = await db.paperSamples.orderBy('sampleNo').toArray()
      set({ paperSamples, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '样本档案读取失败，请检查浏览器存储权限' })
    }
  },
  addSample: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.paperSamples.add(payload))
      const created: PaperSample = { ...payload, id, schemaRev: 2, rev: 1 }
      set((state) => ({ paperSamples: [created, ...state.paperSamples] }))
      return created
    } catch {
      set({ error: '样本登记失败，请检查样本编号是否重复' })
      return null
    }
  },
  reviseSampleResult: async (id, stripeCount, evenness) => {
    set({ error: null })
    try {
      const current = await db.paperSamples.get(id)
      if (!current) throw new Error('样本不存在')
      const rev = (current.rev ?? 1) + 1
      await db.paperSamples.update(id, { stripeCount, evenness, rev, schemaRev: 2 })
      set((state) => ({
        paperSamples: state.paperSamples.map((sample) =>
          sample.id === id ? { ...sample, stripeCount, evenness, rev } : sample,
        ),
        error: null,
      }))
      // 样本结果复测改动，已封存结算立即失效并进入待对账
      await refreshStaleSettlements()
      emitSettlementChange()
      return true
    } catch {
      set({ error: '样本结果复测失败' })
      return false
    }
  },
}))
