// River-course smoothness (point 136, design.md §11.3): the source polylines
// average ~1.1° between control points (max 3.48° on the White Nile), so a
// LINEAR densification turned every control point into a hard corner. The
// centripetal Catmull-Rom in hydro.ts rounds them; these tests pin the result
// so a regression back to corners cannot slip through unnoticed.
import { beforeAll, describe, expect, it } from 'vitest'
import { densifyRiver, planRibbonStrips, ribbonRowSurfaceAt, SURFACE_LIFT } from './waterSurface'
import { RIVERS_DATA } from '../../world/data/rivers'
import { RIVER_WIDTH_DEG, sampleTerrain } from '../../world/terrain'
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
    // Reproduce the pre-211b construction on the Nile at Cairo and confirm it
    // violates — proving the sweep above would have caught the user's notch.
    const { pts } = classify('nile')
    let worstOver = -Infinity
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].lat < 29.8 || pts[i].lat > 30.1) continue
      const s = sampleTerrain(pts[i].lat, pts[i].lon, SEED)
      if (s.type === 'ocean') continue
      const oldSurf = Math.max(-0.05, s.height + SURFACE_LIFT)
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const len = Math.hypot(b.lat - a.lat, b.lon - a.lon) || 1
      const pLat = (-(b.lon - a.lon) / len) * RIVER_WIDTH_DEG
      const pLon = ((b.lat - a.lat) / len) * RIVER_WIDTH_DEG
      for (const f of [-0.9, -0.7, -0.5, -0.3, 0.3, 0.5, 0.7, 0.9]) {
        const q = sampleTerrain(pts[i].lat + pLat * f, pts[i].lon + pLon * f, SEED)
        if (q.type === 'water') worstOver = Math.max(worstOver, q.height - oldSurf)
      }
    }
    expect(worstOver).toBeGreaterThan(0.02) // the east-bank wedge stood proud of the old sheet
  })
})
