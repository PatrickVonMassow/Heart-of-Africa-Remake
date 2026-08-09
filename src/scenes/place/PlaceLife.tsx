// Ambient life in places (design.md §19 "village and market life", §2 bustle):
// villagers cooking and weaving, playing children and goats in villages;
// porters and traders in the wealthier ports. Inhabitants interact with each
// other and with the props: pairs stand in conversation, a fire tender stokes
// the fire, food is fetched from the huts and cooked over it, grain is
// pounded in a mortar, a drummer plays, and water is carried from the well.
// Pure animation, no mechanics.

import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { mulberry32 } from '../../world/noise'
import {
  buildGoatParts,
  createFaunaMaterial,
  faceVelocity,
  gaitBodyLift,
  gaitCadence,
  gaitPhase,
  gaitRig,
  isStance,
  legSwingAngle,
} from '../../render/fauna'
import { FIGURE_LIMBS, TESSELLATION } from '../../render/figures'
import {
  GESTURE_KINDS,
  advanceGesture,
  aimAt,
  armAim,
  digPose,
  gesturePose,
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
import type { RegionPlaceStyle } from './regionStyles'
import { nudgeToFree, nudgeWhere, resolveMove, spawnPointFree, standingClear, tryNudgeToFree, WALKER_RADIUS, type Collider } from './collision'
import { insidePlace } from './boundary'
import type { PlaceRiverBank } from './riverBank'
import { buildPlaceNavGrid, findPlaceRoute, navClearBetween, type NavPoint } from './routing'
import { createTagGame, stepTagGame, type TagChild, type TagWorld } from './tagGame'
import {
  childSteer,
  createChildSpeech,
  stepChildSpeech,
  type SituationView,
  type SpokenSituation,
} from './childSituations'
import {
  clearErrand,
  createAdultErrands,
  errandOf,
  isDigging,
  noteErrandArrival,
  stepAdultErrands,
  type DigSite,
  type ErrandGeography,
  type ErrandPoint,
  type ErrandView,
  type SpokenErrand,
} from './adultErrands'
import { isWithinHearing } from '../../communication/heard'
import { phrasePlan, utterancePlan } from '../../communication/speaking'
import {
  drumMessagePlan,
  drumStrikeAt,
  drumStrikeProgress,
  type DrumMessagePlan,
} from '../../communication/drumMessage'
import { speechLabelSeconds } from '../../communication/speechLabel'
import { playSpeech } from '../../systems/ambience'
import { speakOverhead, speechClock } from './speechChannel'
import { placePlayerPosition } from './playerPosition'
import { animalAnchors, animalBodies, animalScene, stepAnimal, turnToward, ANIMAL_TURN_RATE } from './animalSpots'
import {
  addBodies,
  createBodies,
  createInhabitantSet,
  releaseBodies,
  separateBody,
  type InhabitantBody,
  type InhabitantSet,
} from './inhabitantBodies'
import {
  drumHandPose,
  drumHeadY,
  drumStroke,
  DRUMMER_LEAN,
  HIGH_DRUM,
  LOW_DRUM,
  type DrumGeometry,
} from './drummerPose'
import { childPlayGround, PORT_TALKERS, VILLAGE_SPOTS, villageAdultStations } from './lifeSpots'

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
  gait,
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
  /** Gait phase (rad) driving the leg swing — the caller accumulates the
   *  distance walked, because only it knows this figure's world scale. */
  gait?: RefObject<number>
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
  const arms = useRef<Array<THREE.Group | null>>([])
  const legPivots = useRef<Array<THREE.Group | null>>([])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    let shown = pose?.current ?? null
    if (!shown && gesture?.current) {
      gesture.current = advanceGesture(gesture.current, dt)
      shown = gesturePose(gesture.current)
    }
    if (shown) {
      const left = arms.current[0]
      const right = arms.current[1]
      if (left) left.rotation.set(shown.left.pitch, shown.left.yaw, shown.left.roll)
      if (right) right.rotation.set(shown.right.pitch, shown.right.yaw, shown.right.roll)
      const t = trunk.current
      // Lean tips the trunk forward about the hip (+x carries the top to +z, the
      // figure's front); the turn is the refusal's shake.
      if (t) t.rotation.set(shown.lean, shown.turn, 0)
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
          <mesh position={[0, bodyH + 0.18 - hipY, 0]} castShadow>
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
            ref={(el) => {
              arms.current[i] = el
              if (el) {
                el.rotation.order = 'YXZ'
                el.rotation.set(REST_POSE_ARMS[i].pitch, 0, REST_POSE_ARMS[i].roll)
              }
            }}
          >
            <mesh position={[0, -armLen * 0.5, 0]} castShadow>
              <cylinderGeometry args={[L.armRadius[0], L.armRadius[1], armLen, segments]} />
              <meshStandardMaterial color={skin} roughness={0.88} />
            </mesh>
            <mesh position={[0, -armLen, 0]} castShadow>
              <sphereGeometry args={[L.handRadius, ...TESSELLATION.figureHand]} />
              <meshStandardMaterial color={skin} roughness={0.85} />
            </mesh>
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
const KID_SCALE = 0.55

/**
 * Speaks one staged situation (point 481): the atom through the §13.4 hearing
 * curve, the reading over the speaker's head, and the gesture on its own arms,
 * aimed at the world point the situation named.
 *
 * The DISTANCE decides all three. What the player could not hear teaches him
 * nothing however plainly he saw the gesture, so the same range gate that
 * silences the voice keeps the utterance out of his memory and the note off the
 * speaker's head (docs/communication-poc-spec.md).
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
  playSpeech(utterancePlan(said.utterance, distance))
  if (isWithinHearing(distance)) {
    useGame.getState().hearUtterance(said.utterance)
    if (anchor) {
      speakOverhead(`kid-${said.speaker}`, [said.utterance], anchor, {
        seconds: speechLabelSeconds(1),
      })
    }
  }
  // The aim is taken in the speaker's OWN frame, so a child that turns takes it
  // with it; the shoulder is the child's, not a grown figure's.
  gesture.current = startGesture(said.gesture, {
    ...aimAt(
      { x: speaker.x, z: speaker.z, yaw: speaker.facing },
      said.aim,
      KID_SCALE * FIGURE_LIMBS.shoulderY,
    ),
    phase: said.speaker * 1.1, // no two children beat in lockstep
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
}) {
  const refs = useRef<Array<THREE.Group | null>>([])
  // The world leg length these children walk on, and the cadence it dictates.
  const legLength = FIGURE_LIMBS.hipY * KID_SCALE
  const cadence = useMemo(() => gaitCadence(legLength), [legLength])

  // The settlement as the chase sees it: ONE predicate for the colliders, the
  // fire ring (a collider like any other), the walkable rim and the PLAY GROUND
  // — so a child can never end a step where a walker may not stand, and never
  // wander out of its group into the adults' earshot (point 481.4).
  const world = useMemo<TagWorld>(() => {
    const rim = Math.max(1, radius - NPC_RADIUS * 2)
    const blocked = (px: number, pz: number) =>
      Math.hypot(px, pz) > rim ||
      Math.hypot(px - x, pz - z) > playRadius ||
      !standingClear(colliders, px, pz, NPC_RADIUS)
    return {
      radius: playRadius,
      centerX: x,
      centerZ: z,
      childRadius: NPC_RADIUS,
      blocked,
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
  }, [colliders, radius, x, z, playRadius])

  // The group, spawned on validated ground (point 155): a play spot covered by a
  // hut is nudged to the nearest free one before the first frame — INSIDE the
  // play ground, by the game's own predicate, for the same reason the escape is
  // — and the scheduler of what it SAYS (point 481) is built with it, because a
  // new group is a new scheduler: a second settlement must never inherit the
  // first one's turn or its half-finished errands.
  const { game, speech } = useMemo(() => {
    const rand = mulberry32((seed + 5171) >>> 0)
    const spots = Array.from({ length: count }, (_, i) => {
      const a = (i / Math.max(1, count)) * Math.PI * 2
      const spot = world.nudge(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4)
      return { x: spot.x, z: spot.z }
    })
    return {
      game: createTagGame(spots, rand, balance.villageLife.tag),
      speech: createChildSpeech(count, balance.villageLife.childSpeech),
    }
    // `world` carries the collider set, so it is the only dependency needed for it.
  }, [x, z, count, seed, world])

  // The view the situations read the live game through: built once and
  // refreshed each frame rather than allocated per frame.
  const speechRand = useMemo(() => mulberry32((seed + 7717) >>> 0), [seed])
  const view = useMemo<SituationView>(
    () => ({
      playing: false,
      chaser: -1,
      target: -1,
      immune: -1,
      children: game.children,
      ground: { x, z, radius: playRadius },
      // What THERE points at: the settlement's own middle, well outside the
      // play ground and plainly not a place anyone is being sent to.
      farMark: { x: 0, z: 0 },
    }),
    [game, x, z, playRadius],
  )
  // The body each child presents to every other inhabitant (point 578). The
  // chase collides with the huts and the fences but never with the other
  // children, which is why a converging chase used to leave three of them
  // standing inside one another.
  const bodySet = useContext(InhabitantBodiesContext)
  const bodies = useInhabitantBodies(count, { scale: KID_SCALE })

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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const cfg = balance.villageLife.childSpeech
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
    // THE BODIES (point 578), resolved where the chase left them and before
    // anything is drawn: a child's body is its own scale's, the push is damped
    // so a separated pair does not tremble, and it is far smaller than the catch
    // distance — the tag always wins over the separation.
    const sep = balance.villageLife.separation
    for (let i = 0; i < game.children.length; i++) {
      const c = game.children[i]
      const b = bodies[i]
      if (!b) continue
      b.x = c.x
      b.z = c.z
      separateBody(bodySet, b, dt, sep, world)
      c.x = b.x
      c.z = b.z
    }
    const said = stepChildSpeech(speech, view, dt, cfg, speechRand)
    if (said) speakSituation(said, game.children[said.speaker], refs.current[said.speaker], gestures.current[said.speaker])
    game.children.forEach((c, i) => {
      const g = refs.current[i]
      if (!g) return
      const phase = gaitPhase(c.walked, cadence)
      gaits.current[i].current = phase
      g.position.set(c.x, gaitBodyLift(phase, legLength), c.z)
      // The eased FACING, not the raw travel heading: the body turns into a new
      // direction rather than snapping about-face inside one frame.
      g.rotation.y = c.facing
      const pose = poses.current[i].current
      if (!pose) return
      // The chase's posture and the speaker's arms on ONE body: the gesture owns
      // the arms and the shake, the run owns the lean. Writing the pose (rather
      // than handing the Figure its gesture ref) is what lets the two combine —
      // a figure with a pose ignores its gesture, so the pose must carry it.
      const gesture = gestures.current[i]
      gesture.current = advanceGesture(gesture.current, dt)
      const shown = gesturePose(gesture.current)
      pose.left = shown.left
      pose.right = shown.right
      pose.turn = shown.turn
      pose.lean = c.lean + shown.lean
    })
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): the live game.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeTag = () => ({
      playing: game.playing,
      chaser: game.chaser,
      target: game.target,
      tags: game.tags,
      chaserFor: game.chaserFor,
      // The game's OWN clock: the verification samples an interval of GAME,
      // never a count of frames, which buy different amounts of it per machine.
      clock: game.clock,
      children: game.children.map((c) => ({
        x: c.x,
        z: c.z,
        heading: c.heading,
        reserve: c.reserve,
        effort: c.effort,
        press: c.press,
        pace: c.pace,
        pinned: c.pinned,
      })),
    })
    // What the group has SAID so far this visit (point 481), by situation — a
    // live check can read the coverage the pure tests pin.
    w.__placeChildSpeech = () => ({
      staged: { ...speech.staged },
      last: speech.last ? { ...speech.last } : null,
      ground: { x, z, radius: playRadius },
    })
    return () => {
      delete w.__placeTag
      delete w.__placeChildSpeech
    }
  }, [game, speech, x, z, playRadius])

  return (
    <>
      {game.children.map((_, i) => (
        <group
          key={i}
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
  // distance, held facing) so the swing rides distance and the body faces travel.
  const legRefs = useRef<Array<Array<THREE.Group | null>>>([])
  const gait = useRef<Array<{ x: number; z: number; dist: number; yaw: number }>>([])
  // Scratch vector for the DEV foot probe below — never allocated per frame.
  const footProbe = useMemo(() => new THREE.Vector3(), [])
  if (gait.current.length !== anchors.length) {
    gait.current = anchors.map((a) => ({ x: a.x, z: a.z, dist: 0, yaw: 0 }))
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
      // and drop the body onto the stance leg (point 300): the planted foot then
      // holds its ground spot while the goat walks over it, instead of skating.
      const phase = gaitPhase(s.dist, rig.cadence)
      g.position.set(px, gaitBodyLift(phase, rig.legLength), pz)
      g.rotation.y = s.yaw
      const legs = legRefs.current[i]
      if (legs) {
        for (let li = 0; li < parts.legs.length; li++) {
          const lg = legs[li]
          if (lg) lg.rotation.x = legSwingAngle(phase, parts.legs[li].phaseOffset)
        }
      }
      if (import.meta.env.DEV) {
        // The live no-skate probe (point 300) tracks one foot through its stance:
        // its world spot must hold while the body advances. Reported straight
        // from the rendered leg group, so the probe reads what is DRAWN. `yaw`
        // rides along because a goat on this wandering path also TURNS, and the
        // probe measures the foot's travel in the walker's own heading frame —
        // the rigid pivot of a turning body is not the gait's doing.
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
            stance: isStance(phase + parts.legs[0].phaseOffset),
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
      {anchors.map((_, i) => (
        <group
          key={i}
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
      const [px0, pz0] = resolveMove(colliders, x, z, NPC_RADIUS, [p.x, p.z])
      p.x = px0
      p.z = pz0
      const b = bodies[i]
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
      {routes.map((_, i) => (
        <group
          key={i}
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

/** Seconds of quiet between two gestures in the conversation. */
const TALKER_GESTURE_GAP = 1.6

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
 * Two inhabitants standing together in conversation, gesturing (point 479).
 *
 * The two take turns: one beckons, points at something in the settlement,
 * refuses, or waves a direction, while the other listens. THE GESTURE EXPLAINS
 * NOTHING — there is no label and no caption; it is the body half of an exchange
 * whose other half is whatever happens next, which is the rule this project set
 * for the whole communication PoC.
 *
 * This scheduler is the AMBIENT driver. The speaking layer (`src/communication/`)
 * is vocabulary and audio so far — no inhabitant utters anything in the scene
 * yet. When the teaching situations put words in a figure's mouth, they drive
 * the very same `gesture` refs through `startGesture`, so a figure saying COME
 * beckons in step — the coupling point is the ref, and nothing about the figure
 * has to change for it.
 */
function Talkers({ x, z, cloth }: { x: number; z: number; cloth: string[] }) {
  const a = useRef<THREE.Group>(null)
  const b = useRef<THREE.Group>(null)
  const gestureA = useRef<GestureState>(restGesture())
  const gestureB = useRef<GestureState>(restGesture())
  const schedule = useRef({ wait: 1.2, turn: 0, step: 0 })

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

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    // Slight turns toward each other, as before — the conversation's idle.
    if (a.current) {
      a.current.rotation.y = Math.PI / 2 + Math.sin(t * 1.15) * 0.18
      a.current.position.y = Math.max(0, Math.sin(t * 2.3)) * 0.03
    }
    if (b.current) {
      b.current.rotation.y = -Math.PI / 2 + Math.sin(t * 1.15 + Math.PI) * 0.18
      b.current.position.y = Math.max(0, Math.sin(t * 2.3 + Math.PI)) * 0.03
    }
    const s = schedule.current
    // Only schedule while BOTH are at rest: a gesture is never cut short by the
    // clock, and the pair never talks over each other.
    if (gestureA.current.kind !== null || gestureB.current.kind !== null) return
    s.wait -= dt
    if (s.wait > 0) return
    const kind = GESTURE_KINDS[s.step % GESTURE_KINDS.length]
    const who = s.turn
    const aim = talkerAim(stances, kind, who)
    const next = startGesture(kind, { ...aim, phase: who * 1.7 })
    if (who === 0) gestureA.current = next
    else gestureB.current = next
    s.step++
    s.turn = 1 - who
    s.wait = TALKER_GESTURE_GAP
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): the live gesture
  // state and the pose it draws, plus a way to hold one pose for a screenshot.
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
      // The scheduler already stands down while a gesture runs; this only resets
      // the quiet gap, so the ambient conversation resumes normally afterwards.
      schedule.current.wait = TALKER_GESTURE_GAP
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

/** The stroke each drum is beaten with, solved once from its own dimensions
 *  (`drummerPose.ts`): which hand, aimed where, between which elevations. */
const LOW_STROKE = drumStroke(LOW_DRUM)
const HIGH_STROKE = drumStroke(HIGH_DRUM)

/**
 * Drummer at his pair of drums — the audible village drums made visible, and
 * the voice the chief's message goes out on (design.md §13.4, point 486).
 *
 * The LARGE low drum speaks `ba` and stands to his RIGHT, the SMALL high one
 * speaks `BA` and stands to his LEFT — and neither side is stated twice: each
 * drum's stroke reads its hand off the drum's OWN placement (`drummerPose.ts`),
 * so the hand that falls is always the one standing over the drum that sounds,
 * and that drum's head dips under it. While no message is going out the two
 * hands keep the village's own idle beat half a beat apart, the large drum on
 * the strong beat and the small one on the lighter off-beat, as the ambient drum
 * bar sounds them.
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
  // The plan of the message currently going out, kept with the start it was
  // built for, so a re-sent message rebuilds it against the live balance values.
  const sending = useRef<{ startedAt: number; plan: DrumMessagePlan } | null>(null)
  useFrame(({ clock }) => {
    const p = pose.current
    if (!p) return
    const beating = useUi.getState().drumPerformance
    // Each hand's swing on its OWN drum: 0 is on the head, 1 the top of the lift.
    let lowSwing = 1
    let highSwing = 1
    if (beating) {
      if (sending.current?.startedAt !== beating.startedAt) {
        sending.current = { startedAt: beating.startedAt, plan: drumMessagePlan() }
      }
      // The wall clock, the one the performance and the scheduled audio run on.
      const elapsed = (speechClock() * 1000 - beating.startedAt) / 1000
      const strike = drumStrikeAt(sending.current.plan, elapsed)
      // The hand falls at the beat and rises again through the strike's ring;
      // between two beats both hands wait raised over their own drum.
      const swing = strike ? drumStrikeProgress(strike, elapsed) : 1
      if (strike?.drum === 'low') lowSwing = swing
      else if (strike?.drum === 'high') highSwing = swing
    } else {
      sending.current = null
      // The idle village beat (design.md §19): the two hands half a beat apart,
      // each on its OWN drum and each dipping the head it strikes — the large
      // drum on the strong beat, the small one on the lighter off-beat, as the
      // ambient drum bar sounds them.
      const t = clock.elapsedTime * 4.2
      lowSwing = Math.abs(Math.sin(t))
      highSwing = Math.abs(Math.cos(t))
    }
    Object.assign(p[LOW_STROKE.side], drumHandPose(LOW_STROKE, lowSwing))
    Object.assign(p[HIGH_STROKE.side], drumHandPose(HIGH_STROKE, highSwing))
    if (lowHead.current) lowHead.current.position.y = drumHeadY(LOW_DRUM, lowSwing)
    if (highHead.current) highHead.current.position.y = drumHeadY(HIGH_DRUM, highSwing)
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-x + 3.5, -z + 2.5), 0]}>
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
      const [nx, nz] = resolveMove(colliders, s.x + (dx / d) * step, s.z + (dz / d) * step, NPC_RADIUS, [s.x, s.z])
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
      <group ref={standing} visible={false}>
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
      <group ref={kneeling} visible={false}>
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
        // Invisible while at home; step out through the door when done.
        g.visible = false
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
        // waypoint if blocked for too long (design.md §2 collision).
        const [nx, nz] = resolveMove(colliders, s.x + (dx / d) * step, s.z + (dz / d) * step, NPC_RADIUS, [s.x, s.z])
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
const ERRAND_ARRIVE_RADIUS = 1.1

/** How near a waypoint of a route counts as passed. Wider than a stride, so a
 *  figure sliding along a wall beside the waypoint still ticks it off instead of
 *  circling it. */
const WAYPOINT_RADIUS = 1.2

/**
 * The adults at their errands (work-order point 483), and the five concepts they
 * teach at them: RIVER, UPSTREAM, DOWNSTREAM, BIG_ROCK and DIG. The catalogue
 * and the scheduler are the pure `adultErrands` module; here it is given the
 * live village, and what comes back is spoken (through the §13.4 hearing curve),
 * shown over the speaker's head, gestured with the point-479 arms and CARRIED
 * OUT — the villager walks to the bank, up or down the stretch, over to the
 * stone or onto a patch of ground and digs it.
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
  count,
}: {
  seed: number
  cloth: string[]
  colliders: Collider[]
  radius: number
  /** The settlement's river bank (work-order 482) — part of the walkable shape
   *  these villagers keep to, since the errands send them out onto it. */
  bank: PlaceRiverBank | null
  geography: ErrandGeography
  count: number
}) {
  const refs = useRef<Array<THREE.Group | null>>([])
  const rim = Math.max(1, radius - NPC_RADIUS * 2)

  /** Every place a villager may stroll to of its own accord. */
  const namedPlaces = useMemo(() => {
    const out: ErrandPoint[] = []
    for (const p of [geography.bank, geography.upstream, geography.downstream, geography.stone]) {
      if (p) out.push(p)
    }
    for (const s of geography.digSites) out.push({ x: s.x, z: s.z })
    return out
  }, [geography])

  const { people, errands, rand } = useMemo(() => {
    const r = mulberry32((seed + 30011) >>> 0)
    const spawn = Array.from({ length: count }, (_, i) => {
      const a = (i / Math.max(1, count)) * Math.PI * 2
      const [x, z] = nudgeToFree(colliders, Math.cos(a) * 7, Math.sin(a) * 7, NPC_RADIUS)
      return { x, z, free: true }
    })
    return {
      people: spawn,
      errands: createAdultErrands(count, balance.villageLife.adultErrands),
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
  const yaws = useRef<number[]>([])
  if (yaws.current.length !== count) {
    yaws.current = Array.from({ length: count }, (_, i) => yaws.current[i] ?? 0)
  }

  const view = useMemo<ErrandView>(() => ({ villagers: people, geography }), [people, geography])

  // The body each villager presents to every other inhabitant (point 578): two
  // of them sent to neighbouring spots used to end up in one body.
  const bodySet = useContext(InhabitantBodiesContext)
  const bodies = useInhabitantBodies(count)
  const separationWorld = useMemo(
    () => ({
      blocked: (px: number, pz: number) =>
        !insidePlace({ radius, bank }, px, pz, NPC_RADIUS * 2) ||
        !standingClear(colliders, px, pz, NPC_RADIUS),
      nudge: (px: number, pz: number) => {
        const free = tryNudgeToFree(colliders, px, pz, NPC_RADIUS)
        return { x: free.pos[0], z: free.pos[1], found: free.found }
      },
    }),
    [colliders, radius, bank],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const cfg = balance.villageLife.adultErrands
    for (let i = 0; i < people.length; i++) {
      const me = people[i]
      const task = errandOf(errands, i)
      me.free = !task
      const state = idle.current[i]
      // Where this villager is headed: what it was told, or its own stroll.
      let goal: ErrandPoint | null = null
      if (task && !(task.arrived && task.kind === 'dig')) {
        goal = task.arrived ? null : { x: task.x, z: task.z }
      } else if (!task) {
        if (state.pause > 0) {
          state.pause -= dt
        } else if (!state.target) {
          // Half the strolls go to a place an errand can be spoken about, so the
          // situations that need someone standing there keep coming round.
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
          if (task) noteErrandArrival(errands, i, cfg)
          else {
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
          const wantX = me.x + (ax / ad) * step
          const wantZ = me.z + (az / ad) * step
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
              } else if (task) clearErrand(errands, i)
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

      // The pose: digging wins over everything, then the gesture, then rest.
      const pose = poses.current[i].current
      const gesture = gestures.current[i]
      gesture.current = advanceGesture(gesture.current, dt)
      if (isDigging(errands, i)) {
        state.dug += dt
        const dig = digPose(state.dug, i * 0.37)
        if (pose) {
          pose.left = dig.left
          pose.right = dig.right
          pose.lean = dig.lean
          pose.turn = dig.turn
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

      const g = refs.current[i]
      if (g) {
        // The same walking bob the other inhabitants ride, off the distance this
        // villager has actually covered rather than off a wall clock.
        g.position.set(me.x, Math.abs(Math.sin(state.walked * 3.4 + i * 2)) * 0.05, me.z)
        g.rotation.y = yaws.current[i]
      }
    }

    const said = stepAdultErrands(errands, view, dt, cfg, rand)
    if (said) {
      // The speaker turns to what it is talking about before it says it: an
      // errand pointed out over a shoulder reads as nothing at all.
      const speaker = people[said.speaker]
      if (speaker) {
        yaws.current[said.speaker] = Math.atan2(said.aim.x - speaker.x, said.aim.z - speaker.z)
        speakErrand(said, speaker, yaws.current[said.speaker], refs.current[said.speaker], gestures.current[said.speaker])
      }
    }
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): what the adults
  // have said this visit, and what each of them is doing about it.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeErrands = () => ({
      staged: { ...errands.staged },
      last: errands.last ? { ...errands.last } : null,
      // How long the village has been quiet — what point 586 is measured by,
      // and what the `errands-silent` assert fires on.
      silence: errands.silence,
      geography: {
        bank: geography.bank,
        upstream: geography.upstream,
        downstream: geography.downstream,
        stone: geography.stone,
        digSites: geography.digSites.map((s) => ({ ...s })),
      },
      villagers: people.map((p, i) => {
        const task = errandOf(errands, i)
        return {
          x: p.x,
          z: p.z,
          free: p.free,
          digging: isDigging(errands, i),
          errand: task
            ? { situation: task.situation, kind: task.kind, place: task.place, x: task.x, z: task.z, arrived: task.arrived }
            : null,
        }
      }),
    })
    return () => {
      delete w.__placeErrands
    }
  }, [errands, people, geography])

  return (
    <>
      {people.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={cloth[i % cloth.length]} pose={poses.current[i]} />
        </group>
      ))}
    </>
  )
}

/**
 * Speaks one staged errand (point 483): the PHRASE through the §13.4 hearing
 * curve, one reading per atom over the speaker's head, and the gesture on its
 * own arms, aimed at the world point the errand named.
 *
 * The DISTANCE decides all three, exactly as it does for the children: what the
 * player could not hear teaches him nothing however plainly he saw the walk.
 */
function speakErrand(
  said: SpokenErrand,
  speaker: { x: number; z: number },
  yaw: number,
  anchor: THREE.Group | null,
  gesture: RefObject<GestureState> | undefined,
): void {
  if (!gesture) return
  const distance = placePlayerPosition.active
    ? Math.hypot(speaker.x - placePlayerPosition.x, speaker.z - placePlayerPosition.z)
    : Infinity
  playSpeech(phrasePlan(said.utterances, distance))
  if (isWithinHearing(distance)) {
    const store = useGame.getState()
    // Each atom of the phrase is observed on its own, in order.
    for (const atom of said.utterances) store.hearUtterance(atom)
    if (anchor) {
      speakOverhead(`villager-${said.speaker}`, said.utterances, anchor, {
        seconds: speechLabelSeconds(said.utterances.length),
      })
    }
  }
  gesture.current = startGesture(said.gesture, {
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

export function PlaceLife({
  kind,
  size = 1,
  seed,
  placeId,
  style,
  buildings,
  fabric,
  firePos,
  homes,
  errands,
  teachingStone,
  digSites,
  bank,
  pen,
  colliders,
  radius,
}: {
  kind: 'port' | 'village'
  /** Settlement size (design.md §4.1): big cities show more bustle. */
  size?: number
  seed: number
  placeId: string
  style: RegionPlaceStyle
  buildings: Array<[number, number]>
  /** The BUILT FABRIC: every dwelling and functional building of the settlement.
   *  What the children's play ground is kept against (point 524). */
  fabric: Array<[number, number]>
  firePos: [number, number]
  homes: HomeDef[]
  errands: Array<[number, number]>
  /** The teaching stone and the ground work the adults teach at (point 483). */
  teachingStone: { x: number; z: number } | null
  digSites: DigSite[]
  /** The walkable river bank, where the settlement stands on a river
   *  (work-order 482): what the RIVER/UPSTREAM/DOWNSTREAM errands are about. */
  bank: PlaceRiverBank | null
  pen: PenDef | null
  colliders: Collider[]
  /** The settlement's walkable radius — the children's play area (point 480). */
  radius: number
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

  // The places the adults' errands are about (point 483). Every one of them is
  // the layout's own — the bank and its two stretches as much as the stone and
  // the ground work — so a villager is sent to exactly what the scene draws. A
  // settlement with no river simply carries no bank, and the scheduler then
  // stages only the errands it CAN show rather than pointing at water that is
  // not there.
  const errandGeography = useMemo<ErrandGeography>(
    () => ({
      bank: bank ? { x: bank.bank.x, z: bank.bank.z } : null,
      upstream: bank ? { x: bank.upstream.x, z: bank.upstream.z } : null,
      downstream: bank ? { x: bank.downstream.x, z: bank.downstream.z } : null,
      stone: teachingStone ? { x: teachingStone.x, z: teachingStone.z } : null,
      digSites,
    }),
    [bank, teachingStone, digSites],
  )

  // WHERE they play: far enough from every adult vignette that the §13.4
  // hearing range separates the two groups (point 481.4) and against the
  // village's own walls, so the chase is watched with the settlement behind it
  // (point 524). The play radius is read here rather than inside the memo, so a
  // debug edit of it (§21) re-derives the ground while the game runs — the
  // balanceVersion subscription is what brings the edit here at all.
  useGame((s) => s.balanceVersion)
  const wantPlayRadius = balance.villageLife.tag.playRadius
  const playGround = useMemo(
    () =>
      childPlayGround(
        villageAdultStations(firePos),
        Math.max(1, radius - NPC_RADIUS * 2),
        wantPlayRadius,
        balance.communication.hearingRadius,
        { free: (px, pz) => standingClear(colliders, px, pz, NPC_RADIUS), fabric },
      ),
    [firePos, radius, colliders, fabric, wantPlayRadius],
  )
  // Point 524.2: a ground that had to give up its separation leaves two teaching
  // voices inside one earshot. Nothing in the shipped villages reaches this, so
  // it is armed as an assert rather than answered by a second mechanism.
  devAssert(
    kind !== 'village' || playGround.clearance >= balance.communication.hearingRadius,
    'tag-play-ground-unseparated',
    () =>
      `${placeId}: the play ground clears the adults by only ${playGround.clearance.toFixed(1)} m ` +
      `(fabric ${playGround.fabric.toFixed(2)}) — the two teaching voices need another means of being told apart`,
  )

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
            x={playGround.x}
            z={playGround.z}
            playRadius={playGround.radius}
            count={kidCount}
            seed={localSeed}
            cloth={style.cloth}
            colliders={colliders}
            radius={radius}
          />
          {/* The adults at their errands (point 483): the five landscape and
              action concepts, taught by what the villagers visibly go and do. */}
          <ErrandVillagers
            seed={localSeed}
            cloth={style.cloth}
            colliders={colliders}
            radius={radius}
            bank={bank}
            geography={errandGeography}
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
