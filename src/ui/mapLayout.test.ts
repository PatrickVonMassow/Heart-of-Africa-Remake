// Exploration-map layout (design.md §19.11): one label anchor per region,
// on that region's land, far enough apart that the spaced-capitals names
// cannot overlap (the old border-anchor scheme repeated and collided).
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { setupGeodata } from '../test/geodata'
import { regionStats, REGION_IDS, LON_MIN, LON_MAX, LAT_MIN, LAT_MAX } from './mapLayout'
import { regionAt } from '../world/geo'
import { CELL_OCEAN, cellAt } from '../world/geoIndex'

beforeAll(async () => {
  await setupGeodata()
})

describe('regionStats', () => {
  it('anchors every region name once, on that region own land', () => {
    const { anchors } = regionStats()
    for (const r of REGION_IDS) {
      const a = anchors[r]
      expect(a.lat, r).toBeGreaterThanOrEqual(LAT_MIN)
      expect(a.lat, r).toBeLessThanOrEqual(LAT_MAX)
      expect(a.lon, r).toBeGreaterThanOrEqual(LON_MIN)
      expect(a.lon, r).toBeLessThanOrEqual(LON_MAX)
      expect(cellAt(a.lat, a.lon), r).not.toBe(CELL_OCEAN)
      expect(regionAt(a.lat, a.lon), r).toBe(r)
    }
  })

  it('keeps the five anchors far enough apart for non-overlapping names', () => {
    const { anchors } = regionStats()
    const list = REGION_IDS.map((r) => anchors[r])
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.hypot(list[i].lat - list[j].lat, list[i].lon - list[j].lon)
        expect(d, `${REGION_IDS[i]} vs ${REGION_IDS[j]}: ${JSON.stringify(list)}`).toBeGreaterThan(10)
      }
    }
  })

  it('counts land cells for every region (exploration percentage base)', () => {
    const { totals } = regionStats()
    for (const r of REGION_IDS) expect(totals[r], r).toBeGreaterThan(50)
  })
})

describe('regionStats: the "no candidate found" fallback (point 173)', () => {
  // regionStats() caches its result in a module-private `statsCache`
  // (computed once per module instance), which the tests above already
  // populated from the real geodata. To exercise the branch where the
  // outward spiral search finds NOTHING nearby (best stays null, so the
  // anchor is left at the raw, still off-land centroid), this stubs the
  // world lookups and loads mapLayout.ts as a FRESH module instance via
  // vi.resetModules() + a dynamic import — leaving the statically-imported
  // `regionStats` above (and its already-cached real-geodata result)
  // completely untouched.
  it('leaves the raw off-land centroid when no nearby cell of that region exists', async () => {
    vi.resetModules()
    vi.doMock('../state/store', () => ({ EXPLORE_CELL_DEG: 0.5 }))
    vi.doMock('../world/geoIndex', () => ({
      CELL_OCEAN: 0,
      // Always land in this stub grid — only the region assignment matters.
      cellAt: () => 1,
    }))
    vi.doMock('../world/geo', () => ({
      // 'north' owns two tiny 1x1 degree boxes in opposite corners of
      // mapLayout's fixed [-37,38] x [-20,53] domain; every other cell is
      // 'south'. Their centroid sits mid-map, more than the ±14 degree
      // spiral search radius from EITHER box, so the fallback can never
      // find a 'north' cell near the (off-land) centroid.
      regionAt: (lat: number, lon: number) => {
        const inBoxA = lat >= -37 && lat < -36 && lon >= -20 && lon < -19
        const inBoxB = lat >= 37 && lat < 38 && lon >= 52 && lon < 53
        return inBoxA || inBoxB ? 'north' : 'south'
      },
    }))

    try {
      const stub = await import('./mapLayout')
      const { anchors } = stub.regionStats()
      // The exact centroid of the two boxes (worked out by hand from the
      // 0.5-degree grid centers) — confirms the fallback left it UNMOVED.
      expect(anchors.north.lat).toBeCloseTo(0.5, 9)
      expect(anchors.north.lon).toBeCloseTo(16.5, 9)
      // A distinct, isolated module instance — the real, statically-imported
      // regionStats (and its already-cached real-geodata result) is untouched.
      expect(stub.regionStats).not.toBe(regionStats)
    } finally {
      vi.doUnmock('../state/store')
      vi.doUnmock('../world/geoIndex')
      vi.doUnmock('../world/geo')
      vi.resetModules()
    }
  })
})
