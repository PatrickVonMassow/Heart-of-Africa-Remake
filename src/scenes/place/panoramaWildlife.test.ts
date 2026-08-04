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
  panoramaDriftVelocity,
  panoramaDriftYaw,
  panoramaGaitDistance,
} from './panoramaWildlife'
import { buildElephantParts, GAIT_MAX_PITCH, GAIT_SWING, gaitBodyLift, gaitPhase, gaitRig, groundPitch } from '../../render/fauna'

/** The cadence a panorama silhouette really walks on: read off its own rig, as
 *  PlaceScene does (point 300) — never the one shared constant it used to be. */
const RIG = gaitRig(buildElephantParts().legs)

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
  const phaseAt = (radius: number, drift: number, t: number) =>
    gaitPhase(panoramaDriftDistance(radius, drift, t), RIG.cadence)

  it('advances the stride with the distance covered, and holds it at zero displacement', () => {
    // A drifting silhouette walks: the phase grows as it covers arc.
    const p1 = phaseAt(120, 0.006, 1)
    const p2 = phaseAt(120, 0.006, 2)
    expect(p1).toBeGreaterThan(0)
    expect(p2).toBeGreaterThan(p1)
    // A silhouette that covers no ground never moves a muscle, however long
    // the clock runs — the whole point of a distance-driven gait.
    expect(phaseAt(120, 0, 900)).toBe(0)
    expect(gaitBodyLift(phaseAt(120, 0, 900), RIG.legLength)).toBe(0)
  })

  it('steps faster for a faster drift, at the same instant', () => {
    expect(phaseAt(120, 0.01, 3)).toBeGreaterThan(phaseAt(120, 0.004, 3))
    // ... and on a wider ring, where the same angular drift covers more ground.
    expect(phaseAt(160, 0.006, 3)).toBeGreaterThan(phaseAt(100, 0.006, 3))
  })

  it('dips onto the planted leg twice per stride and never rises off the ground line (point 300)', () => {
    // The cosmetic |sin| bob is gone: the vertical stride motion is now the
    // GEOMETRIC dip onto whichever leg is planted, which is what puts the
    // standing foot on the ground. It is never positive — the body only ever
    // settles onto its leg, never floats above the line it stands on.
    const L = RIG.legLength
    const deepest = L * (Math.cos(GAIT_SWING) - 1)
    // Two troughs per cycle — one per footfall, at the handovers where both
    // pairs stand at full reach — and full height twice, at each mid-stance.
    expect(gaitBodyLift(0, L)).toBeCloseTo(0, 12)
    expect(gaitBodyLift(Math.PI, L)).toBeCloseTo(0, 12)
    expect(gaitBodyLift(Math.PI / 2, L)).toBeCloseTo(deepest, 12)
    expect(gaitBodyLift((3 * Math.PI) / 2, L)).toBeCloseTo(deepest, 12)
    for (let i = 0; i <= 400; i++) {
      const b = gaitBodyLift((i / 400) * 6 * Math.PI, L)
      expect(b).toBeLessThanOrEqual(1e-12) // only ever settles, never floats
      expect(b).toBeGreaterThanOrEqual(deepest - 1e-12)
    }
    // A longer leg dips proportionally more — the motion scales with the animal.
    expect(gaitBodyLift(Math.PI / 2, 2 * L)).toBeCloseTo(2 * gaitBodyLift(Math.PI / 2, L), 12)
  })

  it('holds its body to the ground slope and never leans past what an animal could stand on (point 300)', () => {
    // The backdrop COMPRESSES a landscape into a few dozen world units, so the
    // relief under a silhouette's own wheelbase can read as a cliff: measured
    // live, one spot gave a 5.5-unit rise over a 5-unit wheelbase, which
    // unclamped tipped the body 61° nose-down. A walkable incline passes through
    // untouched; an impossible one is capped.
    const wheelbase = RIG.wheelbase * 3 // the silhouette's enlarged frame
    expect(Math.abs(groundPitch(1, 0.4, wheelbase))).toBeLessThan(GAIT_MAX_PITCH) // a real slope: untouched
    expect(groundPitch(1, 0.4, wheelbase)).toBeCloseTo(Math.atan2(-0.6, wheelbase), 12)
    expect(groundPitch(13.6, 8.1, wheelbase)).toBe(-GAIT_MAX_PITCH) // the measured cliff: capped
    expect(groundPitch(8.1, 13.6, wheelbase)).toBe(GAIT_MAX_PITCH)
    expect(GAIT_MAX_PITCH).toBeLessThan(0.4) // ≈17°, a lean, never a dive
  })
})

