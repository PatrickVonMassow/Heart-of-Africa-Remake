// Seeded noise (design.md §18): the procedural per-run appearance must be
// deterministic per seed and bounded. Pure math, no browser.
import { describe, it, expect } from 'vitest'
import { mulberry32, fbm2 } from './noise'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const seq = (s: number) => { const r = mulberry32(s); return Array.from({ length: 12 }, () => r()) }
    expect(seq(42)).toEqual(seq(42))
  })

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('stays in [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 2000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('fbm2', () => {
  it('is deterministic per (x, y, seed)', () => {
    expect(fbm2(1.5, 2.5, 42)).toBe(fbm2(1.5, 2.5, 42))
  })

  it('stays within [0, 1] across a wide sample', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 0.37, i * 0.71, 42)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('varies with position and with seed', () => {
    expect(fbm2(1, 1, 42)).not.toBe(fbm2(5, 9, 42))
    expect(fbm2(1, 1, 42)).not.toBe(fbm2(1, 1, 7))
  })

  it('honors the octave count (more octaves add detail)', () => {
    // A single octave is smoother than four at the same point in general; at
    // minimum the two differ, proving the octave loop runs.
    expect(fbm2(2.3, 4.1, 42, 1)).not.toBe(fbm2(2.3, 4.1, 42, 4))
  })
})
