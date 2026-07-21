// Dragged-canoe pose on land (design.md §7/§11): the hull trails the walking
// explorer like a trailer — a rope-constrained trail point that swings around
// obstacles — and lies ON the terrain: pitched along the drag direction from
// the hand grip down to where its far end rests on the sampled ground, with a
// slight roll on cross-slopes. Pure functions so the full behaviour matrix
// (slopes, dunes, stones, animals, village edges) is unit-testable.

import { pushOutOfCircles } from '../../systems/movement'

export interface TrailPoint {
  x: number
  z: number
}

/** Player → hull far end (the dragged tip resting on the ground). */
export const CANOE_TRAIL_FAR = 2.4
/** Player → hull centre (where the mesh group sits). */
const CANOE_TRAIL_CENTRE = 1.35
/** Height of the hand grip holding the hull's near end. */
export const CANOE_GRIP_HEIGHT = 0.5
/** The resting far end's centre line sits this far above the ground. */
export const CANOE_REST_LIFT = 0.15
/** Grip → far end along the hull axis. */
export const CANOE_DRAG_LEN = 2.13
/** Collision radius of the dragged far end. */
export const CANOE_END_RADIUS = 0.4
/** Pitch clamp: never bury an end in a rise nor flip over a dip. */
export const CANOE_PITCH_MIN = -0.65
export const CANOE_PITCH_MAX = 0.5
/** Roll clamp on cross-slopes. */
export const CANOE_ROLL_MAX = 0.35

/**
 * Advance the trail point: keep it on the drag rope (fixed distance behind
 * the player, following the walked path like a trailer), then push it clear
 * of obstacle circles `[x, z, r]` — a stone, a tree, an animal or a
 * settlement edge swings the hull aside instead of being clipped through.
 * A water predicate (the rendered river/lake sheet plus ocean) is applied
 * LAST and wins: a hull dragged on land must never pierce the water surface
 * at a bank (design.md §7 — on land he drags it; user-reported clipping).
 * The rope rotates to the nearest land at full length; on a spit too narrow
 * for that, it shortens toward the land-standing player instead.
 */
export function updateTrailPoint(
  px: number,
  pz: number,
  prev: TrailPoint | null,
  heading: number,
  obstacles: ReadonlyArray<readonly [number, number, number]>,
  isWater?: (x: number, z: number) => boolean,
): TrailPoint {
  let dx: number
  let dz: number
  if (prev) {
    dx = prev.x - px
    dz = prev.z - pz
  } else {
    dx = -Math.sin(heading)
    dz = -Math.cos(heading)
  }
  let d = Math.hypot(dx, dz)
  if (d < 1e-5) {
    dx = -Math.sin(heading)
    dz = -Math.cos(heading)
    d = 1
  }
  let tx = px + (dx / d) * CANOE_TRAIL_FAR
  let tz = pz + (dz / d) * CANOE_TRAIL_FAR
  ;[tx, tz] = pushOutOfCircles(tx, tz, obstacles, CANOE_END_RADIUS)
  if (isWater && isWater(tx, tz)) {
    const baseA = Math.atan2(tx - px, tz - pz)
    let found = false
    // Nearest rotation first, alternating sides, up to ±120° — continuity
    // with the current rope angle keeps the swing visually smooth.
    for (let step = 1; step <= 12 && !found; step++) {
      for (const sgn of [1, -1]) {
        const a = baseA + sgn * step * (Math.PI / 18)
        const cx = px + Math.sin(a) * CANOE_TRAIL_FAR
        const cz = pz + Math.cos(a) * CANOE_TRAIL_FAR
        if (!isWater(cx, cz)) {
          tx = cx
          tz = cz
          found = true
          break
        }
      }
    }
    if (!found) {
      // Spit narrower than the rope: pull the hull in toward the player,
      // who stands on land by definition while dragging.
      for (let f = 0.85; f >= 0.25; f -= 0.1) {
        const cx = px + Math.sin(baseA) * CANOE_TRAIL_FAR * f
        const cz = pz + Math.cos(baseA) * CANOE_TRAIL_FAR * f
        if (!isWater(cx, cz)) {
          tx = cx
          tz = cz
          found = true
          break
        }
      }
    }
    if (!found) {
      // Water on every side even at the shortest rope (a razor-thin peninsula):
      // rest the hull on the player's OWN tile — the player stands on land while
      // dragging, so this is the one point guaranteed dry, and the invariant "a
      // dragged hull never pierces the water surface" holds by construction.
      tx = px
      tz = pz
    }
  }
  return { x: tx, z: tz }
}

export interface DragPose {
  /** Group yaw: the hull's local -Z axis points at the trail point. */
  yaw: number
  /** Pitch: negative lowers the trailing end (rotation about local X). */
  pitch: number
  /** Roll from the cross-slope under the trailing end. */
  roll: number
  /** Hull-centre height relative to the player root. */
  centreY: number
  /** Hull-centre offset from the player (world XZ). */
  centreX: number
  centreZ: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Pose the dragged hull between the hand grip and the ground at the trail
 * point. Heights are world Y; `rootY` is the player root height (the ground
 * under the player), `groundAtTrail` the ground under the far end,
 * `groundLeft/Right` sampled beside it for the roll.
 */
export function canoeDragPose(
  px: number,
  pz: number,
  rootY: number,
  trail: TrailPoint,
  groundAtTrail: number,
  groundLeft: number,
  groundRight: number,
): DragPose {
  const yawT = Math.atan2(trail.x - px, trail.z - pz)
  const hFarRel = Math.max(0, groundAtTrail) - rootY
  const drop = CANOE_GRIP_HEIGHT - (hFarRel + CANOE_REST_LIFT)
  const pitch = clamp(-Math.atan2(drop, CANOE_DRAG_LEN), CANOE_PITCH_MIN, CANOE_PITCH_MAX)
  const roll = clamp(Math.atan2(groundLeft - groundRight, 1.4) * 0.8, -CANOE_ROLL_MAX, CANOE_ROLL_MAX)
  // The far end may legitimately sit below the player root (a dip behind);
  // the pitch clamp alone bounds the pose. centreY is the midpoint of the grip
  // and the far-end ground. When the pitch CLAMP binds (point 199) this midpoint
  // no longer matches the clamped hull line, so the near end drifts a little off
  // the grip — but only beyond a ~40-43° drop directly behind the player (where
  // the natural pitch exceeds ±CANOE_PITCH_MIN/MAX), a rare, momentary
  // steep-slope case, and only ~0.16 m at the threshold; at every reachable drag
  // slope below that the pitch is unclamped and there is no clamp-induced drift.
  // The pose is an accepted approximation regardless (CANOE_TRAIL_CENTRE 1.35 !=
  // the half hull 1.065, so the near end never sits exactly at the grip), so a
  // full pin-the-near-end re-derivation is not worth re-tuning the whole
  // screenshot-accepted pose for this corner (point 199, verified & rejected).
  const centreY = (CANOE_GRIP_HEIGHT + hFarRel + CANOE_REST_LIFT) / 2
  return {
    yaw: yawT + Math.PI,
    pitch,
    roll,
    centreY,
    centreX: Math.sin(yawT) * CANOE_TRAIL_CENTRE,
    centreZ: Math.cos(yawT) * CANOE_TRAIL_CENTRE,
  }
}
