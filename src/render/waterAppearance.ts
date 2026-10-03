// The ONE description of a settlement river's water (work-order 525).
//
// A village that stands on a river draws that river TWICE: as real geometry on
// its own ground at the bank (`placeRiver.ts`), and — past the ground plate's
// rim — as the §2.5 panorama's continuation of the SAME course
// (`scenes/place/backdropMaterial.ts`). Both halves are measured from one river
// course, so the geometry always agreed; the SHADING did not, and the two met
// along a perfectly straight horizontal line across the whole picture: a bright
// teal near band against the duller, greyer terrain tone beyond it. That line
// sits exactly where the player looks while he is being taught upstream and
// downstream, and it read as a rendering fault rather than as distance.
//
// So both read their appearance HERE. In the shading nothing distinguishes near
// from far but DISTANCE (the near mesh additionally rides the ripple): the
// moving detail is scaled by the shared `detailFade`, so the far
// continuation resolves into the calm sheet the same water becomes at that
// range instead of into a second, independently tuned material.
//
// The field is written in METRES of the settlement's own ground — along the
// current and out from the waterline — and both halves feed it the same world
// position, so the pattern runs CONTINUOUSLY across the rim rather than
// restarting at it.

import { clamp, color, float, fwidth, max, mix, mx_fractal_noise_float, smoothstep, time, uniform, vec3 } from 'three/tsl'
import { balance } from '../config/balance'
import { seasonFlowFactor } from '../scenes/travel/wildlifeBehavior'
import { detailFade } from './materials'

/**
 * How fast the water's pattern — and the flotsam riding it — travels
 * downstream, in metres per second, at a local wetness of 0..1 (work-order
 * 1280). The base speed is scaled by the gameplay current's OWN season factors
 * (`waterDrama.dryFlowFactor` / `wetFlowFactor`), so the river the player
 * watches runs as tame or as swollen as the one the §19.8 water drama uses.
 */
export function riverDriftSpeed(wetness: number, b: Pick<typeof balance, 'riverCurrent' | 'waterDrama'> = balance): number {
  const season = seasonFlowFactor(wetness, b.waterDrama.dryFlowFactor, b.waterDrama.wetFlowFactor)
  return b.riverCurrent.driftBaseSpeed * season
}

/**
 * Metres the current has carried the water since the session began — the ONE
 * drift phase the shader's streaks, fine texture and ripple AND the drifting
 * flotsam all read, so they cannot run at different speeds. A phase rather than
 * `time × speed`: the speed follows the season, and a changing factor on a
 * large `time` would make the whole pattern lurch.
 */
export const riverDrift = uniform(0)

/** Advance the drift phase by one frame; the place scene calls this exactly
 *  once per frame. `dt` is clamped like every frame step of the scene. */
export function advanceRiverDrift(dt: number, wetness: number): number {
  riverDrift.value += Math.min(Math.max(dt, 0), 0.1) * riverDriftSpeed(wetness)
  return riverDrift.value
}

/**
 * The tones the surface is built from — the ONE colour source of both halves.
 * `deep` and `sheen` are what the streaks mix between; `foam` is the crest and
 * shore froth riding them.
 */
export const RIVER_WATER_TONES = {
  deep: '#2b5f7e',
  sheen: '#4a90a6',
  foam: '#eaf3f5',
} as const

/** Open water is glossy (the IBL sky reflects in it), foam is not. */
export const WATER_ROUGHNESS = 0.11
export const WATER_FOAM_ROUGHNESS = 0.55
export const WATER_METALNESS = 0.02

/** Metres of view distance the moving detail is drawn at full strength within,
 *  and the distance past which the surface has resolved into its flat sheet.
 *  The streak field is coarse (a period of ~11 m), so it stays legible far out
 *  and only fades where it would turn sub-pixel and tremble under the TRAA
 *  jitter — the same reason `detailFade` exists for the ground. */
const WATER_DETAIL_NEAR = 60
const WATER_DETAIL_FAR = 220

/** World size of the streak field: long along the current, narrow across it. */
const STREAK_ALONG = 0.09
const STREAK_ACROSS = 0.55

/** The FINE octave over the streaks (work-order 1280): cells of ~1-3 m that
 *  ride the same drift, so the surface visibly advances a good fraction of its
 *  own grain every second. Slightly longer along the flow than across it. */
const FINE_ALONG = 0.45
const FINE_ACROSS = 0.75
/** How strongly the fine octave shades the water (art constants, calibratable). */
const FINE_TONE = 2.2
const FINE_GLOSS = 0.08
/** Height of the fine cells' relief in metres: a few centimetres over 1-3 m,
 *  enough for the sky's reflection to glint and slide on them (calibratable). */
const FINE_RELIEF = 0.08
/** How much the fine cells fray the froth ribbons' edges into moving flecks. */
const FINE_FROTH = 0.35
/** Its fade (work-order 1280): a 1-3 m grain turns sub-pixel FAR sooner than the
 *  ~11 m streaks, and resampled under the TRAA jitter it shimmers. So it fades
 *  by its own screen footprint — cycles of the field per pixel, from `fwidth` —
 *  which follows the grazing angle and the resolution, and is gone well before
 *  the Nyquist limit of 0.5. A gentle distance fade rides along as a floor, so
 *  nothing of it reaches the 60-220 m band whatever the footprint reads. */
