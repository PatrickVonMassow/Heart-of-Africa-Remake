// The glTF villager's clips layered over the settlement's code-built pose
// (work-order "villager glTF body: animation, dress and tool"; the figure is
// skinnedFigure.tsx). Three layers, each with a weight that eases in and out
// over VILLAGER_GLTF.transitionSeconds — a change of activity is a blend,
// never a cut:
//
//   gait   the walk and sprint on legs, hips and the free arms, by the code
//          walk's own weight (0 standing … 1 walking), feet held where they
//          stand (render/villagerClipPose.ts)
//   carry  the right arm shouldering the shovel (walking: `carry` in step with
//          the gait; standing: `carryIdle`)
//   dig    the authored dig on the whole body
//
// Under them all the idle is the standing base of the trunk, neck, head and
// the free arms with their clavicles (natural-villager-motion step 8: one pose pipeline).
// What stays the code's: the standing legs, the kneel, the work crouch, and —
// added after the layers (skinnedFigure.tsx) — the trunk's lean and stoop, the
// gaze, every contact and steadying hand, the head's squat correction.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF as G, VILLAGER_POSE } from '../../config/balance'
import { clipBones, type VillagerAsset } from '../../render/villagerAsset'
import { LIVE_MORPHS, type LiveMorph } from '../../render/villagerBody'
import { clipGaitPose, clipPoseAt, gaitStance, newClipGait, releaseClipGait, samplePhase, shovelOnHungHand, stanceOf, stepClipGait, toHung, type ClipGait, type GroundBody } from '../../render/villagerClipPose'
import type { GltfPerson } from '../../render/villagerFigureBody'
import { aimHead, distributeLean, gazeDirection, LEAN_BONES, solveTwoBone, type LeanBone } from '../../render/figureRig'
import { blendPoses, newPose, type VillagerPose } from '../../render/villagerRig'
import type { FigureWork } from './placeFigureContext'
import type { ShoulderPose } from '../../render/gesture'

/** The motion a figure's clip layers read from its code-built walk. */
export interface LayerMotion {
  speed: number
  /** The walk's weight, 0 standing … 1 walking. */
  weight: number
  /** 0 standing … 1 kneeling. */
  kneel: number
}

export interface ClipLayers {
  gait: ClipGait
  ground: GroundBody | null
  /** The body's place the frame before (`ground` of the last step). */
  lastGround: GroundBody | null
  /** Layer weights, eased toward the work. */
  dig: number
  carry: number
  /** Per arm (left, right), how far the clips own it: eased toward `free`
   *  as the last applyClipLayers found it, so a hand taken for a gesture or a
   *  contact (or given back) blends between the clip and the code. */
  arms: [number, number]
  free: [boolean, boolean]
  /** Seconds into the dig clip (a loop), and the clock of the idle standing
   *  base and the carry-idle clip. */
  digT: number
  idleT: number
  pose: VillagerPose
  pose2: VillagerPose
  pose3: VillagerPose
  local: THREE.Quaternion[]
  hips: THREE.Vector3
  /** While the walk weight blends the legs between the code's stand and the
   *  gait, the foot that steps first (0 left, 1 right; -1 none chosen yet). */
  settleFirst: number
  /** Per foot, the stand's spot (world x, z) and the foot's world turn,
   *  taken as that blend began: the stand's feet stay there while the body
   *  walks off, turns or jostles. */
  settleStand: [{ x: number; z: number }, { x: number; z: number }]
  settleTurn: [THREE.Quaternion, THREE.Quaternion]
  /** The walk weight the settle last ran at: as it falls, the stand's spots
   *  are drawn onto the body's own stand (for a foot in the air the miss kept
   *  as the square of the weight's share; a landed foot holds, then steps
   *  over in the last `settleRestep`), met at weight 0. */
  settleW: number
  /** The legs' share of the gait: the walk weight as it rises, falling no
   *  faster than one settling step a foot in `settleStepSeconds`. */
  legs: number
  /** Seconds stepped (`stepClipLayers`) since the legs' share last eased. */
  dt: number
  /** How far the settle under way is a stop (1; 0 a start): the gait's legs
   *  and hips are then held as the walk let go of them (`heldLegs`,
   *  `heldHips`) and its feet where they stood (`settleGait`,
   *  `settleGaitTurn`, world) — the clip, its phase stopped, asked to keep a
   *  planted foot while the body turned on the spot gave way by a jump. A
   *  walk taken up again hands back to the live gait as the legs rise. */
  stop: number
  heldLegs: THREE.Quaternion[]
  heldHips: THREE.Vector3
  /** The gait's phase the held legs and hips were drawn at: a walk taken up
   *  again mid-stop sets the gait back there, so the live clip goes on from
   *  the held pose rather than from where its phase moved on to. */
  heldPhase: number
  settleGait: [{ x: number; z: number }, { x: number; z: number }]
  settleGaitTurn: [THREE.Quaternion, THREE.Quaternion]
  /** A start from the stand (`startFeet`): each foot stays on the stand
   *  until the walk clip lifts it, then swings onto the clip's landing over
   *  the clip's own swing. Per foot -1 not yet taken, 0 on the stand,
   *  1 swinging, 2 landed. */
  starting: boolean
  startState: [number, number]
  /** Per foot, the phase its swing began at, the stand's miss of the
   *  gait's ankle then (body frame, faded out over the swing) and the
   *  stand's turn onto the gait's foot. */
  startPhase: [number, number]
  startOff: [THREE.Vector3, THREE.Vector3]
  startTurn: [THREE.Quaternion, THREE.Quaternion]
  /** Per foot, the gait's foot turn (world) as the start took it up: a foot
   *  on the stand rolls about its ball as the clip's foot rolls off this. */
  startFlat: [THREE.Quaternion, THREE.Quaternion]
  /** Per foot, the height of the gait's ball (toe joint, body frame) as the start took it up. */
  startBall: [number, number]
  /** The foot that swung off the stand as the start set the gait (-1 none yet). */
  startFirst: number
  /** How far a foot on the stand takes up the clip's roll off its heel (0 … 1):
   *  none while the walk weight blends the legs, then over G.startRollSeconds. */
  startRoll: number
  /** Per foot, where and as the last settle drew it (ankle: world x, z and
   *  body y; turn: world), so a start cut short hands its feet on from there. */
  lastAt: [THREE.Vector3, THREE.Vector3]
  lastTurn: [THREE.Quaternion, THREE.Quaternion]
  /** Per foot, how far the ankle moved in that last frame (as `lastAt`). */
  lastMove: [THREE.Vector3, THREE.Vector3]
  /** A start cut short by a stop, its feet still to be handed on (`handFeet`). */
  handoff: boolean
  /** After that handoff, how far the stop's gait spots stay where the start
   *  left the feet (1; eased off like `stop` as a walk is taken up again),
   *  their heights (`settleGaitY`, body), and per foot the height a foot
   *  set straight on the stand still has to come down (`handY`, met at the
   *  stand by the weight's share of `handW`, the weight at the handoff). */
  anchor: number
  /** Per foot, its step's place at the handoff (the lift covers what is left). */
  handP: [number, number]
  settleGaitY: [number, number]
  handY: [number, number]
  handW: number
  /** The ground the body stepped this frame (`stepClipLayers`; 0 placed or still). */
  walked: number
  /** Standing while the body moves (the frames before a start's walk weight
   *  rises, a jostle): the stand's feet are held where they stood
   *  (`settleStand`, `settleTurn`) out to G.standHoldReach, and drawn back
   *  onto the body's stand once it no longer moves. */
  holding: boolean
  /** A start taken up from a begun stop (point 1583): each foot starts from
   *  where the stop drew it (`lastAt`), the stand drawing it back under the
   *  body at G.standHoldSettle (no step) until the clip lifts it; `resumeY`
   *  the height (body) a foot in the air there still has to come down,
   *  `resumeEase` this frame's share of both (set per frame), `resumeNew` the
   *  frame the feet are taken over. */
  resumed: boolean
  resumeNew: boolean
  resumeY: [number, number]
  resumeEase: number
}

