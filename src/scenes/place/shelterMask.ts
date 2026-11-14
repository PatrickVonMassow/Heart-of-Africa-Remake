// THE SHELTER MASK: which settlement ground lies under cover from the rain.
//
// A settlement's roofs and trees never move, so the cover is baked ONCE when the
// place is built — a grid over the ground disc, from the roof footprints the
// renderer draws (`placeRoofs`, eaves included) and the tree crown radii — not
// per frame, and not per fragment against a list of obstacles. No top-down depth
// pass, so no extra render target, and the whole bake is pure-testable.
//
// Two channels per cell:
// - `cover` 0..1: 1 under a roof, the crown cover under a tree, 0 in the open,
//   ramping softly across the rim (a hard-edged dry disc would read worse than
//   the uniform wetness it replaces);
// - `drip` 0..1: the band just OUTSIDE the eaves where the runoff lands. It is the
//   same edge distance the cover ramps on, read a little further out.
// The ground material turns both into a local wetness (src/render/shelterWetness.ts).
//
// The same mask answers "is this spot under cover" (`shelterAt`), which is what
// moving village life under a roof in the rain needs.

import { placeRoofs, type PlaceRoof } from './roofClearance'
import { VILLAGE_FIRE, type PlaceLayout } from './layout'
import type { RegionPlaceStyle } from './regionStyles'
import { CROWN_REACH, floraSlotScale, floraSlotSpecies } from './floraSpecies'

/** A tree crown seen from above: centre and horizontal reach (m). */
export interface CrownShelter {
  x: number
  z: number
  r: number
}

/** The bake's shape parameters (`balance.rain`, calibratable). */
export interface ShelterMaskParams {
  /** Cover a crown gives relative to a roof, 0..1. */
  crownCover: number
  /** Half-width (m) of the soft ramp centred on the rim. */
  edgeSoftM: number
  /** Distance (m) outside the eave line at which the drip band peaks. */
  dripOffsetM: number
  /** Half-width (m) of the drip band; 0 bakes no drip line. */
  dripHalfWidthM: number
}

/** The baked mask: `size`² cells spanning ±`extent` metres around the origin,
 *  row-major with x along a row and z down the rows. */
export interface ShelterMask {
  size: number
  extent: number
  cover: Float32Array
  drip: Float32Array
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Signed horizontal distance (m) from a roof's footprint edge: negative under
 * the roof, positive outside. A disc measures from its rim, a rectangle in the
 * building's local frame (the rotation `roofHeadroomAt` uses).
 */
export function roofEdgeDistance(roof: PlaceRoof, x: number, z: number): number {
  const dx = x - roof.x
  const dz = z - roof.z
  if (roof.shape === 'disc') return Math.hypot(dx, dz) - roof.rimRadius
  const sin = Math.sin(roof.rot)
  const cos = Math.cos(roof.rot)
  const qx = Math.abs(cos * dx - sin * dz) - roof.hx
  const qz = Math.abs(sin * dx + cos * dz) - roof.hz
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0)
}

/** Cover across the rim: 1 well inside, 0 well outside, 0.5 on the edge itself. */
export function edgeCover(distance: number, softM: number): number {
  const s = Math.max(1e-3, softM)
  return 1 - smoothstep(-s, s, distance)
}

/** The drip band: 1 at `offset` outside the edge, 0 beyond `half` either side. */
export function dripBand(distance: number, offset: number, half: number): number {
  if (half <= 0) return 0
  return 1 - smoothstep(0, half, Math.abs(distance - offset))
}

/** World x (or z) of a cell centre. */
function cellCentre(i: number, size: number, extent: number): number {
  return -extent + ((i + 0.5) * 2 * extent) / size
}

/** Inclusive cell range a world interval [lo, hi] touches, clamped to the grid. */
function cellRange(lo: number, hi: number, size: number, extent: number): [number, number] {
  const toCell = (v: number) => ((v + extent) / (2 * extent)) * size - 0.5
  return [Math.max(0, Math.floor(toCell(lo))), Math.min(size - 1, Math.ceil(toCell(hi)))]
}

