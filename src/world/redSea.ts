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
  [30.6, 39.0], [31.9, 34.2], [32.42, 31.45], [32.62, 30.4],
  // Clean crop of the Gulf-of-Suez HEAD (point 210, user decision): the head's
  // narrow water fingers, the thin isthmus strip east of them and the trim
  // stamp used to alternate cell-by-cell right at the old line and rendered as
  // a blocky stairstepped sea-arm east of Cairo. The line now hugs the gulf's
  // African WEST shore through the head (lat ~30.0 down to ~29.35, within
  // ~0.06 deg of the raster shore, so the near-boundary land-fraction rebuild
  // in terrain.ts covers every kept-side gap), putting the whole messy head —
  // including Suez itself — on the trimmed side: solid continent up to the
  // line, uniform deep ocean beyond. No knowledge that this was once the Red
  // Sea tip is kept; the game map simply ends here.
  [32.52, 30.02], [32.38, 29.62], [32.6, 29.36],
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

/**
 * Signed perpendicular distance (in degrees) to the boundary polyline:
 * POSITIVE on the southwest (kept-land) side, NEGATIVE on the northeast
 * (trimmed-ocean) side, growing with distance. Same closest-segment geometry
 * as `isNortheastOfBoundary` (its boolean is `≥ 0` on the NE side, i.e. this
 * value `≤ 0`). Used by the travel terrain (terrain.ts, point 210) to rebuild
 * the near-boundary land fraction as a smooth diagonal — the trim's hard
 * per-texel land/sea stamp otherwise staircases the Red-Sea/Suez coast, which
 * point 209's vector-coast smoothing does not cover (it is an artificial cut,
 * not a `LAND_POLYGONS` shore). Cheap far-field escape: points well southwest
 * of the boundary box return a large positive sentinel without the loop.
 */
export function boundarySignedDistance(lat: number, lon: number): number {
  if (lon < BOX_LON_MIN - 0.5 || lat < BOX_LAT_MIN - 0.5) return 99
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
  const dist = Math.sqrt(bestD)
  return bestCross >= 0 ? -dist : dist
}

// --- Swim margin (design.md §11.2) --------------------------------------------
// The traveller may wade only a calibratable band off the coast; deeper, farther
// water blocks. The Mediterranean is open sea, never a swimmable bight (design.md
// §11.2): its explicit gate blocks the sea off the delta, Alexandria and the Gulf
// of Sidra, which a coast-distance band alone would keep swimmable right at the
// shore. The African north coast itself lies south of MEDITERRANEAN_LAT_MIN only
// as land, so no legitimate swim water is caught.
export const MEDITERRANEAN_LAT_MIN = 30.2
export const MEDITERRANEAN_LON_MIN = -6.5

// Sensible starting width for the swimmable band (point 221): NARROW enough that
// the traveller cannot wade out into deep blue water, WIDE enough to keep the
// documented nearshore swim cases (Gulf of Guinea ~0.89 deg). The reported
// over-permit sat at ~1.18 deg off the SW Atlantic coast, so the former 1.2 deg
// let it through; a band at/under ~1.1 deg blocks it while every nearshore verdict
// (<=0.89 deg) stays swimmable. The live value is balance.oceanSwimMarginDeg
// (calibratable, debug-editable); this constant only documents the calibrated
// target the reported far-wade needs.
export const SWIM_MARGIN_DEG_DEFAULT = 1.0

/**
 * Movement verdict for an OCEAN cell (design.md §11.2): `true` = blocked. The
 * caller guards `type === 'ocean'` first; this decides swimmable-vs-blocked for
 * that sea cell. `coastDistanceDeg` is the horizontal distance (degrees) to the
 * nearest rendered coastline (the caller owns the metric); `marginDeg` is the
 * calibratable band width (balance.oceanSwimMarginDeg).
 *
 * The band is a CONSISTENT near-shore ring: the traveller wades a uniform
 * `marginDeg` off ANY coast and open/deep sea blocks everywhere. Northeast of
 * the Red-Sea boundary and throughout the Mediterranean the sea always blocks,
 * band or not.
 *
 * Point 221: this REPLACES the former convex-hull gate, whose seaward reach
 * depended on coast SHAPE — a convex cape blocked ~0 deg off the beach while a
 * concave bay wadeable ~1.4 deg, so the wadeable distance swung ~35x between
 * coasts (the reported "sometimes far into deep blue, sometimes only a little").
 * A pure coast-distance ring treats every coast identically; the open ocean is
 * blocked because it lies beyond `marginDeg` of any coast, so no separate hull
 * test is needed (and none of the acceptance blocks — the open Atlantic, the
 * Mozambique channel — depend on the hull: each is well beyond the band). It
 * opens no new land route: every strait to reachable land is either the Red-Sea
 * cut, the Mediterranean, or wider than the band on both sides.
 */
