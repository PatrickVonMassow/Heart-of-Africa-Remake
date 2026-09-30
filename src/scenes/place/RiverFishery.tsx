// THE FISHERMEN OF A RIVERSIDE VILLAGE, DRAWN (work-order 1245, design.md
// §13.4): the two men in their dugout with the drift net, the catch, the two
// woven baskets, and the fishers' own fire by the landing with its carrier,
// griller, smoking rack and eater. The logic is `villagerCanoe.ts`,
// `fishBaskets.ts` and `fishFire.ts`; this draws what they decide and speaks
// the net man's two words through the same §13.4 path as every village voice:
// the atom through the hearing curve at the CALL register, the reading over
// his head, and his arm pointing the way — one decision by distance.

import { useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { useGame } from '../../state/store'
import { FIGURE_LIMBS } from '../../render/figures'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { buildFishGeometry, FISH_TONES } from '../../render/fishMesh'
import {
  advanceGesture,
  aimAt,
  armAim,
  gesturePose,
  isGesturing,
  REST_POSE,
  restGesture,
  type FigurePose,
  type GestureState,
} from '../../render/gesture'
import { gaitCadence, gaitPhase } from '../../render/fauna'
import { gestureIfHeard, speechReach } from '../../communication/spokenGesture'
import { conceptSpeech, instructionDelay, registerOptions } from '../../communication/speaking'
import { speechLabelSeconds } from '../../communication/speechLabel'
import { playSpeech } from '../../systems/ambience'
import { markActor } from '../actorLabelSource'
import { usePlaceGround } from './PlaceGroundContext'
import { Figure } from './placeFigure'
import { HEAD_CARRY_POSE, SpeechFloorContext, useStandingBody } from './placeFigureContext'
import { carrierWalkPose, copyPose, ownPose, reachPose } from './fisheryPoses'
import { placePlayerPosition } from './playerPosition'
import { speakOverhead } from './speechChannel'
import { speechBearing } from './speechBearing'
import { BANK_WATER_DROP, type PlaceRiverBank } from './riverBank'
import { basketRingViolation, type BasketRing, type FishBasket } from './fishBaskets'
import {
  biteLift,
  createFishFire,
  createFisheryRing,
  fisherySites,
  stepFishFire,
  type FishFireState,
  type FisherySites,
} from './fishFire'
import {
  CANOE_NETMAN_FORE,
  canoeCycleSeconds,
  canoeLane,
  createCanoe,
  netFloats,
  netHand,
  stepCanoe,
  unloadSeconds,
  yawOf,
  type CanoeLane,
  type CanoeState,
  type PaddlerAction,
} from './villagerCanoe'
import { devAssert } from '../../systems/devAssert'

/** The speech-label id of the net man's words (the dugout's, as before). */
export const CANOE_SPEAKER_ID = 'village-canoe'
/** How high the kneeling men sit over the water surface, in metres. */
const CANOE_SEAT_Y = 0.1
/** The hull's own rise over the water and its depth under the gunwale. */
const CANOE_FREEBOARD = 0.18
const CANOE_DEPTH = 0.28
/** The hull fish lie this high over the hull's water line. */
const HULL_FLOOR_Y = 0.04
/** A woven basket: its radius at the rim and its height. */
const BASKET_R = 0.26
const BASKET_H = 0.34
/** The rope's own axis and a scratch direction for orienting it. */
const ROPE_UP = new THREE.Vector3(0, 1, 0)
const ROPE_DIR = new THREE.Vector3()
/** How long a fish hangs in the net at the gunwale as it comes up. */
const FISH_IN_NET_SECONDS = 1.4

// --- Poses -------------------------------------------------------------------

/**
 * THE PADDLE STROKE, as an arm pose. The lower hand (the figure's +x arm, which
 * carries the paddle) reaches forward and down, pulls back along the hull, and
 * lifts clear for the recovery; the upper hand rides high across the chest.
 * `amp` scales the stroke: 1 for hard strokes, less to hold the boat.
 */
function paddlePose(u: number, amp = 1): FigurePose {
  const f = u - Math.floor(u)
  const power = f < 0.62
  const t = power ? f / 0.62 : (f - 0.62) / 0.38
  const bearing = power ? 0.35 + amp * t : 0.35 + amp * (1 - t)
  const elevation = power ? -0.45 - 0.2 * amp * Math.sin(Math.PI * t) : -0.25 + 0.1 * Math.sin(Math.PI * t)
  return {
    left: armAim(bearing, elevation),
    right: armAim(0.35 + 0.35 * amp * (power ? t : 1 - t), 0.15),
    lean: 0.1 + 0.08 * amp + (power ? 0.12 * amp * Math.sin(Math.PI * t) : 0),
    turn: 0.15 * amp * (power ? t : 1 - t),
  }
}

/** The bow swung out: a wide draw stroke far out on the paddle side. */
function swingPose(u: number): FigurePose {
  const t = (u - Math.floor(u))
  return {
    left: armAim(1.45 - 0.8 * Math.sin(Math.PI * t), -0.35),
    right: armAim(0.9, 0.05),
    lean: 0.22,
    turn: 0.35,
  }
}

/** Steering only: the paddle trailed aft as a rudder, a small correction now and then. */
function steerPose(u: number): FigurePose {
  const s = Math.sin(u * Math.PI * 2)
  return {
    left: armAim(2.2 + 0.12 * s, -0.55),
    right: armAim(1.6, -0.2),
    lean: 0.05,
    turn: 0.45 + 0.05 * s,
  }
}

/** Hauling hand over hand toward `bearing` (the river side, in his frame). */
function haulPose(u: number, bearing: number): FigurePose {
  const s = Math.sin(u * Math.PI * 2)
  const b = Math.max(-1.2, Math.min(1.2, bearing))
  return {
    left: armAim(b + 0.25, -0.35 + 0.35 * s),
    right: armAim(b - 0.25, -0.35 - 0.35 * s),
    lean: 0.28 + 0.08 * s,
    turn: b * 0.4,
  }
}

/** The paddler handing a fish forward out of the hull. */
function handPose(t: number): FigurePose {
  const f = (t / balance.villageLife.canoe.fillSecondsPerFish) % 1
  const up = Math.sin(Math.PI * f)
  return {
    left: armAim(0.15, -1.0 + 1.0 * up),
    right: armAim(-0.15, -0.9 + 0.6 * up),
    lean: 0.4 - 0.25 * up,
    turn: 0,
  }
}

/** A bearing in a figure's own frame (0 ahead, positive to its left). */
function bearingIn(figure: { x: number; z: number; yaw: number }, to: { x: number; z: number }): number {
  const dx = to.x - figure.x
  const dz = to.z - figure.z
  const c = Math.cos(figure.yaw)
  const s = Math.sin(figure.yaw)
  return Math.atan2(dx * c - dz * s, dx * s + dz * c)
}

// --- Props -------------------------------------------------------------------

/** A single-blade paddle, held in the lower hand and running on past it. */
function CanoePaddle() {
  return (
    <group name="village-canoe-paddle">
      <mesh position={[0, -0.25, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 1.3, 6]} />
        <meshStandardMaterial color="#7a5a36" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.98, 0]} castShadow>
        <boxGeometry args={[0.16, 0.42, 0.025]} />
        <meshStandardMaterial color="#6a4c2c" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A woven basket: open body, darker rim and two woven bands. */
function WovenBasket({ name, fishRef, fishGeometry, fishMaterial }: {
  name: string
  fishRef: (i: number, el: THREE.Mesh | null) => void
  fishGeometry: THREE.BufferGeometry
  fishMaterial: THREE.Material
}) {
  const cap = balance.villageLife.canoe.catchMax
  return (
    <group name={name}>
      <mesh position={[0, BASKET_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[BASKET_R, BASKET_R * 0.78, BASKET_H, 14, 1, true]} />
        <meshStandardMaterial color="#b08a4e" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BASKET_R * 0.78, 14]} />
        <meshStandardMaterial color="#8a6a38" roughness={1} />
      </mesh>
      {[0.3, 0.65, 1].map((h, i) => (
        <mesh key={i} position={[0, BASKET_H * h, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[BASKET_R * (0.78 + 0.22 * h), i === 2 ? 0.02 : 0.012, 5, 16]} />
          <meshStandardMaterial color="#6e5230" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: cap }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => fishRef(i, el)}
          geometry={fishGeometry}
          material={fishMaterial}
          visible={false}
          castShadow
        />
      ))}
    </group>
  )
}

