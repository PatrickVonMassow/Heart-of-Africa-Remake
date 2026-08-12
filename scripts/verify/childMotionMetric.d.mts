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
  /** `TagChild.carried` — cumulative metres the settlement teleported it. */
  carried?: number
  /** Whether the GROUP was playing at that moment; missing reads as not. */
  playing?: boolean
}

export interface ChildLiveness {
  seconds: number
  /** Of those seconds, the ones the group spent playing. */
  playedSeconds: number
  walked: number
  /** Of those metres, the ones walked while the game was on. */
  walkedWhilePlaying: number
  walkedPerMinute: number
  walkedPerPlayedMinute: number
}

export interface TraceLiveness {
  children: number
  /** False if any clock or walked distance is not a finite number, and false for
   *  an empty set — nothing said is not good news. */
  numbersFinite: boolean
  /** The stretch of game clock the trace covers. */
  seconds: number
  playedSeconds: number
  playedShare: number
  /** What the children's legs did over the whole trace, summed. */
  walked: number
  walkedPerChildMinute: number
  perChild: ChildLiveness[]
  /** The LEAST-walking child's metres per minute OF PLAY — the floor the callers
   *  gate on, because a sum hides a child that never moved and a whole-trace
   *  average hides a group that did its walking before the round began. */
  quietestWalkedPerPlayedMinute: number
  quietestChild: number
}

export interface ChildWindows {
  windows: number
  bad: number
  seconds: number
  badSeconds: number
  unjudged: number
  covered: number
  share: number
  judgedShare: number
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
  /** The same numbers per child, because the defect is per child. */
  perChild: ChildWindows[]
  /** The worst child's share, which is what the gates read — an average divides
   *  one wedged child by its healthy siblings. */
  worstShare: number
  worstShareChild: number
  /** The least judgeable child's `judgedShare`: a child whose every shuffle ends
   *  in a rescue has most of its trace unjudged, and nobody else's. */
  leastJudged: number
  leastJudgedChild: number
  worst: { path: number; out: number; child: number; clock: number }
}

export interface ChildRescues {
  rescues: number
  carriedMetres: number
  minutes: number
  perMinute: number
  carriedPerMinute: number
}

export interface RescueRate {
  rescues: number
  /** Metres the settlement carried the children, from the game's own counter. */
  carriedMetres: number
  /** False if any sample failed to publish `carried` — a missing field is not
   *  a carry-free trace, and the gates demand this. */
  carriedPublished: boolean
  childMinutes: number
  perChildMinute: number
  carriedMetresPerChildMinute: number
  perChild: ChildRescues[]
  /** The highest rate any ONE child was picked up at — what the gates read,
   *  because an average divides a persistently rescued child by its siblings —
   *  and the child it belongs to. */
  worstPerChildMinute: number
  worstRescueChild: number
  /** The furthest any ONE child was carried per its own minute, and whose. */
  worstCarriedMetresPerChildMinute: number
  worstCarriedChild: number
  /** The child picked up most often in ABSOLUTE count: a third question, whose
   *  answer need not be either child above. */
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
  worstChildRescueGate: number
  worstChildCarryGate: number
  judgedGate: number
  walkFloor: number
  playedGate: number
}

export declare function groundPath(
  track: ReadonlyArray<{ x: number; z: number; nudges?: number }>,
): { x: number[]; z: number[]; broken: boolean[] }

export declare function shuffleWindows(
  tracks: ReadonlyArray<ReadonlyArray<ChildMotionSample>>,
  cfg?: Partial<typeof CHILD_MOTION>,
): ShuffleWindows

export declare function traceLiveness(
  tracks: ReadonlyArray<ReadonlyArray<{ clock: number; walked: number; playing?: boolean }>>,
): TraceLiveness

export declare function holdsAGame(
  live: TraceLiveness,
  cfg?: Partial<typeof CHILD_MOTION>,
): boolean

export declare function rescueRate(
  tracks: ReadonlyArray<ReadonlyArray<{ clock: number; nudges?: number; carried?: number }>>,
): RescueRate
