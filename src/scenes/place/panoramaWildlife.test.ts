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
  panoramaGaitStep,
  dryRingAngle,
  resumeRingWalks,
  ringSpreadWithin,
  sharedSilhouetteFactor,
  stepRingWalk,
  type RingWalk,
} from './panoramaWildlife'
import { balance } from '../../config/balance'
import { BACKDROP_INNER_OFFSET, PANORAMA_RADIUS, PANORAMA_RING_CLEARANCE } from './backdrop'
import { PLACE_RADIUS } from './placeRadius'
import { buildElephantParts, GAIT_MAX_PITCH, GAIT_SWING, gaitBodyLift, gaitPhase, gaitRig, groundPitch } from '../../render/fauna'

/** The cadence a panorama silhouette really walks on: read off its own rig, as
 *  PlaceScene does (point 300) — never the one shared constant it used to be. */
const RIG = gaitRig(buildElephantParts().legs)

describe('skyline species sizing (work-order 1285)', () => {
  const pw = balance.panoramaWildlife
  const BAND = PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE
  // The village's backdrop rim, as PlaceScene passes it (measured, not assumed).
  const villageInner = PLACE_RADIUS + BACKDROP_INNER_OFFSET
  const spread = ringSpreadWithin(villageInner, pw.ringInner, pw.ringSpread, BAND)
  const mid = villageInner + pw.ringInner + spread / 2
  const factor = sharedSilhouetteFactor(pw.speciesHeight.giraffe, mid, pw.giraffeTargetDeg)
  const angleAt = (sp: keyof typeof pw.speciesHeight, dist: number) => apparentAngleDeg(factor * pw.speciesHeight[sp], dist)

  it('brings the giraffe to its target angle at mid-ring distance', () => {
    expect(angleAt('giraffe', mid)).toBeCloseTo(pw.giraffeTargetDeg, 6)
  })

  it('keeps the true species ratios under the one shared factor', () => {
    for (const sp of ['elephant', 'zebra', 'antelope'] as const) {
      const ratio = Math.tan((angleAt(sp, mid) * Math.PI) / 180) / Math.tan((angleAt('giraffe', mid) * Math.PI) / 180)
      expect(ratio, sp).toBeCloseTo(pw.speciesHeight[sp] / pw.speciesHeight.giraffe, 6)
    }
    // The sketch's targets: elephant ~1.07°, zebra ~0.54°, antelope ~0.47°.
    expect(angleAt('elephant', mid)).toBeCloseTo(1.07, 1)
    expect(angleAt('zebra', mid)).toBeCloseTo(0.54, 1)
    expect(angleAt('antelope', mid)).toBeCloseTo(0.47, 1)
    // No species reaches the safety net, so it never flattens them to one size.
    expect(angleAt('giraffe', villageInner + pw.ringInner)).toBeLessThan(pw.maxApparentAngleDeg)
  })

  // Measured from the centre the village ring (82.8..162.8 m) gives ~2x, not
  // the sketch's ~3x, which left out the 42.8 m rim; the band caps the far side.
  it('spreads the ring by the balance values, so one species visibly varies in size', () => {
    expect(spread).toBe(pw.ringSpread)
    const near = angleAt('zebra', villageInner + pw.ringInner)
    const far = angleAt('zebra', villageInner + pw.ringInner + spread)
    expect(near / far).toBeCloseTo((pw.ringInner + spread + villageInner) / (pw.ringInner + villageInner), 1)
    expect(near / far).toBeGreaterThan(1.9)
  })

  it('shortens the spread where the band leaves less room, never past it', () => {
    expect(ringSpreadWithin(110, 40, 80, BAND)).toBe(BAND - 150)
    expect(ringSpreadWithin(170, 40, 80, BAND)).toBe(0)
  })
})

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

