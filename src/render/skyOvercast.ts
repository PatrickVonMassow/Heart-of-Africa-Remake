// This frame's overcast on the shared sky dome (design.md §19.13, point 120g).
// Its own module rather than sky.tsx so that file keeps exporting only its
// component (Fast Refresh), in the mould of season.ts' MONTH_KEYS.

import { uniform } from 'three/tsl'
import { balance } from '../config/balance'

// 0 = the preset's clear sky, 1 = full rain.
export const OVERCAST_GRAY_U = uniform(0)
export const OVERCAST_CLOUDS_U = uniform(0)
// What the dome SHOWS of grayMix (point 354): 0 = clear, 1 = a heavy gray deck.
export const OVERCAST_LOOK_U = uniform(0)
// The harmattan pall (point 140): dust, not cloud — its own axis, because the
// wet overcast grays toward RAIN_GRAY and thickens the deck, while the dust
// whitens toward HARMATTAN_PALE, reddens the sun and MUTES the halo.
export const HARMATTAN_DUST_U = uniform(0)

/**
 * How heavy the dome reads for a grayMix (point 354). The rain streaks start at
 * grayMix 0.34 (wetness 0.45), and a linear 34-48 % mix toward gray left the
 * sky blue under them; this eases the dome to full overcast by
 * `balance.season.overcastFullAt`. Exactly 0 at 0, so the dry sky is unchanged.
 */
export function overcastLook(grayMix: number): number {
  const t = Math.min(1, Math.max(0, grayMix / Math.max(1e-6, balance.season.overcastFullAt)))
  return t * t * (3 - 2 * t)
}

/**
 * Set this frame's overcast look (from `skyOvercastParams`). Module-level, like
 * the travel scene's season tint: both scenes drive it per frame and only ever
 * one of them renders.
 */
export function setSkyOvercast(grayMix: number, cloudBoost: number) {
  OVERCAST_GRAY_U.value = grayMix
  OVERCAST_CLOUDS_U.value = cloudBoost
  OVERCAST_LOOK_U.value = overcastLook(grayMix)
}

/** Set this frame's harmattan pall (from `harmattanSkyParams`' paleMix). */
export function setSkyHarmattan(paleMix: number) {
  HARMATTAN_DUST_U.value = paleMix
}

/** The overcast currently on the dome (dev hooks / verification). */
export function skyOvercast(): { grayMix: number; cloudBoost: number; look: number; dust: number } {
  return {
    grayMix: OVERCAST_GRAY_U.value,
    cloudBoost: OVERCAST_CLOUDS_U.value,
    look: OVERCAST_LOOK_U.value,
    dust: HARMATTAN_DUST_U.value,
  }
}
