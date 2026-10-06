import { create } from 'zustand'
import type { FiberBatch } from '../types/fiber-batch'
import type { Mould } from '../types/mould'
import type { PaperSample } from '../types/paper-sample'
import type { BatchCloseResult, Settlement } from '../types/settlement'
import type { SheetRun } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { buildSnapshot, computeFingerprint, diffSnapshots, getCloseBlockReason } from '../utils/settlement'

interface LiveData {
  moulds: Mould[]
  batches: FiberBatch[]
  runs: SheetRun[]
  samples: PaperSample[]
  missing: string[]
}

async function gatherLiveData(settlement: Settlement): Promise<LiveData> {
  const [moulds, batches, runs, samples] = await Promise.all([
    db.moulds.toArray(),
    db.fiberBatches.toArray(),
    db.sheetRuns.toArray(),
    db.paperSamples.toArray(),
  ])
  const runIdSet = new Set(settlement.runIds)
  const liveRuns = runs.filter((run) => run.id !== undefined && runIdSet.has(run.id))
  const missing: string[] = []
  if (liveRuns.length !== settlement.runIds.length) {
    const foundIds = new Set(liveRuns.map((run) => run.id))
    const lost = settlement.frozen.runs.filter((run) => !foundIds.has(run.runId)).map((run) => run.runNo)
    missing.push(`工序缺失 ${settlement.runIds.length - liveRuns.length} 条${lost.length ? `（${lost.join('、')}）` : ''}`)
  }
  const liveRunIds = new Set(liveRuns.map((run) => run.id))
  const liveSamples = samples.filter((sample) => liveRunIds.has(sample.runId))
  const mouldIds = [...new Set(liveRuns.map((run) => run.mouldId))]
  const batchIds = [...new Set(liveRuns.map((run) => run.batchId))]
  const liveMoulds = moulds.filter((mould) => mould.id !== undefined && mouldIds.includes(mould.id))
  const liveBatches = batches.filter((batch) => batch.id !== undefined && batchIds.includes(batch.id))
  if (liveMoulds.length !== mouldIds.length) missing.push('关联纸帘已删除')
  if (liveBatches.length !== batchIds.length) missing.push('关联料批已删除')
  return { moulds: liveMoulds, batches: liveBatches, runs: liveRuns, samples: liveSamples, missing }
}

