// Ambient life in places (design.md §19 "village and market life", §2 bustle):
// villagers cooking and weaving, playing children and goats in villages;
// porters and traders in the wealthier ports. Inhabitants interact with each
// other and with the props: pairs stand in conversation, a fire tender stokes
// the fire, food is fetched from the huts and cooked over it, grain is
// pounded in a mortar, a drummer waits for the chief's message, and water is
// carried from the well.
// Pure animation, no mechanics.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { mulberry32 } from '../../world/noise'
import {
  buildGoatParts,
  createFaunaMaterial,
  faceVelocity,
  footPlantPose,
  gaitBodyLift,
  gaitCadence,
  gaitPhase,
  gaitRig,
  isStance,
  legSwingAngle,
  restingPhase,
  type FootPlant,
} from '../../render/fauna'
import { CHILD_FIGURE_SCALE, FIGURE_LIMBS, TESSELLATION } from '../../render/figures'
import { RIVER_WATER_TONES, WATER_METALNESS } from '../../render/waterAppearance'
import { applyFigurePose, restingArmRefs, type FigureLimbs } from '../../render/figurePose'
import {
  advanceGesture,
  aimAt,
  armAim,
  digPose,
  fillPose,
  fillSquat,
  gesturePose,
  isGesturing,
  REST_POSE,
  restGesture,
  startGesture,
  type FigurePose,
  type GestureKind,
  type GestureState,
} from '../../render/gesture'
import { effectiveFigureLimbSegments, useUi } from '../../state/ui'
import { cloakForCloth, wearsByRank } from '../../systems/dress'
import { useColdCloaks, type ColdDress } from './useColdCloaks'
import { presenceAt } from '../../systems/seasonalLife'
import { devAssert } from '../../systems/devAssert'
import type { ActorRoleKind } from '../../systems/actorLabels'
import { markActor } from '../actorLabelSource'
import { placeById } from '../../world/geo'
import { useGame } from '../../state/store'
import { START_YEAR, balance } from '../../config/balance'
import { climbBoulder } from './looseRocks'
import type { RegionPlaceStyle } from './regionStyles'
import { nudgeToFree, nudgeWhere, PLAYER_RADIUS, resolveMove, spawnPointFree, standingClear, tryNudgeToFree, WALKER_RADIUS, type Collider } from './collision'
import { utteranceOf } from '../../communication/lexicon'
import { insidePlace } from './boundary'
import { playRockFlank } from './playRockSurface'
import { standsOnGroundPlate, type PlaceRiverBank } from './riverBank'
import { buildPlaceNavGrid, findPlaceRoute, navClearBetween, navRestrict, type NavPoint } from './routing'
import { absorbSeparation, createTagGame, stepTagGame, type TagChild } from './tagGame'
import {
  bankChildCanSeparate,
  bankChildTouching,
  bankChildBodyLift,
  createBankGame,
  otherEnd,
  rockAt,
  insideStrangerBerth,
  stepBankGame,
  type BankChild,
  type BankEnd,
  type BankStage,
  type BankUtterance,
  type BankWorld,
} from './bankGame'
import {
  childSteer,
  createChildSpeech,
  stepChildSpeech,
  type SituationView,
  type SpokenSituation,
} from './childSituations'
import {
  carryOf,
  clearTask,
  createAdultWork,
  digProgressOf,
  isDigging,
  goalOf,
  stepAdultWork,
  taskOf,
  type AdultWorkGeography,
  type AdultWorkView,
  type DigSite,
  type DigSiteProgress,
  type ErrandPoint,
  type SpokenWord,
  WORK_ARRIVE_RADIUS,
} from './adultWork'
import { gestureIfHeard, speechReach } from '../../communication/spokenGesture'
import { utterancePlan } from '../../communication/speaking'
import { speechLabelSeconds } from '../../communication/speechLabel'
import { playSpeech } from '../../systems/ambience'
import { speakOverhead, speechClock } from './speechChannel'
import { placePlayerPosition } from './playerPosition'
import { animalAnchors, animalBodies, animalScene, stepAnimal, turnToward, ANIMAL_TURN_RATE } from './animalSpots'
import {
  addBodies,
  createBodies,
  createInhabitantSet,
  groundOccupied,
  releaseBodies,
  separateBody,
  separateGroup,
  stepRoundBodies,
  type InhabitantBody,
  type InhabitantSet,
} from './inhabitantBodies'
import {
  drumHeadY,
  drummerPoseAt,
  DRUMMER_LEAN,
  HIGH_DRUM,
  LOW_DRUM,
  type DrumGeometry,
} from './drummerPose'
import { PORT_TALKERS, VILLAGE_SPOTS, villageAdultStations, type PlayGround } from './lifeSpots'
import { drummerFacing } from './chiefWalk'
import { DRUMMER_SPEAKER_ID } from './chiefPresence'
import { setDrummerVoice } from './drummerVoice'
import { buildWedgeCarve } from './wedgeCarve'
import { figureStance, unplacedInhabitant, type PlaceSpot } from './placement'

/** Collision radius of inhabitants (matches the player's). */
const NPC_RADIUS = WALKER_RADIUS

/**
 * The cold-weather cloaks this settlement's people wear today (design.md
 * §19.13), or null for the everyday dress. A context rather than a prop: every
 * life vignette builds its own Figures, and only the Figure itself cares.
 */
const ColdCloaksContext = createContext<ColdDress | null>(null)

/**
 * Radial segments of the limb primitives at the current graphics level (point
 * 479, `QUALITY_PRESETS.figureLimbSegments`). A context rather than a per-figure
 * store subscription: a settlement mounts a couple of dozen Figures and they all
 * read the same number, so PlaceLife subscribes once and hands it down.
 */
const LimbDetailContext = createContext<number>(8)

/**
 * The settlement's inhabitant bodies (work-order point 578). A context for the
 * reason the two above are: the life vignettes are a dozen separate components,
 * and every one of them has to see EVERY other one's figures — the defect was
 * exactly that none of them did. PlaceLife owns one set per settlement; each
 * component claims its slots, writes them where it moved its figures, and
 * separates them there.
 */
const InhabitantBodiesContext = createContext<InhabitantSet>(createInhabitantSet())

/** Claims `count` bodies from the settlement's set for the lifetime of the
 *  component. The owner writes each body's position and radius per frame.
 *  The bodies are BUILT while rendering but JOINED to the set in an effect:
 *  React StrictMode mounts an effect, tears it down and mounts it again, and a
 *  set joined during render would have kept only the teardown. */
function useInhabitantBodies(
  count: number,
  options: { fixed?: boolean; x?: number; z?: number; scale?: number } = {},
): InhabitantBody[] {
  const set = useContext(InhabitantBodiesContext)
  const { fixed, x, z, scale } = options
  const bodies = useMemo(
    () => createBodies(count, { fixed, x, z, scale }),
    [count, fixed, x, z, scale],
  )
  useEffect(() => {
    addBodies(set, bodies)
    return () => releaseBodies(set, bodies)
  }, [set, bodies])
  return bodies
}

/** One body for a vignette figure standing at its station: it pushes the
 *  passers-by aside and never gives way itself. */
function useStandingBody(x: number, z: number, scale = 1): void {
  useInhabitantBodies(1, { fixed: true, x, z, scale })
}

/** The same for a vignette of SEVERAL standing figures (a conversing pair, the
 *  traders on the plaza). */
function useStandingBodies(spots: ReadonlyArray<{ x: number; z: number }>, scale = 1): void {
  const bodies = useInhabitantBodies(spots.length, { fixed: true, scale })
  useEffect(() => {
    spots.forEach((s, i) => {
      const b = bodies[i]
      if (!b) return
      b.x = s.x
      b.z = s.z
    })
  }, [bodies, spots])
}

/** The two shoulder pivots in render order: index 0 is the figure's LEFT arm
 *  (local +x), index 1 its RIGHT (local −x, because forward is +z and up is +y). */
const REST_POSE_ARMS = [REST_POSE.left, REST_POSE.right] as const

/**
 * One hand up steadying a load carried on the head, the other hanging — the
 * period-true carrying posture, and the pose the figures with a basket or a
 * bundle on their heads take now that they have arms (point 479). A shared,
 * never-written constant: every head-carrier holds it identically, so one
 * object serves them all.
 */
const HEAD_CARRY_POSE: { current: FigurePose } = {
  current: { left: armAim(0.16, 1.3), right: { ...REST_POSE.right }, lean: 0.02, turn: 0 },
}

/**
 * Simple primitive human figure; `kneel` folds it down for sitting work.
 *
 * Since point 479 the figure has ARMS — a cone with a sphere head cannot show
 * what it is talking about, and the pointing gesture is the anchor the
 * communication PoC's HERE/THERE hang on. LEGS are opt-in: a floor-length wrap
 * is the period dress for most adults and legs under it would draw nothing, so
 * they go on the figures that RUN (the children), whose stride then reads.
 *
 * The gesture itself is driven from outside through `gesture`, a ref the caller
 * owns and this figure advances — one state per figure, which is why two
 * gestures can never run on one body. `pose` is the direct alternative for a
 * figure whose arms are doing work rather than speaking (the drummer, the
 * porter's carry).
 */
function Figure({
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
}) {
  const bodyH = kneel ? 0.55 : 1.0
  const cold = useContext(ColdCloaksContext)
  const segments = useContext(LimbDetailContext)
  const L = FIGURE_LIMBS
  // Legs only on a standing figure — a kneeling one has folded them away.
  const withLegs = legs && !kneel
  const hipY = withLegs ? bodyH * L.hipY : 0
  const trunkH = bodyH - hipY
  // Shrinking the cone's base radius by the same factor as its height keeps the
  // TAPER identical, so a legged figure is not a fatter one at shoulder height —
  // and the arm clearance pinned in figures.test.ts holds for every figure.
  const trunkRadius = L.bodyRadius * (trunkH / bodyH)
  const trunk = useRef<THREE.Group>(null)
  const head = useRef<THREE.Mesh>(null)
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
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
      const phase = gait.current ?? 0
      const a = legPivots.current[0]
      const b = legPivots.current[1]
      if (a) a.rotation.x = legSwingAngle(phase, 0)
      if (b) b.rotation.x = legSwingAngle(phase, Math.PI)
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
  const armLen = bodyH * L.armLength
  return (
    // Named so a speaking figure can be found in the scene graph — the overhead
    // speech label rides on this object (design.md §13.4).
    <group
      name="inhabitant"
      scale={[scale, scale * (kneel ? 0.75 : 1), scale]}
      userData={markActor({ kind: role, height: bodyH + 0.45 })}
    >
      {/* The trunk pivots at the hip so a lean or a shake carries the arms and
          the head with it, and the legs (below) stay planted. */}
      <group ref={trunk} position={[0, hipY, 0]}>
        <mesh position={[0, trunkH * 0.5, 0]} castShadow>
          <coneGeometry args={[trunkRadius, trunkH, TESSELLATION.figureBody]} />
          <meshStandardMaterial color={cloth} roughness={0.95} />
        </mesh>
        {/* The seasonal wrap goes OVER the everyday dress (Mayr): a shell around
            the shoulders, leaving the dress showing below. Where the record says
            the head is muffled in it (the Somali tobe in the karif), the shell
            rises past the head instead — that is the one head-wear case, and the
            shape difference IS the finding. */}
        {wrap && (
          <mesh position={[0, bodyH * (cold!.wear === 'head' ? 0.82 : 0.66) - hipY, 0]} castShadow>
            <coneGeometry
              args={[0.355, bodyH * (cold!.wear === 'head' ? 1.0 : 0.68), TESSELLATION.figureBody]}
            />
            <meshStandardMaterial
              color={wrap}
              roughness={0.8} // greased hide sits glossier than the cloth beneath
            />
          </mesh>
        )}
        {/* The head shows unless the wrap is drawn over it. */}
        {!(wrap && cold!.wear === 'head') && (
          <mesh name="figure-head" ref={head} position={[0, bodyH + 0.18 - hipY, 0]} castShadow>
            <sphereGeometry args={[0.16, ...TESSELLATION.figureHead]} />
            <meshStandardMaterial color={skin} roughness={0.85} />
          </mesh>
        )}
        {/* Arms (point 479). One pivot per shoulder, the limb hanging down its
            local −y, so a rotation IS the gesture. `YXZ` order because the pose
            is stated as (bearing, elevation): yaw must apply to an arm that is
            already raised, or it would spin a vertical limb about its own axis
            and move nothing (see `armDirection` in render/gesture.ts). */}
        {[0, 1].map((i) => (
          <group
            key={i}
            position={[(i === 0 ? 1 : -1) * bodyH * L.shoulderX, bodyH * L.shoulderY - hipY, 0]}
            ref={armRef[i]}
          >
            <mesh position={[0, -armLen * 0.5, 0]} castShadow>
              <cylinderGeometry args={[L.armRadius[0], L.armRadius[1], armLen, segments]} />
              <meshStandardMaterial color={skin} roughness={0.88} />
            </mesh>
            {/* Named so the verification can read where the hand ACTUALLY ended
                up, rather than re-deriving it: a touch is judged by the drawn
                hand meeting the drawn surface (work-order 1065). */}
            <mesh name={i === 0 ? 'hand-left' : 'hand-right'} position={[0, -armLen, 0]} castShadow>
              <sphereGeometry args={[L.handRadius, ...TESSELLATION.figureHand]} />
              <meshStandardMaterial color={skin} roughness={0.85} />
            </mesh>
            {/* What this hand is carrying, at the hand rather than beside it. */}
            {i === 0 && handProp && <group position={[0, -armLen, 0]}>{handProp}</group>}
          </group>
        ))}
      </group>
      {/* Legs, on the figures that run (point 479/480). They swing about their
          hips on the DISTANCE-driven gait phase the fauna and the §2.5
          silhouettes already use, so a faster child steps faster and a stopped
          one stands still — never a wall-clock bob. */}
      {withLegs &&
        [0, 1].map((i) => (
          <group
            key={i}
            position={[(i === 0 ? 1 : -1) * bodyH * L.hipX, hipY, 0]}
            ref={(el) => {
              legPivots.current[i] = el
            }}
          >
            <mesh position={[0, -hipY * 0.5, 0]} castShadow>
              <cylinderGeometry args={[L.legRadius[0], L.legRadius[1], hipY, segments]} />
              <meshStandardMaterial color={skin} roughness={0.88} />
            </mesh>
          </group>
        ))}
    </group>
  )
}

/** Kneeling cook with a three-stick pot beside the village fire. */
function Cook({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  // A body the passers-by go round (point 578).
  useStandingBody(x, z)
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 3, 0]}>
      <Figure cloth={cloth} kneel />
      {/* Tripod with pot over the embers */}
      <group position={[0.85, 0, -0.4]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.22, 0.35, Math.sin(a) * 0.22]}
              rotation={[Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]}
              castShadow
            >
              <cylinderGeometry args={[0.02, 0.02, 0.75, 4]} />
              <meshStandardMaterial color="#4a3018" roughness={0.95} />
            </mesh>
          )
        })}
        <mesh position={[0, 0.42, 0]} castShadow>
          <sphereGeometry args={[0.17, ...TESSELLATION.goods, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
          <meshStandardMaterial color="#2c2622" roughness={0.7} />
        </mesh>
      </group>
    </group>
  )
}

/** Weaver working at a simple standing loom. */
function Weaver({ x, z, cloth, weave }: { x: number; z: number; cloth: string; weave: string }) {
  // A body the passers-by go round (point 578).
  useStandingBody(x, z)
  const facing = Math.atan2(-x, -z)
  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {/* Loom frame */}
      {[-0.55, 0.55].map((px) => (
        <mesh key={px} position={[px, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 1.5, 5]} />
          <meshStandardMaterial color="#5f4526" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 1.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.25, 5]} />
        <meshStandardMaterial color="#5f4526" roughness={0.95} />
      </mesh>
      {/* Half-finished cloth */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.95, 0.85, 0.03]} />
        <meshStandardMaterial color={weave} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, 0, 0.55]}>
        <Figure cloth={cloth} />
      </group>
    </group>
  )
}

/** Height factor of a child figure against a grown one. */
const KID_SCALE = CHILD_FIGURE_SCALE

/**
 * Speaks one staged situation (point 481): the atom through the §13.4 hearing
 * curve, the reading over the speaker's head, and the gesture on its own arms,
 * aimed at the world point the situation named.
 *
 * The DISTANCE decides all three, as ONE decision (point 580): what the player
 * could not hear teaches him nothing however plainly he saw the gesture, so the
 * same range gate that silences the voice keeps the utterance out of his memory,
 * the note off the speaker's head AND the arms at rest — a mute pantomime is
 * worse than silence, because it shows a concept with no word attached to it
 * (docs/communication-poc-spec.md, src/communication/spokenGesture.ts).
 */
function speakSituation(
  said: SpokenSituation,
  speaker: TagChild | undefined,
  anchor: THREE.Group | null,
  gesture: RefObject<GestureState> | undefined,
): void {
  if (!speaker || !gesture) return
  const distance = placePlayerPosition.active
    ? Math.hypot(speaker.x - placePlayerPosition.x, speaker.z - placePlayerPosition.z)
    : Infinity
  const reach = speechReach(distance)
  playSpeech(utterancePlan(said.utterance, distance))
  if (reach.audible) {
    useGame.getState().hearUtterance(said.utterance)
    if (anchor) {
      speakOverhead(`kid-${said.speaker}`, [said.utterance], anchor, {
        seconds: speechLabelSeconds(1),
      })
    }
  }
  // The aim is taken in the speaker's OWN frame, so a child that turns takes it
  // with it; the shoulder is the child's, not a grown figure's. Out of earshot
  // the same call hands back REST, so the child never mimes unheard.
  gesture.current = gestureIfHeard(distance, said.gesture, {
    ...aimAt(
      { x: speaker.x, z: speaker.z, yaw: speaker.facing },
      said.aim,
      KID_SCALE * FIGURE_LIMBS.shoulderY,
    ),
    phase: said.speaker * 1.1, // no two children beat in lockstep
  })
}

