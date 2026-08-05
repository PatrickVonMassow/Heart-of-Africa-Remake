// Blood as a GROUND TINT (design.md §19.5, points 267/323): the pure half — the
// patch geometry, its seeded ragged outline, the nearest-slot selection and the
// packing the shader reads. The shading itself is judged by the picture
// (scripts/verify/enrichments.mjs, screenshot 137): a stain on a slope with no
// see-through hole and no circle to be seen.

import { describe, it, expect } from 'vitest'
import {
  clampIrregularity,
  groundStainCoverage,
  groundStainSlots,
  groundStainWarpSlots,
  MAX_GROUND_STAINS,
  selectGroundStains,
  setGroundStains,
  stainContourFactor,
  stainContourRadius,
  stainSeed,
  STAIN_CORE,
  STAIN_LOOK_DEFAULT,
  STAIN_MAX_IRREGULARITY,
  STAIN_PHASES,
} from './groundStains'

/** A circle, for the checks that want the falloff without the contour. */
const ROUND = { sizeScale: 1, irregularity: 0 }

describe('groundStainCoverage — the patch follows the ground', () => {
  const stain = { x: 10, z: -4, r: 0.9 }

  it('soaks the centre fully and stops at the rim', () => {
    expect(groundStainCoverage([stain], 10, -4, ROUND)).toBe(1)
    expect(groundStainCoverage([stain], 10 + 0.9, -4, ROUND)).toBe(0)
    expect(groundStainCoverage([stain], 10 + 1.5, -4, ROUND)).toBe(0)
    // With the contour on, the rim moved — but only as far as it may.
    const far = 0.9 * (1 + STAIN_MAX_IRREGULARITY) + 1e-9
    expect(groundStainCoverage([stain], 10 + far, -4)).toBe(0)
  })

  it('holds full soak across the whole core, then fades out', () => {
    const core = 0.9 * STAIN_CORE
    expect(groundStainCoverage([stain], 10 + core * 0.99, -4, ROUND)).toBeCloseTo(1, 5)
    const mid = groundStainCoverage([stain], 10 + 0.7, -4, ROUND)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    // Monotone outward — a soft edge, not a stamped circle.
    expect(groundStainCoverage([stain], 10 + 0.8, -4, ROUND)).toBeLessThan(mid)
  })

  it('has NO hole: every point inside the outline is soaked, at any bearing', () => {
    // The point-267 bug in its pure form, now over the ragged outline of point
    // 323. The coverage takes only a horizontal position — no height — so
    // whatever relief stands at (x, z) is painted; and inside the contour the
    // value is positive everywhere, so no bearing and no distance leaves an
    // unpainted patch the ground could show through.
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2
      const rim = stainContourRadius(stain, ang)
      for (const f of [0, 0.2, 0.49, 0.5, 0.75, 0.9, 0.99]) {
        const c = groundStainCoverage([stain], stain.x + Math.cos(ang) * rim * f, stain.z + Math.sin(ang) * rim * f)
        expect(c).toBeGreaterThan(0)
        if (f <= STAIN_CORE) expect(c).toBeCloseTo(1, 9)
      }
    }
  })

  it('falls monotonically outward along every bearing — a rim can never pinch off a hole', () => {
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2
      let prev = Infinity
      for (let k = 0; k <= 40; k++) {
        const d = (k / 40) * 1.6
        const c = groundStainCoverage([stain], stain.x + Math.cos(ang) * d, stain.z + Math.sin(ang) * d)
        expect(c).toBeLessThanOrEqual(prev + 1e-12)
        prev = c
      }
    }
  })

  it('takes the strongest of overlapping patches', () => {
    const a = { x: 0, z: 0, r: 1 }
    const b = { x: 1.2, z: 0, r: 1 }
    expect(groundStainCoverage([a, b], 0, 0)).toBe(1)
    expect(groundStainCoverage([a, b], 1.2, 0)).toBe(1)
    // Near b, the pair soaks the ground that a alone would barely reach.
    expect(groundStainCoverage([a, b], 0.9, 0)).toBeGreaterThan(groundStainCoverage([a], 0.9, 0))
  })

  it('ignores a degenerate (zero-radius) patch, and a zero size factor', () => {
    expect(groundStainCoverage([{ x: 0, z: 0, r: 0 }], 0, 0)).toBe(0)
    expect(groundStainCoverage([{ x: 0, z: 0, r: 1 }], 0, 0, { sizeScale: 0, irregularity: 0.24 })).toBe(0)
  })

  it('grows and shrinks with the calibratable size factor', () => {
    const s = { x: 0, z: 0, r: 1, seed: 0.3 }
    // Just outside the outline at the base size, well inside it at double.
    const rim = stainContourRadius(s, 0)
    expect(groundStainCoverage([s], rim * 1.05, 0)).toBe(0)
    expect(groundStainCoverage([s], rim * 1.05, 0, { sizeScale: 2, irregularity: STAIN_LOOK_DEFAULT.irregularity })).toBeGreaterThan(0)
  })
})

