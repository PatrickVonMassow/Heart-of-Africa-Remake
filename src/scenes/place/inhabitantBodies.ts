// The body every inhabitant of a settlement presents to every other one
// (work-order point 578). Pure, so the whole behaviour is pinned in the fast
// test layer — the scene components only feed it positions and read the result.
//
// THE DEFECT IT ANSWERS: no villager was part of any collider set the OTHERS
// resolved against. The children collided with the huts and the fences but not
// with each other, and so did the adults — two of them routed to neighbouring
// spots ended up in ONE body, and a chase that converged left three children
// standing inside one another, every arm and leg one tangle of cylinders. It is
// the same hole `animalSpots.ts` closed for the herd with `ANIMAL_BODY_RADIUS`,
// and this is the same answer for the people.
//
// WHY A SEPARATION PASS AND NOT A COLLIDER: the inhabitants are moved by five
// different behaviours (the chase, the errand walkers, the routine walkers, the
// porters, the task loop), each with its own stepper, and every one of them
// would have had to learn to exclude its own body from the set it resolves
// against. One pass over a shared body registry, run right after each behaviour
// has moved its own figures, gives all five the same rule.
//
// AND WHY ONE PUSH TAKES THE WHOLE OVERLAP: the correction stops dead inside a
// slop band, so it cannot ring — the push is exactly the penetration, the pair
// lands on the contact distance, and the dead band holds it there.
//
// AND WHY THE GROUP IS SWEPT MORE THAN ONCE: one body at a time is a
// Gauss-Seidel sweep, and a sweep resolves a PAIR but not a CHAIN. Pushing body
// B out of C can press it back into A, which was resolved already and is not
// looked at again — so with three or more figures in one cluster a residual
// overlap survives every frame. Measured over 600 s of the children's game at
// the reported seed: a single sweep left 192–537 overlapping pair-frames, the
// worst of them 0.07 m of a 0.264 m contact; two sweeps left none at all, and
// four are needed once the adults, the porters and the routine walkers share the
// set (work-order 648, the second half of the user's "Kinder klemmen kurz
// ineinander"). `separateGroup` therefore sweeps until a sweep moves nothing,
// bounded by the calibratable `passes` — which costs nothing in the ordinary
// case, where the first sweep already moves no one.
//
// It used to take a FRACTION per frame instead, damped against a tremble that
// the dead band already prevents, and capped at a push SPEED of 1.2 m/s. That
// was the first half of the user's "Kinder klemmen kurz ineinander" (work-order
// 648): two children close on one another at up to sprint plus runner speed,
// which is six times what that cap let the correction undo, so every frame added
// more overlap than the pass took out. Measured on one head-on crossing at the
// speed the game can really build, the pair ended five consecutive frames inside
// one another, at worst 0.21 m into a 0.26 m contact — all but merged; with the
// whole overlap taken at a cap above the closing speed, not one frame.
// `maxSpeed` therefore only bounds how fast a DEEP stack — two bodies spawned on
// one spot — unwinds.

import { deflectedStep } from '../travel/wildlifeBehavior'

/** One inhabitant's body in the shared set — mutated in place each frame, so a
 *  settlement never rebuilds the array. */
export interface InhabitantBody {
  x: number
  z: number
  /** The figure's own draw scale. Its body radius is the calibratable
   *  `bodyRadius` times this, computed at the resolve rather than stored — so a
   *  child is never given an adult's girth, and a debug edit of the radius takes
   *  effect on the very next frame without any owner writing it through. */
  scale: number
  /** Whether this body counts at all right now — a walker inside its hut is out
   *  of the picture and must not block the lane it is standing under. */
  active: boolean
  /** A body that pushes others but never gives way itself: the vignette figures
   *  at their stations (the cook, the drummer, a conversing pair). */
  fixed: boolean
  /** Seconds this body has been overlapping without being able to push free —
   *  the wedge timer point 578.3 bounds. */
  wedged: number
  /**
   * How often the wedge escape had to pick this body up (point 656 follow-up).
   * The escape below is a TELEPORT, exactly like the chase's own rescue — and
   * it was counted by nobody: a child freed this way jumped in the trace while
   * its published `nudges` stood still, so the motion metric read the
   * settlement's correction as the child walking out of its pocket — the
   * precise blind spot point 656 closed for the other two rescue paths, open
   * in a third. The owner of a traced figure DRAINS these into its own
   * counters each frame (`absorbSeparation`); for the untraced rest they are
   * simply never read.
   */
  nudges: number
  /** And how far it was carried doing so, in metres, cumulative — taken where
   *  the teleport happens, because nothing outside can tell a carry from a
   *  walk in one frame vector. */
  carried: number
}