/**
 * A TAGGED CHILD'S POSTURE (work-order 687 item 3): squatted to about two thirds
 * of its height, trunk folded well over and both arms crossed in front of the
 * chest. It must never be confusable with a walking child, which is why all
 * three read at once — the height, the fold and the arms — and why the legs go
 * still by themselves (a child that walks nowhere adds nothing to `walked`, and
 * the gait rides that).
 */
const CROUCH_SQUAT = 0.66
const CROUCH_POSE: FigurePose = {
  left: { pitch: -1.35, yaw: 0.55, roll: -0.95 },
  right: { pitch: -1.35, yaw: -0.55, roll: 0.95 },
  lean: 0.85,
  turn: 0,
}

/**
 * Speaks one moment of the children's bank game (work-order 687): the atom
 * through the §13.4 hearing curve, the reading over the speaker's head and the
 * gesture on its own arms, aimed at what the moment named — the water, a rock,
 * the bank or the boulder. The DISTANCE decides all three as one decision
 * (point 580), exactly as it does for every other village voice: an utterance
 * the player could not hear teaches him nothing however plainly he saw the arm.
 */
function speakBankUtterance(
  said: BankUtterance,
  speaker: TagChild | undefined,
  anchor: THREE.Group | null,
  gesture: RefObject<GestureState> | undefined,
): void {
  if (!speaker || !gesture) return
  const distance = placePlayerPosition.active
    ? Math.hypot(speaker.x - placePlayerPosition.x, speaker.z - placePlayerPosition.z)
    : Infinity
  const reach = speechReach(distance)
  const utterance = utteranceOf(said.concept)
  playSpeech(utterancePlan(utterance, distance))
  if (reach.audible) {
    useGame.getState().hearUtterance(utterance)
    if (anchor) {
      speakOverhead(`kid-${said.speaker}`, [utterance], anchor, { seconds: speechLabelSeconds(1) })
    }
  }
  // A TOUCH BRINGS ITS OWN ARM. Its hand has to land on a drawn flank, and the
  // round solved that through the leaning trunk the renderer draws; re-deriving
  // the angles here from a world point through an upright shoulder puts the hand
  // centimetres off, which is the whole tolerance a contact has (work-order
  // 1065). Every other moment aims at what it names, exactly as before.
  const arm =
    said.arm ??
    aimAt(
      { x: speaker.x, z: speaker.z, yaw: speaker.facing },
      said.aim,
      // …plus whatever the speaker is STANDING ON (work-order 1080). `aimAt`
      // reads the shoulder as a world height and the aim as a world point, so a
      // child up on the boulder reported at ground level would point half a
      // metre over the stone it is naming.
      KID_SCALE * FIGURE_LIMBS.shoulderY + ((speaker as BankChild).lift ?? 0),
    )
  gesture.current = gestureIfHeard(distance, said.gesture, {
    ...arm,
    ...(said.hold ? { duration: said.hold } : {}),
    phase: said.speaker * 1.1,
  })
}

/**
 * The children's game of tag (design.md §19.10, point 480/351). One of them is
 * IT and chases the others; whoever is caught becomes the new IT. The behaviour
 * itself is the pure `tagGame` module — this component only feeds it the
 * settlement and draws the result.
 *
 * They are the figures that RUN, so they are the ones that carry legs (point
 * 479): the swing rides the DISTANCE each child covers at the cadence its own
 * short legs dictate, exactly as the fauna and the §2.5 silhouettes do — a
 * stopped child's legs are still, and the body dips onto the stance leg instead
 * of riding a wall-clock bob. The sprint therefore reads three ways at once: the
 * LEG CADENCE, the SPEED, and the POSTURE — a forward lean while running flat
 * out, upright and near-still while recovering, which is the reading that
 * survives at any distance the cadence no longer resolves at.
 *
 * They are also the ones who TEACH the six general concepts (point 481): at the
 * game they call each other, send one another to a spot, ask another along,
 * name where they stand, point something out and refuse — one atomic utterance
 * with its gesture and the action that follows. The catalogue and the scheduler
 * are the pure `childSituations` module; here it is given the live game, and
 * what comes back is spoken (through the §13.4 hearing curve), shown over the
 * speaker's head, gestured with the point-479 arms and carried out by steering
 * the child the chase would otherwise steer itself.
 */
