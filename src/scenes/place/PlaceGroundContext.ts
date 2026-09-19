import { createContext, useContext } from 'react'
import { placeGroundHeight, type PlaceGround } from './placeGround'

export const PlaceGroundContext = createContext<PlaceGround>({ bank: null, sites: [], progress: [], rocks: [] })

/** Reads live progress from the shared record, including between React renders. */
export function usePlaceGround(): (x: number, z: number) => number {
  const ground = useContext(PlaceGroundContext)
  return (x, z) => placeGroundHeight(ground, x, z)
}
