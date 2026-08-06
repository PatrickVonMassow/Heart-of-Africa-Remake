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
// So both read their appearance HERE. Nothing distinguishes near from far but
// DISTANCE: the moving detail is scaled by the shared `detailFade`, so the far
// continuation resolves into the calm sheet the same water becomes at that
// range instead of into a second, independently tuned material.
//
// The field is written in METRES of the settlement's own ground — along the
// current and out from the waterline — and both halves feed it the same world
// position, so the pattern runs CONTINUOUSLY across the rim rather than
// restarting at it.

import { color, float, max, mix, mx_fractal_noise_float, smoothstep, time, vec3 } from 'three/tsl'
import { detailFade } from './materials'

/** How fast the water's pattern — and the foam patches riding it — travel
 *  downstream, in metres per second. An art constant like the wave figures of
 *  the ocean material: fast enough to read as a current at a glance, slow
 *  enough for a wide river. */
export const RIVER_DRIFT_SPEED = 0.85

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
export const WATER_DETAIL_NEAR = 60
export const WATER_DETAIL_FAR = 220

/** World size of the streak field: long along the current, narrow across it. */
const STREAK_ALONG = 0.09
const STREAK_ACROSS = 0.55

/** How far out from the waterline the shore froth reaches, and how far INSIDE
 *  it the froth still applies. The inner gate matters only for the panorama,
 *  which carries water on every bearing: without it every surface lying inland
 *  of the waterline (a negative `across` without bound) would read as one
 *  endless white shore. The drawn surface's innermost row sits at
 *  −BANK_SHORE_HALF = −1.2, so the near water is untouched by the gate. */
const SHORE_FOAM_REACH = 2.4
const SHORE_FOAM_INNER = -1.8

export interface RiverWaterInput {
  /** Metres DOWNSTREAM along the current. */
  along: unknown
  /** Metres out from the waterline (negative = inland of it). */
  across: unknown
  /** Fractal octaves of the moving detail — the `waterDetailOctaves` quality
   *  lever, applied to BOTH halves so a frugal level can never part them. */
  octaves: number
}

/**
 * The water surface at a point: its colour, how rough and metallic it is, how
 * opaque, and the ripple it rides. The near mesh displaces its vertices by the
 * ripple; the panorama, a compressed heightfield, only shades.
 */
export function riverWaterSurface({ along, across, octaves }: RiverWaterInput) {
  const u = float(along as never)
  const v = float(across as never)
  // ONE distance resolve for both halves: at the rim they stand at the same
  // range, so they carry the same amount of detail and cannot step against
  // each other.
  const detail = detailFade(WATER_DETAIL_NEAR, WATER_DETAIL_FAR)

  // Streaks stretched along the flow (long in u, narrow in v) and carried
  // downstream at the drift speed the foam flecks ride, so shader and props
  // tell the same story. Fading toward 0.5 — the field's own mean — is what
  // "resolved by distance" means here: the far sheet keeps the near water's
  // AVERAGE colour exactly, it just stops carrying the pattern.
  const streakField = mx_fractal_noise_float(
    vec3(u.mul(STREAK_ALONG).sub(time.mul(RIVER_DRIFT_SPEED * STREAK_ALONG)), v.mul(STREAK_ACROSS), 1.0),
    Math.max(1, Math.round(octaves)),
  )
    .mul(0.5)
    .add(0.5)
  const streak = mix(float(0.5), streakField, detail)

  const base = mix(color(RIVER_WATER_TONES.deep), color(RIVER_WATER_TONES.sheen), streak.mul(0.5))
  // Foam where the current drags over the shallows at the near shore...
  const shoreFoam = smoothstep(float(SHORE_FOAM_REACH), float(0.3), v)
    .mul(smoothstep(float(SHORE_FOAM_INNER), float(SHORE_FOAM_INNER + 0.6), v))
    .mul(smoothstep(float(0.4), float(0.75), streak))
  // ... and a thinner ribbon of it further out, so the movement reads across
  // the whole surface rather than only at the player's feet.
  const midFoam = smoothstep(float(0.62), float(0.86), streak).mul(0.45)
  const foam = max(shoreFoam, midFoam)

  return {
    /** 1 up close, 0 once the distance has flattened the field out. */
    detail,
    color: mix(base, color(RIVER_WATER_TONES.foam), foam.mul(0.85)),
    roughness: foam.mul(WATER_FOAM_ROUGHNESS).add(WATER_ROUGHNESS),
    // The shallows are seen THROUGH at the bank and the sheet turns opaque a
    // few metres out — which is also what keeps the drawn surface from reading
    // darker than the opaque panorama where the two meet.
    opacity: smoothstep(float(0.5), float(3), v).mul(0.06).add(0.94),
    /** Vertical ripple in metres (design.md §11: only slight movement). */
    ripple: mx_fractal_noise_float(
      vec3(u.mul(0.22).sub(time.mul(RIVER_DRIFT_SPEED * 0.22)), v.mul(0.9), time.mul(0.12)),
      Math.max(1, Math.round(octaves) - 1),
    )
      .mul(0.03)
      .mul(detail),
  }
}
