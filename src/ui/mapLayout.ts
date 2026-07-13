// Pure layout data for the exploration map (design.md §19.11): the map frame
// bounds and one label anchor per region. Period atlases (~1890) write a
// region's name ONCE in spaced capitals across its heartland — not repeated
// along the borders — so the anchor is the centroid of the region's land
// cells, nudged onto region land if an odd shape (the east band around the
// Horn) pulls the centroid off it.

import { EXPLORE_CELL_DEG } from '../state/store'
import { CELL_OCEAN, cellAt } from '../world/geoIndex'
import { regionAt, type RegionId } from '../world/geo'

export const LON_MIN = -20
export const LON_MAX = 53
export const LAT_MIN = -37
export const LAT_MAX = 38

export const REGION_IDS: RegionId[] = ['north', 'west', 'central', 'east', 'south']

interface RegionStats {
  totals: Record<RegionId, number>
  anchors: Record<RegionId, { lat: number; lon: number }>
}

let statsCache: RegionStats | null = null

/** Land-cell counts and label anchors per region (computed once). */
export function regionStats(): RegionStats {
  if (statsCache) return statsCache
  const totals: Record<RegionId, number> = { north: 0, west: 0, central: 0, east: 0, south: 0 }
  const sumLat: Record<RegionId, number> = { north: 0, west: 0, central: 0, east: 0, south: 0 }
  const sumLon: Record<RegionId, number> = { north: 0, west: 0, central: 0, east: 0, south: 0 }
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += EXPLORE_CELL_DEG) {
    for (let lon = LON_MIN; lon < LON_MAX; lon += EXPLORE_CELL_DEG) {
      const cLat = lat + EXPLORE_CELL_DEG / 2
      const cLon = lon + EXPLORE_CELL_DEG / 2
      if (cellAt(cLat, cLon) === CELL_OCEAN) continue
      const r = regionAt(cLat, cLon)
      totals[r]++
      sumLat[r] += cLat
      sumLon[r] += cLon
    }
  }
  const anchors = {} as Record<RegionId, { lat: number; lon: number }>
  for (const r of REGION_IDS) {
    const n = Math.max(1, totals[r])
    let lat = sumLat[r] / n
    let lon = sumLon[r] / n
    // If the centroid falls off the region's own land (ocean, or across a
    // border), walk outward on a coarse spiral until it sits on it.
    if (cellAt(lat, lon) === CELL_OCEAN || regionAt(lat, lon) !== r) {
      let best: { lat: number; lon: number } | null = null
      let bestD = Infinity
      for (let dLat = -14; dLat <= 14; dLat += 1) {
        for (let dLon = -14; dLon <= 14; dLon += 1) {
          const aLat = lat + dLat
          const aLon = lon + dLon
          if (aLat < LAT_MIN || aLat > LAT_MAX || aLon < LON_MIN || aLon > LON_MAX) continue
          if (cellAt(aLat, aLon) === CELL_OCEAN || regionAt(aLat, aLon) !== r) continue
          const d = dLat * dLat + dLon * dLon
          if (d < bestD) {
            bestD = d
            best = { lat: aLat, lon: aLon }
          }
        }
      }
      if (best) {
        lat = best.lat
        lon = best.lon
      }
    }
    anchors[r] = { lat, lon }
  }
  statsCache = { totals, anchors }
  return statsCache
}
