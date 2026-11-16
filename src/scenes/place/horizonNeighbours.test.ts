import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { PLACES, placeById, type PlaceKind } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { PANORAMA_RADIUS, PANORAMA_RING_CLEARANCE, panoramaStandY } from './backdrop'
import {
  bearingDirection,
  footprintSamples,
  mapBearing,
  mapDistanceDeg,
  neighbourBaseY,
  neighbourExclusionSpans,
  neighboursInSight,
  seatNeighbour,
  type SightPoint,
} from './horizonNeighbours'
import { buildSettlementSilhouette, neighbourSilhouette } from './horizonNeighbourSilhouettes'
import type { DwellingDef } from './layout'

const TWO_PI = Math.PI * 2
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const KINDS: PlaceKind[] = ['port', 'village', 'monument']

function randomPoints(n: number, seed: number): SightPoint[] {
  const r = mulberry32(seed)
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    kind: KINDS[i % 3],
    // A small patch so many pairs fall within and beyond sight.
    lat: 20 + r() * 3,
    lon: 30 + r() * 3,
  }))
}

const hn = balance.horizonNeighbours
const seatOpts = (discEdge = 62) => ({
  apparentScale: hn.apparentScale,
  maxElevationDeg: hn.maxElevationDeg,
  discEdge,
  margin: hn.seatMargin,
})

describe('horizon neighbours: presence (design.md §2.5)', () => {
  it('a point within sight is present, one beyond it absent, the place itself never', () => {
    const pts = randomPoints(40, 380)
    const sight = 1.2
    for (const a of pts) {
      const seen = new Set(neighboursInSight(a, pts, sight).map((n) => n.point.id))
      expect(seen.has(a.id)).toBe(false)
      for (const b of pts) {
        if (b.id === a.id) continue
        expect(seen.has(b.id)).toBe(mapDistanceDeg(a, b) <= sight)
      }
    }
  })

  it('presence is symmetric: A sees B exactly when B sees A', () => {
    const pts = randomPoints(40, 7)
    for (const sight of [0.4, 1.2, 2.5]) {
      for (const a of pts) {
        for (const n of neighboursInSight(a, pts, sight)) {
          expect(neighboursInSight(n.point, pts, sight).some((m) => m.point.id === a.id)).toBe(true)
        }
      }
    }
  })

  it('a site sharing its own coordinate (monument map point and landmark) is no neighbour', () => {
    const a: SightPoint = { id: 'giza', kind: 'monument', lat: 30, lon: 30 }
    const twin: SightPoint = { id: 'giza-landmark', kind: 'monument', lat: 30, lon: 30 }
    expect(neighboursInSight(a, [twin], 1)).toEqual([])
  })

  it('the real map: Cairo and Giza see each other at the balance sight distance', () => {
    const cairo = placeById('cairo')
    const giza = placeById('giza')
    expect(neighboursInSight(cairo, PLACES, hn.sightDistanceDeg).map((n) => n.point.id)).toContain('giza')
    expect(neighboursInSight(giza, PLACES, hn.sightDistanceDeg).map((n) => n.point.id)).toContain('cairo')
    // Every in-sight relation over the whole map is mutual.
    for (const a of PLACES) {
      for (const n of neighboursInSight(a, PLACES, hn.sightDistanceDeg)) {
        expect(neighboursInSight(n.point, PLACES, hn.sightDistanceDeg).some((m) => m.point.id === a.id)).toBe(true)
      }
    }
  })
})

