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

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__movement = { movementPenalty }
}
