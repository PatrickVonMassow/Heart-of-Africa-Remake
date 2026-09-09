// THE STONE A CHILD CLIMBS (work-order 1080).
//
// The choice used to be "nearest", written out twice — once in `PlaceLife` and
// once in the replay that judges it — and the size of a boulder was written a
// third time as a literal in `layout.ts`. What the round needs is a stone that
// can be STOOD on, at the size the renderer draws it.

import { describe, expect, it } from 'vitest'
import { ROCK_TOP_UNITS } from '../../render/flora'
import { climbBoulder, looseRock, looseRockRadius } from './looseRocks'

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
})
