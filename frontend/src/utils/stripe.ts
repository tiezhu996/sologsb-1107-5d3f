export const GAP_TOLERANCE_MM = 0.2

export function calculateDeviation(measuredGap: number, standardGap: number): number {
  return Number((measuredGap - standardGap).toFixed(2))
}

export function isGapOutOfTolerance(deviation: number): boolean {
  return Math.abs(deviation) > GAP_TOLERANCE_MM
}

export function getGapConclusion(deviation: number): string {
  if (isGapOutOfTolerance(deviation)) {
    return deviation > 0 ? '帘纹偏疏，超出允许范围' : '帘纹偏密，超出允许范围'
  }
  return '帘纹间距在允许范围'
}

export function calculateMeshDensity(wireDiameter: number, stripeGap: number): number {
  const pitch = wireDiameter + stripeGap
  if (pitch <= 0) return 0
  return Number((10 / pitch).toFixed(1))
}
