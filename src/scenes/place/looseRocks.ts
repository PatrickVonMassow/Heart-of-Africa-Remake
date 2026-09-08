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
 * The stone the children's off-game ROCK is spoken at: the one nearest their own
 * quarter that a child can actually stand on.
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
): LooseRock | null {
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
