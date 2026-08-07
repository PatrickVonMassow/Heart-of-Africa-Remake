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
  sectorRect,
  bandWidth,
  directionToU,
  bandHeightAt,
  chunkIdAt,
  panoramaCaptureReady,
  panoramaCaptureFar,
  panoramaBandShown,
  PANORAMA_BAND_BY_KIND,
  PANORAMA_CHUNK_RADIUS,
} from './panoramaMath'
import { PLACE_KINDS, placeById } from '../../world/geo'

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

// Point 545: the sector shots have to LAND somewhere in the band, and where
// used to be a renderer viewport three.js ignores for a render-target draw —
// all four sectors covered the whole band and the last one won. The layout is
// a rule of its own now, so a shot can never silently miss its column again.
describe('sector rectangles tile the band (point 545)', () => {
  it('each sector owns its own square column, left to right in sweep order', () => {
    for (let k = 0; k < CAPTURE_SECTORS; k++) {
      expect(sectorRect(k, 768)).toEqual({ x: k * 768, y: 0, width: 768, height: 768 })
    }
  })

  it('the columns cover the band with no gap and no overlap', () => {
    const px = 512
    const rects = Array.from({ length: CAPTURE_SECTORS }, (_, k) => sectorRect(k, px))
    for (let k = 1; k < rects.length; k++) {
      expect(rects[k].x).toBe(rects[k - 1].x + rects[k - 1].width) // butt-jointed
    }
    const last = rects[rects.length - 1]
    expect(last.x + last.width).toBe(bandWidth(px))
    expect(rects[0].x).toBe(0)
    expect(new Set(rects.map((r) => r.x)).size).toBe(CAPTURE_SECTORS) // no two share a column
  })

  it('the band is exactly as wide as the sectors it stitches, and one sector high', () => {
    expect(bandWidth(768)).toBe(768 * CAPTURE_SECTORS)
    for (let k = 0; k < CAPTURE_SECTORS; k++) expect(sectorRect(k, 768).height).toBe(768)
  })

  it("a direction's texture column falls inside the sector that photographed it", () => {
    // The layout and the sampling must agree: sector k's camera looks at
    // sectorYaw(k), so a direction in its 90° wedge must map into its column.
    const width = bandWidth(768)
    for (let k = 0; k < CAPTURE_SECTORS; k++) {
      const yaw = sectorYaw(k)
      const dx = -Math.sin(yaw)
      const dz = -Math.cos(yaw)
      const x = directionToU(dx, dz) * width
      const rect = sectorRect(k, 768)
      expect(x).toBeGreaterThanOrEqual(rect.x)
      expect(x).toBeLessThan(rect.x + rect.width)
    }
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

// --- Point 335: the grey/silver horizon strip on the Giza monument site ------
// The band the place scene drew carried a hard, flat grey line ABOVE its own
// horizon, with the geometry backdrop's relief showing through the transparent
// gap over and under it. Cause: the capture camera's far plane (900 wu) looked
// far past the streamed terrain window (CHUNK_RADIUS chunks around the
// traveller), and the sea plane, river ribbons and lake sheets carry no such
// bound — so they baked into the band FLOATING, with no ground behind them.
// Point 227 had fixed the same class in TIME (the centre chunk must be
// committed); this is its SPATIAL half, plus the ring the centre chunk alone
// left unguarded.
describe('panorama capture reach (point 335)', () => {
  const CHUNK = 24
  /** Every chunk id within Chebyshev `r` of (cx, cz). */
  const ring = (cx: number, cz: number, r: number) => {
    const s = new Set<string>()
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) s.add(`${cx + dx},${cz + dz}`)
    return s
  }

  it('the far plane never reaches past the committed ring', () => {
    expect(panoramaCaptureFar(PANORAMA_CHUNK_RADIUS, CHUNK)).toBe(PANORAMA_CHUNK_RADIUS * CHUNK)
    // The reported failure: 900 wu of reach over a 5-chunk (120 wu) window —
    // 780 wu of it showing unbounded water sheets with no terrain behind them.
    expect(panoramaCaptureFar(PANORAMA_CHUNK_RADIUS, CHUNK)).toBeLessThan(900)
    expect(panoramaCaptureFar(0, CHUNK)).toBeGreaterThan(0) // never a degenerate camera
  })

  it('stays inside the travel scene\'s own streaming window', () => {
    // CHUNK_RADIUS in TravelScene is 6 and centred on the TRAVELLER, while the
    // capture point sits up to one chunk away — so the required ring must be
    // strictly smaller, or the gate could never be satisfied.
    expect(PANORAMA_CHUNK_RADIUS).toBeLessThan(6)
  })

  it('requires the WHOLE ring, not just the centre chunk (the point-227 gap)', () => {
    const centreOnly = new Set(['12,-1'])
    // The old gate passed on this set; the far field it let through is the bug.
    expect(panoramaCaptureReady(centreOnly, 300.5, -10, CHUNK)).toBe(true)
    expect(panoramaCaptureReady(centreOnly, 300.5, -10, CHUNK, PANORAMA_CHUNK_RADIUS)).toBe(false)
    // A ring with a single hole in its outer row still refuses.
    const holed = ring(12, -1, PANORAMA_CHUNK_RADIUS)
    holed.delete(`${12 + PANORAMA_CHUNK_RADIUS},${-1 - PANORAMA_CHUNK_RADIUS}`)
    expect(panoramaCaptureReady(holed, 300.5, -10, CHUNK, PANORAMA_CHUNK_RADIUS)).toBe(false)
    // Complete ring: allowed.
    expect(panoramaCaptureReady(ring(12, -1, PANORAMA_CHUNK_RADIUS), 300.5, -10, CHUNK, PANORAMA_CHUNK_RADIUS)).toBe(true)
  })
})

describe('panorama band gate over EVERY place kind (point 335)', () => {
  it('the kind map is total over PlaceKind — a new kind must be decided about', () => {
    expect(Object.keys(PANORAMA_BAND_BY_KIND).sort()).toEqual([...PLACE_KINDS].sort())
  })

  it('no kind is exempt from the freshness and completeness gates', () => {
    // Swept over the ENUM, so a fourth place kind joins this sweep by itself.
    for (const kind of PLACE_KINDS) {
      expect(panoramaBandShown(kind, true, true)).toBe(true)
      expect(panoramaBandShown(kind, false, true)).toBe(false) // stale capture (point 99)
      expect(panoramaBandShown(kind, true, false)).toBe(false) // incomplete capture
      expect(panoramaBandShown(kind, false, false)).toBe(false)
    }
  })

  it('the MONUMENT witness: Giza entered from travel with an uncommitted chunk shows NO band', () => {
    const giza = placeById('giza')
    expect(giza.kind).toBe('monument')
    const CHUNK = 24
    // Entered out of the bird's-eye view (fresh), but the terrain around the
    // capture point is not committed — so no capture may exist, and the site
    // falls back to the geometry backdrop instead of a half-empty band.
    const captureReady = panoramaCaptureReady(new Set(), 0, 0, CHUNK, PANORAMA_CHUNK_RADIUS)
    expect(captureReady).toBe(false)
    expect(panoramaBandShown(giza.kind, true, captureReady)).toBe(false)
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
