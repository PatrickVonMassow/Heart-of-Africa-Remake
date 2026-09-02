// Getting there (work-order 482/483). The bank errands used to end in a
// villager standing against a compound fence halfway across the village: it had
// closed most of the distance to the water and arrived at nothing, because the
// walk was a straight line and the bank lies on the far side of the built
// fabric. These pin the route that fixes it — on synthetic geometry, where the
// rules are visible, and then on the real PoC village, where the walk is
// simulated exactly as the scene runs it and has to END at the bank.

import { describe, it, expect } from 'vitest'
import {
  NAV_CELL,
  buildPlaceNavGrid,
  findPlaceRoute,
  navClearBetween,
  navPointFree,
  navRestrict,
} from './routing'
import { buildLayout } from './layout'
import { resolveMove, standingClear, WALKER_RADIUS, type Collider } from './collision'
import { insidePlace } from './boundary'
import { standsOnGroundPlate } from './riverBank'
import { ROCK_VILLAGE_ID } from '../../world/communicationRock'
import { balance } from '../../config/balance'

const R = WALKER_RADIUS
const SEEDS = [7, 42, 1337, 4711]

describe('the free-ground grid', () => {
  const bounds = { radius: 20 }
  const wall: Collider[] = [{ kind: 'segment', x1: -12, z1: 0, x2: 6, z2: 0, r: 0.4 }]
  const grid = buildPlaceNavGrid(bounds, wall, R)

  it('reads the same ground the mover may stand on', () => {
    expect(navPointFree(grid, 0, 6)).toBe(true)
    expect(navPointFree(grid, 0, 0)).toBe(false)
    // Past the walkable boundary is not free either — a route may never lead
    // where the movement will refuse the step.
    expect(navPointFree(grid, 0, 19.8)).toBe(false)
  })

  it('sees the wall between two points that face each other across it', () => {
    expect(navClearBetween(grid, 0, -6, 0, 6)).toBe(false)
    expect(navClearBetween(grid, 0, 6, 4, 8)).toBe(true)
  })

  it('routes around the wall, and every leg of the route is open', () => {
    const route = findPlaceRoute(grid, { x: 0, z: -6 }, { x: 0, z: 6 })!
    expect(route).not.toBeNull()
    expect(route.length).toBeGreaterThan(1)
    let from = { x: 0, z: -6 }
    for (const p of route) {
      expect(navClearBetween(grid, from.x, from.z, p.x, p.z)).toBe(true)
      from = p
    }
    // It ends at the true target, not at a cell centre: the arrival is judged
    // against the place the villager was actually sent to.
    expect(route[route.length - 1]).toEqual({ x: 0, z: 6 })
    // And it goes round the wall's open end rather than through it.
    expect(Math.max(...route.map((p) => p.x))).toBeGreaterThan(6)
  })

  it('keeps a straight walk straight: one waypoint, the goal itself', () => {
    expect(findPlaceRoute(grid, { x: 0, z: 6 }, { x: 5, z: 9 })).toEqual([{ x: 5, z: 9 }])
  })

  it('reports no route where there is none', () => {
    const boxed = buildPlaceNavGrid({ radius: 20 }, [{ x: 8, z: 0, r: 3 }], R)
    expect(findPlaceRoute(boxed, { x: 0, z: 0 }, { x: 8, z: 0 })).toBeNull()
  })

  // A GOAL INSIDE A COLLIDER IS NO ROUTE, NOT A ROUTE THAT ENDS INSIDE ONE
  // (cross-vendor review, 29.08.2026). The search substitutes a free cell for a
  // blocked goal and then appends the TRUE `to`, which is right for the hand's
  // breadth the substitution exists for — the mover stops at its own arrival
  // radius and the arrival is judged against the real place. Rings deeper into
  // SOLID ground it is a lie: the last leg is one no step can finish, so a
  // caller whose arrival radius is smaller than the obstruction drives at it for
  // the whole phase instead of being told to give up. The old four-ring goal
  // reach returned a NON-null route for exactly this, and no case here could see
  // it, because every case asked only whether the WAYPOINTS stood on free ground
  // — which they did. Un-free ground that is NOT solid keeps the full reach and
  // has its own case in riverBank.test.ts: the walk into the river targets the
  // wade limit, which no collider occupies, and it must still find its way.
  it('refuses a goal buried deeper than the substitution forgives', () => {
    const boxed = buildPlaceNavGrid({ radius: 20 }, [{ x: 8, z: 0, r: 3 }], R)
    // Free ground stops at 3 + R from the collider's middle. This goal lies well
    // inside that, but close enough that the old four-ring search still found a
    // free cell to route to and then walked off it into the rock.
    const buried = { x: 8 - (3 + R) + 1.4, z: 0 }
    expect(navPointFree(boxed, buried.x, buried.z)).toBe(false)
    expect(findPlaceRoute(boxed, { x: 0, z: 0 }, buried)).toBeNull()
    // And the hand's breadth is still forgiven: a goal barely inside the edge
    // keeps its route, and that route still ends at the true target.
    const grazed = { x: 8 - (3 + R) - 0.05, z: 0 }
    expect(navPointFree(boxed, grazed.x, grazed.z)).toBe(false)
    const route = findPlaceRoute(boxed, { x: 0, z: 0 }, grazed)
    expect(route).not.toBeNull()
    expect(route![route!.length - 1]).toEqual(grazed)
  })

  // THE INVARIANT THE ABOVE IS ONE CASE OF, asserted over a real layout rather
  // than a hand-built grid: whatever route comes back, its last leg is one the
  // mover can finish — the target is free ground, or it is near enough to free
  // ground that an ordinary arrival radius covers the difference.
  it('never returns a route whose last leg cannot be finished', () => {
    const boxed = buildPlaceNavGrid({ radius: 20 }, [{ x: 8, z: 0, r: 3 }, { x: -6, z: 4, r: 2 }], R)
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * Math.PI * 2
      const to = { x: Math.cos(a) * (2 + (i % 13)), z: Math.sin(a) * (2 + (i % 13)) }
      const route = findPlaceRoute(boxed, { x: 0, z: -12 }, to)
      if (!route) continue
      const end = route[route.length - 1]
      expect(end).toEqual(to)
      if (navPointFree(boxed, end.x, end.z)) continue
      // Not free — and in this fixture the only reason is a collider — so free
      // ground must lie within the one ring a solid goal is forgiven, and the
      // mover stops a step short rather than pushing at rock.
      const near = [-NAV_CELL, 0, NAV_CELL].some((dx) =>
        [-NAV_CELL, 0, NAV_CELL].some((dz) => navPointFree(boxed, end.x + dx, end.z + dz)),
      )
      expect(near).toBe(true)
    }
  })

  // A MOVER WITH RULES OF ITS OWN (work-order 687). The children's round is kept
  // off the sloping shore and out of the carved sub-passage wedges, neither of
  // which the grid knows — and a route over ground the mover's own step then
  // refuses strands it at a waypoint it can never reach. `navRestrict` is how a
  // caller narrows one grid rather than keeping a second definition of free.
  it('narrows a built grid to the caller`s own ground, and routes round the rest', () => {
    const own = buildPlaceNavGrid({ radius: 20 }, [], R)
    expect(navPointFree(own, 0, 0)).toBe(true)
    expect(findPlaceRoute(own, { x: 0, z: -6 }, { x: 0, z: 6 })).toEqual([{ x: 0, z: 6 }])
    // A bar across the middle this mover may not stand on, invisible to both the
    // boundary and the colliders, with open ground round each of its ends.
    navRestrict(own, (x, z) => Math.abs(z) > 1 || Math.abs(x) > 8)
    expect(navPointFree(own, 0, 0)).toBe(false)
    expect(navPointFree(own, 0, 6)).toBe(true)
    expect(navClearBetween(own, 0, -6, 0, 6)).toBe(false)
    const round = findPlaceRoute(own, { x: 0, z: -6 }, { x: 0, z: 6 })
    expect(round).not.toBeNull()
    for (const w of round!) expect(navPointFree(own, w.x, w.z)).toBe(true)
    // It only ever takes ground away — a cell the rule already refused stays
    // refused, and none is handed back.
    navRestrict(own, () => true)
    expect(navPointFree(own, 0, 0)).toBe(false)
  })

  /**
   * THE INVARIANT THE PLANNER EXISTS FOR: a route may never lead where the step
   * is refused. `PlaceLife` narrows the children's grid with the SAME `onGround`
   * their movement uses, and this asserts the consequence over every cell of
   * every river village's grid rather than over one sampled route.
   *
   * It also settles a review finding (GPT-5.6 Sol, effort high) that narrowing
   * with the shore half alone could hand back a boundary-edge waypoint the step
   * refuses. It cannot: `buildPlaceNavGrid` tests the boundary at `margin +
   * slack`, which is strictly stronger than the `margin` the step uses, so the
   * boundary half of `onGround` is already implied. Measured over the six
   * layouts below, the two restrictions yield BIT-IDENTICAL grids. The
   * predicates are single-sourced anyway, and this is what keeps them so.
   */
  it('narrows the children`s grid to ground their own step accepts, over every cell', () => {
    const SEEDS: Array<[string, number]> = [
      ['bambara-village', 42],
      ['bambara-village', 2972259115],
      ['bambara-village', 7],
      ['bambara-village', 1337],
      ['nubian-village', 42],
      ['mandinka-village', 99],
    ]
    let checked = 0
    for (const [placeId, seed] of SEEDS) {
      const layout = buildLayout(placeId, seed)
      if (!layout.bank || !layout.playRocks) continue
      const bounds = { radius: layout.radius, bank: layout.bank }
      // The bank round's own ground rule and step, as `PlaceLife` writes them.
      const onGround = (x: number, z: number) =>
        insidePlace(bounds, x, z, R * 2) && standsOnGroundPlate(layout.bank, x, z, R)
      const blocked = (x: number, z: number) =>
        !onGround(x, z) || !standingClear(layout.colliders, x, z, R)

      const grid = buildPlaceNavGrid(bounds, layout.colliders, R)
      navRestrict(grid, onGround)
      // ...and the shore half on its own, which is what the finding proposed.
      const shoreOnly = buildPlaceNavGrid(bounds, layout.colliders, R)
      navRestrict(shoreOnly, (x, z) => standsOnGroundPlate(layout.bank, x, z, R))

      let free = 0
      for (let i = 0; i < grid.n; i++) {
        const x = grid.min + i * grid.cell
        for (let j = 0; j < grid.n; j++) {
          const z = grid.min + j * grid.cell
          const k = i * grid.n + j
          // The boundary half is implied, so the two agree cell for cell.
          expect(shoreOnly.free[k]).toBe(grid.free[k])
          if (!grid.free[k]) continue
          free++
          // ...and nothing the planner offers is ground the step refuses.
          expect(blocked(x, z)).toBe(false)
        }
      }
      expect(free).toBeGreaterThan(1000)
      checked++
    }
    expect(checked).toBe(SEEDS.length)
  })
})

