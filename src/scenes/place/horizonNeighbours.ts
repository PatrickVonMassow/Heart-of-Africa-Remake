// Neighbours on the horizon (design.md §2.5): which other map point — a port,
// village or monument site — stands within sight of the place the traveller is
// in, at which BEARING, how large it appears, and where on the drawn ground its
// silhouette stands. Pure and three-free, so the rule is unit-testable.
//
// The rule is SYMMETRIC BY CONSTRUCTION: presence depends only on the map
// distance between the two points, and the bearing from B back to A is the
// bearing from A to B turned by 180°. There is no per-pair table — Giza sees
// Cairo for the same reason Cairo sees Giza.
//
// Scale: the map distance is expressed in place units through the backdrop's
// own compression (`BACKDROP_SCALE`, degrees per place unit), so a neighbour
// appears where the backdrop relief of that direction lies. Real 1890 sight
// lines are far shorter than the game's compressed map, so the apparent size is
// a calibratable symbolic compaction (`balance.horizonNeighbours.apparentScale`)
// of the silhouette's true height over that distance — falling as 1/distance.

import type { PlaceKind } from '../../world/geo'
import { BACKDROP_SCALE, PANORAMA_RADIUS, PANORAMA_RING_CLEARANCE } from './backdrop'
import { excludedAzimuthSpan, type AzimuthSpan } from './panoramaWildlife'

/** A map point that can be seen from another (a `PlaceDef` satisfies it). */
export interface SightPoint {
  id: string
  kind: PlaceKind
  lat: number
  lon: number
}

/** Flat equirectangular map distance in degrees — the map's own metric (geo.ts). */
export function mapDistanceDeg(a: SightPoint, b: SightPoint): number {
  return Math.hypot(b.lat - a.lat, b.lon - a.lon)
}

/** Compass bearing from `a` to `b` in radians, 0 = north, π/2 = east, in [0, 2π). */
export function mapBearing(a: SightPoint, b: SightPoint): number {
  const t = Math.atan2(b.lon - a.lon, b.lat - a.lat)
  return t < 0 ? t + 2 * Math.PI : t
}

/** Unit direction in the place frame for a compass bearing. The place frame is
 *  the backdrop's: +x east, −z north (backdrop.ts samples lat − z·s, lon + x·s). */
export function bearingDirection(bearing: number): { x: number; z: number } {
  return { x: Math.sin(bearing), z: -Math.cos(bearing) }
}

/** Points closer than this are the same site seen twice (a monument map point
 *  and its cultural landmark share one coordinate), never a neighbour. */
const SAME_SITE_DEG = 1e-6

export interface NeighbourInSight {
  point: SightPoint
  distanceDeg: number
  bearing: number
}

/** Every candidate within `sightDeg` of `from` (itself excluded), nearest first. */
export function neighboursInSight(
  from: SightPoint,
  candidates: readonly SightPoint[],
  sightDeg: number,
): NeighbourInSight[] {
  const out: NeighbourInSight[] = []
  for (const c of candidates) {
    if (c.id === from.id) continue
    const d = mapDistanceDeg(from, c)
    if (d <= SAME_SITE_DEG || d > sightDeg) continue
    out.push({ point: c, distanceDeg: d, bearing: mapBearing(from, c) })
  }
  return out.sort((p, q) => p.distanceDeg - q.distanceDeg)
}

/** What a neighbour's silhouette measures in metres of its own place frame. */
export interface SilhouetteMeasure {
  /** Top of the silhouette above its base. */
  heightM: number
  /** Horizontal reach from its origin (the radius of its footprint). */
  footprintM: number
}

export interface NeighbourSeatOptions {
  /** Symbolic compaction: apparent height = atan(apparentScale·heightM / D). */
  apparentScale: number
  /** Looming bound (§2.5): a neighbour never rises above this elevation. */
  maxElevationDeg: number
  /** Edge of the walkable ground disc in the neighbour's direction. */
  discEdge: number
  /** Gap kept between the disc edge and the silhouette's near side. */
  margin: number
}

export interface NeighbourSeat {
  /** Distance of the silhouette's origin from the place centre. */
  radius: number
  x: number
  z: number
  /** Compass bearing of the seat from the place centre (radians). */
  bearing: number
  /** Place units per metre of the silhouette at this seat. */
  scale: number
  /** Footprint radius at this seat across the line of sight, place units. */
  footprint: number
  /** Squash of the footprint ALONG the line of sight (0..1]: depth is invisible
   *  from the centre, so a wide silhouette is flattened radially to fit the
   *  room between the disc edge and the band rather than left out. */
  depth: number
  /** Elevation of its top as seen from the place centre, degrees. */
  elevationDeg: number
  /** Width it subtends from the place centre, degrees. */
  widthDeg: number
}

