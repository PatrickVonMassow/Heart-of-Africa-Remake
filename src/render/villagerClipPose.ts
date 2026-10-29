// The glTF villager's clips on the drawn body (work-order "villager glTF body:
// animation, dress and tool"): the retargeted walk and sprint, the authored
// dig and the shovel carry, sampled and blended here and carried onto the
// HUNG skeleton the settlement figure binds (villagerFigureBody.ts), whose
// rest differs from the file's A-pose by each limb's hang.
//
// The gait's no-slide rule is point 1295's: the phase advances by exactly the
// ground walked over the distance one blended cycle covers (villagerRig.ts
// `gaitAt`), the stride is warped to that cycle by two-bone IK on the legs, and
// a planted foot is held on its spot through a turn or a shove until it lifts.
//
// Pure: arrays and three's math types, no scene graph; the tests read it directly.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF as G, VILLAGER_POSE as P } from '../config/balance'
import type { VillagerAsset, VillagerClip } from './villagerAsset'
import type { PersonFrame } from './villagerFigureBody'
import {
  blendPoses,
  contactPoints,
  forwardKinematics,
  gaitAt,
  newPose,
  newWorld,
  sampleClip,
  setWorldRotation,
  toolInHand,
  type GaitClips,
  type VillagerPose,
  type WorldPose,
} from './villagerRig'

/** The figure's place on the ground: world x, z, the yaw it faces (+z local
 *  turned by yaw) and its world scale. */
export interface GroundBody {
  x: number
  z: number
  yaw: number
  unit: number
}

type Contact = 'heel' | 'ball' | 'tip'
const CONTACTS: readonly Contact[] = ['heel', 'ball', 'tip']

/** A held foot: where each of its sole's contacts touched down (world x, z),
 *  null for a contact in the air. */
export type HeldFoot = Record<Contact, { x: number; z: number } | null>

const freeFoot = (): HeldFoot => ({ heel: null, ball: null, tip: null })

/** The gait's state on one figure. */
export interface ClipGait {
  /** Cycle phase 0 … 1 (walk and sprint both start at the left foot's landing). */
  phase: number
  held: [HeldFoot, HeldFoot]
  /** Per foot, the correction (person x, z) the hold puts on the clip's foot;
   *  once the foot lifts it fades over VILLAGER_GLTF.plantFadeCycle. */
  slip: [{ x: number; z: number }, { x: number; z: number }]
  /** The phase the slip was last eased at. */
  slipPhase: number
  /** Per foot, the world heading (rad, as GroundBody.yaw) a flat-lying foot
   *  keeps while it lies flat; null once it neither lies flat, holds its tip,
 *  nor releases its toes. */
  flatYaw: [number | null, number | null]
  /** Per foot, whether the planted foot (rather than the clip's hold) placed it last. */
  planted: [boolean, boolean]
  /** Per leg, its hand-over from one pivot of the rolling foot to the next
   *  or to the clip's swing (`LiftOff`). */
  lift: [LiftOff, LiftOff]
}

/** thigh, shin, foot, toe: a quaternion (x, y, z, w) each, plain data */
const legTurns = (): number[] => [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]

/** A leg's hand-over as its foot rolls off (ClipGait.lift). The leg's
 *  thigh, shin, foot and toe locals are kept as turns onto the clip's
 *  (drawn local = turn · clip local), as plain numbers (the state is cloned). */
export interface LiftOff {
  /** the contact the foot pivoted on last frame (null: none) */
  on: Contact | null
  /** the contact handed to (null: the swing) */
  to: Contact | null
  /** the share of VILLAGER_GLTF.liftOffBlendCycle still to walk before the
   *  leg is drawn from its pivot (or the clip's swing) alone */
  left: number
  /** the toes' share of lying flat last frame (let go over VILLAGER_GLTF.toeReleaseCycle) */
  toes: number
  /** the turns drawn last frame */
  last: number[]
  /** the turns drawn when the pivot last changed, blended out over `left` */
  from: number[]
}

const freeLift = (): LiftOff => ({ on: null, to: null, left: 0, toes: 0, last: legTurns(), from: legTurns() })

export const newClipGait = (): ClipGait => ({ phase: 0, held: [freeFoot(), freeFoot()], slip: [{ x: 0, z: 0 }, { x: 0, z: 0 }], slipPhase: 0, flatYaw: [null, null], planted: [false, false], lift: [freeLift(), freeLift()] })

/** Let both feet go (standing: nothing is held for the next walk). */
export function releaseClipGait(g: ClipGait): void {
  g.held = [freeFoot(), freeFoot()]
  g.slip = [{ x: 0, z: 0 }, { x: 0, z: 0 }]
  g.flatYaw = [null, null]
  g.planted = [false, false]
  g.lift = [freeLift(), freeLift()]
}

/** How far above the ground a contact takes hold (person units); a held
 *  contact lets go only above VILLAGER_GLTF.plantLetGo times this. */
export const PLANT_TOUCH = 0.02

/**
 * Advance the gait by `walked` (figure units along the facing, the same
 * distance the code-built walk steps by) at the smoothed ground `speed`: the
 * planted foot sweeps exactly that ground, so it holds its spot.
 */
export function stepClipGait(g: ClipGait, asset: VillagerAsset, frame: PersonFrame, walked: number, speed: number): void {
  // figure units → person units of the clips (the drawn body is scaled by frame.scale)
  const legs = frame.legScale
  const v = speed / frame.scale
  const gait = gaitAt(asset.clips as unknown as GaitClips, v, legs)
  const p = g.phase + (walked / frame.scale) * gait.phasePerUnit
  g.phase = ((p % 1) + 1) % 1
}

const _a = newPose(0)
const _j = newPose(0)
const _b = newPose(0)
const _legPose = newPose(0)
const _blendStance: [[number, number], [number, number]] = [
  [0, 0],
  [0, 0],
]
const LEG_BONES = (['L', 'R'] as const).map((s) => [`thigh.${s}`, `shin.${s}`, `foot.${s}`, `toe.${s}`])

/** A gait clip's stance of one foot (phase it lands, phase it lifts; the
 *  lift may lie past 1), from its support intervals: the earliest touch of
 *  that foot's contacts and the last lift of the support that touch begins
 *  (overlapping heel/ball/tip spans, and a span beginning within a tenth of
 *  the support's first touch, chain into one stance). Cached per
 *  clip object, so a replaced clip of the same name is read afresh. [0, 0]
 *  without support metadata (no warp). */
export function stanceOf(clip: VillagerClip, side: 'L' | 'R'): [number, number] {
  let hit = _stance.get(clip)
  if (!hit) {
    hit = { L: readStance(clip, 'L'), R: readStance(clip, 'R') }
    _stance.set(clip, hit)
  }
  return hit[side]
}
const _stance = new WeakMap<VillagerClip, Record<'L' | 'R', [number, number]>>()