function Kids({
  x,
  z,
  playRadius,
  count,
  seed,
  cloth,
  colliders,
  radius,
  stage,
  bank,
  childBodies,
}: {
  x: number
  z: number
  /** How far from (x, z) the group may roam — its own play ground (point 481). */
  playRadius: number
  count: number
  seed: number
  cloth: string[]
  colliders: Collider[]
  radius: number
  /** The children's BANK STAGE (work-order 687): the two play rocks, the water,
   *  an ordinary boulder and their own quarter. Given one, the group plays the
   *  bank game; without one — a village with no river — it keeps the tag round
   *  the port cities inherit in their own point. */
  stage: BankStage | null
  /** The settlement's river bank, where it has one: what makes its walkable
   *  region a lobe rather than a circle, and where the shore begins. */
  bank: PlaceRiverBank | null
  /** Where the settlement can find the children (work-order 688). The adults'
   *  own work reads it to keep DIG out of a passing child's ear; the bodies are
   *  the live ones this component moves, so nothing is copied per frame. */
  childBodies: RefObject<readonly InhabitantBody[]>
}) {
  const refs = useRef<Array<THREE.Group | null>>([])
  // The world leg length these children walk on, and the cadence it dictates.
  const legLength = FIGURE_LIMBS.hipY * KID_SCALE
  const cadence = useMemo(() => gaitCadence(legLength), [legLength])

  // The body each child presents to every other inhabitant (point 578), and the
  // whole settlement's registry — claimed BEFORE the world below, because the
  // chase steers by both (point 657).
  const bodySet = useContext(InhabitantBodiesContext)
  const bodies = useInhabitantBodies(count, { scale: KID_SCALE })
  // Which bodies are the game's own playmates, for the world's occupied rules.
  const kidIndex = useMemo(() => new Set(bodies), [bodies])
  // ... and the same bodies published to the settlement, so the adults' work can
  // hold a word while one of them walks past (work-order 688).
  useEffect(() => {
    childBodies.current = bodies
    return () => {
      childBodies.current = []
    }
  }, [bodies, childBodies])

  // The settlement as the chase sees it: ONE predicate for the colliders, the
  // fire ring (a collider like any other), the walkable rim and the PLAY GROUND
  // — so a child can never end a step where a walker may not stand, and never
  // wander out of its group into the adults' earshot (point 481.4) — and beside
  // it the OTHER INHABITANTS' BODIES as ground the chase walks round (point
  // 657): without that, a child whose way crossed an adult standing in the
  // ground read it as open, walked into the body, and the separation pushed it
  // straight back out — walking on the spot, the user's own report.
  const world = useMemo<BankWorld>(() => {
    const rim = Math.max(1, radius - NPC_RADIUS * 2)
    // The ground between two boundaries that pinch below a passage is not
    // offered to the chase at all (point 657): the reported village carried a
    // dead-end slot between two hut clearances and a corridor a
    // rim-straddling hut closes to nothing, and every live red window of the
    // measurement sat in one of the two — evaders pacing the pinch, groups
    // herding into the corridor. See `buildWedgeCarve`.
    // THE BANK ROUND WALKS THE WHOLE SETTLEMENT (work-order 687): its quarter is
    // where the group ROAMS, not a wall it is kept behind — the cycle takes it
    // down to the water and back. The tag round keeps its bounded ground.
    const region = stage ? { x: 0, z: 0, radius: rim } : { x, z, radius: playRadius }
    // ...AND ONLY THE TAG ROUND IS KEPT OUT OF THEM. The carve answers the
    // CHASE's failure (point 657): a fixed target behind a pinch herded the
    // group into a dead-end slot and it walked on the spot there. The bank round
    // has no such steering — it roams on a drifting heading, runs an open lane
    // and otherwise walks a PLANNED way across the village — and for that walk
    // the carve is a wall in the wrong place: measured at the verification's own
    // seed, the only route from the children's quarter to the bank runs through
    // one carved wedge, so the group stood in a pocket for the whole gather and
    // never came down to the water. The child-motion gate judges this round in
    // the bambara village and stays green without it.
    const carve = stage ? () => false : buildWedgeCarve(colliders, NPC_RADIUS, region)
    // AND THE SETTLEMENT IS NOT A CIRCLE WHERE IT STANDS ON A RIVER. A village
    // with a bank grows a lobe out to the water (`boundary.ts`), and the two
    // play rocks stand ON that lobe: measured on all three river villages they
    // sit 32.5 m from the middle while the plain walkable radius is 28 and the
    // children's own rim 27.4. Held to the circle, the group could not reach its
    // own stage at all — the gather timed out at the rim, the run opened with
    // everybody bunched four metres short of the stones, the catcher swept the
    // lot in seconds and the cycle ended without a single child on the bank.
    // That is the round the traveller frame photographed empty. So the bank
    // round walks the SAME shape the player does — inset by its own footprint —
    // and is kept off the shore, which is ground that slopes into the water.
    const bounds = { radius, bank }
    const onGround = stage
      ? (px: number, pz: number) =>
          insidePlace(bounds, px, pz, NPC_RADIUS * 2) && standsOnGroundPlate(bank, px, pz, NPC_RADIUS)
      : (px: number, pz: number) =>
          Math.hypot(px, pz) <= rim && Math.hypot(px - region.x, pz - region.z) <= region.radius
    const blocked = (px: number, pz: number) =>
      !onGround(px, pz) || !standingClear(colliders, px, pz, NPC_RADIUS) || carve(px, pz)
    // THE WAY ROUND THE VILLAGE, for the one long walk the round has (work-order
    // 687): the RIVER call sends the group from its own quarter down to the
    // bank, and where the quarter lies across the built ground from the water
    // that is forty metres past huts, fences and compounds — the mandinka
    // village, where a locally steering group pressed into the first wall and
    // never reached the stage at all. The same grid the adults' errands cross
    // the village by, built from the same boundary and the same colliders the
    // step above obeys, so a route can never lead where the step is refused.
    // Only a settlement that plays the bank round pays for it.
    const nav = stage ? buildPlaceNavGrid(bounds, colliders, NPC_RADIUS) : null
    // AND NARROWED BY THE STEP'S OWN PREDICATE — the SAME `onGround`, not a
    // second expression that happens to agree today (points 129/378). What it
    // actually adds is the shore: the grid reads the boundary and the colliders,
    // so the bank lobe it calls walkable runs on down the sloping shore into the
    // water. The boundary half is already implied — `buildPlaceNavGrid` tests it
    // at `margin + slack`, strictly stronger than the `margin` here — and
    // passing it costs nothing while making the invariant one predicate deep
    // instead of two that must be kept in step. `routing.test.ts` asserts it:
    // every cell the planner calls free is ground the step accepts.
    //
    // The wedge carve is deliberately NOT part of this — measured over five
    // layouts of the bambara village it disconnects the bank from the village on
    // three of them, and a corner that does fall in a wedge is dropped by the
    // walk itself (`wayTo`).
    if (nav) navRestrict(nav, onGround)
    return {
      radius: region.radius,
      centerX: region.x,
      centerZ: region.z,
      childRadius: NPC_RADIUS,
      blocked,
      lineBlocked: nav
        ? (ax: number, az: number, bx: number, bz: number) => !navClearBetween(nav, ax, az, bx, bz)
        : undefined,
      route: nav ? (from: NavPoint, to: NavPoint) => findPlaceRoute(nav, from, to) : undefined,
      // WHICH BODIES ARE A CHILD'S WALLS: everybody OUTSIDE the game — adults,
      // porters, errand walkers, the standing and slow-crossing figures the
      // measured red windows coincided with — and NEVER a playmate. Both
      // alternatives were measured and rejected (12.08.2026): playmates as
      // mutual walls degraded the game itself (maasai worst child 0.48 %
      // against the 0.25 % gate — two movers re-decide against each other
      // every frame and dance in place), and a one-sided yield read 0.70 % on
      // bambara. Child-child contact stays the separation pass's job, which
      // held it at 0.00-0.03 % on every shipped village.
      occupied: (_self, _partner, px, pz) =>
        groundOccupied(
          bodySet,
          px,
          pz,
          balance.villageLife.separation,
          // The child's OWN body radius, so the line is the pair's contact.
          balance.villageLife.separation.bodyRadius * KID_SCALE,
          (b) => kidIndex.has(b),
        ),
      // The escape lands on ground the GAME calls free, not merely out of the
      // huts: a collider-only nudge teleported a child clean out of its own play
      // ground once the ground moved in among the buildings (point 524), and the
      // `tag-inside` invariant then fired every frame. Roomy ground first (an
      // escape direction, not a slot), any free spot inside the ground second.
      nudge: (px, pz) => {
        const roomy = nudgeWhere(
          px,
          pz,
          (ax, az) => !blocked(ax, az) && spawnPointFree(colliders, ax, az, NPC_RADIUS),
        )
        const r = roomy.found ? roomy : nudgeWhere(px, pz, (ax, az) => !blocked(ax, az))
        return { x: r.pos[0], z: r.pos[1], found: r.found }
      },
    }
  }, [colliders, radius, x, z, playRadius, bodySet, kidIndex, stage, bank])

  // The group, spawned on validated ground (point 155): a play spot covered by a
  // hut is nudged to the nearest free one before the first frame — INSIDE the
  // play ground, by the game's own predicate, for the same reason the escape is
  // — and the scheduler of what it SAYS (point 481) is built with it, because a
  // new group is a new scheduler: a second settlement must never inherit the
  // first one's turn or its half-finished errands.
  const round = useMemo(() => {
    const rand = mulberry32((seed + 5171) >>> 0)
    const spots = Array.from({ length: count }, (_, i) => {
      const a = (i / Math.max(1, count)) * Math.PI * 2
      const spot = world.nudge(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4)
      return { x: spot.x, z: spot.z }
    })
    if (stage) {
      const bank = createBankGame(spots, rand, { ...balance.villageLife.tag, ...balance.villageLife.bankGame })
      return { bank, game: null, speech: null, children: bank.children as TagChild[], rand }
    }
    const game = createTagGame(spots, rand, balance.villageLife.tag)
    return {
      bank: null,
      game,
      speech: createChildSpeech(count, balance.villageLife.childSpeech),
      children: game.children,
      rand,
    }
    // `world` carries the collider set, so it is the only dependency needed for it.
  }, [x, z, count, seed, world, stage])
  const game = round.game
  const speech = round.speech
  const children = round.children

  // The view the situations read the live game through: built once and
  // refreshed each frame rather than allocated per frame.
  const speechRand = useMemo(() => mulberry32((seed + 7717) >>> 0), [seed])
  const view = useMemo<SituationView>(
    () => ({
      playing: false,
      chaser: -1,
      target: -1,
      immune: -1,
      children,
      ground: { x, z, radius: playRadius },
      // What THERE points at: the settlement's own middle, well outside the
      // play ground and plainly not a place anyone is being sent to.
      farMark: { x: 0, z: 0 },
    }),
    [children, x, z, playRadius],
  )
  // The world the BODY SEPARATION resolves in: the round's own ground, plus the
  // traveller's berth, written in place each frame (the stranger moves, the
  // object must not be rebuilt per frame).
  const separationWorld = useMemo(
    () => ({ blocked: world.blocked, nudge: world.nudge }),
    [world],
  )
  const gestures = useRef<Array<RefObject<GestureState>>>([])
  if (gestures.current.length !== count) {
    gestures.current = Array.from(
      { length: count },
      (_, i) => gestures.current[i] ?? { current: restGesture() },
    )
  }

  // One gait phase ref per child, handed to its Figure.
  const gaits = useRef<Array<RefObject<number>>>([])
  if (gaits.current.length !== count) {
    gaits.current = Array.from({ length: count }, (_, i) => gaits.current[i] ?? { current: 0 })
  }
  // ...and one PHASE OFFSET per child, which is how a stopped child plants its
  // feet without the walk it resumes snapping back (work-order 1065). The walked
  // distance keeps running the gait; the offset absorbs the settling, so it is
  // still there when the child sets off again and the cycle simply carries on.
  const gaitOffsets = useRef<number[]>([])
  if (gaitOffsets.current.length !== count) {
    gaitOffsets.current = Array.from({ length: count }, (_, i) => gaitOffsets.current[i] ?? 0)
  }
  // THE WORD'S OWN FRAME (work-order 1065). Where the DRAWN hand stood in the
  // very frame the tap was uttered — captured here rather than sampled from
  // outside, because a sampler reading every second frame catches that one
  // frame only by luck, and the check then went red or green at random on the
  // same code.
  const tapOpening = useRef<{
    tapper: number
    end: BankEnd
    clock: number
    x: number
    y: number
    z: number
    drawnPitch: number
    writtenPitch: number
    /** How far the word had to carry, in metres, or null with no traveller in
     *  the place. A gesture reaches exactly as far as the voice (point 580), so
     *  a tap spoken beyond the hearing radius is deliberately ARMLESS — without
     *  this number a check measuring its hand reads a resting arm and blames
     *  the touch (work-order 1065). */
    heardFrom: number | null
  } | null>(null)
  const arrivalOpenings = useRef<Array<typeof tapOpening.current>>([])
  const poses = useRef<Array<RefObject<FigurePose | null>>>([])
  if (poses.current.length !== count) {
    poses.current = Array.from(
      { length: count },
      (_, i) =>
        poses.current[i] ?? {
          current: { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 },
        },
    )
  }
  // These children's poses are written HERE, so their pivots are written here
  // too — a pose left for the figure's own callback is drawn a frame late, and
  // the tap has to be on the stone in the frame the word falls (work-order
  // 1065).
  const limbs = useRef<Array<RefObject<FigureLimbs | null>>>([])
  if (limbs.current.length !== count) {
    limbs.current = Array.from({ length: count }, (_, i) => limbs.current[i] ?? { current: null })
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const cfg = balance.villageLife.childSpeech
    let spoken: BankUtterance | null = null
    if (round.bank) {
      // THE TRAVELLER IS AN OBSTACLE, NEVER A STOP (work-order 687 item 7): the
      // children steer round him — with one extra radius over a villager's body,
      // because they are shy of the stranger — and the game goes on.
      world.stranger = placePlayerPosition.active
        ? { x: placePlayerPosition.x, z: placePlayerPosition.z, radius: PLAYER_RADIUS }
        : null
      spoken = stepBankGame(
        round.bank,
        dt,
        { ...balance.villageLife.tag, ...balance.villageLife.bankGame },
        stage!,
        world,
        round.rand,
      )
    } else if (game && speech) {
      // The view the situations read the game through, refreshed in place.
      view.playing = game.playing
      view.chaser = game.chaser
      view.target = game.target
      view.immune = game.immuneFor > 0 ? game.immune : -1
      view.ground.x = x
      view.ground.z = z
      view.ground.radius = playRadius
      // What was said last frame steers the children this one: the chase keeps
      // the collisions, the stamina and the floor pace.
      stepTagGame(game, dt, balance.villageLife.tag, world, (i) => childSteer(speech, view, i, cfg))
    }
    // THE BODIES (point 578), resolved where the chase left them and before
    // anything is drawn: a child's body is its own scale's, and it is far
    // smaller than the catch distance — the tag always wins over the separation.
    //
    // EVERY body is written FIRST and the group resolved as one (point 648).
    // Writing and separating one child at a time resolved each against where its
    // neighbours stood a frame ago, and a single sweep cannot take a chain of
    // three apart at all — together that was the user's "Kinder klemmen kurz
    // ineinander". `separateGroup` sweeps until nobody moves.
    const sep = balance.villageLife.separation
    // ...AND THE SEPARATION KEEPS THE TRAVELLER'S BERTH TOO (work-order 687 item
    // 7). It resolves the inhabitants' bodies against one another, and the
    // traveller is not one of them — so without this it pushed a child inside
    // the berth the round's own steering had just kept clear.
    separationWorld.blocked = (px: number, pz: number) =>
      world.blocked(px, pz) ||
      insideStrangerBerth(world, balance.villageLife.bankGame, px, pz)
    for (let i = 0; i < children.length; i++) {
      const b = bodies[i]
      if (!b) continue
      b.x = children[i].x
      b.z = children[i].z
    }
    const separable = round.bank
      ? bodies.filter((_, i) => bankChildCanSeparate(children[i] as BankChild, bankChildTouching(round.bank!, i)))
      : bodies
    separateGroup(bodySet, separable, dt, sep, separationWorld)
    for (let i = 0; i < children.length; i++) {
      const b = bodies[i]
      if (!b) continue
      // The resolved position AND whatever the separation's own wedge escape
      // did (point 656 follow-up): its teleport is a rescue like any other, and
      // uncounted it read as the child walking out of its pocket.
      absorbSeparation(children[i], b)
    }
    // BOTH CLOCKS TICK ONCE A FRAME, AND THE GESTURE'S TICK COMES FIRST
    // (work-order 1065). The gestures used to be advanced in the pose loop
    // BELOW, after the word had already started one — so a gesture issued with
    // an utterance lost a whole dt to the very frame that began it, while
    // `bankGame` subtracts the tap's hold only from the next frame on. The
    // gesture then ran one frame ahead of its own hold for the rest of it, and
    // the arm was measured swinging back out 0.01 s before the hold ended, 10.6
    // cm off the stone with ROCK still falling. Advancing here means the new
    // utterance's gesture is only READ below, never advanced in its own frame:
    // the fade-out begins exactly at the hold's end.
    for (const gesture of gestures.current) {
      if (gesture) gesture.current = advanceGesture(gesture.current, dt)
    }
    if (spoken) {
      speakBankUtterance(spoken, children[spoken.speaker], refs.current[spoken.speaker], gestures.current[spoken.speaker])
    }
    // THE WORD'S OWN FRAME (work-order 1065). The tap is captured below, once
    // this frame's pose has been written AND applied — that is the picture the
    // player sees the word fall over, and the frame the whole claim rests on.
    const openedTouch = import.meta.env.DEV && spoken && spoken.gesture === 'touch' ? spoken.speaker : -1
    const said = game && speech ? stepChildSpeech(speech, view, dt, cfg, speechRand) : null
    if (said) speakSituation(said, children[said.speaker], refs.current[said.speaker], gestures.current[said.speaker])
    children.forEach((c, i) => {
      const g = refs.current[i]
      if (!g) return
      // A CHILD THAT STANDS STANDS ON BOTH FEET (work-order 1065). While it is
      // held, the offset is moved so the drawn phase reaches the neutral stance;
      // the dip that phase carried is what put the tapping hand 7 cm off its
      // stone, because the reach is solved at a height the body lift then took
      // away.
      const walking = gaitPhase(c.walked, cadence)
      if (c.held) {
        gaitOffsets.current[i] = restingPhase(walking + gaitOffsets.current[i], dt) - walking
      }
      const phase = walking + gaitOffsets.current[i]
      gaits.current[i].current = phase
      // THE HEIGHT IS THE GAME'S, NOT THE VIEW'S (work-order 1080). What stood
      // here was a constant 0.32 m switched on by a flag — a child hovering
      // beside a stone rather than standing on one. The climb now carries its
      // own lift in metres, taken from the boulder the child is actually on, and
      // this only draws it.
      const gaitLift = gaitBodyLift(phase, legLength)
      const lift = round.bank ? bankChildBodyLift(c as BankChild, gaitLift, bankChildTouching(round.bank, i)) : gaitLift
      g.position.set(c.x, lift, c.z)
      // A TAGGED CHILD IS UNMISTAKABLY OUT OF PLAY (work-order 687 item 3):
      // squatted down, trunk folded over and both arms crossed in front of it.
      // Written here rather than as a prop, because the state changes inside the
      // frame loop and a re-render per tag would be the wrong tool.
      const crouched = (c as BankChild).crouched === true
      g.scale.set(1, crouched ? CROUCH_SQUAT : 1, 1)
      // The eased FACING, not the raw travel heading: the body turns into a new
      // direction rather than snapping about-face inside one frame.
      g.rotation.y = c.facing
      const pose = poses.current[i].current
      if (!pose) return
      // The chase's posture and the speaker's arms on ONE body: the gesture owns
      // the arms and the shake, the run owns the lean. Writing the pose (rather
      // than handing the Figure its gesture ref) is what lets the two combine —
      // a figure with a pose ignores its gesture, so the pose must carry it.
      // Only READ here: this frame's advance already ran above, before the
      // word could start a new gesture (work-order 1065).
      const gesture = gestures.current[i]
      const shown = gesturePose(gesture.current)
      pose.left = crouched ? CROUCH_POSE.left : shown.left
      pose.right = crouched ? CROUCH_POSE.right : shown.right
      pose.turn = shown.turn
      pose.lean = crouched ? CROUCH_POSE.lean : c.lean + shown.lean
      applyFigurePose(limbs.current[i]?.current ?? null, pose)
      if (i === openedTouch) {
        g.updateWorldMatrix(true, true)
        const hands: Array<{ x: number; y: number; z: number; pitch: number }> = []
        g.traverse((o) => {
          if (o.name !== 'hand-left' && o.name !== 'hand-right') return
          const w = new THREE.Vector3()
          o.getWorldPosition(w)
          hands.push({ x: w.x, y: w.y, z: w.z, pitch: o.parent ? o.parent.rotation.x : 0 })
        })
        // The RAISED hand is the one doing the touching; the other hangs.
        const best = hands.sort((a, b) => b.y - a.y)[0]
        const opening: typeof tapOpening.current = best
          ? {
              tapper: i,
              end: Math.hypot(spoken!.aim.x - stage!.upstream.x, spoken!.aim.z - stage!.upstream.z) < 0.01
                ? 'upstream' : 'downstream',
              clock: round.bank!.clock,
              x: best.x,
              y: best.y,
              z: best.z,
              drawnPitch: best.pitch,
              writtenPitch: pose.left.pitch,
              heardFrom: placePlayerPosition.active
                ? Math.hypot(c.x - placePlayerPosition.x, c.z - placePlayerPosition.z)
                : null,
            }
          : null
        if (spoken?.moment === 'arrival') arrivalOpenings.current[i] = opening
        else tapOpening.current = opening
      }
    })
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): the live game.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const bank = round.bank
    // ONE HOOK FOR BOTH ROUNDS. The live child-motion check reads this shape,
    // and it must not have to know which game a settlement plays: the bank round
    // reports its own catcher, quarry, tags and clocks under the same names.
    w.__placeTag = () => ({
      playing: bank ? bank.playing : game!.playing,
      chaser: bank ? bank.children.findIndex((c) => c.role === 'catcher') : game!.chaser,
      target: bank
        ? (bank.children.find((c) => c.role === 'catcher')?.quarry ?? -1)
        : game!.target,
      tags: bank ? bank.tags : game!.tags,
      chaserFor: bank ? bank.phaseFor : game!.chaserFor,
      /** The bank round's own phase, for a check that wants to know what it is
       *  looking at; absent in the tag round. */
      phase: bank ? bank.phase : null,
      // The game's OWN clock: the verification samples an interval of GAME,
      // never a count of frames, which buy different amounts of it per machine.
      clock: bank ? bank.clock : game!.clock,
      // Of that clock, the part actually PLAYED (point 656) — the game's own
      // count, so a check need not decide from a sampled flag which side of a
      // round's first frame an interval falls on.
      playedClock: bank ? bank.playedClock : game!.playedClock,
      // The radius a child's BODY occupies, so a live check can judge an overlap
      // against the real figure rather than against a guessed one (point 648).
      bodyRadius: balance.villageLife.separation.bodyRadius * KID_SCALE,
      children: children.map((c) => ({
        x: c.x,
        z: c.z,
        heading: c.heading,
        reserve: c.reserve,
        effort: c.effort,
        press: c.press,
        pace: c.pace,
        pinned: c.pinned,
        // How often the settlement had to pick this child up and set it down on
        // free ground (point 656). A live check needs it: the teleport is what
        // ENDS a snag, so without the count the correction reads as the child
        // having walked out of the pocket by itself.
        nudges: c.nudges,
        // And how far it was carried doing so (point 656). Nothing outside the
        // game can work this out: one frame vector holds the child's walking and
        // the settlement's correction added together, and `walked` is a scalar
        // that cannot say which way the legs went.
        carried: c.carried,
        // Standing because it was TOLD to (point 481), not because it stalled —
        // the difference between an obeyed stillness and the reported snag.
        held: c.held,
        // Where it is in the climb onto the off-game boulder, and how high its
        // feet stand (work-order 1080) — so a picture check can WAIT for the
        // frame in which a child is up on the stone rather than shooting the
        // roaming quarter and hoping.
        climb: (c as BankChild).climb ?? 'none',
        lift: (c as BankChild).lift ?? 0,
        walked: c.walked,
        // And how much of that walking happened while the round was ON — the
        // settlement's own counter, for the same reason (point 656).
        walkedWhilePlaying: c.walkedWhilePlaying,
      })),
      /** The stone the off-game ROCK is climbed and spoken at, with the size the
       *  climb is played against (work-order 1080). Published rather than
       *  re-derived by the check, so the picture is judged against the boulder
       *  the settlement actually chose. Null where this round has no stage. */
      boulder: stage ? { ...stage.boulder } : null,
    })
    // WHAT THE PICTURE DOES WITH THE TAPPING HAND (work-order 1065). Read off
    // the SCENE GRAPH — the drawn hand's own world position — and compared with
    // the drawn stone's flank at that height, so the live check measures the
    // contact the player sees rather than the one the round solved for.
    const readTouchHand = (moment: 'tap' | 'arrival', speaker?: number) => {
      if (!bank || !stage) return null
      const opening = moment === 'tap' ? tapOpening.current : speaker !== undefined
        ? arrivalOpenings.current[speaker] ?? null
        : arrivalOpenings.current.reduce((latest, entry) =>
          entry && (!latest || entry.clock > latest.clock) ? entry : latest, null)
      const i = moment === 'arrival' ? opening?.tapper ?? -1 : bank.tapper
      const g = refs.current[i]
      if (i < 0 || !g) return null
      const end = moment === 'arrival' && opening ? opening.end : otherEnd(bank.from)
      const rock = rockAt(stage, end)
      const hands: Array<{ hand: string; x: number; y: number; z: number; radius: number; flank: number; gap: number }> = []
      g.updateWorldMatrix(true, true)
      g.traverse((o) => {
        if (o.name !== 'hand-left' && o.name !== 'hand-right') return
        const p = new THREE.Vector3()
        o.getWorldPosition(p)
        const bearing = Math.atan2(p.x - rock.x, p.z - rock.z)
        const radius = Math.hypot(p.x - rock.x, p.z - rock.z)
        const flank = stage.flank(end, bearing, p.y)
        hands.push({
          hand: o.name,
          x: p.x,
          y: p.y,
          z: p.z,
          radius,
          flank,
          gap: radius - flank - FIGURE_LIMBS.handRadius * KID_SCALE,
        })
      })
      // The hand that is ON the stone is the one nearest its flank; the other is
      // hanging at the child's side.
      const best = hands.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0] ?? null
      if (!best) return null
      // WHAT WAS WRITTEN against what is DRAWN. The pose is written by this
      // component's frame callback and applied by the figure's own; a reading
      // that finds the touch pose already written while the drawn hand is still
      // out at the child's side is a frame of render lag, not a hand that never
      // arrived (work-order 1065).
      const written = poses.current[i]?.current ?? null
      const openingGap = opening
        ? (() => {
            const b = Math.atan2(opening.x - rock.x, opening.z - rock.z)
            const r = Math.hypot(opening.x - rock.x, opening.z - rock.z)
            return r - stage.flank(end, b, opening.y) - FIGURE_LIMBS.handRadius * KID_SCALE
          })()
        : null
      return {
            ...best,
            tapper: i,
            phase: bank.phase,
            // The tap's own HOLD, so a reading can be told apart from one taken
            // after it: the word falls while `tapFor` is still running in the
            // run phase, and the touch gesture outlives that moment by design.
            tapFor: bank.tapFor,
            arrivalFor: bank.children[i].arrival?.holdFor ?? 0,
            clock: bank.clock,
            end,
            rock: { x: rock.x, z: rock.z },
            // WHICH SIDE THE REACH HANGS OFF. The touching hand is the LEFT one
            // and the child faces the stone, so from the wrong flank the body
            // stands in front of its own contact — the same miss the dip shot
            // had. The picture check picks its side from this offset rather
            // than assuming one (work-order 1065).
            body: (() => {
              const b = new THREE.Vector3()
              g.getWorldPosition(b)
              return { x: b.x, z: b.z }
            })(),
            gesture: gestures.current[i]?.current?.kind ?? null,
            // Seconds the gesture has been running, so the swing can be placed
            // on its own clock rather than on the hold's.
            gestureAge: gestures.current[i]?.current?.t ?? null,
            written: written
              ? { leftPitch: written.left.pitch, rightPitch: written.right.pitch, lean: written.lean }
              : null,
            // The word's own frame, measured when it fell rather than sampled
            // for afterwards.
            opening: opening ? { ...opening, gap: openingGap } : null,
            // The shoulder rotations the figure is REALLY drawn with this
            // frame, read off the hand meshes' own pivots.
            drawn: (() => {
              const arms: Array<{ name: string; pitch: number }> = []
              g.traverse((o) => {
                if (o.name !== 'hand-left' && o.name !== 'hand-right') return
                if (o.parent) arms.push({ name: o.name, pitch: o.parent.rotation.x })
              })
              return arms
            })(),
      }
    }

    w.__placeTapHand = () => readTouchHand('tap')
    w.__placeArrivalHand = (speaker?: number) => readTouchHand('arrival', speaker)

    // What the group has SAID so far this visit (point 481), by situation — a
    // live check can read the coverage the pure tests pin.
    w.__placeChildSpeech = () => ({
      staged: speech ? { ...speech.staged } : {},
      last: speech?.last ? { ...speech.last } : null,
      ground: { x, z, radius: playRadius },
    })
    return () => {
      delete w.__placeTag
      delete w.__placeTapHand
      delete w.__placeArrivalHand
      delete w.__placeChildSpeech
    }
  }, [round, game, speech, children, stage, x, z, playRadius])

  return (
    <>
      {children.map((c, i) => (
        <group
          key={i}
          // Born on its play spot (point 509), not at the settlement origin the
          // frame callback would only move it off from.
          position={figureStance(c)}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure
            cloth={cloth[i % cloth.length]}
            scale={KID_SCALE}
            legs
            role="child"
            gait={gaits.current[i]}
            pose={poses.current[i]}
            limbs={limbs.current[i]}
          />
        </group>
      ))}
    </>
  )
}

/** Goats drifting around, grazing — inside the pen when one exists. Each goat
 *  walks with a real gait (design.md §19, points 228/300): its legs swing about
 *  their hips on a phase driven by the DISTANCE it covers, at the cadence its own
 *  leg length dictates, so the planted foot stays put on the ground while the
 *  body travels over it (no skating, still legs at rest); the body dips with each
 *  footfall so the standing foot really touches, and it FACES its velocity so it
 *  can never glide backward. The settlement ground is one flat disc at y = 0, so
 *  no slope pitch is needed here — the panorama silhouettes, which walk real
 *  relief, carry that half. */
