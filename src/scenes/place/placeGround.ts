import type { DigSite, DigSiteProgress, ErrandPoint } from './adultWork'
import { digSiteAppearance } from './digSiteAppearance'
import { bankGroundHeight, type PlaceRiverBank } from './riverBank'

export interface PlaceGround {
  bank: PlaceRiverBank | null
  sites: readonly DigSite[]
  progress: readonly DigSiteProgress[]
}

export const DIG_RIM_DISTANCE = 1.65
export const DIG_ARRIVE_RADIUS = 0.25
/** Full-grown footprint, including a body's width and arrival slack. */
export const DIG_WORK_CLEARANCE = 0.35 + DIG_ARRIVE_RADIUS
export const SPOIL_RADIUS_X = 1.05
export const SPOIL_RADIUS_Z = 0.8

export function digSiteRotation(site: DigSite): number {
  return site.x * 2.3 + site.z
}

export function digLocalToWorld(site: DigSite, x: number, z: number): ErrandPoint {
  const a = digSiteRotation(site)
  return { x: site.x + Math.cos(a) * x + Math.sin(a) * z, z: site.z - Math.sin(a) * x + Math.cos(a) * z }
}

export function spoilCentre(site: DigSite): ErrandPoint {
  return digLocalToWorld(site, site.kind === 'patch' ? 2.1 : 1.65, 0)
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
  return bankGroundHeight(ground.bank, x, z) + raised
}

/** Conservatively clears the entire ellipse, even at its maximum growth. */
export function clearOfSpoil(site: DigSite, x: number, z: number, margin = DIG_WORK_CLEARANCE): boolean {
  const c = spoilCentre(site)
  return Math.hypot(x - c.x, z - c.z) > SPOIL_RADIUS_X + margin
}

/** Two reachable rim positions on the side opposite the spoil. Casting fails
 * if the fabric cannot give both bodies room; it never sends one into the pit. */
export function digStandingPlaces(site: DigSite, standable: (x: number, z: number) => boolean): [ErrandPoint, ErrandPoint] | null {
  const spots: ErrandPoint[] = []
  for (let k = 0; k < 24; k++) {
    const a = Math.PI + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * Math.PI / 12
    const p = digLocalToWorld(site, Math.cos(a) * DIG_RIM_DISTANCE, Math.sin(a) * DIG_RIM_DISTANCE)
    if (!clearOfSpoil(site, p.x, p.z) || !standable(p.x, p.z)) continue
    if (spots.every((s) => Math.hypot(p.x - s.x, p.z - s.z) > 1.3)) spots.push(p)
    if (spots.length === 2) return [spots[0], spots[1]]
  }
  return null
}
