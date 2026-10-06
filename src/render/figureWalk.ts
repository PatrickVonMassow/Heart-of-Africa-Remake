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
  /** The leg's plane tilted sideways about the forward axis (+ toward +x):
   *  a planted foot held off the hip's line by a turn or a shove. */
  roll?: number
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
export function footCycle(psi: number): { forward: number; lift: number; stance: boolean; swing: number } {
  const w = Math.atan2(Math.sin(psi), Math.cos(psi))
  if (Math.abs(w) <= Math.PI / 2) return { forward: (-2 * w) / Math.PI, lift: 0, stance: true, swing: 0 }
  const t = (w > 0 ? w - Math.PI / 2 : w + (3 * Math.PI) / 2) / Math.PI // swing 0 → 1
  return { forward: -Math.cos(Math.PI * t), lift: Math.sin(Math.PI * t), stance: false, swing: t }
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

/** The phase that keeps the planted foot where it is when the stride's reach
 *  changes from `from` to `to` (a pace change mid-stance): the stance foot's
 *  fore/aft place is reach × forward, so its forward is rescaled — the swing
 *  foot, in the air, takes the shift. */
export function rephase(phase: number, from: number, to: number): number {
  if (from <= 1e-6 || to <= 1e-6 || from === to) return phase
  const half = Math.PI / 2
  const w0 = Math.atan2(Math.sin(phase), Math.cos(phase))
  const w1 = Math.atan2(Math.sin(phase + Math.PI), Math.cos(phase + Math.PI))
  const w = Math.abs(w0) <= half ? w0 : w1
  const next = (w * from) / to
  // Rescaled out of the stance, the foot would be thrown into its swing off
  // its spot: the phase stays, and the foot plant holds the foot instead.
  if (Math.abs(next) > half) return phase
  return phase + (next - w)
}

/** A foot's place in the walk: the gait's fore/aft target (hip frame), its
 *  lift, whether it carries the body, and its swing progress (0 → 1). */
/** One foot's hold on the ground (render/fauna.ts `footPlantPose` is the
 *  reference): its world contact while planted, the offset that keeps the
 *  ankle there, and the offset it lifted off with. */
export interface FootPlant {
  contact: { x: number; z: number } | null
  offset: FootOffset
  lifted: FootOffset
}

export const freePlant = (): FootPlant => ({ contact: null, offset: { x: 0, z: 0 }, lifted: { x: 0, z: 0 } })

/** The body a foot is planted under: its world place and yaw (rotation about
 *  +y, forward = (sin, cos)), and the figure's scale (world per figure unit). */
export interface PlantBody {
  x: number
  z: number
  yaw: number
  unit: number
}

/**
 * Hold a STANCE foot at one world spot while the body walks, turns and is
 * shoved over it: the phase alone keeps it still only while the body goes
 * straight along its facing; a turn swings a foot set ahead of or beside the
 * hips across the ground, a shove drags it sideways. The contact is caught at
 * touch-down and the ankle aimed back at it each frame, as far as the leg
 * reaches (`plantSide`/`plantFore` from the hip); beyond that it is dragged
 * along at the limit. In SWING the offset the foot lifted off with fades out by touch-down,
 * so it lands where the gait puts it. A standing figure (weight 0) shuffles
 * its feet back under the hips, each held where it stands for the first step.
 *
 * `hip` is the hip joint and `gait` the gait's ankle target beside it, both in
 * the body frame (figure units); `legLength` scales the limits.
 */
export function plantFoot(
  prev: FootPlant,
  foot: Pick<FootPhase, 'stance' | 'swing'>,
  walking: boolean,
  body: PlantBody,
  hip: FootOffset,
  gait: FootOffset,
  legLength: number,
  dt: number,
): FootPlant {
  const c = Math.cos(body.yaw)
  const s = Math.sin(body.yaw)
  const u = body.unit || 1
  const toWorld = (o: FootOffset) => {
    const lx = (hip.x + gait.x + o.x) * u
    const lz = (hip.z + gait.z + o.z) * u
    return { x: body.x + lx * c + lz * s, z: body.z - lx * s + lz * c }
  }
  if (!walking) {
    // Standing: the feet settle under the hips, each on its spot, so the
    // first step off holds the foot that stays.
    const k = Math.max(0, 1 - (M.plantSettle * dt) / Math.max(1e-6, Math.hypot(prev.offset.x, prev.offset.z)))
    const offset = { x: prev.offset.x * k, z: prev.offset.z * k }
    return { contact: toWorld(offset), offset, lifted: offset }
  }
  // The offset that aims the ankle at a world spot from this frame's body,
  // as far as the leg reaches (the limits bound the foot's place from the hip).
  const side = M.plantSide * legLength
  const fore = M.plantFore * legLength
  const aim = (spot: { x: number; z: number }) => {
    const dx = spot.x - body.x
    const dz = spot.z - body.z
    const want = { x: (dx * c - dz * s) / u - hip.x - gait.x, z: (dx * s + dz * c) / u - hip.z - gait.z }
    const offset = {
      x: Math.max(-side, Math.min(side, gait.x + want.x)) - gait.x,
      z: Math.max(-fore, Math.min(fore, gait.z + want.z)) - gait.z,
    }
    return { offset, reached: offset.x === want.x && offset.z === want.z }
  }
  if (!foot.stance) {
    // Lifting off, the swing starts from the spot it was held at, aimed from
    // this frame's body — not from the last frame's.
    const lifted = prev.contact ? aim(prev.contact).offset : prev.lifted
    const t = Math.min(1, Math.max(0, foot.swing))
    const keep = 1 - t * t * (3 - 2 * t)
    return { contact: null, offset: { x: lifted.x * keep, z: lifted.z * keep }, lifted }
  }
  // Touch-down: where the gait (and what is left of the lift-off offset) puts it.
  let contact = prev.contact ?? toWorld(prev.offset)
  const held = aim(contact)
  const offset = held.offset
  // Out of the leg's reach: the foot is dragged along at the limit.
  if (!held.reached) contact = toWorld(offset)
  return { contact, offset, lifted: offset }
}

/**
 * A walker's heading turned toward the way it wants to go, never snapped: at
 * its pace it rounds a corner of `turnRadius`, so a planted foot is carried
 * round with the body by no more than the leg can hold; a way far off its
 * heading first slows the pace to a near stand, where it turns at
 * `spotTurnRate`. Returns the new yaw and the pace factor (0 … 1) the step is
 * taken at — the step goes along the NEW heading.
 */
export function steerHeading(yaw: number, desired: number, speed: number, dt: number): { yaw: number; pace: number } {
  const lag = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw))
  const stop = Math.cos(M.turnStopAngle)
  const pace = Math.min(1, Math.max(0, (Math.cos(lag) - stop) / (1 - stop)))
  const rate = (pace * Math.abs(speed)) / M.turnRadius + (1 - pace) * M.spotTurnRate
  const turn = Math.max(-rate * dt, Math.min(rate * dt, lag))
  return { yaw: yaw + turn, pace }
}

