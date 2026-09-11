// THE VILLAGE CHILDREN'S GAME AT THE RIVER BANK (work-order 687, design.md
// §13.4, docs/communication-poc-spec.md).
//
// ONE GAME, FOUR WORDS, NOTHING STAGED. The children roam their own quarter of
// the village out of earshot of the adults; at the end of that phase one of them
// calls RIVER, points at the water and the whole group runs to the bank — and
// that caller is the first catcher. Between two rocks, one upstream and one
// downstream, they then play run after run: the direction is announced before
// each one, the catcher taps ROCK while everybody holds, whoever reaches the far
// rock calls ROCK, whoever is caught drops out where he stands, and the sides
// swap every run so the announced direction alternates by construction. When no
// free runner is left the caught children remain down long enough for the result
// to read, then everybody walks back toward the roaming quarter.
//
// EVERY UTTERANCE FALLS AT A FIXED POINT OF THE ROUND. There is no situation
// catalogue and no scheduler: the opening call, the direction announcement, the
// catcher's tap and the arrival are moments of the game itself. That is
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
//  - The river visibly flows, so UPSTREAM/DOWNSTREAM correlate with the current
//    for a player who watches the water.
//
// THE WALKING IS THE TAG GAME'S. `moveChild`, `trackProgress` and `ageEdge` come
// from `tagGame.ts` — the same deflection, the same one-side commitment round an
// obstacle and the same two stall watches, so the child-motion metric that
// judges the village (`scripts/verify/childMotionMetric.mjs`) judges this round
// on the same terms. What is new here is the ROUND, not the step.

import { CHILD_FIGURE_SCALE } from '../../render/figures'
import type { GestureKind } from '../../render/gesture'
import { reachFrom, solveTouch } from './rockTouch'
import { createProducerWatch, devAssert, watchProducer, type ProducerWatch } from '../../systems/devAssert'
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
export type BankMoment = 'call' | 'boulder' | 'announce' | 'tap' | 'arrival'

/** What the utterance was aimed at. ROCK falls once with nobody arriving and
 *  once outside the game altogether. */
export type BankAim = 'water' | 'rock' | 'boulder'

/** Where a child is in the climb onto the off-game boulder: on its way up, up
 *  there, on its way down, or on the ground like everybody else. */
export type ClimbStage = 'none' | 'up' | 'top' | 'down'

/** One utterance of the round, ready to be spoken through the §13.4 hearing
 *  curve exactly as any other village speech is. */
export interface BankUtterance {
  concept: BankConcept
  moment: BankMoment
  speaker: number
  gesture: GestureKind
  /** The arm, solved rather than aimed: a touch's hand has to land on a drawn
   *  surface, and re-deriving the angles from a world point through an upright
   *  shoulder puts it centimetres off. Absent for every other moment, which
   *  keeps aiming at the water or a far rock exactly as it was. */
  arm?: { bearing: number; elevation: number }
  /** Seconds the gesture is HELD, where the moment owns its own length. */
  hold?: number
  aim: { x: number; y: number; z: number }
  at: BankAim
}

/** One child. The body and its walking are the tag game's; the round adds who
 *  it is this run and whether it is out of play. */