describe('the stain outline is no circle (point 323)', () => {
  const bearings = 256
  /** The outline radius over a full turn. */
  const contour = (s: { x: number; z: number; r: number; seed?: number }, irregularity = STAIN_LOOK_DEFAULT.irregularity) =>
    Array.from({ length: bearings }, (_, i) =>
      stainContourRadius(s, (i / bearings) * Math.PI * 2, { sizeScale: 1, irregularity }))

  it('varies with the bearing by a clearly non-zero, bounded amount', () => {
    const s = { x: 3, z: -7, r: 0.9 }
    const rs = contour(s)
    const lo = Math.min(...rs)
    const hi = Math.max(...rs)
    // Clearly non-zero: the outline swings by a good fraction of its radius.
    expect((hi - lo) / s.r).toBeGreaterThan(0.15)
    // Bounded: never further off the base radius than the calibrated swing —
    // whatever the debug menu is set to, the cap holds.
    for (const irr of [0, 0.1, STAIN_LOOK_DEFAULT.irregularity, 3]) {
      const bound = clampIrregularity(irr)
      for (const r of contour(s, irr)) {
        expect(r).toBeGreaterThanOrEqual(s.r * (1 - bound) - 1e-9)
        expect(r).toBeLessThanOrEqual(s.r * (1 + bound) + 1e-9)
      }
    }
  })

  it('is never circular: at the calibrated swing no stain has a constant radius', () => {
    for (let i = 0; i < 40; i++) {
      const s = { x: i * 1.7 - 12, z: 5 - i * 0.9, r: 0.9 }
      const rs = contour(s)
      expect((Math.max(...rs) - Math.min(...rs)) / s.r).toBeGreaterThan(0.12)
    }
  })

  it('no two seeds draw the same outline', () => {
    const shapes = Array.from({ length: 40 }, (_, i) => contour({ x: 0, z: 0, r: 0.9, seed: i / 40 }))
    for (let a = 0; a < shapes.length; a++) {
      for (let b = a + 1; b < shapes.length; b++) {
        let worst = 0
        for (let i = 0; i < bearings; i++) worst = Math.max(worst, Math.abs(shapes[a][i] - shapes[b][i]))
        // Clearly different, not merely not-identical.
        expect(worst).toBeGreaterThan(0.05)
      }
    }
  })

  it('a stain keeps its shape as it grows, and takes its seed from where it lies', () => {
    const at = { x: 4.5, z: -1.25 }
    expect(stainSeed({ ...at, r: 0.4 })).toBe(stainSeed({ ...at, r: 1.1 }))
    expect(stainSeed({ ...at, r: 0.9 })).not.toBe(stainSeed({ x: 4.6, z: -1.25, r: 0.9 }))
    // Growing scales the outline, it does not reshape it.
    const small = contour({ ...at, r: 0.5 })
    const big = contour({ ...at, r: 1.5 })
    for (let i = 0; i < bearings; i++) expect(big[i] / small[i]).toBeCloseTo(3, 9)
  })

  it('a zero swing is exactly the old circle', () => {
    for (let i = 0; i < bearings; i++) {
      expect(stainContourFactor(0.42, (i / bearings) * Math.PI * 2, 0)).toBe(1)
    }
  })
})

