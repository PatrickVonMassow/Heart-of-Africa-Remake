// THE VILLAGE CHILDREN'S GAME AT THE RIVER BANK (work-order 687, design.md
// §13.4, docs/communication-poc-spec.md).
//
// ONE GAME, FOUR WORDS, NOTHING STAGED. The children roam their own quarter of
// the village out of earshot of the adults; at the end of that phase one of them
// calls RIVER, points at the water and the whole group runs to the bank — and
// that caller is the first catcher. Between two rocks, one upstream and one
// downstream, they then play run after run: the direction is announced before
// each one, whoever reaches the far rock calls ROCK, whoever is caught drops out
// where he stands, and the sides swap every run so the announced direction
// alternates by construction. When no free runner is left the group breaks up,
// walks off along the bank — announced with the OPPOSITE word, from wherever it
// happens to stand and with no rock as its target — and roams again.
//
// EVERY UTTERANCE FALLS AT A FIXED POINT OF THE ROUND. There is no situation
// catalogue and no scheduler: the opening call, the direction announcement, the
// catcher's tap, the arrival and the parting call are moments of the game
// itself, and not one of them takes a child out of it or slows it down. That is
// the whole difference to what point 686 removed — the old catalogue forced
// eleven concepts onto a chase that could not carry them, and the player read
// nothing out of it.
//
// THE THREE WRONG READINGS THIS CLOSES (the cross-vendor review of 13.08.2026
// blocked the first draft on them, and none of it is optional):
//  - ROCK must not be learnable as "base", "goal" or "made it". So the catcher
//    TAPS his own rock and names it at the start of a run, with nobody arriving,
//    and during the roaming phase a child climbs an ORDINARY scattered boulder
//    in the village — no part of the game at all — and names that.
//  - UPSTREAM/DOWNSTREAM must not be learnable as "to the far rock" or as
//    left/right. So the parting call detaches both words from the rocks once per
//    cycle: the group walks off along the bank with no rock as its target.
//  - And the world corroborates: the river visibly flows, so the pair correlates
//    with the current for a player who watches the water.
//
// THE WALKING IS THE TAG GAME'S. `moveChild`, `trackProgress` and `ageEdge` come
// from `tagGame.ts` — the same deflection, the same one-side commitment round an
// obstacle and the same two stall watches, so the child-motion metric that
// judges the village (`scripts/verify/childMotionMetric.mjs`) judges this round
// on the same terms. What is new here is the ROUND, not the step.

import type { GestureKind } from '../../render/gesture'
import { devAssert } from '../../systems/devAssert'
import {
  advanceReserve,
  chooseEffort,
  effortPace,
  floorPace,
  headingToward,
  pressState,
  turnToward,
  type Press,
} from '../../systems/pursuit'
import {
  ageEdge,
  catchReached,
  moveChild,
  trackProgress,
  type TagChild,
  type TagConfig,
  type TagWorld,
} from './tagGame'

/** Which end of the stretch a rock stands at. */
export type BankEnd = 'upstream' | 'downstream'

/** The words the round speaks. A subset of the lexicon's concepts by type, so a
 *  moment can never name a word the game does not teach. */
export type BankConcept = 'RIVER' | 'UPSTREAM' | 'DOWNSTREAM' | 'ROCK'

/** The phases of one cycle, in the order they run. */
export type BankPhase = 'roam' | 'gather' | 'run' | 'regroup' | 'part'

/** What a child is in the current run. */
export type BankRole = 'runner' | 'catcher' | 'out'

/** The fixed point of the round an utterance falls at. */
export type BankMoment = 'call' | 'boulder' | 'announce' | 'tap' | 'arrival' | 'parting'

/** What the utterance was aimed at. The reading guards rest on it: a direction
 *  word must fall at least once with NO rock as its target, and ROCK once with
 *  nobody arriving and once outside the game altogether. */
export type BankAim = 'water' | 'rock' | 'bank' | 'boulder'

/** One utterance of the round, ready to be spoken through the §13.4 hearing
 *  curve exactly as any other village speech is. */
export interface BankUtterance {
  concept: BankConcept
  moment: BankMoment
  speaker: number
  gesture: GestureKind
  aim: { x: number; y: number; z: number }
  at: BankAim
}

/** One child. The body and its walking are the tag game's; the round adds who
 *  it is this run and whether it is out of play. */
