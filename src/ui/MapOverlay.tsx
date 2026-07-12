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
  const freeCamps = useGame((s) => s.freeCamps)
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
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, W, H)

    // --- Aged-parchment base: warm gradient, deterministic mottling, vignette.
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#efe6cd')
    bg.addColorStop(1, '#e3d4af')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 300; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453
      const h2 = Math.sin(i * 78.233) * 24634.6345
      const h3 = Math.sin(i * 5.137) * 1234.567
      const rx = (h1 - Math.floor(h1)) * W
      const ry = (h2 - Math.floor(h2)) * H
      const rr = 5 + (h3 - Math.floor(h3)) * 26
      ctx.globalAlpha = 0.035
      ctx.fillStyle = i % 2 ? '#b6984f' : '#c8b483'
      ctx.beginPath()
      ctx.arc(rx, ry, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.62)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(90,58,20,0.2)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)

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

    // --- Fog of war (design.md §19): the unexplored map lies under a cloudy
    // veil; each explored grid cell clears a soft window through it, so the ink
    // beneath shows only where the traveller has been. Built on an offscreen
    // canvas (destination-out clears the fog, not the parchment) then composited.
    const fog = document.createElement('canvas')
    fog.width = W
    fog.height = H
    const fctx = fog.getContext('2d')
    if (fctx) {
      fctx.fillStyle = 'rgba(126, 108, 78, 0.9)'
      fctx.fillRect(0, 0, W, H)
      // Faint cloud texture so the veil is not a flat wash.
      for (let i = 0; i < 44; i++) {
        const h1 = Math.sin(i * 33.71) * 9871.2
        const h2 = Math.sin(i * 71.13) * 4412.9
        const h3 = Math.sin(i * 17.9) * 2233.1
        const bx = (h1 - Math.floor(h1)) * W
        const by = (h2 - Math.floor(h2)) * H
        const br = 30 + (h3 - Math.floor(h3)) * 90
        const cl = fctx.createRadialGradient(bx, by, 0, bx, by, br)
        cl.addColorStop(0, i % 2 ? 'rgba(150,132,96,0.5)' : 'rgba(96,80,54,0.5)')
        cl.addColorStop(1, 'rgba(0,0,0,0)')
        fctx.fillStyle = cl
        fctx.fillRect(bx - br, by - br, br * 2, br * 2)
      }
      fctx.globalCompositeOperation = 'destination-out'
      const cellPx = (EXPLORE_CELL_DEG / (LON_MAX - LON_MIN)) * W
      const r = Math.max(6, cellPx * 2.2)
      for (const key of Object.keys(explored)) {
        const [ix, iy] = key.split('|').map(Number)
        const cLat = (iy + 0.5) * EXPLORE_CELL_DEG
        const cLon = (ix + 0.5) * EXPLORE_CELL_DEG
        const [x, y] = project(cLon, cLat)
        const grd = fctx.createRadialGradient(x, y, 0, x, y, r)
        grd.addColorStop(0, 'rgba(0,0,0,1)')
        grd.addColorStop(0.55, 'rgba(0,0,0,0.92)')
        grd.addColorStop(1, 'rgba(0,0,0,0)')
        fctx.fillStyle = grd
        fctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      fctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(fog, 0, 0)
    }

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

    // Region names on both sides of the borders (design.md §3) — a faded
    // sepia-red, conceptual and drawn over the fog like the borders.
    ctx.font = 'small-caps bold 13px Georgia, serif'
    ctx.fillStyle = '#8c3a26'
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.7
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

    // Free camps (design.md §6): each pitched camp is marked with an X.
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.6
    ctx.globalAlpha = 0.9
    for (const camp of freeCamps) {
      const [x, y] = project(camp.lon, camp.lat)
      ctx.beginPath()
      ctx.moveTo(x - 4, y - 4)
      ctx.lineTo(x + 4, y + 4)
      ctx.moveTo(x + 4, y - 4)
      ctx.lineTo(x - 4, y + 4)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

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

    // Small compass rose, top right (clear of the title cartouche).
    const cx = W - 46
    const cy = 46
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
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
    ctx.textAlign = 'center'
    ctx.font = '10px Georgia, serif'
    ctx.fillText('N', cx, cy - 19)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1

    // --- Decorative border frame: a double ink rule with a diamond chain, like
    // an engraved map border.
    const diamond = (dx: number, dy: number, s: number) => {
      ctx.beginPath()
      ctx.moveTo(dx, dy - s)
      ctx.lineTo(dx + s, dy)
      ctx.lineTo(dx, dy + s)
      ctx.lineTo(dx - s, dy)
      ctx.closePath()
      ctx.fill()
    }
    const m = 7
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
    ctx.globalAlpha = 0.92
    ctx.lineWidth = 2.4
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m)
    const inner = m + 7
    ctx.lineWidth = 1
    ctx.strokeRect(inner, inner, W - 2 * inner, H - 2 * inner)
    const mid = m + 3.5
    for (let x = inner; x <= W - inner; x += 13) {
      diamond(x, mid, 3)
      diamond(x, H - mid, 3)
    }
    for (let y = inner; y <= H - inner; y += 13) {
      diamond(mid, y, 3)
      diamond(W - mid, y, 3)
    }
    ctx.globalAlpha = 1

    // --- Title cartouche (bottom left): the continent name on a small scroll.
    const bw = 156
    const bh = 46
    const bx = 26
    const by = H - 68
    ctx.fillStyle = 'rgba(233, 221, 190, 0.94)'
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, 5)
    ctx.fill()
    ctx.stroke()
    // Rolled scroll ends.
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(bx, by + bh / 2, 5, 0, Math.PI * 2)
    ctx.arc(bx + bw, by + bh / 2, 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.font = 'bold 27px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(t.mapOverlay.continent.toUpperCase(), bx + bw / 2, by + bh / 2 + 9)
    ctx.textAlign = 'left'
  }, [open, explored, visitedPlaces, freeCamps, pos, t])

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