describe('horizon neighbours: bearing', () => {
  it('the bearing from B to A is the bearing from A to B turned by 180°', () => {
    const pts = randomPoints(30, 11)
    for (const a of pts) {
      for (const b of pts) {
        if (a === b) continue
        const ab = mapBearing(a, b)
        const ba = mapBearing(b, a)
        expect(ab).toBeGreaterThanOrEqual(0)
        expect(ab).toBeLessThan(TWO_PI)
        expect(Math.abs(wrap(ab - (ba + Math.PI)))).toBeLessThan(1e-9)
      }
    }
  })

  it('the place frame points north to −z and east to +x (the backdrop sampling frame)', () => {
    const o: SightPoint = { id: 'o', kind: 'port', lat: 0, lon: 0 }
    const north = bearingDirection(mapBearing(o, { ...o, id: 'n', lat: 1 }))
    const east = bearingDirection(mapBearing(o, { ...o, id: 'e', lon: 1 }))
    expect(north.x).toBeCloseTo(0, 9)
    expect(north.z).toBeCloseTo(-1, 9)
    expect(east.x).toBeCloseTo(1, 9)
    expect(east.z).toBeCloseTo(0, 9)
  })

  it('Giza lies west of Cairo and Cairo east of Giza, opposite seats', () => {
    const cairo = placeById('cairo')
    const giza = placeById('giza')
    const fromCairo = bearingDirection(mapBearing(cairo, giza))
    const fromGiza = bearingDirection(mapBearing(giza, cairo))
    expect(fromCairo.x).toBeLessThan(-0.9)
    expect(fromGiza.x).toBeGreaterThan(0.9)
    expect(fromCairo.x + fromGiza.x).toBeCloseTo(0, 9)
    expect(fromCairo.z + fromGiza.z).toBeCloseTo(0, 9)
  })
})

describe('horizon neighbours: apparent size and seat', () => {
  const measure = { heightM: 30, footprintM: 60 }

  it('apparent size falls with distance (below the looming bound)', () => {
    let prevElev = Infinity
    let prevWidth = Infinity
    for (let d = 0.6; d <= 3; d += 0.1) {
      const seat = seatNeighbour(1, d, measure, seatOpts())
      expect(seat).not.toBeNull()
      expect(seat!.elevationDeg).toBeLessThanOrEqual(hn.maxElevationDeg + 1e-9)
      if (seat!.elevationDeg < hn.maxElevationDeg - 1e-6) {
        expect(seat!.elevationDeg).toBeLessThan(prevElev)
        expect(seat!.widthDeg).toBeLessThan(prevWidth)
      }
      prevElev = seat!.elevationDeg
      prevWidth = seat!.widthDeg
    }
  })

  it('the drawn size subtends the angle the seat reports, wherever it is seated', () => {
    for (const disc of [40, 62, 112]) {
      const seat = seatNeighbour(2, 1.1, measure, seatOpts(disc))!
      const drawnTop = measure.heightM * seat.scale
      expect((Math.atan2(drawnTop, seat.radius) * 180) / Math.PI).toBeCloseTo(seat.elevationDeg, 9)
    }
  })

  it('the whole footprint stands between the disc edge and the panorama band', () => {
    const r = mulberry32(5)
    for (let i = 0; i < 200; i++) {
      const disc = 40 + r() * 80
      const m = { heightM: 2 + r() * 40, footprintM: 5 + r() * 90 }
      const seat = seatNeighbour(r() * TWO_PI, 0.5 + r() * 1.5, m, seatOpts(disc))
      // A seat always exists while the disc leaves room before the band.
      expect(seat).not.toBeNull()
      if (!seat) continue
      expect(seat.depth).toBeGreaterThan(0)
      expect(seat.depth).toBeLessThanOrEqual(1)
      const half = seat.footprint * seat.depth
      expect(seat.radius + half).toBeLessThanOrEqual(PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE + 1e-9)
      expect(seat.radius - half).toBeGreaterThanOrEqual(disc + hn.seatMargin - 1e-9)
      // Every footprint sample lies inside the room too.
      for (const [x, z] of footprintSamples(seat)) {
        const rr = Math.hypot(x, z)
        expect(rr).toBeLessThanOrEqual(PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE + 1e-6)
        expect(rr).toBeGreaterThanOrEqual(disc + hn.seatMargin - 1e-6)
      }
      expect(Math.hypot(seat.x, seat.z)).toBeCloseTo(seat.radius, 9)
    }
  })

  it('the Giza field over Cairo keeps its accepted skyline elevation (point 82, ~11°)', () => {
    const giza = neighbourSilhouette('giza', () => [])!
    const cairo = placeById('cairo')
    const g = placeById('giza')
    const seat = seatNeighbour(mapBearing(cairo, g), mapDistanceDeg(cairo, g), giza.measure, seatOpts())!
    giza.geometry.dispose()
    expect(seat.elevationDeg).toBeGreaterThan(9)
    expect(seat.elevationDeg).toBeLessThanOrEqual(hn.maxElevationDeg)
  })
})