export function clipLayers(asset: VillagerAsset): ClipLayers {
  const n = asset.bones.length
  return {
    gait: newClipGait(),
    ground: null,
    lastGround: null,
    dig: 0,
    carry: 0,
    arms: [1, 1],
    free: [true, true],
    digT: 0,
    idleT: 0,
    pose: newPose(n),
    pose2: newPose(n),
    pose3: newPose(n),
    local: Array.from({ length: n }, () => new THREE.Quaternion()),
    hips: new THREE.Vector3(),
    settleFirst: -1,
    settleStand: [{ x: 0, z: 0 }, { x: 0, z: 0 }],
    settleTurn: [new THREE.Quaternion(), new THREE.Quaternion()],
    settleW: 1,
    legs: 0,
    dt: 0,
    stop: 0,
    heldLegs: LEGS.map(() => new THREE.Quaternion()),
    heldHips: new THREE.Vector3(),
    heldPhase: 0,
    settleGait: [{ x: 0, z: 0 }, { x: 0, z: 0 }],
    settleGaitTurn: [new THREE.Quaternion(), new THREE.Quaternion()],
    starting: false,
    startState: [-1, -1],
    startPhase: [0, 0],
    startOff: [new THREE.Vector3(), new THREE.Vector3()],
    startTurn: [new THREE.Quaternion(), new THREE.Quaternion()],
    startFlat: [new THREE.Quaternion(), new THREE.Quaternion()],
    startBall: [0, 0],
    startFirst: -1,
    startRoll: 0,
    lastAt: [new THREE.Vector3(), new THREE.Vector3()],
    lastTurn: [new THREE.Quaternion(), new THREE.Quaternion()],
    lastMove: [new THREE.Vector3(), new THREE.Vector3()],
    handoff: false,
    anchor: 0,
    handP: [0, 0],
    settleGaitY: [0, 0],
    handY: [0, 0],
    handW: 0,
    walked: 0,
    holding: false,
    resumed: false,
    resumeNew: false,
    resumeY: [0, 0],
    resumeEase: 0,
  }
}

const ease = (v: number, to: number, dt: number) => {
  const step = dt / Math.max(1e-6, G.transitionSeconds)
  return to > v ? Math.min(to, v + step) : Math.max(to, v - step)
}

/** One frame: the gait's phase by the ground walked, the layers' weights
 *  toward the hands' work, the clips' clocks. */
export function stepClipLayers(
  asset: VillagerAsset,
  person: GltfPerson,
  c: ClipLayers,
  walked: number,
  speed: number,
  ground: GroundBody,
  work: FigureWork | null,
  dt: number,
): void {
  stepClipGait(c.gait, asset, person.frame, walked, speed)
  c.walked = walked
  c.lastGround = c.ground
  c.ground = { ...ground }
  c.dig = ease(c.dig, work?.dig ? 1 : 0, dt)
  // the carry stays under the dig while it eases in, and is there again after
  c.carry = ease(c.carry, work?.tool && (!work.dig || c.dig < 1) ? 1 : 0, dt)
  // the stroke on the work's clock where the caller keeps one (it stops, and the
  // pose freezes, while the bout holds or fades); else it starts from its top
  // when the dig begins and runs on while it fades
  if (work?.digT !== undefined) c.digT = work.digT
  else c.digT = c.dig > 0 ? c.digT + dt : 0
  c.arms = [ease(c.arms[0], c.free[0] ? 1 : 0, dt), ease(c.arms[1], c.free[1] ? 1 : 0, dt)]
  c.idleT += dt
  c.dt += dt
}

/** The phase nearest `phase` at which one foot is G.startSwingShare into its swing. */
function startPhase(asset: VillagerAsset, phase: number): number {
  let best = phase
  let miss = Infinity
  for (const s of LEG_SIDES) {
    const [land, lift] = stanceOf(asset.clips.walk, s)
    if (lift - land < 1e-6) continue
    const mid = (((lift + (land + 1 - lift) * G.startSwingShare) % 1) + 1) % 1
    const d = Math.abs(((mid - phase + 1.5) % 1) - 0.5)
    if (d < miss) {
      miss = d
      best = mid
    }
  }
  return best
}

const LEGS = ['hips', 'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R']
const ARM = (s: 'L' | 'R') => [`shoulder.${s}`, `upperArm.${s}`, `forearm.${s}`, `hand.${s}`]
/** The trunk, neck and head: the clips' own on the glTF body
 *  (natural-villager-motion step 8), the code's lean and gaze added after.
 *  The clavicles go with the arms (`ARM`): an arm the code takes for a
 *  contact reaches from the clavicle at rest, as its solve assumes (the
 *  idle's lowered clavicle left a pointing hand out of reach and the body
 *  sank into a full crouch for it). */
export const TRUNK = ['spine', 'spine1', 'chest', 'neck', 'head']
/** Bones the code-built pose never writes and no base layer writes in full:
 *  they return to rest before a blend. */
const UNWRITTEN = ['toe.L', 'toe.R', 'shoulder.L', 'shoulder.R']

function blendInto(asset: VillagerAsset, bones: Record<string, THREE.Bone>, names: readonly string[], local: THREE.Quaternion[], w: number) {
  if (w <= 0) return
  for (const n of names) {
    const b = bones[n]
    const i = asset.bones.indexOf(n)
    if (b && i >= 0) b.quaternion.slerp(local[i], Math.min(1, w))
  }
}

function blendHips(bones: Record<string, THREE.Bone>, hips: THREE.Vector3, w: number) {
  if (w <= 0) return
  bones.hips.position.lerp(hips, Math.min(1, w))
}

/**
 * Write the layers onto the bones, after the code-built pose has been written
 * (so each layer blends from it). `free` says which arm (left, right) the code
 * left hanging — those take the gait's swing and the carry, eased in and out
 * over the transition as an arm is taken or given back (`ClipLayers.arms`).
 */