export interface BankChild extends TagChild {
  role: BankRole
  /** Entered the far rock's safe radius in the current run, out of the catchers'
   *  reach until the next one. */
  arrived: boolean
  /** The last metre and contact hold survive the run's side swap. */
  arrival: { end: BankEnd; stand: { x: number; z: number }; approachFor: number; holdFor: number | null } | null
  /** Tagged: crouched where it stood, arms folded, through the readable ending
   *  when this is the cycle's last run. */
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
  /** Where the child is in the climb onto the ordinary boulder that carries the
   *  off-game ROCK utterance, and how long it has been in that stage. */
  climb: ClimbStage
  climbFor: number
  /** How high the child's feet stand above the settlement's ground, in metres.
   *  Zero for everybody who is not on a stone; the scene adds it to the gait's
   *  own body lift, so the game owns the height and the view only draws it. */
  lift: number
  /** Where it stepped up FROM, so it comes down the same way rather than
   *  appearing back at the stone's foot on some other side. */
  footX: number
  footZ: number
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
  /** This catcher has already made its one tag in the current run. It holds at
   *  that result instead of sweeping immediately through the remaining line. */
  madeTag: boolean
  /**
   * THE SIDE THIS RUNNER SWERVES TO, committed for the run: +1, -1, or 0 before
   * the swerve has engaged at all. The side is chosen from where the catcher
   * stands the first time he comes inside `dodgeDistance`, and then HELD. Read
   * fresh every frame it flipped the moment the catcher crossed the runner's own
   * line to the rock — and with the swerve widened to `dodgeReach` the runner
   * then walked the width of it back the other way, over and over, which the
   * child-motion metric reads for exactly what it looks like: walking without
   * getting anywhere. It is the same one-side commitment `moveChild` makes round
   * an obstacle and `chooseQuarry` makes on a target.
   */
  dodgeSide: number
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
  /** How long it has failed to get any nearer to the corner it is walking to,
   *  and the closest it has come. A corner it cannot touch — one the planner
   *  ran through a wedge the chase is kept out of, one a body is standing on —
   *  is DROPPED rather than pressed against: the mandinka catcher circled a
   *  waypoint it could not reach for two hundred seconds and 400 m of legs. */
  wayFor: number
  wayBest: number
  /** The corner a shut leg made the walk give its route up over, and the spot
   *  the child stood on when it did. While the child is still near that spot, a
   *  fresh plan whose first corner is this one is REFUSED — a stalled child has
   *  barely moved, so the planner would only hand the same route back. */
  refused: { x: number; z: number; fromX: number; fromZ: number } | null
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
  /** The world radius of a play rock's DRAWN flank, on a world bearing from its
   *  own axis and at a world height. The tap is solved against this rather than
   *  against a nominal radius, so a wider or narrower stone keeps the hand on
   *  its surface (work-order 1065). */
  flank: (end: BankEnd, bearing: number, y: number) => number
  /** Where the water lies — the point the RIVER call points at. */
  water: { x: number; z: number }
  /**
   * An ordinary scattered boulder in the village, climbed and named during the
   * roaming phase. A settlement without one must not construct this stage.
   *
   * It carries its own SIZE (work-order 1080), because the climb is played
   * against the real stone: `radius` is the collider the approach has to stop
   * outside of, and `height` is where the child's feet end up. Both come from
   * the drawn instance, so the child stands on the stone the player sees rather
   * than at a constant lift beside it.
   */
  boulder: { x: number; z: number; radius: number; height: number }
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
  /** How long everybody holds at the stations while the catcher taps ROCK. */
  tapPauseSeconds: number
  /** How long an arriving runner rests its hand on the far stone. */
  arrivalHoldSeconds: number
  /** Backstop on the walk between two runs. */
  regroupSeconds: number
  /** How long the group walks toward its roaming quarter before roaming again. */
  partSeconds: number
  /** How long the caught children remain crouched after the cycle's last run. */
  endPauseSeconds: number
  /** Arrival/safe radius from the rock's centre; hand contact is solved separately. */
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
  /** How far outside the boulder's own collider the approach ends and the step
   *  up begins (work-order 1080). */
  climbApproach: number
  /** How long the step up onto the stone takes, how long the child then stands
   *  on it, and how long the step back down takes. The hold is what gives a
   *  player who hears ROCK the time to look over and see what is under the
   *  child's feet. */
  climbRiseSeconds: number
  climbHoldSeconds: number
  climbSinkSeconds: number
  /** The most OVERTIME the guard may hold a cycle for, past the roaming phase's
   *  own length. The watch above resets on any gain, so a child creeping at a
   *  stone it can never reach neither arrives nor fails; without this the phase
   *  has no bound at all. */
  roamGuardSeconds: number
  /** The pace of every walk that is not a run (m/s). */
  walkPace: number
  /** The EXTRA berth the children give the traveller over a villager — they are
   *  shy of the stranger and visibly swerve rather than brush past him. */
  strangerBerth: number
  /** Ordinary gap between two utterances. A run's first arrival is the one
   *  deliberate exception: that result may not be dropped. */
  utteranceGapSeconds: number
  /** The longest silence tolerated of a round that could speak, before the
   *  dev-mode alarm of point 589 fires. Deliberately NOT `silenceSeconds`: the
   *  round's config is the tag config with this one merged over it, and a shared
   *  name would silently decide which round's window a reader is looking at. */
  roundSilenceSeconds: number
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
  /** Who goes to the far rock to lay a hand on it and name it this run, or −1.
   *  Chosen when the walk to the stations begins, because the walk is what has
   *  to take it there (work-order 1065). */
  tapper: number
  /** Children whose boulder approach made no progress this roaming phase. */
  failedClimbers: number[]
  /** Whether the boulder has already been named this roaming phase. */
  namedBoulder: boolean
  /** Whether the off-game ROCK guard is FINISHED WITHOUT A NAMING this phase —
   *  because every child proved unable to reach the boulder, or because the
   *  guard spent its overtime (`roamGuardSeconds`). Either way the cycle is free
   *  to open. */
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
  /** Utterances born in the current step. An ordinary moment that falls inside
   *  the hearing gap is omitted, never carried into a later moment. */
  pending: BankUtterance[]
  sinceSaid: number
  /** Seconds left of the visible tap hold at the start of a run — running ONLY
   *  while a tap was actually spoken. A run that opens silently, because the
   *  tapper could not reach its stone, holds nobody: freezing the group for a
   *  word that never falls is a pause the player cannot read, and it made the
   *  hold useless as the window in which the tap is measured (08.09.2026). */
  tapFor: number
  /** Seconds left before the caught children rise at the end of a cycle. */
  endFor: number
  /** The first arrival of this run has reached the speech output. */
  arrivalSpoken: boolean
  /** The point-589 long-run watch on the round's own SPEECH. It moved here with
   *  the words: the alarm used to sit on the situation catalogue the five-word
   *  rebuild deleted, and was left watching a producer that could no longer
   *  produce anything at all. */
  speech: ProducerWatch
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** Is this child on the stone, or on its way on or off it? */
export function onStone(c: BankChild): boolean {
  return c.climb !== 'none'
}

/**
 * Where the climber steps back down to: the foot it came up from while that is
 * still free, and otherwise the nearest free stand on the same ring round the
 * stone, searched outward from the side it climbed.
 *
 * It is asked at the END of the hold rather than kept from the start, because
 * the hold is seconds long and the ground below is the village's: another child
 * wanders past, the traveller walks up to the stone. The last resort is the
 * world's own rescue, which is what every other placement in this round falls
 * back to.
 */
function landingFor(
  c: BankChild,
  i: number,
  b: BankStage['boulder'],
  cfg: BankConfig,
  world: BankWorld,
): { x: number; z: number } {
  const taken = (x: number, z: number) =>
    world.blocked(x, z) || insideStrangerBerth(world, cfg, x, z) || !!world.occupied?.(i, -1, x, z)
  if (!taken(c.footX, c.footZ)) return { x: c.footX, z: c.footZ }
  const ring = climbFrom(b, cfg, world)
  const from = Math.atan2(c.footX - b.x, c.footZ - b.z)
  // Round the stone in alternating steps, so it comes down as near as it can to
  // the side it went up.
  for (let step = 1; step <= 11; step++) {
    const turn = (((step + 1) >> 1) * Math.PI) / 6
    const a = from + (step % 2 === 1 ? -turn : turn)
    const x = b.x + Math.sin(a) * ring
    const z = b.z + Math.cos(a) * ring
    if (!taken(x, z)) return { x, z }
  }
  // THE RESCUE IS CHECKED LIKE ANY OTHER CANDIDATE (cross-vendor review,
  // 09.09.2026): `nudge` answers the STATIC collider set, so it will happily
  // hand back ground a person is standing on. Where even that is taken the child
  // comes down where it went up and is an ordinary child again the moment it
  // does — the body separation and the escape nudge push two figures apart every
  // frame, and they are what owns a crowd. What must not happen is a landing
  // chosen while somebody was there and then never looked at again, and that is
  // what the per-frame re-read above prevents.
  const free = world.nudge(c.footX, c.footZ)
  if (!taken(free.x, free.z)) return { x: free.x, z: free.z }
  return { x: c.footX, z: c.footZ }
}

/** How near the boulder's CENTRE the approach walks before the child steps up:
 *  the stone's own collider — which is what stops it walking any closer — plus
 *  its own footprint and a small margin, so what follows is a step onto the
 *  stone and not a leap at it from two metres out. */
function climbFrom(boulder: BankStage['boulder'], cfg: BankRoundConfig, world: BankWorld): number {
  return boulder.radius + world.childRadius + Math.max(0, cfg.climbApproach)
}

/** Back on the ground, wherever the round needs a climb cut short. */
function endClimb(c: BankChild): void {
  if (c.climb === 'none') return
  c.x = c.footX
  c.z = c.footZ
  c.climb = 'none'
  c.climbFor = 0
  c.lift = 0
}

/**
 * THE CLIMB (work-order 1080): the step up onto the stone, the stand on top of
 * it, and the step back down.
 *
 * It is played as a MOVEMENT rather than a switch, because the switch is what
 * shipped and what the player never saw: a 0.32 m lift held for 0.35 s while the
 * child stood 2.2 m clear of the boulder. Here the child crosses the last
 * stretch onto the stone's own centre as it rises, so the picture is a child
 * getting up onto a rock; and it says ROCK from up there, standing still long
 * enough for a player who hears the word to look over and find what it is
 * standing on. That is the whole purpose of this stone — spec item 4 of
 * `docs/communication-poc-spec.md`, the guard that keeps ROCK from being learned
 * as "the thing you run to".
 *
 * The stone's collider is not consulted while it is up there: the child is ON
 * the obstacle, not walking into it, and `bankChildCanSeparate` keeps the body
 * separation off it for the same reason.
 */
function stepClimb(
  s: BankState,
  i: number,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
): boolean {
  const c = s.children[i]
  const b = stage.boulder
  c.climbFor += dt
  // Standing, and TOLD to stand: `drive` with no goal is what resets the stall
  // watches, so a child that holds still on a stone is never read as one that
  // walked into something and got nowhere.
  drive(s, i, null, false, dt, cfg, world)
  if (c.climb === 'up') {
    const t = Math.min(1, c.climbFor / Math.max(1e-6, cfg.climbRiseSeconds))
    c.x = c.footX + (b.x - c.footX) * t
    c.z = c.footZ + (b.z - c.footZ) * t
    c.lift = b.height * t
    // Up it goes facing the stone, the way anybody climbs one.
    c.facing = turnToward(c.facing, Math.atan2(b.x - c.footX, b.z - c.footZ), cfg.turnRate * dt)
    if (t >= 1) {
      c.climb = 'top'
      c.climbFor = 0
      // THE WORD FALLS UP HERE, not on the way. Spoken at the foot of the stone
      // it names whatever the child was walking past; spoken from the top of it,
      // with the child's own gesture at the rock under its feet, it names the
      // stone.
      s.namedBoulder = true
      // IT POINTS DOWN AT WHAT IT IS STANDING ON, and out toward the side it
      // climbed from, so the arm has a direction: aimed at the stone's centre
      // the gesture would be a vertical line under the child's own feet, which
      // reads as nothing at all. The rim on the foot's side is the part of the
      // stone a watcher can see past the child.
      const away = Math.hypot(c.footX - b.x, c.footZ - b.z) || 1
      say(s, {
        concept: 'ROCK',
        moment: 'boulder',
        speaker: i,
        gesture: 'indicate',
        aim: {
          x: b.x + ((c.footX - b.x) / away) * b.radius,
          y: b.height,
          z: b.z + ((c.footZ - b.z) / away) * b.radius,
        },
        at: 'boulder',
      })
    }
    return false
  }
  if (c.climb === 'top') {
    c.x = b.x
    c.z = b.z
    c.lift = b.height
    // …and up there it turns round to face back over the quarter it climbed out
    // of, which is where anybody who might look is standing.
    c.facing = turnToward(c.facing, Math.atan2(c.footX - b.x, c.footZ - b.z), cfg.turnRate * dt)
    if (c.climbFor >= cfg.climbHoldSeconds) {
      // WHERE IT COMES DOWN IS DECIDED HERE, not when it went up (cross-vendor
      // review, 09.09.2026). The child stands on the stone for seconds, and the
      // ground it climbed from is ordinary village ground: the traveller can
      // walk right up to the boulder while it is up there, and a descent that
      // simply returned to the saved foot would set the child down inside him.
      const landing = landingFor(c, i, b, cfg, world)
      c.footX = landing.x
      c.footZ = landing.z
      c.climb = 'down'
      c.climbFor = 0
    }
    return false
  }
  // AND THE WAY DOWN IS RE-READ EVERY FRAME OF IT. The sink takes the better part
  // of a second, and a target chosen when the hold ended is stale the moment
  // somebody walks onto it; `landingFor` keeps the current foot while it is
  // free, so this settles on a spot instead of wandering.
  const landing = landingFor(c, i, b, cfg, world)
  c.footX = landing.x
  c.footZ = landing.z
  // THE HEIGHT COMES DOWN ON THE CLIMB'S CLOCK; THE FEET TRAVEL AT A PACE
  // (cross-vendor review, 09.09.2026, third round). Read as a fraction of the
  // whole descent, a landing that changed at nine tenths of the way down moved
  // the child nine tenths of the distance to the new spot in ONE frame — a
  // teleport a hand's breadth above the ground. Walking the remaining gap at a
  // pace cannot do that whenever the target moves: the picture is a child
  // stepping off a stone and, where somebody has taken its place, stepping down
  // beside them instead.
  const t = Math.min(1, c.climbFor / Math.max(1e-6, cfg.climbSinkSeconds))
  c.lift = b.height * (1 - t)
  // Fast enough to make the ordinary descent in its own time, and never slower
  // than the child walks.
  const paced = Math.max(cfg.walkPace, climbFrom(b, cfg, world) / Math.max(1e-6, cfg.climbSinkSeconds))
  const gap = Math.hypot(c.footX - c.x, c.footZ - c.z)
  if (gap > 1e-9) {
    const step = Math.min(gap, paced * dt)
    c.x += ((c.footX - c.x) / gap) * step
    c.z += ((c.footZ - c.z) / gap) * step
  }
  if (t < 1) return false
  // ITS OWN BOUND, because `openCycle` waits for the stone to be clear: a
  // traveller who keeps taking the spot the child is walking to could otherwise
  // hold the whole round. Past a few times the descent's own length the child is
  // simply on the ground where it stands, and the body separation takes it from
  // there like any other crowded figure.
  if (gap > 1e-3 && c.climbFor < cfg.climbSinkSeconds * 4) return false
  c.footX = c.x
  c.footZ = c.z
  endClimb(c)
  return true
}

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

/** Both teaching holds keep the body at the position and height solved for
 * contact, including the opening frame before a frozen gait settles. */
export function bankChildTouching(s: BankState, i: number): boolean {
  return (s.phase === 'run' && s.tapFor > 0 && i === s.tapper) || (s.children[i].arrival?.holdFor ?? 0) > 0
}

/** Other bodies yield to a tagged child or a child holding contact. */
export function bankChildCanSeparate(c: BankChild, touching = false): boolean {
  // …and a child ON THE STONE is not in anybody's way either (work-order 1080):
  // the separation works in the ground plane and knows nothing about the half
  // metre it is standing above it, so left in the set it would be shoved off
  // the boulder by whoever wandered past below.
  return !c.crouched && !onStone(c) && !touching && !(c.arrival && c.arrival.holdFor !== null)
}

/** A teaching contact is solved at standing height, even on its opening frame.
 * The runner's last gait dip must not lower the hand onto a narrower flank. */
export function bankChildBodyLift(c: BankChild, gaitLift: number, touching = false): number {
  return c.lift + (touching || c.arrival?.holdFor != null ? 0 : gaitLift)
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
      arrival: null,
      crouched: false,
      roamHeading: heading,
      goalX: p.x,
      goalZ: p.z,
      goalFor: 0,
      climb: 'none' as ClimbStage,
      climbFor: 0,
      lift: 0,
      footX: p.x,
      footZ: p.z,
      settled: false,
      lane: 0,
      quarry: -1,
      madeTag: false,
      dodgeSide: 0,
      path: null,
      pathTo: null,
      replan: 0,
      wayFor: 0,
      wayBest: Infinity,
      refused: null,
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
    tapper: -1,
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
    tapFor: 0,
    endFor: 0,
    arrivalSpoken: false,
    speech: createProducerWatch(),
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

/** Maximum radial contact residual, in metres. At the verification framing
 * (~150 px/m), 2 mm is 0.3 pixel; the former 30 mm admitted visible daylight.
 * The flank lookup now intersects the actual triangles (hand-stone-contact.md).
 */
export const TOUCH_GAP = 0.002

/**
 * WHERE THE TAPPER STANDS TO REACH THE STONE, and from which side.
 *
 * It comes at the rock from the side its own station is on — between the two
 * stones, in the lane the player is watching — so the contact happens in the
 * open rather than behind the rock. The distance is solved against the stone's
 * DRAWN flank (`stage.flank`), so the child ends up at the stone however wide
 * or narrow this one is; `null` where the flank cannot be reached at all.
 * Arrivals supply their own approach bearing instead of the other stone's.
 */
export function touchStand(
  stage: BankStage,
  end: BankEnd,
  blocked?: (x: number, z: number) => boolean,
  approachBearing?: number,
): { x: number; z: number; bearing: number; elevation: number } | null {
  const here = rockAt(stage, end)
  const far = rockAt(stage, otherEnd(end))
  const bearing = approachBearing ?? Math.atan2(far.x - here.x, far.z - here.z)
  if (approachBearing === undefined) {
    // Try the station bearing first, then neighbouring facets on that same
    // side. The exact flank can be unreachable behind the collider on one
    // bearing while the next facet is reachable; never move the collider.
    for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
      const found = touchStand(stage, end, blocked, bearing + offset * Math.PI / 12)
      if (found) return found
    }
    return null
  }
  const flank = (y: number, offset: number) => stage.flank(end, bearing + offset, y)
  const solved = solveTouch(flank, CHILD_FIGURE_SCALE)
  if (!solved) return null
  const spotAt = (stand: number) => ({
    x: here.x + Math.sin(bearing) * stand,
    z: here.z + Math.cos(bearing) * stand,
  })
  // AND IT HAS TO BE GROUND THE CHILD MAY STAND ON. The furthest stand that
  // still touches can fall a few millimetres inside the stone's own collider —
  // measured, the bambara upstream rock does exactly that — and a goal inside a
  // collider is a goal the walk deflects round forever. So the spot is pushed
  // OUT to the first free ground, and kept only while the hand still reaches.
  let stand = solved.stand
  if (blocked) {
    const step = TOUCH_GAP / 2
    for (let k = 0; k <= 20 && blocked(spotAt(stand).x, spotAt(stand).z); k++) stand = solved.stand + k * step
    if (blocked(spotAt(stand).x, spotAt(stand).z)) return null
  }
  const reached = reachFrom(stand, flank, CHILD_FIGURE_SCALE)
  if (!reached || Math.abs(reached.gap) > TOUCH_GAP) return null
  return { ...spotAt(stand), bearing, elevation: reached.elevation }
}

/**
 * THE REACH THIS CHILD HAS FROM WHERE IT IS STANDING — the arm that puts its
 * hand on the flank, and how far short of it that hand falls. A walker arrives
 * near its goal rather than on it, so the tap is judged against the spot the
 * child really reached, never against the spot it was sent to.
 */
export function touchReach(
  stage: BankStage,
  end: BankEnd,
  at: { x: number; z: number },
): { elevation: number; gap: number; height: number } | null {
  const here = rockAt(stage, end)
  const dx = at.x - here.x
  const dz = at.z - here.z
  const bearing = Math.atan2(dx, dz)
  const reached = reachFrom(Math.hypot(dx, dz), (y, offset) => stage.flank(end, bearing + offset, y), CHILD_FIGURE_SCALE)
  if (!reached) return null
  return { elevation: reached.elevation, gap: reached.gap, height: reached.height }
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
    endClimb(c)
    c.settled = false
  })
  s.phase = 'gather'
  s.phaseFor = cfg.gatherSeconds
  s.tapper = caller
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
  const to = otherEnd(s.from)
  const direction = wordToward(to)
  const line = runners(s)
  const announcer = line.length > 0 ? nearestOf(s, line, rockAt(stage, s.from)) : -1
  if (announcer < 0) return
  const rock = rockAt(stage, to)
  s.direction = direction
  say(s, {
    concept: direction,
    moment: 'announce',
    speaker: announcer,
    gesture: 'point',
    aim: { x: rock.x, y: 0.6, z: rock.z },
    at: 'rock',
  })
}

