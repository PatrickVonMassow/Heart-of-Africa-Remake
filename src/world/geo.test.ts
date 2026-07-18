// Geography model (design.md §3/§8): coordinate mapping, the five-region
// banding, the culture/value matrix and the border label anchors. Pure, no DEM.
import { describe, it, expect } from 'vitest'
import {
  latLonToWorld, worldToLatLon, regionAt, placeById, REGION_VALUES,
  regionBorderLabelAnchors, UNITS_PER_DEGREE, type RegionId,
} from './geo'

const REGIONS: RegionId[] = ['north', 'west', 'central', 'east', 'south']

describe('coordinate mapping', () => {
  it('round-trips lat/lon through world coordinates', () => {
    for (const [lat, lon] of [[30, 31], [-33.8, 18.5], [0, 0], [-6.16, 39.3]]) {
      const w = latLonToWorld(lat, lon)
      const b = worldToLatLon(w.x, w.z)
      expect(b.lat).toBeCloseTo(lat, 9)
      expect(b.lon).toBeCloseTo(lon, 9)
    }
  })

  it('applies the fixed units-per-degree with a flipped Z', () => {
    const east = latLonToWorld(0, 1)
    expect(east.x).toBe(UNITS_PER_DEGREE)
    expect(east.z).toBeCloseTo(0) // lat 0 → world z 0 (±0)
    const north = latLonToWorld(1, 0)
    expect(north.x).toBeCloseTo(0)
    expect(north.z).toBe(-UNITS_PER_DEGREE) // north is -Z
  })
})

describe('regionAt banding (design.md §3)', () => {
  it('classifies each of the five regions', () => {
    expect(regionAt(20, 10)).toBe('north') // Sahara belt
    expect(regionAt(-20, 25)).toBe('south') // southern plateau
    expect(regionAt(0, 40)).toBe('east') // east of lon 31.5
    expect(regionAt(0, 20)).toBe('central') // Congo basin
    expect(regionAt(10, -10)).toBe('west') // West Africa
  })

  it('is boundary-exact at every threshold (point 173 hardening)', () => {
    // lat 17 alone crosses into north, west of lon 25.
    expect(regionAt(17, 0)).toBe('north')
    expect(regionAt(16.999, 0)).not.toBe('north') // just south: not yet north
    // East of lon 25 the north band starts lower, at lat 14.5.
    expect(regionAt(14.5, 25)).toBe('north')
    expect(regionAt(14.499, 25)).not.toBe('north')
    expect(regionAt(14.5, 24.999)).not.toBe('north') // lon just short of 25
    // South plateau at exactly lat -12.
    expect(regionAt(-12, 0)).toBe('south')
    expect(regionAt(-11.999, 0)).not.toBe('south')
    // East region at exactly lon 31.5 (lat kept > 7.5 so the fallback below
    // 31.5 lands unambiguously in west, not central's lon>=12/lat<=7.5 rule).
    expect(regionAt(10, 31.5)).toBe('east')
    expect(regionAt(10, 31.499)).toBe('west')
    // Central requires BOTH lon >= 12 and lat <= 7.5.
    expect(regionAt(7.5, 12)).toBe('central')
    expect(regionAt(7.5001, 12)).not.toBe('central') // just south of the lat cap
    expect(regionAt(7.5, 11.999)).not.toBe('central') // just west of the lon cap
  })
})

describe('culture/value matrix (design.md §8)', () => {
  it('gives every region non-overlapping revered and rejected materials', () => {
    for (const r of REGIONS) {
      const v = REGION_VALUES[r]
      expect(v.revered.length).toBeGreaterThan(0)
      expect(v.rejected.length).toBeGreaterThan(0)
      for (const m of v.revered) expect(v.rejected).not.toContain(m)
    }
  })
})

describe('place lookup', () => {
  it('resolves a known place and throws on an unknown id', () => {
    expect(placeById('cairo').kind).toBe('port')
    expect(placeById('nubian-village').kind).toBe('village')
    expect(() => placeById('atlantis')).toThrow()
  })
})

describe('region border label anchors (design.md §3)', () => {
  it('emits anchors that name the region on their own side of the line', () => {
    const anchors = regionBorderLabelAnchors(5, 1)
    expect(anchors.length).toBeGreaterThan(0)
    // Each anchor's stored region equals a fresh classification of its point,
    // and the borders separate at least two different regions.
    for (const a of anchors) expect(a.region).toBe(regionAt(a.lat, a.lon))
    expect(new Set(anchors.map((a) => a.region)).size).toBeGreaterThanOrEqual(2)
  })
})
