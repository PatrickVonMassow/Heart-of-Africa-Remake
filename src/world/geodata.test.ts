// Real-DEM samplers (design.md §3 "Real geodata and terrain rendering"):
// bilinear elevation, land mask, coast distance and the dataset metadata. Needs
// the real dem.png, loaded once into jsdom via setupGeodata().
import { describe, it, expect, beforeAll } from 'vitest'
import { elevationAt, landFractionAt, coastDistanceAt, getDemMeta } from './geodata'
import { setupGeodata } from '../test/geodata'

beforeAll(async () => {
  await setupGeodata()
})

describe('elevationAt', () => {
  it('returns deep ocean far outside the bbox', () => {
    expect(elevationAt(0, -60)).toBe(-4000)
  })

  it('is high on the Kilimanjaro massif', () => {
    expect(elevationAt(-3.07, 37.35)).toBeGreaterThan(1500)
  })

  it('is negative in the open Atlantic', () => {
    // In-bbox deep water off the equatorial coast: real bathymetry, below 0.
    expect(elevationAt(0, -18)).toBeLessThan(0)
  })
})

describe('landFractionAt', () => {
  it('is ~1 deep inland (central Sahara)', () => {
    expect(landFractionAt(24, 15)).toBeGreaterThan(0.99)
  })

  it('is 0 in the open Atlantic', () => {
    expect(landFractionAt(0, -30)).toBe(0)
  })

  it('always stays within [0,1]', () => {
    for (const [lat, lon] of [
      [24, 15], [0, -30], [0, -18], [-3.07, 37.35], [-6.16, 39.3], [30.05, 31.45],
    ] as const) {
      const v = landFractionAt(lat, lon)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('coastDistanceAt', () => {
  it('is 0 in open ocean', () => {
    expect(coastDistanceAt(0, -18)).toBe(0)
  })

  it('is positive well inland', () => {
    expect(coastDistanceAt(24, 15)).toBeGreaterThan(0)
  })
})

describe('getDemMeta', () => {
  it('reports a plausible Africa bbox', () => {
    const m = getDemMeta()
    expect(m.lonMin).toBeLessThan(0)
    expect(m.lonMax).toBeGreaterThan(0)
    expect(m.latMin).toBeLessThan(0)
    expect(m.latMax).toBeGreaterThan(0)
  })
})
