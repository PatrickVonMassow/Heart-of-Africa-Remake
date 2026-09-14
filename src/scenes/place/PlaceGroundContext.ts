import { createContext, useContext } from 'react'
import { placeGroundHeight, type PlaceGround } from './placeGround'

export const PlaceGroundContext = createContext<PlaceGround>({ bank: null, sites: [], progress: [] })

/** Stable sampler; the scene updates the shared progress record each frame. */
export function usePlaceGround(): (x: number, z: number) => number {
  const ground = useContext(PlaceGroundContext)
  return (x, z) => placeGroundHeight(ground, x, z)
}
