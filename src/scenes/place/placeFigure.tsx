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
import { approach, primitiveLayout, type PrimitiveLayout } from '../../render/figureWalk'
import { VILLAGER_MOTION } from '../../config/balance'
import { cloakForCloth, wearsByRank } from '../../systems/dress'
import type { ActorRoleKind } from '../../systems/actorLabels'
import { markActor } from '../actorLabelSource'
import { isLifeFrozen } from './lifeFreeze'
import { ColdCloaksContext, FigureLookContext, LimbDetailContext, REST_POSE_ARMS } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'
import type { AgeGroup, Sex } from '../../systems/appearance'

type FigureProps = Parameters<typeof PrimitiveFigure>[0] & {
  /** Who this villager is, when the vignette knows (the pounding women, the
   *  conversing elder and young man); otherwise stable per figure, a child by
   *  its scale (skinnedFigure.tsx `figureIdentity`). Read by the skinned body. */
  sex?: Sex
  age?: AgeGroup
}

/**
 * A settlement inhabitant. On the medium and high presets it is the skinned,
 * dressed body (skinnedFigure.tsx, work-order "villager dress"); on the low
 * preset — and wherever no settlement look is provided — the primitive figure
 * below, unchanged (user decision 04.10.2026). Both take the same props and
 * publish the same pivots, so a vignette never knows which one it drew.
 */
