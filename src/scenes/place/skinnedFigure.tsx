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

import { Fragment, useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
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
import type { VillagerAsset } from '../../render/villagerAsset'
import { restBounds } from '../../render/villagerBody'
import { createGltfSkeleton, gltfFigureGeometry, gltfLayerGeometry, gltfPerson, type GltfPerson } from '../../render/villagerFigureBody'
import { gaitWeights } from '../../render/villagerRig'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildLayerGeometry, figureMaterial } from '../../render/figureDress'
import { contactCrouch, contactLean, gazeAngles, gestureArmEuler, hangToward, LEAN_BONES, FOREARM_ROLL_SHARE, newGaze, palmNormal, palmRollAngle, palmRollCenter, solveTwoBone, stepGaze, unsquashHead } from '../../render/figureRig'
import {
  approach,
  armAtRest,
  crouchTarget,
  figureCrownOffset,
  headLoadGrip,
  kneelBlend,
  legDims,
  legExtent,
  restingMotion,
  stepWalk,
  walkPose,
  type HipJoint,
  type HeadLoadShape,
  type WalkMotion,
  type WalkPose,
} from '../../render/figureWalk'
import { VILLAGER_MOTION, VILLAGER_POSE } from '../../config/balance'
import { appearanceFor, skinTone, type AgeGroup, type DressLayer, type Sex } from '../../systems/appearance'
import type { ActorRoleKind } from '../../systems/actorLabels'
import { markActor } from '../actorLabelSource'
import { isLifeFrozen } from './lifeFreeze'
import { REST_POSE_ARMS, type FigureLook } from './placeFigureContext'
import { figureIdentity, type FigureIdentity } from './figureIdentity'
import type { FigureWork } from './placeFigureContext'
import { Shovel } from './shovel'
import { applyClipLayers, applyHandShapes, clipLayers, gazeHead, gripShaft, handShapes, leanTrunk, newTrunkBase, placeShovel, poseShoulders, stepClipLayers, takeTrunkBase } from './gltfClipLayers'

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

// ---- the glTF body (work-order "glTF villager body"; medium and high) --------

const personCache = new Map<string, GltfPerson>()
const gltfFigureCache = new Map<string, THREE.BufferGeometry>()

function cachedPerson(asset: VillagerAsset, id: FigureIdentity): GltfPerson {
  const k = `${id.sex}|${id.age}|${id.build}`
  let person = personCache.get(k)
  if (!person) {
    const t0 = performance.now()
    person = gltfPerson(asset, id.sex, id.age, id.build)
    personCache.set(k, person)
    // read by the verification's per-village cost record
    performance.measure?.('villager-gltf-person', { start: t0, end: performance.now() })
  }
  return person
}

const gltfLayerCache = new Map<string, THREE.BufferGeometry | null>()

/** One dress layer on a person's glTF body: the pipeline's garment
 *  (render/villagerFigureBody.ts gltfLayerGeometry), shared, never mutated. */
function cachedGltfLayer(asset: VillagerAsset, person: GltfPerson, l: DressLayer, key: string, radial: number) {
  const k = layerKey(l, `gltf|${key}`, radial)
  if (!gltfLayerCache.has(k)) gltfLayerCache.set(k, gltfLayerGeometry(asset, person, l))
  return gltfLayerCache.get(k) ?? null
}

/** The glTF body painted (skin, scalp) with every dress layer, as ONE geometry
 *  skinned to the asset's bones. The layers are the pipeline's garments,
 *  fitted to every clip and measured (scripts/villager/, penetration report),
 *  with the cover mask of the worn ones; no code-built layer. */
function cachedGltfFigure(asset: VillagerAsset, person: GltfPerson, layers: DressLayer[], key: string, skin: string, paint: string | null, radial: number) {
  const k = `gltf|${key}|${skin}|${paint}|${radial}|${layers.map((l) => layerKey(l, '', radial)).join('/')}`
  let g = gltfFigureCache.get(k)
  if (!g) {
    const t0 = performance.now()
    g = gltfFigureGeometry(asset, person, layers, skin, paint, radial, (l) => cachedGltfLayer(asset, person, l, key, radial))
    gltfFigureCache.set(k, g)
    performance.measure?.('villager-gltf-figure', { start: t0, end: performance.now() })
  }
  return g
}

