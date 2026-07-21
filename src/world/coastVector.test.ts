import { describe, it, expect } from 'vitest'
import { coastLineDistance, landInsideVector, coastSignedDistance } from './coastVector'

describe('coastVector — signed distance to the vector coastline (point 209)', () => {
  it('classifies well-inland and open-ocean points correctly', () => {
    // Deep in the Congo basin: land, far from any coast.
    expect(landInsideVector(0, 22)).toBe(true)
    expect(coastLineDistance(0, 22)).toBeGreaterThan(3)
    expect(coastSignedDistance(0, 22)).toBeGreaterThan(3)
    // Mid Atlantic: open ocean, far from the coast, negative signed distance.
    expect(landInsideVector(0, -20)).toBe(false)
    expect(coastSignedDistance(0, -20)).toBeLessThan(-3)
  })

  it('agrees with the Red-Sea cut at the mainland boundary (Suez closes the ring)', () => {
    // Sinai / mid Red Sea lie OUTSIDE the mainland ring (it closes at Suez), so
    // the vector sign reads ocean there — consistent with the DEM trim.
    expect(landInsideVector(28.5, 33.8)).toBe(false) // mid Red Sea
    expect(landInsideVector(29.5, 34.0)).toBe(false) // Sinai interior
    // The Nile delta coast just inland stays land.
    expect(landInsideVector(30.8, 31.2)).toBe(true)
  })

  it('puts the shoreline (0-crossing) at the real Mediterranean coast off the delta', () => {
    // Sweep north across the delta coast (~lat 31.5): land turns to sea.
    expect(coastSignedDistance(30.8, 31.0)).toBeGreaterThan(0) // inland
    expect(coastSignedDistance(32.2, 31.0)).toBeLessThan(0) // offshore
  })

  it('is sub-texel SMOOTH: the signed distance is Lipschitz, never grid-quantized (the point-209 fix)', () => {
    // Fine transect crossing the delta coast. A binary-mask 0.5-contour would
    // step in ~0.025deg (texel) blocks; a vector signed distance varies
    // continuously — consecutive samples differ by at most their spacing.
    const lon = 31.0
    const step = 0.01
    let prev = coastSignedDistance(30.6, lon)
    let maxJump = 0
    let crossings = 0
    for (let lat = 30.6 + step; lat <= 32.4; lat += step) {
      const d = coastSignedDistance(lat, lon)
      maxJump = Math.max(maxJump, Math.abs(d - prev))
      if (Math.sign(d) !== Math.sign(prev)) crossings++
      prev = d
    }
    // Distance is 1-Lipschitz: a 0.01deg move cannot change it by more than
    // ~0.01deg (a small factor of slack for the sign kink at the shore).
    expect(maxJump).toBeLessThan(step * 1.6)
    // Exactly one clean land->sea crossing along this transect.
    expect(crossings).toBe(1)
  })

  it('the shoreline crossing MOVES continuously along the coast (not snapped to a grid)', () => {
    // The 0-crossing latitude at neighbouring longitudes must differ by a
    // sub-texel amount that varies — a grid staircase would repeat the same
    // quantized latitude across a whole texel column.
    const crossingLat = (lon: number): number => {
      let lo = 30.6
      let hi = 32.6
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2
        if (coastSignedDistance(mid, lon) > 0) lo = mid
        else hi = mid
      }
      return (lo + hi) / 2
    }
    const a = crossingLat(30.8)
    const b = crossingLat(30.9)
    const c = crossingLat(31.0)
    // The crossings are distinct (continuous coast), not one repeated grid value.
    expect(Math.abs(a - b)).toBeGreaterThan(1e-4)
    expect(Math.abs(b - c)).toBeGreaterThan(1e-4)
  })
})
