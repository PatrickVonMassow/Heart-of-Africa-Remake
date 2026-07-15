// Self-drawing exploration map (design.md §19.11): a period atlas plate
// (~1890) that fills in as the continent is explored. The rendering follows
// the conventions of engraved 1890s atlases (George Philip, Johnston): a
// graticule with degree labels inside a piano-key border, blue water ink
// (rivers, lakes, coastal hatching) against sepia land ink, hachure marks for
// sighted mountains, each region's name ONCE in spaced capitals across its
// heartland, a title cartouche with a scale bar — all on worn paper (folds,
// stains, darkened corners) under the fog of war that exploration clears.

import { useEffect, useMemo, useRef } from 'react'
import { useGame, exploreCellKey, EXPLORE_CELL_DEG } from '../state/store'
import { useUi } from '../state/ui'
import { PLACES, REGION_BORDERS, regionAt, worldToLatLon } from '../world/geo'
import { useStrings } from '../i18n'
import { LAND_POLYGONS } from '../world/data/coastline'
import { RIVERS_DATA } from '../world/data/rivers'
import { LAKES } from '../world/data/lakes'
import { MOUNTAINS, WATERFALLS, CULTURAL_LANDMARKS } from '../world/data/landmarks'
import { CELL_OCEAN, cellAt } from '../world/geoIndex'
import { buildLayout, type Interactive } from '../scenes/place/layout'
import { placePlayerPosition } from '../scenes/place/playerPosition'
import type { BuildingType } from '../state/ui'
import { LON_MIN, LON_MAX, LAT_MIN, LAT_MAX, REGION_IDS, regionStats } from './mapLayout'

const W = 640
const H = Math.round((W * (LAT_MAX - LAT_MIN)) / (LON_MAX - LON_MIN))
const INK = '#4a3826'
const WATER_INK = '#41628a'
const REGION_INK = '#8c3a26'
const FRAME = 18 // margin hosting the piano-key border and degree labels

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

/** Deterministic 0..1 hash for dressing (stains, hachure jitter). */
function hash01(a: number, b = 0): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return h - Math.floor(h)
}

/** Spaced-capitals text, the period atlas style for region names. */
function drawSpacedCaps(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  const chars = [...text.toUpperCase()]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let cx = x - total / 2
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx + widths[i] / 2, y)
    cx += widths[i] + spacing
  }
}

