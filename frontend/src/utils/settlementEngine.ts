import type { FiberBatch } from '../types/fiber-batch'
import type { Mould } from '../types/mould'
import type { PaperSample } from '../types/paper-sample'
import type {
  BatchSettleResult,
  Fingerprints,
  ReconcileItem,
  ReconcileReport,
  SealedBatch,
  SealedMould,
  SealedRun,
  SealedSample,
  Settlement,
  SettlementTask,
  SkippedTask,
} from '../types/settlement'
import type { SheetRun } from '../types/sheet-run'
import { db, plain } from './db'
import { calculateDeviation } from './stripe'

/* ---------------------------------- 事件 ---------------------------------- */

type SettlementListener = () => void
const listeners = new Set<SettlementListener>()

/** 主数据改动、对账或批量结案后发出通知，页面据此刷新 */
export function subscribeSettlements(listener: SettlementListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitSettlementChange(): void {
  listeners.forEach((listener) => listener())
}

/* --------------------------------- 基础工具 -------------------------------- */

export function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7)
}

export function currentMonth(): string {
  return monthKey(new Date().toISOString())
}

export function taskKeyOf(period: string, mouldId: number): string {
  return `${period}|${mouldId}`
}

const revOf = (value: { rev?: number } | undefined): number => value?.rev ?? 1

function gapText(value: number): string {
  return `${value.toFixed(2)} mm`
}

function deviationText(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} mm`
}

function sampleText(stripeCount: number, evenness: string): string {
  return `${stripeCount} 条 · ${evenness}`
}

export interface MasterBundle {
  moulds: Map<number, Mould>
  batches: Map<number, FiberBatch>
  runs: Map<number, SheetRun>
  samples: PaperSample[]
  samplesByRun: Map<number, PaperSample[]>
}

export async function loadBundle(): Promise<MasterBundle> {
  const [moulds, batches, runs, samples] = await Promise.all([
    db.moulds.toArray(),
    db.fiberBatches.toArray(),
    db.sheetRuns.toArray(),
    db.paperSamples.toArray(),
  ])
  const samplesByRun = new Map<number, PaperSample[]>()
  samples.forEach((sample) => {
    const list = samplesByRun.get(sample.runId) ?? []
    list.push(sample)
    samplesByRun.set(sample.runId, list)
  })
  return {
    moulds: new Map(moulds.map((mould) => [mould.id as number, mould])),
    batches: new Map(batches.map((batch) => [batch.id as number, batch])),
    runs: new Map(runs.map((run) => [run.id as number, run])),
    samples,
    samplesByRun,
  }
}

/* ------------------------------- 结案前校验 ------------------------------- */

export interface GroupCheckResult {
  ok: boolean
  reason: string | null
  mouldId: number | null
  runIds: number[]
  batchIds: number[]
  sampleIds: number[]
}

/** 校验待结案工序组：必须成组、同一纸帘、主数据齐全、每槽样本齐备 */
export function evaluateRunsGroup(runs: SheetRun[], bundle: MasterBundle): GroupCheckResult {
  const runIds = runs.map((run) => run.id as number)
  if (runs.length === 0) {
    return { ok: false, reason: '批组内没有抄纸工序', mouldId: null, runIds: [], batchIds: [], sampleIds: [] }
  }

  const mouldIds = Array.from(new Set(runs.map((run) => run.mouldId)))
  if (mouldIds.length > 1) {
    const names = mouldIds.map((id) => bundle.moulds.get(id)?.mouldNo ?? `纸帘#${id}`)
    return { ok: false, reason: `混入不同纸帘的工序：${names.join('、')}，同一张结算单只能封存同一纸帘`, mouldId: null, runIds, batchIds: [], sampleIds: [] }
  }

  const mouldId = mouldIds[0]
  const mould = bundle.moulds.get(mouldId)
  if (!mould) {
    return { ok: false, reason: `纸帘 #${mouldId} 主数据缺失，请先补齐纸帘台帐`, mouldId, runIds, batchIds: [], sampleIds: [] }
  }

  const missingBatchRuns = runs.filter((run) => !bundle.batches.has(run.batchId))
  if (missingBatchRuns.length > 0) {
    return { ok: false, reason: `料批主数据缺失（${missingBatchRuns.map((run) => run.runNo).join('、')}），请先补齐料批台账`, mouldId, runIds, batchIds: [], sampleIds: [] }
  }

  const runsWithoutSamples = runs.filter((run) => (bundle.samplesByRun.get(run.id as number)?.length ?? 0) === 0)
  if (runsWithoutSamples.length > 0) {
    return {
      ok: false,
      reason: `样本未齐：${runsWithoutSamples.map((run) => run.runNo).join('、')} 共 ${runsWithoutSamples.length}/${runs.length} 槽尚无成纸样本`,
      mouldId,
      runIds,
      batchIds: [],
      sampleIds: [],
    }
  }

  const batchIds = Array.from(new Set(runs.map((run) => run.batchId)))
  const sampleIds = bundle.samples.filter((sample) => runIds.includes(sample.runId)).map((sample) => sample.id as number)
  return { ok: true, reason: null, mouldId, runIds, batchIds, sampleIds }
}

