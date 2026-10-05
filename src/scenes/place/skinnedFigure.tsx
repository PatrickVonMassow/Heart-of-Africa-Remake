// The settlement's villager on the code-built skinned body, dressed from the
// appearance table (work-order "villager dress"; medium and high presets — the
// low preset keeps the primitive figure of placeFigure.tsx).
//
// It takes exactly the primitive figure's props and publishes the same pivots
// (`limbs`), so no vignette changes how it poses a person: the pivots are an
// invisible VIRTUAL primitive rig, and render/figureRig.ts carries what is
// written on them onto the bones (see there for why). The named anchors the
// verification reads — `figure-head`, `hand-left`, `hand-right` — sit on the
// bones, so they report where the drawn body really is.

import { useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FIGURE_LIMBS } from '../../render/figures'
import { applyFigurePose, restingArmRefs, type FigureLimbs } from '../../render/figurePose'
import { advanceGesture, gesturePose, type FigurePose, type GestureState } from '../../render/gesture'
import {
  bodyProportions,
  buildBodyGeometry,
  createSkeleton,
  type BodyProportions,
  type BoneName,
} from '../../render/figureBody'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildLayerGeometry, figureMaterial } from '../../render/figureDress'
import { contactCrouch, contactLean, gestureArmEuler, hangToward, solveTwoBone, unsquashHead } from '../../render/figureRig'
import {
  approach,
  armAtRest,
  crouchTarget,
  crownOffset,
  headLoadGrip,
  kneelBlend,
  legDims,
  legExtent,
  phasePerDistance,
  rephase,
  strideReach,
  walkPose,
  type WalkPose,
} from '../../render/figureWalk'
import { VILLAGER_MOTION } from '../../config/balance'
import { appearanceFor, skinTone, type AgeGroup, type DressLayer, type Sex } from '../../systems/appearance'
import type { ActorRoleKind } from '../../systems/actorLabels'
import { markActor } from '../actorLabelSource'
import { isLifeFrozen } from './lifeFreeze'
import { REST_POSE_ARMS, type FigureLook } from './placeFigureContext'
import { figureIdentity, type FigureIdentity } from './figureIdentity'

// ---- geometry caches: one build per distinct body and layer -----------------

const bodyCache = new Map<string, THREE.BufferGeometry>()
const layerCache = new Map<string, THREE.BufferGeometry | null>()
const figureCache = new Map<string, THREE.BufferGeometry>()

function cachedBody(p: BodyProportions, key: string, skin: string, paint: string | null, radial: number) {
  const k = `${key}|${skin}|${paint}|${radial}`
  let g = bodyCache.get(k)
  if (!g) {
    g = buildBodyGeometry(p, { skin, paint }, radial)
    bodyCache.set(k, g)
  }
  return g
}

const layerKey = (l: DressLayer, key: string, radial: number) =>
  `${key}|${radial}|${l.form}|${l.wear}|${l.material}|${l.colour}|${l.colour2}|${l.pattern}`

function cachedLayer(l: DressLayer, p: BodyProportions, key: string, radial: number) {
  const k = layerKey(l, key, radial)
  if (!layerCache.has(k)) layerCache.set(k, buildLayerGeometry(l, p, radial))
  return layerCache.get(k) ?? null
}

/** Body and every dress layer as ONE geometry: a villager is one draw. */
function cachedFigure(p: BodyProportions, layers: DressLayer[], key: string, skin: string, paint: string | null, radial: number) {
  const k = `${key}|${skin}|${paint}|${radial}|${layers.map((l) => layerKey(l, '', radial)).join('/')}`
  let g = figureCache.get(k)
  if (!g) {
    const parts = [cachedBody(p, key, skin, paint, radial)]
    for (const l of layers) {
      const lg = cachedLayer(l, p, key, radial)
      if (lg) parts.push(lg)
    }
    g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
    g.computeBoundingSphere()
    figureCache.set(k, g)
  }
  return g
}

/** The figure's whole scene graph, built once per identity and look. */
interface Rig {
  p: BodyProportions
  layers: DressLayer[]
  meshes: THREE.SkinnedMesh[]
  bones: Record<BoneName, THREE.Bone>
  skeleton: THREE.Skeleton
  head: THREE.Object3D
  /** The top of the drawn head, on the head bone: where a head load rests. */
  crown: THREE.Object3D
  hands: [THREE.Object3D, THREE.Object3D]
}

