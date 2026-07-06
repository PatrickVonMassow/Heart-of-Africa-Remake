// Geodata preprocessing (design.md §3 "Reale Geodaten und Terrain-Darstellung").
//
// Builds public/geodata/dem.png + dem.json from real elevation data:
//   1. Downloads Terrarium elevation tiles (zoom 6) for the Africa bounding
//      box from the public AWS Open Data bucket "elevation-tiles-prod"
//      (Mapzen/Linux Foundation; SRTM/GMTED/GEBCO composite, no auth).
//   2. Resamples the Web-Mercator tiles bilinearly onto an equirectangular
//      grid (matching the game's flat lat/lon world mapping).
//   3. Flood-fills the ocean from the map border (elevation <= 0 connected
//      to the border), so below-sea-level depressions (Qattara, Afar) stay
//      land, then stamps all game places as land (harbor cities may sit on
//      barrier islands below the grid resolution).
//   4. Computes a chamfer distance-to-coast transform for shoreline ramps.
//   5. Encodes everything into one opaque RGB PNG:
//        R,G  = (elevation_m + OFFSET) as 16-bit big-endian
//        B    = 0 for ocean; 1 + round(coastDistanceDeg / 0.02) for land
//
// Reproducible via:  node scripts/build-geodata.mjs
// (~224 tile downloads, ≈10 MB; runtime a few minutes on first run. Tiles
// are cached in scripts/.tile-cache/.)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePngRgb } from './png.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public', 'geodata')
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tile-cache')

// Target grid (must match src/world/geodata.ts expectations via dem.json).
const LON_MIN = -20
const LON_MAX = 53
const LAT_MIN = -37
const LAT_MAX = 38
const RES = 0.025 // degrees per pixel (~2.8 km)
const W = Math.round((LON_MAX - LON_MIN) / RES) // 2920
const H = Math.round((LAT_MAX - LAT_MIN) / RES) // 3000
const OFFSET = 12000 // meters added before 16-bit encoding (covers bathymetry)
const ZOOM = 6
const TILE = 256

// --- Tile download ------------------------------------------------------------

function tileUrl(z, x, y) {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
}

async function fetchTile(z, x, y) {
  const cacheFile = path.join(CACHE_DIR, `${z}-${x}-${y}.png`)
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile)
  const res = await fetch(tileUrl(z, x, y))
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(cacheFile, buf)
  return buf
}