describe('panorama silhouette gait follows the body it moves (no skating on long frames)', () => {
  const dry = () => false
  /** Walks a silhouette for `seconds` of frames of `frame` s, each capped at 0.1 s
   *  as the scene caps it; returns the ring arc moved (÷ scale) and the gait. */
  const walk = (frame: number, seconds: number, wet: (a: number) => boolean = dry) => {
    const radius = 120
    const scale = 3
    let angle = 0
    let drift = 0.006
    let gait = 0
    let moved = 0
    for (let t = 0; t < seconds - 1e-9; t += frame) {
      const stepped = stepRingWalk(angle, drift, Math.min(frame, 0.1), wet)
      gait += panoramaGaitStep(angle, stepped.angle, radius, scale)
      moved += Math.abs(stepped.angle - angle) * radius / scale
      angle = stepped.angle
      drift = stepped.drift
    }
    return { gait, moved, wallClock: panoramaGaitDistance(radius, 0.006, scale, seconds) }
  }

  it('advances the legs only as far as the capped body moved below 10 FPS', () => {
    const slow = walk(0.25, 10) // 4 FPS: the body moves 0.1 s per 0.25 s frame
    expect(slow.gait).toBeCloseTo(slow.moved, 9)
    expect(slow.gait).toBeCloseTo(slow.wallClock * 0.4, 9) // the wall clock would outrun it 2.5×
    const smooth = walk(1 / 60, 10)
    expect(smooth.gait).toBeCloseTo(smooth.wallClock, 6)
  })

  it('holds the legs still while the body only turns round at the water', () => {
    const r = walk(0.05, 2, () => true)
    expect(r.gait).toBe(0)
    expect(panoramaGaitStep(0.4, 0.5, 120, 0)).toBeCloseTo(12, 9) // scale ≤ 0 falls back to 1
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

// A camel stood in the river at the far waterline (work-order 1250): a
// silhouette now starts on dry ground and turns back at the water.
describe('panorama silhouettes keep to dry ground (work-order 1250)', () => {
  // Water across the ring between 1 and 2 rad.
  const wet = (a: number) => {
    const w = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    return w > 1 && w < 2
  }

  it('starts where it stands when that is dry, and on the nearest dry ground otherwise', () => {
    expect(dryRingAngle(0.5, wet)).toBe(0.5)
    const near1 = dryRingAngle(1.1, wet)!
    expect(wet(near1)).toBe(false)
    expect(Math.abs(near1 - 1)).toBeLessThan(0.02)
    const near2 = dryRingAngle(1.9, wet)!
    expect(wet(near2)).toBe(false)
    expect(Math.abs(near2 - 2)).toBeLessThan(0.02)
    expect(dryRingAngle(1, () => true)).toBeNull()
  })

  it('walks on over dry ground and turns round, never stepping in, at the water', () => {
    let walk = { angle: 0.5, drift: 0.01 }
    let turned = 0
    for (let i = 0; i < 20000; i++) {
      const next = stepRingWalk(walk.angle, walk.drift, 0.5, wet)
      if (Math.sign(next.drift) !== Math.sign(walk.drift)) turned++
      expect(Math.abs(next.drift)).toBe(0.01)
      walk = next
      expect(wet(walk.angle)).toBe(false)
    }
    // It meets the water from both sides of the dry arc.
    expect(turned).toBeGreaterThanOrEqual(2)
  })
})

describe('resumeRingWalks (a quality rebuild keeps every walk)', () => {
  const dry = () => false
  it('a known key keeps its angle, heading and gait instead of its seeded start', () => {
    const walked: RingWalk = { angle: 2.4, drift: -0.007, gait: 13.5, wet: dry }
    const [w] = resumeRingWalks([{ key: 'p:1:zebra:0', angle: 0.3, drift: 0.007, wet: dry }], new Map([['p:1:zebra:0', walked]]))
    expect(w).toEqual({ angle: 2.4, drift: -0.007, gait: 13.5, wet: dry })
  })

  it('a new key starts from its seed on dry ground with gait 0', () => {
    const wet = (a: number) => a < 1
    const [w, sunk] = resumeRingWalks(
      [
        { key: 'p:1:antelope:1', angle: 0.5, drift: 0.005, wet },
        { key: 'p:1:antelope:2', angle: 0.5, drift: 0.005, wet: () => true },
      ],
      new Map([['p:2:antelope:1', { angle: 3, drift: 0.005, gait: 9, wet: dry }]]),
    )
    expect(w!.angle).toBeCloseTo(1, 1)
    expect(w!.gait).toBe(0)
    expect(w!.drift).toBe(0.005)
    expect(sunk).toBeNull()
  })

  it('a carried walk is re-seated on dry ground when its spot is now water', () => {
    const wet = (a: number) => a > 2 && a < 2.5
    const [w] = resumeRingWalks(
      [{ key: 'k', angle: 0, drift: 0.005, wet }],
      new Map([['k', { angle: 2.2, drift: -0.005, gait: 4, wet: dry }]]),
    )
    expect(wet(w!.angle)).toBe(false)
    expect(Math.abs(w!.angle - 2.2)).toBeLessThan(0.35)
    expect(w!.gait).toBe(4)
    expect(w!.drift).toBe(-0.005)
  })
})
