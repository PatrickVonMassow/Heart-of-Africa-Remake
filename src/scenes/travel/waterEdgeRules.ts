// Water-edge placement rules (design.md §11/§19): what may stand where around
// river/lake water. River distances measure to the AXIS (the water band
// reaches RIVER_WIDTH_DEG around it), lake distances to the shore line. Pure
// so the channel-clearance behaviour is unit-testable.

import { RIVER_WIDTH_DEG } from '../../world/terrain'

/** Extra clearance beyond the water band for solid dressing (canopy/body). */
export const CHANNEL_CLEARANCE_DEG = 0.06
/** A drinker stops this far short of the waterline (on the bank). */
export const BANK_GAP_DEG = 0.015
/** A bather wades this far past the drinker's bank stop (shallow edge). */
export const BATHE_WADE_DEG = 0.05
/** Reed belt around the river waterline. */
export const REED_BELT_INNER_DEG = RIVER_WIDTH_DEG - 0.03
export const REED_BELT_OUTER_DEG = RIVER_WIDTH_DEG + 0.045
/** Reed belt around a lake shore. */
export const REED_LAKE_SHORE_DEG = 0.04

/** Reeds (papyrus) grow in a band hugging the waterline — never mid-channel. */
export function inReedBelt(riverD: number, lakeShoreD: number): boolean {
  return (riverD > REED_BELT_INNER_DEG && riverD < REED_BELT_OUTER_DEG) || lakeShoreD < REED_LAKE_SHORE_DEG
}

/**
 * Solid dressing (trees, boulders, kopjes …) keeps clear of the channels: a
 * body inside or hard against river/lake water reads as standing in the
 * river and blocks the canoe's way (design.md §11).
 */
export function solidDressingAllowed(terrainType: string, riverD: number, lakeShoreD: number): boolean {
  if (terrainType === 'water' || terrainType === 'ocean') return false
  if (riverD < RIVER_WIDTH_DEG + CHANNEL_CLEARANCE_DEG) return false
  if (lakeShoreD < 0.05) return false
  return true
}

/**
 * How far a drinking animal walks down the water-distance gradient: to the
 * BANK — a step short of the waterline — and for a bather a small wade past
 * it into the shallow edge. Never into the channel.
 */
export function drinkWalkDistance(riverD: number, lakeD: number, bathe: boolean): number {
  const toWaterline = riverD < lakeD ? riverD - (RIVER_WIDTH_DEG - 0.005) : lakeD
  return Math.max(0, toWaterline - BANK_GAP_DEG + (bathe ? BATHE_WADE_DEG : 0))
}
