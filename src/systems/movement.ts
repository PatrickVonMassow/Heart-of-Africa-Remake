// Movement penalties (design.md §11): terrain that slows travel unless the
// matching item is held in hand. Kept pure so the HUD can surface the reason
// and the verification can assert it. The hint names the terrain and the item
// that would relieve the slowdown.

import type { HandId } from '../state/store'
import type { TerrainType } from '../world/terrain'

export type MovementPenalty = 'jungle' | 'water' | 'mountain' | null

/**
 * The active terrain slowdown the current hand item does not relieve, or null
 * when nothing slows the traveler here (design.md §11 terrain/hand-object
 * table): dense jungle without a machete, open/enclosed water without a canoe,
 * and steep mountain rock without a rope.
 */
export function movementPenalty(terrain: TerrainType, hand: HandId | null): MovementPenalty {
  if (terrain === 'jungle' && hand !== 'machete') return 'jungle'
  if ((terrain === 'water' || terrain === 'ocean') && hand !== 'canoe') return 'water'
  if (terrain === 'mountain' && hand !== 'rope') return 'mountain'
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
