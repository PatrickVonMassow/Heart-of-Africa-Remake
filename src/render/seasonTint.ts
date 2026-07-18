// The season's straw/green recolour of the flora and ground (design.md §19.13).
// A shared module rather than living in TravelScene, so the settlement scene can
// tint its own ground and flora with the SAME curve (point 143) — writing a
// second one would drift, and the acacia-crown mask below was hard-won.
//
// A module-level uniform, in the mould of skyOvercast: both scenes drive it per
// frame from their OWN greenness and only ever one renders. It is a uniform,
// not a fresh material, so it does not trip point 96's program-relink cost.

import { attribute, float, mix, positionLocal, uniform, vec3 } from 'three/tsl'
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

// Debug diagnostic (point 175): gates the dry-season flora DEFORMATION — the
// crown bare-branch collapse AND the ground-flora sprout — live via a uniform,
// so it toggles without a program relink (the point 96 rule). 1 = on (default),
// 0 = off (the flora keeps its full positionLocal shape; the season COLOUR is
// untouched). Its purpose is to isolate whether this per-instance vertex
// deformation is the cause of a WebGPU-only flora jump — the deformation and
// the season colour can then be judged apart.
export const SEASON_COLLAPSE_U = uniform(1)

/** Debug: enable/disable the dry-season flora deformation (point 175). */
export function setSeasonCollapse(on: boolean) {
  SEASON_COLLAPSE_U.value = on ? 1 : 0
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
export function seasonTintNode(
  c: ReturnType<typeof vertexColor>['rgb'],
  // The tint source: the shared uniform (settlement scene — one place, one
  // greenness) or the travel scene's per-position season field (point 151).
  tint: ReturnType<typeof float> = SEASON_TINT_U as unknown as ReturnType<typeof float>,
) {
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
  const dryK = float(1).sub(tint.mul(2)).clamp(0, 1)
  const lushK = tint.mul(2).sub(1).clamp(0, 1)
  return mix(mix(c, straw, greenness.mul(dryK)), lush, greenness.mul(lushK))
}

/**
 * Bare branches, second attempt (point 144): in the dry season the foliage
 * collapses toward the trunk and settles down onto it, while the trunk stands.
 *
 * The first attempt derived the mask from the per-vertex COLOUR — which
 * jitters by design — so neighbouring vertices of one crown collapsed by
 * different amounts and the trees tore into the screen-wide shards of the
 * 16.07 critical bug. This one reads the baked, per-part-uniform, BINARY
 * `foliage` attribute (flora.ts): every vertex of a part carries the same
 * value by construction, the part moves as one, and nothing can tear.
 *
 * Zone-correctness is free, as before: the collapse scales with the tint
 * uniform's DRYNESS, which only falls below neutral in a zone that has a dry
 * season — the Congo's evergreen trees stay full because their uniform never
 * leaves neutral.
 */
export function seasonFoliagePosition(
  tint: ReturnType<typeof float> = SEASON_TINT_U as unknown as ReturnType<typeof float>,
) {
  // Cast: the TSL typings do not carry the attribute's float type through.
  const leaf = attribute('foliage', 'float') as unknown as ReturnType<typeof float>
  // Both the crown collapse and the ground sprout derive from `dryness`, so the
  // debug gate multiplies it once here: SEASON_COLLAPSE_U 0 -> dryness 0 ->
  // shrink/sprout 1 and no y-drop, i.e. the flora keeps its full shape (point 175).
  const dryness = float(1).sub(tint.mul(2)).clamp(0, 1).mul(SEASON_COLLAPSE_U)
  // Two foliage classes (both per-part-uniform, the 144 shard rule):
  // 1 = a tree crown — bare branches: it shrinks toward the trunk and
  //     settles down onto it, the trunk stands (the 144 look, unchanged);
  // 2 = ground flora (bush, grass, papyrus) — anchored at y = 0 and scaled
  //     toward the ground, so its seasonal appearance reads as SPROUTING
  //     from the soil rather than floating in (user request, point 151).
  const crownK = leaf.clamp(0, 1).mul(float(2).sub(leaf).clamp(0, 1))
  const sproutK = leaf.sub(1).clamp(0, 1)
  const collapse = crownK.mul(dryness)
  const p = positionLocal
  const shrink = float(1).sub(collapse.mul(0.6))
  const sprout = float(1).sub(sproutK.mul(dryness).mul(0.85))
  return vec3(
    p.x.mul(shrink).mul(sprout),
    p.y.sub(collapse.mul(0.22)).mul(sprout),
    p.z.mul(shrink).mul(sprout),
  )
}
