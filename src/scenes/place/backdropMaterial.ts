// Surroundings-panorama backdrop material (design.md §2.5, CLAUDE.md §7.1
// pt. 15). Extracted from PlaceScene so the smooth-shading contract is
// unit-testable (backdrop.test.ts): the backdrop mountains must shade as a
// continuous ridge from the heightfield's interpolated vertex normals —
// never hard per-face facets.
import * as THREE from 'three/webgpu'
import {
  attribute,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  normalWorldGeometry,
  positionWorld,
  smoothstep,
  vec3,
} from 'three/tsl'
import { detailFade, proceduralBump } from '../../render/materials'

/**
 * Rock-shaded relief material for the backdrop heightfield mesh.
 * Double-sided so steep far slopes never show as black backface overhangs.
 * The relief itself is shaded (design.md §2.5/§7.1 pt. 11): rocky fBm
 * structure over the biome vertex colors, steeper faces darkening toward
 * bare rock, and a bump normal so ridges catch the light — the flat
 * vertex-color wash read soft and detail-less behind the settlement.
 */
export function createBackdropMaterial(): THREE.MeshStandardNodeMaterial {
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
  let col = attribute('color', 'vec3') as unknown as ReturnType<typeof vec3>
  col = mix(col, color('#8d7f6a').mul(rock.mul(0.5).add(0.7)), steep.mul(0.75)) as typeof col
  // The fine octave and the bump are distance-faded: past ~200 units they
  // are sub-pixel and only fed the TRAA trembling (the low-frequency rock
  // banding carries the far silhouette structure on its own).
  const fade = detailFade(70, 200)
  m.colorNode = col.mul(rock.mul(0.22).add(0.89)).mul(fine.sub(0.5).mul(0.12).mul(fade).add(1.0))
  m.normalNode = proceduralBump(rock.mul(0.7).add(fine.mul(0.3)), float(2.6).mul(fade))
  return m
}