/* -------------------------------- 封存快照 -------------------------------- */

function buildFingerprints(runs: SheetRun[], mould: Mould, batches: FiberBatch[], samples: PaperSample[]): Fingerprints {
  return {
    moulds: { [mould.id as number]: revOf(mould) },
    batches: Object.fromEntries(batches.map((batch) => [batch.id as number, revOf(batch)])),
    runs: Object.fromEntries(runs.map((run) => [run.id as number, revOf(run)])),
    samples: Object.fromEntries(samples.map((sample) => [sample.id as number, revOf(sample)])),
  }
}

function buildSettlement(period: string, runs: SheetRun[], bundle: MasterBundle, supplementNo = 0): Settlement {
  const mould = bundle.moulds.get(runs[0].mouldId) as Mould
  const batches = Array.from(new Set(runs.map((run) => run.batchId)))
    .map((batchId) => bundle.batches.get(batchId))
    .filter((batch): batch is FiberBatch => Boolean(batch))
  const samples = bundle.samples.filter((sample) => runs.some((run) => run.id === sample.runId))
    .sort((a, b) => a.sampleNo.localeCompare(b.sampleNo))
  const now = new Date().toISOString()

  const mouldSnapshot: SealedMould = {
    mouldId: mould.id as number,
    mouldNo: mould.mouldNo,
    wireMaterial: mould.wireMaterial,
    wireDiameter: mould.wireDiameter,
    stripeGap: mould.stripeGap,
    meshDensity: mould.meshDensity,
    rev: revOf(mould),
  }
  const batchSnapshots: SealedBatch[] = batches.map((batch) => ({
    batchId: batch.id as number,
    batchNo: batch.batchNo,
    material: batch.material,
    beatingDegree: batch.beatingDegree,
    rev: revOf(batch),
  }))
  const runSnapshots: SealedRun[] = runs.map((run) => ({
    runId: run.id as number,
    runNo: run.runNo,
    mouldId: run.mouldId,
    batchId: run.batchId,
    runDate: run.runDate,
    grammage: run.grammage,
    measuredGap: run.measuredGap,
    standardGap: mould.stripeGap,
    deviation: calculateDeviation(run.measuredGap, mould.stripeGap),
    rev: revOf(run),
  }))
  const sampleSnapshots: SealedSample[] = samples.map((sample) => ({
    sampleId: sample.id as number,
    sampleNo: sample.sampleNo,
    runId: sample.runId,
    stripeCount: sample.stripeCount,
    evenness: sample.evenness,
    sizeMm: sample.sizeMm,
    archiveBin: sample.archiveBin,
    rev: revOf(sample),
  }))

  return {
    settlementNo: `JS-${period.replace(/-/g, '')}-${mould.mouldNo}${supplementNo > 0 ? `-补${supplementNo}` : ''}`,
    period,
    mouldId: mould.id as number,
    mouldNo: mould.mouldNo,
    status: 'sealed',
    runIds: runs.map((run) => run.id as number),
    batchIds: batches.map((batch) => batch.id as number),
    sampleIds: sampleSnapshots.map((sample) => sample.sampleId),
    mouldSnapshot,
    batchSnapshots,
    runSnapshots,
    sampleSnapshots,
    fingerprints: buildFingerprints(runs, mould, batches, samples),
    sealedAt: now,
    sealedBy: '账房月结',
    invalidReason: null,
    reconciliationCount: 0,
    reconciledAt: null,
    lastReport: null,
  }
}

