// The settlement's shadow-casting sun, handed to the post chain's sun shafts
// (Effects.tsx, quality key `godrays`). The light lives in the place scene,
// the post chain beside it; this is the one channel between them.
//
// The upstream GodraysNode samples `light.shadow.map.depthTexture`, captured
// when its shader is built, so the pass may only be built once that map
// exists. three's ShadowNode creates it on the first shadowed draw and keeps
// it for the light's lifetime (resizing in place); the place scene nulls the
// light's public reference when the shadow resolution changes, while the
// ShadowNode keeps drawing into the same render target. The first map seen is
// therefore remembered per light and restored, so a level round trip does not
// silently drop the shafts.

import type { DirectionalLight, RenderTarget } from 'three/webgpu'

let published: DirectionalLight | null = null
const seenMaps = new WeakMap<DirectionalLight, RenderTarget>()

/** The place scene publishes its sun on mount and clears it on unmount. */
export function publishGodraysLight(light: DirectionalLight | null): void {
  published = light
}

/** The published sun once its shadow map exists, else null (no shafts yet). */
export function readyGodraysLight(): DirectionalLight | null {
  const light = published
  if (!light || !light.castShadow) return null
  const map = light.shadow.map as RenderTarget | null
  if (map) {
    seenMaps.set(light, map)
  } else {
    const seen = seenMaps.get(light)
    if (!seen) return null
    light.shadow.map = seen as typeof light.shadow.map
  }
  return light.shadow.map?.depthTexture ? light : null
}

/** The depth texture the pass would be built on (its identity keys a rebuild). */
export function godraysShadowTexture(light: DirectionalLight | null) {
  return light?.shadow.map?.depthTexture ?? null
}
