// Panorama band geometry (point 81): sector sweep, direction-true texture
// mapping (incl. the per-sector tan correction of the perspective shots) and
// the cylinder band height.
import { describe, it, expect } from 'vitest'
import {
  CAPTURE_SECTORS,
  bufferU,
  SECTOR_COMPASS,
  SECTOR_H_FOV_DEG,
  BAND_V_FOV_DEG,
  sectorYaw,
  directionToU,
  bandHeightAt,
  chunkIdAt,
  panoramaCaptureReady,
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

  it('the degenerate zero direction (0,0) resolves to a finite u in [0,1), never NaN', () => {
    const u = directionToU(0, 0)
    expect(Number.isFinite(u)).toBe(true)
    expect(u).toBeGreaterThanOrEqual(0)
    expect(u).toBeLessThan(1)
    // atan2(+0, -0) is +π (IEEE 754) — the same branch as due south — so the
    // degenerate direction lands deterministically on the south sector centre.
    expect(u).toBeCloseTo(directionToU(0, 1), 9)
  })
})

describe('bandHeightAt', () => {
  it('spans the vertical FOV seen from the cylinder axis', () => {
    const r = 200
    expect(bandHeightAt(r)).toBeCloseTo(2 * r * Math.tan(((BAND_V_FOV_DEG / 2) * Math.PI) / 180))
  })
})

describe('panorama capture gate (point 227: no capture before the terrain is committed)', () => {
  const CHUNK = 24

  it('chunkIdAt matches the travel chunk grid, including negative coordinates', () => {
    expect(chunkIdAt(0, 0, CHUNK)).toBe('0,0')
    expect(chunkIdAt(23.9, 23.9, CHUNK)).toBe('0,0')
    expect(chunkIdAt(24, 0, CHUNK)).toBe('1,0')
    expect(chunkIdAt(-0.1, -24.1, CHUNK)).toBe('-1,-2') // floor, not trunc
  })

  it('refuses the capture while the capture point chunk is uncommitted (the first-frame-after-leave band was terrainless)', () => {
    // The first travel frame after leaving a settlement: no chunk meshes yet.
    expect(panoramaCaptureReady(new Set(), 300.5, -10, CHUNK)).toBe(false)
    // A committed window that does NOT cover the point (stale set after a
    // teleport into the ring) refuses too.
    expect(panoramaCaptureReady(new Set(['0,0', '1,0']), 300.5, -10, CHUNK)).toBe(false)
  })

  it('allows the capture once the chunk under the capture point is committed', () => {
    // 300.5 → cx 12, -10 → cz -1.
    expect(panoramaCaptureReady(new Set(['12,-1']), 300.5, -10, CHUNK)).toBe(true)
  })

  it('is boundary-exact at the chunk edge', () => {
    const committed = new Set(['0,0'])
    expect(panoramaCaptureReady(committed, 23.999, 0, CHUNK)).toBe(true)
    expect(panoramaCaptureReady(committed, 24, 0, CHUNK)).toBe(false)
  })
})

describe('bufferU (the empirically pinned mirrored band, point 90)', () => {
  it('stores content at the negated bearing: E and W swap, N and S stay', () => {
    expect(bufferU(0, -1)).toBeCloseTo(0.125) // north stays in slice 0
    expect(bufferU(0, 1)).toBeCloseTo(0.625) // south stays in slice 2
    expect(bufferU(1, 0)).toBeCloseTo(0.875) // EAST content sits in slice 3
    expect(bufferU(-1, 0)).toBeCloseTo(0.375) // WEST content sits in slice 1
  })

  it('reproduces the measured Giza column', () => {
    // True bearing 259.3° (WSW of Cairo at capture time) → measured u ≈ 0.405.
    const a = (259.3 * Math.PI) / 180
    expect(bufferU(Math.sin(a), -Math.cos(a))).toBeCloseTo(0.399, 2)
  })

  it('labels the slices N, W, S, E', () => {
    expect([...SECTOR_COMPASS]).toEqual(['N', 'W', 'S', 'E'])
  })
})
