// The walkers whose steps may raise dust (design.md §19.10): PlaceLife registers
// its walker states here and SmokeDust.tsx's WalkerDust reads them each frame.

import { useEffect, useRef } from 'react'

/** One walker's feet as the dust reads them: the walker state shape PlaceLife keeps. */
export interface DustFoot {
  x: number
  z: number
  mode: string
  pause: number
}

export const dustSources = new Set<() => readonly DustFoot[]>()

/** Register a set of walkers whose steps may raise dust (PlaceLife wires this). */
export function useDustFeet(read: () => readonly DustFoot[]) {
  const ref = useRef(read)
  ref.current = read
  useEffect(() => {
    const source = () => ref.current()
    dustSources.add(source)
    return () => {
      dustSources.delete(source)
    }
  }, [])
}
