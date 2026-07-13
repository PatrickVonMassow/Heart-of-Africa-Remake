// Shared TSL node materials for surfaces that need procedural texture
// (plaster, mud, thatch, ground). World-space noise keeps them seamless
// across separately placed meshes without any UV work. Every material also
// perturbs its NORMAL from a matching height field (design.md §2.6/§7.1
// pt. 11): color noise alone reads soft and washed out at first-person eye
// height — the fine structure comes from light reacting to micro-relief.

import * as THREE from 'three/webgpu'
import {
  color,
  dFdx,
  dFdy,
  faceDirection,
  float,
  mix,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  normalView,
  positionView,
  positionWorld,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl'

/**
 * Screen-space bump normal for a PROCEDURAL height node (Mikkelsen, the same
 * math as three's BumpMapNode). three's bumpMap() cannot be used here: it
 * derives dH from re-sampling a TEXTURE at offset UVs, and a world-position
 * noise node ignores that UV context — three identical samples, zero
 * gradient, no visible bump. Direct dFdx/dFdy on the height node works for
 * any procedural field.
 */
// The published dFdx/mul typings are narrower than the runtime (they accept
// any float-ish node); the casts below bridge that gap only.
export function proceduralBump(height: unknown, strength: unknown) {
  const dHdx = dFdx(height as never).mul(strength as never)
  const dHdy = dFdy(height as never).mul(strength as never)
  const sigX = positionView.dFdx().normalize()
  const sigY = positionView.dFdy().normalize()
  const r1 = sigY.cross(normalView)
  const r2 = normalView.cross(sigX)
  const det = sigX.dot(r1).mul(faceDirection)
  const grad = det.sign().mul(dHdx.mul(r1).add(dHdy.mul(r2)))
  return det.abs().mul(normalView).sub(grad).normalize()
}

/**
 * Fades procedural detail out with view distance. High-frequency world-space
 * noise turns sub-pixel in the distance, where the TRAA camera jitter samples
 * a different value every frame and the temporal resolve cannot converge —
 * the ground visibly trembles. Detail amplitudes are multiplied by this fade
 * so far surfaces fall back to their flat base color/normal.
 */
export function detailFade(near: number, far: number) {
  return smoothstep(float(far), float(near), positionView.z.negate())
}

export interface NoisyMaterialOptions {
  base: string
  alt: string
  /** Noise frequency per world unit; a vec3 allows anisotropy (e.g. thatch). */
  scale: number | [number, number, number]
  roughness?: number
  octaves?: number
  /** Strength of the micro-relief bump derived from the same noise field. */
  bump?: number
  /** Weathering: darkened base course and faint vertical run-off streaks. */
  weathered?: boolean
}

/** Standard material whose color blends base→alt by world-space fBm noise,
 *  with the same field driving a micro-relief bump so the surface structure
 *  catches the light instead of reading as a flat wash. */
export function createNoisyMaterial(opts: NoisyMaterialOptions): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.roughness = opts.roughness ?? 0.95
  m.metalness = 0
  const s = typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : opts.scale
  const p = positionWorld.mul(vec3(...s))
  const n = mx_fractal_noise_float(p, opts.octaves ?? 4).mul(0.5).add(0.5)
  // A finer second octave breaks the soft look at close range (grain); it is
  // centred and distance-faded so far walls keep the mean brightness without
  // the sub-pixel noise (TRAA trembling).
  const fade = detailFade(14, 40)
  const fine = mx_fractal_noise_float(p.mul(4.0), 2).mul(0.5).add(0.5)
  let col = mix(color(opts.base), color(opts.alt), n.clamp(0, 1))
  col = col.mul(fine.sub(0.5).mul(0.24).mul(fade).add(1.0))
  if (opts.weathered) {
    // Base course: the lowest ~0.6 units darken toward the ground (splash
    // zone), and faint vertical streaks run down the walls (weather run-off).
    const base = smoothstep(float(0.7), float(0.05), positionWorld.y)
    const streaks = mx_fractal_noise_float(positionWorld.mul(vec3(2.2, 0.25, 2.2)), 3)
      .mul(0.5)
      .add(0.5)
    col = col.mul(base.mul(-0.18).add(1))
    col = col.mul(streaks.mul(0.12).add(0.94))
  }
  m.colorNode = col
  // Micro-relief from the same field, weighted toward the fine grain: the
  // bump strength works on screen-space derivatives, so the high-frequency
  // octave carries the visible structure at eye height.
  const height = n.mul(0.35).add(fine.mul(0.65))
  m.normalNode = proceduralBump(height, float(opts.bump ?? 1.2).mul(fade))
  return m
}

