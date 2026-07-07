// Self-drawing exploration map (design.md §19): the map fills in as a
// hand-drawn ink sketch while the continent is explored — coastlines, rivers
// and lakes appear only where the traveller has been. Includes the §17
// exploration overview (percentage of the current region explored).

import { useEffect, useMemo, useRef } from 'react'
import { useGame, exploreCellKey, EXPLORE_CELL_DEG } from '../state/store'
import { useUi } from '../state/ui'
import { PLACES, REGION_BORDERS, regionAt, regionBorderLabelAnchors, worldToLatLon, type RegionId } from '../world/geo'
import { useStrings } from '../i18n'
import { LAND_POLYGONS } from '../world/data/coastline'
import { RIVERS_DATA } from '../world/data/rivers'
import { LAKES } from '../world/data/lakes'
import { CELL_OCEAN, cellAt } from '../world/geoIndex'

const LON_MIN = -20
const LON_MAX = 53
const LAT_MIN = -37
const LAT_MAX = 38
const W = 620
const H = Math.round((W * (LAT_MAX - LAT_MIN)) / (LON_MAX - LON_MIN))
const INK = '#4a3826'

function project(lon: number, lat: number): [number, number] {
  return [((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W, ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H]
}

/** Deterministic small offset so strokes look hand-drawn. */
function wobble(lon: number, lat: number): [number, number] {
  const h = Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453
  const j1 = (h - Math.floor(h) - 0.5) * 0.18
  const h2 = Math.sin(lon * 39.346 + lat * 11.135) * 24634.6345
  const j2 = (h2 - Math.floor(h2) - 0.5) * 0.18
  return [lon + j1, lat + j2]
}

/** Total land cells per region on the exploration grid (computed once). */
let landTotals: Record<RegionId, number> | null = null
function getLandTotals(): Record<RegionId, number> {
  if (landTotals) return landTotals
  const totals: Record<RegionId, number> = { north: 0, west: 0, central: 0, east: 0, south: 0 }
  for (let lat = LAT_MIN; lat < LAT_MAX; lat += EXPLORE_CELL_DEG) {
    for (let lon = LON_MIN; lon < LON_MAX; lon += EXPLORE_CELL_DEG) {
      const cLat = lat + EXPLORE_CELL_DEG / 2
      const cLon = lon + EXPLORE_CELL_DEG / 2
      if (cellAt(cLat, cLon) === CELL_OCEAN) continue
      totals[regionAt(cLat, cLon)]++
    }
  }
  landTotals = totals
  return totals
}

export function MapOverlay() {
  const t = useStrings()
  const open = useUi((s) => s.mapOpen)
  const explored = useGame((s) => s.explored)
  const visitedPlaces = useGame((s) => s.visitedPlaces)
  const pos = useGame((s) => s.pos)
  const region = useGame((s) => s.region)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const regionPercent = useMemo(() => {
    if (!open) return 0
    const totals = getLandTotals()
    let count = 0
    for (const key of Object.keys(explored)) {
      const [ix, iy] = key.split('|').map(Number)
      const cLat = (iy + 0.5) * EXPLORE_CELL_DEG
      const cLon = (ix + 0.5) * EXPLORE_CELL_DEG
      if (cLat < LAT_MIN || cLat > LAT_MAX || cLon < LON_MIN || cLon > LON_MAX) continue
      if (cellAt(cLat, cLon) === CELL_OCEAN) continue
      if (regionAt(cLat, cLon) === region) count++
    }
    return Math.min(100, Math.round((count / Math.max(1, totals[region])) * 100))
  }, [open, explored, region])

  useEffect(() => {
    if (!open) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const isExplored = (lon: number, lat: number) => explored[exploreCellKey(lat, lon)] === true

    const drawPolyline = (points: Array<[number, number]>, close: boolean, width: number, alpha: number) => {
      ctx.lineWidth = width
      ctx.strokeStyle = INK
      ctx.globalAlpha = alpha
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const n = points.length
      const last = close ? n : n - 1
      let path = false
      for (let i = 0; i < last; i++) {
        const [ax, ay] = points[i]
        const [bx, by] = points[(i + 1) % n]
        // A segment is drawn once its midpoint area has been explored.
        const mx = (ax + bx) / 2
        const my = (ay + by) / 2
        if (!(isExplored(ax, ay) || isExplored(mx, my))) {
          if (path) {
            ctx.stroke()
            path = false
          }
          continue
        }
        const [wax, way] = wobble(ax, ay)
        const [wbx, wby] = wobble(bx, by)
        const [px, py] = project(wax, way)
        const [qx, qy] = project(wbx, wby)
        if (!path) {
          ctx.beginPath()
          ctx.moveTo(px, py)
          path = true
        }
        ctx.lineTo(qx, qy)
      }
      if (path) ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Coastline, lakes, rivers — appearing only where explored.
    for (const poly of LAND_POLYGONS) drawPolyline(poly.points, true, 1.7, 0.9)
    for (const lake of LAKES) drawPolyline(lake.points, true, 1.3, 0.8)
    for (const river of RIVERS_DATA) drawPolyline(river.points, false, 1.1, 0.7)

    // Region borders: dashed ink lines over land, always visible — they are
    // conceptual divisions, not geography waiting to be discovered.
    ctx.strokeStyle = INK
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.5
    ctx.setLineDash([5, 4])
    for (const line of REGION_BORDERS) {
      for (let s = 0; s < line.length - 1; s++) {
        const [lon0, lat0] = line[s]
        const [lon1, lat1] = line[s + 1]
        const steps = Math.max(1, Math.round(Math.hypot(lon1 - lon0, lat1 - lat0) / 0.4))
        let path = false
        for (let i = 0; i < steps; i++) {
          const aLon = lon0 + ((lon1 - lon0) * i) / steps
          const aLat = lat0 + ((lat1 - lat0) * i) / steps
          const bLon = lon0 + ((lon1 - lon0) * (i + 1)) / steps
          const bLat = lat0 + ((lat1 - lat0) * (i + 1)) / steps
          if (cellAt((aLat + bLat) / 2, (aLon + bLon) / 2) === CELL_OCEAN) {
            if (path) {
              ctx.stroke()
              path = false
            }
            continue
          }
          const [px, py] = project(aLon, aLat)
          const [qx, qy] = project(bLon, bLat)
          if (!path) {
            ctx.beginPath()
            ctx.moveTo(px, py)
            path = true
          }
          ctx.lineTo(qx, qy)
        }
        if (path) ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // Region names on both sides of the borders (design.md §3).
    ctx.font = 'italic 11px Georgia, serif'
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.55
    for (const a of regionBorderLabelAnchors(16, 1.7)) {
      if (cellAt(a.lat, a.lon) === CELL_OCEAN) continue
      const [x, y] = project(a.lon, a.lat)
      ctx.fillText(t.regions[a.region].toUpperCase(), x, y + 3)
    }
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1

    // Visited places with symbol and name.
    ctx.font = '11px Georgia, serif'
    ctx.fillStyle = INK
    for (const id of visitedPlaces) {
      const place = PLACES.find((p) => p.id === id)
      if (!place) continue
      const [x, y] = project(place.lon, place.lat)
      ctx.globalAlpha = 0.95
      if (place.kind === 'port') {
        ctx.fillRect(x - 3, y - 3, 6, 6)
      } else {
        ctx.beginPath()
        ctx.moveTo(x, y - 4)
        ctx.lineTo(x + 4, y + 3)
        ctx.lineTo(x - 4, y + 3)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 0.85
      ctx.fillText(t.places[place.id], x + 6, y + 3)
    }

    // Current position: red ink cross.
    const ll = worldToLatLon(pos.x, pos.z)
    const [px, py] = project(ll.lon, ll.lat)
    ctx.strokeStyle = '#8c2f22'
    ctx.lineWidth = 2
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(px - 5, py - 5)
    ctx.lineTo(px + 5, py + 5)
    ctx.moveTo(px + 5, py - 5)
    ctx.lineTo(px - 5, py + 5)
    ctx.stroke()

    // Small compass rose, bottom left.
    const cx = 40
    const cy = H - 48
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, cy + 12)
    ctx.lineTo(cx, cy - 12)
    ctx.moveTo(cx - 4, cy - 6)
    ctx.lineTo(cx, cy - 12)
    ctx.lineTo(cx + 4, cy - 6)
    ctx.stroke()
    ctx.fillText('N', cx - 4, cy - 20)
    ctx.globalAlpha = 1
  }, [open, explored, visitedPlaces, pos, t])

  if (!open) return null
  return (
    <div className="map-overlay">
      <header>
        <span>{t.mapOverlay.title}</span>
        <span className="map-progress">{t.mapOverlay.explored(t.regions[region], regionPercent)}</span>
        <button onClick={() => useUi.getState().toggleMap()}>{t.mapOverlay.close}</button>
      </header>
      <canvas ref={canvasRef} width={W} height={H} />
    </div>
  )
}
