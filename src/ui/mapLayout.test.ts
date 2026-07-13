// Exploration-map layout (design.md §19.11): one label anchor per region,
// on that region's land, far enough apart that the spaced-capitals names
// cannot overlap (the old border-anchor scheme repeated and collided).
import { describe, it, expect, beforeAll } from 'vitest'
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
