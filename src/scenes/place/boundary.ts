// The settlement's walkable boundary — THE one source (design.md §2.6,
// work-order 352/488).
//
// Two consumers must agree on it and can never be allowed to drift: the leave
// check in PlaceScene (walking past the boundary swaps the scene, design.md
// §2.3) and the edge band painted on the ground, which tells the player where
// that boundary lies. A visible edge in the wrong place is worse than none,
// because the player will trust it — so the band does not carry a radius of its
// own. It reads THIS module, and only this module.
//
// Today the boundary is the layout's circle. Work-order 482 makes it something
// else in at least one place (a village whose reachable river bank breaks the
// circle); when it does, `placeBoundaryRadius` gains its angle dependence here
// and BOTH consumers follow without a second edit — the band already samples it
// per angle (`buildBoundaryLut`).

import type { PlaceLayout } from './layout'

/** How many angles the band's boundary lookup samples (see `buildBoundaryLut`). */
export const BOUNDARY_LUT_SIZE = 256

/**
 * The walkable radius at a bearing, in metres from the place centre. `angle` is
 * the world bearing `atan2(z, x)`, the same convention the band's shader uses.
 */
export function placeBoundaryRadius(layout: Pick<PlaceLayout, 'radius'>, _angle = 0): number {
  return layout.radius
}

/** True once the traveller has walked out of the settlement (the leave check). */
export function isOutsidePlace(layout: Pick<PlaceLayout, 'radius'>, x: number, z: number): boolean {
  return Math.hypot(x, z) > placeBoundaryRadius(layout, Math.atan2(z, x))
}

/**
 * The boundary sampled over the full turn, for the band's angle lookup: texel
 * `j` holds the radius at the centre of its angular slice, so the shader's
 * linear filtering lands on the boundary between samples too.
 */
export function buildBoundaryLut(layout: Pick<PlaceLayout, 'radius'>, size = BOUNDARY_LUT_SIZE): Float32Array {
  const out = new Float32Array(size)
  for (let j = 0; j < size; j++) {
    out[j] = placeBoundaryRadius(layout, ((j + 0.5) / size) * Math.PI * 2)
  }
  return out
}
