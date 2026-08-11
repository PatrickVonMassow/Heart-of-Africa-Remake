// The village children's game of tag (design.md §19.10, work-order 480/351).
//
// They run wild through the settlement, around the huts and past the fire. One
// of them is IT and chases the others; whoever is caught becomes the new IT.
// Any number plays — one chaser and every other child in the group.
//
// A PATH IS NOT A GAME, and that is the design point this module must not undo:
// any fixed route — a ring around the well, an orbit at a set radius, a tour of
// waypoints — is periodic, and the eye recognises it within two passes. A chase
// is not periodic because its target REACTS. Nothing here holds a route.
//
// STAMINA IS WHAT MAKES IT LEGIBLE. The reserve, the pace curve and the two
// decisions live in `systems/pursuit.ts` (a chase with stamina is reusable — a
// goat bolting from someone, a dog in a port); this module adds only the ROUND:
// who is IT, who may be caught, and what happens when one of them is.
//
// THE STEERING IS THE WILDLIFE'S, NOT THE WALKER'S. The village walkers resolve
// an obstacle by sliding along it and stopping, which is exactly what reads as
// bumping into things. `deflectedStep` probes around the heading and CONTINUES
// the run past the obstacle — a chase wants that one, and reusing it is why this
// behaviour is small rather than large. The move is SUBSTEPPED at under a body
// radius, because `deflectedStep` probes points rather than sweeping: one long
// frame at a debug-raised sprint speed would otherwise land cleanly on the far
// side of a fence panel, overlapping nothing.

import { deflectedStep } from '../travel/wildlifeBehavior'
import {
  createProducerWatch,
  devAssert,
  watchProducer,
  type ProducerWatch,
} from '../../systems/devAssert'
import {
  advanceReserve,
  chaserPresses,
  chooseEffort,
  easeTrend,
  effortPace,
  evadeHeading,
  floorPace,
  headingToward,
  pressState,
  runnerPresses,
  turnToward,
  type Effort,
  type Press,
  type StaminaProfile,
} from '../../systems/pursuit'

/** Everything the round needs beyond the paces, all calibratable
 *  (`balance.villageLife.tag`, debug-editable). */
export interface TagConfig extends StaminaProfile {
  /** A runner sprints while the chaser is this close, and trots beyond it. */
  pressureDistance: number
  /** A chaser presses only at a target within this reach. */
  chaseReach: number
  /** Inside this distance the chaser presses whatever the gap is doing — a child
   *  a couple of steps from a tag runs hardest rather than pacing itself. */
  commitDistance: number
  /** The small distance a catch happens within. */
  catchDistance: number
  /** How much nearer a new candidate must be before the chaser switches to it —
   *  opportunistic, but not chattering between two children abreast. */
  targetSwitchMargin: number
  /** The freshly-tagged child's immunity: without it the two swap the role every
   *  frame and stand jittering together, and with several players the game would
   *  stay a two-child affair while the others idle. */
  immunitySeconds: number
  /** The BACKSTOP (§19.8's house rule that nothing runs forever): one chaser's
   *  tenure. Stamina is what normally ends a pursuit; when a chaser has held the
   *  role this long without a catch, the group breaks off into ordinary idling.
   *  It is per TENURE, not per session — a healthy game with regular catches is
   *  never cut short from outside. */
  resolveCapSeconds: number
  /** How long the group idles before starting again. */
  idleSeconds: number
  /** Time constant of the gap-trend ease — it sets the period of the chaser's
   *  burst-and-trot cadence. */
  trendTau: number
  /** Gap trend at or below which the chaser opens a burst (at a steady chase the
   *  trend sits at zero, so this must admit zero). */
  trendEnter: number
  /** Gap trend at or above which it breaks the burst off and cruises. */
  trendLeave: number
  /** Per-child spread of the drain and recovery RATES and of the opening
   *  reserve, so the group never tires in unison. It never touches the paces, so
   *  the two speed orderings hold for every child. */
  variation: number
  /** Seconds of no real movement before a child is nudged to free ground. */
  unstuckSeconds: number
  /**
   * How long a child STICKS to the way out it found when the settlement made it
   * turn more than a quarter (point 648). Without it a dead-end lane is a
   * bounce: the step turns the child round, the next frame aims it back at the
   * hut it came from, and it shuffles on the spot between the two. Long enough
   * to clear a pocket, short enough that the chase is never really interrupted —
   * the same hysteresis the animals' dodge and guard states use.
   */
  detourSeconds: number
  /**
   * The dev-mode long-run alarm's window (point 589): a group that CAN play and
   * has produced neither a catch nor a fresh round for this long is broken, not
   * quiet. It must sit clear of the longest LEGITIMATE gap between two round
   * events — a tenure that runs to the backstop plus the idle break after it.
   */
  silenceSeconds: number
  /** Forward lean (rad) at the full sprint; the posture eases toward it in
   *  proportion to the pace, and back to upright while recovering. */
  leanAtSprint: number
  /**
   * How fast the drawn body may turn, in rad/s. The TRAVEL heading is allowed
   * to change instantly — a deflection round a hut corner is a real change of
   * direction — but a body that snapped to it spun about-face inside one frame,
   * measured ~7 times a minute per child. Real children turn at a rate, and the
   * goats already do; this is the same easing.
   */
  turnRate: number
}

