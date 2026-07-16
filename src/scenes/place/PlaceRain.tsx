// Rain inside a settlement (design.md §19.13, point 143). The travel scene's
// rain field is calibrated for the bird's-eye camera — a wide column of
// TILTED streaks, because a plumb streak seen from above is nearly edge-on. At
// eye height none of that holds: the player looks horizontally, so the streaks
// must be near-VERTICAL, and the column is tight around the head rather than
// 55 units wide. So this is its own field, not a reused one.
//
// Driven by the place's own wetness (rainAmount), which is 0 in Cairo and every
// hyper-arid coordinate — so a port in the desert never rains, with no special
// case. Not a module singleton: the place scene rebuilds its materials each
// visit anyway (unlike the travel scene, point 96), so a per-mount material is
// consistent here.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { float, hash, instanceIndex, max, positionLocal, smoothstep, time, uniform, vec3 } from 'three/tsl'
import { balance } from '../../config/balance'
import { rainAmount } from '../../systems/season'

const RAIN_COUNT = 700
const RAIN_RADIUS = 16 // a tight column around the head, not the travel 55
const RAIN_HEIGHT = 15 // from above the eye to below the feet
const RAIN_FALL_SPEED = 22
const EYE = 1.5 // centre the column on the eye height

export function PlaceRain({ wetness }: { wetness: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)

  const { material, geometry, opacityU } = useMemo(() => {
    const opacityU = uniform(0)
    const m = new THREE.MeshBasicNodeMaterial()
    m.transparent = true
    m.depthWrite = false
    m.side = THREE.DoubleSide
    m.fog = false
    const i = instanceIndex.toFloat()
    const rx = hash(i.mul(3).add(1)).sub(0.5).mul(RAIN_RADIUS * 2)
    const rz = hash(i.mul(3).add(2)).sub(0.5).mul(RAIN_RADIUS * 2)
    const phase = hash(i.mul(3))
    const fall = phase.mul(RAIN_HEIGHT).sub(time.mul(RAIN_FALL_SPEED)).mod(RAIN_HEIGHT)
    m.positionNode = positionLocal.add(vec3(rx, fall, rz))
    m.colorNode = vec3(0.66, 0.72, 0.8)
    const edge = max(rx.abs(), rz.abs()).div(RAIN_RADIUS)
    m.opacityNode = opacityU.mul(smoothstep(float(1), float(0.4), edge)).mul(0.8)
    // Slim near-vertical streaks, longer than the travel scene's so they read at
    // eye height; a second, crossed set (below) shows them from any yaw.
    const geometry = new THREE.PlaneGeometry(0.03, 1.1)
    return { material: m, geometry, opacityU }
  }, [])

  useEffect(() => () => {
    material.dispose()
    geometry.dispose()
  }, [material, geometry])

  useFrame(({ camera }, dt) => {
    // Follow the head so the column always surrounds the player.
    if (group.current) group.current.position.set(camera.position.x, EYE, camera.position.z)
    const target = rainAmount(wetness.current, balance.season.weatherStrength)
    opacityU.value += (target - opacityU.value) * Math.min(1, dt * 1.5)
    if (group.current) group.current.visible = opacityU.value > 0.01
  })

  return (
    <group ref={group}>
      <instancedMesh args={[geometry, material, RAIN_COUNT]} frustumCulled={false} />
      <instancedMesh
        args={[geometry, material, RAIN_COUNT]}
        rotation={[0, Math.PI / 2, 0]}
        frustumCulled={false}
      />
    </group>
  )
}