/** Opens one run: the catcher taps his own rock and names it with nobody
 *  arriving. Its direction was announced one hearing gap before this. */
function openRun(s: BankState, stage: BankStage, cfg: BankConfig): void {
  const to = otherEnd(s.from)
  s.phase = 'run'
  s.phaseFor = cfg.runSeconds
  // The hold belongs to the WORD, and the word is offered further down only if
  // the hand reaches the stone — so it is armed there, not here.
  s.tapFor = 0
  s.arrivalSpoken = false
  // The stations are behind them: no run, roam or parting walk follows a route.
  for (const c of s.children) clearPath(c)
  s.runsThisCycle++
  s.runs++
  for (const c of s.children) {
    c.arrived = false
    c.crouched = c.role === 'out'
    endClimb(c)
    c.settled = false
  }
  // Each runner takes its own lane across the stretch, and every catcher starts
  // the run without a quarry — it picks one on the first frame.
  const line = runners(s)
  line.forEach((idx, k) => {
    s.children[idx].lane = (k - (line.length - 1) / 2) * cfg.laneSpacing
  })
  for (const idx of catchers(s)) {
    s.children[idx].quarry = -1
    s.children[idx].madeTag = false
  }
  // A fresh run is a fresh choice of side: the stations have swapped and the
  // catcher stands somewhere else entirely.
  for (const c of s.children) c.dodgeSide = 0
  // THE TAP (spec item 4). The catcher names the rock he is TOUCHING, at the
  // start of the run, with nobody arriving anywhere — so ROCK cannot be read as
  // "made it".
  //
  // AND THE HAND IS ON THE STONE WHILE THE WORD FALLS (work-order 1065). The tap
  // used to be spoken from the waiting station, 2.6 m off a stone 1.2 m across:
  // the hand ended more than a metre from its own object and the user read the
  // word as "go!" rather than as ROCK. So the word is offered only where the
  // reach measured from the child's ACTUAL spot lands on the drawn flank; where
  // the walk to the stone was blocked, the run opens SILENTLY rather than
  // teaching ROCK from the air.
  const tapper = s.tapper
  const reach = tapper >= 0 && tapper < s.children.length ? touchReach(stage, to, s.children[tapper]) : null
  if (tapper >= 0 && reach && Math.abs(reach.gap) <= TOUCH_GAP) {
    const rock = rockAt(stage, to)
    const c = s.children[tapper]
    // It faces what its hand is on: the reach is solved straight ahead, so a
    // child looking anywhere else would lay its hand somewhere else.
    c.heading = Math.atan2(rock.x - c.x, rock.z - c.z)
    c.facing = c.heading
    c.lean = 0
    // The group stands still for exactly as long as the hand is on the stone.
    s.tapFor = cfg.tapPauseSeconds
    say(s, {
      concept: 'ROCK',
      moment: 'tap',
      speaker: tapper,
      gesture: 'touch',
      arm: { bearing: 0, elevation: reach.elevation },
      hold: cfg.tapPauseSeconds,
      aim: { x: rock.x, y: reach.height, z: rock.z },
      at: 'rock',
    })
  }
}