export function applyClipLayers(
  asset: VillagerAsset,
  person: GltfPerson,
  bones: Record<string, THREE.Bone>,
  c: ClipLayers,
  m: LayerMotion,
  free: readonly [boolean, boolean],
): void {
  for (const n of UNWRITTEN) bones[n]?.quaternion.identity()
  // the code writes the hips' height only: their sway returns to rest first
  const h = asset.parents.indexOf(-1)
  bones.hips.position.x = person.rest[h * 3]
  bones.hips.position.z = person.rest[h * 3 + 2]
  c.free = [free[0], free[1]]
  const f = person.frame
  const walking = m.weight * (1 - m.kneel)
  // the legs leave the gait at the settling steps' own pace (each foot's
  // step a swing's time, not a share of the walk's fade)
  const before = c.legs
  const dt = c.dt
  c.legs = Math.max(m.weight, c.legs - dt / (2 * Math.max(1e-6, G.settleStepSeconds)))
  // taken up again mid-stop, the legs rise back no faster than they fell (the
  // walk's fade-in handed the held stop to the gait in five frames)
  if (c.stop > 0 && c.legs > before) c.legs = Math.min(c.legs, before + dt / (2 * Math.max(1e-6, G.settleStepSeconds)))
  c.resumeEase = dt
  c.dt = 0
  // A START FROM THE STAND: the gait set G.startSwingShare into the swing
  // of the foot that steps first (the other under the body as on the
  // stand); the start's feet step on past the blend until both are on the clip
  if (!c.starting && before <= 0 && c.legs > 0 && c.legs < 1 && m.kneel <= 0 && c.dig < 1) {
    c.starting = true
    c.startState = [-1, -1]
    c.startFirst = -1
    c.startRoll = 0
    c.handoff = false
    c.anchor = 0
    c.resumed = false
    c.gait.phase = startPhase(asset, c.gait.phase)
  } else if (!c.starting && c.stop > 0 && c.settleFirst >= 0 && !c.handoff && c.anchor <= 0 && before < 1 && c.legs > before && m.kneel <= 0 && c.dig < 1) {
    // A WALK TAKEN UP FROM A BEGUN STOP (point 1583): a start from where the
    // stop drew the feet, the gait set back to the phase the held legs were
    // drawn at (the live clip, its phase moved on, took the held stop over by
    // a jump)
    c.starting = true
    c.startState = [-1, -1]
    c.startFirst = -1
    c.startRoll = 0
    c.resumed = true
    c.resumeNew = true
    c.gait.phase = c.heldPhase
  } else if (c.starting && (c.legs < before || m.kneel > 0)) {
    // cut short: the stop takes the feet on from where the start drew them
    c.starting = false
    c.handoff = true
  }
  if (c.starting && c.startState[0] === 2 && c.startState[1] === 2) c.starting = false
  if (!c.starting) c.resumed = false
  const legs = c.legs * (1 - m.kneel)
  // standing while the body moves (point 1582): the stand's feet stay where
  // they stood rather than slide with the body — the frames before a start's
  // walk weight rises (it waits for the smoothed speed), or a jostle; a
  // placement (no ground walked) lets go
  const g0 = c.ground
  const g1 = c.lastGround
  // (a turn on the spot moves the stand's feet too: stepWalk counts it walked)
  const shifted = !!g0 && !!g1 && (Math.hypot(g0.x - g1.x, g0.z - g1.z) > 1e-9 || Math.abs(Math.atan2(Math.sin(g0.yaw - g1.yaw), Math.cos(g0.yaw - g1.yaw))) > 1e-9)
  const travelled = shifted && c.walked !== 0
  if (legs > 1e-3 || c.dig >= 1 || m.kneel > 0 || (shifted && !travelled)) c.holding = false
  else if (travelled) c.holding = true
  // Each layer blends from what the one below left, so the dig eases in from
  // the carry (or the walk) and out to it again — never from the rest pose.
  const under = c.dig < 1
  // THE STANDING BASE (step 8): the idle on the trunk, neck and head in
  // full, and on each arm (clavicle included) the clips own; the legs stay the
  // code's (its stance, work crouch and kneel), the walk layers over it
  const idle = asset.clips.idle
  if (idle) {
    clipPoseAt(asset, f, idle, c.idleT % idle.duration, c.pose)
    toHung(asset, f, c.pose, c.local, c.hips)
    blendInto(asset, bones, TRUNK, c.local, 1)
    blendInto(asset, bones, ARM('L'), c.local, c.arms[0])
    blendInto(asset, bones, ARM('R'), c.local, c.arms[1])
  }
  // THE GAIT
  if (legs > 1e-3 && under) {
    clipGaitPose(c.gait, asset, f, m.speed, c.ground, c.pose)
    // the gait grounds its contacts at 0 (the rest A-pose's sole), not at the hung rest's
    toHung(asset, f, c.pose, c.local, c.hips, 0)
    const w = legs
    // starting or stopping, the feet step between the stand and the gait
    // (a bone blend alone slid a foot on the ground from one to the other);
    // a kneel setting in takes the step's correction out as it folds the legs
    const settle = w < 1 || c.starting ? Math.max(0, 1 - m.kneel) : 0
    if (settle > 0) takeCodeLegs(bones)
    else {
      c.settleFirst = -1
      c.anchor = 0
      c.handoff = false
    }
    // stopping, the legs and hips stay as the gait last drew them walking
    if (settle > 0 && c.settleFirst < 0) c.stop = c.legs < before ? 1 : 0
    else if (c.stop > 0 && c.legs > before) c.stop *= before < 1 ? (1 - c.legs) / (1 - before) : 0
    if (c.anchor > 0 && c.legs > before) c.anchor *= before < 1 ? (1 - c.legs) / (1 - before) : 0
    // a stop reversing a start mid-blend takes the hold in as the legs fall,
    // full at the stand, from the gait as it was drawn the frame before
    else if (c.stop < 1 && c.legs < before) c.stop = 1 - (1 - c.stop) * (before > 0 ? c.legs / before : 0)
    const hold = settle > 0 ? c.stop : 0
    LEGS.forEach((n, k) => {
      const q = c.local[asset.bones.indexOf(n)]
      if (hold > 0) q.slerp(c.heldLegs[k], hold)
      else c.heldLegs[k].copy(q)
    })
    if (hold > 0) c.hips.lerp(c.heldHips, hold)
    else {
      c.heldHips.copy(c.hips)
      c.heldPhase = c.gait.phase
    }
    // stopping, the hips over the second step by the square of the weight: a leg near
    // straight on the stand bends by the root of the hips' drop, so a drop
    // linear in the weight still held a bent knee the frame before the
    // stand took over
    const hw = w - settle * hold * (w - w * Math.min(1, 2 * w))
    blendInto(asset, bones, LEGS.slice(1), c.local, w)
    blendInto(asset, bones, ['hips'], c.local, hw)
    blendHips(bones, c.hips, hw)
    if (c.starting && c.legs >= 1) c.startRoll = Math.min(1, c.startRoll + dt / Math.max(1e-6, G.startRollSeconds))
    if (settle > 0) settleFeet(asset, bones, c, w, settle, f.legScale)
    blendInto(asset, bones, TRUNK, c.local, walking)
    blendInto(asset, bones, ARM('L'), c.local, walking * c.arms[0])
    // under a carry too, so a carry partly overriding the arm stays continuous
    blendInto(asset, bones, ARM('R'), c.local, walking * c.arms[1])
  } else if (c.holding) {
    // the legs the code's stand, each foot solved onto where it is held
    releaseClipGait(c.gait)
    takeCodeLegs(bones)
    c.stop = 0
    c.anchor = 0
    c.handoff = false
    // held while the body moves; drawn back onto its stand once it stops
    const miss = settleFeet(asset, bones, c, 0, 1, f.legScale, travelled ? 0 : G.standHoldSettle * dt)
    if (!travelled && miss <= 1e-4) {
      c.holding = false
      c.settleFirst = -1
    }
  } else {
    // standing: the feet are where they stand, nothing held for the next walk
    releaseClipGait(c.gait)
    c.settleFirst = -1
    c.anchor = 0
    c.handoff = false
  }
  // THE SHOVEL CARRIED: the right arm from the carry, in step with the gait
  if (c.carry > 0 && under && c.arms[1] > 0) {
    samplePhase(asset.clips.carry, c.gait.phase, f, c.pose2)
    clipPoseAt(asset, f, asset.clips.carryIdle, c.idleT % asset.clips.carryIdle.duration, c.pose3)
    blendPoses(
      [
        { pose: c.pose2, w: walking },
        { pose: c.pose3, w: 1 - walking },
      ],
      c.pose,
    )
    toHung(asset, f, c.pose, c.local, c.hips)
    blendInto(asset, bones, ARM('R'), c.local, c.carry * c.arms[1])
  }
  // THE DIG, on the whole body
  if (c.dig > 0) {
    clipPoseAt(asset, f, asset.clips.dig, c.digT % asset.clips.dig.duration, c.pose)
    toHung(asset, f, c.pose, c.local, c.hips)
    // every bone a clip writes: the column bones stay the driver's
    blendInto(asset, bones, clipBones(asset), c.local, c.dig)
    blendHips(bones, c.hips, c.dig)
  }
}

