// Bird's-eye settlement entry (design.md §2.3): entering a settlement is
// movement-based but CONFIRMED with the Space use key — reaching the enter
// radius no longer enters on its own. These pure helpers decide the candidate
// and whether a Space press may enter it, so the logic is unit-testable apart
// from the Three.js travel scene.

export interface EnterablePlace {
  id: string
  /** World-space position of the settlement marker. */
  x: number
  z: number
}

/**
 * The id of the settlement whose enter radius the traveller is within, or null.
 * Returns null on a water cell (a river/lake passage never enters a riverside
 * settlement by accident, design.md §2.3) — the caller passes that guard in.
 */
export function settlementEnterCandidate(
  posX: number,
  posZ: number,
  places: readonly EnterablePlace[],
  enterRadius: number,
  onWater: boolean,
): string | null {
  if (onWater) return null
  for (const p of places) {
    if (Math.hypot(posX - p.x, posZ - p.z) <= enterRadius) return p.id
  }
  return null
}

/**
 * Whether a Space press should enter a settlement: only when there is a
 * candidate, the key was actually pressed (never automatic on radius), and the
 * expedition is not blocked (an open dialog, or a finished defeat/victory run,
 * must not enter and overwrite the checkpoint).
 */
export function shouldEnterSettlement(candidateId: string | null, spacePressed: boolean, blocked: boolean): boolean {
  return candidateId !== null && spacePressed && !blocked
}

/**
 * The settlement a Space press enters at the LIVE traveller position, or null.
 * The press-time decision is re-derived from the position instead of read from
 * the frame-written ui.enterPlaceId: a synchronous keydown after a teleport (or
 * one landing between frames) used to act on the last rendered frame's
 * candidate — the same stale-candidate race the first-person use key had. The
 * radius rule and the water guard are exactly the per-frame hint's
 * (settlementEnterCandidate); `blocked` carries the dialog/defeat/victory gate.
 */
export function settlementToEnter(
  posX: number,
  posZ: number,
  places: readonly EnterablePlace[],
  enterRadius: number,
  onWater: boolean,
  blocked: boolean,
): string | null {
  const id = settlementEnterCandidate(posX, posZ, places, enterRadius, onWater)
  return shouldEnterSettlement(id, true, blocked) ? id : null
}
