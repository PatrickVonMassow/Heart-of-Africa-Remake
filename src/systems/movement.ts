// Movement penalties (design.md §11): terrain that slows travel unless the
// matching item is carried in the pack. Kept pure so the HUD can surface the
// reason and the verification can assert it. The hint names the terrain and the
// item that would relieve the slowdown.

import type { EquipmentId } from '../state/store'
import type { TerrainType } from '../world/terrain'

export type MovementPenalty = 'jungle' | 'water' | 'mountain' | 'canoeOnLand' | null

type Inventory = Partial<Record<EquipmentId, number>>
const has = (eq: Inventory, id: EquipmentId) => (eq[id] ?? 0) > 0

/**
 * The active terrain slowdown for the current inventory, or null when nothing
 * slows the traveller here (design.md §11). Effects follow item *possession*
 * (nothing is "held in hand"): dense jungle without a machete, open/enclosed water
 * without a canoe, and steep mountain rock without a rope each slow the
 * traveller; and carrying the canoe slows land travel (its only relevance is
 * possession, so it is a permanent land handicap).
 */
export function movementPenalty(terrain: TerrainType, equipment: Inventory): MovementPenalty {
  if (terrain === 'jungle' && !has(equipment, 'machete')) return 'jungle'
  if ((terrain === 'water' || terrain === 'ocean') && !has(equipment, 'canoe')) return 'water'
  if (terrain === 'mountain' && !has(equipment, 'rope')) return 'mountain'
  // On ANY land the canoe is dead weight and slows the traveller (design.md §11);
  // shown after the more urgent missing-relief-item hints above.
  if (terrain !== 'water' && terrain !== 'ocean' && has(equipment, 'canoe')) return 'canoeOnLand'
  return null
}

/**
 * Local walk velocity inside settlements (design.md §2): strafing and walking
 * backward move at `strafeFactor` of the forward speed. Input is normalized
 * first so a diagonal is never faster than a single axis. Returns
 * `[alongFacing, sideways]` speed components (before rotation by the yaw);
 * `alongFacing` is positive walking forward (local -Z), `sideways` positive
 * to the right (local +X).
 */
export function placeWalkVelocity(
  forward: number,
  strafe: number,
  speed: number,
  strafeFactor: number,
): [number, number] {
  const len = Math.hypot(forward, strafe)
  if (len === 0) return [0, 0]
  const nf = forward / len
  const ns = strafe / len
  return [nf * speed * (nf >= 0 ? 1 : strafeFactor), ns * speed * strafeFactor]
}

/**
 * Push a point clear of every overlapping obstacle circle (design.md §19): given
 * obstacles as `[x, z, radius]`, returns the `[x, z]` moved just outside each
 * overlap with a body of `selfR`. Used so the bird's-eye traveller collides with
 * trees and animals — sliding along them instead of walking through. Coincident
 * points get a fixed +x nudge so the divide-by-zero case still parts.
 */
export function pushOutOfCircles(
  x: number,
  z: number,
  obstacles: ReadonlyArray<readonly [number, number, number]>,
  selfR: number,
): [number, number] {
  let nx = x
  let nz = z
  for (const [ox, oz, orr] of obstacles) {
    const dx = nx - ox
    const dz = nz - oz
    const d = Math.hypot(dx, dz)
    const minD = orr + selfR
    if (d >= minD) continue
    if (d < 1e-5) {
      nx += minD
      continue
    }
    const push = minD - d
    nx += (dx / d) * push
    nz += (dz / d) * push
  }
  return [nx, nz]
}

/**
 * Resolve a bird's-eye move from `(ox,oz)` to `(nx,nz)` against obstacle circles
 * `[x, z, radius]` for a body of `selfR` (design.md §19): the traveller collides
 * with trees and animals instead of walking through them. For an obstacle the
 * path *enters* this frame the move is clamped to the near boundary (a swept
 * test, so a fast step cannot tunnel through and pop out the far side); an
 * obstacle already overlapped at the start is pushed straight out. Returns the
 * resolved `[x, z]`.
 */