const LEG_SIDES = ['L', 'R'] as const
const legNames = (s: 'L' | 'R') => [`thigh.${s}`, `shin.${s}`, `foot.${s}`, `toe.${s}`]
const legChain = (bones: Record<string, THREE.Bone>, s: 'L' | 'R') => legNames(s).map((n) => bones[n])
/** The gait's local turn of leg bone `k` (legNames order) on side `s`. */
const gaitLocal = (asset: VillagerAsset, c: ClipLayers, s: 'L' | 'R', k: number) => c.local[asset.bones.indexOf(legNames(s)[k])]
const _codeLeg = LEG_SIDES.map(() => [0, 1, 2, 3].map(() => new THREE.Quaternion()))
const _codeHipsQ = new THREE.Quaternion()
const _codeHipsP = new THREE.Vector3()
const _blendHipsQ = new THREE.Quaternion()
const _blendHipsP = new THREE.Vector3()
const _stand = [new THREE.Vector3(), new THREE.Vector3()]
const _gait = [new THREE.Vector3(), new THREE.Vector3()]
const _standQ = [new THREE.Quaternion(), new THREE.Quaternion()]
const _gaitQ = [new THREE.Quaternion(), new THREE.Quaternion()]
const _footQ = new THREE.Quaternion()
const _yawQ = new THREE.Quaternion()
const _yawQ2 = new THREE.Quaternion()
const _liveW = { x: 0, z: 0 }
const _liveQ = new THREE.Quaternion()
/** Per foot, a landed foot's lift (world) as it steps the stand's miss (place and turn) over. */
const _lift = [0, 0]
const _plain = LEG_SIDES.map(() => [0, 1, 2, 3].map(() => new THREE.Quaternion()))
const _yAxis = new THREE.Vector3(0, 1, 0)
const _ik = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _target = [new THREE.Vector3(), new THREE.Vector3()]
/** Per foot, the ball (the toe's joint) off the ankle in the stand's foot frame. */
const _ball = [new THREE.Vector3(), new THREE.Vector3()]
/** Per foot, the gait's ball (body frame). */
const _gaitBall = [new THREE.Vector3(), new THREE.Vector3()]

/** The code-built legs and hips, before the gait blends over them. */
function takeCodeLegs(bones: Record<string, THREE.Bone>): void {
  LEG_SIDES.forEach((s, i) => legChain(bones, s).forEach((b, k) => _codeLeg[i][k].copy(b.quaternion)))
  _codeHipsQ.copy(bones.hips.quaternion)
  _codeHipsP.copy(bones.hips.position)
}

/**
 * Each foot's share of its settling step as the walk weight `w` blends the
 * legs between the stand (w = 0) and the gait (w = 1): the `first` foot steps
 * over the first half of the way from the gait to the stand, the other over
 * the second, so one foot always stands. 0 = on the gait's spot, 1 = on the
 * stand's.
 */
export function settleShares(w: number, first: number): [number, number] {
  const u = 1 - Math.min(1, Math.max(0, w))
  const a = Math.min(1, Math.max(0, 2 * u))
  const b = Math.min(1, Math.max(0, 2 * u - 1))
  return first === 1 ? [b, a] : [a, b]
}

/**
 * A settling step's share of its way over the ground at share `s` of the
 * step. Stopping, the foot rises before it moves and sets down above its
 * spot, over G.settleStepSetDown of the step each: a knee near straight
 * lifts the foot by the square of its bend, so a foot moving on as it
 * left or met the ground slid along it. Starting, over the whole step.
 */
function stepPlace(s: number, stop: number): number {
  const m = G.settleStepSetDown * stop
  const u = Math.min(1, Math.max(0, (s - m) / (1 - 2 * m)))
  return u * u * (3 - 2 * u)
}

/** Body-frame (the hips' parent: figure units, facing +z) x, z → world x, z (as the gait's hold maps them). */
function bodyToWorld(b: GroundBody, p: THREE.Vector3, out: { x: number; z: number }): void {
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const lx = p.x * b.unit
  const lz = p.z * b.unit
  out.x = b.x + lx * c + lz * s
  out.z = b.z - lx * s + lz * c
}

/** World x, z → body frame x, z (y left as it is). */
function worldToBody(b: GroundBody, h: { x: number; z: number }, out: THREE.Vector3): void {
  const dx = h.x - b.x
  const dz = h.z - b.z
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const k = 1 / (b.unit || 1)
  out.x = (dx * c - dz * s) * k
  out.z = (dx * s + dz * c) * k
}

/** The ankle to the toe's joint (world): the radius a foot's turn sweeps its ball round. */
function footLength(bones: Record<string, THREE.Bone>, s: 'L' | 'R'): number {
  return bones[`foot.${s}`].getWorldPosition(_p[0]).distanceTo(bones[`toe.${s}`].getWorldPosition(_p[1]))
}

/** The ankle's place and the foot's turn (body frame) with the legs and hips as given. */
function ankleAt(bones: Record<string, THREE.Bone>, s: 'L' | 'R', out: THREE.Vector3, turn: THREE.Quaternion): THREE.Vector3 {
  bones.hips.updateMatrixWorld(true)
  inBody(bones[`foot.${s}`], out, turn)
  return out
}

/** A start's per foot share of the stand (1 on it … 0 on the gait) and ankle target (body frame). */
const _startP = [0, 0]
const _startT = [new THREE.Vector3(), new THREE.Vector3()]
const _startQ = [new THREE.Quaternion(), new THREE.Quaternion()]

/**
 * THE START FROM THE STAND (point 1582): each foot stays on the stand's spot
 * (`_stand`, held in the world) until the walk clip lifts it; from there it
 * swings onto the clip's own landing over the clip's swing, the stand's miss
 * of the gait's ankle as the swing began faded out by its progress, so the
 * knee follows the clip's own bend (a step timed by the walk weight lifted
 * a straight leg in a tenth of a second and snapped the knee). The foot that
 * is mid-swing as the start sets the gait (`startPhase`) swings at once.
 */
function startFeet(c: ClipLayers, body: GroundBody | null): void {
  const yaw = body?.yaw ?? 0
  const cyc = (x: number) => ((x % 1) + 1) % 1
  const phase = c.gait.phase
  LEG_SIDES.forEach((_, i) => {
    const [land, lift] = gaitStance(i)
    const span = lift - land
    // in the clip's swing: past its lift, before its next landing
    const swinging = span > 1e-6 && cyc(phase - land) >= span
    if (c.startState[i] === -1) {
      c.startState[i] = 0
      c.startFlat[i].copy(_gaitQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, yaw))
      c.startBall[i] = _gaitBall[i].y
    }
    // a foot on the stand rolls off its heel about its ball as the clip's
    // foot rolls off the turn it had as the start began, and rises off its
    // toes as the clip's ball does (held flat, the hips walking on stretched
    // the leg to the clip's lift, and the foot left the stand by a jump onto
    // the clip's rolled foot); flat while the walk weight blends the legs,
    // taken up over G.startRollSeconds once they are on the walk
    if (c.startState[i] === 0 && c.startRoll > 0) {
      const r = c.startRoll * c.startRoll * (3 - 2 * c.startRoll)
      _yawQ.setFromAxisAngle(_yAxis, -yaw)
      const roll = _liveQ.copy(_yawQ).multiply(c.startFlat[i]).invert().premultiply(_gaitQ[i])
      roll.slerp(_q.identity(), 1 - r)
      const toBall = _ik[4].copy(_ball[i]).applyQuaternion(_standQ[i])
      _stand[i].add(toBall).sub(toBall.applyQuaternion(roll))
      _standQ[i].premultiply(roll)
      _stand[i].y += Math.max(0, _gaitBall[i].y - c.startBall[i]) * r
    }
    // the foot on the stand leaves it only while the clip swings it (left in
    // the clip's stance, it drifted off the stand for nearly a cycle), and
    // never while the other is in the air, so one foot always stands
    if (c.startState[i] === 0 && swinging && c.startState[1 - i] !== 1) {
      c.startState[i] = 1
      if (c.startFirst < 0) c.startFirst = i
      c.startPhase[i] = phase
      c.startOff[i].copy(_stand[i]).sub(_gait[i])
      c.startTurn[i].copy(_gaitQ[i]).invert().multiply(_standQ[i])
    }
    let k = 0
    let arc = 0
    if (c.startState[i] === 1) {
      const whole = cyc(land - c.startPhase[i])
      const u = whole > 1e-6 ? cyc(phase - c.startPhase[i]) / whole : 1
      // landed: the progress has run past the landing
      if (u >= 1 || (!swinging && cyc(phase - land) < 0.5 * span && u > 0.5)) c.startState[i] = 2
      else {
        k = 1 - u * u * (3 - 2 * u)
        arc = Math.sin(Math.PI * u) ** G.startLiftPower
      }
    }
    _startP[i] = c.startState[i] === 0 ? 1 : k
    if (c.startState[i] === 0) {
      _startT[i].copy(_stand[i])
      _startQ[i].copy(_standQ[i])
    } else {
      _startT[i].copy(_gait[i]).addScaledVector(c.startOff[i], k)
      // lifted over the stand's miss as a settling step is (it skimmed the ground)
      _startT[i].y += G.settleStepLift * Math.hypot(c.startOff[i].x, c.startOff[i].z) * arc
      _startQ[i].copy(_gaitQ[i]).slerp(_liveQ.copy(_gaitQ[i]).multiply(c.startTurn[i]), k)
    }
  })
}

