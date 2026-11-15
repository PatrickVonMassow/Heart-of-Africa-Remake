// The kraal's cattle (work-order 359; design.md §19.10, research
// docs/peoples-1890.md §8.8). A kraal people's village pen holds a small herd
// whose size is the rinderpest phase of the visit date — the same reading the
// first-visit vignette makes — so a Maasai kraal stands thinned in 1890, empty
// in the emutai years and slowly regrowing after, while a Zulu kraal stays full
// through the clean window. Each beast stands, shifts a little and walks on the
// shared fauna gait; its centre is clamped to the pen's hold disk, so no drawn
// part ever reaches the fence, and its fore and hind body circles are published
// for the traveller and the goats to resolve against.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { VILLAGE_CATTLE } from '../../config/balance'
import { createFaunaMaterial, faceVelocity, gaitBodyLift, gaitPhase, gaitRig, legSwingAngle } from '../../render/fauna'
import { buildCattleParts, CATTLE_COATS, cattleReach } from '../../render/cattle'
import { effectiveFaunaBodySegments, useUi } from '../../state/ui'
import { useGame } from '../../state/store'
import { kraalHerdForPlace } from '../../systems/cattle'
import { markActor } from '../actorLabelSource'
import { cattleAnchors, cattleBodyCircles, cattleHoldRadius, cattleLiveColliders, clampToHold } from './cattleSpots'
import { resolveMove, type CircleCollider, type Collider } from './collision'
import { isLifeFrozen } from './lifeFreeze'
import { usePlaceGround } from './PlaceGroundContext'
import { ANIMAL_TURN_RATE, turnToward } from './animalSpots'

interface Pen {
  x: number
  z: number
  r: number
}

export function KraalCattle({ seed, placeId, pen, colliders }: { seed: number; placeId: string; pen: Pen; colliders: Collider[] }) {
  const groundHeight = usePlaceGround()
  // Read once per visit, like the dress and the seasonal presence: time does
  // not advance inside a settlement.
  const count = useMemo(() => kraalHerdForPlace(placeId, useGame.getState().day), [placeId])
  const bodySegments = useUi(effectiveFaunaBodySegments)
  // One rig per coat colour; the herd cycles through them.
  const rigs = useMemo(
    () => CATTLE_COATS.map((_, i) => buildCattleParts(i, bodySegments)),
    [bodySegments],
  )
  useEffect(
    () => () => {
      for (const p of rigs) {
        p.body.dispose()
        p.legs.forEach((l) => l.geo.dispose())
      }
    },
    [rigs],
  )
  const gait = useMemo(() => gaitRig(rigs[0].legs), [rigs])
  const material = useMemo(() => createFaunaMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  const reach = useMemo(() => Math.max(...rigs.map(cattleReach)), [rigs])
  const hold = useMemo(() => cattleHoldRadius(pen, colliders, reach), [pen, colliders, reach])
  const anchors = useMemo(() => (hold > 0 ? cattleAnchors(seed, count, pen, hold, colliders) : []), [seed, count, pen, hold, colliders])
  // Every beast's fore and hind circles, mutated in place each frame.
  const circles = useMemo(
    () =>
      anchors.map((a) =>
        cattleBodyCircles(a.x, a.z, a.yaw, [
          { x: 0, z: 0, r: 0 },
          { x: 0, z: 0, r: 0 },
        ] as [CircleCollider, CircleCollider]),
      ),
    [anchors],
  )
  const state = useRef<Array<{ x: number; z: number; yaw: number; dist: number }>>([])
  if (state.current.length !== anchors.length) state.current = anchors.map((a) => ({ x: a.x, z: a.z, yaw: a.yaw, dist: 0 }))
  const refs = useRef<Array<THREE.Group | null>>([])
  const legRefs = useRef<Array<Array<THREE.Group | null>>>([])
  // The scene each beast resolves against: the others' circles, then the layout.
  const scene = useMemo<Collider[]>(() => [], [])

  // Publish the bodies for the traveller and the goats while mounted.
  useEffect(() => {
    cattleLiveColliders.length = 0
    for (const pair of circles) cattleLiveColliders.push(pair[0], pair[1])
    return () => {
      cattleLiveColliders.length = 0
    }
  }, [circles])

  useFrame(({ clock }, rawDt) => {
    if (isLifeFrozen() || !anchors.length) return
    const t = clock.elapsedTime
    const dt = Math.min(rawDt, 0.1)
    const maxStep = VILLAGE_CATTLE.maxSpeed * dt
    anchors.forEach((a, i) => {
      const s = state.current[i]
      const g = refs.current[i]
      if (!s || !g) return
      // A slow shift about the anchor: cattle in a kraal mostly stand.
      const amp = VILLAGE_CATTLE.wanderAmp
      const tx = a.x + Math.sin(t * 0.07 + a.phase) * amp
      const tz = a.z + Math.cos(t * 0.05 + a.phase * 1.3) * amp
      const gx = tx - s.x
      const gz = tz - s.z
      const gd = Math.hypot(gx, gz)
      const k = gd > maxStep ? maxStep / gd : 1
      scene.length = 0
      circles.forEach((pair, j) => {
        if (j !== i) scene.push(pair[0], pair[1])
      })
      for (const c of colliders) scene.push(c)
      const [rx, rz] = resolveMove(scene, s.x + gx * k, s.z + gz * k, VILLAGE_CATTLE.moverRadius, [s.x, s.z])
      const [px, pz] = clampToHold(pen, hold, rx, rz)
      const vx = px - s.x
      const vz = pz - s.z
      if (Math.hypot(vx, vz) > 1e-5) s.yaw = turnToward(s.yaw, faceVelocity(vx, vz, s.yaw), ANIMAL_TURN_RATE * 0.4 * dt)
      s.dist += Math.hypot(vx, vz)
      s.x = px
      s.z = pz
      cattleBodyCircles(px, pz, s.yaw, circles[i])
      const phase = gaitPhase(s.dist, gait.cadence)
      g.position.set(px, groundHeight(px, pz) + gaitBodyLift(phase, gait.legLength), pz)
      g.rotation.y = s.yaw
      const legs = legRefs.current[i]
      const rig = rigs[i % rigs.length]
      if (legs)
        rig.legs.forEach((leg, li) => {
          const lg = legs[li]
          if (lg) lg.rotation.x = legSwingAngle(phase, leg.phaseOffset)
        })
    })
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__placeCattle = {
        count: anchors.length,
        pen,
        hold,
        reach,
        cattle: state.current.map((s) => ({ x: s.x, z: s.z, yaw: s.yaw })),
      }
    }
  })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    // Published at mount too, so a capture reads zero cattle without a frame.
    w.__placeCattle = { count: anchors.length, pen, hold, reach, cattle: anchors.map((a) => ({ x: a.x, z: a.z, yaw: a.yaw })) }
    return () => {
      delete w.__placeCattle
    }
  }, [anchors, pen, hold, reach])

  return (
    <>
      {anchors.map((a, i) => {
        const rig = rigs[i % rigs.length]
        return (
          <group
            key={i}
            position={[a.x, groundHeight(a.x, a.z), a.z]}
            rotation={[0, a.yaw, 0]}
            ref={(el) => {
              refs.current[i] = el
            }}
            userData={markActor({ kind: 'cattle', height: 1.5 })}
          >
            <mesh geometry={rig.body} material={material} castShadow />
            {rig.legs.map((leg, li) => (
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
        )
      })}
    </>
  )
}