function Goats({ seed, count, pen, colliders }: { seed: number; count: number; pen: PenDef | null; colliders: Collider[] }) {
  const parts = useMemo(() => buildGoatParts(), [])
  // The gait read off this rig's own legs (point 300): stride length, cadence.
  const rig = useMemo(() => gaitRig(parts.legs), [parts])
  // The shared smooth-shaded fauna material (point 214) — the goats stand at
  // first-person range, where flat shading would read as hard panels.
  const material = useMemo(() => createFaunaMaterial(), [])
  // Grazing spots validated against the collider set, and one body per animal so
  // the herd is an obstacle to itself (point 413) — both in `animalSpots`, where
  // the fast test layer can pin them.
  const anchors = useMemo(() => animalAnchors(seed, count, pen, colliders), [seed, count, pen, colliders])
  const bodies = useMemo(() => animalBodies(anchors), [anchors])
  const scene = useMemo(() => animalScene(colliders, bodies), [colliders, bodies])
  const refs = useRef<Array<THREE.Group | null>>([])
  // Per-goat leg-pivot groups (four each) and gait state (last position, walked
  // distance, held facing and each stance's world contact) so the swing rides
  // distance, the body faces travel and a planted foot does not follow either.
  const legRefs = useRef<Array<Array<THREE.Group | null>>>([])
  const gait = useRef<Array<{ x: number; z: number; dist: number; yaw: number; plants: Array<FootPlant | null> }>>([])
  // Scratch vector for the DEV foot probe below — never allocated per frame.
  const footProbe = useMemo(() => new THREE.Vector3(), [])
  // Scratch vectors for aiming a straight leg from its moving hip to the held
  // world contact. All four legs share them sequentially inside one frame.
  const legDown = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const legDirection = useMemo(() => new THREE.Vector3(), [])
  if (gait.current.length !== anchors.length) {
    gait.current = anchors.map((a) => ({
      x: a.x,
      z: a.z,
      dist: 0,
      yaw: 0,
      plants: parts.legs.map(() => null),
    }))
  }
  useFrame(({ clock }, rawDt) => {
    const t = clock.elapsedTime
    const dt = Math.min(rawDt, 0.1)
    // Publish every animal's last position into the scene before anyone moves,
    // so each of them resolves against where the others actually stand.
    for (let i = 0; i < bodies.length; i++) {
      const s = gait.current[i]
      if (!s) continue
      bodies[i].x = s.x
      bodies[i].z = s.z
    }
    refs.current.forEach((g, i) => {
      const a = anchors[i]
      const s = gait.current[i]
      if (!g || !a || !s) return
      const wob = Math.sin(t * 0.2 + a.phase)
      // Swept from the position this animal actually holds (point 413): the old
      // position-only test resolved the raw wobble point, so the moment that
      // point crossed the ridge between two post circles the goat was pushed
      // out on the FAR side of the fence.
      const [px, pz] = stepAnimal(
        scene,
        bodies,
        i,
        a.x + wob * a.amp,
        a.z + Math.cos(t * 0.17 + a.phase) * a.amp,
        s.x,
        s.z,
      )
      const vx = px - s.x
      const vz = pz - s.z
      // The body swings round toward its travel direction at a bounded rate
      // (point 413). Snapping straight to the raw per-frame velocity made an
      // animal that met a fence — or, now, another animal — flip 180 degrees
      // between two frames, which is the "changes direction abruptly" half of
      // the report; a goat pivots fast, but not instantly.
      s.yaw = turnToward(s.yaw, faceVelocity(vx, vz, s.yaw), ANIMAL_TURN_RATE * dt)
      s.dist += Math.hypot(vx, vz)
      s.x = px
      s.z = pz
      // Swing the legs on the distance-driven phase at this rig's own cadence,
      // and drop the body onto the stance leg. Distance matching supplies the
      // natural touchdown and lift-off pose; the world-space planting below is
      // what holds that contact while collision response translates the body
      // sideways or its bounded facing turns over the stance.
      const phase = gaitPhase(s.dist, rig.cadence)
      const lift = gaitBodyLift(phase, rig.legLength)
      g.position.set(px, lift, pz)
      g.rotation.y = s.yaw
      const legs = legRefs.current[i]
      if (legs) {
        for (let li = 0; li < parts.legs.length; li++) {
          const lg = legs[li]
          if (!lg) continue
          const leg = parts.legs[li]
          const legPhase = phase + leg.phaseOffset
          const swing = legSwingAngle(phase, leg.phaseOffset)
          const planting = footPlantPose(
            s.plants[li],
            isStance(legPhase),
            { x: px, y: lift, z: pz, yaw: s.yaw },
            leg.hip,
            swing,
            rig.legLength,
          )
          s.plants[li] = planting.contact
          // Every frame draws the pose footPlantPose returned: planted frames
          // aim at the held world contact, swing frames reproduce the
          // procedural gait exactly (pinned in fauna.test.ts), and the
          // over-extension release frame keeps the leg at its reach limit
          // toward the lost contact instead of snapping to the gait pose in
          // the middle of a stance (point 697).
          legDirection.set(...planting.direction)
          lg.quaternion.setFromUnitVectors(legDown, legDirection)
          lg.scale.set(1, planting.stretch, 1)
        }
      }
      if (import.meta.env.DEV) {
        // The live no-skate probe (point 300) tracks one foot through its stance:
        // its world spot must hold while the body advances and turns. The foot is
        // read straight from the rendered leg group, so the probe reports what is
        // DRAWN; the stance flag reports whether that drawn foot is a HELD plant,
        // so an over-extension hand-over — contact released at the reach limit
        // and captured afresh, point 697 — breaks the measured interval exactly
        // like an ordinary swing does instead of being scored as one planted
        // foot jumping. A rig that released every frame could not hide there:
        // it would starve the judgment's interval count and fail its gate.
        const lg = legRefs.current[i]?.[0]
        if (lg) {
          const foot = footProbe.set(0, -rig.legLength, 0)
          lg.updateWorldMatrix(true, false)
          lg.localToWorld(foot)
          const w = window as unknown as Record<string, unknown>
          const info = (w.__placeGoatGait ?? (w.__placeGoatGait = {})) as Record<string, unknown>
          info[i] = {
            x: px,
            z: pz,
            dist: s.dist,
            phase,
            stride: rig.stride,
            yaw: s.yaw,
            stance: s.plants[0] !== null,
            foot: { x: foot.x, y: foot.y, z: foot.z },
          }
        }
      }
    })
  })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    return () => {
      delete (window as unknown as Record<string, unknown>).__placeGoatGait
    }
  }, [])
  return (
    <>
      {anchors.map((a, i) => (
        <group
          key={i}
          // Born on its grazing spot (point 509).
          position={figureStance(a)}
          ref={(el) => {
            refs.current[i] = el
          }}
          userData={markActor({ kind: 'goat', height: 0.9 })}
        >
          <mesh geometry={parts.body} material={material} castShadow />
          {parts.legs.map((leg, li) => (
            <group
              key={li}
              position={leg.hip}
              ref={(el) => {
                ;(legRefs.current[i] ??= [])[li] = el
              }}
            >
              <mesh geometry={leg.geo} material={material} castShadow />
            </group>
          ))}
        </group>
      ))}
    </>
  )
}

/** Porters carrying crates between the port buildings and the plaza. */
function Porters({
  seed,
  stops,
  cloth,
  colliders,
  count = 3,
}: {
  seed: number
  stops: Array<[number, number]>
  cloth: string[]
  colliders: Collider[]
  count?: number
}) {
  const routes = useMemo(() => {
    const rand = mulberry32((seed + 4711) >>> 0)
    const n = Math.min(count, Math.max(1, stops.length))
    return Array.from({ length: n }, (_, i) => {
      const a = stops[i % stops.length]
      // Routes lead across the central plaza so the bustle stays in view.
      const px = (rand() - 0.5) * 7
      const pz = (rand() - 0.5) * 7
      const toCenter = Math.hypot(a[0], a[1]) || 1
      return {
        ax: a[0] * (1 - 3.2 / toCenter),
        az: a[1] * (1 - 3.2 / toCenter),
        bx: px,
        bz: pz,
        phase: rand() * Math.PI * 2,
        speed: 0.55 + rand() * 0.2,
      }
    })
  }, [seed, stops, count])
  const refs = useRef<Array<THREE.Group | null>>([])
  // The carrying pose (point 479): both arms forward and up, the hands at the
  // crate's front corners. Constant — a porter holds the load, it does not wave.
  const carry = useRef<FigurePose | null>({ left: armAim(0.3, 0.45), right: armAim(-0.3, 0.45), lean: 0.05, turn: 0 })
  // Where each porter actually stands, so its move can be swept from there.
  const pos = useRef<Array<{ x: number; z: number } | null>>([])
  // The body each porter presents to the other inhabitants (point 578).
  const bodySet = useContext(InhabitantBodiesContext)
  const bodies = useInhabitantBodies(routes.length)
  const separationWorld = useMemo(
    () => ({ blocked: (px: number, pz: number) => !standingClear(colliders, px, pz, NPC_RADIUS) }),
    [colliders],
  )
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    refs.current.forEach((g, i) => {
      const r = routes[i]
      if (!g || !r) return
      // Ping-pong along the route; solid objects push the porter aside.
      const u = (Math.sin(t * r.speed + r.phase) + 1) / 2
      const x = r.ax + (r.bx - r.ax) * u
      const z = r.az + (r.bz - r.az) * u
      const dir = Math.cos(t * r.speed + r.phase) >= 0 ? 1 : -1
      const p = (pos.current[i] ??= { x, z })
      const b = bodies[i]
      // Point 657: where the route's next step lands in another inhabitant, the
      // porter walks ROUND the body instead of discovering it by collision.
      const want = b
        ? stepRoundBodies(bodySet, b, p.x, p.z, x, z, balance.villageLife.separation, separationWorld.blocked)
        : { x, z }
      const [px0, pz0] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [p.x, p.z])
      p.x = px0
      p.z = pz0
      if (b) {
        b.x = p.x
        b.z = p.z
        separateBody(bodySet, b, dt, balance.villageLife.separation, separationWorld)
        p.x = b.x
        p.z = b.z
      }
      const px = p.x
      const pz = p.z
      g.position.set(px, Math.abs(Math.sin(t * 5 + r.phase)) * 0.05, pz)
      g.rotation.y = Math.atan2((r.bx - r.ax) * dir, (r.bz - r.az) * dir)
    })
  })
  return (
    <>
      {routes.map((r, i) => (
        <group
          key={i}
          // Born at the end of its route it starts from (point 509).
          position={figureStance({ x: r.ax, z: r.az })}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={cloth[i % cloth.length]} pose={carry} role="porter" />
          {/* Carried crate */}
          <mesh position={[0, 1.05, 0.3]} castShadow>
            <boxGeometry args={[0.45, 0.35, 0.35]} />
            <meshStandardMaterial color="#7a5a32" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Where a talker stands and which way it faces. */
interface TalkerStance {
  x: number
  z: number
  yaw: number
}

/** Widest bearing a figure points at. Beyond it the arm would reach back over
 *  its own shoulder at something the speaker is not even facing. */
const TALKER_POINT_ARC = 1.2

/**
 * The aim the next gesture of a conversing pair takes, in the speaker's OWN
 * frame: an open bearing off to the side for a direction, and for everything
 * else something REAL — the settlement's middle (fire, well, lanes) when the
 * speaker is facing it, otherwise the partner it is turned toward. A figure
 * never points over its own shoulder at what it cannot see.
 */
function talkerAim(
  stances: readonly TalkerStance[],
  kind: GestureKind,
  who: number,
): { bearing: number; elevation: number } {
  const me = stances[who]
  const partner = stances[1 - who]
  const shoulderY = FIGURE_LIMBS.shoulderY
  if (kind === 'indicate') return { bearing: who === 0 ? 1.15 : -1.15, elevation: 0.05 }
  if (kind === 'point') {
    const middle = aimAt(me, { x: 0, y: 0.4, z: 0 }, shoulderY)
    if (Math.abs(middle.bearing) <= TALKER_POINT_ARC) return middle
    // The middle lies behind this speaker: point at the person in front of it.
    return aimAt(me, { x: partner.x, y: shoulderY * 0.7, z: partner.z }, shoulderY)
  }
  return aimAt(me, { x: partner.x, y: shoulderY, z: partner.z }, shoulderY)
}

/**
 * Two inhabitants standing together in conversation (point 479): they turn
 * toward each other and shift their weight, and they say nothing the player
 * cannot read.
 *
 * THEY NO LONGER GESTURE ON THEIR OWN (point 580). The pair used to cycle the
 * four gestures as ambient dressing, with no utterance behind any of them — the
 * mute pantomime the user reported from the picture ("they gesture, but I see
 * no texts over their heads"), and at ANY distance, since nothing it did could
 * ever be heard. Those four gestures are the very ones the teaching situations
 * use, so an ambient pair performing them showed the player concepts with no
 * word attached to them. Gesturing now
 * belongs to the figures that SPEAK: the children's situations and the adults'
 * errands, which drive the same `gesture` refs through the hearing gate
 * (`src/communication/spokenGesture.ts`).
 *
 * The dev hook below still drives the pair's arms directly — it is the rig the
 * headless verification poses the four gestures on (point 479), and it never
 * runs outside a dev build.
 *
 * OPEN: design.md §19.10 still lists this vignette as "pairs stand together in
 * conversation, GESTURING", which point 580's rule contradicts for a pair that
 * says nothing. design.md is not changed unilaterally, so the wording is left to
 * the user's decision: either it drops the gesturing here, or the pair is given
 * real utterances and gestures again behind the hearing gate.
 */
function Talkers({ x, z, cloth }: { x: number; z: number; cloth: string[] }) {
  const a = useRef<THREE.Group>(null)
  const b = useRef<THREE.Group>(null)
  const gestureA = useRef<GestureState>(restGesture())
  const gestureB = useRef<GestureState>(restGesture())

  // The two stand half a metre apart facing each other, so figure A looks along
  // world +x and figure B along −x. Their aims are computed in each one's own
  // frame from that facing.
  const stances = useMemo<TalkerStance[]>(
    () => [
      { x: x - 0.5, z, yaw: Math.PI / 2 },
      { x: x + 0.5, z, yaw: -Math.PI / 2 },
    ],
    [x, z],
  )
  // Two bodies the passers-by go round (point 578); the pair stands a metre
  // apart, well clear of the separation distance, so it never pushes itself.
  useStandingBodies(stances)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Slight turns toward each other — the conversation's idle, and all of it.
    if (a.current) {
      a.current.rotation.y = Math.PI / 2 + Math.sin(t * 1.15) * 0.18
      a.current.position.y = Math.max(0, Math.sin(t * 2.3)) * 0.03
    }
    if (b.current) {
      b.current.rotation.y = -Math.PI / 2 + Math.sin(t * 1.15 + Math.PI) * 0.18
      b.current.position.y = Math.max(0, Math.sin(t * 2.3 + Math.PI)) * 0.03
    }
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): the live gesture
  // state and the pose it draws, plus a way to hold one pose for a screenshot.
  // It is the ONLY thing that poses this pair — in a real run the two stand and
  // talk, and every gesture in the settlement belongs to a figure being heard.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const read = () =>
      [gestureA.current, gestureB.current].map((g) => ({
        kind: g.kind,
        t: g.t,
        duration: g.duration,
        bearing: g.bearing,
        pose: gesturePose(g),
      }))
    w.__placeGestures = read
    w.__placeForceGesture = (who: number, kind: GestureKind, seconds?: number) => {
      const aim = talkerAim(stances, kind, who)
      const next = startGesture(kind, { ...aim, duration: seconds, phase: who * 1.7 })
      if (who === 0) gestureA.current = next
      else gestureB.current = next
    }
    w.__placeTalkers = stances
    return () => {
      delete w.__placeGestures
      delete w.__placeForceGesture
      delete w.__placeTalkers
    }
  }, [stances])

  return (
    <group position={[x, 0, z]}>
      <group ref={a} position={[-0.5, 0, 0]}>
        <Figure cloth={cloth[0]} gesture={gestureA} />
      </group>
      <group ref={b} position={[0.5, 0, 0]}>
        <Figure cloth={cloth[1 % cloth.length]} gesture={gestureB} />
      </group>
    </group>
  )
}

/** Grain pounding: mortar and a rising, falling pestle (period staple). */
function Pounder({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  // A body the passers-by go round (point 578).
  useStandingBody(x, z)
  const pestle = useRef<THREE.Mesh>(null)
  const body = useRef<THREE.Group>(null)
  // Both hands on the pestle (point 479): the arms ride the stroke, so the grip
  // rises with the shaft instead of hanging beside a tool that lifts itself.
  const pose = useRef<FigurePose | null>({ left: armAim(0.2, 0.5), right: armAim(-0.2, 0.5), lean: 0.1, turn: 0 })
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const stroke = Math.abs(Math.sin(t * 2.4))
    if (pestle.current) pestle.current.position.y = 1.05 + stroke * 0.38
    if (body.current) body.current.position.y = -stroke * 0.06
    const p = pose.current
    if (p) {
      const elevation = 0.35 + stroke * 0.55
      Object.assign(p.left, armAim(0.2, elevation))
      Object.assign(p.right, armAim(-0.2, elevation))
      p.lean = 0.14 - stroke * 0.08
    }
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-x, -z), 0]}>
      <group ref={body} position={[0, 0, -0.55]}>
        <Figure cloth={cloth} pose={pose} />
      </group>
      {/* Mortar */}
      <mesh position={[0, 0.21, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.42, TESSELLATION.mortar]} />
        <meshStandardMaterial color="#5f4526" roughness={0.95} />
      </mesh>
      {/* Pestle */}
      <mesh ref={pestle} position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 1.05, TESSELLATION.pestle]} />
        <meshStandardMaterial color="#7a5a32" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** One of the drummer's drums, drawn from its own geometry so the stroke the
 *  hand beats and the drum the picture shows can never describe different
 *  drums (work-order point 576). */
