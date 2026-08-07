// Freeing the render targets a cascaded shadow node holds (point 546).
//
// WHY. The bird's-eye sun, its target and its CSMShadowNode are MODULE
// singletons (point 96): a fresh node per mount renames the cascade uniform
// buffer in every shadow-receiving material and forces the renderer to re-link
// the whole travel program set. The singleton fixes that freeze — but it also
// means nothing ever tears the node down, and three frees a shadow map only
// when the light node is disposed. So the three cascade maps, allocated on the
// travel scene's first shadow render, stayed resident for the rest of the
// session: measured, every settlement visit after the first bird's-eye frame
// read three render targets above the same settlement seen before it, which is
// what the render-resource-leak invariant reported.
//
// The place scene has no such problem — its lights unmount with it and three
// frees their maps — so the fix makes the travel sun behave like every other
// light: give the maps back when the bird's-eye view is left.
//
// WHAT IS RELEASED, AND WHAT IS NOT. Only the render TARGETS are disposed, not
// the shadow node and not its `shadowMap` reference: three re-creates a render
// target's backend data the next time it is rendered into, so the cascade maps
// come back on the first bird's-eye frame after the settlement, while the node
// graph — and therefore the generated shader source point 96 is about — never
// changes. It is the same round trip the sun's resolution change already relies
// on, and the same one the place scene's own shadow maps make on every visit.

/** The disposable part of a render target — all this module needs of one. */
export interface DisposableTarget {
  dispose: () => void
}

/** One cascade of a CSM node: three's ShadowNode, narrowed to its shadow map.
 *  The map is null until the cascade has been rendered once. */
export interface CascadeShadowNode {
  shadowMap?: DisposableTarget | null
}

/** A CSMShadowNode, narrowed to the cascades it keeps. `_shadowNodes` is
 *  three-internal; it is read defensively so an upstream rename degrades to
 *  "nothing to release" instead of throwing in a scene teardown. */
export interface CascadedShadowNode {
  _shadowNodes?: readonly CascadeShadowNode[]
}

/**
 * Dispose the render target of every cascade that has one, and report how many
 * were handed back. Safe on a node that has never rendered (no maps yet), on a
 * missing node, and on a second call — three drops a destroyed target's dispose
 * listener, so disposing an already-freed map is a no-op on the renderer.
 */
export function releaseCascadeShadowMaps(csm: CascadedShadowNode | null | undefined): number {
  const cascades = csm?._shadowNodes
  if (!Array.isArray(cascades)) return 0
  let released = 0
  for (const cascade of cascades) {
    const map = cascade?.shadowMap
    if (!map || typeof map.dispose !== 'function') continue
    map.dispose()
    released++
  }
  return released
}