function readStance(clip: VillagerClip, side: 'L' | 'R'): [number, number] {
  const sup = clip.contacts?.support?.[side]
  if (!sup) return [0, 0]
  // the left foot's spans late in the cycle belong to its landing at 0 (the clips start there)
  const spans = [...sup.heel, ...sup.ball, ...sup.tip]
    .map(([a, b]) => (side === 'L' && a > 0.5 ? [a - 1, b - 1] : [a, b]))
    .sort((x, y) => x[0] - y[0])
  if (!spans.length) return [0, 0]
  // the connected supports: a span joins the one before it when it begins
  // before that support has ended or within a tenth of its first touch
  const supports: [number, number][] = []
  for (const [a, b] of spans) {
    const last = supports[supports.length - 1]
    if (last && (a <= last[1] + 1e-6 || a - last[0] < 0.1)) last[1] = Math.max(last[1], b)
    else supports.push([a, b])
  }
  // the stance: the support whose earliest touch lies nearest the landing
  // (the left foot at 0, the right one at half a cycle), from that touch on
  const near = (a: number) => (side === 'L' ? Math.abs(a) : Math.abs(a - 0.5))
  const [start, lift] = supports.reduce((m, sp) => (near(sp[0]) < near(m[0]) ? sp : m))
  return [start, lift]
}

/**
 * The phase at which a clip whose foot carries over `clip` (land, lift) shows
 * the moment `phase` of a blended stance `blend` (land, lift): landing on
 * landing and lifting on lifting, each part of the cycle mapped linearly.
 */
export function stanceSync(phase: number, blend: readonly [number, number], clip: readonly [number, number]): number {
  const [b0, b1] = blend
  const [c0, c1] = clip
  if (b1 - b0 < 1e-6 || c1 - c0 < 1e-6) return phase
  // measured from the landing, in [0, 1)
  const u = (((phase - b0) % 1) + 1) % 1
  const bs = b1 - b0
  const cs = c1 - c0
  const v = u < bs ? (u / bs) * cs : cs + ((u - bs) / (1 - bs)) * (1 - cs)
  return (((c0 + v) % 1) + 1) % 1
}
const ensure = (pose: VillagerPose, bones: number) => {
  if (pose.rot.length !== bones * 4) {
    const fresh = newPose(bones)
    pose.rot = fresh.rot
  }
  return pose
}

/** A clip sampled at a phase of its cycle into `out`, the hips scaled onto the person. */
export function samplePhase(clip: VillagerClip, phase: number, frame: PersonFrame, out: VillagerPose): VillagerPose {
  sampleClip(clip, phase * clip.duration, out)
  out.hips.multiplyScalar(frame.legScale)
  return out
}

const _w = newWorld(0)
const ensureWorld = (w: WorldPose, bones: number) => {
  while (w.q.length < bones) {
    w.q.push(new THREE.Quaternion())
    w.p.push(new THREE.Vector3())
  }
  return w
}
const _keep = new THREE.Quaternion()
const _keepToe = new THREE.Quaternion()
const _fq = new THREE.Quaternion()
const _pv = new THREE.Vector3()
const _tq = new THREE.Quaternion()
const _toeW = [0, 0]
const _pivotOn: Contact[] = ['heel', 'heel']
const _pivoted = [false, false]
const _yHold: Record<Contact, number> = { heel: 0, ball: 0, tip: 0 }
const _clipAt = [new THREE.Vector3(), new THREE.Vector3()]
const _standing = [false, false]
const _flat = [0, 0]
const _support = [0, 0]
const _stanceU = [0, 0]
/** A rotation's heading about the vertical (rad; its twist about +y). */
const headingOf = (q: THREE.Quaternion) => 2 * Math.atan2(q.y, q.w)
/** Each foot's flat turn (person frame): its kept heading alone. */
const _flatQ = [new THREE.Quaternion(), new THREE.Quaternion()]
const _up = new THREE.Vector3(0, 1, 0)
/** Turn a rotation by `w` toward the flat turn `flat` (no pitch or roll). */
function flatten(q: THREE.Quaternion, flat: THREE.Quaternion, w: number): THREE.Quaternion {
  return q.slerp(flat, Math.min(1, w))
}

/**
 * The ankle's height (person units) on a foot lying flat: its rest height,
 * where the drawn sole stands on the ground — raised only as far as a sole
 * contact (scaled by the leg, the toe tip off the unscaled toe joint) would
 * otherwise sink below G.flatContactSink.
 */
function flatAnkle(asset: VillagerAsset, frame: PersonFrame, side: 'L' | 'R'): number {
  const foot = asset.bones.indexOf(`foot.${side}`)
  const toe = asset.bones.indexOf(`toe.${side}`)
  const r0 = frame.rest0
  const cp = asset.contactPoints[side]
  const lg = frame.legScale
  const low = Math.min(cp.heel.y * lg, cp.ball.y * lg, r0[toe * 3 + 1] - r0[foot * 3 + 1] + cp.tip.y * lg)
  const rest = r0[foot * 3 + 1]
  return rest + Math.max(0, -(rest + low) - G.flatContactSink * lg)
}

/**
 * A planted foot out of the leg's reach rolls up on its pivot (`toPivot`,
 * ankle → contact, world) instead of being dragged: the ankle target moves
 * to the nearest point the leg reaches at the pivot's distance, and the foot
 * (`footQ`, world) pitches about the pivot, which stays on its spot (`_hoQ`
 * keeps that turn). Mutates `target` and `footQ`. A pivot beyond the reach
 * of the leg and foot in one line is lifted off its spot to that line's
 * limit — the ankle at the leg's reach, the foot pointing at the pivot —
 * the same pose the roll tends to as the pivot nears the limit, so the foot
 * never springs back to the clip's pitch for a frame (the trailing foot's
 * tremble at every toe-off). 'out' where no direction to the pivot is
 * defined, or where the target lies on the hip–pivot line while the reach
 * circle still has a radius.
 */
