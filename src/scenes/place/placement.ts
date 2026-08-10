// Where a settlement's inhabitants stand, and how one that was never placed is
// recognised (work-order point 509).
//
// THE DEFECT. A life vignette that writes its figures' transforms only from its
// frame callback leaves them at the transform React gave them — the identity
// one, at the settlement origin. A figure that is at home (the walkers spend
// most of their day inside their hut) therefore stood at (0, 0, 0) for as long
// as it stayed there: several figures on one spot in the middle of the village,
// invisible to the eye but solid to a ray probe. An EXACT zero is the signature
// of a placement that never happened rather than of one that went wrong, and it
// is fixed where it is born — every inhabitant group is created AT its spot,
// and the state that follows only moves it from there.

/** A spot on the settlement's ground, in the layout's own coordinates. */
export interface PlaceSpot {
  x: number
  z: number
}

/** A drawn figure's transform, as the scene reports it. */
export interface FigureTransform {
  x: number
  y: number
  z: number
}

/**
 * How near the settlement origin still counts as being AT it (m). Tight on
 * PURPOSE: a transform nothing ever wrote is exactly (0, 0, 0), while a
 * villager may legitimately walk over the middle of its own village — a
 * generous radius would report that walk instead of the defect. What the
 * tolerance is for is float noise, not a zone.
 */
export const UNPLACED_EPS = 1e-3

/**
 * The transform an inhabitant group is BORN with: the spot its layout assigns
 * it. Every vignette creates its figures through this, so no figure exists for
 * even one frame at a transform no placement wrote.
 */
export function figureStance(spot: PlaceSpot): [number, number, number] {
  return [spot.x, 0, spot.z]
}

/**
 * True when a drawn inhabitant sits at the settlement origin although no spot
 * its layout hands out lies there — the unplaced transform of point 509.
 *
 * `anchors` is the settlement's own placement set (dwellings, vignette
 * stations, errand points). A settlement that genuinely puts someone at its
 * middle passes such an anchor and is not reported.
 */
export function unplacedInhabitant(
  p: FigureTransform,
  anchors: readonly PlaceSpot[] = [],
  eps: number = UNPLACED_EPS,
): boolean {
  if (Math.abs(p.x) > eps || Math.abs(p.y) > eps || Math.abs(p.z) > eps) return false
  return !anchors.some((a) => Math.abs(a.x) <= eps && Math.abs(a.z) <= eps)
}
