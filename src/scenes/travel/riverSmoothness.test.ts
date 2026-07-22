// River-course smoothness (point 136, design.md §11.3): the source polylines
// average ~1.1° between control points (max 3.48° on the White Nile), so a
// LINEAR densification turned every control point into a hard corner. The
// centripetal Catmull-Rom in hydro.ts rounds them; these tests pin the result
// so a regression back to corners cannot slip through unnoticed.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  densifyRiver,
  extendSourceIntoLake,
  lakeSurfaceY,
  MOUTH_FADE_ROWS,
  mouthSeaness,
  planRibbonStrips,
  ribbonRowSurfaceAt,
  riverAxisRows,
  riverIsSeaBound,
  SEA_MERGE_Y,
  smoothRowsDownstream,
  springForRiver,
  SURFACE_LIFT,
} from './waterSurface'
import { RIVERS_DATA } from '../../world/data/rivers'
import { LAKES } from '../../world/data/lakes'
import { RIVER_WIDTH_DEG, sampleTerrain } from '../../world/terrain'
import { bedProfiles, rawSampleTerrain } from '../../world/riverProfile'
import { lakeContains, lakeIndexAt, lakeShoreDistanceExact } from '../../world/hydro'
import { setupGeodata } from '../../test/geodata'

/** Worst direction change between consecutive densified segments, degrees. */
function maxTurnDeg(pts: Array<{ lat: number; lon: number }>): number {
  let worst = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i].lon - pts[i - 1].lon
    const ay = pts[i].lat - pts[i - 1].lat
    const bx = pts[i + 1].lon - pts[i].lon
    const by = pts[i + 1].lat - pts[i].lat
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    if (la < 1e-9 || lb < 1e-9) continue
    const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)))
    worst = Math.max(worst, (Math.acos(cos) * 180) / Math.PI)
  }
  return worst
}

describe('densified river courses (point 136)', () => {
  it('no kink above the bound survives densification, on any river', () => {
    // Measured after the centripetal switch: worst is the White Nile's 41°
    // (the real ~107° Sudd east turn, rounded over several steps — the raw
    // corner sat in ONE step before). Everything else is below 20°.
    for (const r of RIVERS_DATA) {
      expect(maxTurnDeg(densifyRiver(r.points)), r.id).toBeLessThanOrEqual(45)
    }
  })

  it('every control point stays on the curve — the researched course is anchored', () => {
    for (const r of RIVERS_DATA) {
      const pts = densifyRiver(r.points)
      for (const [lon, lat] of r.points) {
        const hit = pts.some((p) => Math.hypot(p.lon - lon, p.lat - lat) < 1e-6)
        expect(hit, `${r.id} control point ${lon},${lat}`).toBe(true)
      }
    }
  })

  it('sampling stays fine-grained: no densified segment longer than 2× the step', () => {
    for (const r of RIVERS_DATA) {
      const pts = densifyRiver(r.points)
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].lon - pts[i - 1].lon, pts[i].lat - pts[i - 1].lat)
        expect(d, r.id).toBeLessThanOrEqual(0.16)
      }
    }
  })
})

