// Float height vs rendered water surface (CLAUDE.md §7.1 pt. 4, design.md
// §7/§11.3). The river ribbon is FLAT across its width at the axis-sample
// height; the canoe float height must never end up below it, or the ribbon
// covers the hull (the recurring "flooded canoe"). The ribbon's BASE row
// height is mirrored here (densified axis samples + SURFACE_LIFT) and the
// float helper is asserted against it across the channel width; since point
// 211(b) the rendered row may sit HIGHER (lifted clear of cross-band carved
// wedges via ribbonRowSurfaceAt), so the mirror is a floor, never an
// overstatement — float ≥ rendered row ≥ this mirror.
import { describe, it, expect, beforeAll } from 'vitest'
import { RIVER_WIDTH_DEG, sampleTerrain } from '../../world/terrain'
import { rawSampleTerrain } from '../../world/riverProfile'
import { RIVERS } from '../../world/geo'
import { LAKES } from '../../world/data/lakes'
import { lakeIndexAt } from '../../world/hydro'
import { setupGeodata } from '../../test/geodata'
import {
  waterSurfaceY,
  renderedSheetY,
  lakeSurfaceY,
  SURFACE_LIFT,
  LAKE_LIFT,
  lakeBedMax,
  densifyRiver,
  registerRiverSurfaces,
} from './waterSurface'

const SEED = 42

beforeAll(async () => {
  await setupGeodata()
})

/** Walk a river's axis EXACTLY like the ribbon build — the same densifyRiver
 *  the ribbon and the float index sample (smoothed since point 136; a raw-
 *  polyline walk would probe chord points the rendered ribbon no longer
 *  takes) — and call `probe` with each axis sample and its cross-channel
 *  unit perpendicular. strideDeg coarsens by skipping densified samples. */
function walkAxis(
  points: Array<[number, number]>,
  strideDeg: number,
  probe: (lat: number, lon: number, pLat: number, pLon: number) => void,
) {
  const pts = densifyRiver(points)
  const stride = Math.max(1, Math.round(strideDeg / 0.08))
  for (let i = 0; i + 1 < pts.length; i += stride) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = Math.hypot(b.lat - a.lat, b.lon - a.lon) || 1
    probe(a.lat, a.lon, -(b.lon - a.lon) / len, (b.lat - a.lat) / len)
  }
}

// Cross-channel probes span the widened (calibratable) half-width.
const OFFSETS = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((f) => f * RIVER_WIDTH_DEG)

