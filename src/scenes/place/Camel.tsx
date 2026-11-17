// The Giza dromedary (work-order "proper camel model"): the swept model of
// camelModel.ts with a standing idle — a slow neck nod, a head turn and a tail
// swish. Detail follows the villager figures' lever (`figureBodySegments`):
// its ring count shapes the model, and 0 (the LOW preset) keeps the primitive
// camel, as the villagers keep their primitive figure there.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { CAMEL_MODEL } from '../../config/balance'
import { effectiveFigureBodySegments, useUi } from '../../state/ui'
import { assembleCamel, buildCamelParts, type Vec3 } from './camelModel'
import { isLifeFrozen } from './lifeFreeze'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** A standing camel facing +x (the plateau's mount convention); `phase`
 *  de-synchronises the idle of several camels. */
export function Camel({ phase = 0 }: { phase?: number }) {
  const segments = useUi(effectiveFigureBodySegments)
  return (
    // The model faces +z; a quarter turn makes it face +x.
    <group rotation={[0, Math.PI / 2, 0]} name="camel">
      {segments > 0 ? <CamelModel radial={segments} phase={phase} /> : <CamelPrimitive />}
    </group>
  )
}

function CamelModel({ radial, phase }: { radial: number; phase: number }) {
  const rig = useMemo(() => {
    const build = buildCamelParts(radial)
    const { pivots } = build
    return { geos: assembleCamel(build), pivots }
  }, [radial])
  const material = useMemo(() => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92 }), [])
  useEffect(
    () => () => {
      for (const g of Object.values(rig.geos)) g.dispose()
    },
    [rig],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Dev: which camel drew, for the close-up proof frame.
    const w = window as unknown as Record<string, unknown>
    w.__camelModel = { radial }
    return () => {
      delete w.__camelModel
    }
  }, [radial])

  const neck = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const clock = useRef(phase)
  useFrame((_, delta) => {
    // The dev life freeze holds the idle like every inhabitant (lifeFreeze.ts).
    if (isLifeFrozen()) return
    clock.current += Math.min(delta, 0.1)
    const t = clock.current
    const I = CAMEL_MODEL.idle
    const wave = (period: number, offset = 0) => Math.sin(((t + offset) / period) * Math.PI * 2)
    if (neck.current) neck.current.rotation.x = I.neckPitch * wave(I.neckPeriod)
    if (head.current) head.current.rotation.y = I.headYaw * wave(I.headPeriod, 1.3)
    if (tail.current) tail.current.rotation.z = I.tailSwing * wave(I.tailPeriod, 0.4)
  })

  const { geos, pivots } = rig
  return (
    <group>
      <mesh geometry={geos.root} material={material} castShadow receiveShadow />
      <group ref={neck} position={pivots.neck}>
        <mesh geometry={geos.neck} material={material} castShadow receiveShadow />
        <group ref={head} position={sub(pivots.head, pivots.neck)}>
          <mesh geometry={geos.head} material={material} castShadow receiveShadow />
        </group>
      </group>
      <group ref={tail} position={pivots.tail}>
        <mesh geometry={geos.tail} material={material} castShadow />
      </group>
    </group>
  )
}

/** The LOW-preset camel: the earlier primitive build (humped box body, long
 *  neck, four stick legs), modelled facing +z here. */
function CamelPrimitive() {
  const tan = CAMEL_MODEL.colour.coat
  return (
    <group rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[1.4, 0.6, 0.55]} />
        <meshStandardMaterial color={tan} roughness={0.95} />
      </mesh>
      <mesh position={[0.05, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.34, 10, 8]} />
        <meshStandardMaterial color={tan} roughness={0.95} />
      </mesh>
      <mesh position={[0.75, 1.55, 0]} rotation={[0, 0, -0.7]} castShadow>
        <cylinderGeometry args={[0.12, 0.17, 1.0, 8]} />
        <meshStandardMaterial color={tan} roughness={0.95} />
      </mesh>
      <mesh position={[1.02, 2.0, 0]} castShadow>
        <boxGeometry args={[0.38, 0.26, 0.22]} />
        <meshStandardMaterial color={tan} roughness={0.95} />
      </mesh>
      {(
        [
          [0.55, 0.3],
          [0.55, -0.3],
          [-0.55, 0.3],
          [-0.55, -0.3],
        ] as const
      ).map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.5, lz]} castShadow>
          <cylinderGeometry args={[0.08, 0.07, 1.05, 6]} />
          <meshStandardMaterial color={tan} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}
