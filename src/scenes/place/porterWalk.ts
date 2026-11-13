// The port porters' head-load walk: a WALKABLE route from a building entrance
// to the plaza and back, at a steady pace that does not depend on the route's
// length, with the heading following where the body actually goes and a
// bounded stall before the porter replans or is freed.
//
// Pure data: no three.js, no scene. The scene hands in the collision resolve
// (`move`) and the wedge escape (`free`), so the same stepper runs in Vitest.

import { PORTER_WALK } from '../../config/balance'
import { steerHeading, wayHeading } from '../../render/figureWalk'
import { advancePlaceRoute, findPlaceRoute, navPointFree, navPointOffGround, type NavPoint, type PlaceNavGrid } from './routing'

export interface PorterRoute {
  /** Free ground just outside a building, on its plaza side. */
  entrance: NavPoint
  /** Free ground on the plaza. */
  plaza: NavPoint
  /** Walking pace (m/s), constant over the route. */
  pace: number
}

export interface PorterState {
  x: number
  z: number
  yaw: number
  /** 0: heading for the plaza; 1: heading for the entrance. */
  leg: 0 | 1
  /** Remaining waypoints of the current leg (empty: plan on the next step). */
  way: NavPoint[]
  /** Rest left at a route end (s). */
  pause: number
  /** Time without progress along the route (s). */
  stalled: number
  /** Remaining route length at the last progress (m; Infinity: not yet measured). */
  mark: number
  /** Last displacement per second (m/s). */
  vx: number
  vz: number
}

export interface PorterWorld {
  grid: PlaceNavGrid
  /** Collision-resolved step from one point toward another. */
  move: (fx: number, fz: number, tx: number, tz: number) => [number, number]
  /** Free ground near a wedged position. */
  free: (x: number, z: number) => [number, number]
}

/** The centre of the grid cell a point falls in: where the grid itself
 *  tested the mover's whole circle clear, unlike the point's own position. */
function cellCentre(grid: PlaceNavGrid, x: number, z: number): NavPoint {
  const snap = (v: number) => grid.min + Math.round((v - grid.min) / grid.cell) * grid.cell
  return { x: snap(x), z: snap(z) }
}

/**
 * A step kept on walkable ground. The collision resolve (`move`) keeps a step
 * out of every collider but knows nothing of the ground the grid refuses
 * without one: the bank past the wade limit, outside the observed ground or
 * the settlement boundary. A step from accepted ground that would end there is
 * cut back to the last accepted point along it. From refused ground (a shove
 * or an escape left the porter there) the step is taken as it is, so the
 * porter can walk back onto its route. Collider cells are left to `move`: the
 * grid tests them at cell centres only, and refusing them here would wedge a
 * porter in the diagonal pinch between two such cells.
 */
export function walkableStep(grid: PlaceNavGrid, fx: number, fz: number, tx: number, tz: number): [number, number] {
  if (!navPointOffGround(grid, tx, tz) || navPointOffGround(grid, fx, fz)) return [tx, tz]
  let lo = 0
  let hi = 1
  for (let k = 0; k < 10; k++) {
    const m = (lo + hi) / 2
    if (navPointOffGround(grid, fx + (tx - fx) * m, fz + (tz - fz) * m)) hi = m
    else lo = m
  }
  return [fx + (tx - fx) * lo, fz + (tz - fz) * lo]
}

/** A free point on the line from a building centre toward the plaza. */
function entranceOf(grid: PlaceNavGrid, bx: number, bz: number): NavPoint | null {
  const d = Math.hypot(bx, bz)
  if (d < 1e-6) return navPointFree(grid, bx, bz) ? cellCentre(grid, bx, bz) : null
  const ux = -bx / d
  const uz = -bz / d
  const from = PORTER_WALK.entranceOffset
  const to = Math.min(d, from + PORTER_WALK.entranceSearch)
  for (let s = from; s <= to + 1e-6; s += 0.25) {
    const x = bx + ux * s
    const z = bz + uz * s
    if (navPointFree(grid, x, z)) return cellCentre(grid, x, z)
  }
  return null
}

/**
 * One route per porter: a building entrance and a plaza point a route
 * connects. Buildings without such a pair carry no porter.
 */
export function planPorterRoutes(
  grid: PlaceNavGrid,
  stops: ReadonlyArray<readonly [number, number]>,
  rand: () => number,
  count: number,
): PorterRoute[] {
  const out: PorterRoute[] = []
  const n = Math.min(count, Math.max(1, stops.length))
  for (let i = 0; i < n && stops.length > 0; i++) {
    const a = stops[i % stops.length]
    const pace = PORTER_WALK.pace + rand() * PORTER_WALK.paceSpread
    const entrance = entranceOf(grid, a[0], a[1])
    if (!entrance) continue
    for (let k = 0; k < 12; k++) {
      const plaza = cellCentre(
        grid,
        (rand() * 2 - 1) * PORTER_WALK.plazaHalf,
        (rand() * 2 - 1) * PORTER_WALK.plazaHalf,
      )
      if (!navPointFree(grid, plaza.x, plaza.z)) continue
      if (!findPlaceRoute(grid, entrance, plaza)) continue
      out.push({ entrance, plaza, pace })
      break
    }
  }
  return out
}

