import { create } from 'zustand'
import type { SheetRun, SheetRunInput } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { calculateDeviation } from '../utils/stripe'
import { emitSettlementChange, refreshStaleSettlements } from '../utils/settlementEngine'

interface RunStore {
  sheetRuns: SheetRun[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadRuns: () => Promise<void>
  addRun: (input: SheetRunInput) => Promise<SheetRun | null>
  updateMeasuredGap: (id: number, measuredGap: number, standardGap: number) => Promise<void>
}

export const useRunStore = create<RunStore>((set, get) => ({
  sheetRuns: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadRuns: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const sheetRuns = await db.sheetRuns.orderBy('runDate').reverse().toArray()
      set({ sheetRuns, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '抄纸工序读取失败，请检查浏览器存储权限' })
    }
  },
  addRun: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.sheetRuns.add(payload))
      const created: SheetRun = { ...payload, id, schemaRev: 2, rev: 1 }
      set((state) => ({ sheetRuns: [created, ...state.sheetRuns] }))
      return created
    } catch {
      set({ error: '工序登记失败，请检查工序编号是否重复' })
      return null
    }
  },
  updateMeasuredGap: async (id, measuredGap, standardGap) => {
    const deviation = calculateDeviation(measuredGap, standardGap)
    try {
      const current = await db.sheetRuns.get(id)
      const rev = (current?.rev ?? 1) + 1
      await db.sheetRuns.update(id, { measuredGap, deviation, rev, schemaRev: 2 })
      set((state) => ({
        sheetRuns: state.sheetRuns.map((run) =>
          run.id === id ? { ...run, measuredGap, deviation, rev, schemaRev: 2 } : run,
        ),
        error: null,
      }))
      // 实测偏差改动，已封存结算立即失效并进入待对账
      await refreshStaleSettlements()
      emitSettlementChange()
    } catch {
      set({ error: '实测间距更新失败' })
    }
  },
}))
