// The horizon sweep (scripts/horizonSweep.mjs, design.md §2.7): the linear-time
// sweep must equal the brute-force ray march, and both must meet the analytic
// horizons of simple shapes. This comparison is what proves the fast path.
import { describe, it, expect } from 'vitest'
import {
  OCCLUSION_STEPS,
  SUN_AZIMUTHS,
  SUN_STEPS,
  bruteHorizon,
  decodeSlope,
  encodeSlope,
  meanHorizon,
  stepAzimuth,
  sweepHorizon,
} from '../../scripts/horizonSweep.mjs'

const CELL = 5000 // meters per texel

function grid(w: number, h: number, f: (x: number, y: number) => number): Float32Array {
  const g = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y)
  return g
}

const ALL_STEPS = [...SUN_STEPS, ...OCCLUSION_STEPS]
const W = 41
const H = 33
const cone = grid(W, H, (x, y) => Math.max(0, 3000 - Math.hypot(x - 20, y - 16) * 300))
// A north-south ridge with a bumpy flank, so hull pops are exercised.
const ridge = grid(W, H, (x, y) => Math.max(0, 2500 - Math.abs(x - 14) * 400) + 150 * Math.sin(x * 1.7) * Math.cos(y * 0.9) + 200)

describe('horizon sweep against the brute-force reference', () => {
  for (const [name, field] of [
    ['cone', cone],
    ['ridge', ridge],
  ] as const) {
    it(`matches the ray march exactly on every baked direction (${name})`, () => {
      for (const step of ALL_STEPS) {
        const fast = sweepHorizon(field, W, H, step, CELL)
        const ref = bruteHorizon(field, W, H, step, CELL)
        let maxErr = 0
        for (let i = 0; i < fast.length; i++) maxErr = Math.max(maxErr, Math.abs(fast[i] - ref[i]))
        expect(maxErr, `step ${step.join(',')}`).toBeLessThan(1e-6)
      }
    })
  }

  it('a flat plain has horizon 0 in every direction', () => {
    const flat = grid(W, H, () => 640)
    for (const step of ALL_STEPS) {
      expect(Math.max(...sweepHorizon(flat, W, H, step, CELL))).toBe(0)
    }
  })

  it('a wall yields the analytic angle', () => {
    // A 2000 m wall along the west edge (x = 0): from x, looking due west
    // (step [-1, 0]) the rise is 2000 m over x texels.
    const wall = grid(W, H, (x) => (x === 0 ? 2000 : 0))
    const west = sweepHorizon(wall, W, H, [-1, 0], CELL)
    for (const x of [1, 3, 10, 40]) {
      expect(west[10 * W + x]).toBeCloseTo(2000 / (x * CELL), 6)
    }
    // Looking away from the wall sees nothing.
    expect(Math.max(...sweepHorizon(wall, W, H, [1, 0], CELL))).toBe(0)
    // Diagonally the distance grows by the step length: [-8, 1] runs sqrt(65)/8 texels per column.
    const diag = sweepHorizon(wall, W, H, [-8, 1], CELL)
    expect(diag[10 * W + 8]).toBeCloseTo(2000 / (8 * CELL * Math.sqrt(1 + 1 / 64)), 6)
  })

  it('the cone shades its lee: west of the peak sees no horizon toward the west sun beyond the slope', () => {
    const westward = sweepHorizon(cone, W, H, [-1, 0], CELL)
    // East of the peak the cone rises toward the west sun: shadowed side.
    expect(westward[16 * W + 30]).toBeGreaterThan(0.05)
    // West of the peak the ground falls away toward the sun.
    expect(westward[16 * W + 8]).toBe(0)
  })
})

describe('sky occlusion measure', () => {
  it('is monotone: a pit is more occluded than the ridge beside it', () => {
    // A ridge at x = 10 and a pit at x = 20 between two ridges.
    const land = grid(W, H, (x) => 1000 + 800 * Math.max(0, 1 - Math.abs(x - 10) / 4) + 800 * Math.max(0, 1 - Math.abs(x - 30) / 4) - 600 * Math.max(0, 1 - Math.abs(x - 20) / 3))
    const occ = meanHorizon(land, W, H, CELL)
    const row = 16 * W
    expect(occ[row + 20]).toBeGreaterThan(occ[row + 10])
    expect(occ[row + 20]).toBeGreaterThan(occ[row + 30])
  })
})

describe('slice directions and encoding', () => {
  it('the six sun steps cover the 16:00 arc at ~15 degree steps', () => {
    expect(SUN_AZIMUTHS).toHaveLength(6)
    expect(SUN_AZIMUTHS[0]).toBeCloseTo(233.13, 2)
    expect(SUN_AZIMUTHS[5]).toBeCloseTo(306.87, 2)
    for (let i = 1; i < 6; i++) {
      const d = SUN_AZIMUTHS[i] - SUN_AZIMUTHS[i - 1]
      expect(d).toBeGreaterThan(13)
      expect(d).toBeLessThan(16)
    }
  })

  it('the occlusion directions run round the full circle', () => {
    const az = OCCLUSION_STEPS.map(stepAzimuth).sort((a, b) => a - b)
    expect(az).toHaveLength(16)
    for (let i = 0; i < 16; i++) {
      const gap = ((i + 1 < 16 ? az[i + 1] : az[0] + 360) - az[i])
      expect(gap).toBeLessThan(25)
    }
  })

  it('encodes slopes monotonically with fine steps at low angles', () => {
    for (const s of [0, 0.001, 0.01, 0.1, 0.5, 1]) {
      expect(decodeSlope(encodeSlope(s))).toBeCloseTo(s, s < 0.02 ? 3 : 2)
    }
    expect(encodeSlope(2)).toBe(255)
    expect(encodeSlope(-1)).toBe(0)
  })
})
