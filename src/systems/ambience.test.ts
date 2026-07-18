// Coastal surf fade (point 153, design.md §19.1): the surf bed is only audible
// near the coast — full at the shore, silent beyond a calibratable cutoff, and
// monotone between. The curve is pure, so it is pinned here.
import { describe, expect, it } from 'vitest'
import { coastSurfGain } from './ambience'

describe('coastSurfGain (point 153 — the coastal surf fade)', () => {
  const near = 0.4
  const cut = 3

  it('is full (1) at the shore and within the near radius', () => {
    expect(coastSurfGain(0, near, cut)).toBe(1)
    expect(coastSurfGain(near, near, cut)).toBe(1)
    expect(coastSurfGain(near * 0.5, near, cut)).toBe(1)
  })

  it('is exactly 0 at and beyond the cutoff (far inland is silent)', () => {
    expect(coastSurfGain(cut, near, cut)).toBe(0)
    expect(coastSurfGain(cut + 0.5, near, cut)).toBe(0)
    expect(coastSurfGain(15, near, cut)).toBe(0) // the live test's far-inland case
  })

  it('falls monotonically between the near radius and the cutoff', () => {
    let prev = coastSurfGain(near, near, cut)
    for (let d = near + 0.05; d < cut; d += 0.05) {
      const g = coastSurfGain(d, near, cut)
      expect(g).toBeLessThanOrEqual(prev)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      prev = g
    }
  })

  it('is a smoothstep — halfway between the edges it sits near 0.5', () => {
    const mid = (near + cut) / 2
    expect(coastSurfGain(mid, near, cut)).toBeCloseTo(0.5, 5)
  })
})
