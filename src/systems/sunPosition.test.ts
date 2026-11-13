import { describe, expect, it } from 'vitest'
import { solarDeclination, sunAngles, sunWorldDirection } from './sunPosition'

const JUNE_21 = 171
const DEC_21 = 354
const MARCH_EQUINOX = 79
const CAIRO = 30.04
const CAPE_TOWN = -33.92

describe('solar geometry (design.md §2.7)', () => {
  it('declination peaks at the solstices and crosses zero at the equinox', () => {
    expect(solarDeclination(JUNE_21)).toBeCloseTo(23.44, 0)
    expect(solarDeclination(DEC_21)).toBeCloseTo(-23.44, 0)
    expect(Math.abs(solarDeclination(MARCH_EQUINOX))).toBeLessThan(1.2)
  })

  it('produces the known 16:00 elevations', () => {
    expect(sunAngles(CAIRO, JUNE_21, 16).elevation).toBeCloseTo(37, -0.5)
    expect(sunAngles(CAIRO, DEC_21, 16).elevation).toBeCloseTo(11, -0.5)
    expect(sunAngles(CAPE_TOWN, JUNE_21, 16).elevation).toBeCloseTo(9, -0.5)
  })

  it('stands overhead at the equator at equinox noon', () => {
    expect(sunAngles(0, MARCH_EQUINOX, 12).elevation).toBeGreaterThan(88.5)
  })

  it('inverts the hemispheres across the year', () => {
    const north = (d: number) => sunAngles(25, d, 16).elevation
    const south = (d: number) => sunAngles(-25, d, 16).elevation
    expect(north(JUNE_21)).toBeGreaterThan(north(DEC_21))
    expect(south(DEC_21)).toBeGreaterThan(south(JUNE_21))
    expect(north(JUNE_21)).toBeCloseTo(south(DEC_21), 0)
  })

  it('never sets anywhere in the world window at 16:00; 17:00 does (witness)', () => {
    let min = 90
    for (let lat = -37; lat <= 38; lat += 0.5) {
      for (let d = 0; d < 365; d++) min = Math.min(min, sunAngles(lat, d, 16).elevation)
    }
    expect(min).toBeGreaterThan(5)
    expect(sunAngles(-37, JUNE_21, 17).elevation).toBeLessThan(0)
  })

  it('stands in the west in the afternoon in both hemispheres', () => {
    for (const lat of [CAIRO, 0, CAPE_TOWN]) {
      for (const d of [JUNE_21, DEC_21]) {
        const { azimuth } = sunAngles(lat, d, 16)
        expect(azimuth).toBeGreaterThan(180)
        expect(sunWorldDirection(lat, d, 16)[0]).toBeLessThan(0)
      }
    }
  })

  it('changes monotonically along a north-south sweep at one date', () => {
    let prev = -Infinity
    for (let lat = -37; lat <= 38; lat += 1) {
      const el = sunAngles(lat, JUNE_21, 16).elevation
      expect(el).toBeGreaterThan(prev)
      prev = el
    }
  })

  it('returns a unit world vector whose height matches the elevation; floor keeps azimuth', () => {
    const v = sunWorldDirection(CAPE_TOWN, JUNE_21, 16)
    expect(Math.hypot(...v)).toBeCloseTo(1, 6)
    expect(Math.asin(v[1]) * (180 / Math.PI)).toBeCloseTo(sunAngles(CAPE_TOWN, JUNE_21, 16).elevation, 6)
    const f = sunWorldDirection(CAPE_TOWN, JUNE_21, 16, 20)
    expect(Math.asin(f[1]) * (180 / Math.PI)).toBeCloseTo(20, 6)
    expect(Math.atan2(f[0], -f[2])).toBeCloseTo(Math.atan2(v[0], -v[2]), 6)
  })
})