/* ----------------------------- 失效判定（封存后） ----------------------------- */

interface FingerprintDiff {
  changed: boolean
  descriptions: string[]
}

function diffFingerprints(settlement: Settlement, bundle: MasterBundle): FingerprintDiff {
  const fp = settlement.fingerprints
  const descriptions: string[] = []

  for (const [idText, sealedRev] of Object.entries(fp.moulds)) {
    const mould = bundle.moulds.get(Number(idText))
    if (!mould || revOf(mould) !== sealedRev) descriptions.push(mould ? `帘纹标准 ${mould.mouldNo}` : `纸帘 #${idText}（已删除）`)
  }
  const changedBatches = Object.entries(fp.batches)
    .filter(([idText, sealedRev]) => {
      const batch = bundle.batches.get(Number(idText))
      return !batch || revOf(batch) !== sealedRev
    })
    .map(([idText]) => bundle.batches.get(Number(idText))?.batchNo ?? `料批 #${idText}`)
  if (changedBatches.length) descriptions.push(`打浆度 ${changedBatches.join('、')}`)

  const changedRuns = Object.entries(fp.runs)
    .filter(([idText, sealedRev]) => {
      const run = bundle.runs.get(Number(idText))
      return !run || revOf(run) !== sealedRev
    })
    .map(([idText]) => bundle.runs.get(Number(idText))?.runNo ?? `工序 #${idText}`)
  if (changedRuns.length) descriptions.push(`偏差 ${changedRuns.join('、')}`)

  const changedSamples = Object.entries(fp.samples)
    .filter(([idText, sealedRev]) => {
      const sample = bundle.samples.find((item) => item.id === Number(idText))
      return !sample || revOf(sample) !== sealedRev
    })
    .map(([idText]) => bundle.samples.find((item) => item.id === Number(idText))?.sampleNo ?? `样本 #${idText}`)
  if (changedSamples.length) descriptions.push(`样本结果 ${changedSamples.join('、')}`)

  return { changed: descriptions.length > 0, descriptions }
}

/**
 * 复查所有已结案结算：任一关联主数据的 rev 与封存指纹不一致，
 * 即置为“待对账”。封存快照保持不变。
 */
export async function refreshStaleSettlements(): Promise<number> {
  const [settlements, bundle] = await Promise.all([db.settlements.toArray(), loadBundle()])
  let invalidated = 0
  await Promise.all(settlements.map(async (settlement) => {
    if (settlement.status === 'stale') return
    const diff = diffFingerprints(settlement, bundle)
    if (diff.changed) {
      invalidated += 1
      const reason = `${diff.descriptions.join('；')} 已按当前主数据修订，封存数据不再有效`
      await db.settlements.update(settlement.id as number, { status: 'stale', invalidReason: reason })
    }
  }))
  if (invalidated > 0) emitSettlementChange()
  return invalidated
}

/* -------------------------------- 重新对账 -------------------------------- */

