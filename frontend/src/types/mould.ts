export const WIRE_MATERIALS = ['竹丝', '铜丝', '马尾丝'] as const
export type WireMaterial = (typeof WIRE_MATERIALS)[number]

export const MOULD_STATES = ['在用', '待修补', '退役'] as const
export type MouldStateValue = (typeof MOULD_STATES)[number]

export interface Mould {
  id?: number
  mouldNo: string
  frameW: number
  frameH: number
  wireMaterial: WireMaterial
  wireDiameter: number
  stripeGap: number
  meshDensity: number
  weaver: string
  state: MouldStateValue
  schemaRev?: number
}

export type MouldInput = Omit<Mould, 'id' | 'schemaRev'>
