// Ocean water surface (design.md §2 "Licht- und Post-Processing-
// Pipeline"); rivers and lakes have their own calm surfaces
// (scenes/travel/Rivers.tsx). Gerstner-style directional wave field plus
// subdued noise swell,
// depth-dependent absorption sampled from the real bathymetry (the DEM
// texture), foam along shorelines and on wave crests, and low roughness so
// the IBL environment provides sky reflections. World-anchored via a uniform
// offset so the plane can follow the player without the pattern swimming.
//
// Screen-space reflections come from the post pipeline's SSR pass on WebGPU
// (render/Effects.tsx, debug-gated); the IBL environment provides the sky
// reflections everywhere. OPEN: true refraction (design.md §2) is beyond the
// POC pipeline.

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
  time,
  uniform,
  vec3,
} from 'three/tsl'
import { getDemMeta } from '../world/geodata'
import { demDatasetLand, demElevation } from './demElevation'

export interface WaterMaterialHandle {
  material: THREE.MeshStandardNodeMaterial
  /** World-space XZ position of the plane center; update when the plane moves. */
  offset: { value: THREE.Vector2 }
  /** 0 = normal sea; 1 = glassy calm (debug continent zoom, design.md §21):
   *  waves, crest foam and sparkle fade out — at that distance they alias
   *  into speckle noise across the whole view. */
  calm: { value: number }
  /** Uniform mesh scale of the plane; MUST match the mesh's scale so the
   *  shader's world reconstruction (local * scale + offset) stays aligned
   *  with the land — otherwise bathymetry and pattern drift against the
   *  coast while the player walks in the debug zoom. */
  planeScale: { value: number }
}

/** World units per degree (must match world/geo.ts). */
const UNITS_PER_DEGREE = 10

export function createWaterMaterial(): WaterMaterialHandle {
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  // Never write depth: the plane spans the whole world at sea level, and its
  // depth would cull the river/lake surfaces lying in beds carved below
  // sea level (the lower Nile) — even where the land mask makes the plane
  // fully transparent, since alpha-0 pixels still write depth.
  m.depthWrite = false
  m.roughness = 0.08
  m.metalness = 0.02

  const offset = uniform(new THREE.Vector2(0, 0))
  const calm = uniform(0)
  const planeScale = uniform(1)
  const lively = float(1).sub(calm)

  // Plane geometry lies in local XY (rotated flat): local X * scale +
  // offset.x is world X, local Y * scale + offset.y is world -Z (see the
  // plane rotation; the mesh is scaled up in the debug zoom range).
  const wp = positionLocal.xy.mul(planeScale).add(offset)

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
  // Built from the loaded (northeast-trimmed) pixels rather than dem.png, so
  // the water sees the same world cut as the terrain (world/redSea.ts). The
  // shared module decodes the two-byte elevation into a filterable
  // half-float texture (render/demElevation.ts).
  const meta = getDemMeta()
  const lon = wp.x.div(UNITS_PER_DEGREE)
  const lat = wp.y.div(UNITS_PER_DEGREE) // wp.y is stable world -Z → +lat
  const elevation = demElevation(lon, lat) // meters above sea level
  const depthSampled = max(elevation.negate(), 0) // meters of water below sea level
  // Outside the DEM bbox the texture would clamp-repeat its edge texels into
  // endless streaks across the far sea (visible at the continent zoom,
  // especially northeast). Blend to plain deep ocean beyond the bbox instead.
  const inLon = smoothstep(float(meta.lonMin - 1), float(meta.lonMin), lon).mul(
    smoothstep(float(meta.lonMax), float(meta.lonMax + 1), lon).oneMinus(),
  )
  const inLat = smoothstep(float(meta.latMin - 1), float(meta.latMin), lat).mul(
    smoothstep(float(meta.latMax), float(meta.latMax + 1), lat).oneMinus(),
  )
  const depthM = mix(float(3500), depthSampled, inLon.mul(inLat))

  // --- Depth-dependent absorption (design.md §2) --------------------------
  const riverTone = color('#2c6285') // over land pixels (rivers, lakes)
  const shallow = color('#3f9aa8')
  const mid = color('#1c5c86')
  const deep = color('#0b2f4e')
  let col = mix(riverTone, shallow, smoothstep(float(0), float(25), depthM))
  col = mix(col, mid, smoothstep(float(30), float(400), depthM))
  // Fully deep by ~1600 m: abyssal plains, removed open-sea land (-3000 m
  // stamps, world/redSea.ts) and the outside-bbox mask all share one deep
  // tone, so no trimmed silhouette stands out against a shallower basin;
  // removed shore spits instead inherit their local shelf depth there.
  col = mix(col, deep, smoothstep(float(500), float(1600), depthM))
  // Gentle ripple modulation keeps large surfaces alive. Multiplicative
  // (±5 % brightness), NOT additive: a flat additive lift is invisible on
  // bright shallows but bleaches the dark deep-ocean tone into pale cloudy
  // blotches.
  const ripple = mx_fractal_noise_float(
    vec3(wp.x.mul(0.22).add(time.mul(0.12)), wp.y.mul(0.22), time.mul(0.07)),
    3,
  )
    .mul(0.5)
    .add(0.5)
  col = col.mul(ripple.mul(0.1).add(0.95))

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

  // Sparse moving glints from a tight Worley cell pattern. The cells are
  // world-sized, so a close camera would read them as dense confetti
  // scattered over the sea — fade them out below the default view height
  // and keep them sparse and subtle beyond it.
  const camDist = positionWorld.sub(cameraPosition).length()
  const w = mx_worley_noise_float(vec3(wp.mul(1.7), time.mul(0.3)))
  const glintVis = smoothstep(float(16), float(32), camDist)
  const sparkle = pow(smoothstep(float(0.9), float(1.0), w.oneMinus()), float(6))
    .mul(0.12)
    .mul(lively)
    .mul(glintVis)
  col = col.add(vec3(sparkle, sparkle, sparkle))

  m.colorNode = col
  // Shallow water is clearer, deep water opaque; foam always opaque. Far
  // from the camera the surface turns fully opaque, so the end of the
  // terrain chunks underneath is never visible.
  // The plane is the OPEN-SEA surface only: over dataset land it fades out
  // entirely — keyed on the dataset's own land flag, not on elevation (the
  // delta floodplain sits at ~0–2 m, where any height threshold leaks).
  // River valleys carved below sea level (the lower Nile) would otherwise
  // show the sheet as pale patches floating on the rivers' own dark
  // surfaces — shifting with the chunk LOD as the traveller moves, since
  // the carve depth depends on it.
  const overSea = demDatasetLand(lon, lat).oneMinus()
  m.opacityNode = smoothstep(float(0), float(60), depthM)
    .mul(0.35)
    .add(0.58)
    .add(foam.mul(0.3))
    .max(smoothstep(float(110), float(150), camDist))
    .min(1)
    .mul(overSea)
  // Foam is rough, open water glossy (sky reflections from the IBL).
  m.roughnessNode = foam.mul(0.7).add(0.08)

  return {
    material: m,
    offset: offset as unknown as { value: THREE.Vector2 },
    calm: calm as unknown as { value: number },
    planeScale: planeScale as unknown as { value: number },
  }
}
