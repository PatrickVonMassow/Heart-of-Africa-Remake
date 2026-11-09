// The grass fire's front geometry and scar tint (design.md §19.8/§19.13): the
// pure half. The drawing itself is judged by the picture (scripts/verify/
// enrichments.mjs section 'burning-grass', frame 131, measured while it burns).

import { describe, it, expect } from 'vitest'
import { balance } from '../../config/balance'
import {
  emberCoverage,
  fireHalfWidth,
  fireLead,
  fireLocal,
  fireWorld,
  flameSlot,
  frontAlong,
  frontCurvature,
  frontLine,
  scarCoverage,
  scarHalfWidthAt,
  scarPolygon,
  scarTint,
  smokeFade,
  smokePhase,
  SOOT_RGB,
  type FirePlacement,
} from './grassFireFront'

const S = balance.grassFire
const EDGE = { edgeSoft: S.scarEdgeSoft }
const at = (front: number, heading = 0.7): FirePlacement => ({ x: 10, z: -4, heading, front })

describe('the fire front advances as a curved line', () => {
  it('every point of the line moves forward as the fire walks', () => {
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      let prev = -Infinity
      for (let front = 1; front <= S.maxFront; front += 1) {
        const across = t * fireHalfWidth(front, S)
        const a = frontAlong(across, front, S)
        // Advancing: the line never falls back anywhere across its width.
        expect(a).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = a
      }
    }
  })

  it('the centre leads the flanks (a head fire), and no flank sits behind ignition', () => {
    for (const front of [2, 10, 25, S.maxFront]) {
      const hw = fireHalfWidth(front, S)
      expect(frontAlong(0, front, S)).toBe(front)
      expect(frontAlong(hw, front, S)).toBeLessThan(front)
      expect(frontAlong(-hw, front, S)).toBeCloseTo(frontAlong(hw, front, S), 9)
      expect(frontAlong(hw, front, S)).toBeGreaterThanOrEqual(0)
    }
  })

  it('the line widens with its advance, capped', () => {
    expect(fireHalfWidth(0, S)).toBe(S.startHalfWidth)
    expect(fireHalfWidth(20, S)).toBeGreaterThan(fireHalfWidth(5, S))
    expect(fireHalfWidth(1e6, S)).toBe(S.maxHalfWidth)
  })

  it('curvature is bounded at every extent — never a kink, never a straight bar once grown', () => {
    const bound = (2 * S.maxLead) / (S.startHalfWidth * S.startHalfWidth)
    for (let front = 0.5; front <= S.maxFront; front += 0.5) {
      const k = frontCurvature(front, S)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThanOrEqual(bound + 1e-9)
    }
    // Grown, it visibly bows: the lead is a real share of the half-width.
    expect(fireLead(25, S)).toBeGreaterThan(0.2 * fireHalfWidth(25, S))
  })

  it('the sampled line is continuous (no gap between neighbouring points)', () => {
    const line = frontLine(at(30), S, 32)
    const hw = fireHalfWidth(30, S)
    for (let i = 1; i < line.length; i++) {
      const d = Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)
      expect(d).toBeLessThan((hw * 2) / 32 + 1)
    }
  })

  it('local and world frames are inverse', () => {
    const f = at(12, 2.1)
    const w = fireWorld(f, 7, -3)
    const l = fireLocal(f, w.x, w.z)
    expect(l.along).toBeCloseTo(7, 9)
    expect(l.across).toBeCloseTo(-3, 9)
  })
})

