// Shared "is this ground point inside the rendered frame" test (point 165).
// The wildlife guarantee-seeders run inside the Wildlife frame and have no
// camera; they must place animals OUTSIDE the frame so nothing pops into view
// (design.md §19.5/§19.6 — the user report: "sie sollen nur außerhalb des
// Sichtfeldes spawnen"). TravelScene installs the real test each frame from the
// bird's-eye camera (projecting to NDC); the point-172 lesson is that the true
// visible limit is the camera FRUSTUM, not an assumed 100×zoom radius, so this
// is a projection, never a radius. A small NDC margin treats the frame EDGE as
// on-screen, so a placement near the border (which camera jitter would flip in
// and out of view) is rejected too. Defaults to "everything off-screen" when no
// travel camera is mounted (settlement/boot), so a seeder never mis-fires there.
let test: (x: number, z: number) => boolean = () => false

/** NDC band around the frame edge the seeders also treat as on-screen: a
 *  placement there would flip in and out of view with the camera's own jitter. */
export const FRAME_EDGE_MARGIN = 0.18

/** The parts of a camera a projection needs — structural, so the rule can be
 *  exercised without building a renderer. */
export interface ProjectingCamera {
  projectionMatrix: { elements: ArrayLike<number> }
  matrixWorldInverse: { elements: ArrayLike<number> }
}

/**
 * Is a WORLD point inside the rendered frame of this camera? The one projection
 * rule in the code base — the travel scene's ground test below and the §17.8
 * label layer both go through it, so "is it in the picture" is answered the same
 * way everywhere (point 172: the true frustum, never an assumed radius).
 *
 * Written out rather than delegated to `Vector3.project` so it is callable with
 * a plain matrix pair, and so the behind-the-camera case is handled explicitly:
 * a point behind the lens has a negative clip w and would otherwise fold back
 * into the frame with its sign flipped.
 */
export function pointOnScreen(
  camera: ProjectingCamera,
  x: number,
  y: number,
  z: number,
  margin = 0,
): boolean {
  const v = camera.matrixWorldInverse.elements
  // Column-major, affine view matrix: no perspective row to carry.
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12]
  const vy = v[1] * x + v[5] * y + v[9] * z + v[13]
  const vz = v[2] * x + v[6] * y + v[10] * z + v[14]
  const p = camera.projectionMatrix.elements
  const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15]
  if (cw <= 0) return false // behind the camera
  const nx = (p[0] * vx + p[4] * vy + p[8] * vz + p[12]) / cw
  const ny = (p[1] * vx + p[5] * vy + p[9] * vz + p[13]) / cw
  const nz = (p[2] * vx + p[6] * vy + p[10] * vz + p[14]) / cw
  return nz < 1 && Math.abs(nx) <= 1 + margin && Math.abs(ny) <= 1 + margin
}

/** Installed by TravelScene each mount; projects a ground point via the live
 *  bird's-eye camera. */
export function setFrameVisibilityTest(fn: ((x: number, z: number) => boolean) | null): void {
  test = fn ?? (() => false)
}

/** Whether a ground point (x, z) is inside the rendered frame right now. */
export function isOnScreen(x: number, z: number): boolean {
  return test(x, z)
}
