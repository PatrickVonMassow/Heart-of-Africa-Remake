// Northeast cut of the world (design.md §3.1/§11.2): the walkable continent
// ends at the African Red Sea coast. Everything northeast of this boundary —
// the Red Sea itself, Sinai/the Suez isthmus, the Levant and the Arabian
// peninsula up to the dataset edge — is open, impassable ocean, exactly like
// the sea around the rest of the continent. The boundary runs slightly
// seaward of the ~1890 African coast (data/coastline.ts, "Red Sea coast
// north to Suez" / "Gulf of Aden"): from the eastern Mediterranean across
// the Suez isthmus, down the Red Sea to Bab-el-Mandeb and out along the
// Gulf of Aden past the Horn. Used by the movement boundary (terrain.ts)
// and by the geodata load, which stamps the DEM's northeast texels to ocean
// (geodata.ts) so Sinai/Arabia are not rendered as land.

/** Boundary polyline as [lon, lat], northwest (Mediterranean) → southeast. */
export const NORTHEAST_BOUNDARY: Array<[number, number]> = [
  // Eastern Mediterranean down to the Suez isthmus (east of the Nile delta).
  [30.6, 39.0], [31.9, 34.2], [32.42, 31.45], [32.62, 30.4], [32.9, 29.7],
  // Seaward of the African Red Sea coast down to Bab-el-Mandeb.
  [33.4, 28.55], [33.9, 27.45], [34.65, 26.3], [35.4, 25.2], [36.15, 24.05],
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

/** Subset of the DEM metadata the stamping pass needs (see geodata.ts). */
export interface StampMeta {
  width: number
  height: number
  lonMin: number
  latMax: number
  res: number
  offsetMeters: number
}

/**
 * Stamp every land texel northeast of the boundary to ocean, in place:
 * B channel 0 (ocean in the dataset's land/coast-distance encoding) and the
 * R/G elevation set below sea level. Texels that already are ocean keep
 * their real bathymetry, so the Red Sea blends seamlessly into the
 * Mediterranean and the Gulf of Aden. Pure over the RGBA pixel array —
 * no browser dependency (unit-tested in redSea.test.ts).
 */
export function stampNortheastOcean(pixels: Uint8ClampedArray, meta: StampMeta): void {
  const stampedElevation = meta.offsetMeters - 1000 // -1000 m: plausible open sea
  const hi = (stampedElevation >> 8) & 0xff
  const lo = stampedElevation & 0xff
  const xStart = Math.max(0, Math.floor((BOX_LON_MIN - meta.lonMin) / meta.res))
  const yEnd = Math.min(meta.height, Math.ceil((meta.latMax - BOX_LAT_MIN) / meta.res))
  for (let y = 0; y < yEnd; y++) {
    const lat = meta.latMax - (y + 0.5) * meta.res
    for (let x = xStart; x < meta.width; x++) {
      const i = (y * meta.width + x) * 4
      if (pixels[i + 2] === 0) continue // already ocean: keep real bathymetry
      const lon = meta.lonMin + (x + 0.5) * meta.res
      if (!isNortheastOfBoundary(lat, lon)) continue
      pixels[i] = hi
      pixels[i + 1] = lo
      pixels[i + 2] = 0
    }
  }
}
