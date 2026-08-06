// Pursue-and-evade with a sprint reserve (design.md §19.10, work-order 480/351).
//
// A by-product worth keeping OUT of the children who first needed it: a chase
// with stamina is reusable — a goat bolting from someone, a dog in a port — so
// the reserve, the pace curve and the two decisions live here, and
// `scenes/place/tagGame.ts` only adds the ROUND on top (who is IT, who may be
// caught, the immunity after a tag).
//
// THE TWO MECHANISMS ARE KEPT APART, because collapsing them is the obvious
// mistake:
//   - THE CURVE says what a child CAN do. The pace it can hold is a continuous,
//     monotone function of what is left in its reserve — full sprint while
//     fresh, tapering as the reserve empties, the floor only at empty. A child
//     therefore visibly runs out of steam over seconds instead of snapping down
//     a step nobody can miss reading as a switch.
//   - THE TWO THRESHOLDS say what it CHOOSES — press on, or break off and
//     recover. By the time the low one sends it into recovery the curve has
//     already made it slow, so the decision CONFIRMS what the picture has been
//     showing. Two thresholds, never one: a single boundary flickers between
//     pressing and recovering frame by frame, the same hysteresis the animals'
//     dodge and guard states already use.
//
// THE SPRINT IS SPENT DELIBERATELY, NEVER CONTINUOUSLY. A child that always ran
// at whatever its current maximum is could never recover, and a chaser that
// emptied its reserve once would stay a hopeless trotter for the rest of the
// round — the game would be over without ending.

/** What a mover is doing with its reserve this instant. */
export type Effort = 'sprint' | 'cruise' | 'recover'

/** The pressing/recovering decision, held across frames by its hysteresis. */
export type Press = 'press' | 'recover'

/** Which side of the chase a mover is on. The runner is the FASTER of the two
 *  while fresh — see `topPace`. */
export type ChaseRole = 'chaser' | 'runner'