function Drum({ drum, headRef }: { drum: DrumGeometry; headRef: RefObject<THREE.Mesh | null> }) {
  return (
    <group position={[drum.x, 0, drum.z]}>
      <mesh position={[0, drum.shellHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[drum.shellRadius[0], drum.shellRadius[1], drum.shellHeight, 9]} />
        <meshStandardMaterial color="#8a5a30" roughness={0.9} />
      </mesh>
      <mesh ref={headRef} position={[0, drum.headY, 0]} castShadow>
        <cylinderGeometry args={[drum.headRadius, drum.headRadius, drum.headThickness, 9]} />
        <meshStandardMaterial color="#cbb391" roughness={0.85} />
      </mesh>
    </group>
  )
}

/**
 * The drummer's OWN word (design.md §13.4): asked while the chief is in his
 * hut, he points his arm at that hut and names the man — CHIEF, one atom of the
 * same tonal language, through the same hearing gate as every other village
 * voice. Out of earshot he neither speaks nor mimes; the player who could not
 * have heard the word is not shown the arm that goes with it.
 */
function speakChiefWord(
  drummer: { x: number; z: number; yaw: number },
  hut: readonly [number, number],
  anchor: THREE.Group | null,
  gesture: RefObject<GestureState>,
): void {
  const distance = placePlayerPosition.active
    ? Math.hypot(drummer.x - placePlayerPosition.x, drummer.z - placePlayerPosition.z)
    : Infinity
  const utterance = utteranceOf('CHIEF')
  playSpeech(utterancePlan(utterance, distance))
  if (speechReach(distance).audible) {
    useGame.getState().hearUtterance(utterance)
    if (anchor) {
      speakOverhead(DRUMMER_SPEAKER_ID, [utterance], anchor, { seconds: speechLabelSeconds(1) })
    }
  }
  // The arm is aimed at the hut's DOOR height rather than its ridge: a man
  // points at the man inside, not at the roof.
  gesture.current = gestureIfHeard(distance, 'point', {
    ...aimAt({ x: drummer.x, z: drummer.z, yaw: drummer.yaw }, { x: hut[0], y: 1.6, z: hut[1] }, FIGURE_LIMBS.shoulderY),
  })
}

/**
 * Drummer at his pair of drums — the audible village drums made visible, and
 * the voice the chief's message goes out on (design.md §13.4, point 486).
 *
 * The LARGE low drum speaks `ba` and stands to his RIGHT, the SMALL high one
 * speaks `BA` and stands to his LEFT — and neither side is stated twice: each
 * drum's stroke reads its hand off the drum's OWN placement (`drummerPose.ts`),
 * so the hand that falls is always the one standing over the drum that sounds,
 * and that drum's head dips under it. While no message is going out his arms
 * use the figure's genuine rest pose and both drum heads stay still.
 *
 * Both the falling hand and the sounding beat come from the ONE plan
 * (src/communication/drumMessage.ts) the ambience engine plays, so the picture
 * and the sound can never tell different messages.
 */
function Drummer({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  // A body the passers-by go round (point 578).
  useStandingBody(x, z)
  const pose = useRef<FigurePose | null>({ left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: DRUMMER_LEAN, turn: 0 })
  const lowHead = useRef<THREE.Mesh>(null)
  const highHead = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)
  const gesture = useRef<GestureState>(restGesture())
  const yaw = drummerFacing([x, z])
  // His voice, for the use key that is read in PlaceScene (drummerVoice.ts).
  useEffect(() => {
    setDrummerVoice((hut) => speakChiefWord({ x, z, yaw }, hut, group.current, gesture))
    return () => setDrummerVoice(null)
  }, [x, z, yaw])
  useFrame((_, rawDt) => {
    const p = pose.current
    if (!p) return
    const beating = useUi.getState().drumPerformance
    const elapsed = beating ? (speechClock() * 1000 - beating.startedAt) / 1000 : 0
    const frame = drummerPoseAt(beating?.plan ?? null, elapsed)
    gesture.current = advanceGesture(gesture.current, Math.min(rawDt, 0.1))
    // The message outranks the word: while the drums are going out his hands
    // belong to them, so a gesture can never take an arm off a beating drum.
    const shown = !beating && isGesturing(gesture.current) ? gesturePose(gesture.current) : frame.pose
    Object.assign(p.left, shown.left)
    Object.assign(p.right, shown.right)
    p.lean = shown.lean
    p.turn = shown.turn
    if (lowHead.current) lowHead.current.position.y = drumHeadY(LOW_DRUM, frame.lowSwing)
    if (highHead.current) highHead.current.position.y = drumHeadY(HIGH_DRUM, frame.highSwing)
  })
  return (
    <group ref={group} name={DRUMMER_SPEAKER_ID} position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <Figure cloth={cloth} pose={pose} />
      {/* The large low drum (`ba`) and the small high one (`BA`) — each on the
          side its own x puts it, which is the side its hand is read from. */}
      <Drum drum={LOW_DRUM} headRef={lowHead} />
      <Drum drum={HIGH_DRUM} headRef={highHead} />
    </group>
  )
}

/** Fire tender kneeling at the fire pit, stoking the embers with a stick. */
function FireTender({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  // A body the passers-by go round (point 578).
  useStandingBody(x, z)
  const stick = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (stick.current) stick.current.rotation.x = 0.85 + Math.sin(clock.elapsedTime * 1.6) * 0.12
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-3.5 - x, 2.5 - z), 0]}>
      <Figure cloth={cloth} kneel />
      <mesh ref={stick} position={[0.2, 0.5, 0.35]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 1.15, 4]} />
        <meshStandardMaterial color="#4a3018" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Village well: stone ring with a wooden frame and bucket. */
function Well({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, 0.18, Math.sin(a) * 0.55]} castShadow>
            <dodecahedronGeometry args={[0.19, 0]} />
            <meshStandardMaterial color="#8d8478" roughness={1} />
          </mesh>
        )
      })}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.48, 0.48, 0.08, 12]} />
        <meshStandardMaterial color="#28516b" roughness={0.3} />
      </mesh>
      {[-0.6, 0.6].map((px) => (
        <mesh key={px} position={[px, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 1.5, 5]} />
          <meshStandardMaterial color="#5f4526" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 1.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.3, 5]} />
        <meshStandardMaterial color="#5f4526" roughness={0.95} />
      </mesh>
      {/* Bucket on the rope */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.09, 0.18, 7]} />
        <meshStandardMaterial color="#6e4f2a" roughness={0.9} />
      </mesh>
    </group>
  )
}

/**
 * Task loop (design.md §19): an inhabitant steps out of its dwelling,
 * carries something to a fixed target (food bundle to the fire, jar to the
 * well), kneels there working, and returns home. Door segments skip
 * collision like the Walkers.
 */
function TaskWalker({
  home,
  target,
  cloth,
  carry,
  colliders,
  startDelay,
}: {
  home: HomeDef
  target: [number, number]
  cloth: string
  carry: 'bundle' | 'jar'
  colliders: Collider[]
  startDelay: number
}) {
  const standing = useRef<THREE.Group>(null)
  const kneeling = useRef<THREE.Group>(null)
  const state = useRef({
    mode: 'inside' as 'inside' | 'go' | 'work' | 'back',
    seg: 0,
    x: home.x,
    z: home.z,
    yaw: 0,
    timer: startDelay,
  })
  // The body it presents to the other inhabitants (point 578) — only while it is
  // out of its dwelling.
  const bodySet = useContext(InhabitantBodiesContext)
  const [body] = useInhabitantBodies(1)
  const separationWorld = useMemo(
    () => ({ blocked: (px: number, pz: number) => !standingClear(colliders, px, pz, NPC_RADIUS) }),
    [colliders],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = state.current
    const stand = standing.current
    const kneel = kneeling.current
    if (!stand || !kneel) return
    if (body) {
      body.active = s.mode !== 'inside'
      body.x = s.x
      body.z = s.z
    }

    const route =
      s.mode === 'back'
        ? [target, home.door, [home.x, home.z] as [number, number]]
        : [[home.x, home.z] as [number, number], home.door, target]

    if (s.mode === 'inside') {
      stand.visible = false
      kneel.visible = false
      // Both bodies follow the state while it is at home (point 509): neither
      // may keep the identity transform that would park it at the settlement
      // origin until its first outing writes one.
      stand.position.set(s.x, 0, s.z)
      kneel.position.set(s.x, 0, s.z)
      s.timer -= dt
      if (s.timer <= 0) {
        s.mode = 'go'
        s.seg = 0
        s.x = home.x
        s.z = home.z
      }
      return
    }
    if (s.mode === 'work') {
      stand.visible = false
      kneel.visible = true
      kneel.position.set(s.x, 0, s.z)
      kneel.rotation.y = s.yaw
      s.timer -= dt
      if (s.timer <= 0) {
        s.mode = 'back'
        s.seg = 0
      }
      return
    }

    stand.visible = true
    kneel.visible = false
    const tgt = route[s.seg + 1]
    if (!tgt) {
      if (s.mode === 'go') {
        s.mode = 'work'
        s.timer = 5 + Math.random() * 5
      } else {
        s.mode = 'inside'
        s.timer = 10 + Math.random() * 16
      }
      return
    }
    const dx = tgt[0] - s.x
    const dz = tgt[1] - s.z
    const d = Math.hypot(dx, dz)
    const step = 1.2 * dt
    // The home leg (center ↔ door) passes through the own dwelling.
    const throughDoor = s.mode === 'go' ? s.seg === 0 : s.seg === route.length - 2
    if (d <= step + (throughDoor ? 0.08 : 0.3)) {
      s.seg++
    } else if (throughDoor) {
      s.x += (dx / d) * step
      s.z += (dz / d) * step
      s.yaw = Math.atan2(dx, dz)
    } else {
      // Point 657: another inhabitant on the way to the field is walked round,
      // not walked into.
      const want = body
        ? stepRoundBodies(bodySet, body, s.x, s.z, s.x + (dx / d) * step, s.z + (dz / d) * step, balance.villageLife.separation, separationWorld.blocked)
        : { x: s.x + (dx / d) * step, z: s.z + (dz / d) * step }
      const [nx, nz] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [s.x, s.z])
      if (Math.hypot(nx - s.x, nz - s.z) < step * 0.25) s.seg++ // blocked: skip ahead
      s.x = nx
      s.z = nz
      s.yaw = Math.atan2(dx, dz)
      // Point 578: pushed clear of the other inhabitants where the step left it.
      // The door leg is left out — it runs through its own hut, where every
      // direction is blocked anyway.
      if (body) {
        body.x = s.x
        body.z = s.z
        separateBody(bodySet, body, dt, balance.villageLife.separation, separationWorld)
        s.x = body.x
        s.z = body.z
      }
    }
    stand.position.set(s.x, 0, s.z)
    stand.rotation.y = s.yaw
  })

  return (
    <>
      <group ref={standing} visible={false} position={figureStance(home)}>
        <Figure cloth={cloth} pose={HEAD_CARRY_POSE} />
        {carry === 'bundle' ? (
          <mesh position={[0, 1.42, 0]} castShadow>
            <boxGeometry args={[0.38, 0.22, 0.3]} />
            <meshStandardMaterial color="#a3702e" roughness={0.95} />
          </mesh>
        ) : (
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 0.32, 8]} />
            <meshStandardMaterial color="#8a5a30" roughness={0.9} />
          </mesh>
        )}
      </group>
      <group ref={kneeling} visible={false} position={figureStance(home)}>
        <Figure cloth={cloth} kneel />
      </group>
    </>
  )
}

export interface HomeDef {
  x: number
  z: number
  door: [number, number]
}

export interface PenDef {
  x: number
  z: number
  r: number
}

interface WalkerState {
  mode: 'inside' | 'walk'
  route: Array<[number, number]>
  seg: number
  pause: number
  timer: number
  x: number
  z: number
  yaw: number
  /** Seconds of blocked movement; skips the waypoint when it grows. */
  stuck: number
  /** Seconds physically pinned (no real movement while walking); triggers the
   *  teleport-nudge to free ground when it exceeds the calibratable window
   *  (point 155). */
  pinned: number
}

/**
 * Inhabitants with a simple daily routine (design.md §2 lively settlements):
 * they step out of their dwelling through its entrance door, walk the paths
 * to an errand point, linger, walk back, press against the door and slip
 * inside, where they stay until the next outing. On the two door segments
 * (home center ↔ door) collision is skipped — the door is the one deliberate
 * opening in the otherwise impenetrable building (design.md §2).
 */
function Walkers({
  seed,
  homes,
  errands,
  cloth,
  count,
  colliders,
}: {
  seed: number
  homes: HomeDef[]
  errands: Array<[number, number]>
  cloth: string[]
  count: number
  colliders: Collider[]
}) {
  const defs = useMemo(() => {
    const rand = mulberry32((seed + 60601) >>> 0)
    const n = Math.min(count, homes.length)
    return Array.from({ length: n }, (_, i) => ({
      home: homes[Math.floor(rand() * homes.length)],
      cloth: cloth[i % cloth.length],
      speed: 1.05 + rand() * 0.5,
      startDelay: 1 + rand() * 9,
      carries: rand() < 0.4,
    }))
  }, [seed, homes, cloth, count])

  const states = useRef<WalkerState[]>([])
  if (states.current.length !== defs.length) {
    states.current = defs.map((d) => ({
      mode: 'inside' as const,
      route: [],
      seg: 0,
      pause: 0,
      timer: d.startDelay,
      x: d.home.x,
      z: d.home.z,
      yaw: 0,
      stuck: 0,
      pinned: 0,
    }))
  }
  const refs = useRef<Array<THREE.Group | null>>([])

  // The body each walker presents to every other inhabitant (point 578) — it
  // counts only while the walker is actually out: one asleep in its hut must not
  // block the lane above it.
  const bodySet = useContext(InhabitantBodiesContext)
  const bodies = useInhabitantBodies(defs.length)
  const separationWorld = useMemo(
    () => ({
      blocked: (px: number, pz: number) => !standingClear(colliders, px, pz, NPC_RADIUS),
      nudge: (px: number, pz: number) => {
        const free = tryNudgeToFree(colliders, px, pz, NPC_RADIUS)
        return { x: free.pos[0], z: free.pos[1], found: free.found }
      },
    }),
    [colliders],
  )

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeWalkers = { states: states.current, homes: defs.map((d) => d.home) }
    return () => {
      delete w.__placeWalkers
    }
  }, [defs])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    /** Point 578: this walker's body, pushed clear of the other inhabitants
     *  where its own step left it. Skipped on the door segments, which pass
     *  through the walker's own hut — every direction is blocked in there, and a
     *  wedge escape would teleport it out of its own doorway. */
    const settleBody = (i: number, s: WalkerState, separate: boolean) => {
      const b = bodies[i]
      if (!b) return
      b.active = s.mode !== 'inside'
      if (!b.active) return
      const sep = balance.villageLife.separation
      b.x = s.x
      b.z = s.z
      if (!separate) return
      separateBody(bodySet, b, dt, sep, separationWorld)
      s.x = b.x
      s.z = b.z
    }
    defs.forEach((def, i) => {
      const s = states.current[i]
      const g = refs.current[i]
      if (!s || !g) return

      if (s.mode === 'inside') {
        settleBody(i, s, false)
        // Invisible while at home; step out through the door when done. The
        // transform follows the state HERE too (point 509): this branch used to
        // return without writing it, so a walker that had not been out yet kept
        // the identity transform — a figure standing at the settlement origin
        // for its whole first stay indoors, and several of them on one spot.
        g.visible = false
        g.position.set(s.x, 0, s.z)
        s.timer -= dt
        if (s.timer <= 0) {
          const e = errands.length > 0 ? errands[Math.floor(Math.random() * errands.length)] : ([0, 2] as [number, number])
          // Route via a plaza-side midpoint, so walkers follow the lanes.
          const mid: [number, number] = [e[0] * 0.4 + (Math.random() - 0.5) * 2.5, e[1] * 0.4 + 1 + (Math.random() - 0.5) * 2.5]
          // Start and end inside the dwelling: out through the door, back
          // in through the door (design.md §2).
          const inside: [number, number] = [def.home.x, def.home.z]
          s.route = [inside, def.home.door, mid, [e[0], e[1]], mid, def.home.door, inside]
          s.seg = 0
          s.pause = 0
          s.x = inside[0]
          s.z = inside[1]
          s.mode = 'walk'
        }
        return
      }

      g.visible = true
      if (s.pause > 0) {
        // Linger at the errand: slight idle sway, no bob.
        s.pause -= dt
        settleBody(i, s, true)
        g.position.set(s.x, 0, s.z)
        g.rotation.y = s.yaw + Math.sin(t * 0.6 + i) * 0.35
        return
      }

      const target = s.route[s.seg + 1]
      if (!target) {
        // Fully inside the dwelling: disappear until the next outing.
        s.mode = 'inside'
        s.timer = 7 + Math.random() * 14
        return
      }
      const oldX = s.x
      const oldZ = s.z
      const dx = target[0] - s.x
      const dz = target[1] - s.z
      const d = Math.hypot(dx, dz)
      const step = def.speed * dt
      // Door segments (home center ↔ door) pass through the own dwelling:
      // no collision there, the walker slips through the entrance door.
      const throughDoor = s.seg === 0 || s.seg === s.route.length - 2
      if (d <= step + (throughDoor ? 0.08 : 0.35)) {
        // Close enough (the exact point may sit inside a collider).
        s.seg++
        s.stuck = 0
        if (s.seg === 3) s.pause = 2.5 + Math.random() * 4 // linger at the errand
      } else if (throughDoor) {
        s.x += (dx / d) * step
        s.z += (dz / d) * step
        s.yaw = Math.atan2(dx, dz)
      } else {
        // Solid objects block inhabitants too; slide along and skip the
        // waypoint if blocked for too long (design.md §2 collision) — and
        // another inhabitant's body is walked ROUND like one (point 657).
        const b657 = bodies[i]
        const want = b657
          ? stepRoundBodies(bodySet, b657, s.x, s.z, s.x + (dx / d) * step, s.z + (dz / d) * step, balance.villageLife.separation, separationWorld.blocked)
          : { x: s.x + (dx / d) * step, z: s.z + (dz / d) * step }
        const [nx, nz] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [s.x, s.z])
        const moved = Math.hypot(nx - s.x, nz - s.z)
        s.x = nx
        s.z = nz
        s.yaw = Math.atan2(dx, dz)
        if (moved < step * 0.3) {
          s.stuck += dt
          if (s.stuck > 1.4) {
            s.seg++
            s.stuck = 0
          }
        } else {
          s.stuck = 0
        }
      }
      // Belt-and-braces unstuck (point 155): the waypoint-skip above frees most
      // blocks, but a walker wedged in a pocket keeps cycling waypoints while
      // physically pinned. When it has not actually moved for the calibratable
      // window, teleport-nudge it to the nearest free spot — inhabitants only,
      // a small invisible correction, never the player.
      if (Math.hypot(s.x - oldX, s.z - oldZ) < step * 0.1) {
        s.pinned += dt
        if (s.pinned > balance.walkerUnstuckSeconds) {
          // Escalate rather than silently no-op (point 198): the nudge used to
          // return the ORIGINAL point when its search found nothing while the
          // caller reset the counter anyway, so a walker with no free spot
          // nearby stayed pinned forever. Try the ring search, WIDEN it once,
          // and if there is still no free spot, RETIRE the errand (advance to a
          // new target) — a stuck walker always makes progress now.
          const near = tryNudgeToFree(colliders, s.x, s.z, NPC_RADIUS)
          const r = near.found ? near : tryNudgeToFree(colliders, s.x, s.z, NPC_RADIUS, undefined, 24)
          if (r.found) {
            s.x = r.pos[0]
            s.z = r.pos[1]
          } else {
            s.seg++ // no reachable free spot here — pick a new errand target
          }
          s.pinned = 0
          s.stuck = 0
        }
      } else {
        s.pinned = 0
      }
      settleBody(i, s, !throughDoor)
      g.position.set(s.x, Math.abs(Math.sin(t * 6.5 + i * 2)) * 0.05, s.z)
      g.rotation.y = s.yaw
    })
  })

  return (
    <>
      {defs.map((def, i) => (
        <group
          key={i}
          visible={false}
          // Born inside its own dwelling (point 509) — where it actually is
          // while it is at home, and never at the settlement origin.
          position={figureStance(def.home)}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={def.cloth} pose={def.carries ? HEAD_CARRY_POSE : undefined} />
          {/* Some carry a basket or bundle on the head */}
          {def.carries && (
            <mesh position={[0, 1.42, 0]} castShadow>
              <cylinderGeometry args={[0.22, 0.16, 0.18, 8]} />
              <meshStandardMaterial color="#a3702e" roughness={0.95} />
            </mesh>
          )}
        </group>
      ))}
    </>
  )
}

