import { useMemo, useState } from 'react'
import type { Mould, MouldStateValue, WireMaterial } from '../types/mould'

export type MouldStateFilter = MouldStateValue | '全部'
export type WireMaterialFilter = WireMaterial | '全部'

export function useMouldFilter(moulds: Mould[], initialMouldNo = '', initialState: MouldStateFilter = '全部', initialMaterial: WireMaterialFilter = '全部') {
  const [mouldNo, setMouldNo] = useState(initialMouldNo)
  const [state, setState] = useState<MouldStateFilter>(initialState)
  const [wireMaterial, setWireMaterial] = useState<WireMaterialFilter>(initialMaterial)

  const filteredMoulds = useMemo(() => {
    const normalizedMouldNo = mouldNo.trim().toLowerCase()
    return moulds.filter((mould) => {
      const matchesNo = !normalizedMouldNo || mould.mouldNo.toLowerCase().includes(normalizedMouldNo)
      const matchesState = state === '全部' || mould.state === state
      const matchesMaterial = wireMaterial === '全部' || mould.wireMaterial === wireMaterial
      return matchesNo && matchesState && matchesMaterial
    })
  }, [mouldNo, moulds, state, wireMaterial])

  const resetFilters = () => {
    setMouldNo('')
    setState('全部')
    setWireMaterial('全部')
  }

  return {
    mouldNo,
    state,
    wireMaterial,
    filteredMoulds,
    setMouldNo,
    setState,
    setWireMaterial,
    resetFilters,
  }
}
