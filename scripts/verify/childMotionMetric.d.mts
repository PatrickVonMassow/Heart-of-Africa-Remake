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
  /** Whether the GROUP was playing at that moment; missing reads as not. */
  playing?: boolean
}

export interface TraceLiveness {
  children: number
  /** The stretch of game clock the trace covers. */
  seconds: number
  playedSeconds: number
  playedShare: number
  /** What the children's legs did over the whole trace, summed. */
  walked: number
  walkedPerChildMinute: number
}

export interface ShuffleWindows {
  /** How many windows were judged — a count of samples, reported not gated. */
  windows: number
  bad: number
  /** The GAME TIME the judged windows stand for, in seconds — each capped at
   *  the span it was measured over. */
  seconds: number
  /** The part of it spent walking without getting anywhere. */
  badSeconds: number
  /** Traced clock no window could speak for: silences longer than the span, the
   *  surplus of a gap beyond it, and the tail. */
  unjudged: number
  /** `seconds + unjudged` — the whole traced clock, summed over the children. */
  covered: number
  /** `seconds / covered`. How much of the trace any verdict rests on. */
  judgedShare: number
  /** `badSeconds / seconds` — time-weighted, so the frame cadence cannot move it. */
  share: number
  worst: { path: number; out: number; child: number; clock: number }
}

export interface RescueRate {
  rescues: number
  /** Rescues that actually set the child down somewhere else. */
  carries: number
  childMinutes: number
  perChildMinute: number
  carriedPerChildMinute: number
  worstChild: number
  worstRescues: number
}

export declare const CHILD_MOTION: {
  span: number
  minPath: number
  circle: number
  shareGate: number
  carryGate: number
  rescueGate: number
  carryDistance: number
}

export declare function groundPath(
  track: ReadonlyArray<{ x: number; z: number; nudges?: number }>,
): { x: number[]; z: number[] }

export declare function shuffleWindows(
  tracks: ReadonlyArray<ReadonlyArray<ChildMotionSample>>,
  cfg?: Partial<typeof CHILD_MOTION>,
): ShuffleWindows

export declare function traceLiveness(
  tracks: ReadonlyArray<ReadonlyArray<{ clock: number; walked: number; playing?: boolean }>>,
): TraceLiveness

export declare function rescueRate(
  tracks: ReadonlyArray<ReadonlyArray<{ clock: number; x: number; z: number; nudges?: number }>>,
  cfg?: Partial<typeof CHILD_MOTION>,
): RescueRate