/** How near a villager must come to count as having arrived where it was sent. */
const ERRAND_ARRIVE_RADIUS = WORK_ARRIVE_RADIUS

/** How near a waypoint of a route counts as passed. Wider than a stride, so a
 *  figure sliding along a wall beside the waypoint still ticks it off instead of
 *  circling it. */
const WAYPOINT_RADIUS = 1.2

/**
 * The adults at their errands teach RIVER and DIG. The scheduler is the pure
 * `adultWork` module; here it is given the
 * live village, and what comes back is spoken (through the §13.4 hearing curve),
 * shown over the speaker's head, gestured with the point-479 arms and CARRIED
 * OUT — the water carrier walks the path, while a would-be digger collects a
 * partner and the two walk to and work one excavation.
 *
 * These are villagers who stay OUT (unlike `Walkers`, who spend most of their
 * cycle inside a hut): an errand nobody is there to be given teaches nothing.
 * Between errands they stroll to the same named places on their own, which is
 * what keeps the situations that need someone already standing somewhere — the
 * call back from the water, the second digger — castable rather than theoretical.
 */
function ErrandVillagers({
  seed,
  cloth,
  colliders,
  radius,
  bank,
  geography,
  playGround,
  playRocks,
  count,
  childBodies,
  onDigProgress,
}: {
  seed: number
  cloth: string[]
  colliders: Collider[]
  radius: number
  /** The settlement's river bank (work-order 482) — part of the walkable shape
   *  these villagers keep to, since the errands send them out onto it. */
  bank: PlaceRiverBank | null
  geography: AdultWorkGeography
  playGround: PlayGround | null
  playRocks: { upstream: ErrandPoint; downstream: ErrandPoint } | null
  count: number
  /** The children's live bodies (work-order 688) — see `AdultWorkView.childrenHear`. */
  childBodies: RefObject<readonly InhabitantBody[]>
  onDigProgress: (progress: readonly DigSiteProgress[]) => void
}) {
  const refs = useRef<Array<THREE.Group | null>>([])
  /** The jars STANDING at the village water stand (work-order 1087). */
  const standJars = useRef<Array<THREE.Object3D | null>>([])
  // The jar each carrier holds: on the head when it is FULL, in the hand when it
  // is empty. Both are mounted once and shown by the frame loop, like every other
  // per-frame visibility in this scene.
  const headJars = useRef<Array<THREE.Object3D | null>>([])
  const handJars = useRef<Array<THREE.Object3D | null>>([])
  const digTools = useRef<Array<THREE.Object3D | null>>([])
  const reportedStrikes = useRef<number[]>([])
  /** A villager PINNED into the fill, by index and progress — the dev route the
   *  verification poses one by, since the errand itself does not dip yet
   *  (work-order 1085 owes the pose, 1087 owes the act that drives it). Null
   *  outside a forced frame, which is every real run. */
  const forcedFill = useRef<{
    who: number
    progress: number
    facing: number | null
    /** Where EVERY villager stood when the pin was taken, by index. */
    anchors: Array<{ x: number; z: number }>
  } | null>(null)
  /** Each villager's live y-squash, so his own Figure can keep his head round
   *  through it. Written by the frame loop below, read by the Figure. */
  const squats = useRef<Array<{ current: number }>>([])
  const rim = Math.max(1, radius - NPC_RADIUS * 2)

  /** Every place a villager may stroll to of its own accord: the head of the
   *  water path and the work sites.
   *
   *  THE FOOT IS NOT AMONG THEM (work-order 688 item 6). It stands on the bank,
   *  inside the children's stage, and an adult loitering there crowds the round
   *  even while he says nothing. Only the water CARRIER goes down, and he goes on
   *  a task and comes back up — which is also what makes him the man the next
   *  situation casts as the one arriving with a full jar. */
  const namedPlaces = useMemo(() => {
    const out: ErrandPoint[] = []
    if (geography.waterHead) out.push(geography.waterHead)
    for (const d of geography.digSites) out.push({ x: d.x, z: d.z })
    return out
  }, [geography])

  const { people, work, rand } = useMemo(() => {
    const r = mulberry32((seed + 30011) >>> 0)
    const spawn = Array.from({ length: count }, (_, i) => {
      const a = (i / Math.max(1, count)) * Math.PI * 2
      const [x, z] = nudgeToFree(colliders, Math.cos(a) * 7, Math.sin(a) * 7, NPC_RADIUS)
      return { x, z, free: true }
    })
    return {
      people: spawn,
      work: createAdultWork(count, balance.villageLife.adultErrands),
      rand: r,
    }
  }, [seed, count, colliders])

  // The settlement's free ground, sampled once per visit (work-order 482/483).
  // An errand sends a villager clear across the village — out to the river bank,
  // which lies past the huts and the compound fences — and a straight-line
  // seeker presses into the first fence on the way and never arrives. This is
  // what it walks around them by; it is built from the same boundary and the
  // same colliders the movement below obeys, so a route can never lead where
  // the step is then refused.
  const nav = useMemo(
    () => buildPlaceNavGrid({ radius, bank }, colliders, NPC_RADIUS),
    [radius, bank, colliders],
  )

  // Per-villager scene state: where it is strolling on its own, how long it has
  // been standing, how far it has walked (the bob), how long it has dug, and the
  // waypoints it is following round the building fabric.
  const idle = useRef<
    Array<{
      target: ErrandPoint | null
      pause: number
      walked: number
      dug: number
      stuck: number
      route: NavPoint[] | null
      routeTo: NavPoint | null
      replan: number
    }>
  >([])
  if (idle.current.length !== count) {
    idle.current = Array.from(
      { length: count },
      (_, i) =>
        idle.current[i] ?? {
          target: null,
          pause: 1 + i * 0.7,
          walked: 0,
          dug: 0,
          stuck: 0,
          route: null,
          routeTo: null,
          replan: 0,
        },
    )
  }
  const gestures = useRef<Array<RefObject<GestureState>>>([])
  if (gestures.current.length !== count) {
    gestures.current = Array.from(
      { length: count },
      (_, i) => gestures.current[i] ?? { current: restGesture() },
    )
  }
  const poses = useRef<Array<RefObject<FigurePose | null>>>([])
  if (poses.current.length !== count) {
    poses.current = Array.from(
      { length: count },
      (_, i) =>
        poses.current[i] ?? {
          current: { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 },
        },
    )
  }
  // Written here, so applied here — see the children at the bank (work-order
  // 1065): a pose applied by the figure itself is drawn a frame late.
  const limbs = useRef<Array<RefObject<FigureLimbs | null>>>([])
  if (limbs.current.length !== count) {
    limbs.current = Array.from({ length: count }, (_, i) => limbs.current[i] ?? { current: null })
  }
  const yaws = useRef<number[]>([])
  if (yaws.current.length !== count) {
    yaws.current = Array.from({ length: count }, (_, i) => yaws.current[i] ?? 0)
  }

  // May a body stand here? The settlement boundary and the collider set
  // together — the same question this component's own step asks. The work
  // module is handed it so the second digger's place beside a dig site is a
  // REAL one; picking his bearing without asking sent him into a hut, where he
  // never arrived while the joined situation counted as shown.
  const standable = useMemo(
    () => (px: number, pz: number) =>
      insidePlace({ radius, bank }, px, pz, NPC_RADIUS * 2) &&
      standingClear(colliders, px, pz, NPC_RADIUS),
    [colliders, radius, bank],
  )

  // Would a child hear a word spoken here? The radius is the settlement's own
  // hearing radius, read at the call so a debug edit takes effect at once, and
  // an inactive body — a figure that is out of the picture — hears nothing.
  const childrenHear = useCallback(
    (x: number, z: number) => {
      const ear = balance.communication.hearingRadius
      const kids = childBodies.current
      for (const kid of kids) {
        if (!kid.active) continue
        if (Math.hypot(kid.x - x, kid.z - z) <= ear) return true
      }
      return false
    },
    [childBodies],
  )

  // An invitation is spoken wherever the partner happened to be standing when
  // cast. Keep that anchor far enough from every fixed children's place that
  // even the initiator's arrival tolerance cannot put the word in its earshot.
  const invitationClear = useCallback(
    (x: number, z: number) => {
      const margin = balance.communication.hearingRadius + WORK_ARRIVE_RADIUS
      if (playGround && Math.hypot(x - playGround.x, z - playGround.z) - playGround.radius <= margin) return false
      if (geography.waterFoot && Math.hypot(x - geography.waterFoot.x, z - geography.waterFoot.z) <= margin) return false
      if (playRocks) {
        if (Math.hypot(x - playRocks.upstream.x, z - playRocks.upstream.z) <= margin) return false
        if (Math.hypot(x - playRocks.downstream.x, z - playRocks.downstream.z) <= margin) return false
      }
      return true
    },
    [geography, playGround, playRocks],
  )
  const view = useMemo<AdultWorkView>(
    () => ({ villagers: people, geography, standable, invitationClear, childrenHear }),
    [people, geography, standable, invitationClear, childrenHear],
  )

  // The body each villager presents to every other inhabitant (point 578): two
  // of them sent to neighbouring spots used to end up in one body.
  const bodySet = useContext(InhabitantBodiesContext)
  const bodies = useInhabitantBodies(count)
  const separationWorld = useMemo(
    () => ({
      blocked: (px: number, pz: number) => !standable(px, pz),
      nudge: (px: number, pz: number) => {
        const free = tryNudgeToFree(colliders, px, pz, NPC_RADIUS)
        return { x: free.pos[0], z: free.pos[1], found: free.found }
      },
    }),
    [colliders, standable],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const cfg = balance.villageLife.adultErrands
    // The jars standing at the village water stand: as many as the errand
    // state says have been set down, capped at the stand's capacity.
    for (let k = 0; k < standJars.current.length; k++) {
      const jar = standJars.current[k]
      if (jar) jar.visible = k < work.standJars
    }

    for (let i = 0; i < people.length; i++) {
      const me = people[i]
      const task = taskOf(work, i)
      me.free = !task
      const state = idle.current[i]
      // Where this villager is headed: what it was told, or its own stroll.
      let goal: ErrandPoint | null = null
      if (task) {
        // `goalOf`, not the task's own place: a water carrier is walked to the
        // head of the path first, where his word falls, and only then to the
        // water.
        goal = task.arrived ? null : goalOf(task)
      } else if (!task) {
        if (state.pause > 0) {
          state.pause -= dt
        } else if (!state.target) {
          // Half the strolls go to a place the adults work, so the situations
          // that need someone already standing somewhere — above all the carrier
          // coming back up from the water — stay castable rather than theoretical.
          const pick = rand()
          if (pick < 0.55 && namedPlaces.length > 0) {
            state.target = namedPlaces[Math.floor(rand() * namedPlaces.length) % namedPlaces.length]
          } else {
            const a = rand() * Math.PI * 2
            const d = 4 + rand() * Math.max(1, rim - 6)
            const [x, z] = nudgeToFree(colliders, Math.cos(a) * d, Math.sin(a) * d, NPC_RADIUS)
            state.target = { x, z }
          }
        } else {
          goal = state.target
        }
      }

      if (!goal) {
        state.route = null
        state.routeTo = null
      }
      if (goal) {
        const dx = goal.x - me.x
        const dz = goal.z - me.z
        const d = Math.hypot(dx, dz)
        const arriveAt = task ? ERRAND_ARRIVE_RADIUS : 0.9
        if (d <= arriveAt) {
          if (!task) {
            state.target = null
            state.pause = 3 + rand() * 6
          }
          state.route = null
          state.routeTo = null
          state.stuck = 0
        } else {
          // WHERE THE NEXT STEP GOES: at the goal while the line to it is open,
          // and otherwise at the next waypoint of a route round whatever stands
          // in between. Planning is asked for only when the straight line is
          // actually blocked, and at most once a second per villager, so the
          // ordinary walk across an open village costs nothing at all.
          state.replan -= dt
          if (state.routeTo && (state.routeTo.x !== goal.x || state.routeTo.z !== goal.z)) {
            state.route = null
            state.routeTo = null
          }
          if (!state.route && state.replan <= 0 && !navClearBetween(nav, me.x, me.z, goal.x, goal.z)) {
            state.route = findPlaceRoute(nav, me, goal)
            state.routeTo = { x: goal.x, z: goal.z }
            state.replan = 1
          }
          let aim: ErrandPoint = goal
          if (state.route) {
            while (
              state.route.length > 1 &&
              Math.hypot(state.route[0].x - me.x, state.route[0].z - me.z) <= WAYPOINT_RADIUS
            ) {
              state.route.shift()
            }
            // Back on the open line: drop the route and walk at the goal again,
            // so the figure never trudges a detour it has already got past.
            if (navClearBetween(nav, me.x, me.z, goal.x, goal.z)) {
              state.route = null
              state.routeTo = null
            } else aim = state.route[0]
          }
          const ax = aim.x - me.x
          const az = aim.z - me.z
          const ad = Math.hypot(ax, az) || 1
          const step = Math.max(0, cfg.pace) * dt
          // Point 657: a child (or anyone else) standing on the straight line is
          // walked ROUND — these strolls cross the children's play ground, and a
          // walker that discovered a body only by pressing on it is what the
          // children then could not get past.
          const b657 = bodies[i]
          const direct = { x: me.x + (ax / ad) * step, z: me.z + (az / ad) * step }
          const want = b657
            ? stepRoundBodies(bodySet, b657, me.x, me.z, direct.x, direct.z, balance.villageLife.separation, separationWorld.blocked)
            : direct
          const wantX = want.x
          const wantZ = want.z
          // The WALKABLE SHAPE, not a circle of its own (work-order 482): the
          // errands send a villager out onto the bank lobe, and a circular rim
          // would have frozen it at the plain radius short of the water.
          const inside = insidePlace({ radius, bank }, wantX, wantZ, NPC_RADIUS * 2)
          const [nx, nz] = inside
            ? resolveMove(colliders, wantX, wantZ, NPC_RADIUS, [me.x, me.z])
            : [me.x, me.z]
          const moved = Math.hypot(nx - me.x, nz - me.z)
          me.x = nx
          me.z = nz
          state.walked += moved
          // Facing where it WALKS, which on a route is the waypoint rather than
          // the destination behind the huts.
          yaws.current[i] = Math.atan2(ax, az)
          // Wedged (point 155): nudge free, and if that fails give the errand up
          // rather than let a villager stand pressed against a wall for ever.
          if (moved < step * 0.25) {
            state.stuck += dt
            if (state.stuck > balance.walkerUnstuckSeconds) {
              // A route planned from where it no longer stands is worthless.
              state.route = null
              state.routeTo = null
              const free = tryNudgeToFree(colliders, me.x, me.z, NPC_RADIUS)
              if (free.found) {
                me.x = free.pos[0]
                me.z = free.pos[1]
              } else if (task) clearTask(work, i)
              else state.target = null
              state.stuck = 0
            }
          } else {
            state.stuck = 0
          }
        }
      }

      // THE BODY (point 578), resolved where this villager's own step left it,
      // against every other inhabitant of the settlement.
      const body = bodies[i]
      if (body) {
        const sep = balance.villageLife.separation
        body.x = me.x
        body.z = me.z
        separateBody(bodySet, body, dt, sep, separationWorld)
        me.x = body.x
        me.z = body.z
      }

      // THE VILLAGE HOLDS STILL FOR THE PHOTOGRAPH (work-order 1085). The pin
      // held one man's POSE and left every errand running underneath it, so he
      // strolled on while bent double and the camera, aimed at where he stood
      // when he was pinned, photographed an empty bank — which is what the
      // WebGL 2 lane produced on 11.09.2026 while the check reported 18 pass,
      // 0 fail. The faster lane simply walked him further between the pin and
      // the shutter. Pinning HIM alone is not enough either: the frame is judged
      // on a silhouette, and a neighbour who keeps walking arrives behind him
      // and overlaps it. So while the dev route holds a fill, every villager
      // stands on the mark he had when it was taken — the clearance measured at
      // the pin is then the clearance at the shutter, on either lane. Restored
      // AFTER the separation, so no body can push anybody off his mark.
      const held = forcedFill.current?.anchors[i]
      if (held) {
        me.x = held.x
        me.z = held.z
        if (body) {
          body.x = held.x
          body.z = held.z
        }
      }
      const pinned = forcedFill.current?.who === i ? forcedFill.current : null
      // THE LIVE DIP, not only the photographed one. `filling` came from the dev
      // route alone, so the fill pose existed for the camera and never for a
      // player: in the game the carrier stood UPRIGHT at the water for
      // `bankFillSeconds` and then simply had a full jar on his head — the very
      // thing the user could not read on 06.09.2026, and the act this point owes.
      // The errand's own phase drives it now; the dev route only overrides which
      // man is held and how far along his dip is.
      const dipping = task && task.arrived && task.phase === 'fill'
        ? Math.min(1, task.dug / balance.bankFillSeconds)
        : null

      // WHAT HE IS CARRYING, and what that does to his body: jars keep their
      // established positions; the digging tool lives in the hand pivot so the
      // shaft rides the stroke instead of swinging beside an empty-handed man.
      const carry = carryOf(work, i)
      const headJar = headJars.current[i]
      const handJar = handJars.current[i]
      const digTool = digTools.current[i]
      if (headJar) headJar.visible = carry === 'fullJar'
      if (handJar) handJar.visible = carry === 'emptyJar'
      if (digTool) digTool.visible = carry === 'digTool'

      // The pose: a fill wins over everything, then digging, then the gesture,
      // then the load on the head, then rest.
      const pose = poses.current[i].current
      const gesture = gestures.current[i]
      gesture.current = advanceGesture(gesture.current, dt)
      const filling = pinned ? pinned.progress : dipping
      if (filling !== null) {
        state.dug = 0
        // The jar rides the dipping hand of its own accord — it hangs inside the
        // arm pivot — so the fill needs no prop of its own, only the empty jar
        // shown and the body that takes it down (design.md §13.4).
        if (headJar) headJar.visible = false
        if (handJar) handJar.visible = true
        if (digTool) digTool.visible = false
        const dip = fillPose(filling)
        if (pose) {
          pose.left = dip.left
          pose.right = dip.right
          pose.lean = dip.lean
          pose.turn = dip.turn
        }
      } else if (isDigging(work, i)) {
        state.dug += dt
        const siteIndex = task?.siteIndex
        const site = siteIndex === null || siteIndex === undefined ? null : geography.digSites[siteIndex]
        if (site) yaws.current[i] = Math.atan2(site.x - me.x, site.z - me.z)
        const dig = digPose(state.dug, i * 0.37)
        if (pose) {
          pose.left = dig.left
          pose.right = dig.right
          pose.lean = dig.lean
          pose.turn = dig.turn
        }
      } else if (carry === 'fullJar' && !isGesturing(gesture.current)) {
        state.dug = 0
        const load = HEAD_CARRY_POSE.current
        if (pose) {
          pose.left = load.left
          pose.right = load.right
          pose.lean = load.lean
          pose.turn = load.turn
        }
      } else {
        state.dug = 0
        const shown = gesturePose(gesture.current)
        if (pose) {
          pose.left = shown.left
          pose.right = shown.right
          pose.lean = shown.lean
          pose.turn = shown.turn
        }
      }
      if (pose) applyFigurePose(limbs.current[i]?.current ?? null, pose)

      const g = refs.current[i]
      if (g) {
        // The same walking bob the other inhabitants ride, off the distance this
        // villager has actually covered rather than off a wall clock.
        g.position.set(me.x, Math.abs(Math.sin(state.walked * 3.4 + i * 2)) * 0.05, me.z)
        const facing = forcedFill.current?.who === i ? forcedFill.current.facing : null
        if (facing !== null) yaws.current[i] = facing
        g.rotation.y = yaws.current[i]
        // THE SINK, which is half of what makes a fill read as fetching rather
        // than as falling: a y-squash on the figure's own group, exactly as the
        // crouching child's is drawn (work-order 1085).
        const squash = filling === null ? 1 : fillSquat(filling)
        g.scale.set(1, squash, 1)
        const squatRef = squats.current[i]
        if (squatRef) squatRef.current = squash
      }
    }

    const said = stepAdultWork(work, view, dt, cfg, rand)
    const progress = digProgressOf(work, geography.digSites.length)
    if (progress.some((site, i) => site.strikes !== (reportedStrikes.current[i] ?? 0))) {
      reportedStrikes.current = progress.map((site) => site.strikes)
      onDigProgress(progress)
    }
    if (said) {
      // The speaker turns to what he is talking about before he says it: a word
      // thrown over a shoulder at nothing reads as nothing at all.
      const speaker = people[said.speaker]
      if (speaker) {
        yaws.current[said.speaker] = Math.atan2(said.aim.x - speaker.x, said.aim.z - speaker.z)
        speakWork(said, speaker, yaws.current[said.speaker], refs.current[said.speaker], gestures.current[said.speaker])
      }
    }
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): what the adults
  // have said this visit, and what each of them is doing about it.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeErrands = () => ({
      staged: { ...work.staged },
      last: work.last ? { ...work.last } : null,
      standJars: work.standJars,
      geography: {
        waterHead: geography.waterHead,
        waterFoot: geography.waterFoot,
        waterFill: geography.waterFill,
        waterStand: geography.waterStand,
        digSites: geography.digSites.map((d) => ({ ...d })),
      },
      digProgress: digProgressOf(work, geography.digSites.length),
      villagers: people.map((p, i) => {
        const task = taskOf(work, i)
        // WHAT IS ACTUALLY DRAWN, not what the pose intended (work-order 1085):
        // the squash on the figure's own group and the world height its carrying
        // hand reached. A fill is judged by the body that arrived at the water,
        // and re-deriving either from the pose would prove only that the maths
        // agrees with itself.
        const g = refs.current[i]
        let handY = null
        let headAspect = null
        if (g) {
          g.updateWorldMatrix(true, true)
          g.traverse((o) => {
            if (o.name === 'hand-left') handY = o.getWorldPosition(new THREE.Vector3()).y
            // THE HEAD AS DRAWN, in world extents: a squat shortens a man, it does
            // not deflate his skull, so the ratio of the head's world height to its
            // world width must stay 1 through the sink (work-order 1085).
            if (o.name === 'figure-head') {
              // HOW TALL THE DRAWN HEAD IS AGAINST HOW WIDE, off its world matrix.
              // A sphere of radius r maps to an ellipsoid whose world half-extent
              // along an axis is r times that row's length, so equal rows ARE a
              // round head — squash, lean and counter-rotation all included.
              // `Box3.setFromObject` answers a different question and was measured
              // giving 0.73 for a head this says is 1.000: it transforms the
              // GEOMETRY'S BOX, whose corners swing out under the head's own
              // counter-rotation. The box is not the sphere.
              const e = o.matrixWorld.elements
              const rowLen = (a: number, b: number, c: number) => Math.hypot(e[a], e[b], e[c])
              const wide = rowLen(0, 4, 8)
              headAspect = wide > 1e-6 ? rowLen(1, 5, 9) / wide : null
            }
          })
        }
        return {
          x: p.x,
          z: p.z,
          free: p.free,
          digging: isDigging(work, i),
          filling: forcedFill.current?.who === i
            ? forcedFill.current.progress
            : task && task.arrived && task.phase === 'fill'
              ? Math.min(1, task.dug / balance.bankFillSeconds)
              : null,
          yaw: yaws.current[i] ?? 0,
          drawn: { squatY: g ? g.scale.y : null, handY, headAspect },
          carry: carryOf(work, i),
          work: task
            ? { situation: task.situation, phase: task.phase, x: task.x, z: task.z, arrived: task.arrived }
            : null,
        }
      }),
    })
    // Pins one villager into the fill pose at a given progress, or releases him
    // with `null`. It is the only thing that dips anybody today: the errand
    // still flips 'emptyJar' to 'fullJar' with no act in between, which is
    // work-order 1087's half. This exists so the POSE the design decided on can
    // be photographed on the figure it belongs to (work-order 1085).
    w.__placeForceFill = (who: number | null, progress = 0.5, facing: number | null = null) => {
      forcedFill.current =
        who === null
          ? null
          : { who, progress, facing, anchors: people.map((p) => ({ x: p.x, z: p.z })) }
    }
    return () => {
      delete w.__placeErrands
      delete w.__placeForceFill
    }
  }, [work, people, geography])

  return (
    <>
      {people.map((p, i) => (
        <group
          key={i}
          // Born on its spawn spot (point 509).
          position={figureStance(p)}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          {/* The water carrier's jar — the same vessel the task walkers carry to
              the well, so the object the player learns RIVER beside is one he has
              already seen in the village. The EMPTY one hangs in his hand, inside
              the arm pivot, so it goes where the hand goes. */}
          <Figure
            cloth={cloth[i % cloth.length]}
            pose={poses.current[i]}
            limbs={limbs.current[i]}
            squat={(squats.current[i] ??= { current: 1 })}
            handProp={
              <>
                <group
                  ref={(el) => {
                    handJars.current[i] = el
                  }}
                  visible={false}
                  position={[0, -0.12, 0.04]}
                  rotation={[0, 0, 0.12]}
                >
                  <Jar full={false} />
                </group>
                <group
                  name="digging-tool"
                  ref={(el) => {
                    digTools.current[i] = el
                  }}
                  visible={false}
                  position={[0, -0.34, 0]}
                >
                  <mesh castShadow>
                    <cylinderGeometry args={[0.027, 0.035, 1.05, 6]} />
                    <meshStandardMaterial color="#654522" roughness={0.95} />
                  </mesh>
                  <mesh position={[0, -0.48, 0.07]} rotation={[0.28, 0, 0]} castShadow>
                    <boxGeometry args={[0.28, 0.055, 0.18]} />
                    <meshStandardMaterial color="#51483d" roughness={0.82} />
                  </mesh>
                </group>
              </>
            }
          />
          <group
            ref={(el) => {
              headJars.current[i] = el
            }}
            visible={false}
            position={[0, 1.5, 0]}
            // A carried jar is not a plumb cylinder: a small lean turns the
            // mouth off the vertical, which is what lets any of the water in it
            // be seen from a standing eye rather than only its rim edge-on.
            rotation={[0.16, 0, 0.1]}
          >
            <Jar full />
          </group>
        </group>
      ))}
      {geography.waterStand && (
        <WaterStand x={geography.waterStand.x} z={geography.waterStand.z} jarRefs={standJars} />
      )}
    </>
  )
}