describe('panorama silhouette faces its motion (point 286 — forward-only, never backward)', () => {
  // Codebase yaw convention (atan2(vx, vz), yaw 0 = +z): the forward vector of a
  // body at yaw is (sin yaw, cos yaw).
  const forward = (yaw: number): [number, number] => [Math.sin(yaw), Math.cos(yaw)]

  it('the facing agrees with the ring velocity for either drift direction and any angle', () => {
    for (const drift of [0.006, -0.006, 0.01, -0.004]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 2 * Math.PI
        const [vx, vz] = panoramaDriftVelocity(a, 120, drift)
        const [fx, fz] = forward(panoramaDriftYaw(a, drift))
        // Facing parallel to the velocity → the forward component IS the full
        // speed, so there is never a backward component (the point-286 bug).
        const along = (vx * fx + vz * fz) / Math.hypot(vx, vz)
        expect(along).toBeGreaterThan(0.999)
      }
    }
  })

  it('rejects the reverted π-off formula that walked every silhouette backward', () => {
    // The bug: yaw = −a + (drift>0 ? π : 0). It points AGAINST the velocity, so
    // guarding the fix against a regression is meaningful.
    for (const drift of [0.006, -0.006]) {
      const a = 0.9
      const [vx, vz] = panoramaDriftVelocity(a, 120, drift)
      const [fx, fz] = forward(-a + (drift > 0 ? Math.PI : 0))
      const along = (vx * fx + vz * fz) / Math.hypot(vx, vz)
      expect(along).toBeLessThan(0) // backward — the reported moonwalk
    }
  })

  it('holds a sane heading at zero drift (falls back to the +tangent, no NaN)', () => {
    const yaw = panoramaDriftYaw(1.1, 0)
    expect(Number.isFinite(yaw)).toBe(true)
    // +tangent at ring-angle a is −a in this convention.
    expect(yaw).toBeCloseTo(-1.1, 9)
  })
})

describe('panorama silhouette gait rate (point 286 — consistent with rendered travel, no flail)', () => {
  const phaseAt = (radius: number, drift: number, scale: number, t: number) =>
    gaitPhase(panoramaGaitDistance(radius, drift, scale, t), RIG.cadence)

  it("drives the stride by the arc in the silhouette's own rendered frame (÷ scale)", () => {
    // Same world arc, larger enlargement → the legs step SLOWER (the flail fix):
    // a 3× silhouette must not swing 3× faster than a 1× one over the same
    // world ground.
    const small = phaseAt(120, 0.006, 1, 3)
    const big = phaseAt(120, 0.006, 3, 3)
    expect(big).toBeCloseTo(small / 3, 12)
  })

  it('leg-swing-per-unit-distance covered is constant — a slower silhouette steps proportionally slower', () => {
    // phase / (effective distance the legs ride) is the fixed cadence for every
    // silhouette, whatever its drift, ring or scale: the point-255 invariant, now
    // on the scale-normalised distance.
    const cases: Array<[number, number, number, number]> = [
      [120, 0.006, 3, 2],
      [160, 0.004, 2.5, 5],
      [90, 0.01, 4, 1.5],
    ]
    const ratios = cases.map(([r, d, s, t]) => phaseAt(r, d, s, t) / panoramaGaitDistance(r, d, s, t))
    for (const x of ratios) expect(x).toBeCloseTo(ratios[0], 9)
  })

  it('still holds a stalled silhouette dead still and steps a faster drift faster', () => {
    expect(phaseAt(120, 0, 3, 900)).toBe(0)
    expect(phaseAt(120, 0.01, 3, 4)).toBeGreaterThan(phaseAt(120, 0.004, 3, 4))
    // Scale ≤ 0 is safe (falls back to 1 → the raw arc).
    expect(panoramaGaitDistance(120, 0.006, 0, 2)).toBeCloseTo(panoramaDriftDistance(120, 0.006, 2), 12)
    expect(panoramaGaitDistance(120, 0.006, -3, 2)).toBeCloseTo(panoramaDriftDistance(120, 0.006, 2), 12)
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