export interface GroundPathOptions {
  /** Grayscale mask texture: white where a trodden path runs. */
  mask: THREE.Texture
  /** Path color mixed in where the mask is white. */
  color: string
  /** Half-extent of the place in world units the mask spans (±extent). */
  extent: number
}

/**
 * Ground material: large noise patches, Worley cell mottling and a fine sandy
 * grain, e.g. for trampled sand or dry village earth. The relief is real:
 * ripples, grain and pebble cells perturb the normal, and trodden paths are
 * SMOOTHER than the surrounding ground (worn flat) rather than a painted
 * stripe. An optional path mask blends the street/path network into the
 * ground (design.md §2 lively settlements).
 */
export function createGroundMaterial(
  base: string,
  alt: string,
  patch: string,
  paths?: GroundPathOptions,
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.roughness = 1
  m.metalness = 0
  const p = positionWorld.xz
  const large = mx_fractal_noise_float(vec3(p.mul(0.08), 2.0), 4).mul(0.5).add(0.5)
  const micro = mx_fractal_noise_float(vec3(p.mul(1.1), 5.0), 3).mul(0.5).add(0.5)
  const grain = mx_fractal_noise_float(vec3(p.mul(4.2), 7.0), 2).mul(0.5).add(0.5)
  const cells = mx_worley_noise_float(vec3(p.mul(0.22), 9.0))
  const pebbles = mx_worley_noise_float(vec3(p.mul(1.6), 11.0))
  let col = mix(color(base), color(alt), large.clamp(0, 1))
  col = mix(col, color(patch), cells.oneMinus().pow(3).mul(0.5))
  // Scattered pebbles/clods read as small dark specks at eye height (the
  // distance-faded speck term joins the colorNode below).
  const pathMask = (() => {
    if (!paths) return float(0)
    // Mask canvas maps the square ±extent around the place origin.
    const uvNode = vec2(
      p.x.add(paths.extent).div(paths.extent * 2),
      p.y.add(paths.extent).div(paths.extent * 2),
    )
    const mask = texture(paths.mask, uvNode).r
    // Ragged path edges via noise so the lanes look trodden, not painted.
    return mask
      .mul(mx_fractal_noise_float(vec3(p.mul(0.8), 3.0), 3).mul(0.28).add(0.86))
      .clamp(0, 1)
  })()
  if (paths) col = mix(col, color(paths.color), pathMask.mul(float(0.95)))
  // The fine grain and pebble specks are centred and distance-faded: they are
  // sub-pixel past ~50 units, where the TRAA jitter made the ground tremble.
  const fade = detailFade(16, 48)
  m.colorNode = col
    .mul(micro.mul(0.25).add(0.87))
    .mul(grain.sub(0.5).mul(0.2).mul(fade).add(1.0))
    .mul(pebbles.oneMinus().pow(6).mul(-0.22).mul(fade).add(1))
  // Real micro-relief: soft ripples + sandy grain + pebble bumps; trodden
  // paths are worn flat (bump fades where the mask is strong).
  const height = micro.mul(0.3).add(grain.mul(0.45)).add(pebbles.oneMinus().pow(4).mul(0.6))
  m.normalNode = proceduralBump(height, pathMask.oneMinus().mul(3.4).add(0.6).mul(fade))
  return m
}
