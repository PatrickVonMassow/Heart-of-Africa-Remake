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
  /** Fraction of the ground with a built wall within `FABRIC_REACH`, 0..1 — how
   *  much of the play spot stands AGAINST the settlement rather than out on the
   *  bare edge behind it (point 524). 1 when the caller named no fabric. */
  fabric: number
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
 * How near a built wall must stand for that patch of ground to count as being
 * AGAINST the settlement (point 524). Six metres is a village yard: at that
 * distance a hut fills a good part of the frame behind a child, while eight or
 * more let the outer half of a ground drift onto the bare plain and still score
 * full marks — measured against `verification/480-village-tag`, the frame that
 * showed one child on empty ground with the village out of shot.
 */
export const FABRIC_REACH = 6

/**
 * How much of the ground must stand against the fabric before it counts as a
 * play spot at all. Half is the bar the sparsest shipped villages (the
 * scattered forest plans of design.md §4.5) can still clear; the ring and
 * compound plans reach 0.9 and above.
 */
export const MIN_FABRIC = 0.5

/**
 * What the search is trading off among the grounds that keep their distance.
 * Standing against the village outweighs everything — a chase nobody can place
 * in a settlement teaches nothing — a clear ground outweighs a big one, and
 * SIZE is the lever that gives, because a smaller ground pulled in among the
 * huts reads as village life where a large one pushed out to the rim does not.
 */
const WEIGHT_FABRIC = 10
const WEIGHT_OPENNESS = 6
const WEIGHT_SIZE = 4

/** Metres between two candidate grounds along a radius and along a bearing. */
const SEARCH_STEP = 0.5

