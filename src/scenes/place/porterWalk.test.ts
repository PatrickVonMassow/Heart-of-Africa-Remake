// The port porters' head-load walk: routes over free ground, a steady pace
// independent of the route's length, a heading that follows the movement and
// no grinding against a wall beyond a bounded time — on synthetic geometry and
// on the two reported ports (Cairo seed 1177128818, Tangier seed 1117999851).

import { describe, it, expect } from 'vitest'
import { PORTER_WALK } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { escapeToFree, resolveMove, standingClear, WALKER_RADIUS, type Collider } from './collision'
import { buildLayout } from './layout'
import { buildPlaceNavGrid, navPointFree, navPointOffGround, navRestrict, type PlaceNavGrid } from './routing'
import { planPorterRoutes, startPorter, stepPorter, walkableStep, type PorterRoute, type PorterState, type PorterWorld } from './porterWalk'

const R = WALKER_RADIUS
const DT = 1 / 60

function worldOf(grid: PlaceNavGrid, colliders: Collider[], home: [number, number]): PorterWorld {
  return {
    grid,
    move: (fx, fz, tx, tz) => resolveMove(colliders, tx, tz, R, [fx, fz]),
    free: (x, z) => escapeToFree(colliders, x, z, R, grid, home).pos,
  }
}

interface Track {
  maxSpeed: number
  maxStalled: number
  arrivals: number
  /** Largest angle between the facing and the frame's displacement at full stride. */
  maxHeadingLag: number
  /** Longest stretch near a collider without getting nearer the leg's goal (s). */
  maxGrind: number
  overlaps: number
  /** Frames spent on ground the grid refuses without a collider. */
  offGround: number
}

function simulate(route: PorterRoute, colliders: Collider[], grid: PlaceNavGrid, seconds: number, seed = 1): Track {
  const rand = mulberry32(seed)
  const s: PorterState = startPorter(route, rand)
  s.pause = 0
  const world = worldOf(grid, colliders, [route.entrance.x, route.entrance.z])
  const tr: Track = { maxSpeed: 0, maxStalled: 0, arrivals: 0, maxHeadingLag: 0, maxGrind: 0, overlaps: 0, offGround: 0 }
  let grind = 0
  let bestToGoal = Infinity
  let leg = s.leg
  for (let t = 0; t < seconds; t += DT) {
    const x0 = s.x
    const z0 = s.z
    stepPorter(s, route, world, DT, rand)
    if (s.leg !== leg) {
      tr.arrivals++
      leg = s.leg
      bestToGoal = Infinity
      grind = 0
    }
    const moved = Math.hypot(s.x - x0, s.z - z0)
    tr.maxSpeed = Math.max(tr.maxSpeed, moved / DT)
    tr.maxStalled = Math.max(tr.maxStalled, s.stalled)
    if (moved / DT > route.pace * 0.85) {
      const dir = Math.atan2(s.x - x0, s.z - z0)
      const lag = Math.abs(Math.atan2(Math.sin(dir - s.yaw), Math.cos(dir - s.yaw)))
      tr.maxHeadingLag = Math.max(tr.maxHeadingLag, lag)
    }
    if (!standingClear(colliders, s.x, s.z, R * 0.9)) tr.overlaps++
    if (navPointOffGround(grid, s.x, s.z)) tr.offGround++
    const goal = s.leg === 0 ? route.plaza : route.entrance
    const toGoal = Math.hypot(goal.x - s.x, goal.z - s.z)
    const nearWall = !standingClear(colliders, s.x, s.z, R + 0.1)
    if (toGoal < bestToGoal - 0.05) {
      bestToGoal = toGoal
      grind = 0
    } else if (nearWall && s.pause <= 0) {
      grind += DT
      tr.maxGrind = Math.max(tr.maxGrind, grind)
    }
  }
  return tr
}

