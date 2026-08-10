// The settlement's loose ground cover: the grass tufts scattered over the
// walkable ground (design.md §19.9 landscape dressing). Pure geometry, kept out
// of the scene component so the rule it obeys is unit-testable.
//
// It obeys the SAME rule as every other loose object (work-order 585): nothing
// stands on the shore. The tufts used to be scattered by a rule of their own —
// a radius and nothing else — and at the reported seed two of them stood out
// over the Niger, drawn on the flat plate while the ground under them had
// sloped away into the river. `standsOnGroundPlate` is now the one description
// the layout's dressing and this scatter both read.

import { mulberry32 } from '../../world/noise'
import { standsOnGroundPlate, type PlaceRiverBank } from './riverBank'

/** One tuft: position on the settlement ground and its instance scale. */
export type GrassTuft = [x: number, z: number, scale: number]

export interface GrassScatterInput {
  placeId: string
  seed: number
  /** Ports carry a thinner, sandier cover than villages. */
  isPort: boolean
  /** The region's grass density factor (`RegionPlaceStyle.grass`). */
  grassFactor: number
  /** The settlement's plain walkable radius. */
  radius: number
  /** The river bank, where the settlement has one. */
  bank?: PlaceRiverBank | null
}

/** How many tufts a village and a port ask for at density factor 1. */
const VILLAGE_TUFTS = 70
const PORT_TUFTS = 30

/**
 * The tufts of a settlement, seeded per place. A spot that is not on the flat
 * ground plate is dropped rather than moved: grass is dressing, and one tuft
 * fewer beside the water is nothing the player can miss — a tuft standing ON
 * the water is.
 */
export function scatterGrassTufts({
  placeId,
  seed,
  isPort,
  grassFactor,
  radius,
  bank,
}: GrassScatterInput): GrassTuft[] {
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const rand = mulberry32(((seed ^ hash) + 977) >>> 0)
  const tufts: GrassTuft[] = []
  const wanted = Math.round((isPort ? PORT_TUFTS : VILLAGE_TUFTS) * grassFactor)
  for (let i = 0; i < wanted; i++) {
    const a = rand() * Math.PI * 2
    const r = 4 + rand() * (radius + 8)
    const scale = 0.55 + rand() * 0.55
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    // The draws stay in the same order whatever is dropped, so a settlement's
    // grass is the same grass whether or not it stands on a river.
    if (!standsOnGroundPlate(bank, x, z)) continue
    tufts.push([x, z, scale])
  }
  return tufts
}
