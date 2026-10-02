import { createContext, useCallback, useContext } from 'react'
import { placeGroundHeight, type PlaceGround } from './placeGround'

export const PlaceGroundContext = createContext<PlaceGround>({ bank: null, sites: [], progress: [], rocks: [] })

/** A ground-height sampler (x, z) over the shared record, so it reads live dig
 *  progress even between React renders. Stable per record, so effects may
 *  depend on it. */
export function usePlaceGround(): (x: number, z: number) => number {
  const ground = useContext(PlaceGroundContext)
  return useCallback((x: number, z: number) => placeGroundHeight(ground, x, z), [ground])
}
