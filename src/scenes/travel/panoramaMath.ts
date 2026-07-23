// Pure geometry of the travel-scene panorama (point 81): sector layout of
// the 360° horizon band and its mapping onto the first-person horizon
// cylinder. Kept three-free so the direction-trueness is unit-testable.

/** Number of camera sectors stitched side by side into the band texture. */
export const CAPTURE_SECTORS = 4
/** Horizontal field of view per sector (sectors close the full circle). */
export const SECTOR_H_FOV_DEG = 360 / CAPTURE_SECTORS
/** Vertical field of view of the band (centred on the horizon). */
export const BAND_V_FOV_DEG = 44

/**
 * Camera yaw for sector k. three's yaw 0 looks along -Z (map north in both
 * scenes: +z is south, +x east); positive yaw turns CCW (toward west), so
 * successive sectors step by -90° to sweep N → E → S → W, matching the
 * left-to-right texture order.
 */
export function sectorYaw(k: number): number {
  return -k * (SECTOR_H_FOV_DEG * Math.PI) / 180
}

/**
 * Texture U for a world direction (dx, dz) from the capture point. Sector k
 * covers u ∈ [k/4, (k+1)/4]; its camera looks along k·90° (N, E, S, W), and
 * WITHIN a sector the perspective image is linear in tan(angle from the
 * sector centre), not in the angle itself — the mapping honours that, so a
 * direction lands exactly on the pixel column that photographed it.
 */
export function directionToU(dx: number, dz: number): number {
  // atan2(east, north): 0 at north, +90° at east — the capture sweep order.
  const a = Math.atan2(dx, -dz)
  const half = Math.PI / 2
  const k = Math.round(a / half)
  const local = a - k * half // -45°..45° within the sector
  const u = (k + (Math.tan(local) + 1) / 2) / CAPTURE_SECTORS
  return ((u % 1) + 1) % 1
}

/**
 * EMPIRICAL BAND CONVENTION (point 90, pinned 14.07.2026 on the WebGL2
 * path): the captured band stores content at the NEGATED compass angle —
 * a landmark at true bearing a appears at the buffer column of -a (slice k
 * therefore holds compass [N, W, S, E][k]). Verified against the Giza field
 * (true 259.3°, measured u 0.405 = mirrored 256.5°) and the Nubian Nile
 * water fractions. Consumers sample the buffer via bufferU (the mirror of
 * directionToU); the WebGPU path needs its own manual confirmation.
 */
export function bufferU(dx: number, dz: number): number {
  // The mirror of directionToU: negate the east component.
  return directionToU(-dx, dz)
}

/** Compass meaning of readback slice k under the mirrored convention. */
export const SECTOR_COMPASS = ['N', 'W', 'S', 'E'] as const

/**
 * Height of the horizon cylinder that shows the band at radius r: the band
 * spans ±BAND_V_FOV/2 around the horizontal, seen from the cylinder's axis.
 */
export function bandHeightAt(radius: number): number {
  return 2 * radius * Math.tan(((BAND_V_FOV_DEG / 2) * Math.PI) / 180)
}

/** Terrain-chunk grid id `cx,cz` for a world point (the travel chunk grid). */
export function chunkIdAt(x: number, z: number, chunkSize: number): string {
  return `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`
}

/**
 * Gate for the settlement panorama capture (point 227): the band may only be
 * captured once the terrain chunk under the capture point is COMMITTED to the
 * scene (its mesh mounted). The first travel frame after leaving a settlement
 * runs before the streamed chunk meshes mount — their set is React state,
 * flushed only after that frame — so a capture on that frame baked a
 * TERRAINLESS band (only the water sheets, landmarks and markers). Re-entering
 * the same settlement then drew that junk band over the backdrop: a hard grey
 * horizon line with a thin blue-grey water band below it, with the §2.5
 * silhouettes gliding along it. The trigger simply retries on a later frame;
 * the traveller is still inside the approach ring when the chunks land.
 */
export function panoramaCaptureReady(
  committedChunks: ReadonlySet<string>,
  x: number,
  z: number,
  chunkSize: number,
): boolean {
  return committedChunks.has(chunkIdAt(x, z, chunkSize))
}
