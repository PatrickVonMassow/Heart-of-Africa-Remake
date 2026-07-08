// Movement penalties (design.md §11): terrain that slows travel unless the
// matching item is carried in the pack. Kept pure so the HUD can surface the
// reason and the verification can assert it. The hint names the terrain and the
// item that would relieve the slowdown.

import type { EquipmentId } from '../state/store'
import type { TerrainType } from '../world/terrain'

export type MovementPenalty = 'jungle' | 'water' | 'mountain' | 'canoeOnLand' | null

type Inventory = Partial<Record<EquipmentId, number>>
const has = (eq: Inventory, id: EquipmentId) => (eq[id] ?? 0) > 0

/**
 * The active terrain slowdown for the current inventory, or null when nothing
 * slows the traveller here (design.md §11). Effects follow item *possession*
 * (nothing is "held in hand"): dense jungle without a machete, open/enclosed water
 * without a canoe, and steep mountain rock without a rope each slow the
 * traveller; and carrying the canoe slows land travel (its only relevance is
 * possession, so it is a permanent land handicap).
 */
export function movementPenalty(terrain: TerrainType, equipment: Inventory): MovementPenalty {
  if (terrain === 'jungle' && !has(equipment, 'machete')) return 'jungle'
  if ((terrain === 'water' || terrain === 'ocean') && !has(equipment, 'canoe')) return 'water'
  if (terrain === 'mountain' && !has(equipment, 'rope')) return 'mountain'
  // On land the canoe is dead weight and slows the traveller.
  if ((terrain === 'savanna' || terrain === 'desert') && has(equipment, 'canoe')) return 'canoeOnLand'
  return null
}

/**
 * Local walk velocity inside settlements (design.md §2): strafing and walking
 * backward move at `strafeFactor` of the forward speed. Input is normalized
 * first so a diagonal is never faster than a single axis. Returns
 * `[alongFacing, sideways]` speed components (before rotation by the yaw);
 * `alongFacing` is positive walking forward (local -Z), `sideways` positive
 * to the right (local +X).
 */
export function placeWalkVelocity(
  forward: number,
  strafe: number,
  speed: number,
  strafeFactor: number,
): [number, number] {
  const len = Math.hypot(forward, strafe)
  if (len === 0) return [0, 0]
  const nf = forward / len
  const ns = strafe / len
  return [nf * speed * (nf >= 0 ? 1 : strafeFactor), ns * speed * strafeFactor]
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__movement = { movementPenalty, placeWalkVelocity }
}
