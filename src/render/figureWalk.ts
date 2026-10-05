// How a settlement villager walks, kneels and carries a head load (work-order
// "walking villagers"): pure functions over the skinned body's proportions,
// written onto the bones by scenes/place/skinnedFigure.tsx.
//
// THE WALK is the fauna's mechanism (render/fauna.ts, points 228/300): a phase
// driven by the DISTANCE walked, legs in counter-phase, each foot planted for
// half the cycle. What differs is the leg: a human leg is jointed, so each foot
// is PLACED by two-bone IK at its target on the ground and the hips sit at the
// height the planted leg reaches — the stance foot cannot slide or hover, and
// the hips rise and fall by themselves. The phase advances π/(2·reach) per unit
// walked, which is exactly the rate the planted foot sweeps backward through
// the body frame, so it stays where it was set down.
//
// Sagittal convention (the bones'): a leg bone hangs along −y; rotation x = θ
// carries it to (0, −cos θ, −sin θ), so a NEGATIVE angle swings it forward (+z).

import { VILLAGER_MOTION as M } from '../config/balance'
import type { AgeGroup } from '../systems/appearance'
import type { BodyProportions } from './figureBody'
import { kneelLegs } from './figureRig'

/** The leg as the walk needs it (figure units). */
export interface LegDims {
  thigh: number
  shin: number
  /** Ankle joint above the sole of a flat foot. */
  ankle: number
  /** Standing knee give (rad per joint): the elder's. */
  flex: number
  /** Calf radius — the knee's clearance when it rests on the ground. */
  calfR: number
}

export function legDims(p: BodyProportions): LegDims {
  return { thigh: p.hipY - p.kneeY, shin: p.kneeY - p.ankleY, ankle: p.ankleY, flex: p.kneeFlex, calfR: p.calfR }
}

/** Local rotations (rad about x) of thigh, shin and foot. */
export interface LegAngles {
  thigh: number
  shin: number
  foot: number
}

/** The leg's vertical reach from hip joint to ankle at a knee give `f` per
 *  joint (thigh −f, shin +2f) — the standing hip height above the ankle. */
export function legExtent(d: LegDims, f: number): number {
  return (d.thigh + d.shin) * Math.cos(f)
}

/**
 * Two-bone IK in the sagittal plane: the hip at the origin, the ankle wanted at
 * (z, y) (y < 0). The knee bends FORWARD; the foot is kept flat on its sole.
 * Out of reach the leg points straight at the target.
 */
export function solveLeg(d: LegDims, z: number, y: number): LegAngles {
  const a = d.thigh
  const b = d.shin
  const dist = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, Math.hypot(z, y)))
  // World angle of the hip→ankle line (same convention as a bone's).
  const phi = Math.atan2(-z, -y)
  const alpha = Math.acos(Math.min(1, Math.max(-1, (a * a + dist * dist - b * b) / (2 * a * dist))))
  const beta = Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - dist * dist) / (2 * a * b))))
  const thigh = phi - alpha
  const shin = Math.PI - beta
  return { thigh, shin, foot: -(thigh + shin) }
}

/** Forward kneel-free FK: the ankle of a leg at these angles, hip at the origin. */
export function ankleAt(d: LegDims, l: LegAngles): { z: number; y: number } {
  const s = l.thigh + l.shin
  return {
    z: -d.thigh * Math.sin(l.thigh) - d.shin * Math.sin(s),
    y: -d.thigh * Math.cos(l.thigh) - d.shin * Math.cos(s),
  }
}

/** One foot through the cycle at its own phase ψ: planted for |ψ| ≤ π/2, moving
 *  linearly from front (+1) to back (−1); swinging forward again otherwise,
 *  lifted by `lift` (0 … 1, peak at mid-swing). */
export function footCycle(psi: number): { forward: number; lift: number; stance: boolean } {
  const w = Math.atan2(Math.sin(psi), Math.cos(psi))
  if (Math.abs(w) <= Math.PI / 2) return { forward: (-2 * w) / Math.PI, lift: 0, stance: true }
  const t = (w > 0 ? w - Math.PI / 2 : w + (3 * Math.PI) / 2) / Math.PI // swing 0 → 1
  return { forward: -Math.cos(Math.PI * t), lift: Math.sin(Math.PI * t), stance: false }
}