export function MapOverlay() {
  const t = useStrings()
  const open = useUi((s) => s.mapOpen)
  const explored = useGame((s) => s.explored)
  const visitedPlaces = useGame((s) => s.visitedPlaces)
  const landmarksSeen = useGame((s) => s.landmarksSeen)
  const freeCamps = useGame((s) => s.freeCamps)
  const pos = useGame((s) => s.pos)
  const region = useGame((s) => s.region)
  const placeId = useGame((s) => s.placeId)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const regionPercent = useMemo(() => {
    if (!open) return 0
    const { totals } = regionStats()
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

    // --- Aged-paper base: warm gradient with deterministic mottling.
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#efe6cd')
    bg.addColorStop(1, '#e2d3ad')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 300; i++) {
      const rx = hash01(i, 1) * W
      const ry = hash01(i, 2) * H
      const rr = 5 + hash01(i, 3) * 26
      ctx.globalAlpha = 0.035
      ctx.fillStyle = i % 2 ? '#b6984f' : '#c8b483'
      ctx.beginPath()
      ctx.arc(rx, ry, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    const isExplored = (lon: number, lat: number) => explored[exploreCellKey(lat, lon)] === true

    // --- Coastal hatching (period convention): fine water-blue fringes fading
    // seaward. Clipped to the sea via an evenodd land mask so the land side
    // stays clean; drawn under the fog, so unexplored fringes stay hidden.
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    for (const poly of LAND_POLYGONS) {
      const pts = poly.points
      const [sx, sy] = project(pts[0][0], pts[0][1])
      ctx.moveTo(sx, sy)
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = project(pts[i][0], pts[i][1])
        ctx.lineTo(px, py)
      }
      ctx.closePath()
    }
    ctx.clip('evenodd')
    for (const [width, alpha] of [
      [9, 0.07],
      [5.5, 0.11],
      [3, 0.16],
    ] as const) {
      ctx.lineWidth = width
      ctx.strokeStyle = WATER_INK
      ctx.globalAlpha = alpha
      for (const poly of LAND_POLYGONS) {
        const pts = poly.points
        ctx.beginPath()
        let started = false
        for (let i = 0; i <= pts.length; i++) {
          const [lonA, latA] = pts[i % pts.length]
          // Fringe segments obey exploration like the coast ink itself.
          if (!isExplored(lonA, latA)) {
            started = false
            continue
          }
          const [px, py] = project(lonA, latA)
          if (!started) {
            ctx.moveTo(px, py)
            started = true
          } else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
    }
    ctx.restore()
    ctx.globalAlpha = 1

    const drawPolyline = (
      points: Array<[number, number]>,
      close: boolean,
      width: number,
      alpha: number,
      color = INK,
    ) => {
      ctx.lineWidth = width
      ctx.strokeStyle = color
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

    // Water in blue ink (period two-colour convention), coast in dark sepia.
    for (const lake of LAKES) drawPolyline(lake.points, true, 1.3, 0.85, WATER_INK)
    for (const river of RIVERS_DATA) drawPolyline(river.points, false, 1.1, 0.75, WATER_INK)
    for (const poly of LAND_POLYGONS) drawPolyline(poly.points, true, 1.8, 0.9)

    // --- Hachure clusters for explored mountains (period relief drawing);
    // sighted ones (design.md §17.2) carry their name in small italics.
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.9
    for (let mi = 0; mi < MOUNTAINS.length; mi++) {
      const m = MOUNTAINS[mi]
      if (!isExplored(m.lon, m.lat)) continue
      const [x, y] = project(m.lon, m.lat)
      ctx.globalAlpha = 0.75
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.15 - (Math.PI * 0.7 * i) / 6 + (hash01(mi, i) - 0.5) * 0.2
        const r0 = 2 + hash01(mi, i + 10) * 1.5
        const r1 = r0 + 4 + hash01(mi, i + 20) * 3
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // --- Fog of war (design.md §19.11): the unexplored map lies under a
    // cloudy veil; each explored grid cell clears a soft window through it.
    const fog = document.createElement('canvas')
    fog.width = W
    fog.height = H
    const fctx = fog.getContext('2d')
    if (fctx) {
      fctx.fillStyle = 'rgba(126, 108, 78, 0.9)'
      fctx.fillRect(0, 0, W, H)
      for (let i = 0; i < 44; i++) {
        const bx = hash01(i, 4) * W
        const by = hash01(i, 5) * H
        const br = 30 + hash01(i, 6) * 90
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

    // --- Graticule every 10° with degree labels in the frame margin. Drawn
    // over the fog: the grid and its numbers are printed plate furniture (and
    // the working referent of the position query), not geography to discover.
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.7
    ctx.globalAlpha = 0.16
    for (let lon = -10; lon <= 50; lon += 10) {
      const [x] = project(lon, 0)
      ctx.beginPath()
      ctx.moveTo(x, FRAME)
      ctx.lineTo(x, H - FRAME)
      ctx.stroke()
    }
    for (let lat = -30; lat <= 30; lat += 10) {
      const [, y] = project(0, lat)
      ctx.beginPath()
      ctx.moveTo(FRAME, y)
      ctx.lineTo(W - FRAME, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 0.65
    ctx.fillStyle = '#efe6cd'
    ctx.font = '8px Georgia, serif'
    ctx.textAlign = 'center'
    const degLabel = (txt: string, x: number, y: number) => {
      // A parchment-bright halo keeps the number readable on the dark fog.
      ctx.fillStyle = '#efe6cd'
      ctx.fillText(txt, x + 0.7, y + 0.7)
      ctx.fillStyle = INK
      ctx.fillText(txt, x, y)
    }
    for (let lon = -10; lon <= 50; lon += 10) {
      const [x] = project(lon, 0)
      degLabel(`${Math.abs(lon)}°`, x, FRAME + 9)
      degLabel(`${Math.abs(lon)}°`, x, H - FRAME - 3)
    }
    ctx.textAlign = 'left'
    for (let lat = -30; lat <= 30; lat += 10) {
      const [, y] = project(0, lat)
      degLabel(`${Math.abs(lat)}°`, FRAME + 3, y + 3)
      ctx.textAlign = 'right'
      degLabel(`${Math.abs(lat)}°`, W - FRAME - 3, y + 3)
      ctx.textAlign = 'left'
    }
    ctx.globalAlpha = 1

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

    // --- Region names: ONCE per region in spaced capitals across its
    // heartland (period convention) — conceptual, so drawn over the fog.
    ctx.font = '600 17px Georgia, serif'
    ctx.fillStyle = REGION_INK
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.62
    const { anchors } = regionStats()
    for (const r of REGION_IDS) {
      const a = anchors[r]
      const [x, y] = project(a.lon, a.lat)
      drawSpacedCaps(ctx, t.regions[r], x, y + 6, 7)
    }
    ctx.globalAlpha = 1

    // --- Sighted landmarks (design.md §17.2): name in small italics — the
    // waterfalls with a tick, the cultural sites with a tiny square.
    ctx.font = 'italic 9.5px Georgia, serif'
    ctx.textAlign = 'center'
    for (const m of MOUNTAINS) {
      if (!landmarksSeen.includes(m.id)) continue
      const [x, y] = project(m.lon, m.lat)
      ctx.fillStyle = INK
      ctx.globalAlpha = 0.85
      ctx.fillText(t.landmarks[m.id] ?? m.id, x, y + 14)
    }
    for (const w of WATERFALLS) {
      if (!landmarksSeen.includes(w.id)) continue
      const [x, y] = project(w.lon, w.lat)
      ctx.strokeStyle = WATER_INK
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(x - 3, y - 3)
      ctx.lineTo(x, y + 2)
      ctx.lineTo(x + 3, y - 3)
      ctx.stroke()
      ctx.fillStyle = WATER_INK
      ctx.fillText(t.landmarks[w.id] ?? w.id, x, y + 12)
    }
    for (const c of CULTURAL_LANDMARKS) {
      if (!landmarksSeen.includes(c.id)) continue
      const [x, y] = project(c.lon, c.lat)
      ctx.fillStyle = INK
      ctx.globalAlpha = 0.9
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5)
      ctx.fillText(t.landmarks[c.id] ?? c.id, x, y + 13)
    }
    ctx.globalAlpha = 1

    // Visited places with symbol and name (ports: square, villages: hut).
    ctx.font = '11px Georgia, serif'
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
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

    // The current position is drawn as a DOM ".map-player" marker overlaid on
    // the canvas (engraved dot + pulsing ring, point 89), not a canvas cross.

    // --- Compass rose, top right: an eight-pointed engraved star.
    const cx = W - 58
    const cy = 62
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
    ctx.globalAlpha = 0.8
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, 19, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 14.5, 0, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 2
      const long = i % 2 === 0
      const rTip = long ? 17 : 10
      const rBase = 3
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * rTip, cy + Math.sin(a) * rTip)
      ctx.lineTo(cx + Math.cos(a + 0.5) * rBase, cy + Math.sin(a + 0.5) * rBase)
      ctx.lineTo(cx + Math.cos(a - 0.5) * rBase, cy + Math.sin(a - 0.5) * rBase)
      ctx.closePath()
      if (long) ctx.fill()
      else ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.font = 'bold 10px Georgia, serif'
    ctx.fillText('N', cx, cy - 23)
    ctx.globalAlpha = 1

    // --- Scale bar, bottom right (period "English Miles" bar).
    // 1° latitude ≈ 69 English miles; the bar spans 1000 miles.
    const milesPerPx = (69 * (LAT_MAX - LAT_MIN)) / H
    const barMiles = 1000
    const barW = barMiles / milesPerPx
    const sbX = W - FRAME - 14 - barW
    const sbY = H - FRAME - 26
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const segX = sbX + (barW / 4) * i
      if (i % 2 === 0) ctx.fillRect(segX, sbY, barW / 4, 4)
      else ctx.strokeRect(segX, sbY, barW / 4, 4)
    }
    ctx.font = '8px Georgia, serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(`${(barMiles / 4) * i}`, sbX + (barW / 4) * i, sbY - 3)
    }
    ctx.font = 'italic 9px Georgia, serif'
    ctx.fillText(t.mapOverlay.scaleMiles, sbX + barW / 2, sbY + 14)
    ctx.globalAlpha = 1

    // --- Piano-key border: double rule with alternating filled degree bands.
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
    ctx.globalAlpha = 0.92
    ctx.lineWidth = 1.6
    ctx.strokeRect(4.5, 4.5, W - 9, H - 9)
    ctx.lineWidth = 0.8
    ctx.strokeRect(10.5, 10.5, W - 21, H - 21)
    const band = (fromX: number, fromY: number, toX: number, toY: number, fill: boolean) => {
      if (fill) ctx.fillRect(fromX, fromY, toX - fromX, toY - fromY)
    }
    // Alternating 5° bands between the two rules on all four sides.
    for (let lon = -20; lon < 55; lon += 5) {
      const [x0] = project(Math.max(lon, LON_MIN), 0)
      const [x1] = project(Math.min(lon + 5, LON_MAX), 0)
      const filled = Math.round(lon / 5) % 2 === 0
      band(Math.max(x0, 5), 5, Math.min(x1, W - 5), 10, filled)
      band(Math.max(x0, 5), H - 10, Math.min(x1, W - 5), H - 5, filled)
    }
    for (let lat = -40; lat < 40; lat += 5) {
      const [, y1] = project(0, Math.max(lat, LAT_MIN))
      const [, y0] = project(0, Math.min(lat + 5, LAT_MAX))
      const filled = Math.round(lat / 5) % 2 === 0
      band(5, Math.max(y0, 5), 10, Math.min(y1, H - 5), filled)
      band(W - 10, Math.max(y0, 5), W - 5, Math.min(y1, H - 5), filled)
    }
    ctx.globalAlpha = 1

    // --- Title cartouche (bottom left): engraved double frame with the
    // continent name, a flourish and the plate subtitle.
    const bw = 218
    const bh = 74
    const bx = 30
    const by = H - 108
    ctx.fillStyle = 'rgba(235, 224, 195, 0.95)'
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.roundRect(bx, by, bw, bh, 3)
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.roundRect(bx + 4, by + 4, bw - 8, bh - 8, 2)
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.font = 'bold 30px Georgia, serif'
    ctx.textAlign = 'center'
    drawSpacedCaps(ctx, t.mapOverlay.continent, bx + bw / 2, by + 34, 5)
    // Flourish rule under the title.
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(bx + 26, by + 44)
    ctx.lineTo(bx + bw / 2 - 8, by + 44)
    ctx.moveTo(bx + bw / 2 + 8, by + 44)
    ctx.lineTo(bx + bw - 26, by + 44)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(bx + bw / 2, by + 44, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'italic 9.5px Georgia, serif'
    ctx.globalAlpha = 0.85
    ctx.fillText(t.mapOverlay.subtitle, bx + bw / 2, by + 60)
    ctx.globalAlpha = 1

    // --- Worn paper, over everything at low alpha: fold creases, ring
    // stains, darkened corners.
    ctx.globalAlpha = 0.07
    for (const fx of [W * 0.5] as const) {
      const g = ctx.createLinearGradient(fx - 7, 0, fx + 7, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.45, 'rgba(60,40,10,1)')
      g.addColorStop(0.55, 'rgba(255,250,230,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(fx - 7, 0, 14, H)
    }
    for (const fy of [H * 0.52] as const) {
      const g = ctx.createLinearGradient(0, fy - 7, 0, fy + 7)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.45, 'rgba(60,40,10,1)')
      g.addColorStop(0.55, 'rgba(255,250,230,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, fy - 7, W, 14)
    }
    ctx.globalAlpha = 0.05
    ctx.strokeStyle = '#7a4a18'
    for (const [sx, sy, sr] of [
      [W * 0.82, H * 0.2, 26],
      [W * 0.16, H * 0.34, 34],
      [W * 0.68, H * 0.62, 20],
    ] as const) {
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(sx + 2, sy + 1, sr + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const [cxr, cyr] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ] as const) {
      const g = ctx.createRadialGradient(cxr, cyr, 0, cxr, cyr, 90)
      g.addColorStop(0, 'rgba(70,45,12,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.globalAlpha = 0.13
      ctx.fillRect(cxr - 90, cyr - 90, 180, 180)
    }
    ctx.globalAlpha = 1
  }, [open, explored, visitedPlaces, landmarksSeen, freeCamps, pos, t])

  if (!open) return null
  if (placeId) return <PlacePlan placeId={placeId} />
  // Current position on the atlas, in the SAME projection as the map points
  // (point 89): a ".map-player" marker overlaid on the canvas, hidden only if
  // the position falls outside the plate.
  const ll = worldToLatLon(pos.x, pos.z)
  const [ppx, ppy] = project(ll.lon, ll.lat)
  const playerInside = ppx >= 0 && ppx <= W && ppy >= 0 && ppy <= H
  return (
    <div className="map-overlay">
      <header>
        <span>{t.mapOverlay.title}</span>
        <span className="map-progress">{t.mapOverlay.explored(t.regions[region], regionPercent)}</span>
        <button onClick={() => useUi.getState().toggleMap()}>{t.mapOverlay.close}</button>
      </header>
      <div className="map-canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} />
        {playerInside && (
          <div
            className="map-player map-player-dom"
            data-testid="map-player"
            style={{ left: `${(ppx / W) * 100}%`, top: `${(ppy / H) * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Settlement plan (design.md §6.1/§19.11 point 79): inside a place the map
 * shows a plan of the town instead of the continental atlas — the walkable
 * area with every functional (enterable) building marked and named, the
 * dwellings as unlabelled blocks and the lanes as light strokes, in the same
 * worn-paper ink style. Pure SVG over the deterministic layout, so it needs
 * no canvas and is fully assertable in jsdom.
 */
function PlacePlan({ placeId }: { placeId: string }) {
  const t = useStrings()
  const seed = useGame((s) => s.seed)
  const layout = useMemo(() => buildLayout(placeId, seed), [placeId, seed])
  const S = 560 // rendered square size
  const extent = layout.radius + 6
  const sx = (x: number) => (x / extent) * (S / 2)
  // Live "you are here" marker (point 89): the first-person player position is
  // shared from PlaceScene; a RAF loop moves the marker without a React
  // re-render. The initial transform is set in JSX so it is correct at first
  // paint (and assertable in jsdom, where RAF may not fire).
  const playerRef = useRef<SVGGElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const g = playerRef.current
      if (g) g.setAttribute('transform', `translate(${sx(placePlayerPosition.x)} ${sx(placePlayerPosition.z)})`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId])
  const label = (type: Interactive['type']) => (type === 'villager' ? t.labels.talkToElder : t.buildings[type as BuildingType])
  return (
    <div className="map-overlay map-place-plan">
      <header>
        <span>{t.mapOverlay.plan(t.places[placeId] ?? placeId)}</span>
        <button onClick={() => useUi.getState().toggleMap()}>{t.mapOverlay.close}</button>
      </header>
      <svg viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`} width={S} height={S} role="img">
        {/* Paper ground + settlement edge */}
        <rect x={-S / 2} y={-S / 2} width={S} height={S} fill="#eadfc2" />
        <circle r={sx(layout.radius)} fill="#e2d3ad" stroke={INK} strokeWidth={1.6} strokeDasharray="7 4" />
        {/* Lanes as light strokes */}
        {layout.paths.map((p, i) => (
          <polyline
            key={`p${i}`}
            points={p.points.map(([x, z]) => `${sx(x)},${sx(z)}`).join(' ')}
            fill="none"
            stroke="#c9b789"
            strokeWidth={Math.max(3, sx(p.width))}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* Non-functional dwellings: small unlabelled ink blocks */}
        {layout.dwellings.map((d, i) => (
          <rect
            key={`d${i}`}
            className="plan-dwelling"
            x={sx(d.x - d.r)}
            y={sx(d.z - d.r)}
            width={Math.max(3, sx(d.r * 2))}
            height={Math.max(3, sx(d.r * 2))}
            transform={`rotate(${(-d.rot * 180) / Math.PI} ${sx(d.x)} ${sx(d.z)})`}
            fill="none"
            stroke={INK}
            strokeWidth={1}
            opacity={0.55}
          />
        ))}
        {/* Functional, enterable buildings: filled markers with their names */}
        {layout.interactives.map((it, i) => (
          <g key={`f${i}`} className="plan-building">
            {it.type === 'villager' ? (
              <circle cx={sx(it.pos[0])} cy={sx(it.pos[1])} r={5} fill={REGION_INK} />
            ) : (
              <rect x={sx(it.pos[0]) - 6} y={sx(it.pos[1]) - 6} width={12} height={12} fill={REGION_INK} />
            )}
            <text className="plan-building-label" x={sx(it.pos[0])} y={sx(it.pos[1]) - 10} textAnchor="middle" fill={INK}>
              {label(it.type)}
            </text>
          </g>
        ))}
        {/* Southern entrance (the spawn corridor) */}
        <path
          d={`M 0 ${sx(layout.radius) + 12} L -7 ${sx(layout.radius) + 22} L 7 ${sx(layout.radius) + 22} Z`}
          fill={INK}
          opacity={0.8}
        />
        {/* "You are here" (point 89): an ink dot with a pulsing ring. */}
        <g
          className="map-player map-player-svg"
          data-testid="map-player"
          ref={playerRef}
          transform={`translate(${sx(placePlayerPosition.x)} ${sx(placePlayerPosition.z)})`}
        >
          <circle className="map-player-ring" r={10} />
          <circle className="map-player-halo" r={6} />
          <circle className="map-player-dot" r={4} />
        </g>
      </svg>
    </div>
  )
}
