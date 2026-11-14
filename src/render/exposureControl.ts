// Eye-adaptation controller (design.md §2.7 "Being dazzled by the sun"): the
// pure math behind the first-person exposure. The GPU side
// (render/eyeAdaptation.ts) runs the SAME formulas in TSL on the measured mean
// luminance of the HDR frame; this module is their browserless reference and
// the thing the unit test pins down.
//
// Bounded by construction: the target is clamped to [min, max], every step
// moves toward the target without overshooting it, and a black, a blown-out or
// a non-finite measurement maps to a clamped target instead of running away.
//
// Directions follow the eye: adapting TO BRIGHT light (the scene got brighter,
// the exposure falls) is fast; adapting TO THE DARK (the exposure opens up
// again in a lane's shade) is slow.

export interface ExposureParams {
  /** Exposure at the key luminance — today's fixed toneMappingExposure. */
  base: number
  /** Lower exposure bound (facing the sun). */
  min: number
  /** Upper exposure bound (deep shade). */
  max: number
  /** Mean linear luminance of the HDR frame at which the exposure equals `base`. */
  keyLuminance: number
  /** 0 = no adaptation, 1 = full compensation of a luminance change. */
  compensation: number
  /** Per-texel luminance ceiling before averaging, so a lone disc cannot dominate the mean. */
  sampleCeiling: number
  /** Time constant (s) while the exposure FALLS (adapting to bright light). */
  toBrightSeconds: number
  /** Time constant (s) while the exposure RISES (adapting to the dark). */
  toDarkSeconds: number
  /** Longest frame step (s) one update may take, so a hitch cannot jump the exposure. */
  maxStepSeconds: number
}

/** Smallest luminance the target formula sees: a black frame maps to `max`, not to infinity. */
export const LUMINANCE_FLOOR = 1e-4
/** Smallest time constant, so a zero entered in the debug menu cannot divide by zero. */
export const TAU_FLOOR = 1e-3

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Target exposure for a measured mean luminance, always within [min, max]. */
export function exposureTarget(meanLuminance: number, p: ExposureParams): number {
  const lum = Number.isFinite(meanLuminance)
    ? clamp(meanLuminance, LUMINANCE_FLOOR, Math.max(p.sampleCeiling, LUMINANCE_FLOOR))
    : p.keyLuminance
  const ratio = Math.max(p.keyLuminance, LUMINANCE_FLOOR) / lum
  return clamp(p.base * Math.pow(ratio, p.compensation), p.min, p.max)
}

/** Time constant for a step from `current` toward `target`. */
export function exposureTau(current: number, target: number, p: ExposureParams): number {
  return Math.max(target < current ? p.toBrightSeconds : p.toDarkSeconds, TAU_FLOOR)
}

/**
 * One frame of adaptation: exponential approach in log-exposure space (equal
 * ratios take equal time in both directions of the same constant), never past
 * the target and always within [min, max]. A non-finite current value restarts
 * at `base`.
 */
export function exposureStep(current: number, target: number, dtSeconds: number, p: ExposureParams): number {
  const from = Number.isFinite(current) && current > 0 ? clamp(current, p.min, p.max) : p.base
  // A NaN target holds the current exposure rather than poisoning it.
  const to = Number.isNaN(target) ? from : clamp(target, p.min, p.max)
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, p.maxStepSeconds)
  const k = 1 - Math.exp(-dt / exposureTau(from, to, p))
  const next = Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * k)
  return clamp(next, p.min, p.max)
}
