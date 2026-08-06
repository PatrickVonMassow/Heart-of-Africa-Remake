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
 * The settlement collision radius (design.md §11): the traveller cannot walk
 * THROUGH a settlement's footprint. Derived from the enter radius by the
 * calibratable `balance.placeCollisionFactor` and CLAMPED to the enter radius,
 * because the two must stay balanced: the "Space to enter" prompt has to arm at
 * or outside the collision boundary, else the collider stops the traveller
 * short of the enter radius and the place can never be entered at all.
 */
export function settlementCollisionRadius(enterRadius: number, factor: number): number {
  return Math.max(0, Math.min(enterRadius, enterRadius * factor))
}

/**
 * The settlement collider circles `[x, z, radius]` for a move STARTING at
 * `(fromX, fromZ)`, in the `[x, z, r]` form `resolveTravelMove` takes (the
 * radius is reduced by the body radius `selfR`, so the traveller's centre comes
 * to rest exactly `collisionRadius` from the marker).
 *
 * The collider is ONE-WAY: a place the traveller is ALREADY inside contributes
 * no circle, so he can always walk back out. Several paths put him on a place's
 * exact centre — a debug jump, a resumed snapshot, a successor start, a save
 * written by an older build — and with entry key-only (point 244) a two-way
 * collider would leave him standing inside a wall he cannot cross. Blocking
 * only the way IN is the general invariant that covers every such teleport,
 * including ones nobody has thought of yet.
 */
export function settlementColliders(
  fromX: number,
  fromZ: number,
  places: readonly EnterablePlace[],
  collisionRadius: number,
  selfR: number,
  reach = Infinity,
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  if (collisionRadius <= 0) return out
  // A place farther off than the boundary plus this step's reach cannot be
  // entered by it, so it is skipped instead of re-swept every frame.
  const cutoff = collisionRadius + selfR + reach
  for (const p of places) {
    const d = Math.hypot(fromX - p.x, fromZ - p.z)
    if (d <= collisionRadius) continue // inside: free to leave (one-way)
    if (d > cutoff) continue
    out.push([p.x, p.z, Math.max(0, collisionRadius - selfR)])
  }
  return out
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
 * The name shown in the "Space to enter <name>" hint (design.md §2.3). An
 * UNDISCOVERED settlement's real name stays hidden — the hint reads the
 * localized KIND placeholder ("Unknown village") to match its §17.2 map label
 * (point 318) — while a discovered place (a known-from-start port, or one
 * already visited) shows its name. The caller passes the SAME discovery flag
 * the .map-label uses (visitedPlaces) and the same placeholder string.
 */
export function enterHintName(discovered: boolean, placeName: string, unknownLabel: string): string {
  return discovered ? placeName : unknownLabel
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