export interface BankChild extends TagChild {
  role: BankRole
  /** Touched the far rock in the current run — safe, and out of the catchers'
   *  reach until the next one. */
  arrived: boolean
  /** Tagged: crouched where it stood, arms folded, until the run ends. */
  crouched: boolean
  /**
   * THE HEADING IT IS ROAMING ON — not a point it is walking to. A fixed goal is
   * a wall to lean against: where one lies behind a hut the child walks at it,
   * the deflection turns it aside, it re-aims and walks at it again, and the
   * child-motion gate calls that what it is (measured at the recorded cadence of
   * point 657's second case: 1.4 m of legs inside a 0.24 m circle, 21 bad
   * windows in one episode). A drifting heading cannot be unreachable, and after
   * a deflection the child simply carries on from the way it ended up going,
   * which is how the wildlife has always wandered.
   */
  roamHeading: number
  /** The closest point the climber has reached on its boulder approach. */
  goalX: number
  goalZ: number
  /** How long the boulder approach has gone without getting any closer. */
  goalFor: number
  /** Standing up against the ordinary boulder for the visible climb that
   *  carries the off-game ROCK utterance. */
  climbing: boolean
  /** A RUNNER's own lane across the stretch, in metres to one side of the line
   *  between the rocks. The group crosses in parallel lanes rather than in one
   *  column, which is what lets a catcher take one child and the others get
   *  past — and what the player sees as a spread-out charge. */
  lane: number
  /**
   * Standing at its station rather than walking to it — and it KEEPS standing
   * until it is pushed a full reach away, not merely past the line it stopped
   * on. Without that hysteresis a child jostled by the group at its station
   * stepped back in, was pushed out, stepped back in: walking without getting
   * anywhere, which is the exact symptom the child-motion gate exists for
   * (measured at the recorded cadence of point 657's second case, 0.26 % of the
   * judged windows against a 0.25 % gate; with it, 0.03 %).
   */
  settled: boolean
  /** A CATCHER's chosen quarry, or −1. Held for the run rather than re-picked
   *  every frame: a catcher that always went for whoever was nearest simply
   *  swept a bunched group and tagged all of it, and no run ever ended in an
   *  arrival. */
  quarry: number
  /**
   * THE WAY ROUND THE VILLAGE, for the one walk of the round that is long: the
   * call takes the group from its own quarter down to the bank, and in a
   * settlement whose quarter lies across the built ground from its water that is
   * forty metres past huts, fences and compounds. Steering locally, the group
   * pressed into the first wall and stood there for the whole gather — measured
   * in the mandinka village, where not one child ever reached the stage. Held
   * across frames and planned only when the straight line is actually shut, so
   * the ordinary walk over open ground costs nothing.
   */
  path: Array<{ x: number; z: number }> | null
  /** The goal `path` was planned for; a moved goal discards it. */
  pathTo: { x: number; z: number } | null
  /** Seconds before this child may ask for another plan. */
  replan: number
}

/**
 * The stage, as the round sees it. Everything is a world point of the
 * settlement's own layout — the two play rocks, the water the opening call
 * points at, an ordinary boulder that is no part of the game, and the quarter
 * the group roams in.
 */
export interface BankStage {
  upstream: { x: number; z: number }
  downstream: { x: number; z: number }
  /** Where the water lies — the point the RIVER call points at. */
  water: { x: number; z: number }
  /** An ordinary scattered boulder in the village, climbed and named during the
   *  roaming phase. A settlement without one must not construct this stage. */
  boulder: { x: number; z: number }
  /** The children's own quarter, out of earshot of the adults (point 481.4). */
  roam: { x: number; z: number; radius: number }
}

/** Everything the round needs beyond the walking, all calibratable
 *  (`balance.villageLife.bankGame`, debug-editable). */
export interface BankRoundConfig {
  /** How long the group roams between two cycles. Short — of the order of a
   *  minute — so a visiting player does not miss the call that opens one. */
  roamSeconds: number
  /** Per-cycle spread of that length, 0..1, so it is never a metronome. */
  roamSpread: number
  /** Backstop on the walk down to the bank; the phase normally ends when
   *  everybody has reached his station. */
  gatherSeconds: number
  /** Backstop on one run: whoever has not arrived by then counts as safe, so a
   *  child held up on the way can never freeze the cycle. */
  runSeconds: number
  /** Backstop on the walk between two runs. */
  regroupSeconds: number
  /** How long the group walks off along the bank before it roams again. */
  partSeconds: number
  /** How near a rock's CENTRE counts as touching it. It must clear the rock's
   *  own collider plus a child's footprint, or nobody could ever arrive. */
  reachDistance: number
  /** Where a child waits: how far off the rock's centre its station stands. */
  standOff: number
  /** Side-by-side spacing of the stations at one rock. */
  stationSpacing: number
  /** Sideways spacing of the runners' lanes across the stretch, so the group
   *  crosses abreast rather than in one column. */
  laneSpacing: number
  /** How near a catcher has to be before a runner starts bending its line to
   *  get round him. Beyond it the runner simply makes for the rock. */
  dodgeDistance: number
  /** How far sideways that bend carries the runner's aim at the closest — the
   *  swerve that turns a straight sprint into a game. */
  dodgeReach: number
  /** How fast a roaming child's heading drifts (rad/s) — the wander itself. */
  roamTurn: number
  /** How long a climber may make no progress toward the boulder before giving
   *  the obstructed approach up. A reachable stone keeps resetting this watch. */
  roamGoalSeconds: number
  /** The pace of every walk that is not a run (m/s). */
  walkPace: number
  /** The EXTRA berth the children give the traveller over a villager — they are
   *  shy of the stranger and visibly swerve rather than brush past him. */
  strangerBerth: number
  /** Constant gap between two utterances, so two moments falling in the same
   *  breath are still heard as two. */
  utteranceGapSeconds: number
}

export type BankConfig = TagConfig & BankRoundConfig

/**
 * The settlement as the round sees it: the tag game's world, plus the traveller
 * — who is an OBSTACLE and never a stop (spec item 7). A game that halted when
 * the player stepped into it would never be watched at all.
 */
export interface BankWorld extends TagWorld {
  stranger?: { x: number; z: number; radius: number } | null
  /** Whether the straight line between two points crosses ground a child may
   *  not walk. Left out, every line counts as open and the round steers
   *  locally, exactly as it did before the walk down to the bank existed. */
  lineBlocked?: (ax: number, az: number, bx: number, bz: number) => boolean
  /** A way round whatever stands between two points, or null where none is
   *  known. Only the walk to the stations asks for one. */
  route?: (
    from: { x: number; z: number },
    to: { x: number; z: number },
  ) => Array<{ x: number; z: number }> | null
}

