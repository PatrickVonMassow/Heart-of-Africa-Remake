// GETTING THERE, not merely facing there (work-order 482/483).
//
// An inhabitant used to walk at its target in a straight line and let the
// collision resolve sort out the rest. That works for the short hops inside the
// built fabric it was written for, and it fails the moment a target lies on the
// FAR SIDE of that fabric: the river bank is a walk of some forty metres out
// past the huts and the compound fences, and a straight-line seeker presses
// head-on into the first fence panel on the way and stands there for the rest of
// the errand. It closes most of the gap and never arrives — which is exactly
// what the bank errands did.
//
// So the walk gets a ROUTE. The settlement's free ground is sampled once per
// visit into a coarse occupancy grid, a breadth-first search over it returns the
// waypoints from where a villager stands to where it was sent, and a
// line-of-sight pass pulls that staircase straight again so the figure walks the
// natural line and only bends where something is genuinely in the way.
//
// The grid is built from THE SAME two sources the movement itself obeys — the
// walkable boundary (`insidePlace`, bank lobe included) and the full collider
// set — so a route can never lead where the mover will then be stopped. It is
// pure data: no three.js, no scene, and every rule below is pinned in Vitest.

import { standingClear, type Collider } from './collision'
import { insidePlace, maxBoundaryRadius, type PlaceBounds } from './boundary'

/**
 * Edge length of one occupancy cell, in metres. A shade finer than a walker is
 * wide (0.6 m across), so two neighbouring free cells always overlap and the
 * straight leg between them is ground the figure genuinely fits through; finer
 * still costs a settlement entry real milliseconds, because every cell is tested
 * against every collider in the place.
 */
export const NAV_CELL = 0.55

/** A point on the settlement ground. */
export interface NavPoint {
  x: number
  z: number
}

/** The settlement's free ground, sampled on a square grid. */
export interface PlaceNavGrid {
  /** Cell edge length in metres. */
  cell: number
  /** Cells per side. */
  n: number
  /** World coordinate of cell index 0 on both axes. */
  min: number
  /** 1 where a mover of the grid's radius may stand, 0 elsewhere. */
  free: Uint8Array
  /** Search scratch, reused across calls: a settlement's grid is tens of
   *  thousands of cells, and allocating two arrays of it per route would hand
   *  the render loop a megabyte a second of garbage for nothing. */
  parent: Int32Array
  queue: Int32Array
}

/** Cell index of a world coordinate, clamped into the grid. */
function cellOf(grid: PlaceNavGrid, v: number): number {
  const i = Math.round((v - grid.min) / grid.cell)
  return i < 0 ? 0 : i >= grid.n ? grid.n - 1 : i
}

/** World coordinate of a cell index (its centre). */
function worldOf(grid: PlaceNavGrid, i: number): number {
  return grid.min + i * grid.cell
}

/**
 * Samples the settlement's free ground. `margin` is the clearance the mover
 * keeps to the walkable boundary — the same one it moves with, so the route
 * never runs along ground the movement will refuse.
 */
export function buildPlaceNavGrid(
  bounds: PlaceBounds,
  colliders: Collider[],
  moverRadius: number,
  margin = moverRadius * 2,
  cell = NAV_CELL,
): PlaceNavGrid {
  // THE BOUNDARY IS READ PESSIMISTICALLY, by half a cell diagonal — the furthest
  // a real position can lie from the cell centre that answers for it. Without
  // that slack a cell whose centre is just inside the walkable edge answers
  // "free" for a position just outside it, and the route walks a villager into a
  // step the movement REFUSES OUTRIGHT: it stood at the settlement rim for the
  // rest of the errand, which is the very failure this module exists to end.
  // The colliders get no such slack, and deliberately so: a step that clips one
  // is not refused but resolved, and the mover slides on along the wall — so
  // inflating them here would only pinch shut the lanes and the bank strip the
  // route has to run through.
  const slack = cell * Math.SQRT1_2
  const reach = maxBoundaryRadius(bounds) + cell
  const n = Math.max(1, Math.ceil((2 * reach) / cell) + 1)
  const grid: PlaceNavGrid = {
    cell,
    n,
    min: -reach,
    free: new Uint8Array(n * n),
    parent: new Int32Array(n * n),
    queue: new Int32Array(n * n),
  }
  for (let i = 0; i < n; i++) {
    const x = worldOf(grid, i)
    for (let j = 0; j < n; j++) {
      const z = worldOf(grid, j)
      if (!insidePlace(bounds, x, z, margin + slack)) continue
      if (!standingClear(colliders, x, z, moverRadius)) continue
      grid.free[i * n + j] = 1
    }
  }
  return grid
}

