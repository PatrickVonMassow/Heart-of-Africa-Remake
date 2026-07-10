// Ocean water surface (design.md §2 "Licht- und Post-Processing-
// Pipeline"); rivers and lakes have their own calm surfaces
// (scenes/travel/Rivers.tsx). Gerstner-style directional wave field plus
// subdued noise swell,
// depth-dependent absorption sampled from the real bathymetry (the DEM
// texture), foam along shorelines and on wave crests, and low roughness so
// the IBL environment provides sky reflections. World-anchored via a uniform
// offset so the plane can follow the player without the pattern swimming.
//
// OPEN: true screen-space reflections/refraction (design.md §2) are beyond
// the POC pipeline; reflections come from the IBL environment instead.

import * as THREE from 'three/webgpu'
import {
  cameraPosition,
  color,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'
import { getDemMeta } from '../world/geodata'

export interface WaterMaterialHandle {
  material: THREE.MeshStandardNodeMaterial
  /** World-space XZ position of the plane center; update when the plane moves. */
  offset: { value: THREE.Vector2 }
  /** 0 = normal sea; 1 = glassy calm (debug continent zoom, design.md §21):
   *  waves, crest foam and sparkle fade out — at that distance they alias
   *  into speckle noise across the whole view. */
  calm: { value: number }
}

/** World units per degree (must match world/geo.ts). */
const UNITS_PER_DEGREE = 10

export function createWaterMaterial(): WaterMaterialHandle {
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.roughness = 0.08
  m.metalness = 0.02

  const offset = uniform(new THREE.Vector2(0, 0))
  const calm = uniform(0)
  const lively = float(1).sub(calm)

  // Plane geometry lies in local XY (rotated flat): local X + offset.x is
  // world X, local Y + offset.y is world -Z (see the plane rotation).
  const wp = positionLocal.xy.add(offset)

  // --- Gerstner-style wave field: three directional components + swell ----
  const wave = (dirX: number, dirY: number, len: number, amp: number, speed: number) => {
    const k = (Math.PI * 2) / len
    const phase = wp.x.mul(dirX).add(wp.y.mul(dirY)).mul(k).add(time.mul(speed))
    // Sharpened crests: sin lifted and powered (Gerstner-like profile).
    const s = phase.sin().mul(0.5).add(0.5)
    return pow(s, float(1.6)).sub(0.5).mul(amp * 2)
  }
  // Kept subtle (design.md §11: only slight surface movement); rivers and
  // lakes have their own calm surfaces (scenes/travel/Rivers.tsx).
  const w1 = wave(0.8, 0.6, 9.5, 0.05, 0.55)
  const w2 = wave(-0.55, 0.83, 5.7, 0.03, 0.8)
  const w3 = wave(0.2, -0.98, 14.5, 0.04, 0.35)
  const swell = mx_fractal_noise_float(vec3(wp.mul(0.045), time.mul(0.09)), 3).mul(0.1)
  const waveH = w1.add(w2).add(w3).add(swell).mul(lively)
  m.positionNode = positionLocal.add(vec3(0, 0, waveH))

  // --- Real bathymetry: depth in meters from the DEM texture -------------
  const meta = getDemMeta()
  const demTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}geodata/dem.png`)
  demTex.flipY = false
  demTex.colorSpace = THREE.NoColorSpace
  demTex.minFilter = THREE.LinearFilter
  demTex.magFilter = THREE.LinearFilter
  const lon = wp.x.div(UNITS_PER_DEGREE)
  const lat = wp.y.div(UNITS_PER_DEGREE) // wp.y is stable world -Z → +lat
  const demUv = vec2(
    lon.sub(meta.lonMin).div(meta.lonMax - meta.lonMin),
    float(meta.latMax).sub(lat).div(meta.latMax - meta.latMin),
  )
  const demSample = texture(demTex, demUv)
  const elevation = demSample.r.mul(255 * 256).add(demSample.g.mul(255)).sub(meta.offsetMeters)
  const depthM = max(elevation.negate(), 0) // meters of water below sea level

  // --- Depth-dependent absorption (design.md §2) --------------------------
  const riverTone = color('#2c6285') // over land pixels (rivers, lakes)
  const shallow = color('#3f9aa8')
  const mid = color('#1c5c86')
  const deep = color('#0b2f4e')
  let col = mix(riverTone, shallow, smoothstep(float(0), float(25), depthM))
  col = mix(col, mid, smoothstep(float(30), float(400), depthM))
  col = mix(col, deep, smoothstep(float(500), float(3000), depthM))
  // Gentle ripple modulation keeps large surfaces alive.
  const ripple = mx_fractal_noise_float(
    vec3(wp.x.mul(0.22).add(time.mul(0.12)), wp.y.mul(0.22), time.mul(0.07)),
    3,
  )
    .mul(0.5)
    .add(0.5)
  col = col.add(ripple.mul(0.05))

  // --- Foam: shoreline band + wave crests + sparse glints -----------------
  const foamNoise = mx_fractal_noise_float(vec3(wp.mul(0.9), time.mul(0.35)), 3).mul(0.5).add(0.5)
  const shoreFoam = smoothstep(float(14), float(2), depthM)
    .mul(smoothstep(float(0.35), float(0.75), foamNoise))
    .mul(smoothstep(float(0.5), float(3), depthM)) // none over land/rivers
  const crestFoam = smoothstep(float(0.16), float(0.3), waveH).mul(
    smoothstep(float(0.45), float(0.8), foamNoise),
  )
  const foam = max(shoreFoam, crestFoam).mul(0.85).mul(lively)
  col = mix(col, color('#eaf4f6'), foam)

  // Sparse moving glints from a tight Worley cell pattern.
  const w = mx_worley_noise_float(vec3(wp.mul(1.7), time.mul(0.3)))
  const sparkle = pow(smoothstep(float(0.85), float(1.0), w.oneMinus()), float(6)).mul(0.18).mul(lively)
  col = col.add(vec3(sparkle, sparkle, sparkle))

  m.colorNode = col
  // Shallow water is clearer, deep water opaque; foam always opaque. Far
  // from the camera the surface turns fully opaque, so the end of the
  // terrain chunks underneath is never visible.
  const camDist = positionWorld.sub(cameraPosition).length()
  m.opacityNode = smoothstep(float(0), float(60), depthM)
    .mul(0.35)
    .add(0.58)
    .add(foam.mul(0.3))
    .max(smoothstep(float(110), float(150), camDist))
    .min(1)
  // Foam is rough, open water glossy (sky reflections from the IBL).
  m.roughnessNode = foam.mul(0.7).add(0.08)

  return {
    material: m,
    offset: offset as unknown as { value: THREE.Vector2 },
    calm: calm as unknown as { value: number },
  }
}
