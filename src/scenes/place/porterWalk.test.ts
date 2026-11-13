// The port porters' head-load walk: routes over free ground, a steady pace
// independent of the route's length, a heading that follows the movement and
// no grinding against a wall beyond a bounded time — on synthetic geometry and
// on the two reported ports (Cairo seed 1177128818, Tangier seed 1117999851).

import { describe, it, expect } from 'vitest'
import { PORTER_WALK, VILLAGER_MOTION } from '../../config/balance'
import { groundStepped } from '../../render/figureWalk'
import { gaitWeights } from '../../render/villagerRig'
import { mulberry32 } from '../../world/noise'
import { escapeToFree, resolveMove, standingClear, WALKER_RADIUS, type Collider } from './collision'
import { buildLayout } from './layout'
import { buildPlaceNavGrid, navPointFree, navPointOffGround, navRestrict, type PlaceNavGrid } from './routing'
import { planPorterRoutes, reconcilePorters, startPorter, stepPorter, walkableStep, type PorterRoute, type PorterState, type PorterWorld } from './porterWalk'

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
  /** Leg changes at the leg's end (within the arrival radius of it). */
  arrivals: number
  /** Leg changes anywhere else: a stalled porter freed and turned back. */
  recoveries: number
  /** Largest angle between the facing and the frame's displacement at full stride. */
  maxHeadingLag: number
  /** Longest stretch near a collider without getting nearer the leg's goal (s). */
  maxGrind: number
  overlaps: number
  /** Frames spent on ground the grid refuses without a collider. */
  offGround: number
  /** Highest ground speed the figure measures for its gait, turns stepped
   *  included, smoothed as the figure smooths it (m/s at figure scale 1). */
  maxGaitSpeed: number
}