/** One child in the group. */
export interface TagChild {
  x: number
  z: number
  /** Travel heading, `atan2(dx, dz)` — DERIVED from the deflected step, so a
   *  child can never face away from where it is going. */
  heading: number
  /** The heading the BODY is drawn on: `heading` eased at `turnRate`, so a
   *  change of direction is turned into rather than snapped to. */
  facing: number
  /** Whether this runner is currently fleeing rather than drifting back to the
   *  middle. Held across frames: the flee/return choice has its own hysteresis
   *  band, because deciding it on the bare pressure distance flipped the
   *  heading by 180° every time a runner drifted across that one line. */
  evading: boolean
  /** Sprint reserve, 0..1. */
  reserve: number
  press: Press
  effort: Effort
  /** Whether this child WANTED to sprint this step (the chaser's own gap-trend
   *  decision is held here across frames for its hysteresis). */
  sprinting: boolean
  /** Per-child rate spread (never a pace). */
  drainScale: number
  recoverScale: number
  /** The pace commanded this step. */
  pace: number
  /** Distance actually WALKED — the gait phase rides it, so a teleport nudge is
   *  deliberately excluded and the legs never flail through a correction. */
  walked: number
  /** Seconds without real movement. */
  pinned: number
  /** The way out of a pocket the last step had to turn far to find, and how long
   *  the child still holds it. See `TagConfig.detourSeconds`. */
  detour: number
  detourFor: number
  /** Eased posture, 0 = upright, `leanAtSprint` = flat out. */
  lean: number
  /**
   * Standing because an outside claim ASKED it to (point 481's refusal, the
   * held spot, an errand carried out), not because the chase stalled. It is the
   * one case in which a playing child may be below the floor pace: what was said
   * is being obeyed, and the stillness is the whole reading of it.
   */
  held: boolean
}

/** The round. */
export interface TagState {
  children: TagChild[]
  /** Index of IT, or −1 while the group idles. */
  chaser: number
  /** The chaser's current quarry, or −1. */
  target: number
  /** The freshly-tagged child under immunity, or −1. */
  immune: number
  immuneFor: number
  /** Eased d(gap)/dt toward the current target; reset whenever the gap jumps. */
  gapTrend: number
  /** Last frame's gap, or NaN when there is nothing to compare with. */
  lastGap: number
  /** How long the CURRENT chaser has held the role. */
  chaserFor: number
  /** Seconds left of the idle break. */
  idleFor: number
  playing: boolean
  /** Catches so far — a probe for the tests and the live check. */
  tags: number
  /**
   * SIM seconds this group has run, playing and idling alike. It is the game's
   * OWN clock, and the live verification samples against IT rather than against
   * a count of frames drawn: a frame budget buys wildly different amounts of
   * game on a fast machine and a loaded one, and a window that happened to be
   * shorter than one chase is what turns "the chaser's identity changes" red
   * without a bug behind it.
   */
  clock: number
  /** The long-run alarm's watch over the play itself (point 589): how long the
   *  group has produced no catch and no fresh round. */
  play: ProducerWatch
}

