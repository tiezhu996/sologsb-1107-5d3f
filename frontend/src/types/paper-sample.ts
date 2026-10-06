export const EVENNESS_LEVELS = ['均匀', '略花', '花'] as const
export type EvennessLevel = (typeof EVENNESS_LEVELS)[number]

export interface PaperSample {
  id?: number
  sampleNo: string
  runId: number
  sizeMm: number
  stripeCount: number
  evenness: EvennessLevel
  archiveBin: string
  schemaRev?: number
  /** 主数据修订版本，每次改动自增；关联结算据此判断是否失效 */
  rev?: number
}

export type PaperSampleInput = Omit<PaperSample, 'id' | 'schemaRev'>
