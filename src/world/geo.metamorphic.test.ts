// Metamorphic relations for the coordinate mapping (TASKS point 207 (v)) —
// checks that need NO golden reference, only an internal invariant. The
// equirectangular projection latLonToWorld / worldToLatLon must stay exact
// inverses that share ONE scale: a future edit that flips a sign convention or
// changes UNITS_PER_DEGREE in only one direction breaks a relation here rather
// than silently corrupting every position in the game.
import { describe, it, expect } from 'vitest'
import { latLonToWorld, worldToLatLon, UNITS_PER_DEGREE } from './geo'

// A deterministic grid spanning the game's real coordinate window (design.md
// §3.1: roughly lat −36..38, lon −20..55) plus the exact bounds and zero.
const LATS = [-36, -20.5, -1, 0, 12.25, 30, 38]
const LONS = [-20, -3.5, 0, 17, 31.75, 44, 55]

describe('coordinate mapping — metamorphic relations (207 v)', () => {
  it('latLon -> world -> latLon is the identity', () => {
    for (const lat of LATS)
      for (const lon of LONS) {
        const w = latLonToWorld(lat, lon)
        const back = worldToLatLon(w.x, w.z)
        expect(back.lat).toBeCloseTo(lat, 10)
        expect(back.lon).toBeCloseTo(lon, 10)
      }
  })

  it('world -> latLon -> world is the identity', () => {
    for (let x = -200; x <= 550; x += 55)
      for (let z = -380; z <= 360; z += 40) {
        const ll = worldToLatLon(x, z)
        const w = latLonToWorld(ll.lat, ll.lon)
        expect(w.x).toBeCloseTo(x, 10)
        expect(w.z).toBeCloseTo(z, 10)
      }
  })

  it('both directions share ONE scale — a 1° step is exactly UNITS_PER_DEGREE', () => {
    // Longitude maps to +x, latitude to -z, both at UNITS_PER_DEGREE. If one
    // function drifted from the shared constant, these deltas would disagree.
    const base = latLonToWorld(10, 20)
    expect(latLonToWorld(10, 21).x - base.x).toBeCloseTo(UNITS_PER_DEGREE, 10)
    expect(latLonToWorld(11, 20).z - base.z).toBeCloseTo(-UNITS_PER_DEGREE, 10)
  })

  it('the mapping is linear — a scaled/summed coordinate step scales/sums in world space', () => {
    // latLonToWorld(a) + latLonToWorld(b) == latLonToWorld(a+b) about the origin
    // (the map has no offset term): a metamorphic relation that pins the linear
    // form without a reference value.
    const a = latLonToWorld(5, 7)
    const b = latLonToWorld(-3, 11)
    const sum = latLonToWorld(5 + -3, 7 + 11)
    expect(a.x + b.x).toBeCloseTo(sum.x, 10)
    expect(a.z + b.z).toBeCloseTo(sum.z, 10)
    // and scaling the input scales the output (through the origin)
    const scaled = latLonToWorld(5 * 3, 7 * 3)
    expect(a.x * 3).toBeCloseTo(scaled.x, 10)
    expect(a.z * 3).toBeCloseTo(scaled.z, 10)
  })

  it('north is -z and east is +x (sign convention pinned)', () => {
    // A higher latitude (further north) must be a SMALLER z; a higher longitude
    // (further east) a LARGER x — the convention every scene relies on.
    expect(latLonToWorld(20, 0).z).toBeLessThan(latLonToWorld(10, 0).z)
    expect(latLonToWorld(0, 20).x).toBeGreaterThan(latLonToWorld(0, 10).x)
  })
})
