// Shared TSL node materials for surfaces that need procedural texture
// (plaster, mud, thatch, ground). World-space noise keeps them seamless
// across separately placed meshes without any UV work.

import * as THREE from 'three/webgpu'
import { color, float, mix, mx_fractal_noise_float, mx_worley_noise_float, positionWorld, texture, vec2, vec3 } from 'three/tsl'

export interface NoisyMaterialOptions {
  base: string
  alt: string
  /** Noise frequency per world unit; a vec3 allows anisotropy (e.g. thatch). */
  scale: number | [number, number, number]
  roughness?: number
  octaves?: number
}

/** Standard material whose color blends base→alt by world-space fBm noise. */
export function createNoisyMaterial(opts: NoisyMaterialOptions): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.roughness = opts.roughness ?? 0.95
  m.metalness = 0
  const s = typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : opts.scale
  const p = positionWorld.mul(vec3(...s))
  const n = mx_fractal_noise_float(p, opts.octaves ?? 4).mul(0.5).add(0.5)
  m.colorNode = mix(color(opts.base), color(opts.alt), n.clamp(0, 1))
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
 * Ground material: large noise patches plus Worley cell mottling, e.g. for
 * trampled sand or dry village earth. An optional path mask blends a street/
 * path network into the ground (design.md §2 lively settlements).
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
  const cells = mx_worley_noise_float(vec3(p.mul(0.22), 9.0))
  let col = mix(color(base), color(alt), large.clamp(0, 1))
  col = mix(col, color(patch), cells.oneMinus().pow(3).mul(0.5))
  if (paths) {
    // Mask canvas maps the square ±extent around the place origin.
    const uvNode = vec2(
      p.x.add(paths.extent).div(paths.extent * 2),
      p.y.add(paths.extent).div(paths.extent * 2),
    )
    const mask = texture(paths.mask, uvNode).r
    // Ragged path edges via noise so the lanes look trodden, not painted.
    const ragged = mask.mul(mx_fractal_noise_float(vec3(p.mul(0.8), 3.0), 3).mul(0.28).add(0.86))
    col = mix(col, color(paths.color), ragged.clamp(0, 1).mul(float(0.95)))
  }
  m.colorNode = col.mul(micro.mul(0.25).add(0.87))
  return m
}
