import type { DigSite, DigSiteProgress, ErrandPoint } from './adultWork'
import { digSiteAppearance } from './digSiteAppearance'
import { looseRockRise } from './looseRocks'
import { bankGroundHeight, type PlaceRiverBank } from './riverBank'
import { balance } from '../../config/balance'

export interface PlaceGround {
  bank: PlaceRiverBank | null
  sites: readonly DigSite[]
  progress: readonly DigSiteProgress[]
  /** The settlement's whole rock scatter, as `layout.rocks` holds it. The low
   *  ones among them raise this surface (work-order 1149); `looseRockRise`
   *  makes that cut, so this list is passed on unfiltered. */
  rocks: readonly (readonly [number, number, number])[]
}

/** The working rim of a dig site: where a digger stands so that his blade
 *  reaches the hole and his feet stay on unbroken ground (work-order 1125).
 *  The metres themselves are calibratable and live in `balance`. */
export const DIG_RIM_DISTANCE = balance.villageLife.adultErrands.digStandDistance
export const DIG_ARRIVE_RADIUS = 0.25
/** Full-grown footprint, including a body's width and arrival slack. */
export const DIG_WORK_CLEARANCE = 0.35 + DIG_ARRIVE_RADIUS
export const SPOIL_RADIUS_X = 1.05
export const SPOIL_RADIUS_Z = 0.8

export function digSiteRotation(site: DigSite): number {
  return site.rotation ?? site.x * 2.3 + site.z
}

export function digLocalToWorld(site: DigSite, x: number, z: number): ErrandPoint {
  const a = digSiteRotation(site)
  return { x: site.x + Math.cos(a) * x + Math.sin(a) * z, z: site.z - Math.sin(a) * x + Math.cos(a) * z }
}

export function spoilOffset(site: DigSite): number {
  return site.kind === 'patch' ? 2.1 : 1.65
}

export function spoilCentre(site: DigSite): ErrandPoint {
  return digLocalToWorld(site, spoilOffset(site), 0)
}

/** Local clod flight, landing on the same surface the villagers walk over. */
export function digEarthFlight(site: DigSite, progress: DigSiteProgress | undefined, age: number, clod: number): { x: number; y: number; z: number } {
  const u = Math.max(0, Math.min(1, age / 0.72))
  const x = 0.12 + (spoilOffset(site) - 0.12 + (clod % 3 - 1) * 0.12) * u
  const z = (clod - 2.5) * 0.075
  const landing = digLocalToWorld(site, x, z)
  const y = 0.12 * (1 - u) + spoilHeightAt(site, progress, landing.x, landing.z) * u + 2.4 * u * (1 - u)
  return { x, y, z }
}

/** A smooth, compact mound: zero height AND slope at its edge. The drawn mesh
 * and all feet sample this same surface; it never enters the collider set. */
export function spoilHeightAt(site: DigSite, progress: DigSiteProgress | undefined, x: number, z: number): number {
  const centre = spoilCentre(site)
  const a = digSiteRotation(site)
  const dx = x - centre.x
  const dz = z - centre.z
  const u = (Math.cos(a) * dx - Math.sin(a) * dz) / SPOIL_RADIUS_X
  const v = (Math.sin(a) * dx + Math.cos(a) * dz) / SPOIL_RADIUS_Z
  const q = Math.max(0, 1 - u * u - v * v)
  return (0.12 + 0.42 * digSiteAppearance(progress).work) * q * q
}

export function placeGroundHeight(ground: PlaceGround, x: number, z: number): number {
  let raised = 0
  for (let i = 0; i < ground.sites.length; i++) {
    raised = Math.max(raised, spoilHeightAt(ground.sites[i], ground.progress[i], x, z))
  }
  // …and the stones low enough to be walked over rather than around
  // (work-order 1149). The MAXIMUM, as with the spoil: two rises that overlap
  // carry the foot over the higher one instead of adding up into a step.
  for (let i = 0; i < ground.rocks.length; i++) {
    raised = Math.max(raised, looseRockRise(ground.rocks[i], x, z))
  }
  return bankGroundHeight(ground.bank, x, z) + raised
}

/** Conservatively clears the entire ellipse, even at its maximum growth. */
export function clearOfSpoil(site: DigSite, x: number, z: number, margin = DIG_WORK_CLEARANCE): boolean {
  const c = spoilCentre(site)
  return Math.hypot(x - c.x, z - c.z) > SPOIL_RADIUS_X + margin
}

/** Two bodies at one place block each other, and neither is then counted as
 *  arrived (work-order 1087). */
const MIN_STAND_GAP = 1.3

/** Is this body at the site's working rim, blade in the hole and feet on
 *  unbroken ground? A figure outside it does not play the dig stroke, so a
 *  future regression reads as a villager standing idle rather than as one
 *  hoeing untouched earth (work-order 1125). */
export function atDigStand(site: ErrandPoint, x: number, z: number): boolean {
  return Math.hypot(x - site.x, z - site.z)
    <= DIG_RIM_DISTANCE + balance.villageLife.adultErrands.digStandTolerance
}

/** Two reachable rim positions on the side opposite the spoil, as nearly
 * ACROSS THE HOLE from each other as the ground allows (work-order 1125): the
 * pair works one excavation facing each other, not shoulder to shoulder over
 * the same arc. Among the pairs that face each other equally well, the one
 * that keeps both men furthest from the spoil heap wins. Casting fails if the
 * fabric cannot give both bodies room; it never sends one into the pit. */
export function digStandingPlaces(site: DigSite, standable: (x: number, z: number) => boolean): [ErrandPoint, ErrandPoint] | null {
  const heap = spoilCentre(site)
  const usable: Array<{ a: number; p: ErrandPoint; fromHeap: number }> = []
  for (let k = 0; k < 24; k++) {
    const a = Math.PI + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * Math.PI / 12
    const p = digLocalToWorld(site, Math.cos(a) * DIG_RIM_DISTANCE, Math.sin(a) * DIG_RIM_DISTANCE)
    if (!clearOfSpoil(site, p.x, p.z) || !standable(p.x, p.z)) continue
    usable.push({ a, p, fromHeap: Math.hypot(p.x - heap.x, p.z - heap.z) })
  }
  let best: [ErrandPoint, ErrandPoint] | null = null
  let bestScore = -Infinity
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const one = usable[i]
      const other = usable[j]
      if (Math.hypot(one.p.x - other.p.x, one.p.z - other.p.z) <= MIN_STAND_GAP) continue
      // Straight across the hole is PI apart; the weight keeps one bearing step
      // (30 degrees) worth more than any reachable gain in heap distance.
      const turn = Math.abs(one.a - other.a) % (Math.PI * 2)
      const apart = turn > Math.PI ? Math.PI * 2 - turn : turn
      const score = apart * 100 + Math.min(one.fromHeap, other.fromHeap)
      if (score > bestScore) {
        bestScore = score
        best = [one.p, other.p]
      }
    }
  }
  return best
}