describe('the scar trails the front', () => {
  it('every scar-polygon vertex lies on or behind the burning line', () => {
    const f = at(28)
    for (const p of scarPolygon(f, S, 24)) {
      const l = fireLocal(f, p.x, p.z)
      expect(l.along).toBeLessThanOrEqual(frontAlong(l.across, f.front, S) + 1e-6)
      expect(l.along).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('the ground behind the line is burnt, ahead of it is not', () => {
    const f = at(30)
    const behind = fireWorld(f, 12, 0)
    const ahead = fireWorld(f, 34, 0)
    const beside = fireWorld(f, 12, fireHalfWidth(30, S) + 4)
    expect(scarCoverage(f, S, EDGE, 1, behind.x, behind.z)).toBe(1)
    expect(scarCoverage(f, S, EDGE, 1, ahead.x, ahead.z)).toBe(0)
    expect(scarCoverage(f, S, EDGE, 1, beside.x, beside.z)).toBe(0)
  })

  it('the rim is soft: coverage falls through intermediate values, never a hard step', () => {
    const f = at(30)
    const hw = scarHalfWidthAt(12, 30, S) // the scar is as wide as the fire was there
    const vals: number[] = []
    for (let k = -1.2; k <= 0.2; k += 0.1) {
      const p = fireWorld(f, 12, hw + k * S.scarEdgeSoft)
      vals.push(scarCoverage(f, S, EDGE, 1, p.x, p.z))
    }
    expect(vals.some((v) => v > 0.1 && v < 0.9)).toBe(true)
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThanOrEqual(vals[i - 1] + 1e-9)
  })

  it('the scar is a function of horizontal position only, and its fade scales it', () => {
    const f = at(30)
    const p = fireWorld(f, 15, 1)
    expect(scarCoverage(f, S, EDGE, 0.4, p.x, p.z)).toBeCloseTo(0.4, 9)
    expect(scarCoverage(f, S, EDGE, 0, p.x, p.z)).toBe(0)
  })

  it('the ember band glows at the line and dies off behind it', () => {
    const f = at(30)
    const atLine = fireWorld(f, 29.95, 0)
    const deep = fireWorld(f, 30 - S.emberDepth * 0.8, 0)
    const far = fireWorld(f, 10, 0)
    const e0 = emberCoverage(f, S, S.emberDepth, 1, atLine.x, atLine.z)
    const e1 = emberCoverage(f, S, S.emberDepth, 1, deep.x, deep.z)
    expect(e0).toBeGreaterThan(0.9)
    expect(e1).toBeLessThan(e0)
    expect(emberCoverage(f, S, S.emberDepth, 1, far.x, far.z)).toBe(0)
  })
})

describe('the scar tint samples as burnt earth', () => {
  const grass: [number, number, number] = [0.62, 0.52, 0.3] // cured savanna grass

  it('a full scar is far darker than the unburnt ground, and near-neutral (soot, not orange)', () => {
    const burnt = scarTint(grass, 1, S.scarDarkness)
    const l = (c: readonly number[]) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
    expect(l(burnt)).toBeLessThan(l(grass) * 0.35)
    expect(burnt[0] - burnt[2]).toBeLessThan(0.08)
  })

  it('no mask leaves the ground untouched; the tint grows monotonically with the mask', () => {
    expect(scarTint(grass, 0, S.scarDarkness)).toEqual(grass)
    let prev = Infinity
    for (let m = 0; m <= 1; m += 0.1) {
      const c = scarTint(grass, m, S.scarDarkness)
      const l = c[0] + c[1] + c[2]
      expect(l).toBeLessThanOrEqual(prev + 1e-9)
      prev = l
    }
  })

  it('the ground grain carries through: brighter ground stays brighter under the scar', () => {
    const a = scarTint([0.7, 0.6, 0.4], 1, S.scarDarkness)
    const b = scarTint([0.3, 0.25, 0.15], 1, S.scarDarkness)
    expect(a[1]).toBeGreaterThan(b[1])
    expect(a[0]).toBeLessThanOrEqual(SOOT_RGB[0] + 0.2)
  })
})

describe('flames and smoke have no travelling pattern', () => {
  it('flame slots are fixed per index and spread over the whole width', () => {
    const n = 24
    const slots = Array.from({ length: n }, (_, i) => flameSlot(i, n))
    expect(slots).toEqual(Array.from({ length: n }, (_, i) => flameSlot(i, n)))
    expect(Math.min(...slots)).toBeLessThan(-0.8)
    expect(Math.max(...slots)).toBeGreaterThan(0.8)
  })

  it('smoke puffs are out of phase with each other and fade in and out', () => {
    const ages = Array.from({ length: 12 }, (_, i) => smokePhase(i, 3.3, S.smokeLife).age)
    expect(new Set(ages.map((a) => a.toFixed(3))).size).toBeGreaterThan(8)
    expect(smokeFade(0)).toBe(0)
    expect(smokeFade(1)).toBe(0)
    expect(smokeFade(0.3)).toBe(1)
  })
})
