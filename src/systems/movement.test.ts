// Pure movement logic (CLAUDE.md §7.1 pt. 4/20, design.md §11/§2). Ported from
// the window.__movement dev-hook asserts of scripts/verify/enrichments.mjs and
// scripts/verify/settings.mjs — same coverage, no browser.
import { describe, it, expect } from 'vitest'
import { movementPenalty, placeWalkVelocity } from './movement'

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
