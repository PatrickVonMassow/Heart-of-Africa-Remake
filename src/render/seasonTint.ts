// The season's straw/green recolour of the flora and ground (design.md §19.13).
// A shared module rather than living in TravelScene, so the settlement scene can
// tint its own ground and flora with the SAME curve (point 143) — writing a
// second one would drift, and the acacia-crown mask below was hard-won.
//
// A module-level uniform, in the mould of skyOvercast: both scenes drive it per
// frame from their OWN greenness and only ever one renders. It is a uniform,
// not a fresh material, so it does not trip point 96's program-relink cost.

import { float, mix, uniform, vec3 } from 'three/tsl'
import type { vertexColor } from 'three/tsl'

// 0.5 = the untouched mid-year colour, 0 = full straw (dry), 1 = full green
// (lush). Deserts stay neutral on their own: their greenness is ~0 year round.
export const SEASON_TINT_U = uniform(0.5)

/** Set this frame's season tint (from `effectiveGreenness`, 0..1). */
export function setSeasonTint(greenness: number, strength: number) {
  const g = Math.min(1, Math.max(0, greenness))
  const s = Math.min(1, Math.max(0, strength))
  SEASON_TINT_U.value = 0.5 + (g - 0.5) * s
}

/**
 * Recolour a base colour toward straw (dry) or deep green (lush), leaving
 * everything that is not foliage alone.
 *
 * Note the greenness mask: the obvious `g > max(r, b)` test misses the savanna
 * acacia outright — its crown is OLIVE (#6e7c2f, r ≈ g), the single most visible
 * tree in the game — so it keys on green-over-blue AND not-red-heavy instead.
 *
 * Both ends are REAL recolours off the luma, symmetric about the untouched
 * mid-year `c`. They were not once: straw recoloured hard while lush was a
 * multiplicative nudge, so the rains only DIMMED the scene and never shifted its
 * hue (measured: the Sahel's ground green excess moved 41 -> 45 across its whole
 * year). Keep both ends luma-keyed.
 */
export function seasonTintNode(c: ReturnType<typeof vertexColor>['rgb']) {
  const greenness = c.g.sub(c.b).mul(2.5).clamp(0, 1).mul(
    float(1).sub(c.r.sub(c.g).mul(4)).clamp(0, 1),
  )
  const luma = c.r.mul(0.35).add(c.g.mul(0.5)).add(c.b.mul(0.15))
  const straw = vec3(luma.mul(1.9), luma.mul(1.55), luma.mul(0.6))
  const lush = vec3(luma.mul(0.5), luma.mul(1.25), luma.mul(0.45))
  const dryK = float(1).sub(SEASON_TINT_U.mul(2)).clamp(0, 1)
  const lushK = SEASON_TINT_U.mul(2).sub(1).clamp(0, 1)
  return mix(mix(c, straw, greenness.mul(dryK)), lush, greenness.mul(lushK))
}