/** The map distance in place units, at the backdrop's compression. */
export function placeDistance(distanceDeg: number): number {
  return distanceDeg / BACKDROP_SCALE
}

/**
 * Where a neighbour's silhouette stands and how large it is drawn.
 *
 * The angular size is fixed by the map distance (1/D), so the SEAT radius only
 * decides depth: the silhouette goes as far out as its true distance, clamped
 * into the room the scene has — in front of the §2.5 panorama band, behind the
 * walkable disc's edge with its whole footprint. Null where no seat holds both
 * (the silhouette would have to overlap the disc or the band).
 */
export function seatNeighbour(
  bearing: number,
  distanceDeg: number,
  measure: SilhouetteMeasure,
  opts: NeighbourSeatOptions,
): NeighbourSeat | null {
  const D = placeDistance(distanceDeg)
  if (!(D > 0) || !(measure.heightM > 0)) return null
  // Place units per metre per unit of seat radius (the angular factor).
  let k = opts.apparentScale / D
  const tanMax = Math.tan((opts.maxElevationDeg * Math.PI) / 180)
  if (k * measure.heightM > tanMax) k = tanMax / measure.heightM
  const f = k * Math.max(0, measure.footprintM)
  const near = opts.discEdge + opts.margin
  const far = PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE
  // The room at radial squash `fd` (= f·depth): the near side R(1 − fd) clears
  // the disc, and the far corners — sqrt((R + R·fd)² + (R·f)²), conservative for
  // the ellipse — stay inside the band.
  const lo = (fd: number) => (fd < 1 ? near / (1 - fd) : Infinity)
  const hi = (fd: number) => far / Math.hypot(1 + fd, f)
  if (lo(0) > hi(0)) return null
  let fd = f
  if (lo(fd) > hi(fd)) {
    // Too deep for the room at full depth: flatten its radial extent to the
    // largest squash that still fits (width and height stay true).
    let a = 0
    let b = f
    for (let i = 0; i < 48; i++) {
      const m = (a + b) / 2
      if (lo(m) <= hi(m)) a = m
      else b = m
    }
    fd = a
  }
  const radius = Math.min(hi(fd), Math.max(lo(fd), D))
  const depth = f > 0 ? fd / f : 1
  const dir = bearingDirection(bearing)
  return {
    radius,
    x: dir.x * radius,
    z: dir.z * radius,
    bearing,
    scale: k * radius,
    footprint: f * radius,
    depth,
    elevationDeg: (Math.atan(k * measure.heightM) * 180) / Math.PI,
    widthDeg: (2 * Math.atan(f) * 180) / Math.PI,
  }
}

type FootprintSeat = Pick<NeighbourSeat, 'x' | 'z' | 'footprint' | 'depth' | 'bearing'>

/** Sample points of a seat's footprint: its origin and a ring on its outline —
 *  an ellipse, `footprint` across the line of sight and `footprint·depth`
 *  along it. */
export function footprintSamples(seat: FootprintSeat, ring = 12): Array<[number, number]> {
  const radial = bearingDirection(seat.bearing)
  const across = { x: -radial.z, z: radial.x }
  const pts: Array<[number, number]> = [[seat.x, seat.z]]
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2
    const u = Math.cos(a) * seat.footprint
    const v = Math.sin(a) * seat.footprint * seat.depth
    pts.push([seat.x + across.x * u + radial.x * v, seat.z + across.z * u + radial.z * v])
  }
  return pts
}

/**
 * The base height of a neighbour silhouette: the LOWEST drawn ground under its
 * footprint (`standY` is `panoramaStandY` — the higher of the backdrop relief
 * and the eye's line over the disc edge, the point-181 footing rule), less a
 * sink. Taking the lowest means no part of the base hangs above the ground it
 * covers; a rise elsewhere under it only hides part of it, a normal depth
 * relationship.
 */
export function neighbourBaseY(
  seat: FootprintSeat,
  standY: (x: number, z: number) => number,
  sink: number,
): number {
  let lowest = Infinity
  for (const [x, z] of footprintSamples(seat)) lowest = Math.min(lowest, standY(x, z))
  return lowest - Math.max(0, sink)
}

/** The azimuth arcs the seated neighbours occupy (their width across the line
 *  of sight plus a margin), so no drifting panorama silhouette crosses one
 *  (design.md §2.5, point 102). */
export function neighbourExclusionSpans(
  seats: ReadonlyArray<Pick<NeighbourSeat, 'x' | 'z' | 'footprint'>>,
  marginDeg: number,
): AzimuthSpan[] {
  const marginRad = (marginDeg * Math.PI) / 180
  return seats.map((s) => excludedAzimuthSpan(s.x, s.z, s.footprint, marginRad))
}
