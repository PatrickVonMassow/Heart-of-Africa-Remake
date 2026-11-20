// GPU health of the live renderer: a lost device and the uncaptured GPU
// errors of the session.
//
// Why: three's Renderer sets `_isDeviceLost` on a lost device and from then
// on returns early from every render() — the canvas stays black behind a live
// HUD, the render benchmark measures empty frames, and the only trace is one
// console line. This module hooks three's own callbacks (`onDeviceLost`, fed
// from the backend's awaited `device.lost` / `webglcontextlost`; `onError`,
// fed from `device.onuncapturederror`) instead of patching three, and makes the
// loss
//   - an assert on the dev channel (every suite and manual session fails on it),
//   - the localized, dismissible renderer notice for the player,
//   - a flag the benchmark checks before it trusts a frame,
//   - a section of the F6 state dump, with the uncaptured errors.
// Not dev-gated: the notice, the benchmark and the dump ship.

import { devAssert } from '../systems/devAssert'
import { useUi } from '../state/ui'

/** Cap on the uncaptured errors kept for the state dump; the rest are counted. */
export const GPU_ERROR_CAP = 20

/** What three hands to `onDeviceLost` (WebGPU and WebGL 2 backends). */
export interface DeviceLossInfo {
  api?: string
  message?: string
  reason?: string | null
}

/** What three hands to `onError` (uncaptured WebGPU errors). */
export interface GpuErrorInfo {
  api?: string
  type?: string
  message?: string
}

export interface GpuHealth {
  deviceLost: { api: string; reason: string; message: string; at: string } | null
  uncapturedErrors: { api: string; type: string; message: string; at: string }[]
  /** Uncaptured errors seen beyond `GPU_ERROR_CAP`. */
  omittedErrors: number
}

let health: GpuHealth = { deviceLost: null, uncapturedErrors: [], omittedErrors: 0 }

const now = (): string => new Date().toISOString()

/** A lost device: recorded, asserted (dev) and raised as the player notice. */
export function recordDeviceLost(info: DeviceLossInfo): void {
  const reason = info.reason || 'unknown'
  const message = info.message || 'Unknown reason'
  const api = info.api || 'unknown'
  if (health.deviceLost === null) health.deviceLost = { api, reason, message, at: now() }
  devAssert(false, 'gpu-device-lost', () => `${api} device lost — reason: ${reason}; message: ${message}`)
  useUi.getState().setDeviceLost(true)
}

/** One uncaptured GPU error (validation, out-of-memory, pipeline). */
export function recordGpuError(info: GpuErrorInfo): void {
  if (health.uncapturedErrors.length >= GPU_ERROR_CAP) {
    health.omittedErrors++
    return
  }
  health.uncapturedErrors.push({
    api: info.api || 'unknown',
    type: info.type || 'GPUError',
    message: info.message || '',
    at: now(),
  })
}

/** True once the device was lost: no later frame draws anything. */
export function isDeviceLost(): boolean {
  return health.deviceLost !== null
}

/** A copy for the state dump. */
export function gpuHealthSnapshot(): GpuHealth {
  return {
    deviceLost: health.deviceLost ? { ...health.deviceLost } : null,
    uncapturedErrors: health.uncapturedErrors.map((e) => ({ ...e })),
    omittedErrors: health.omittedErrors,
  }
}

/** Test hook. */
export function resetGpuHealth(): void {
  health = { deviceLost: null, uncapturedErrors: [], omittedErrors: 0 }
}

/** The two renderer callbacks this module chains into (three 0.185). */
interface HookableRenderer {
  onDeviceLost?: (info: DeviceLossInfo) => void
  onError?: (info: GpuErrorInfo) => void
}

/**
 * Chains the health record into the renderer's callbacks, keeping three's
 * defaults (they set `_isDeviceLost` and log). Arm it right after construction:
 * the backend calls the callbacks only at loss/error time.
 */
export function armGpuHealth(renderer: unknown): void {
  const r = renderer as HookableRenderer
  const lost = r.onDeviceLost
  r.onDeviceLost = function (this: unknown, info: DeviceLossInfo) {
    lost?.call(this, info)
    recordDeviceLost(info)
  }
  const onError = r.onError
  r.onError = function (this: unknown, info: GpuErrorInfo) {
    onError?.call(this, info)
    recordGpuError(info)
  }
}