const FINE_FOOTPRINT_FULL = 0.08
const FINE_FOOTPRINT_GONE = 0.3
const FINE_DETAIL_NEAR = 20
const FINE_DETAIL_FAR = 60

/** How far out from the waterline the shore froth reaches, and how far INSIDE
 *  it the froth still applies. The inner gate matters only for the panorama,
 *  which carries water on every bearing: without it every surface lying inland
 *  of the waterline (a negative `across` without bound) would read as one
 *  endless white shore. The drawn surface's innermost row sits at
 *  −BANK_SHORE_HALF = −1.2, so the near water is untouched by the gate. */
const SHORE_FOAM_REACH = 2.4
const SHORE_FOAM_INNER = -1.8

interface RiverWaterInput {
  /** Metres DOWNSTREAM along the current. */
  along: unknown
  /** Metres out from the waterline (negative = inland of it). */
  across: unknown
  /** Fractal octaves of the moving detail — the `waterDetailOctaves` quality
   *  lever, applied to BOTH halves so a frugal level can never part them. */
  octaves: number
}

/**
 * The water surface at a point: its colour, how rough it is, how opaque, and
 * the ripple it rides. The near mesh displaces its vertices by the
 * ripple; the panorama, a compressed heightfield, only shades.
 */
export function riverWaterSurface({ along, across, octaves }: RiverWaterInput) {
  const u = float(along as never)
  const v = float(across as never)
  // ONE distance resolve for both halves: at the rim they stand at the same
  // range, so they carry the same amount of detail and cannot step against
  // each other.
  const detail = detailFade(WATER_DETAIL_NEAR, WATER_DETAIL_FAR)
  // The water's own frame, carried downstream by the shared drift phase.
  const flowing = u.sub(riverDrift)

  // Streaks stretched along the flow (long in u, narrow in v) and carried
  // downstream at the drift speed the foam flecks ride, so shader and props
  // tell the same story. Fading toward 0.5 — the field's own mean — is what
  // "resolved by distance" means here: the far sheet keeps the near water's
  // mean base colour, it just stops carrying the pattern and its streak foam.
  const streakField = mx_fractal_noise_float(
    vec3(flowing.mul(STREAK_ALONG), v.mul(STREAK_ACROSS), 1.0),
    Math.max(1, Math.round(octaves)),
  )
    .mul(0.5)
    .add(0.5)
  const streak = mix(float(0.5), streakField, detail)

  // The fine octave: same drift, its own footprint fade (see FINE_FOOTPRINT_*).
  // A slow third coordinate lets the cells churn a little as they travel, as
  // moving water does, without that churn ever outrunning the drift.
  const fineAt = vec3(flowing.mul(FINE_ALONG), v.mul(FINE_ACROSS), time.mul(0.07).add(4.0))
  const footprint = max(fwidth(fineAt.x), fwidth(fineAt.y))
  const fineFade = smoothstep(float(FINE_FOOTPRINT_GONE), float(FINE_FOOTPRINT_FULL), footprint).mul(
    detailFade(FINE_DETAIL_NEAR, FINE_DETAIL_FAR),
  )
  const fine = mx_fractal_noise_float(fineAt, Math.min(2, Math.max(1, Math.round(octaves)))).mul(fineFade)

  const base = mix(
    color(RIVER_WATER_TONES.deep),
    color(RIVER_WATER_TONES.sheen),
    clamp(streak.mul(0.5).add(fine.mul(FINE_TONE * 0.5)), 0, 1),
  )
  // Foam where the current drags over the shallows at the near shore...
  const shoreFoam = smoothstep(float(SHORE_FOAM_REACH), float(0.3), v)
    .mul(smoothstep(float(SHORE_FOAM_INNER), float(SHORE_FOAM_INNER + 0.6), v))
    .mul(smoothstep(float(0.4), float(0.75), streak.add(fine.mul(FINE_FROTH))))
  // ... and a thinner ribbon of it further out, so the movement reads across
  // the whole surface rather than only at the player's feet.
  // The fine cells fray its edges into flecks that travel with the water.
  const midFoam = smoothstep(float(0.62), float(0.86), streak.add(fine.mul(FINE_FROTH))).mul(0.45)
  const foam = max(shoreFoam, midFoam)

  return {
    /** 1 up close, 0 once the distance has flattened the field out. */
    detail,
    color: mix(base, color(RIVER_WATER_TONES.foam), foam.mul(0.85)),
    // The fine cells also break the gloss up a little, so the sky's reflection
    // is what visibly slides downstream on them.
    roughness: foam.mul(WATER_FOAM_ROUGHNESS).add(WATER_ROUGHNESS).add(fine.abs().mul(FINE_GLOSS)),
    // The shallows let a trace of the bed through at the bank (0.94) and the
    // sheet turns fully opaque a few metres out — which is also what keeps the drawn surface from reading
    // darker than the opaque panorama where the two meet.
    opacity: smoothstep(float(0.5), float(3), v).mul(0.06).add(0.94),
    /** The fine cells as a relief in metres (0 where they have faded), for a
     *  surface that bumps its normal with it — the drawn mesh at the bank. */
    relief: fine.mul(FINE_RELIEF),
    /** Vertical ripple in metres (design.md §11: only slight movement). */
    ripple: mx_fractal_noise_float(
      vec3(flowing.mul(0.22), v.mul(0.9), time.mul(0.12)),
      Math.max(1, Math.round(octaves) - 1),
    )
      .mul(0.03)
      .mul(detail),
  }
}
