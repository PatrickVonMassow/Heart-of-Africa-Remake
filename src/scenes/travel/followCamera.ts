/**
 * Bird's-eye follow camera (point 1286). The camera hangs from a smoothed
 * follow point AND aims at that same point, so the viewing angle never changes
 * with the walking direction or on a stop — only the follow point lags. The
 * smoothing is time-based (exponential in dt), so the lag is the same at any
 * frame rate. A jump farther than `snapDistance` (a teleport, a resumed save)
 * places the camera at once instead of sliding across the map.
 *
 * South reach (design.md §2.1): the oblique view reaches farther north than
 * south of its aim point, so pose AND aim are moved south together by a
 * zoom-scaled shift — the tilt is unchanged and the traveller sits above the
 * picture centre, with (at full compensation) equal ground reach both ways.
 */

/** Camera offset from its aim point at zoom 1: height and distance south (+z). */
export const CAMERA_OFFSET = { y: 42, z: 24 } as const

export interface FollowState {
  x: number
  z: number
  zoom: number
}

export interface FollowConfig {
  /** Smoothing time constant (s). */
  tau: number
  /** A follow lag beyond this (world units) snaps instead of sliding. */
  snapDistance: number
}

export interface FollowPose {
  position: [number, number, number]
  target: [number, number, number]
}

/** The follow state resting exactly on (x, z) at the given zoom. PURE. */
export function followAt(x: number, z: number, zoom: number): FollowState {
  return { x, z, zoom }
}

/** One frame of the follow: eases (x, z, zoom) toward the target by dt. PURE. */
export function stepFollow(
  s: FollowState,
  x: number,
  z: number,
  zoom: number,
  dt: number,
  cfg: FollowConfig,
): FollowState {
  if (Math.hypot(x - s.x, z - s.z) > cfg.snapDistance) return followAt(x, z, zoom)
  const a = cfg.tau > 0 ? 1 - Math.exp(-Math.max(0, dt) / cfg.tau) : 1
  return { x: s.x + (x - s.x) * a, z: s.z + (z - s.z) * a, zoom: s.zoom + (zoom - s.zoom) * a }
}

/**
 * Flat-ground reach of the frame's centre column, north and south of the aim
 * point, for a camera at `offset` (zoom 1) looking at the aim with vertical
 * field of view `fovDeg`. PURE.
 */
export function groundReach(offset: { y: number; z: number }, fovDeg: number): { north: number; south: number } {
  const pitch = Math.atan2(offset.y, offset.z) // below the horizon
  const half = (fovDeg * Math.PI) / 360
  const far = offset.y / Math.tan(pitch - half) // camera → top-edge ground hit
  const near = offset.y / Math.tan(pitch + half) // camera → bottom-edge ground hit
  return { north: far - offset.z, south: offset.z - near }
}

/**
 * The southward aim shift (world units at zoom 1) that compensates the given
 * fraction of the north/south reach asymmetry: at 1 the frame reaches as far
 * south as north of the follow point (≈ 7.5 for offset {42, 24}, fov 50). PURE.
 */
export function southReachShift(offset: { y: number; z: number }, fovDeg: number, compensation: number): number {
  const r = groundReach(offset, fovDeg)
  return ((r.north - r.south) / 2) * compensation
}

/**
 * Camera position and aim for a follow state: offset above/south of the aim,
 * the aim `southShift` (zoom-scaled) south of the follow point. PURE.
 */
export function followPose(s: FollowState, offset: { y: number; z: number }, southShift = 0): FollowPose {
  const aimZ = s.z + southShift * s.zoom
  return {
    position: [s.x, offset.y * s.zoom, aimZ + offset.z * s.zoom],
    target: [s.x, 0, aimZ],
  }
}