interface SettlementStore {
  settlements: Settlement[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadSettlements: () => Promise<void>
  createSettlement: (period: string) => Promise<Settlement | null>
  syncWithMasterData: () => Promise<void>
  reconcile: (id: number) => Promise<boolean>
  closeSettlement: (id: number) => Promise<string | null>
  closeBatch: () => Promise<BatchCloseResult>
}

export const useSettlementStore = create<SettlementStore>((set, get) => ({
  settlements: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadSettlements: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      await get().syncWithMasterData()
      const settlements = (await db.settlements.toArray()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
      set({ settlements, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '结算单读取失败，请检查浏览器存储权限' })
    }
  },
  createSettlement: async (period) => {
    set({ error: null })
    try {
      const [moulds, batches, runs, samples, existing] = await Promise.all([
        db.moulds.toArray(),
        db.fiberBatches.toArray(),
        db.sheetRuns.toArray(),
        db.paperSamples.toArray(),
        db.settlements.toArray(),
      ])
      const settledRunIds = new Set(existing.flatMap((settlement) => settlement.runIds))
      const periodRuns = runs.filter((run) => run.runDate.startsWith(period) && run.id !== undefined && !settledRunIds.has(run.id))
      if (periodRuns.length === 0) {
        set({ error: `账期 ${period} 没有可结算的工序` })
        return null
      }
      const runIds = periodRuns.map((run) => run.id as number)
      const runIdSet = new Set(runIds)
      const periodSamples = samples.filter((sample) => runIdSet.has(sample.runId))
      const mouldIds = [...new Set(periodRuns.map((run) => run.mouldId))]
      const batchIds = [...new Set(periodRuns.map((run) => run.batchId))]
      const relatedMoulds = moulds.filter((mould) => mould.id !== undefined && mouldIds.includes(mould.id))
      const relatedBatches = batches.filter((batch) => batch.id !== undefined && batchIds.includes(batch.id))
      if (relatedMoulds.length !== mouldIds.length || relatedBatches.length !== batchIds.length) {
        set({ error: '关联纸帘或料批缺失，无法生成结算单' })
        return null
      }
      const frozen = buildSnapshot(periodRuns, periodSamples, relatedMoulds, relatedBatches)
      const usedNos = new Set(existing.map((settlement) => settlement.settlementNo))
      let seq = existing.filter((settlement) => settlement.period === period).length + 1
      let settlementNo = `JS-${period.replace('-', '')}-${String(seq).padStart(2, '0')}`
      while (usedNos.has(settlementNo)) {
        seq += 1
        settlementNo = `JS-${period.replace('-', '')}-${String(seq).padStart(2, '0')}`
      }
      const settlement: Settlement = {
        settlementNo,
        period,
        createdAt: new Date().toISOString(),
        status: '已结算',
        runIds,
        sampleIds: periodSamples.map((sample) => sample.id as number),
        mouldIds,
        batchIds,
        frozen,
        dataFingerprint: frozen.fingerprint,
        schemaRev: 3,
      }
      const id = Number(await db.settlements.add(plain(settlement)))
      const created: Settlement = { ...settlement, id }
      set((state) => ({ settlements: [created, ...state.settlements] }))
      return created
    } catch {
      set({ error: '结算单生成失败，请稍后重试' })
      return null
    }
  },
  syncWithMasterData: async () => {
    try {
      const settlements = await db.settlements.toArray()
      const open = settlements.filter((settlement) => settlement.status === '已结算')
      if (open.length === 0) return
      const changed: Settlement[] = []
      for (const settlement of open) {
        const live = await gatherLiveData(settlement)
        const fingerprint = computeFingerprint(live.moulds, live.batches, live.runs, live.samples, live.missing)
        if (fingerprint !== settlement.dataFingerprint) {
          changed.push({ ...settlement, status: '待对账' })
        }
      }
      if (changed.length === 0) return
      await db.settlements.bulkPut(plain(changed))
      if (get().loaded) {
        const changedById = new Map(changed.map((settlement) => [settlement.id, settlement]))
        set((state) => ({
          settlements: state.settlements.map((settlement) => changedById.get(settlement.id) ?? settlement),
        }))
      }
    } catch {
      set({ error: '结算状态同步失败，请刷新后重试' })
    }
  },
  reconcile: async (id) => {
    const settlement = get().settlements.find((item) => item.id === id) ?? (await db.settlements.get(id))
    if (!settlement || settlement.status !== '待对账') return false
    const live = await gatherLiveData(settlement)
    if (live.missing.length > 0) {
      const failed: Settlement = {
        ...settlement,
        reconcileError: `对账失败：${live.missing.join('；')}。原结算保留，补齐数据后可重新对账。`,
      }
      await db.settlements.put(plain(failed))
      set((state) => ({
        settlements: state.settlements.map((item) => (item.id === id ? failed : item)),
        error: null,
      }))
      return false
    }
    const current = buildSnapshot(live.runs, live.samples, live.moulds, live.batches)
    const reconciliation = diffSnapshots(settlement.frozen, current)
    const next: Settlement = {
      ...settlement,
      status: '已结算',
      dataFingerprint: current.fingerprint,
      reconciliation,
    }
    delete next.reconcileError
    await db.settlements.put(plain(next))
    set((state) => ({
      settlements: state.settlements.map((item) => (item.id === id ? next : item)),
      error: null,
    }))
    return true
  },
  closeSettlement: async (id) => {
    const settlement = get().settlements.find((item) => item.id === id) ?? (await db.settlements.get(id))
    if (!settlement) return '结算单不存在'
    const reason = getCloseBlockReason(settlement)
    if (reason) return reason
    const next: Settlement = { ...settlement, status: '已结案', closedAt: new Date().toISOString() }
    await db.settlements.put(plain(next))
    set((state) => ({
      settlements: state.settlements.map((item) => (item.id === id ? next : item)),
      error: null,
    }))
    return null
  },
  closeBatch: async () => {
    const open = get().settlements.filter((settlement) => settlement.status !== '已结案')
    const result: BatchCloseResult = { closedCount: 0, skipped: [] }
    for (const settlement of open) {
      if (settlement.id === undefined) continue
      const reason = await get().closeSettlement(settlement.id)
      if (reason) {
        result.skipped.push({ settlementNo: settlement.settlementNo, reason })
      } else {
        result.closedCount += 1
      }
    }
    return result
  },
}))
