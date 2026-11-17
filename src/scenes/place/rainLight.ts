// The rain changes the light in a settlement (design.md §19.13): while it
// rains the sun and the sky light are damped, the haze thickens and the view
// distance shortens, so a downpour reads as one from inside a hut as well as
// from the open, and the fixed-intensity fire becomes the brightest thing in
// the village. It acts on the LIGHTS and the FOG only — the sky dome's
// overcast (skyOvercastParams, point 354) is untouched; the dome draws with
// fog off, so the shorter fog never grays it twice.
//
// It multiplies ON TOP of the wetness dim (season.ts sunDimFactor) and is
// driven by the rain amount (rainAmount), which is 0 below the drizzle
// threshold — so rain 0 is today's sun and haze exactly. Pure.

import { balance } from '../../config/balance'

export interface RainLight {
  /** Multiplier on the sun's intensity. */
  sun: number
  /** Multiplier on the hemisphere (sky) light's intensity. */
  hemi: number
  /** Multiplier on the fog's near and far distances. */
  fogRange: number
  /** Extra mix of the fog colour toward the rain gray, 0..1. */
  hazeMix: number
}

export const RAIN_LIGHT_IDENTITY: RainLight = { sun: 1, hemi: 1, fogRange: 1, hazeMix: 0 }

/**
 * The light set at rain amount `rain` (0..1). `enabled` is the detail-level
 * lever (low keeps the undimmed sun); off or rain 0 returns the identity.
 * Linear in the clamped rain, so monotone: every factor falls (the haze mix
 * rises) as the rain rises.
 */
export function rainLightDamping(rain: number, enabled: boolean, cfg = balance.rainLight): RainLight {
  const r = Math.min(1, Math.max(0, Number.isFinite(rain) ? rain : 0))
  if (!enabled || r === 0) return { ...RAIN_LIGHT_IDENTITY }
  const s = Math.min(1, Math.max(0, cfg.strength))
  return {
    sun: 1 - cfg.sunDamp * s * r,
    hemi: 1 - cfg.hemiDamp * s * r,
    fogRange: 1 - cfg.fogRangeCut * s * r,
    hazeMix: cfg.hazeMix * s * r,
  }
}