/** 按当前主数据逐项复算，输出每项封存值 / 当前值、是否一致与完成率 */
export function buildReconcileReport(settlement: Settlement, bundle: MasterBundle): ReconcileReport {
  const items: ReconcileItem[] = []
  const currentMould = bundle.moulds.get(settlement.mouldId)

  items.push({
    category: '帘纹标准',
    label: `${settlement.mouldSnapshot.mouldNo} 帘纹间距`,
    sealedValue: gapText(settlement.mouldSnapshot.stripeGap),
    currentValue: currentMould ? gapText(currentMould.stripeGap) : '记录缺失',
    matched: currentMould ? currentMould.stripeGap === settlement.mouldSnapshot.stripeGap : false,
  })

  settlement.batchSnapshots.forEach((sealedBatch) => {
    const current = bundle.batches.get(sealedBatch.batchId)
    items.push({
      category: '打浆度',
      label: `${sealedBatch.batchNo} 打浆度`,
      sealedValue: `${sealedBatch.beatingDegree}°SR`,
      currentValue: current ? `${current.beatingDegree}°SR` : '记录缺失',
      matched: current ? current.beatingDegree === sealedBatch.beatingDegree : false,
    })
  })

  settlement.runSnapshots.forEach((sealedRun) => {
    const current = bundle.runs.get(sealedRun.runId)
    let currentValue = '记录缺失'
    let matched = false
    if (current) {
      const standardGap = bundle.moulds.get(current.mouldId)?.stripeGap
      if (standardGap === undefined) {
        currentValue = '纸帘缺失，无法复算'
      } else {
        const currentDeviation = calculateDeviation(current.measuredGap, standardGap)
        currentValue = deviationText(currentDeviation)
        matched = Math.abs(currentDeviation - sealedRun.deviation) < 0.001
      }
    }
    items.push({
      category: '偏差',
      label: `${sealedRun.runNo} 帘纹偏差`,
      sealedValue: deviationText(sealedRun.deviation),
      currentValue,
      matched,
    })
  })

  settlement.sampleSnapshots.forEach((sealedSample) => {
    const current = bundle.samples.find((sample) => sample.id === sealedSample.sampleId)
    items.push({
      category: '样本结果',
      label: `${sealedSample.sampleNo} 条数/匀度`,
      sealedValue: sampleText(sealedSample.stripeCount, sealedSample.evenness),
      currentValue: current ? sampleText(current.stripeCount, current.evenness) : '记录缺失',
      matched: current ? current.stripeCount === sealedSample.stripeCount && current.evenness === sealedSample.evenness : false,
    })
  })

  const matched = items.filter((item) => item.matched).length
  const total = items.length
  const completionRate = total ? Math.round((matched / total) * 100) : 0
  const ok = matched === total
  return {
    checkedAt: new Date().toISOString(),
    ok,
    total,
    matched,
    completionRate,
    items,
    note: ok
      ? '当前主数据与封存值全部一致，已按当前版本重新结案'
      : `对账未通过（完成率 ${completionRate}%，${total - matched} 项不一致），原封存值照旧保留，修正后可重试`,
  }
}

/**
 * 重新对账：按当前主数据复算差异与完成率。
 * - 一致：快照更新为当前版本并转为“对账一致”
 * - 不一致：原结算保留在“待对账”，报告落库，可继续重试
 */
export async function reconcileSettlement(settlementId: number): Promise<{ ok: boolean; report: ReconcileReport }> {
  const settlement = await db.settlements.get(settlementId)
  if (!settlement) throw new Error('结算单不存在')
  const bundle = await loadBundle()
  const report = buildReconcileReport(settlement, bundle)

  if (report.ok) {
    const runs = settlement.runIds
      .map((runId) => bundle.runs.get(runId))
      .filter((run): run is SheetRun => Boolean(run))
    const mould = bundle.moulds.get(settlement.mouldId) as Mould
    const batches = settlement.batchIds
      .map((batchId) => bundle.batches.get(batchId))
      .filter((batch): batch is FiberBatch => Boolean(batch))
    const samples = settlement.sampleIds
      .map((sampleId) => bundle.samples.find((sample) => sample.id === sampleId))
      .filter((sample): sample is PaperSample => Boolean(sample))
    // 保留原单号（含“补N”）与封存时间，仅更新快照、指纹与对账信息
    const supplementNo = settlement.settlementNo.includes('-补')
      ? Number(settlement.settlementNo.split('-补')[1])
      : 0
    const refreshed = buildSettlement(settlement.period, runs, bundle, supplementNo)
    await db.settlements.update(settlementId, {
      status: 'reconciled',
      invalidReason: null,
      reconciliationCount: settlement.reconciliationCount + 1,
      reconciledAt: report.checkedAt,
      lastReport: plain(report),
      settlementNo: settlement.settlementNo,
      sealedAt: settlement.sealedAt,
      mouldSnapshot: refreshed.mouldSnapshot,
      batchSnapshots: refreshed.batchSnapshots,
      runSnapshots: refreshed.runSnapshots,
      sampleSnapshots: refreshed.sampleSnapshots,
      fingerprints: buildFingerprints(runs, mould, batches, samples),
      runIds: refreshed.runIds,
      batchIds: refreshed.batchIds,
      sampleIds: refreshed.sampleIds,
    })
  } else {
    await db.settlements.update(settlementId, {
      status: 'stale',
      reconciliationCount: settlement.reconciliationCount + 1,
      lastReport: plain(report),
    })
  }
  emitSettlementChange()
  return { ok: report.ok, report }
}

