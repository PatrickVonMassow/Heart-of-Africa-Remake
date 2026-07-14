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
