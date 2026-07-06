// Region-dependent climate optics for the travel view (design.md §19):
// desert heat haze, humid jungle mist, clear highland air. Implemented as a
// smoothly interpolated scene fog plus low ground haze layers whose color and
// opacity follow the current region. Purely visual.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { mx_fractal_noise_float, positionWorld, time, uniform, vec3 } from 'three/tsl'
import { useGame } from '../../state/store'
import type { RegionId } from '../../world/geo'

interface FogPreset {
  color: string
  near: number
  far: number
  /** Ground haze opacity (heat shimmer / mist). */
  haze: number
  hazeColor: string
  hazeHeight: number
}

// Stylized climate per region (design.md §3/§19). The east/south presets keep
// long sight lines ("klare Luft im Hochland"), the Congo basin sits in damp
// mist, the Sahara in warm dust.
const FOG_PRESETS: Record<RegionId, FogPreset> = {
  north: { color: '#e2d6ba', near: 70, far: 200, haze: 0.15, hazeColor: '#f4e2b6', hazeHeight: 1.1 },
  west: { color: '#d5dfe2', near: 90, far: 250, haze: 0.05, hazeColor: '#eee6c8', hazeHeight: 1.3 },
  central: { color: '#d1e0d2', near: 55, far: 165, haze: 0.2, hazeColor: '#e2efdc', hazeHeight: 2.2 },
  east: { color: '#d2e2ee', near: 130, far: 330, haze: 0, hazeColor: '#ffffff', hazeHeight: 1.5 },
  south: { color: '#d5dde4', near: 105, far: 280, haze: 0, hazeColor: '#ffffff', hazeHeight: 1.5 },
}

const HAZE_LAYERS = 5

export function Climate() {
  const scene = useThree((s) => s.scene)
  const hazeGroup = useRef<THREE.Group>(null)

  // Imperative fog so near/far/color can be lerped smoothly per frame.
  useEffect(() => {
    const fog = new THREE.Fog('#cfe0ea', 95, 260)
    scene.fog = fog
    scene.background = new THREE.Color('#cfe0ea')
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene])

  const haze = useMemo(() => {
    const opacityU = uniform(0)
    const colorU = uniform(new THREE.Color('#f4e2b6'))
    const m = new THREE.MeshBasicNodeMaterial()
    m.transparent = true
    m.depthWrite = false
    m.side = THREE.DoubleSide
    m.fog = false
    const n = mx_fractal_noise_float(
      vec3(positionWorld.xz.mul(0.05).add(time.mul(0.025)), time.mul(0.05)),
      3,
    )
      .mul(0.5)
      .add(0.5)
    m.colorNode = colorU
    m.opacityNode = n.mul(n).mul(opacityU)
    return { material: m, opacityU, colorU }
  }, [])

  const targetColor = useMemo(() => new THREE.Color(), [])
  const hazeTarget = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const k = Math.min(1, dt * 0.8) // slow blend across region borders
    const s = useGame.getState()
    const preset = FOG_PRESETS[s.region]

    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      targetColor.set(preset.color)
      fog.color.lerp(targetColor, k)
      fog.near += (preset.near - fog.near) * k
      fog.far += (preset.far - fog.far) * k
      if (scene.background instanceof THREE.Color) scene.background.lerp(targetColor, k)
    }

    // Ground haze follows the player; layers drift slowly against each other.
    const g = hazeGroup.current
    if (g) {
      hazeTarget.set(preset.hazeColor)
      haze.colorU.value.lerp(hazeTarget, k)
      haze.opacityU.value += (preset.haze - haze.opacityU.value) * k
      g.visible = haze.opacityU.value > 0.01
      if (g.visible) {
        const t = clock.elapsedTime
        g.position.set(s.pos.x, 0, s.pos.z)
        g.children.forEach((layer, i) => {
          layer.position.set(
            Math.sin(t * 0.03 + i * 2.1) * 14,
            preset.hazeHeight + i * 0.5,
            Math.cos(t * 0.024 + i * 1.7) * 14,
          )
        })
      }
    }
  })

  return (
    <group ref={hazeGroup} visible={false}>
      {Array.from({ length: HAZE_LAYERS }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, i * 1.3]} material={haze.material} renderOrder={5}>
          <planeGeometry args={[95, 95]} />
        </mesh>
      ))}
    </group>
  )
}
