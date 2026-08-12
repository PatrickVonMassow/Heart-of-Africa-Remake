// The one cheap check that would have caught point 578: over a long visit no
// two inhabitants ever stand in one another, a stacked start comes apart, and
// the children's tag still catches (the separation must not deadlock the game).

import { describe, expect, it } from 'vitest'
import {
  addBodies,
  claimBodies,
  createBodies,
  createInhabitantSet,
  groundOccupied,
  releaseBodies,
  separateAll,
  separateBody,
  separateGroup,
  stepRoundBodies,
  type InhabitantBody,
  type SeparationConfig,
} from './inhabitantBodies'
import { createTagGame, stepTagGame, type TagWorld } from './tagGame'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'

const SEP: SeparationConfig = balance.villageLife.separation
/** The children are drawn at 0.55 (KID_SCALE in PlaceLife). */
const KID_SCALE = 0.55
const CHILD_R = SEP.bodyRadius * KID_SCALE

describe('inhabitant bodies', () => {
  it('takes a stacked group apart within a bounded time and leaves it settled', () => {
    const set = createInhabitantSet()
    const bodies = claimBodies(set, 5, { x: 0, z: 0 })
    const dt = 1 / 60
    let seconds = 0
    // The push takes a FRACTION of what is left each frame, so it approaches the
    // separation rather than snapping to it: a micrometre is the tolerance, four
    // orders of magnitude below anything the eye could read as an overlap.
    const clear = () =>
      bodies.every((a, i) =>
        bodies.every(
          (b, j) =>
            i === j ||
            Math.hypot(a.x - b.x, a.z - b.z) >=
              SEP.bodyRadius * (a.scale + b.scale) - SEP.slop - 1e-6,
        ),
      )
    while (!clear() && seconds < 5) {
      separateAll(set, dt, SEP)
      seconds += dt
    }
    expect(clear()).toBe(true)
    expect(seconds).toBeLessThan(3)

    // AND IT SETTLES: once apart, nothing moves any more — the jitter of point
    // 578.3 would show up here as a per-frame correction that never stops.
    const before = bodies.map((b) => ({ x: b.x, z: b.z }))
    for (let i = 0; i < 120; i++) separateAll(set, dt, SEP)
    bodies.forEach((b, i) => {
      expect(Math.hypot(b.x - before[i].x, b.z - before[i].z)).toBeLessThan(1e-4)
    })
  })

  it('never lets two children share a spot over a long visit, and still lets the tag catch', () => {
    const cfg = balance.villageLife.tag
    const rand = mulberry32(1234)
    const playRadius = cfg.playRadius
    const world: TagWorld = {
      radius: playRadius,
      centerX: 0,
      centerZ: 0,
      childRadius: 0.3,
      blocked: (x, z) => Math.hypot(x, z) > playRadius,
      nudge: (x, z) => {
        const d = Math.hypot(x, z) || 1
        const k = Math.min(1, (playRadius - 0.5) / d)
        return { x: x * k, z: z * k, found: true }
      },
    }
    // A STACKED START, which is the reported state itself: five children in one
    // spot, exactly what a spawn or a converging chase used to leave behind.
    const game = createTagGame(
      Array.from({ length: 5 }, () => ({ x: 0.05, z: -0.05 })),
      rand,
      cfg,
    )
    const set = createInhabitantSet()
    const bodies = claimBodies(set, game.children.length, { scale: KID_SCALE })

    const dt = 1 / 60
    let closest = Infinity
    let violations = 0
    let worst = 0
    // 600 s of game — long enough for several rounds, catches and idle breaks.
    for (let step = 0; step < 600 / dt; step++) {
      stepTagGame(game, dt, cfg, world)
      // EVERY body written, THEN the group resolved: a loop that wrote and
      // separated one child at a time would resolve each against where its
      // neighbours stood a frame ago (point 648).
      for (let i = 0; i < bodies.length; i++) {
        bodies[i].x = game.children[i].x
        bodies[i].z = game.children[i].z
      }
      separateGroup(set, bodies, dt, SEP, world)
      for (let i = 0; i < bodies.length; i++) {
        game.children[i].x = bodies[i].x
        game.children[i].z = bodies[i].z
      }
      // After the first half second (the stack is coming apart) NO pair may be
      // nearer than their two bodies. There is no exemption for the catch: the
      // catch fires at 0.8 m, three times the 0.264 m at which the bodies meet,
      // so a chaser has always made its tag long before anything touches — which
      // is why the condition that USED to except it (`d > catchDistance`, with
      // catchDistance ABOVE the contact distance) could never fire at all, and
      // let the user's "Kinder klemmen kurz ineinander" through (point 648).
      if (step * dt > 0.5) {
        for (let i = 0; i < game.children.length; i++) {
          for (let j = i + 1; j < game.children.length; j++) {
            const d = Math.hypot(
              game.children[i].x - game.children[j].x,
              game.children[i].z - game.children[j].z,
            )
            closest = Math.min(closest, d)
            if (d < CHILD_R * 2 - SEP.slop - 1e-6) {
              violations++
              worst = Math.max(worst, CHILD_R * 2 - SEP.slop - d)
            }
          }
        }
      }
    }
    expect({ violations, worst }).toEqual({ violations: 0, worst: 0 })
    // The bodies really do touch — a separation that never engaged would prove
    // nothing at all.
    expect(closest).toBeLessThan(cfg.catchDistance)
    // NO DEADLOCK: the chase still catches its runner.
    expect(game.tags).toBeGreaterThan(0)
  })

  it('never lets two children closing head-on end a frame inside one another (point 648)', () => {
    // The reported "Kinder klemmen kurz ineinander". The pair the game can build
    // fastest is a chaser at the sprint speed meeting a runner at its boosted
    // one, head-on: they ADD, and the correction has to undo that much in the
    // frame it appeared. The pre-648 pass took half of the remaining overlap and
    // was capped at 1.2 m/s, several times less than the pair closed at, so it
    // fell behind and the two stayed merged for the whole crossing.
    const tag = balance.villageLife.tag
    const closing = tag.sprintSpeed + tag.sprintSpeed * tag.runnerBoost
    const set = createInhabitantSet()
    const [a, b] = claimBodies(set, 2, { scale: KID_SCALE })
    a.x = -3
    b.x = 3
    const dt = 1 / 60
    let worst = 0
    for (let i = 0; i < 400; i++) {
      a.x += (closing / 2) * dt
      b.x -= (closing / 2) * dt
      separateGroup(set, [a, b], dt, SEP)
      worst = Math.max(worst, CHILD_R * 2 - SEP.slop - Math.hypot(a.x - b.x, a.z - b.z))
    }
    expect(worst).toBeLessThan(1e-9) // nothing an eye or a renderer could read
    // The cap is what makes that possible, so it is stated: it must stay above
    // the fastest pair that can close, or it throttles the ordinary crossing.
    expect(SEP.maxSpeed).toBeGreaterThan(closing)
  })

  it('takes a CHAIN of three apart in the frame it formed, which one sweep cannot (point 648)', () => {
    // Why the group is swept more than once. Resolved one body at a time, the
    // middle of three is pushed out of one neighbour straight into the other —
    // which was resolved already and is not looked at again, so a residual
    // overlap survives every frame. That is the second half of the reported
    // clipping, and no single-sweep pass of any stiffness can close it.
    const overlaps = (bodies: readonly InhabitantBody[]) => {
      let worst = 0
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const d = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z)
          worst = Math.max(worst, SEP.bodyRadius * 2 - SEP.slop - d)
        }
      }
      return worst
    }
    const dt = 1 / 60

    // ONE sweep — what `separateBody` per figure does — leaves the chain behind.
    const one = createInhabitantSet()
    const oneBodies = claimBodies(one, 3)
    const gap = SEP.bodyRadius * 2 - SEP.slop - 0.02
    oneBodies[0].x = -gap
    oneBodies[2].x = gap
    for (const b of oneBodies) separateBody(one, b, dt, SEP)
    expect(overlaps(oneBodies)).toBeGreaterThan(1e-6)

    // The group solve closes it inside the same frame.
    const many = createInhabitantSet()
    const manyBodies = claimBodies(many, 3)
    manyBodies[0].x = -gap
    manyBodies[2].x = gap
    separateGroup(many, manyBodies, dt, SEP)
    expect(overlaps(manyBodies)).toBeLessThanOrEqual(1e-9)
  })

  it('charges the wedge timer per FRAME, not per sweep, so a solver pass never teleports', () => {
    // The escape nudge is a teleport, and it is meant for a figure that has been
    // unable to move for `wedgeSeconds`. Charging it once per sweep would fire it
    // `passes` times as fast on a figure that was never stuck that long.
    const world = {
      blocked: (x: number, z: number) => x > 1e-4 || Math.abs(z) > 1e-4,
      nudge: () => ({ x: 5, z: 5, found: true }),
    }
    const set = createInhabitantSet()
    claimBodies(set, 1, { x: -0.1, z: 0, fixed: true })
    const [stuck] = claimBodies(set, 1, { x: 0, z: 0 })
    const dt = 1 / 60
    let seconds = 0
    while (stuck.x === 0 && seconds < SEP.wedgeSeconds * 3) {
      separateGroup(set, [stuck], dt, SEP, world)
      seconds += dt
    }
    expect(seconds).toBeGreaterThan(SEP.wedgeSeconds - 0.05)
    expect(seconds).toBeLessThanOrEqual(SEP.wedgeSeconds + 0.05)
  })

  it('states the catch against the body, so a chaser can always reach its tag', () => {
    expect(CHILD_R * 2).toBeLessThan(balance.villageLife.tag.catchDistance)
    // And the body stays under the mover footprint, like the animals' does.
    expect(SEP.bodyRadius).toBeLessThan(0.3)
  })

  it('lets a fixed body push a mover but never move itself, and releases cleanly', () => {
    const set = createInhabitantSet()
    const [station] = claimBodies(set, 1, { x: 0, z: 0, fixed: true })
    const [walker] = claimBodies(set, 1, { x: 0.1, z: 0 })
    for (let i = 0; i < 200; i++) separateAll(set, 1 / 60, SEP)
    expect(station.x).toBe(0)
    expect(station.z).toBe(0)
    expect(Math.hypot(walker.x, walker.z)).toBeGreaterThan(SEP.bodyRadius * 2 - SEP.slop - 1e-6)

    // An inactive body (a walker asleep in its hut) neither pushes nor is pushed.
    walker.active = false
    const parked = { x: walker.x, z: walker.z }
    const [other] = claimBodies(set, 1, { x: walker.x, z: walker.z })
    separateAll(set, 1 / 60, SEP)
    expect(walker.x).toBe(parked.x)
    expect(other.x).toBe(parked.x)

    releaseBodies(set, [station, walker, other])
    expect(set.bodies).toHaveLength(0)
  })

  it('frees a body wedged between a collider and another body within the window', () => {
    const set = createInhabitantSet()
    // A wall the pushed body cannot cross, and a fixed neighbour pressing it
    // into that wall: every direction refused, so only the escape gets it out.
    const world = {
      blocked: (x: number, z: number) => x > 1e-4 || Math.abs(z) > 1e-4,
      nudge: () => ({ x: 5, z: 5, found: true }),
    }
    claimBodies(set, 1, { x: -0.1, z: 0, fixed: true })
    const [stuck] = claimBodies(set, 1, { x: 0, z: 0 })
    let seconds = 0
    while (stuck.x === 0 && stuck.z === 0 && seconds < SEP.wedgeSeconds * 3) {
      separateBody(set, stuck, 1 / 60, SEP, world)
      seconds += 1 / 60
    }
    expect(seconds).toBeLessThanOrEqual(SEP.wedgeSeconds + 0.05)
    expect(stuck.x).toBe(5)
  })

  it('counts the wedge rescue on the body, so a trace can see the teleport', () => {
    // THE THIRD RESCUE PATH (point 656 follow-up). The chase's own two rescues
    // raise the child's `nudges` where they fire; the escape above fires a
    // layer below and used to be counted by NOBODY — a child freed this way
    // jumped in the trace while its rescue count stood still, and the motion
    // metric, which breaks the walked path at every rise of `nudges`, read the
    // settlement's correction as the child walking out of its own pocket.
    const world = {
      blocked: (x: number, z: number) => x > 1e-4 || Math.abs(z) > 1e-4,
      nudge: () => ({ x: 5, z: 5, found: true }),
    }
    const set = createInhabitantSet()
    claimBodies(set, 1, { x: -0.1, z: 0, fixed: true })
    const [stuck] = claimBodies(set, 1, { x: 0, z: 0 })
    expect(stuck.nudges).toBe(0)
    expect(stuck.carried).toBe(0)
    let seconds = 0
    while (stuck.nudges === 0 && seconds < SEP.wedgeSeconds * 3) {
      separateBody(set, stuck, 1 / 60, SEP, world)
      seconds += 1 / 60
    }
    expect(stuck.nudges).toBe(1)
    // And the carry is the teleport's own distance, taken where it is known.
    expect(stuck.carried).toBeCloseTo(Math.hypot(5, 5), 6)

    // An escape that found NO free ground still counts — the body stood its
    // whole window unable to move, which is the finding — only nothing was
    // carried, because nothing moved.
    const nowhere = {
      blocked: world.blocked,
      nudge: () => ({ x: 0, z: 0, found: false }),
    }
    const set2 = createInhabitantSet()
    claimBodies(set2, 1, { x: -0.1, z: 0, fixed: true })
    const [stillStuck] = claimBodies(set2, 1, { x: 0, z: 0 })
    seconds = 0
    while (stillStuck.nudges === 0 && seconds < SEP.wedgeSeconds * 3) {
      separateBody(set2, stillStuck, 1 / 60, SEP, nowhere)
      seconds += 1 / 60
    }
    expect(stillStuck.nudges).toBe(1)
    expect(stillStuck.carried).toBe(0)
  })

  it('separates a child from an adult at the two OWN girths, live off the config', () => {
    const set = createInhabitantSet()
    const [adult] = claimBodies(set, 1, { x: 0, z: 0, fixed: true })
    const [child] = claimBodies(set, 1, { x: 0.05, z: 0, scale: KID_SCALE })
    for (let i = 0; i < 400; i++) separateAll(set, 1 / 60, SEP)
    const mixed = SEP.bodyRadius * (1 + KID_SCALE)
    expect(Math.hypot(child.x - adult.x, child.z - adult.z)).toBeGreaterThan(mixed - SEP.slop - 1e-6)
    // The radius is NOT stored on the body, so a debug edit of the calibratable
    // value governs the very next frame — a wider setting pushes the pair on.
    const wide = { ...SEP, bodyRadius: SEP.bodyRadius * 2 }
    for (let i = 0; i < 400; i++) separateAll(set, 1 / 60, wide)
    expect(Math.hypot(child.x - adult.x, child.z - adult.z)).toBeGreaterThan(mixed * 2 - wide.slop - 1e-6)
  })

  it('joins bodies to the set only when ADDED, and adding twice does not double them', () => {
    // The split the React owner needs: StrictMode mounts an effect, tears it
    // down and mounts it again, so the bodies are built while rendering and
    // joined in the effect — which therefore has to be idempotent.
    const set = createInhabitantSet()
    const bodies = createBodies(2, { x: 1, z: 2, scale: KID_SCALE })
    expect(set.bodies).toHaveLength(0)
    expect(bodies.map((b) => [b.x, b.z, b.scale])).toEqual([
      [1, 2, KID_SCALE],
      [1, 2, KID_SCALE],
    ])
    addBodies(set, bodies)
    addBodies(set, bodies)
    expect(set.bodies).toHaveLength(2)
    releaseBodies(set, bodies)
    expect(set.bodies).toHaveLength(0)
    // And back in again, the way a remount re-joins the very same bodies.
    addBodies(set, bodies)
    expect(set.bodies).toHaveLength(2)
  })

  // THE CAP IS PER FRAME, NOT PER SWEEP (GPT-5.6 Sol's re-review of point 648,
  // 12.08.2026). Every sweep used to be handed the whole frame's allowance, so a
  // body in a deep stack could be corrected `passes` times the documented ceiling
  // — at the shipped 8 m/s and 4 passes an effective 32 m/s — and a stack snapped
  // apart instead of easing apart. Pinned against the pass count, since that is
  // the knob that broke it.
  it('never moves a body further in one frame than the cap allows, whatever the pass count', () => {
    const dt = 1 / 60
    for (const passes of [1, 2, 4, 12]) {
      const cfg: SeparationConfig = { ...SEP, passes }
      const set = createInhabitantSet()
      // Five bodies on ONE spot: the deepest stack the settlement can produce,
      // and the case where the sweeps have most to undo.
      const bodies = claimBodies(set, 5, { x: 0, z: 0 })
      for (const b of bodies) {
        b.x = 0
        b.z = 0
      }
      const before = bodies.map((b) => ({ x: b.x, z: b.z }))
      separateGroup(set, bodies, dt, cfg)
      const cap = cfg.maxSpeed * dt
      for (let i = 0; i < bodies.length; i++) {
        const moved = Math.hypot(bodies[i].x - before[i].x, bodies[i].z - before[i].z)
        expect(moved).toBeLessThanOrEqual(cap + 1e-9)
      }
      releaseBodies(set, bodies)
    }
  })

  it('spends more passes on a better resolution, not on a faster one', () => {
    const dt = 1 / 60
    const travel = (passes: number) => {
      const set = createInhabitantSet()
      const bodies = claimBodies(set, 4, { x: 0, z: 0 })
      for (const b of bodies) {
        b.x = 0
        b.z = 0
      }
      separateGroup(set, bodies, dt, { ...SEP, passes })
      return Math.max(...bodies.map((b) => Math.hypot(b.x, b.z)))
    }
    // Four sweeps may not carry a body further than one sweep's allowance does.
    expect(travel(4)).toBeLessThanOrEqual(travel(1) + 1e-9)
  })

  describe('the ground another body stands on (point 657)', () => {
    it('reads occupied inside the pair’s contact distance and free beyond it', () => {
      const set = createInhabitantSet()
      const [adult] = claimBodies(set, 1, { x: 2, z: 0 })
      const moverBody = SEP.bodyRadius * KID_SCALE
      const reach = SEP.bodyRadius * adult.scale + moverBody
      expect(groundOccupied(set, 2 + reach - 1e-3, 0, SEP, moverBody)).toBe(true)
      expect(groundOccupied(set, 2 + reach + 1e-3, 0, SEP, moverBody)).toBe(false)
    })

    it('judges each body at its own scale — a child occupies less ground than an adult', () => {
      const set = createInhabitantSet()
      claimBodies(set, 1, { x: 2, z: 0, scale: KID_SCALE })
      const moverBody = SEP.bodyRadius * KID_SCALE
      const kidReach = SEP.bodyRadius * KID_SCALE + moverBody
      const adultReach = SEP.bodyRadius + moverBody
      expect(groundOccupied(set, 2 + kidReach - 1e-3, 0, SEP, moverBody)).toBe(true)
      expect(groundOccupied(set, 2 + adultReach - 1e-3, 0, SEP, moverBody)).toBe(false)
    })

    it('a boxed-in walker gets its ORIGIN back, never the occupied destination', () => {
      // The walk-in/push-out loop, one layer up (GPT-5.6 Sol, 12.08.2026): a
      // returned OCCUPIED destination reads as a successful move to the
      // caller's static resolveMove, its stuck counter resets, and the
      // separation shoves the figure back — for ever. Here the destination is
      // inside another body and every deflection heading is statically
      // blocked, so the only honest answer is "you stay where you stand".
      const set = createInhabitantSet()
      const [self] = claimBodies(set, 1, { x: 0, z: 0 })
      claimBodies(set, 1, { x: 0.4, z: 0 }) // dead ahead, inside one step
      const wall = (x: number, z: number) => Math.hypot(x, z) > 0.05 // everything but the origin
      const r = stepRoundBodies(set, self, 0, 0, 0.4, 0, SEP, wall)
      expect(r.x).toBe(0)
      expect(r.z).toBe(0)
      // And a caller measuring its own progress reads the frame as BLOCKED —
      // the distance its stuck counter judges is zero, not a body-deep step.
      expect(Math.hypot(r.x - 0, r.z - 0)).toBe(0)
    })

    it('a long step is judged along its WHOLE segment, not at its endpoint', () => {
      // The porter case (GPT-5.6 Sol, 12.08.2026): the wanted point comes from
      // the route clock, so one long frame can put the endpoint BEYOND a body
      // with the body in between — endpoint-only, the step crossed the child
      // without the deflection ever waking. The destination here is free; the
      // body sits mid-segment; the returned step must not cross it.
      const set = createInhabitantSet()
      const [self] = claimBodies(set, 1, { x: 0, z: 0 })
      const [child] = claimBodies(set, 1, { x: 1.5, z: 0, scale: KID_SCALE })
      const open = () => false
      const r = stepRoundBodies(set, self, 0, 0, 3, 0, SEP, open)
      // Not the raw destination (the straight line is refused) …
      const reach = SEP.bodyRadius * (1 + KID_SCALE)
      // … and no point of the returned move enters the child's ground.
      const steps = 30
      for (let i = 1; i <= steps; i++) {
        const px = (r.x * i) / steps
        const pz = (r.z * i) / steps
        expect(Math.hypot(px - child.x, pz - child.z)).toBeGreaterThanOrEqual(reach - 1e-6)
      }
    })

    it('never counts an excluded body or an inactive one', () => {
      const set = createInhabitantSet()
      const [self, partner, sleeper] = claimBodies(set, 3, { x: 0, z: 0 })
      sleeper.active = false
      // All three stand on the very spot asked about; none of them counts.
      expect(groundOccupied(set, 0, 0, SEP, 0.3, (b) => b === self || b === partner)).toBe(false)
      // A fourth, unrelated body on the spot does.
      claimBodies(set, 1, { x: 0, z: 0 })
      expect(groundOccupied(set, 0, 0, SEP, 0.3, (b) => b === self || b === partner)).toBe(true)
    })
  })
})
