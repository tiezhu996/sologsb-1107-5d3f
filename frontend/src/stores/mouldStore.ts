import { create } from 'zustand'
import type { Mould, MouldInput, MouldStateValue } from '../types/mould'
import { db, plain } from '../utils/db'
import { calculateMeshDensity } from '../utils/stripe'
import { emitSettlementChange, refreshStaleSettlements } from '../utils/settlementEngine'

interface MouldStore {
  moulds: Mould[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadMoulds: () => Promise<void>
  addMould: (input: MouldInput) => Promise<Mould | null>
  setMouldState: (id: number, state: MouldStateValue) => Promise<void>
  reviseMouldStandard: (id: number, stripeGap: number, wireDiameter: number) => Promise<boolean>
}

export const useMouldStore = create<MouldStore>((set, get) => ({
  moulds: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadMoulds: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const moulds = await db.moulds.orderBy('mouldNo').toArray()
      set({ moulds, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '纸帘台帐读取失败，请检查浏览器存储权限' })
    }
  },
  addMould: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.moulds.add(payload))
      const created: Mould = { ...payload, id, schemaRev: 2, rev: 1 }
      set((state) => ({ moulds: [created, ...state.moulds] }))
      return created
    } catch {
      set({ error: '纸帘登记失败，请检查编号是否重复' })
      return null
    }
  },
  setMouldState: async (id, nextState) => {
    try {
      await db.moulds.update(id, { state: nextState, schemaRev: 2 })
      set((state) => ({
        moulds: state.moulds.map((mould) => (mould.id === id ? { ...mould, state: nextState, schemaRev: 2 } : mould)),
        error: null,
      }))
    } catch {
      set({ error: '纸帘状态更新失败' })
    }
  },
  reviseMouldStandard: async (id, stripeGap, wireDiameter) => {
    set({ error: null })
    try {
      const current = await db.moulds.get(id)
      if (!current) throw new Error('纸帘不存在')
      const meshDensity = calculateMeshDensity(wireDiameter, stripeGap)
      await db.moulds.update(id, {
        stripeGap,
        wireDiameter,
        meshDensity,
        rev: (current.rev ?? 1) + 1,
        schemaRev: 2,
      })
      set((state) => ({
        moulds: state.moulds.map((mould) =>
          mould.id === id ? { ...mould, stripeGap, wireDiameter, meshDensity, rev: (mould.rev ?? 1) + 1 } : mould,
        ),
        error: null,
      }))
      // 主数据一变，关联结算立即失效并进入待对账
      await refreshStaleSettlements()
      emitSettlementChange()
      return true
    } catch {
      set({ error: '帘纹标准修订失败' })
      return false
    }
  },
}))
