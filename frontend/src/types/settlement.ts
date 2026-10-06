export const SETTLEMENT_STATUSES = ['sealed', 'stale', 'reconciled'] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  sealed: '已结案',
  stale: '待对账',
  reconciled: '对账一致',
}

export const TASK_STATUSES = ['pending', 'done', 'skipped'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待处理',
  done: '已结案',
  skipped: '已跳过',
}

export const RECONCILE_CATEGORIES = ['帘纹标准', '打浆度', '偏差', '样本结果'] as const
export type ReconcileCategory = (typeof RECONCILE_CATEGORIES)[number]

/** 封存：纸帘（帘纹标准） */
export interface SealedMould {
  mouldId: number
  mouldNo: string
  wireMaterial: string
  wireDiameter: number
  stripeGap: number
  meshDensity: number
  rev: number
}

/** 封存：纤维料批（打浆度） */
export interface SealedBatch {
  batchId: number
  batchNo: string
  material: string
  beatingDegree: number
  rev: number
}

/** 封存：单槽抄纸工序（按当时帘纹标准算出的偏差） */
export interface SealedRun {
  runId: number
  runNo: string
  mouldId: number
  batchId: number
  runDate: string
  grammage: number
  measuredGap: number
  standardGap: number
  deviation: number
  rev: number
}

/** 封存：成纸样本（条数与匀度等检验结果） */
export interface SealedSample {
  sampleId: number
  sampleNo: string
  runId: number
  stripeCount: number
  evenness: string
  sizeMm: number
  archiveBin: string
  rev: number
}

/** 主数据版本指纹：任一条目版本变化即视为关联结算失效 */
export interface Fingerprints {
  moulds: Record<string, number>
  batches: Record<string, number>
  runs: Record<string, number>
  samples: Record<string, number>
}

export interface ReconcileItem {
  category: ReconcileCategory
  label: string
  sealedValue: string
  currentValue: string
  matched: boolean
}

export interface ReconcileReport {
  checkedAt: string
  ok: boolean
  total: number
  matched: number
  /** 完成率：一致项 / 全部核对项，0-100 */
  completionRate: number
  items: ReconcileItem[]
  note: string
}

/** 生产结算单：结案时封存，之后不再随主数据改写 */
export interface Settlement {
  id?: number
  settlementNo: string
  /** 结算月份 YYYY-MM */
  period: string
  mouldId: number
  mouldNo: string
  status: SettlementStatus
  runIds: number[]
  batchIds: number[]
  sampleIds: number[]
  mouldSnapshot: SealedMould
  batchSnapshots: SealedBatch[]
  runSnapshots: SealedRun[]
  sampleSnapshots: SealedSample[]
  fingerprints: Fingerprints
  sealedAt: string
  sealedBy: string
  invalidReason: string | null
  reconciliationCount: number
  reconciledAt: string | null
  lastReport: ReconcileReport | null
}

/** 月末批量结案的批组任务（按月 + 纸帘），跳过原因持久化，重开可继续处理 */
export interface SettlementTask {
  id?: number
  /** `${period}|${mouldId}` */
  taskKey: string
  period: string
  mouldId: number
  mouldNo: string
  runsCount: number
  samplesCount: number
  status: TaskStatus
  lastReason: string | null
  settledId: number | null
  attemptedAt: string | null
}

export interface SkippedTask {
  taskKey: string
  mouldNo: string
  reason: string
}

export interface BatchSettleResult {
  period: string
  settled: number
  skipped: SkippedTask[]
}
