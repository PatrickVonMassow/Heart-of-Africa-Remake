// THE STONE A CHILD CLIMBS (work-order 1080).
//
// The choice used to be "nearest", written out twice — once in `PlaceLife` and
// once in the replay that judges it — and the size of a boulder was written a
// third time as a literal in `layout.ts`. What the round needs is a stone that
// can be STOOD on, at the size the renderer draws it.

import { describe, expect, it } from 'vitest'
import { ROCK_TOP_UNITS } from '../../render/flora'
import { CLIMB_ROCK_SCALE, CLIMB_ROCK_TOP, climbBoulder, deriveClimbRock, looseRock, looseRockRadius } from './looseRocks'
import { WEDGE_PASSAGE } from './wedgeCarve'

const QUARTER = { x: 0, z: 0 }

describe('the settlement`s loose boulders', () => {
  it('reads a scatter entry at the size the renderer draws it', () => {
    const rock = looseRock([3, -4, 0.8])
    expect(rock.x).toBe(3)
    expect(rock.z).toBe(-4)
    expect(rock.radius).toBeCloseTo(looseRockRadius(0.8), 9)
    expect(rock.height).toBeCloseTo(ROCK_TOP_UNITS * 0.8, 9)
    // The collider stands proud of the drawn stone, which is why the approach
    // has to stop outside it rather than at the mesh.
    expect(rock.radius).toBeGreaterThan(rock.height)
  })

  it('takes the nearest stone that can be stood on, not simply the nearest', () => {
    const pebble: [number, number, number] = [1, 0, 0.3]
    const near: [number, number, number] = [4, 0, 0.9]
    const far: [number, number, number] = [20, 0, 1]
    const chosen = climbBoulder([pebble, near, far], QUARTER, 0.3)
    expect(chosen).not.toBeNull()
    expect(chosen!.x).toBe(4)
    // The pebble really was the closer one — the case is about the choice, not
    // about an ordering that happened to agree.
    expect(Math.hypot(pebble[0], pebble[1])).toBeLessThan(Math.hypot(near[0], near[1]))
    expect(ROCK_TOP_UNITS * pebble[2]).toBeLessThan(0.3)
  })

  it('keeps the guard on a settlement of pebbles by taking the tallest it has', () => {
    const chosen = climbBoulder(
      [
        [1, 0, 0.3],
        [9, 0, 0.45],
        [2, 2, 0.31],
      ],
      QUARTER,
      0.9,
    )
    // Nothing clears the bar, so the round still gets a stone rather than the
    // whole bank game being dropped for want of one.
    expect(chosen).not.toBeNull()
    expect(chosen!.x).toBe(9)
    expect(chosen!.height).toBeCloseTo(ROCK_TOP_UNITS * 0.45, 9)
  })

  it('has nothing to offer a settlement with no loose stone at all', () => {
    expect(climbBoulder([], QUARTER, 0.3)).toBeNull()
  })

  it('takes the DERIVED stone over anything the search would have found', () => {
    // A whole scatter of pebbles and one derived stone: the search's own answer
    // is the far tall one, and the derivation overrules it (work-order 1082).
    const derived: [number, number, number] = [6, 0, CLIMB_ROCK_SCALE]
    const chosen = climbBoulder([[1, 0, 0.3], [20, 0, 0.95], derived], QUARTER, 0.5, derived)
    expect(chosen).not.toBeNull()
    expect(chosen!.x).toBe(6)
    expect(chosen!.height).toBeCloseTo(CLIMB_ROCK_TOP, 9)
    // …and the renderer, the collider and the stand height are still ONE value.
    expect(chosen!.radius).toBeCloseTo(looseRockRadius(CLIMB_ROCK_SCALE), 9)
    expect(chosen).toEqual(looseRock(derived))
  })
})

