import type { FiberMaterial } from './fiber-batch'
import type { EvennessLevel } from './paper-sample'

export const SETTLEMENT_STATUSES = ['已结算', '待对账', '已结案'] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

export interface SettlementMouldSnapshot {
  mouldId: number
  mouldNo: string
  stripeGap: number
  meshDensity: number
}

export interface SettlementBatchSnapshot {
  batchId: number
  batchNo: string
  material: FiberMaterial
  beatingDegree: number
}

export interface SettlementRunSnapshot {
  runId: number
  runNo: string
  runDate: string
  mouldId: number
  batchId: number
  measuredGap: number
  deviation: number
}

export interface SettlementSampleSnapshot {
  sampleId: number
  sampleNo: string
  runId: number
  stripeCount: number
  evenness: EvennessLevel
}

export interface SettlementSnapshot {
  moulds: SettlementMouldSnapshot[]
  batches: SettlementBatchSnapshot[]
  runs: SettlementRunSnapshot[]
  samples: SettlementSampleSnapshot[]
  avgDeviation: number
  sampledRunCount: number
  completionRate: number
  fingerprint: string
}

export interface SettlementReconciliation {
  reconciledAt: string
  snapshot: SettlementSnapshot
  gapStdChanges: { mouldNo: string; from: number; to: number }[]
  beatingDegreeChanges: { batchNo: string; from: number; to: number }[]
  deviationChanges: { runNo: string; from: number; to: number }[]
  sampleCountDelta: number
  completionRate: number
  frozenCompletionRate: number
}

export interface Settlement {
  id?: number
  settlementNo: string
  period: string
  createdAt: string
  status: SettlementStatus
  runIds: number[]
  sampleIds: number[]
  mouldIds: number[]
  batchIds: number[]
  frozen: SettlementSnapshot
  dataFingerprint: string
  reconciliation?: SettlementReconciliation
  reconcileError?: string
  closedAt?: string
  schemaRev?: number
}

export interface SettlementSkip {
  settlementNo: string
  reason: string
}

export interface BatchCloseResult {
  closedCount: number
  skipped: SettlementSkip[]
}