/** The settlement's inhabitants, all kinds together. */
export interface InhabitantSet {
  bodies: InhabitantBody[]
}

/** Everything the separation needs beyond the bodies — all calibratable
 *  (`balance.villageLife.separation`, debug-editable). */
export interface SeparationConfig {
  /** The body radius of a figure drawn at scale 1. Deliberately smaller than the
   *  mover footprint (`WALKER_RADIUS`), for the reason the animals' is: a body
   *  wide enough to be a wall has the village shouldering itself all day. */
  bodyRadius: number
  /** Overlap tolerated before anything is corrected at all. The dead band is
   *  what stops a resting pair from trading micro-corrections for ever, and it
   *  is what makes a FULL correction safe. */
  slop: number
  /** Fraction of the remaining overlap taken out per step (0..1). At 1 the
   *  overlap is gone in the step it appeared, which is the point: below 1 the
   *  pass falls behind two movers closing on each other and the pair stays
   *  visibly inside one another. It never overshoots at any value. */
  stiffness: number
  /** Cap on how fast a body may be pushed (m/s), so a DEEP overlap (a spawn
   *  stack) comes apart as a step rather than as a teleport. It must stay above
   *  the fastest pair that can close on one another, or it throttles the
   *  ordinary crossing instead of only the stack. */
  maxSpeed: number
  /** Seconds of being unable to push free before the escape nudge is asked for. */
  wedgeSeconds: number
  /** How many sweeps `separateGroup` may take over one cluster in a frame, so a
   *  CHAIN of three or more figures comes apart in the frame it formed rather
   *  than leaving a residual overlap the player sees. Bounded, and the sweeping
   *  stops the moment one moves nobody — the ordinary frame pays for one. */
  passes: number
}

/** What the settlement refuses, and where it sends a body that cannot get out.
 *  Both optional: a caller with neither simply gets an unchecked push. */
export interface SeparationWorld {
  /** True where this body may not stand (huts, fences, the walkable rim). */
  blocked?: (x: number, z: number) => boolean
  /** The nearest spot it MAY stand, for the wedge escape. */
  nudge?: (x: number, z: number) => { x: number; z: number; found: boolean }
}

/** An empty settlement. */
export function createInhabitantSet(): InhabitantSet {
  return { bodies: [] }
}

/** `count` fresh bodies, belonging to no set yet. Split from the registration
 *  below because a React owner must CREATE them while it renders but REGISTER
 *  them in an effect: StrictMode mounts an effect, tears it down and mounts it
 *  again, and a set joined during render would be left without them. */
export function createBodies(
  count: number,
  options: { fixed?: boolean; x?: number; z?: number; scale?: number } = {},
): InhabitantBody[] {
  return Array.from({ length: Math.max(0, count) }, () => ({
    x: options.x ?? 0,
    z: options.z ?? 0,
    scale: options.scale ?? 1,
    active: true,
    fixed: options.fixed ?? false,
    wedged: 0,
    nudges: 0,
    carried: 0,
  }))
}

/** Puts bodies into the set, skipping any already in it (a re-run effect). */
export function addBodies(set: InhabitantSet, bodies: readonly InhabitantBody[]): void {
  for (const b of bodies) if (!set.bodies.includes(b)) set.bodies.push(b)
}

