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
import { catmullRom } from '../world/hydro'
import { RIVER_WIDTH_DEG } from '../world/terrain'
import { boundarySignedDistance } from '../world/redSea'

// point 210: the water material reads THIS texture's R channel (metersUp) for its
// depth-driven colour, shore foam and opacity. Near the Red-Sea/Suez trim the DEM
// is stamped to a uniform deep (~-3000 m) in one texel, so the water banded into a
// staircase along that cut (the "stepped sea" east of Cairo) — the terrain's own
// hOcean shelf (terrain.ts) smooths the LAND mesh but never touches this texture.
// Grade the baked depth into the same gentle shelf here, so the water reads one
// continuous shelf with the terrain. Only the trimmed (bsd<0) side, only where the
// boundary abuts kept land — genuine bathymetry (the Gulf-of-Suez head, deep
// Persian Gulf / Dahlak) is left untouched.
const SHELF_BAND_DEG = 0.3 // grade over this distance out from the boundary line
const SHELF_SLOPE_M = 5300 // ~reaches the deep-tone floor (~1600 m) at the band edge
const SHORE_DEPTH_M = -20 // shallow shelf depth right at the shore line

/** Ease the stamped deep floor into a shallow shelf near the trim coast (meters,
 *  negative below sea level). Returns metersUp unchanged away from the coast. */
export function shelfGradedMeters(
  metersUp: number,
  lat: number,
  lon: number,
  dem: { width: number; height: number; data: Uint8ClampedArray },
  lonMin: number,
  latMax: number,
  res: number,
): number {
  const bsd = boundarySignedDistance(lat, lon)
  if (bsd >= 0 || bsd <= -SHELF_BAND_DEG) return metersUp
  // Guard: the boundary must abut kept land here (sample the DEM land flag just
  // inside the boundary's land edge, along the inward normal) — else it runs
  // through open water and grading would invent a false shallow bank.
  const eps = 0.02
  const gLon = (boundarySignedDistance(lat, lon + eps) - bsd) / eps
  const gLat = (boundarySignedDistance(lat + eps, lon) - bsd) / eps
  const mag = Math.hypot(gLon, gLat) || 1
  const step = 0.12 - bsd // reach ~0.12° inside the boundary on the land side
  const ilon = lon + (gLon / mag) * step
  const ilat = lat + (gLat / mag) * step
  const ix = Math.max(0, Math.min(dem.width - 1, Math.round((ilon - lonMin) / res - 0.5)))
  const iy = Math.max(0, Math.min(dem.height - 1, Math.round((latMax - ilat) / res - 0.5)))
  if (dem.data[(iy * dem.width + ix) * 4 + 2] <= 0) return metersUp // inward is not kept land
  const t = -bsd / SHELF_BAND_DEG // 0 at the shore line -> 1 at the band's deep edge
  const shelf = SHORE_DEPTH_M + bsd * SHELF_SLOPE_M // shallow at the line, deepening seaward
  // max = the shallower (less negative) floor near shore, easing into the stamp
  return Math.max(metersUp, shelf * (1 - t) + metersUp * t)
}

/** River ribbon half width (RIVER_WIDTH_DEG, terrain.ts) plus margin. */
const RIVER_MASK_RADIUS_DEG = RIVER_WIDTH_DEG + 0.05

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
    // Stamp along the same Catmull-Rom curve the ribbon and the carved bed
    // follow (point 136) — a linear stamp would hug the corners the rendered
    // river no longer takes.
    const n = river.points.length
    for (let i = 0; i < n - 1; i++) {
      const p0 = river.points[Math.max(0, i - 1)]
      const p1 = river.points[i]
      const p2 = river.points[i + 1]
      const p3 = river.points[Math.min(n - 1, i + 2)]
      const steps = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (res * 0.5)))
      for (let s = 0; s <= steps; s++) {
        const [lon, lat] = catmullRom(p0, p1, p2, p3, s / steps)
        stamp(toX(lon), toY(lat), rTexel)
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
  const res = (meta.lonMax - meta.lonMin) / dem.width
  for (let i = 0; i < texelCount; i++) {
    let metersUp = dem.data[i * 4] * 256 + dem.data[i * 4 + 1] - meta.offsetMeters
    if (metersUp < 0) {
      // point 210: grade the stamped Suez sea floor into a shelf so the water
      // shader's depth colour does not staircase along the trim (ocean texels only).
      const x = i % dem.width
      const y = (i / dem.width) | 0
      const lon = meta.lonMin + (x + 0.5) * res
      const lat = meta.latMax - (y + 0.5) * res
      metersUp = shelfGradedMeters(metersUp, lat, lon, dem, meta.lonMin, meta.latMax, res)
    }
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
