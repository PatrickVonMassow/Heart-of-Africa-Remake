// The river current that reads at a glance (work-order 1280): the drift speed
// follows the season with the gameplay current's own factors, one drift phase
// carries the shader and the flotsam, and every graphics level carries its
// stated amount of mixed flotsam. The picture — the frame pair at the Bambara
// bank and the 60-220 m band — is judged in scripts/verify/settings.mjs
// (section `river-current`).

import { describe, it, expect, afterEach } from 'vitest'
import { balance } from '../config/balance'
import { QUALITY_PRESETS } from '../config/quality'
import { advanceRiverDrift, riverDrift, riverDriftSpeed } from './waterAppearance'
import {
  FLOTSAM_FLOAT,
  FLOTSAM_KINDS,
  buildFlotsamGeometry,
  buildRiverFlecks,
  flotsamKinds,
  flotsamScale,
  fleckPosition,
} from './placeRiver'
import { BANK_WATER_DROP, type PlaceRiverBank } from '../scenes/place/riverBank'

describe('the drift speed follows the season', () => {
  it('runs at 1.3 m/s at a season factor of 1', () => {
    expect(balance.riverCurrent.driftBaseSpeed).toBe(1.3)
  })

  it('uses the gameplay current factors: dry 0.78 m/s, wet 2.34 m/s', () => {
    expect(balance.waterDrama.dryFlowFactor).toBe(0.6)
    expect(balance.waterDrama.wetFlowFactor).toBe(1.8)
    expect(riverDriftSpeed(0)).toBeCloseTo(0.78, 9)
    expect(riverDriftSpeed(1)).toBeCloseTo(2.34, 9)
  })

  it('is linear in the wetness between them, and clamped outside 0..1', () => {
    expect(riverDriftSpeed(0.5)).toBeCloseTo((0.78 + 2.34) / 2, 9)
    expect(riverDriftSpeed(-1)).toBeCloseTo(0.78, 9)
    expect(riverDriftSpeed(3)).toBeCloseTo(2.34, 9)
  })

  it('reads the factors live, so a debug edit of them lands at once', () => {
    const b = { riverCurrent: { ...balance.riverCurrent, driftBaseSpeed: 2 }, waterDrama: { ...balance.waterDrama, wetFlowFactor: 3 } }
    expect(riverDriftSpeed(1, b)).toBeCloseTo(6, 9)
  })
})

describe('one drift phase carries the whole surface', () => {
  const start = riverDrift.value
  afterEach(() => {
    riverDrift.value = start
  })

  it('advances by the frame time at the season speed', () => {
    riverDrift.value = 10
    advanceRiverDrift(0.05, 1)
    expect(riverDrift.value).toBeCloseTo(10 + 0.05 * 2.34, 9)
    advanceRiverDrift(0.05, 0)
    expect(riverDrift.value).toBeCloseTo(10 + 0.05 * 2.34 + 0.05 * 0.78, 9)
  })

  it('clamps a long frame like every scene step, and never runs backwards', () => {
    riverDrift.value = 0
    advanceRiverDrift(5, 0)
    expect(riverDrift.value).toBeCloseTo(0.1 * 0.78, 9)
    advanceRiverDrift(-1, 0)
    expect(riverDrift.value).toBeCloseTo(0.1 * 0.78, 9)
  })
})

describe('every graphics level carries its flotsam', () => {
  it('low 12, medium 48, high 90 items', () => {
    expect(QUALITY_PRESETS.low.placeRiverFlotsam).toBe(12)
    expect(QUALITY_PRESETS.medium.placeRiverFlotsam).toBe(48)
    expect(QUALITY_PRESETS.high.placeRiverFlotsam).toBe(90)
  })

  it('and each level builds exactly that many, of every kind', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      const n = QUALITY_PRESETS[level].placeRiverFlotsam
      const items = buildRiverFlecks(n)
      expect(items).toHaveLength(n)
      for (const k of FLOTSAM_KINDS) expect(items.some((f) => f.kind === k)).toBe(true)
    }
  })

  it('splits the kinds by the balance mix, to within one item', () => {
    const mix = balance.riverCurrent.flotsamMix
    const total = FLOTSAM_KINDS.reduce((a, k) => a + mix[k], 0)
    for (const n of [12, 48, 90]) {
      const kinds = flotsamKinds(n, mix)
      for (const k of FLOTSAM_KINDS) {
        const got = kinds.filter((x) => x === k).length
        expect(Math.abs(got - (n * mix[k]) / total)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('interleaves the kinds along the current rather than clumping them', () => {
    const kinds = flotsamKinds(48, balance.riverCurrent.flotsamMix)
    expect(kinds[0]).toBe('foam')
    let longestRun = 1
    let run = 1
    for (let i = 1; i < kinds.length; i++) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1
      longestRun = Math.max(longestRun, run)
    }
    expect(longestRun).toBeLessThanOrEqual(2)
  })

  it('is all foam where only foam has a share, and foam when no share is set', () => {
    expect(new Set(flotsamKinds(10, { foam: 1, leaf: 0, grass: 0, twig: 0 }))).toEqual(new Set(['foam']))
    expect(new Set(flotsamKinds(4, { foam: 0, leaf: 0, grass: 0, twig: 0 }))).toEqual(new Set(['foam']))
  })
})

describe('the debris floats ON the water and rides the current', () => {
  const bank = { nx: 1, nz: 0, fx: 0, fz: 1, distance: 30 } as PlaceRiverBank

  it('every kind floats clear of the ±0.03 m ripple', () => {
    for (const f of buildRiverFlecks(48)) {
      const p = fleckPosition(bank, f, 3)
      expect(p.y).toBeCloseTo(-BANK_WATER_DROP + FLOTSAM_FLOAT[f.kind], 9)
      expect(FLOTSAM_FLOAT[f.kind]).toBeGreaterThan(0.03)
    }
  })

  it('a leaf is a hand-sized leaf, a twig longer than a tuft (drawn metres)', () => {
    const leaf = flotsamScale('leaf', 0.5)
    const twig = flotsamScale('twig', 0.5)
    const grass = flotsamScale('grass', 0.5)
    expect(leaf[2]).toBeGreaterThan(0.1)
    expect(leaf[2]).toBeLessThan(0.3)
    expect(twig[2]).toBeGreaterThan(grass[2])
  })

  it('builds a non-empty unit geometry for each debris kind', () => {
    for (const k of ['leaf', 'grass', 'twig'] as const) {
      const g = buildFlotsamGeometry(k)
      const pos = g.getAttribute('position')
      expect(pos.count).toBeGreaterThan(2)
      g.computeBoundingBox()
      const size = g.boundingBox!.max.clone().sub(g.boundingBox!.min)
      // Unit length along the current, never a tower standing out of the water.
      expect(size.z).toBeGreaterThan(0.5)
      expect(size.z).toBeLessThanOrEqual(1.2)
      expect(size.y).toBeLessThan(0.2)
      g.dispose()
    }
  })
})