/** Adds `count` bodies to the set and returns them. The caller keeps the array
 *  and writes each body's position every frame. */
export function claimBodies(
  set: InhabitantSet,
  count: number,
  options: { fixed?: boolean; x?: number; z?: number; scale?: number } = {},
): InhabitantBody[] {
  const claimed = createBodies(count, options)
  addBodies(set, claimed)
  return claimed
}

/** Takes bodies out again — a settlement that is left, a figure streamed out. */
export function releaseBodies(set: InhabitantSet, bodies: readonly InhabitantBody[]): void {
  for (const b of bodies) {
    const i = set.bodies.indexOf(b)
    if (i >= 0) set.bodies.splice(i, 1)
  }
}

/**
 * True where another inhabitant's body occupies the ground a mover of
 * `moverRadius` wants to step to (work-order point 657).
 *
 * THE SEPARATION IS A CORRECTION, NOT A STEERING: it fires only after a stepper
 * has already walked its figure into a body, and the child's chase probed a
 * `blocked` that knew huts, fences and the rim but no body — so occupied ground
 * read OPEN, the child pressed in, the pass pushed it back out, and `walked`
 * grew while ground covered did not. That IS the reported walking-on-the-spot.
 * This predicate is what lets a stepper walk ROUND a body instead of
 * discovering it by collision; the separation stays as the safety net for the
 * contacts steering cannot avoid.
 *
 * The radius is the PAIR'S CONTACT distance: the standing body's contact radius
 * plus `moverBodyRadius`, the mover's own — the exact line below which the
 * separation would start correcting, and NOT the wider walker footprint. That
 * width was measured and rejected: at footprint width four children read each
 * other as 0.43 m walls on a 20 m ground and the game itself degraded (the
 * quietest child of one shipped village fell from ~110 to 22 walked metres per
 * played minute). At contact width a landed step never triggers the separation
 * and never robs the game of more room than the bodies truly take. `self` is
 * the mover's own body; `ignore` is a body the mover is deliberately allowed to
 * reach (the tag partner — a chaser that treated its quarry as a wall could
 * never close the catch).
 */
export function groundOccupied(
  set: InhabitantSet,
  self: InhabitantBody | readonly InhabitantBody[] | null,
  x: number,
  z: number,
  cfg: SeparationConfig,
  moverBodyRadius: number,
  ignore: InhabitantBody | null = null,
): boolean {
  const selfMany = Array.isArray(self) ? (self as readonly InhabitantBody[]) : null
  for (const b of set.bodies) {
    if (b === self || b === ignore || !b.active) continue
    if (selfMany && selfMany.includes(b)) continue
    const r = cfg.bodyRadius * b.scale + moverBodyRadius
    const dx = x - b.x
    const dz = z - b.z
    if (dx * dx + dz * dz < r * r) return true
  }
  return false
}

/**
 * One walking step that goes ROUND the other inhabitants (point 657, the
 * adults' half): where the wanted step would land in another body, the heading
 * deflects round it — the wildlife's own deflection, static ground and bodies
 * judged together — and the caller sweeps its own move to the returned point
 * exactly as before. Without this the errand walkers and porters steered by
 * colliders alone and walked straight THROUGH the children, who then had
 * nothing to walk round but a body already pressing on them.
 *
 * Cheap on the ordinary frame: everything beyond one `groundOccupied` probe
 * runs only when the direct step really lands in a body. Fully boxed in, the
 * wanted point is returned unchanged — the caller's own slide-and-skip
 * behaviour stays exactly what it was.
 */
export function stepRoundBodies(
  set: InhabitantSet,
  self: InhabitantBody,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  cfg: SeparationConfig,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } {
  const selfRadius = cfg.bodyRadius * self.scale
  if (!groundOccupied(set, self, toX, toZ, cfg, selfRadius)) return { x: toX, z: toZ }
  const dx = toX - fromX
  const dz = toZ - fromZ
  const dist = Math.hypot(dx, dz)
  if (!(dist > 1e-9)) return { x: toX, z: toZ }
  const both = (x: number, z: number) =>
    blocked(x, z) || groundOccupied(set, self, x, z, cfg, selfRadius)
  const r = deflectedStep(fromX, fromZ, Math.atan2(dx, dz), dist, both, Math.max(dist, selfRadius * 2))
  return r.moved ? { x: r.x, z: r.z } : { x: toX, z: toZ }
}

