// THE SETTLEMENT'S RIVER CARRIED INTO THE BACKDROP (work-order 1250).
//
// The drawn river of a riverside village is a straight band from the waterline
// out to `BANK_BED_REACH`; beyond it, and along the bank past the plateau, the
// landscape backdrop takes over and shows the MAP's terrain. The map's river,
// kept clear of the village footprint, begins some metres further out than the
// drawn waterline, so the backdrop showed a strip of map LAND lying on the
// river at the disc plane — above the drawn water, which sits lower. That was
// the reported "large yellow band on the water" between the dugout and the
// near bank.
//
// So a backdrop spot counts as water where it lies on the river side of the
// drawn waterline and short of the map's own first water along that line of the
// bank (sought within `backdropRiverFillReach`), and anywhere inside the drawn
// band while the drawn river runs alongside — short of the far shore of a map
// river that ends inside the band. The far bank beyond the map's river is
// never touched. The same predicate keeps the §2.5 panorama
// silhouettes out of the water.
//
// Pure and three-free, so it is unit-testable.

import { balance } from '../../config/balance'
import { sampleTerrain } from '../../world/terrain'
import { BACKDROP_SCALE } from './backdrop'
import { BANK_BED_REACH, BANK_WATER_DROP, type PlaceRiverBank } from './riverBank'

/** How far below the drawn water a filled backdrop spot lies, so the drawn
 *  surface wins wherever both are drawn (metres). */
export const BACKDROP_RIVER_SINK = 0.05

/** The height a filled backdrop spot is drawn at: just under the drawn river. */
export const BACKDROP_RIVER_Y = -(BANK_WATER_DROP + BACKDROP_RIVER_SINK)

/** The sampling step along and across the bank (metres). */
const STEP = 1

/** Bisection steps that place a far shore inside the drawn band (STEP / 2^12). */
const FAR_EDGE_BISECTIONS = 12

/** Whether the map shows water at a place-frame spot around (lat, lon). */
export function mapWaterAt(lat: number, lon: number, seed: number): (x: number, z: number) => boolean {
  return (x, z) => sampleTerrain(lat - z * BACKDROP_SCALE, lon + x * BACKDROP_SCALE, seed).type === 'water'
}

/**
 * The predicate "this backdrop spot is the settlement's river". `mapWater`
 * answers for the map; `drawn` is how far the drawn river runs upstream and
 * downstream of the bank normal. Returns false everywhere without a bank.
 */
export function backdropRiverFill(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz' | 'distance'> | null,
  mapWater: (x: number, z: number) => boolean,
  drawn: { up: number; down: number },
  reach: number = balance.backdropRiverFillReach,
): (x: number, z: number) => boolean {
  if (!bank) return () => false
  // From the drawn waterline out; the shore slope above it stays ground.
  const near = bank.distance
  const bandEnd = bank.distance + BANK_BED_REACH
  const lines = new Map<number, { first: number | null; far: number | null }>()
  // Along one line of the bank: the first map water out from the waterline,
  // and the first map land beyond it (its far shore) when that lies within
  // the drawn band.
  const line = (along: number): { first: number | null; far: number | null } => {
    const key = Math.round(along / STEP)
    const known = lines.get(key)
    if (known !== undefined) return known
    const a = key * STEP
    const water = (out: number) => mapWater(bank.nx * out + bank.fx * a, bank.nz * out + bank.fz * a)
    let first: number | null = null
    for (let k = 0; k * STEP <= reach; k++) {
      const out = near + k * STEP
      if (water(out)) {
        first = out
        break
      }
    }
    let far: number | null = null
    if (first !== null) {
      for (let out = first + STEP; out <= bandEnd; out += STEP) {
        if (!water(out)) {
          // Bisected between the last wet and first dry sample to the map's
          // own edge, so no land between two samples is drawn as water.
          let wet = out - STEP
          let dry = out
          for (let k = 0; k < FAR_EDGE_BISECTIONS; k++) {
            const mid = (wet + dry) / 2
            if (water(mid)) wet = mid
            else dry = mid
          }
          far = dry
          break
        }
      }
    }
    const found = { first, far }
    lines.set(key, found)
    return found
  }
  return (x, z) => {
    const out = x * bank.nx + z * bank.nz
    if (out < near - 1e-6) return false
    const along = x * bank.fx + z * bank.fz
    const alongside = along >= -drawn.up && along <= drawn.down
    const { first, far } = line(along)
    if (alongside && out <= bandEnd) return far === null || out < far
    return first !== null && out < first
  }
}

type Vec3 = readonly [number, number, number]

/**
 * A per-vertex value (the backdrop's water mask) at point `p` on triangle
 * a-b-c, interpolated by p's barycentric coordinates — what the GPU draws
 * there, not the triangle's plain average. A degenerate triangle averages.
 */
export function barycentricValue(p: Vec3, a: Vec3, b: Vec3, c: Vec3, va: number, vb: number, vc: number): number {
  const sub = (u: Vec3, v: Vec3) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]] as const
  const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const e0 = sub(b, a)
  const e1 = sub(c, a)
  const e2 = sub(p, a)
  const d00 = dot(e0, e0)
  const d01 = dot(e0, e1)
  const d11 = dot(e1, e1)
  const d20 = dot(e2, e0)
  const d21 = dot(e2, e1)
  const den = d00 * d11 - d01 * d01
  if (Math.abs(den) < 1e-12) return (va + vb + vc) / 3
  const v = (d11 * d20 - d01 * d21) / den
  const w = (d00 * d21 - d01 * d20) / den
  return (1 - v - w) * va + v * vb + w * vc
}