/**
 * THE SETTLING STEP (point 1330): while the walk weight blends the legs
 * between the code's stand and the gait, each foot steps from the gait's
 * spot to the stand's (or back) instead of sliding there on the ground — one
 * foot at a time (the one off the ground first, so the other stands), lifted
 * on an arc of G.settleStepLift of its travel, the leg solved onto it and the
 * foot turned between the gait's turn and the stand's; a foot on the stand
 * keeps its world place and turn whatever the blended hips or the body's
 * heading do. As the weight falls those spots are drawn onto the body's own
 * stand (met at 0, where the standing legs take over without a jump): a foot
 * in the air as it goes, a landed one by a lifted re-step at the end. `share` (0 … 1): how much of this correction is drawn over the plain
 * bone blend (a kneel setting in takes it out).
 */
function settleFeet(asset: VillagerAsset, bones: Record<string, THREE.Bone>, c: ClipLayers, w: number, share: number, legScale: number, ease = 0): number {
  const hips = bones.hips
  if (hips.parent) _base.copy(hips.parent.matrixWorld).invert()
  else _base.identity()
  LEG_SIDES.forEach((s, i) => legChain(bones, s).forEach((b, k) => _plain[i][k].copy(b.quaternion)))
  _blendHipsQ.copy(hips.quaternion)
  _blendHipsP.copy(hips.position)
  const hi = asset.bones.indexOf('hips')
  // each foot's two spots and turns: the stand's (code legs and hips) and the gait's
  hips.quaternion.copy(_codeHipsQ)
  hips.position.copy(_codeHipsP)
  LEG_SIDES.forEach((s, i) => legChain(bones, s).forEach((b, k) => b.quaternion.copy(_codeLeg[i][k])))
  LEG_SIDES.forEach((s, i) => {
    ankleAt(bones, s, _stand[i], _standQ[i])
    if (!c.starting) return
    inBody(bones[`toe.${s}`], _ball[i], _q)
    _ball[i].sub(_stand[i]).applyQuaternion(_q.copy(_standQ[i]).invert())
  })
  hips.quaternion.copy(c.local[hi])
  hips.position.copy(c.hips)
  LEG_SIDES.forEach((s) => legChain(bones, s).forEach((b, k) => b.quaternion.copy(gaitLocal(asset, c, s, k))))
  LEG_SIDES.forEach((s, i) => {
    ankleAt(bones, s, _gait[i], _gaitQ[i])
    if (c.starting) inBody(bones[`toe.${s}`], _gaitBall[i], _q)
  })
  hips.quaternion.copy(_blendHipsQ)
  hips.position.copy(_blendHipsP)
  const body = c.ground
  if (c.settleFirst < 0) {
    // the foot the gait holds off the ground steps first; else the further one
    const air = LEG_SIDES.map((_, i) => _gait[i].y - _stand[i].y)
    const far = LEG_SIDES.map((_, i) => Math.hypot(_gait[i].x - _stand[i].x, _gait[i].z - _stand[i].z))
    const tol = 0.01 * (hips.position.y || 1)
    c.settleFirst = Math.abs(air[0] - air[1]) > tol ? (air[0] > air[1] ? 0 : 1) : far[0] >= far[1] ? 0 : 1
    // where the stand stood last frame: a body walking off has left it this one
    const was = c.lastGround ?? body
    LEG_SIDES.forEach((_, i) => {
      if (was) bodyToWorld(was, _stand[i], c.settleStand[i])
      c.settleTurn[i].copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, was?.yaw ?? 0))
    })
    c.settleW = w
    LEG_SIDES.forEach((_, i) => {
      if (was) bodyToWorld(was, _gait[i], c.settleGait[i])
      c.settleGaitTurn[i].copy(_gaitQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, was?.yaw ?? 0))
    })
  }
  // stopping, the gait's feet stay where they stood as the walk let go
  // (after a start cut short, as the start left them, height too)
  const held = Math.max(c.stop, c.anchor)
  if (held > 0 && body) {
    LEG_SIDES.forEach((_, i) => {
      worldToBody(body, c.settleGait[i], _ik[3].copy(_gait[i]))
      _ik[3].y += (c.settleGaitY[i] - _gait[i].y) * (c.anchor / held)
      _gait[i].lerp(_ik[3], held)
      _gaitQ[i].slerp(_liveQ.copy(c.settleGaitTurn[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, -body.yaw)), held)
    })
  }
  // the stand's feet where and as they stood as the blend began, drawn onto
  // the body's own stand as the weight falls (the miss by the square of the
  // weight's share: met at 0, the last frames' share of it small) — a foot
  // in the air only: one landed on the stand holds its spot and turn until
  // the last G.settleRestep of the weight, then steps the miss over, lifted
  // (a smooth share of it, met at 0)
  // a start cut short: the shares give the foot that has to step (the one
  // in the air, else the one off the stand) the step still under way — the
  // first's above half weight, the second's below — so the other stands
  if (c.handoff) {
    const air = c.startState.indexOf(1)
    const off = air >= 0 ? air : c.startState[0] === 2 ? 0 : 1
    c.settleFirst = w > 0.5 ? off : 1 - off
  }
  // standing while the body moves: each foot held out to G.standHoldReach
  // and G.standHoldTurn off the body's stand, eased back by `ease` (figure
  // units; the turn in proportion); the miss left, as a share of those
  let miss = 0
  if (c.holding && body) {
    const unit = body.unit || 1
    const turnEase = (ease * G.standHoldTurn) / G.standHoldReach
    LEG_SIDES.forEach((_, i) => {
      bodyToWorld(body, _stand[i], _liveW)
      const dx = c.settleStand[i].x - _liveW.x
      const dz = c.settleStand[i].z - _liveW.z
      const d = Math.hypot(dx, dz) / unit
      const keepD = Math.min(G.standHoldReach, Math.max(0, d - ease))
      const k = d > 1e-9 ? keepD / d : 0
      c.settleStand[i].x = _liveW.x + dx * k
      c.settleStand[i].z = _liveW.z + dz * k
      _liveQ.copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, body.yaw))
      const a = c.settleTurn[i].angleTo(_liveQ)
      const keepA = Math.min(G.standHoldTurn, Math.max(0, a - turnEase))
      if (a > 1e-9) c.settleTurn[i].slerp(_liveQ, 1 - keepA / a)
      miss = Math.max(miss, keepD / G.standHoldReach, keepA / G.standHoldTurn)
    })
  }
  // a start from a begun stop: the feet from where the stop drew them, a
  // foot still on the stand drawn back onto the body's (as a standing body
  // jostled), one in the air set down over G.settleStepSeconds
  if (c.resumed && body) {
    const unit = body.unit || 1
    LEG_SIDES.forEach((_, i) => {
      if (c.resumeNew) {
        c.settleStand[i].x = c.lastAt[i].x
        c.settleStand[i].z = c.lastAt[i].z
        c.settleTurn[i].copy(c.lastTurn[i])
        c.resumeY[i] = Math.max(0, c.lastAt[i].y - _stand[i].y)
        return
      }
      if (c.startState[i] > 0) return
      c.resumeY[i] = Math.max(0, c.resumeY[i] - (c.resumeEase * (hips.position.y || 1)) / Math.max(1e-6, G.settleStepSeconds))
      const ease = G.standHoldSettle * c.resumeEase
      bodyToWorld(body, _stand[i], _liveW)
      const dx = c.settleStand[i].x - _liveW.x
      const dz = c.settleStand[i].z - _liveW.z
      const d = Math.hypot(dx, dz) / unit
      const k = d > 1e-9 ? Math.max(0, d - ease) / d : 0
      c.settleStand[i].x = _liveW.x + dx * k
      c.settleStand[i].z = _liveW.z + dz * k
      _liveQ.copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, body.yaw))
      const a = c.settleTurn[i].angleTo(_liveQ)
      const turnEase = (ease * G.standHoldTurn) / G.standHoldReach
      if (a > 1e-9) c.settleTurn[i].slerp(_liveQ, Math.min(1, turnEase / a))
    })
    c.resumeNew = false
  }
  const shares = settleShares(w, c.settleFirst)
  const falling = w < c.settleW && c.settleW > 0
  const keep = falling ? (w / c.settleW) ** 2 : 1
  // (after a start cut short below it, over the weight left at the handoff)
  const R = c.anchor > 0 ? Math.min(G.settleRestep, c.handW) : G.settleRestep
  const left = (x: number) => 1 - stepPlace(1 - Math.min(1, x / R), 1)
  const restep = falling && w < R ? (left(c.settleW) > 0 ? left(w) / left(c.settleW) : 0) : 1
  LEG_SIDES.forEach((_, i) => {
    const yaw = body?.yaw ?? 0
    const k = shares[i] >= 1 ? restep : keep
    _lift[i] = 0
    if (body && k < 1) {
      bodyToWorld(body, _stand[i], _liveW)
      const dx = c.settleStand[i].x - _liveW.x
      const dz = c.settleStand[i].z - _liveW.z
      if (shares[i] >= 1) {
        // the step covers the ankle's miss and the sweep of the turn's (heel and ball round the ankle)
        _liveQ.copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, yaw))
        const sweep = c.settleTurn[i].angleTo(_liveQ) * footLength(bones, LEG_SIDES[i])
        _lift[i] = G.settleStepLift * (Math.hypot(dx, dz) + sweep) * Math.sin(Math.PI * (1 - w / R)) ** 2
      }
      c.settleStand[i].x = _liveW.x + dx * k
      c.settleStand[i].z = _liveW.z + dz * k
    }
    if (k < 1) c.settleTurn[i].slerp(_liveQ.copy(_standQ[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, yaw)), 1 - k)
    if (body) worldToBody(body, c.settleStand[i], _stand[i])
    _standQ[i].copy(c.settleTurn[i]).premultiply(_yawQ.setFromAxisAngle(_yAxis, -yaw))
  })
  c.settleW = w
  if (c.resumed) LEG_SIDES.forEach((_, i) => (_stand[i].y += c.resumeY[i]))
  if (c.starting) startFeet(c, body)
  if (c.handoff && body) handFeet(c, body, shares, w)
  // each leg's blended chain and its ankle's target
  let drop = 0
  hips.updateMatrixWorld(true)
  LEG_SIDES.forEach((s, i) => {
    const step = c.starting ? 0 : shares[i]
    // starting, the leg drawn as the clip draws it (its knee bent where the clip bends it)
    const p = c.starting ? 0 : handPlace(c, i, stepPlace(step, c.stop))
    legChain(bones, s).forEach((b, k) => b.quaternion.copy(_codeLeg[i][k]).slerp(gaitLocal(asset, c, s, k), 1 - p))
    const T = _target[i]
    if (c.starting) T.copy(_startT[i])
    else T.copy(_gait[i]).lerp(_stand[i], p)
    // lifted at mid-step by a share of the ground it covers (and a landed
    // foot's re-step). Stopping, by the square of the arc's sine: a knee near
    // straight bends by the root of the lift, so a lift rising with the
    // sine itself snapped the knee up at the step's start and down at its
    // landing. Starting, the step keeps pace with the walk's fade-in (a body
    // walking off leaves no time for a slower one).
    // (after a handoff, what was left of the way then: the gait spot was set out beyond it)
    const cover = Math.hypot(_gait[i].x - _stand[i].x, _gait[i].z - _stand[i].z) * (1 - c.handP[i] * c.anchor)
    const arc = Math.sin(Math.PI * step)
    T.y += G.settleStepLift * cover * arc * (1 - c.stop + c.stop * arc) + _lift[i] / (body?.unit || 1)
    if (c.anchor > 0 && c.handW > 0) T.y += c.handY[i] * Math.min(1, w / c.handW)
    // stopping, the pelvis lowered just as far as each leg needs to reach its target
    // no straighter than its blended chain: a foot held while the hips leave
    // the gait was pulled out to a straight knee, which the step then bent
    // by a jump (a leg's bend goes with the root of its shortening there)
    const chain = legChain(bones, s)
    chain[0].updateMatrixWorld(true)
    const [H, K, A] = _ik
    inBody(chain[0], H, _q)
    inBody(chain[1], K, _q)
    inBody(chain[2], A, _q)
    // starting, the legs are the clip's own: a foot on the stand needs the
    // hips lowered only past the leg's full reach
    const reach = c.starting ? H.distanceTo(K) + K.distanceTo(A) : H.distanceTo(A)
    const flat = (T.x - H.x) ** 2 + (T.z - H.z) ** 2
    const dy = H.y - T.y
    const need = flat < reach * reach ? dy - Math.sqrt(reach * reach - flat) : dy
    // starting, by the foot standing on (or stepping off) the stand (point
    // 1582 review): a body turning or shoved sideways as it sets off carried
    // the hips past that leg's reach and dragged the planted foot; its need
    // fades with its step's share of the stand
    if (!c.starting) drop = Math.max(drop, need)
    else if (i !== c.startFirst && c.startState[i] <= 1) drop = Math.max(drop, need * _startP[i])
  })
  hips.position.y -= Math.min(drop, G.pelvisDropMax * legScale) * share * (c.starting || c.holding ? 1 : c.stop)
  LEG_SIDES.forEach((s, i) => {
    const step = shares[i]
    const p = handPlace(c, i, stepPlace(step, c.stop))
    const chain = legChain(bones, s)
    const [H, K, A, , pole] = _ik
    const T = _target[i]
    // the foot turned from the gait's turn to the stand's with its step
    if (c.starting) _footQ.copy(_startQ[i])
    else _footQ.copy(_gaitQ[i]).slerp(_standQ[i], p)
    hips.updateMatrixWorld(true)
    inBody(chain[0], H, _q)
    inBody(chain[1], K, _q)
    inBody(chain[2], A, _q)
    const a = H.distanceTo(K)
    const b = K.distanceTo(A)
    // THE LEG NEVER SOLVED STRAIGHT: near its full reach a leg's bend goes
    // with the root of its shortening, so a target crossing it bent the knee
    // by a jump. Stopping, within G.settleSoftReach of the reach (by
    // 4w(1 − w): none at the gait, nor at the stand with the code's straight
    // legs) the reach eases in, the ankle falling just short of a target
    // further out
    const soft = c.stop * G.settleSoftReach * (a + b) * 4 * w * (1 - w)
    const toT = _p[1].copy(T).sub(H)
    const d = toT.length()
    if (soft > 0 && d > a + b - soft) {
      const from = a + b - soft
      T.copy(H).addScaledVector(toT, (from + soft * (1 - Math.exp(-(d - from) / soft))) / d)
    }
    // the knee bends where it bends now (forward where the leg is straight)
    const line = _p[0].copy(A).sub(H).normalize()
    pole.copy(K).sub(H)
    pole.addScaledVector(line, -pole.dot(line))
    if (pole.lengthSq() < 1e-10) pole.set(0, 0, 1)
    const sol = solveTwoBone(H, T, a, b, pole)
    swing(chain[0], K.clone().sub(H), sol.upper)
    inBody(chain[1], K, _q)
    inBody(chain[2], A, _q)
    swing(chain[1], A.clone().sub(K), sol.fore)
    inBody(chain[1], _s, _q)
    chain[2].quaternion.copy(_q.invert().multiply(_footQ))
    // drawn over the plain blend by `share`
    if (share < 1) chain.forEach((bn, k) => bn.quaternion.copy(_plain[i][k].clone().slerp(bn.quaternion, share)))
    chain[0].updateMatrixWorld(true)
    // where and as this foot was drawn, for a start cut short next frame
    const at = c.lastAt[i]
    c.lastMove[i].copy(at)
    inBody(chain[2], at, c.lastTurn[i])
    if (body) {
      bodyToWorld(body, at, _liveW)
      at.set(_liveW.x, at.y, _liveW.z)
      c.lastTurn[i].premultiply(_yawQ.setFromAxisAngle(_yAxis, body.yaw))
    }
    c.lastMove[i].subVectors(at, c.lastMove[i])
  })
  return miss
}