/** A deterministic escape bearing for two bodies at EXACTLY the same point (a
 *  spawn stack, a catch resolved on the spot): the golden angle off the body's
 *  own index, so the pair never picks the same way out and a stack comes apart
 *  the same way on every run. */
function stackedBearing(index: number): number {
  return index * 2.399963229728653
}

/**
 * Pushes ONE body out of everything it overlaps, damped, and reports whether it
 * moved. The caller runs this right after its own stepper has written the body's
 * position, then reads `body.x`/`body.z` back into its figure — so the drawn
 * figure, the collider resolve and the body all agree within the frame.
 *
 * A fixed body never moves. A push into blocked ground is retried along the two
 * perpendiculars (sliding out along a wall rather than into it); when none of
 * the three is free the body counts as wedged, and past the calibratable window
 * it is nudged to free ground — bounded time, per point 578.3.
 */
export function separateBody(
  set: InhabitantSet,
  self: InhabitantBody,
  dt: number,
  cfg: SeparationConfig,
  world: SeparationWorld = {},
): boolean {
  return pushBody(set, self, dt, dt, cfg, world, Math.max(0, cfg.maxSpeed) * dt) > 0
}

/**
 * The push itself. `wedgeDt` is the time the WEDGE timer is charged, which is
 * the frame's — not the sweep's: a refining sweep resolves the same frame over
 * again, so charging it a second time would trip the escape nudge as many times
 * faster as the solver sweeps, and teleport a figure that was never stuck.
 *
 * `budget` is how far this body may still be moved THIS FRAME, in metres, and it
 * is the caller's to spend across the sweeps (see `separateGroup`). Returns the
 * distance actually moved, so the caller can subtract it.
 */
function pushBody(
  set: InhabitantSet,
  self: InhabitantBody,
  dt: number,
  wedgeDt: number,
  cfg: SeparationConfig,
  world: SeparationWorld = {},
  budget = Math.max(0, cfg.maxSpeed) * dt,
): number {
  if (!(dt > 0) || self.fixed || !self.active) return 0
  const selfIndex = set.bodies.indexOf(self)
  const selfRadius = cfg.bodyRadius * self.scale
  let px = 0
  let pz = 0
  for (let i = 0; i < set.bodies.length; i++) {
    const other = set.bodies[i]
    if (other === self || !other.active) continue
    const dx = self.x - other.x
    const dz = self.z - other.z
    const d = Math.hypot(dx, dz)
    const min = selfRadius + cfg.bodyRadius * other.scale
    if (d >= min - cfg.slop) continue
    const overlap = min - cfg.slop - d
    let ux: number
    let uz: number
    if (d > 1e-6) {
      ux = dx / d
      uz = dz / d
    } else {
      const a = stackedBearing(selfIndex >= 0 ? selfIndex : i)
      ux = Math.cos(a)
      uz = Math.sin(a)
    }
    // THE MOVER OWES THE WHOLE OVERLAP, against a fixed body and against another
    // mover alike. Splitting it in halves looks fairer and does not work: the
    // bodies are resolved one after another, so the second of a pair sees only
    // what the first left and takes half of THAT — a quarter of the overlap
    // survives every pass, for ever, and two children walking into one another
    // stay visibly merged (point 648). Resolved whole, the first of the pair
    // steps out and the second then has nothing to correct, so the overlap is
    // gone at the end of the pass rather than decaying across frames.
    px += ux * overlap
    pz += uz * overlap
  }

  const want = Math.hypot(px, pz)
  if (want <= 1e-9) {
    self.wedged = 0
    return 0
  }
  const cap = Math.max(0, Math.min(budget, Math.max(0, cfg.maxSpeed) * dt))
  const scale = (Math.min(want, cap) / want) * Math.max(0, Math.min(1, cfg.stiffness))
  const stepX = px * scale
  const stepZ = pz * scale
  const blocked = world.blocked
  const options: Array<[number, number]> = blocked
    ? [
        [stepX, stepZ],
        // Sliding out ALONG whatever is behind it rather than into it.
        [-stepZ, stepX],
        [stepZ, -stepX],
      ]
    : [[stepX, stepZ]]
  for (const [mx, mz] of options) {
    const nx = self.x + mx
    const nz = self.z + mz
    if (blocked?.(nx, nz)) continue
    self.x = nx
    self.z = nz
    self.wedged = 0
    return Math.hypot(mx, mz)
  }
  // Pressed between a collider and another body: bounded, not for ever.
  self.wedged += Math.max(0, wedgeDt)
  if (wedgeDt > 0 && self.wedged >= cfg.wedgeSeconds && world.nudge) {
    const free = world.nudge(self.x, self.z)
    if (free.found) {
      // How far the settlement moved it, recorded where it is known (point 656
      // follow-up): the teleport must never read as the body's own motion.
      self.carried += Math.hypot(free.x - self.x, free.z - self.z)
      self.x = free.x
      self.z = free.z
    }
    // Counted whether or not free ground was found, like the chase's own
    // escape: the body stood its whole window unable to move either way.
    self.nudges++
    self.wedged = 0
  }
  return 0
}

