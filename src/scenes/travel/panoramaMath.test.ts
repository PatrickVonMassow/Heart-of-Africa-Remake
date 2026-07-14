// Panorama band geometry (point 81): sector sweep, direction-true texture
// mapping (incl. the per-sector tan correction of the perspective shots) and
// the cylinder band height.
import { describe, it, expect } from 'vitest'
import {
  CAPTURE_SECTORS,
  SECTOR_H_FOV_DEG,
  BAND_V_FOV_DEG,
  sectorYaw,
  directionToU,
  bandHeightAt,
} from './panoramaMath'

describe('sector sweep (N → E → S → W)', () => {
  it('four 90° sectors close the circle', () => {
    expect(CAPTURE_SECTORS).toBe(4)
    expect(SECTOR_H_FOV_DEG).toBe(90)
  })

  it('camera yaws sweep clockwise from north', () => {
    // three: looking direction d = (-sin yaw, -cos yaw).
    const dir = (yaw: number) => [-Math.sin(yaw), -Math.cos(yaw)]
    expect(dir(sectorYaw(0))[1]).toBeCloseTo(-1) // north (-z)
    expect(dir(sectorYaw(1))[0]).toBeCloseTo(1) // east (+x)
    expect(dir(sectorYaw(2))[1]).toBeCloseTo(1) // south (+z)
    expect(dir(sectorYaw(3))[0]).toBeCloseTo(-1) // west (-x)
  })
})

describe('directionToU (direction-true, tan-corrected)', () => {
  it('the cardinal directions hit their sector centres', () => {
    expect(directionToU(0, -1)).toBeCloseTo(0.125) // north = centre of sector 0
    expect(directionToU(1, 0)).toBeCloseTo(0.375) // east = centre of sector 1
    expect(directionToU(0, 1)).toBeCloseTo(0.625) // south
    expect(directionToU(-1, 0)).toBeCloseTo(0.875) // west
  })

  it('sector edges land exactly on the seams', () => {
    // North-east (45°) is the seam between sectors 0 and 1.
    expect(directionToU(1, -1)).toBeCloseTo(0.25)
    // South-west seam.
    expect(directionToU(-1, 1)).toBeCloseTo(0.75)
  })

  it('within a sector the mapping is linear in tan (perspective image)', () => {
    // 22.5° east of north: tan(22.5°)/2 + centre — NOT the linear 1/16 step.
    const a = (22.5 * Math.PI) / 180
    const u = directionToU(Math.sin(a), -Math.cos(a))
    expect(u).toBeCloseTo(0.125 + Math.tan(a) / 8)
    expect(u).not.toBeCloseTo(0.125 + 0.0625, 3)
  })
})

describe('bandHeightAt', () => {
  it('spans the vertical FOV seen from the cylinder axis', () => {
    const r = 200
    expect(bandHeightAt(r)).toBeCloseTo(2 * r * Math.tan(((BAND_V_FOV_DEG / 2) * Math.PI) / 180))
  })
})