/* -------------------------------- 结案入库 -------------------------------- */

/** 为指定工序组封存一张结算单；若已有结算单完整覆盖该组，则直接返回旧单 */
async function persistSettlementForRuns(period: string, runs: SheetRun[], bundle: MasterBundle): Promise<Settlement> {
  const mouldId = runs[0].mouldId
  const existing = await db.settlements.where({ period, mouldId }).toArray()
  const runIdSet = new Set(runs.map((run) => run.id as number))
  const covering = existing.find((item) => item.runIds.length === runIdSet.size && item.runIds.every((id) => runIdSet.has(id)))
  if (covering) return covering
  // 同帘同月已有结算单（补登新槽的补封），编号追加“补N”
  const settlement = buildSettlement(period, runs, bundle, existing.length)
  const id = Number(await db.settlements.add(plain(settlement)))
  return { ...settlement, id }
}

/** 该纸帘 + 月份下，尚未进入任何结算单的工序（补登的新槽会在此被发现） */
async function uncoveredRuns(period: string, mouldId: number, candidate: SheetRun[]): Promise<SheetRun[]> {
  const existing = await db.settlements.where({ period, mouldId }).toArray()
  const covered = new Set<number>()
  existing.forEach((settlement) => settlement.runIds.forEach((id) => covered.add(id)))
  return candidate.filter((run) => !covered.has(run.id as number))
}

/** 手工结案：校验不通过时抛错（调用方负责提示），成功后回写批组任务 */
export async function createSettlement(runIds: number[]): Promise<Settlement> {
  const bundle = await loadBundle()
  const runs = runIds
    .map((runId) => bundle.runs.get(runId))
    .filter((run): run is SheetRun => Boolean(run))
    .sort((a, b) => a.runDate.localeCompare(b.runDate) || a.runNo.localeCompare(b.runNo))
  const check = evaluateRunsGroup(runs, bundle)
  if (!check.ok || check.mouldId === null) throw new Error(check.reason ?? '工序组不符合结案条件')
  const period = monthKey(runs[0].runDate)

  let saved: Settlement
  await db.transaction('rw', db.settlements, db.settlementTasks, async () => {
    saved = await persistSettlementForRuns(period, runs, bundle)
    const key = taskKeyOf(period, check.mouldId as number)
    const task = await db.settlementTasks.where('taskKey').equals(key).first()
    if (task) {
      await db.settlementTasks.update(task.id as number, {
        status: 'done',
        lastReason: null,
        settledId: saved!.id as number,
        attemptedAt: new Date().toISOString(),
      })
    }
  })
  emitSettlementChange()
  return saved!
}

/* ------------------------------ 月末批量处理 ------------------------------ */

/** 为某月（按纸帘分组）同步批组任务；已有任务保留状态与跳过原因 */
export async function syncTasksForPeriod(period: string): Promise<SettlementTask[]> {
  const bundle = await loadBundle()
  const monthRuns = Array.from(bundle.runs.values()).filter((run) => monthKey(run.runDate) === period)
  const groups = new Map<number, SheetRun[]>()
  monthRuns.forEach((run) => {
    const list = groups.get(run.mouldId) ?? []
    list.push(run)
    groups.set(run.mouldId, list)
  })

  for (const [mouldId, runs] of groups.entries()) {
    const key = taskKeyOf(period, mouldId)
    const mould = bundle.moulds.get(mouldId)
    const runIds = runs.map((run) => run.id as number)
    const samplesCount = bundle.samples.filter((sample) => runIds.includes(sample.runId)).length
    const existing = await db.settlementTasks.where('taskKey').equals(key).first()
    if (existing) {
      await db.settlementTasks.update(existing.id as number, {
        mouldNo: mould?.mouldNo ?? existing.mouldNo,
        runsCount: runs.length,
        samplesCount,
      })
    } else {
      const task: SettlementTask = {
        taskKey: key,
        period,
        mouldId,
        mouldNo: mould?.mouldNo ?? `纸帘#${mouldId}`,
        runsCount: runs.length,
        samplesCount,
        status: 'pending',
        lastReason: null,
        settledId: null,
        attemptedAt: null,
      }
      await db.settlementTasks.add(plain(task))
    }
  }
  return db.settlementTasks.where('period').equals(period).toArray()
}

