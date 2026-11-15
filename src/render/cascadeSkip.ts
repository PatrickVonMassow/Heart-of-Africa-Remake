// Skip the sun-shadow cascades no visible pixel samples (point 1524). The
// travel CSM splits 0.1..240 world units of view depth into three cascades,
// but the bird's-eye camera looks steeply down: at the default zoom the
// farthest visible ground lies ~33 units deep, inside cascade 0, so cascades
// 1 and 2 were re-rendered every frame for nothing (~40 % of the shadow
// draws). A cascade whose depth range — fade margin included — starts beyond
// the deepest visible ground keeps its last map (`shadow.autoUpdate = false`;
// no shader change); it renders again on the frame the view reaches it, before
// any pixel samples it, so the picture is unchanged.
import * as THREE from 'three/webgpu'
import { balance } from '../config/balance'

/**
 * How many leading cascades the view can sample. `breaks` are CSM's normalized
 * cascade ends (cascade i covers [breaks[i-1], breaks[i]] of the shadow
 * depth); with fade on, cascade j is sampled from `b - 0.25 b² / 2` below its
 * start b (CSMShadowNode's fade margin). `maxLinearDepth` is the deepest
 * visible point in the same normalized depth; `safety` widens the margin. PURE.
 */
export function cascadesInUse(breaks: readonly number[], maxLinearDepth: number, safety: number): number {
  for (let j = 1; j < breaks.length; j++) {
    const start = breaks[j - 1]
    const sampledFrom = start - 0.125 * start * start
    if (maxLinearDepth < sampledFrom * (1 - safety)) return j
  }
  return breaks.length
}

const corner = new THREE.Vector3()
const origin = new THREE.Vector3()
const forward = new THREE.Vector3()
const NDC_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

/**
 * The deepest view-space depth (along the optical axis) at which a frustum
 * corner ray meets the horizontal plane `groundY`; Infinity when a corner ray
 * does not descend to it (the horizon is in view). The corners bound the
 * visible ground of a camera looking down, since depth on a plane is linear in
 * screen position.
 */
export function deepestGroundDepth(camera: THREE.Camera, groundY: number): number {
  origin.setFromMatrixPosition(camera.matrixWorld)
  camera.getWorldDirection(forward)
  let deepest = 0
  for (const [x, y] of NDC_CORNERS) {
    corner.set(x, y, 0.5).unproject(camera).sub(origin)
    if (corner.y >= -1e-6) return Infinity
    const t = (groundY - origin.y) / corner.y
    if (t <= 0) return Infinity
    deepest = Math.max(deepest, corner.multiplyScalar(t).dot(forward))
  }
  return deepest
}

/**
 * useFrame priority of the cascade selection: AFTER every default-priority
 * callback (the travel camera follow moves the camera and its near plane at
 * priority 0) and BEFORE the post pipeline's render at priority 1
 * (render/Effects.tsx, which already owns rendering, so this positive priority
 * takes nothing over). Selecting on the previous frame's camera could expose a
 * cascade whose update is still off for one frame.
 */
export const CASCADE_SELECT_PRIORITY = 0.5

/** The render priority of the post pipeline in render/Effects.tsx. */
export const POST_RENDER_PRIORITY = 1

/** The CSM internals this needs (three r185 CSMShadowNode, untyped there). */
interface CascadeNode {
  breaks: number[]
  lights: Array<{ shadow: { autoUpdate: boolean } }>
  maxFar: number
}

/**
 * Per frame, before the render: let only the cascades in use re-render. The
 * ground plane sits `groundDrop` below the traveller's ground, so lower relief
 * in view can never fall outside the kept cascades. Returns the count in use.
 */
export function updateCascadeSkip(csm: unknown, camera: THREE.PerspectiveCamera, groundY: number): number {
  const node = csm as CascadeNode
  if (!Array.isArray(node.breaks) || !Array.isArray(node.lights) || node.breaks.length !== node.lights.length) return 0
  const cfg = balance.shadowCascadeSkip
  // The pose set this frame (lookAt leaves matrixWorld stale until the render).
  camera.updateMatrixWorld()
  let inUse = node.lights.length
  if (cfg.enabled) {
    const far = Math.min(camera.far, node.maxFar)
    const depth = deepestGroundDepth(camera, groundY - cfg.groundDrop)
    const linear = Number.isFinite(depth) ? (depth - camera.near) / (far - camera.near) : Infinity
    inUse = cascadesInUse(node.breaks, linear, cfg.safety)
  }
  for (let i = 0; i < node.lights.length; i++) node.lights[i].shadow.autoUpdate = i < inUse
  return inUse
}
