// Region-dependent climate optics for the travel view (design.md §19):
// desert heat haze, humid jungle mist, clear highland air. Implemented as a
// smoothly interpolated scene fog plus low ground haze layers whose color and
// opacity follow the current region. Purely visual.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { float, max, mx_fractal_noise_float, positionWorld, smoothstep, time, uniform, uv, vec3 } from 'three/tsl'
import { demElevation, demInlandWater } from '../../render/demElevation'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
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
// Haze opacities kept low: the layers read as fine drifting dust — at higher
// values their large noise features read as gray cloud blobs over the map.
const FOG_PRESETS: Record<RegionId, FogPreset> = {
  north: { color: '#e2d6ba', near: 70, far: 200, haze: 0.09, hazeColor: '#f4e2b6', hazeHeight: 1.1 },
  west: { color: '#d5dfe2', near: 90, far: 250, haze: 0.04, hazeColor: '#eee6c8', hazeHeight: 1.3 },
  central: { color: '#d1e0d2', near: 55, far: 165, haze: 0.12, hazeColor: '#e2efdc', hazeHeight: 2.2 },
  east: { color: '#d2e2ee', near: 130, far: 330, haze: 0, hazeColor: '#ffffff', hazeHeight: 1.5 },
  south: { color: '#d5dde4', near: 105, far: 280, haze: 0, hazeColor: '#ffffff', hazeHeight: 1.5 },
}

const HAZE_LAYERS = 5

// MODULE singletons (point 96): scene.fog participates in every material's
// pipeline cache key, so a fresh Fog instance per mount would invalidate and
// re-link the whole travel program set on re-entry after a place visit.
const TRAVEL_FOG = new THREE.Fog('#cfe0ea', 95, 260)
const TRAVEL_BACKGROUND = new THREE.Color('#cfe0ea')

export function Climate() {
  const scene = useThree((s) => s.scene)
  const hazeGroup = useRef<THREE.Group>(null)

  // Imperative fog so near/far/color can be lerped smoothly per frame.
  useEffect(() => {
    TRAVEL_FOG.color.set('#cfe0ea')
    TRAVEL_FOG.near = 95
    TRAVEL_FOG.far = 260
    scene.fog = TRAVEL_FOG
    scene.background = TRAVEL_BACKGROUND
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
    // Fine-grained dust streaks: a lower frequency turns the noise features
    // into ~20-unit patches that read as gray cloud blobs over the terrain.
    const n = mx_fractal_noise_float(
      vec3(positionWorld.xz.mul(0.13).add(time.mul(0.03)), time.mul(0.05)),
      3,
    )
      .mul(0.5)
      .add(0.5)
    // Radial fade toward the quad edges, wide enough that no rotated-square
    // silhouette of the layer quad ever shows.
    const edge = max(uv().x.sub(0.5).abs(), uv().y.sub(0.5).abs())
    const edgeFade = smoothstep(0.48, 0.2, edge)
    // Ground dust belongs over dry ground: over open water the pale veils
    // read as gray cloud blobs on the dark sea (and as milky drifting
    // patches on the Nile), so the haze fades out across the shoreline and
    // over rivers/lakes. Elevation alone cannot exclude rivers — their
    // carved valleys lie above sea level — hence the baked inland-water
    // channel of the shared DEM texture.
    const lon = positionWorld.x.div(10)
    const lat = positionWorld.z.negate().div(10)
    const overLand = smoothstep(float(-6), float(6), demElevation(lon, lat)).mul(
      demInlandWater(lon, lat).oneMinus(),
    )
    m.colorNode = colorU
    m.opacityNode = n.mul(n).mul(opacityU).mul(edgeFade).mul(overLand)
    return { material: m, opacityU, colorU }
  }, [])

  const targetColor = useMemo(() => new THREE.Color(), [])
  const hazeTarget = useMemo(() => new THREE.Color(), [])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__climate = {
      fog: () => {
        const f = scene.fog as THREE.Fog | null
        return f ? { near: f.near, far: f.far } : null
      },
      hazeOpacity: () => haze.opacityU.value as number,
    }
    return () => {
      delete w.__climate
    }
  }, [scene, haze])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const k = Math.min(1, dt * 0.8) // slow blend across region borders
    const s = useGame.getState()
    const preset = FOG_PRESETS[s.region]
    // No haze in the debug-only zoom range (design.md §21): beyond the default
    // camera distance the fog recedes to the horizon and the ground haze fades
    // out, so a zoomed-out view — up to the whole continent — stays clear.
    // The haze ramp is tight (gone by ~1.25x): already slightly widened views
    // read the dust veils as floating gray clouds over the map.
    const zoom = useUi.getState().travelZoom
    const clearView = Math.min(1, Math.max(0, (zoom - 1) / 0.6))
    const hazeClear = Math.min(1, Math.max(0, (zoom - 1) / 0.25))

    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      targetColor.set(preset.color)
      fog.color.lerp(targetColor, k)
      const nearT = preset.near + (6000 - preset.near) * clearView
      const farT = preset.far + (12000 - preset.far) * clearView
      fog.near += (nearT - fog.near) * k
      fog.far += (farT - fog.far) * k
      if (scene.background instanceof THREE.Color) scene.background.lerp(targetColor, k)
    }

    // Ground haze follows the player; layers drift slowly against each other.
    const g = hazeGroup.current
    if (g) {
      hazeTarget.set(preset.hazeColor)
      haze.colorU.value.lerp(hazeTarget, k)
      haze.opacityU.value += (preset.haze * (1 - hazeClear) - haze.opacityU.value) * k
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