function simulate(route: PorterRoute, colliders: Collider[], grid: PlaceNavGrid, seconds: number, seed = 1): Track {
  const rand = mulberry32(seed)
  const s: PorterState = startPorter(route, rand)
  s.pause = 0
  const world = worldOf(grid, colliders, [route.entrance.x, route.entrance.z])
  const tr: Track = { maxSpeed: 0, maxStalled: 0, arrivals: 0, recoveries: 0, maxHeadingLag: 0, maxGrind: 0, overlaps: 0, offGround: 0, maxGaitSpeed: 0 }
  let grind = 0
  let bestToGoal = Infinity
  let leg = s.leg
  let gaitSpeed = 0
  for (let t = 0; t < seconds; t += DT) {
    const x0 = s.x
    const z0 = s.z
    const yaw0 = s.yaw
    stepPorter(s, route, world, DT, rand)
    const stepped = groundStepped(s.x - x0, s.z - z0, yaw0, s.yaw)
    gaitSpeed += (stepped / DT - gaitSpeed) * (1 - Math.exp(-DT / VILLAGER_MOTION.speedSmoothing))
    // A free-ground escape is a placement, not a walk: the figure lets go there.
    if (Math.hypot(s.x - x0, s.z - z0) / DT <= VILLAGER_MOTION.teleportSpeed) tr.maxGaitSpeed = Math.max(tr.maxGaitSpeed, gaitSpeed)
    else gaitSpeed = 0
    if (s.leg !== leg) {
      // The leg just ended: at its goal it is an arrival, elsewhere a recovery.
      const was = leg === 0 ? route.plaza : route.entrance
      if (Math.hypot(was.x - x0, was.z - z0) <= PORTER_WALK.arriveRadius + 1e-6) tr.arrivals++
      else tr.recoveries++
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
    expect(a.recoveries + b.recoveries).toBe(0)
  })

  it('goes round a building that stands on the straight line, facing where it goes', () => {
    // A house squarely between the entrance and the plaza point.
    const house: Collider[] = [{ kind: 'box', x: 0, z: 8, hx: 4, hz: 2.5, rot: 0 }]
    const grid = buildPlaceNavGrid(bounds, house, R)
    const route: PorterRoute = { entrance: { x: 0, z: 16 }, plaza: { x: 0, z: 0 }, pace: PORTER_WALK.pace }
    const tr = simulate(route, house, grid, 120)
    expect(tr.arrivals).toBeGreaterThanOrEqual(4)
    expect(tr.recoveries).toBe(0)
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

  it('steps along the route where its heading points off the ground, no faster than its pace', () => {
    // Ground refused for z < 0. The porter stands on the edge, facing off it,
    // its next waypoint along the edge: the heading's step is cut, and the
    // step along the route must keep the turn's easing.
    const grid = buildPlaceNavGrid(bounds, [], R)
    navRestrict(grid, (_x, z) => z >= 0)
    const route: PorterRoute = { entrance: { x: -6, z: 0.6 }, plaza: { x: 6, z: 0.6 }, pace: PORTER_WALK.pace }
    const world = worldOf(grid, [], [route.entrance.x, route.entrance.z])
    const cap = Math.max(route.pace, VILLAGER_MOTION.spotTurnRate * VILLAGER_MOTION.turnStep) * 1.01
    // The edge as the grid draws it: a hair inside the last accepted cell.
    let edge = 2
    while (!navPointOffGround(grid, 0, edge - 0.001)) edge -= 0.001
    for (const facing of [Math.PI * 0.6, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.4]) {
      const rand = mulberry32(4)
      const s: PorterState = startPorter(route, rand)
      Object.assign(s, { x: 0, z: edge + 0.002, yaw: facing, leg: 0, pause: 0, way: [{ x: 6, z: edge + 0.002 }] })
      for (let k = 0; k < 90; k++) {
        const x0 = s.x
        const z0 = s.z
        const yaw0 = s.yaw
        stepPorter(s, route, world, DT, rand)
        const walked = groundStepped(s.x - x0, s.z - z0, yaw0, s.yaw) / DT
        expect(walked, `facing ${facing.toFixed(2)}, frame ${k}`).toBeLessThanOrEqual(cap)
        expect(navPointOffGround(grid, s.x, s.z)).toBe(false)
      }
    }
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
    // The sealed plaza goal is never reached: each turn back from it is a
    // recovery, and only the walk back to the entrance ends in an arrival.
    expect(tr.recoveries).toBeGreaterThanOrEqual(1)
    expect(tr.arrivals).toBeLessThanOrEqual(tr.recoveries + 1)
    expect(tr.maxStalled).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
    expect(tr.maxGrind).toBeLessThan(PORTER_WALK.stallEscape * 2)
  })
})

/** Longest stretch (s) a porter goes without getting `progress` metres nearer
 *  its leg's goal and without being turned back — out of rest. */
function noProgress(route: PorterRoute, world: PorterWorld, seconds: number, progress = 0.15): { worst: number; escapes: number } {
  const rand = mulberry32(5)
  const s = startPorter(route, rand)
  s.pause = 0
  let leg = s.leg
  let mark = Infinity
  let since = 0
  let worst = 0
  let escapes = 0
  for (let t = 0; t < seconds; t += DT) {
    const x0 = s.x
    const z0 = s.z
    stepPorter(s, route, world, DT, rand)
    const goal = s.leg === 0 ? route.plaza : route.entrance
    const d = Math.hypot(goal.x - s.x, goal.z - s.z)
    if (s.leg !== leg) {
      const was = leg === 0 ? route.plaza : route.entrance
      if (Math.hypot(was.x - x0, was.z - z0) > PORTER_WALK.arriveRadius + 1e-6) escapes++
      leg = s.leg
      mark = d
      since = 0
    } else if (s.pause > 0 || d <= mark - progress) {
      mark = d
      since = 0
    } else {
      since += DT
      worst = Math.max(worst, since)
    }
  }
  return { worst, escapes }
}

describe('the porter that moves but gets nowhere', () => {
  const bounds = { radius: 30 }
  // Grids blind to the obstruction: the plan runs straight through it, as a
  // route does through another inhabitant or a wall the grid cell missed.
  const grid = buildPlaceNavGrid(bounds, [], R)

  it('sliding along a wall at full step length replans and is freed within the stall bound', () => {
    // The wall turns every step into a full-length slide along it, the way a
    // walk round another body keeps the step's length: the porter moves every
    // frame and never gets nearer the goal behind the wall.
    const wallZ = 4
    const world: PorterWorld = {
      grid,
      move: (fx, fz, tx, tz) => {
        if (tz >= wallZ + R) return [tx, tz]
        const len = Math.hypot(tx - fx, tz - fz)
        const side = Math.sign(tx - fx) || 1
        return [fx + side * len, Math.max(fz, wallZ + R)]
      },
      free: (x, z) => [x, z],
    }
    const route: PorterRoute = { entrance: { x: 3, z: 10 }, plaza: { x: 0, z: 0 }, pace: PORTER_WALK.pace }
    const r = noProgress(route, world, 30)
    expect(r.escapes).toBeGreaterThan(0)
    expect(r.worst).toBeLessThanOrEqual(PORTER_WALK.stallEscape + 2 * DT)
  })

  it('circling another body that holds its goal replans and is freed within the stall bound', () => {
    const body = { x: 0, z: 0, r: 0.8 }
    const world: PorterWorld = {
      grid,
      move: (fx, fz, tx, tz) => {
        const ox = tx - body.x
        const oz = tz - body.z
        const d = Math.hypot(ox, oz)
        if (d >= body.r + R) return [tx, tz]
        // Walked round: the full step along the tangent, kept at the body's edge.
        const len = Math.hypot(tx - fx, tz - fz)
        const ax = (fx - body.x) / (Math.hypot(fx - body.x, fz - body.z) || 1)
        const az = (fz - body.z) / (Math.hypot(fx - body.x, fz - body.z) || 1)
        const nx = fx - az * len
        const nz = fz + ax * len
        const k = (body.r + R) / (Math.hypot(nx - body.x, nz - body.z) || 1)
        return [body.x + (nx - body.x) * k, body.z + (nz - body.z) * k]
      },
      free: (x, z) => [x, z],
    }
    // The goal off the body's centre: circling it, the distance to the goal
    // swings up and down, and a replan must not take a worse distance for a
    // fresh minimum that the next swing back then "beats".
    for (const plaza of [{ x: 0, z: 0 }, { x: 0.5, z: -0.3 }, { x: -0.6, z: 0.2 }]) {
      const route: PorterRoute = { entrance: { x: 0.4, z: 9 }, plaza, pace: PORTER_WALK.pace }
      const r = noProgress(route, world, 30)
      expect(r.escapes, `goal ${plaza.x}/${plaza.z}`).toBeGreaterThan(0)
      expect(r.worst, `goal ${plaza.x}/${plaza.z}`).toBeLessThanOrEqual(PORTER_WALK.stallEscape + 2 * DT)
    }
  })

  it('a replan never raises the progress mark', () => {
    // Stalled into the replan with the porter now FURTHER along the new route
    // than its best: the clock must run on to the escape, not restart.
    const world: PorterWorld = { grid, move: (fx, fz) => [fx, fz], free: (x, z) => [x, z] }
    const route: PorterRoute = { entrance: { x: 0, z: 9 }, plaza: { x: 0, z: 0 }, pace: PORTER_WALK.pace }
    const rand = mulberry32(2)
    const s = startPorter(route, rand)
    s.pause = 0
    s.leg = 0
    s.x = 0
    s.z = 2.4
    s.yaw = Math.PI
    s.way = [{ x: 0, z: 0 }]
    s.mark = 2
    s.stalled = PORTER_WALK.stallReplan - DT / 2
    stepPorter(s, route, world, DT, rand)
    expect(s.mark).toBe(2)
    // Back to 2.25 m: nearer than the replan's 2.4 m, not nearer than the best.
    s.z = 2.25
    stepPorter(s, route, world, DT, rand)
    expect(s.stalled).toBeGreaterThan(PORTER_WALK.stallReplan)
  })
})

describe('the porter crew across a re-plan', () => {
  const pace = PORTER_WALK.pace
  const a: PorterRoute[] = [{ entrance: { x: 0, z: 8 }, plaza: { x: 0, z: 0 }, pace }]
  const b: PorterRoute[] = [{ entrance: { x: 6, z: -4 }, plaza: { x: 1, z: 1 }, pace }]

  it('keeps the walking states while the routes are the same plan', () => {
    const crew = reconcilePorters(null, a, 7)
    crew.states[0].x = 3.3
    expect(reconcilePorters(crew, a, 7)).toBe(crew)
    expect(crew.states[0].x).toBe(3.3)
  })

  it('starts afresh on another plan of the same count', () => {
    const crew = reconcilePorters(null, a, 7)
    const next = reconcilePorters(crew, b, 7)
    expect(next).not.toBe(crew)
    expect(next.states).toHaveLength(1)
    const at = next.states[0]
    const onEnd = [b[0].entrance, b[0].plaza].some((p) => p.x === at.x && p.z === at.z)
    expect(onEnd).toBe(true)
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
        // A walkable route needs no rescue on static ground.
        expect(tr.recoveries, `porter ${i}`).toBe(0)
        expect(tr.maxSpeed, `porter ${i}`).toBeLessThanOrEqual(route.pace * 1.01)
        expect(tr.maxStalled, `porter ${i}`).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
        expect(tr.maxGrind, `porter ${i}`).toBeLessThan(PORTER_WALK.stallEscape + 0.5)
        expect(tr.maxHeadingLag, `porter ${i}`).toBeLessThan(0.5)
        expect(tr.offGround, `porter ${i}`).toBe(0)
        // A calm head-load walk, corners included: never any share of the jog,
        // even on a short-legged body (legScale 0.85).
        expect(gaitWeights(tr.maxGaitSpeed, 0.85).jog, `porter ${i} at ${tr.maxGaitSpeed.toFixed(2)} m/s`).toBe(0)
      })
    })
  }
})
