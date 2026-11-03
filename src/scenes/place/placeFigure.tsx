// The settlement's primitive human Figure (moved out of PlaceLife.tsx by
// work-order 1245, unchanged), so the vignettes that live in their own files —
// the fishermen's dugout and fire (`RiverFishery.tsx`) — draw the same people
// the rest of the village is drawn with. Its contexts and hooks are in
// `placeFigureContext.ts`.

import { useContext, useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { gaitBodyLift, legSwingAngle } from '../../render/fauna'
import { FIGURE_LIMBS, TESSELLATION } from '../../render/figures'
import { applyFigurePose, restingArmRefs, type FigureLimbs } from '../../render/figurePose'
import { advanceGesture, gesturePose, type FigurePose, type GestureState } from '../../render/gesture'
import {
  approach,
  leanedHipY,
  primitiveHandTarget,
  primitiveLayout,
  primitivePoseRig,
  primitiveTrunkRadius,
  solvePrimitiveArm,
  type HeadLoadShape,
  type PrimitiveLayout,
} from '../../render/figureWalk'
import { VILLAGER_MOTION } from '../../config/balance'
import { cloakForCloth, wearsByRank } from '../../systems/dress'
import type { ActorRoleKind } from '../../systems/actorLabels'
import { markActor } from '../actorLabelSource'
import { isLifeFrozen } from './lifeFreeze'
import { ColdCloaksContext, FigureLookContext, LimbDetailContext, REST_POSE_ARMS, type FigureWork } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'
import type { AgeGroup, DressLayer, Sex } from '../../systems/appearance'

type FigureProps = Parameters<typeof PrimitiveFigure>[0] & {
  /** Who this villager is, when the vignette knows (the pounding women, the
   *  conversing elder and young man); otherwise stable per figure, a child by
   *  its scale (skinnedFigure.tsx `figureIdentity`). Read by the skinned body. */
  sex?: Sex
  age?: AgeGroup
  /** The hands' work for the glTF body's clips (ignored by the primitive). */
  work?: RefObject<FigureWork>
  /** An office whose dress the skinned body wears (the primitive keeps its cloth). */
  office?: 'chief'
  /** DEV lineup only (dressLineup.tsx): the skinned body's forced outfit and build. */
  dress?: readonly DressLayer[]
  build?: number
}

/**
 * A settlement inhabitant. On the medium and high presets it is the skinned,
 * dressed body (skinnedFigure.tsx, work-order "villager dress"); on the low
 * preset — and wherever no settlement look is provided — the primitive figure
 * below, unchanged (user decision 04.10.2026). Both take the same props and
 * publish the same pivots, so a vignette never knows which one it drew.
 */
export function Figure({ sex, age, work, office, dress, build, ...props }: FigureProps) {
  const look = useContext(FigureLookContext)
  // Who this villager is, keyed HERE: this component stays mounted when the
  // detail level swaps the drawn body, so medium → low → medium keeps the person.
  const identityKey = useId()
  return look ? (
    <SkinnedFigure look={look} sex={sex} age={age} identityKey={identityKey} work={work} office={office} dress={dress} build={build} {...props} />
  ) : (
    <PrimitiveFigure {...props} />
  )
}

/**
 * Simple primitive human figure; `kneel` folds it down for sitting work.
 *
 * Since point 479 the figure has ARMS — a cone with a sphere head cannot show
 * what it is talking about, and the pointing gesture is the anchor the
 * communication's direction words hang on. LEGS are opt-in: a floor-length wrap
 * is the period dress for most adults and legs under it would draw nothing, so
 * they go on the figures whose stride must read (the running children, the
 * walking loom helper).
 *
 * The gesture itself is driven from outside through `gesture`, a ref the caller
 * owns and this figure advances — one state per figure, which is why two
 * gestures can never run on one body. `pose` is the direct alternative for a
 * caller that computes the whole pose itself (the drummer, the porter's carry,
 * the children, whose round combines their gestures with the run).
 */
function PrimitiveFigure({
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
  headProp,
  kneeling,
  permanentLabel,
  ownedByPlayer,
}: {
  cloth: string
  skin?: string
  scale?: number
  kneel?: boolean
  /** What this inhabitant IS, for the hold-Ctrl layer (design.md §17.8): it
   *  names people by their role, and every figure in a settlement is one. */
  role?: ActorRoleKind
  /** Draw legs and let `gait` swing them (ignored while kneeling). */
  legs?: boolean
  /** The figure's own gesture state; this figure advances and applies it. */
  gesture?: RefObject<GestureState>
  /** A pose written by the caller each frame; wins over `gesture` when set. */
  pose?: RefObject<FigurePose | null>
  /** The y-squash the CALLER is applying to this figure's own group, read every
   *  frame so the head can be kept round through it (work-order 1085). A squat
   *  shortens a man; it does not flatten his skull, and a sphere squashed to
   *  seven tenths reads as a deflated ball hovering over a traffic cone — which
   *  is what the first two frames of the fill showed. */
  squat?: RefObject<number>
  /** Where to publish this figure's own pivots. A caller that supplies BOTH
   *  this and `pose` owns the application and applies it itself, in the frame
   *  it writes it — see `applyFigurePose` (work-order 1065). */
  limbs?: RefObject<FigureLimbs | null>
  /** Gait phase (rad) driving the leg swing — the caller accumulates the
   *  distance walked, because only it knows this figure's world scale. */
  gait?: RefObject<number>
  /**
   * Something CARRIED IN A HAND, mounted inside the arm pivot so it rides
   * whatever that arm does.
   *
   * A prop hung on the figure's own group instead sits at a fixed spot beside
   * the trunk: the water carrier's jar floated at his hip while his arm went up
   * to indicate the river (GPT-5.6 Sol, first cross-vendor round, C2). The arm
   * is the +x one, which is the side the jar was drawn on.
   */
  handProp?: ReactNode
  /** A load carried on the head, resting on its crown. The primitive's arm
   *  cannot reach above its head, so it balances the load hands-free. */
  headProp?: ReactNode
  /** Accepted for the skinned body's sake; the primitive balances its load. */
  headSteady?: HeadLoadShape | null
  /** Kneels while true: down and up again as a short transition. */
  kneeling?: RefObject<boolean>
  /** Carries a standing label of its own: the Ctrl layer does not name it twice. */
  permanentLabel?: boolean
  /** The player's own figure (the bird's-eye traveller): never named by the Ctrl layer. */
  ownedByPlayer?: boolean
}) {
  const cold = useContext(ColdCloaksContext)
  const segments = useContext(LimbDetailContext)
  const L = FIGURE_LIMBS
  // KNEELING IS A FOLD AT THE HIP, never a squash of the figure (work-order
  // "walking villagers", from point 350): the group's scale stays uniform, the
  // head keeps its shape, and going down or up is a transition. Since
  // work-order 1301 every limb keeps its length through it: the trunk its
  // height and taper, the shoulders their width, the arms their length.
  const kneelK = useRef(kneel ? 1 : 0)
  // Legs only on a standing figure — a kneeling one has folded them away, and
  // is laid out as a legless one (its wrap down to the ground).
  const withLegs = legs && !kneel
  const legged = useRef(withLegs)
  legged.current = withLegs
  const shape = useRef<PrimitiveLayout>(primitiveLayout(kneelK.current, withLegs, L))
  const lay = shape.current
  const hipY = lay.hipY
  const trunkR = primitiveTrunkRadius(L)
  // The wrap's lower part on a legless figure: the standing cone's own taper
  // from the ground (bodyRadius) up to the trunk cone's base, so standing the
  // two read as the one cone they always were.
  // OPEN: kneeling, this part — the dress over the folded legs — is the one
  // that lowers (to the hip's kneeling height): a cone cannot fold its wrap.
  // Whether a legless kneeler should instead show folded thighs is a design call.
  const baseRadius = (n: PrimitiveLayout) => (n.skirt > 0 ? L.bodyRadius : trunkR)
  const outer = useRef<THREE.Group>(null)
  const lifted = useRef<THREE.Group>(null)
  const trunk = useRef<THREE.Group>(null)
  const cone = useRef<THREE.Mesh>(null)
  const wrapMesh = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const crown = useRef<THREE.Group>(null)
  const skirtMesh = useRef<THREE.Mesh>(null)
  const uppers = useRef<Array<THREE.Group | null>>([])
  const fores = useRef<Array<THREE.Group | null>>([])
  const arms = useRef<Array<THREE.Group | null>>([])
  const legPivots = useRef<Array<THREE.Group | null>>([])
  // A PIVOT IS PUT AT REST WHEN IT IS BORN, NOT AT EVERY RENDER (work-order
  // 1065). Held for this figure's lifetime, because an inline ref callback is a
  // new function every render and React would re-attach it each time —
  // `restingArmRefs` says what that cost the tapping child's hand.
  const armRef = useMemo(() => restingArmRefs(arms.current, REST_POSE_ARMS), [])

  // The caller that owns the pose is given the pivots to write it onto. The
  // effect runs once the refs are filled, and the object it publishes is read
  // every frame, so nothing is allocated per frame.
  const owned = !!(pose && limbs)
  // Its OWN pivots, in one object that outlives the frame — `arms.current` is a
  // stable array, only the trunk arrives later.
  // THE ARMS, BROUGHT TO THEIR HANDS (work-order 1301). A pose writes each
  // shoulder pivot's rotation; the hand it means is where the rig the poses
  // were tuned on puts it (`primitivePoseRig`), held on or above the ground,
  // and the drawn arm — full length, bent at the elbow — is solved to it, as
  // the skinned figure solves its arm to its virtual hand. Run after every
  // write of a pose (`retarget`, through applyFigurePose) and every frame.
  const settle = useMemo(() => {
    const target = new THREE.Vector3()
    const frame = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), lean: 0 }
    return () => {
      const t = trunk.current
      const n = shape.current
      if (!t) return
      // A forward lean while kneeling (setting a load down) would tip the
      // trunk's base rim into the ground; the hip rises by just that much.
      t.position.y = leanedHipY(n.hipY, baseRadius(n), t.rotation.x)
      frame.position.copy(t.position)
      frame.quaternion.copy(t.quaternion)
      frame.lean = t.rotation.x
      const rig = primitivePoseRig(kneelK.current, legged.current, L)
      const ground = -(lifted.current?.position.y ?? 0)
      for (let i = 0; i < 2; i++) {
        const pivot = arms.current[i]
        const up = uppers.current[i]
        const fore = fores.current[i]
        if (!pivot || !up || !fore) continue
        const side = i === 0 ? 1 : -1
        primitiveHandTarget(pivot.quaternion, side, rig, frame, ground, L.handRadius, target)
        solvePrimitiveArm(pivot, target, n.upperArm, side, up.quaternion, fore.quaternion)
      }
    }
    // the closure reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const selfLimbs = useRef<FigureLimbs>({ arms: arms.current, trunk: null, retarget: settle })
  useEffect(() => {
    if (!limbs) return
    limbs.current = { arms: arms.current, trunk: trunk.current, retarget: settle }
    return () => {
      limbs.current = null
    }
  }, [limbs, settle])

  // Lays the figure out at a kneel fraction: every height from the proportions.
  const applyLayout = (n: PrimitiveLayout) => {
    const wrapWear = cold?.wear === 'head'
    trunk.current?.position.setY(n.hipY)
    cone.current?.position.setY(n.skirt + n.trunkLength * 0.5)
    if (skirtMesh.current) {
      skirtMesh.current.visible = n.skirt > 0
      skirtMesh.current.position.y = n.skirt * 0.5
      skirtMesh.current.scale.set(1, Math.max(n.skirt, 1e-6), 1)
    }
    // The seasonal wrap rides the shoulders, its size its own.
    wrapMesh.current?.position.setY(n.height - (wrapWear ? 0.18 : 0.34) - n.hipY)
    head.current?.position.setY(n.headY - n.hipY)
    crown.current?.position.setY(n.headY + n.headRadius - n.hipY)
    ;[0, 1].forEach((i) => {
      arms.current[i]?.position.set((i === 0 ? 1 : -1) * n.shoulderX, n.shoulderY - n.hipY, 0)
    })
    // The legs fold back under the sinking hips, their feet kept on the ground
    // — never hidden in one frame (no pop) — and their round kept above it.
    legPivots.current.forEach((p) => {
      if (!p) return
      p.position.y = n.hipY
      if (kneelK.current > 0 || !gait) p.rotation.x = n.legFold
    })
    const actor = outer.current?.userData.actor as { height: number } | undefined
    if (actor) actor.height = n.labelHeight
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const wanted = kneel || !!kneeling?.current
    // The dev life freeze holds a transition where it is, for the camera.
    const k = isLifeFrozen() ? kneelK.current : approach(kneelK.current, wanted ? 1 : 0, 1 / VILLAGER_MOTION.kneelSeconds, dt)
    if (k !== kneelK.current || !cone.current?.userData.laid) {
      kneelK.current = k
      shape.current = primitiveLayout(k, withLegs, L)
      applyLayout(shape.current)
      if (cone.current) cone.current.userData.laid = true
    }
    // Dev: the kneel the village-walk verification reads (as the skinned
    // walk's) — every frame, since a render replaces the group's userData.
    if (import.meta.env.DEV && outer.current) outer.current.userData.kneel = kneelK.current
    // The kneel the bug-report dump reads, in every build (placeDumpRead.ts).
    if (outer.current) outer.current.userData.dumpKneel = kneelK.current
    let shown = pose?.current ?? null
    if (!shown && gesture?.current) {
      gesture.current = advanceGesture(gesture.current, dt)
      shown = gesturePose(gesture.current)
    }
    // An OWNED pose is applied by whoever writes it, in that same frame;
    // applying last frame's copy here would only draw it one frame stale.
    if (shown && !owned) {
      selfLimbs.current.trunk = trunk.current
      applyFigurePose(selfLimbs.current, shown)
    }
    // THE HEAD, KEPT ROUND THROUGH THE CALLER'S SQUASH (work-order 1085).
    // A y-scale of its own CANNOT undo it: the squash sits on the figure's group,
    // ABOVE the trunk, and the trunk is rotated by the lean, so the head's local
    // y is not the axis being squashed. Measured on the drawn head: 0.720 with
    // the lean standing and the scale alone applied — the full squash, straight
    // through. The parent chain contributes `diag(1,s,1) · Rx(lean)` at the head,
    // and a three.js mesh's own linear part is `R · S`, so the exact inverse IS
    // expressible there: `Rx(-lean) · diag(1,1/s,1)`, which is a counter-rotation
    // and a stretch. The head is a smooth sphere, so its counter-rotation is
    // invisible; only its roundness survives. `turn` needs no answer — a rotation
    // about y commutes with a scale along y.
    if (head.current) {
      const squash = squat?.current ?? 1
      const flattened = squash > 0.01 && Math.abs(squash - 1) > 1e-4
      head.current.scale.y = flattened ? 1 / squash : 1
      head.current.rotation.x = flattened ? -(trunk.current?.rotation.x ?? 0) : 0
    }
    if (withLegs && gait && kneelK.current === 0) {
      const phase = gait.current
      const a = legPivots.current[0]
      const b = legPivots.current[1]
      if (a) a.rotation.x = legSwingAngle(phase, 0)
      if (b) b.rotation.x = legSwingAngle(phase, Math.PI)
      // Dropped onto the stance leg, so the swinging feet ride the ground
      // instead of hanging above it (the drop callers used to apply).
      lifted.current?.position.setY(gaitBodyLift(phase, L.hipY))
    } else if (kneelK.current > 0) lifted.current?.position.setY(0)
    settle()
  })
  // The wrap this figure actually wears — null when the season is off, and null
  // for most figures when the record gates the garment on RANK. Barth on the
  // Hausa zenne: "Only the wealthier amongst them can afford" it, while his
  // schoolboys sat at a pre-dawn fire "with scarcely a rag of a shirt on"; his
  // Tuareg chief ENVIED the bernus rather than owning one. So a village in the
  // cold shows a few draped figures among many bare ones — the cold is a class
  // experience here, and rendering everyone in a plaid would erase the finding.
  const wrap = cold && (!cold.rankOnly || wearsByRank(cloth, cold.palette))
    ? cloakForCloth(cold.cloaks, cold.palette, cloth)
    : null
  const upper = lay.upperArm
  const elbowR = (L.armRadius[0] + L.armRadius[1]) * 0.5
  const wrapHead = !!wrap && cold!.wear === 'head'
  return (
    // Named so a speaking figure can be found in the scene graph — the overhead
    // speech label rides on this object (design.md §13.4).
    <group ref={outer} name="inhabitant" scale={scale} userData={markActor({ kind: role, height: lay.labelHeight, permanentLabel, ownedByPlayer })}>
      <group ref={lifted}>
        {/* The trunk pivots at the hip so a lean or a shake carries the arms and
            the head with it, and the legs (below) stay planted. The cone is a
            unit one laid out to the trunk's proportions. */}
        <group ref={trunk} name="figure-trunk" position={[0, hipY, 0]}>
          <mesh ref={cone} position={[0, lay.skirt + lay.trunkLength * 0.5, 0]} scale={[trunkR, lay.trunkLength, trunkR]} castShadow>
            <coneGeometry args={[1, 1, TESSELLATION.figureBody]} />
            <meshStandardMaterial color={cloth} roughness={0.95} />
          </mesh>
          {!withLegs && (
            <mesh ref={skirtMesh} name="figure-skirt" position={[0, lay.skirt * 0.5, 0]} scale={[1, Math.max(lay.skirt, 1e-6), 1]} castShadow>
              <cylinderGeometry args={[trunkR, L.bodyRadius, 1, TESSELLATION.figureBody]} />
              <meshStandardMaterial color={cloth} roughness={0.95} />
            </mesh>
          )}
          {/* The seasonal wrap goes OVER the everyday dress (Mayr): a shell around
              the shoulders, leaving the dress showing below. Where the record says
              the head is muffled in it (the Somali tobe in the karif), the shell
              rises past the head instead — that is the one head-wear case, and the
              shape difference IS the finding. */}
          {wrap && (
            <mesh
              ref={wrapMesh}
              position={[0, lay.height - (wrapHead ? 0.18 : 0.34) - hipY, 0]}
              scale={[1, wrapHead ? 1.0 : 0.68, 1]}
              castShadow
            >
              <coneGeometry args={[0.355, 1, TESSELLATION.figureBody]} />
              <meshStandardMaterial
                color={wrap}
                roughness={0.8} // every wrap, hide or woven, sits a touch glossier than the body cloth
              />
            </mesh>
          )}
          {/* The head shows unless the wrap is drawn over it. */}
          {!wrapHead && (
            <mesh name="figure-head" ref={head} position={[0, lay.headY - hipY, 0]} castShadow>
              <sphereGeometry args={[lay.headRadius, ...TESSELLATION.figureHead]} />
              <meshStandardMaterial color={skin} roughness={0.85} />
            </mesh>
          )}
          {/* A head load rests on the crown and rides the trunk's lean. */}
          <group ref={crown} name="figure-crown" position={[0, lay.headY + lay.headRadius - hipY, 0]}>
            {headProp}
          </group>
          {/* Arms (point 479). One pivot per shoulder, the limb hanging down its
              local −y, so a rotation IS the gesture. `YXZ` order because the pose
              is stated as (bearing, elevation): yaw must apply to an arm that is
              already raised, or it would spin a vertical limb about its own axis
              and move nothing (see `armDirection` in render/gesture.ts). */}
          {[0, 1].map((i) => (
            <group key={i} position={[(i === 0 ? 1 : -1) * lay.shoulderX, lay.shoulderY - hipY, 0]} ref={armRef[i]}>
              {/* The upper arm and, from the elbow, the forearm: each hangs
                  down its own −y and is turned by `settle` (work-order 1301). */}
              <group
                ref={(el) => {
                  uppers.current[i] = el
                }}
              >
                <mesh position={[0, -upper * 0.5, 0]} scale={[1, upper, 1]} castShadow>
                  <cylinderGeometry args={[L.armRadius[0], elbowR, 1, segments]} />
                  <meshStandardMaterial color={skin} roughness={0.88} />
                </mesh>
                <group
                  position={[0, -upper, 0]}
                  ref={(el) => {
                    fores.current[i] = el
                  }}
                >
                  <mesh position={[0, -upper * 0.5, 0]} scale={[1, upper, 1]} castShadow>
                    <cylinderGeometry args={[elbowR, L.armRadius[1], 1, segments]} />
                    <meshStandardMaterial color={skin} roughness={0.88} />
                  </mesh>
                  <group position={[0, -upper, 0]}>
                    {/* Named so the verification can read where the hand ACTUALLY ended
                        up, rather than re-deriving it: a touch is judged by the drawn
                        hand meeting the drawn surface (work-order 1065). */}
                    <mesh name={i === 0 ? 'hand-left' : 'hand-right'} castShadow>
                      <sphereGeometry args={[L.handRadius, ...TESSELLATION.figureHand]} />
                      <meshStandardMaterial color={skin} roughness={0.85} />
                    </mesh>
                    {/* What this hand is carrying, at the hand rather than beside it. */}
                    {i === 0 && handProp}
                  </group>
                </group>
              </group>
            </group>
          ))}
        </group>
        {/* Legs, on the figures whose stride must read (point 479/480). They
            swing about their hips on the DISTANCE-driven gait phase the fauna and the §2.5
            silhouettes already use, so a faster child steps faster and a stopped
            one stands still — never a wall-clock bob. */}
        {withLegs && (
          <group>
            {[0, 1].map((i) => (
              <group
                key={i}
                position={[(i === 0 ? 1 : -1) * L.hipX, L.hipY, 0]}
                ref={(el) => {
                  legPivots.current[i] = el
                }}
              >
                <mesh position={[0, -L.hipY * 0.5, 0]} castShadow>
                  <cylinderGeometry args={[L.legRadius[0], L.legRadius[1], L.hipY, segments]} />
                  <meshStandardMaterial color={skin} roughness={0.88} />
                </mesh>
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  )
}
