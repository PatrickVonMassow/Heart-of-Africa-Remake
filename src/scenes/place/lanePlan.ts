// Lane-spine primitives for the settlement layout (design.md §2.6/§4.5):
// ports grow an organic lane network (winding alleys, small irregular
// squares — no rectangular grid) and buildings are placed FROM the lanes —
// fronting them with their door side — instead of on independent offsets.
// Pure math, shared by the generator and the layout tests.

export interface LanePoint {
  x: number
  z: number
}

/** Squared distance from a point to a segment, plus the closest point. */
function closestOnSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  x: number,
  z: number,
): { x: number; z: number; d2: number } {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
  const px = ax + dx * t
  const pz = az + dz * t
  return { x: px, z: pz, d2: (x - px) * (x - px) + (z - pz) * (z - pz) }
}

/** Closest point on a polyline, the distance to it and its segment index. */
export function closestOnPolyline(
  points: Array<[number, number]>,
  x: number,
  z: number,
): { x: number; z: number; dist: number; segIndex: number } {
  let best = { x: points[0][0], z: points[0][1], d2: Infinity }
  let segIndex = 0
  for (let i = 0; i + 1 < points.length; i++) {
    const c = closestOnSegment(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], x, z)
    if (c.d2 < best.d2) {
      best = c
      segIndex = i
    }
  }
  return { x: best.x, z: best.z, dist: Math.sqrt(best.d2), segIndex }
}

/**
 * Bend a lane polyline around solid obstacles: vertices inside an obstacle's
 * clearance circle are pushed radially out, and a segment still crossing the
 * circle gets a bent point inserted at its closest approach. Keeps lanes off
 * buildings while staying organic (design.md §2.6).
 */
export function bendAround(
  points: Array<[number, number]>,
  obstacles: Array<{ x: number; z: number; r: number }>,
  clearance: number,
): Array<[number, number]> {
  let pts = points.map(([x, z]) => [x, z] as [number, number])
  for (const o of obstacles) {
    const limit = o.r + clearance
    pts = pts.map(([x, z]) => {
      const d = Math.hypot(x - o.x, z - o.z)
      if (d >= limit) return [x, z] as [number, number]
      const nx = d > 1e-6 ? (x - o.x) / d : 1
      const nz = d > 1e-6 ? (z - o.z) / d : 0
      return [o.x + nx * limit, o.z + nz * limit] as [number, number]
    })
    // Inserting a bent point creates two new chords that may still cut the
    // circle — iterate until the whole polyline clears it.
    for (let guard = 0; guard < 6; guard++) {
      const c = closestOnPolyline(pts, o.x, o.z)
      if (c.dist >= limit - 0.05) break
      const nx = c.dist > 1e-6 ? (c.x - o.x) / c.dist : 1
      const nz = c.dist > 1e-6 ? (c.z - o.z) / c.dist : 0
      pts.splice(c.segIndex + 1, 0, [o.x + nx * limit, o.z + nz * limit])
    }
  }
  return pts
}

/** Distance from a point to the nearest lane centreline of a set. */
export function distToLanes(
  lanes: Array<{ points: Array<[number, number]>; width: number }>,
  x: number,
  z: number,
): number {
  let best = Infinity
  for (const lane of lanes) {
    const d = closestOnPolyline(lane.points, x, z).dist
    if (d < best) best = d
  }
  return best
}

/**
 * An organically winding polyline from `from` to `to`: intermediate points
 * on the straight line, each pushed sideways by a bounded random sway. The
 * endpoints stay exact so junctions meet.
 */
export function windingPoints(
  rand: () => number,
  from: [number, number],
  to: [number, number],
  sway: number,
  steps = 4,
): Array<[number, number]> {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz) || 1
  const nx = -dz / len
  const nz = dx / len
  const points: Array<[number, number]> = [from]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    // Sway fades toward both ends so junction geometry stays predictable.
    const fade = Math.sin(t * Math.PI)
    const s = (rand() * 2 - 1) * sway * fade
    points.push([from[0] + dx * t + nx * s, from[1] + dz * t + nz * s])
  }
  points.push(to)
  return points
}

export interface LaneSlot {
  x: number
  z: number
  /** Yaw so a door on local +Z faces the lane's centreline. */
  faceRot: number
  /** Closest point on the lane centreline (the door's lane anchor). */
  anchor: [number, number]
}

/**
 * Building slots flanking a lane: sampled every `spacing` metres along the
 * polyline, offset sideways by `offset` on both sides. The slot's faceRot
 * turns a local-+Z door toward the lane, so every building fronts it.
 */
export function laneSlots(
  points: Array<[number, number]>,
  spacing: number,
  offset: number,
): LaneSlot[] {
  const slots: LaneSlot[] = []
  let carry = spacing * 0.5
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i]
    const [bx, bz] = points[i + 1]
    const segLen = Math.hypot(bx - ax, bz - az)
    if (segLen === 0) continue
    const dirX = (bx - ax) / segLen
    const dirZ = (bz - az) / segLen
    const nx = -dirZ
    const nz = dirX
    for (let s = carry; s <= segLen; s += spacing) {
      const px = ax + dirX * s
      const pz = az + dirZ * s
      for (const side of [1, -1]) {
        const x = px + nx * offset * side
        const z = pz + nz * offset * side
        slots.push({ x, z, faceRot: Math.atan2(px - x, pz - z), anchor: [px, pz] })
      }
    }
    carry = ((carry - segLen) % spacing + spacing) % spacing
  }
  return slots
}
