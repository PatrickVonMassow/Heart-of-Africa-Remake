// Surroundings-panorama backdrop material (design.md §2.5, CLAUDE.md §7.1
// pt. 15). Extracted from PlaceScene so the smooth-shading contract is
// unit-testable (backdrop.test.ts): the backdrop mountains must shade as a
// continuous ridge from the heightfield's interpolated vertex normals —
// never hard per-face facets.
import * as THREE from 'three/webgpu'
import {
  attribute,
  cameraViewMatrix,
  color,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  normalWorldGeometry,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { detailFade, proceduralBump } from '../../render/materials'
import { WATER_METALNESS, riverWaterSurface } from '../../render/waterAppearance'

/** The backdrop material and the handles the scene keeps writing to. */
export interface BackdropMaterialHandle {
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
  const rock = mx_fractal_noise_float(p.mul(vec3(0.16, 0.28, 0.16)), 4).mul(0.5).add(0.5)
  const fine = mx_fractal_noise_float(p.mul(0.65), 3).mul(0.5).add(0.5)
  // Steepness from the mesh normal: flat ground keeps its biome color,
  // steeper faces mix toward a bare rock tone with banded structure.
  const steep = smoothstep(float(0.95), float(0.55), normalWorldGeometry.y)
  const biome = attribute('color', 'vec3') as unknown as ReturnType<typeof vec3>
  let col = mix(biome, color('#8d7f6a').mul(rock.mul(0.5).add(0.7)), steep.mul(0.75)) as typeof biome
  // The fine octave and the bump are distance-faded: past ~200 units they
  // are sub-pixel and only fed the TRAA trembling (the low-frequency rock
  // banding carries the far silhouette structure on its own).
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