export function resolveTravelMove(
  ox: number,
  oz: number,
  nx: number,
  nz: number,
  obstacles: ReadonlyArray<readonly [number, number, number]>,
  selfR: number,
): [number, number] {
  let cx = nx
  let cz = nz
  for (const [obx, obz, r] of obstacles) {
    const minD = r + selfR
    // Sweep origin = the frame's start, pushed out to the boundary if it began
    // inside (float drift, or an animal that moved onto the traveller). Sweeping
    // from a point on the near side guarantees the destination is only ever
    // clamped to the near boundary — a fast step can never tunnel out the far
    // side, and a barely-inside start can never be flung across.
    let sx = ox
    let sz = oz
    let vsx = ox - obx
    let vsz = oz - obz
    let ds = Math.hypot(vsx, vsz)
    if (ds < minD) {
      if (ds < 1e-5) {
        sx = obx + minD
        sz = obz
      } else {
        sx = obx + (vsx / ds) * minD
        sz = obz + (vsz / ds) * minD
      }
      vsx = sx - obx
      vsz = sz - obz
      ds = minD
    }
    const mx = cx - sx
    const mz = cz - sz
    const a = mx * mx + mz * mz
    if (a < 1e-12) {
      // No travel from the (possibly pushed-out) origin: rest there.
      cx = sx
      cz = sz
      continue
    }
    const b = 2 * (vsx * mx + vsz * mz)
    const c = ds * ds - minD * minD
    const disc = b * b - 4 * a * c
    if (disc <= 1e-12) continue // misses the obstacle, or only grazes tangentially
    const sq = Math.sqrt(disc)
    const tEnter = (-b - sq) / (2 * a)
    const tExit = (-b + sq) / (2 * a)
    // Clamp only a move that genuinely passes *into* the obstacle this step: part
    // of the inside interval lies ahead (tExit > 0) and it is entered before the
    // step ends (tEnter < 1). A move that leads *away* from an obstacle the
    // traveller rests against has its whole inside interval behind the start
    // (tExit ≤ 0) and stays free — without this the resolver pinned the traveller
    // to the boundary and steering died the moment it touched a tree.
    if (tExit > 0 && tEnter < 1) {
      const t = Math.max(0, tEnter)
      const hitx = sx + mx * t
      const hitz = sz + mz * t
      // Clamp to the contact (no tunnelling), then SLIDE the leftover move along
      // the obstacle surface instead of killing it (point 113): a hard stop at
      // the contact let two overlapping trees' opposing radial push-outs cancel
      // and pin the traveller in their lens with no way out. Removing only the
      // inward normal component keeps the tangential motion, so he slides free.
      const lx = cx - hitx
      const lz = cz - hitz
      let nnx = hitx - obx
      let nnz = hitz - obz
      const nl = Math.hypot(nnx, nnz) || 1
      nnx /= nl
      nnz /= nl
      const dot = lx * nnx + lz * nnz
      const inward = Math.min(dot, 0) // only the part pushing into the surface
      cx = hitx + (lx - nnx * inward)
      cz = hitz + (lz - nnz * inward)
    }
  }
  // The per-obstacle slide can leave the point a hair inside a DIFFERENT
  // obstacle it slid toward; a final radial de-penetration guarantees the
  // resolved position never rests inside any body (point 113), without undoing
  // the tangential progress that frees an overlapping-obstacle pin. A few
  // iterations settle the point at the mouth of two overlapping bodies (each
  // single pass pushing out of one nudges toward the other).
  for (let i = 0; i < 8; i++) [cx, cz] = pushOutOfCircles(cx, cz, obstacles, selfR)
  return [cx, cz]
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__movement = {
    movementPenalty,
    placeWalkVelocity,
    pushOutOfCircles,
    resolveTravelMove,
  }
}
