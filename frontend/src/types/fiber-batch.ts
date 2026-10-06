export const FIBER_MATERIALS = ['构皮', '桑皮', '竹麻', '稻草'] as const
export type FiberMaterial = (typeof FIBER_MATERIALS)[number]

export const COOK_AGENTS = ['石灰', '纯碱'] as const
export type CookAgent = (typeof COOK_AGENTS)[number]

export const BLEACH_METHODS = ['日晒', '漂白粉'] as const
export type BleachMethod = (typeof BLEACH_METHODS)[number]

export interface FiberBatch {
  id?: number
  batchNo: string
  material: FiberMaterial
  origin: string
  cookAgent: CookAgent
  cookHours: number
  bleachMethod: BleachMethod
  beatingDegree: number
  operator: string
  schemaRev?: number
}

export type FiberBatchInput = Omit<FiberBatch, 'id' | 'schemaRev'>