/** After a handoff, foot `i`'s step place `p` past where it was then
 *  eased in: the foot sets out from the pace it had, not at the step's. */
function handPlace(c: ClipLayers, i: number, p: number): number {
  const p0 = c.handP[i]
  if (c.anchor <= 0 || p0 <= 0 || p <= p0) return p
  const q = (p - p0) / (1 - p0)
  return p0 + (1 - p0) * q * q * (3 - 2 * q)
}

/** `q` raised to the power `t` (its turn's angle times `t` about its axis). */
function powQ(q: THREE.Quaternion, t: number): THREE.Quaternion {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w)
  const half = Math.acos(Math.min(1, q.w))
  const s = Math.sin(half)
  if (s < 1e-9) return q.identity()
  const k = Math.sin(half * t) / s
  return q.set(q.x * k, q.y * k, q.z * k, Math.cos(half * t))
}

/**
 * A START CUT SHORT BY A STOP (point 1582 review): the stop's step targets
 * were anchored where the gait stood as the start began, so its first frame
 * jumped each foot off where the start had drawn it. Each foot's stop spots
 * are set so this frame's target and turn are exactly the last drawn ones:
 * one with a share of its step still to go keeps the stand's spot and takes
 * a gait spot (held in the world, height too) that puts it there; one the
 * shares put on the stand takes that spot as its stand, the height it is
 * still off the ground coming down with the weight.
 */