// THE STONE IS PLACED RATHER THAN FOUND (work-order 1082).
describe('the derived climbing stone', () => {
  const QUARTER_DISC = { x: 4, z: -3, radius: 5 }
  /** Open ground: every candidate is free. */
  const anywhere = () => true

  it('stands just outside the quarter`s rim, at the top of the scatter`s size range', () => {
    const rock = deriveClimbRock(QUARTER_DISC, null, 0.3, anywhere)
    expect(rock).not.toBeNull()
    const stone = looseRock(rock!)
    expect(stone.height).toBeCloseTo(CLIMB_ROCK_TOP, 9)
    // OUTSIDE the disc, by its own collider plus the walker clearance it was
    // given — the rim the children roam to stays standable.
    const away = Math.hypot(stone.x - QUARTER_DISC.x, stone.z - QUARTER_DISC.z)
    expect(away).toBeGreaterThanOrEqual(QUARTER_DISC.radius + stone.radius + 0.3)
    // …and within a short walk of it rather than somewhere in the settlement.
    expect(away).toBeLessThan(QUARTER_DISC.radius + stone.radius + 0.3 + 0.1)
  })

  it('puts it on the side away from the water, where the group is not walking out', () => {
    const water = { x: 40, z: -3 }
    const rock = deriveClimbRock(QUARTER_DISC, water, 0.3, anywhere)!
    // The bearing from the quarter to the stone against the bearing to the
    // water: opposed, so the stone is not on the route down to the bank.
    const toStone = Math.atan2(rock[0] - QUARTER_DISC.x, rock[1] - QUARTER_DISC.z)
    const toWater = Math.atan2(water.x - QUARTER_DISC.x, water.z - QUARTER_DISC.z)
    const turn = Math.abs(Math.atan2(Math.sin(toStone - toWater), Math.cos(toStone - toWater)))
    expect(turn).toBeGreaterThan(Math.PI / 2)
  })

  it('walks outward ring by ring where the ground beside the quarter is taken', () => {
    // Everything within 8 m of the quarter's centre is refused: the derivation
    // reaches for the next ring rather than giving up on the stone.
    const rock = deriveClimbRock(QUARTER_DISC, null, 0.3, (x, z) =>
      Math.hypot(x - QUARTER_DISC.x, z - QUARTER_DISC.z) > 8)
    expect(rock).not.toBeNull()
    expect(Math.hypot(rock![0] - QUARTER_DISC.x, rock![1] - QUARTER_DISC.z)).toBeGreaterThan(8)
  })

  it('gives up rather than forcing a stone onto ground that refuses it', () => {
    expect(deriveClimbRock(QUARTER_DISC, null, 0.3, () => false)).toBeNull()
  })

  it('offers the placement rule the whole stone, collider and all', () => {
    // What the layout's own rule is asked about is the stone's COLLIDER radius,
    // not a point: a stone judged as a point would be dropped half inside a hut.
    const seen: number[] = []
    deriveClimbRock(QUARTER_DISC, null, 0.3, (_x, _z, r) => {
      seen.push(r)
      return true
    })
    expect(seen[0]).toBeCloseTo(looseRockRadius(CLIMB_ROCK_SCALE), 9)
  })

  it('leaves the carve`s own corridor clear where the rule asks it to', () => {
    // The layout passes `pinchesPassage` in as part of `free`; what this pins is
    // that the derivation honours a refusal of that shape rather than placing
    // the stone in the one gap that would carve a slot out of the play ground.
    const wall = { x: QUARTER_DISC.x + 12, z: QUARTER_DISC.z }
    const rock = deriveClimbRock(QUARTER_DISC, null, 0.3, (x, z, r) =>
      Math.hypot(x - wall.x, z - wall.z) - r - 2 > WEDGE_PASSAGE)!
    expect(rock).not.toBeNull()
    expect(Math.hypot(rock[0] - wall.x, rock[1] - wall.z) - looseRockRadius(CLIMB_ROCK_SCALE) - 2)
      .toBeGreaterThan(WEDGE_PASSAGE)
  })
})
