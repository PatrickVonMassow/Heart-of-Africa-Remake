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

/** Relative luminance (0..1) of a linear-ish RGB triplet. */
export function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/**
 * Arc length a drifting silhouette has travelled along its panorama ring after
 * `elapsedSeconds` (point 255): radius × |angular drift rate| × time — the RAW
 * world arc. The gait does not read it directly: `panoramaGaitDistance` divides
 * it by the silhouette's render scale first (the raw arc over-drove the legs),
 * and that is what the panorama drift mover feeds the shared distance-driven
 * gait each frame, so a slower-drifting silhouette steps slower and a stalled
 * one not at all. Kept three-free (like the rest of this module) so the
 * drift→walk coupling is pure-testable.
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
 * direction. `panoramaDriftYaw` derives the same tangent itself; this one is
 * the tests' independent statement of the motion that the facing must match,
 * which is what keeps a silhouette from ever walking backward.
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

/**
 * The gait distance one walk step covers, in the silhouette's own rendered
 * frame (÷ scale, as `panoramaGaitDistance`): the arc between the angles
 * BEFORE and AFTER the step. Accumulated per frame, the legs ride exactly the
 * ground the body moved — a capped long frame, or a turn at the water, moves
 * both alike, so the legs never outrun the body.
 */
export function panoramaGaitStep(angleBefore: number, angleAfter: number, radius: number, scale: number): number {
  const s = scale > 0 ? scale : 1
  return Math.abs((angleAfter - angleBefore) * radius) / s
}

// The silhouettes' body-level stride motion used to be two cosmetic fudges: a
// |sin| bob of the body height and a |sin| fore/aft nod (point 255,
// `panoramaGaitBob` / `panoramaGaitNod`). Point 300 replaced both with the
// GEOMETRY. The vertical motion is now the dip onto whichever leg is planted
// (fauna `gaitBodyLift`), which is what puts the standing foot on the ground in
// the first place — two bobs would have fought each other. And the nod had to go
// with it: rocking the body about the feet LIFTS them (measured live, a 0.05 rad
// rock raised a planted horizon foot by 0.12 world units — the very hover this
// point is about), while a trotting quadruped's diagonal pairs stand at equal
// height anyway, so a real walk has no fore/aft rock to reproduce. The body's
// only pitch is now the ground slope it stands on.

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

// --- Keeping to dry ground (work-order 1250) ---------------------------------
//
// A silhouette walked its ring straight across the river the settlement stands
// on: the report showed a camel standing in the water at the far waterline. An
// animal on the horizon now keeps to dry ground: it starts on the nearest dry
// stretch of its ring and turns back where its next step would be water.

/** Ring angle's search step for the nearest dry ground (rad, ~0.6°). */
const DRY_SEARCH_STEP = 0.01

/**
 * The dry ring angle nearest `angle` — `angle` itself when it is dry — searched
 * both ways round; null when the whole ring is water.
 */
export function dryRingAngle(angle: number, wet: (a: number) => boolean): number | null {
  if (!wet(angle)) return angle
  for (let k = 1; k * DRY_SEARCH_STEP <= Math.PI; k++) {
    const d = k * DRY_SEARCH_STEP
    if (!wet(angle + d)) return angle + d
    if (!wet(angle - d)) return angle - d
  }
  return null
}

/**
 * One step of a silhouette's walk along its ring: on by `drift · dt`, or — where
 * that step would put it in the water — turned round where it stands, to walk
 * back the way it came. The drift's size never changes, only its sign.
 */
export function stepRingWalk(
  angle: number,
  drift: number,
  dt: number,
  wet: (a: number) => boolean,
): { angle: number; drift: number } {
  const next = angle + drift * dt
  return wet(next) ? { angle, drift: -drift } : { angle: next, drift }
}
