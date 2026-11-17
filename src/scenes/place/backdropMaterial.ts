// Surroundings-panorama backdrop material (design.md §2.5, CLAUDE.md §7.1
// pt. 11). Extracted from PlaceScene so the smooth-shading contract is
// unit-testable (backdrop.test.ts): the backdrop mountains must shade as a
// continuous ridge from the heightfield's interpolated vertex normals —
// never hard per-face facets.
import * as THREE from 'three/webgpu'
import {
  attribute,
  cameraViewMatrix,
  color,
  float,
  fwidth,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalWorldGeometry,
  positionLocal,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { balance } from '../../config/balance'
import { detailFade, proceduralBump } from '../../render/materials'
import { WATER_METALNESS, riverWaterSurface } from '../../render/waterAppearance'
import { BACKDROP_RIVER_Y } from './backdropRiver'

/** How far (place units) the heightfield may leave the river plane before the
 *  water's fine octave is gone from it. */
const FINE_OFF_PLANE = 0.08

/** Base frequency (cycles per place unit, per axis) of the rock fractal's
 *  lowest octave; each further octave doubles it. */
const ROCK_FREQ = [0.16, 0.28, 0.16] as const
/** Octaves of the rock fractal; the first one is the banding and never fades. */
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
  if (octave === 0) return 1
  const t = Math.min(1, Math.max(0, (cyclesPerPx - start) / (end - start)))
  return 1 - t * t * (3 - 2 * t)
}

/**
 * The rock fractal with its upper octaves faded by screen frequency. At full
 * weight it is the 4-octave fBm it replaces, mapped to 0..1; a faded octave
 * drops out of colour and bump alike, so the dark backlit far flanks keep only
 * the banding they can resolve instead of streaks TRAA trembles with.
 */
function screenFadedRock(p: typeof positionWorld) {
  const freq = vec3(...ROCK_FREQ)
  // Lowest octave's cycles per pixel; octave i spans 2^i times as many.
  const cpp0 = fwidth(p).mul(freq).length()
  const start = float(balance.backdropRock.fadeStartCyclesPerPx)
  const end = float(balance.backdropRock.fadeEndCyclesPerPx)
  let sum = mx_noise_float(p.mul(freq))
  for (let i = 1; i < ROCK_OCTAVES; i++) {
    const scale = 2 ** i
    // Ordered smoothstep edges (GLSL ES leaves reversed ones undefined).
    const weight = smoothstep(start, end, cpp0.mul(scale)).oneMinus()
    sum = sum.add(mx_noise_float(p.mul(freq).mul(scale)).mul(weight.mul(0.5 ** i)))
  }
  return sum.mul(0.5).add(0.5)
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
export function createBackdropMaterial(waterOctaves: number): BackdropMaterialHandle {
  const m = new THREE.MeshStandardNodeMaterial()
  m.vertexColors = true
  m.roughness = 0.95
  m.metalness = 0
  m.side = THREE.DoubleSide
  // Smooth shading (user-reported hard facets on the Cairo dunes): the mesh
  // computes vertex normals and proceduralBump perturbs the interpolated
  // normalView, so flatShading must stay off for the ridge to read smooth.
  m.flatShading = false
  const p = positionWorld
  const rock = screenFadedRock(p)
  const fine = mx_fractal_noise_float(p.mul(0.65), 3).mul(0.5).add(0.5)
  // Steepness from the mesh normal: flat ground keeps its biome color,
  // steeper faces mix toward a bare rock tone with banded structure.
  const steep = smoothstep(float(0.95), float(0.55), normalWorldGeometry.y)
  const biome = attribute('color', 'vec3') as unknown as ReturnType<typeof vec3>
  let col = mix(biome, color('#8d7f6a').mul(rock.mul(0.5).add(0.7)), steep.mul(0.75)) as typeof biome
  // The fine octave and the bump are distance-faded: past ~200 units they
  // are sub-pixel and only fed the TRAA trembling (the low-frequency rock
  // banding carries the far silhouette structure on its own). The rock's own
  // upper octaves fade by screen frequency inside screenFadedRock.
  const fade = detailFade(70, 200)
  const land = col.mul(rock.mul(0.22).add(0.89)).mul(fine.sub(0.5).mul(0.12).mul(fade).add(1.0))

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

  // three multiplies the geometry's vertex colour into every colorNode while
  // `vertexColors` is on (NodeMaterial.setupDiffuseColor), and the relief above
  // is built on that. The water must NOT be tinted by the biome tone under it —
  // it is the same water as the surface drawn at the bank — so its branch
  // divides that automatic factor back out. The floor only guards the division;
  // no water vertex of the terrain comes near it.
  const untinted = water.color.div(max(biome, vec3(0.06)))
  m.colorNode = mix(land, untinted, mask)
  m.roughnessNode = mix(float(0.95), water.roughness, mask)
  m.metalnessNode = mask.mul(WATER_METALNESS)
  // World up in view space, which is the space proceduralBump returns.
  const flat = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize()
  m.normalNode = mix(proceduralBump(rock.mul(0.7).add(fine.mul(0.3)), float(2.6).mul(fade)), flat, mask).normalize()
  return {
    material: m,
    flow: flow as unknown as { value: THREE.Vector4 },
    waterline: waterline as unknown as { value: number },
  }
}