function buildRig(id: FigureIdentity, look: FigureLook, cloth: string, skin: string): Rig {
  const p = bodyProportions(id.sex, id.age, id.build)
  const layers = appearanceFor({
    peopleId: look.peopleId,
    sex: id.sex,
    age: id.age,
    drivers: look.drivers,
    year: look.year,
    cloth,
    palette: look.palette,
    pick: id.pick,
  })
  const key = `${id.sex}|${id.age}|${id.build}`
  const paint = skinTone(layers, skin)
  const { skeleton, bones } = createSkeleton(p)
  const bound = new THREE.Sphere(new THREE.Vector3(0, p.stature * 0.5, 0), p.stature * 0.85)
  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const m = new THREE.SkinnedMesh(geo, material)
    m.name = name
    m.castShadow = true
    m.boundingSphere = bound
    return m
  }
  const geo = cachedFigure(p, layers, key, skin, paint === skin ? null : paint, look.radial)
  if (!geo.boundingBox) geo.computeBoundingBox()
  const body = mesh(geo, figureMaterial(), 'figure-body')
  body.add(bones.hips)
  body.bind(skeleton, new THREE.Matrix4())
  const meshes = [body]
  // The anchors the verification and the carried props read.
  const head = new THREE.Object3D()
  head.name = 'figure-head'
  head.position.set(0, p.headHalfH, 0)
  // Scaled so `0.16 × scale` above it is the crown, as on the primitive head.
  head.scale.setScalar(p.headHalfH / 0.16)
  bones.head.add(head)
  const crown = new THREE.Object3D()
  crown.name = 'figure-crown'
  crown.position.set(0, crownOffset(p, geo.boundingBox?.max.y), 0)
  bones.head.add(crown)
  // The thighs turn against the pelvis's walking yaw before they swing, so the
  // stride stays in the line of travel.
  bones['thigh.L'].rotation.order = 'YXZ'
  bones['thigh.R'].rotation.order = 'YXZ'
  const hand = (side: 'L' | 'R', name: string) => {
    const o = new THREE.Object3D()
    o.name = name
    o.position.set(0, -p.hand * 0.9, 0)
    bones[`hand.${side}`].add(o)
    return o
  }
  return { p, layers, meshes, bones, skeleton, head, crown, hands: [hand('L', 'hand-left'), hand('R', 'hand-right')] }
}

const _s = new THREE.Vector3()
const _t = new THREE.Vector3()
const _e = new THREE.Vector3()
const _w = new THREE.Vector3()
const _pivot = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _pole = new THREE.Vector3()
const _euler = new THREE.Euler()
const _here = new THREE.Vector3()
const _scale = new THREE.Vector3()
const _facing = new THREE.Vector3()
const _grip = new THREE.Vector3()

/** What the figure measured of its own walk, and its transitions in progress. */
interface Motion {
  /** Last world position (for the ground speed), null until the first frame. */
  last: THREE.Vector3 | null
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
}

