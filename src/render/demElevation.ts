// Decoded DEM data as a GPU-filterable half-float texture, shared by every
// shader that needs terrain height or water coverage (water depth tint,
// land-aware haze). R holds the elevation in meters — the raw two-byte DEM
// encoding must never be linearly filtered, since the GPU interpolates high
// and low byte independently and invents phantom elevations at texel edges —
// and G holds an inland-water mask baked from the hydrology vectors (river
// ribbons and lake polygons), which the DEM itself cannot provide: carved
// rivers lie ABOVE sea level, so elevation alone cannot exclude them.

import * as THREE from 'three/webgpu'
import { float, texture, vec2 } from 'three/tsl'
import { LAKES } from '../world/data/lakes'
import { RIVERS_DATA } from '../world/data/rivers'
import { getDemMeta, getDemPixels } from '../world/geodata'

/** River ribbon half width (world units 0.135°, Rivers.tsx) plus margin. */
const RIVER_MASK_RADIUS_DEG = 0.22

let cached: THREE.DataTexture | null = null

function bakeWaterMask(mask: Uint8Array, width: number, height: number): void {
  const meta = getDemMeta()
  const res = (meta.lonMax - meta.lonMin) / width
  const toX = (lon: number) => (lon - meta.lonMin) / res
  const toY = (lat: number) => (meta.latMax - lat) / res
  const stamp = (cx: number, cy: number, rTexel: number) => {
    const r2 = rTexel * rTexel
    const x0 = Math.max(0, Math.floor(cx - rTexel))
    const x1 = Math.min(width - 1, Math.ceil(cx + rTexel))
    const y0 = Math.max(0, Math.floor(cy - rTexel))
    const y1 = Math.min(height - 1, Math.ceil(cy + rTexel))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r2) mask[y * width + x] = 1
      }
    }
  }
  const rTexel = RIVER_MASK_RADIUS_DEG / res
  for (const river of RIVERS_DATA) {
    for (let i = 0; i < river.points.length - 1; i++) {
      const [lon0, lat0] = river.points[i]
      const [lon1, lat1] = river.points[i + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(lon1 - lon0, lat1 - lat0) / (res * 0.5)))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        stamp(toX(lon0 + (lon1 - lon0) * t), toY(lat0 + (lat1 - lat0) * t), rTexel)
      }
    }
  }
  // Lakes: even-odd scanline containment over each polygon's bbox.
  for (const lake of LAKES) {
    const lons = lake.points.map((p) => p[0])
    const lats = lake.points.map((p) => p[1])
    const x0 = Math.max(0, Math.floor(toX(Math.min(...lons)) - 1))
    const x1 = Math.min(width - 1, Math.ceil(toX(Math.max(...lons)) + 1))
    const y0 = Math.max(0, Math.floor(toY(Math.max(...lats)) - 1))
    const y1 = Math.min(height - 1, Math.ceil(toY(Math.min(...lats)) + 1))
    for (let y = y0; y <= y1; y++) {
      const lat = meta.latMax - (y + 0.5) * res
      for (let x = x0; x <= x1; x++) {
        const lon = meta.lonMin + (x + 0.5) * res
        let inside = false
        for (let i = 0, j = lake.points.length - 1; i < lake.points.length; j = i++) {
          const [xi, yi] = lake.points[i]
          const [xj, yj] = lake.points[j]
          if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside
          }
        }
        if (inside) mask[y * width + x] = 1
      }
    }
  }
}

function getDemDataTexture(): THREE.DataTexture {
  if (cached) return cached
  const meta = getDemMeta()
  const dem = getDemPixels()
  const texelCount = dem.width * dem.height
  const waterMask = new Uint8Array(texelCount)
  bakeWaterMask(waterMask, dem.width, dem.height)
  // RGBA half float: R = elevation (m), G = inland-water mask (rivers/
  // lakes), B = dataset land flag (the DEM's own land/sea classification —
  // the exact semantics for "does the open-sea plane belong here").
  const data = new Uint16Array(texelCount * 4)
  const one = THREE.DataUtils.toHalfFloat(1)
  for (let i = 0; i < texelCount; i++) {
    const metersUp = dem.data[i * 4] * 256 + dem.data[i * 4 + 1] - meta.offsetMeters
    data[i * 4] = THREE.DataUtils.toHalfFloat(metersUp)
    data[i * 4 + 1] = waterMask[i] ? one : 0
    data[i * 4 + 2] = dem.data[i * 4 + 2] > 0 ? one : 0
    data[i * 4 + 3] = one
  }
  const tex = new THREE.DataTexture(data, dem.width, dem.height, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.needsUpdate = true
  tex.flipY = false
  tex.colorSpace = THREE.NoColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  cached = tex
  return tex
}

function demUvAt(lon: THREE.Node<'float'>, lat: THREE.Node<'float'>) {
  const meta = getDemMeta()
  return vec2(
    lon.sub(meta.lonMin).div(meta.lonMax - meta.lonMin),
    float(meta.latMax).sub(lat).div(meta.latMax - meta.latMin),
  )
}

/** TSL node: smoothly filtered elevation in meters at (lon, lat) nodes. */
export function demElevation(
  lon: THREE.Node<'float'>,
  lat: THREE.Node<'float'>,
): ReturnType<typeof float> {
  return texture(getDemDataTexture(), demUvAt(lon, lat)).r as unknown as ReturnType<typeof float>
}

/** TSL node: inland-water coverage (rivers/lakes) in [0,1] at (lon, lat). */
export function demInlandWater(
  lon: THREE.Node<'float'>,
  lat: THREE.Node<'float'>,
): ReturnType<typeof float> {
  return texture(getDemDataTexture(), demUvAt(lon, lat)).g as unknown as ReturnType<typeof float>
}

/** TSL node: the dataset's own land flag in [0,1] at (lon, lat). */
export function demDatasetLand(
  lon: THREE.Node<'float'>,
  lat: THREE.Node<'float'>,
): ReturnType<typeof float> {
  return texture(getDemDataTexture(), demUvAt(lon, lat)).b as unknown as ReturnType<typeof float>
}
