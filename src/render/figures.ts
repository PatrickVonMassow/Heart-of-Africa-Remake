// Tessellation of the close-range settlement primitives (design.md §2.6):
// segment counts high enough that neither the lighting facets nor the
// polygonal silhouette read at first-person range (the old 8-segment body
// cones and 10x8 head spheres visibly faceted). One constant per primitive
// family keeps the scenes and the pure floor test in step; the vertex cost
// is negligible (a handful of figures and props per place).

export const TESSELLATION = {
  /** Villager/figure body cone, radial segments. */
  figureBody: 24,
  /** Figure head sphere [width, height]. */
  figureHead: [20, 14],
  /** Headwrap/turban cap sphere [width, height]. */
  figureCap: [18, 12],
  /** Small spheres at reach: hands, roof finials [width, height]. */
  figureHand: [10, 8],
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
