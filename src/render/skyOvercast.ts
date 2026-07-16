// This frame's overcast on the shared sky dome (design.md §19.13, point 120g).
// Its own module rather than sky.tsx so that file keeps exporting only its
// component (Fast Refresh), in the mould of season.ts' MONTH_KEYS.

import { uniform } from 'three/tsl'

// 0 = the preset's clear sky, 1 = full rain.
export const OVERCAST_GRAY_U = uniform(0)
export const OVERCAST_CLOUDS_U = uniform(0)

/**
 * Set this frame's overcast look (from `skyOvercastParams`). Module-level, like
 * the travel scene's season tint: both scenes drive it per frame and only ever
 * one of them renders.
 */
export function setSkyOvercast(grayMix: number, cloudBoost: number) {
  OVERCAST_GRAY_U.value = grayMix
  OVERCAST_CLOUDS_U.value = cloudBoost
}

/** The overcast currently on the dome (dev hooks / verification). */
export function skyOvercast(): { grayMix: number; cloudBoost: number } {
  return { grayMix: OVERCAST_GRAY_U.value, cloudBoost: OVERCAST_CLOUDS_U.value }
}
