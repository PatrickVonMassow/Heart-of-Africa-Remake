// THE PLAY GROUND NEVER DEAD-ENDS (work-order point 657).
//
// The children's chase steers by a blocked() of the static settlement, and
// wherever two of its boundaries CONVERGE, the ground between them narrows
// into a slot that is statically free and practically a trap. Measured at the
// reported seed, the bambara ground carries a 0.76 m channel between two hut
// clearance circles, pinching to zero where the circles meet, and a corridor
// against the play-ground rim that a rim-straddling hut closes to nothing:
// every live red window of the point-657 measurement sat in one of the two —
// single evaders pacing the pinch, and whole groups herding into the corridor
// and compressing there. Steering remedies were measured first and rejected
// one after another (the work-order records four; this branch measured five
// more): a rule strong enough to keep a child out of a wedge also bends the
// game everywhere there is no wedge.
//
// So the GROUND gives the wedge up: any point that lies BETWEEN two boundaries
// that pinch below a real passage is carved out of the walkable ground. The
// carve is analytic — no grid, no flood fill: an earlier grid mask carved the
// narrow-but-passable ribbons this maze-like ground legitimately uses and its
// connectivity pass then severed half the play ground. Here only the ground
// between OPPOSING boundaries goes: the between-ness test (the two nearest
// boundary points lie on roughly opposite sides) is what keeps the carve out
// of the ground beside a fence joint, where two panels almost touch but form a
// wall, not a slot. Because the pinch narrows monotonically toward its tip,
// everything past the carve line is carved with it — no sealed free pocket is
// left for a rescue teleport to drop a child into.

import type { Collider } from './collision'

/** The narrowest corridor the carve keeps, in metres — four child radii: two
 *  bodies abreast, room to turn round or pass. Measured on the reported
 *  ground: the slots that trapped children are 0.76 and 0.89 m wide, the
 *  passages a healthy game really uses 1.36 and 1.61 m — the bar sits between
 *  the families, nearer the traps. */
export const WEDGE_PASSAGE = 1.2

/** How opposed the two nearest-boundary directions must be for the point to
 *  count as BETWEEN the pair (cosine): −0.2 admits corridors whose walls are
 *  up to ~101° from anti-parallel, and refuses the near-parallel directions a
 *  point beside two joined fence panels sees. */
const OPPOSED_DOT = -0.2

interface Probe {
  /** Distance from the point to this boundary (0 at the surface), and the
   *  unit direction from the point TOWARD its nearest boundary point. */
  d: number
  nx: number
  nz: number
}

/** One boundary the carve knows: a collider (probed from outside) or the play
 *  ground's own circle (probed from inside). */
type Boundary = (x: number, z: number) => Probe

function circleBoundary(cx: number, cz: number, r: number): Boundary {
  return (x, z) => {
    const dx = cx - x
    const dz = cz - z
    const len = Math.hypot(dx, dz)
    const d = len - r
    return len < 1e-9 ? { d, nx: 1, nz: 0 } : { d, nx: dx / len, nz: dz / len }
  }
}

function segmentBoundary(x1: number, z1: number, x2: number, z2: number, r: number): Boundary {
  const sx = x2 - x1
  const sz = z2 - z1
  const len2 = sx * sx + sz * sz
  return (x, z) => {
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - x1) * sx + (z - z1) * sz) / len2))
    const px = x1 + sx * t
    const pz = z1 + sz * t
    const dx = px - x
    const dz = pz - z
    const len = Math.hypot(dx, dz)
    const d = len - r
    return len < 1e-9 ? { d, nx: 1, nz: 0 } : { d, nx: dx / len, nz: dz / len }
  }
}

function boxBoundary(bx: number, bz: number, hx: number, hz: number, rot: number): Boundary {
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  return (x, z) => {
    // Into the box's local frame, clamp to the rectangle, and back out.
    const dx = x - bx
    const dz = z - bz
    const lx = dx * cos + dz * sin
    const lz = -dx * sin + dz * cos
    const qx = Math.max(-hx, Math.min(hx, lx))
    const qz = Math.max(-hz, Math.min(hz, lz))
    const wx = bx + qx * cos - qz * sin
    const wz = bz + qx * sin + qz * cos
    const ex = wx - x
    const ez = wz - z
    const len = Math.hypot(ex, ez)
    // Inside the box the clamp is the point itself; the wedge test only cares
    // about free ground, so a zero direction is fine there.
    return len < 1e-9 ? { d: 0, nx: 1, nz: 0 } : { d: len, nx: ex / len, nz: ez / len }
  }
}