describe('waterSurfaceY (the canoe float height)', () => {
  it('clears the ribbon surface across the whole Nile channel', () => {
    const nile = RIVERS.find((r) => r.id === 'nile')
    expect(nile).toBeDefined()
    let probes = 0
    let worst = Infinity // min float-minus-ribbon over all probes
    walkAxis(nile?.points ?? [], 0.08, (lat, lon, pLat, pLon) => {
      const ribbonY = Math.max(-0.05, sampleTerrain(lat, lon, SEED).height + SURFACE_LIFT)
      for (const off of OFFSETS) {
        const qLat = lat + pLat * off
        const qLon = lon + pLon * off
        const t = sampleTerrain(qLat, qLon, SEED)
        if (t.type !== 'water') continue // the canoe floats on water cells only
        const y = waterSurfaceY(qLat, qLon, SEED, t.height)
        expect(y, `float at ${qLat.toFixed(2)},${qLon.toFixed(2)}`).not.toBeNull()
        const gap = (y ?? 0) - ribbonY
        worst = Math.min(worst, gap)
        probes++
      }
    })
    expect(probes).toBeGreaterThan(500) // the scan actually covered the river
    // A small tolerance covers bend projections landing on a neighbouring
    // segment; the hull clearance (0.29) dwarfs it.
    expect(worst).toBeGreaterThanOrEqual(-0.05)
  })

  it('the old local-bed float genuinely sank below the ribbon (regression witness)', () => {
    // Reproduce the pre-fix construction on the Nile and confirm it violates —
    // proving this suite would have caught the flooded canoe. On the RAW
    // pre-profile bed (rawSampleTerrain): the point-232 longitudinal bed
    // smoothing levels the channel cross-band too, so the current in-game bed
    // no longer exhibits the divergence this witness reproduces.
    const nile = RIVERS.find((r) => r.id === 'nile')
    let worst = 0
    walkAxis(nile?.points ?? [], 0.08, (lat, lon, pLat, pLon) => {
      const ribbonY = Math.max(-0.05, rawSampleTerrain(lat, lon, SEED).height + SURFACE_LIFT)
      for (const off of OFFSETS) {
        const t = rawSampleTerrain(lat + pLat * off, lon + pLon * off, SEED)
        if (t.type !== 'water') continue
        const oldY = Math.max(-0.05, t.height + SURFACE_LIFT)
        worst = Math.max(worst, ribbonY - oldY)
      }
    })
    expect(worst).toBeGreaterThan(0.29) // deeper than the hull clearance → visibly flooded
  })

  it('clears the ribbon on every river (coarse scan)', () => {
    for (const river of RIVERS) {
      walkAxis(river.points, 0.3, (lat, lon, pLat, pLon) => {
        const ribbonY = Math.max(-0.05, sampleTerrain(lat, lon, SEED).height + SURFACE_LIFT)
        for (const off of [-0.6 * RIVER_WIDTH_DEG, 0.6 * RIVER_WIDTH_DEG]) {
          const qLat = lat + pLat * off
          const qLon = lon + pLon * off
          const t = sampleTerrain(qLat, qLon, SEED)
          if (t.type !== 'water') continue
          const y = waterSurfaceY(qLat, qLon, SEED, t.height)
          expect(y ?? -Infinity, `${river.id} at ${qLat.toFixed(2)},${qLon.toFixed(2)}`).toBeGreaterThanOrEqual(
            ribbonY - 0.05,
          )
        }
      })
    }
  })

  it('floats at (or above) the lake sheet on lake interiors', () => {
    for (let li = 0; li < LAKES.length; li++) {
      const lake = LAKES[li]
      const sheetY = lakeSurfaceY(li, SEED)
      expect(sheetY).toBeGreaterThan(lakeBedMax(li, SEED)) // the sheet itself clears its bed
      const [clon, clat] = lake.center
      for (const [dlat, dlon] of [
        [0, 0],
        [0.08, 0],
        [-0.08, 0.08],
      ]) {
        const lat = clat + dlat
        const lon = clon + dlon
        if (lakeIndexAt(lat, lon) !== li) continue
        const t = sampleTerrain(lat, lon, SEED)
        const y = waterSurfaceY(lat, lon, SEED, t.height)
        expect(y ?? -Infinity, `${lake.id} at ${lat},${lon}`).toBeGreaterThanOrEqual(sheetY - 1e-9)
      }
    }
  })

  it('returns null away from rivers and lakes (the sea plane covers the rest)', () => {
    // Mid-Sahara reference point far from any river (see hydro.test.ts).
    const t = sampleTerrain(24, 15, SEED)
    expect(waterSurfaceY(24, 15, SEED, t.height)).toBeNull()
  })

  it('keeps the lift constants in the documented relation', () => {
    expect(SURFACE_LIFT).toBeCloseTo(0.3)
    expect(LAKE_LIFT).toBeCloseTo(0.12)
  })
})

