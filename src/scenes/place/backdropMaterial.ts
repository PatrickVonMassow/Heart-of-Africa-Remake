// Surroundings-panorama backdrop material (design.md §2.5, CLAUDE.md §7.1
// pt. 11). Extracted from PlaceScene so the smooth-shading contract is
// unit-testable (backdrop.test.ts): the backdrop mountains must shade as a
// continuous ridge from the heightfield's interpolated vertex normals —
// never hard per-face facets.
import * as THREE from 'three/webgpu'
import {
  attribute,
  cameraPosition,
  cameraViewMatrix,
  color,
  float,
  max,
  mix,
  mx_noise_float,
  normalWorldGeometry,
  positionLocal,
  positionWorld,
  screenSize,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { balance } from '../../config/balance'
import {
  detailFade,
  groundOpenColor,
  groundOpenNormal,
  groundOpenRoughness,
  proceduralBump,
  type GroundSurface,
} from '../../render/materials'
import { WATER_METALNESS, riverWaterSurface } from '../../render/waterAppearance'
import { BACKDROP_RIVER_Y } from './backdropRiver'

/** How far (place units) the heightfield may leave the river plane before the
 *  water's fine octave is gone from it. */
const FINE_OFF_PLANE = 0.08

/** Base frequency (cycles per place unit, per axis) of the rock fractal's
 *  lowest octave; each further octave doubles it. */
const ROCK_FREQ = [0.16, 0.28, 0.16] as const
/** Octaves of the rock fractal; the first one is the banding and fades last. */
const ROCK_OCTAVES = 4

/**
 * Weight of one rock octave by how many of its cycles one screen pixel spans:
 * 1 while it resolves, 0 once it would alias (point 1532). The shader computes
 * the same smoothstep; this mirror is what the unit test reads.
 */
export function rockOctaveWeight(
  octave: number,
  cyclesPerPx: number,
  start = balance.backdropRock.fadeStartCyclesPerPx,
  end = balance.backdropRock.fadeEndCyclesPerPx,
): number {
  // The banding octave stays wherever a pixel resolves it and only goes
  // past Nyquist, as on the grazing flat foreland.
  const [a, b] = octave === 0 ? [end, 2 * end] : [start, end]
  const t = Math.min(1, Math.max(0, (cyclesPerPx - a) / (b - a)))
  return 1 - t * t * (3 - 2 * t)
}

/** Flattest view cosine the footprint estimate follows; it only guards the
 *  division, so a grazing foreland still fades its banding (review of 1532). */
const MIN_VIEW_COS = 0.005
/** Base frequency (cycles per place unit) of the fine grain's lowest octave. */
const FINE_FREQ = 0.65
/** Octaves of the fine grain; all of them fade, the first one included. */
const FINE_OCTAVES = 3

/**
 * Cycles of a noise octave one pixel spans: the pixel's footprint (distance
 * times pixel angle, stretched by the grazing angle) times the octave's
 * frequency vector length. Derivative-free on purpose: fwidth is constant per
 * triangle and moves with the TRAA jitter, so weights built on it stepped at
 * facet edges and flickered (point 1532). The shader mirrors it.
 */
export function noiseCyclesPerPx(freqLength: number, distance: number, viewCos: number, projY: number, heightPx: number): number {
  const pixelAngle = 2 / (projY * heightPx)
  return (freqLength * distance * pixelAngle) / Math.max(Math.abs(viewCos), MIN_VIEW_COS)
}

/** {@link noiseCyclesPerPx} for the rock fractal's lowest octave. */
export function rockCyclesPerPx(distance: number, viewCos: number, projY: number, heightPx: number): number {
  return noiseCyclesPerPx(Math.hypot(...ROCK_FREQ), distance, viewCos, projY, heightPx)
}

/**
 * A fractal noise with its octaves faded by screen frequency, mapped to 0..1
 * (0.5 where every octave has faded). At full weight it is the fBm it
 * replaces; a faded octave drops out of colour and bump alike. The backlit
 * terminator turns every sub-pixel bump slope into a light/dark flip, so the
 * bump height may carry nothing a pixel cannot resolve (point 1532).
 */
function screenFadedFbm(p: typeof positionWorld, freq: readonly [number, number, number], octaves: number, keepFirst: boolean) {
  // Lowest octave's cycles per pixel; octave i spans 2^i times as many.
  // Geometry normal, not normalView: the bump normal is itself built on this.
  const toEye = cameraPosition.sub(p)
  const viewCos = max(normalWorldGeometry.dot(toEye.normalize()).abs(), float(MIN_VIEW_COS))
  // Projection [1][1] = 1 / tan(fovY / 2), read from the rendering camera.
  const focalY = uniform(1).onRenderUpdate(({ camera }) => camera?.projectionMatrix.elements[5] ?? 1)
  const pixelAngle = float(2).div(focalY.mul(screenSize.y))
  const cpp0 = float(Math.hypot(...freq)).mul(toEye.length()).mul(pixelAngle).div(viewCos)
  // Read from balance every render, so a debug edit takes effect live.
  const start = uniform(0).onRenderUpdate(() => balance.backdropRock.fadeStartCyclesPerPx)
  const end = uniform(1).onRenderUpdate(() => balance.backdropRock.fadeEndCyclesPerPx)
  const pf = p.mul(vec3(...freq))
  let sum: THREE.Node<'float'> = float(0)
  for (let i = 0; i < octaves; i++) {
    const scale = 2 ** i
    const noise = mx_noise_float(pf.mul(scale)).mul(0.5 ** i)
    // A kept first octave (the banding) fades one octave later, past Nyquist.
    const [a, b] = i === 0 && keepFirst ? [end, end.mul(2)] : [start, end]
    // Ordered smoothstep edges (GLSL ES leaves reversed ones undefined).
    const weight = smoothstep(a, b, cpp0.mul(scale)).oneMinus()
    sum = sum.add(noise.mul(weight))
  }
  return sum.mul(0.5).add(0.5)
}

/**
 * Smooth vertex normals for the backdrop annulus (ring-major, `segs` per ring),
 * computed as if ring 0 lay level with ring 1 (point 428). The tucked rim drops
 * BACKDROP_RIM_DROP over the disc overhang — a 45° strip hidden under the plate
 * — and averaged into the disc-edge ring it tilted that ring's normal toward
 * the centre, so the backdrop's first visible strip took the sun at another
 * angle than the flat disc beside it. Positions are restored unchanged.
 */
export function computeBackdropNormals(geo: THREE.BufferGeometry, segs: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const tucked = new Float32Array(segs)
  for (let si = 0; si < segs; si++) {
    tucked[si] = pos.getY(si)
    pos.setY(si, pos.getY(segs + si))
  }
  geo.computeVertexNormals()
  for (let si = 0; si < segs; si++) pos.setY(si, tucked[si])
  pos.needsUpdate = true
}

/** The backdrop material and the handles the scene keeps writing to. */
interface BackdropMaterialHandle {
  material: THREE.MeshStandardNodeMaterial
  /** The settlement river's bank frame — (downstream x, z, outward x, z) — so
   *  the panorama's water can be measured in the SAME metres along and across
   *  the current that the drawn surface at the bank uses. */
  flow: { value: THREE.Vector4 }
  /** Distance from the place centre to the waterline, in place units. */
  waterline: { value: number }
}

/**
 * Rock-shaded relief material for the backdrop heightfield mesh.
 * Double-sided so steep far slopes never show as black backface overhangs.
 * The relief itself is shaded (design.md §2.5/§7.1 pt. 11): rocky fBm
 * structure over the biome vertex colors, steeper faces darkening toward
 * bare rock, and a bump normal so ridges catch the light — the flat
 * vertex-color wash read soft and detail-less behind the settlement.
 *
 * WATER IS NOT ROCK (work-order 525). Where the `waterMask` attribute marks a
 * vertex as river or lake, the surface drops the rock treatment entirely and
 * takes the ONE water appearance of `render/waterAppearance.ts` — the same
 * source the drawn surface at the bank reads, resolved by the distance it
 * stands at. Its normal is flattened to world up as well, because water lies
 * flat: the heightfield's own slope would otherwise light the tucked inner rim,
 * where it climbs back to the ground plane, as a bright band straight across
 * the picture at the plate's edge.
 *
 * @param waterOctaves fractal octaves of the shared water detail field (the
 *   `waterDetailOctaves` quality lever).
 */
export function createBackdropMaterial(waterOctaves: number, ground: GroundSurface): BackdropMaterialHandle {
  const m = new THREE.MeshStandardNodeMaterial()
  // Biome vertex colours, multiplied in BELOW rather than by three's automatic
  // vertex-colour factor, so the water and the seam can carry exact colours of
  // their own (they used to divide that factor back out, clamped).
  m.vertexColors = false
  m.roughness = 0.95
  m.metalness = 0
  m.side = THREE.DoubleSide
  // Smooth shading (user-reported hard facets on the Cairo dunes): the mesh
  // computes vertex normals and proceduralBump perturbs the interpolated
  // normalView, so flatShading must stay off for the ridge to read smooth.
  m.flatShading = false
  const p = positionWorld
  const rock = screenFadedFbm(p, ROCK_FREQ, ROCK_OCTAVES, true)
  const fine = screenFadedFbm(p, [FINE_FREQ, FINE_FREQ, FINE_FREQ], FINE_OCTAVES, false)
  // Steepness from the mesh normal: flat ground keeps its biome color,
  // steeper faces mix toward a bare rock tone with banded structure.
  // The walkable ground's own share (point 428): 1 on the disc edge, easing to
  // 0 across `balance.backdropSeam.blendWidth` (backdropSeamWeight). There the
  // backdrop takes the disc's albedo, normal and roughness — the SAME nodes —
  // and none of its own rock terms, so the two read as one ground.
  const seam = float(attribute('seam', 'float') as never).clamp(0, 1)
  const steep = smoothstep(float(0.95), float(0.55), normalWorldGeometry.y).mul(seam.oneMinus())
  const biome = attribute('color', 'vec3') as unknown as ReturnType<typeof vec3>
  const col = mix(biome, color('#8d7f6a').mul(rock.mul(0.5).add(0.7)), steep.mul(0.75)) as typeof biome
  // The fine octave and the bump are distance-faded: past ~200 units they
  // are sub-pixel and only fed the TRAA trembling (the low-frequency rock
  // banding carries the far silhouette structure on its own). Both noises also
  // fade their octaves by screen frequency inside screenFadedFbm.
  const fade = detailFade(70, 200)
  // The biome factor three used to apply through `vertexColors` (see above).
  const relief = col.mul(rock.mul(0.22).add(0.89)).mul(fine.sub(0.5).mul(0.12).mul(fade).add(1.0)).mul(biome)
  const land = mix(relief, groundOpenColor(ground) as unknown as typeof relief, seam)

  // The river the settlement stands on, carried on out to the horizon.
  const flow = uniform(new THREE.Vector4(0, 1, 1, 0))
  const waterline = uniform(0)
  const mask = float(attribute('waterMask', 'float') as never).clamp(0, 1)
  const water = riverWaterSurface({
    along: p.x.mul(flow.x).add(p.z.mul(flow.y)),
    across: p.x.mul(flow.z).add(p.z.mul(flow.w)).sub(waterline),
    octaves: waterOctaves,
    // The fine grain only where the heightfield lies ON the river plane; it
    // fades out within a few cm of leaving it, so the tucked inner rim (which
    // dips to meet the ground disc) never carries it. Height interpolates
    // linearly over each facet, so the fade has no edge of its own.
    // (Ordered smoothstep edges: GLSL ES leaves reversed ones undefined.)
    fineWeight: smoothstep(float(0), float(FINE_OFF_PLANE), positionLocal.y.sub(BACKDROP_RIVER_Y).abs()).oneMinus(),
  })

  // The water is NOT tinted by the biome tone under it — it is the same water
  // as the surface drawn at the bank.
  m.colorNode = mix(land, water.color, mask)
  m.roughnessNode = mix(mix(float(0.95), groundOpenRoughness(), seam), water.roughness, mask)
  m.metalnessNode = mask.mul(WATER_METALNESS)
  // World up in view space, which is the space proceduralBump returns.
  const flat = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize()
  const rockNormal = proceduralBump(rock.mul(0.7).add(fine.mul(0.3)), float(2.6).mul(fade))
  m.normalNode = mix(mix(rockNormal, groundOpenNormal(ground), seam), flat, mask).normalize()
  // The shared terms, for the seam test (backdrop.test.ts).
  m.userData.seamGround = ground
  return {
    material: m,
    flow: flow as unknown as { value: THREE.Vector4 },
    waterline: waterline as unknown as { value: number },
  }
}
