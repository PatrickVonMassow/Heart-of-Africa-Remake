// THE SETTLEMENT'S LOOSE BOULDERS: how big one is, and which of them a child
// climbs (work-order 687 for the stone, 1080 for the climb).
//
// One place, because the size was already written down twice — the collider
// radius as a literal in `layout.ts`, the mesh's height only inside the drawn
// geometry — and the choice of stone a third time, once in `PlaceLife` and once
// in the replay that judges it. A climb is played against the REAL stone: the
// approach stops outside its collider and the child's feet end up on its top, so
// a boulder that is one size to the renderer and another to the round puts the
// child inside the rock or in the air above it.

import { ROCK_TOP_UNITS } from '../../render/flora'

/** A scattered boulder as everything but the renderer needs it: where it is, how
 *  far its collider reaches, and how high a child stands when it climbs on. */
export interface LooseRock {
  x: number
  z: number
  radius: number
  height: number
}

/** The collider a scattered boulder claims at instance scale `s`. Deliberately
 *  wider than the drawn mesh: figures keep a hand's breadth off the stone rather
 *  than clipping its silhouette. */
export function looseRockRadius(s: number): number {
  return 0.35 + s * 0.5
}

/** One entry of the layout's rock scatter, as the rest of the game sees it. */
export function looseRock([x, z, s]: readonly [number, number, number]): LooseRock {
  return { x, z, radius: looseRockRadius(s), height: ROCK_TOP_UNITS * s }
}

/**
 * The stone the children's off-game ROCK is spoken at: the one the layout
 * DERIVED for it (`deriveClimbRock`), and a search only where a settlement's
 * fabric left no room for one.
 *
 * NEARNESS ALONE IS THE WRONG CHOICE (work-order 1080). The scatter draws its
 * instance scale from 0.3 to 1.0, so the nearest stone is as likely as not a
 * pebble a child would step OVER; a climb onto it reads as a stumble. The
 * nearest climbable one therefore wins.
 *
 * AND A SETTLEMENT WITHOUT ONE KEEPS THE GUARD ANYWAY, taking the tallest stone
 * it has. Dropping the boulder instead would drop the whole bank round with it —
 * `PlaceLife` builds no stage without a stone — which trades one word taught at
 * a low step for the entire game the children play.
 */
export function climbBoulder(
  rocks: ReadonlyArray<readonly [number, number, number]>,
  quarter: { x: number; z: number },
  minTop: number,
  derived: readonly [number, number, number] | null = null,
): LooseRock | null {
  // The derived stone wins outright: it is the tallest instance the scatter
  // draws and it stands a few paces off the quarter, so no search can improve
  // on it (work-order 1082).
  if (derived) return looseRock(derived)
  let nearestClimbable: LooseRock | null = null
  let nearest = Infinity
  let tallest: LooseRock | null = null
  for (const entry of rocks) {
    const rock = looseRock(entry)
    if (tallest === null || rock.height > tallest.height) tallest = rock
    if (rock.height < minTop) continue
    const d = Math.hypot(rock.x - quarter.x, rock.z - quarter.z)
    if (d < nearest) {
      nearest = d
      nearestClimbable = rock
    }
  }
  return nearestClimbable ?? tallest
}

/** The instance scale the derived climbing stone is placed at: the top of the
 *  scatter's own 0.3-1.0 range, so it is the tallest stone in the settlement and
 *  stands chest-high on a 0.55-scaled child (top `ROCK_TOP_UNITS` ≈ 0.53 m). */
export const CLIMB_ROCK_SCALE = 1

/** The top a derived climbing stone guarantees, in metres. */
export const CLIMB_ROCK_TOP = ROCK_TOP_UNITS * CLIMB_ROCK_SCALE

/**
 * THE STONE IS PLACED TO BE CLIMBED (work-order 1082), the way the two play
 * rocks are placed on the bank rather than looked for in the scatter.
 *
 * Point 1080 chose the climbing stone by SEARCH — the nearest instance above a
 * height floor — and the user reported the climb missing a second time. Height
 * and nearness were competing: the scatter's tops run 0.16-0.53 m, so raising
 * the floor pushed the climber metres further off (the measurement in
 * `climbableRockTop`'s own note) and lowering it put a child on a pebble. A
 * derived stone ends the competition — it is the tallest the scatter draws AND
 * a few paces off the quarter's rim.
 *
 * WHERE IT GOES: just outside the rim, on the side the group roams — the side
 * AWAY from the water, because the walk down to the bank is the one direction
 * the group leaves the quarter in and a stone on that line stands in the route
 * (`onWayToWater` refuses it anyway; preferring the far side means the sweep
 * does not have to spend its candidates finding that out). Rings outward from
 * the rim are tried in turn, so a settlement with no room immediately beside the
 * quarter still gets one within a short walk rather than none at all.
 *
 * `free` is the layout's own placement rule for a loose stone, passed in whole:
 * the huts, the lanes, the way to the water, the bank play lane, the way out,
 * the quarter disc and the dressing already scattered. Pure, so the derivation
 * can be pinned without a settlement.
 */
/**
 * How far outside the quarter's rim the rings are tried, in metres. The first
 * free candidate wins, so a settlement with room beside the quarter gets a stone
 * a pace away and only a crowded one reaches for the outer rings. MEASURED over
 * the 110 shipped village/seed layouts: 96 stand on the innermost ring (1.2 m
 * outside the rim), the other 14 spread out to 6.0 m — and stopping at 2.4 m
 * left 8 of the 110 with no derived stone at all, which is the one outcome this
 * list is long enough to prevent.
 */
const RINGS = [0, 0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6]

export function deriveClimbRock(
  quarter: { x: number; z: number; radius: number },
  water: { x: number; z: number } | null,
  clearance: number,
  free: (x: number, z: number, r: number) => boolean,
): [number, number, number] | null {
  const radius = looseRockRadius(CLIMB_ROCK_SCALE)
  // The rim the scatter's own quarter rule draws: the disc plus the stone's own
  // collider plus a walker, which is what keeps the rim standable.
  // …plus a hair, so a candidate laid exactly on the boundary cannot be refused
  // by the quarter rule it was derived from through a rounding difference.
  const rim = quarter.radius + radius + clearance + 1e-3
  // Straight away from the water where there is one; a settlement without a bank
  // has no preferred side and simply starts due north.
  const preferred = water
    ? Math.atan2(quarter.x - water.x, quarter.z - water.z)
    : 0
  const STEPS = 48
  for (const out of RINGS) {
    for (let k = 0; k < STEPS; k++) {
      // Fanned out from the preferred side in alternating steps, so the first
      // free candidate is the one closest to it rather than the first one a
      // sweep from due north happens to reach.
      const turn = (Math.ceil(k / 2) * (k % 2 === 0 ? 1 : -1) * 2 * Math.PI) / STEPS
      const a = preferred + turn
      const x = quarter.x + Math.sin(a) * (rim + out)
      const z = quarter.z + Math.cos(a) * (rim + out)
      if (free(x, z, radius)) return [x, z, CLIMB_ROCK_SCALE]
    }
  }
  return null
}
