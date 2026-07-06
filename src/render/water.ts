// Animated ocean/river water surface as a TSL node material: gentle vertex
// swell, moving color noise and sparkling sun glints. World-anchored via a
// uniform offset so the plane can follow the player without the pattern
// swimming along.

import * as THREE from 'three/webgpu'
import {
  color,
  float,
  mix,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  positionLocal,
  pow,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl'

export interface WaterMaterialHandle {
  material: THREE.MeshStandardNodeMaterial
  /** World-space XZ position of the plane center; update when the plane moves. */
  offset: { value: THREE.Vector2 }
}

export function createWaterMaterial(): WaterMaterialHandle {
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.opacity = 0.88
  m.roughness = 0.12
  m.metalness = 0.05

  const offset = uniform(new THREE.Vector2(0, 0))

  // Plane geometry lies in local XY (rotated flat), so local XY + offset is
  // the world XZ position of the vertex.
  const wp = positionLocal.xy.add(offset)

  // Gentle swell along the local Z axis (world up after rotation). The
  // MaterialX noise is signed, so this stays centered on sea level.
  const swell = mx_fractal_noise_float(vec3(wp.mul(0.045), time.mul(0.09)), 3).mul(0.32)
  m.positionNode = positionLocal.add(vec3(0, 0, swell))

  // Base color: large-scale depth variation plus finer moving ripple bands.
  const deep = color('#0e3a5e')
  const mid = color('#1c5c86')
  const light = color('#3a86ad')
  const large = mx_fractal_noise_float(vec3(wp.mul(0.025), time.mul(0.03)), 3).mul(0.5).add(0.5)
  const ripple = mx_fractal_noise_float(
    vec3(wp.x.mul(0.22).add(time.mul(0.12)), wp.y.mul(0.22), time.mul(0.07)),
    3,
  )
    .mul(0.5)
    .add(0.5)
  let col = mix(deep, mid, smoothstep(float(0.3), float(0.7), large))
  col = mix(col, light, smoothstep(float(0.6), float(0.95), ripple).mul(0.3))

  // Sparse, small moving glints from a tight Worley cell pattern.
  const w = mx_worley_noise_float(vec3(wp.mul(1.7), time.mul(0.3)))
  const sparkle = pow(smoothstep(float(0.85), float(1.0), w.oneMinus()), float(6)).mul(0.2)
  col = col.add(vec3(sparkle, sparkle, sparkle))

  m.colorNode = col
  return { material: m, offset: offset as unknown as { value: THREE.Vector2 } }
}
