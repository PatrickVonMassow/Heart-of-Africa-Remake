// Circle-based 2D collision for the first-person places (design.md §2
// "Belebte, dicht bebaute Orte": buildings and solid props are impenetrable
// for the player and the inhabitants). Every solid object is approximated by
// one or more circles in the XZ plane; rectangular buildings become a row of
// circles along their long axis (capsule approximation). Resolution pushes
// the mover out along the contact normal, which yields natural sliding.

export interface Collider {
  x: number
  z: number
  r: number
}

/**
 * Approximate a rotated rectangle (half extents hx/hz, yaw rot) with circles
 * spaced along its longer local axis.
 */
export function boxColliders(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  rot: number,
  margin = 0.15,
): Collider[] {
  const long = Math.max(hx, hz)
  const short = Math.min(hx, hz)
  const r = short + margin
  const n = Math.max(1, Math.ceil(long / short) )
  // Circle centers span the long axis so the union covers the box ends.
  const span = Math.max(0, long - short)
  const axisIsX = hx >= hz
  const sin = Math.sin(rot)
  const cos = Math.cos(rot)
  const out: Collider[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1 // -1..1
    const lx = axisIsX ? t * span : 0
    const lz = axisIsX ? 0 : t * span
    // Local → world with the object's yaw (matches group rotation.y).
    out.push({ x: cx + cos * lx + sin * lz, z: cz - sin * lx + cos * lz, r })
  }
  return out
}

/**
 * Move a circle of radius `radius` from its current position to the target,
 * resolving overlaps with the colliders (two iterations handle corners).
 * Returns the resolved position.
 */
export function resolveMove(
  colliders: Collider[],
  x: number,
  z: number,
  radius: number,
): [number, number] {
  let px = x
  let pz = z
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = px - c.x
      const dz = pz - c.z
      const min = c.r + radius
      const d2 = dx * dx + dz * dz
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2)
      if (d < 1e-4) {
        // Dead center: push toward the place origin to stay deterministic.
        const ox = px === 0 && pz === 0 ? 1 : px
        const oz = pz
        const len = Math.hypot(ox, oz) || 1
        px = c.x + (ox / len) * min
        pz = c.z + (oz / len) * min
      } else {
        px = c.x + (dx / d) * min
        pz = c.z + (dz / d) * min
      }
    }
  }
  return [px, pz]
}
