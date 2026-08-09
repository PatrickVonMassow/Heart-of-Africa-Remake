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
// AND WHY DAMPED: a pair that overlaps and is pushed fully apart every frame
// oscillates, and a child vibrating on the spot reads as broken rather than as
// playing (the user's "festklemmen und rumzittern"). The correction therefore
// takes only a FRACTION of the remaining overlap, never overshoots it, and stops
// completely inside a slop band — so a separated pair stays separated without a
// tremble.

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
   *  what stops a resting pair from trading micro-corrections for ever. */
  slop: number
  /** Fraction of the remaining overlap taken out per frame (0..1). Below 1 it
   *  cannot overshoot, which is what makes the pass settle instead of ring. */
  stiffness: number
  /** Cap on how fast a body may be pushed (m/s), so a deep overlap (a spawn
   *  stack) comes apart as a step rather than as a teleport. */
  maxSpeed: number
  /** Seconds of being unable to push free before the escape nudge is asked for. */
  wedgeSeconds: number
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
    // A fixed body gives nothing, so the mover owes the whole overlap; two
    // movers split it, and the pair closes it together.
    const share = other.fixed ? 1 : 0.5
    px += ux * overlap * share
    pz += uz * overlap * share
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
  self.wedged += dt
  if (self.wedged >= cfg.wedgeSeconds && world.nudge) {
    const free = world.nudge(self.x, self.z)
    if (free.found) {
      self.x = free.x
      self.z = free.z
    }
    self.wedged = 0
  }
  return false
}

/** Every non-fixed body of the set, once. Handy for a caller that owns the whole
 *  set (and for the tests); a scene component separates its own bodies where it
 *  moved them, so the figure it draws is the body that was resolved. */
export function separateAll(
  set: InhabitantSet,
  dt: number,
  cfg: SeparationConfig,
  world: SeparationWorld = {},
): void {
  for (const b of set.bodies) separateBody(set, b, dt, cfg, world)
}
