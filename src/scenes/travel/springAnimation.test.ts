import { describe, it, expect } from 'vitest'
import { SPRING_BUBBLE_RISE, springBubble } from './springAnimation'

// The bubble spheres rising out of the spring's welling dome (design.md §11.3).
// The dome's own surface animation is a TSL term; these pin the CPU sphere loop.

describe('springBubble', () => {
  it('rises from the crest and stays within the bubble height', () => {
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * 1.6
      const { y, scale } = springBubble(0, 4, t)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(SPRING_BUBBLE_RISE + 1e-9)
      expect(scale).toBeGreaterThanOrEqual(-1e-9) // swells then shrinks, never below zero
    }
  })

  it('swells in mid-climb and vanishes at the ends', () => {
    const bottom = springBubble(0, 4, 0) // phase 0
    const mid = springBubble(0, 4, 0.8) // phase 0.5 — largest
    expect(mid.scale).toBeGreaterThan(bottom.scale)
    expect(bottom.scale).toBeCloseTo(0, 6)
  })

  it('staggers bubbles across the group and loops with its period', () => {
    const heights = Array.from({ length: 4 }, (_, i) => springBubble(i, 4, 0.3).y)
    expect(new Set(heights.map((h) => h.toFixed(4))).size).toBe(4)
    expect(springBubble(2, 4, 0.7 + 1.6).y).toBeCloseTo(springBubble(2, 4, 0.7).y, 9)
    expect(springBubble(2, 4, -0.5).y).toBeGreaterThanOrEqual(0)
  })

  it('tolerates a zero count (LOW draws no spheres)', () => {
    expect(Number.isFinite(springBubble(0, 0, 1).y)).toBe(true)
  })
})
