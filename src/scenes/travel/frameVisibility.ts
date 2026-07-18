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

/** Installed by TravelScene each mount; projects a ground point via the live
 *  bird's-eye camera. */
export function setFrameVisibilityTest(fn: ((x: number, z: number) => boolean) | null): void {
  test = fn ?? (() => false)
}

/** Whether a ground point (x, z) is inside the rendered frame right now. */
export function isOnScreen(x: number, z: number): boolean {
  return test(x, z)
}