export function heelOff(frame: PersonFrame, world: WorldPose, thigh: number, shin: number, foot: number, target: THREE.Vector3, toPivot: THREE.Vector3, footQ: THREE.Quaternion): 'reached' | 'rolled' | 'out' {
  const hip = world.p[thigh]
  const reach = (legLength(frame.rest0, thigh, shin, foot) - 1e-4) * G.legReach
  if (hip.distanceTo(target) <= reach) return 'reached'
  const pivot = _hoB.copy(target).add(toPivot)
  const d = toPivot.length()
  // beyond the leg and foot in one line the pivot lifts straight up off its
  // spot to that reach (a toe-off: the contact leaves the ground, it does not
  // slide along it); dragged toward the hip only where even that falls short,
  // there at hip height, where the lift ends, so the pose does not jump
  const far = reach + d
  const flat = Math.hypot(pivot.x - hip.x, pivot.z - hip.z)
  if (pivot.distanceTo(hip) > far) pivot.y = Math.max(pivot.y, hip.y - Math.sqrt(Math.max(0, far * far - flat * flat)))
  const axis = _hoAx.copy(pivot).sub(hip)
  const D = axis.length()
  if (D < 1e-6) return 'out'
  axis.divideScalar(D)
  // the circle where the spheres about the hip (reach) and the pivot (d)
  // meet; at reach + d it has shrunk to the point at the leg's reach
  const a = Math.min(reach, (D * D + reach * reach - d * d) / (2 * D))
  const r = Math.sqrt(Math.max(0, reach * reach - a * a))
  const centre = _hoC.copy(hip).addScaledVector(axis, a)
  const u = _hoU.copy(target).sub(centre)
  u.addScaledVector(axis, -u.dot(axis))
  if (u.lengthSq() >= 1e-12) target.copy(centre).addScaledVector(u.normalize(), r)
  else if (r < 1e-9) target.copy(centre)
  else return 'out'
  const v0 = _hoV0.copy(toPivot).normalize()
  const v1 = _hoV1.copy(pivot).sub(target).normalize()
  _hoQ.setFromUnitVectors(v0, v1)
  // Near the line the pitch grows as the root of the distance the pivot has
  // left to that limit, so the foot snapped onto the line in the last frames
  // before the lift (a frame-rate-bound spike at every heel-off). Within
  // 2·G.rollSoftPitch of it the foot pitches a little less, tending to that
  // pitch short of the line instead, and the ankle follows round the pivot;
  // no give on an unrolled foot (the hand-over at the reach stays exact).
  const w = G.rollSoftPitch
  const pitch = v0.angleTo(v1)
  const left = Math.max(0, v0.angleTo(axis) - pitch)
  if (w > 0 && pitch > 1e-6 && left < 2 * w) {
    const give = (((2 * w - left) ** 2) / (4 * w)) * Math.min(1, pitch / w)
    _hoQ.setFromAxisAngle(_hoN.crossVectors(v0, v1).normalize(), Math.max(0, pitch - give))
    target.copy(pivot).sub(_hoU.copy(toPivot).applyQuaternion(_hoQ))
  }
  footQ.premultiply(_hoQ)
  return 'rolled'
}
const _hoN = new THREE.Vector3()
const _hoV0 = new THREE.Vector3()
const _qI = new THREE.Quaternion()
const _qw2 = new THREE.Quaternion()
const _qw3 = new THREE.Quaternion()
const _clipLocal = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]
const _hoP = new THREE.Vector3()
const _hoV1 = new THREE.Vector3()
const _hoB = new THREE.Vector3()
const _hoAx = new THREE.Vector3()
const _hoC = new THREE.Vector3()
const _hoU = new THREE.Vector3()
const _hoQ = new THREE.Quaternion()
const _t = new THREE.Vector3()
const _miss = new THREE.Vector3()
const smoothstep = (x: number) => x * x * (3 - 2 * x)
const _h = new THREE.Vector3()
const SIDES = ['L', 'R'] as const
const _target = [new THREE.Vector3(), new THREE.Vector3()]
const _lift = [0, 0]
const _preRot: number[] = []
const _preHips = new THREE.Vector3()
const _preTarget = [new THREE.Vector3(), new THREE.Vector3()]
const _clear = [0, 0]

/** Hip joint → knee → ankle at rest: the leg's full reach (person units). */
function legLength(rest: Float32Array, thigh: number, shin: number, foot: number): number {
  const d = (a: number, b: number) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2])
  return d(thigh, shin) + d(shin, foot)
}

/** Person-unit (x, z) on the figure → world (x, z). */
function toWorld(frame: PersonFrame, body: GroundBody, p: THREE.Vector3): { x: number; z: number } {
  const lx = p.x * frame.scale * body.unit
  const lz = p.z * frame.scale * body.unit
  const c = Math.cos(body.yaw)
  const s = Math.sin(body.yaw)
  return { x: body.x + lx * c + lz * s, z: body.z - lx * s + lz * c }
}

