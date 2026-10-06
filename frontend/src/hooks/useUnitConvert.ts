export function useUnitConvert() {
  const mmToCm = (millimetres: number) => Number((millimetres / 10).toFixed(2))
  const cmToMm = (centimetres: number) => Number((centimetres * 10).toFixed(1))
  const mmPitchToThreadsPerCm = (pitchMm: number) => {
    if (pitchMm <= 0) return 0
    return Number((10 / pitchMm).toFixed(1))
  }
  const threadsPerCmToMmPitch = (threadsPerCm: number) => {
    if (threadsPerCm <= 0) return 0
    return Number((10 / threadsPerCm).toFixed(2))
  }
  const formatGrammage = (grammage: number) => `${grammage.toFixed(1)} 克/平方米`

  return {
    mmToCm,
    cmToMm,
    mmPitchToThreadsPerCm,
    threadsPerCmToMmPitch,
    formatGrammage,
  }
}
