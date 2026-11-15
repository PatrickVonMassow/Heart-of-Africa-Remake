// Where the kraal cattle stand and how they stay inside it (work-order 359;
// design.md §19.10). Pure, so the fast test layer pins the promise the point
// makes: every drawn part of every animal stays inside the pen and out of its
// fence, and each animal is a solid body the traveller, the goats and the
// other cattle resolve against.
//
// The hold disk is measured off the REAL collider set rather than the pen's
// nominal radius: a fence panel is a capsule on a chord, so it reaches inside
// the post circle, and the post-pulling of the layout can leave the ring
// uneven. The animal's centre is clamped to the disk whose every point is at
// least `reach + clearance` from any collider surface.

import { VILLAGE_CATTLE } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import type { CircleCollider, Collider } from './collision'

interface Pen {
  x: number
  z: number
  r: number
}

/** Distance from (x, z) to a collider's surface (negative inside it). */
export function surfaceDistance(c: Collider, x: number, z: number): number {
  if (c.kind === 'segment') {
    const dx = c.x2 - c.x1
    const dz = c.z2 - c.z1
    const len2 = dx * dx + dz * dz
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - c.x1) * dx + (z - c.z1) * dz) / len2)) : 0
    return Math.hypot(x - (c.x1 + t * dx), z - (c.z1 + t * dz)) - c.r
  }
  if (c.kind === 'box') {
    const cos = Math.cos(c.rot)
    const sin = Math.sin(c.rot)
    const lx = (x - c.x) * cos - (z - c.z) * sin
    const lz = (x - c.x) * sin + (z - c.z) * cos
    const ox = Math.abs(lx) - c.hx
    const oz = Math.abs(lz) - c.hz
    return Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0)
  }
  return Math.hypot(x - c.x, z - c.z) - c.r
}

/** Whether a collider stands INSIDE the pen (a pot or stone the dressing
 *  dropped there) rather than forming or standing outside its ring. */
export function insidePen(pen: Pen, c: Collider): boolean {
  const [cx, cz] = c.kind === 'segment' ? [(c.x1 + c.x2) / 2, (c.z1 + c.z2) / 2] : [c.x, c.z]
  return Math.hypot(cx - pen.x, cz - pen.z) < pen.r * 0.75
}

/**
 * Radius of the disk about the pen centre a beast's CENTRE may occupy so that
 * its whole body (`reach` from the centre in any direction) keeps `clearance`
 * from the fence and everything outside it. Objects standing inside the pen
 * are left to the mover (`resolveMove` keeps the centre a mover radius off
 * them) — the disk would otherwise collapse round one pot. Zero or negative:
 * no beast fits.
 */
export function cattleHoldRadius(pen: Pen, colliders: readonly Collider[], reach: number, clearance = VILLAGE_CATTLE.fenceClearance): number {
  let free = pen.r
  for (const c of colliders) if (!insidePen(pen, c)) free = Math.min(free, surfaceDistance(c, pen.x, pen.z))
  return free - reach - clearance
}

/** Keep a centre inside the hold disk. */
export function clampToHold(pen: Pen, hold: number, x: number, z: number): [number, number] {
  const dx = x - pen.x
  const dz = z - pen.z
  const d = Math.hypot(dx, dz)
  if (d <= hold || d === 0) return [x, z]
  const k = Math.max(0, hold) / d
  return [pen.x + dx * k, pen.z + dz * k]
}

interface CattleAnchor {
  x: number
  z: number
  yaw: number
  phase: number
}

/**
 * Standing spots for `count` beasts inside the hold disk, each at least two
 * mover radii from the others and a mover radius off any object inside the
 * pen (best effort: a crowded disk takes the farthest
 * candidate found). Seeded and deterministic.
 */
export function cattleAnchors(seed: number, count: number, pen: Pen, hold: number, colliders: readonly Collider[] = []): CattleAnchor[] {
  const rand = mulberry32((seed + 35900) >>> 0)
  const minGap = 2 * VILLAGE_CATTLE.moverRadius
  const out: CattleAnchor[] = []
  const h = Math.max(0, hold)
  for (let i = 0; i < count; i++) {
    let best: [number, number] = [pen.x, pen.z]
    let bestGap = -Infinity
    for (let k = 0; k < 40; k++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * h
      const x = pen.x + Math.cos(a) * r
      const z = pen.z + Math.sin(a) * r
      let gap = out.reduce((m, o) => Math.min(m, Math.hypot(o.x - x, o.z - z)), Infinity)
      // An object inside the pen counts as a herd mate's distance to keep.
      for (const c of colliders) if (insidePen(pen, c)) gap = Math.min(gap, surfaceDistance(c, x, z) + VILLAGE_CATTLE.moverRadius)
      if (gap > bestGap) {
        bestGap = gap
        best = [x, z]
      }
      if (gap >= minGap) break
    }
    out.push({ x: best[0], z: best[1], yaw: rand() * Math.PI * 2, phase: rand() * Math.PI * 2 })
  }
  return out
}

/** The two circles (fore, hind) a beast at (x, z) facing `yaw` presents to
 *  everyone else, written into `out` (reused, no per-frame allocation). The
 *  facing convention is the fauna one: +Z forward at yaw 0. */
export function cattleBodyCircles(x: number, z: number, yaw: number, out: [CircleCollider, CircleCollider]): [CircleCollider, CircleCollider] {
  const off = VILLAGE_CATTLE.bodyCircleOffset
  const r = VILLAGE_CATTLE.bodyCircleRadius
  const fx = Math.sin(yaw) * off
  const fz = Math.cos(yaw) * off
  out[0].x = x + fx
  out[0].z = z + fz
  out[0].r = r
  out[1].x = x - fx
  out[1].z = z - fz
  out[1].r = r
  return out
}

/**
 * The kraal cattle's bodies the traveller resolves against this frame (written
 * by the cattle component while it is mounted, emptied when it goes) — the
 * same shape as the fishers' `fisheryLiveColliders`.
 */
export const cattleLiveColliders: Collider[] = []

/** The settlement's collider set with the standing cattle added, if any. */
export function withCattleBodies(colliders: Collider[]): Collider[] {
  return cattleLiveColliders.length ? [...colliders, ...cattleLiveColliders] : colliders
}