/** 同步所有出现过工序的月份，页面重开后仍能接着看到待处理/跳过批组 */
export async function syncAllTaskPeriods(): Promise<void> {
  const runs = await db.sheetRuns.toArray()
  const periods = Array.from(new Set(runs.map((run) => monthKey(run.runDate))))
  for (const period of periods) {
    await syncTasksForPeriod(period)
  }
}

/**
 * 批量结案：逐组校验——合格则封存；不合格则跳过并记录原因。
 * 单组事务互不影响，失败的任务保留 skipped，下次批量继续重试。
 */
export async function batchSettleMonth(period: string): Promise<BatchSettleResult> {
  const tasks = await syncTasksForPeriod(period)
  const bundle = await loadBundle()
  const skipped: SkippedTask[] = []
  let settled = 0
  const now = new Date().toISOString()

  for (const task of tasks.sort((a, b) => a.mouldId - b.mouldId)) {
    const runs = Array.from(bundle.runs.values())
      .filter((run) => monthKey(run.runDate) === period && run.mouldId === task.mouldId)
      .sort((a, b) => a.runDate.localeCompare(b.runDate) || a.runNo.localeCompare(b.runNo))
    const pendingRuns = await uncoveredRuns(period, task.mouldId, runs)
    if (pendingRuns.length === 0) {
      // 该帘当月所有槽均已封存（幂等，不计数）
      await db.settlementTasks.update(task.id as number, { status: 'done', lastReason: null, attemptedAt: now })
      continue
    }
    const check = evaluateRunsGroup(pendingRuns, bundle)

    if (check.ok && check.mouldId !== null) {
      try {
        let created: Settlement | null = null
        await db.transaction('rw', db.settlements, db.settlementTasks, async () => {
          created = await persistSettlementForRuns(period, pendingRuns, bundle)
        })
        const stillUncovered = await uncoveredRuns(period, task.mouldId, runs)
        if (stillUncovered.length === 0) {
          // 该帘整月工序已全部封存
          settled += 1
          await db.settlementTasks.update(task.id as number, {
            status: 'done',
            lastReason: null,
            settledId: created!.id as number,
            attemptedAt: now,
          })
        } else {
          // 本次封存了一部分，仍有新槽未纳入（例如样本还没齐），留给下批继续
          skipped.push({
            taskKey: task.taskKey,
            mouldNo: task.mouldNo,
            reason: `尚有 ${stillUncovered.length} 槽工序未纳入封存：${stillUncovered.map((run) => run.runNo).join('、')}`,
          })
          await db.settlementTasks.update(task.id as number, {
            status: 'skipped',
            lastReason: `尚有 ${stillUncovered.length} 槽工序未纳入封存：${stillUncovered.map((run) => run.runNo).join('、')}`,
            settledId: created!.id as number,
            attemptedAt: now,
          })
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : '结案入库失败'
        skipped.push({ taskKey: task.taskKey, mouldNo: task.mouldNo, reason })
        await db.settlementTasks.update(task.id as number, { status: 'skipped', lastReason: reason, attemptedAt: now })
      }
    } else {
      skipped.push({ taskKey: task.taskKey, mouldNo: task.mouldNo, reason: check.reason ?? '不符合结案条件' })
      await db.settlementTasks.update(task.id as number, { status: 'skipped', lastReason: check.reason, attemptedAt: now })
    }
  }
  emitSettlementChange()
  return { period, settled, skipped }
}
