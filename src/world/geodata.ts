// Runtime access to the real elevation dataset (design.md §3 "Reale Geodaten
// und Terrain-Darstellung"). Loads public/geodata/dem.png — produced by
// scripts/build-geodata.mjs from Terrarium/SRTM tiles — and provides bilinear
// samplers for elevation, land mask and distance-to-coast.
//
// Channel layout (see the build script):
//   R,G = (elevation_m + offset) as 16-bit big-endian
//   B   = 0 for ocean; 1 + coastDistanceDeg/coastDistUnitDeg for land
//
// loadGeodata() must resolve before any terrain sampling happens; main.tsx
// gates the app start on it.
//
// The decoded pixels are trimmed to the game world before use: every land
// texel northeast of the Red Sea boundary (Sinai, the Levant, Arabia) is
// stamped to ocean (redSea.ts), so the world ends at the African Red Sea
// coast (design.md §3.1/§11.2). dem.png itself stays untouched.

import { stampNortheastOcean } from './redSea'

interface DemMeta {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
  res: number
  width: number
  height: number
  offsetMeters: number
  coastDistUnitDeg: number
}

let meta: DemMeta | null = null
let pixels: Uint8ClampedArray | null = null

export async function loadGeodata(): Promise<void> {
  const base = import.meta.env.BASE_URL
  const [metaRes, imgRes] = await Promise.all([
    fetch(`${base}geodata/dem.json`),
    fetch(`${base}geodata/dem.png`),
  ])
  if (!metaRes.ok || !imgRes.ok) throw new Error('failed to load geodata')
  meta = (await metaRes.json()) as DemMeta
  const bitmap = await createImageBitmap(await imgRes.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  const canvas = document.createElement('canvas')
  canvas.width = meta.width
  canvas.height = meta.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  pixels = ctx.getImageData(0, 0, meta.width, meta.height).data
  bitmap.close()
  stampNortheastOcean(pixels, meta)
}

/**
 * The decoded (and northeast-trimmed) DEM pixel grid, RGBA stride 4; for
 * consumers that need the raw texels (the water bathymetry texture) so they
 * see the same trimmed world as the samplers. Available after loadGeodata().
 */
export function getDemPixels(): { data: Uint8ClampedArray; width: number; height: number } {
  if (!pixels || !meta) throw new Error('geodata not loaded')
  return { data: pixels, width: meta.width, height: meta.height }
}

/** Dataset metadata (bbox/resolution/offset); available after loadGeodata(). */
export function getDemMeta(): { lonMin: number; lonMax: number; latMin: number; latMax: number; offsetMeters: number } {
  if (!meta) throw new Error('geodata not loaded')
  return meta
}

/** Raw texel access; x/y clamped to the grid. RGBA stride 4. */
function texel(x: number, y: number): number {
  const m = meta!
  const cx = x < 0 ? 0 : x >= m.width ? m.width - 1 : x
  const cy = y < 0 ? 0 : y >= m.height ? m.height - 1 : y
  return (cy * m.width + cx) * 4
}

function gridPos(lat: number, lon: number): { x: number; y: number } {
  const m = meta!
  return {
    x: (lon - m.lonMin) / m.res - 0.5,
    y: (m.latMax - lat) / m.res - 0.5,
  }
}

/**
 * Bilinear real elevation in meters. Outside the dataset (open Atlantic /
 * Indian Ocean / Mediterranean beyond the bbox) returns deep ocean.
 */
export function elevationAt(lat: number, lon: number): number {
  if (!pixels || !meta) return 0
  const m = meta
  if (lon < m.lonMin - 0.5 || lon > m.lonMax + 0.5 || lat < m.latMin - 0.5 || lat > m.latMax + 0.5) {
    return -4000
  }
  const { x, y } = gridPos(lat, lon)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const p = pixels
  const e00 = p[texel(x0, y0)] * 256 + p[texel(x0, y0) + 1]
  const e10 = p[texel(x0 + 1, y0)] * 256 + p[texel(x0 + 1, y0) + 1]
  const e01 = p[texel(x0, y0 + 1)] * 256 + p[texel(x0, y0 + 1) + 1]
  const e11 = p[texel(x0 + 1, y0 + 1)] * 256 + p[texel(x0 + 1, y0 + 1) + 1]
  const top = e00 + (e10 - e00) * fx
  const bot = e01 + (e11 - e01) * fx
  return top + (bot - top) * fy - m.offsetMeters
}

/**
 * Bilinear land fraction in [0, 1]: 1 well inside the continent, 0 in the
 * ocean, smooth across the shoreline (one texel ≈ 2.8 km wide transition).
 */
export function landFractionAt(lat: number, lon: number): number {
  if (!pixels || !meta) return 0
  const m = meta
  if (lon < m.lonMin - 0.5 || lon > m.lonMax + 0.5 || lat < m.latMin - 0.5 || lat > m.latMax + 0.5) {
    return 0
  }
  const { x, y } = gridPos(lat, lon)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const p = pixels
  const l00 = p[texel(x0, y0) + 2] > 0 ? 1 : 0
  const l10 = p[texel(x0 + 1, y0) + 2] > 0 ? 1 : 0
  const l01 = p[texel(x0, y0 + 1) + 2] > 0 ? 1 : 0
  const l11 = p[texel(x0 + 1, y0 + 1) + 2] > 0 ? 1 : 0
  const top = l00 + (l10 - l00) * fx
  const bot = l01 + (l11 - l01) * fx
  return top + (bot - top) * fy
}

/** Distance to the sea coast in degrees (bilinear; 0 in the ocean). */
export function coastDistanceAt(lat: number, lon: number): number {
  if (!pixels || !meta) return 0
  const m = meta
  if (lon < m.lonMin - 0.5 || lon > m.lonMax + 0.5 || lat < m.latMin - 0.5 || lat > m.latMax + 0.5) {
    return 0
  }
  const { x, y } = gridPos(lat, lon)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const p = pixels
  const d = (tx: number, ty: number) => {
    const b = p[texel(tx, ty) + 2]
    return b === 0 ? 0 : (b - 1) * m.coastDistUnitDeg
  }
  const top = d(x0, y0) + (d(x0 + 1, y0) - d(x0, y0)) * fx
  const bot = d(x0, y0 + 1) + (d(x0 + 1, y0 + 1) - d(x0, y0 + 1)) * fx
  return top + (bot - top) * fy
}
