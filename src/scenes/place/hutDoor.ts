// Village hut wall with its doorway CUT OUT (`VillageHut` in PlaceScene).
//
// The wall is a tapered 12-sided cylinder. A flat dark door laid against it
// left the wall bulging in front of the door plane at the middle of the door's
// chord, drawn as a bright wedge rising through the opening. Instead the wall
// is built here with the facet facing the door (+Z, local frame) removed below
// the lintel: the wall proper spans the other eleven facets at full height, a
// one-facet lintel closes the gap above the opening, and the dark door panel
// stands just BEHIND the removed facet, inside the hut body. A dark lining that
// only draws its inner faces closes the view into the hut at grazing angles,
// where a line of sight through the opening passes beside the panel.
//
// Every number is a multiple of the hut radius `r` or the wall height, so all
// hut kinds and sizes follow from this one builder.

/** Facets of the wall cylinder (unchanged from the former full wall). */
export const HUT_WALL_SEGMENTS = 12
/** Bottom radius of the wall as a factor of `r` (the wall tapers to `r` on top). */
export const HUT_WALL_FOOT = 1.06
/** Door opening height as a fraction of the wall height. */
export const HUT_DOOR_HEIGHT_FRACTION = 0.72
/** How far the door panel stands behind the removed facet's top chord, × r. */
const DOOR_SETBACK = 0.06
/** Half width of the door panel, × r — wider than the opening, hidden at its
 *  sides inside the neighbouring facets. */
const DOOR_HALF_WIDTH = 0.32
/** Panel thickness, × r. */
const DOOR_DEPTH = 0.03
/** The lining's dark floor sits this many metres above the hut floor: clear of
 *  the ground and of the stilt platform's top (0.06 above its base). */
const LINING_LIFT = 0.08

/** Arguments of one `cylinderGeometry` plus the mesh's centre height. */
export interface HutCylinder {
  y: number
  radiusTop: number
  radiusBottom: number
  height: number
  segments: number
  openEnded: boolean
  thetaStart: number
  thetaLength: number
}

export interface HutWallParts {
  /** The wall around everything but the door facet, full height. */
  wall: HutCylinder
  /** The door facet above the opening. */
  lintel: HutCylinder
  /** Dark inner lining over the whole wall, with floor and ceiling (drawn back
   *  faces only, so it shows from inside the hut and never from outside). */
  lining: HutCylinder
  /** Door panel box: centre and size, in the hut's local frame. */
  door: { x: number; y: number; z: number; width: number; height: number; depth: number }
  /** The opening itself: half-angle of the removed facet and its top height. */
  opening: { halfAngle: number; bottom: number; top: number }
}

/** Wall, lintel, lining and door panel of a hut of radius `r` and wall height
 *  `wallH` standing on a floor at `base`. Three.js places cylinder vertex
 *  `theta` at (sin θ, cos θ)·radius, so θ = 0 is the door direction (+Z). */
export function hutWallParts(r: number, wallH: number, base: number): HutWallParts {
  const facet = (Math.PI * 2) / HUT_WALL_SEGMENTS
  const half = facet / 2
  const foot = r * HUT_WALL_FOOT
  const doorH = wallH * HUT_DOOR_HEIGHT_FRACTION
  // Radius of the tapered wall at the door's top height.
  const lintelFoot = foot + (r - foot) * (doorH / wallH)
  const doorZ = r * Math.cos(half) - r * DOOR_SETBACK
  return {
    wall: {
      y: base + wallH / 2,
      radiusTop: r,
      radiusBottom: foot,
      height: wallH,
      segments: HUT_WALL_SEGMENTS - 1,
      openEnded: false,
      thetaStart: half,
      thetaLength: Math.PI * 2 - facet,
    },
    lintel: {
      y: base + doorH + (wallH - doorH) / 2,
      radiusTop: r,
      radiusBottom: lintelFoot,
      height: wallH - doorH,
      segments: 1,
      openEnded: true,
      thetaStart: -half,
      thetaLength: facet,
    },
    // Closed: its caps are the dark floor and ceiling seen through the opening.
    lining: {
      y: base + LINING_LIFT + (wallH - LINING_LIFT) / 2,
      radiusTop: r,
      radiusBottom: foot + (r - foot) * (LINING_LIFT / wallH),
      height: wallH - LINING_LIFT,
      segments: HUT_WALL_SEGMENTS,
      openEnded: false,
      // Vertices on the wall's own (θ = ±half + k·facet), so the lining lies
      // exactly on the wall facets.
      thetaStart: half,
      thetaLength: Math.PI * 2,
    },
    door: {
      x: 0,
      y: base + doorH / 2,
      z: doorZ - (r * DOOR_DEPTH) / 2,
      width: r * DOOR_HALF_WIDTH * 2,
      height: doorH,
      depth: r * DOOR_DEPTH,
    },
    opening: { halfAngle: half, bottom: base, top: base + doorH },
  }
}

/** `cylinderGeometry` args tuple of a part. */
export function cylinderArgs(c: HutCylinder): [number, number, number, number, number, boolean, number, number] {
  return [c.radiusTop, c.radiusBottom, c.height, c.segments, 1, c.openEnded, c.thetaStart, c.thetaLength]
}
