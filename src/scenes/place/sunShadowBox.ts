// The settlement sun's shadow box: where the directional light sits and how
// far its orthographic shadow camera reaches. Shadows AND the sun shafts
// (render/godraysLight.ts) exist only inside this box: the upstream
// GodraysNode marches a view ray only where it runs through the box, so a
// camera standing sunward of the box's near plane gets no shafts at all.
//
// The light used to sit 60 m from the origin with near = 5, so the box began
// ~55 m sunward — the sunward settlement edge (and everything that should
// shade it) lay outside, and a player there looking into the low sun saw
// neither shafts nor the shadows of the buildings behind it. The light now
// stands far enough out that the box covers the walkable ground and the air
// beyond it toward the sun.

/** Distance of the light from the place origin along the sun direction (m). */
export const SUN_SHADOW_DISTANCE = 140
/** Shadow camera near/far, measured from the light (m). */
export const SUN_SHADOW_NEAR = 5
export const SUN_SHADOW_FAR = 260
/** Half width/height of the shadow camera (m). */
export const SUN_SHADOW_HALF = 55
/** Depth bias in METRES (the old -0.0004 over the old 155 m depth range);
 *  three takes it in normalised depth, so it is divided by the range. */
const SUN_SHADOW_BIAS_M = -0.062
export const SUN_SHADOW_BIAS = SUN_SHADOW_BIAS_M / (SUN_SHADOW_FAR - SUN_SHADOW_NEAR)

/** True when a world point lies inside the box of a light at
 *  `dir * SUN_SHADOW_DISTANCE` aimed at the origin (dir: unit vector to the sun). */
export function inSunShadowBox(p: readonly [number, number, number], dir: readonly [number, number, number]): boolean {
  const n = Math.hypot(dir[0], dir[1], dir[2]) || 1
  const d = [dir[0] / n, dir[1] / n, dir[2] / n]
  // Depth from the light along the light's view axis (toward the origin).
  const along = p[0] * d[0] + p[1] * d[1] + p[2] * d[2]
  const depth = SUN_SHADOW_DISTANCE - along
  const lateral = Math.sqrt(Math.max(0, p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - along * along))
  // Lateral test against the inscribed circle: conservative for the square box.
  return depth >= SUN_SHADOW_NEAR && depth <= SUN_SHADOW_FAR && lateral <= SUN_SHADOW_HALF
}
