import { describe, expect, it } from 'vitest'
import { dustPuff, dustRises, plumeAge, plumePuff, type DustTuning, type PlumeTuning } from './smokeDust'

const PLUME: PlumeTuning = { height: 5, driftPerM: 0.4, driftDirDeg: 90, startSize: 0.6, endSize: 2.4, opacity: 0.4, thinning: 1.4 }
const DUST: DustTuning = { dryBelow: 0.15, life: 0.9, size: 0.4, growth: 1.5, lift: 0.3, opacity: 0.4, spacing: 0.9 }

describe('the fire plume: drift and thinning by height and weather (design.md §19.10)', () => {
  it('leans with the calibrated drift, more the higher a puff stands', () => {
    const low = plumePuff(0.2, 1, PLUME)
    const high = plumePuff(0.8, 1, PLUME)
    expect(high.y).toBeGreaterThan(low.y)
    // Bearing 90°: the lean is along +X, proportional to height.
    expect(low.x).toBeCloseTo(PLUME.driftPerM * low.y, 6)
    expect(high.x).toBeCloseTo(PLUME.driftPerM * high.y, 6)
    expect(Math.abs(high.z)).toBeLessThan(1e-9)
    expect(plumePuff(0.5, 1, { ...PLUME, driftPerM: 0 }).x).toBe(0)
  })

  it('thins with height once risen off the hearth', () => {
    const ops = [0.2, 0.4, 0.6, 0.8, 0.99].map((a) => plumePuff(a, 1, PLUME).opacity)
    for (let i = 1; i < ops.length; i++) expect(ops[i]).toBeLessThan(ops[i - 1])
    expect(plumePuff(1, 1, PLUME).opacity).toBe(0)
  })

  it('rain thins it and shortens the column; an out fire has none', () => {
    const dry = plumePuff(0.5, 1, PLUME)
    const rain = plumePuff(0.5, 0.3, PLUME)
    expect(rain.opacity).toBeLessThan(dry.opacity)
    expect(rain.y).toBeLessThan(dry.y)
    for (const a of [0, 0.1, 0.5, 0.9]) expect(plumePuff(a, 0, PLUME).opacity).toBe(0)
  })

  it('staggers the puffs evenly through one life cycle', () => {
    const ages = [0, 1, 2, 3].map((i) => plumeAge(i, 4, 0, 6))
    expect(ages).toEqual([0, 0.25, 0.5, 0.75])
    expect(plumeAge(0, 4, 3, 6)).toBeCloseTo(0.5, 9)
  })
})

describe('the walker dust predicate (design.md §19.10)', () => {
  it('is true on dry ground and false on wet ground', () => {
    expect(dustRises(0, DUST)).toBe(true)
    expect(dustRises(0.1, DUST)).toBe(true)
    expect(dustRises(0.15, DUST)).toBe(false)
    expect(dustRises(0.6, DUST)).toBe(false)
    expect(dustRises(1, DUST)).toBe(false)
  })

  it('a dust puff fades out by the end of its life', () => {
    expect(dustPuff(0.3, DUST).opacity).toBeGreaterThan(0)
    expect(dustPuff(1, DUST).opacity).toBe(0)
    expect(dustPuff(0.8, DUST).size).toBeGreaterThan(dustPuff(0.2, DUST).size)
  })
})