function handFeet(c: ClipLayers, body: GroundBody, shares: [number, number], w: number): void {
  const unit = body.unit || 1
  _yawQ.setFromAxisAngle(_yAxis, -body.yaw)
  LEG_SIDES.forEach((_, i) => {
    const step = shares[i]
    const p = stepPlace(step, c.stop)
    // on from there at the pace it went (a foot standing stays)
    const R = _ik[3]
    const mv = c.lastMove[i]
    worldToBody(body, { x: c.lastAt[i].x + mv.x, z: c.lastAt[i].z + mv.z }, R)
    R.y = c.lastAt[i].y + mv.y
    const RQ = _liveQ.copy(c.lastTurn[i]).premultiply(_yawQ)
    const S = _stand[i]
    c.handY[i] = 0
    c.handP[i] = 0
    if (p < 1 - 1e-3) {
      const g = _gait[i]
      g.x = (R.x - p * S.x) / (1 - p)
      g.z = (R.z - p * S.z) / (1 - p)
      c.handP[i] = p
      const cover = Math.hypot(R.x - S.x, R.z - S.z)
      const arc = Math.sin(Math.PI * step)
      const lift = G.settleStepLift * cover * arc * (1 - c.stop + c.stop * arc) + _lift[i] / unit
      g.y = (R.y - lift - p * S.y) / (1 - p)
      // the turn the slerp to the stand's by p leaves at the drawn one
      const d = powQ(_q.copy(RQ).invert().multiply(_standQ[i]), 1 / (1 - p))
      _gaitQ[i].copy(_standQ[i]).multiply(d.invert())
    } else {
      S.x = R.x
      S.z = R.z
      _standQ[i].copy(RQ)
      bodyToWorld(body, S, c.settleStand[i])
      c.settleTurn[i].copy(RQ).premultiply(_yawQ2.setFromAxisAngle(_yAxis, body.yaw))
      _gait[i].copy(R)
      _gaitQ[i].copy(RQ)
      c.handY[i] = R.y - S.y - _lift[i] / unit
    }
    bodyToWorld(body, _gait[i], c.settleGait[i])
    c.settleGaitY[i] = _gait[i].y
    c.settleGaitTurn[i].copy(_gaitQ[i]).premultiply(_yawQ2.setFromAxisAngle(_yAxis, body.yaw))
  })
  c.anchor = 1
  c.handW = w
  c.handoff = false
}

/**
 * The hands' shapes (the glTF body's live morphs, render/villagerBody.ts
 * LIVE_MORPHS) from what the hands do: closed round the shovel by the dig's
 * share (both hands) and the carry's (the right), the pointing shape where a
 * gesture aims a hand (`point`, left and right), and relaxed — a hand at rest
 * is softly curled, never a flat board — wherever neither holds. Per hand the
 * three weights sum to 1, so no shape stacks on another.
 */
export function handShapes(c: Pick<ClipLayers, 'dig' | 'carry' | 'arms'>, point: readonly [number, number] = [0, 0]): Record<LiveMorph, number> {
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  const gripL = clamp(c.dig)
  // the carry is the right arm's only while the clips own that arm
  const gripR = clamp(Math.max(c.dig, c.carry * c.arms[1]))
  const pointL = clamp(point[0]) * (1 - gripL)
  const pointR = clamp(point[1]) * (1 - gripR)
  return {
    'grip.L': gripL,
    'grip.R': gripR,
    'point.L': pointL,
    'point.R': pointR,
    'relax.L': clamp(1 - gripL - pointL),
    'relax.R': clamp(1 - gripR - pointR),
  }
}

/** Write hand-shape weights onto a mesh's morph influences (the targets it carries). */
export function applyHandShapes(mesh: THREE.Mesh, w: Record<LiveMorph, number>): void {
  const dict = mesh.morphTargetDictionary
  const inf = mesh.morphTargetInfluences
  if (!dict || !inf) return
  for (const n of LIVE_MORPHS) {
    const i = dict[n]
    if (i !== undefined) inf[i] = w[n]
  }
}

/**
 * The shovel on the right hand bone: shown while the hands hold it, gripped
 * where the dig's or the carry's clip grips it, by each clip's share of the
 * arm's pose as applyClipLayers layers it (the dig over the carry over the
 * code), so the shaft slides through the fist with the arm, never jumping and
 * never sliding on once the dig has the arm to itself.
 */
