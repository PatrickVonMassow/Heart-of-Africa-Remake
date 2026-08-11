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
// against. One damped pass over a shared body registry, run right after each
// behaviour has moved its own figures, gives all five the same rule.
//
// AND WHY IT RESOLVES IN ONE STEP: the correction takes the WHOLE remaining
// overlap and stops dead inside a slop band. It cannot ring, because it never
// overshoots — the push is exactly the penetration, so the pair lands on the
// contact distance and the dead band then holds it there.
//
// AND WHY THE GROUP IS SWEPT MORE THAN ONCE: one body at a time is a
// Gauss-Seidel sweep, and a sweep resolves a PAIR but not a CHAIN. Pushing body
// B out of C can press it back into A, which was resolved already and is not
// looked at again — so with three or more figures in one cluster a residual
// overlap survives every frame. Measured over 600 s of the children's game at
// the reported seed: a single sweep left 192–537 overlapping pair-frames, the
// worst of them 0.07 m of a 0.264 m contact; TWO sweeps left none at all
// (work-order 648, the second half of the user's "Kinder klemmen kurz
// ineinander"). `separateGroup` therefore sweeps until a sweep moves nothing,
// bounded by the calibratable `passes` — which costs nothing in the ordinary
// case, where the first sweep already moves no one.
//
// It used to take a FRACTION per frame instead, damped against a tremble that
// the dead band already prevents, and capped at a push SPEED. That was the
// defect behind the user's "Kinder klemmen kurz ineinander" (work-order 648):
// two children close on one another at up to sprint plus runner speed, which is
// several times what the cap allowed the correction to undo, so every frame
// added more overlap than the pass took out and the pair stayed inside one
// another for as long as they ran together — measured at the reported seed,
// 30 % of all frames, up to six seconds at a stretch, and at the worst of them
// two children within a centimetre of the same point. `maxSpeed` therefore only
// bounds how fast a DEEP stack — two bodies spawned on one spot — unwinds; it
// is set above the fastest pair that can close, so it never throttles the
// ordinary crossing it was silently throttling before.

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
  return pushBody(set, self, dt, dt, cfg, world)
}

/**
 * The push itself. `wedgeDt` is the time the WEDGE timer is charged, which is
 * the frame's — not the sweep's: a refining sweep resolves the same frame over
 * again, so charging it a second time would trip the escape nudge as many times
 * faster as the solver sweeps, and teleport a figure that was never stuck.
 */
function pushBody(
  set: InhabitantSet,
  self: InhabitantBody,
  dt: number,
  wedgeDt: number,
  cfg: SeparationConfig,
  world: SeparationWorld = {},
): boolean {
  if (!(dt > 0) || self.fixed || !self.active) return false
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
    return false
  }
  const cap = Math.max(0, cfg.maxSpeed) * dt
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
    return true
  }
  // Pressed between a collider and another body: bounded, not for ever.
  self.wedged += Math.max(0, wedgeDt)
  if (wedgeDt > 0 && self.wedged >= cfg.wedgeSeconds && world.nudge) {
    const free = world.nudge(self.x, self.z)
    if (free.found) {
      self.x = free.x
      self.z = free.z
    }
    self.wedged = 0
  }
  return false
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
  for (let p = 0; p < passes; p++) {
    let moved = false
    // Only the FIRST sweep charges the wedge timer: the later ones are the same
    // frame, resolved more exactly.
    for (const b of bodies) if (pushBody(set, b, dt, p === 0 ? dt : 0, cfg, world)) moved = true
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
