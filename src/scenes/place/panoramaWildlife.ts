// Pure geometry/colour helpers for the §2.5 panorama wildlife (points 92/94):
// the drifting silhouettes must read as FAR, small, hazed animals on the
// captured horizon band — never looming monuments and never hovering above or
// sunk below the visible ground line. Kept three-free so the sizing and haze
// are unit-testable.

/**
 * Clamp a silhouette's scale so the animal's subtended angle at `ringDist`
 * never exceeds `maxApparentAngleDeg` — a distant animal must read small. Only
 * ever SHRINKS: a base scale already small enough is kept (never enlarged).
 */
export function silhouetteScale(
  buildHeight: number,
  ringDist: number,
  maxApparentAngleDeg: number,
  baseScale: number,
): number {
  if (buildHeight <= 0 || ringDist <= 0) return baseScale
  const maxScale = (Math.tan((maxApparentAngleDeg * Math.PI) / 180) * ringDist) / buildHeight
  return Math.min(baseScale, maxScale)
}

/** Subtended angle (degrees) of a silhouette of world height `worldHeight` seen
 *  from the town centre at distance `ringDist`. */
export function apparentAngleDeg(worldHeight: number, ringDist: number): number {
  if (ringDist <= 0) return 90
  return (Math.atan2(worldHeight, ringDist) * 180) / Math.PI
}

/**
 * Atmospheric perspective: lerp a base silhouette colour toward the sky-horizon
 * tone by `mix` (0 = the flat dark base, 1 = full sky). Farther silhouettes
 * take a stronger mix so distance reads as haze rather than a black blob.
 */
export function hazeColor(
  base: readonly [number, number, number],
  sky: readonly [number, number, number],
  mix: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, mix))
  return [
    base[0] + (sky[0] - base[0]) * t,
    base[1] + (sky[1] - base[1]) * t,
    base[2] + (sky[2] - base[2]) * t,
  ]
}

/** Relative luminance (0..1) of a linear-ish RGB triplet, for the haze test. */
export function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/**
 * Arc length a drifting silhouette has travelled along its panorama ring after
 * `elapsedSeconds` (point 255): radius × |angular drift rate| × time. Feeding
 * this distance into the shared distance-driven gait (fauna `gaitPhase` →
 * `legSwingAngle`, or a minimal body sway `sin(gaitPhase(dist))`) makes a far
 * silhouette read as WALKING along the horizon rather than gliding — the swing
 * rides the ground it covers, exactly as the settlement goats' does, so a
 * slower-drifting silhouette steps slower and a stalled one not at all. Kept
 * three-free (like the rest of this module) so the drift→walk coupling is pure-
 * testable; the render wiring in the panorama drift mover reads it each frame.
 */
export function panoramaDriftDistance(radius: number, driftRate: number, elapsedSeconds: number): number {
  return Math.abs(radius * driftRate * elapsedSeconds)
}

/**
 * Velocity tangent of a silhouette drifting along the panorama ring at
 * ring-angle `a` with signed angular `driftRate` (point 286). The ring position
 * is (cos a, sin a)·radius, so d/dt is (−sin a, cos a)·(radius·driftRate): the
 * animal MOVES along this tangent and its sign flips with the drift direction.
 * Returned unnormalised (magnitude radius·|driftRate|) — callers take the
 * direction. Exposed so the facing is derived FROM the motion (never the other
 * way round), which is what keeps a silhouette from ever walking backward.
 */
export function panoramaDriftVelocity(a: number, radius: number, driftRate: number): [number, number] {
  return [-Math.sin(a) * radius * driftRate, Math.cos(a) * radius * driftRate]
}

/**
 * Facing yaw (rad) of a drifting silhouette in the codebase's atan2(vx, vz)
 * convention (yaw 0 = +z forward — the same rule the settlement goats face on,
 * `faceVelocity`). Derived straight from the ring velocity tangent, so the body
 * always faces where it MOVES and can never drift backward (point 286: the
 * former hand-written `−a + (drift>0 ? π : 0)` sat exactly π off the tangent, so
 * every silhouette moonwalked). A zero drift falls back to the +tangent so a
 * paused silhouette keeps a sane heading rather than snapping. radius drops out
 * of the atan2 (a positive scale), so only the drift sign matters here.
 */
