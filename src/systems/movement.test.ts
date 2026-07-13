// Pure movement logic (CLAUDE.md §7.1 pt. 4/20, design.md §11/§2). Ported from
// the window.__movement dev-hook asserts of scripts/verify/enrichments.mjs and
// scripts/verify/settings.mjs — same coverage, no browser.
import { describe, it, expect } from 'vitest'
import { movementPenalty, placeWalkVelocity, pushOutOfCircles, resolveTravelMove } from './movement'

describe('movementPenalty', () => {
  it('jungle without a machete slows the traveller', () => {
    expect(movementPenalty('jungle', {})).toBe('jungle')
    expect(movementPenalty('jungle', { machete: 1 })).toBeNull()
  })

  it('water and ocean without a canoe slow the traveller', () => {
    expect(movementPenalty('water', {})).toBe('water')
    expect(movementPenalty('ocean', {})).toBe('water')
    expect(movementPenalty('water', { canoe: 1 })).toBeNull()
  })

  it('mountain without a rope slows the traveller', () => {
    expect(movementPenalty('mountain', {})).toBe('mountain')
    expect(movementPenalty('mountain', { rope: 1 })).toBeNull()
  })

  it('carrying the canoe is a penalty on every land type', () => {
    expect(movementPenalty('savanna', { canoe: 1 })).toBe('canoeOnLand')
    expect(movementPenalty('desert', { canoe: 1 })).toBe('canoeOnLand')
    expect(movementPenalty('jungle', { canoe: 1, machete: 1 })).toBe('canoeOnLand')
    expect(movementPenalty('mountain', { canoe: 1, rope: 1 })).toBe('canoeOnLand')
  })

  it('the more urgent missing-relief-item penalty wins over the canoe malus', () => {
    // Jungle without a machete but with the canoe: the jungle hint comes first.
    expect(movementPenalty('jungle', { canoe: 1 })).toBe('jungle')
  })

  it('nothing slows an equipped traveller on open savanna', () => {
    expect(movementPenalty('savanna', {})).toBeNull()
    expect(movementPenalty('savanna', { machete: 1, rope: 1 })).toBeNull()
  })
})

describe('placeWalkVelocity', () => {
  const SPEED = 10
  const FACTOR = 0.8

  it('walks forward at full speed', () => {
    expect(placeWalkVelocity(1, 0, SPEED, FACTOR)).toEqual([10, 0])
  })

  it('walks backward and strafes at the strafe factor', () => {
    expect(placeWalkVelocity(-1, 0, SPEED, FACTOR)).toEqual([-8, 0])
    expect(placeWalkVelocity(0, 1, SPEED, FACTOR)).toEqual([0, 8])
    expect(placeWalkVelocity(0, -1, SPEED, FACTOR)).toEqual([0, -8])
  })

  it('normalizes so a diagonal is never faster than a straight walk', () => {
    const [along, side] = placeWalkVelocity(1, 1, SPEED, FACTOR)
    expect(Math.hypot(along, side)).toBeLessThanOrEqual(SPEED + 1e-9)
    // Forward component keeps full weight, sideways is scaled by the factor.
    expect(along).toBeCloseTo((1 / Math.SQRT2) * SPEED, 6)
    expect(side).toBeCloseTo((1 / Math.SQRT2) * SPEED * FACTOR, 6)
  })

  it('is still when there is no input', () => {
    expect(placeWalkVelocity(0, 0, SPEED, FACTOR)).toEqual([0, 0])
  })
})

describe('pushOutOfCircles (bird-eye tree/animal collision, design.md §19)', () => {
  const dist = (a: [number, number], ox: number, oz: number) => Math.hypot(a[0] - ox, a[1] - oz)

  it('leaves a point outside every obstacle untouched', () => {
    expect(pushOutOfCircles(0, 0, [[5, 0, 1]], 0.5)).toEqual([0, 0])
  })

  it('pushes a point that overlaps an obstacle out to just clear of it', () => {
    // Player at (0.8,0), tree at origin r=1, self r=0.5 → must end ≥ 1.5 away.
    const p = pushOutOfCircles(0.8, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5)
    expect(p[0]).toBeGreaterThan(0.8) // pushed along the away direction (+x)
  })

  it('clears the one obstacle it overlaps while staying clear of a far one', () => {
    // Overlaps the near obstacle at (1,0); the one at (6,0) is out of range.
    const p = pushOutOfCircles(1, 0, [[0, 0, 1], [6, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5) // pushed clear of the near one
    expect(dist(p, 6, 0)).toBeGreaterThan(1.5) // never dragged toward the far one
  })

  it('parts coincident points instead of dividing by zero', () => {
    const p = pushOutOfCircles(3, 3, [[3, 3, 1]], 0.5)
    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
    expect(p).not.toEqual([3, 3])
  })
})

describe('resolveTravelMove (swept tree/animal collision, design.md §19)', () => {
  const dist = (a: [number, number], ox: number, oz: number) => Math.hypot(a[0] - ox, a[1] - oz)

  it('leaves a move that stays clear untouched', () => {
    expect(resolveTravelMove(0, 0, 0.5, 0, [[5, 0, 1]], 0.5)).toEqual([0.5, 0])
  })

  it('clamps a step that enters an obstacle to its near boundary', () => {
    // From x=-2 heading to x=-0.5 into a tree at origin (r1, self0.5 → minD 1.5).
    const p = resolveTravelMove(-2, 0, -0.5, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5) // stopped at the boundary, not inside
  })

  it('does not let a fast step tunnel through and pop out the far side', () => {
    // A big step from far west to far east straight through the obstacle: must be
    // clamped to the NEAR (west) boundary, never end up east of the obstacle.
    const p = resolveTravelMove(-3, 0, 3, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5)
    expect(p[0]).toBeLessThan(0) // still on the near (west) side — did not pass through
  })

  it('pushes a point already resting inside an obstacle out to the boundary', () => {
    const p = resolveTravelMove(0.2, 0, 0.2, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5)
  })

  it('slides along an obstacle approached off-centre (keeps a lateral component)', () => {
    // Heading east but offset north: clamped short in x, keeping the z offset so
    // the traveller can round the obstacle over following frames.
    const p = resolveTravelMove(-2, 0.6, 0, 0.6, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeGreaterThanOrEqual(1.5 - 1e-6) // never inside the body
  })
})