/** Where fish `i` of `n` lies in a basket's heap (local), and its yaw. */
function basketFishSpot(i: number): { x: number; y: number; z: number; yaw: number; roll: number } {
  const a = i * 2.4
  const r = 0.07 + 0.05 * (i % 3)
  return { x: Math.cos(a) * r, y: BASKET_H * 0.55 + 0.035 * Math.floor(i / 3), z: Math.sin(a) * r, yaw: a + 1.2, roll: Math.PI / 2 }
}

/** Fish `i`'s length, fixed per fish from its index. */
function fishLength(i: number): number {
  const c = balance.villageLife.canoe
  const h = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1
  return c.fishLengthMin + (c.fishLengthMax - c.fishLengthMin) * h
}

// --- The dugout ----------------------------------------------------------------

/**
 * THE FISHERMEN AT A RIVERSIDE VILLAGE (work-order 1245). One component for the
 * boat and the fire, because the two baskets pass between them every round.
 */
export function RiverFishery({ bank, cloth, seed }: { bank: PlaceRiverBank; cloth: readonly string[]; seed: number }) {
  const groundHeight = usePlaceGround()
  const camera = useThree((state) => state.camera)
  const floor = useContext(SpeechFloorContext)
  const cfg = balance.villageLife.canoe
  const fireCfg = balance.villageLife.fishFire
  const lane = useMemo(() => canoeLane(bank, cfg), [bank, cfg])
  const sites = useMemo(() => fisherySites(bank, lane, cfg.laneEnd, fireCfg), [bank, lane, cfg.laneEnd, fireCfg])
  const rand = useMemo(() => mulberry32((seed ^ 0x6d2b79f5) >>> 0), [seed])
  const ring = useMemo<BasketRing>(() => createFisheryRing(fireCfg), [fireCfg])
  const canoe = useMemo(() => createCanoe(lane, cfg), [lane, cfg])
  const round = useMemo(() => canoeCycleSeconds(cfg), [cfg])
  const fire = useMemo<FishFireState>(() => {
    // The carrier is due back as the boat sets its first full basket down.
    const span = cfg.laneEnd - cfg.laneStart
    const first = span / cfg.upstreamSpeed + 2.2 + cfg.turnSeconds + span / cfg.downstreamSpeed + cfg.haulSeconds +
      cfg.landSeconds + unloadSeconds((cfg.catchMin + cfg.catchMax) / 2, cfg)
    return createFishFire(sites, ring, first, fireCfg, rand)
  }, [sites, ring, cfg, fireCfg, rand])
  const fishGeometry = useMemo(() => buildFishGeometry(), [])
  const materials = useMemo(
    () => ({
      fresh: new THREE.MeshStandardMaterial({ color: FISH_TONES.fresh, metalness: 0.3, roughness: 0.22, emissive: '#56646c', side: THREE.DoubleSide }),
      gutted: new THREE.MeshStandardMaterial({ color: FISH_TONES.gutted, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide }),
      grilled: new THREE.MeshStandardMaterial({ color: FISH_TONES.grilled, metalness: 0.05, roughness: 0.8, side: THREE.DoubleSide }),
      smoked: new THREE.MeshStandardMaterial({ color: FISH_TONES.smoked, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide }),
      float: new THREE.MeshStandardMaterial({ color: '#e2cf92', roughness: 0.7 }),
      rope: new THREE.MeshStandardMaterial({ color: '#8a7350', roughness: 1 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      fishGeometry.dispose()
      for (const m of Object.values(materials)) m.dispose()
    },
    [fishGeometry, materials],
  )

  const hull = useRef<THREE.Group>(null)
  const paddlerG = useRef<THREE.Group>(null)
  const paddle = useRef<THREE.Group>(null)
  const paddlerPose = useRef<FigurePose | null>(paddlePose(0))
  const paddlerLimbs = useRef<FigureLimbs | null>(null)
  const netSeat = useRef<THREE.Group>(null)
  const netSeatPose = useRef<FigurePose | null>({ ...REST_POSE })
  const netSeatLimbs = useRef<FigureLimbs | null>(null)
  const netShore = useRef<THREE.Group>(null)
  const netShorePose = useRef<FigurePose | null>({ ...REST_POSE })
  const netShoreLimbs = useRef<FigureLimbs | null>(null)
  const netShoreSquat = useRef(1)
  const gesture = useRef<GestureState>(restGesture())
  const foldedNet = useRef<THREE.Mesh>(null)
  const floats = useRef<Array<THREE.Mesh | null>>([])
  const ropes = useRef<Array<THREE.Mesh | null>>([])
  /** When each fish of this haul came up over the gunwale (scene seconds). */
  const landedAt = useRef<number[]>([])
  const lastLanded = useRef(0)
  const hullFish = useRef<Array<THREE.Mesh | null>>([])
  const basketGroups = useRef<Array<THREE.Group | null>>([])
  const basketFish = useRef<Array<Array<THREE.Mesh | null>>>([[], []])

  // The fire's people.
  const carrierWalk = useRef<THREE.Group>(null)
  const carrierWalkPoseRef = useRef<FigurePose | null>(ownPose(HEAD_CARRY_POSE.current))
  const carrierWalkLimbs = useRef<FigureLimbs | null>(null)
  const carrierGait = useRef(0)
  const carrierKneel = useRef<THREE.Group>(null)
  const carrierKneelPose = useRef<FigurePose | null>({ ...REST_POSE })
  const carrierKneelLimbs = useRef<FigureLimbs | null>(null)
  const gutFish = useRef<THREE.Mesh>(null)
  const grillerPose = useRef<FigurePose | null>({ ...REST_POSE })
  const grillerLimbs = useRef<FigureLimbs | null>(null)
  const eaterG = useRef<THREE.Group>(null)
  const eaterPose = useRef<FigurePose | null>({ ...REST_POSE })
  const eaterLimbs = useRef<FigureLimbs | null>(null)
  const eaterGait = useRef(0)
  const eaterFish = useRef<THREE.Group>(null)
  const boardFish = useRef<Array<THREE.Mesh | null>>([])
  const grillFish = useRef<Array<THREE.Mesh | null>>([])
  const rackFish = useRef<Array<THREE.Mesh | null>>([])
  const storeFish = useRef<Array<THREE.Mesh | null>>([])
  const flame = useRef<THREE.Mesh>(null)
  const cadence = useMemo(() => gaitCadence(FIGURE_LIMBS.hipY), [])
  // The griller kneels at his fire: a body the passers-by go round.
  useStandingBody(sites.griller.x, sites.griller.z)

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const nm = canoe.netMan
    const sources = () => [{ x: nm.x, z: nm.z, register: 'call' as const }]
    const said = stepCanoe(
      canoe,
      lane,
      ring,
      {
        say: (word) => {
          const game = useGame.getState()
          // Direction words follow the listener's first ROCK hearing, as at the bank.
          if (!Object.hasOwn(game.communication.heard, game.vocabulary.ROCK)) return 'silent'
          if (!floor) return 'said'
          return floor.request({
            situation: canoe,
            name: 'fishers call',
            word,
            source: { x: nm.x, z: nm.z, register: 'call' },
            sources,
            step: dt,
            ends: true,
            actAfter: instructionDelay(word, game.vocabulary),
          })
            ? 'said'
            : 'held'
        },
        drop: () => floor?.release(canoe),
        obeyDelay: (word) => instructionDelay(word, useGame.getState().vocabulary),
      },
      dt,
      cfg,
      rand,
    )
    stepFishFire(fire, sites, ring, dt, round, fireCfg, rand)
    devAssert(basketRingViolation(ring) === null, 'fish-basket-ring', () => `fish baskets: ${basketRingViolation(ring)}`)

    // THE HULL AND THE MEN.
    if (hull.current) {
      hull.current.position.set(canoe.x, -BANK_WATER_DROP, canoe.z)
      hull.current.rotation.y = canoe.yaw
    }
    const p = canoe.paddler
    if (paddlerG.current) {
      paddlerG.current.position.set(p.x, -BANK_WATER_DROP + CANOE_SEAT_Y, p.z)
      paddlerG.current.rotation.y = p.yaw
    }
    if (netSeat.current) {
      netSeat.current.visible = nm.inBoat
      netSeat.current.position.set(nm.x, -BANK_WATER_DROP + CANOE_SEAT_Y, nm.z)
      netSeat.current.rotation.y = nm.yaw
    }
    if (netShore.current) {
      netShore.current.visible = !nm.inBoat
      netShore.current.position.set(nm.x, groundHeight(nm.x, nm.z), nm.z)
      netShore.current.rotation.y = nm.yaw
      const squash = 1 - 0.28 * nm.reach
      netShore.current.scale.set(1, squash, 1)
      netShoreSquat.current = squash
    }

    if (said) {
      const at = { x: nm.x, z: nm.z }
      const distance = placePlayerPosition.active ? Math.hypot(at.x - placePlayerPosition.x, at.z - placePlayerPosition.z) : Infinity
      const options = registerOptions('call')
      const { utterance, plan } = conceptSpeech(said, useGame.getState().vocabulary, distance, { bearing: speechBearing(camera, at), ...options })
      playSpeech(plan)
      if (speechReach(distance, options.radius).audible) {
        useGame.getState().hearUtterance(utterance)
        if (netSeat.current) speakOverhead(CANOE_SPEAKER_ID, [utterance], netSeat.current, { floor: true, seconds: speechLabelSeconds(1), reach: options.radius })
      }
      // He points the way he tells the paddler to go, far along the lane.
      const way = said === 'UPSTREAM' ? -1 : 1
      const ahead = { x: at.x + lane.fx * way * 12, y: 1, z: at.z + lane.fz * way * 12 }
      gesture.current = gestureIfHeard(distance, 'point', aimAt({ x: at.x, z: at.z, yaw: nm.yaw }, ahead, CANOE_SEAT_Y + 0.55 * 0.75 * FIGURE_LIMBS.shoulderY), options.radius)
    }
    gesture.current = advanceGesture(gesture.current, dt)

    // The paddler's arms: the visible answer to each word.
    const pp = paddlerPose.current
    if (pp) {
      copyPose(pp, paddlerAction(canoe.paddlerAction, canoe, lane))
      applyFigurePose(paddlerLimbs.current, pp)
    }
    if (paddle.current) paddle.current.visible = canoe.paddlerAction !== 'haul' && canoe.paddlerAction !== 'hand'
    // The net man's.
    // The net is set on the hull's shore side.
    const netSide = bearingIn(nm, { x: nm.x - lane.nx, z: nm.z - lane.nz })
    const sp = netSeatPose.current
    if (sp) {
      const next = isGesturing(gesture.current)
        ? gesturePose(gesture.current)
        : nm.action === 'haul'
          ? haulPose(canoe.stroke, netSide)
          : nm.action === 'payOut' || nm.action === 'holdNet'
            ? { left: armAim(netSide + 0.15, -0.35 + (nm.action === 'payOut' ? 0.15 * Math.sin(t * 5) : 0)), right: armAim(netSide - 0.2, -0.55), lean: 0.2, turn: Math.max(-0.7, Math.min(0.7, netSide * 0.5)) }
            : { left: armAim(0.25, -1.0), right: armAim(-0.25, -1.0), lean: 0.12, turn: 0 }
      copyPose(sp, next)
      applyFigurePose(netSeatLimbs.current, sp)
    }
    const shore = netShorePose.current
    if (shore) {
      const holding = ring.baskets.some((b) => b.at === 'netman')
      copyPose(shore, holding && nm.reach < 0.05 ? { left: armAim(0.25, -0.55), right: armAim(-0.25, -0.55), lean: 0.12, turn: 0 } : reachPose(0, nm.reach))
      applyFigurePose(netShoreLimbs.current, shore)
    }

    // The net: folded in the hull, or a headline of floats on the water — and
    // while it is hauled, heaping up in the hull again as the line shortens.
    if (foldedNet.current) {
      const heap = canoe.phase === 'haul' ? Math.max(0.25, 1 - canoe.net) : canoe.net <= 1e-3 ? 1 : 0
      foldedNet.current.visible = heap > 0
      foldedNet.current.scale.set(0.24 * heap + 0.04, 0.1 * heap + 0.02, 0.32 * heap + 0.05)
    }
    const pts = netFloats(canoe, lane, cfg)
    const line = pts.length ? [netHand(canoe, lane, cfg), ...pts] : []
    const waterY = -BANK_WATER_DROP + 0.02
    floats.current.forEach((m, i) => {
      if (!m) return
      const q = pts[i]
      m.visible = !!q
      if (q) m.position.set(q.x, waterY + 0.015 * Math.sin(t * 2 + i), q.z)
    })
    // The headline rope between the floats, lying on the water.
    ropes.current.forEach((m, i) => {
      if (!m) return
      const a = line[i]
      const b = line[i + 1]
      m.visible = !!a && !!b
      if (!a || !b) return
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const rise = i === 0 ? 0.25 : 0
      m.position.set((a.x + b.x) / 2, waterY + rise / 2, (a.z + b.z) / 2)
      ROPE_DIR.set(b.x - a.x, -rise, b.z - a.z).normalize()
      m.quaternion.setFromUnitVectors(ROPE_UP, ROPE_DIR)
      m.scale.set(1, Math.hypot(len, rise), 1)
    })
    // Each fish as it comes up: held a moment in the net at the gunwale,
    // flapping, before it drops into the hull.
    if (canoe.landed < lastLanded.current) landedAt.current = []
    while (landedAt.current.length < canoe.landed) landedAt.current.push(t)
    lastLanded.current = canoe.landed

    // The catch in the hull: flapping as it comes up, and now and then after.
    hullFish.current.forEach((m, i) => {
      if (!m) return
      m.visible = i < canoe.inHull
      if (!m.visible) return
      const len = fishLength(i)
      const along = -1.0 + (i % 4) * 0.42
      const across = (i % 2 === 0 ? 1 : -1) * 0.09
      const lively = canoe.phase === 'haul' ? 1 : 0.35
      const flap = Math.sin(t * (9 + i) + i * 1.7) * lively * (Math.sin(t * 0.7 + i) > 0.2 ? 1 : 0.2)
      m.scale.setScalar(len)
      const came = landedAt.current[i]
      if (canoe.phase === 'haul' && came !== undefined) {
        // Still caught in the net as it comes over the shore-side gunwale:
        // hanging down the hull's side, head down, thrashing, until the haul
        // ends and the men shake them out into the hull.
        const shoreSide = Math.cos(canoe.yaw) * lane.nx - Math.sin(canoe.yaw) * lane.nz >= 0 ? -1 : 1
        const fresh = Math.max(0, 1 - (t - came) / FISH_IN_NET_SECONDS)
        m.position.set(shoreSide * (cfg.hullBeam / 2 + 0.07), HULL_FLOOR_Y + 0.02 + 0.2 * fresh, CANOE_NETMAN_FORE - 0.3 * i)
        m.rotation.set(-Math.PI / 2 + 0.35 * Math.sin(t * (10 + i) + i), 0.5 * Math.sin(t * (8 + i) + 2 * i), shoreSide * 0.25)
        return
      }
      // Heaped on the hull's floor: some on their side, some flipped up on
      // their bellies as they thrash — so the catch reads from the bank too.
      const upright = i % 2 === 1
      m.position.set(across, HULL_FLOOR_Y + (upright ? 0.07 : 0.03), along + 0.1 * (i >= 4 ? 1 : 0))
      m.rotation.set(0.12 * flap, 0.3 * (i % 3) + 0.25 * flap, (upright ? 0.15 : Math.PI / 2) + 0.35 * flap)
    })

    // THE TWO BASKETS, wherever the ring says they are.
    for (const b of ring.baskets) {
      const g = basketGroups.current[b.id]
      if (!g) continue
      placeBasket(g, b, ring, sites, canoe, fire, groundHeight)
      const fishMeshes = basketFish.current[b.id]
      fishMeshes.forEach((m, i) => {
        if (!m) return
        m.visible = i < b.fish
        if (!m.visible) return
        const spot = basketFishSpot(i)
        const alive = b.at !== 'fire'
        const flap = alive ? Math.sin(t * (8 + i) + i * 2.1) * (Math.sin(t * 0.9 + i * 1.3) > 0.3 ? 0.35 : 0.05) : 0
        m.scale.setScalar(fishLength(i + b.id * 11))
        m.position.set(spot.x, spot.y, spot.z)
        m.rotation.set(0, spot.yaw + flap, spot.roll + flap)
        m.material = alive ? materials.fresh : materials.gutted
      })
    }

    // THE CARRIER.
    const c = fire.carrier
    const kneeling = c.phase === 'gut'
    const moving = c.phase === 'toBank' || c.phase === 'toFire'
    carrierGait.current = moving ? gaitPhase(c.walked, cadence) : 0
    if (carrierWalk.current) {
      carrierWalk.current.visible = !kneeling
      carrierWalk.current.position.set(c.x, groundHeight(c.x, c.z), c.z)
      carrierWalk.current.rotation.y = c.yaw
    }
    const cw = carrierWalkPoseRef.current
    if (cw) {
      copyPose(cw, carrierWalkPose(c.phase, c.clock, fireCfg.liftSeconds))
      applyFigurePose(carrierWalkLimbs.current, cw)
    }
    if (carrierKneel.current) carrierKneel.current.visible = kneeling
    const ck = carrierKneelPose.current
    if (ck) {
      const cut = Math.sin(t * 7)
      copyPose(ck, { left: armAim(0.25, -0.75 + 0.18 * cut), right: armAim(-0.2, -0.7), lean: 0.35, turn: 0 })
      applyFigurePose(carrierKneelLimbs.current, ck)
    }
    if (gutFish.current) {
      const basket = ring.baskets.find((b) => b.at === 'fire')
      gutFish.current.visible = kneeling && !!basket && basket.fish > 0 && c.clock > fireCfg.liftSeconds
    }
    boardFish.current.forEach((m, i) => {
      if (m) m.visible = i < fire.board
    })

    // THE GRILLER, the grill and the rack.
    const gp = grillerPose.current
    if (gp) {
      const g = fire.griller
      const target = g.action === 'take' ? sites.board : g.action === 'lay' || g.action === 'pack' ? (g.action === 'pack' ? sites.storage : sites.rack) : sites.fire
      const b = bearingIn(sites.griller, target)
      const reach = g.action === 'tend' ? 0.25 + 0.08 * Math.sin(t * 1.6) : Math.sin(Math.PI * Math.min(1, g.clock / Math.max(0.1, fireCfg.takeSeconds)))
      copyPose(gp, reachPose(b, reach * 0.8))
      applyFigurePose(grillerLimbs.current, gp)
    }
    grillFish.current.forEach((m, i) => {
      if (!m) return
      const f = fire.grill[i]
      m.visible = !!f
      if (!f) return
      m.material = f.turned ? materials.grilled : materials.gutted
      m.rotation.set(0, Math.PI / 2, f.turned ? -Math.PI / 2 : Math.PI / 2)
    })
    rackFish.current.forEach((m, i) => {
      if (!m) return
      const age = fire.rack[i]
      m.visible = age !== undefined
      if (age !== undefined) m.material = age > 240 ? materials.smoked : materials.grilled
    })
    storeFish.current.forEach((m, i) => {
      if (m) m.visible = i < Math.min(fire.storage, storeFish.current.length)
    })
    if (flame.current) flame.current.scale.set(1, 0.8 + 0.25 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23.7), 1)

    // THE EATER.
    const e = fire.eater
    eaterGait.current = e.phase === 'toRack' || e.phase === 'back' ? gaitPhase(e.walked, cadence) : 0
    if (eaterG.current) {
      eaterG.current.position.set(e.x, groundHeight(e.x, e.z), e.z)
      eaterG.current.rotation.y = e.yaw
    }
    const ep = eaterPose.current
    if (ep) {
      const lift = biteLift(e, fireCfg)
      const next: FigurePose =
        e.phase === 'take'
          ? reachPose(0, 0.3 * Math.sin(Math.PI * Math.min(1, e.clock / fireCfg.takeSeconds)))
          : e.phase === 'eat'
            ? { left: armAim(0.35, -0.55 + 1.35 * lift), right: { ...REST_POSE.right }, lean: 0.04, turn: 0 }
            : { ...REST_POSE, left: { ...REST_POSE.left }, right: { ...REST_POSE.right } }
      copyPose(ep, next)
      applyFigurePose(eaterLimbs.current, ep)
    }
    if (eaterFish.current) {
      eaterFish.current.visible = e.fish > 0
      eaterFish.current.scale.set(1, 1, Math.max(0.15, e.fish))
    }
  })

  // Dev hooks for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeCanoe = () => ({
      phase: canoe.phase,
      clock: canoe.clock,
      s: canoe.s,
      x: canoe.x,
      z: canoe.z,
      yaw: canoe.yaw,
      calls: canoe.calls,
      lastCall: canoe.lastCall,
      word: canoe.word ? { ...canoe.word } : null,
      paddlerAction: canoe.paddlerAction,
      paddler: { ...canoe.paddler },
      netMan: { ...canoe.netMan },
      net: canoe.net,
      inHull: canoe.inHull,
      rounds: canoe.rounds,
      catch: canoe.catch,
      basketWait: canoe.basketWait,
      floats: netFloats(canoe, lane, cfg),
      lane: { ...lane, start: { ...lane.start }, end: { ...lane.end }, berth: { ...lane.berth } },
    })
    w.__placeFishFire = () => ({
      carrier: { ...fire.carrier, waits: [...fire.carrier.waits] },
      griller: { ...fire.griller },
      eater: { ...fire.eater },
      board: fire.board,
      grill: fire.grill.map((f) => ({ ...f })),
      rack: [...fire.rack],
      storage: fire.storage,
      baskets: ring.baskets.map((b) => ({ ...b })),
      sites,
    })
    return () => {
      delete w.__placeCanoe
      delete w.__placeFishFire
    }
  }, [canoe, fire, ring, lane, sites, cfg])

  const beam = cfg.hullBeam / 2
  const half = cfg.hullLength / 2
  const fireY = groundHeight(sites.fire.x, sites.fire.z)
  const rackY = groundHeight(sites.rack.x, sites.rack.z)
  const boardY = groundHeight(sites.board.x, sites.board.z)
  const storeY = groundHeight(sites.storage.x, sites.storage.z)
  const along = yawOf(bank.fx, bank.fz)
  // Born where the cycle puts them, never at the settlement origin (point 509).
  const born = useMemo(
    () => ({
      hull: [canoe.x, -BANK_WATER_DROP, canoe.z] as [number, number, number],
      paddler: [canoe.paddler.x, -BANK_WATER_DROP + CANOE_SEAT_Y, canoe.paddler.z] as [number, number, number],
      net: [canoe.netMan.x, -BANK_WATER_DROP + CANOE_SEAT_Y, canoe.netMan.z] as [number, number, number],
      carrier: [fire.carrier.x, 0, fire.carrier.z] as [number, number, number],
      eater: [fire.eater.x, 0, fire.eater.z] as [number, number, number],
    }),
    // Read once at birth; the frame loop owns the transforms afterwards.
    [canoe, fire],
  )
  const clothOf = (i: number) => cloth[i % cloth.length]
  return (
    <>
      <group ref={hull} name="village-canoe" position={born.hull} userData={markActor({ kind: 'canoe', height: 0.6 })}>
        {/* A dugout: one log, hollowed. */}
        <mesh position={[0, CANOE_FREEBOARD, 0]} scale={[beam, CANOE_DEPTH, half]} castShadow>
          <sphereGeometry args={[1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#6b4a2b" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, CANOE_FREEBOARD - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[beam * 0.82, half * 0.9, 1]}>
          <circleGeometry args={[1, 24]} />
          <meshStandardMaterial color="#3a2616" roughness={1} />
        </mesh>
        {/* The folded net before the net man: a dark heap of mesh and floats. */}
        <mesh ref={foldedNet} name="village-canoe-net-folded" position={[0, CANOE_FREEBOARD + 0.02, CANOE_NETMAN_FORE + 0.55]} scale={[0.22, 0.09, 0.3]} castShadow>
          <sphereGeometry args={[1, 10, 6]} />
          <meshStandardMaterial color="#4b4336" roughness={1} />
        </mesh>
        {/* Heaped high enough in the hollow to show over the gunwale (the
            first picture check read them as white specks). */}
        <group position={[0, CANOE_FREEBOARD - HULL_FLOOR_Y + 0.02, 0]}>
          {Array.from({ length: cfg.catchMax }, (_, i) => (
            <mesh
              key={i}
              name="village-canoe-fish"
              ref={(el) => {
                hullFish.current[i] = el
              }}
              geometry={fishGeometry}
              material={materials.fresh}
              visible={false}
              castShadow
            />
          ))}
        </group>
      </group>
      {Array.from({ length: Math.round(cfg.netFloats) }, (_, i) => (
        <mesh
          key={i}
          name="village-canoe-net-float"
          ref={(el) => {
            floats.current[i] = el
          }}
          material={materials.float}
          visible={false}
          castShadow
        >
          {/* A gourd float, ~12 cm across. */}
          <sphereGeometry args={[0.06, 10, 8]} />
        </mesh>
      ))}
      {Array.from({ length: Math.round(cfg.netFloats) }, (_, i) => (
        <mesh
          key={i}
          name="village-canoe-net-rope"
          ref={(el) => {
            ropes.current[i] = el
          }}
          material={materials.rope}
          visible={false}
        >
          <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        </mesh>
      ))}
      <group ref={paddlerG} name="village-canoe-paddler" position={born.paddler}>
        <Figure
          cloth={clothOf(0)}
          kneel
          pose={paddlerPose}
          limbs={paddlerLimbs}
          handProp={
            <group ref={paddle}>
              <CanoePaddle />
            </group>
          }
        />
      </group>
      <group ref={netSeat} name="village-canoe-netman" position={born.net}>
        <Figure cloth={clothOf(1)} kneel pose={netSeatPose} limbs={netSeatLimbs} />
      </group>
      <group ref={netShore} name="village-canoe-netman-ashore" position={born.net} visible={false}>
        <Figure cloth={clothOf(1)} pose={netShorePose} limbs={netShoreLimbs} squat={netShoreSquat} />
      </group>
      {[0, 1].map((id) => (
        <group
          key={id}
          ref={(el) => {
            basketGroups.current[id] = el
          }}
          position={[sites.basketSpot.x, 0, sites.basketSpot.z]}
        >
          <WovenBasket
            name="fish-basket"
            fishRef={(i, el) => {
              basketFish.current[id][i] = el
            }}
            fishGeometry={fishGeometry}
            fishMaterial={materials.fresh}
          />
        </group>
      ))}

      {/* THE FISHERS' FIRE, drawn as the village fire pit is (PlaceScene's
          FirePit): a dark hearth, a ring of stones, two crossed logs and a
          flickering flame cone — with a grate of green sticks on two forked
          posts over it, the grilling fish on the grate. */}
      <group name="fish-fire" position={[sites.fire.x, fireY, sites.fire.z]} rotation={[0, along, 0]}>
        <pointLight position={[0, 0.6, 0]} color="#ff9a4a" intensity={6} distance={6} decay={2} />
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.05, 14]} />
          <meshStandardMaterial color="#3a3128" roughness={1} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85]} castShadow>
              <dodecahedronGeometry args={[0.15, 0]} />
              <meshStandardMaterial color="#79706a" roughness={1} />
            </mesh>
          )
        })}
        {[0.5, -0.6].map((ry, i) => (
          <mesh key={i} position={[0, 0.14, 0]} rotation={[0.08, ry, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.08, 1.1, 6]} />
            <meshStandardMaterial color="#4a3018" roughness={1} />
          </mesh>
        ))}
        <mesh ref={flame} position={[0, 0.42, 0]}>
          <coneGeometry args={[0.28, 0.7, 8]} />
          <meshStandardMaterial color="#ff9a2e" emissive="#ff6a00" emissiveIntensity={2.4} roughness={0.4} />
        </mesh>
        {[-0.95, 0.95].map((x, i) => (
          <mesh key={i} position={[0, 0.48, x]} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 0.96, 5]} />
            <meshStandardMaterial color="#4a3018" roughness={1} />
          </mesh>
        ))}
        {[-0.16, -0.05, 0.05, 0.16].map((x, i) => (
          <mesh key={i} position={[x, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 1.95, 4]} />
            <meshStandardMaterial color="#6b7a3a" roughness={1} />
          </mesh>
        ))}
        {Array.from({ length: fireCfg.grillSlots }, (_, i) => (
          <mesh
            key={i}
            name="fish-fire-grilling"
            ref={(el) => {
              grillFish.current[i] = el
            }}
            geometry={fishGeometry}
            material={materials.gutted}
            position={[0, 0.96, -0.6 + i * 0.4]}
            scale={fishLength(i + 30)}
            visible={false}
            castShadow
          />
        ))}
      </group>
      {/* THE SMOKING RACK: four posts, two rails and slats, the fish across them. */}
      {/* Turned so its rails run along the bank: seen from the village, the fish
          hang side by side. */}
      <group name="fish-rack" position={[sites.rack.x, rackY, sites.rack.z]} rotation={[0, along + Math.PI / 2, 0]}>
        {[[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.45, z]} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 0.9, 5]} />
            <meshStandardMaterial color="#4a3018" roughness={1} />
          </mesh>
        ))}
        {[-0.35, 0.35].map((z, i) => (
          <mesh key={i} position={[0, 0.88, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 1.15, 5]} />
            <meshStandardMaterial color="#5a3a20" roughness={1} />
          </mesh>
        ))}
        {Array.from({ length: fireCfg.rackFill }, (_, i) => (
          <mesh
            key={i}
            name="fish-rack-fish"
            ref={(el) => {
              rackFish.current[i] = el
            }}
            geometry={fishGeometry}
            material={materials.smoked}
            // Hung head down from the rails by the tail, broad side out.
            position={[-0.42 + (i % 4) * 0.28 + (i < 4 ? 0 : 0.14), 0.88 - 0.5 * fishLength(i + 50), i < 4 ? -0.35 : 0.35]}
            rotation={[Math.PI / 2, Math.PI / 2, 0, 'YXZ']}
            scale={fishLength(i + 50)}
            visible={false}
            castShadow
          />
        ))}
        {/* Smoke-darkened ground under it. */}
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.6, 12]} />
          <meshStandardMaterial color="#4a4038" roughness={1} />
        </mesh>
      </group>
      {/* THE STORAGE BASKET, the smoked fish packed in it. */}
      <group name="fish-storage" position={[sites.storage.x, storeY, sites.storage.z]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.24, 0.44, 14, 1, true]} />
          <meshStandardMaterial color="#9c7a44" roughness={1} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.24, 14]} />
          <meshStandardMaterial color="#7a5a30" roughness={1} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const a = i * 2.2
          return (
            <mesh
              key={i}
              ref={(el) => {
                storeFish.current[i] = el
              }}
              geometry={fishGeometry}
              material={materials.smoked}
              position={[Math.cos(a) * 0.1, 0.18 + 0.025 * i, Math.sin(a) * 0.1]}
              rotation={[0, a, Math.PI / 2]}
              scale={fishLength(i + 70)}
              visible={false}
            />
          )
        })}
      </group>
      {/* THE GUTTING BOARD beside the fire, the gutted fish on it. */}
      <group name="fish-board" position={[sites.board.x, boardY, sites.board.z]} rotation={[0, along, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.06, 0.4]} />
          <meshStandardMaterial color="#8a6a44" roughness={0.95} />
        </mesh>
        {Array.from({ length: cfg.catchMax }, (_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              boardFish.current[i] = el
            }}
            geometry={fishGeometry}
            material={materials.gutted}
            position={[-0.32 + (i % 4) * 0.21, 0.09 + 0.03 * Math.floor(i / 4), 0]}
            rotation={[0, 0, Math.PI / 2]}
            scale={fishLength(i + 90)}
            visible={false}
          />
        ))}
      </group>

      {/* THE CARRIER: walking with the basket on his head, kneeling to gut. */}
      <group ref={carrierWalk} name="fish-carrier" position={born.carrier}>
        <Figure cloth={clothOf(2)} legs pose={carrierWalkPoseRef} limbs={carrierWalkLimbs} gait={carrierGait} />
      </group>
      <group ref={carrierKneel} name="fish-carrier-gutting" position={[sites.carrierAtFire.x, groundHeight(sites.carrierAtFire.x, sites.carrierAtFire.z), sites.carrierAtFire.z]} rotation={[0, sites.carrierAtFire.yaw, 0]} visible={false}>
        <Figure
          cloth={clothOf(2)}
          kneel
          pose={carrierKneelPose}
          limbs={carrierKneelLimbs}
          handProp={
            <mesh ref={gutFish} geometry={fishGeometry} material={materials.fresh} rotation={[0, 0, Math.PI / 2]} scale={0.3} visible={false} />
          }
        />
      </group>
      {/* THE GRILLER, kneeling at the fire. */}
      <group name="fish-griller" position={[sites.griller.x, groundHeight(sites.griller.x, sites.griller.z), sites.griller.z]} rotation={[0, sites.griller.yaw, 0]}>
        <Figure cloth={clothOf(3)} kneel pose={grillerPose} limbs={grillerLimbs} />
      </group>
      {/* THE EATER. */}
      <group ref={eaterG} name="fish-eater" position={born.eater}>
        <Figure
          cloth={clothOf(4)}
          legs
          pose={eaterPose}
          limbs={eaterLimbs}
          gait={eaterGait}
          handProp={
            <group ref={eaterFish} visible={false}>
              <mesh geometry={fishGeometry} material={materials.smoked} rotation={[Math.PI / 2, 0, 0]} scale={0.3} />
            </group>
          }
        />
      </group>
    </>
  )
}

