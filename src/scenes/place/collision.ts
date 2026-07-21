// 2D collision for the first-person places (design.md §2 "Lively, densely
// built settlements": buildings and solid props are impenetrable for the
// player and the inhabitants). Round objects are circles in the XZ plane;
// rectangular buildings are oriented boxes (OBB) so that their corners are
// covered exactly — the former circle approximation left gaps at the corners
// through which the camera could clip into the walls. Resolution pushes the
// mover out along the contact normal, which yields natural sliding.

export interface CircleCollider {
  kind?: 'circle'
  x: number
  z: number
  r: number
}

export interface BoxCollider {
  kind: 'box'
  x: number
  z: number
  /** Half extents in the box's local frame (margin included). */
  hx: number
  hz: number
  /** Yaw, matching the building group's rotation.y. */
  rot: number
}

export type Collider = CircleCollider | BoxCollider

/**
 * Oriented-box collider for a rotated rectangle (half extents hx/hz, yaw
 * rot). The margin keeps the camera's near plane out of the wall faces.
 */
export function boxCollider(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  rot: number,
  margin = 0.15,
): Collider {
  return { kind: 'box', x: cx, z: cz, hx: hx + margin, hz: hz + margin, rot }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** Push a mover circle out of one collider; returns the corrected position. */
function pushOut(c: Collider, px: number, pz: number, radius: number): [number, number] {
  if (c.kind === 'box') {
    const sin = Math.sin(c.rot)
    const cos = Math.cos(c.rot)
    // World → box-local (inverse of the group yaw used in boxCollider).
    const dx = px - c.x
    const dz = pz - c.z
    const lx = cos * dx - sin * dz
    const lz = sin * dx + cos * dz
    const qx = clamp(lx, -c.hx, c.hx)
    const qz = clamp(lz, -c.hz, c.hz)
    let ox = lx
    let oz = lz
    if (qx === lx && qz === lz) {
      // Center inside the box: exit along the smallest penetration axis.
      const penX = c.hx - Math.abs(lx)
      const penZ = c.hz - Math.abs(lz)
      if (penX <= penZ) ox = (lx >= 0 ? 1 : -1) * (c.hx + radius)
      else oz = (lz >= 0 ? 1 : -1) * (c.hz + radius)
    } else {
      const ddx = lx - qx
      const ddz = lz - qz
      const d = Math.hypot(ddx, ddz)
      if (d >= radius) return [px, pz]
      if (d < 1e-4) {
        // Exactly on the surface: push along the dominant face normal.
        if (Math.abs(qx) === c.hx && Math.abs(lx) >= Math.abs(lz)) ox = (lx >= 0 ? 1 : -1) * (c.hx + radius)
        else oz = (lz >= 0 ? 1 : -1) * (c.hz + radius)
      } else {
        ox = qx + (ddx / d) * radius
        oz = qz + (ddz / d) * radius
      }
    }
    // Box-local → world.
    return [c.x + cos * ox + sin * oz, c.z - sin * ox + cos * oz]
  }

  const dx = px - c.x
  const dz = pz - c.z
  const min = c.r + radius
  const d2 = dx * dx + dz * dz
  if (d2 >= min * min) return [px, pz]
  const d = Math.sqrt(d2)
  if (d < 1e-4) {
    // Dead center: push toward the place origin to stay deterministic.
    const ox = px === 0 && pz === 0 ? 1 : px
    const oz = pz
    const len = Math.hypot(ox, oz) || 1
    return [c.x + (ox / len) * min, c.z + (oz / len) * min]
  }
  return [c.x + (dx / d) * min, c.z + (dz / d) * min]
}

/**
 * Move a circle of radius `radius` to the target position, resolving
 * overlaps with the colliders. Iterates until no collider pushes anymore
 * (corners between neighboring or even overlapping objects), capped to
 * keep the per-frame cost bounded.
 */
export function resolveMove(
  colliders: Collider[],
  x: number,
  z: number,
  radius: number,
): [number, number] {
  let px = x
  let pz = z
  for (let pass = 0; pass < 10; pass++) {
    let moved = false
    for (const c of colliders) {
      const [nx, nz] = pushOut(c, px, pz, radius)
      if (nx !== px || nz !== pz) moved = true
      px = nx
      pz = nz
    }
    if (!moved) break
  }
  return [px, pz]
}

// --- Spawn freedom (point 155) ----------------------------------------------
// The default collision radius of a settlement inhabitant. Shared so the
// layout builder and PlaceLife validate spawn/errand points against the SAME
// footprint the walkers move with.
export const WALKER_RADIUS = 0.3
/** Directions probed for an escape / spiral samples on the innermost ring. */
const ESCAPE_DIRECTIONS = 12

/** True if a mover circle of `radius` at (x,z) overlaps this collider. */
function overlaps(c: Collider, x: number, z: number, radius: number): boolean {
  const [nx, nz] = pushOut(c, x, z, radius)
  return nx !== x || nz !== z
}

/** The standing circle is clear: no collider overlaps a mover of `radius`
 *  standing at (x,z) — it fits there (point 155). */
export function standingClear(colliders: Collider[], x: number, z: number, radius: number): boolean {
  for (const c of colliders) if (overlaps(c, x, z, radius)) return false
  return true
}

/** At least one step of length `step` off (x,z) lands on clear ground: the
 *  spot is not a fully enclosed pocket the mover cannot leave (point 155). */
export function hasEscapeDirection(
  colliders: Collider[],
  x: number,
  z: number,
  radius: number,
  step: number,
): boolean {
  for (let i = 0; i < ESCAPE_DIRECTIONS; i++) {
    const a = (i / ESCAPE_DIRECTIONS) * Math.PI * 2
    if (standingClear(colliders, x + Math.cos(a) * step, z + Math.sin(a) * step, radius)) return true
  }
  return false
}

/** A spawn/target point is usable only if the mover FITS there AND can LEAVE
 *  (point 155): a clear standing circle plus one open escape direction against
 *  the full collider set — stall boards and rocks included. */
export function spawnPointFree(
  colliders: Collider[],
  x: number,
  z: number,
  radius: number,
  step: number = radius * 2,
): boolean {
  return standingClear(colliders, x, z, radius) && hasEscapeDirection(colliders, x, z, radius, step)
}

/** Nearest usable spawn point to (x,z), with whether one was actually FOUND
 *  (point 198): if the point is already free, keep it; otherwise spiral outward
 *  over rings (deterministic ring/angle order) until one is free (point 155).
 *  When none is found within `maxRings`, `found` is false and the position falls
 *  back to the original — so a caller can tell "relocated / already free" from
 *  "gave up" instead of resetting an unstuck counter over a walker that never
 *  moved (the pinned-forever bug). */
export function tryNudgeToFree(
  colliders: Collider[],
  x: number,
  z: number,
  radius: number,
  step: number = radius * 2,
  maxRings = 12,
): { pos: [number, number]; found: boolean } {
  if (spawnPointFree(colliders, x, z, radius, step)) return { pos: [x, z], found: true }
  for (let ring = 1; ring <= maxRings; ring++) {
    const rr = ring * step
    const n = ESCAPE_DIRECTIONS * ring // denser sampling on the larger rings
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const px = x + Math.cos(a) * rr
      const pz = z + Math.sin(a) * rr
      if (spawnPointFree(colliders, px, pz, radius, step)) return { pos: [px, pz], found: true }
    }
  }
  return { pos: [x, z], found: false }
}

/** Nearest usable spawn point to (x,z), position only (point 155). Thin wrapper
 *  over `tryNudgeToFree` for callers that only need the point (the layout
 *  builder). Falls back to the original point if none is found. */
export function nudgeToFree(
  colliders: Collider[],
  x: number,
  z: number,
  radius: number,
  step: number = radius * 2,
  maxRings = 12,
): [number, number] {
  return tryNudgeToFree(colliders, x, z, radius, step, maxRings).pos
}