describe('the porter walk on synthetic ground', () => {
  const bounds = { radius: 30 }

  it('walks at the same steady pace on a short and a long route', () => {
    const grid = buildPlaceNavGrid(bounds, [], R)
    const pace = PORTER_WALK.pace
    const short: PorterRoute = { entrance: { x: 0, z: 4 }, plaza: { x: 0, z: 0 }, pace }
    const long: PorterRoute = { entrance: { x: 0, z: 22 }, plaza: { x: 0, z: 0 }, pace }
    const a = simulate(short, [], grid, 30)
    const b = simulate(long, [], grid, 60)
    expect(a.maxSpeed).toBeLessThanOrEqual(pace * 1.01)
    expect(b.maxSpeed).toBeLessThanOrEqual(pace * 1.01)
    // A head-load walk, never a run.
    expect(PORTER_WALK.pace + PORTER_WALK.paceSpread).toBeLessThan(1.4)
    expect(a.arrivals).toBeGreaterThanOrEqual(2)
    expect(b.arrivals).toBeGreaterThanOrEqual(2)
  })

  it('goes round a building that stands on the straight line, facing where it goes', () => {
    // A house squarely between the entrance and the plaza point.
    const house: Collider[] = [{ kind: 'box', x: 0, z: 8, hx: 4, hz: 2.5, rot: 0 }]
    const grid = buildPlaceNavGrid(bounds, house, R)
    const route: PorterRoute = { entrance: { x: 0, z: 16 }, plaza: { x: 0, z: 0 }, pace: PORTER_WALK.pace }
    const tr = simulate(route, house, grid, 120)
    expect(tr.arrivals).toBeGreaterThanOrEqual(4)
    expect(tr.maxSpeed).toBeLessThanOrEqual(route.pace * 1.01)
    expect(tr.maxHeadingLag).toBeLessThan(0.5)
    expect(tr.maxGrind).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
    expect(tr.overlaps).toBe(0)
  })

  it('never steps off walkable ground the movement itself would allow', () => {
    // A band of refused ground (a bank past the wade limit, say) with no
    // collider in it: no route crosses, so the stepper falls back to the
    // straight line, and only the grid check keeps the porter off the band.
    const grid = buildPlaceNavGrid(bounds, [], R)
    navRestrict(grid, (_x, z) => Math.abs(z - 6) > 1)
    const route: PorterRoute = { entrance: { x: 0, z: 10 }, plaza: { x: 0, z: 0 }, pace: PORTER_WALK.pace }
    const rand = mulberry32(3)
    const s: PorterState = startPorter(route, rand)
    s.leg = 0
    s.x = route.entrance.x
    s.z = route.entrance.z
    s.pause = 0
    const world = worldOf(grid, [], [route.entrance.x, route.entrance.z])
    let offGround = 0
    let nearest = Infinity
    for (let t = 0; t < 20; t += DT) {
      stepPorter(s, route, world, DT, rand)
      if (navPointOffGround(grid, s.x, s.z)) offGround++
      nearest = Math.min(nearest, s.z)
    }
    expect(offGround).toBe(0)
    // It walked up to the band's edge and no further.
    expect(nearest).toBeGreaterThan(5)
    expect(nearest).toBeLessThan(8)
  })

  it('cuts a step back to the last walkable point, and lets a stray walk back', () => {
    const grid = buildPlaceNavGrid(bounds, [], R)
    navRestrict(grid, (_x, z) => z < 2)
    const [x, z] = walkableStep(grid, 0, 1, 0, 3)
    expect(navPointOffGround(grid, x, z)).toBe(false)
    expect(z).toBeGreaterThan(1.5)
    expect(z).toBeLessThan(2.5)
    // From refused ground the step is taken unchanged.
    expect(walkableStep(grid, 0, 3, 0, 2.5)).toEqual([0, 2.5])
  })

  it('is freed and turns back where a wall leaves it no progress', () => {
    // A goal sealed inside a ring of walls: the stepper must not grind forever.
    const ring: Collider[] = []
    for (let k = 0; k < 24; k++) {
      const a0 = (k / 24) * Math.PI * 2
      const a1 = ((k + 1) / 24) * Math.PI * 2
      ring.push({ kind: 'segment', x1: Math.cos(a0) * 3, z1: Math.sin(a0) * 3, x2: Math.cos(a1) * 3, z2: Math.sin(a1) * 3, r: 0.3 })
    }
    const grid = buildPlaceNavGrid(bounds, ring, R)
    const route: PorterRoute = { entrance: { x: 0, z: 14 }, plaza: { x: 0, z: 0 }, pace: PORTER_WALK.pace }
    const tr = simulate(route, ring, grid, 90)
    expect(tr.maxStalled).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
    expect(tr.maxGrind).toBeLessThan(PORTER_WALK.stallEscape * 2)
  })
})

describe('the porters of the reported ports', () => {
  const cases: Array<[string, number]> = [['cairo', 1177128818], ['tangier', 1117999851]]
  for (const [placeId, seed] of cases) {
    it(`${placeId} (seed ${seed}): every porter walks a walkable route and makes progress`, () => {
      const layout = buildLayout(placeId, seed)
      let hash = 0
      for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
      const localSeed = (seed ^ hash) >>> 0
      const grid = buildPlaceNavGrid({ radius: layout.radius, bank: layout.bank, observed: layout.observed }, layout.colliders, R)
      const stops = layout.interactives.map((it) => it.pos)
      const routes = planPorterRoutes(grid, stops, mulberry32((localSeed + 4711) >>> 0), 4)
      expect(routes.length).toBeGreaterThan(0)
      routes.forEach((route, i) => {
        expect(navPointFree(grid, route.entrance.x, route.entrance.z)).toBe(true)
        expect(navPointFree(grid, route.plaza.x, route.plaza.z)).toBe(true)
        const tr = simulate(route, layout.colliders, grid, 120, i + 1)
        expect(tr.arrivals, `porter ${i}`).toBeGreaterThanOrEqual(2)
        expect(tr.maxSpeed, `porter ${i}`).toBeLessThanOrEqual(route.pace * 1.01)
        expect(tr.maxStalled, `porter ${i}`).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
        expect(tr.maxGrind, `porter ${i}`).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
        expect(tr.maxHeadingLag, `porter ${i}`).toBeLessThan(0.5)
        expect(tr.offGround, `porter ${i}`).toBe(0)
      })
    })
  }
})