// ---- GPU release of the shared geometries ------------------------------------
// The caches above keep the CPU geometry for the session; its GPU side (vertex
// buffers and, for the glTF body's live hand morphs, three's per-geometry morph
// DataArrayTexture) is freed when the last mounted figure drawing it goes, so
// leaving a settlement releases what its villagers held instead of keeping every
// distinct figure ever drawn resident. A geometry drawn again re-uploads.

const geometryUsers = new Map<THREE.BufferGeometry, number>()

function holdGeometry(g: THREE.BufferGeometry): void {
  geometryUsers.set(g, (geometryUsers.get(g) ?? 0) + 1)
}

function releaseGeometry(g: THREE.BufferGeometry): void {
  const n = (geometryUsers.get(g) ?? 1) - 1
  if (n > 0) {
    geometryUsers.set(g, n)
    return
  }
  geometryUsers.delete(g)
  g.dispose()
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
  /** The glTF body's asset and person, whose clips this figure plays. */
  gltf: { asset: VillagerAsset; person: GltfPerson } | null
}

function buildRig(id: FigureIdentity, look: FigureLook, cloth: string, skin: string, office?: 'chief'): Rig {
  const asset = look.villager
  const person = asset ? cachedPerson(asset, id) : null
  const p = person ? person.p : bodyProportions(id.sex, id.age, id.build)
  const layers = appearanceFor({
    peopleId: look.peopleId,
    sex: id.sex,
    age: id.age,
    drivers: look.drivers,
    year: look.year,
    cloth,
    palette: look.palette,
    pick: id.pick,
    office,
  })
  const key = `${id.sex}|${id.age}|${id.build}`
  const paint = skinTone(layers, skin)
  const { skeleton, bones } =
    asset && person
      ? (createGltfSkeleton(asset, person.rest) as { skeleton: THREE.Skeleton; bones: Record<BoneName, THREE.Bone> })
      : createSkeleton(p)
  const bound = new THREE.Sphere(new THREE.Vector3(0, p.stature * 0.5, 0), p.stature * 0.85)
  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const m = new THREE.SkinnedMesh(geo, material)
    m.name = name
    m.castShadow = true
    m.boundingSphere = bound
    return m
  }
  const geo =
    asset && person
      ? cachedGltfFigure(asset, person, layers, key, skin, paint === skin ? null : paint, look.radial)
      : cachedFigure(p, layers, key, skin, paint === skin ? null : paint, look.radial)
  if (!geo.boundingBox) restBounds(geo)
  const body = mesh(geo, figureMaterial(!!(asset && person)), 'figure-body')
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
  // Both skeletons rest unrotated: the bone's bind place is its world place.
  const headAt = bones.head.getWorldPosition(new THREE.Vector3())
  crown.position.set(0, figureCrownOffset(p, geo, skeleton.bones.indexOf(bones.head), headAt), 0)
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
  return {
    p,
    layers,
    meshes,
    bones,
    skeleton,
    head,
    crown,
    hands: [hand('L', 'hand-left'), hand('R', 'hand-right')],
    gltf: asset && person ? { asset, person } : null,
  }
}

/** Hips → neck, in order: the glTF body's three-segment spine carries a
 *  `spine1` between `spine` and `chest` the code-built body does not have. */
