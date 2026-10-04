// GRAIN POUNDING, DRAWN (design.md §19, work-order points 1274 and 1282): a
// footed, hollowed wooden mortar with grain in its bowl, and two women who
// pound it ALTERNATELY with long pestles held in both hands — lifted high,
// driven down with the knees giving, the foot landing in the grain with a puff
// and a thud. The stroke is solved in `mortarPounding.ts`; the pair's walk to
// the fish rack and back is `fishFire.ts`'s (`stepPoundingDuo`). This only
// draws what they decide.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import { FIGURE_LIMBS, TESSELLATION } from '../../render/figures'
import { armAim, REST_POSE, type FigurePose } from '../../render/gesture'
import { gaitCadence, gaitPhase } from '../../render/fauna'
import { buildFishGeometry, FISH_TONES } from '../../render/fishMesh'
import { playPoundThud } from '../../systems/ambience'
import { usePlaceGround } from './PlaceGroundContext'
import { Figure } from './placeFigure'
import { useStandingBodies } from './placeFigureContext'
import { placePlayerPosition } from './playerPosition'
import { speechBearing } from './speechBearing'
import { isLifeFrozen } from './lifeFreeze'
import { reachPose } from './fisheryPoses'
import { biteLift } from './fishFire'
import {
  advancePounding,
  bowlRadiusAt,
  createPoundingDuo,
  grainLevel,
  impactFootY,
  mortarProfile,
  pounderStands,
  poundFrame,
  puffGrain,
  womanSinceImpact,
  womanStrokePhase,
  type PoundingDuo,
} from './mortarPounding'

/** The pestle's turned profile from its foot: a rounded, heavier foot, a
 *  slimmer grip and a flared head, so it reads as a carved pestle and not a
 *  stick. */
function pestleProfile(length: number, r: number): THREE.Vector2[] {
  return [
    [0.0001, 0], [r * 0.9, 0.012], [r * 1.25, 0.06], [r * 1.25, 0.2], [r * 0.85, 0.42],
    [r * 0.85, length - 0.38], [r * 1.12, length - 0.12], [r * 0.85, length - 0.01], [0.0001, length],
  ].map(([x, y]) => new THREE.Vector2(x, y))
}

const UP = new THREE.Vector3(0, 1, 0)
/** The most women `villageLife.mortar.pounders` can put at one mortar. */
const MAX_POUNDERS = 2

/** Dev/verify probe of the pounding (read by the place verification). */
export interface PoundingProbe {
  /** The mortar's centre on the ground, the rim's height above it, and the
   *  turn of its frame (the pair stands on that frame's z axis). */
  mortar: { x: number; y: number; z: number; rim: number; yaw: number }
  /** What the pair is doing (`DuoPhase`): only 'pound' and 'settle' are at
   *  the mortar. */
  activity: PoundingDuo['phase']
  /** Per woman: her stroke phase (-1 while away from the mortar), her pestle
   *  foot (world), whether her grain puff is in the air, and how many impacts
   *  she has made. */
  women: Array<{ phase: number; foot: { x: number; y: number; z: number }; puff: boolean; impacts: number }>
  /** Thuds actually handed to the audio this visit. */
  thuds: number
  /** Impacts that were handed to a thud in the frame they happened — equal to
   *  the women's impacts summed when every strike is heard. */
  heard: number
}

/** A world point in a woman's own frame at the mortar (inverse of the
 *  mortar group's `yaw` turn, then of her own stand and facing). */
function intoWomanFrame(
  px: number,
  pz: number,
  mortar: { x: number; z: number; yaw: number },
  woman: number,
  standOff: number,
): [number, number] {
  const dx = px - mortar.x
  const dz = pz - mortar.z
  const c = Math.cos(mortar.yaw)
  const s = Math.sin(mortar.yaw)
  // Into the mortar's frame.
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  // Into hers: woman 0 at -standOff facing +z, woman 1 at +standOff turned round.
  return woman === 0 ? [lx, lz + standOff] : [-lx, standOff - lz]
}