export function oceanSwimBlocked(
  lat: number,
  lon: number,
  coastDistanceDeg: number,
  marginDeg: number,
): boolean {
  if (isNortheastOfBoundary(lat, lon)) return true
  if (lat > MEDITERRANEAN_LAT_MIN && lon > MEDITERRANEAN_LON_MIN) return true
  return coastDistanceDeg > marginDeg
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
  // Two kinds of trimmed land (design.md §3.1/§21.4): removed OPEN-SEA land
  // (Crete, Sicily, the Canaries …) must read as plain deep ocean, while a
  // removed coastal spit or lagoon bar RIGHT AT a kept shore (the Nile
  // delta's bars) must read as the same shallow shelf as the sea around it —
  // a uniform deep stamp there punched dark angular holes into bright
  // coastal water (the blotchy sea off the delta). Near-shore stamps
  // therefore inherit the depth of the nearest kept sea (multi-source BFS);
  // everything else gets the uniform deep stamp.
  const stampedElevation = meta.offsetMeters - 3000
  const stamped = new Uint8Array(total)
  for (let idx = 0; idx < total; idx++) {
    if (visited[idx] || !isLand(idx)) continue
    stamped[idx] = 1
    pixels[idx * 4 + 2] = 0
  }
  const encAt = (idx: number) => pixels[idx * 4] * 256 + pixels[idx * 4 + 1]
  const writeEnc = (idx: number, val: number) => {
    pixels[idx * 4] = (val >> 8) & 0xff
    pixels[idx * 4 + 1] = val & 0xff
  }
  const neighbors = (idx: number): [number, number, number, number] => {
    const x = idx % width
    return [
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
      idx >= width ? idx - width : -1,
      idx < total - width ? idx + width : -1,
    ]
  }
  // Near-shore mask: separable box dilation of the KEPT land by ~0.6°.
  const shoreRadius = Math.max(1, Math.round(0.6 / meta.res))
  const nearShore = new Uint8Array(total)
  {
    const maskH = new Uint8Array(total)
    for (let y = 0; y < height; y++) {
      const row = y * width
      let count = 0
      for (let x = 0; x < width + shoreRadius; x++) {
        if (x < width && isLand(row + x)) count++
        const drop = x - 2 * shoreRadius - 1
        if (drop >= 0 && isLand(row + drop)) count--
        const cx = x - shoreRadius
        if (cx >= 0 && cx < width && count > 0) maskH[row + cx] = 1
      }
    }
    for (let x = 0; x < width; x++) {
      let count = 0
      for (let y = 0; y < height + shoreRadius; y++) {
        if (y < height && maskH[y * width + x]) count++
        const drop = y - 2 * shoreRadius - 1
        if (drop >= 0 && maskH[drop * width + x]) count--
        const cy = y - shoreRadius
        if (cy >= 0 && cy < height && count > 0) nearShore[cy * width + x] = 1
      }
    }
  }
  {
    // Near-shore stamps inherit the nearest kept sea depth.
    const assigned = new Int32Array(total).fill(-1)
    const bfs = new Int32Array(total)
    let bfsHead = 0
    let bfsTail = 0
    for (let idx = 0; idx < total; idx++) {
      if (!stamped[idx] || !nearShore[idx] || assigned[idx] >= 0) continue
      for (const nb of neighbors(idx)) {
        if (nb < 0 || stamped[nb] || isLand(nb)) continue
        assigned[idx] = encAt(nb)
        bfs[bfsTail++] = idx
        break
      }
    }
    while (bfsHead < bfsTail) {
      const idx = bfs[bfsHead++]
      const val = assigned[idx]
      for (const nb of neighbors(idx)) {
        if (nb < 0 || !stamped[nb] || !nearShore[nb] || assigned[nb] >= 0) continue
        assigned[nb] = val
        bfs[bfsTail++] = nb
      }
    }
    for (let idx = 0; idx < total; idx++) {
      if (!stamped[idx]) continue
      // Off-shore stamps and enclosed remainders without sea contact stay
      // plain deep.
      const val = nearShore[idx] && assigned[idx] >= 0 ? assigned[idx] : stampedElevation
      writeEnc(idx, val)
    }
  }
  // Point 235 (user decision 22.07.2026): hard-cut the map at the continent
  // edge. Beyond the near-shore shelf of the kept continent and its reachable
  // islands there is ONLY flat deep ocean — no shallow shelf, no bathymetric
  // relief, no unreachable-island scraps left floating in the sea. The user
  // reported such shallow-water "Fetzen" around the Red Sea, the Gulf of Aden
  // and the Horn (the Farasan/Dahlak banks, the Socotra-area shelf, the
  // Persian-Gulf banks, the Madagascar banks). This GENERALISES the point-210
  // Red-Sea clean-crop to the WHOLE offshore: every SEA texel outside the
  // kept-land near-shore band is forced to the uniform DEEP stamp value,
  // subsuming the former per-region deepening passes (the NE-boundary cap, the
  // Madagascar box and the ghost-shelf dilation) in one rule. Excluded, so the
  // coast still reads right: kept land; the near-shore band on the KEPT side;
  // and texels already at/below the deep floor (real ocean trenches are left
  // alone, never raised). The deep value is the same as the trimmed-land stamp
  // (offset − 3000 m, ~−1.9 in world height): well past the deep-tone
  // threshold, and terrain.ts's point-210b stamp clamp only re-shallows it in
  // the narrow band straddling the trim boundary (the intended Gulf-of-Suez
  // head), never far offshore.
  for (let idx = 0; idx < total; idx++) {
    if (pixels[idx * 4 + 2] > 0) continue // kept land
    if (encAt(idx) <= stampedElevation) continue // already at/below the deep floor
    if (nearShore[idx]) {
      // Preserve the coastal shelf, but only on the KEPT (continental) side.
      // The trimmed side (northeast of the NORTHEAST_BOUNDARY) reads uniform
      // deep even where it lies near kept land — the map ends at the boundary
      // (point 210: the Gulf-of-Suez head east of Cairo would otherwise keep a
      // pale shallow arm). The kept side's coastal shelf and the trimmed delta
      // bars that inherited it (design.md §21.4) stay shallow.
      const x = idx % width
      const lon = meta.lonMin + (x + 0.5) * meta.res
      const lat = meta.latMax - (((idx / width) | 0) + 0.5) * meta.res
      if (!isNortheastOfBoundary(lat, lon)) continue
    }
    writeEnc(idx, stampedElevation)
  }
}