/** A porter at the start of its round: at one end, resting a while. */
export function startPorter(route: PorterRoute, rand: () => number): PorterState {
  const atPlaza = rand() < 0.5
  const at = atPlaza ? route.plaza : route.entrance
  const other = atPlaza ? route.entrance : route.plaza
  return {
    x: at.x,
    z: at.z,
    yaw: Math.atan2(other.x - at.x, other.z - at.z),
    leg: atPlaza ? 1 : 0,
    way: [],
    pause: rand() * (PORTER_WALK.dwell + PORTER_WALK.dwellSpread),
    stalled: 0,
    mark: Infinity,
    vx: 0,
    vz: 0,
  }
}

/** The length of the route still ahead: to the next waypoint and on along
 *  the rest. Passing a waypoint never lengthens it; a slide along a wall or a
 *  circle round another body does not shorten it. */
function routeLeft(s: PorterState): number {
  if (s.way.length === 0) return 0
  let d = Math.hypot(s.way[0].x - s.x, s.way[0].z - s.z)
  for (let i = 1; i < s.way.length; i++) d += Math.hypot(s.way[i].x - s.way[i - 1].x, s.way[i].z - s.way[i - 1].z)
  return d
}

/** The route from where the porter stands to its leg's end. */
function planLeg(s: PorterState, grid: PlaceNavGrid, goal: NavPoint): NavPoint[] {
  return findPlaceRoute(grid, s, goal) ?? [{ x: goal.x, z: goal.z }]
}

/** One frame of the round. Mutates `s`. */
export function stepPorter(s: PorterState, route: PorterRoute, world: PorterWorld, dt: number, rand: () => number): void {
  const fromX = s.x
  const fromZ = s.z
  const done = () => {
    s.vx = dt > 0 ? (s.x - fromX) / dt : 0
    s.vz = dt > 0 ? (s.z - fromZ) / dt : 0
  }
  if (s.pause > 0) {
    s.pause -= dt
    s.stalled = 0
    s.mark = Infinity
    done()
    return
  }
  const goal = s.leg === 0 ? route.plaza : route.entrance
  if (Math.hypot(goal.x - s.x, goal.z - s.z) <= PORTER_WALK.arriveRadius) {
    s.leg = s.leg === 0 ? 1 : 0
    s.way = []
    s.pause = PORTER_WALK.dwell + rand() * PORTER_WALK.dwellSpread
    s.stalled = 0
    s.mark = Infinity
    done()
    return
  }
  if (s.way.length === 0) s.way = planLeg(s, world.grid, goal)
  advancePlaceRoute(world.grid, s, s.way, PORTER_WALK.waypointRadius)
  const target = s.way[0]
  const dx = target.x - s.x
  const dz = target.z - s.z
  const d = Math.hypot(dx, dz) || 1e-6
  const step = route.pace * dt
  const reach = Math.min(step, d)
  // Turn toward where a full step really goes, then step along the new heading.
  const [px, pz] = world.move(s.x, s.z, s.x + (dx / d) * reach, s.z + (dz / d) * reach)
  const turn = steerHeading(s.yaw, wayHeading(s.x, s.z, px, pz, dx, dz, reach), route.pace, dt)
  s.yaw = turn.yaw
  const [mx, mz] = world.move(s.x, s.z, s.x + Math.sin(s.yaw) * reach * turn.pace, s.z + Math.cos(s.yaw) * reach * turn.pace)
  let [nx, nz] = walkableStep(world.grid, s.x, s.z, mx, mz)
  // A heading still swinging round a corner can point off the walkable
  // ground the route runs over: then the step goes along the route instead.
  if (nx !== mx || nz !== mz) {
    const [ax, az] = walkableStep(world.grid, s.x, s.z, px, pz)
    if (Math.hypot(ax - s.x, az - s.z) > Math.hypot(nx - s.x, nz - s.z)) [nx, nz] = [ax, az]
  }
  s.x = nx
  s.z = nz
  // Progress is the route getting shorter, not displacement: a porter that
  // slides along a wall or circles a body holding its goal moves every frame
  // and gets nowhere. A turn on the spot is no progress either; it takes far
  // less than the replan bound. The deadline runs on from the last progress
  // through a replan, so the escape is never put off.
  const left = routeLeft(s)
  if (left <= s.mark - PORTER_WALK.progressStep) {
    s.mark = left
    s.stalled = 0
  } else {
    const before = s.stalled
    s.stalled += dt
    if (s.stalled >= PORTER_WALK.stallEscape) {
      ;[s.x, s.z] = world.free(s.x, s.z)
      s.leg = s.leg === 0 ? 1 : 0
      s.way = []
      s.stalled = 0
      s.mark = Infinity
    } else if (before < PORTER_WALK.stallReplan && s.stalled >= PORTER_WALK.stallReplan) {
      // Replan from here; the new route is measured afresh, the clock is not.
      s.way = planLeg(s, world.grid, goal)
      s.mark = routeLeft(s)
    }
  }
  done()
}