/** Web-Mercator global pixel coordinates at ZOOM for (lat, lon). */
function mercatorPx(lat, lon) {
  const n = 2 ** ZOOM * TILE
  const x = ((lon + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const y = ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n
  return { x, y }
}

async function main() {
  console.log(`grid ${W}x${H} @ ${RES} deg, bbox lon ${LON_MIN}..${LON_MAX} lat ${LAT_MIN}..${LAT_MAX}`)

  // Determine and prefetch the needed tile range.
  const tl = mercatorPx(LAT_MAX, LON_MIN)
  const br = mercatorPx(LAT_MIN, LON_MAX)
  const tx0 = Math.floor(tl.x / TILE)
  const tx1 = Math.floor(br.x / TILE)
  const ty0 = Math.floor(tl.y / TILE)
  const ty1 = Math.floor(br.y / TILE)
  const jobs = []
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty])
  console.log(`tiles: x ${tx0}..${tx1}, y ${ty0}..${ty1} (${jobs.length})`)

  const tiles = new Map() // "tx,ty" -> {data, channels}
  let done = 0
  const workers = Array.from({ length: 8 }, async () => {
    for (;;) {
      const job = jobs.pop()
      if (!job) return
      const [tx, ty] = job
      const png = decodePng(await fetchTile(ZOOM, tx, ty))
      tiles.set(`${tx},${ty}`, png)
      if (++done % 50 === 0) console.log(`  ${done} tiles`)
    }
  })
  await Promise.all(workers)
  console.log(`downloaded/decoded ${tiles.size} tiles`)

  /** Terrarium elevation (meters) at global mercator pixel (may be fractional). */
  function elevAtPx(gx, gy) {
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    let sum = 0
    for (const [dx, dy, w] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ]) {
      const px = x0 + dx
      const py = y0 + dy
      const tile = tiles.get(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`)
      let e = -8000
      if (tile) {
        const lx = px - Math.floor(px / TILE) * TILE
        const ly = py - Math.floor(py / TILE) * TILE
        const i = (ly * TILE + lx) * tile.channels
        e = tile.data[i] * 256 + tile.data[i + 1] + tile.data[i + 2] / 256 - 32768
      }
      sum += e * w
    }
    return sum
  }

  // Resample onto the equirectangular grid.
  console.log('resampling…')
  const elev = new Int16Array(W * H)
  for (let y = 0; y < H; y++) {
    const lat = LAT_MAX - (y + 0.5) * RES
    for (let x = 0; x < W; x++) {
      const lon = LON_MIN + (x + 0.5) * RES
      const m = mercatorPx(lat, lon)
      elev[y * W + x] = Math.max(-11000, Math.min(9000, Math.round(elevAtPx(m.x - 0.5, m.y - 0.5))))
    }
    if (y % 500 === 0) console.log(`  row ${y}/${H}`)
  }

  // Ocean flood fill from the border over elevation <= 0.
  console.log('ocean flood fill…')
  const ocean = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qh = 0
  let qt = 0
  const push = (i) => {
    if (!ocean[i] && elev[i] <= 0) {
      ocean[i] = 1
      queue[qt++] = i
    }
  }
  for (let x = 0; x < W; x++) {
    push(x)
    push((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    push(y * W)
    push(y * W + W - 1)
  }
  while (qh < qt) {
    const i = queue[qh++]
    const x = i % W
    if (x > 0) push(i - 1)
    if (x < W - 1) push(i + 1)
    if (i >= W) push(i - W)
    if (i < W * (H - 1)) push(i + W)
  }
  let oceanCount = 0
  for (let i = 0; i < W * H; i++) oceanCount += ocean[i]
  console.log(`ocean: ${((oceanCount / (W * H)) * 100).toFixed(1)} %`)

  // Stamp all game places as land (parse positions out of src/world/geo.ts).
  const geoSrc = fs.readFileSync(path.join(ROOT, 'src', 'world', 'geo.ts'), 'utf8')
  const places = [
    ...geoSrc.matchAll(/name: '([^']+)',(?: people: '[^']+',)? lat: (-?\d+(?:\.\d+)?), lon: (-?\d+(?:\.\d+)?)/g),
  ].map((m) => ({ name: m[1], lat: Number(m[2]), lon: Number(m[3]) }))
  console.log(`stamping ${places.length} places…`)
  for (const p of places) {
    const px = Math.round((p.lon - LON_MIN) / RES)
    const py = Math.round((LAT_MAX - p.lat) / RES)
    let stamped = 0
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = (py + dy) * W + (px + dx)
        if (i < 0 || i >= W * H) continue
        if (ocean[i]) {
          ocean[i] = 0
          if (elev[i] < 2) elev[i] = 2
          stamped++
        }
      }
    }
    if (stamped) console.log(`  ${p.name}: ${stamped} px ocean -> land`)
  }

  // Chamfer distance to the coast (for land pixels), in pixel units *3.
  console.log('coast distance transform…')
  const INF = 0x3fffffff
  const dist = new Int32Array(W * H).fill(INF)
  for (let i = 0; i < W * H; i++) if (ocean[i]) dist[i] = 0
  // forward pass
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      let d = dist[i]
      if (x > 0) d = Math.min(d, dist[i - 1] + 3)
      if (y > 0) {
        d = Math.min(d, dist[i - W] + 3)
        if (x > 0) d = Math.min(d, dist[i - W - 1] + 4)
        if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 4)
      }
      dist[i] = d
    }
  }
  // backward pass
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x
      let d = dist[i]
      if (x < W - 1) d = Math.min(d, dist[i + 1] + 3)
      if (y < H - 1) {
        d = Math.min(d, dist[i + W] + 3)
        if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 4)
        if (x > 0) d = Math.min(d, dist[i + W - 1] + 4)
      }
      dist[i] = d
    }
  }

  // Encode RGB.
  console.log('encoding PNG…')
  const pixels = new Uint8Array(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    // Quantize for compression: 4 m steps on land (invisible at game scale),
    // 8 m in shallow water (drives the smooth shore-absorption gradient),
    // 50 m in the deep sea (color ramps only).
    const q = ocean[i] ? (elev[i] > -240 ? 8 : 50) : 4
    const e = Math.max(0, Math.min(65535, Math.round(elev[i] / q) * q + OFFSET))
    pixels[i * 3] = e >> 8
    pixels[i * 3 + 1] = e & 0xff
    pixels[i * 3 + 2] = ocean[i] ? 0 : 1 + Math.min(254, Math.round(((dist[i] / 3) * RES) / 0.02))
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const png = encodePngRgb(W, H, pixels)
  fs.writeFileSync(path.join(OUT_DIR, 'dem.png'), png)
  fs.writeFileSync(
    path.join(OUT_DIR, 'dem.json'),
    JSON.stringify(
      {
        source: 'AWS elevation-tiles-prod (Terrarium, SRTM/GMTED/GEBCO composite), zoom 6',
        lonMin: LON_MIN,
        lonMax: LON_MAX,
        latMin: LAT_MIN,
        latMax: LAT_MAX,
        res: RES,
        width: W,
        height: H,
        offsetMeters: OFFSET,
        coastDistUnitDeg: 0.02,
      },
      null,
      2,
    ),
  )
  console.log(`wrote dem.png (${(png.length / 1e6).toFixed(1)} MB) + dem.json`)

  // Sanity probes.
  const probe = (name, lat, lon) => {
    const x = Math.round((lon - LON_MIN) / RES)
    const y = Math.round((LAT_MAX - lat) / RES)
    const i = y * W + x
    console.log(`  ${name}: elev ${elev[i]} m, ${ocean[i] ? 'OCEAN' : 'land'}`)
  }
  probe('Kilimandscharo', -3.07, 37.35)
  probe('Kairo', 30.05, 31.45)
  probe('Sansibar', -6.16, 39.3)
  probe('Viktoriasee', -1.0, 33.0)
  probe('Qattara-Senke', 29.5, 27.5)
  probe('Suez-Landbrücke', 30.6, 32.35)
  probe('Atlantik', 0, -10)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
