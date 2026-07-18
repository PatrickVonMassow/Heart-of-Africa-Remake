// Spawn-freedom helpers (point 155): an inhabitant spawn/target point is usable
// only if the mover fits there AND can leave — no fully enclosed pockets formed
// by stall boards, rocks and walls. The helpers are pure, so they are pinned
// here; the layout sweep in layout.test.ts asserts the real errand points pass.
import { describe, expect, it } from 'vitest'
import {
  boxCollider,
  hasEscapeDirection,
  nudgeToFree,
  spawnPointFree,
  standingClear,
  WALKER_RADIUS,
  type Collider,
} from './collision'

const R = WALKER_RADIUS

// A ring of circles around the origin. TIGHT (ringR 0.85, r 0.5): the mover
// fits at the centre (0.85 > 0.5 + R) but every step of 2·R lands inside a
// circle — fully enclosed. LOOSE (ringR 1.5, r 0.4): the mover fits and a step
// out lands clear — an escape exists.
function ring(ringR: number, r: number, n = 8): Collider[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: Math.cos(a) * ringR, z: Math.sin(a) * ringR, r }
  })
}
const tightRing = () => ring(0.85, 0.5)
const looseRing = () => ring(1.5, 0.4)

describe('standingClear (point 155 — the mover fits)', () => {
  it('is true in open space and false when a collider overlaps', () => {
    expect(standingClear([], 0, 0, R)).toBe(true)
    expect(standingClear([{ x: 0, z: 0, r: 1 }], 0, 0, R)).toBe(false)
    expect(standingClear([{ x: 5, z: 5, r: 1 }], 0, 0, R)).toBe(true)
    // Just touching the edge (distance === r + radius) does not overlap.
    expect(standingClear([{ x: 1 + R, z: 0, r: 1 }], 0, 0, R)).toBe(true)
    expect(standingClear([{ x: 1 + R - 0.05, z: 0, r: 1 }], 0, 0, R)).toBe(false)
  })

  it('respects oriented box colliders', () => {
    const box = boxCollider(0, 0, 1, 1, 0)
    expect(standingClear([box], 0, 0, R)).toBe(false)
    expect(standingClear([box], 3, 0, R)).toBe(true)
  })
})

describe('hasEscapeDirection (point 155 — the mover can leave)', () => {
  it('is true in open space', () => {
    expect(hasEscapeDirection([], 0, 0, R, R * 2)).toBe(true)
  })

  it('is false when a tight ring fully encloses the point', () => {
    expect(hasEscapeDirection(tightRing(), 0, 0, R, R * 2)).toBe(false)
  })

  it('is true when the ring is loose enough to step out of', () => {
    expect(hasEscapeDirection(looseRing(), 0, 0, R, R * 2)).toBe(true)
  })
})

describe('spawnPointFree (point 155)', () => {
  it('needs both a clear circle and an escape', () => {
    expect(spawnPointFree([], 0, 0, R)).toBe(true)
    // Enclosed pocket: the centre is clear but there is no way out.
    const pocket = tightRing()
    expect(standingClear(pocket, 0, 0, R)).toBe(true)
    expect(spawnPointFree(pocket, 0, 0, R)).toBe(false)
  })
})

describe('nudgeToFree (point 155 — relocate to the nearest usable spot)', () => {
  it('keeps a point that is already free', () => {
    expect(nudgeToFree([], 2, 3, R)).toEqual([2, 3])
  })

  it('moves a pocketed point to a spawn-free spot', () => {
    const pocket = tightRing()
    const [x, z] = nudgeToFree(pocket, 0, 0, R)
    expect(x === 0 && z === 0).toBe(false) // it moved
    expect(spawnPointFree(pocket, x, z, R)).toBe(true) // and the result is usable
  })

  it('moves a point sitting inside a solid collider out to free ground', () => {
    const box = [boxCollider(0, 0, 1.5, 1.5, 0)]
    const [x, z] = nudgeToFree(box, 0, 0, R)
    expect(spawnPointFree(box, x, z, R)).toBe(true)
  })
})
