// The port porters' head-load walk: a WALKABLE route from a building entrance
// to the plaza and back, at a steady pace that does not depend on the route's
// length, with the heading following where the body actually goes and a
// bounded stall before the porter replans or is freed.
//
// Pure data: no three.js, no scene. The scene hands in the collision resolve
// (`move`) and the wedge escape (`free`), so the same stepper runs in Vitest.

import { PORTER_WALK } from '../../config/balance'
import { steerHeading, wayHeading } from '../../render/figureWalk'
import { advancePlaceRoute, findPlaceRoute, navPointFree, type NavPoint, type PlaceNavGrid } from './routing'

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
  /** Time without progress (s). */
  stalled: number
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
    vx: 0,
    vz: 0,
  }
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
    done()
    return
  }
  const goal = s.leg === 0 ? route.plaza : route.entrance
  if (Math.hypot(goal.x - s.x, goal.z - s.z) <= PORTER_WALK.arriveRadius) {
    s.leg = s.leg === 0 ? 1 : 0
    s.way = []
    s.pause = PORTER_WALK.dwell + rand() * PORTER_WALK.dwellSpread
    s.stalled = 0
    done()
    return
  }
  if (s.way.length === 0) s.way = findPlaceRoute(world.grid, s, goal) ?? [{ x: goal.x, z: goal.z }]
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
  const [nx, nz] = world.move(s.x, s.z, s.x + Math.sin(s.yaw) * reach * turn.pace, s.z + Math.cos(s.yaw) * reach * turn.pace)
  s.x = nx
  s.z = nz
  const moved = Math.hypot(nx - fromX, nz - fromZ)
  // Turning nearly on the spot is not a stall.
  if (moved >= reach * 0.3 || turn.pace < 0.3) {
    s.stalled = 0
  } else {
    const before = s.stalled
    s.stalled += dt
    if (before < PORTER_WALK.stallReplan && s.stalled >= PORTER_WALK.stallReplan) {
      s.way = []
    } else if (s.stalled >= PORTER_WALK.stallEscape) {
      ;[s.x, s.z] = world.free(s.x, s.z)
      s.leg = s.leg === 0 ? 1 : 0
      s.way = []
      s.stalled = 0
    }
  }
  done()
}
