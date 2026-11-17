// Depth of the settlement rain (design.md §19.13): the drops are split into
// one to three layers at different distances and fall speeds, and every streak's
// LENGTH and direction follow the drop's velocity relative to the camera (a
// motion-blur streak), with soft ends instead of a hard rectangle. The drop
// count is unchanged: the layers share the preset's drops (drop k sits in
// layer k mod n), so depth costs no extra particle. Pure, so Vitest pins the
// mapping and the shader in rainMaterials.ts mirrors it.

import { balance } from '../../config/balance'
import { dropBases } from './rainTouch'

/** The single layer every detail level drew before the depth layers: the
 *  16 m column at 22 m/s (rainMaterials.ts RAIN_RADIUS / RAIN_FALL_SPEED). */
export const BASE_LAYER_RADIUS_M = 16
export const BASE_FALL_SPEED = 22

export interface RainLayerSpec {
  /** Half-width (m) of the layer's square column around the eye. */
  radiusM: number
  /** Horizontal eye distance (m) inside which the layer's drops fade out (0: none). */
  innerFadeM: number
  /** Fall speed (m/s). */
  fallSpeed: number
  /** Opacity relative to the near layer. */
  opacity: number
}

/** The layers drawn for a preset's `rainLayers` count (clamped to 1..3). One
 *  layer is exactly the earlier single curtain. */
export function rainLayerSpecs(layers: number, cfg = balance.rainDepth): RainLayerSpec[] {
  const n = Math.max(1, Math.min(3, Math.round(layers)))
  if (n === 1) return [{ radiusM: BASE_LAYER_RADIUS_M, innerFadeM: 0, fallSpeed: BASE_FALL_SPEED, opacity: 1 }]
  // Two layers: near and far; three: near, mid, far.
  const picks = n === 2 ? [0, 2] : [0, 1, 2]
  return picks.map((p) => ({
    radiusM: cfg.layerRadiusM[p],
    innerFadeM: cfg.layerInnerFadeM[p],
    fallSpeed: cfg.layerFallSpeed[p],
    opacity: cfg.layerOpacity[p],
  }))
}

/** The layer drop k belongs to (the shader's `instanceIndex mod n`). */
export function layerOfDrop(k: number, layers: number): number {
  return k % Math.max(1, layers)
}

/** Per-drop column bases: drop k scattered over its own layer's column. One
 *  layer returns exactly `dropBases(count, 16)`. */
export function layeredDropBases(count: number, specs: readonly RainLayerSpec[]): Float32Array {
  if (specs.length === 1) return dropBases(count, specs[0].radiusM)
  const unit = dropBases(count, 1)
  for (let k = 0; k < count; k++) {
    const r = specs[layerOfDrop(k, specs.length)].radiusM
    unit[k * 2] *= r
    unit[k * 2 + 1] *= r
  }
  return unit
}

/** Per-drop wrap period (the column's full width, 2·radius). */
export function layeredPeriods(count: number, specs: readonly RainLayerSpec[]): Float32Array {
  const out = new Float32Array(count)
  for (let k = 0; k < count; k++) out[k] = specs[layerOfDrop(k, specs.length)].radiusM * 2
  return out
}

export type Vec3 = [number, number, number]

/**
 * The camera's velocity from two frames' positions. A stalled frame (dt at or
 * near 0, a paused game) reads as standing still rather than dividing by
 * zero, and a jump (a teleport, a place change) is clamped to `maxSpeed`, so
 * neither stretches a drop.
 */
export function cameraVelocity(prev: Vec3, cur: Vec3, dt: number, maxSpeed: number): Vec3 {
  if (!(dt > 1e-4)) return [0, 0, 0]
  const v: Vec3 = [(cur[0] - prev[0]) / dt, (cur[1] - prev[1]) / dt, (cur[2] - prev[2]) / dt]
  const s = Math.hypot(v[0], v[1], v[2])
  if (!Number.isFinite(s)) return [0, 0, 0]
  if (s <= maxSpeed) return v
  const k = maxSpeed / s
  return [v[0] * k, v[1] * k, v[2] * k]
}

/** Eases a velocity toward a target (time constant `tauS`), so one uneven
 *  frame does not flick every streak. */
export function easeVelocity(prev: Vec3, target: Vec3, dt: number, tauS: number): Vec3 {
  const a = tauS > 0 ? 1 - Math.exp(-Math.max(0, dt) / tauS) : 1
  return [prev[0] + (target[0] - prev[0]) * a, prev[1] + (target[1] - prev[1]) * a, prev[2] + (target[2] - prev[2]) * a]
}

/**
 * A drop's streak: the segment its lower tip swept over the exposure, seen
 * from the moving camera. `dir` points from the lower tip back along the
 * trail (up for a standing camera); `length` is |v_drop − v_cam| · exposure,
 * clamped to [minM, maxM]. A standing camera gives exactly `fallSpeed · exposure`.
 */
export function streakVector(
  fallSpeed: number,
  camVel: Vec3,
  exposureS: number,
  minM: number,
  maxM: number,
): { length: number; dir: Vec3 } {
  // Relative velocity of the drop in the camera's frame: (0, −fall, 0) − v_cam.
  const rx = -camVel[0]
  const ry = -fallSpeed - camVel[1]
  const rz = -camVel[2]
  const s = Math.hypot(rx, ry, rz)
  if (!(s > 1e-6)) return { length: minM, dir: [0, 1, 0] }
  const length = Math.min(maxM, Math.max(minM, s * exposureS))
  return { length, dir: [-rx / s, -ry / s, -rz / s] }
}

/**
 * Opacity along a streak, t = 0 at the leading lower tip .. 1 at the tail:
 * a short soft head and a long fade-out toward the tail, never a hard end.
 */
export function streakEndFade(t: number, headSoft: number, tailSoft: number): number {
  const ss = (e0: number, e1: number, x: number) => {
    const c = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return c * c * (3 - 2 * c)
  }
  // Ordered edges, as in the shader (a reversed smoothstep is undefined in GLSL).
  return ss(0, headSoft, t) * (1 - ss(1 - tailSoft, 1, t))
}