describe('a villager sent to the BANK gets there (work-order 483)', () => {
  /**
   * The scene's own walk, step for step: the route decides the heading, the
   * collider resolve decides the step, the walkable shape decides whether the
   * step is taken at all. Returns the seconds it took, or null if it never
   * arrived — which is exactly the failure this replaces.
   */
  function walk(
    layout: ReturnType<typeof buildLayout>,
    from: { x: number; z: number },
    to: { x: number; z: number },
  ): number | null {
    const bounds = { radius: layout.radius, bank: layout.bank }
    const grid = buildPlaceNavGrid(bounds, layout.colliders, R)
    const me = { ...from }
    let route = null as ReturnType<typeof findPlaceRoute>
    const dt = 1 / 60
    // The SHIPPED pace (1.25 m/s), capped at the errand backstop itself: a walk
    // that outlasts `balance.villageLife.adultErrands.errandSeconds` is one the
    // scheduler lets go of, so it never ends in front of the player either.
    for (let f = 0; f < balance.villageLife.adultErrands.errandSeconds * 60; f++) {
      if (Math.hypot(to.x - me.x, to.z - me.z) <= 1.1) return f * dt
      if (!route && !navClearBetween(grid, me.x, me.z, to.x, to.z)) {
        route = findPlaceRoute(grid, me, to)
      }
      let aim = to as { x: number; z: number }
      if (route) {
        while (route.length > 1 && Math.hypot(route[0].x - me.x, route[0].z - me.z) <= 1.2) {
          route.shift()
        }
        if (navClearBetween(grid, me.x, me.z, to.x, to.z)) route = null
        else aim = route[0]
      }
      const ax = aim.x - me.x
      const az = aim.z - me.z
      const ad = Math.hypot(ax, az) || 1
      const step = balance.villageLife.adultErrands.pace * dt
      const wantX = me.x + (ax / ad) * step
      const wantZ = me.z + (az / ad) * step
      if (!insidePlace(bounds, wantX, wantZ, R * 2)) continue
      const [nx, nz] = resolveMove(layout.colliders, wantX, wantZ, R, [me.x, me.z])
      me.x = nx
      me.z = nz
    }
    return null
  }

  it.each(SEEDS)('reaches all three bank points from anywhere in the village (seed %i)', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    const bank = layout.bank!
    expect(bank).not.toBeNull()
    for (const target of [bank.bank, bank.upstream, bank.downstream]) {
      // Every named bank point is ground a villager FITS on, against the full
      // collider set — the water wall, the dressing and the fabric alike.
      expect(standingClear(layout.colliders, target.x, target.z, R)).toBe(true)
      expect(insidePlace(layout, target.x, target.z, R * 2)).toBe(true)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const from = { x: Math.cos(a) * 7, z: Math.sin(a) * 7 }
        expect(walk(layout, from, target), `from ${from.x.toFixed(1)},${from.z.toFixed(1)}`).not.toBeNull()
      }
    }
  })

  it('the grid is finer than the walker is wide, so consecutive free cells connect', () => {
    // Each free cell certifies a clear disc around its own centre; at a cell no
    // wider than the mover those discs overlap along a straight leg, which is
    // what lets the line-of-sight test speak for the ground between the samples.
    expect(NAV_CELL).toBeLessThanOrEqual(R * 2 + 1e-9)
  })
})
