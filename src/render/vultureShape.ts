// The vulture's dimensions (design.md §19; point 1498): a white-backed /
// lappet-faced vulture is about 1 m long with a 2.2-2.7 m wingspan — the world
// unit is about a metre (a zebra is ~2.3 units nose to tail). Pure numbers, no
// three.js, so the landed-bird clearance rule (wildlifeBehavior.ts) can read
// the folded bird's reach without importing the render module. All values
// calibratable (CLAUDE.md §2).

export const VULTURE_SHAPE = {
  /** Render scale of the built bird; the geometry is built true to size. */
  renderScale: 1,
  /** Spread wingspan, tip to tip (units ≈ m). */
  span: 2.4,
  /** Inner-wing chord at the body (front to back). */
  chord: 0.5,
  /** Body (ellipsoid) half-length, half-width, half-height. */
  body: { halfLen: 0.3, halfWidth: 0.15, halfHeight: 0.13 },
  /** Tail: length behind the body and width at its end. */
  tail: { len: 0.24, width: 0.26 },
  /** Bare head radius, neck length and the beak length. */
  head: { r: 0.06, neck: 0.2, beak: 0.07 },
  /** Landed: the folded wing's half-length and how far its tip reaches past the tail. */
  folded: { halfLen: 0.36, over: 0.12 },
  /** Landed: leg length (the body rides this high above the feet). */
  leg: 0.22,
  /** Landed: the hunch — the body's nose-up pitch (rad). */
  hunch: 0.35,
} as const

/** The landed (folded) vulture's axis-aligned reach around its origin, in
 *  local units at render scale 1: x = half-width, y from the feet (min) to the
 *  head top (max), z from the tail tip (min) to the beak (max). A conservative
 *  box from the shape numbers — the built geometry lies inside it (tested). */
export function vultureLandedBox(): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  const v = VULTURE_SHAPE
  const halfW = v.body.halfWidth + 0.08 // the folded wings sit on the flanks
  const back = v.body.halfLen + v.folded.over + 0.06
  const front = v.body.halfLen + v.head.neck * 0.6 + v.head.r + v.head.beak
  return {
    minX: -halfW,
    maxX: halfW,
    minY: -(v.leg + v.body.halfHeight * 0.7),
    maxY: v.body.halfHeight + v.head.neck + v.head.r + 0.08,
    minZ: -back,
    maxZ: front,
  }
}

/** The eight corners of `vultureLandedBox`, for the posed clearance rule. */
export function vultureLandedCorners(): [number, number, number][] {
  const b = vultureLandedBox()
  const out: [number, number, number][] = []
  for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) out.push([x, y, z])
  return out
}
