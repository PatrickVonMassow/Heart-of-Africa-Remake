// Vector coastline distance (point 209). The sea coast staircased at close zoom
// because the shoreline was the 0.5-contour of a BINARY land/sea mask sampled
// from the DEM's blue channel (bilinear over a ~2.8 km texel grid), so the
// waterline could only cross 0.5 along the texel grid. This derives a SIGNED
// distance to the authored vector coastline (LAND_POLYGONS, ~265 points total)
// instead, so the shoreline is smooth at any zoom. It is brute-forced over every
// segment — cheap at this point count, and sampleTerrain only calls it in the
// near-coast band (a raster gate), so far-field vertices never pay for it and
// the deep-sea / trimmed acceptance coordinates keep the binary-mask verdict.
import { LAND_POLYGONS } from './data/coastline'

// Squared distance from point (px,py) to segment (ax,ay)-(bx,by). Coordinates
// are (lon,lat) in degrees; the near-coast band is small enough that the raw
// equirectangular metric is fine for a smooth shore ramp.
function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * dx
  const cy = ay + t * dy
  const ex = px - cx
  const ey = py - cy
  return ex * ex + ey * ey
}

/** Unsigned distance in degrees to the nearest coastline segment (all polygons,
 *  treated as closed rings). */
export function coastLineDistance(lat: number, lon: number): number {
  let best = Infinity
  for (const poly of LAND_POLYGONS) {
    const pts = poly.points
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n] // closed ring
      const d2 = pointSegDist2(lon, lat, a[0], a[1], b[0], b[1])
      if (d2 < best) best = d2
    }
  }
  return Math.sqrt(best)
}

// Even-odd ray test against one ring of [lon,lat] points.
function inRing(lon: number, lat: number, pts: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]
    const yi = pts[i][1]
    const xj = pts[j][0]
    const yj = pts[j][1]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** True when the point lies inside any land polygon (the vector land/sea sign). */
export function landInsideVector(lat: number, lon: number): boolean {
  for (const poly of LAND_POLYGONS) if (inRing(lon, lat, poly.points)) return true
  return false
}

/** Signed distance to the vector coastline in degrees: >0 on land, <0 at sea.
 *  The shoreline (0-crossing) is the true vector coast — smooth at any zoom. */
export function coastSignedDistance(lat: number, lon: number): number {
  const d = coastLineDistance(lat, lon)
  return landInsideVector(lat, lon) ? d : -d
}
