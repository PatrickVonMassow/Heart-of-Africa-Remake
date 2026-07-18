// Exact vector hydrology (design.md §3/§11): lake containment, river/lake
// distances and downstream flow from the authored ~1890 courses. Pure — the
// spline index is built at module load from data/{rivers,lakes}.ts, no DEM.
import { describe, it, expect } from 'vitest'
import {
  catmullRom,
  lakeContains,
  lakeShoreDistanceExact,
  riverDistanceExact,
  riverFlowExact,
} from './hydro'
import { LAKES } from './data/lakes'
import { RIVERS_DATA } from './data/rivers'

const nile = RIVERS_DATA.find((r) => r.id === 'nile')!
// A real polyline vertex (lon, lat) — Catmull-Rom densification passes through
// the control points, so the exact distance to it is ~0.
const [nileLon, nileLat] = nile.points[0]

describe('lakeContains (design.md §11)', () => {
  it('is true at the Lake Victoria centre', () => {
    // center is stored [lon, lat]; lakeContains takes (lat, lon).
    expect(lakeContains(-1.1, 32.9)).toBe(true)
  })

  it('is true for every lake at its own centre', () => {
    for (const l of LAKES) {
      expect(lakeContains(l.center[1], l.center[0]), l.id).toBe(true)
    }
  })

  it('is false on Saharan land far from any lake', () => {
    expect(lakeContains(24, 15)).toBe(false)
  })
})

describe('riverDistanceExact (design.md §3)', () => {
  it('is ~0 on an actual Nile polyline vertex', () => {
    expect(riverDistanceExact(nileLat, nileLon)).toBeLessThan(0.05)
  })

  it('is larger far from any river than on it', () => {
    const near = riverDistanceExact(nileLat, nileLon)
    const far = riverDistanceExact(24, 15)
    expect(far).toBeGreaterThan(near)
    expect(far).toBeGreaterThan(0.1)
  })

  it('never exceeds the maxDist cap', () => {
    // A point far from every river resolves to exactly the cap.
    expect(riverDistanceExact(24, 15, 0.1)).toBeLessThanOrEqual(0.1 + 1e-9)
  })
})

describe('riverFlowExact (design.md §11)', () => {
  it('is zero off any river', () => {
    expect(riverFlowExact(24, 15)).toEqual({ strength: 0, dirLat: 0, dirLon: 0 })
  })

  it('gives a unit direction and strength in (0,1] on a river', () => {
    const f = riverFlowExact(nileLat, nileLon)
    expect(Math.hypot(f.dirLat, f.dirLon)).toBeCloseTo(1, 6)
    expect(f.strength).toBeGreaterThan(0)
    expect(f.strength).toBeLessThanOrEqual(1)
  })

  it('fades in strength from the centerline outward', () => {
    const onLine = riverFlowExact(nileLat, nileLon).strength
    // Offset in lon — roughly perpendicular to this near-N/S Nile reach — but
    // still within the flow's maxDist band, so the point stays on the river.
    const offset = riverFlowExact(nileLat, nileLon + 0.05).strength
    expect(offset).toBeGreaterThan(0)
    expect(offset).toBeLessThan(onLine)
  })

  it('orients downstream, matching the source→mouth point order', () => {
    const f = riverFlowExact(nileLat, nileLon)
    // The Nile data runs source (Khartoum) → mouth (Mediterranean); the local
    // segment direction must share the sign of the first authored step.
    const expLat = nile.points[1][1] - nile.points[0][1]
    expect(Math.sign(f.dirLat)).toBe(Math.sign(expLat))
  })
})

describe('catmullRom (point 136 — the shared densification curve)', () => {
  it('stays finite when the two inner control points coincide (p1 === p2)', () => {
    // A degenerate knot spacing (guarded to 1e-6) must not blow up the curve
    // into NaN or Infinity, for any t across the segment.
    const p0: [number, number] = [0, 0]
    const p1: [number, number] = [5, 5]
    const p2: [number, number] = [5, 5]
    const p3: [number, number] = [10, 3]
    for (const t of [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1]) {
      const [x, y] = catmullRom(p0, p1, p2, p3, t)
      expect(Number.isFinite(x), `t=${t}`).toBe(true)
      expect(Number.isFinite(y), `t=${t}`).toBe(true)
    }
  })

  it('the degenerate segment stays anchored near the coincident point rather than flying off', () => {
    const p0: [number, number] = [0, 0]
    const p1: [number, number] = [5, 5]
    const p2: [number, number] = [5, 5]
    const p3: [number, number] = [10, 3]
    const [x, y] = catmullRom(p0, p1, p2, p3, 0.5)
    expect(Math.hypot(x - 5, y - 5)).toBeLessThan(1) // no wild overshoot
  })

  it('is doubly degenerate (p0 === p1 === p2) without producing NaN', () => {
    const p0: [number, number] = [2, 2]
    const p1: [number, number] = [2, 2]
    const p2: [number, number] = [2, 2]
    const p3: [number, number] = [8, -1]
    for (const t of [0, 0.5, 1]) {
      const [x, y] = catmullRom(p0, p1, p2, p3, t)
      expect(Number.isFinite(x), `t=${t}`).toBe(true)
      expect(Number.isFinite(y), `t=${t}`).toBe(true)
    }
  })
})

describe('lakeShoreDistanceExact', () => {
  it('is ~0 on a lake polygon vertex', () => {
    const [lon, lat] = LAKES[0].points[0]
    expect(lakeShoreDistanceExact(lat, lon)).toBeLessThan(0.05)
  })
})
