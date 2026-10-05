/**
 * Bird's-eye follow camera (point 1286). The camera hangs from a smoothed
 * follow point AND aims at that same point, so the viewing angle never changes
 * with the walking direction or on a stop — only the follow point lags. The
 * smoothing is time-based (exponential in dt), so the lag is the same at any
 * frame rate. A jump farther than `snapDistance` (a teleport, a resumed save)
 * places the camera at once instead of sliding across the map.
 */

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

/** Camera position and aim for a follow state: offset above/south of the point, looking at it. PURE. */
export function followPose(s: FollowState, offset: { y: number; z: number }): FollowPose {
  return {
    position: [s.x, offset.y * s.zoom, s.z + offset.z * s.zoom],
    target: [s.x, 0, s.z],
  }
}
