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