function trunkChain(b: Record<BoneName, THREE.Bone>): THREE.Bone[] {
  const mid = (b as Partial<Record<string, THREE.Bone>>).spine1
  return mid ? [b.hips, b.spine, mid, b.chest, b.neck] : [b.hips, b.spine, b.chest, b.neck]
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
const _gazeAt = new THREE.Vector3()
const _toward = new THREE.Vector3()
const _palm = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _rs = new THREE.Vector3()
const _rv = new THREE.Vector3()
const _rn = new THREE.Vector3()
const _rf = new THREE.Vector3()

/** What the figure measured of its own walk, and its transitions in progress. */

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
  work,
  office,
  permanentLabel,
  ownedByPlayer,
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
  headSteady?: HeadLoadShape | null
  /** Kneels while true: down and up again as a short transition. */
  kneeling?: RefObject<boolean>
  sex?: Sex
  age?: AgeGroup
  /** The outer Figure's id, stable across a detail-level switch. */
  identityKey?: string
  /** The hands' work: the glTF body digs and carries its shovel by its clips. */
  work?: RefObject<FigureWork>
  /** An office whose dress this body wears (`appearanceFor`). */
  office?: 'chief'
  /** Carries a standing label of its own: the Ctrl layer does not name it twice. */
  permanentLabel?: boolean
  /** The player's own figure (the bird's-eye traveller): never named by the Ctrl layer. */
  ownedByPlayer?: boolean
}) {
  const ownKey = useId()
  const key = identityKey ?? ownKey
  const id = useMemo(() => figureIdentity(key, scale, sex, age), [key, scale, sex, age])
  const rig = useMemo(() => buildRig(id, look, cloth, skin, office), [id, look, cloth, skin, office])
  // The skeleton (and its bone texture) is this figure's own; the geometry is
  // shared through the caches, its GPU side held while any figure draws it.
  useEffect(() => {
    const geos = rig.meshes.map((m) => m.geometry)
    geos.forEach(holdGeometry)
    return () => {
      geos.forEach(releaseGeometry)
      rig.skeleton.dispose()
    }
  }, [rig])
  const L = FIGURE_LIMBS
  // THE VIRTUAL PRIMITIVE RIG the poses are written onto — the primitive
  // figure's pivots exactly (placeFigure.tsx), drawing nothing.
  // A kneeling one keeps the former squashed pivots: every kneeling contact
  // (the loom, the paddle, the gutting) was solved through them, and this rig
  // is never drawn — the drawn body kneels by its bones. A figure that kneels
  // down and gets up (`kneeling`) moves its pivots with its own kneel.
  const virtualAt = (k: number) => {
    const bodyH = 1 - 0.45 * k
    return { bodyH, squash: 1 - 0.25 * k, hipY: legs ? bodyH * L.hipY * (1 - k) : 0, armLen: bodyH * L.armLength }
  }
  const { bodyH, squash: virtualSquash, hipY, armLen } = virtualAt(kneel ? 1 : 0)
  const virtualRoot = useRef<THREE.Group>(null)
  const virtualK = useRef(kneel ? 1 : 0)
  const outer = useRef<THREE.Group>(null)
  const trunk = useRef<THREE.Group>(null)
  const arms = useRef<Array<THREE.Group | null>>([])
  const virtualHands = useRef<Array<THREE.Object3D | null>>([])
  const armRef = useMemo(() => restingArmRefs(arms.current, REST_POSE_ARMS), [])
  const owned = !!(pose && limbs)
  const dims = useMemo(() => legDims(rig.p), [rig])
  const motion = useRef<WalkMotion>(restingMotion(kneel))
  // The pose this figure shows of its own gesture (no caller owns it): the hands read its shape.
  const ownShown = useRef<FigurePose | null>(null)
  // THE glTF BODY'S CLIPS (work-order "villager glTF body: animation, dress
  // and tool"): the gait, the dig and the shovel carry, layered over the
  // code-built pose by weights that blend in and out — never a cut.
  const clips = useMemo(() => (rig.gltf ? clipLayers(rig.gltf.asset) : null), [rig])
  const shovel = useRef<THREE.Group>(null)
  // The gaze (natural-villager-motion step 9): what the head looks at, damped
  // frame by frame toward what the pose wants; tighter under a head load.
  const gaze = useRef(newGaze())
  const gazeTight = useRef(1)
  // THE LEGS AND HIPS from the walk, the work crouch and the kneel — one
  // function, so the frame callback and an owning caller's retarget both
  // leave the stride in place. Returns the walk for the arms and shoulders.
  const poseLegs = useMemo(() => {
    const b = rig.bones
    return (): WalkPose => {
      const m = motion.current
      const walk = walkPose(dims, m.phase, m.reach, m.weight, id.age, m.crouch, [m.plants[0].offset, m.plants[1].offset])
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
        // The hips' turn undone first, then the leg's sideways tilt, then its
        // swing; the foot kept flat under both.
        const roll = legsNow[i].roll ?? 0
        b[`thigh.${s}`].rotation.set(legsNow[i].thigh, -yaw, roll, 'YZX')
        b[`shin.${s}`].rotation.set(legsNow[i].shin, 0, 0)
        b[`foot.${s}`].rotation.set(legsNow[i].foot, 0, -roll)
      })
      return { ...walk, hipYaw: yaw, chestYaw: walk.chestYaw * (1 - m.kneel) }
    }
  }, [rig, dims, id.age])

  // Carry the virtual pose onto the bones. Called by `applyFigurePose` in the
  // frame the pose is written, and by this figure's own frame for the rest.
  //
  // ONE POSE PIPELINE on the glTF body (natural-villager-motion step 8), in a
  // fixed order: the code's legs (stance, crouch, kneel) and the arms it
  // gestures with → the clips as the base (idle, gait, carry, dig: trunk, neck,
  // head, clavicles and the arms they own) and the posed clavicles → the
  // contact's crouch target, tried on that body → the additive deltas (the
  // pose's lean and turn, the elder's stoop) → the hand contacts and the steadying
  // hand, solved on that final body → the shovel, the hand shapes, the head's
  // squat correction last. The gait's leg solve and pelvis drop run inside the
  // gait layer; nothing after it moves the pelvis or a leg (the trunk deltas
  // hang above the hips), so it is the last pass that moves the pelvis.
  const retarget = useMemo(() => {
    const b = rig.bones
    const p = rig.p
    const gb = b as unknown as Record<string, THREE.Bone>
    const trunkBase = newTrunkBase()
    const armBase = [0, 1].map(() => [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()])
    return () => {
      const vTrunk = trunk.current
      const root = b.hips.parent?.parent
      if (!vTrunk || !root) return
      const m = motion.current
      const kneelNow = kneel || !!kneeling?.current
      const gltf = rig.gltf && clips ? rig.gltf : null
      // the pose's optional parts, the glTF body's own where it has one
      const shownNow = pose?.current ?? ownShown.current
      const extras = shownNow?.body ?? shownNow
      // the part of the pose's turn that is the gaze's, not the trunk's own
      const gazeTurn = extras?.gaze?.turn ?? 0
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
      const standHip = (c: number) => dims.ankle + legExtent(dims, dims.flex + c)
      // THE TRUNK. On the code-built body the code writes it: the pose's lean
      // and turn at the hips, the elder's stoop at the chest. On the glTF body
      // the clips are its base and the same deltas are added on top of them
      // (`trunkBase`, taken once the clips are on; at rest until then).
      for (const n of LEAN_BONES) trunkBase[n].identity()
      let digShare = 0
      const writeTrunk = (extra: number, hipYaw: number, chestYaw: number) => {
        if (gltf) {
          // every lean distributed over the three spine segments on top of the
          // clips (step 9): the pose's, the elder's stoop, the contact's, and
          // the chest's share of a gaze turned off the trunk's own; they give
          // way to the dig, which leans by its own clip
          const k = 1 - digShare
          const own = vTrunk.rotation.y - gazeTurn
          const turn = own + VILLAGER_POSE.gaze.chestYaw * (gaze.current.yaw - own)
          leanTrunk(gb, trunkBase, (vTrunk.rotation.x + p.stoop + extra) * k, turn * k)
        } else {
          b.spine.rotation.set(vTrunk.rotation.x + extra, vTrunk.rotation.y - hipYaw, 0)
          b.chest.rotation.set(p.stoop, chestYaw, 0)
          b.neck.rotation.set(-p.stoop * 0.45, 0, 0)
        }
      }
      writeTrunk(0, 0, 0)
      b.head.quaternion.identity()
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
      // Where a contact hand is solved to (natural-villager-motion step 15).
      // Without a pose reach for the side: the virtual hand. With one, `k`
      // (1 included — the curve is continuous through it): up to 1 the hand
      // stands k of the DRAWN arm out from the drawn shoulder along the pose's
      // arm direction (a bent, readied arm — the virtual rig's proportions are
      // not the drawn child's); past 1 it is the world point the pose names,
      // k of the primitive arm out from its shoulder (the quarry's surface),
      // blended over k 1 … 1.15 so the reach never jumps.
      const handTarget = (s: 'L' | 'R', i: number, vh: THREE.Object3D, out: THREE.Vector3) => {
        const k = i === 0 ? extras?.reach?.left : extras?.reach?.right
        const pivot = arms.current[i]
        if (k === undefined || !pivot) return loc(vh, out)
        loc(pivot, _rv)
        loc(vh, _rf)
        const far = _rf.clone().sub(_rv).multiplyScalar(k).add(_rv)
        _rf.sub(_rv).normalize()
        // the drawn arm's reach, measured with this function's own scratch
        // vectors (the callers hold theirs across this call)
        const sh = loc(b[`upperArm.${s}`], new THREE.Vector3())
        const el = loc(b[`forearm.${s}`], new THREE.Vector3())
        const wr = loc(b[`hand.${s}`], new THREE.Vector3())
        const len = sh.distanceTo(el) + el.distanceTo(wr) + wr.distanceTo(loc(rig.hands[s === 'L' ? 0 : 1], new THREE.Vector3()))
        _rs.copy(sh)
        _rn.copy(_rs).addScaledVector(_rf, len * Math.min(1, k))
        const t = Math.max(0, Math.min(1, (k - 1) / 0.15))
        return out.copy(_rn).lerp(far, t * t * (3 - 2 * t))
      }
      let hipYaw = 0
      let chestYaw = 0
      const leanIn = () => {
        writeTrunk(0, hipYaw, chestYaw)
        b.hips.updateWorldMatrix(false, true)
        loc(b.spine, _pivot)
        _fwd.set(0, 0, 1).applyQuaternion(qIn(b.spine, _q)).setY(0).normalize()
        let lean = 0
        ;(['L', 'R'] as const).forEach((s, i) => {
          const vh = virtualHands.current[i]
          if (!vh || !contactArm[i]) return
          const reach = reachOf(s)
          loc(b[`upperArm.${s}`], _s)
          handTarget(s, i, vh, _t)
          lean = Math.max(lean, contactLean(_s, _t, reach * 0.995, _pivot, _fwd))
        })
        // a pose's reach that may lunge (the tag catch's last stride) leans in
        // as far as it takes when a lean reaches its target; any other pose
        // with its own reach leans by its own lean alone (the run's, step 15)
        // (a share of it while a blend eases the lunge in or out)
        const lunge = Math.min(1, Math.max(0, Number(extras?.reach?.lunge ?? 0)))
        const grab = lunge > 0
        if (extras?.reach && !grab) lean = 0
        if ((lean > 0 || grab) && gltf) {
          // the glTF trunk bends over three segments, not about one pivot:
          // the lean is searched again through the distributed chain, the
          // least (in the same steps) that brings every contact within reach
          lean = 0
          for (let l = 0.05; l <= VILLAGER_POSE.contactLeanMax + 1e-9; l += 0.05) {
            writeTrunk(l, hipYaw, chestYaw)
            b.hips.updateWorldMatrix(false, true)
            const short = (['L', 'R'] as const).some((s, i) => {
              const vh = virtualHands.current[i]
              return !!vh && contactArm[i] && loc(b[`upperArm.${s}`], _s).distanceTo(handTarget(s, i, vh, _t)) > reachOf(s) * 0.995
            })
            if (!short) {
              lean = l
              break
            }
          }
          if (extras?.reach) lean *= lunge
          writeTrunk(lean, hipYaw, chestYaw)
          b.hips.updateWorldMatrix(false, true)
        } else if (lean > 0) {
          if (extras?.reach) lean *= lunge
          writeTrunk(lean, hipYaw, chestYaw)
          b.spine.updateWorldMatrix(false, true)
        }
      }
      const walk = poseLegs()
      // the code walk's counter-turn of the trunk is the code-built body's:
      // the glTF body's gait clip carries its own (and its stray −hipYaw goes)
      hipYaw = gltf ? 0 : walk.hipYaw
      chestYaw = gltf ? 0 : walk.chestYaw
      writeTrunk(0, hipYaw, chestYaw)
      b.hips.updateWorldMatrix(false, true)
      // THE STEADYING HAND on a head load: the free arm on the load's side.
      const loadShown = rig.crown.children.some((c) => c.visible)
      const steadyArm = headSteady && loadShown && m.kneel < 0.5 ? (!contactArm[0] ? 0 : !contactArm[1] ? 1 : -1) : -1
      // THE ARMS THE CODE GESTURES WITH (and every arm's fallback): the pose's
      // direction carried onto the bones.
      ;(['L', 'R'] as const).forEach((s, i) => {
        const vPivot = arms.current[i]
        if (vPivot) {
          // A hanging arm hangs by gravity, not with the stooped chest (whose
          // forward bend swings an arm fixed to it BACK by the same angle); a
          // free one swings against its leg.
          const hang = Math.abs(vPivot.rotation.x) < 0.3 ? -p.stoop : 0
          const swing = contactArm[i] ? 0 : walk.arms[i]
          b[`upperArm.${s}`].quaternion.setFromEuler(gestureArmEuler({ pitch: vPivot.rotation.x + hang + swing, yaw: vPivot.rotation.y, roll: vPivot.rotation.z }, _euler))
          b[`forearm.${s}`].rotation.set(-0.2 - Math.max(0, -swing) * 0.6, 0, 0)
        }
        b[`hand.${s}`].quaternion.identity()
      })
      // THE CLIPS AS THE BASE, then the additive deltas on top of them.
      if (gltf && clips) {
        const free = ([0, 1] as const).map((i) => {
          const v = arms.current[i]
          return !contactArm[i] && i !== steadyArm && (!v || armAtRest({ pitch: v.rotation.x, yaw: v.rotation.y, roll: v.rotation.z }, REST_POSE_ARMS[i]))
        }) as [boolean, boolean]
        applyClipLayers(gltf.asset, gltf.person, gb, clips, m, free)
        takeTrunkBase(gb, trunkBase)
        digShare = clips.dig
        poseShoulders(gb, extras?.shoulders)
        writeTrunk(0, 0, 0)
        ;(['L', 'R'] as const).forEach((s, i) => {
          armBase[i][0].copy(b[`upperArm.${s}`].quaternion)
          armBase[i][1].copy(b[`forearm.${s}`].quaternion)
          armBase[i][2].copy(b[`hand.${s}`].quaternion)
        })
      }
      b.hips.updateWorldMatrix(false, true)
      // THE CONTACT'S CROUCH, chosen on the established body (the clips, the
      // dig's share and the posed clavicles already on).
      if (contact && !kneelNow && Math.abs(m.speed) <= VILLAGER_MOTION.moveSpeed) {
        // Every pose is solved from STANDING height: a contact's crouch is
        // found afresh each time, never inherited, so a held contact cannot
        // alternate between crouched and standing. Each crouch is tried WITH
        // its own lean (a low contact takes both: bent knees and a bent back).
        const shortOf = () =>
          Math.max(
            ...(['L', 'R'] as const).map((s, i) => {
              const vh = virtualHands.current[i]
              return vh && contactArm[i] ? loc(b[`upperArm.${s}`], _s).distanceTo(handTarget(s, i, vh, _t)) - reachOf(s) * 0.995 : -1
            }),
          )
        const hipY = b.hips.position.y
        const tryAt = (cc: number) => {
          b.hips.position.y = standHip(cc)
          leanIn()
          return shortOf()
        }
        m.crouchTarget = crouchTarget(m.speed, contactCrouch(tryAt))
        // the tries leave the body as it was
        b.hips.position.y = hipY
        writeTrunk(0, hipYaw, chestYaw)
        b.hips.updateWorldMatrix(false, true)
      } else {
        // Never a crouch on the move: released before the walk, resumed after.
        m.crouchTarget = 0
      }
      if (contact) leanIn()
      // THE GAZE on the final trunk (step 9): the head held on what the figure
      // looks at — a hand in a contact, else the horizon along the heading
      // (turned with the pose's own turn) — damped in the frame callback, and
      // given way to the dig, whose head follows the blade by its clip.
      if (gltf && clips) {
        const g = gaze.current
        const reaching = [0, 1].filter((i) => contactArm[i] && virtualHands.current[i])
        const wanted = extras?.gaze
        if (wanted) {
          // the pose names what the head looks at (the quarry, the ground ahead)
          g.wantYaw = wanted.yaw
          g.wantPitch = wanted.pitch
        } else if (reaching.length) {
          _gazeAt.set(0, 0, 0)
          for (const i of reaching) _gazeAt.add(loc(virtualHands.current[i]!, _t))
          _gazeAt.divideScalar(reaching.length).sub(loc(b.head, _t))
          const a = gazeAngles(_gazeAt)
          g.wantYaw = a.yaw
          g.wantPitch = a.pitch
        } else {
          g.wantYaw = vTrunk.rotation.y
          g.wantPitch = 0
        }
        gazeTight.current = loadShown ? VILLAGER_POSE.gaze.headLoad : 1
        b.hips.updateWorldMatrix(false, true)
        gazeHead(gb, g.yaw, g.pitch, 1 - clips.dig)
      }
      // THE HANDS ON THE FINAL BODY: each contact and the steadying hand.
      let steadyShown = 0
      ;(['L', 'R'] as const).forEach((s, i) => {
        const up = b[`upperArm.${s}`]
        const fore = b[`forearm.${s}`]
        const vh = virtualHands.current[i]
        const chestQ = () => qIn(b.chest, new THREE.Quaternion())
        const solveTo = (target: THREE.Vector3, pole: THREE.Vector3) => {
          const a = loc(fore, _e).distanceTo(loc(up, _s))
          const reach = reachOf(s)
          loc(up, _s)
          const sol = solveTwoBone(_s, target, a, reach - a, pole)
          if (!sol.reached) return false
          // the arm's own parent (the clavicle on the glTF body, else the chest)
          const pq = qIn(up.parent ?? b.chest, new THREE.Quaternion())
          up.quaternion.copy(hangToward(sol.upper, pq))
          up.updateWorldMatrix(false, true)
          fore.quaternion.copy(hangToward(sol.fore, qIn(up, new THREE.Quaternion())))
          b[`hand.${s}`].quaternion.identity()
          return true
        }
        let done = false
        if (i === steadyArm && headSteady) {
          // A hand on the rim: the grip found in the crown's own frame (the
          // load tilts with the head), brought into the body's.
          rig.crown.updateWorldMatrix(true, false)
          const sh = rig.crown.worldToLocal(up.getWorldPosition(_grip))
          const g = headLoadGrip({ x: sh.x, y: sh.y, z: sh.z }, i === 0 ? 1 : -1, headSteady, reachOf(s))
          body.worldToLocal(rig.crown.localToWorld(_grip.set(g.x, g.y, g.z)))
          _pole.set(i === 0 ? 1 : -1, -0.3, 0.2).applyQuaternion(chestQ())
          done = solveTo(_grip, _pole)
          // the palm on the load, not the back of the hand: the wrist rolled
          // toward the load's axis at the grip's height
          if (done) {
            body.worldToLocal(rig.crown.localToWorld(_toward.set(0, g.y, 0))).sub(_grip)
            const side = i === 0 ? 1 : -1
            // taken near the roll this pose needs, so the split never crosses its cut
            const roll = palmRollAngle(qIn(fore, _q), palmNormal(rig.gltf ? 'gltf' : 'code', side, _palm), _toward, palmRollCenter(side))
            // the forearm rolls about its own axis (the hand stays put), the wrist the rest
            fore.quaternion.multiply(_q.setFromAxisAngle(_up, roll * FOREARM_ROLL_SHARE))
            b[`hand.${s}`].quaternion.setFromAxisAngle(_up, roll * (1 - FOREARM_ROLL_SHARE))
          }
        } else if (contactArm[i] && vh) {
          // (reachOf uses _t as scratch: measured before the target is)
          const r = reachOf(s) * 0.999
          handTarget(s, i, vh, _t)
          // a pose's own reach past the arm (a grab easing out before its
          // lunge) holds the arm straight toward it rather than dropping to the
          // unsolved fallback, so the hand runs on through k = 1 (the lean
          // search above still sees the full target)
          if ((i === 0 ? extras?.reach?.left : extras?.reach?.right) !== undefined) {
            loc(up, _s)
            if (_t.distanceTo(_s) > r) _t.sub(_s).setLength(r).add(_s)
          }
          _pole.set(s === 'L' ? 0.5 : -0.5, -0.4, -1).applyQuaternion(chestQ())
          done = solveTo(_t.clone(), _pole)
        }
        // while the clips still own part of the arm (taken or given back), the
        // solve blends with what they left, never a snap
        const share = gltf && clips ? Math.max(clips.dig, clips.arms[i]) : 0
        if (done && share > 0) {
          up.quaternion.slerp(armBase[i][0], share)
          fore.quaternion.slerp(armBase[i][1], share)
          b[`hand.${s}`].quaternion.slerp(armBase[i][2], share)
        }
        if (i === steadyArm) steadyShown = done ? 1 - share : 0
      })
      // Dev: the steadying hand as drawn (which arm, how much of its solve
      // shows past the clips), for the verification's head-load frames.
      if (import.meta.env.DEV && outer.current) {
        outer.current.userData.steady = {
          arm: steadyArm < 0 ? null : steadyArm === 0 ? 'left' : 'right',
          weight: steadyShown,
          load: !!headSteady && loadShown,
          contact: [contactArm[0], contactArm[1]],
        }
      }
      if (gltf && clips) {
        placeShovel(gltf.asset, gltf.person, clips, shovel.current)
        gripShaft(gltf.asset, gltf.person, gb, clips, shovel.current)
        const ph = extras?.pointHand
        applyHandShapes(rig.meshes[0], handShapes(clips, ph ? [ph.left, ph.right] : [0, 0]))
      }
      // The head's squat correction depends on the chain just posed, and
      // composes with the head's own turn: last, so an owning caller's
      // retarget never leaves a stale one.
      unsquashHead(b.head, trunkChain(b), squat?.current ?? 1)
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
  }, [rig, dims, pose, squat, poseLegs, headSteady, kneel, kneeling, clips])

  // Publish the virtual pivots to the caller that owns the pose.
  const selfLimbs = useRef<FigureLimbs>({ arms: arms.current, trunk: null, retarget, skinned: true })
  useEffect(() => {
    selfLimbs.current.retarget = retarget
    if (!limbs) return
    limbs.current = { arms: arms.current, trunk: trunk.current, retarget, skinned: true }
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
      g.getWorldDirection(_facing)
      // The hips' place and each thigh's offset in the hips' frame:
      // `stepWalk` carries the offsets through the pelvis turn of the pose it
      // is about to draw (`hipJointAt`) — the bones still hold last frame's
      // turn, so their drawn positions would be a frame stale.
      const hips = rig.bones.hips.position
      const joints = (['L', 'R'] as const).map((side) => {
        const t = rig.bones[`thigh.${side}`].position
        return { hips: { x: hips.x, z: hips.z }, thigh: { x: t.x, z: t.z } }
      }) as [HipJoint, HipJoint]
      const body = { x: _here.x, z: _here.z, yaw: Math.atan2(_facing.x, _facing.z), unit }
      const walked = stepWalk(m, body, dt, dims, id.age, kneel || !!kneeling?.current, joints)
      if (rig.gltf && clips) stepClipLayers(rig.gltf.asset, rig.gltf.person, clips, walked, m.speed, body, work?.current ?? null, dt)
      // Dev: the walk the village-walk verification reads beside the bones,
      // and the glTF body's gait shares at that speed (walk/jog/sprint), so
      // it can pick a figure that really walks.
      if (import.meta.env.DEV) {
        g.userData.walk = m
        const f = rig.gltf?.person.frame
        g.userData.gait = f ? gaitWeights(m.speed / f.scale, f.legScale) : null
      }
      m.crouch = approach(m.crouch, m.crouchTarget, VILLAGER_MOTION.crouchRate, dt)
      const actor = g.userData.actor as { height: number } | undefined
      if (actor) actor.height = 1.45 - 0.45 * m.kneel // the label over the drawn crown
    }
    if (m.kneel !== virtualK.current && virtualRoot.current) {
      virtualK.current = m.kneel
      const v = virtualAt(m.kneel)
      virtualRoot.current.scale.set(1, v.squash, 1)
      trunk.current?.position.setY(v.hipY)
      ;[0, 1].forEach((i) => {
        arms.current[i]?.position.set((i === 0 ? 1 : -1) * v.bodyH * L.shoulderX, v.bodyH * L.shoulderY - v.hipY, 0)
        virtualHands.current[i]?.position.setY(-v.armLen)
      })
    }
    if (!isLifeFrozen()) stepGaze(gaze.current, dt, VILLAGER_POSE.gaze, gazeTight.current)
    let shown = pose?.current ?? null
    if (!shown && gesture?.current) {
      gesture.current = advanceGesture(gesture.current, dt)
      shown = gesturePose(gesture.current)
    }
    ownShown.current = owned ? null : shown
    if (shown && !owned) {
      selfLimbs.current.trunk = trunk.current
      applyFigurePose(selfLimbs.current, shown) // retargets
    } else {
      retarget()
    }
  })

  return (
    <group ref={outer} name="inhabitant" scale={scale} userData={markActor({ kind: role, height: bodyH + 0.45, permanentLabel, ownedByPlayer })}>
      {rig.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
      {/* The virtual primitive rig — pivots only, nothing drawn. */}
      <group ref={virtualRoot} scale={[1, virtualSquash, 1]} visible={false}>
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
      {/* Keyed by skeleton: a rebuilt rig remounts the props on its new bones. */}
      <Fragment key={rig.skeleton.uuid}>
        {handProp && createPortal(<>{handProp}</>, rig.hands[0])}
        {rig.gltf &&
          createPortal(
            <group ref={shovel} visible={false} name="digging-tool">
              <Shovel />
            </group>,
            rig.bones['hand.R'],
          )}
        {headProp && createPortal(<>{headProp}</>, rig.crown)}
      </Fragment>
    </group>
  )
}
