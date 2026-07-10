// Northeast cut of the world (design.md §3.1/§11.2): the walkable continent
// ends at the African Red Sea coast. Everything northeast of this boundary —
// the Red Sea itself, Sinai/the Suez isthmus, the Levant and the Arabian
// peninsula up to the dataset edge — is open, impassable ocean, exactly like
// the sea around the rest of the continent. The boundary runs slightly
// seaward of the ~1890 African coast (data/coastline.ts, "Red Sea coast
// north to Suez" / "Gulf of Aden"): from the eastern Mediterranean across
// the Suez isthmus, down the Red Sea to Bab-el-Mandeb and out along the
// Gulf of Aden past the Horn. Used by the movement boundary (terrain.ts)
// and by the geodata load (geodata.ts), whose trimming pass keeps only the
// land connected to the game's own land masses — the boundary acts as the
// gate at the Suez isthmus, and all other real-data land (Sinai, the
// Levant, Arabia, southern Europe, foreign islands) is stamped to ocean.

/** Boundary polyline as [lon, lat], northwest (Mediterranean) → southeast. */
export const NORTHEAST_BOUNDARY: Array<[number, number]> = [
  // Eastern Mediterranean down to the Suez isthmus (east of the Nile delta).
  [30.6, 39.0], [31.9, 34.2], [32.42, 31.45], [32.62, 30.4], [32.7, 29.75],
  // Down the Gulf of Suez, hugging its African west shore (the Sinai side
  // stays northeast), then seaward of the African Red Sea coast to
  // Bab-el-Mandeb.
  [32.78, 29.2], [32.9, 28.7], [33.25, 28.25], [33.6, 27.75], [33.95, 27.3],
  [34.65, 26.3], [35.4, 25.2], [36.15, 24.05],
  [36.2, 22.6], [36.9, 21.15], [37.6, 19.8], [37.7, 19.3], [38.4, 18.2],
  [38.9, 17.1], [39.8, 15.85], [40.5, 15.45], [41.45, 15.15], [42.1, 14.25],
  [43.0, 13.25], [43.5, 12.4],
  // Along the Gulf of Aden, seaward of the African coast, out past the Horn.
  [44.0, 11.4], [44.4, 10.85], [45.0, 10.8], [45.7, 11.1], [46.6, 11.05],
  [47.9, 11.5], [49.2, 11.65], [50.4, 12.05], [51.3, 12.2], [53.6, 12.9],
]

// Nothing southwest of this box can be northeast of the boundary; cheap
// pre-filter for the per-texel stamping pass.
const BOX_LON_MIN = 30.5
const BOX_LAT_MIN = 9.5

/**
 * True if the point lies northeast of the boundary: the side of the closest
 * boundary segment (left of the NW→SE chain is northeast). Points on the
 * line count as northeast — the line itself lies seaward.
 */
export function isNortheastOfBoundary(lat: number, lon: number): boolean {
  if (lon < BOX_LON_MIN || lat < BOX_LAT_MIN) return false
  let bestD = Infinity
  let bestCross = 0
  for (let i = 0; i < NORTHEAST_BOUNDARY.length - 1; i++) {
    const [ax, ay] = NORTHEAST_BOUNDARY[i]
    const [bx, by] = NORTHEAST_BOUNDARY[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)))
    const px = lon - (ax + dx * t)
    const py = lat - (ay + dy * t)
    const d = px * px + py * py
    if (d < bestD) {
      bestD = d
      bestCross = dx * (lat - ay) - dy * (lon - ax)
    }
  }
  return bestCross >= 0
}

/** Subset of the DEM metadata the trimming pass needs (see geodata.ts). */
export interface StampMeta {
  width: number
  height: number
  lonMin: number
  latMax: number
  res: number
  offsetMeters: number
}

/** Seed points [lon, lat] on the game's own land masses (design.md §3.1):
 *  the mainland and its ~1890 islands. Everything not land-connected to a
 *  seed is trimmed from the map. */
export const GAME_LAND_SEEDS: Array<[number, number]> = [
  [15, 24], // mainland (central Sahara)
  [46.8, -19.5], // Madagascar
  [39.3, -6.1], // Zanzibar
  [39.72, -5.15], // Pemba
  [8.65, 3.5], // Bioko
  [52.95, 12.5], // Socotra (mostly beyond the dataset edge; kept if present)
]

// The Suez isthmus — the only land bridge between Africa and Asia inside the
// dataset. The keep-flood may not cross the boundary here; everywhere else
// the boundary runs over sea, which the flood cannot cross anyway.
const GATE = { lonMin: 31.9, lonMax: 34.7, latMin: 29.0 }

/**
 * Trim the DEM to the game world, in place: a flood fill from the game's
 * land seeds marks every texel land-connected to the walkable continent —
 * blocked from crossing the boundary at the Suez isthmus gate — and every
 * other land texel (Sinai, the Levant, Arabia, southern Europe, foreign
 * islands) is stamped to ocean: B channel 0 (ocean in the dataset's
 * land/coast-distance encoding) and the R/G elevation set below sea level.
 * Sea texels keep their real bathymetry, so the trimmed areas blend
 * seamlessly into the surrounding ocean. Pure over the RGBA pixel array —
 * no browser dependency (unit-tested in redSea.test.ts).
 */
