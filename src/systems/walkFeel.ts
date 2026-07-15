// Pure math for the first-person walk feel inside settlements (design.md §2,
// point 97): velocity inertia, a step-phase-driven head bob + lateral sway,
// footstep zero-crossings, a strafe roll and an idle sway. Kept three-free and
// side-effect-free so the whole feel is unit-testable; PlaceScene wires it to
// the camera and the footstep sound, and the amplitudes/time-constants are
// balance values. The bob is CAMERA-ONLY — it never touches the logical player
// position used for interaction/door/leave checks.

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v))
const clamp01 = (v: number) => clamp(0, 1, v)

/** Exponential smoothing factor for a time constant `tau` over `dt`. */
function smoothK(tau: number, dt: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau)
}

/**
 * Ease one velocity component toward `target`, using the accelerate time
 * constant when the target speed grows and the (usually faster) decelerate one
 * when it shrinks — so the walk ramps up smoothly and settles quickly on stop.
 */
export function easeSpeed(
  current: number,
  target: number,
  accelTau: number,
  decelTau: number,
  dt: number,
): number {
  const tau = Math.abs(target) >= Math.abs(current) ? accelTau : decelTau
  return current + (target - current) * smoothK(tau, dt)
}

/** Generic exponential ease toward a target (roll smoothing, stop settle). */
export function easeToward(current: number, target: number, tau: number, dt: number): number {
  return current + (target - current) * smoothK(tau, dt)
}

/**
 * Advance the step phase by the distance walked this frame (`speed * dt`) times
 * the cadence; returns the new phase and whether a FOOTSTEP fires — a crossing
 * of an integer multiple of π (two footsteps per full stride). The phase does
 * not advance while standing (speed 0), so footsteps only fall while moving.
 */
export function advanceStepPhase(
  phase: number,
  speed: number,
  cadence: number,
  dt: number,
): { phase: number; footstep: boolean } {
  const next = phase + Math.max(0, speed) * cadence * dt
  const footstep = Math.floor(next / Math.PI) > Math.floor(phase / Math.PI)
  return { phase: next, footstep }
}

/**
 * Camera bob from the step phase, scaled by the current speed fraction so it
 * fades smoothly to nothing when stopping: a VERTICAL bob at twice the step
 * frequency and a LATERAL sway at the step frequency (half the vertical) — the
 * two together trace the classic figure-eight. Returns metre offsets to add on
 * top of the eye height / the strafe axis.
 */
export function headBob(
  phase: number,
  speedFrac: number,
  bobAmp: number,
  swayAmp: number,
): { dy: number; dx: number } {
  const s = clamp01(speedFrac)
  return {
    dy: Math.sin(phase * 2) * bobAmp * s,
    dx: Math.sin(phase) * swayAmp * s,
  }
}

/**
 * Target camera roll from the lateral (strafe) velocity, clamped to
 * `maxRollRad`; `refSpeed` is the strafe speed that maps to the full roll.
 * Sign leans INTO the strafe direction; zero at rest.
 */
export function strafeRollTarget(lateralVel: number, refSpeed: number, maxRollRad: number): number {
  const t = refSpeed <= 0 ? 0 : lateralVel / refSpeed
  return clamp(-1, 1, t) * maxRollRad
}

/** A barely-visible slow idle sway (metres) so the camera never freezes dead. */
export function idleSway(time: number, amp: number, rate: number): number {
  return Math.sin(time * rate) * amp
}