/**
 * Narrows a built grid to ground an EXTRA rule also allows.
 *
 * The grid knows the settlement's boundary and its colliders, which is all an
 * adult's errand needs. A mover with rules of its own — the children's round is
 * kept off the sloping shore and out of the sub-passage wedges `buildWedgeCarve`
 * closes — would otherwise be routed over ground its own step then refuses: the
 * mandinka village planned the walk down to the bank through a carved wedge, the
 * child circled the waypoint it could not reach for two hundred seconds and 400 m
 * of legs, and the group never played. One planner, one definition of free
 * (points 129/378) — so the caller hands its own rule in rather than keeping a
 * second grid.
 */
export function navRestrict(grid: PlaceNavGrid, free: (x: number, z: number) => boolean): void {
  for (let i = 0; i < grid.n; i++) {
    const x = worldOf(grid, i)
    for (let j = 0; j < grid.n; j++) {
      const k = i * grid.n + j
      if (grid.free[k] === 1 && !free(x, worldOf(grid, j))) grid.free[k] = 0
    }
  }
}

/** Whether a mover may stand at a world point, as the grid sees it. */
export function navPointFree(grid: PlaceNavGrid, x: number, z: number): boolean {
  return grid.free[cellOf(grid, x) * grid.n + cellOf(grid, z)] === 1
}

/**
 * Whether the straight line between two points runs over free ground only —
 * the test that keeps a route from bending where nothing is in the way, and the
 * cheap check that decides whether a route is needed at all.
 */
export function navClearBetween(
  grid: PlaceNavGrid,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const d = Math.hypot(bx - ax, bz - az)
  const steps = Math.max(1, Math.ceil(d / (grid.cell * 0.5)))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    if (!navPointFree(grid, ax + (bx - ax) * t, az + (bz - az) * t)) return false
  }
  return true
}

/** The nearest free cell to a point, spiralling outward; −1 when none is near.
 *  A target may sit a hand's breadth inside a collider (or the mover may have
 *  been nudged into one), and a route that gives up there would strand it. */
function nearestFreeCell(grid: PlaceNavGrid, x: number, z: number, rings: number): number {
  const ci = cellOf(grid, x)
  const cj = cellOf(grid, z)
  if (grid.free[ci * grid.n + cj]) return ci * grid.n + cj
  for (let r = 1; r <= rings; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= grid.n || j >= grid.n) continue
        if (grid.free[i * grid.n + j]) return i * grid.n + j
      }
    }
  }
  return -1
}

/**
 * The waypoints from `from` to `to` over free ground, or null when no route
 * exists (the target is walled off, or neither end is near open ground).
 *
 * The search runs from the TARGET outward, so following the parent chain from
 * the start walks forward without a reversal; the returned list holds the
 * corners only — every straight run is collapsed to its end point — and always
 * ends at the true `to`, so the arrival is judged against the real place rather
 * than against a cell centre.
 */
export function findPlaceRoute(
  grid: PlaceNavGrid,
  from: NavPoint,
  to: NavPoint,
  maxRings = 4,
): NavPoint[] | null {
  const n = grid.n
  const startCell = nearestFreeCell(grid, from.x, from.z, maxRings)
  const goalCell = nearestFreeCell(grid, to.x, to.z, maxRings)
  if (startCell < 0 || goalCell < 0) return null
  if (startCell === goalCell) return [{ x: to.x, z: to.z }]

  // Breadth-first from the goal over four-neighbourhoods: no diagonal step, so
  // a route can never squeeze through the diagonal gap between two corners the
  // mover's own circle would not fit through.
  const parent = grid.parent.fill(-1)
  parent[goalCell] = goalCell
  const queue = grid.queue
  let head = 0
  let tail = 0
  queue[tail++] = goalCell
  let found = false
  while (head < tail && !found) {
    const c = queue[head++]
    const i = (c / n) | 0
    const j = c % n
    for (let k = 0; k < 4; k++) {
      const a = i + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const b = j + (k === 2 ? 1 : k === 3 ? -1 : 0)
      if (a < 0 || b < 0 || a >= n || b >= n) continue
      const next = a * n + b
      if (parent[next] >= 0 || !grid.free[next]) continue
      parent[next] = c
      if (next === startCell) {
        found = true
        break
      }
      queue[tail++] = next
    }
  }
  if (!found) return null

  // Forward along the parent chain, then straightened: keep a corner only where
  // the line from the last kept point to the one after it is blocked.
  const cells: NavPoint[] = []
  for (let c = startCell; c !== goalCell; c = parent[c]) {
    cells.push({ x: worldOf(grid, (c / n) | 0), z: worldOf(grid, c % n) })
  }
  cells.push({ x: to.x, z: to.z })
  const route: NavPoint[] = []
  let anchor = { x: from.x, z: from.z }
  for (let i = 1; i < cells.length; i++) {
    if (navClearBetween(grid, anchor.x, anchor.z, cells[i].x, cells[i].z)) continue
    anchor = cells[i - 1]
    route.push(anchor)
  }
  route.push({ x: to.x, z: to.z })
  return route
}