export function trimToGameWorld(
  pixels: Uint8ClampedArray,
  meta: StampMeta,
  seeds: Array<[number, number]> = GAME_LAND_SEEDS,
): void {
  const { width, height } = meta
  const total = width * height
  const isLand = (idx: number) => pixels[idx * 4 + 2] > 0
  const gateBlocked = (idx: number): boolean => {
    const lon = meta.lonMin + ((idx % width) + 0.5) * meta.res
    if (lon < GATE.lonMin || lon > GATE.lonMax) return false
    const lat = meta.latMax - (((idx / width) | 0) + 0.5) * meta.res
    if (lat < GATE.latMin) return false
    return isNortheastOfBoundary(lat, lon)
  }
  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  for (const [lon, lat] of seeds) {
    const x = Math.round((lon - meta.lonMin) / meta.res - 0.5)
    const y = Math.round((meta.latMax - lat) / meta.res - 0.5)
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const idx = y * width + x
    if (!isLand(idx) || visited[idx]) continue
    visited[idx] = 1
    queue[tail++] = idx
  }
  const tryVisit = (idx: number) => {
    if (visited[idx] || !isLand(idx) || gateBlocked(idx)) return
    visited[idx] = 1
    queue[tail++] = idx
  }
  while (head < tail) {
    const idx = queue[head++]
    const x = idx % width
    if (x > 0) tryVisit(idx - 1)
    if (x < width - 1) tryVisit(idx + 1)
    if (idx >= width) tryVisit(idx - width)
    if (idx < total - width) tryVisit(idx + width)
  }
  // Deep open sea: matches the water shader's fully-deep tone (and its
  // outside-the-bbox mask), so trimmed areas read as plain open ocean with
  // no brighter rectangle against the surrounding sea.
  const stampedElevation = meta.offsetMeters - 3000
  const hi = (stampedElevation >> 8) & 0xff
  const lo = stampedElevation & 0xff
  const stamped = new Uint8Array(total)
  for (let idx = 0; idx < total; idx++) {
    if (visited[idx] || !isLand(idx)) continue
    stamped[idx] = 1
    const i = idx * 4
    pixels[i] = hi
    pixels[i + 1] = lo
    pixels[i + 2] = 0
  }
  // The northeast side of the boundary reads as plain open ocean in full:
  // shallow sea there — the Persian Gulf's banks, the Dahlak shelf, the
  // Levant shore — would otherwise stay behind as bright ghost shallows
  // beside the trimmed land. The African side keeps its real bathymetry.
  const shallowCap = meta.offsetMeters - 150 // above = shallower than 150 m
  for (let y = 0; y < meta.height; y++) {
    const lat = meta.latMax - (y + 0.5) * meta.res
    if (lat < BOX_LAT_MIN) break
    for (let x = Math.max(0, Math.floor((BOX_LON_MIN - meta.lonMin) / meta.res)); x < meta.width; x++) {
      const i = (y * meta.width + x) * 4
      if (pixels[i + 2] > 0) continue // land (kept)
      if (pixels[i] * 256 + pixels[i + 1] <= shallowCap) continue // already deep
      const lon = meta.lonMin + (x + 0.5) * meta.res
      if (!isNortheastOfBoundary(lat, lon)) continue
      pixels[i] = hi
      pixels[i + 1] = lo
    }
  }
  // Ghost shelves: a trimmed island would leave its shallow shelf behind as
  // a bright outline of the removed land. Deepen shallow sea near trimmed
  // texels (separable box dilation of the stamp mask), so trimmed land
  // leaves no trace; deep sea and shores of kept land stay untouched.
  const radius = Math.max(1, Math.round(0.3 / meta.res))
  const shallowLimit = meta.offsetMeters - 150 // above = shallower than 150 m
  const maskH = new Uint8Array(total)
  for (let y = 0; y < meta.height; y++) {
    const row = y * meta.width
    let count = 0
    for (let x = 0; x < meta.width + radius; x++) {
      if (x < meta.width && stamped[row + x]) count++
      const drop = x - 2 * radius - 1
      if (drop >= 0 && stamped[row + drop]) count--
      const cx = x - radius
      if (cx >= 0 && cx < meta.width && count > 0) maskH[row + cx] = 1
    }
  }
  for (let x = 0; x < meta.width; x++) {
    let count = 0
    for (let y = 0; y < meta.height + radius; y++) {
      if (y < meta.height && maskH[y * meta.width + x]) count++
      const drop = y - 2 * radius - 1
      if (drop >= 0 && maskH[drop * meta.width + x]) count--
      const cy = y - radius
      if (cy < 0 || cy >= meta.height || count === 0) continue
      const idx = cy * meta.width + x
      const i = idx * 4
      if (pixels[i + 2] > 0) continue // land (kept): untouched
      if (pixels[i] * 256 + pixels[i + 1] <= shallowLimit) continue // already deep
      pixels[i] = hi
      pixels[i + 1] = lo
    }
  }
}