/** The play ground's own circle, seen from inside. */
function groundBoundary(cx: number, cz: number, radius: number): Boundary {
  return (x, z) => {
    const dx = x - cx
    const dz = z - cz
    const len = Math.hypot(dx, dz)
    const d = radius - len
    // At the exact centre every outward direction is the same distance away.
    return len < 1e-9 ? { d, nx: 1, nz: 0 } : { d, nx: dx / len, nz: dz / len }
  }
}

/** A collider as a carve boundary, its surface pushed out by the mover's own
 *  radius so the distances speak of where a BODY can stand. */
function colliderBoundary(c: Collider, margin: number): Boundary {
  if (c.kind === 'segment') return segmentBoundary(c.x1, c.z1, c.x2, c.z2, c.r + margin)
  if (c.kind === 'box') return boxBoundary(c.x, c.z, c.hx + margin, c.hz + margin, c.rot)
  return circleBoundary(c.x, c.z, c.r + margin)
}

/** The rough centre and reach of a collider, for the cheap pair preselection. */
function bounds(c: Collider): { x: number; z: number; reach: number } {
  if (c.kind === 'segment') {
    return {
      x: (c.x1 + c.x2) / 2,
      z: (c.z1 + c.z2) / 2,
      reach: Math.hypot(c.x2 - c.x1, c.z2 - c.z1) / 2 + c.r,
    }
  }
  if (c.kind === 'box') return { x: c.x, z: c.z, reach: Math.hypot(c.hx, c.hz) }
  return { x: c.x, z: c.z, reach: c.r }
}

/**
 * Build the wedge carve for one play ground: `carved(x, z)` answers beside the
 * static blocked(), true where the point stands in a sub-passage slot between
 * two boundaries. Only pairs that can pinch at all — their closest approach
 * under `passage` — are kept, so the per-probe cost is a handful of distance
 * evaluations.
 */
export function buildWedgeCarve(
  colliders: readonly Collider[],
  moverRadius: number,
  ground: { x: number; z: number; radius: number },
  passage = WEDGE_PASSAGE,
): (x: number, z: number) => boolean {
  const reach = ground.radius + passage
  // The boundaries that matter: colliders near the ground, plus its own rim.
  const near = colliders.filter((c) => {
    const b = bounds(c)
    return Math.hypot(b.x - ground.x, b.z - ground.z) <= reach + b.reach + moverRadius
  })
  const rim = groundBoundary(ground.x, ground.z, ground.radius)
  const items = near.map((c) => ({
    boundary: colliderBoundary(c, moverRadius),
    ...bounds(c),
  }))
  // Candidate pairs by closest approach: collider-collider, collider-rim.
  const pairs: Array<[Boundary, Boundary]> = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const gap =
        Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z) -
        items[i].reach -
        items[j].reach -
        2 * moverRadius
      if (gap < passage) pairs.push([items[i].boundary, items[j].boundary])
    }
    const inward = ground.radius - Math.hypot(items[i].x - ground.x, items[i].z - ground.z)
    // The collider pinches the rim when its clearance band comes within a
    // passage of it — from inside or straddling.
    if (inward - items[i].reach - moverRadius < passage) pairs.push([items[i].boundary, rim])
  }
  return (x: number, z: number): boolean => {
    for (const [a, b] of pairs) {
      const pa = a(x, z)
      if (pa.d < 0 || pa.d >= passage) continue
      const pb = b(x, z)
      if (pb.d < 0 || pb.d >= passage) continue
      if (pa.d + pb.d >= passage) continue
      if (pa.nx * pb.nx + pa.nz * pb.nz < OPPOSED_DOT) return true
    }
    return false
  }
}
