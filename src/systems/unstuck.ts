/**
 * The escape from a wedged traveller (work-order 604).
 *
 * A traveller pressed into a gap he cannot walk out of loses the whole
 * expedition: the game saves only on entering a port (design.md §18), so being
 * stuck in a village costs every mile since the last harbour. The inhabitants
 * already have the remedy (`balance.walkerUnstuckSeconds`); this gives it to the
 * player, as a key HE presses — detection only informs, because a rescue nobody
 * asked for would teleport a man who is leaning against a wall on purpose.
 *
 * Both halves are pure and unit-testable; the scenes supply the world (which
 * ground is free, which points a wall) through the callbacks below.
 */

/** Directions probed on the innermost ring of the free-spot search; a wider ring
 *  is sampled proportionally denser, so the angular resolution stays even. */
const RING_DIRECTIONS = 12

/** The escape key (design.md §2.2/§17.5), as the PHYSICAL code the input layer
 *  polls and as the letter the toast shows — the same key on either layout. */
export const UNSTUCK_KEY_CODE = 'KeyU'
export const UNSTUCK_KEY_LABEL = 'U'

export interface StallState {
  /** Where he stood when the current stall window opened. */
  anchorX: number
  anchorZ: number
  /** Seconds he has held a movement input without leaving the anchor. */
  heldSeconds: number
  /** He is stuck: the hint is due. Cleared only by REAL movement. */
  stuck: boolean
}

export interface StallConfig {
  /** How far he must get from the anchor for this to count as movement, in metres. */
  stallDistance: number
  /** Seconds of held movement without that progress before he counts as stuck. */
  stallSeconds: number
}

export function newStallState(x: number, z: number): StallState {
  return { anchorX: x, anchorZ: z, heldSeconds: 0, stuck: false }
}

/**
 * One frame of stall detection.
 *
 * `moving` is whether the player is ASKING to move (a key, stick or virtual
 * stick held) — not whether he actually moved. Holding an input while the
 * position does not advance past `stallDistance` for `stallSeconds` is the
 * signature of being wedged; standing still is not, however long it lasts.
 * Real movement resets everything, which is what takes the hint off the screen.
 */
export function updateStall(
  s: StallState,
  x: number,
  z: number,
  moving: boolean,
  dt: number,
  cfg: StallConfig,
): StallState {
  if (Math.hypot(x - s.anchorX, z - s.anchorZ) > cfg.stallDistance) {
    return { anchorX: x, anchorZ: z, heldSeconds: 0, stuck: false }
  }
  if (!moving) {
    // Not asking to move: the clock stops, but a hint already raised stays until
    // he actually gets away — releasing the key is no proof of being free.
    return s.heldSeconds === 0 ? s : { ...s, heldSeconds: 0 }
  }
  const heldSeconds = s.heldSeconds + Math.max(0, dt)
  const stuck = s.stuck || heldSeconds >= cfg.stallSeconds
  return { ...s, heldSeconds, stuck }
}

/**
 * The hint that names the escape belongs on screen (work-order 610).
 *
 * On the stuck EDGE it is raised, as it always was. It is also raised again when
 * it has timed out while he is still holding an input and getting nowhere: the
 * hint is the only route to the escape for a player with no U key — on touch it
 * IS the button — and `stuck` only clears by real movement, so a man who missed
 * the one showing could never call it back. It never displaces another message:
 * a hint is only re-raised over an empty toast.
 */
export function stuckHintDue(
  stuck: boolean,
  wasStuck: boolean,
  moving: boolean,
  toastShowing: boolean,
): boolean {
  if (!stuck) return false
  if (!wasStuck) return true
  return moving && !toastShowing
}

export interface FreeSpotOptions {
  /** Ring spacing of the outward search, in metres. */
  step: number
  /** How far out the search looks, in metres. */
  maxRadius: number
  /**
   * The spot is usable: free of every collider for the mover's own footprint,
   * inside the settlement (or, travelling, inside the world's walkable ground),
   * and standing on the drawn ground.
   */
  accept: (x: number, z: number) => boolean
  /**
   * A POINT at (x,z) sits inside a collider — a wall between him and a candidate.
   * Without it the search may hand him a spot on the far side of a wall he could
   * never have walked through.
   */
  blocked?: (x: number, z: number) => boolean
  /** Used when nothing within `maxRadius` passes: free by construction (the
   *  place's entry point). */
  fallback: readonly [number, number]
}

/**
 * The nearest collision-free spot to (x,z), by a deterministic outward search:
 * widening rings, each sampled in a fixed angular order, first acceptable
 * candidate wins — so the same wedge always frees him to the same place.
 *
 * `found` is false when the radius held nothing; the position is then the
 * caller's fallback.
 */
export function findFreeSpot(
  x: number,
  z: number,
  o: FreeSpotOptions,
): { pos: [number, number]; found: boolean } {
  if (o.accept(x, z)) return { pos: [x, z], found: true }
  const step = Math.max(1e-3, o.step)
  const rings = Math.max(1, Math.floor(o.maxRadius / step))
  // The line-of-sight rule only applies while he stands on open ground. Pressed
  // INSIDE a collider there is no clear line anywhere, and refusing every
  // candidate would send him to the entry point across the settlement.
  const guardWalls = o.blocked !== undefined && !o.blocked(x, z)
  for (let ring = 1; ring <= rings; ring++) {
    const r = ring * step
    const n = RING_DIRECTIONS * ring // denser sampling on the wider rings
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      if (!o.accept(px, pz)) continue
      if (guardWalls && !lineOfSightClear(x, z, px, pz, o.blocked!, step)) continue
      return { pos: [px, pz], found: true }
    }
  }
  return { pos: [o.fallback[0], o.fallback[1]], found: false }
}

/**
 * What a press of the escape key actually achieved — the message must say this
 * and nothing better (work-order 610).
 *
 * `freed` he was carried to another spot; `alreadyFree` he stood on open ground
 * and the search left him there; `noRoom` the radius held nothing and the
 * fallback was the spot he was already standing on, so NOBODY was freed. The
 * bird's-eye search falls back to the traveller's own position, so it produced
 * `noRoom` while the game still announced a rescue.
 */
export type EscapeOutcome = 'freed' | 'alreadyFree' | 'noRoom'

export function escapeOutcome(
  fromX: number,
  fromZ: number,
  result: { pos: readonly [number, number]; found: boolean },
): EscapeOutcome {
  // A hair of floating-point drift is not a rescue; a real one moves him at
  // least one search step.
  if (Math.hypot(result.pos[0] - fromX, result.pos[1] - fromZ) > 1e-6) return 'freed'
  return result.found ? 'alreadyFree' : 'noRoom'
}

/** No sampled point on the straight line from (x1,z1) to (x2,z2) lies inside a
 *  collider — the candidate is reachable without passing through a wall. */
function lineOfSightClear(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  blocked: (x: number, z: number) => boolean,
  step: number,
): boolean {
  const dist = Math.hypot(x2 - x1, z2 - z1)
  const samples = Math.max(1, Math.ceil(dist / Math.min(step, 0.25)))
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    if (blocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return false
  }
  return true
}
