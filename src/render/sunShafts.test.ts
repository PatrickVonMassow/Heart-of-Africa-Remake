import { describe, expect, it } from 'vitest'
import { shaftMaskWeight } from './sunShafts'

describe('sun-shaft mask lobe (point 345)', () => {
  it('is full at the sun and falls off with distance', () => {
    expect(shaftMaskWeight(0, 0.3)).toBe(1)
    expect(shaftMaskWeight(0.3, 0.3)).toBeCloseTo(Math.exp(-1), 6)
    expect(shaftMaskWeight(0.1, 0.3)).toBeGreaterThan(shaftMaskWeight(0.2, 0.3))
  })

  it('leaves the far frame out of the mask', () => {
    expect(shaftMaskWeight(0.9, 0.3)).toBeLessThan(1e-3)
  })
})
