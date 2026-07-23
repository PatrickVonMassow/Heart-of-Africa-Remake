// Live render handles (renderer, scene, camera, frame clock) published from
// inside the R3F canvas so non-React code can reach them.
//
// Unlike `window.__renderer` this is NOT dev-gated: the in-game benchmark
// (design.md §21.1, F8) ships in the delivered build and needs the renderer's
// `info` counters, the scene graph and — above all — the frame clock it pins
// to a fixed timestep. Holding the handles costs nothing; nothing reads them
// unless asked.

import type * as THREE from 'three/webgpu'

export interface RenderContext {
  gl: THREE.WebGPURenderer
  scene: THREE.Scene
  camera: THREE.Camera
  /** R3F's frame clock: `getDelta()` is read once per frame and handed to
   *  every `useFrame` (benchmark.ts pins it for a deterministic run). */
  clock: THREE.Clock
}

let context: RenderContext | null = null

export function setRenderContext(ctx: RenderContext | null): void {
  context = ctx
}

export function getRenderContext(): RenderContext | null {
  return context
}
