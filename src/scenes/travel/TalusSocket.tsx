import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { ROCK_RELIEF } from '../../world/rockRelief'

export function buildReliefFace() {
  const shape = new THREE.Shape()
  ROCK_RELIEF.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y))
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

/** The sloping face is readable from the normal travel camera above the plain.
 * The fitted stone slides aside, leaving a bright exposed seat and a dark seam. */
export function TalusSocket({ fitted }: { fitted: boolean }) {
  const relief = useMemo(buildReliefFace, [])
  useEffect(() => () => relief.dispose(), [relief])
  return <group name="bandiagara-talus-socket" userData={{ fitted }}>
    <mesh position={[0, 0.36, 0.55]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#95724f" roughness={1} />
    </mesh>
    <group position={[0, 1.05, 0.7]} rotation={[-Math.PI / 3, 0, 0]}>
      <mesh name="socket-recess" geometry={relief} scale={1.1}><meshStandardMaterial color="#231c16" roughness={1} side={THREE.DoubleSide} /></mesh>
      <mesh name="socket-relief" geometry={relief} position={[fitted ? 0.48 : 0, fitted ? -0.12 : 0, 0.025]} scale={0.87}>
        <meshStandardMaterial color={fitted ? '#ead0a1' : '#c8a276'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {fitted && <mesh name="opened-socket-seam" position={[-0.4, 0, 0.03]}><boxGeometry args={[0.12, 0.8, 0.035]} /><meshStandardMaterial color="#15110d" /></mesh>}
    </group>
  </group>
}
