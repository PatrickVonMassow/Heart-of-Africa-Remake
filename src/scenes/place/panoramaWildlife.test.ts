// Panorama-wildlife sizing/haze (CLAUDE.md §7.1 pt. 12, points 92/94): the
// far silhouettes stay small (bounded subtended angle) and hazed toward the
// sky, never looming black monuments.
import { describe, it, expect } from 'vitest'
import {
  silhouetteScale,
  apparentAngleDeg,
  hazeColor,
  luminance,
  excludedAzimuthSpan,
  isAzimuthExcluded,
  panoramaDriftDistance,
  panoramaGaitBob,
  panoramaGaitNod,
  PANORAMA_GAIT_BOB,
} from './panoramaWildlife'
import { gaitPhase } from '../../render/fauna'

describe('silhouetteScale', () => {
  it('shrinks an oversized scale so the subtended angle stays within the cap', () => {
    const buildHeight = 3 // world units of the animal mesh
    const ringDist = 80
    const maxDeg = 2.5
    const scale = silhouetteScale(buildHeight, ringDist, maxDeg, 4.2)
    // The clamped scale must not exceed the cap.
    expect(scale).toBeLessThan(4.2)
    expect(apparentAngleDeg(buildHeight * scale, ringDist)).toBeLessThanOrEqual(maxDeg + 1e-6)
  })

  it('keeps a base scale that is already small enough (never enlarges)', () => {
    const scale = silhouetteScale(2, 200, 2.5, 0.5)
    expect(scale).toBe(0.5)
  })

  it('scales the cap with distance — farther rings allow a larger world size', () => {
    const near = silhouetteScale(3, 60, 2.5, 99)
    const far = silhouetteScale(3, 120, 2.5, 99)
    expect(far).toBeGreaterThan(near)
    // But both keep the SAME apparent angle (the point of the cap).
    expect(apparentAngleDeg(3 * near, 60)).toBeCloseTo(apparentAngleDeg(3 * far, 120), 4)
  })

  it('is robust to degenerate inputs', () => {
    expect(silhouetteScale(0, 80, 2.5, 3)).toBe(3)
    expect(silhouetteScale(3, 0, 2.5, 3)).toBe(3)
  })
})

describe('hazeColor', () => {
  const base: [number, number, number] = [0.30, 0.27, 0.22] // ~#4d4639
  const sky: [number, number, number] = [0.85, 0.90, 0.93] // ~#d8e6ee

  const closeTriplet = (got: [number, number, number], want: readonly [number, number, number]) =>
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 6))

  it('mix 0 keeps the base, mix 1 reaches the sky', () => {
    expect(hazeColor(base, sky, 0)).toEqual(base)
    closeTriplet(hazeColor(base, sky, 1), sky)
  })

  it('a mid mix lightens the silhouette measurably toward the sky', () => {
    const hazed = hazeColor(base, sky, 0.55)
    expect(luminance(hazed)).toBeGreaterThan(luminance(base))
    expect(luminance(hazed)).toBeLessThan(luminance(sky))
    // Clearly closer to the sky than the flat dark base (the user's complaint).
    expect(luminance(hazed)).toBeGreaterThan((luminance(base) + luminance(sky)) / 2 - 0.15)
  })

  it('clamps the mix to [0,1]', () => {
    expect(hazeColor(base, sky, -1)).toEqual(base)
    closeTriplet(hazeColor(base, sky, 2), sky)
  })
})

describe('panoramaDriftDistance (point 255 — walking silhouettes, not gliding)', () => {
  it('is zero at rest and grows linearly with elapsed drift time', () => {
    // No time elapsed → no distance → the fed gait phase is 0 (still legs).
    expect(panoramaDriftDistance(80, 0.006, 0)).toBe(0)
    const d1 = panoramaDriftDistance(80, 0.006, 1)
    const d2 = panoramaDriftDistance(80, 0.006, 2)
    expect(d1).toBeGreaterThan(0)
    // Twice the time → twice the arc walked (so the gait swings twice as far):
    // the swing advances WITH the drift distance.
    expect(d2).toBeCloseTo(2 * d1, 12)
  })

  it('scales with the ring radius and ignores the drift sign (either way is walking)', () => {
    // A silhouette on a wider ring covers more ground for the same angular drift.
    expect(panoramaDriftDistance(160, 0.006, 3)).toBeCloseTo(2 * panoramaDriftDistance(80, 0.006, 3), 12)
    // Drifting left or right is the same amount of walking.
    expect(panoramaDriftDistance(80, -0.006, 3)).toBeCloseTo(panoramaDriftDistance(80, 0.006, 3), 12)
  })

  it('a faster-drifting silhouette walks further (steps faster) and a stalled one not at all', () => {
    const slow = panoramaDriftDistance(80, 0.004, 1)
    const fast = panoramaDriftDistance(80, 0.01, 1)
    expect(fast).toBeGreaterThan(slow)
    expect(panoramaDriftDistance(80, 0, 5)).toBe(0) // no drift → no swing
  })
})

