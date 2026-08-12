// Types for the children's motion metric (childMotionMetric.mjs), used by the
// replay coverage in src/scenes/place/tagShuffle.test.ts.

/** One frame of one child, as both the live trace and the replay record it. */
export interface ChildMotionSample {
  /** The GAME's own clock, in seconds. */
  clock: number
  x: number
  z: number
  /** `TagChild.walked` — cumulative, and free of the rescue teleport. */
  walked: number
  /** `TagChild.nudges` — cumulative count of rescues. */
  nudges?: number
}

export interface ShuffleWindows {
  windows: number
  bad: number
  share: number
  worst: { path: number; out: number; child: number; clock: number }
}

export interface RescueRate {
  rescues: number
  childMinutes: number
  perChildMinute: number
  worstChild: number
  worstRescues: number
}

export declare const CHILD_MOTION: {
  span: number
  minPath: number
  circle: number
  shareGate: number
  rescueGate: number
}

export declare function groundPath(
  track: ReadonlyArray<{ x: number; z: number; nudges?: number }>,
): { x: number[]; z: number[] }

export declare function shuffleWindows(
  tracks: ReadonlyArray<ReadonlyArray<ChildMotionSample>>,
  cfg?: Partial<typeof CHILD_MOTION>,
): ShuffleWindows

export declare function rescueRate(
  tracks: ReadonlyArray<ReadonlyArray<{ clock: number; nudges?: number }>>,
): RescueRate