/** The round. */
export interface BankState {
  children: BankChild[]
  phase: BankPhase
  /** Seconds left of the current phase — its own length where the phase ends on
   *  the clock, its backstop where it ends on a condition. */
  phaseFor: number
  /** The rock the runners start this run from; the far rock is the other one. */
  from: BankEnd
  /** The word announced for the current run, or null outside one. */
  direction: BankConcept | null
  /** Who called RIVER and opened this cycle — the first catcher. */
  caller: number
  /** Who climbs the boulder this roaming phase, or −1. */
  climber: number
  /** Children whose boulder approach made no progress this roaming phase. */
  failedClimbers: number[]
  /** Whether the boulder has already been named this roaming phase. */
  namedBoulder: boolean
  /** Whether every child proved unable to reach the boulder this phase. */
  abandonedBoulder: boolean
  /** Runs opened in this cycle. The normal exit is still the last runner being
   *  caught; this bounds a cycle in which every runner gets through untouched. */
  runsThisCycle: number
  runs: number
  cycles: number
  /** Children tagged so far — the round's own "something happened" counter, read
   *  by the live check exactly as the tag game's catches are. */
  tags: number
  /** SIM seconds this group has run, playing and idling alike. */
  clock: number
  /**
   * …and the part of it the group was at its game, counted by the settlement
   * itself so no watcher has to decide from a sampled flag (point 656).
   *
   * FOR THIS ROUND THAT IS ALL OF IT. The tag round has an idle BREAK in which
   * the group stands and recovers, and its played clock exists to keep that dead
   * time out of the walking floor. The bank cycle has no such break: the roaming
   * phase is part of the cycle and the children walk right through it, so every
   * second of this group's clock is a second of its game.
   */
  playedClock: number
  playing: boolean
  /** Utterances born in the current step. A moment that falls inside the
   *  hearing gap is omitted, never carried into a later moment. */
  pending: BankUtterance[]
  sinceSaid: number
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** Long enough to read as stepping onto the stone, short enough not to turn an
 *  active roaming child into an idle interval in the motion trace. */
const BOULDER_CLIMB_SECONDS = 0.35

/** Deterministic per-child spread around 1 (never applied to a pace). */
function spread(rand: () => number, variation: number): number {
  return 1 + (rand() * 2 - 1) * variation
}

/** The far end of a run that starts at `end`. */
export function otherEnd(end: BankEnd): BankEnd {
  return end === 'upstream' ? 'downstream' : 'upstream'
}

/** The word for travelling TOWARD `end`: running to the upstream rock is
 *  UPSTREAM, and the mirror the other way. */
export function wordToward(end: BankEnd): BankConcept {
  return end === 'upstream' ? 'UPSTREAM' : 'DOWNSTREAM'
}

/** Whether the settlement's body-separation pass may move this child. A tagged
 *  child is a fixed posture for the rest of its run: other bodies yield to it,
 *  but the pass must not rewrite the place where it was caught. */
export function bankChildCanSeparate(c: BankChild): boolean {
  return !c.crouched
}

/** A group at its spawn points, roaming. Every point must already be free — the
 *  caller validates it against the real collider set, exactly as the tag game's
 *  spawns are. */
export function createBankGame(
  spots: ReadonlyArray<{ x: number; z: number }>,
  rand: () => number,
  cfg: BankConfig,
): BankState {
  const children: BankChild[] = spots.map((p) => {
    const heading = rand() * Math.PI * 2
    return {
      x: p.x,
      z: p.z,
      heading,
      facing: heading,
      evading: false,
      reserve: 1 - rand() * cfg.variation,
      press: 'press' as Press,
      effort: 'cruise' as const,
      sprinting: false,
      drainScale: spread(rand, cfg.variation),
      recoverScale: spread(rand, cfg.variation),
      pace: 0,
      walked: 0,
      walkedWhilePlaying: 0,
      pinned: 0,
      nudges: 0,
      carried: 0,
      edgeSide: 0,
      edgeFor: 0,
      anchorX: p.x,
      anchorZ: p.z,
      anchorWalked: 0,
      anchorOut: 0,
      anchorFor: 0,
      lean: 0,
      held: false,
      role: 'runner' as BankRole,
      arrived: false,
      crouched: false,
      roamHeading: heading,
      goalX: p.x,
      goalZ: p.z,
      goalFor: 0,
      climbing: false,
      settled: false,
      lane: 0,
      quarry: -1,
      path: null,
      pathTo: null,
      replan: 0,
    }
  })
  return {
    children,
    phase: 'roam',
    phaseFor: cfg.roamSeconds,
    from: 'downstream',
    direction: null,
    caller: -1,
    climber: -1,
    failedClimbers: [],
    namedBoulder: false,
    abandonedBoulder: false,
    runsThisCycle: 0,
    runs: 0,
    cycles: 0,
    tags: 0,
    clock: 0,
    playedClock: 0,
    // The cycle is continuous — see `playedClock` above.
    playing: true,
    pending: [],
    sinceSaid: Infinity,
  }
}

/** The rock at one end of the stretch. */
export function rockAt(stage: BankStage, end: BankEnd): { x: number; z: number } {
  return end === 'upstream' ? stage.upstream : stage.downstream
}

/**
 * Where the child in slot `slot` waits at the rock at `end`: a stride off the
 * rock's own centre on the side facing the other rock, fanned out sideways so a
 * group of four is a line rather than a heap. Standing ON the rock is
 * impossible — it is a collider — so the stations are what the walk aims at and
 * the arrival is judged against the rock itself.
 */
export function stationAt(
  stage: BankStage,
  end: BankEnd,
  slot: number,
  cfg: BankRoundConfig,
): { x: number; z: number } {
  const here = rockAt(stage, end)
  const far = rockAt(stage, otherEnd(end))
  const dx = far.x - here.x
  const dz = far.z - here.z
  const len = Math.hypot(dx, dz) || 1
  const ax = dx / len
  const az = dz / len
  // Rows of three across the lane, so a larger group stacks back rather than
  // spreading into the water or into the village behind it.
  const row = Math.floor(slot / 3)
  const across = (slot % 3) - 1
  const out = cfg.standOff + row * cfg.stationSpacing
  return {
    x: here.x + ax * out - az * across * cfg.stationSpacing,
    z: here.z + az * out + ax * across * cfg.stationSpacing,
  }
}

/** A point far down the bank in the direction `word` names, used as the aim of
 *  an announcement. Deliberately BEYOND the stretch: the parting call must have
 *  no rock as its target. */
function bankwardAim(
  stage: BankStage,
  word: BankConcept,
  from: { x: number; z: number },
): { x: number; y: number; z: number } {
  const to = word === 'UPSTREAM' ? stage.upstream : stage.downstream
  const away = word === 'UPSTREAM' ? stage.downstream : stage.upstream
  const dx = to.x - away.x
  const dz = to.z - away.z
  const len = Math.hypot(dx, dz) || 1
  const reach = len * 2
  return { x: from.x + (dx / len) * reach, y: 0.6, z: from.z + (dz / len) * reach }
}

/** Offer one utterance in this step. Nothing here touches a pace or a heading:
 *  an utterance is something the player HEARS, never something that steers a
 *  child. Two simultaneous offers remain simultaneous; `drain` chooses one and
 *  discards the rest rather than moving either to the wrong moment. */
function say(s: BankState, u: BankUtterance): void {
  s.pending.push(u)
}

/** Who of `indices` stands nearest `p`; ties keep the lower index. */
function nearestOf(s: BankState, indices: number[], p: { x: number; z: number }): number {
  let best = -1
  let bestD = Infinity
  for (const i of indices) {
    const d = dist(s.children[i], p)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

const runners = (s: BankState): number[] =>
  s.children.map((_, i) => i).filter((i) => s.children[i].role === 'runner')
const catchers = (s: BankState): number[] =>
  s.children.map((_, i) => i).filter((i) => s.children[i].role === 'catcher')
/** A runner still in play this run: neither safe at the far rock nor tagged. */
const free = (s: BankState): number[] =>
  s.children.map((_, i) => i).filter((i) => s.children[i].role === 'runner' && !s.children[i].arrived)

/** Opens a cycle: the caller names the river and becomes the first catcher,
 *  everyone else is a runner, and the runners take the rock nearer the group. */
function openCycle(s: BankState, stage: BankStage, cfg: BankConfig): void {
  const n = s.children.length
  let cx = 0
  let cz = 0
  for (const c of s.children) {
    cx += c.x
    cz += c.z
  }
  cx /= Math.max(1, n)
  cz /= Math.max(1, n)
  const middle = { x: cx, z: cz }
  // The runners gather at the rock the group is already nearer; the caller
  // takes the other and waits there.
  s.from = dist(stage.upstream, middle) <= dist(stage.downstream, middle) ? 'upstream' : 'downstream'
  const caller = nearestOf(
    s,
    s.children.map((_, i) => i),
    rockAt(stage, otherEnd(s.from)),
  )
  s.caller = caller
  s.children.forEach((c, i) => {
    c.role = i === caller ? 'catcher' : 'runner'
    c.arrived = false
    c.crouched = false
    c.climbing = false
    c.settled = false
  })
  s.phase = 'gather'
  s.phaseFor = cfg.gatherSeconds
  s.direction = null
  s.runsThisCycle = 0
  if (caller >= 0) {
    say(s, {
      concept: 'RIVER',
      moment: 'call',
      speaker: caller,
      gesture: 'point',
      aim: { x: stage.water.x, y: 0, z: stage.water.z },
      at: 'water',
    })
  }
}

/** Announces the direction while both sides are still at their stations. The
 *  run itself waits one hearing gap, so its tap is a distinct audible moment. */
function announceRun(s: BankState, stage: BankStage): void {
  const direction = wordToward(otherEnd(s.from))
  const line = runners(s)
  const announcer = line.length > 0 ? nearestOf(s, line, rockAt(stage, s.from)) : -1
  if (announcer < 0) return
  s.direction = direction
  say(s, {
    concept: direction,
    moment: 'announce',
    speaker: announcer,
    gesture: 'point',
    aim: bankwardAim(stage, direction, s.children[announcer]),
    at: 'bank',
  })
}

/** Opens one run: the catcher taps his own rock and names it with nobody
 *  arriving. Its direction was announced one hearing gap before this. */
function openRun(s: BankState, stage: BankStage, cfg: BankConfig): void {
  const to = otherEnd(s.from)
  s.phase = 'run'
  s.phaseFor = cfg.runSeconds
  // The stations are behind them: no run, roam or parting walk follows a route.
  for (const c of s.children) clearPath(c)
  s.runsThisCycle++
  s.runs++
  for (const c of s.children) {
    c.arrived = false
    c.crouched = c.role === 'out'
    c.climbing = false
    c.settled = false
  }
  // Each runner takes its own lane across the stretch, and every catcher starts
  // the run without a quarry — it picks one on the first frame.
  const line = runners(s)
  line.forEach((idx, k) => {
    s.children[idx].lane = (k - (line.length - 1) / 2) * cfg.laneSpacing
  })
  for (const idx of catchers(s)) s.children[idx].quarry = -1
  // THE TAP (spec item 4). The catcher names the rock he is STANDING at, at the
  // start of the run, with nobody arriving anywhere — so ROCK cannot be read as
  // "made it".
  const waiting = catchers(s)
  const tapper = waiting.length > 0 ? nearestOf(s, waiting, rockAt(stage, to)) : -1
  if (tapper >= 0) {
    const rock = rockAt(stage, to)
    say(s, {
      concept: 'ROCK',
      moment: 'tap',
      speaker: tapper,
      gesture: 'indicate',
      aim: { x: rock.x, y: 0.6, z: rock.z },
      at: 'rock',
    })
  }
}

/** Ends the run: the sides swap — the survivors start where they arrived — and
 *  the children caught in it join the catchers for the next one. */
function endRun(s: BankState, stage: BankStage, cfg: BankConfig): void {
  for (const c of s.children) {
    if (c.role === 'out') {
      c.role = 'catcher'
      c.crouched = false
    }
    c.arrived = false
    c.settled = false
  }
  s.from = otherEnd(s.from)
  s.direction = null
  // The cycle normally ends when no runner is left. A run per child is the
  // explicit backstop for the equally valid sequence in which every runner
  // reaches the rock untouched: without it the same sides swap forever and the
  // game never returns to the roaming ROCK guard or the next RIVER call.
  if (runners(s).length === 0 || s.runsThisCycle >= s.children.length) {
    s.phase = 'part'
    s.phaseFor = cfg.partSeconds
    s.cycles++
    // THE PARTING CALL (spec item 4): the group walks off ALONG the bank and one
    // child announces that walk with the OPPOSITE word, from wherever it happens
    // to stand and with no rock as its target. That is what keeps the two
    // direction words from being learnable as "to the far rock". `s.from` has
    // already swapped to the end the last run ARRIVED at, so the word for
    // walking back down the bank is the one for the far end of that swap.
    const word = wordToward(otherEnd(s.from))
    const speaker = nearestOf(
      s,
      s.children.map((_, i) => i),
      rockAt(stage, s.from),
    )
    if (speaker >= 0) {
      say(s, {
        concept: word,
        moment: 'parting',
        speaker,
        gesture: 'point',
        aim: bankwardAim(stage, word, s.children[speaker]),
        at: 'bank',
      })
    }
    return
  }
  s.phase = 'regroup'
  s.phaseFor = cfg.regroupSeconds
}

/** Back to roaming: everybody is a runner again, and a climber is picked for the
 *  boulder that is no part of the game. */
function openRoam(s: BankState, cfg: BankConfig, rand: () => number): void {
  s.phase = 'roam'
  s.phaseFor = cfg.roamSeconds * (1 + (rand() * 2 - 1) * cfg.roamSpread)
  for (const c of s.children) clearPath(c)
  s.direction = null
  s.caller = -1
  s.namedBoulder = false
  s.abandonedBoulder = false
  s.failedClimbers.length = 0
  for (const c of s.children) {
    c.role = 'runner'
    c.arrived = false
    c.crouched = false
    c.climbing = false
    c.settled = false
  }
  // The approach is resolved against the live world on the first roaming step.
  s.climber = -1
  for (const c of s.children) roamGoal(c, rand)
}

/**
 * One step of the round. Mutates in place — a settlement runs this every frame —
 * and is otherwise pure: every decision is a function of the state, the config,
 * the stage and the world predicates. Returns the utterance that fell this
 * frame, or null; the caller speaks it exactly as it speaks any village speech.
 */
export function stepBankGame(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
  rand: () => number,
): BankUtterance | null {
  assertRoundSound(s, cfg)
  if (!(dt > 0)) return null
  // Nothing spoken in an earlier step survives into this one. A delayed word
  // belongs to a different visible action and therefore teaches the wrong
  // reading; a collision is omitted instead.
  s.pending.length = 0
  s.clock += dt
  s.sinceSaid += dt
  if (s.playing) s.playedClock += dt
  const n = s.children.length
  if (n === 0) return null

  // THE PHASE IS DECIDED BEFORE THE CHILDREN ARE MOVED, not after. Taken at the
  // foot of the frame instead, the utterance that opens a phase fell on a group
  // that had just been stepped by the phase BEFORE it — so the announcement of a
  // run was recorded against children still standing at their stations, and
  // "no utterance slows a playing child" read as a slowed child.
  s.phaseFor -= dt
  // The off-game ROCK guard is part of every roaming phase, not an optional
  // attempt. The river call waits until the boulder has actually been climbed
  // and named, unless the approach itself has gone a full calibrated interval
  // without progress. A settlement with no boulder never constructs a stage.
  if (
    s.phase === 'roam' &&
    s.phaseFor <= 0 &&
    (s.namedBoulder || s.abandonedBoulder)
  ) {
    openCycle(s, stage, cfg)
  }
  let openedRun = false
  if (
    (s.phase === 'gather' || s.phase === 'regroup') &&
    (s.phaseFor <= 0 || inPlace(s, stage, cfg, s.from, otherEnd(s.from)))
  ) {
    if (s.direction === null && s.sinceSaid >= cfg.utteranceGapSeconds) {
      announceRun(s, stage)
    } else if (s.direction !== null && s.sinceSaid >= cfg.utteranceGapSeconds) {
      openRun(s, stage, cfg)
      openedRun = true
    }
  }
  if (s.phase === 'part' && s.phaseFor <= 0) openRoam(s, cfg, rand)
  switch (s.phase) {
    case 'roam':
      stepRoam(s, dt, cfg, stage, world, rand)
      break
    case 'gather':
    case 'regroup':
      stepStations(s, dt, cfg, stage, world, s.from, otherEnd(s.from))
      break
    case 'run':
      // The opening frame belongs to the tap: nobody has started toward the far
      // rock yet, so the returned ROCK cannot be read as an arrival.
      if (!openedRun) stepRun(s, dt, cfg, stage, world)
      break
    case 'part':
      stepPart(s, dt, cfg, stage, world)
      break
  }
  assertPlaced(s, world)
  return drain(s, cfg)
}

/** Speaks at most one utterance born this step, with a constant hearing gap.
 *  Everything else from the step is omitted rather than replayed late. */
function drain(s: BankState, cfg: BankRoundConfig): BankUtterance | null {
  if (s.pending.length === 0) return null
  if (s.sinceSaid < cfg.utteranceGapSeconds) {
    s.pending.length = 0
    return null
  }
  s.sinceSaid = 0
  const spoken = s.pending[0] ?? null
  s.pending.length = 0
  return spoken
}

/** The obstacle set THIS child steers round: every other body, plus — with an
 *  extra berth of its own — the traveller (spec item 7). The stranger is not a
 *  stop: a child walks round him and keeps playing. */
function obstacles(
  i: number,
  cfg: BankConfig,
  world: BankWorld,
): ((x: number, z: number) => boolean) | undefined {
  const occ = world.occupied
  const stranger = world.stranger
  if (!occ && !stranger) return undefined
  const berth = stranger ? stranger.radius + world.childRadius + Math.max(0, cfg.strangerBerth) : 0
  return (x: number, z: number) =>
    (!!occ && occ(i, -1, x, z)) ||
    (!!stranger && Math.hypot(x - stranger.x, z - stranger.z) < berth)
}

/** Commands one child a pace and walks it there. `wants` is whether it is
 *  RUNNING rather than walking; a pace of zero is a child that was asked to
 *  stand, which is the reading and never a stall. */
function drive(
  s: BankState,
  i: number,
  to: { x: number; z: number } | null,
  wants: boolean,
  dt: number,
  cfg: BankConfig,
  world: BankWorld,
): void {
  const c = s.children[i]
  ageEdge(c, dt)
  const walkedBefore = c.walked
  if (!to) {
    c.pace = 0
    c.held = true
    trackProgress(c, dt, cfg, world)
    c.reserve = advanceReserve(c.reserve, 0, dt, cfg, c.drainScale, c.recoverScale)
    c.lean += (0 - c.lean) * Math.min(1, dt * 4)
    return
  }
  c.held = false
  c.sprinting = wants
  c.press = pressState(c.press, c.reserve, cfg)
  c.effort = chooseEffort(c.press, wants)
  const floor = floorPace(cfg)
  c.pace = wants
    ? Math.max(floor, effortPace(c.effort, c.reserve, cfg, c.role === 'catcher' ? 'chaser' : 'runner'))
    : Math.max(0, cfg.walkPace)
  const desired = headingToward(c.x, c.z, to.x, to.z, c.heading)
  if (c.pace > 0) moveChild(c, desired, c.pace * dt, dt, cfg, world, obstacles(i, cfg, world))
  trackProgress(c, dt, cfg, world)
  if (s.playing) c.walkedWhilePlaying += c.walked - walkedBefore
  c.facing = turnToward(c.facing, c.heading, cfg.turnRate * dt)
  c.reserve = advanceReserve(c.reserve, c.pace, dt, cfg, c.drainScale, c.recoverScale)
  const top = cfg.sprintSpeed
  const want = cfg.leanAtSprint * Math.max(0, Math.min(1, (c.pace - floor) / Math.max(1e-6, top - floor)))
  c.lean += (want - c.lean) * Math.min(1, dt * 4)
}

/** A fresh drift for a roaming child: a heading it has not just come from. */
function roamGoal(c: BankChild, rand: () => number): void {
  c.goalFor = 0
  c.roamHeading = rand() * Math.PI * 2
}

/**
 * The roaming phase: the group wanders its own quarter on drifting headings, one
 * of them walks to an ordinary boulder and names it, and at the end of it one
 * calls RIVER.
 *
 * The heading DRIFTS and is bent back when the child reaches the edge of the
 * quarter; after every step it is re-read from the way the child actually
 * travelled, so a hut walked round is simply a turn taken rather than a target
 * to fight back toward.
 */
function stepRoam(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
  rand: () => number,
): void {
  // The climber is picked HERE rather than only when a roaming phase opens, so
  // the FIRST phase of a visit has one too: a player who walks in and watches
  // the group would otherwise wait a whole cycle for the one utterance that
  // shows ROCK outside the game.
  if (s.climber < 0 && !s.namedBoulder && !s.abandonedBoulder) {
    s.climber = nearestOf(
      s,
      s.children.flatMap((_, i) => (s.failedClimbers.includes(i) ? [] : [i])),
      stage.boulder,
    )
    if (s.climber >= 0) {
      const c = s.children[s.climber]
      c.goalX = c.x
      c.goalZ = c.z
      c.goalFor = 0
    }
  }
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    c.goalFor += dt
    if (i === s.climber && c.climbing) {
      if (c.goalFor > BOULDER_CLIMB_SECONDS) c.climbing = false
    }
    const climbing = i === s.climber && !s.namedBoulder
    if (climbing) {
      const boulder = stage.boulder
      const nearest = Math.hypot(c.goalX - boulder.x, c.goalZ - boulder.z)
      if (dist(c, boulder) < nearest - 1e-4) {
        c.goalX = c.x
        c.goalZ = c.z
        c.goalFor = 0
      }
      if (dist(c, boulder) <= cfg.reachDistance) {
        // THE BOULDER THAT IS NO PART OF THE GAME (spec item 4). Named where it
        // stands, in the village, far from the two rocks the run is about — so
        // ROCK cannot be read as "the thing you run to".
        s.namedBoulder = true
        c.climbing = true
        c.goalFor = 0
        say(s, {
          concept: 'ROCK',
          moment: 'boulder',
          speaker: i,
          gesture: 'indicate',
          aim: { x: boulder.x, y: 0.8, z: boulder.z },
          at: 'boulder',
        })
        roamGoal(c, rand)
      } else if (c.goalFor > cfg.roamGoalSeconds) {
        // The player sees the child stop pressing an obstructed route and
        // return to the group's wander while the next nearest child tries. The
        // guard is abandoned only when no child in the group can make the
        // approach, so one obstructed route cannot suppress the off-game ROCK.
        s.failedClimbers.push(i)
        s.climber = -1
        s.abandonedBoulder = s.failedClimbers.length === s.children.length
        roamGoal(c, rand)
      } else {
        drive(s, i, boulder, false, dt, cfg, world)
        continue
      }
    }
    // The drift, REFLECTED at the edge of the quarter rather than turned toward
    // its middle. Aiming a child that had reached the rim at the centre point
    // gathered the whole group there: four children milling half a metre apart
    // in the middle of their own quarter (measured in the replayed bambara
    // village, minimum gap 0.42-0.57 m for a whole roaming phase). A reflection
    // keeps the sideways half of the motion and only turns the outward half
    // back, so they walk ALONG their quarter and stay a group of individuals.
    c.roamHeading += (rand() * 2 - 1) * cfg.roamTurn * dt
    const out = Math.hypot(c.x - stage.roam.x, c.z - stage.roam.z)
    if (out > stage.roam.radius * 0.8) {
      const nx = (c.x - stage.roam.x) / out
      const nz = (c.z - stage.roam.z) / out
      const dx = Math.sin(c.roamHeading)
      const dz = Math.cos(c.roamHeading)
      const radial = dx * nx + dz * nz
      if (radial > 0) c.roamHeading = Math.atan2(dx - 2 * radial * nx, dz - 2 * radial * nz)
    }
    const look = cfg.reachDistance
    drive(
      s,
      i,
      { x: c.x + Math.sin(c.roamHeading) * look, z: c.z + Math.cos(c.roamHeading) * look },
      false,
      dt,
      cfg,
      world,
    )
    // Carried on from the way it really went, deflections included.
    c.roamHeading = c.heading
  }
}

/** Whether everybody stands at the station the current run wants him at. */
function inPlace(
  s: BankState,
  stage: BankStage,
  cfg: BankConfig,
  line: BankEnd,
  wait: BankEnd,
): boolean {
  let atLine = 0
  let atWait = 0
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    const end = c.role === 'catcher' ? wait : line
    const slot = c.role === 'catcher' ? atWait++ : atLine++
    if (dist(c, stationAt(stage, end, slot, cfg)) > cfg.reachDistance) return false
  }
  return true
}

/** How near a waypoint counts as reached, and how often a child may replan. */
const WAYPOINT_RADIUS = 1.2
const REPLAN_SECONDS = 1

/** Drops the route a child is no longer walking. */
function clearPath(c: BankChild): void {
  c.path = null
  c.pathTo = null
}

/**
 * WHERE THE NEXT STEP OF A LONG WALK GOES: at the goal while the line to it is
 * open, and otherwise at the next waypoint of a way round what stands between.
 * The same rule the adults' errands walk the village by — planning is asked for
 * only when the line is actually shut, and at most once a second per child, so
 * an open crossing costs nothing at all.
 */
function wayTo(
  c: BankChild,
  goal: { x: number; z: number },
  dt: number,
  world: BankWorld,
): { x: number; z: number } {
  const shut = world.lineBlocked
  if (!shut || !world.route) return goal
  c.replan -= dt
  if (c.pathTo && (c.pathTo.x !== goal.x || c.pathTo.z !== goal.z)) clearPath(c)
  const blocked = shut(c.x, c.z, goal.x, goal.z)
  if (!blocked) {
    // Back on the open line: the detour it has already got past is dropped.
    clearPath(c)
    return goal
  }
  if (!c.path && c.replan <= 0) {
    c.path = world.route(c, goal)
    c.pathTo = { x: goal.x, z: goal.z }
    c.replan = REPLAN_SECONDS
  }
  if (!c.path || c.path.length === 0) return goal
  while (c.path.length > 1 && dist(c, c.path[0]) <= WAYPOINT_RADIUS) c.path.shift()
  return c.path[0]
}

/** The walk to the stations — down to the bank at the head of a cycle, and
 *  across between two runs, which is the ONLY time a tagged child moves. */
function stepStations(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
  line: BankEnd,
  wait: BankEnd,
): void {
  let atLine = 0
  let atWait = 0
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    const end = c.role === 'catcher' ? wait : line
    const slot = c.role === 'catcher' ? atWait++ : atLine++
    const to = stationAt(stage, end, slot, cfg)
    const away = dist(c, to)
    if (away <= cfg.reachDistance * 0.6) c.settled = true
    else if (away > cfg.reachDistance) c.settled = false
    // The walk DOWN to the bank is a run — the whole group sets off at the call
    // — while the shuffle between two runs is a walk.
    const running = s.phase === 'gather' && !c.settled && away > cfg.reachDistance
    if (c.settled) {
      clearPath(c)
      drive(s, i, null, false, dt, cfg, world)
    } else {
      drive(s, i, wayTo(c, to, dt, world), running, dt, cfg, world)
    }
  }
}