/** How much the age shortens the stride and the swing. */
export function ageFactor(age: AgeGroup): number {
  return age === 'elder' ? M.elderFactor : 1
}

/**
 * The fore/aft reach of a planted foot from the hip's plumb line at a ground
 * speed (figure units per second): longer strides for a faster pace, scaled by
 * the leg — so a child, whose leg is short, takes shorter steps at a higher
 * cadence, and an elder shorter ones still.
 */
export function strideReach(d: LegDims, speed: number, age: AgeGroup): number {
  const k = Math.min(M.ampMax, Math.max(M.ampMin, Math.abs(speed) / M.referenceSpeed))
  return legExtent(d, d.flex) * Math.sin(M.swingAmp * k * ageFactor(age))
}

/** Phase (rad) per unit walked that keeps the planted foot still: its reach is
 *  swept twice (front to back) over half a cycle. */
export function phasePerDistance(reach: number): number {
  return reach > 1e-6 ? Math.PI / (2 * reach) : 0
}

export interface WalkPose {
  /** Left (+x) leg first. */
  legs: [LegAngles, LegAngles]
  /** Hip joint height above the ground the figure stands on. */
  hipHeight: number
  /** Each foot's ankle target in the hip frame (z forward, y up from ground). */
  feet: [{ z: number; lift: number; stance: boolean }, { z: number; lift: number; stance: boolean }]
  /** Upper-arm pitch added to a free arm (rad; + is backward), left first. */
  arms: [number, number]
  /** Pelvis yaw and the shoulders' yaw against it (rad about +y). */
  hipYaw: number
  chestYaw: number
}

/**
 * The legs, hips and counter-motions at a gait phase. `weight` fades the walk
 * in and out (0 = standing, both feet under the hips); `crouch` is an extra knee
 * flex per joint (a work crouch — the caller releases it before walking).
 */
export function walkPose(d: LegDims, phase: number, reach: number, weight: number, age: AgeGroup, crouch = 0): WalkPose {
  const w = Math.min(1, Math.max(0, weight))
  const ext = legExtent(d, d.flex + crouch)
  const lift = M.clearance * (d.thigh + d.shin) * w
  const cyc = [footCycle(phase), footCycle(phase + Math.PI)] as const
  const z = cyc.map((c) => reach * w * c.forward)
  // The hips sit where the planted leg reaches: the lowest foot is ON the ground.
  let reachDown = Infinity
  cyc.forEach((c, i) => {
    if (c.stance) reachDown = Math.min(reachDown, Math.sqrt(Math.max(0, ext * ext - z[i] * z[i])))
  })
  if (!Number.isFinite(reachDown)) reachDown = ext
  const hipHeight = d.ankle + reachDown
  const legs = cyc.map((c, i) => solveLeg(d, z[i], d.ankle + lift * c.lift - hipHeight)) as [LegAngles, LegAngles]
  const swing = M.armSwing * w * ageFactor(age)
  return {
    legs,
    hipHeight,
    feet: [
      { z: z[0], lift: lift * cyc[0].lift, stance: cyc[0].stance },
      { z: z[1], lift: lift * cyc[1].lift, stance: cyc[1].stance },
    ],
    // The arm swings AGAINST its own side's leg: left leg forward, left arm back.
    arms: [swing * cyc[0].forward, swing * cyc[1].forward],
    // The pelvis turns the forward leg's hip forward; the shoulders turn back.
    hipYaw: -M.hipYaw * w * ageFactor(age) * cyc[0].forward,
    chestYaw: M.shoulderYaw * w * ageFactor(age) * cyc[0].forward,
  }
}

/** Height of the lowest sole point above the ground for a pose (≥ 0 when grounded). */
export function lowestFoot(d: LegDims, pose: Pick<WalkPose, 'legs' | 'hipHeight'>): number {
  return Math.min(...pose.legs.map((l) => pose.hipHeight + ankleAt(d, l).y - d.ankle))
}

/**
 * The legs between standing (k = 0, the given standing angles) and kneeling
 * (k = 1, render/figureRig `kneelLegs`), with the hip height that keeps the
 * lowest point of knee or foot on the ground all the way — a fold of the
 * bones, never a squash of the body.
 */