/** The settlement as the chase sees it. `blocked` answers for the FULL set —
 *  colliders, the fire ring and the walkable rim alike — so one predicate keeps
 *  the children inside the settlement, out of the fire and clear of every body. */
export interface TagWorld {
  /** Radius of the play ground the children keep to. */
  radius: number
  /** Middle of that ground; the settlement's own middle when left out. The
   *  children play in a bounded corner of the settlement rather than across all
   *  of it (point 481.4), so the ground and the settlement are not the same
   *  circle and the evade must bend back toward the RIGHT one. */
  centerX?: number
  centerZ?: number
  /** The mover footprint — the same one the picture draws the child with. */
  childRadius: number
  blocked: (x: number, z: number) => boolean
  nudge: (x: number, z: number) => { x: number; z: number; found: boolean }
}

/**
 * An outside behaviour's claim on one child for a moment: the heading and the
 * pace it should move at because of something that was SAID (the situations of
 * point 481). It returns null for a child that is simply playing.
 *
 * The chase keeps everything else — the collisions, the deflection, the sprint
 * reserve and the floor pace — so a child carrying out an errand is still a
 * child in a game of tag. The CHASER is never steered: the round belongs to it.
 */
export type TagSteer = (index: number, s: TagState) => { heading: number; pace: number } | null

const dist = (a: TagChild, b: TagChild) => Math.hypot(a.x - b.x, a.z - b.z)

/** Deterministic per-child spread around 1 (never applied to a pace). */
function spread(rand: () => number, variation: number): number {
  return 1 + (rand() * 2 - 1) * variation
}

/**
 * A group at its spawn points. Every point must already be free — the caller
 * validates it against the real collider set the way point 155 validates a
 * walker's errand target — and each child draws its own rate spread and opening
 * reserve, so the group never tires in unison.
 */
export function createTagGame(
  spots: ReadonlyArray<{ x: number; z: number }>,
  rand: () => number,
  cfg: TagConfig,
): TagState {
  const children: TagChild[] = spots.map((p) => {
    // The body STARTS on its travel heading: easing it in from a fixed zero
    // would spin every child once on the first frames of a visit.
    const heading = rand() * Math.PI * 2
    return {
      x: p.x,
      z: p.z,
      heading,
      facing: heading,
      evading: false,
      reserve: 1 - rand() * cfg.variation,
      press: 'press' as Press,
      effort: 'cruise' as Effort,
      sprinting: false,
      drainScale: spread(rand, cfg.variation),
      recoverScale: spread(rand, cfg.variation),
      pace: 0,
      walked: 0,
      pinned: 0,
      detour: heading,
      detourFor: 0,
      lean: 0,
      held: false,
    }
  })
  return {
    children,
    chaser: -1,
    target: -1,
    immune: -1,
    immuneFor: 0,
    gapTrend: 0,
    lastGap: NaN,
    chaserFor: 0,
    idleFor: 0,
    playing: false,
    tags: 0,
    clock: 0,
    play: createProducerWatch(),
  }
}

/** The nearest child the chaser may catch: never itself, never the one still
 *  under its immunity. An exact tie keeps the LOWER index, so two children
 *  abreast cannot flip the quarry frame by frame. */