/** Ends the run: the sides swap — the survivors start where they arrived — and
 *  the children caught in it join the catchers for the next one. */
function endRun(s: BankState, stage: BankStage, cfg: BankConfig): void {
  const cycleEnded = runners(s).length === 0 || s.runsThisCycle >= s.children.length
  for (const c of s.children) {
    c.arrived = false
    c.settled = false
  }
  s.from = otherEnd(s.from)
  s.direction = null
  // The cycle normally ends when no runner is left. A run per child is the
  // explicit backstop for the equally valid sequence in which every runner
  // reaches the rock untouched: without it the same sides swap forever and the
  // game never returns to the roaming ROCK guard or the next RIVER call.
  if (cycleEnded) {
    s.phase = 'part'
    s.phaseFor = cfg.partSeconds
    s.endFor = cfg.endPauseSeconds
    s.cycles++
    return
  }
  for (const c of s.children) {
    if (c.role !== 'out') continue
    c.role = 'catcher'
    c.crouched = false
  }
  s.phase = 'regroup'
  s.phaseFor = cfg.regroupSeconds
  // The stone the next run is towards is the one that gets tapped, so the child
  // sent to it is picked here — before the walk, which is what carries it there.
  const waiting = catchers(s)
  s.tapper = waiting.length > 0 ? nearestOf(s, waiting, rockAt(stage, otherEnd(s.from))) : -1
}

