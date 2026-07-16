// River-course smoothness (point 136, design.md §11.3): the source polylines
// average ~1.1° between control points (max 3.48° on the White Nile), so a
// LINEAR densification turned every control point into a hard corner. The
// centripetal Catmull-Rom in hydro.ts rounds them; these tests pin the result
// so a regression back to corners cannot slip through unnoticed.
import { describe, expect, it } from 'vitest'
import { densifyRiver } from './waterSurface'
import { RIVERS_DATA } from '../../world/data/rivers'

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
