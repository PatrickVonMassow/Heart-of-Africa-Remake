// Decoded DEM elevation as a GPU-filterable half-float texture, shared by
// every shader that needs terrain height (water depth tint, land-aware haze).
// The raw two-byte DEM encoding must never be linearly filtered — the GPU
// interpolates high and low byte independently, inventing phantom elevations
// at texel edges — so the meters are decoded once on the CPU.

import * as THREE from 'three/webgpu'
import { float, texture, vec2 } from 'three/tsl'
import { getDemMeta, getDemPixels } from '../world/geodata'

let cached: THREE.DataTexture | null = null

function getElevationTexture(): THREE.DataTexture {
  if (cached) return cached
  const meta = getDemMeta()
  const dem = getDemPixels()
  const texelCount = dem.width * dem.height
  const elevHalf = new Uint16Array(texelCount)
  for (let i = 0; i < texelCount; i++) {
    const metersUp = dem.data[i * 4] * 256 + dem.data[i * 4 + 1] - meta.offsetMeters
    elevHalf[i] = THREE.DataUtils.toHalfFloat(metersUp)
  }
  const tex = new THREE.DataTexture(
    elevHalf,
    dem.width,
    dem.height,
    THREE.RedFormat,
    THREE.HalfFloatType,
  )
  tex.needsUpdate = true
  tex.flipY = false
  tex.colorSpace = THREE.NoColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  cached = tex
  return tex
}

/** TSL node: smoothly filtered elevation in meters at (lon, lat) nodes. */
export function demElevation(
  lon: THREE.Node<'float'>,
  lat: THREE.Node<'float'>,
): ReturnType<typeof float> {
  const meta = getDemMeta()
  const demUv = vec2(
    lon.sub(meta.lonMin).div(meta.lonMax - meta.lonMin),
    float(meta.latMax).sub(lat).div(meta.latMax - meta.latMin),
  )
  return texture(getElevationTexture(), demUv).r as unknown as ReturnType<typeof float>
}
