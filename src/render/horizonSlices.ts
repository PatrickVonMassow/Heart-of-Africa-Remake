// Which baked horizon slices the current sun reads (design.md §2.7 "The land
// shades itself"). The bake (scripts/build-horizon-maps.mjs) holds six sun
// directions covering the azimuth arc the fixed 16:00 hour can produce; the
// fragment blends the two slices that bracket the current azimuth. A debug
// hour (`balance.sun.hour`) can push the sun outside that arc: the shading
// then CLAMPS to the nearest baked slice and the result says so, so the
// caller can report it — never shade silently from the wrong direction.

/** Azimuths (degrees clockwise from north) of the six baked slices. Mirrors
 *  SUN_AZIMUTHS of scripts/horizonSweep.mjs (horizonSlices.test.ts keeps both
 *  and public/geodata/horizon.json equal). */
export const HORIZON_AZIMUTHS = [233.13, 248.199, 262.875, 277.125, 291.801, 306.87] as const

export interface HorizonSliceBlend {
  /** Weight per baked slice (six entries, summing to 1, at most two non-zero). */
  weights: number[]
  /** True when the azimuth lay outside the baked arc and was clamped. */
  clamped: boolean
  /** The azimuth actually shaded from (degrees). */
  shadedAzimuth: number
}

/** Blend weights of the six slices for a sun azimuth (degrees, any range). */
export function horizonSliceBlend(azimuthDeg: number): HorizonSliceBlend {
  const az = ((azimuthDeg % 360) + 360) % 360
  const first = HORIZON_AZIMUTHS[0]
  const last = HORIZON_AZIMUTHS[HORIZON_AZIMUTHS.length - 1]
  const weights = HORIZON_AZIMUTHS.map(() => 0)
  if (az < first || az > last) {
    // Nearest end of the arc by angular distance (the arc is < 180 degrees).
    const toFirst = Math.min(Math.abs(az - first), 360 - Math.abs(az - first))
    const toLast = Math.min(Math.abs(az - last), 360 - Math.abs(az - last))
    const end = toFirst <= toLast ? 0 : HORIZON_AZIMUTHS.length - 1
    weights[end] = 1
    return { weights, clamped: true, shadedAzimuth: HORIZON_AZIMUTHS[end] }
  }
  let i = 0
  while (i < HORIZON_AZIMUTHS.length - 2 && az > HORIZON_AZIMUTHS[i + 1]) i++
  const t = (az - HORIZON_AZIMUTHS[i]) / (HORIZON_AZIMUTHS[i + 1] - HORIZON_AZIMUTHS[i])
  weights[i] = 1 - t
  weights[i + 1] = t
  return { weights, clamped: false, shadedAzimuth: az }
}