export function SkinnedFigure({
  look,
  cloth,
  skin = '#5c3317',
  scale = 1,
  kneel = false,
  legs = false,
  role = 'villager',
  gesture,
  pose,
  limbs,
  squat,
  handProp,
  headProp,
  headSteady,
  kneeling,
  sex,
  age,
  identityKey,
}: {
  look: FigureLook
  cloth: string
  skin?: string
  scale?: number
  kneel?: boolean
  legs?: boolean
  role?: ActorRoleKind
  gesture?: RefObject<GestureState>
  pose?: RefObject<FigurePose | null>
  limbs?: RefObject<FigureLimbs | null>
  /** The primitive's caller-driven gait; this body measures its own walk. */
  gait?: RefObject<number>
  squat?: RefObject<number>
  handProp?: ReactNode
  /** A load carried on the head, mounted on the crown (it rides the head's bob). */
  headProp?: ReactNode
  /** Set when a hand steadies that load: its radius and height for the grip. */
  headSteady?: { radius: number; height: number } | null
  /** Kneels while true: down and up again as a short transition. */
  kneeling?: RefObject<boolean>
  sex?: Sex
  age?: AgeGroup
  /** The outer Figure's id, stable across a detail-level switch. */
  identityKey?: string
}) {
  const ownKey = useId()
  const key = identityKey ?? ownKey
  const id = useMemo(() => figureIdentity(key, scale, sex, age), [key, scale, sex, age])
  const rig = useMemo(() => buildRig(id, look, cloth, skin), [id, look, cloth, skin])
  // The skeleton (and its bone texture) is this figure's own; the geometry is
  // shared through the caches and stays.
  useEffect(() => () => rig.skeleton.dispose(), [rig])
  const L = FIGURE_LIMBS
  // THE VIRTUAL PRIMITIVE RIG the poses are written onto — the primitive
  // figure's pivots exactly (placeFigure.tsx), drawing nothing.
  // A kneeling one keeps the former squashed pivots: every kneeling contact
  // (the loom, the paddle, the gutting) was solved through them, and this rig
  // is never drawn — the drawn body kneels by its bones.
  const bodyH = kneel ? 0.55 : 1.0
  const withLegs = legs && !kneel
  const hipY = withLegs ? bodyH * L.hipY : 0
  const armLen = bodyH * L.armLength
  const outer = useRef<THREE.Group>(null)
  const trunk = useRef<THREE.Group>(null)
  const arms = useRef<Array<THREE.Group | null>>([])
  const virtualHands = useRef<Array<THREE.Object3D | null>>([])
  const armRef = useMemo(() => restingArmRefs(arms.current, REST_POSE_ARMS), [])
  const owned = !!(pose && limbs)
  const dims = useMemo(() => legDims(rig.p), [rig])
  const motion = useRef<Motion>({ last: null, speed: 0, phase: 0, weight: 0, reach: 0, crouch: 0, crouchTarget: 0, kneel: kneel ? 1 : 0 })
  // THE LEGS AND HIPS from the walk, the work crouch and the kneel — one
  // function, so the frame callback and an owning caller's retarget both
  // leave the stride in place. Returns the walk for the arms and shoulders.
  const poseLegs = useMemo(() => {
    const b = rig.bones
    return (): WalkPose => {
      const m = motion.current
      const walk = walkPose(dims, m.phase, m.reach, m.weight, id.age, m.crouch)
      let hip = walk.hipHeight
      let legsNow = walk.legs
      let yaw = walk.hipYaw
      if (m.kneel > 0) {
        const folded = walk.legs.map((l) => kneelBlend(dims, l, m.kneel))
        hip = Math.max(folded[0].hipHeight, folded[1].hipHeight)
        legsNow = [folded[0].legs, folded[1].legs]
        yaw *= 1 - m.kneel
      }
      b.hips.position.y = hip
      b.hips.rotation.set(0, yaw, 0)
      ;(['L', 'R'] as const).forEach((s, i) => {
        b[`thigh.${s}`].rotation.set(legsNow[i].thigh, -yaw, 0)
        b[`shin.${s}`].rotation.set(legsNow[i].shin, 0, 0)
        b[`foot.${s}`].rotation.set(legsNow[i].foot, 0, 0)
      })
      return { ...walk, hipYaw: yaw, chestYaw: walk.chestYaw * (1 - m.kneel) }
    }
  }, [rig, dims, id.age])

  // Carry the virtual pose onto the bones. Called by `applyFigurePose` in the
  // frame the pose is written, and by this figure's own frame for the rest.
  const retarget = useMemo(() => {
    const b = rig.bones
    const p = rig.p
    return () => {
      const vTrunk = trunk.current
      const root = b.hips.parent?.parent
      if (!vTrunk || !root) return
      const m = motion.current
      const kneelNow = kneel || !!kneeling?.current
      // An arm is a CONTACT only where the pose put it somewhere: an arm the
      // pose leaves hanging at rest has nothing to reach — it swings with the
      // walk. (Every hanging arm used to count, and the primitive's hand at its
      // knee drove the body into a full crouch to reach it: the "seated"
      // walkers of the report.)
      const contactArm = [0, 1].map((i) => {
        const v = arms.current[i]
        if (!pose || !v || !virtualHands.current[i]) return false
        const rest = REST_POSE_ARMS[i]
        return !armAtRest({ pitch: v.rotation.x, yaw: v.rotation.y, roll: v.rotation.z }, rest)
      })
      const contact = contactArm[0] || contactArm[1]
      // Trunk: the pose's lean and turn at the hips, the elder's stoop at the chest.
      const standHip = (c: number) => dims.ankle + legExtent(dims, dims.flex + c)
      b.spine.rotation.set(vTrunk.rotation.x, vTrunk.rotation.y, 0)
      b.chest.rotation.set(p.stoop, 0, 0)
      b.neck.rotation.set(-p.stoop * 0.45, 0, 0)
      root.updateWorldMatrix(true, true)
      // THE SOLVE RUNS IN THE BODY MESH'S OWN SPACE, not in world space: a
      // caller may squash the figure non-uniformly (the pounding squat), and a
      // bone quaternion cannot undo a world-space shear. Inside the body every
      // transform is rigid, so lengths and directions there are the bones' own;
      // the virtual hand, brought into the same space, is the primitive's
      // contact with the squash taken out, and rendering puts it back.
      const body = rig.meshes[0]
      const loc = (o: THREE.Object3D, out: THREE.Vector3) => body.worldToLocal(o.getWorldPosition(out))
      const qIn = (o: THREE.Object3D, out: THREE.Quaternion) => {
        const chain: THREE.Object3D[] = []
        for (let n: THREE.Object3D | null = o; n && n !== body; n = n.parent) chain.push(n)
        out.identity()
        for (let k = chain.length - 1; k >= 0; k--) out.multiply(chain[k].quaternion)
        return out
      }
      // A contact the hands cannot quite reach is reached by leaning in.
      const reachOf = (s: 'L' | 'R') =>
        loc(b[`forearm.${s}`], _e).distanceTo(loc(b[`upperArm.${s}`], _s)) +
        loc(b[`hand.${s}`], _w).distanceTo(_e) +
        loc(rig.hands[s === 'L' ? 0 : 1], _t).distanceTo(_w)
      const baseLean = b.spine.rotation.x
      const leanIn = () => {
        b.spine.rotation.x = baseLean
        b.hips.updateWorldMatrix(false, true)
        loc(b.spine, _pivot)
        _fwd.set(0, 0, 1).applyQuaternion(qIn(b.spine, _q)).setY(0).normalize()
        let lean = 0
        ;(['L', 'R'] as const).forEach((s, i) => {
          const vh = virtualHands.current[i]
          if (!vh || !contactArm[i]) return
          const reach = reachOf(s)
          loc(b[`upperArm.${s}`], _s)
          loc(vh, _t)
          lean = Math.max(lean, contactLean(_s, _t, reach * 0.995, _pivot, _fwd))
        })
        if (lean > 0) {
          b.spine.rotation.x += lean
          b.spine.updateWorldMatrix(false, true)
        }
      }
      if (contact && !kneelNow && Math.abs(m.speed) <= VILLAGER_MOTION.moveSpeed) {
        // Every pose is solved from STANDING height: a contact's crouch is
        // found afresh each time, never inherited, so a held contact cannot
        // alternate between crouched and standing. Each crouch is tried WITH
        // its own lean (a low contact takes both: bent knees and a bent back).
        const shortOf = () =>
          Math.max(
            ...(['L', 'R'] as const).map((s, i) => {
              const vh = virtualHands.current[i]
              return vh && contactArm[i] ? loc(b[`upperArm.${s}`], _s).distanceTo(loc(vh, _t)) - reachOf(s) * 0.995 : -1
            }),
          )
        const tryAt = (cc: number) => {
          b.hips.position.y = standHip(cc)
          leanIn()
          return shortOf()
        }
        m.crouchTarget = crouchTarget(m.speed, contactCrouch(tryAt))
      } else {
        // Never a crouch on the move: released before the walk, resumed after.
        m.crouchTarget = 0
      }
      const walk = poseLegs()
      b.spine.rotation.set(vTrunk.rotation.x, vTrunk.rotation.y - walk.hipYaw, 0)
      b.chest.rotation.set(p.stoop, walk.chestYaw, 0)
      b.hips.updateWorldMatrix(false, true)
      if (contact) leanIn()
      // THE STEADYING HAND on a head load: the free arm on the load's side.
      const loadShown = rig.crown.children.some((c) => c.visible)
      const steadyArm = headSteady && loadShown && m.kneel < 0.5 ? (!contactArm[0] ? 0 : !contactArm[1] ? 1 : -1) : -1
      ;(['L', 'R'] as const).forEach((s, i) => {
        const up = b[`upperArm.${s}`]
        const fore = b[`forearm.${s}`]
        const vPivot = arms.current[i]
        const vh = virtualHands.current[i]
        let done = false
        const chestQ = () => qIn(b.chest, new THREE.Quaternion())
        const solveTo = (target: THREE.Vector3, pole: THREE.Vector3) => {
          const a = loc(fore, _e).distanceTo(loc(up, _s))
          const reach = reachOf(s)
          loc(up, _s)
          const sol = solveTwoBone(_s, target, a, reach - a, pole)
          if (!sol.reached) return false
          const cq = chestQ()
          up.quaternion.copy(hangToward(sol.upper, cq))
          up.updateWorldMatrix(false, true)
          fore.quaternion.copy(hangToward(sol.fore, qIn(up, new THREE.Quaternion())))
          return true
        }
        if (i === steadyArm && headSteady) {
          // A hand on the rim: the grip found in the crown's own frame (the
          // load tilts with the head), brought into the body's.
          rig.crown.updateWorldMatrix(true, false)
          const sh = rig.crown.worldToLocal(up.getWorldPosition(_grip))
          const g = headLoadGrip({ x: sh.x, y: sh.y, z: sh.z }, i === 0 ? 1 : -1, headSteady, reachOf(s))
          body.worldToLocal(rig.crown.localToWorld(_grip.set(g.x, g.y, g.z)))
          _pole.set(i === 0 ? 1 : -1, -0.3, 0.2).applyQuaternion(chestQ())
          done = solveTo(_grip, _pole)
        } else if (contactArm[i] && vh) {
          loc(vh, _t)
          _pole.set(s === 'L' ? 0.5 : -0.5, -0.4, -1).applyQuaternion(chestQ())
          done = solveTo(_t.clone(), _pole)
        }
        if (!done && vPivot) {
          // A hanging arm hangs by gravity, not with the stooped chest (whose
          // forward bend swings an arm fixed to it BACK by the same angle); a
          // free one swings against its leg.
          const hang = Math.abs(vPivot.rotation.x) < 0.3 ? -p.stoop : 0
          const swing = contactArm[i] ? 0 : walk.arms[i]
          up.quaternion.setFromEuler(gestureArmEuler({ pitch: vPivot.rotation.x + hang + swing, yaw: vPivot.rotation.y, roll: vPivot.rotation.z }, _euler))
          fore.rotation.set(-0.2 - Math.max(0, -swing) * 0.6, 0, 0)
        }
        b[`hand.${s}`].quaternion.identity()
      })
      // The head's squat correction depends on the chain just posed: renew it
      // here, so an owning caller's retarget never leaves a stale one.
      unsquashHead(b.head, [b.hips, b.spine, b.chest, b.neck], squat?.current ?? 1)
      b.hips.updateWorldMatrix(false, true)
      // A carried prop hangs from the hand anchor and was posed for the
      // primitive's hand frame: on a contact the anchor takes the virtual
      // hand's orientation (the jar tips as designed), otherwise the bone's.
      ;([0, 1] as const).forEach((i) => {
        const anchor = rig.hands[i]
        const vh = virtualHands.current[i]
        if (contactArm[i] && vh && anchor.parent) {
          const parentQ = anchor.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
          anchor.quaternion.copy(parentQ.multiply(vh.getWorldQuaternion(new THREE.Quaternion())))
        } else anchor.quaternion.identity()
        anchor.updateWorldMatrix(false, true)
      })
    }
  }, [rig, dims, pose, squat, poseLegs, headSteady, kneel, kneeling])

  // Publish the virtual pivots to the caller that owns the pose.
  const selfLimbs = useRef<FigureLimbs>({ arms: arms.current, trunk: null, retarget })
  useEffect(() => {
    selfLimbs.current.retarget = retarget
    if (!limbs) return
    limbs.current = { arms: arms.current, trunk: trunk.current, retarget }
    return () => {
      limbs.current = null
    }
  }, [limbs, retarget])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const m = motion.current
    // THE FIGURE'S OWN GROUND SPEED, measured where it is drawn: every walker
    // gets its stride from how fast it really goes, whoever moves it.
    const g = outer.current
    // The dev life freeze holds a stride where it is, for the camera.
    if (g && dt > 0 && !isLifeFrozen()) {
      g.updateWorldMatrix(true, false)
      g.getWorldPosition(_here)
      const unit = g.getWorldScale(_scale).x || 1
      let walked = 0
      if (m.last) {
        const dx = _here.x - m.last.x
        const dz = _here.z - m.last.z
        const dist = Math.hypot(dx, dz) / unit
        if (dist / dt <= VILLAGER_MOTION.teleportSpeed) {
          // Only the step along the facing is a stride; a sideways shove is not.
          g.getWorldDirection(_facing)
          walked = (dx * _facing.x + dz * _facing.z) / (Math.hypot(_facing.x, _facing.z) || 1) / unit
        }
      } else m.last = new THREE.Vector3()
      m.last.copy(_here)
      const k = 1 - Math.exp(-dt / VILLAGER_MOTION.speedSmoothing)
      m.speed += (walked / dt - m.speed) * k
      const wanted = kneel || !!kneeling?.current
      m.kneel = approach(m.kneel, wanted ? 1 : 0, 1 / VILLAGER_MOTION.kneelSeconds, dt)
      const moving = Math.abs(m.speed) > VILLAGER_MOTION.moveSpeed && m.kneel === 0
      const placed = m.reach * m.weight
      m.weight = approach(m.weight, moving ? 1 : 0, VILLAGER_MOTION.walkFadeRate, dt)
      if (moving) m.reach = strideReach(dims, m.speed, id.age)
      // A pace change does not drag the planted foot: the phase moves with it.
      m.phase = rephase(m.phase, placed, m.reach * m.weight)
      // The planted foot stays put: the phase runs at the rate its reach is swept.
      m.phase += walked * phasePerDistance(Math.max(m.reach * m.weight, m.reach * 0.3))
      m.crouch = approach(m.crouch, m.crouchTarget, VILLAGER_MOTION.crouchRate, dt)
      const actor = g.userData.actor as { height: number } | undefined
      if (actor) actor.height = 1.45 - 0.45 * m.kneel // the label over the drawn crown
    }
    let shown = pose?.current ?? null
    if (!shown && gesture?.current) {
      gesture.current = advanceGesture(gesture.current, dt)
      shown = gesturePose(gesture.current)
    }
    if (shown && !owned) {
      selfLimbs.current.trunk = trunk.current
      applyFigurePose(selfLimbs.current, shown) // retargets
    } else {
      retarget()
    }
    // A squat shortens a person; it does not flatten the skull (work-order 1085).
    unsquashHead(rig.bones.head, [rig.bones.hips, rig.bones.spine, rig.bones.chest, rig.bones.neck], squat?.current ?? 1)
  })

  return (
    <group ref={outer} name="inhabitant" scale={scale} userData={markActor({ kind: role, height: bodyH + 0.45 })}>
      {rig.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      {/* The virtual primitive rig — pivots only, nothing drawn. */}
      <group scale={[1, kneel ? 0.75 : 1, 1]} visible={false}>
        <group ref={trunk} position={[0, hipY, 0]}>
          {[0, 1].map((i) => (
            <group key={i} position={[(i === 0 ? 1 : -1) * bodyH * L.shoulderX, bodyH * L.shoulderY - hipY, 0]} ref={armRef[i]}>
              <object3D
                position={[0, -armLen, 0]}
                ref={(el) => {
                  virtualHands.current[i] = el
                }}
              />
            </group>
          ))}
        </group>
      </group>
      {handProp && createPortal(<>{handProp}</>, rig.hands[0])}
      {headProp && createPortal(<>{headProp}</>, rig.crown)}
    </group>
  )
}
