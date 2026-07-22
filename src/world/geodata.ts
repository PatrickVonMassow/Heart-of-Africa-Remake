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
// The decoded pixels are trimmed to the game world before use: only land
// connected to the game's own land masses is kept, and everything else —
// Sinai, the Levant, Arabia beyond the Red Sea boundary, southern Europe,
// foreign islands — is stamped to ocean (redSea.ts), so the world ends at
// the African Red Sea coast (design.md §3.1/§11.2) and shows no land
// outside the walkable continent. dem.png itself stays untouched.

import { trimToGameWorld } from './redSea'

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

/**
 * Decode the DEM PNG to a drawable. Prefers `createImageBitmap` with raw
 * decode options (no premultiply, no colour conversion) so the height bytes
 * survive untouched. WebKit/Safari can reject that options bag on a Blob
 * ("error reading the Blob argument to createImageBitmap"), which left the
 * terrain unloaded on iOS Safari; fall back to an <img> decode there. The
 * dem.png carries no colour profile, so the sRGB canvas draw stays
 * byte-identical to the ImageBitmap path.
 */
async function decodeDem(blob: Blob): Promise<CanvasImageSource> {
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('dem.png <img> decode failed'))
        img.src = url
      })
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export async function loadGeodata(): Promise<void> {
  const base = import.meta.env.BASE_URL
  const [metaRes, imgRes] = await Promise.all([
    fetch(`${base}geodata/dem.json`),
    fetch(`${base}geodata/dem.png`),
  ])
  if (!metaRes.ok || !imgRes.ok) throw new Error('failed to load geodata')
  meta = (await metaRes.json()) as DemMeta
  const source = await decodeDem(await imgRes.blob())
  const canvas = document.createElement('canvas')
  canvas.width = meta.width
  canvas.height = meta.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(source, 0, 0)
  pixels = ctx.getImageData(0, 0, meta.width, meta.height).data
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()
  trimToGameWorld(pixels, meta)
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

// point 215: Mitchell-Netravali cubic kernel (B=C=1/3). Bilinear elevation was
// only C0-smooth — every DEM texel boundary is a gradient crease that the terrain
// mesh renders as a polygon fold ("angular relief"). A bicubic sample makes the
// height field C1-smooth so terrain, rivers, the backdrop and the through-water
// sea floor all read smooth at the source. Mitchell (over Catmull-Rom) bounds the
// overshoot that would otherwise invent phantom peaks/pits at coasts and basins.
function mitchell(t: number): number {
  const B = 1 / 3
  const C = 1 / 3
  const x = Math.abs(t)
  if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6
  if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6
  return 0
}

/** The four separable cubic weights for a fractional offset f in [0,1) — taps at
 *  the grid points -1,0,+1,+2 relative to floor. */
function cubicWeights(f: number): [number, number, number, number] {
  return [mitchell(f + 1), mitchell(f), mitchell(f - 1), mitchell(f - 2)]
}

/**
 * Bicubic (Mitchell-Netravali) real elevation in meters. Outside the dataset
 * (open Atlantic / Indian Ocean / Mediterranean beyond the bbox) returns deep
 * ocean. C1-smooth so the terrain relief reads without polygon facets (point 215).
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
  const wx = cubicWeights(x - x0)
  const wy = cubicWeights(y - y0)
  const p = pixels
  let v = 0
  for (let j = 0; j < 4; j++) {
    const gy = y0 - 1 + j
    let row = 0
    for (let i = 0; i < 4; i++) {
      const t = texel(x0 - 1 + i, gy)
      row += (p[t] * 256 + p[t + 1]) * wx[i]
    }
    v += row * wy[j]
  }
  return v - m.offsetMeters
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