/**
 * Resolves ONE GROUP of bodies — the caller's own figures — against the whole
 * settlement, sweeping until a sweep moves nobody or `cfg.passes` is spent.
 *
 * This is what a caller that moves several figures per frame owes them, and the
 * order matters: write EVERY body of the group first, then call this. A loop
 * that writes and separates one figure at a time resolves each against where its
 * neighbours stood a frame ago, and leaves the chain above unresolved on top of
 * it.
 */
export function separateGroup(
  set: InhabitantSet,
  bodies: readonly InhabitantBody[],
  dt: number,
  cfg: SeparationConfig,
  world: SeparationWorld = {},
): void {
  const passes = Math.max(1, Math.floor(cfg.passes))
  // ONE MOVEMENT BUDGET PER BODY PER FRAME (GPT-5.6 Sol, 12.08.2026). Every sweep
  // used to hand `pushBody` the whole frame's `maxSpeed * dt`, so a body could be
  // corrected once PER PASS — at the shipped 8 m/s and 4 passes, an effective
  // 32 m/s against a cap the type documents as per frame. A deep stack then SNAPS
  // apart instead of easing apart, which from outside is a figure jumping. The
  // budget is spent ACROSS the sweeps, so more passes buy a more exact
  // resolution, never a faster one.
  const cap = Math.max(0, cfg.maxSpeed) * dt
  const left = new Map<InhabitantBody, number>()
  for (const b of bodies) left.set(b, cap)
  for (let p = 0; p < passes; p++) {
    let moved = false
    // Only the FIRST sweep charges the wedge timer: the later ones are the same
    // frame, resolved more exactly.
    for (const b of bodies) {
      const budget = left.get(b) ?? 0
      if (!(budget > 0)) continue
      const step = pushBody(set, b, dt, p === 0 ? dt : 0, cfg, world, budget)
      if (step > 0) {
        left.set(b, Math.max(0, budget - step))
        moved = true
      }
    }
    if (!moved) return
  }
}

/** Every non-fixed body of the set, resolved as one group. Handy for a caller
 *  that owns the whole set (and for the tests); a scene component separates its
 *  own bodies where it moved them, so the figure it draws is the body that was
 *  resolved. */
export function separateAll(
  set: InhabitantSet,
  dt: number,
  cfg: SeparationConfig,
  world: SeparationWorld = {},
): void {
  separateGroup(set, set.bodies, dt, cfg, world)
}