/**
 * Places the children's play ground: a disc that keeps the §13.4 hearing radius
 * (`minClearance`) between the children and every adult vignette — so a player
 * among the children is out of earshot of the adults and the other way round
 * (point 481.4) — and that STANDS AGAINST the settlement's built fabric, so the
 * chase is watched with the village behind it (point 524).
 *
 * Derived rather than hand-placed on purpose — a village's vignettes move with
 * its people's layout (design.md §4.5), and a hard-coded corner would silently
 * stop being the far one.
 *
 * WHAT GIVES, AND IN WHICH ORDER. The disc always stays inside the walkable rim
 * with a spectator's margin around it; beyond that the search ranks candidates:
 *  1. separated AND against the fabric — every shipped village has such a spot;
 *  2. against the fabric alone: the SEPARATION gives before the picture does
 *     (point 524.2), because children pushed out behind the rocks stop being
 *     village life at all. A caller that gets one of these back has two teaching
 *     voices inside one earshot and must tell them apart by other means;
 *  3. separated alone, then whatever the place allows.
 * Within a rank the score below decides, and SIZE is what it spends: the ground
 * SHRINKS (down to MIN_PLAY_RADIUS) to sit among the huts rather than reaching
 * out past the last of them. `clearance`, `openness` and `fabric` report what
 * was actually achieved, so a layout that cannot manage one of them fails a
 * test instead of quietly failing the player.
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
    /** The settlement's BUILT FABRIC: the ground positions of its dwellings and
     *  functional buildings. Given it, the search keeps the play ground against
     *  them (point 524). Left out, nothing is known and every ground counts as
     *  standing against the village. */
    fabric?: ReadonlyArray<readonly [number, number]>
    bearings?: number
  } = {},
): PlayGround {
  const bearings = options.bearings ?? 64
  const rMax = Math.max(1, Math.min(playRadius, walkRadius))
  const rMin = Math.min(rMax, MIN_PLAY_RADIUS)
  const fabric = options.fabric
  /** The disc sampled the same way for both measures: middle, and three rings. */
  const sample = (x: number, z: number, r: number, hit: (sx: number, sz: number) => boolean): number => {
    let ok = hit(x, z) ? 1 : 0
    let n = 1
    for (const ring of [0.35, 0.7, 1]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        n++
        if (hit(x + Math.cos(a) * r * ring, z + Math.sin(a) * r * ring)) ok++
      }
    }
    return ok / n
  }
  /** Fraction of the disc a child could stand on; 1 when nothing is known. */
  const openness = (x: number, z: number, r: number): number => {
    const free = options.free
    return free ? sample(x, z, r, free) : 1
  }
  /** Fraction of the disc with a wall within reach; 1 when nothing is known. */
  const fabricAt = (x: number, z: number, r: number): number =>
    fabric
      ? sample(x, z, r, (sx, sz) => fabric.some(([bx, bz]) => Math.hypot(bx - sx, bz - sz) <= FABRIC_REACH))
      : 1
  const measure = (x: number, z: number, r: number, clearance: number): PlayGround => ({
    x,
    z,
    radius: r,
    clearance,
    openness: openness(x, z, r),
    fabric: fabricAt(x, z, r),
  })
  const score = (g: PlayGround): number =>
    g.fabric * WEIGHT_FABRIC + g.openness * WEIGHT_OPENNESS + (g.radius / rMax) * WEIGHT_SIZE

  /**
   * Every candidate disc, largest first and out at the rim first, with the
   * distance to the nearest adult station already worked out. The clearance is
   * the CHEAP half — it needs no colliders — so the ranks below filter on it
   * before anything is sampled.
   */
  const eachCandidate = (visit: (x: number, z: number, r: number, clearance: number) => void): void => {
    for (let r = rMax; r >= rMin - 1e-9; r -= SEARCH_STEP) {
      // The whole ground stays inside the walkable area with a spectator's
      // margin around it: walking past the rim LEAVES the settlement, so a
      // ground pushed against it would put the watcher outside on half the
      // bearings.
      const rimDistance = Math.max(0, walkRadius - r - SPECTATOR_MARGIN)
      for (let d = rimDistance; d >= -1e-9; d -= SEARCH_STEP) {
        // At the centre every bearing is the same point.
        const fan = d < 1e-9 ? 1 : bearings
        for (let k = 0; k < fan; k++) {
          const a = (k / bearings) * Math.PI * 2
          const x = Math.cos(a) * d
          const z = Math.sin(a) * d
          let nearest = Infinity
          for (const [sx, sz] of stations) nearest = Math.min(nearest, Math.hypot(x - sx, z - sz))
          visit(x, z, r, nearest - r)
        }
      }
    }
  }

  // Rank 1: far enough from the adults AND standing against the village. Only
  // the candidates that already clear the cheap half are ever sampled.
  let best: PlayGround | null = null
  eachCandidate((x, z, r, clearance) => {
    if (clearance < minClearance) return
    const here = measure(x, z, r, clearance)
    if (!best || score(here) > score(best)) best = here
  })
  const separated: PlayGround | null = best
  if (separated && separated.fabric >= MIN_FABRIC) return separated

  // Rank 2: no separated ground stands against the village, so the SEPARATION
  // gives (point 524.2) — and gives as little as it must. Walked in order of
  // clearance, the first ground that stands against the fabric is the one that
  // loses the least, and only the equally-clear ones after it are weighed. The
  // whole set is only laid out HERE, on the path that needs it sorted.
  const candidates: Array<{ x: number; z: number; r: number; clearance: number }> = []
  eachCandidate((x, z, r, clearance) => void candidates.push({ x, z, r, clearance }))
  candidates.sort((a, b) => b.clearance - a.clearance)
  let fallback: PlayGround | null = null
  let lastResort: PlayGround | null = null
  for (const c of candidates) {
    if (fallback && c.clearance < fallback.clearance - 1e-9) break
    const here = measure(c.x, c.z, c.r, c.clearance)
    lastResort ??= here
    if (here.fabric < MIN_FABRIC) continue
    if (!fallback || score(here) > score(fallback)) fallback = here
  }
  if (fallback) return fallback

  // Rank 3: nothing here stands against the fabric at all — take the separation
  // if the place allows one, else the clearest ground there is, and REPORT it.
  return (
    separated ??
    lastResort ?? { x: 0, z: 0, radius: rMax, clearance: -Infinity, openness: 0, fabric: 0 }
  )
}
