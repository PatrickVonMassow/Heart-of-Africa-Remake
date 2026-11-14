// The village hearth's geometry (design.md §19.10/§2.6, work-order point 348).
// Pure: the drawn fire pit, the flame's anchoring and the hearth collider read
// the same numbers, so the collider cannot drift from the stones it guards and
// the flame cannot float off the pit it burns in.

import { balance } from '../../config/balance'

/** Radius of the ring the hearth stones sit on (centre of each stone). */
export const HEARTH_STONE_RING = 0.95
/** Radius of one hearth stone. */
export const HEARTH_STONE_RADIUS = 0.16
/** Outer reach of the drawn hearth: the stone ring plus one stone. */
export const HEARTH_RADIUS = HEARTH_STONE_RING + HEARTH_STONE_RADIUS
/** Height of the fire pit's own surface (the 0.05 disc centred at 0.02). */
export const HEARTH_TOP = 0.045

/** The hearth collider's radius: the drawn hearth plus the calibratable
 *  clearance (`balance.fire.hearthClearance`), so walkers path around the fire
 *  and the player cannot stand in the flames (point 348 (b)). */
export function hearthColliderRadius(): number {
  // Rounded to the micrometre so float noise in the sum never moves a layout.
  return Math.round((HEARTH_RADIUS + Math.max(0, balance.fire.hearthClearance)) * 1e6) / 1e6
}

/**
 * Where a flame mesh stands so that its base sits on the hearth surface at any
 * vertical scale (point 348 (a)). The cone geometry is translated so its base
 * is at local y = 0 (see `flameGeometryLift`); the mesh then stands at
 * `HEARTH_TOP` and scales about that base, never about its centre.
 */
export function flameBaseY(meshY: number, scaleY: number, geometryLift: number, height: number): number {
  return meshY + scaleY * (geometryLift - height / 2)
}

/** The lift that puts a centred cone's base at local y = 0. */
export function flameGeometryLift(height: number): number {
  return height / 2
}

/** Height of the village fire's flame cone. */
export const VILLAGE_FLAME_HEIGHT = 0.75
/** Height of the fishers' fire's flame cone (point 1275). */
export const FISHERY_FLAME_HEIGHT = 0.7

/** The village flame's vertical scale at a rain factor 0..1 (point 256): rain
 *  lowers the cone, so a rainy fire visibly steams down. */
export function villageFlameScale(rainFactor: number): number {
  return 0.7 + 0.3 * Math.min(1, Math.max(0, rainFactor))
}

/** The fishers' flame's vertical scale: its flicker at `t` times the rain's
 *  lowering (point 1275). */
export function fisheryFlameScale(t: number, rainFactor: number): number {
  return (0.8 + 0.25 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23.7)) * villageFlameScale(rainFactor)
}
