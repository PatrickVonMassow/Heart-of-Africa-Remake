// Which plant a settlement flora slot carries, and how large it is drawn. Pure,
// so the scene that draws the plants and the shelter-mask bake that needs their
// crowns (shelterMask.ts) pick the SAME species at the same size.

import type { RegionPlaceStyle } from './regionStyles'

export type FloraSpecies = 'palm' | 'acacia' | 'jungle' | 'bush'

/** Pick the species for a flora slot from the region's weight mix. */
export function pickFlora(style: RegionPlaceStyle, t: number): FloraSpecies {
  const { palm, acacia, jungle } = style.flora
  if (t < palm) return 'palm'
  if (t < palm + acacia) return 'acacia'
  if (t < palm + acacia + jungle) return 'jungle'
  return 'bush'
}

// First-person plants reuse the travel-scale geometries, scaled up to
// walkable proportions.
export const FLORA_SCALE: Record<FloraSpecies, number> = { palm: 1, acacia: 2.1, jungle: 1.7, bush: 2.4 }

/** The species a slot draws: the slot index and height pick from the mix. */
export function floraSlotSpecies(style: RegionPlaceStyle, index: number, h: number): FloraSpecies {
  return pickFlora(style, ((index * 0.37 + h * 0.11) % 1 + 1) % 1)
}

/** The uniform scale a slot is drawn at. */
export function floraSlotScale(species: FloraSpecies, h: number): number {
  return (h / 4.4) * FLORA_SCALE[species]
}

/**
 * Horizontal reach of each species' crown from its trunk, in GEOMETRY units
 * (before `floraSlotScale`), read off src/render/flora.ts: the acacia's umbrella
 * (r 1.15, offset 0.1), the jungle tree's widest layer (side crown 0.85 at 0.75),
 * the detailed palm's frond fan (~2.2 long blades, arched). A bush is ground
 * cover and shelters no ground a person stands on, so it reaches 0. Re-read
 * these when a crown is reshaped.
 */
export const CROWN_REACH: Record<FloraSpecies, number> = { palm: 2.0, acacia: 1.25, jungle: 1.6, bush: 0 }