// --- The water carrier's jar (work-order 1087) -----------------------------
//
// BOTH JARS ARE THE SAME VESSEL, and it is OPEN. It used to be one closed opaque
// cylinder in both states, and the full one was the empty one moved onto the
// head: the user (06.09.2026) could see no water in it and therefore could not
// tell that water was being fetched. The mouth is open now, and what stands
// inside it is what tells the two apart at a glance — a dark hollow in the empty
// one, the river's own tone at the rim in the full one.
//
// The rim is FLARED past the body's waist. A head-carried jar sits near the
// player's own eye height, so its mouth is seen at a shallow angle; a wider
// mouth is a wider ellipse, which is what makes the reading survive the
// distance the player watches from.
const JAR_RIM_R = 0.155
const JAR_WAIST_R = 0.16
const JAR_BASE_R = 0.13
const JAR_HEIGHT = 0.32
/** How far below the rim the water stands in a full jar, and the hollow in an
 *  empty one. The full one is brim-full; the empty one is a shadow well down. */
const JAR_WATER_DROP = 0.03
/** How flat the meniscus is against the hemisphere its geometry starts from.
 *  A FULL hemisphere of the rim's radius stands 0.117 m over a jar 0.32 m tall —
 *  a ball on a pot, not water in it, and not the "shallow dome standing slightly
 *  proud of the rim" its own drawing describes. Flattened to a fifth of the
 *  jar's height it clears the rim by about 6.5 cm — judged at the picture:
 *  3 cm left a stripe too thin to read at the distance a player watches from,
 *  and the full hemisphere read as a ball sitting on a pot. */
const JAR_MENISCUS_FLATTEN = 0.65
const JAR_HOLLOW_DROP = 0.13

function Jar({ full }: { full: boolean }) {
  return (
    <>
      <mesh castShadow>
        <cylinderGeometry args={[JAR_RIM_R, JAR_WAIST_R, JAR_HEIGHT, 14, 1, true]} />
        {/* Double-sided: the inner wall is half of what an open mouth reads as. */}
        <meshStandardMaterial color="#8a5a30" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* The base, so the vessel is a jar and not a tube. */}
      <mesh position={[0, -JAR_HEIGHT / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[JAR_BASE_R, 14]} />
        <meshStandardMaterial color="#6b4423" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* What is IN it. The full jar's water is a shallow DOME standing slightly
          proud of the rim, not a flat disc in it: a head-carried jar's mouth
          sits at about 1.66 m and the player's eye at about 1.6 m, so a disc
          inside the rim is edge-on from every standing distance and reads as
          nothing. A meniscus breaks the rim line and shows as a bright cap. */}
      {full ? (
        <mesh position={[0, JAR_HEIGHT / 2 - JAR_WATER_DROP, 0]} scale={[1, JAR_MENISCUS_FLATTEN, 1]}>
          <sphereGeometry args={[JAR_RIM_R - 0.008, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial
            color={RIVER_WATER_TONES.sheen}
            roughness={0.14}
            metalness={WATER_METALNESS}
            emissive={RIVER_WATER_TONES.deep}
            emissiveIntensity={0.35}
          />
        </mesh>
      ) : null}
      <mesh
        position={[0, JAR_HEIGHT / 2 - (full ? JAR_WATER_DROP : JAR_HOLLOW_DROP), 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[full ? JAR_RIM_R - 0.012 : JAR_WAIST_R - 0.02, 14]} />
        {full ? (
          // The river's own sheen, glossy like the water it came from, with a
          // little light of its own so the disc still reads in the shade of the
          // carrier's own head.
          <meshStandardMaterial
            color={RIVER_WATER_TONES.sheen}
            roughness={0.14}
            metalness={WATER_METALNESS}
            emissive={RIVER_WATER_TONES.deep}
            emissiveIntensity={0.35}
            side={THREE.DoubleSide}
          />
        ) : (
          <meshStandardMaterial color="#241a12" roughness={1} side={THREE.DoubleSide} />
        )}
      </mesh>
    </>
  )
}

/**
 * THE VILLAGE WATER STAND (work-order 1087): a low platform beside the fire
 * where the filled jars are set down. It is what gives the errand's return leg a
 * destination — the carrier used to walk to a radius, where his task was nulled
 * and the full jar vanished in the same frame.
 *
 * It draws `jars` of them, capped by the errand state at
 * `balance.waterStandCapacity`, so a delivery past the cap replaces the oldest
 * standing jar rather than piling one more on.
 */
function WaterStand({ x, z, jarRefs }: { x: number; z: number; jarRefs: RefObject<Array<THREE.Object3D | null>> }) {
  return (
    <group position={[x, 0, z]}>
      {/* Four short posts and a plank top — the same worn timber the village's
          other frames are built from. */}
      {[
        [-0.34, -0.34],
        [0.34, -0.34],
        [-0.34, 0.34],
        [0.34, 0.34],
      ].map(([px, pz]) => (
        <mesh key={`${px},${pz}`} position={[px, 0.16, pz]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.32, 5]} />
          <meshStandardMaterial color="#5f4526" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.07, 0.92]} />
        <meshStandardMaterial color="#6b5433" roughness={0.92} />
      </mesh>
      {Array.from({ length: balance.waterStandCapacity }, (_, i) => {
        // Set down in a row across the plank, so three read as three. All of
        // them are mounted once and the frame loop shows as many as stand there.
        const spread = 0.28
        const offset = (i - (balance.waterStandCapacity - 1) / 2) * spread
        return (
          <group
            key={i}
            ref={(el) => {
              if (jarRefs.current) jarRefs.current[i] = el
            }}
            visible={false}
            position={[offset, 0.385 + JAR_HEIGHT / 2, i % 2 === 0 ? 0.04 : -0.06]}
          >
            <Jar full />
          </group>
        )
      })}
    </group>
  )
}

/**
 * Speaks one word of the adults' work (work-order 688): the single atom through
 * the §13.4 hearing curve, the reading over the speaker's head, and the gesture
 * on his own arms, aimed at the water, the invited adult, or the excavation.
 *
 * The DISTANCE decides all three, exactly as it does for the children (point
 * 580): what the player could not hear teaches him nothing however plainly he
 * saw the work, so beyond the hearing radius the villager's arms stay down.
 *
 * The first DIG beckons to its listener; the second indicates the excavation.
 * Their repeated word and unchanged pair distinguish the invitation from a
 * generic "come" reading.
 */
function speakWork(
  said: SpokenWord,
  speaker: { x: number; z: number },
  yaw: number,
  anchor: THREE.Group | null,
  gesture: RefObject<GestureState> | undefined,
): void {
  if (!gesture) return
  const distance = placePlayerPosition.active
    ? Math.hypot(speaker.x - placePlayerPosition.x, speaker.z - placePlayerPosition.z)
    : Infinity
  const utterance = utteranceOf(said.concept)
  playSpeech(utterancePlan(utterance, distance))
  if (speechReach(distance).audible) {
    useGame.getState().hearUtterance(utterance)
    if (anchor) {
      speakOverhead(`villager-${said.speaker}`, [utterance], anchor, { seconds: speechLabelSeconds(1) })
    }
  }
  gesture.current = gestureIfHeard(distance, said.purpose === 'invitation' ? 'beckon' : 'indicate', {
    ...aimAt({ x: speaker.x, z: speaker.z, yaw }, said.aim, FIGURE_LIMBS.shoulderY),
    phase: said.speaker * 1.1, // no two villagers beat in lockstep
  })
}

/** Standing traders on the plaza that slowly look around. */
function Traders({ seed, cloth }: { seed: number; cloth: string[] }) {
  const spots = useMemo(() => {
    const rand = mulberry32((seed + 913) >>> 0)
    return [
      { x: 3 + rand() * 2, z: -4 - rand() * 2, phase: rand() * Math.PI * 2 },
      { x: -4 - rand() * 2, z: -2 - rand() * 2, phase: rand() * Math.PI * 2 },
    ]
  }, [seed])
  const refs = useRef<Array<THREE.Group | null>>([])
  // Bodies the passers-by go round (point 578).
  useStandingBodies(spots)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    refs.current.forEach((g, i) => {
      const s = spots[i]
      if (!g || !s) return
      g.rotation.y = Math.sin(t * 0.4 + s.phase) * 0.8
    })
  })
  return (
    <>
      {spots.map((s, i) => (
        <group
          key={i}
          position={[s.x, 0, s.z]}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={cloth[(i + 1) % cloth.length]} role="trader" />
        </group>
      ))}
    </>
  )
}

