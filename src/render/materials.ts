// Shared TSL node materials for the settlement surfaces. The micro-structure
// (colour grain and normal relief) comes from BAKED tileable textures
// (scripts/generate-surface-textures.mjs, design.md §2.6): loaded with
// mipmaps + anisotropy, the GPU mip chain band-limits the detail
// automatically — near surfaces stay sharp at millimetre grain, far surfaces
// calm down without the hand-tuned distance fades the procedural fields
// needed (the fades remain only for the few still-procedural materials).
// World-space triplanar mapping keeps every mesh seamless without UV work,
// and blending two texture scales by a low-frequency mask hides the tiling
// repetition.

import * as THREE from 'three/webgpu'
import { seasonTintNode } from './seasonTint'
import {
  cameraViewMatrix,
  color,
  dFdx,
  dFdy,
  faceDirection,
  float,
  mix,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  normalView,
  normalWorld,
  positionView,
  positionWorld,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
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
 * so far surfaces fall back to their flat base color/normal. (The baked
 * settlement textures need none of this: their mip chain band-limits.)
 */
export function detailFade(near: number, far: number) {
  return smoothstep(float(far), float(near), positionView.z.negate())
}

// --- Baked surface textures ------------------------------------------------------

/** Baked settlement-surface kinds (scripts/generate-surface-textures.mjs). */
export type SurfaceKind = 'plaster' | 'mud' | 'thatch' | 'wood' | 'ground'

/** World-space tile size in metres per surface kind (512 px per tile). */
const SURFACE_TILE: Record<SurfaceKind, number> = {
  plaster: 1.4,
  mud: 1.6,
  thatch: 1.1,
  wood: 0.9,
  ground: 2.4,
}

const surfaceTexCache = new Map<string, THREE.Texture>()

/**
 * Loads a baked surface map with repeat wrapping, mipmaps and anisotropy —
 * the mip/anisotropy setup is what makes the relief distance-stable. The
 * albedo is a mid-gray structure map multiplied onto the region tint, so it
 * stays linear (NoColorSpace) like the normal map. Under Vitest (jsdom, no
 * image decode) a bare Texture with the same sampler state stands in.
 */
export function loadSurfaceTexture(name: string): THREE.Texture {
  const cached = surfaceTexCache.get(name)
  if (cached) return cached
  const t =
    import.meta.env.MODE === 'test'
      ? new THREE.Texture()
      : new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}tex/${name}.png`)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 8
  surfaceTexCache.set(name, t)
  return t
}

/** Triplanar blend weights from the world normal (sharpened, sum = 1). */
function triplanarWeights() {
  const bw = normalWorld.abs().pow(3)
  return bw.div(bw.x.add(bw.y).add(bw.z))
}

// Projections use pos.zy / pos.xz / pos.xy (Ben Golus's convention): both
// side projections keep texture v along world Y, so anisotropic maps
// (thatch strands, wood grain) run vertically on every wall face.

// The freq/strength/uv parameters are TSL float/vec nodes; the published
// node typings are narrower than the runtime (same gap proceduralBump
// bridges), so they pass as `unknown` with local casts.

/** Triplanar albedo sample in world space. */
function triplanarColor(tex: THREE.Texture, freq: unknown) {
  const p = positionWorld.mul(freq as never)
  const w = triplanarWeights()
  return texture(tex, p.zy)
    .mul(w.x)
    .add(texture(tex, p.xz).mul(w.y))
    .add(texture(tex, p.xy).mul(w.z))
}

/**
 * Triplanar tangent-space normal map applied to the world normal ("whiteout"
 * blend). `strength` scales the tangent-space xy deflection (0 = flat, e.g.
 * worn paths). Returns a world-space normal.
 */
function triplanarNormal(tex: THREE.Texture, freq: unknown, strength: unknown) {
  const p = positionWorld.mul(freq as never)
  const w = triplanarWeights()
  const unpack = (uv: unknown) => {
    const t = texture(tex, uv as never).xyz.mul(2).sub(1)
    return vec3(t.x.mul(strength as never) as never, t.y.mul(strength as never) as never, t.z as never)
  }
  const tnx = unpack(p.zy)
  const tny = unpack(p.xz)
  const tnz = unpack(p.xy)
  const wn = normalWorld
  const nx = vec3(tnx.x.add(wn.z) as never, tnx.y.add(wn.y) as never, tnx.z.abs().mul(wn.x) as never)
  const ny = vec3(tny.x.add(wn.x) as never, tny.y.add(wn.z) as never, tny.z.abs().mul(wn.y) as never)
  const nz = vec3(tnz.x.add(wn.x) as never, tnz.y.add(wn.y) as never, tnz.z.abs().mul(wn.z) as never)
  return nx.zyx.mul(w.x).add(ny.xzy.mul(w.y)).add(nz.xyz.mul(w.z)).normalize()
}

/** Low-frequency 0..1 mask that switches between the two texture scales. */
function tileBreakMask() {
  return smoothstep(
    float(0.3),
    float(0.7),
    mx_fractal_noise_float(positionWorld.mul(0.17), 2).mul(0.5).add(0.5),
  )
}

/** Structure factor (~1.0 mean): baked albedo at two scales, mask-blended. */
function surfaceStructure(kind: SurfaceKind) {
  const aTex = loadSurfaceTexture(`${kind}_a`)
  const f1 = float(1 / SURFACE_TILE[kind])
  const f2 = f1.mul(0.353)
  return mix(triplanarColor(aTex, f1), triplanarColor(aTex, f2), tileBreakMask()).rgb.mul(2.0)
}

/** Baked normal at two scales, mask-blended in world space, view-space out. */
function surfaceNormal(kind: SurfaceKind, strength: unknown) {
  const nTex = loadSurfaceTexture(`${kind}_n`)
  const f1 = float(1 / SURFACE_TILE[kind])
  const f2 = f1.mul(0.353)
  const blended = mix(
    triplanarNormal(nTex, f1, strength),
    triplanarNormal(nTex, f2, strength),
    tileBreakMask(),
  ).normalize()
  // The blend runs in WORLD space, so view space is one camera rotation away.
  // (transformNormalToView is wrong here: it expects an OBJECT-space normal
  // and would apply each mesh's model rotation a second time — rotated
  // buildings and the tilted ground disc rendered with broken lighting.)
  return cameraViewMatrix.mul(vec4(blended, 0)).xyz.normalize()
}

export interface SurfaceMaterialOptions {
  base: string
  alt: string
  roughness?: number
  /** Scales the normal map's tangent deflection (1 = as baked). */
  bump?: number
  /** Weathering: darkened base course and faint vertical run-off streaks. */
  weathered?: boolean
}

/**
 * Settlement wall/roof material from the baked maps: the region tint (base→
 * alt by low-frequency world noise) multiplied with the baked structure
 * albedo, and the baked normal map as micro-relief. Low-frequency parts
 * (tint mix, weathering) stay procedural — they cannot tremble under TRAA.
 */
export function createSurfaceMaterial(
  kind: Exclude<SurfaceKind, 'ground'>,
  opts: SurfaceMaterialOptions,
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.roughness = opts.roughness ?? 0.95
  m.metalness = 0
  const tone = mx_fractal_noise_float(positionWorld.mul(0.5), 3).mul(0.5).add(0.5)
  let col = mix(color(opts.base), color(opts.alt), tone.clamp(0, 1)).mul(surfaceStructure(kind))
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
  m.normalNode = surfaceNormal(kind, float(opts.bump ?? 1))
  return m
}

export interface NoisyMaterialOptions {
  base: string
  alt: string
  /** Noise frequency per world unit; a vec3 allows anisotropy (e.g. cloth). */
  scale: number | [number, number, number]
  roughness?: number
  octaves?: number
  /** Strength of the micro-relief bump derived from the same noise field. */
  bump?: number
  /** Weathering: darkened base course and faint vertical run-off streaks. */
  weathered?: boolean
}

/** Standard material whose color blends base→alt by world-space fBm noise,
 *  with the same field driving a micro-relief bump. Still fully procedural —
 *  for the materials without a baked map (e.g. cloth); the distance fade
 *  keeps its high-frequency grain from trembling under TRAA. */
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
 * Ground material: region tint and large Worley patch mottling over the baked
 * earth structure (grain, pebbles — relief from the baked normal map, so it
 * stays distance-stable under the mip chain). Trodden paths from the optional
 * mask are SMOOTHER than the surrounding ground (worn flat) rather than a
 * painted stripe (design.md §2 lively settlements).
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
  // Worley noise returns a cell DISTANCE that can exceed 1, so clamp it before
  // `oneMinus().pow(3)`: without the clamp a value > 1 makes the base negative,
  // and pow(negative, 3) is NaN on WGSL/WebGPU (pow = exp(y·log(x)), log of a
  // negative = NaN) — the NaN propagated to a flat-black ground patch that the
  // WebGL 2 path never showed (point 111).
  const cells = mx_worley_noise_float(vec3(p.mul(0.22), 9.0)).clamp(0, 1)
  let col = mix(color(base), color(alt), large.clamp(0, 1))
  col = mix(col, color(patch), cells.oneMinus().pow(3).mul(0.5))
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
  // The settlement ground follows the season like the travel terrain does
  // (design.md §19.13, point 143): the tint bleaches any greenish earth toward
  // straw in the dry season and deepens it in the rains, and leaves bare sand
  // and trodden paths alone (its greenness mask). createGroundMaterial is
  // settlement-only, so this never double-tints the travel scene.
  m.colorNode = seasonTintNode(col).mul(surfaceStructure('ground'))
  // Baked micro-relief; trodden paths are worn flat (the tangent deflection
  // fades where the mask is strong).
  m.normalNode = surfaceNormal('ground', pathMask.oneMinus().mul(0.85).add(0.15))
  return m
}