describe('setGroundStains — the seeded outline it uploads', () => {
  it('packs one seeded phase per harmonic, and clears them with the slot', () => {
    setGroundStains([{ x: 7, z: -2, r: 0.9 }], 7, -2)
    const w = groundStainWarpSlots()[0]
    expect(STAIN_PHASES).toBe(4)
    const phases = [w.x, w.y, w.z, w.w]
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(Math.PI * 2)
    }
    // Four INDEPENDENT phases — a repeated one would fold harmonics together.
    expect(new Set(phases.map((p) => p.toFixed(6))).size).toBe(4)
    setGroundStains([], 0, 0)
    for (const s of groundStainWarpSlots()) expect([s.x, s.y, s.z, s.w]).toEqual([0, 0, 0, 0])
  })

  it('scales the packed radius by the calibratable size factor', () => {
    setGroundStains([{ x: 0, z: 0, r: 1 }], 0, 0, { sizeScale: 2, irregularity: 0.2 })
    // Slot z is r², so double the size is four times the packed value.
    expect(groundStainSlots()[0].z).toBeCloseTo(4, 6)
  })
})

describe('selectGroundStains — the nearest patches win the slots', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ x: i * 3, z: 0, r: 0.9 }))

  it('keeps the nearest, closest first, and never more than the slot count', () => {
    const near = selectGroundStains(many, 0, 0)
    expect(near).toHaveLength(MAX_GROUND_STAINS)
    expect(near[0].x).toBe(0)
    expect(near[1].x).toBe(3)
    expect(near[near.length - 1].x).toBe((MAX_GROUND_STAINS - 1) * 3)
  })

  it('re-picks around a moved viewpoint', () => {
    const near = selectGroundStains(many, 57, 0)
    expect(near[0].x).toBe(57)
    expect(near.every((s) => Math.abs(s.x - 57) <= (MAX_GROUND_STAINS - 1) * 3)).toBe(true)
  })

  it('passes a short list through untouched', () => {
    const two = [{ x: 4, z: 4, r: 0.9 }, { x: -4, z: 1, r: 0.9 }]
    expect(selectGroundStains(two, 0, 0)).toHaveLength(2)
  })
})

describe('setGroundStains — the packing the shader reads', () => {
  it('packs centre, r² and the falloff span, and clears the unused slots', () => {
    setGroundStains([{ x: 7, z: -2, r: 0.9 }], 7, -2)
    const slots = groundStainSlots()
    expect(slots[0].x).toBe(7)
    expect(slots[0].y).toBe(-2)
    expect(slots[0].z).toBeCloseTo(0.81, 6)
    // 1 / (r² − core²) — the reciprocal the shader multiplies by instead of
    // dividing per fragment.
    expect(slots[0].w).toBeCloseTo(1 / (0.81 - 0.81 * STAIN_CORE * STAIN_CORE), 6)
    for (let i = 1; i < MAX_GROUND_STAINS; i++) {
      expect([slots[i].x, slots[i].y, slots[i].z, slots[i].w]).toEqual([0, 0, 0, 0])
    }
  })

  it('an empty list clears every slot (a left settlement leaves no blood behind)', () => {
    setGroundStains([{ x: 1, z: 1, r: 1 }], 0, 0)
    setGroundStains([], 0, 0)
    for (const s of groundStainSlots()) expect([s.x, s.y, s.z, s.w]).toEqual([0, 0, 0, 0])
  })

  it('a cleared slot contributes nothing — its falloff term is exactly zero', () => {
    setGroundStains([], 0, 0)
    const s = groundStainSlots()[0]
    // The shader computes (s.z·g² − d²)·s.w·(1/g²); with the slot all-zero that
    // is 0 for every fragment and every contour factor, so an empty slot can
    // neither tint nor divide by zero.
    for (const d2 of [0, 1, 400]) {
      for (const g of [1 - STAIN_MAX_IRREGULARITY, 1, 1 + STAIN_MAX_IRREGULARITY]) {
        expect((s.z * g * g - d2) * s.w * (1 / (g * g))).toBeCloseTo(0, 10)
      }
    }
  })
})