// The hidden-crocodile anchor (design.md §19.16, point 274): a lurking croc's
// waterline must land on the visibly DRAWN sheet. waterSurfaceY is the CANOE
// float height — it carries a local-bed floor (localHeight + SURFACE_LIFT) so
// the hull clears carved rises between axis samples, and on a cross-sloping
// bank that floor stands up to SURFACE_LIFT − NOTCH_CLEARANCE (~0.22) ABOVE
// the rendered ribbon row (the row only lifts until the water-typed band
// samples sit 0.08 below it). A croc anchored there rode its "submerged" back
// proud of the visible water. renderedSheetY drops that floor: the drawn
// row/lake-sheet height itself.
describe('renderedSheetY (the hidden-crocodile anchor, point 274)', () => {
  it('never stands above the canoe float height, and covers the same water (Nile scan)', () => {
    const nile = RIVERS.find((r) => r.id === 'nile')
    expect(nile).toBeDefined()
    let probes = 0
    let maxProud = 0 // max float-above-sheet — how far the OLD anchor floated the croc
    walkAxis(nile?.points ?? [], 0.08, (lat, lon, pLat, pLon) => {
      for (const off of OFFSETS) {
        const qLat = lat + pLat * off
        const qLon = lon + pLon * off
        const t = sampleTerrain(qLat, qLon, SEED)
        if (t.type !== 'water') continue
        const float = waterSurfaceY(qLat, qLon, SEED, t.height)
        const sheet = renderedSheetY(qLat, qLon, SEED)
        // Same coverage: wherever the float height exists, the drawn sheet does.
        expect(sheet, `sheet at ${qLat.toFixed(2)},${qLon.toFixed(2)}`).not.toBeNull()
        // The anchor is never PROUD of the float height (sheet ≤ float): the
        // float is the sheet plus at most the local-bed floor.
        expect(sheet ?? Infinity).toBeLessThanOrEqual((float ?? -Infinity) + 1e-9)
        maxProud = Math.max(maxProud, (float ?? 0) - (sheet ?? 0))
        probes++
      }
    })
    expect(probes).toBeGreaterThan(500)
    // The regression witness: somewhere along the Nile the old float anchor
    // genuinely stood a visible margin above the drawn sheet — the clamp is
    // load-bearing, not a no-op.
    expect(maxProud).toBeGreaterThan(0.05)
  })

  it('sits at (or above, where a ribbon overlaps) the drawn lake sheet on lake interiors', () => {
    for (let li = 0; li < LAKES.length; li++) {
      const lake = LAKES[li]
      const sheetY = lakeSurfaceY(li, SEED)
      const [clon, clat] = lake.center
      if (lakeIndexAt(clat, clon) !== li) continue
      const y = renderedSheetY(clat, clon, SEED)
      // The lake branch itself: at least the drawn lake sheet (an overlapping
      // river row — an inflow reach — may stand higher; the max is what draws).
      expect(y ?? -Infinity, lake.id).toBeGreaterThanOrEqual(sheetY - 1e-9)
      // And never the local-bed floor: bounded by the float height.
      const t = sampleTerrain(clat, clon, SEED)
      expect(y ?? Infinity).toBeLessThanOrEqual((waterSurfaceY(clat, clon, SEED, t.height) ?? -Infinity) + 1e-9)
    }
  })

  it('returns null away from rivers and lakes, like the float height', () => {
    expect(renderedSheetY(24, 15, SEED)).toBeNull()
  })
})

describe('registerRiverSurfaces (the travel scene remount, first registration wins)', () => {
  it('a re-registration for the same seed is ignored, so a remount cannot swap in different data', () => {
    const seed = 918273 // a seed no other test in this file touches
    registerRiverSurfaces(seed, [{ lat: 10, lon: 10, surf: 5, nile: false }])
    // The travel scene remounts on every settlement visit and re-registers
    // the identical build — but here with DIFFERENT data, to prove it is
    // ignored rather than overwriting the first registration.
    registerRiverSurfaces(seed, [{ lat: 10, lon: 10, surf: 99, nile: false }])
    const y = waterSurfaceY(10, 10, seed, -100) // a very low local height so it never dominates
    expect(y).toBeCloseTo(5, 6)
  })
})
