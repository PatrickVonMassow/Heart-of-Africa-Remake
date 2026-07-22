import { describe, it, expect } from 'vitest'
import {
  SPRING_POOL_RADIUS,
  SPRING_RIPPLE_COUNT,
  SPRING_BUBBLE_COUNT,
  springRipple,
  springBubble,
} from './springAnimation'

// Point 219: the open-land spring is a small animated water pool (bubbles +
// expanding ripples), not a flat symbolic ring. These pin the pure animation
// maths that drive the ripple rings and rising bubbles.

describe('spring constants', () => {
  it('describes a small, bounded pool with several ripples and bubbles', () => {
    expect(SPRING_POOL_RADIUS).toBeGreaterThan(0)
    expect(SPRING_POOL_RADIUS).toBeLessThan(1) // small, unobtrusive at bird's-eye zoom
    expect(SPRING_RIPPLE_COUNT).toBeGreaterThanOrEqual(1)
    expect(SPRING_BUBBLE_COUNT).toBeGreaterThanOrEqual(1)
  })
})

describe('springRipple', () => {
  it('wells up near the centre and expands out to the pool rim', () => {
    // Walk one full period for ripple 0; radius climbs from near-centre to
    // the pool radius and never leaves the pool.
    const period = 2.8
    let prev = -Infinity
    for (let k = 0; k < 10; k++) {
      const t = (k / 10) * period
      const { radius } = springRipple(0, t)
      expect(radius).toBeGreaterThan(0)
      expect(radius).toBeLessThanOrEqual(SPRING_POOL_RADIUS + 1e-9)
      if (k > 0) expect(radius).toBeGreaterThan(prev) // monotone growth within the cycle
      prev = radius
    }
  })

  it('fades from visible at the source to nearly gone at the rim', () => {
    const near = springRipple(0, 0) // phase 0 — freshly welled, most opaque
    const far = springRipple(0, 2.8 * 0.999) // end of cycle — spread and faded
    expect(near.opacity).toBeGreaterThan(far.opacity)
    expect(far.opacity).toBeGreaterThanOrEqual(0)
    expect(near.opacity).toBeLessThanOrEqual(0.45 + 1e-9)
  })

  it('loops seamlessly (t and t+period agree) and never goes negative for any t', () => {
    for (let i = 0; i < SPRING_RIPPLE_COUNT; i++) {
      const a = springRipple(i, 0.7)
      const b = springRipple(i, 0.7 + 2.8)
      expect(b.radius).toBeCloseTo(a.radius, 6)
      expect(b.opacity).toBeCloseTo(a.opacity, 6)
      // negative t (defensive) still yields an in-range phase
      const neg = springRipple(i, -0.5)
      expect(neg.radius).toBeGreaterThan(0)
      expect(neg.opacity).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('springBubble', () => {
  it('rises from the bed to the surface and stays within the pool height', () => {
    const rise = 0.22
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * 1.6
      const { y, scale } = springBubble(0, t)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(rise + 1e-9)
      expect(scale).toBeGreaterThanOrEqual(-1e-9) // swells then shrinks, never below zero
    }
  })

  it('swells in mid-climb and vanishes at the ends', () => {
    const bottom = springBubble(0, 0) // phase 0
    const mid = springBubble(0, 0.8) // phase 0.5 — largest
    expect(mid.scale).toBeGreaterThan(bottom.scale)
    expect(bottom.scale).toBeCloseTo(0, 6)
  })

  it('staggers bubbles across the group (they are not all at the same height)', () => {
    const heights = Array.from({ length: SPRING_BUBBLE_COUNT }, (_, i) => springBubble(i, 0.3).y)
    const unique = new Set(heights.map((h) => h.toFixed(4)))
    expect(unique.size).toBeGreaterThan(1)
  })
})
