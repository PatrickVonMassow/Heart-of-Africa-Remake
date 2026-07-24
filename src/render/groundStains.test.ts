// Blood as a GROUND TINT (design.md §19.5, point 267): the pure half — the
// patch geometry, the nearest-slot selection and the packing the shader reads.
// The shading itself is judged by the picture (scripts/verify/enrichments.mjs,
// screenshot 137): a stain on a slope with no see-through hole.

import { describe, it, expect } from 'vitest'
import {
  groundStainCoverage,
  groundStainSlots,
  MAX_GROUND_STAINS,
  selectGroundStains,
  setGroundStains,
  STAIN_CORE,
} from './groundStains'

describe('groundStainCoverage — the patch follows the ground', () => {
  const stain = { x: 10, z: -4, r: 0.9 }

  it('soaks the centre fully and stops at the rim', () => {
    expect(groundStainCoverage([stain], 10, -4)).toBe(1)
    expect(groundStainCoverage([stain], 10 + 0.9, -4)).toBe(0)
    expect(groundStainCoverage([stain], 10 + 1.5, -4)).toBe(0)
  })

  it('holds full soak across the whole core, then fades out', () => {
    const core = 0.9 * STAIN_CORE
    expect(groundStainCoverage([stain], 10 + core * 0.99, -4)).toBeCloseTo(1, 5)
    const mid = groundStainCoverage([stain], 10 + 0.7, -4)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    // Monotone outward — a soft edge, not a stamped circle.
    expect(groundStainCoverage([stain], 10 + 0.8, -4)).toBeLessThan(mid)
  })

  it('has NO hole: every point inside the radius is soaked, at any bearing', () => {
    // The point-267 bug in its pure form. The coverage takes only a horizontal
    // position — no height — so whatever relief stands at (x, z) is painted;
    // and inside the radius the value is positive everywhere, so no bearing and
    // no distance leaves an unpainted patch the ground could show through.
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2
      for (const f of [0, 0.2, 0.49, 0.5, 0.75, 0.9, 0.99]) {
        const c = groundStainCoverage([stain], stain.x + Math.cos(ang) * stain.r * f, stain.z + Math.sin(ang) * stain.r * f)
        expect(c).toBeGreaterThan(0)
        if (f <= STAIN_CORE) expect(c).toBeCloseTo(1, 9)
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

  it('ignores a degenerate (zero-radius) patch', () => {
    expect(groundStainCoverage([{ x: 0, z: 0, r: 0 }], 0, 0)).toBe(0)
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
    // The shader computes (s.z − d²)·s.w; with the slot all-zero that is 0 for
    // every fragment, so an empty slot can neither tint nor divide by zero.
    for (const d2 of [0, 1, 400]) expect((s.z - d2) * s.w).toBeCloseTo(0, 10)
  })
})