/**
 * WHERE A RUNNER ACTUALLY AIMS. The far rock — bent aside while a catcher is
 * near enough to matter, on the side the catcher is NOT, and by less the further
 * away he is. Without it the run is a straight line into a catcher who waits at
 * the very rock they are running to, and nobody ever arrives: the game becomes a
 * single sweep in which the whole group is tagged, which is neither what the
 * user described nor watchable.
 */
function dodgedAim(
  s: BankState,
  c: BankChild,
  farRock: { x: number; z: number },
  cfg: BankConfig,
): { x: number; z: number } {
  const dx = farRock.x - c.x
  const dz = farRock.z - c.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return farRock
  // The perpendicular of its own line to the rock: its lane, and its swerve.
  const px = -dz / len
  const pz = dx / len
  let across = c.lane
  const waiting = catchers(s)
  const near = waiting.length > 0 ? nearestOf(s, waiting, c) : -1
  if (near >= 0) {
    const k = s.children[near]
    const gap = dist(c, k)
    if (gap < cfg.dodgeDistance) {
      // Which side of that line the catcher stands on; the runner leans the
      // other way, and harder the nearer he is.
      const cross = (k.x - c.x) * dz - (k.z - c.z) * dx
      across += (cross > 0 ? -1 : 1) * cfg.dodgeReach * (1 - gap / cfg.dodgeDistance)
    }
  }
  return { x: farRock.x + px * across, z: farRock.z + pz * across }
}