export function Figure({ sex, age, ...props }: FigureProps) {
  const look = useContext(FigureLookContext)
  // Who this villager is, keyed HERE: this component stays mounted when the
  // detail level swaps the drawn body, so medium → low → medium keeps the person.
  const identityKey = useId()
  return look ? (
    <SkinnedFigure look={look} sex={sex} age={age} identityKey={identityKey} {...props} />
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
  headSteady?: { radius: number; height: number } | null
  /** Kneels while true: down and up again as a short transition. */
  kneeling?: RefObject<boolean>
}) {
  const cold = useContext(ColdCloaksContext)
  const segments = useContext(LimbDetailContext)
  const L = FIGURE_LIMBS
  // KNEELING IS A FOLD OF THE PROPORTIONS, never a squash of the figure
  // (work-order "walking villagers", from point 350): the group's scale stays
  // uniform, the head keeps its shape, and going down or up is a transition.
  const kneelK = useRef(kneel ? 1 : 0)
  const shape = useRef<PrimitiveLayout>(primitiveLayout(kneelK.current, legs, L))
  const lay = shape.current
  // Legs only on a standing figure — a kneeling one has folded them away.
  const withLegs = legs && !kneel
  const hipY = lay.hipY
  const trunkH = lay.height - hipY
  // Shrinking the cone's base radius by the same factor as its height keeps the
  // TAPER identical, so a legged figure is not a fatter one at shoulder height —
  // and the arm clearance pinned in figures.test.ts holds for every figure.
  const trunkRadius = (n: PrimitiveLayout) => L.bodyRadius * n.width * ((n.height - n.hipY) / n.height)
  const outer = useRef<THREE.Group>(null)
  const lifted = useRef<THREE.Group>(null)
  const trunk = useRef<THREE.Group>(null)
  const cone = useRef<THREE.Mesh>(null)
  const wrapMesh = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const crown = useRef<THREE.Group>(null)
  const armMeshes = useRef<Array<THREE.Object3D | null>>([])
  const handEnds = useRef<Array<THREE.Object3D | null>>([])
  const legGroup = useRef<THREE.Group>(null)
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
  const selfLimbs = useRef<FigureLimbs>({ arms: arms.current, trunk: null })
  useEffect(() => {
    if (!limbs) return
    limbs.current = { arms: arms.current, trunk: trunk.current }
    return () => {
      limbs.current = null
    }
  }, [limbs])

  // Lays the figure out at a kneel fraction: every height from the proportions.
  const applyLayout = (n: PrimitiveLayout) => {
    const wrapWear = cold?.wear === 'head'
    trunk.current?.position.setY(n.hipY)
    if (cone.current) {
      const h = n.height - n.hipY
      cone.current.position.y = h * 0.5
      cone.current.scale.set(trunkRadius(n), h, trunkRadius(n))
    }
    if (wrapMesh.current) {
      wrapMesh.current.position.y = n.height * (wrapWear ? 0.82 : 0.66) - n.hipY
      wrapMesh.current.scale.set(1, n.height * (wrapWear ? 1.0 : 0.68), 1)
    }
    head.current?.position.setY(n.headY - n.hipY)
    crown.current?.position.setY(n.headY + n.headRadius - n.hipY)
    ;[0, 1].forEach((i) => {
      arms.current[i]?.position.set((i === 0 ? 1 : -1) * n.width * L.shoulderX, n.height * L.shoulderY - n.hipY, 0)
      const m = armMeshes.current[i]
      if (m) {
        m.position.y = -n.armLength * 0.5
        m.scale.set(1, n.armLength, 1)
      }
      handEnds.current[i]?.position.setY(-n.armLength)
    })
    if (legGroup.current) legGroup.current.visible = withLegs && kneelK.current === 0
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
      shape.current = primitiveLayout(k, legs, L)
      applyLayout(shape.current)
      if (cone.current) cone.current.userData.laid = true
    }
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
    if (withLegs && gait) {
      const phase = gait.current
      const a = legPivots.current[0]
      const b = legPivots.current[1]
      if (a) a.rotation.x = legSwingAngle(phase, 0)
      if (b) b.rotation.x = legSwingAngle(phase, Math.PI)
      // Dropped onto the stance leg, so the swinging feet ride the ground
      // instead of hanging above it (the drop callers used to apply).
      lifted.current?.position.setY(kneelK.current === 0 ? gaitBodyLift(phase, L.hipY) : 0)
    }
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
  const armLen = lay.armLength
  const wrapHead = !!wrap && cold!.wear === 'head'
  return (
    // Named so a speaking figure can be found in the scene graph — the overhead
    // speech label rides on this object (design.md §13.4).
    <group ref={outer} name="inhabitant" scale={scale} userData={markActor({ kind: role, height: lay.labelHeight })}>
      <group ref={lifted}>
        {/* The trunk pivots at the hip so a lean or a shake carries the arms and
            the head with it, and the legs (below) stay planted. The cone is a
            unit one laid out to the trunk's proportions. */}
        <group ref={trunk} position={[0, hipY, 0]}>
          <mesh ref={cone} position={[0, trunkH * 0.5, 0]} scale={[trunkRadius(lay), trunkH, trunkRadius(lay)]} castShadow>
            <coneGeometry args={[1, 1, TESSELLATION.figureBody]} />
            <meshStandardMaterial color={cloth} roughness={0.95} />
          </mesh>
          {/* The seasonal wrap goes OVER the everyday dress (Mayr): a shell around
              the shoulders, leaving the dress showing below. Where the record says
              the head is muffled in it (the Somali tobe in the karif), the shell
              rises past the head instead — that is the one head-wear case, and the
              shape difference IS the finding. */}
          {wrap && (
            <mesh
              ref={wrapMesh}
              position={[0, lay.height * (wrapHead ? 0.82 : 0.66) - hipY, 0]}
              scale={[1, lay.height * (wrapHead ? 1.0 : 0.68), 1]}
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
            <group
              key={i}
              position={[(i === 0 ? 1 : -1) * lay.width * L.shoulderX, lay.height * L.shoulderY - hipY, 0]}
              ref={armRef[i]}
            >
              <mesh
                ref={(el) => {
                  armMeshes.current[i] = el
                }}
                position={[0, -armLen * 0.5, 0]}
                scale={[1, armLen, 1]}
                castShadow
              >
                <cylinderGeometry args={[L.armRadius[0], L.armRadius[1], 1, segments]} />
                <meshStandardMaterial color={skin} roughness={0.88} />
              </mesh>
              <group
                ref={(el) => {
                  handEnds.current[i] = el
                }}
                position={[0, -armLen, 0]}
              >
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
          ))}
        </group>
        {/* Legs, on the figures whose stride must read (point 479/480). They
            swing about their hips on the DISTANCE-driven gait phase the fauna and the §2.5
            silhouettes already use, so a faster child steps faster and a stopped
            one stands still — never a wall-clock bob. */}
        {withLegs && (
          <group ref={legGroup}>
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