// Point 211 — mouth junction and interior notches, on the REAL terrain data
// (the same DEM the game samples), so the ribbon-build invariants are pinned
// without a browser.
describe('ribbon continuity at mouths and across the band (point 211)', () => {
  const SEED = 42

  beforeAll(async () => {
    await setupGeodata()
  })

  /** Densified axis + per-point ocean classification for a river. */
  function classify(riverId: string) {
    const river = RIVERS_DATA.find((r) => r.id === riverId) ?? RIVERS_DATA[0]
    const pts = densifyRiver(river.points)
    const isOcean = pts.map((p) => sampleTerrain(p.lat, p.lon, SEED).type === 'ocean')
    return { river, pts, isOcean }
  }

  it('every river renders as ONE strip, with every land point drawn (no interior hole)', () => {
    for (const r of RIVERS_DATA) {
      const { pts, isOcean } = classify(r.id)
      const plan = planRibbonStrips(isOcean)
      expect(plan.strips, r.id).toBe(1)
      for (let i = 0; i < pts.length; i++) {
        if (!isOcean[i]) expect(plan.drawn[i], `${r.id} land point ${i} undrawn`).toBe(true)
      }
    }
  })

  it('a sea-mouth ribbon bridges past its last land point into the sea (211a)', () => {
    const seaMouths: string[] = []
    for (const r of RIVERS_DATA) {
      const { isOcean } = classify(r.id)
      if (!isOcean[isOcean.length - 1]) continue // ends inland (confluence/lake): no bridge due
      seaMouths.push(r.id)
      const plan = planRibbonStrips(isOcean)
      const lastLand = isOcean.lastIndexOf(false)
      const lastDrawn = plan.drawn.lastIndexOf(true)
      // The ribbon carries beyond the coast contour into the receiving sea, so
      // the water reads continuous — no beach strip between ribbon end and sea.
      expect(lastDrawn, `${r.id} mouth not bridged`).toBeGreaterThan(lastLand)
      expect(isOcean[lastDrawn], `${r.id} bridge end must lie in the sea`).toBe(true)
    }
    // The Nile's Rosetta mouth (the reported beach strip) is among them.
    expect(seaMouths).toContain('nile')
  })

  it('the pure plan bridges only the mouth: open sea ends the strip, a stray mid-river sea point is bridged', () => {
    // land land sea land: the misclassified point is bridged, one strip.
    expect(planRibbonStrips([false, false, true, false]).strips).toBe(1)
    // A long ocean tail: drawn MOUTH_BRIDGE points into the sea, then stop.
    const tail = planRibbonStrips([false, false, true, true, true, true, true])
    expect(tail.drawn).toEqual([true, true, true, true, true, false, false])
    // Ocean with no open strip (a source in misclassified sea) stays undrawn.
    expect(planRibbonStrips([true, true, false]).drawn).toEqual([false, false, true])
  })

  it('no water-typed terrain stands above the rendered row anywhere across the band (211b)', () => {
    for (const r of RIVERS_DATA) {
      const { pts, isOcean } = classify(r.id)
      for (let i = 0; i < pts.length; i++) {
        if (isOcean[i]) continue
        const surf = ribbonRowSurfaceAt(pts, i, SEED)
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const len = Math.hypot(b.lat - a.lat, b.lon - a.lon) || 1
        const pLat = (-(b.lon - a.lon) / len) * RIVER_WIDTH_DEG
        const pLon = ((b.lat - a.lat) / len) * RIVER_WIDTH_DEG
        for (const f of [-0.9, -0.7, -0.5, -0.3, 0.3, 0.5, 0.7, 0.9]) {
          const q = sampleTerrain(pts[i].lat + pLat * f, pts[i].lon + pLon * f, SEED)
          if (q.type !== 'water') continue // band-edge land is the bank itself
          expect(
            q.height,
            `${r.id} i=${i} f=${f} carved ground pokes through the water sheet`,
          ).toBeLessThan(surf - 0.04)
        }
      }
    }
  })

  it('the flat axis-height row genuinely notched at Cairo (regression witness)', () => {
    // Reproduce the pre-211b construction on the Nile at Cairo — on the RAW
    // pre-profile bed (rawSampleTerrain), since the point-232 longitudinal
    // smoothing removed the cross-band wedge at its root — and confirm it
    // violates: the sweep above would have caught the user's notch.
    const { pts } = classify('nile')
    let worstOver = -Infinity
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].lat < 29.8 || pts[i].lat > 30.1) continue
      const s = rawSampleTerrain(pts[i].lat, pts[i].lon, SEED)
      if (s.type === 'ocean') continue
      const oldSurf = Math.max(-0.05, s.height + SURFACE_LIFT)
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const len = Math.hypot(b.lat - a.lat, b.lon - a.lon) || 1
      const pLat = (-(b.lon - a.lon) / len) * RIVER_WIDTH_DEG
      const pLon = ((b.lat - a.lat) / len) * RIVER_WIDTH_DEG
      for (const f of [-0.9, -0.7, -0.5, -0.3, 0.3, 0.5, 0.7, 0.9]) {
        const q = rawSampleTerrain(pts[i].lat + pLat * f, pts[i].lon + pLon * f, SEED)
        if (q.type === 'water') worstOver = Math.max(worstOver, q.height - oldSurf)
      }
    }
    expect(worstOver).toBeGreaterThan(0.02) // the east-bank wedge stood proud of the old sheet
  })
})