/**
 * The runner a catcher is after. Held across frames — it changes only when the
 * quarry is out of play or another free runner is nearer by more than the
 * switch margin, the same hysteresis the tag game's chaser uses. A catcher that
 * re-picked every frame swept a bunched group and tagged all of it, so no run
 * ever ended in an arrival.
 */
function chooseQuarry(s: BankState, self: number, cfg: BankConfig): number {
  const c = s.children[self]
  const open = free(s)
  if (open.length === 0) return -1
  const nearest = nearestOf(s, open, c)
  const cur = c.quarry
  if (cur < 0 || !open.includes(cur) || cur === nearest) return nearest
  return dist(c, s.children[nearest]) < dist(c, s.children[cur]) - cfg.targetSwitchMargin
    ? nearest
    : cur
}

/** One run: the runners cross to the far rock, the catchers come to meet them. */
function stepRun(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
): void {
  const to = otherEnd(s.from)
  const farRock = rockAt(stage, to)
  let safeSlot = 0
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    if (c.role === 'out') {
      // A TAGGED CHILD DROPS OUT WHERE HE STANDS and holds the posture until the
      // run ends — never confusable with a walking child.
      drive(s, i, null, false, dt, cfg, world)
      continue
    }
    if (c.role === 'catcher') {
      c.quarry = chooseQuarry(s, i, cfg)
      const target = c.quarry
      drive(s, i, target >= 0 ? s.children[target] : farRock, target >= 0, dt, cfg, world)
      continue
    }
    if (c.arrived) {
      // Safe at the far rock: it steps aside into the line for the next run, and
      // stays there once it is in it (the same hysteresis as the stations).
      const spot = stationAt(stage, to, safeSlot++, cfg)
      const away = dist(c, spot)
      if (away <= cfg.reachDistance * 0.6) c.settled = true
      else if (away > cfg.reachDistance) c.settled = false
      drive(s, i, c.settled ? null : spot, false, dt, cfg, world)
      continue
    }
    drive(s, i, dodgedAim(s, c, farRock, cfg), true, dt, cfg, world)
    if (dist(c, farRock) <= cfg.reachDistance) {
      c.arrived = true
      say(s, {
        concept: 'ROCK',
        moment: 'arrival',
        speaker: i,
        gesture: 'indicate',
        aim: { x: farRock.x, y: 0.6, z: farRock.z },
        at: 'rock',
      })
    }
  }

  // ONLY CATCHERS TAG, and only the runner a catcher is actually AFTER: one
  // that happens to brush past on its way elsewhere is not caught, which is
  // what keeps a bunched group from being swept whole. Evaluated after the
  // movement, so two tags can never resolve from one body in one frame.
  for (const ci of catchers(s)) {
    const catcher = s.children[ci]
    const ri = catcher.quarry
    {
      const runner = s.children[ri]
      if (ri < 0 || !runner || runner.role !== 'runner' || runner.arrived) continue
      if (!catchReached(catcher, runner, cfg, world)) continue
      runner.role = 'out'
      runner.crouched = true
      runner.arrived = false
      // It stops in the same frame it is caught: from here it is a posture, not
      // a walker, until the run ends.
      runner.pace = 0
      runner.held = true
      catcher.quarry = -1
      s.tags++
    }
  }

  // A run ENDS when every runner has either touched the far rock or been tagged
  // — and the backstop closes it where a child could not get there at all.
  if (free(s).length === 0 || s.phaseFor <= 0) endRun(s, stage, cfg)
}

