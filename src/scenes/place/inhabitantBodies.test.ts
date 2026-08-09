// The one cheap check that would have caught point 578: over a long visit no
// two inhabitants ever stand in one another, a stacked start comes apart, and
// the children's tag still catches (the separation must not deadlock the game).

import { describe, expect, it } from 'vitest'
import {
  addBodies,
  claimBodies,
  createBodies,
  createInhabitantSet,
  releaseBodies,
  separateAll,
  separateBody,
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
    // 600 s of game — long enough for several rounds, catches and idle breaks.
    for (let step = 0; step < 600 / dt; step++) {
      stepTagGame(game, dt, cfg, world)
      for (let i = 0; i < game.children.length; i++) {
        const c = game.children[i]
        const b = bodies[i]
        b.x = c.x
        b.z = c.z
        separateBody(set, b, dt, SEP, world)
        c.x = b.x
        c.z = b.z
      }
      // After the first half second (the stack is coming apart) no pair may be
      // nearer than their two bodies — EXCEPT inside the catch distance, where
      // the tag is being made and wins over the separation (point 578.4).
      if (step * dt > 0.5) {
        for (let i = 0; i < game.children.length; i++) {
          for (let j = i + 1; j < game.children.length; j++) {
            const d = Math.hypot(
              game.children[i].x - game.children[j].x,
              game.children[i].z - game.children[j].z,
            )
            closest = Math.min(closest, d)
            if (d < CHILD_R * 2 - SEP.slop - 1e-6 && d > cfg.catchDistance) violations++
          }
        }
      }
    }
    expect(violations).toBe(0)
    // The bodies really do touch — a separation that never engaged would prove
    // nothing at all.
    expect(closest).toBeLessThan(cfg.catchDistance)
    // NO DEADLOCK: the chase still catches its runner.
    expect(game.tags).toBeGreaterThan(0)
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
})
