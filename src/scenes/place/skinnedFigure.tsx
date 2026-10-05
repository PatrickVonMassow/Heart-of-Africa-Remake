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
import { legSwingAngle } from '../../render/fauna'
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
import { contactCrouch, contactLean, gestureArmEuler, hangToward, kneelLegs, solveTwoBone, unsquashHead } from '../../render/figureRig'
import { appearanceFor, skinTone, type AgeGroup, type DressLayer, type Sex } from '../../systems/appearance'
import type { ActorRoleKind } from '../../systems/actorLabels'
import { markActor } from '../actorLabelSource'
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
  const body = mesh(cachedFigure(p, layers, key, skin, paint === skin ? null : paint, look.radial), figureMaterial(), 'figure-body')
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
  const hand = (side: 'L' | 'R', name: string) => {
    const o = new THREE.Object3D()
    o.name = name
    o.position.set(0, -p.hand * 0.9, 0)
    bones[`hand.${side}`].add(o)
    return o
  }
  return { p, layers, meshes, bones, skeleton, head, hands: [hand('L', 'hand-left'), hand('R', 'hand-right')] }
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
  gait,
  squat,
  handProp,
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
  gait?: RefObject<number>
  squat?: RefObject<number>
  handProp?: ReactNode
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
  const bodyH = kneel ? 0.55 : 1.0
  const withLegs = legs && !kneel
  const hipY = withLegs ? bodyH * L.hipY : 0
  const armLen = bodyH * L.armLength
  const trunk = useRef<THREE.Group>(null)
  const arms = useRef<Array<THREE.Group | null>>([])
  const virtualHands = useRef<Array<THREE.Object3D | null>>([])
  const armRef = useMemo(() => restingArmRefs(arms.current, REST_POSE_ARMS), [])
  const owned = !!(pose && limbs)
  const contact = !!pose
  const kneelLeg = useMemo(() => kneelLegs(rig.p.hipY - rig.p.kneeY, rig.p.calfR), [rig])
  // The elder's give at the knees, feet kept on the ground: both leg segments
  // tilt by the flex, so the hips sink by their summed length × (1 − cos).
  const flex = rig.p.kneeFlex
  const standDrop = (rig.p.hipY - rig.p.ankleY) * (1 - Math.cos(flex))
  // THE CONTACT CROUCH: a human arm is shorter and hangs from a higher
  // shoulder than the primitive's, so a contact the primitive reached at its
  // ankles (the jar dipped at the water's edge) is out of reach even leaning.
  // Then the knees bend and the hips drop, feet kept down, until it is.
  const crouch = useRef(0)
  // The standing legs: the flex and crouch, with the walking swing laid over
  // them when the figure walks — one function, so the frame callback and an
  // owning caller's retarget both leave the stride in place. The knee bend
  // comes from the swing alone, so a stopped elder keeps both feet flat.
  const setLegs = useMemo(() => {
    const b = rig.bones
    return (c: number) => {
      const f = flex + c
      for (const [s, phase] of [['L', 0], ['R', Math.PI]] as const) {
        const swing = gait ? legSwingAngle(gait.current, phase) : 0
        b[`thigh.${s}`].rotation.x = swing - f
        b[`shin.${s}`].rotation.x = Math.max(0, -swing) * 0.8 + 2 * f
        b[`foot.${s}`].rotation.x = -f
      }
    }
  }, [rig, flex, gait])

  // Carry the virtual pose onto the bones. Called by `applyFigurePose` in the
  // frame the pose is written, and by this figure's own frame for the rest.
  const retarget = useMemo(() => {
    const b = rig.bones
    const p = rig.p
    return () => {
      const vTrunk = trunk.current
      const root = b.hips.parent?.parent
      if (!vTrunk || !root) return
      // Trunk: the pose's lean and turn at the hips, the elder's stoop at the chest.
      const legDrop = (c: number) => (p.hipY - p.ankleY) * (1 - Math.cos(flex + c))
      // Every pose is solved from STANDING height: a contact's crouch is found
      // afresh each time, never inherited, so a held contact cannot alternate
      // between crouched and standing.
      b.hips.position.y = kneel ? kneelLeg.hipY : p.hipY - legDrop(0)
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
      if (contact) {
        loc(b.spine, _pivot)
        _fwd.set(0, 0, 1).applyQuaternion(qIn(b.spine, _q)).setY(0).normalize()
        let lean = 0
        ;(['L', 'R'] as const).forEach((s, i) => {
          const vh = virtualHands.current[i]
          if (!vh) return
          const reach = reachOf(s)
          loc(b[`upperArm.${s}`], _s)
          loc(vh, _t)
          lean = Math.max(lean, contactLean(_s, _t, reach * 0.995, _pivot, _fwd))
        })
        if (lean > 0) {
          b.spine.rotation.x += lean
          b.spine.updateWorldMatrix(false, true)
        }
        // Still short after the lean: crouch (standing figures only).
        const shortOf = () =>
          Math.max(
            ...(['L', 'R'] as const).map((s, i) => {
              const vh = virtualHands.current[i]
              return vh ? loc(b[`upperArm.${s}`], _s).distanceTo(loc(vh, _t)) - reachOf(s) * 0.995 : -1
            }),
          )
        const c = kneel
          ? 0
          : contactCrouch((cc) => {
              b.hips.position.y = p.hipY - legDrop(cc)
              b.hips.updateWorldMatrix(false, true)
              return shortOf()
            })
        crouch.current = c
        if (!kneel) {
          b.hips.position.y = p.hipY - legDrop(c)
          setLegs(c)
          b.hips.updateWorldMatrix(false, true)
        }
      } else if (crouch.current !== 0 && !kneel) {
        crouch.current = 0
        b.hips.position.y = p.hipY - standDrop
        setLegs(0)
        b.hips.updateWorldMatrix(false, true)
      }
      ;(['L', 'R'] as const).forEach((s, i) => {
        const up = b[`upperArm.${s}`]
        const fore = b[`forearm.${s}`]
        const vPivot = arms.current[i]
        const vh = virtualHands.current[i]
        let done = false
        if (contact && vh) {
          const a = loc(fore, _e).distanceTo(loc(up, _s))
          const reach = reachOf(s)
          loc(up, _s)
          loc(vh, _t)
          const chestQ = qIn(b.chest, new THREE.Quaternion())
          _pole.set(s === 'L' ? 0.5 : -0.5, -0.4, -1).applyQuaternion(chestQ)
          const sol = solveTwoBone(_s, _t, a, reach - a, _pole)
          if (sol.reached) {
            up.quaternion.copy(hangToward(sol.upper, chestQ))
            up.updateWorldMatrix(false, true)
            fore.quaternion.copy(hangToward(sol.fore, qIn(up, new THREE.Quaternion())))
            done = true
          }
        }
        if (!done && vPivot) {
          // A hanging arm hangs by gravity, not with the stooped chest (whose
          // forward bend swings an arm fixed to it BACK by the same angle).
          const hang = Math.abs(vPivot.rotation.x) < 0.3 ? -p.stoop : 0
          up.quaternion.setFromEuler(gestureArmEuler({ pitch: vPivot.rotation.x + hang, yaw: vPivot.rotation.y, roll: vPivot.rotation.z }, _euler))
          fore.rotation.set(-0.2, 0, 0)
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
        if (contact && vh && anchor.parent) {
          const parentQ = anchor.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
          anchor.quaternion.copy(parentQ.multiply(vh.getWorldQuaternion(new THREE.Quaternion())))
        } else anchor.quaternion.identity()
        anchor.updateWorldMatrix(false, true)
      })
    }
  }, [rig, kneel, kneelLeg, contact, standDrop, squat, flex, setLegs])

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

  // Kneeling legs are a fixed pose; standing ones swing with the gait.
  useEffect(() => {
    const b = rig.bones
    for (const s of ['L', 'R'] as const) {
      b[`thigh.${s}`].rotation.set(kneel ? kneelLeg.thigh : -flex, 0, 0)
      b[`shin.${s}`].rotation.set(kneel ? kneelLeg.shin : 2 * flex, 0, 0)
      b[`foot.${s}`].rotation.set(kneel ? kneelLeg.foot : -flex, 0, 0)
    }
  }, [rig, kneel, kneelLeg, flex])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
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
    const b = rig.bones
    if (!kneel && gait) setLegs(crouch.current)
    // A squat shortens a person; it does not flatten the skull (work-order 1085).
    unsquashHead(b.head, [b.hips, b.spine, b.chest, b.neck], squat?.current ?? 1)
  })

  return (
    <group name="inhabitant" scale={scale} userData={markActor({ kind: role, height: bodyH + 0.45 })}>
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
    </group>
  )
}