export function kneelBlend(d: LegDims, stand: LegAngles, k: number): { legs: LegAngles; hipHeight: number } {
  const kn = kneelLegs(d.thigh, d.calfR)
  const t = Math.min(1, Math.max(0, k))
  const e = t * t * (3 - 2 * t)
  const legs = {
    thigh: stand.thigh + (kn.thigh - stand.thigh) * e,
    shin: stand.shin + (kn.shin - stand.shin) * e,
    foot: stand.foot + (kn.foot - stand.foot) * e,
  }
  const kneeDown = d.thigh * Math.cos(legs.thigh) + d.calfR * e
  // The sole stands on the ground upright; laid back, the instep rests there.
  const ankleDown = -ankleAt(d, legs).y + d.ankle + (d.calfR - d.ankle) * e
  return { legs, hipHeight: Math.max(kneeDown, ankleDown) }
}

/** Approach `target` from `cur` by at most `rate·dt`, arriving exactly. */
export function approach(cur: number, target: number, rate: number, dt: number): number {
  const step = Math.max(0, rate * dt)
  const away = target - cur
  return Math.abs(away) <= step ? target : cur + Math.sign(away) * step
}

/** A work crouch is held only while the figure stands: never while it moves. */
export function crouchTarget(speed: number, contactCrouch: number): number {
  return Math.abs(speed) > M.moveSpeed ? 0 : contactCrouch
}

/** The crown above the head bone (which sits at the chin): where a head load
 *  rests, riding every bob and stoop of the head. `drawnTop` is the top of the
 *  drawn figure in its bind pose (hair, a head cloth) — the load sits on what
 *  is drawn, not on the skull's nominal height. */
export function crownOffset(p: BodyProportions, drawnTop = p.crownY): number {
  return Math.max(p.crownY, drawnTop) - p.chinY
}

/**
 * The grip on a steadied head load, in the crown's frame (y up from the crown,
 * x to the hand's side): at the load's side, `gripFraction` up it, lowered
 * until the arm reaches with its elbow bent — a hand on the rim, never a
 * stretched arm. `shoulder` is the shoulder in the same frame.
 */
export function headLoadGrip(
  shoulder: { x: number; y: number; z: number },
  side: 1 | -1,
  load: { radius: number; height: number },
  reach: number,
): { x: number; y: number; z: number } {
  const x = side * (load.radius + 0.02)
  const max = reach * 0.92
  let y = load.height * M.gripFraction
  const dist = (yy: number) => Math.hypot(x - shoulder.x, yy - shoulder.y, -shoulder.z)
  while (y > 0 && dist(y) > max) y -= 0.01
  return { x, y: Math.max(0, y), z: 0 }
}

// ---- the low preset's primitive figure (render/figures.ts FIGURE_LIMBS) -----

/** The primitive's kneel: its standing proportions folded, not squashed — a
 *  trunk 0.55 wide and 0.4125 tall (the former 0.55 body under a 0.75 squash,
 *  so every kneeling contact keeps its shoulder height), arms 0.242 long. */
export const PRIMITIVE_KNEEL = { width: 0.55, height: 0.55 * 0.75 } as const
export const PRIMITIVE_HEAD_RADIUS = 0.16

export interface PrimitiveLayout {
  /** Trunk pivot height (the hip; 0 without legs). */
  hipY: number
  /** Vertical and horizontal proportion of the body (1 standing). */
  height: number
  width: number
  armLength: number
  /** Head centre height, and its radius (never scaled). */
  headY: number
  headRadius: number
  /** Height the actor label reads for this figure. */
  labelHeight: number
  /** The figure group's scale factor over its own `scale` — uniform. */
  groupScale: [number, number, number]
}

/** The primitive figure from standing (k = 0) to kneeling (k = 1). */
export function primitiveLayout(k: number, legs: boolean, L: { hipY: number; armLength: number }): PrimitiveLayout {
  const t = Math.min(1, Math.max(0, k))
  const e = t * t * (3 - 2 * t)
  const mix = (a: number, b: number) => a + (b - a) * e
  const height = mix(1, PRIMITIVE_KNEEL.height)
  return {
    hipY: legs ? mix(L.hipY, 0) : 0,
    height,
    width: mix(1, PRIMITIVE_KNEEL.width),
    armLength: mix(1, PRIMITIVE_KNEEL.width) * L.armLength,
    headY: height + mix(0.18, 0.175),
    headRadius: PRIMITIVE_HEAD_RADIUS,
    labelHeight: mix(1.45, (0.55 + 0.45) * 0.75),
    groupScale: [1, 1, 1],
  }
}
