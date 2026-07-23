// Deterministic seeded PRNG for the property-fuzz layer (design.md §7.2's
// "verify at realistically reachable states" applied in bulk): the fuzz tests
// draw thousands of random states and MUST be reproducible — a violation is
// reported with its seed and replays exactly. Never Math.random() here.
//
// mulberry32: a small, well-distributed 32-bit generator (period 2^32), fast
// enough to draw millions of samples inside the Vitest layer.

export interface FuzzRng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform float in [min, max). */
  range(min: number, max: number): number
  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number
  /** Uniform member of a non-empty array. */
  pick<T>(items: ReadonlyArray<T>): T
  /** Uniform angle in [-PI, PI). */
  angle(): number
  /** True with probability p. */
  bool(p?: number): boolean
}

/** Create a deterministic generator from a 32-bit seed. Equal seeds yield
 *  identical sequences across runs and platforms (pure integer math). */
export function createFuzzRng(seed: number): FuzzRng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    angle: () => -Math.PI + next() * Math.PI * 2,
    bool: (p = 0.5) => next() < p,
  }
}

/** Deterministic hash of an integer grid cell to [0, 1) — the fuzz suite's
 *  reproducible "random world" (water masks, screen masks) without state. */
export function hashCell01(ix: number, iz: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(salt, 974634577)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
