// The settlement's shadow-casting sun, handed to the post chain's sun shafts
// (Effects.tsx, quality key `godrays`). The light lives in the place scene,
// the post chain beside it; this is the one channel between them.
//
// The upstream GodraysNode samples `light.shadow.map.depthTexture`, captured
// when its shader is built, so the pass may only be built once that map
// exists. three's ShadowNode creates it on the first shadowed draw and keeps
// it for the light's lifetime, resizing it in place on a resolution change
// (the place scene no longer nulls the reference, point 345).

import type { DirectionalLight } from 'three/webgpu'

let published: DirectionalLight | null = null

/** The place scene publishes its sun on mount and clears it on unmount. */
export function publishGodraysLight(light: DirectionalLight | null): void {
  published = light
}

/** The published sun once its shadow map exists, else null (no shafts yet). */
export function readyGodraysLight(): DirectionalLight | null {
  const light = published
  if (!light || !light.castShadow) return null
  return light.shadow.map?.depthTexture ? light : null
}

/** The depth texture the pass would be built on (its identity keys a rebuild). */
export function godraysShadowTexture(light: DirectionalLight | null) {
  return light?.shadow.map?.depthTexture ?? null
}

/** The forward-scatter weight the post chain gives the shafts (CPU mirror of
 *  the TSL in Effects.tsx): `ambient` away from the sun, 1 looking into it. */
export function shaftsPhase(cosToSun: number, power: number, ambient: number): number {
  return ambient + (1 - ambient) * Math.pow(Math.max(cosToSun, 0), power)
}

/** The shaft structure the post chain adds (CPU mirror of the TSL in
 *  Effects.tsx, before gain and lobe): the pixel's lit share minus the mean of
 *  its taps rotated about the sun (a wedge's darkening kept at `wedgeShare`),
 *  scaled by the full ray's air light. */
export function shaftsStructure(litShare: number, taps: readonly number[], airLight: number, wedgeShare = 1): number {
  const mean = taps.reduce((a, b) => a + b, 0) / Math.max(taps.length, 1)
  const dev = litShare - mean
  return (dev > 0 ? dev : dev * wedgeShare) * airLight
}
