// WHAT HAPPENS TO THE CORNER A CHILD CANNOT REACH (cross-vendor finding
// 14.08.2026, split out of `tagShuffle.test.ts` under work-order 1178). Synthetic
// geometry rather than a settlement replay, so both cases — the drop that is
// right and the drop that would walk through a collider — are visible at once.

import { describe, expect, it } from 'vitest'
import { BANK_CFG, NPC_RADIUS } from './tagShuffleHarness'
import { createBankGame, type BankChild, type BankWorld, wayTo } from './bankGame'

/**
 * WHAT HAPPENS TO THE CORNER A CHILD CANNOT REACH (cross-vendor finding,
 * 14.08.2026). The walk drops such a corner rather than pressing against it —
 * right, because a corner inside a carved wedge is unreachable however long the
 * child walks at it. But the corner may equally have been the way ROUND a
 * collider, and dropping it then leaves a leg that runs straight through what it
 * was avoiding, with nothing re-planning while a path exists.
 *
 * On synthetic geometry, where both cases are visible: the drop stands where the
 * leg it opens is clear, and gives the route up where it is not.
 */
describe('the walk drops a corner it cannot reach, but not into a wall', () => {
  const GOAL = { x: 0, z: 10 }
  /** A child of the round, taken from the round itself so it carries every
   *  field the walk reads, and stood where the case needs it. */
  const childAt = (x: number, z: number): BankChild => {
    const s = createBankGame([{ x, z }], () => 0.5, BANK_CFG)
    return s.children[0]
  }
  /** A world whose straight line to the goal is always shut — the child is on a
   *  planned route throughout — with `route` and the leg rule handed in. */
  const worldWith = (
    route: Array<{ x: number; z: number }>,
    legShut: (ax: number, az: number, bx: number, bz: number) => boolean,
  ): BankWorld =>
    ({
      radius: 40,
      centerX: 0,
      centerZ: 0,
      childRadius: NPC_RADIUS,
      blocked: () => false,
      nudge: (x: number, z: number) => ({ x, z, found: true }),
      lineBlocked: (ax: number, az: number, bx: number, bz: number) =>
        bx === GOAL.x && bz === GOAL.z ? true : legShut(ax, az, bx, bz),
      route: () => route.map((p) => ({ ...p })),
    }) as unknown as BankWorld

  /** Walk the child's stall watch out several times over without ever letting it
   *  get closer — the corner it can never reach. The child is held still, which
   *  is the worst case: the planner is asked from the same spot every time and
   *  can only answer with the same route. Returns every place the walk aimed. */
  const stallAt = (c: BankChild, world: BankWorld) => {
    const dt = 1 / 60
    const aims: Array<{ x: number; z: number }> = []
    for (let t = 0; t < 20; t += dt) {
      const aim = wayTo(c, GOAL, dt, world)
      aims.push({ x: aim.x, z: aim.z })
    }
    return aims
  }

  it('drops the corner and walks on where the leg behind it is clear', () => {
    const c = childAt(0, 0)
    // A route whose first corner the child never reaches, and a second corner it
    // has a clear line to.
    const world = worldWith([{ x: 6, z: 2 }, { x: 0, z: 6 }, GOAL], () => false)
    const aims = stallAt(c, world)
    // The unreachable corner is given up on and the walk carries on along the
    // route, rather than standing at that corner for the whole window.
    expect(aims).toContainEqual({ x: 0, z: 6 })
  })

  it('never steers at the corner behind a shut leg', () => {
    const c = childAt(0, 0)
    // The same route, but the corner that was dropped was the way round a
    // collider: the leg from the child to the next corner is shut.
    const world = worldWith([{ x: 6, z: 2 }, { x: 0, z: 6 }, GOAL], (_ax, _az, bx, bz) => bx === 0 && bz === 6)
    const aims = stallAt(c, world)
    // NOT ONCE in twenty seconds is the child sent at the corner behind the
    // wall — which is what it was steered at before, for as long as the route
    // held. It is sent at its goal instead, and walks there deflecting off what
    // it meets like any other walk.
    expect(aims).not.toContainEqual({ x: 0, z: 6 })
    expect(aims).toContainEqual(GOAL)
  })

  it('never re-plans the refused corner from the spot it stalled on (work-order 687)', () => {
    const c = childAt(0, 0)
    const CORNER = { x: 6, z: 2 }
    // The shut-leg give-up: the child stalls at the first corner, the leg the
    // drop opens is shut, the route is cleared. The child is HELD STILL — which
    // is what a stalled child is — so the planner, asked again a second later,
    // can only hand back the identical route with the identical corner. Before
    // the fix that was a four-second cycle: stall, give up, re-plan the same
    // corner, stall again, for the whole window.
    const world = worldWith([CORNER, { x: 0, z: 6 }, GOAL], (_ax, _az, bx, bz) => bx === 0 && bz === 6)
    const aims = stallAt(c, world)
    const gaveUp = aims.findIndex((a) => a.x === GOAL.x && a.z === GOAL.z)
    // The give-up happened (one stall window in)...
    expect(gaveUp).toBeGreaterThan(0)
    // ...and from then on, over the remaining ~15 s, the corner NEVER comes
    // back: every aim is the goal itself. Not "rarely" — the guarantee is that
    // no plan made near the refusal spot may re-instate that corner.
    expect(aims.slice(gaveUp)).not.toContainEqual(CORNER)
  })

  it('may plan the refused corner again once the child has genuinely left the spot', () => {
    const c = childAt(0, 0)
    const CORNER = { x: 6, z: 2 }
    const world = worldWith([CORNER, { x: 0, z: 6 }, GOAL], (_ax, _az, bx, bz) => bx === 0 && bz === 6)
    stallAt(c, world)
    // Carry the child well past the leave distance by hand (the harness has no
    // real mover). The refusal is scoped to the SPOT the stall happened on, not
    // to the corner for ever — from genuinely elsewhere the same corner may be
    // a sound way round, and banning it for good could strand a child walking
    // at a wall with no route allowed at all.
    c.x = 5
    c.z = 0
    const dt = 1 / 60
    const aims: Array<{ x: number; z: number }> = []
    for (let t = 0; t < 2; t += dt) {
      const aim = wayTo(c, GOAL, dt, world)
      aims.push({ x: aim.x, z: aim.z })
    }
    expect(aims).toContainEqual(CORNER)
  })

  it('survives a planner that knows no way at all, once a corner stands refused', () => {
    const c = childAt(0, 0)
    const CORNER = { x: 6, z: 2 }
    // `BankWorld.route` is declared to answer null where no way round is known,
    // and the refusal check read that answer's length without asking whether it
    // was one. The branch tip did not compile because of it. The crash is not
    // reachable from a fresh child — `c.refused !== null` short-circuits ahead of
    // it — so the refusal has to stand FIRST, which is exactly the state the
    // stall branch leaves behind: a child that has just given a corner up and is
    // still standing on the spot it gave it up from.
    const world = worldWith([CORNER, { x: 0, z: 6 }, GOAL], (_ax, _az, bx, bz) => bx === 0 && bz === 6)
    stallAt(c, world)
    expect(c.refused).not.toBeNull()
    // Now the planner loses the way entirely, with the child still on that spot.
    const lost = { ...world, route: () => null } as unknown as BankWorld
    const dt = 1 / 60
    const aims: Array<{ x: number; z: number }> = []
    for (let t = 0; t < 5; t += dt) {
      const aim = wayTo(c, GOAL, dt, lost)
      aims.push({ x: aim.x, z: aim.z })
    }
    // It keeps walking at its goal instead of throwing, and no corner is banned
    // on the strength of a route that was never handed back.
    expect(aims.every((a) => a.x === GOAL.x && a.z === GOAL.z)).toBe(true)
  })
})