export function placeShovel(asset: VillagerAsset, person: GltfPerson, c: ClipLayers, tool: THREE.Object3D | null): void {
  if (!tool) return
  tool.visible = Math.max(c.dig, c.carry) > 0.5
  // placed even while hidden: gripShaft solves the left hand onto it from the
  // dig's first frame, before the shovel shows
  const dig = asset.clips.dig.tool?.grip ?? 0
  const carry = asset.clips.carry.tool?.grip ?? dig
  // the dig layers over everything below it, so its share of the arm is c.dig;
  // the rest (carry, gait or code) holds the shovel at the carry's grip
  const at = shovelOnHungHand(asset, person.frame, 'R', carry + (dig - carry) * c.dig)
  tool.position.copy(at.position)
  tool.quaternion.copy(at.quaternion)
  tool.scale.setScalar(person.frame.scale)
}

const _base = new THREE.Matrix4()
const _m = new THREE.Matrix4()
const _p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _held = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]

/** `o`'s position and turn in the body's frame (the hips' parent): free of a
 *  squash the figure group may carry, so directions and turns stay rigid. */
function inBody(o: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion): void {
  _m.multiplyMatrices(_base, o.matrixWorld).decompose(pos, quat, _s)
}

/** Turn bone `b` (body frame) by the shortest turn taking `from` to `to`. */
function swing(b: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  inBody(b, _s, _q)
  _q.premultiply(_q2.setFromUnitVectors(from.normalize(), to.clone().normalize()))
  inBody(b.parent!, _s, _q2)
  b.quaternion.copy(_q2.invert().multiply(_q))
  b.updateMatrixWorld(true)
}

/**
 * Both hands on the shaft on the FINAL body (natural-villager-motion step 7).
 * The right hand holds the shovel by attachment (placeShovel); the dig clip
 * puts the left on the shaft for the neutral body it was solved on only — on
 * another person its fist missed the shaft by up to 0.055 of the stature
 * (measured 14.10.2026). After the layers and the shovel: the left arm solved
 * so the left hand holds the shaft at the dig's upper grip with the hold the
 * pipeline authors (asset.toolHold.L), the elbow kept in the clip's own plane,
 * by the dig's share of the body.
 */
export function gripShaft(asset: VillagerAsset, person: GltfPerson, bones: Record<string, THREE.Bone>, c: ClipLayers, tool: THREE.Object3D | null): void {
  const other = asset.clips.dig.tool?.other
  if (!tool || c.dig <= 0 || other === undefined) return
  const chain = [bones['upperArm.L'], bones['forearm.L'], bones['hand.L']]
  chain.forEach((b, i) => _held[i].copy(b.quaternion))
  bones.hips.updateMatrixWorld(true)
  if (bones.hips.parent) _base.copy(bones.hips.parent.matrixWorld).invert()
  else _base.identity()
  const [sh, el, wr, target] = _p
  // the hand's turn and place that hold the tool where it is, at the upper grip
  const hold = shovelOnHungHand(asset, person.frame, 'L', other)
  inBody(tool, target, _q)
  const want = _q.clone().multiply(hold.quaternion.clone().invert())
  target.sub(hold.position.clone().applyQuaternion(want))
  inBody(chain[0], sh, _q)
  inBody(chain[1], el, _q)
  inBody(chain[2], wr, _q)
  const a = sh.distanceTo(el)
  const b = el.distanceTo(wr)
  // the clip's own bend: the elbow off the shoulder–wrist line
  const line = wr.clone().sub(sh).normalize()
  const pole = el.clone().sub(sh)
  pole.addScaledVector(line, -pole.dot(line))
  const sol = solveTwoBone(sh, target, a, b, pole)
  swing(chain[0], el.clone().sub(sh), sol.upper)
  inBody(chain[1], el, _q)
  inBody(chain[2], wr, _q)
  swing(chain[1], wr.clone().sub(el), sol.fore)
  inBody(chain[1], _s, _q)
  chain[2].quaternion.copy(_q.invert().multiply(want))
  // eased in and out with the dig, from what the layers below left
  if (c.dig < 1) chain.forEach((bn, i) => bn.quaternion.copy(_held[i].clone().slerp(bn.quaternion, c.dig)))
  chain[0].updateMatrixWorld(true)
}

/** The spine segments' turns the clips left, before the additive lean. */
export type TrunkBase = Record<LeanBone, THREE.Quaternion>
export const newTrunkBase = (): TrunkBase => ({ spine: new THREE.Quaternion(), spine1: new THREE.Quaternion(), chest: new THREE.Quaternion() })

/** Take the spine segments' current turns as the base the lean adds to. */
export function takeTrunkBase(bones: Record<string, THREE.Bone>, base: TrunkBase): void {
  for (const n of LEAN_BONES) base[n].copy(bones[n]?.quaternion ?? base[n].identity())
}

const _le = new THREE.Euler()
const _lq = new THREE.Quaternion()

/**
 * The trunk's additive lean on the glTF body (natural-villager-motion step 9):
 * `pitch` (rad, + leaning in) and `turn` (rad) distributed over spine, spine1
 * and chest (VILLAGER_POSE.leanShares), each on top of its clip turn `base`.
 * Every lean of the game goes through here: the pose's (gesture, tag, caught
 * slump), the elder's stoop and the contact lean.
 */
export function leanTrunk(bones: Record<string, THREE.Bone>, base: TrunkBase, pitch: number, turn: number): void {
  const d = distributeLean(pitch, turn, VILLAGER_POSE.leanShares)
  for (const n of LEAN_BONES) {
    const b = bones[n]
    if (b) b.quaternion.copy(base[n]).multiply(_lq.setFromEuler(_le.set(d[n].pitch, d[n].yaw, 0, 'XYZ')))
  }
}

const _cw = new THREE.Quaternion()
const _gd = new THREE.Vector3()

/**
 * Hold the head on a gaze (yaw, pitch relative to the heading, body frame)
 * over neck 0.4 → head 0.6 (VILLAGER_POSE.gaze), by `weight`: after every
 * trunk layer, so the face stays on its target through the lean and the gait.
 */
export function gazeHead(bones: Record<string, THREE.Bone>, yaw: number, pitch: number, weight: number): void {
  _cw.identity()
  for (const n of ['hips', 'spine', 'spine1', 'chest']) if (bones[n]) _cw.multiply(bones[n].quaternion)
  aimHead(_cw, bones.neck.quaternion, bones.head.quaternion, gazeDirection(yaw, pitch, _gd), VILLAGER_POSE.gaze.neck, weight)
}

const _sq = new THREE.Quaternion()
const _se = new THREE.Euler()

/**
 * The posable clavicles (natural-villager-motion step 11): each shoulder's
 * protraction (forward) and elevation (up) added on top of what the clips
 * left, clamped to VILLAGER_POSE.shoulders; none (absent or 0) leaves the
 * clip's clavicle exactly as it is. The bones' frames are the body's at rest
 * (the hung skeleton's locals are identity there): forward is +z, up +y, the
 * left shoulder at +x.
 */
export function poseShoulders(bones: Record<string, THREE.Bone>, shoulders: { left: ShoulderPose; right: ShoulderPose } | undefined): void {
  if (!shoulders) return
  const lim = VILLAGER_POSE.shoulders
  ;(['L', 'R'] as const).forEach((s) => {
    const p = s === 'L' ? shoulders.left : shoulders.right
    const b = bones[`shoulder.${s}`]
    if (!b || (!p.protraction && !p.elevation)) return
    const pro = Math.min(lim.protractionMax, Math.max(0, p.protraction))
    const up = Math.min(lim.elevationMax, Math.max(-lim.dropMax, p.elevation))
    const side = s === 'L' ? 1 : -1
    // forward: a turn about y carrying the outer end (±x) toward +z; up: about z toward +y
    b.quaternion.multiply(_sq.setFromEuler(_se.set(0, -side * pro, side * up, 'YZX')))
  })
}