// Point 232 — the longitudinal bed profile, on the REAL terrain data: the DEM
// height profile along a course is jagged (upward jags between neighbouring
// axis samples), and both the carved bed and the water sheet riding it
// stairstepped down the current in visible transverse bands. The bed now
// blends toward a smoothed, monotone profile, and the rendered rows carry a
// downstream running max — so the sheet never steps upward and the bed never
// jags up. Lake-adjacent rows are excluded here: near a lake the basin-level
// carve (point 190) owns the bed, and the lake junction rows are pinned to
// the lake sheet by the point-234 rules.
describe('longitudinal bed smoothing (point 232)', () => {
  const SEED = 42

  beforeAll(async () => {
    await setupGeodata()
  })

  const nearLake = (lat: number, lon: number) =>
    lakeContains(lat, lon) || lakeShoreDistanceExact(lat, lon, 0.5, 2) < 0.45

  /** Pairs of adjacent non-ocean, non-lake-adjacent rows of a river. */
  function landPairs(riverId: string) {
    const river = RIVERS_DATA.find((r) => r.id === riverId) ?? RIVERS_DATA[0]
    const rows = riverAxisRows(river, SEED)
    const pairs: Array<[(typeof rows)[number], (typeof rows)[number]]> = []
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]
      const b = rows[i]
      if (a.ocean || b.ocean) continue
      if (nearLake(a.lat, a.lon) || nearLake(b.lat, b.lon)) continue
      pairs.push([a, b])
    }
    return pairs
  }

  it('the carved bed descends source→mouth: no upward jag, bounded per-step drop', () => {
    for (const r of RIVERS_DATA) {
      for (const [a, b] of landPairs(r.id)) {
        const label = `${r.id} at ${b.lat.toFixed(2)},${b.lon.toFixed(2)}`
        expect(b.bed - a.bed, `${label} bed jags upward`).toBeLessThanOrEqual(0.02)
        expect(a.bed - b.bed, `${label} bed cliffs`).toBeLessThanOrEqual(0.2)
      }
    }
  })

  it('adjacent rendered rows never step upward and drop at most a bounded step', () => {
    for (const r of RIVERS_DATA) {
      for (const [a, b] of landPairs(r.id)) {
        const label = `${r.id} at ${b.lat.toFixed(2)},${b.lon.toFixed(2)}`
        expect(b.surf - a.surf, `${label} sheet steps upward`).toBeLessThanOrEqual(1e-6)
        expect(a.surf - b.surf, `${label} sheet stairsteps`).toBeLessThanOrEqual(0.2)
      }
    }
  })

  it('the downstream smoothing only ever raises a row — 211b holds by construction', () => {
    for (const r of RIVERS_DATA) {
      const rows = riverAxisRows(r, SEED)
      const pts = rows.map((row) => ({ lat: row.lat, lon: row.lon }))
      for (let i = 0; i < rows.length; i++) {
        // Sea rows dive under the sea sheet, lake rows hug their lake sheet
        // (point 234) — the terrain-clearance floor is about open-land rows.
        if (rows[i].ocean || rows[i].lake) continue
        expect(rows[i].surf, `${r.id} row ${i}`).toBeGreaterThanOrEqual(
          ribbonRowSurfaceAt(pts, i, SEED) - 1e-9,
        )
      }
    }
  })

  it('smoothRowsDownstream: pure behaviour (running max from the mouth, skip resets)', () => {
    // An upward jag downstream is filled by raising the upstream rows.
    expect(smoothRowsDownstream([5, 3, 4, 2], [false, false, false, false])).toEqual([5, 4, 4, 2])
    // A genuine drop (waterfall) survives untouched.
    expect(smoothRowsDownstream([5, 4, 1, 0.5], [false, false, false, false])).toEqual([5, 4, 1, 0.5])
    // A skipped row (sea mouth / lake) resets the chain and keeps its value:
    // without the skip the downstream 2 would back up across the whole run …
    expect(smoothRowsDownstream([3, 1, -0.1, 2], [false, false, false, false])).toEqual([3, 2, 2, 2])
    // … with it, the rows upstream of the junction stay at their own levels.
    expect(smoothRowsDownstream([3, 1, -0.1, 2], [false, false, true, false])).toEqual([3, 1, -0.1, 2])
  })

  it('raw witness: the pre-profile DEM bed genuinely stairstepped along the Nile', () => {
    // The raw carved bed the smoothing exists to fix — proving the sweeps
    // above guard against a real, formerly-present defect (the user's
    // transverse step-bands), not a hypothetical one.
    const prof = bedProfiles(SEED).find((p) => p.id === 'nile')
    expect(prof).toBeDefined()
    let upJags = 0
    let maxUp = 0
    for (let i = 1; i < (prof?.raw.length ?? 0); i++) {
      const d = (prof?.raw[i] ?? 0) - (prof?.raw[i - 1] ?? 0)
      if (d > 0.02) upJags++
      maxUp = Math.max(maxUp, d)
    }
    expect(upJags).toBeGreaterThan(30)
    expect(maxUp).toBeGreaterThan(0.1)
    // And the smoothed profile is monotone non-increasing.
    for (let i = 1; i < (prof?.profile.length ?? 0); i++) {
      expect((prof?.profile[i] ?? 0) - (prof?.profile[i - 1] ?? 0)).toBeLessThanOrEqual(1e-9)
    }
  })
})

