import { describe, expect, it } from 'vitest'
import { createFuzzRng, hashCell01 } from './fuzzRandom'

describe('createFuzzRng', () => {
  it('is deterministic: the same seed replays the identical sequence', () => {
    const a = createFuzzRng(1234)
    const b = createFuzzRng(1234)
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next())
  })

  it('different seeds diverge', () => {
    const a = createFuzzRng(1)
    const b = createFuzzRng(2)
    let same = 0
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++
    expect(same).toBeLessThan(5)
  })

  it('next() stays in [0, 1) and fills all deciles (non-degenerate)', () => {
    const rng = createFuzzRng(42)
    const deciles = new Array(10).fill(0)
    let sum = 0
    for (let i = 0; i < 10000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      deciles[Math.floor(v * 10)]++
      sum += v
    }
    for (const d of deciles) expect(d).toBeGreaterThan(700) // uniform ~1000 each
    expect(sum / 10000).toBeGreaterThan(0.48)
    expect(sum / 10000).toBeLessThan(0.52)
  })

  it('range() respects its bounds', () => {
    const rng = createFuzzRng(7)
    for (let i = 0; i < 2000; i++) {
      const v = rng.range(-3.5, 12.25)
      expect(v).toBeGreaterThanOrEqual(-3.5)
      expect(v).toBeLessThan(12.25)
    }
  })

  it('int() is inclusive on both ends and hits every value', () => {
    const rng = createFuzzRng(99)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(2, 6)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(6)
      expect(Number.isInteger(v)).toBe(true)
      seen.add(v)
    }
    expect(seen.size).toBe(5)
  })

  it('pick() returns members and covers the whole array', () => {
    const rng = createFuzzRng(5)
    const items = ['a', 'b', 'c', 'd'] as const
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const v = rng.pick(items)
      expect(items).toContain(v)
      seen.add(v)
    }
    expect(seen.size).toBe(4)
  })

  it('angle() stays in [-PI, PI)', () => {
    const rng = createFuzzRng(11)
    for (let i = 0; i < 2000; i++) {
      const v = rng.angle()
      expect(v).toBeGreaterThanOrEqual(-Math.PI)
      expect(v).toBeLessThan(Math.PI)
    }
  })

  it('bool(p) tracks its probability', () => {
    const rng = createFuzzRng(21)
    let hits = 0
    for (let i = 0; i < 10000; i++) if (rng.bool(0.3)) hits++
    expect(hits / 10000).toBeGreaterThan(0.27)
    expect(hits / 10000).toBeLessThan(0.33)
  })
})

describe('hashCell01', () => {
  it('is deterministic and salt-sensitive', () => {
    expect(hashCell01(3, -7, 1)).toBe(hashCell01(3, -7, 1))
    expect(hashCell01(3, -7, 1)).not.toBe(hashCell01(3, -7, 2))
  })

  it('stays in [0, 1) and spreads across cells', () => {
    const seen = new Set<number>()
    for (let ix = -20; ix < 20; ix++) {
      for (let iz = -20; iz < 20; iz++) {
        const v = hashCell01(ix, iz, 0)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
        seen.add(Math.floor(v * 16))
      }
    }
    expect(seen.size).toBe(16) // all 16 buckets hit over 1600 cells
  })
})