/** The group breaks up and walks off ALONG the bank, past the end of the
 *  stretch, with no rock as its target. */
function stepPart(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
): void {
  const word = wordToward(s.from)
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    const aim = bankwardAim(stage, word, c)
    drive(s, i, { x: aim.x, z: aim.z }, false, dt, cfg, world)
  }
}

/**
 * The armed invariants (point 207(i)). Tests only look where they look; this
 * channel turns every session — the user's own play included — into a detector
 * for the states that hide between a phase, a role and a continuous position.
 */
function assertRoundSound(s: BankState, cfg: BankConfig): void {
  devAssert(
    s.phase !== 'run' || s.direction !== null,
    'bank-run-unannounced',
    () => `a run is on with no direction announced (run ${s.runs})`,
  )
  devAssert(
    s.phase === 'run' || s.children.every((c) => !c.crouched),
    'bank-crouched-outside-run',
    () => `${s.children.filter((c) => c.crouched).length} children crouched in phase ${s.phase}`,
  )
  devAssert(
    s.phaseFor <= Math.max(cfg.roamSeconds * (1 + cfg.roamSpread), cfg.gatherSeconds, cfg.runSeconds, cfg.regroupSeconds, cfg.partSeconds) + 1e-6,
    'bank-phase-overrun',
    () => `phase ${s.phase} has ${s.phaseFor.toFixed(1)}s left, more than its own length`,
  )
}

/** Where the step LEFT them: nobody inside a collider or outside the walkable
 *  ground the round is played on. */
function assertPlaced(s: BankState, world: BankWorld): void {
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    devAssert(
      !world.blocked(c.x, c.z),
      'bank-inside',
      () => `child ${i} stands at ${c.x.toFixed(2)},${c.z.toFixed(2)}`,
    )
  }
}
