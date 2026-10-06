import type { FiberBatch } from '../types/fiber-batch'
import type { Mould } from '../types/mould'
import type { PaperSample } from '../types/paper-sample'
import type { Settlement, SettlementReconciliation, SettlementSnapshot } from '../types/settlement'
import type { SheetRun } from '../types/sheet-run'
import { isGapOutOfTolerance } from './stripe'

function byId<T extends { id?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
}

export function computeFingerprint(
  moulds: Mould[],
  batches: FiberBatch[],
  runs: SheetRun[],
  samples: PaperSample[],
  missing: string[] = [],
): string {
  return JSON.stringify({
    moulds: byId(moulds).map((mould) => [mould.id, mould.mouldNo, mould.stripeGap, mould.wireDiameter, mould.meshDensity, mould.state]),
    batches: byId(batches).map((batch) => [batch.id, batch.batchNo, batch.material, batch.beatingDegree]),
    runs: byId(runs).map((run) => [run.id, run.runNo, run.mouldId, run.batchId, run.runDate, run.measuredGap, run.deviation]),
    samples: byId(samples).map((sample) => [sample.id, sample.sampleNo, sample.runId, sample.stripeCount, sample.evenness]),
    missing: [...missing].sort(),
  })
}

export function buildSnapshot(runs: SheetRun[], samples: PaperSample[], moulds: Mould[], batches: FiberBatch[]): SettlementSnapshot {
  const sortedRuns = byId(runs)
  const sortedSamples = byId(samples)
  const sortedMoulds = byId(moulds)
  const sortedBatches = byId(batches)
  const sampledRunIds = new Set(sortedSamples.map((sample) => sample.runId))
  const sampledRunCount = sortedRuns.filter((run) => run.id !== undefined && sampledRunIds.has(run.id)).length
  const qualifiedCount = sortedRuns.filter(
    (run) => run.id !== undefined && sampledRunIds.has(run.id) && !isGapOutOfTolerance(run.deviation),
  ).length
  const avgDeviation = sortedRuns.length
    ? Number((sortedRuns.reduce((sum, run) => sum + run.deviation, 0) / sortedRuns.length).toFixed(2))
    : 0
  const completionRate = sortedRuns.length ? Math.round((qualifiedCount / sortedRuns.length) * 100) : 0
  return {
    moulds: sortedMoulds.map((mould) => ({
      mouldId: mould.id ?? 0,
      mouldNo: mould.mouldNo,
      stripeGap: mould.stripeGap,
      meshDensity: mould.meshDensity,
    })),
    batches: sortedBatches.map((batch) => ({
      batchId: batch.id ?? 0,
      batchNo: batch.batchNo,
      material: batch.material,
      beatingDegree: batch.beatingDegree,
    })),
    runs: sortedRuns.map((run) => ({
      runId: run.id ?? 0,
      runNo: run.runNo,
      runDate: run.runDate,
      mouldId: run.mouldId,
      batchId: run.batchId,
      measuredGap: run.measuredGap,
      deviation: run.deviation,
    })),
    samples: sortedSamples.map((sample) => ({
      sampleId: sample.id ?? 0,
      sampleNo: sample.sampleNo,
      runId: sample.runId,
      stripeCount: sample.stripeCount,
      evenness: sample.evenness,
    })),
    avgDeviation,
    sampledRunCount,
    completionRate,
    fingerprint: computeFingerprint(sortedMoulds, sortedBatches, sortedRuns, sortedSamples),
  }
}

export function diffSnapshots(frozen: SettlementSnapshot, current: SettlementSnapshot): SettlementReconciliation {
  const gapStdChanges = current.moulds.flatMap((mould) => {
    const prev = frozen.moulds.find((item) => item.mouldId === mould.mouldId)
    return prev && prev.stripeGap !== mould.stripeGap ? [{ mouldNo: mould.mouldNo, from: prev.stripeGap, to: mould.stripeGap }] : []
  })
  const beatingDegreeChanges = current.batches.flatMap((batch) => {
    const prev = frozen.batches.find((item) => item.batchId === batch.batchId)
    return prev && prev.beatingDegree !== batch.beatingDegree
      ? [{ batchNo: batch.batchNo, from: prev.beatingDegree, to: batch.beatingDegree }]
      : []
  })
  const deviationChanges = current.runs.flatMap((run) => {
    const prev = frozen.runs.find((item) => item.runId === run.runId)
    return prev && prev.deviation !== run.deviation ? [{ runNo: run.runNo, from: prev.deviation, to: run.deviation }] : []
  })
  return {
    reconciledAt: new Date().toISOString(),
    snapshot: current,
    gapStdChanges,
    beatingDegreeChanges,
    deviationChanges,
    sampleCountDelta: current.samples.length - frozen.samples.length,
    completionRate: current.completionRate,
    frozenCompletionRate: frozen.completionRate,
  }
}

export function getEffectiveSnapshot(settlement: Settlement): SettlementSnapshot {
  return settlement.reconciliation?.snapshot ?? settlement.frozen
}

export function getCloseBlockReason(settlement: Settlement): string | null {
  if (settlement.status === '已结案') return '该结算单已结案'
  if (settlement.status === '待对账') return '主数据已变更，需先完成对账'
  const snapshot = getEffectiveSnapshot(settlement)
  const mouldNos = [...new Set(snapshot.runs.map((run) => {
    const mould = snapshot.moulds.find((item) => item.mouldId === run.mouldId)
    return mould?.mouldNo ?? `#${run.mouldId}`
  }))]
  if (mouldNos.length > 1) {
    return `混入 ${mouldNos.length} 张纸帘（${mouldNos.join('、')}），需拆分后才能结案`
  }
  const unsampledRuns = snapshot.runs.filter((run) => !snapshot.samples.some((sample) => sample.runId === run.runId))
  if (unsampledRuns.length > 0) {
    return `样本未齐：${unsampledRuns.map((run) => run.runNo).join('、')} 尚无样本`
  }
  return null
}
