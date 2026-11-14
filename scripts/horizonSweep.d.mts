// Types for the horizon-sweep core (horizonSweep.mjs), used by the Vitest
// coverage in src/render/horizonSweep.test.ts and src/render/horizonSlices.test.ts.

export type GridStep = readonly [number, number]

export declare const SUN_STEPS: GridStep[]
export declare const SUN_AZIMUTHS: number[]
export declare const OCCLUSION_STEPS: GridStep[]
export declare const SLOPE_MAX: number
export declare function stepAzimuth(step: GridStep): number
export declare function encodeSlope(slope: number): number
export declare function decodeSlope(byte: number): number
export declare function sweepHorizon(heights: Float32Array, w: number, h: number, step: GridStep, cellMeters: number): Float32Array
export declare function bruteHorizon(heights: Float32Array, w: number, h: number, step: GridStep, cellMeters: number): Float32Array
export declare function meanHorizon(
  heights: Float32Array,
  w: number,
  h: number,
  cellMeters: number,
  steps?: GridStep[],
): Float32Array