/** The paces and rates of a chase, all calibratable (`balance.villageLife.tag`). */
export interface StaminaProfile {
  /** The chaser's flat-out pace at a full reserve, in metres per second. */
  sprintSpeed: number
  /**
   * The runner's top pace as a factor over the chaser's, strictly above 1.
   * The spec pins both orderings and this is what produces them: a FRESH runner
   * is strictly faster than a fresh chaser, so a catch is never immediate, while
   * a SPENT one sits at the shared floor, strictly slower than a fresh chaser,
   * so a catch stays reachable. It is also why the runner tires first — the
   * drain follows the pace actually run.
   */
  runnerBoost: number
  /** Cruise (trot) pace as a fraction of `sprintSpeed`. At or below it a mover
   *  REFILLS; above it, it spends. */
  trotFactor: number
  /** The deliberate recovery pace as a fraction of `sprintSpeed` — slow enough
   *  to actually refill, which the pressure rule must not override. */
  recoverFactor: number
  /** The pace a chase never falls below, as a fraction of `sprintSpeed`. A child
   *  frozen mid-game reads as a bug; a trotting one reads as winded. */
  floorFactor: number
  /** Reserve spent per second at the full sprint pace (scaled by the pace run). */
  drainPerSecond: number
  /** Reserve refilled per second at or below the trot. */
  recoverPerSecond: number
  /** Low threshold: at or below it a mover BREAKS OFF into recovery. */
  breakOff: number
  /** High threshold: at or above it a recovering mover presses again. */
  resume: number
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** The smoothstep the pace curve rides: continuous, monotone on [0,1], 0 at 0
 *  and 1 at 1, with a bounded slope (max 1.5) so no snap can creep in. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** The steepest the curve ever is, in cap units per reserve unit — the bound a
 *  test can hold `paceCap` to so a step function cannot be slipped back in. */
export const CURVE_MAX_SLOPE = 1.5

/** The pace floor of a chase (shared by both roles, so a spent runner and a
 *  spent chaser are equally slow). */
export function floorPace(p: StaminaProfile): number {
  return p.sprintSpeed * p.floorFactor
}

/** The trot: the pace at which a mover neither presses nor recovers, and the
 *  boundary of the drain (at or below it the reserve refills). */
export function trotPace(p: StaminaProfile): number {
  return p.sprintSpeed * p.trotFactor
}

/** The deliberate recovery pace — below the trot, never below the floor. */
export function recoverPace(p: StaminaProfile): number {
  return Math.max(floorPace(p), p.sprintSpeed * p.recoverFactor)
}

/** The flat-out pace of a role at a FULL reserve. The runner's boost is what
 *  makes a fresh runner strictly faster than a fresh chaser. */
export function topPace(p: StaminaProfile, role: ChaseRole): number {
  return role === 'runner' ? p.sprintSpeed * p.runnerBoost : p.sprintSpeed
}

/**
 * THE CURVE: the fastest this mover can go right now. Continuous and monotone
 * in the reserve, exactly the floor at empty and exactly the role's top at full;
 * a reserve outside [0,1] clamps rather than extrapolating (float drift after a
 * long run must never produce a negative pace or a NaN).
 */
export function paceCap(reserve: number, p: StaminaProfile, role: ChaseRole): number {
  const lo = floorPace(p)
  const hi = topPace(p, role)
  if (!Number.isFinite(reserve)) return lo
  return lo + (hi - lo) * smoothstep(reserve)
}

/**
 * The pace a mover actually runs: its intent, held down by THE CURVE and held up
 * by the floor. Clamping to the cap is what keeps the two mechanisms apart — a
 * "sprinting" child with an empty reserve is no faster than a trotting one, and
 * a near-empty child dropping to a cruise never snaps UP to the full trot.
 */
export function effortPace(
  effort: Effort,
  reserve: number,
  p: StaminaProfile,
  role: ChaseRole,
): number {
  const intent =
    effort === 'sprint' ? topPace(p, role) : effort === 'cruise' ? trotPace(p) : recoverPace(p)
  const cap = paceCap(reserve, p, role)
  return clamp(intent, floorPace(p), Math.max(floorPace(p), cap))
}

/**
 * Spend or refill the reserve over `dt`, keyed to the pace ACTUALLY run rather
 * than to the intent. That is deliberate: it is what makes the faster runner
 * burn faster, and it closes the exhausted-forever hole — a mover whose curve
 * has capped its "sprint" at or below the trot is not running flat out any
 * more, so it refills instead of being pinned at empty by its own intention.
 * At exactly the trot the reserve REFILLS ("refills at a trot or standing").
 */
export function advanceReserve(
  reserve: number,
  pace: number,
  dt: number,
  p: StaminaProfile,
  drainScale = 1,
  recoverScale = 1,
): number {
  if (!(dt > 0)) return clamp(reserve, 0, 1)
  const trot = trotPace(p)
  if (pace > trot) {
    // QUADRATIC in the pace, as the work of running is: a child fleeing flat out
    // burns several times what a chaser pacing itself does in the same second.
    // That asymmetry is the whole reason the hunted child tires first, and it
    // falls out of the physics rather than out of a role-specific knob.
    const share = p.sprintSpeed > 0 ? (pace / p.sprintSpeed) ** 2 : 0
    return clamp(reserve - p.drainPerSecond * share * drainScale * dt, 0, 1)
  }
  return clamp(reserve + p.recoverPerSecond * recoverScale * dt, 0, 1)
}

/**
 * The press/recover decision with its hysteresis. Boundary-exact: AT the low
 * threshold the mover breaks off, AT the high one it presses again, and between
 * them whatever it was doing stands — so a reserve trembling around one value
 * cannot flap the state frame by frame.
 *
 * A debug edit can put the two thresholds in the wrong order at runtime; the
 * comparison is written so that even then no oscillation is possible (the low
 * test wins, and the mover simply stays in recovery until the reserve clears the
 * higher of the two).
 */
export function pressState(prev: Press, reserve: number, p: StaminaProfile): Press {
  const low = p.breakOff
  const high = Math.max(p.resume, low)
  if (reserve <= low) return 'recover'
  if (reserve >= high) return 'press'
  return prev
}

/** The effort that follows from the decision. RECOVERY IS ITS OWN INTENTION:
 *  once a mover has broken off, no amount of pressure puts it back to a sprint
 *  before its reserve has passed the resume threshold. */
export function chooseEffort(press: Press, wantsSprint: boolean): Effort {
  if (press === 'recover') return 'recover'
  return wantsSprint ? 'sprint' : 'cruise'
}

/** Exponential ease of a noisy per-frame reading toward its trend, over `tau`
 *  seconds. Used for the gap trend below, where one frame's difference is far
 *  too jumpy to decide anything on. */
export function easeTrend(prev: number, sample: number, dt: number, tau: number): number {
  if (!(dt > 0) || !(tau > 0)) return prev
  const k = 1 - Math.exp(-dt / tau)
  return prev + (sample - prev) * k
}

/**
 * A CHASER PACES ITSELF: it sprints only while it is actually closing on a
 * target within reach, and cruises otherwise — which is what lets it refill
 * while a fresh runner pulls away, and what makes the runner (pressed the whole
 * time) the one that empties first.
 *
 * "Actually closing" is judged on the eased trend of the gap, with its own
 * hysteresis pair so the decision cannot flap: it starts sprinting when the gap
 * has stopped growing (`enter`, at or a little above zero — at a steady chase
 * the trend sits at zero and the burst must still be allowed to open) and stops
 * when the gap is clearly running away from it (`leave`).
 */
export function chaserPresses(
  prevSprinting: boolean,
  gap: number,
  gapTrend: number,
  reach: number,
  enter: number,
  leave: number,
  commit = 0,
): boolean {
  if (gap > reach) return false
  // Inside `commit` it presses whatever the gap is doing: a child a couple of
  // steps from a tag does not break off because its quarry has just bolted —
  // that is the moment it runs hardest. The press/recover threshold still
  // governs above this, so a spent chaser still gives up; only the PACING rule
  // stands down this close.
  if (gap <= commit) return true
  if (gapTrend <= enter) return true
  if (gapTrend >= leave) return false
  return prevSprinting
}

/** A RUNNER sprints only while the chaser is inside its pressure distance and
 *  trots when the gap is comfortable. Boundary-exact: exactly AT the distance it
 *  still sprints. */
export function runnerPresses(gap: number, pressureDistance: number): boolean {
  return gap <= pressureDistance
}

/** Heading from (x,z) toward (tx,tz), in the codebase's `atan2(dx, dz)`
 *  convention (direction = `sin h`, `cos h`). A coincident target keeps
 *  `fallback` rather than producing an arbitrary `atan2(0,0)`. */
export function headingToward(x: number, z: number, tx: number, tz: number, fallback = 0): number {
  const dx = tx - x
  const dz = tz - z
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return fallback
  return Math.atan2(dx, dz)
}

/** Blend two headings the short way round, `t` from 0 (a) to 1 (b). */
export function blendHeading(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + delta * clamp(t, 0, 1)
}

/**
 * Turn `from` toward `to` by at most `maxDelta` radians, the short way round.
 * The rendered body uses this while the TRAVEL heading is free to jump: a
 * deflection round a corner is a real change of direction, but a figure that
 * snapped to it spun about-face inside one frame. A non-positive or non-finite
 * step leaves the facing exactly where it was rather than teleporting it.
 */
export function turnToward(from: number, to: number, maxDelta: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  if (!(maxDelta > 0)) return from
  if (Math.abs(delta) <= maxDelta) return to
  return from + Math.sign(delta) * maxDelta
}

/**
 * Where a runner steers: away from the chaser, PREFERRING OPEN GROUND — the
 * further out it already is, the more the heading is pulled back toward the
 * middle, so a cornered child breaks inward along the rim instead of pressing
 * itself into the edge. `inner` is the fraction of the radius at which the pull
 * starts.
 *
 * The ground is a disc at (`cx`, `cz`) — the origin unless a caller says
 * otherwise. A play area that sits in a corner of a settlement (point 481.4) is
 * still a disc; only its middle is somewhere else, and the pull must bend toward
 * THAT one or it drags every runner out of its own ground.
 */
export function evadeHeading(
  x: number,
  z: number,
  chaserX: number,
  chaserZ: number,
  radius: number,
  cx = 0,
  cz = 0,
  inner = 0.55,
  strength = 0.85,
): number {
  const away = headingToward(chaserX, chaserZ, x, z, Math.atan2(x - cx, z - cz))
  if (!(radius > 0)) return away
  const d = Math.hypot(x - cx, z - cz)
  const start = radius * clamp(inner, 0, 0.99)
  if (d <= start) return away
  const t = clamp((d - start) / (radius - start), 0, 1) * clamp(strength, 0, 1)
  return blendHeading(away, headingToward(x, z, cx, cz, away), t)
}
