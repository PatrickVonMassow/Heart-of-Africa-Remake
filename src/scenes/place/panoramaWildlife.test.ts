// Panorama-wildlife sizing/haze (CLAUDE.md §7.1 pt. 12, points 92/94): the
// far silhouettes stay small (bounded subtended angle) and hazed toward the
// sky, never looming black monuments.
import { describe, it, expect } from 'vitest'
import { silhouetteScale, apparentAngleDeg, hazeColor, luminance } from './panoramaWildlife'

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