/**
 * Bake the mask. Overlapping shelters take the strongest cover; a drip band
 * under someone else's cover is suppressed (it is no longer open ground). The
 * outermost ring of cells stays 0, so a clamped texture lookup past the grid
 * reads open ground.
 */
export function bakeShelterMask(
  roofs: readonly PlaceRoof[],
  crowns: readonly CrownShelter[],
  extent: number,
  size: number,
  p: ShelterMaskParams,
): ShelterMask {
  const cover = new Float32Array(size * size)
  const drip = new Float32Array(size * size)
  const soft = Math.max(1e-3, p.edgeSoftM)
  const dripReach = p.dripHalfWidthM > 0 ? p.dripOffsetM + p.dripHalfWidthM : 0
  for (const roof of roofs) {
    const reach = roof.rimRadius + Math.max(soft, dripReach)
    const [i0, i1] = cellRange(roof.x - reach, roof.x + reach, size, extent)
    const [j0, j1] = cellRange(roof.z - reach, roof.z + reach, size, extent)
    for (let j = j0; j <= j1; j++) {
      const z = cellCentre(j, size, extent)
      for (let i = i0; i <= i1; i++) {
        const x = cellCentre(i, size, extent)
        const d = roofEdgeDistance(roof, x, z)
        const k = j * size + i
        const c = edgeCover(d, soft)
        if (c > cover[k]) cover[k] = c
        const b = dripBand(d, p.dripOffsetM, p.dripHalfWidthM)
        if (b > drip[k]) drip[k] = b
      }
    }
  }
  const crownCover = Math.min(1, Math.max(0, p.crownCover))
  for (const t of crowns) {
    if (!(t.r > 0) || crownCover <= 0) continue
    const reach = t.r + soft
    const [i0, i1] = cellRange(t.x - reach, t.x + reach, size, extent)
    const [j0, j1] = cellRange(t.z - reach, t.z + reach, size, extent)
    for (let j = j0; j <= j1; j++) {
      const z = cellCentre(j, size, extent)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(cellCentre(i, size, extent) - t.x, z - t.z) - t.r
        const c = crownCover * edgeCover(d, soft)
        const k = j * size + i
        if (c > cover[k]) cover[k] = c
      }
    }
  }
  for (let k = 0; k < cover.length; k++) {
    drip[k] *= 1 - cover[k]
    const i = k % size
    const j = (k - i) / size
    if (i === 0 || j === 0 || i === size - 1 || j === size - 1) {
      cover[k] = 0
      drip[k] = 0
    }
  }
  return { size, extent, cover, drip }
}

/** The mask at a world point (nearest cell; open ground outside the grid). */
export function shelterAt(mask: ShelterMask, x: number, z: number): { cover: number; drip: number } {
  const i = Math.round(((x + mask.extent) / (2 * mask.extent)) * mask.size - 0.5)
  const j = Math.round(((z + mask.extent) / (2 * mask.extent)) * mask.size - 0.5)
  if (i < 0 || j < 0 || i >= mask.size || j >= mask.size) return { cover: 0, drip: 0 }
  const k = j * mask.size + i
  return { cover: mask.cover[k], drip: mask.drip[k] }
}

/**
 * The shelters a settlement draws: every roof `placeRoofs` knows (eaves
 * included), minus the cook-shelters where the people keep no roofed fire, and
 * a crown per flora slot at the species and scale the scene draws it with.
 */
export function placeShelters(
  layout: PlaceLayout,
  style: RegionPlaceStyle,
  kind: 'port' | 'village' | 'monument',
  fireSheltered: boolean,
  floraStyle: RegionPlaceStyle = style,
): { roofs: PlaceRoof[]; crowns: CrownShelter[] } {
  const roofs = placeRoofs(layout, style, kind, VILLAGE_FIRE).filter(
    (r) => fireSheltered || r.what !== 'cook shelter',
  )
  const crowns = layout.flora.map((t, i) => {
    const species = floraSlotSpecies(floraStyle, i, t.h)
    return { x: t.x, z: t.z, r: CROWN_REACH[species] * floraSlotScale(species, t.h) }
  })
  return { roofs, crowns }
}