/**
 * The dev-mode watch of point 509.3: NO inhabitant may stand at a transform no
 * placement ever wrote. It reads the drawn scene rather than any one vignette's
 * state, so it catches the next occurrence wherever it is born — a new vignette
 * that forgets to place its figures is reported by any run, headless or manual,
 * instead of by a passing observation.
 *
 * The world position is what it judges, because the figure group itself always
 * sits at its parent's origin: the parent IS the placement. Sampled about once
 * a second — a transform nothing wrote does not heal between frames, and a full
 * scene traverse per frame would cost the settlement real time.
 */
function useUnplacedInhabitantWatch(placeId: string, anchors: readonly PlaceSpot[]): void {
  const scene = useThree((s) => s.scene)
  const probe = useMemo(() => new THREE.Vector3(), [])
  const nextCheck = useRef(0)
  useFrame(({ clock }) => {
    if (!import.meta.env.DEV) return
    if (clock.elapsedTime < nextCheck.current) return
    nextCheck.current = clock.elapsedTime + 1
    let unplaced = 0
    scene.traverse((o) => {
      if (o.name !== 'inhabitant') return
      o.getWorldPosition(probe)
      if (unplacedInhabitant(probe, anchors)) unplaced++
    })
    devAssert(
      unplaced === 0,
      'inhabitant-unplaced',
      () =>
        `${placeId}: ${unplaced} inhabitant(s) stand at the settlement origin — ` +
        'a transform no placement ever wrote',
    )
  })
}

export function PlaceLife({
  kind,
  size = 1,
  seed,
  placeId,
  style,
  buildings,
  firePos,
  homes,
  errands,
  digSites,
  bank,
  waterPath,
  waterStand,
  playRocks,
  playGround,
  rocks,
  pen,
  colliders,
  radius,
  onDigProgress,
}: {
  kind: 'port' | 'village'
  /** Settlement size (design.md §4.1): big cities show more bustle. */
  size?: number
  seed: number
  placeId: string
  style: RegionPlaceStyle
  buildings: Array<[number, number]>
  firePos: [number, number]
  homes: HomeDef[]
  errands: Array<[number, number]>
  /** The ground work the adults teach DIG at (point 483/688). */
  digSites: DigSite[]
  /** The walkable river bank, where the settlement stands on a river
   *  (work-order 482): the ground the children's stage stands on. */
  bank: PlaceRiverBank | null
  /** The village's water path (work-order 688): its head in the village, where
   *  the carriers speak, its foot at the river, where neither does, and the
   *  fill spot in the water where the jar is dipped (work-order 1087). */
  waterPath: { head: { x: number; z: number }; foot: { x: number; z: number }; fill: { x: number; z: number } } | null
  /** The village water stand (work-order 1087): where the errand is ordered and
   *  where the filled jars are set down. */
  waterStand: { x: number; z: number } | null
  /** The two play rocks of the children's bank game (work-order 687), and the
   *  settlement's loose boulders — one of which a child climbs and names while
   *  the group roams, so ROCK is heard at a stone that is no part of the game. */
  playRocks: {
    upstream: { x: number; z: number }
    downstream: { x: number; z: number }
    /** The instance scale they are drawn at — the children's round measures the
     *  flank it reaches for through it (work-order 1065). */
    scale: number
  } | null
  /** The children's roaming quarter, decided by the layout (work-order 688) so
   *  the adults' work sites can be placed clear of it. */
  playGround: PlayGround | null
  rocks: Array<[number, number, number]>
  pen: PenDef | null
  colliders: Collider[]
  /** The settlement's walkable radius — the children's play area (point 480). */
  radius: number
  /** Publishes strike-quantized progress to the site meshes in PlaceScene. */
  onDigProgress: (progress: readonly DigSiteProgress[]) => void
}) {
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const localSeed = (seed ^ hash) >>> 0

  // THE SETTLEMENT'S INHABITANT BODIES (work-order point 578). One set per
  // settlement, shared by every life vignette below: the defect was that no
  // villager was in any set the others resolved against, so children and adults
  // alike walked into one another and stayed there as one tangle of limbs. One
  // per mounted settlement: every vignette claims its slots from it and gives
  // them back when it goes.
  const inhabitantBodies = useMemo(() => createInhabitantSet(), [])
  // WHERE THE CHILDREN ARE, for the one part of the settlement that has to know
  // (work-order 688): the adults' work holds a word rather than say it into a
  // passing child's ear. `Kids` publishes the bodies it already moves and
  // `ErrandVillagers` reads them, so nothing is copied and nothing is stale.
  const childBodies = useRef<readonly InhabitantBody[]>([])

  // Dev hook for the headless verification and for diagnosing motion defects
  // (point 657): the whole body registry, so a live trace can say WHAT stood
  // where a figure pressed. Dev-only, like `__placeTag`.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeBodies = () =>
      inhabitantBodies.bodies.map((b) => ({
        x: b.x,
        z: b.z,
        scale: b.scale,
        active: b.active,
        fixed: b.fixed,
      }))
    return () => {
      delete w.__placeBodies
    }
  }, [inhabitantBodies])

  // The cold-weather dress of §19.13, from THIS settlement's own place and the
  // date — like the settlement's weather, and for the same reason. Almost every
  // people has none: see the evidence notes in systems/dress.ts.
  const cloaks = useColdCloaks(placeId, style.cloth)

  // The limb tessellation of the current graphics level (point 479). Read ONCE
  // here, not per figure: a settlement mounts a couple of dozen of them.
  const limbSegments = useUi(effectiveFigureLimbSegments)

  // Seasonal presence (point 142, "the young men are gone"): the adult walkers
  // thin in a people's away season — the Maasai at the dry-season highland
  // camps (PERIOD), the Tuareg on the autumn caravan, the Sahel farmers out at
  // the field huts in the rains — while the elder and the home vignettes REMAIN
  // (the research's shape: "a camp of women, children and elders"). The children
  // thin WITH the camp but never vanish (point 480): the group that plays tag is
  // smaller in the away season, so the player count genuinely changes with the
  // calendar, and at one child the game falls back to ordinary idling rather
  // than having a child chase itself. Sedentary peoples never thin. Read once
  // per visit, like the dress: time does not advance inside a settlement.
  const presence = useMemo(() => {
    const place = placeById(placeId)
    if (!place?.peopleId) return 1
    return presenceAt(place.peopleId, useGame.getState().day, START_YEAR)
  }, [placeId])

  // How many children play here today. Fixed for the visit, like the presence
  // it scales with, and never below one.
  const kidCount = Math.max(1, Math.round(balance.villageLife.tag.childCount * presence))

  // The places the adults WORK (work-order 688). Every one of them is the
  // layout's own, so a villager works exactly where the scene draws the work. A
  // settlement with no river carries no water path, and its adults then teach
  // only DIG rather than point at water that is not there.
  const workGeography = useMemo<AdultWorkGeography>(
    () => ({
      waterHead: waterPath ? { x: waterPath.head.x, z: waterPath.head.z } : null,
      waterFoot: waterPath ? { x: waterPath.foot.x, z: waterPath.foot.z } : null,
      waterFill: waterPath ? { x: waterPath.fill.x, z: waterPath.fill.z } : null,
      waterStand: waterStand ? { x: waterStand.x, z: waterStand.z } : null,
      digSites,
    }),
    [waterPath, waterStand, digSites],
  )

  // WHERE they play comes from the LAYOUT (work-order 688): far enough from
  // every adult vignette that the §13.4 hearing range separates the two groups
  // (point 481.4) and against the village's own walls, so the chase is watched
  // with the settlement behind it (point 524). It moved out of this component
  // because the adults' dig sites are placed CLEAR of it, and a quarter derived
  // once there and once here would be two quarters (points 129/378).
  useGame((s) => s.balanceVersion)
  // A VILLAGE WITHOUT A QUARTER IS NOT A PASS. The separation assert below used
  // to accept `!playGround` outright, so the one state that switches the bank
  // stage off entirely and drops the chase onto an origin-centred disc with no
  // clearance at all went by as success (GPT-5.6 Sol, first cross-vendor round,
  // C1). The fallback stays — a malformed layout must not take the scene down —
  // but it says so.
  devAssert(
    kind !== 'village' || !!playGround,
    'tag-play-ground-missing',
    () =>
      `${placeId}: a village with no children's quarter — the chase falls back to the origin ` +
      `and the bank stage is switched off`,
  )
  // Point 524.2: a ground that had to give up its separation leaves two teaching
  // voices inside one earshot. Nothing in the shipped villages reaches this, so
  // it is armed as an assert rather than answered by a second mechanism.
  devAssert(
    kind !== 'village' || !playGround || playGround.clearance >= balance.communication.hearingRadius,
    'tag-play-ground-unseparated',
    () =>
      `${placeId}: the play ground clears the adults by only ${playGround?.clearance.toFixed(1)} m ` +
      `(fabric ${playGround?.fabric.toFixed(2)}) — the two teaching voices need another means of being told apart`,
  )

  // THE CHILDREN'S STAGE (work-order 687): the two play rocks, the water the
  // opening call points at, an ordinary village boulder that is no part of the
  // game, and the quarter the group roams in between cycles. A settlement
  // without a bank carries no stage, and its children keep the tag round.
  const bankStage = useMemo<BankStage | null>(() => {
    if (!bank || !playRocks || !playGround) return null
    // The nearest loose boulder to the children's own quarter — the one they
    // would plausibly be standing at anyway. It is the guard that keeps ROCK
    // from meaning only a game target, so without one this settlement keeps the
    // old tag round just as a riverless village does.
    //
    // A STONE THAT CAN BE STOOD ON (work-order 1080). The child climbs this one,
    // so nearness alone is the wrong choice: the scatter draws its instance
    // scale from 0.3 to 1.0, and on the small end of that a boulder is a pebble
    // a child would step over. The nearest CLIMBABLE stone therefore wins, and
    // where a settlement has none the tallest one it has is taken rather than
    // the whole off-game ROCK being dropped — a low step still reads as getting
    // up onto a rock, an unreachable guard reads as nothing at all.
    const boulder = climbBoulder(rocks, playGround, balance.villageLife.bankGame.climbableRockTop)
    if (!boulder) return null
    return {
      upstream: playRocks.upstream,
      downstream: playRocks.downstream,
      // The stone as the picture draws it, so the tapping child's hand is solved
      // against the flank the player sees (work-order 1065).
      flank: playRockFlank(playRocks),
      // The waterline straight out from the settlement's middle, which is what
      // the drawn river is: the call points at the water, not at a bank stop.
      water: { x: bank.nx * bank.distance, z: bank.nz * bank.distance },
      boulder,
      roam: { x: playGround.x, z: playGround.z, radius: playGround.radius },
    }
  }, [bank, playRocks, rocks, playGround])

  // A village always carries a play ground (`layout.ts` builds one for every
  // settlement of that kind); the fallback keeps a malformed layout from taking
  // the whole scene down, and the assert above is what reports it.
  const ground = playGround ?? {
    x: 0,
    z: 0,
    radius: balance.villageLife.tag.playRadius,
    clearance: 0,
    openness: 1,
    fabric: 1,
  }

  // Every spot this settlement hands out (point 509): what tells an inhabitant
  // standing at the middle of a village apart from one that was never placed —
  // a settlement whose own layout puts a figure at its origin is not reported.
  const placementAnchors = useMemo<PlaceSpot[]>(() => {
    const out: PlaceSpot[] = homes.map((h) => ({ x: h.x, z: h.z }))
    for (const [ax, az] of villageAdultStations(firePos)) out.push({ x: ax, z: az })
    for (const [ex, ez] of errands) out.push({ x: ex, z: ez })
    for (const [bx, bz] of buildings) out.push({ x: bx, z: bz })
    return out
  }, [homes, firePos, errands, buildings])
  useUnplacedInhabitantWatch(placeId, placementAnchors)

  if (kind === 'port') {
    return (
      <ColdCloaksContext.Provider value={cloaks}>
        <LimbDetailContext.Provider value={limbSegments}>
          <InhabitantBodiesContext.Provider value={inhabitantBodies}>
            <Porters seed={localSeed} stops={buildings} cloth={style.cloth} colliders={colliders} count={1 + size} />
            <Traders seed={localSeed} cloth={style.cloth} />
            <Talkers x={PORT_TALKERS[0]} z={PORT_TALKERS[1]} cloth={style.cloth} />
            <Walkers seed={localSeed} homes={homes} errands={errands} cloth={style.cloth} count={2 + size * 2} colliders={colliders} />
          </InhabitantBodiesContext.Provider>
        </LimbDetailContext.Provider>
      </ColdCloaksContext.Provider>
    )
  }
  return (
    <ColdCloaksContext.Provider value={cloaks}>
      <LimbDetailContext.Provider value={limbSegments}>
        <InhabitantBodiesContext.Provider value={inhabitantBodies}>
          <Cook x={firePos[0] + 1.2} z={firePos[1] + 1.0} cloth={style.cloth[0]} />
          <Weaver x={-8.5} z={-7} cloth={style.cloth[1 % style.cloth.length]} weave={style.bandColor} />
          <Kids
            childBodies={childBodies}
            x={ground.x}
            z={ground.z}
            playRadius={ground.radius}
            count={kidCount}
            seed={localSeed}
            cloth={style.cloth}
            colliders={colliders}
            radius={radius}
            stage={bankStage}
            bank={bank}
          />
          {/* The adults at their errands (point 483): the five landscape and
              action concepts, taught by what the villagers visibly go and do. */}
          <ErrandVillagers
            childBodies={childBodies}
            seed={localSeed}
            cloth={style.cloth}
            colliders={colliders}
            radius={radius}
            bank={bank}
            geography={workGeography}
            playGround={playGround}
            playRocks={playRocks}
            onDigProgress={onDigProgress}
            count={Math.max(1, Math.round(balance.villageLife.adultErrands.villagerCount * presence))}
          />
          <Goats seed={localSeed} count={pen ? 4 : 3} pen={pen} colliders={colliders} />
          <Walkers seed={localSeed} homes={homes} errands={errands} cloth={style.cloth} count={Math.max(1, Math.round(5 * presence))} colliders={colliders} />
          {/* Inhabitant/prop interactions (design.md §19). */}
          <FireTender x={firePos[0] - 1.3} z={firePos[1] - 0.7} cloth={style.cloth[2 % style.cloth.length]} />
          <Talkers x={VILLAGE_SPOTS.talkers[0]} z={VILLAGE_SPOTS.talkers[1]} cloth={style.cloth} />
          <Pounder x={VILLAGE_SPOTS.pounder[0]} z={VILLAGE_SPOTS.pounder[1]} cloth={style.cloth[0]} />
          <Drummer x={VILLAGE_SPOTS.drummer[0]} z={VILLAGE_SPOTS.drummer[1]} cloth={style.cloth[1 % style.cloth.length]} />
          <Well x={VILLAGE_SPOTS.well[0]} z={VILLAGE_SPOTS.well[1]} />
          {homes.length > 0 && (
            <TaskWalker
              home={homes[0]}
              target={[firePos[0] + 0.7, firePos[1] + 1.8]}
              cloth={style.cloth[0]}
              carry="bundle"
              colliders={colliders}
              startDelay={4}
            />
          )}
          {homes.length > 1 && (
            <TaskWalker
              home={homes[1]}
              target={[VILLAGE_SPOTS.well[0] - 1.1, VILLAGE_SPOTS.well[1]]}
              cloth={style.cloth[1 % style.cloth.length]}
              carry="jar"
              colliders={colliders}
              startDelay={9}
            />
          )}
        </InhabitantBodiesContext.Provider>
      </LimbDetailContext.Provider>
    </ColdCloaksContext.Provider>
  )
}