/** Back to roaming: everybody is a runner again, and a climber is picked for the
 *  boulder that is no part of the game. */
function openRoam(s: BankState, cfg: BankConfig, rand: () => number): void {
  s.phase = 'roam'
  s.phaseFor = cfg.roamSeconds * (1 + (rand() * 2 - 1) * cfg.roamSpread)
  for (const c of s.children) clearPath(c)
  s.direction = null
  s.tapFor = 0
  s.endFor = 0
  s.caller = -1
  s.namedBoulder = false
  s.abandonedBoulder = false
  s.failedClimbers.length = 0
  for (const c of s.children) {
    c.role = 'runner'
    c.arrived = false
    c.crouched = false
    endClimb(c)
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
/**
 * One step of the round, plus the long-run watch on what it SAID (point 589).
 * The alarm is about the output that reaches the player — an utterance spoken —
 * never about the timer meant to schedule it, and it is DEV-gated at the call
 * site so a production build allocates nothing per frame.
 */
export function stepBankGame(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
  rand: () => number,
): BankUtterance | null {
  const spoken = advanceBankGame(s, dt, cfg, stage, world, rand)
  if (import.meta.env.DEV) {
    watchProducer(s.speech, {
      code: 'bank-speech-silent',
      dt,
      produced: spoken !== null,
      // A round with nobody to play it is quiet by right, exactly as a group of
      // one is at the chase.
      expected: s.children.length >= 2,
      maxSilenceSeconds: cfg.roundSilenceSeconds,
      detail: () =>
        `${s.children.length} children, phase ${s.phase} for ${s.phaseFor.toFixed(0)}s more, ` +
        `${s.cycles} cycles and ${s.runs} runs played`,
    })
  }
  return spoken
}

function advanceBankGame(
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
  const holdsTapThisStep = s.phase === 'run' && s.tapFor > 0
  const holdsEndThisStep = s.phase === 'part' && s.endFor > 0
  if (holdsTapThisStep) s.tapFor = Math.max(0, s.tapFor - dt)
  else if (holdsEndThisStep) s.endFor = Math.max(0, s.endFor - dt)
  else s.phaseFor -= dt
  // The off-game ROCK guard is part of every roaming phase, not an optional
  // attempt. The river call waits until the boulder has actually been climbed
  // and named, unless the approach itself has gone a full calibrated interval
  // without progress. A settlement with no boulder never constructs a stage.
  // THE ROAMING PHASE CANNOT RUN FOREVER (work-order 687). Its only exit was the
  // off-game ROCK guard resolving, and the guard's own watch resets on ANY gain
  // toward the boulder — so a child creeping at a stone it can never quite reach
  // neither arrives nor gives up, and the phase had no bound at all. Measured
  // under load, the round played 150 s of its own clock in `roam` without
  // opening a single run: the player stands at the bank and the game he came for
  // never happens. The guard therefore gets the phase plus `roamGuardSeconds` of
  // overtime, and then it is DONE — expressed in the round's own clock, like
  // every other length here, and left in exactly the state a genuine abandon
  // leaves so `openCycle` needs to know nothing about which of the two it was.
  //
  // WHAT IT COSTS: that one cycle carries no off-game ROCK. The guard keeps
  // 92 % of its namings at this bound (see `balance.villageLife.bankGame`), and
  // a settlement whose boulder is chronically unreachable loses the guard while
  // keeping the game. That is the trade deliberately: the ROCK outside the game
  // is a corroboration, the game is the deliverable.
  if (s.phase === 'roam' && s.phaseFor <= -cfg.roamGuardSeconds && !s.namedBoulder) {
    s.abandonedBoulder = true
  }
  if (
    s.phase === 'roam' &&
    s.phaseFor <= 0 &&
    (s.namedBoulder || s.abandonedBoulder) &&
    // …AND NOBODY IS STILL UP ON THE STONE (work-order 1080). The naming happens
    // at the TOP of the climb, and the phase clock has usually run out by then,
    // so without this the cycle opened on the same frame the word fell and
    // `openCycle` put the climber back on the ground: the player heard ROCK and
    // saw the child already walking away from a rock it never stood on. The
    // climb is bounded by its own three lengths, so this can only ever hold the
    // cycle for the seconds the child needs to come down.
    !s.children.some(onStone)
  ) {
    openCycle(s, stage, cfg)
  }
  let openedRun = false
  if (
    (s.phase === 'gather' || s.phase === 'regroup') &&
    !s.children.some((c) => c.arrival) &&
    (s.phaseFor <= 0 || inPlace(s, stage, cfg, world, s.from, otherEnd(s.from)))
  ) {
    if (s.direction === null && s.sinceSaid >= cfg.utteranceGapSeconds) {
      announceRun(s, stage)
    } else if (s.direction !== null && s.sinceSaid >= cfg.utteranceGapSeconds) {
      openRun(s, stage, cfg)
      openedRun = true
    }
  }
  if (s.phase === 'part' && s.phaseFor <= 0 && !s.children.some((c) => c.arrival)) openRoam(s, cfg, rand)
  switch (s.phase) {
    case 'roam':
      stepRoam(s, dt, cfg, stage, world, rand)
      break
    case 'gather':
    case 'regroup':
      stepStations(s, dt, cfg, stage, world, s.from, otherEnd(s.from))
      break
    case 'run':
      // The tap owns a visible held-standing interval, including its opening
      // frame. Only after it expires does either side charge.
      if (openedRun || holdsTapThisStep) stepHeld(s, dt, cfg, stage, world)
      else stepRun(s, dt, cfg, stage, world)
      break
    case 'part':
      stepPart(s, dt, cfg, stage, world, holdsEndThisStep)
      break
  }
  assertPlaced(s, world)
  return drain(s, cfg)
}

/** Speaks at most one utterance born this step, normally after the configured
 *  hearing gap. Everything else from the step is omitted rather than replayed late. */
function drain(s: BankState, cfg: BankRoundConfig): BankUtterance | null {
  if (s.pending.length === 0) return null
  // The first safe child is part of the run's result, not optional chatter. It
  // wins over the hearing gap so a near-simultaneous earlier moment cannot erase
  // every audible arrival from the run.
  if (!s.arrivalSpoken) {
    const firstArrival = s.pending.find((u) => u.moment === 'arrival')
    if (firstArrival) {
      s.arrivalSpoken = true
      s.sinceSaid = 0
      s.pending.length = 0
      return firstArrival
    }
  }
  if (s.sinceSaid < cfg.utteranceGapSeconds) {
    s.pending.length = 0
    return null
  }
  s.sinceSaid = 0
  const spoken = s.pending[0] ?? null
  s.pending.length = 0
  return spoken
}

/**
 * THE BERTH THE ROUND OWES THE TRAVELLER (spec item 7), in ONE place: a child's
 * own footprint plus the stranger's, plus the extra radius the children keep
 * from him because they are shy of him.
 *
 * Everything that can move a child reads THIS — the round's own steering below
 * AND the body separation the scene runs after it (points 129/378). The
 * separation knows only the inhabitants' bodies, and the traveller is not one of
 * them, so with a rule of its own it pushed a child 5 cm inside the berth the
 * steering had just kept: a brush past him where the spec asks for a visible
 * swerve.
 */
export function insideStrangerBerth(
  world: BankWorld,
  cfg: BankRoundConfig,
  x: number,
  z: number,
): boolean {
  const s = world.stranger
  if (!s) return false
  return Math.hypot(x - s.x, z - s.z) < s.radius + world.childRadius + Math.max(0, cfg.strangerBerth)
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
  if (!occ && !world.stranger) return undefined
  return (x: number, z: number) =>
    (!!occ && occ(i, -1, x, z)) || insideStrangerBerth(world, cfg, x, z)
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
  stopAtGoal = false,
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
  const occupied = obstacles(i, cfg, world)
  const blockedByBody = (x: number, z: number) => !!occupied?.(x, z) ||
    s.children.some((other, j) => j !== i && other.arrival?.holdFor != null &&
      dist(other, { x, z }) < world.childRadius * 2)
  // Contact has millimetres of tolerance. Walk the final partial step instead
  // of overshooting the solved stand and oscillating across it at low FPS.
  const step = stopAtGoal ? Math.min(c.pace * dt, dist(c, to)) : c.pace * dt
  if (c.pace > 0) moveChild(c, desired, step, dt, cfg, world, blockedByBody, stopAtGoal ? to : undefined)
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
    // A child that is on the stone is played by the climb, not by the wander —
    // and when it steps off it takes a fresh heading like any other child that
    // has just finished something.
    if (onStone(c)) {
      if (stepClimb(s, i, dt, cfg, stage, world)) roamGoal(c, rand)
      continue
    }
    const approaching = i === s.climber && !s.namedBoulder
    if (approaching) {
      const boulder = stage.boulder
      const nearest = Math.hypot(c.goalX - boulder.x, c.goalZ - boulder.z)
      if (dist(c, boulder) < nearest - 1e-4) {
        c.goalX = c.x
        c.goalZ = c.z
        c.goalFor = 0
      }
      if (dist(c, boulder) <= climbFrom(boulder, cfg, world)) {
        // THE BOULDER THAT IS NO PART OF THE GAME (spec item 4). Climbed and
        // named where it stands, in the village, far from the two rocks the run
        // is about — so ROCK cannot be read as "the thing you run to". The
        // approach ends HERE, at the stone's own edge; `stepClimb` takes the
        // child the last stretch onto it and speaks the word from up there.
        c.footX = c.x
        c.footZ = c.z
        c.climb = 'up'
        c.climbFor = 0
        c.goalFor = 0
        clearPath(c)
        continue
      } else if (c.goalFor > cfg.roamGoalSeconds) {
        // The player sees the child stop pressing an obstructed route and
        // return to the group's wander while the next nearest child tries. The
        // guard is abandoned only when no child in the group can make the
        // approach, so one obstructed route cannot suppress the off-game ROCK.
        s.failedClimbers.push(i)
        s.climber = -1
        s.abandonedBoulder = s.failedClimbers.length === s.children.length
        clearPath(c)
        roamGoal(c, rand)
      } else {
        // Steered straight at it, deliberately: the boulder is an ORDINARY
        // village stone a few paces off the group's own quarter, not a place the
        // round has to get to. Where one stands behind a hut the watch above
        // gives up on it and the next child tries, which is what the guard's own
        // abandon is for — and the bound below keeps that from holding a cycle.
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
  world: BankWorld,
  line: BankEnd,
  wait: BankEnd,
): boolean {
  let atLine = 0
  let atWait = 0
  const touch = touchStand(stage, wait, world.blocked)
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    const end = c.role === 'catcher' ? wait : line
    const slot = c.role === 'catcher' ? atWait++ : atLine++
    // The tapper is in place when its HAND is on the stone, not when its body is
    // within an arrival radius of a station: the run waits for the contact.
    if (i === s.tapper && touch) {
      const reach = touchReach(stage, wait, c)
      if (!reach || Math.abs(reach.gap) > TOUCH_GAP) return false
      continue
    }
    if (dist(c, stationAt(stage, end, slot, cfg)) > cfg.reachDistance) return false
  }
  return true
}

/** How near a waypoint counts as reached, how often a child may replan, and how
 *  long it may fail to gain any ground on a corner before dropping it. */
const WAYPOINT_RADIUS = 1.2
const REPLAN_SECONDS = 1
const WAYPOINT_STALL_SECONDS = 4
/** How far a child must get from the spot a refusal was made on before a plan
 *  may name the refused corner again — genuinely elsewhere, not a step aside. */
const REFUSAL_LEAVE_DISTANCE = WAYPOINT_RADIUS * 2

/** Drops the route a child is no longer walking. */
function clearPath(c: BankChild): void {
  c.path = null
  c.pathTo = null
  c.wayFor = 0
  c.wayBest = Infinity
}

/**
 * WHERE THE NEXT STEP OF A LONG WALK GOES: at the goal while the line to it is
 * open, and otherwise at the next waypoint of a way round what stands between.
 * The same rule the adults' errands walk the village by — planning is asked for
 * only when the line is actually shut, and at most once a second per child, so
 * an open crossing costs nothing at all.
 *
 * Exported for the unit layer: its stall branch decides whether a child walks
 * round an obstruction or into it, and that is not reachable through a whole
 * simulated round on any layout the villages actually generate.
 */
export function wayTo(
  c: BankChild,
  goal: { x: number; z: number },
  dt: number,
  world: BankWorld,
): { x: number; z: number; advanced: boolean } {
  const shut = world.lineBlocked
  if (!shut || !world.route) return { ...goal, advanced: false }
  c.replan -= dt
  if (c.pathTo && (c.pathTo.x !== goal.x || c.pathTo.z !== goal.z)) clearPath(c)
  const blocked = shut(c.x, c.z, goal.x, goal.z)
  if (!blocked) {
    // Back on the open line: the detour it has already got past is dropped,
    // and so is any refusal — whatever the shut leg was avoiding has cleared.
    const had = !!c.path
    clearPath(c)
    c.refused = null
    return { ...goal, advanced: had }
  }
  if (!c.path && c.replan <= 0) {
    c.replan = REPLAN_SECONDS
    const fresh = world.route(c, goal)
    // THE CORNER A SHUT LEG REFUSED STAYS REFUSED FROM THE SAME SPOT (cross-
    // vendor finding, 17.08.2026). A stalled child has barely moved when the
    // throttle lets it plan again, so the planner can only hand back the route
    // it just gave up — the same corner, another four seconds of stall, for
    // ever. Such a plan is discarded and the child keeps walking at its goal;
    // the refusal lapses once the child has genuinely left the spot, so a
    // corner that was only briefly stood on is not banned for good.
    // A planner that knows no way back returns null; there is then no corner to
    // ban, and the child keeps walking at its goal on the open-line path below.
    const banned =
      c.refused !== null &&
      dist(c, { x: c.refused.fromX, z: c.refused.fromZ }) < REFUSAL_LEAVE_DISTANCE &&
      fresh !== null &&
      fresh.length > 0 &&
      dist(fresh[0], c.refused) <= WAYPOINT_RADIUS
    if (!banned) {
      c.path = fresh
      c.pathTo = { x: goal.x, z: goal.z }
    }
  }
  if (!c.path || c.path.length === 0) return { ...goal, advanced: false }
  let dropped = false
  while (c.path.length > 1 && dist(c, c.path[0]) <= WAYPOINT_RADIUS) {
    c.path.shift()
    dropped = true
  }
  // THE CORNER IT CANNOT TOUCH IS DROPPED, NOT PRESSED AGAINST. The planner
  // reads the settlement's boundary, its shore and its colliders; the round is
  // ALSO kept out of the sub-passage wedges `buildWedgeCarve` closes, and a
  // corner that fell in one can never be reached however long the child walks at
  // it. Carving the planner's own ground instead would be worse: measured over
  // five layouts of the bambara village, it disconnects the bank from the
  // village on three of them and there is then no route at all.
  const gap = dist(c, c.path[0])
  if (dropped || gap < c.wayBest - 0.05) {
    c.wayBest = gap
    c.wayFor = 0
  } else {
    c.wayFor += dt
    if (c.wayFor > WAYPOINT_STALL_SECONDS) {
      if (c.path.length > 1) {
        const corner = c.path[0]
        c.path.shift()
        // THE LEG THE DROP OPENS UP IS CHECKED, NOT ASSUMED OPEN (cross-vendor
        // finding, 14.08.2026). Dropping the corner is right where it fell in a
        // wedge — but the corner may equally have been the way ROUND a collider
        // or round the traveller in a bottleneck, and the leg it leaves behind
        // then runs straight through what it was avoiding. Steering at it walks
        // the child into the obstruction, and nothing re-plans while a path
        // exists, so it stays there until the corners run out.
        //
        // A shut leg therefore drops the whole route, and the CORNER it stalled
        // on is remembered as refused. A stalled child has NOT moved when the
        // throttle lets it plan again — its replan budget ran out seconds ago —
        // so an unguarded re-plan simply gets the identical route back and the
        // stall repeats on a four-second cycle. What is guaranteed instead: the
        // child walks at its goal, deflecting off what it meets like any other
        // walk, and no plan made near this spot may steer it at this corner
        // again; only once it has genuinely got away does the corner come back
        // into consideration.
        if (shut(c.x, c.z, c.path[0].x, c.path[0].z)) {
          clearPath(c)
          c.refused = { x: corner.x, z: corner.z, fromX: c.x, fromZ: c.z }
          return { ...goal, advanced: true }
        }
        c.wayBest = dist(c, c.path[0])
        dropped = true
      } else {
        // The last corner is the goal itself: walk at it directly rather than
        // hold a route with nothing left in it.
        clearPath(c)
        return { ...goal, advanced: false }
      }
      c.wayFor = 0
    }
  }
  return { ...c.path[0], advanced: dropped }
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
  const touch = touchStand(stage, wait, world.blocked)
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    const end = c.role === 'catcher' ? wait : line
    const slot = c.role === 'catcher' ? atWait++ : atLine++
    if (stepArrival(s, i, dt, cfg, stage, world)) continue
    // THE TAPPER GOES TO THE STONE, not to the waiting station a stride and a
    // half off it (work-order 1065). The other children hold their stations as
    // they always did; where the stone cannot be reached at all there is no
    // touch spot and this child waits with the rest.
    const tapping = i === s.tapper && !!touch
    const to = tapping && touch ? { x: touch.x, z: touch.z } : stationAt(stage, end, slot, cfg)
    const away = dist(c, to)
    if (tapping) {
      // THE TAPPER IS SETTLED WHEN ITS HAND REACHES, not when its body is within
      // an arrival radius (work-order 1065). A station's arrival radius is 1.3 m
      // of slack — the whole distance being closed here — so a tapper judged by
      // it would stop exactly where the old defect stood.
      const reach = touchReach(stage, wait, c)
      c.settled = !!reach && Math.abs(reach.gap) <= TOUCH_GAP
    } else if (away <= cfg.reachDistance * 0.6) c.settled = true
    else if (away > cfg.reachDistance) c.settled = false
    // The walk DOWN to the bank is a run — the whole group sets off at the call
    // — while the shuffle between two runs is a walk.
    const running = s.phase === 'gather' && !c.settled && away > cfg.reachDistance
    if (c.settled) {
      clearPath(c)
      drive(s, i, null, false, dt, cfg, world)
    } else {
      drive(s, i, wayTo(c, to, dt, world), running, dt, cfg, world, tapping)
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
      // other way, and harder the nearer he is. The bend closes again over its
      // own configured width as the runner reaches the rock: without that
      // arrival taper a successful dodge aimed beside the collider forever and
      // turned into a timeout rather than a visible swerve followed by safety.
      // COMMITTED ON FIRST ENGAGEMENT, not re-read per frame — see `dodgeSide`.
      if (c.dodgeSide === 0) {
        const cross = (k.x - c.x) * dz - (k.z - c.z) * dx
        c.dodgeSide = cross > 0 ? -1 : 1
      }
      const arrivalTaper = Math.max(
        0,
        Math.min(1, (len - cfg.reachDistance) / Math.max(1e-6, cfg.dodgeReach)),
      )
      across += c.dodgeSide * cfg.dodgeReach * (1 - gap / cfg.dodgeDistance) * arrivalTaper
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

/** Finish a safe runner's approach without extending the run or its catch window.
 * Occupied stands wait their turn; an obstructed approach expires silently at
 * the regroup backstop. Only actual contact may offer the word. */
function stepArrival(
  s: BankState, i: number, dt: number, cfg: BankConfig, stage: BankStage, world: BankWorld,
): boolean {
  const c = s.children[i]
  const arrival = c.arrival
  if (!arrival) return false
  if (arrival.holdFor !== null) {
    if (arrival.holdFor <= 0) {
      c.arrival = null
      return false
    }
    arrival.holdFor = Math.max(0, arrival.holdFor - dt)
    drive(s, i, null, false, dt, cfg, world)
    return true
  }
  arrival.approachFor -= dt
  if (arrival.approachFor <= 0 || world.blocked(arrival.stand.x, arrival.stand.z)) {
    c.arrival = null
    return false
  }
  // Reservations include children still approaching, so two runners cannot
  // acquire overlapping holds in the same frame. Index order breaks a tie.
  const occupied = (x: number, z: number) =>
    !!obstacles(i, cfg, world)?.(x, z) || s.children.some((other, j) => j !== i && (
      dist(other, { x, z }) < world.childRadius * 2 ||
      (j < i && other.arrival && dist(other.arrival.stand, { x, z }) < world.childRadius * 2)
    ))
  if (occupied(arrival.stand.x, arrival.stand.z)) {
    drive(s, i, null, false, dt, cfg, world)
    return true
  }
  const reach = touchReach(stage, arrival.end, c)
  if (reach && Math.abs(reach.gap) <= TOUCH_GAP && dist(c, arrival.stand) <= world.childRadius && !occupied(c.x, c.z)) {
    const rock = rockAt(stage, arrival.end)
    c.heading = Math.atan2(rock.x - c.x, rock.z - c.z)
    c.facing = c.heading
    c.lean = 0
    drive(s, i, null, false, dt, cfg, world)
    arrival.holdFor = cfg.arrivalHoldSeconds
    say(s, {
      concept: 'ROCK', moment: 'arrival', speaker: i, gesture: 'touch',
      arm: { bearing: 0, elevation: reach.elevation }, hold: cfg.arrivalHoldSeconds,
      aim: { x: rock.x, y: reach.height, z: rock.z }, at: 'rock',
    })
  } else {
    const approachWorld = { ...world, occupied: (_self: number, _ignore: number, x: number, z: number) => occupied(x, z) }
    drive(s, i, arrival.stand, false, dt, cfg, approachWorld, true)
  }
  return true
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
      if (c.madeTag) {
        drive(s, i, null, false, dt, cfg, world)
        continue
      }
      c.quarry = chooseQuarry(s, i, cfg)
      const target = c.quarry
      drive(s, i, target >= 0 ? s.children[target] : farRock, target >= 0, dt, cfg, world)
      continue
    }
    if (stepArrival(s, i, dt, cfg, stage, world)) {
      safeSlot++
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
      const bearing = Math.atan2(c.x - farRock.x, c.z - farRock.z)
      let stand = touchStand(stage, to, world.blocked, bearing)
      const taken = (spot: { x: number; z: number }) =>
        !!obstacles(i, cfg, world)?.(spot.x, spot.z) || s.children.some((other, j) => j !== i && (
          dist(other, spot) < world.childRadius * 2 ||
          (other.arrival && dist(other.arrival.stand, spot) < world.childRadius * 2)
        ))
      // A narrow facet can be unreachable behind the collider as well as
      // occupied by another child. Search nearby bearings in either case.
      // If all reachable stands are occupied, retain one and wait its turn.
      if (!stand || taken(stand)) {
        for (const offset of [1, -1, 2, -2, 3, -3]) {
          const alternative = touchStand(stage, to, world.blocked, bearing + offset * Math.PI / 6)
          if (!alternative) continue
          stand ??= alternative
          if (!taken(alternative)) {
            stand = alternative
            break
          }
        }
      }
      c.arrival = stand ? { end: to, stand, approachFor: cfg.regroupSeconds, holdFor: null } : null
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
      catcher.madeTag = true
      s.tags++
    }
  }

  // A run ENDS when every runner has either touched the far rock or been tagged
  // — and the backstop closes it where a child could not get there at all.
  if (free(s).length === 0 || s.phaseFor <= 0) endRun(s, stage, cfg)
}

/** Holds every child in the posture the visible moment requires. These are
 *  commanded standing frames, so the stall watches read them as held. */
function stepHeld(s: BankState, dt: number, cfg: BankConfig, stage: BankStage, world: BankWorld): void {
  for (let i = 0; i < s.children.length; i++) {
    if (!stepArrival(s, i, dt, cfg, stage, world)) drive(s, i, null, false, dt, cfg, world)
  }
}

/** After the caught children have stayed down long enough to read, the group
 *  rises and walks from wherever each child finished toward its roaming quarter. */
function stepPart(
  s: BankState,
  dt: number,
  cfg: BankConfig,
  stage: BankStage,
  world: BankWorld,
  holding: boolean,
): void {
  if (holding) {
    stepHeld(s, dt, cfg, stage, world)
    if (s.endFor === 0) {
      for (const c of s.children) {
        if (c.role === 'out') c.role = 'catcher'
        c.crouched = false
      }
    }
    return
  }
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    if (stepArrival(s, i, dt, cfg, stage, world)) continue
    if (c.role === 'out') c.role = 'catcher'
    c.crouched = false
    drive(s, i, stage.roam, false, dt, cfg, world)
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
    s.phase === 'run' || (s.phase === 'part' && s.endFor > 0) || s.children.every((c) => !c.crouched),
    'bank-crouched-outside-run',
    () => `${s.children.filter((c) => c.crouched).length} children crouched in phase ${s.phase}`,
  )
  devAssert(
    s.phaseFor <= Math.max(cfg.roamSeconds * (1 + cfg.roamSpread), cfg.gatherSeconds, cfg.runSeconds, cfg.regroupSeconds, cfg.partSeconds) + 1e-6 &&
      s.tapFor <= cfg.tapPauseSeconds + 1e-6 && s.endFor <= cfg.endPauseSeconds + 1e-6,
    'bank-phase-overrun',
    () => `phase ${s.phase} has ${s.phaseFor.toFixed(1)}s left, more than its own length`,
  )
}

/** Where the step LEFT them: nobody inside a collider or outside the walkable
 *  ground the round is played on. */
function assertPlaced(s: BankState, world: BankWorld): void {
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    // A CHILD ON THE STONE IS INSIDE ITS COLLIDER BY DESIGN (work-order 1080),
    // and standing half a metre above the ground the collider guards. The
    // ground-plane test cannot tell that apart from a child wedged in a hut, so
    // the climb is exempt for exactly as long as it lasts.
    if (onStone(c)) continue
    devAssert(
      !world.blocked(c.x, c.z),
      'bank-inside',
      () => `child ${i} stands at ${c.x.toFixed(2)},${c.z.toFixed(2)}`,
    )
  }
}