export function panoramaDriftYaw(a: number, driftRate: number): number {
  const dir = driftRate < 0 ? -1 : 1
  return Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir)
}

/**
 * The gait-driving distance for a drifting panorama silhouette (point 286).
 * The silhouettes are ENLARGED (render `scale` ~3) so a far animal reads at
 * person size; feeding the raw world arc (`panoramaDriftDistance`) to the shared
 * `gaitPhase` therefore over-drove the legs by that factor — a run-in-place
 * flail over a body whose apparent horizon motion is a fraction of a degree per
 * second (the point-286 report). Expressing the arc in the silhouette's OWN
 * rendered frame — the world arc ÷ its scale — makes the leg cadence consistent
 * with the rendered body's translation (the same relationship the near, scale-1
 * settlement goats walk on): a slow drift yields slow steps, a stalled one none.
 * The drift sign is irrelevant (the distance is |·|); scale ≤ 0 falls back to 1.
 */
export function panoramaGaitDistance(
  radius: number,
  driftRate: number,
  scale: number,
  elapsedSeconds: number,
): number {
  const s = scale > 0 ? scale : 1
  return panoramaDriftDistance(radius, driftRate, elapsedSeconds) / s
}

/** Body bob as a fraction of the silhouette's own height — the walking rise and
 *  fall of the barrel, the cheapest legible stride cue at this distance. */
export const PANORAMA_GAIT_BOB = 0.028
/** Fore/aft nod (rad) of the body over a stride: a slight rocking, never a
 *  seesaw — the silhouette is only a couple of degrees tall. */
export const PANORAMA_GAIT_NOD = 0.05

/**
 * Vertical offset of a drifting silhouette's body at a gait phase (point 255).
 * `|sin|` puts TWO rises in each stride cycle — one per footfall, as a walking
 * quadruped's barrel does — and is exactly 0 at phase 0, so a silhouette that
 * covers no ground stands dead still instead of bobbing on a wall clock.
 *
 * The silhouettes are single merged meshes with no leg joints (the settlement
 * goats' pivoted rig would be invisible detail at this range), so the stride
 * reads through the body itself — but off the same distance-driven `gaitPhase`,
 * never off elapsed time: a faster-drifting animal steps faster, a stalled one
 * not at all.
 */
export function panoramaGaitBob(phase: number, bodyHeight: number): number {
  return Math.abs(Math.sin(phase)) * bodyHeight * PANORAMA_GAIT_BOB
}

/** Fore/aft body nod (rad) at a gait phase (point 255): one rock per stride,
 *  zero at rest, in antiphase to the bob so the animal dips as it rises onto
 *  the next step. */
export function panoramaGaitNod(phase: number): number {
  return Math.sin(phase) * PANORAMA_GAIT_NOD
}

/** An azimuth interval on the panorama ring, centred at `center` (radians,
 *  atan2(z, x)) with a half-width `half`. */
export interface AzimuthSpan {
  center: number
  half: number
}

/**
 * The azimuth span a fixed skyline landmark occupies as seen from the town
 * centre: its bearing atan2(z, x) ± (half its footprint's subtended angle plus a
 * clearance margin). A drifting silhouette inside this span would visibly cross
 * the monument (the Cairo "animals next to the pyramids" report, point 102), so
 * it is dropped rather than rendered in front of the landmark.
 */
export function excludedAzimuthSpan(
  px: number,
  pz: number,
  halfWidthWorld: number,
  marginRad: number,
): AzimuthSpan {
  const dist = Math.hypot(px, pz) || 1
  return { center: Math.atan2(pz, px), half: Math.atan2(halfWidthWorld, dist) + marginRad }
}

/** True if `azimuth` (radians) lies within any excluded span, wrapping cleanly
 *  across the ±π seam. */
export function isAzimuthExcluded(azimuth: number, spans: readonly AzimuthSpan[]): boolean {
  for (const s of spans) {
    const d = Math.atan2(Math.sin(azimuth - s.center), Math.cos(azimuth - s.center))
    if (Math.abs(d) <= s.half) return true
  }
  return false
}