export function nearestCatchable(s: TagState): number {
  if (s.chaser < 0 || s.chaser >= s.children.length) return -1
  const c = s.children[s.chaser]
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < s.children.length; i++) {
    if (i === s.chaser) continue
    if (i === s.immune && s.immuneFor > 0) continue
    const d = dist(c, s.children[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** The quarry this step: the nearest catchable child, but the CURRENT one is
 *  kept unless a candidate is nearer by more than the switch margin — the chaser
 *  switches when someone crosses its path, and not for a hand's breadth. */
export function chooseTarget(s: TagState, cfg: TagConfig): number {
  const nearest = nearestCatchable(s)
  if (nearest < 0) return -1
  const cur = s.target
  const curValid =
    cur >= 0 && cur < s.children.length && cur !== s.chaser && !(cur === s.immune && s.immuneFor > 0)
  if (!curValid || cur === nearest) return nearest
  const c = s.children[s.chaser]
  return dist(c, s.children[nearest]) < dist(c, s.children[cur]) - cfg.targetSwitchMargin
    ? nearest
    : cur
}

/** True when the straight line between two children is clear of everything the
 *  world blocks — a tag reached THROUGH a hut wall or a fence panel would read
 *  as a bug, and the sampling only runs on a catch that is otherwise due. */
export function lineClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  world: TagWorld,
  samples = 4,
): boolean {
  for (let i = 1; i < samples; i++) {
    const t = i / samples
    if (world.blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false
  }
  return true
}

/** The catch itself: within the small calibratable distance AND with the line
 *  between the two clear. Boundary-exact — exactly AT the distance is a catch. */
export function catchReached(a: TagChild, b: TagChild, cfg: TagConfig, world: TagWorld): boolean {
  return (
    Math.hypot(a.x - b.x, a.z - b.z) <= cfg.catchDistance &&
    lineClear(a.x, a.z, b.x, b.z, world)
  )
}

/** Open a round: the freshest child is IT (ties to the lower index), so a round
 *  never opens with a chaser that is already spent. */
function startRound(s: TagState, cfg: TagConfig): void {
  let best = 0
  for (let i = 1; i < s.children.length; i++) {
    if (s.children[i].reserve > s.children[best].reserve) best = i
  }
  s.chaser = best
  s.children[best].sprinting = false
  s.target = -1
  s.immune = -1
  s.immuneFor = 0
  s.chaserFor = 0
  s.gapTrend = 0
  s.lastGap = NaN
  s.playing = true
  // They are about to run: opening the round on a commanded pace of zero would
  // leave one frame in which a PLAYING child stands still — the very thing the
  // floor exists to forbid, and what any observer of the state would read.
  for (const c of s.children) {
    c.pace = floorPace(cfg)
    c.held = false
  }
}

/** Break the round off into ordinary idling for a while before starting again. */
function breakOffRound(s: TagState, cfg: TagConfig): void {
  s.playing = false
  s.idleFor = cfg.idleSeconds
  s.chaser = -1
  s.target = -1
  s.immune = -1
  s.immuneFor = 0
  s.chaserFor = 0
  s.gapTrend = 0
  s.lastGap = NaN
  for (const c of s.children) {
    c.pace = 0
    c.effort = 'recover'
    c.sprinting = false
    c.held = false
  }
}

/** The heading a child really walks on this step: the one it was given, unless
 *  it is still holding the way out of a pocket (`TagConfig.detourSeconds`). */
function walkHeading(c: TagChild, desired: number, dt: number): number {
  if (!(c.detourFor > 0)) return desired
  c.detourFor = Math.max(0, c.detourFor - dt)
  return c.detour
}

/**
 * Move one child `dist` along `desired`, substepped so nothing is stepped over,
 * deflected around whatever is in the way, and nudged free if it is genuinely
 * pinned. The heading it ends on is the one it TRAVELLED.
 *
 * A step that had to turn more than a quarter to get anywhere leaves a DETOUR
 * behind it: the way out is held for a moment, because the direction the chase
 * wants is recomputed every frame and would aim the child straight back into
 * the pocket it just left — turn out, turn back, turn out, which is a shuffle on
 * the spot rather than a walk (point 648).
 */
function moveChild(
  c: TagChild,
  desired: number,
  distance: number,
  dt: number,
  cfg: TagConfig,
  world: TagWorld,
): void {
  const maxStep = Math.max(0.05, world.childRadius * 0.9)
  const steps = Math.max(1, Math.ceil(distance / maxStep))
  const len = distance / steps
  const look = Math.max(len, world.childRadius * 2)
  let heading = desired
  let moved = false
  for (let k = 0; k < steps; k++) {
    // THE PROBE TURNS THE FULL CIRCLE, not the wildlife's ±90°. A coast is
    // something an animal walks along; a settlement is something a child walks
    // ROUND, and between the huts, the fences and the bounded play ground it
    // meets pockets whose only way out is backwards. With the ±90° arc such a
    // pocket left the child STANDING until the unstuck timer teleported it —
    // the user's "hängt kurz fest": measured at his seed, every single stalled
    // frame had free ground 105–150° off the heading it wanted, just outside
    // what the probe could see.
    const r = deflectedStep(c.x, c.z, heading, len, world.blocked, look, 12)
    if (!r.moved) break
    c.walked += Math.hypot(r.x - c.x, r.z - c.z)
    c.x = r.x
    c.z = r.z
    heading = r.heading
    moved = true
  }
  if (moved) {
    c.heading = heading
    c.pinned = 0
    const turned = Math.abs(Math.atan2(Math.sin(heading - desired), Math.cos(heading - desired)))
    if (turned > Math.PI / 2) {
      c.detour = heading
      c.detourFor = Math.max(0, cfg.detourSeconds)
    }
    return
  }
  // Blocked on every probe: turn a quarter and try again next frame — and if it
  // is still standing there past its window, nudge it to free ground. The nudge
  // is a teleport, so its distance is deliberately NOT added to `walked`: the
  // legs must not flail through a correction the eye never sees.
  c.heading = desired + Math.PI / 2
  c.pinned += dt
  if (c.pinned > cfg.unstuckSeconds) {
    const free = world.nudge(c.x, c.z)
    if (free.found) {
      c.x = free.x
      c.z = free.z
    }
    c.pinned = 0
  }
}

/**
 * One step of the game. Mutates in place — a settlement runs this every frame —
 * and is otherwise pure: every decision is a function of the state, the config
 * and the world predicate, which is why the whole behaviour is pinned in the
 * fast test layer.
 *
 * The player is NOT part of `blocked`, deliberately: no inhabitant in this
 * settlement treats the traveller as a wall, and a game of tag that could be
 * blocked by standing in it would be a way to freeze the vignette.
 *
 * `steer` is the optional claim an outside behaviour has on a child for a
 * moment (the situations of point 481): it decides that child's DIRECTION and
 * pace, everything else stays the chase's.
 */
export function stepTagGame(
  s: TagState,
  dt: number,
  cfg: TagConfig,
  world: TagWorld,
  steer?: TagSteer,
): void {
  // THE LONG-RUN ALARM (point 589), judged on what the PLAYER would have seen:
  // a catch, or a fresh round starting. Not on the timers meant to produce them
  // — a chase that runs on forever with a dead catch test keeps every timer
  // moving and still shows a group that never plays. A group of one has nobody
  // to chase and is quiet by right. DEV-gated at the CALL SITE, so a production
  // build allocates nothing per frame.
  const dev = import.meta.env.DEV
  const tags = dev ? s.tags : 0
  const wasPlaying = dev ? s.playing : false
  advanceTagGame(s, dt, cfg, world, steer)
  if (dev) {
    watchProducer(s.play, {
      code: 'tag-silent',
      dt,
      produced: s.tags !== tags || (s.playing && !wasPlaying),
      expected: s.children.length >= 2,
      maxSilenceSeconds: cfg.silenceSeconds,
      detail: () =>
        `${s.children.length} children, ${s.playing ? `chaser ${s.chaser} for ${s.chaserFor.toFixed(0)}s` : `idling for ${s.idleFor.toFixed(0)}s more`}`,
    })
  }
}

function advanceTagGame(
  s: TagState,
  dt: number,
  cfg: TagConfig,
  world: TagWorld,
  steer?: TagSteer,
): void {
  const n = s.children.length
  // Judged on the state as RECEIVED, before anything below repairs it — a step
  // that quietly mends a broken state and then asserts would report nothing.
  assertRoundSound(s, dt, cfg)
  // The roster is fixed for a visit, but a defensive repair costs three lines
  // and keeps every index sound if it ever is not. A group that has shrunk
  // below two is the case the index check alone MISSES: with one child left and
  // the role still on it, every index is in range and the round simply ran on —
  // measured, 43 s of a lone child wandering targetless before the backstop
  // finally idled it. A lone child falls back to ordinary idling instead.
  if (s.chaser >= n || n < 2) s.chaser = -1
  if (s.immune >= n) {
    s.immune = -1
    s.immuneFor = 0
  }
  if (s.target >= n) s.target = -1
  if (!(dt > 0)) return
  s.clock += dt

  if (!s.playing || s.chaser < 0) {
    s.playing = false
    s.idleFor -= dt
    for (let i = 0; i < n; i++) {
      const c = s.children[i]
      // Between rounds the group stands and recovers — unless somebody was told
      // to do something (point 481): the break is where a call, an errand and a
      // refusal are actually SEEN, because here a child that stays put stays put
      // instead of shuffling at the chase's floor pace.
      const claim = steer?.(i, s) ?? null
      c.pace = claim ? Math.max(0, claim.pace) : 0
      c.held = !!claim && c.pace <= 0
      c.effort = 'recover'
      if (claim && c.pace > 0) {
        moveChild(c, walkHeading(c, claim.heading, dt), c.pace * dt, dt, cfg, world)
        c.facing = turnToward(c.facing, c.heading, cfg.turnRate * dt)
      }
      c.reserve = advanceReserve(c.reserve, c.pace, dt, cfg, c.drainScale, c.recoverScale)
      c.lean += (0 - c.lean) * Math.min(1, dt * 4)
    }
    assertPlaced(s, cfg, world)
    // A lone child never chases itself: it simply idles like any other village
    // figure until it has company again. Started AFTER the assert, so the fresh
    // round is judged on the step that actually runs it rather than on the idle
    // paces it still carries.
    if (s.idleFor <= 0 && n >= 2) startRound(s, cfg)
    return
  }

  s.chaserFor += dt
  if (s.immuneFor > 0) {
    s.immuneFor = Math.max(0, s.immuneFor - dt)
    if (s.immuneFor === 0) s.immune = -1
  }
  if (s.chaserFor >= cfg.resolveCapSeconds) {
    breakOffRound(s, cfg)
    assertPlaced(s, cfg, world)
    return
  }

  const chaser = s.children[s.chaser]
  const prevTarget = s.target
  s.target = chooseTarget(s, cfg)
  const target = s.target >= 0 ? s.children[s.target] : null

  // The gap and its trend. The trend is RESET whenever the gap jumps for a
  // reason that is not motion — a target switch, or no target at all — because
  // one frame of that difference would otherwise latch the burst decision.
  const gap = target ? dist(chaser, target) : Infinity
  if (!target || s.target !== prevTarget || !Number.isFinite(s.lastGap)) {
    s.gapTrend = 0
  } else {
    s.gapTrend = easeTrend(s.gapTrend, (gap - s.lastGap) / dt, dt, cfg.trendTau)
  }
  s.lastGap = gap

  // Where the game IS. A runner nobody is pressing drifts back to it rather than
  // fleeing on to the rim: children who are not being chased stay in the game,
  // and without it the group spreads to the edge and tag becomes a two-child
  // affair while the others stand at the wall.
  let cx = 0
  let cz = 0
  for (const c of s.children) {
    cx += c.x
    cz += c.z
  }
  cx /= n
  cz /= n

  const floor = floorPace(cfg)
  for (let i = 0; i < n; i++) {
    const c = s.children[i]
    const isChaser = i === s.chaser
    let wants: boolean
    let desired: number
    if (isChaser) {
      wants =
        !!target &&
        chaserPresses(
          c.sprinting,
          gap,
          s.gapTrend,
          cfg.chaseReach,
          cfg.trendEnter,
          cfg.trendLeave,
          cfg.commitDistance,
        )
      desired = target ? headingToward(c.x, c.z, target.x, target.z, c.heading) : c.heading
    } else {
      const gapToChaser = dist(c, chaser)
      wants = runnerPresses(gapToChaser, cfg.pressureDistance)
      // The FLEE/RETURN choice gets its own hysteresis band, and it is NOT the
      // sprint decision: deciding the heading on the bare pressure distance made
      // a runner drifting across that one line swing 180° between fleeing
      // outward and walking back to the middle, frame after frame. The band
      // reuses the existing switch margin rather than adding a knob — it starts
      // fleeing at the pressure distance and only stops once the chaser is
      // clearly past it.
      if (gapToChaser <= cfg.pressureDistance) c.evading = true
      else if (gapToChaser > cfg.pressureDistance + cfg.targetSwitchMargin) c.evading = false
      desired = c.evading
        ? evadeHeading(
            c.x,
            c.z,
            chaser.x,
            chaser.z,
            world.radius,
            world.centerX ?? 0,
            world.centerZ ?? 0,
          )
        : Math.hypot(c.x - cx, c.z - cz) > cfg.pressureDistance
          ? headingToward(c.x, c.z, cx, cz, c.heading)
          : c.heading
    }
    // What was SAID overrides where the chase would go — for a runner only, and
    // only for the moment the action lasts (point 481). THE FLOOR IS THE CHASE'S
    // OWN, not a claim's: it forbids a child the chase is steering from standing
    // still mid-game, but a child that was TOLD to stand — the refusal, the held
    // spot, an errand target reached — is obeying, and the stillness is the
    // reading. Forcing the floor on it walked a standing child forward at 1.16
    // m/s into whatever was in front of it, where the blocked-step fallback then
    // turned it a quarter every frame: the child spun on the spot instead of
    // standing (measured at the user's seed, 3930 of 3931 commanded-still frames).
    const claim = isChaser ? null : (steer?.(i, s) ?? null)
    if (claim) desired = claim.heading
    c.sprinting = wants
    c.press = pressState(c.press, c.reserve, cfg)
    c.effort = chooseEffort(c.press, wants)
    c.pace = claim
      ? Math.max(0, claim.pace)
      : Math.max(floor, effortPace(c.effort, c.reserve, cfg, isChaser ? 'chaser' : 'runner'))
    c.held = !!claim && c.pace <= 0
    // A commanded stillness moves nothing — and leaves `pinned` and `walked`
    // alone, so a standing child is never mistaken for one stuck on geometry and
    // its legs stay still.
    if (c.pace > 0) moveChild(c, walkHeading(c, desired, dt), c.pace * dt, dt, cfg, world)
    // The BODY turns at a rate toward where it is going. The travel heading may
    // jump — a deflection round a hut corner is a real change of direction — but
    // a body that snapped to it spun about-face inside a single frame.
    c.facing = turnToward(c.facing, c.heading, cfg.turnRate * dt)
    c.reserve = advanceReserve(c.reserve, c.pace, dt, cfg, c.drainScale, c.recoverScale)
    // The posture is a function of the PACE, not of the decision: it changes
    // continuously with the speed, so nothing snaps when a threshold is crossed.
    const top = cfg.sprintSpeed * (isChaser ? 1 : cfg.runnerBoost)
    const wantLean = cfg.leanAtSprint * Math.max(0, Math.min(1, (c.pace - floor) / Math.max(1e-6, top - floor)))
    c.lean += (wantLean - c.lean) * Math.min(1, dt * 4)
  }

  // ONE catch per step, evaluated after the movement, so two can never resolve
  // in the same frame. Only the CURRENT quarry is tested, which is worth a note
  // for whoever recalibrates next: with the switch margin (1.5 m) well above the
  // catch distance (0.8 m) a non-target child could in principle sit inside the
  // catch ring untagged. Measured over 8×600 s with five children that never
  // once happened — evasion keeps the others out — but a much larger catch ring
  // or a much larger margin would reopen it.
  if (target && s.target !== s.chaser) {
    const caught =
      !(s.target === s.immune && s.immuneFor > 0) && catchReached(chaser, target, cfg, world)
    if (caught) {
      const old = s.chaser
      s.chaser = s.target
      s.immune = old
      s.immuneFor = cfg.immunitySeconds
      s.chaserFor = 0
      s.target = -1
      s.gapTrend = 0
      s.lastGap = NaN
      s.tags++
      // The new chaser owes the freshly-tagged child a turn away before it
      // resumes — the same hysteresis that keeps the animals' dodge and guard
      // states from flapping.
      const now = s.children[s.chaser]
      const gone = s.children[old]
      now.heading = headingToward(gone.x, gone.z, now.x, now.z, now.heading)
      now.sprinting = false
    }
  }

  assertPlaced(s, cfg, world)
}

/**
 * The armed invariants (point 207(i)). Tests only look where they look; this
 * channel turns every session — including the user's own play — into a detector
 * for the rare states that hide between several continuous quantities and a role
 * that moves between figures. A violation reports itself with the state that
 * produced it, so a bug report names the situation instead of a feeling.
 *
 * This half judges the ROUND as the step RECEIVED it — exactly one chaser while
 * playing, a tenure inside the cap, reserves in bounds, nobody pinned past its
 * window — because a step that repairs a broken state and only then asserts
 * would report nothing at all.
 */
function assertRoundSound(s: TagState, dt: number, cfg: TagConfig): void {
  const n = s.children.length
  devAssert(
    !s.playing || (s.chaser >= 0 && s.chaser < n && n >= 2),
    'tag-one-chaser',
    () => `playing with chaser ${s.chaser} of ${n}`,
  )
  devAssert(
    !s.playing || s.chaserFor <= cfg.resolveCapSeconds + dt + 1e-6,
    'tag-resolve-cap',
    () => `one chaser has held the role ${s.chaserFor.toFixed(1)}s of ${cfg.resolveCapSeconds}s`,
  )
  for (let i = 0; i < n; i++) {
    const c = s.children[i]
    devAssert(
      c.reserve >= 0 && c.reserve <= 1,
      'tag-reserve',
      () => `child ${i} reserve ${c.reserve}`,
    )
    devAssert(
      !s.playing || c.pinned <= cfg.unstuckSeconds + dt + 1e-6,
      'tag-pinned',
      () => `child ${i} has not moved for ${c.pinned.toFixed(1)}s`,
    )
  }
}

/** Where the step LEFT them: no child inside a collider, outside the walkable
 *  rim or standing below the floor while a chase runs — the one exception being
 *  a child that was TOLD to stand (`held`), which is obeying rather than stuck. */
function assertPlaced(s: TagState, cfg: TagConfig, world: TagWorld): void {
  const floor = floorPace(cfg)
  for (let i = 0; i < s.children.length; i++) {
    const c = s.children[i]
    devAssert(
      !world.blocked(c.x, c.z),
      'tag-inside',
      () => `child ${i} stands at ${c.x.toFixed(2)},${c.z.toFixed(2)} (r ${Math.hypot(c.x, c.z).toFixed(2)} of ${world.radius})`,
    )
    devAssert(
      !s.playing || c.held || c.pace >= floor - 1e-6,
      'tag-floor',
      () => `child ${i} commanded ${c.pace.toFixed(2)} below the floor ${floor.toFixed(2)}`,
    )
  }
}