/** The paddler's pose for his current action. */
function paddlerAction(action: PaddlerAction, canoe: CanoeState, lane: CanoeLane): FigurePose {
  switch (action) {
    case 'hard':
      return paddlePose(canoe.stroke, 1)
    case 'hold':
      return paddlePose(canoe.stroke, 0.35)
    case 'swing':
      return swingPose(canoe.stroke)
    case 'steer':
      return steerPose(canoe.stroke)
    case 'haul':
      return haulPose(canoe.stroke, bearingIn(canoe.paddler, { x: canoe.paddler.x - lane.nx, z: canoe.paddler.z - lane.nz }))
    case 'hand':
      return handPose(canoe.clock)
  }
}

/** Puts a basket where the ring says it is. */
function placeBasket(
  g: THREE.Group,
  b: FishBasket,
  ring: BasketRing,
  sites: FisherySites,
  canoe: CanoeState,
  fire: FishFireState,
  groundHeight: (x: number, z: number) => number,
): void {
  const onGround = (x: number, z: number) => g.position.set(x, groundHeight(x, z), z)
  g.rotation.set(0, 0, 0)
  switch (b.at) {
    case 'bank': {
      // Two on the bank only for the moment of a swap: side by side.
      const other = ring.baskets.find((k) => k !== b && k.at === 'bank')
      const shift = other ? (b.fish > 0 ? 0.35 : -0.35) : 0
      onGround(sites.basketSpot.x + shift * 0.6, sites.basketSpot.z + shift * 0.8)
      break
    }
    case 'netman': {
      const nm = canoe.netMan
      const x = nm.x + Math.sin(nm.yaw) * 0.45
      const z = nm.z + Math.cos(nm.yaw) * 0.45
      g.position.set(x, groundHeight(nm.x, nm.z) + 0.55 - 0.45 * nm.reach, z)
      break
    }
    case 'carrier': {
      const c = fire.carrier
      g.position.set(c.x, groundHeight(c.x, c.z) + 1.36, c.z)
      g.rotation.set(0, c.yaw, 0)
      break
    }
    case 'fire':
      onGround(sites.fireBasket.x, sites.fireBasket.z)
      break
  }
}
