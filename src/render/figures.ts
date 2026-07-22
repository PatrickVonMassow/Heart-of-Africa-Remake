// Tessellation of the close-range settlement primitives (design.md §2.6):
// segment counts high enough that neither the lighting facets nor the
// polygonal silhouette read at first-person range (the old 8-segment body
// cones and 10x8 head spheres visibly faceted). One constant per primitive
// family keeps the scenes and the pure floor test in step; the vertex cost
// is negligible (a handful of figures and props per place).

export const TESSELLATION = {
  /** Villager/figure body cone, radial segments. At 24 the cone still read
   *  as faceted panels at conversation range (point 214 close-zoom report):
   *  the material never flat-shades and ConeGeometry's lateral normals are
   *  already smooth per column, so the panels were the RESIDUAL per-face
   *  normal interpolation (15° spread per face — Mach banding) plus the
   *  24-gon outline. 48 halves the spread to 7.5°, below what reads at
   *  first-person range; a handful of figures per place makes this free. */
  figureBody: 48,
  /** Figure head sphere [width, height] — the roundest primitive the eye
   *  gets close to; raised with the fauna smoothing (point 214) so no facet
   *  reads on a head at conversation range. */
  figureHead: [24, 16],
  /** Headwrap/turban cap sphere [width, height]. */
  figureCap: [20, 14],
  /** Small spheres at reach: hands, roof finials [width, height]. */
  figureHand: [12, 9],
  /** Hut roof cone, radial — the eye passes within metres of these. */
  hutRoof: 24,
  /** Hut dome sphere [width, height]. */
  hutDome: [24, 12],
  /** Granary cones (roof and body), radial. */
  granary: 18,
  /** Mortar bowl, radial. */
  mortar: 14,
  /** Pestle shaft, radial. */
  pestle: 10,
  /** Rounded goods at stalls (bread mounds, pots, finial balls) [w, h]. */
  goods: [16, 10],
} as const

/** The bird's-eye traveller's backpack (the brown carry-crate), consumed by
 *  the traveller build in `src/scenes/travel/TravelScene.tsx`.
 *
 *  Forward-axis convention: the traveller's inner group yaws with
 *  `rotation.y = Math.atan2(dx, dz)`, which maps the group's LOCAL +Z axis
 *  onto the travel direction — local +Z is the figure's FRONT, local -Z its
 *  BACK. The pack therefore carries a NEGATIVE z offset so it rides behind
 *  the torso (the torso box spans z -0.14..+0.14); at +0.2 it hung on the
 *  chest, facing the camera whenever the traveller walked toward the viewer
 *  (user report 22.07.2026). Size and material are unchanged — only the
 *  side. */
export const TRAVELLER_PACK = {
  /** Box size [width, height, depth]. */
  size: [0.32, 0.38, 0.16],
  /** Local offset in the yawing figure group; z < 0 = on the BACK. */
  offset: [0, 0.72, -0.2],
} as const