export interface FootPhase {
  z: number
  lift: number
  stance: boolean
  swing: number
}

/** A foot held off the gait's own target (figure units, body frame: x to the
 *  figure's left, z forward). */
export interface FootOffset {
  x: number
  z: number
}

const NO_OFFSETS: readonly [FootOffset, FootOffset] = [
  { x: 0, z: 0 },
  { x: 0, z: 0 },
]

export interface WalkPose {
  /** Left (+x) leg first. */
  legs: [LegAngles, LegAngles]
  /** Hip joint height above the ground the figure stands on. */
  hipHeight: number
  /** Each foot's ankle target in the hip frame (z forward, y up from ground). */
  feet: [FootPhase, FootPhase]
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
export function walkPose(
  d: LegDims,
  phase: number,
  reach: number,
  weight: number,
  age: AgeGroup,
  crouch = 0,
  offsets: readonly [FootOffset, FootOffset] = NO_OFFSETS,
): WalkPose {
  const w = Math.min(1, Math.max(0, weight))
  const ext = legExtent(d, d.flex + crouch)
  const lift = M.clearance * (d.thigh + d.shin) * w
  const cyc = [footCycle(phase), footCycle(phase + Math.PI)] as const
  const z = cyc.map((c, i) => reach * w * c.forward + offsets[i].z)
  const x = [offsets[0].x, offsets[1].x]
  // The hips sit where the planted leg reaches: the lowest foot is ON the ground.
  let reachDown = Infinity
  cyc.forEach((c, i) => {
    if (c.stance) reachDown = Math.min(reachDown, Math.sqrt(Math.max(0, ext * ext - z[i] * z[i] - x[i] * x[i])))
  })
  if (!Number.isFinite(reachDown)) reachDown = ext
  const hipHeight = d.ankle + reachDown
  const legs = cyc.map((c, i) => {
    // A foot off the hip's line: the leg's plane tilts sideways to it.
    const y = d.ankle + lift * c.lift - hipHeight
    return { ...solveLeg(d, z[i], -Math.hypot(x[i], y)), roll: Math.atan2(x[i], -y) }
  }) as [LegAngles, LegAngles]
  const swing = M.armSwing * w * ageFactor(age)
  return {
    legs,
    hipHeight,
    feet: [
      { z: z[0], lift: lift * cyc[0].lift, stance: cyc[0].stance, swing: cyc[0].swing },
      { z: z[1], lift: lift * cyc[1].lift, stance: cyc[1].stance, swing: cyc[1].swing },
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
  return Math.min(...pose.legs.map((l) => pose.hipHeight + ankleAt(d, l).y * Math.cos(l.roll ?? 0) - d.ankle))
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

/** A figure's own walk between frames: what it measures of its ground
 *  travel and the gait, plant, crouch and kneel it draws from that. */
export interface WalkMotion {
  /** Last world place and yaw (for the ground speed), null until the first frame. */
  last: { x: number; z: number; yaw: number } | null
  /** Smoothed ground speed (figure units per second) and the gait phase. */
  speed: number
  phase: number
  /** The walk's weight (0 standing … 1 walking) and the planted foot's reach. */
  weight: number
  reach: number
  /** The work crouch drawn and the one the contact asks for. */
  crouch: number
  crouchTarget: number
  /** 0 standing … 1 kneeling. */
  kneel: number
  /** Each foot's hold on the ground (left first). */
  plants: [FootPlant, FootPlant]
}

export const restingMotion = (kneel = false): WalkMotion => ({
  last: null,
  speed: 0,
  phase: 0,
  weight: 0,
  reach: 0,
  crouch: 0,
  crouchTarget: 0,
  kneel: kneel ? 1 : 0,
  plants: [freePlant(), freePlant()],
})

/** A hip joint as the rig holds it: the hips bone's place in the body frame
 *  and the thigh's attachment offset in the hips' own frame. */
export interface HipJoint {
  hips: FootOffset
  thigh: FootOffset
}

/**
 * A hip joint in the body frame with the pelvis turned by `yaw` about +y: the
 * hips' place plus the thigh's offset carried through the hips' rotation —
 * exactly where three.js draws the thigh bone's origin under hips at
 * `rotation.y = yaw` (figureWalk.test.ts measures it there).
 */
export function hipJointAt(j: HipJoint, yaw: number): FootOffset {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { x: j.hips.x + j.thigh.x * c + j.thigh.z * s, z: j.hips.z - j.thigh.x * s + j.thigh.z * c }
}

/**
 * One frame of a figure's walk, from where it is drawn (`body`, world): every
 * walker gets its stride from how fast it really goes, whoever moves it. The
 * phase advances with the step along the facing; a pace change rephases it;
 * each stance foot is then held at its spot on the ground (`plantFoot`).
 * `joints` are the hips' place and each thigh's offset in the hips' frame; the
 * pelvis turn of the pose this frame draws is applied here (`hipJointAt`),
 * since only here is it known. Mutates `m`; returns the ground stepped this
 * frame (figure units), which the glTF body's clip gait advances by.
 */
export function stepWalk(
  m: WalkMotion,
  body: PlantBody,
  dt: number,
  d: LegDims,
  age: AgeGroup,
  kneelWanted: boolean,
  joints: readonly [HipJoint, HipJoint],
): number {
  const unit = body.unit || 1
  let walked = 0
  if (m.last) {
    const dx = body.x - m.last.x
    const dz = body.z - m.last.z
    if (Math.hypot(dx, dz) / unit / dt <= M.teleportSpeed) {
      // The step along the facing is the stride; a sideways shove and a turn
      // are stepped too (the held foot cannot follow them far), never backward.
      const ahead = (dx * Math.sin(body.yaw) + dz * Math.cos(body.yaw)) / unit
      const aside = Math.abs(dx * Math.cos(body.yaw) - dz * Math.sin(body.yaw)) / unit
      const turned = Math.abs(Math.atan2(Math.sin(body.yaw - m.last.yaw), Math.cos(body.yaw - m.last.yaw)))
      walked = ahead + Math.sign(ahead || 1) * (aside + turned * M.turnStep)
    } else m.plants = [freePlant(), freePlant()] // placed, not walked: let go
  }
  m.last = { x: body.x, z: body.z, yaw: body.yaw }
  const k = 1 - Math.exp(-dt / M.speedSmoothing)
  m.speed += (walked / dt - m.speed) * k
  m.kneel = approach(m.kneel, kneelWanted ? 1 : 0, 1 / M.kneelSeconds, dt)
  const moving = Math.abs(m.speed) > M.moveSpeed && m.kneel === 0
  const placed = m.reach * m.weight
  m.weight = approach(m.weight, moving ? 1 : 0, M.walkFadeRate, dt)
  if (moving) m.reach = strideReach(d, m.speed, age)
  // A pace change does not drag the planted foot: the phase moves with it.
  m.phase = rephase(m.phase, placed, m.reach * m.weight)
  // The planted foot stays put: the phase runs at the rate its reach is swept.
  m.phase += walked * phasePerDistance(Math.max(m.reach * m.weight, m.reach * 0.3))
  // ...and is held at its spot on the ground through a turn or a shove.
  const gait = walkPose(d, m.phase, m.reach, m.weight, age, m.crouch)
  m.plants = [0, 1].map((i) => {
    const hip = hipJointAt(joints[i], gait.hipYaw)
    return plantFoot(m.plants[i], gait.feet[i], m.weight > 0 && m.kneel === 0, body, hip, { x: 0, z: gait.feet[i].z }, d.thigh + d.shin, dt)
  }) as [FootPlant, FootPlant]
  return walked
}

/** A head load's outline for the steadying hand: its half-width at the base
 *  and at the top across the hand's side (a jar's waist and rim, a bundle's
 *  half-width), and its height — the same numbers the load is drawn from. */
export interface HeadLoadShape {
  bottom: number
  top: number
  height: number
}

/** The load's half-width at height `y` above its base. */
export function loadRadiusAt(load: HeadLoadShape, y: number): number {
  const t = load.height > 0 ? Math.min(1, Math.max(0, y / load.height)) : 0
  return load.bottom + (load.top - load.bottom) * t
}

/** The hand's clearance off the load's side (a palm's thickness). */
export const GRIP_CLEARANCE = 0.02

/**
 * The grip on a steadied head load, in the crown's frame (y up from the crown,
 * x to the hand's side): against the load's side, `gripFraction` up it,
 * lowered until the arm reaches with its elbow bent — a hand on the rim, never
 * a stretched arm. `shoulder` is the shoulder in the same frame.
 */
export function headLoadGrip(
  shoulder: { x: number; y: number; z: number },
  side: 1 | -1,
  load: HeadLoadShape,
  reach: number,
): { x: number; y: number; z: number } {
  const max = reach * 0.92
  const xAt = (yy: number) => side * (loadRadiusAt(load, yy) + GRIP_CLEARANCE)
  let y = load.height * M.gripFraction
  const dist = (yy: number) => Math.hypot(xAt(yy) - shoulder.x, yy - shoulder.y, -shoulder.z)
  while (y > 0 && dist(y) > max) y -= 0.01
  y = Math.max(0, y)
  return { x: xAt(y), y, z: 0 }
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

/** True when a pose leaves this arm hanging at rest — no contact to reach, so
 *  it is free to swing with the walk (or to steady a head load). */
export function armAtRest(a: { pitch: number; yaw: number; roll: number }, rest: { pitch: number; yaw: number; roll: number }): boolean {
  const tol = 0.15
  return Math.abs(a.pitch - rest.pitch) < tol && Math.abs(a.yaw - rest.yaw) < tol && Math.abs(a.roll - rest.roll) < tol
}
