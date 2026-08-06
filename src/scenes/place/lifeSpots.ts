// Fixed positions of the settlement-life props (design.md §19). Shared
// between PlaceLife (rendering) and the layout builder (colliders and
// keep-clear zones in PlaceScene).

export const VILLAGE_SPOTS = {
  talkers: [4.6, 5.6] as [number, number],
  pounder: [-7, 1.2] as [number, number],
  drummer: [-2.2, 0.2] as [number, number],
  well: [9, 8.5] as [number, number],
}

/** Chatting pair on the port plaza. */
export const PORT_TALKERS: [number, number] = [6, 6]

/**
 * Where the ADULTS of a village stand: the fixed vignettes of §19.10 — the pair
 * talking, the pounder, the drummer, the well, the weaver, and the three around
 * the fire. The errand walkers are deliberately NOT here: they cross the whole
 * settlement by design and no placement can separate them from anything.
 *
 * This list exists for one rule (work-order point 481.4): the children must
 * play far enough from the adults that the §13.4 hearing range separates the
 * two groups — among the children the player hears the children, among the
 * adults the adults, and in the middle of the village no babble of both.
 */
export function villageAdultStations(firePos: readonly [number, number]): Array<[number, number]> {
  const [fx, fz] = firePos
  return [
    VILLAGE_SPOTS.talkers,
    VILLAGE_SPOTS.pounder,
    VILLAGE_SPOTS.drummer,
    VILLAGE_SPOTS.well,
    [VILLAGE_SPOTS.well[0] - 1.1, VILLAGE_SPOTS.well[1]], // the water-carrier's stop
    [-8.5, -7], // the weaver at her loom
    [fx, fz], // the fire itself
    [fx + 1.2, fz + 1.0], // the cook
    [fx - 1.3, fz - 0.7], // the fire tender
    [fx + 0.7, fz + 1.8], // the bundle-carrier's stop
  ]
}

/** The children's play ground: where the group plays, and how far it roams. */
export interface PlayGround {
  x: number
  z: number
  radius: number
  /** Distance from the ground's RIM to the nearest adult station. The hearing
   *  rule holds when this is at least the hearing radius. */
  clearance: number
  /** Fraction of the ground a child can actually stand on, 0..1; 1 when the
   *  caller gave no collider predicate. */
  openness: number
}

/** The smallest ground a game of tag is still a game on. Below this the group
 *  is a huddle, so the search stops shrinking here even if the separation is
 *  then short — and says so through `clearance` rather than pretending. */
export const MIN_PLAY_RADIUS = 4

/**
 * Room kept between the ground's far edge and the walkable rim, so a player can
 * stand around the group and watch it from ANY side. Walking past the rim
 * LEAVES the settlement (design.md §2), so a ground pushed hard against it
 * would put the spectator out of the village on half the bearings — and
 * watching is how the whole teaching is learned.
 */
export const SPECTATOR_MARGIN = 5

/**
 * Places the children's play ground (point 481.4): the LARGEST disc, on the
 * bearing furthest from every adult station, whose whole area still clears them
 * by `minClearance` — the §13.4 hearing radius, so a player standing anywhere
 * among the children is out of earshot of every adult vignette and the other
 * way round. It sits out near the walkable rim, where a settlement has the room
 * a chase needs.
 *
 * Derived rather than hand-placed on purpose — a village's vignettes move with
 * its people's layout (design.md §4.5), and a hard-coded corner would silently
 * stop being the far one. It SHRINKS rather than gives up: a fire near the far
 * side leaves no 10 m ground at the full radius, and a slightly smaller one is
 * a better answer than children in the cook's earshot. The returned `clearance`
 * reports what was actually achieved, so a layout that cannot be separated at
 * all fails a test instead of quietly failing the player.
 */
export function childPlayGround(
  stations: ReadonlyArray<readonly [number, number]>,
  walkRadius: number,
  playRadius: number,
  minClearance = 0,
  options: {
    /** Whether a child may stand at a point — the settlement's own collider
     *  predicate. Given one, the search prefers OPEN ground among the bearings
     *  that are far enough away. It is not decoration: the first placement put
     *  the group behind a boulder line, where the chase read as two heads
     *  bobbing between rocks (verification/480-village-tag). Watching them is
     *  the whole teaching, so a ground you cannot see into is a bad ground. */
    free?: (x: number, z: number) => boolean
    bearings?: number
  } = {},
): PlayGround {
  const bearings = options.bearings ?? 64
  const rMax = Math.max(1, Math.min(playRadius, walkRadius))
  const rMin = Math.min(rMax, MIN_PLAY_RADIUS)
  /** Fraction of the disc a child could stand on; 1 when nothing is known. */
  const openness = (x: number, z: number, r: number): number => {
    const free = options.free
    if (!free) return 1
    let open = 0
    let n = 0
    for (const ring of [0.35, 0.7, 1]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        n++
        if (free(x + Math.cos(a) * r * ring, z + Math.sin(a) * r * ring)) open++
      }
    }
    n++
    if (free(x, z)) open++
    return open / n
  }
  const better = (a: PlayGround, b: PlayGround | null): boolean => {
    if (!b) return true
    // Openness first, and only among grounds that are far enough — a clear view
    // is worth a metre of separation, but never the separation rule itself.
    const far = (g: PlayGround) => g.clearance >= minClearance
    if (far(a) !== far(b)) return far(a)
    if (far(a) && Math.abs(a.openness - b.openness) > 0.05) return a.openness > b.openness
    return a.clearance > b.clearance
  }
  let best: PlayGround | null = null
  for (let r = rMax; r >= rMin - 1e-9; r -= 0.5) {
    // Out toward the rim, but not against it: the whole ground stays inside the
    // walkable area with a spectator's margin around it, and its middle is then
    // as far from the village's life as the place allows.
    const centreDistance = Math.max(0, walkRadius - r - SPECTATOR_MARGIN)
    let atThisSize: PlayGround | null = null
    for (let k = 0; k < bearings; k++) {
      const a = (k / bearings) * Math.PI * 2
      const x = Math.cos(a) * centreDistance
      const z = Math.sin(a) * centreDistance
      let nearest = Infinity
      for (const [sx, sz] of stations) nearest = Math.min(nearest, Math.hypot(x - sx, z - sz))
      const here: PlayGround = { x, z, radius: r, clearance: nearest - r, openness: 0 }
      // Openness is the expensive half, so it is only measured where the cheap
      // half already qualifies.
      if (here.clearance >= minClearance || !atThisSize) here.openness = openness(x, z, r)
      if (better(here, atThisSize)) atThisSize = here
    }
    if (!atThisSize) continue
    if (better(atThisSize, best)) best = atThisSize
    // The biggest ground that is far enough wins; only if none is do we shrink.
    if (atThisSize.clearance >= minClearance) return atThisSize
  }
  return best ?? { x: 0, z: 0, radius: rMax, clearance: -Infinity, openness: 0 }
}