describe('horizon neighbours: footing on the drawn ground (point 181)', () => {
  it('the base never stands above panoramaStandY anywhere under its footprint', () => {
    const giza = placeById('giza')
    const cairo = placeById('cairo')
    const seed = 1234
    const centerH = sampleTerrain(giza.lat, giza.lon, seed).height
    const r0 = 98 + 12
    const sil = neighbourSilhouette('cairo', () => [
      { x: 0, z: 0, rot: 0, kind: 'box', r: 4, h: 7, floors: 2, door: [0, 4] },
      { x: 30, z: -20, rot: 0.4, kind: 'tower', r: 2, h: 7, floors: 1, door: [30, -18] },
    ])!
    const seat = seatNeighbour(mapBearing(giza, cairo), mapDistanceDeg(giza, cairo), sil.measure, seatOpts(r0 + 2))!
    sil.geometry.dispose()
    for (const [camX, camZ] of [[0, 0], [60, 0], [-80, 30], [20, -90]]) {
      const stand = (x: number, z: number) => panoramaStandY(x, z, giza.lat, giza.lon, seed, centerH, r0, camX, camZ, 1.5)
      const sink = 0.3
      const y = neighbourBaseY(seat, stand, sink)
      const samples = footprintSamples(seat).map(([x, z]) => stand(x, z))
      for (const s of samples) expect(y).toBeLessThanOrEqual(s - sink + 1e-9)
      expect(y).toBeCloseTo(Math.min(...samples) - sink, 9)
    }
  })
})

describe('horizon neighbour silhouettes', () => {
  it('a monument site shows its bird\'s-eye landmark, sized by its walkable site', () => {
    const giza = neighbourSilhouette('giza', () => [])!
    expect(giza.landmarkKind).toBe('giza-pyramids')
    expect(giza.metresPerUnit).toBeGreaterThan(1)
    expect(giza.measure.heightM).toBeGreaterThan(10)
    giza.geometry.dispose()
    const abu = neighbourSilhouette('abu-simbel', () => [])!
    expect(abu.landmarkKind).toBe('rock-temples')
    expect(abu.measure.heightM).toBeGreaterThan(0)
    abu.geometry.dispose()
  })

  it('a settlement shows one solid per dwelling at its wall height', () => {
    const dwellings: DwellingDef[] = [
      { x: 0, z: 0, rot: 0, kind: 'box', r: 3, h: 4, floors: 1, door: [0, 3] },
      { x: 10, z: 5, rot: 1, kind: 'hut', r: 2, h: 3, floors: 1, door: [10, 7] },
      { x: -8, z: -6, rot: 0, kind: 'tower', r: 1.5, h: 9, floors: 1, door: [-8, -4] },
    ]
    const g = buildSettlementSilhouette(dwellings)!
    g.computeBoundingBox()
    expect(g.boundingBox!.max.y).toBeCloseTo(9, 6)
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6)
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
    g.dispose()
    expect(buildSettlementSilhouette([])).toBeNull()
  })

  it('a settlement neighbour reads its dwellings from the injected source', () => {
    const asked: string[] = []
    const sil = neighbourSilhouette('nubian-village', (id) => {
      asked.push(id)
      return [{ x: 0, z: 0, rot: 0, kind: 'box', r: 3, h: 3.8, floors: 1, door: [0, 3] }]
    })!
    expect(asked).toEqual(['nubian-village'])
    expect(sil.landmarkKind).toBeNull()
    expect(sil.measure.heightM).toBeCloseTo(3.8, 6)
    sil.geometry.dispose()
  })
})

describe('horizon neighbours: wildlife exclusion', () => {
  it('the excluded arc is centred on the seat and covers its whole width', () => {
    const seat = seatNeighbour(Math.PI * 1.5, 1.08, { heightM: 30, footprintM: 60 }, seatOpts())!
    const [span] = neighbourExclusionSpans([seat], 8)
    expect(Math.abs(wrap(span.center - Math.atan2(seat.z, seat.x)))).toBeLessThan(1e-9)
    expect(span.half).toBeGreaterThan(Math.atan2(seat.footprint, seat.radius))
  })
})