describe('panorama silhouette gait pose (point 255 — walking, not sliding)', () => {
  /** Exactly what PlaceScene feeds the pose: the ring arc walked → gait phase. */
  const phaseAt = (radius, drift, t) => gaitPhase(panoramaDriftDistance(radius, drift, t))

  it('advances the stride with the distance covered, and holds it at zero displacement', () => {
    // A drifting silhouette walks: the phase grows as it covers arc.
    const p1 = phaseAt(120, 0.006, 1)
    const p2 = phaseAt(120, 0.006, 2)
    expect(p1).toBeGreaterThan(0)
    expect(p2).toBeGreaterThan(p1)
    // A silhouette that covers no ground never moves a muscle, however long
    // the clock runs — the whole point of a distance-driven gait.
    expect(phaseAt(120, 0, 900)).toBe(0)
    expect(panoramaGaitBob(phaseAt(120, 0, 900), 5)).toBe(0)
    expect(panoramaGaitNod(phaseAt(120, 0, 900))).toBe(0)
  })

  it('steps faster for a faster drift, at the same instant', () => {
    expect(phaseAt(120, 0.01, 3)).toBeGreaterThan(phaseAt(120, 0.004, 3))
    // ... and on a wider ring, where the same angular drift covers more ground.
    expect(phaseAt(160, 0.006, 3)).toBeGreaterThan(phaseAt(100, 0.006, 3))
  })

  it('bobs twice per stride, scaled to the body, and never sinks the animal', () => {
    const h = 5
    // |sin| — two rises per 2π cycle (one per footfall), never negative, so the
    // bob only ever lifts the body off the ground line it stands on.
    expect(panoramaGaitBob(0, h)).toBe(0)
    expect(panoramaGaitBob(Math.PI, h)).toBeCloseTo(0, 12)
    expect(panoramaGaitBob(Math.PI / 2, h)).toBeCloseTo(h * PANORAMA_GAIT_BOB, 12)
    expect(panoramaGaitBob((3 * Math.PI) / 2, h)).toBeCloseTo(h * PANORAMA_GAIT_BOB, 12)
    for (let i = 0; i <= 40; i++) {
      const b = panoramaGaitBob((i / 40) * 6 * Math.PI, h)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(h * PANORAMA_GAIT_BOB + 1e-12)
    }
    // A taller animal bobs proportionally more, so the cue reads the same.
    expect(panoramaGaitBob(Math.PI / 2, 10)).toBeCloseTo(2 * panoramaGaitBob(Math.PI / 2, 5), 12)
  })

  it('nods gently fore and aft — a rock, never a seesaw', () => {
    expect(panoramaGaitNod(0)).toBe(0)
    let maxNod = 0
    for (let i = 0; i <= 60; i++) maxNod = Math.max(maxNod, Math.abs(panoramaGaitNod((i / 60) * 4 * Math.PI)))
    expect(maxNod).toBeGreaterThan(0)
    expect(maxNod).toBeLessThan(0.09) // ≈5°, invisible as a tilt but alive
  })
})

describe('skyline landmark azimuth exclusion (point 102)', () => {
  const DEG = Math.PI / 180

  it('centres the span on the landmark bearing atan2(z, x)', () => {
    // Giza sits west-ish of Cairo at (-130, 10): bearing near +π.
    const giza = excludedAzimuthSpan(-130, 10, 26, 8 * DEG)
    expect(giza.center).toBeCloseTo(Math.atan2(10, -130), 6)
    // Table Mountain due south of Cape Town at (0, -118): bearing -π/2.
    const table = excludedAzimuthSpan(0, -118, 30, 8 * DEG)
    expect(table.center).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('widens the span by the footprint subtended angle plus the margin', () => {
    const span = excludedAzimuthSpan(-130, 10, 26, 8 * DEG)
    const dist = Math.hypot(-130, 10)
    expect(span.half).toBeCloseTo(Math.atan2(26, dist) + 8 * DEG, 6)
    // A wider footprint (or nearer landmark) excludes a wider arc.
    const wider = excludedAzimuthSpan(-130, 10, 52, 8 * DEG)
    expect(wider.half).toBeGreaterThan(span.half)
  })

  it('classifies azimuths inside vs outside the span', () => {
    const span = excludedAzimuthSpan(-130, 10, 26, 8 * DEG)
    expect(isAzimuthExcluded(span.center, [span])).toBe(true)
    expect(isAzimuthExcluded(span.center + span.half - 0.001, [span])).toBe(true)
    expect(isAzimuthExcluded(span.center + span.half + 0.05, [span])).toBe(false)
    // The opposite side of the ring is free.
    expect(isAzimuthExcluded(span.center + Math.PI, [span])).toBe(false)
  })

  it('handles the ±π wrap-around seam', () => {
    // A landmark almost due west (bearing ~+π) whose span crosses the seam:
    // an azimuth just past -π must still be caught.
    const span = { center: Math.PI - 0.02, half: 0.1 }
    expect(isAzimuthExcluded(-Math.PI + 0.03, [span])).toBe(true)
    expect(isAzimuthExcluded(Math.PI - 0.05, [span])).toBe(true)
    expect(isAzimuthExcluded(0, [span])).toBe(false)
  })

  it('is empty-safe (no spans excludes nothing)', () => {
    expect(isAzimuthExcluded(1.2, [])).toBe(false)
  })
})
