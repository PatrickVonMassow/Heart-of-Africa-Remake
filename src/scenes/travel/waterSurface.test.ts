// Float height vs rendered water surface (CLAUDE.md §7.1 pt. 4, design.md
// §7/§11.3). The river ribbon is FLAT across its width at the axis-sample
// height; the canoe float height must never end up below it, or the ribbon
// covers the hull (the recurring "flooded canoe"). The ribbon construction is
// mirrored here exactly (densified axis samples + SURFACE_LIFT) and the float
// helper is asserted against it across the channel width.
import { describe, it, expect, beforeAll } from 'vitest'
import { sampleTerrain } from '../../world/terrain'
import { RIVERS } from '../../world/geo'
import { LAKES } from '../../world/data/lakes'
import { lakeIndexAt } from '../../world/hydro'
import { setupGeodata } from '../../test/geodata'
import {
  waterSurfaceY,
  lakeSurfaceY,
  SURFACE_LIFT,
  LAKE_LIFT,
  lakeBedMax,
} from './waterSurface'

const SEED = 42

beforeAll(async () => {
  await setupGeodata()
})

/** Walk a river's axis like the ribbon build (densified at stepDeg) and call
 *  `probe` with each axis sample and its cross-channel unit perpendicular. */
function walkAxis(
  points: Array<[number, number]>,
  stepDeg: number,
  probe: (lat: number, lon: number, pLat: number, pLon: number) => void,
) {
  for (let i = 0; i < points.length - 1; i++) {
    const [lon0, lat0] = points[i]
    const [lon1, lat1] = points[i + 1]
    const steps = Math.max(1, Math.round(Math.hypot(lon1 - lon0, lat1 - lat0) / stepDeg))
    const len = Math.hypot(lat1 - lat0, lon1 - lon0) || 1
    const pLat = -(lon1 - lon0) / len
    const pLon = (lat1 - lat0) / len
    for (let s = 0; s < steps; s++) {
      const f = s / steps
      probe(lat0 + (lat1 - lat0) * f, lon0 + (lon1 - lon0) * f, pLat, pLon)
    }
  }
}

const OFFSETS = [-0.14, -0.1, -0.06, 0, 0.06, 0.1, 0.14]

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
    // proving this suite would have caught the flooded canoe.
    const nile = RIVERS.find((r) => r.id === 'nile')
    let worst = 0
    walkAxis(nile?.points ?? [], 0.08, (lat, lon, pLat, pLon) => {
      const ribbonY = Math.max(-0.05, sampleTerrain(lat, lon, SEED).height + SURFACE_LIFT)
      for (const off of OFFSETS) {
        const t = sampleTerrain(lat + pLat * off, lon + pLon * off, SEED)
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
        for (const off of [-0.1, 0.1]) {
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
