import { create } from 'zustand'
import type { PaperSample, PaperSampleInput } from '../types/paper-sample'
import { db, plain } from '../utils/db'

interface SampleStore {
  paperSamples: PaperSample[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadSamples: () => Promise<void>
  addSample: (input: PaperSampleInput) => Promise<PaperSample | null>
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
      const created: PaperSample = { ...payload, id, schemaRev: 2 }
      set((state) => ({ paperSamples: [created, ...state.paperSamples] }))
      return created
    } catch {
      set({ error: '样本登记失败，请检查样本编号是否重复' })
      return null
    }
  },
}))
