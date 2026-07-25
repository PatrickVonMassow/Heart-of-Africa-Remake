// Sea-mouth shaping of the river courses (design.md §11.3, point 316).
//
// A river that reaches the sea does NOT arrive at full pace: the channel fans
// out over its delta, the bed gradient dies against sea level and the sea backs
// the water up, so the last reach is slack water. The game modelled the mouth
// as a funnel instead — full-strength current right up to the coast contour —
// and that turned the mouth junction into a TRAP. At the Nile's Rosetta mouth
// (~31.4N/30.4E) the channel's last stretch is a water finger poking into
// Mediterranean sea cells that are impassable in every direction: the drift
// there (0.32 deg/s without a canoe) outran the swim speed (0.28 deg/s), so a
// swimmer was pushed back into the finger's tip as fast as he could swim out of
// it — the reported softlock. Every other sea mouth had the same shape.
//
// The fix is the mouth's own geometry: the current RAMPS DOWN to nothing over
// the last `MOUTH_SLACK_DEG` of the course, so the water edge meets the coast
// with slack water instead of a one-way funnel. Nothing about the rendered
// ribbon, the mouth bridge (§11.3 point 211), the water mask or the ocean's
// impassability changes — only how hard the water pushes in the last reach.
//
// Dependency-light on purpose (data + the vector coast only), because
// world/hydro.ts consumes it while building its segment index and must not
// close a cycle back through terrain/geoIndex.

import { RIVERS_DATA, type RiverDef } from './data/rivers'
import { coastSignedDistance } from './coastVector'

/**
 * How far up its own course (degrees) a sea mouth's current is slackened: full
 * pace at this distance upstream, ramping to zero at the course end. ~0.6 deg
 * is ~65 km — the order of a real tidal/backwater reach, and wide enough that
 * the whole coast-locked pocket at a mouth stays swimmable against the drift
 * (see the escapability sweep in world/riverMouths.test.ts).
 */
export const MOUTH_SLACK_DEG = 0.6

/**
 * A course END counts as a SEA mouth when it lies this close to (or seaward of)
 * the ~1890 vector coastline. The real courses separate cleanly: every sea
 * mouth ends within 0.1 deg of the coast, while every tributary that ends at a
 * CONFLUENCE ends >2.6 deg inland — a confluence keeps its full current,
 * because it flows into another river, not into the sea.
 */
export const SEA_MOUTH_COAST_DEG = 0.5

/** Whether a course ends at the sea (as opposed to a confluence). */
export function isSeaMouthEnd(lat: number, lon: number): boolean {
  return coastSignedDistance(lat, lon) < SEA_MOUTH_COAST_DEG
}

/** Whether the given course (as authored, source → mouth) ends at the sea. */
export function isSeaMouthCourse(river: Pick<RiverDef, 'points'>): boolean {
  const [lon, lat] = river.points[river.points.length - 1]
  return isSeaMouthEnd(lat, lon)
}

/**
 * The current's strength factor at a point `distToEndDeg` along the course from
 * a SEA mouth: 0 at the mouth itself, rising linearly to the river's full pace
 * `MOUTH_SLACK_DEG` upstream. Confluence mouths never use this (see above).
 */
export function mouthSlackFactor(distToEndDeg: number, slackDeg = MOUTH_SLACK_DEG): number {
  if (slackDeg <= 0) return 1
  const t = distToEndDeg / slackDeg
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

/** Every river that empties into the sea, with its mouth coordinate. */
export function seaMouths(): Array<{ id: string; lat: number; lon: number }> {
  const out: Array<{ id: string; lat: number; lon: number }> = []
  for (const r of RIVERS_DATA) {
    if (!isSeaMouthCourse(r)) continue
    const [lon, lat] = r.points[r.points.length - 1]
    out.push({ id: r.id, lat, lon })
  }
  return out
}
