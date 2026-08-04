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

/**
 * The villager figure's limbs (point 479). The figure was a cone with a sphere
 * head, which cannot show what it is talking about — and the pointing gesture is
 * what the HERE/THERE concepts hang on. Arms are therefore permanent; LEGS are
 * opt-in, because a floor-length wrap is the period dress for most of the adults
 * and legs under it would draw nothing. The running children get them.
 *
 * All values are FRACTIONS of the figure's body height, so a child at scale 0.55
 * carries the same proportions. The body cone spans y 0..1 with base radius 0.32
 * and tapers to a point, so the shoulder line sits where the cone is already
 * narrow (radius ≈ 0.064 at 0.8) and the arms read against the sky rather than
 * against the trunk.
 */
export const FIGURE_LIMBS = {
  /** Shoulder pivot height, in body heights. */
  shoulderY: 0.8,
  /** Shoulder pivot half-separation, in body heights. +x is the figure's LEFT. */
  shoulderX: 0.105,
  /** Arm length from shoulder to hand centre. */
  armLength: 0.5,
  /** Arm cylinder radii [top, bottom]. */
  armRadius: [0.048, 0.036] as [number, number],
  /** Hand sphere radius — the small sphere family already tessellated for reach. */
  handRadius: 0.058,
  /** Hip pivot height = leg length: the tunic ends here and the legs run down. */
  hipY: 0.38,
  /** Hip pivot half-separation. */
  hipX: 0.082,
  /** Leg cylinder radii [top, bottom]. */
  legRadius: [0.062, 0.048] as [number, number],
} as const
// The limb cylinders' RADIAL SEGMENT count is not here: it is a graphics-level
// lever (`figureLimbSegments` in src/config/quality.ts), read through
// `effectiveFigureLimbSegments`.

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
