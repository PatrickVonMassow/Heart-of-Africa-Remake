// The season's straw/green recolour of the flora and ground (design.md §19.13).
// A shared module rather than living in TravelScene, so the settlement scene can
// tint its own ground and flora with the SAME curve (point 143) — writing a
// second one would drift, and the acacia-crown mask below was hard-won.
//
// A module-level uniform, in the mould of skyOvercast: both scenes drive it per
// frame from their OWN greenness and only ever one renders. It is a uniform,
// not a fresh material, so it does not trip point 96's program-relink cost.

import { float, mix, positionLocal, uniform, vec3 } from 'three/tsl'
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
  // Deliberately EXAGGERATED per design.md §19.13's licence (point 144): a
  // near-white bleached straw against a deep saturated green, so the season
  // reads at a glance rather than as a subtle shift. The restrained pair
  // (straw 1.9/1.55/0.6, lush 0.5/1.25/0.45) moved the Sahel's on-screen green
  // excess only 41->51 across its whole year — a fact the player could not see.
  const straw = vec3(luma.mul(2.15), luma.mul(1.75), luma.mul(0.4))
  const lush = vec3(luma.mul(0.28), luma.mul(1.5), luma.mul(0.3))
  const dryK = float(1).sub(SEASON_TINT_U.mul(2)).clamp(0, 1)
  const lushK = SEASON_TINT_U.mul(2).sub(1).clamp(0, 1)
  return mix(mix(c, straw, greenness.mul(dryK)), lush, greenness.mul(lushK))
}

/**
 * Bare branches (design.md §19.13, point 144): the strongest seasonal signal,
 * because it changes the SILHOUETTE where a colour tint cannot. In the dry
 * season a savanna tree's foliage collapses toward its trunk — the umbrella
 * acacia thins to a wisp — while the trunk stays put.
 *
 * It reuses `seasonTintNode`'s greenness mask instead of a new vertex attribute,
 * and that is what keeps it correct per zone without one: only FOLIAGE vertices
 * (green) move, and they only move as the tint uniform DRIES, which happens only
 * in a zone that has a dry season. The Congo's evergreen trees are green too,
 * but their zone never drives the uniform below neutral, so they never go bare —
 * self-correcting, and exactly the researched behaviour (rainforest is
 * evergreen; savanna is deciduous).
 *
 * Use as a material's `positionNode`; pass its `vertexColor().rgb`.
 */
export function seasonFoliagePosition(c: ReturnType<typeof vertexColor>['rgb']) {
  const greenness = c.g.sub(c.b).mul(2.5).clamp(0, 1).mul(
    float(1).sub(c.r.sub(c.g).mul(4)).clamp(0, 1),
  )
  // 0 at neutral (mid-year) and above, rising to 1 at full dry.
  const dryness = float(1).sub(SEASON_TINT_U.mul(2)).clamp(0, 1)
  const collapse = greenness.mul(dryness)
  const p = positionLocal
  // Pull foliage in toward the trunk axis and settle it down onto the branches;
  // the trunk (greenness ~0) is untouched.
  const shrink = float(1).sub(collapse.mul(0.72))
  return vec3(p.x.mul(shrink), p.y.sub(collapse.mul(0.28)), p.z.mul(shrink))
}
