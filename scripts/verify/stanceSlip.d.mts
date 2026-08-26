// Types for the stance-slip judgement (stanceSlip.mjs), used by the fauna
// foot-plant coverage in src/render/fauna.test.ts. Only what a typed caller
// imports is declared here; add a symbol when a TS consumer needs it.

/** One frame of one leg, as the render trace records it. */
export interface StanceSlipSample {
  x: number
  z: number
  yaw?: number
  /** The body's stride length at that frame — the unit every travel is measured in. */
  stride: number
  /** Whether this leg was on the ground. */
  stance: boolean
  /** The DRAWN world position of the foot. */
  foot: { x: number; z: number }
}

/** One measured stance interval. */
export interface StanceSlipInterval {
  id: string
  /** Foot travel divided by body travel — the judged ratio. */
  slip: number
  /** How far the body turned over the interval, in radians. */
  turn: number
  frames: number
}

export interface StanceSlipVerdict {
  intervals: number
  /** False when too few intervals were measured for the verdict to mean anything. */
  enough: boolean
  /** The worst ratio measured, or null when nothing was measured. */
  worst: number | null
  turnMax: number
  /** Intervals dropped because one frame step already outran a whole stance. */
  coarse: number
  longestRun: number
  slips: StanceSlipInterval[]
  detail: string
}

export declare function judgeStanceSlip(
  samples: ReadonlyArray<Record<string, StanceSlipSample | undefined>>,
  options?: { floor?: number; cap?: number; minIntervals?: number },
): StanceSlipVerdict