/**
 * The mortar and its two women. Without `duo` the pair pounds on the spot for
 * good (a bankless village's middle); with it they follow that state, which
 * the fishers' fire steps — walking to the rack, eating, walking back.
 * `yaw` turns the mortar's frame; by default woman 0 faces the village middle.
 */
export function Pounder({ x, z, yaw: yawIn, cloth, duo: duoIn }: {
  x: number
  z: number
  yaw?: number
  cloth: readonly string[]
  duo?: PoundingDuo
}) {
  const groundHeight = usePlaceGround()
  const camera = useThree((state) => state.camera)
  const cfg = balance.villageLife.mortar
  const yaw = yawIn ?? Math.atan2(-x, -z)
  const gy = groundHeight(x, z)
  const stands = useMemo(() => pounderStands(x, z, yaw, cfg), [x, z, yaw, cfg])
  const count = stands.length
  // A pair that never leaves, stepped here, where nobody else steps one.
  const ownDuo = useMemo(() => (duoIn ? null : createPoundingDuo(stands, Infinity)), [duoIn, stands])
  const duo = duoIn ?? ownDuo!
  // Bodies the passers-by go round (point 578).
  useStandingBodies(stands)
  // Rebuilt whenever a shape tunable changes (the profile reads all of them).
  const { height, footRadius, waistRadius, rimRadius, bowlDepth } = cfg
  const mortarGeometry = useMemo(
    () => new THREE.LatheGeometry(
      mortarProfile({ ...balance.villageLife.mortar, height, footRadius, waistRadius, rimRadius, bowlDepth }).map(([r, y]) => new THREE.Vector2(r, y)),
      TESSELLATION.mortar,
    ),
    [height, footRadius, waistRadius, rimRadius, bowlDepth],
  )
  const pestleGeometry = useMemo(
    () => new THREE.LatheGeometry(pestleProfile(cfg.pestleLength, cfg.pestleRadius), TESSELLATION.pestle),
    [cfg.pestleLength, cfg.pestleRadius],
  )
  const fishGeometry = useMemo(() => buildFishGeometry(), [])
  const fishMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: FISH_TONES.smoked, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide }), [])
  useEffect(() => () => {
    mortarGeometry.dispose()
    pestleGeometry.dispose()
    fishGeometry.dispose()
    fishMaterial.dispose()
  }, [mortarGeometry, pestleGeometry, fishGeometry, fishMaterial])
  const grainRadius = bowlRadiusAt(grainLevel())
  const cadence = useMemo(() => gaitCadence(FIGURE_LIMBS.hipY), [])
  // Per-woman state is sized for EVERY slot `pounders` allows, so a change of
  // the count between renders can never index past it.
  const poses = useRef(Array.from({ length: MAX_POUNDERS }, () => ({ current: { ...poundFrame(0).pose } as FigurePose | null })))
  const squats = useRef(Array.from({ length: MAX_POUNDERS }, () => ({ current: 1 })))
  const gaits = useRef(Array.from({ length: MAX_POUNDERS }, () => ({ current: 0 })))
  const figures = useRef<Array<THREE.Group | null>>([])
  const pestles = useRef<Array<THREE.Mesh | null>>([])
  const fish = useRef<Array<THREE.Group | null>>([])
  const grains = useRef<Array<Array<THREE.Mesh | null>>>(Array.from({ length: MAX_POUNDERS }, () => []))
  const chaff = useRef<Array<THREE.Mesh | null>>([])
  const seen = useRef(Array.from({ length: MAX_POUNDERS }, () => 0))
  const thuds = useRef(0)
  const heard = useRef(0)
  const axis = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __placePounding?: () => PoundingProbe }
    w.__placePounding = () => ({
      mortar: { x, y: gy, z, rim: cfg.height, yaw },
      activity: duo.phase,
      women: Array.from({ length: count }, (_, i) => {
        const phase = womanStrokePhase(duo, i, cfg)
        const f = poundFrame(phase ?? 0).foot
        // Her frame: woman 0 faces +yaw from her stand, woman 1 the other way.
        const s = Math.sin(stands[i].yaw)
        const c = Math.cos(stands[i].yaw)
        return {
          phase: phase ?? -1,
          foot: { x: stands[i].x + f[0] * c + f[2] * s, y: gy + f[1], z: stands[i].z - f[0] * s + f[2] * c },
          puff: womanSinceImpact(duo, i) < cfg.puffSeconds,
          impacts: duo.women[i].impacts,
        }
      }),
      thuds: thuds.current,
      heard: heard.current,
    })
    return () => {
      delete w.__placePounding
    }
  }, [x, z, gy, yaw, count, cfg, duo, stands])

  useFrame((_, rawDt) => {
    if (isLifeFrozen()) return
    if (ownDuo) advancePounding(ownDuo, Math.min(rawDt, 0.1), cfg)
    let struckNow = 0
    for (let i = 0; i < count; i++) {
      const woman = duo.women[i]
      const phase = womanStrokePhase(duo, i, cfg)
      const figure = figures.current[i]
      const pose = poses.current[i].current
      const pestle = pestles.current[i]
      if (phase !== null) {
        // AT THE MORTAR: the solved stroke.
        const frame = poundFrame(phase)
        if (pose) {
          Object.assign(pose.left, frame.pose.left)
          Object.assign(pose.right, frame.pose.right)
          pose.lean = frame.pose.lean
          pose.turn = 0
        }
        squats.current[i].current = frame.squat
        gaits.current[i].current = 0
        if (figure) {
          figure.position.set(0, 0, 0)
          figure.rotation.y = 0
          figure.scale.set(1, frame.squat, 1)
        }
        if (pestle) {
          pestle.position.set(frame.foot[0], frame.foot[1], frame.foot[2])
          pestle.quaternion.setFromUnitVectors(UP, axis.set(frame.axis[0], frame.axis[1], frame.axis[2]))
        }
      } else {
        // AWAY at the fish rack or on the walk: she goes where the pair's
        // state puts her; her pestle stands upright in the grain meanwhile.
        const [fx, fz] = intoWomanFrame(woman.x, woman.z, { x, z, yaw }, i, cfg.standOff)
        squats.current[i].current = 1
        if (figure) {
          figure.position.set(fx, groundHeight(woman.x, woman.z) - gy, fz)
          figure.rotation.y = woman.yaw - stands[i].yaw
          figure.scale.set(1, 1, 1)
        }
        const walking = !woman.arrived && (duo.phase === 'toRack' || duo.phase === 'back')
        gaits.current[i].current = walking ? gaitPhase(woman.walked, cadence) : 0
        if (pose) {
          const fireCfg = balance.villageLife.fishFire
          const next: FigurePose =
            duo.phase === 'take'
              ? reachPose(0, 0.3 * Math.sin(Math.PI * Math.min(1, duo.clock / fireCfg.takeSeconds)))
              : duo.phase === 'eat' && woman.fish > 0
                ? { left: armAim(0.35, -0.55 + 1.35 * biteLift(duo, fireCfg, i)), right: { ...REST_POSE.right }, lean: 0.04, turn: 0 }
                : { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: REST_POSE.lean, turn: REST_POSE.turn }
          Object.assign(pose.left, next.left)
          Object.assign(pose.right, next.right)
          pose.lean = next.lean
          pose.turn = next.turn
        }
        if (pestle) {
          pestle.position.set(cfg.strikeOffset, impactFootY(cfg), cfg.standOff)
          pestle.quaternion.identity()
        }
      }
      const held = fish.current[i]
      if (held) {
        held.visible = woman.fish > 0
        held.scale.set(1, 1, Math.max(0.15, woman.fish))
      }
      const since = womanSinceImpact(duo, i)
      grains.current[i].forEach((g, k) => {
        if (!g) return
        const puff = puffGrain(k, since)
        g.visible = puff.visible
        if (puff.visible) g.position.set(cfg.strikeOffset + puff.offset[0], grainLevel() + puff.offset[1], cfg.standOff + puff.offset[2])
      })
      const cloud = chaff.current[i]
      if (cloud) {
        const u = since / cfg.puffSeconds
        cloud.visible = u < 1
        if (u < 1) {
          cloud.scale.setScalar(0.6 + 2 * u)
          ;(cloud.material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - u)
        }
      }
      const struck = woman.impacts - seen.current[i]
      seen.current[i] = woman.impacts
      if (struck > 0) struckNow += struck
    }
    if (struckNow > 0) {
      thuds.current++
      heard.current += struckNow
      const at = { x, z }
      const distance = placePlayerPosition.active
        ? Math.hypot(at.x - placePlayerPosition.x, at.z - placePlayerPosition.z)
        : Infinity
      playPoundThud(distance, speechBearing(camera, at))
    }
  })

  return (
    <group position={[x, gy, z]} rotation={[0, yaw, 0]}>
      {/* The mortar: one carved block, footed and waisted, hollowed at the top. */}
      <mesh name="village-mortar" geometry={mortarGeometry} castShadow receiveShadow>
        <meshStandardMaterial color="#6a4526" roughness={0.92} />
      </mesh>
      {/* Two carved bands, darker where the wood is worn by hands. */}
      {[0.16, 0.86].map((f) => (
        <mesh key={f} position={[0, cfg.height * f, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[f < 0.5 ? cfg.footRadius * 0.84 : cfg.rimRadius * 0.96, 0.009, 4, TESSELLATION.mortar]} />
          <meshStandardMaterial color="#3f2914" roughness={0.95} />
        </mesh>
      ))}
      {/* Grain heaped in the bowl (millet / sorghum). */}
      <mesh position={[0, grainLevel(), 0]} scale={[1, 0.28, 1]}>
        <sphereGeometry args={[grainRadius, TESSELLATION.mortar, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d9bf6e" roughness={1} />
      </mesh>
      {stands.map((_, i) => (
        // Each woman's own frame: at her stand, facing the mortar.
        <group key={i} name={`village-pounder-${i}`} position={[0, 0, i === 0 ? -cfg.standOff : cfg.standOff]} rotation={[0, i === 0 ? 0 : Math.PI, 0]}>
          <group ref={(el) => { figures.current[i] = el }}>
            <Figure
              cloth={cloth[i % cloth.length]}
              pose={poses.current[i]}
              squat={squats.current[i]}
              gait={gaits.current[i]}
              legs
              handProp={
                <group ref={(el) => { fish.current[i] = el }} visible={false}>
                  <mesh geometry={fishGeometry} material={fishMaterial} rotation={[Math.PI / 2, 0, 0]} scale={0.3} />
                </group>
              }
            />
          </group>
          {/* Her pestle, its foot in the mortar (her frame: +z is forward). */}
          <group>
            <mesh name={`village-pestle-${i}`} ref={(el) => { pestles.current[i] = el }} geometry={pestleGeometry} castShadow>
              <meshStandardMaterial color="#8a6438" roughness={0.85} />
            </mesh>
            {Array.from({ length: cfg.puffGrains }, (_, k) => (
              <mesh key={k} ref={(el) => { grains.current[i][k] = el }} visible={false}>
                <sphereGeometry args={[0.022, 5, 4]} />
                <meshStandardMaterial color="#e2cc84" roughness={1} />
              </mesh>
            ))}
            <mesh ref={(el) => { chaff.current[i] = el }} position={[cfg.strikeOffset, grainLevel() + 0.05, cfg.standOff]} visible={false}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshStandardMaterial color="#e8dcb0" roughness={1} transparent opacity={0.4} depthWrite={false} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}