/** World (x, z) → person-unit (x, z) on the figure (y left as it is). */
function toPerson(frame: PersonFrame, body: GroundBody, h: { x: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
  const dx = h.x - body.x
  const dz = h.z - body.z
  const c = Math.cos(body.yaw)
  const s = Math.sin(body.yaw)
  const k = 1 / (frame.scale * (body.unit || 1))
  return out.set((dx * c - dz * s) * k, out.y, (dx * s + dz * c) * k)
}

type GaitWeights = { walk: number; jog: number; sprint: number }

/** The clips blended at `phase` by the gait weights into `out` (hips scaled
 *  onto the person, stride not yet warped). Each leg in step across the gaits
 *  (natural-villager-motion step 5): the clips land a foot at the same phase
 *  but carry it for very different shares of the cycle (the walk ~2/3, the jog
 *  under 1/5); blended at one phase a foot would be half planted, half
 *  swinging and drag its hold. So each leg plays every clip at a phase warped
 *  to the blended stance (`stanceSync`), left in `_blendStance`. */
function blendGait(asset: VillagerAsset, frame: PersonFrame, phase: number, w: GaitWeights, walkClip: VillagerClip, out: VillagerPose): VillagerPose {
  const n = asset.bones.length
  const parts = [
    { clip: walkClip, pose: ensure(_a, n), w: w.walk },
    { clip: asset.clips.jog, pose: ensure(_j, n), w: w.jog },
    { clip: asset.clips.sprint, pose: ensure(_b, n), w: w.sprint },
  ]
  const live = parts.filter((p) => p.w > 0)
  const total = live.reduce((t, p) => t + p.w, 0) || 1
  for (const [i, side] of SIDES.entries()) {
    let on = 0
    let off = 0
    for (const p of live) {
      const e = stanceOf(p.clip, side)
      on += p.w * e[0]
      off += p.w * e[1]
    }
    _blendStance[i] = [on / total, off / total]
  }
  for (const p of parts) {
    samplePhase(p.clip, phase, frame, p.pose)
    if (p.w <= 0) continue
    for (const [i, side] of SIDES.entries()) {
      const e = stanceOf(p.clip, side)
      const b = _blendStance[i]
      if (Math.abs(e[0] - b[0]) < 1e-6 && Math.abs(e[1] - b[1]) < 1e-6) continue
      samplePhase(p.clip, stanceSync(phase, b, e), frame, ensure(_legPose, n))
      for (const bone of LEG_BONES[i]) {
        const k = asset.bones.indexOf(bone)
        for (let c = 0; c < 4; c++) p.pose.rot[k * 4 + c] = _legPose.rot[k * 4 + c]
      }
    }
  }
  return blendPoses(
    [
      { pose: _a, w: w.walk },
      { pose: _j, w: w.jog },
      { pose: _b, w: w.sprint },
    ],
    ensure(out, n),
  )
}

/**
 * How high each foot's lowest sole contact stands over the ground through its
 * stance in the gait blend `w` on this person (person units, [L, R]; 0
 * without a stance). The clips are authored on the basis body and their hips
 * scaled by the hip height alone, so a morphed body's feet land above or
 * below the ground (a child's ankle sits otherwise than in proportion to its
 * hips), the runs land their right foot higher than their left even on the
 * basis body, and a blend of two clips carries its stance foot lower than
 * either. Read at `groundLevels` steps across each cross-fade band and
 * interpolated between, cached per person and gait clips: it changes with the
 * pace, never within a stance, so it moves no planted foot.
 */
export function gaitFootGround(asset: VillagerAsset, frame: PersonFrame, walkClip: VillagerClip, w: GaitWeights): readonly [number, number] {
  // the two band shares (gaitWeights): walk → runs a, jog → sprint b
  const a = 1 - w.walk
  const b = a > 1e-9 ? w.sprint / a : 0
  const q = Math.max(1, G.groundLevels)
  const fa = Math.min(q, Math.max(0, a * q))
  const fb = Math.min(q, Math.max(0, b * q))
  const a0 = Math.min(q - 1, Math.floor(fa))
  const b0 = Math.min(q - 1, Math.floor(fb))
  const ta = fa - a0
  const tb = fb - b0
  _groundOut[0] = 0
  _groundOut[1] = 0
  for (const [ia, wa] of [[a0, 1 - ta], [a0 + 1, ta]] as const) {
    for (const [ib, wb] of [[b0, 1 - tb], [b0 + 1, tb]] as const) {
      const k = wa * wb
      if (k <= 0) continue
      const h = groundLevel(asset, frame, walkClip, ia, ib, q)
      _groundOut[0] += k * h[0]
      _groundOut[1] += k * h[1]
    }
  }
  return _groundOut
}
const _groundOut: [number, number] = [0, 0]
/** Per person and walk clip: the grid levels read with these jog and sprint clips. */
const _ground = new WeakMap<PersonFrame, WeakMap<VillagerClip, { jog: VillagerClip; sprint: VillagerClip; levels: Map<number, [number, number]> }>>()
const _gPose = newPose(0)
const _gWorld = newWorld(0)

/** gaitFootGround at the grid level (ia, ib) of q steps per band. */
function groundLevel(asset: VillagerAsset, frame: PersonFrame, walkClip: VillagerClip, ia: number, ib: number, q: number): [number, number] {
  let perFrame = _ground.get(frame)
  if (!perFrame) _ground.set(frame, (perFrame = new WeakMap()))
  // every clip of the blend shapes the heights: a replaced jog or sprint reads them afresh
  let cached = perFrame.get(walkClip)
  if (!cached || cached.jog !== asset.clips.jog || cached.sprint !== asset.clips.sprint) {
    perFrame.set(walkClip, (cached = { jog: asset.clips.jog, sprint: asset.clips.sprint, levels: new Map() }))
  }
  const levels = cached.levels
  const key = ia * (q + 1) + ib
  let hit = levels.get(key)
  if (hit) return hit
  const a = ia / q
  const b = ib / q
  const w = { walk: 1 - a, jog: a * (1 - b), sprint: a * b }
  const n = asset.bones.length
  const world = ensureWorld(_gWorld, n)
  const steps = Math.max(1, G.groundSamples)
  hit = [0, 0]
  for (const [i, side] of SIDES.entries()) {
    blendGait(asset, frame, 0, w, walkClip, _gPose)
    const [land, lift] = _blendStance[i]
    if (lift - land < 1e-6) continue
    let low = Infinity
    for (let k = 0; k <= steps; k++) {
      const ph = land + ((lift - land) * k) / steps
      blendGait(asset, frame, ((ph % 1) + 1) % 1, w, walkClip, _gPose)
      forwardKinematics(asset, frame.rest0, _gPose, world)
      const c = contactPoints(asset, world, frame.legScale)[side]
      low = Math.min(low, c.heel.y, c.ball.y, c.tip.y)
    }
    hit[i] = low
  }
  levels.set(key, hit)
  return hit
}

/**
 * The gait pose at the gait's phase and `speed` (figure units/s) on the
 * person's A-pose skeleton: walk, jog and sprint blended by the gait weights, the
 * stride warped to the blended cycle, and every planted foot held at its spot
 * (`body`; null holds nothing). Writes `out` and returns it.
 */
export function clipGaitPose(
  g: ClipGait,
  asset: VillagerAsset,
  frame: PersonFrame,
  speed: number,
  body: GroundBody | null,
  out: VillagerPose,
  walkClip: VillagerClip = asset.clips.walk,
): VillagerPose {
  const n = asset.bones.length
  ensure(out, n)
  const world = ensureWorld(_w, n)
  const v = speed / frame.scale
  const gait = gaitAt(asset.clips as unknown as GaitClips, v, frame.legScale)
  // each foot's stance height over the ground in this blend: the hips drop by
  // the higher one and the lower foot is lifted by the rest, so no leg is
  // asked to reach further than its clips do
  const ground = gaitFootGround(asset, frame, walkClip, gait)
  const sink = Math.max(ground[0], ground[1])
  _lift[0] = sink - ground[0]
  _lift[1] = sink - ground[1]
  blendGait(asset, frame, g.phase, gait, walkClip, out)
  out.hips.y -= sink
  forwardKinematics(asset, frame.rest0, out, world)
  // THE WALK STANDS ON A FOOT EVERY FRAME: the retargeted walk carries its
  // trailing toe up to 2.5 cm off the ground late in its authored support, so
  // a single stance-wide sink left both feet floating at the double support.
  // The pelvis settles by the lowest contact (a walk has no flight; the runs
  // keep theirs), a uniform drop moving every joint alike, before the holds
  // read the contacts' heights.
  const cs = contactPoints(asset, world, frame.legScale)
  let low = Infinity
  SIDES.forEach((s, i) => {
    for (const k of CONTACTS) low = Math.min(low, cs[s][k].y + _lift[i])
  })
  const settle = Number.isFinite(low) ? low * gait.walk : 0
  if (settle) {
    out.hips.y -= settle
    for (let k = 0; k < n; k++) world.p[k].y -= settle
  }
  // Each foot's share of lying flat (G.footFlatFrom … footFlatTo of its
  // blended stance; planting disabled, none).
  SIDES.forEach((_, i) => {
    const [land, lift] = _blendStance[i]
    const span = lift - land
    _flat[i] = 0
    _support[i] = 0
    if (span < 1e-6) return
    const u = ((((g.phase - land) % 1) + 1) % 1) / span
    _stanceU[i] = u
    if (u >= 1) return
    const b = Math.max(1e-6, G.footFlatBlend)
    _support[i] = smoothstep(Math.min(1, u / b)) * smoothstep(Math.min(1, (1 - u) / Math.max(1e-6, G.walkDropFade))) * gait.walk
    const rise = Math.min(1, Math.max(0, (u - (G.footFlatFrom - b)) / b))
    const fall = Math.min(1, Math.max(0, (G.footFlatTo + b - u) / b))
    _flat[i] = body ? smoothstep(rise) * smoothstep(fall) * gait.walk : 0
  })
  // a flat foot keeps the world heading it lay down with (a turn of the body
  // or of the clip's foot slides no planted toe round its heel)
  SIDES.forEach((s, i) => {
    // (kept while the toes are still letting go after the tip's hold: their
    // flat turn is this figure's own, rebuilt every call)
    if (!body || (_flat[i] <= 0 && !g.held[i].tip && g.lift[i].toes <= 0)) {
      g.flatYaw[i] = null
      return
    }
    const foot = asset.bones.indexOf(`foot.${s}`)
    g.flatYaw[i] ??= headingOf(world.q[foot]) + body.yaw
    _flatQ[i].setFromAxisAngle(_up, g.flatYaw[i]! - body.yaw)
  })
  const hips = asset.bones.indexOf('hips')
  // how far a lifted foot's correction fades this call: by the cycle walked
  const walkedPhase = (((g.phase - g.slipPhase) % 1) + 1) % 1
  g.slipPhase = g.phase
  const fade = Math.min(1, walkedPhase / Math.max(1e-6, G.plantFadeCycle))
  // a hand-over walks on toward the leg's new pivot (or swing) alone
  SIDES.forEach((_, i) => (g.lift[i].left = Math.max(0, g.lift[i].left - walkedPhase / Math.max(1e-6, G.liftOffBlendCycle))))
  ;(['L', 'R'] as const).forEach((s, i) => {
    const foot = asset.bones.indexOf(`foot.${s}`)
    // The stride: the foot's reach fore and aft of the hips scaled to the cycle.
    const shift = (world.p[foot].z - world.p[hips].z) * (gait.stride - 1)
    _t.copy(world.p[foot])
    _t.z += shift
    // The planted foot: every sole contact on the ground stays where it
    // touched down; the ankle moves by their mean miss (a foot rolling from the
    // heel over the ball keeps each point still while it carries).
    const c = contactPoints(asset, world, frame.legScale)[s]
    for (const k of CONTACTS) c[k].y += _lift[i]
    _t.y += _lift[i]
    // lying flat, the ankle stands at its rest height over the drawn sole
    const fw = _flat[i]
    const flatY = flatAnkle(asset, frame, s)
    _t.y += (flatY - _t.y) * fw
    const held = g.held[i]
    _miss.set(0, 0, 0)
    let down = 0
    let firm = 0
    let tipHold = 0
    const touch = PLANT_TOUCH * frame.legScale
    const letGo = G.plantLetGo * touch
    // the walk carries a contact through its authored support even where the
    // retargeted clip lifts it early (its trailing ball and toe ride up to
    // 2.5 cm before the clip's own support ends)
    const sup = walkClip.contacts?.support?.[s]
    for (const k of CONTACTS) {
      const p = c[k]
      p.z += shift
      // the height the hold reads
      let y = p.y
      if (sup && sup[k].length) {
        // its spans as one (the walk's ball touches twice before its toe-off)
        const a = Math.min(...sup[k].map((x) => x[0]))
        const b = Math.max(...sup[k].map((x) => x[1]))
        const x = (((g.phase - a) % 1) + 1) % 1
        if (x < b - a) {
          // eased in after the touch and out before the lift, never a step
          const e = Math.max(1e-6, G.supportEase)
          y *= 1 - gait.walk * smoothstep(Math.min(1, x / e, (b - a - x) / e))
        }
      }
      _yHold[k] = y
      if (!body || y >= letGo) {
        held[k] = null
        continue
      }
      if (!held[k]) continue
      // a contact rising off the ground lets go gradually, never in one frame
      // (fully held up to 60 % of the touch height: a short leg's toe still
      // carries where the no-slide test counts it as down), and over a band
      // above the touch height, so its share of the hold fades over frames
      const w = smoothstep(Math.min(1, (letGo - y) / (letGo - 0.6 * touch)))
      if (k === 'tip') tipHold = w
      toPerson(frame, body, held[k]!, _h.set(0, 0, 0))
      _miss.x += w * (_h.x - p.x)
      _miss.z += w * (_h.z - p.z)
      down += w
      firm = Math.max(firm, w)
    }
    // the contacts' weighted mean miss, held only as firmly as the firmest
    // contact: a lone contact rising off lets the correction fade with it (the
    // mean alone divided its own weight back out, and the foot jumped the
    // whole miss when it lifted)
    if (down) _miss.multiplyScalar(firm / down)
    // Held firm, the foot sits exactly on its hold (no slide). Otherwise the
    // correction eases toward what the lifting contacts still carry (none, once
    // the foot is in the air) by the cycle walked: the contacts lift within a
    // frame or two, so their height alone could not fade it.
    // planting disabled (body null) holds nothing, not even a fading correction
    const slip = g.slip[i]
    if (body && firm < 1) {
      _miss.x = slip.x + (_miss.x - slip.x) * fade
      _miss.z = slip.z + (_miss.z - slip.z) * fade
    }
    const far = Math.hypot(_miss.x, _miss.z)
    const limit = G.plantRelease * frame.legScale
    if (body && far > limit && fw <= 0 && !g.planted[i]) {
      // Held too far from the clip's own foot (a gait blend that strides
      // otherwise than its phase, a shove): the hold gives way just enough to
      // stay within reach — a slip, never a jump. A planted foot is placed by
      // its pivot instead and rolls up on it out of reach (`heelOff`).
      _miss.multiplyScalar(limit / far)
      for (const k of CONTACTS) if (held[k]) held[k] = toWorld(frame, body, _h.copy(c[k]).add(_miss))
    }
    if (body) {
      // a contact takes hold where it touches down, by its height: the clips'
      // support intervals (step 5) already pace each leg's stance in a blend
      // (`stanceSync`); gating a hold by them left a contact touching just
      // outside its blended stance unheld, sliding 0.008 at the walk ↔ jog band
      // (measured 18.10.2026, natural-villager-motion step 10)
      for (const k of CONTACTS) {
        const p = c[k]
        if (_yHold[k] < touch && !held[k]) held[k] = toWorld(frame, body, _h.copy(p).add(_miss))
      }
    }
    slip.x = _miss.x
    slip.z = _miss.z
    _target[i].set(_t.x + _miss.x, _t.y, _t.z + _miss.z)
    // THE FLAT FOOT on the ground pivots on one held contact — its heel
    // after the landing, its ball from G.footPivotSwitch of the stance on (the
    // heel lifts about it, `heelOff`), its toe tip once the ball has lifted —
    // and hands every held contact the drawn foot's place, so the clip's hold
    // carries on from where the drawn foot stands when it lets go (no jump,
    // no slide). The toes lie flat as long as the foot does or, rolling off,
    // while their tip carries (the clip's toes, flexed onto another spot,
    // would drag the tip).
    _toeW[i] = Math.max(fw, _stanceU[i] >= G.footPivotSwitch ? tipHold * gait.walk : 0)
    // the toes let go of the ground by the cycle walked, not by their tip's
    // height alone: the clip lifts its tip through the hold's band within a
    // few frames, and the toes sprang off the ground with it
    if (body) _toeW[i] = Math.max(_toeW[i], g.lift[i].toes - walkedPhase / Math.max(1e-6, G.toeReleaseCycle))
    g.lift[i].toes = body ? _toeW[i] : 0
    _pivoted[i] = false
    if (_toeW[i] > 0 && body) {
      const first: Contact = _stanceU[i] < G.footPivotSwitch ? 'heel' : 'ball'
      const piv: Contact | null = held[first] ? first : held.heel ? 'heel' : held.ball ? 'ball' : held.tip ? 'tip' : null
      if (piv && !g.planted[i]) {
        // planting takes over from the clip's hold where it draws each
        // contact now (a contact grabbed frames apart misses by its own
        // amount; their mean is what was drawn)
        for (const k of CONTACTS) if (held[k]) held[k] = toWorld(frame, body, _h.copy(c[k]).add(_miss))
      }
      if (piv) {
        flatten(_fq.copy(world.q[foot]), _flatQ[i], fw)
        const l = _h.copy(asset.contactPoints[s][piv]).multiplyScalar(frame.legScale)
        if (piv === 'tip') {
          const toe = asset.bones.indexOf(`toe.${s}`)
          const r0 = frame.rest0
          l.applyQuaternion(flatten(_tq.copy(world.q[toe]), _flatQ[i], _toeW[i]))
          l.add(_pv.set(r0[toe * 3] - r0[foot * 3], r0[toe * 3 + 1] - r0[foot * 3 + 1], r0[toe * 3 + 2] - r0[foot * 3 + 2]).applyQuaternion(_fq))
        } else l.applyQuaternion(_fq)
        toPerson(frame, body, held[piv]!, _pv.set(0, 0, 0))
        // the pivot where the flat foot puts it lying flat (the ankle at its
        // flat height), at the height its hold reads otherwise (on the
        // ground through its authored support)
        const cp = asset.contactPoints[s]
        const r0 = frame.rest0
        const toe = asset.bones.indexOf(`toe.${s}`)
        const flatPivot = flatY + (piv === 'tip' ? r0[toe * 3 + 1] - r0[foot * 3 + 1] : 0) + cp[piv].y * frame.legScale
        _target[i].set(_pv.x - l.x, (1 - fw) * c[piv].y + fw * flatPivot - l.y, _pv.z - l.z)
        _pivoted[i] = true
        _pivotOn[i] = piv
        _clipAt[i].copy(_t)
      }
    }
    g.planted[i] = _pivoted[i]
    // THE HAND-OVER: a foot rolling off one contact onto the next, or off its
    // last into the swing, is drawn otherwise at once — over the ball its
    // toes lift off the ground, on the tip they lie on it; the roll leaves
    // the leg stretched at its reach, the clip's swing has its knee bent (near
    // straight a millimetre of ankle is a tenth of a radian of knee). Handed
    // over in one frame, the trailing leg jumped at every toe-off; from the
    // leg last drawn it blends into the new one over the walked cycle.
    const lift = g.lift[i]
    const on = _pivoted[i] ? _pivotOn[i] : null
    if (!body) lift.left = 0
    else if (lift.on && lift.on !== 'heel' && on !== lift.on) {
      lift.left = 1
      lift.to = on
      for (let k = 0; k < 16; k++) lift.from[k] = lift.last[k]
    }
    lift.on = on
  })
  // The pelvis, lowered just as far as both legs need to reach their targets
  // (a long jog stride at its toe-off; natural-villager-motion steps 5 and
  // 10) and at the clip's height when they reach them already: never for the
  // clip's own leg extension, only for what the stride warp and the holds add.
  let drop = 0
  let walkDrop = 0
  SIDES.forEach((s, i) => {
    const thigh = asset.bones.indexOf(`thigh.${s}`)
    const shin = asset.bones.indexOf(`shin.${s}`)
    const foot = asset.bones.indexOf(`foot.${s}`)
    const h = world.p[thigh]
    const reach = Math.max((legLength(frame.rest0, thigh, shin, foot) - 1e-4) * G.legReach, h.distanceTo(world.p[foot]))
    const t = _target[i]
    const flat = (t.x - h.x) ** 2 + (t.z - h.z) ** 2
    const dy = h.y - t.y
    const need = flat < reach * reach ? dy - Math.sqrt(reach * reach - flat) : dy
    drop = Math.max(drop, need)
    walkDrop = Math.max(walkDrop, Math.min(Math.max(0, need), G.walkDropMax * frame.legScale) * _support[i])
  })
  // the walk drops only as far as a foot in its stance needs, at most
  // `walkDropMax` (a walker dropping 8 cm at every toe-off reads as a limp);
  // the runs drop, their long flight strides reach no other way
  drop = Math.min(Math.max(0, drop), G.pelvisDropMax * frame.legScale) * (1 - gait.walk) + walkDrop
  if (drop > 0) {
    out.hips.y -= drop
    forwardKinematics(asset, frame.rest0, out, world)
  }
  // THE CORRECTIVE LEG SOLVE (natural-villager-motion step 10): the clip's
  // own leg, corrected only by what the target asks — the knee opened or
  // closed about the clip's own hinge, then the thigh swung by the shortest
  // turn onto the target — so a leg whose ankle already lies on its target
  // keeps the clip's locals exactly, and the correction grows continuously
  // with the miss (no thigh twist of an IK's own). Below `legCorrectMin` the
  // leg is left alone. The last pass that moves the pelvis or a leg: every
  // trunk layer and hand contact follows it (skinnedFigure.tsx).
  const min = P.legCorrectMin * frame.legScale
  // the pose and targets before the solve, for a second one under lowered hips
  _preRot.length = out.rot.length
  for (let k = 0; k < out.rot.length; k++) _preRot[k] = out.rot[k]
  _preHips.copy(out.hips)
  SIDES.forEach((_, i) => _preTarget[i].copy(_target[i]))
  const solveLegs = () => SIDES.forEach((s, i) => {
    const thigh = asset.bones.indexOf(`thigh.${s}`)
    const shin = asset.bones.indexOf(`shin.${s}`)
    const foot = asset.bones.indexOf(`foot.${s}`)
    const toe = asset.bones.indexOf(`toe.${s}`)
    const fw = _flat[i]
    const tw = _toeW[i]
    _standing[i] = false
    const far = world.p[foot].distanceTo(_target[i]) > min
    const lift = g.lift[i]
    const legBones = [thigh, shin, foot, toe]
    // the clip's own locals, which the roll's turns are carried on from
    legBones.forEach((b, j) => _clipLocal[j].fromArray(out.rot, b * 4))
    // (only onto the pivot handed to, or into the air: a contact held
    // otherwise stays where it is)
    const now = _pivoted[i] ? _pivotOn[i] : null
    const handing = lift.left > 0 && now === lift.to && CONTACTS.every((k) => k === now || !g.held[i][k])
    if (!far && fw <= 0 && tw <= 0 && !handing) {
      for (let k = 0; k < 16; k++) lift.last[k] = k % 4 === 3 ? 1 : 0
      return
    }
    // the foot (and its toes) keep their world turn through the solve; a flat
    // share turns them onto their heading alone (the rest foot lies flat)
    _keep.copy(world.q[foot])
    _keepToe.copy(world.q[toe])
    if (tw > 0) flatten(_keepToe, _flatQ[i], tw)
    if (fw > 0) flatten(_keep, _flatQ[i], fw)
    if (_pivoted[i]) {
      const k = _pivotOn[i]
      const v = _hoP.copy(asset.contactPoints[s][k]).multiplyScalar(frame.legScale)
      if (k === 'tip') {
        // on its toes: the toes lie where they carry and the foot rolls
        // about their joint (its ball stays just under it, near the ground)
        const r0 = frame.rest0
        v.set(r0[toe * 3] - r0[foot * 3], r0[toe * 3 + 1] - r0[foot * 3 + 1], r0[toe * 3 + 2] - r0[foot * 3 + 2]).applyQuaternion(_keep)
      } else v.applyQuaternion(_keep)
      const roll = heelOff(frame, world, thigh, shin, foot, _target[i], v, _keep)
      _standing[i] = roll !== 'out'
      if (roll === 'rolled' && k !== 'tip') {
        // the toes rolled over lift their tip a share of the foot's pitch
        // (a flat toe on a pitching foot pushed its tip along the ground)
        _keepToe.premultiply(_hoQ.invert().slerp(_qI, 1 - G.toeLift))
      }
    }
    // every leg stretches to the one reach a rolling foot stops at: a target
    // beyond it straightened the knee fully, so a foot handed between a pivot
    // and its clip at toe-off snapped its knee open and shut in one frame
    const hip = world.p[thigh]
    const reach = (legLength(frame.rest0, thigh, shin, foot) - 1e-4) * G.legReach
    const away = hip.distanceTo(_target[i])
    if (away > reach) _target[i].sub(hip).multiplyScalar(reach / away).add(hip)
    if (far || fw > 0 || tw > 0) correctLeg(asset, frame.rest0, out, world, thigh, shin, foot, _target[i], P.kneePoleMin * frame.legScale)
    setWorldRotation(asset, out, world, foot, _keep)
    forwardKinematics(asset, frame.rest0, out, world)
    if (tw > 0) {
      setWorldRotation(asset, out, world, toe, _keepToe)
      forwardKinematics(asset, frame.rest0, out, world)
    }
    // the hand-over (above): from the turns drawn when the pivot changed
    if (handing) {
      const r = smoothstep(lift.left)
      legBones.forEach((b, j) => {
        _qw2.fromArray(out.rot, b * 4)
        _qw3.fromArray(lift.from, j * 4).multiply(_clipLocal[j])
        _qw2.slerp(_qw3, r).toArray(out.rot, b * 4)
      })
      forwardKinematics(asset, frame.rest0, out, world)
    }
    legBones.forEach((b, j) => _qw3.fromArray(out.rot, b * 4).multiply(_qw2.copy(_clipLocal[j]).invert()).toArray(lift.last, j * 4))
    // a pivoted flat foot hands its held contacts the places drawn, and its
    // correction is the one drawn: the clip's hold carries on from there
    if (_pivoted[i] && body) {
      const held = g.held[i]
      const c = contactPoints(asset, world, frame.legScale)[s]
      for (const k of CONTACTS) if (held[k]) held[k] = toWorld(frame, body, c[k])
      g.slip[i].x = world.p[foot].x - _clipAt[i].x
      g.slip[i].z = world.p[foot].z - _clipAt[i].z
    }
  })
  solveLegs()
  // THE WALK SETS A SOLE DOWN (point 1330): a jog's long stride coming back
  // to the walk leaves no heel or ball within 4 cm of the ground — its
  // trailing foot rolled up steep on its toes or lifting off them, the
  // leading one in the air. Where the lower heel or ball lies above
  // G.walkSoleReach the walk lowers its hips by the rest (at most
  // G.pelvisDropMax, the runs' own limit) and solves the legs again from the clip's pose, each
  // foot's target lowered with them as far as its lowest contact clears
  // the ground (a foot down keeps its spot and rolls about it). From 0 at
  // that reach: never a step.
  const sw = smoothstep(Math.min(1, Math.max(0, (gait.walk - G.soleSettleWalk) / Math.max(1e-6, 1 - G.soleSettleWalk))))
  if (body && sw > 0) {
    const ce = contactPoints(asset, world, frame.legScale)
    const sole = Math.min(ce.L.heel.y, ce.L.ball.y, ce.R.heel.y, ce.R.ball.y)
    const lower = Math.min(sole - G.walkSoleReach * frame.legScale, G.pelvisDropMax * frame.legScale) * sw
    if (lower > 1e-6) {
      SIDES.forEach((s, i) => (_clear[i] = Math.max(0, Math.min(ce[s].heel.y, ce[s].ball.y, ce[s].tip.y))))
      for (let k = 0; k < out.rot.length; k++) out.rot[k] = _preRot[k]
      out.hips.copy(_preHips)
      out.hips.y -= lower
      SIDES.forEach((_, i) => {
        _target[i].copy(_preTarget[i])
        _target[i].y -= Math.min(lower, _clear[i])
      })
      forwardKinematics(asset, frame.rest0, out, world)
      solveLegs()
    }
  }
  // THE WALK STANDS ON A SOLE: where no planted foot stands after the solve
  // (a run's long stride coming back to the walk leaves its trailing foot
  // beyond reach and the leading one still in the air), the walk settles
  // onto its lower sole (heel, ball) — never a toe tip below the ground.
  // A foot counted standing can still be lifting off its held contacts
  // (point 1330: both soles 4-9 cm up in the first walk frames after a jog),
  // so wherever no heel or ball lies within G.walkSoleReach the walk settles
  // too, down to that reach (from 0 at it: never a step).
  {
    const ce = contactPoints(asset, world, frame.legScale)
    const sole = Math.min(ce.L.heel.y, ce.L.ball.y, ce.R.heel.y, ce.R.ball.y)
    const tip = Math.min(ce.L.tip.y, ce.R.tip.y)
    const w0 = G.soleSettleWalk
    const down = !_standing[0] && !_standing[1] ? Math.min(sole, tip) : 0
    const reach = Math.min(sole - G.walkSoleReach * frame.legScale, tip)
    const rest = Math.max(0, down, reach) * smoothstep(Math.min(1, Math.max(0, (gait.walk - w0) / Math.max(1e-6, 1 - w0))))
    if (rest > 0) {
      out.hips.y -= rest
      for (let k = 0; k < n; k++) world.p[k].y -= rest
    }
  }
  return out
}

/**
 * The knee's pole for a leg solve: the clip's own knee off the hip–ankle line
 * (`hip`, `knee`, `ankle`), blended to straight ahead (+z, taken across the
 * line) as the leg straightens below `straight` of offset. A knee off the
 * line backward (overstretched) gives way to ahead as well, so the blend
 * never passes through zero and stays across the line: the hinge is
 * continuous in the knee for any leg not lying along z. Unit length.
 */
export function kneePole(hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3, straight: number, out: THREE.Vector3): THREE.Vector3 {
  const line = _kl.copy(ankle).sub(hip)
  const len = line.length()
  if (len > 1e-9) line.divideScalar(len)
  // ahead, across the line
  const ahead = _ka.set(0, 0, 1).addScaledVector(line, -line.z)
  if (ahead.lengthSq() > 1e-12) ahead.normalize()
  else ahead.set(0, 0, 1)
  out.copy(knee).sub(hip)
  out.addScaledVector(line, -out.dot(line))
  const off = out.length()
  let k = smoothstep(Math.min(1, off / Math.max(1e-9, straight)))
  if (off > 1e-9) {
    out.divideScalar(off)
    // backward (≤ −0.5 against ahead) fades to ahead, reaching it straight behind
    k *= smoothstep(Math.min(1, Math.max(0, 2 * (out.dot(ahead) + 1))))
    out.multiplyScalar(k)
  } else out.set(0, 0, 0)
  return out.addScaledVector(ahead, 1 - k).normalize()
}
const _kl = new THREE.Vector3()
const _ka = new THREE.Vector3()

/**
 * The knee's turn for a leg solve: the hinge axis (into `outAxis`, unit) and
 * the angle (rad, about it) that turns the shin about the knee `knee` so the
 * hip–ankle distance becomes `want`. The hinge stands across the hip–ankle
 * line and the knee's pole (kneePole), and the knee is measured as a signed
 * bend toward that pole, so a knee crossing the line (a straight or slightly
 * overstretched clip leg) turns continuously: it opens through straight and
 * bends toward the pole, never flipping to the other side.
 */
export function kneeTurn(
  hip: THREE.Vector3,
  knee: THREE.Vector3,
  ankle: THREE.Vector3,
  want: number,
  straight: number,
  outAxis: THREE.Vector3,
): number {
  kneePole(hip, knee, ankle, straight, _kp)
  outAxis.copy(ankle).sub(hip).cross(_kp)
  if (outAxis.lengthSq() < 1e-14) outAxis.set(1, 0, 0)
  outAxis.normalize()
  const h = _hk.copy(hip).sub(knee)
  const u = _ak.copy(ankle).sub(knee)
  const hn = h.dot(outAxis)
  const un = u.dot(outAxis)
  const hh = h.lengthSq()
  const uu = u.lengthSq()
  h.addScaledVector(outAxis, -hn)
  u.addScaledVector(outAxis, -un)
  // the angle from the thigh to the shin about the hinge, in (0, 2π): below
  // π the knee bends toward the pole, π is straight, above π it bends away
  let now = Math.atan2(_kx.crossVectors(h, u).dot(outAxis), h.dot(u))
  if (now < 0) now += 2 * Math.PI
  const cos = (hh + uu - want * want - 2 * hn * un) / Math.max(1e-12, 2 * h.length() * u.length())
  return Math.acos(Math.min(1, Math.max(-1, cos))) - now
}
const _hk = new THREE.Vector3()
const _ak = new THREE.Vector3()
const _kx = new THREE.Vector3()
const _n = new THREE.Vector3()
const _kp = new THREE.Vector3()
const _r1 = new THREE.Quaternion()
const _r2 = new THREE.Quaternion()
const _qw = new THREE.Quaternion()

/**
 * Correct a posed leg (`upper` → `lower` → `end`, the hip, knee and ankle
 * joints) so its ankle reaches `target`, keeping the pose's own leg: the knee
 * turned about the pose's own hinge to the length the target needs (bent
 * toward the pose's knee, or straight ahead once the leg is straighter than
 * `straight`), then the whole leg swung about the hip by the shortest turn.
 * An ankle on its target leaves every local as it was, except on a leg at its
 * straight or folded limit, whose length is clamped just inside. Mutates `pose` and
 * recomputes `world`.
 */
export function correctLeg(
  asset: VillagerAsset,
  rest: Float32Array,
  pose: VillagerPose,
  world: WorldPose,
  upper: number,
  lower: number,
  end: number,
  target: THREE.Vector3,
  straight: number,
): void {
  const H = world.p[upper]
  const K = world.p[lower]
  const A = world.p[end]
  const a = H.distanceTo(K)
  const b = K.distanceTo(A)
  const want = Math.min(a + b - 1e-5, Math.max(Math.abs(a - b) + 1e-5, H.distanceTo(target)))
  // the hinge: across the hip–ankle line and the knee's pole, the bend
  // signed toward the pole (continuous as the knee crosses the line)
  _r1.setFromAxisAngle(_n, kneeTurn(H, K, A, want, straight, _n))
  // the knee: the shin turned about the hinge
  setWorldRotation(asset, pose, world, lower, _qw.copy(world.q[lower]).premultiply(_r1))
  forwardKinematics(asset, rest, pose, world)
  // the swing: the hip–ankle line onto the hip–target line
  _hk.copy(world.p[end]).sub(world.p[upper]).normalize()
  _ak.copy(target).sub(world.p[upper]).normalize()
  _r2.setFromUnitVectors(_hk, _ak)
  setWorldRotation(asset, pose, world, upper, _qw.copy(world.q[upper]).premultiply(_r2))
  forwardKinematics(asset, rest, pose, world)
}

/** A once/loop clip at `t` seconds (looping a loop) on the person. */
export function clipPoseAt(asset: VillagerAsset, frame: PersonFrame, clip: VillagerClip, t: number, out: VillagerPose): VillagerPose {
  ensure(out, asset.bones.length)
  sampleClip(clip, t, out)
  out.hips.multiplyScalar(frame.legScale)
  return out
}

/**
 * The pose carried onto the hung skeleton: per bone the LOCAL rotation that
 * gives the drawn bone the pose's world turn (W · hang⁻¹, the parent's taken
 * out), and the hips' place on the drawn body (figure units, body-mesh frame).
 * `ground`: the pose's ground (person units) put on the drawn sole — the hung
 * rest's sole by default; the gait grounds its contacts at 0, where the rest
 * A-pose's flat foot stands.
 */
export function toHung(
  asset: VillagerAsset,
  frame: PersonFrame,
  pose: VillagerPose,
  outLocal: THREE.Quaternion[],
  outHips: THREE.Vector3,
  ground = frame.sole,
): void {
  const n = asset.bones.length
  const world = ensureWorld(_w, n)
  forwardKinematics(asset, frame.rest0, pose, world)
  while (_hung.length < n) _hung.push(new THREE.Quaternion())
  const hung = _hung
  for (let i = 0; i < n; i++) hung[i].copy(world.q[i]).multiply(_inv.copy(frame.hang[i]).invert())
  for (let i = 0; i < n; i++) {
    const p = asset.parents[i]
    if (p < 0) outLocal[i].copy(hung[i])
    else outLocal[i].copy(_inv.copy(hung[p]).invert()).multiply(hung[i])
  }
  const h = asset.parents.indexOf(-1)
  outHips.copy(world.p[h]).setY(world.p[h].y - ground).multiplyScalar(frame.scale)
}
const _hung: THREE.Quaternion[] = []
const _inv = new THREE.Quaternion()

/**
 * The shovel on the drawn hand bone (figure units, that bone's frame): the
 * file's grip (villagerRig.ts `toolInHand`) carried through the hand's hang
 * and the person's scale.
 */
export function shovelOnHungHand(
  asset: VillagerAsset,
  frame: PersonFrame,
  hand: 'L' | 'R',
  grip: number,
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const t = toolInHand(asset, hand, grip)
  const h = frame.hang[asset.bones.indexOf(`hand.${hand}`)]
  return { position: t.position.applyQuaternion(h).multiplyScalar(frame.scale), quaternion: h.clone().multiply(t.quaternion) }
}
