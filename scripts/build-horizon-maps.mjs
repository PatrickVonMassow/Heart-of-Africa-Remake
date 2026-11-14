// Horizon-map preprocessing (design.md §2.7 "The land shades itself over
// hundreds of kilometres").
//
// Builds public/geodata/horizon-a.png + horizon-b.png + horizon.json from the
// committed DEM (public/geodata/dem.png), so it needs no network and is
// reproducible from a clean checkout:
//   1. Decodes dem.png (R,G = elevation + offset, B = 0 for ocean); ocean
//      texels sit at sea level (0 m), land keeps its elevation (Qattara stays
//      below zero).
//   2. Box-downsamples the elevations by --scale (default 2: 1460x1500 texels,
//      0.05 degrees each). Distances use the game's flat lat/lon world: one
//      degree is 111.32 km on both axes, exactly as the terrain is laid out.
//   3. Sweeps the horizon (scripts/horizonSweep.mjs) toward the six sun
//      directions of the 16:00 arc and averages sixteen directions round the
//      full circle into one sky-occlusion measure.
//   4. Encodes the seven slopes (tan of the horizon elevation, real geometry)
//      as sqrt-companded bytes into two RGBA PNGs with straight alpha:
//        horizon-a.png  R,G,B,A = sun slices 0..3
//        horizon-b.png  R,G     = sun slices 4..5, B = mean horizon (sky
//                       occlusion), A = 255
//
// Reproducible via:  node scripts/build-horizon-maps.mjs [--scale 2|4]
// Runtime: src/render/horizonMaps.ts (fetched lazily, never at the low level).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePngRgba } from './png.mjs'
import { OCCLUSION_STEPS, SLOPE_MAX, SUN_AZIMUTHS, SUN_STEPS, encodeSlope, meanHorizon, sweepHorizon } from './horizonSweep.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GEO_DIR = path.join(ROOT, 'public', 'geodata')
const METERS_PER_DEGREE = 111320

function parseScale(argv) {
  const i = argv.indexOf('--scale')
  const scale = i >= 0 ? Number(argv[i + 1]) : 2
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`--scale must be a positive integer, got ${argv[i + 1]}`)
  return scale
}

/** Elevations (meters, ocean at 0) box-downsampled by `scale`. */
export function demHeights(dem, meta, scale) {
  const { width, height, channels, data } = dem
  const w = Math.floor(width / scale)
  const h = Math.floor(height / scale)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = ((y * scale + dy) * width + x * scale + dx) * channels
          const land = data[o + 2] > 0
          acc += land ? data[o] * 256 + data[o + 1] - meta.offsetMeters : 0
        }
      }
      out[y * w + x] = acc / (scale * scale)
    }
  }
  return { heights: out, w, h }
}

function main() {
  const scale = parseScale(process.argv.slice(2))
  const meta = JSON.parse(fs.readFileSync(path.join(GEO_DIR, 'dem.json'), 'utf8'))
  const dem = decodePng(fs.readFileSync(path.join(GEO_DIR, 'dem.png')))
  if (dem.width !== meta.width || dem.height !== meta.height) throw new Error('dem.png does not match dem.json')
  const t0 = Date.now()
  const { heights, w, h } = demHeights(dem, meta, scale)
  const cellMeters = meta.res * scale * METERS_PER_DEGREE
  console.log(`horizon grid ${w}x${h}, ${(cellMeters / 1000).toFixed(2)} km per texel`)

  const slices = SUN_STEPS.map((step, i) => {
    console.log(`sun slice ${i}: azimuth ${SUN_AZIMUTHS[i].toFixed(2)}°`)
    return sweepHorizon(heights, w, h, step, cellMeters)
  })
  console.log(`sky occlusion: ${OCCLUSION_STEPS.length} directions`)
  const mean = meanHorizon(heights, w, h, cellMeters)

  const a = new Uint8Array(w * h * 4)
  const b = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 4; c++) a[i * 4 + c] = encodeSlope(slices[c][i])
    b[i * 4] = encodeSlope(slices[4][i])
    b[i * 4 + 1] = encodeSlope(slices[5][i])
    b[i * 4 + 2] = encodeSlope(mean[i])
    b[i * 4 + 3] = 255
  }
  const pngA = encodePngRgba(w, h, a)
  const pngB = encodePngRgba(w, h, b)
  fs.writeFileSync(path.join(GEO_DIR, 'horizon-a.png'), pngA)
  fs.writeFileSync(path.join(GEO_DIR, 'horizon-b.png'), pngB)
  fs.writeFileSync(
    path.join(GEO_DIR, 'horizon.json'),
    JSON.stringify(
      {
        source: 'scripts/build-horizon-maps.mjs from dem.png',
        lonMin: meta.lonMin,
        lonMax: meta.lonMin + w * meta.res * scale,
        latMin: meta.latMax - h * meta.res * scale,
        latMax: meta.latMax,
        width: w,
        height: h,
        cellMeters: Math.round(cellMeters),
        sunAzimuths: SUN_AZIMUTHS.map((az) => Math.round(az * 1000) / 1000),
        occlusionDirections: OCCLUSION_STEPS.length,
        slopeMax: SLOPE_MAX,
        encoding: 'byte = round(sqrt(min(tan, slopeMax) / slopeMax) * 255)',
      },
      null,
      2,
    ) + '\n',
  )
  const raw = (w * h * 8) / 1e6
  console.log(
    `wrote horizon-a.png (${(pngA.length / 1e6).toFixed(2)} MB) + horizon-b.png (${(pngB.length / 1e6).toFixed(2)} MB), ` +
      `${raw.toFixed(1)} MB raw, in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
