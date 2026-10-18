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
}

export const newClipGait = (): ClipGait => ({ phase: 0, held: [freeFoot(), freeFoot()], slip: [{ x: 0, z: 0 }, { x: 0, z: 0 }], slipPhase: 0 })

/** Let both feet go (standing: nothing is held for the next walk). */
export function releaseClipGait(g: ClipGait): void {
  g.held = [freeFoot(), freeFoot()]
  g.slip = [{ x: 0, z: 0 }, { x: 0, z: 0 }]
}

/** How far a contact may lie above the ground and still carry (person units). */
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
 *  that foot's contacts and the last lift of the continuous support that touch
 *  begins (overlapping heel/ball/tip spans chain into one stance). Cached per
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
const _t = new THREE.Vector3()
const _miss = new THREE.Vector3()
const smoothstep = (x: number) => x * x * (3 - 2 * x)
const _h = new THREE.Vector3()
const SIDES = ['L', 'R'] as const
const _target = [new THREE.Vector3(), new THREE.Vector3()]
const _lift = [0, 0]

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
 * person's A-pose skeleton: walk and sprint blended by the sprint share, the
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
  const hips = asset.bones.indexOf('hips')
  // how far a lifted foot's correction fades this call: by the cycle walked
  const walkedPhase = (((g.phase - g.slipPhase) % 1) + 1) % 1
  g.slipPhase = g.phase
  const fade = Math.min(1, walkedPhase / Math.max(1e-6, G.plantFadeCycle))
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
    const held = g.held[i]
    _miss.set(0, 0, 0)
    let down = 0
    let firm = 0
    const touch = PLANT_TOUCH * frame.legScale
    const letGo = G.plantLetGo * touch
    for (const k of CONTACTS) {
      const p = c[k]
      p.z += shift
      if (!body || p.y >= letGo) {
        held[k] = null
        continue
      }
      if (!held[k]) continue
      // a contact rising off the ground lets go gradually, never in one frame
      // (fully held up to 60 % of the touch height: a short leg's toe still
      // carries where the no-slide test counts it as down), and over a band
      // above the touch height, so its share of the hold fades over frames
      const w = smoothstep(Math.min(1, (letGo - p.y) / (letGo - 0.6 * touch)))
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
    if (body && far > limit) {
      // Held too far from the clip's own foot (a gait blend that strides
      // otherwise than its phase, a shove): the hold gives way just enough to
      // stay within reach — a slip, never a jump.
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
        if (p.y < touch && !held[k]) held[k] = toWorld(frame, body, _h.copy(p).add(_miss))
      }
    }
    slip.x = _miss.x
    slip.z = _miss.z
    _target[i].set(_t.x + _miss.x, _t.y, _t.z + _miss.z)
  })
  // The pelvis, lowered just as far as both legs need to reach their targets
  // (a long jog stride at its toe-off; natural-villager-motion steps 5 and
  // 10) and at the clip's height when they reach them already: never for the
  // clip's own leg extension, only for what the stride warp and the holds add.
  let drop = 0
  SIDES.forEach((s, i) => {
    const thigh = asset.bones.indexOf(`thigh.${s}`)
    const shin = asset.bones.indexOf(`shin.${s}`)
    const foot = asset.bones.indexOf(`foot.${s}`)
    const h = world.p[thigh]
    const reach = Math.max((legLength(frame.rest0, thigh, shin, foot) - 1e-4) * G.legReach, h.distanceTo(world.p[foot]))
    const t = _target[i]
    const flat = (t.x - h.x) ** 2 + (t.z - h.z) ** 2
    const dy = h.y - t.y
    drop = Math.max(drop, flat < reach * reach ? dy - Math.sqrt(reach * reach - flat) : dy)
  })
  // the walk keeps its own height (its trailing foot gives way by the hold's
  // release instead: a walker dropping 8 cm at every toe-off reads as a limp);
  // the runs drop, their long flight strides reach no other way
  drop = Math.min(Math.max(0, drop), G.pelvisDropMax * frame.legScale) * (1 - gait.walk)
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
  SIDES.forEach((s, i) => {
    const thigh = asset.bones.indexOf(`thigh.${s}`)
    const shin = asset.bones.indexOf(`shin.${s}`)
    const foot = asset.bones.indexOf(`foot.${s}`)
    if (world.p[foot].distanceTo(_target[i]) <= min) return
    _keep.copy(world.q[foot])
    correctLeg(asset, frame.rest0, out, world, thigh, shin, foot, _target[i], P.kneePoleMin * frame.legScale)
    setWorldRotation(asset, out, world, foot, _keep)
    forwardKinematics(asset, frame.rest0, out, world)
  })
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
 * An ankle on its target leaves every local as it was. Mutates `pose` and
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
 */
export function toHung(
  asset: VillagerAsset,
  frame: PersonFrame,
  pose: VillagerPose,
  outLocal: THREE.Quaternion[],
  outHips: THREE.Vector3,
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
  outHips.copy(world.p[h]).setY(world.p[h].y - frame.sole).multiplyScalar(frame.scale)
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

/** Where a shovel's blade tip lies for a hand bone's world transform (any
 *  frame): the tool frame's −y end at `VILLAGER_ASSET.shovel.tip`. */
export function shovelTip(
  handWorld: THREE.Matrix4,
  attach: { position: THREE.Vector3; quaternion: THREE.Quaternion },
  tip: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out.set(0, tip, 0).applyQuaternion(attach.quaternion).add(attach.position).applyMatrix4(handWorld)
}