// Point 234 — smooth river↔water-body transitions: a source at a lake is an
// OUTFLOW (no spring, the ribbon head overlaps under the lake sheet), a sea
// mouth merges under the sea sheet with no gap, and a course crossing a lake
// hugs that lake's sheet.
describe('river↔water-body transitions (point 234)', () => {
  const SEED = 42

  beforeAll(async () => {
    await setupGeodata()
  })

  const riverById = (id: string) => RIVERS_DATA.find((r) => r.id === id) ?? RIVERS_DATA[0]
  const lakeIdxById = (id: string) => LAKES.findIndex((l) => l.id === id)

  it('extendSourceIntoLake: the backward march enters the lake and overlaps it (pure)', () => {
    // A river flowing north whose source stands just off a lake to the south.
    const pts = [
      { lat: 0.05, lon: 10 },
      { lat: 1.0, lon: 10 },
      { lat: 2.0, lon: 10 },
    ]
    const lakeAt = (lat: number) => (lat < 0 ? 0 : -1)
    const ext = extendSourceIntoLake(pts, lakeAt, [])
    expect(ext.added).toBeGreaterThan(0)
    expect(lakeAt(ext.pts[0].lat)).toBe(0) // the head now lies inside the lake
    // The original course follows unchanged after the prepended head.
    expect(ext.pts[ext.added]).toEqual(pts[0])
    expect(ext.pts.length).toBe(pts.length + ext.added)
  })

  it('extendSourceIntoLake: a shore-parallel course falls back to aiming at the lake centre (pure)', () => {
    // Backward direction runs due south, the lake lies east — the backward
    // march never enters it, the centre-aim fallback does.
    const pts = [
      { lat: 10, lon: 10 },
      { lat: 9, lon: 10 },
      { lat: 8, lon: 10 },
    ]
    const lakeAt = (_lat: number, lon: number) => (lon > 10.5 ? 0 : -1)
    const ext = extendSourceIntoLake(pts, lakeAt, [[10.7, 10]])
    expect(ext.added).toBeGreaterThan(0)
    expect(ext.pts[0].lon).toBeGreaterThan(10.5)
  })

  it('extendSourceIntoLake: a source near no lake stays unchanged (pure)', () => {
    const pts = [
      { lat: 10, lon: 10 },
      { lat: 9, lon: 10 },
    ]
    const ext = extendSourceIntoLake(pts, () => -1, [])
    expect(ext.added).toBe(0)
    expect(ext.pts).toBe(pts)
  })

  it('the White Nile flows OUT of Lake Victoria: no spring, head under the lake sheet', () => {
    const river = riverById('white-nile')
    const rows = riverAxisRows(river, SEED)
    const victoria = lakeIdxById('lake-victoria')
    expect(victoria).toBeGreaterThanOrEqual(0)
    // The head lies inside Lake Victoria …
    expect(lakeIndexAt(rows[0].lat, rows[0].lon)).toBe(victoria)
    // … strictly below the lake sheet (the sheet draws on top, no seam) …
    const sheet = lakeSurfaceY(victoria, SEED)
    expect(rows[0].surf).toBeLessThan(sheet)
    expect(sheet - rows[0].surf).toBeLessThan(0.1) // just beneath, not sunken
    // … and a lake outflow renders NO spring marker.
    expect(springForRiver(river, rows)).toBe(false)
  })

  it('the Blue Nile flows OUT of Lake Tana the same way', () => {
    const river = riverById('blue-nile')
    const rows = riverAxisRows(river, SEED)
    const tana = lakeIdxById('lake-tana')
    expect(lakeIndexAt(rows[0].lat, rows[0].lon)).toBe(tana)
    expect(rows[0].surf).toBeLessThan(lakeSurfaceY(tana, SEED))
    expect(springForRiver(river, rows)).toBe(false)
  })

  it('open-land sources keep their springs', () => {
    for (const id of ['congo', 'niger', 'zambezi']) {
      const river = riverById(id)
      expect(springForRiver(river, riverAxisRows(river, SEED)), id).toBe(true)
    }
  })

  it('every head row inside the source lake hugs that lake sheet (one water body)', () => {
    const rows = riverAxisRows(riverById('white-nile'), SEED)
    const victoria = lakeIdxById('lake-victoria')
    const overlap = rows.filter((r) => r.lake && lakeIndexAt(r.lat, r.lon) === victoria)
    expect(overlap.length).toBeGreaterThan(0)
    const sheet = lakeSurfaceY(victoria, SEED)
    for (const r of overlap) {
      expect(r.surf).toBeLessThan(sheet)
      expect(sheet - r.surf).toBeLessThan(0.1)
    }
  })

  it('every sea mouth merges UNDER the sea sheet — bridge rows dive below the plane at y=0', () => {
    let seaMouths = 0
    for (const r of RIVERS_DATA) {
      const rows = riverAxisRows(r, SEED)
      if (!rows[rows.length - 1].ocean) continue // ends inland (confluence/lake)
      seaMouths++
      const plan = planRibbonStrips(rows.map((row) => row.ocean))
      const lastDrawn = plan.drawn.lastIndexOf(true)
      // The drawn tail row is a sea row sitting under the sea sheet …
      expect(rows[lastDrawn].ocean, r.id).toBe(true)
      expect(rows[lastDrawn].surf, r.id).toBeLessThanOrEqual(SEA_MERGE_Y)
      // … and it CONNECTS to its predecessor: one unbroken strip, no gap.
      expect(plan.connected[lastDrawn], r.id).toBe(true)
      expect(plan.strips, r.id).toBe(1)
    }
    // The Nile's Rosetta mouth (the reported gap) is among them.
    expect(seaMouths).toBeGreaterThan(0)
  })

  it('the sea-merge height stays under the sea plane even at full Nile flood', () => {
    // The flood rise never applies to sea rows (floodK and the float index
    // zero it there), and the merge height itself sits below the plane.
    expect(SEA_MERGE_Y).toBeLessThan(-0.05)
  })

  // The mouth crossfade: the height-merge alone still ended the ribbon as a
  // distinct bright strip on a visible colour boundary — the ribbon now
  // dissolves into the sea (opacity to zero, colour to the sea tone) over its
  // final approach, so nothing marks where river ends and sea begins.
  describe('mouthSeaness (the ribbon dissolves into the sea)', () => {
    it('pure: rises over the last land rows, 1 in the sea, none for inland enders or stray points', () => {
      // A mouth with a 3-row fade: 0 far upstream, rising, 1 from the coast on.
      const fade = mouthSeaness([false, false, false, false, true, true], true, 3)
      expect(fade[0]).toBe(0)
      expect(fade[1]).toBeGreaterThan(0)
      expect(fade[1]).toBeLessThan(fade[2])
      expect(fade[2]).toBeLessThan(fade[3])
      expect(fade[3]).toBe(1) // the coast-crossing row is fully the sea
      expect(fade[4]).toBe(1)
      expect(fade[5]).toBe(1)
      // A mouth whose final texels are land-typed shore fades toward the
      // course END instead of an ocean run (most mouths on the DEM).
      const shore = mouthSeaness([false, false, false, false, false], true, 3)
      expect(shore[4]).toBe(1)
      expect(shore[3]).toBeGreaterThan(0)
      expect(shore[3]).toBeLessThan(1)
      expect(shore[0]).toBe(0)
      // A river ending inland (confluence/lake) never fades.
      expect(mouthSeaness([false, true, false, false], false, 3)).toEqual([0, 0, 0, 0])
      // An interior misclassified sea point does not start a fade mid-river —
      // only the TRAILING ocean run is the mouth (upstream of it, the fade is
      // exactly the distance-to-mouth curve, unmoved by the stray point).
      const stray = mouthSeaness([false, true, false, false, false, false, false, false, true], true, 3)
      expect(stray[1]).toBe(0)
      expect(stray[2]).toBe(0)
      expect(stray[8]).toBe(1)
    })

    it('the Rosetta mouth dissolves: ~0 well upstream, near-1 at the sea-most drawn row', () => {
      // The Nile (a real trailing-ocean mouth) and the Congo (a shore-typed
      // mouth at Banana): both sea-bound, both dissolving at the sea.
      for (const id of ['nile', 'congo']) {
        const rows = riverAxisRows(riverById(id), SEED)
        expect(riverIsSeaBound(rows), id).toBe(true)
        const ocean = rows.map((r) => r.ocean)
        const fade = mouthSeaness(ocean, true)
        const plan = planRibbonStrips(ocean)
        const lastDrawn = plan.drawn.lastIndexOf(true)
        const mouth = ocean[ocean.length - 1] ? ocean.lastIndexOf(false) : ocean.length - 1
        // Fully the sea at the tail — the ribbon is effectively invisible
        // where it meets the sea sheet.
        expect(fade[lastDrawn], id).toBeGreaterThan(0.99)
        // Fully the ribbon well upstream of the fade window.
        for (let i = 0; i < mouth - MOUTH_FADE_ROWS; i++) {
          expect(fade[i], `${id} row ${i}`).toBe(0)
        }
        // And monotone non-decreasing down the final approach: a smooth
        // dissolve, never a re-brightening band.
        for (let i = Math.max(1, mouth - MOUTH_FADE_ROWS); i <= lastDrawn; i++) {
          expect(fade[i] - fade[i - 1], `${id} row ${i}`).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('rivers ending inland are not sea-bound and carry no sea fade anywhere', () => {
      for (const id of ['white-nile', 'blue-nile', 'vaal', 'benue']) {
        const rows = riverAxisRows(riverById(id), SEED)
        expect(riverIsSeaBound(rows), id).toBe(false)
        const fade = mouthSeaness(
          rows.map((r) => r.ocean),
          riverIsSeaBound(rows),
        )
        expect(Math.max(...fade), id).toBe(0)
      }
    })
  })
})
