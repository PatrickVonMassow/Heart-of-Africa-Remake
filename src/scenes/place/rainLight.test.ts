import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { RAIN_LIGHT_IDENTITY, rainAdaptedExposure, rainLightDamping } from './rainLight'
import { exposureTarget } from '../../render/exposureControl'

const L = balance.rainLight

describe('rain damps the settlement light (design.md §19.13)', () => {
  it('rain 0 is today’s sun and haze exactly', () => {
    expect(rainLightDamping(0, true)).toEqual(RAIN_LIGHT_IDENTITY)
    expect(rainLightDamping(-1, true)).toEqual(RAIN_LIGHT_IDENTITY)
    expect(rainLightDamping(Number.NaN, true)).toEqual(RAIN_LIGHT_IDENTITY)
    expect(RAIN_LIGHT_IDENTITY).toEqual({ sun: 1, hemi: 1, fogRange: 1, hazeMix: 0 })
  })

  it('rain 1 is the damped set', () => {
    const d = rainLightDamping(1, true)
    expect(d.sun).toBeCloseTo(1 - L.sunDamp * L.strength, 12)
    expect(d.hemi).toBeCloseTo(1 - L.hemiDamp * L.strength, 12)
    expect(d.fogRange).toBeCloseTo(1 - L.fogRangeCut * L.strength, 12)
    expect(d.hazeMix).toBeCloseTo(L.hazeMix * L.strength, 12)
    expect(d.sun).toBeLessThan(1)
    expect(d.fogRange).toBeLessThan(1)
    expect(d.hazeMix).toBeGreaterThan(0)
    expect(rainLightDamping(5, true)).toEqual(d)
  })

  it('is monotone in between', () => {
    let prev = rainLightDamping(0, true)
    for (let i = 1; i <= 50; i++) {
      const d = rainLightDamping(i / 50, true)
      expect(d.sun).toBeLessThan(prev.sun)
      expect(d.hemi).toBeLessThan(prev.hemi)
      expect(d.fogRange).toBeLessThan(prev.fogRange)
      expect(d.hazeMix).toBeGreaterThan(prev.hazeMix)
      prev = d
    }
  })

  it('the low detail level keeps the undimmed sun', () => {
    expect(rainLightDamping(1, false)).toEqual(RAIN_LIGHT_IDENTITY)
  })

  it('never goes dark or negative, even at a raised calibration', () => {
    const d = rainLightDamping(1, true, { strength: 4, sunDamp: 0.9, hemiDamp: 0.9, fogRangeCut: 0.9, hazeMix: 1 })
    expect(d.sun).toBeGreaterThan(0)
    expect(d.fogRange).toBeGreaterThan(0)
    expect(d.hazeMix).toBeLessThanOrEqual(1)
  })
})

describe('rainAdaptedExposure', () => {
  const p = balance.exposure
  it('leaves the dry parameters untouched', () => {
    expect(rainAdaptedExposure(p, 1)).toBe(p)
    expect(rainAdaptedExposure(p, Number.NaN)).toBe(p)
  })
  it('keeps the eye from opening the damped scene back up', () => {
    for (const lum of [0.2, 0.55, 1.4]) {
      for (const damp of [0.5, 0.75]) {
        const wet = exposureTarget(lum * damp, rainAdaptedExposure(p, damp))
        expect(wet).toBeCloseTo(exposureTarget(lum, p), 9)
      }
    }
  })
})
