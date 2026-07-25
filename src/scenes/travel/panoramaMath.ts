// Pure geometry of the travel-scene panorama (point 81): sector layout of
// the 360° horizon band and its mapping onto the first-person horizon
// cylinder. Kept three-free so the direction-trueness is unit-testable.

import type { PlaceKind } from '../../world/geo'

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
 * Chebyshev ring of terrain chunks the capture requires COMMITTED around the
 * capture point, and therefore the reach the capture camera may look out to.
 *
 * One BELOW the travel scene's own streaming radius (`CHUNK_RADIUS`, 6) on
 * purpose: the streamed window is centred on the TRAVELLER, the capture point
 * on the PLACE, and the trigger fires within a few units of it — at most one
 * chunk apart. A ring of radius 5 around the capture point is therefore always
 * a subset of the radius-6 window around the traveller, so the gate is
 * satisfiable on every approach instead of waiting for chunks that will never
 * be planned.
 */
export const PANORAMA_CHUNK_RADIUS = 5

/**
 * Gate for the panorama capture (point 227, widened by point 335): the band may
 * only be captured once the terrain around the capture point is COMMITTED to
 * the scene (its chunk meshes mounted), out to `radius` chunks in each
 * direction.
 *
 * Point 227 (the CENTRE chunk): the first travel frame after leaving a
 * settlement runs before the streamed chunk meshes mount — their set is React
 * state, flushed only after that frame — so a capture on that frame baked a
 * TERRAINLESS band (only the water sheets, landmarks and markers). Re-entering
 * the same settlement then drew that junk band over the backdrop: a hard grey
 * horizon line with a thin blue-grey water band below it, with the §2.5
 * silhouettes gliding along it.
 *
 * Point 335 (the whole RING): the centre chunk alone left the far field
 * unguarded, and the far field bakes into the same band. The trigger simply
 * retries on a later frame; the traveller is still inside the approach ring
 * when the chunks land.
 */
export function panoramaCaptureReady(
  committedChunks: ReadonlySet<string>,
  x: number,
  z: number,
  chunkSize: number,
  radius = 0,
): boolean {
  const cx = Math.floor(x / chunkSize)
  const cz = Math.floor(z / chunkSize)
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!committedChunks.has(`${cx + dx},${cz + dz}`)) return false
    }
  }
  return true
}

/**
 * Far plane the panorama capture camera may use (point 335) — the SPATIAL half
 * of the completeness rule `panoramaCaptureReady` covers in time.
 *
 * The travel scene streams terrain only within a bounded chunk window; the
 * global sea plane, the river ribbons and the lake sheets carry no such bound
 * and keep drawing far past it (the sea plane is sized against the travel
 * camera's fog, not against this one's 900-unit reach). A capture camera that
 * looks beyond the committed window therefore bakes those sheets FLOATING with
 * no ground behind them, and the place scene draws the result as a hard, flat
 * grey/silver strip ABOVE the band's own horizon, with the geometry backdrop's
 * relief showing through the transparent gap over and under it — the reported
 * Giza case. It is the point-227 defect one step less severe: there the WHOLE
 * band was terrainless, here only its far field is.
 *
 * Clipping at the committed ring's own reach removes exactly that far field:
 * the ring guarantees terrain under every ray out to `chunkRadius` chunks even
 * when the capture point sits at the very edge of its own chunk.
 */
export function panoramaCaptureFar(chunkRadius: number, chunkSize: number): number {
  return Math.max(1, chunkRadius * chunkSize)
}

/**
 * Which place kinds show the captured travel band (design.md §2.5) — a TOTAL
 * map over `PlaceKind`, deliberately not an if-chain naming kinds: a fourth
 * kind fails to compile until it is entered here, so it cannot silently skip
 * the freshness (`enteredFromTravel`) and completeness (`panoramaCaptureReady`)
 * gates the way a late-added kind could. Every kind currently takes the band —
 * the monument site included, which is what point 335 had to establish before
 * looking further.
 */
export const PANORAMA_BAND_BY_KIND: Record<PlaceKind, boolean> = {
  port: true,
  village: true,
  monument: true,
}

/**
 * The one rule deciding whether a place shows a captured band, used by the
 * capture trigger and mirrored by the place scene's show path. All three
 * conditions are required for EVERY kind:
 *  - the kind takes a band at all (`PANORAMA_BAND_BY_KIND`),
 *  - the capture is FRESH — this visit was entered out of the bird's-eye view,
 *  - the terrain under the whole captured field was COMMITTED.
 */
export function panoramaBandShown(kind: PlaceKind, enteredFromTravel: boolean, captureReady: boolean): boolean {
  return PANORAMA_BAND_BY_KIND[kind] && enteredFromTravel && captureReady
}
