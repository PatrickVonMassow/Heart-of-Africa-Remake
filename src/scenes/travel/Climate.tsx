// Region-dependent climate optics for the travel view (design.md §19):
// desert heat haze, humid jungle mist, clear highland air. Implemented as a
// smoothly interpolated scene fog plus low ground haze layers whose color and
// opacity follow the current region. Purely visual.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { float, hash, instanceIndex, max, mix, mx_fractal_noise_float, positionLocal, positionWorld, smoothstep, time, uniform, uv, vec3 } from 'three/tsl'
import { demElevation, demInlandWater } from '../../render/demElevation'
import { balance, START_YEAR } from '../../config/balance'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { setSkyHarmattan, setSkyOvercast } from '../../render/skyOvercast'
import { setHail } from '../../render/seasonalSnow'
import { smoothedWetnessAt } from '../../render/seasonField'
import {
  CURRENT_WEATHER,
  HARMATTAN_PALE,
  hailAt,
  harmattanAt,
  harmattanSkyParams,
  RAIN_GRAY,
  rainAmount,
  seasonFogParams,
  skyOvercastParams,
} from '../../systems/season'
import { elevationAt } from '../../world/geodata'
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

// Rain field (design.md §19 seasons, point 120c): thin falling streaks in a
// column around the traveller. MODULE singletons like the fog (point 96): a
// fresh material per mount would re-link travel programs on every re-entry.
const RAIN_COUNT = 900
const RAIN_RADIUS = 55
const RAIN_HEIGHT = 42
const RAIN_FALL_SPEED = 26
let rainSingleton: { material: THREE.MeshBasicNodeMaterial; opacityU: { value: number }; hailU: { value: number } } | null = null
function getRain() {
  if (rainSingleton) return rainSingleton
  const opacityU = uniform(0)
  const hailU = uniform(0)
  const m = new THREE.MeshBasicNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = THREE.DoubleSide
  m.fog = false
  // Per-instance placement from the instance index alone — no matrices, no CPU
  // per-frame work: a hashed xz offset inside the column and a fall phase that
  // wraps over the column height.
  const i = instanceIndex.toFloat()
  const rx = hash(i.mul(3).add(1)).sub(0.5).mul(RAIN_RADIUS * 2)
  const rz = hash(i.mul(3).add(2)).sub(0.5).mul(RAIN_RADIUS * 2)
  const phase = hash(i.mul(3))
  const fall = phase.mul(RAIN_HEIGHT).sub(time.mul(RAIN_FALL_SPEED)).mod(RAIN_HEIGHT)
  m.positionNode = positionLocal.add(vec3(rx, fall, rz))
  // Hail whitens the falling streaks into pellets (point 141b).
  m.colorNode = mix(vec3(0.62, 0.68, 0.75), vec3(0.95, 0.96, 0.98), hailU)
  // Fade toward the column edge so no square silhouette shows, and thin the
  // streaks with the rain amount.
  const edge = max(rx.abs(), rz.abs()).div(RAIN_RADIUS)
  m.opacityNode = opacityU.mul(smoothstep(float(1), float(0.55), edge)).mul(0.75)
  rainSingleton = { material: m, opacityU, hailU }
  return rainSingleton
}
let rainGeometrySingleton: THREE.PlaneGeometry | null = null
function getRainGeometry() {
  // A slim vertical quad; the second, 90°-rotated instance set crosses it so
  // the streaks read from every camera yaw.
  rainGeometrySingleton ??= new THREE.PlaneGeometry(0.06, 1.35)
  return rainGeometrySingleton
}

// MODULE singletons (point 96): scene.fog participates in every material's
// pipeline cache key, so a fresh Fog instance per mount would invalidate and
// re-link the whole travel program set on re-entry after a place visit.
// Exported so the flora streaming can size its spawn circle to the fog far —
// the definitive visible limit, beyond which nothing renders (point 171).
export const TRAVEL_FOG = new THREE.Fog('#cfe0ea', 95, 260)
const TRAVEL_BACKGROUND = new THREE.Color('#cfe0ea')

export function Climate() {
  const scene = useThree((s) => s.scene)
  const hazeGroup = useRef<THREE.Group>(null)
  const rainGroup = useRef<THREE.Group>(null)
  const rain = getRain()

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
  const rainColor = useMemo(() => new THREE.Color(), [])
  const dustColor = useMemo(() => new THREE.Color(), [])
  const hazeTarget = useMemo(() => new THREE.Color(), [])
  /** This frame's effective season wetness, for the dev hook. */
  const wetness = useRef(0)

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
      seasonWetness: () => wetness.current,
      rainOpacity: () => rain.opacityU.value,
      dust: () => CURRENT_WEATHER.dust,
      hail: () => rain.hailU.value,
    }
    return () => {
      delete w.__climate
    }
  }, [scene, haze, rain])

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

    // Season (design.md §19, point 120): the wet season closes the sight lines
    // and grays the light toward overcast — derived from the in-game date and
    // the traveller's place (lat/lon/elevation), or forced by the debug
    // selector. The zoomed-out debug view stays season-free like it stays
    // haze-free: clearView already lerps the fog to the horizon regardless.
    const lon = s.pos.x / 10
    const lat = -s.pos.z / 10
    // Point 167: the traversal weather samples the SPATIALLY-SMOOTHED wetness
    // (the same blurred zone-weight field the greenness uses), so rain/fog/dim
    // ramp across a climate-zone border instead of snapping on within a stride.
    // The discrete effectiveWetness (one climateZoneAt zone) stepped at borders.
    const wet = smoothedWetnessAt(
      s.day, lat, lon, START_YEAR,
      useUi.getState().seasonWetnessOverride,
    )
    wetness.current = wet
    CURRENT_WEATHER.wetness = wet
    // The harmattan (point 140): the Sahel's dry-season dust pall. Its own
    // driver beside the wetness — the dust season IS the dry season, so the
    // two never fire together at one place.
    const dust = harmattanAt(s.day, lat, lon, START_YEAR)
    CURRENT_WEATHER.dust = dust
    const fogSeason = seasonFogParams(wet, balance.season.weatherStrength)
    const pall = harmattanSkyParams(dust, balance.season.weatherStrength)

    // The dome grays with the fog, and stays season-free in the debug zoom for
    // the same reason the haze does.
    const sky = skyOvercastParams(wet, balance.season.weatherStrength)
    setSkyOvercast(sky.grayMix * (1 - clearView), sky.cloudBoost * (1 - clearView))
    setSkyHarmattan(pall.paleMix * (1 - clearView))

    // Rain follows the traveller and fades out in the debug zoom, like the
    // haze: a zoomed-out map view full of streaks would read as noise.
    // Hail (point 141b): rare, deterministic, only inside a heavy storm. The
    // pellets ride the rain field (whitened, via hailU) and the ground takes a
    // brief white dusting around the storm cell.
    const hail = hailAt(s.day, lat, lon, START_YEAR, elevationAt(lat, lon)) *
      Math.min(1, Math.max(0, balance.season.weatherStrength))
    setHail(hail * (1 - hazeClear), s.pos.x, s.pos.z)
    rain.hailU.value += (hail - rain.hailU.value) * k
    const rainTarget = rainAmount(wet, balance.season.weatherStrength) * (1 - hazeClear)
    rain.opacityU.value += (rainTarget - rain.opacityU.value) * k
    const rg = rainGroup.current
    if (rg) {
      rg.visible = rain.opacityU.value > 0.01
      if (rg.visible) rg.position.set(s.pos.x, 0, s.pos.z)
    }

    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      targetColor.set(preset.color)
      rainColor.set(RAIN_GRAY)
      targetColor.lerp(rainColor, fogSeason.grayMix * (1 - clearView))
      // The dust pall whitens the fog and closes the sight lines harder than
      // the rain does ("a milky pall that masks distant views", <=1km haze).
      dustColor.set(HARMATTAN_PALE)
      targetColor.lerp(dustColor, pall.paleMix * (1 - clearView))
      fog.color.lerp(targetColor, k)
      const range = fogSeason.rangeFactor * pall.rangeFactor
      const nearT = preset.near * range + (6000 - preset.near * range) * clearView
      const farT = preset.far * range + (12000 - preset.far * range) * clearView
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
    <>
      <group ref={hazeGroup} visible={false}>
        {Array.from({ length: HAZE_LAYERS }, (_, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, i * 1.3]} material={haze.material} renderOrder={5}>
            <planeGeometry args={[95, 95]} />
          </mesh>
        ))}
      </group>
      <group ref={rainGroup} visible={false}>
        {/* Tilted like wind-driven rain — and the lean turns face area toward
            the high bird's-eye camera, where a plumb streak is nearly edge-on
            and invisible. */}
        {[0, Math.PI / 2].map((ry) => (
          <instancedMesh
            key={ry}
            args={[getRainGeometry(), rain.material, RAIN_COUNT]}
            rotation={[0.38, ry, 0]}
            renderOrder={6}
            frustumCulled={false}
          />
        ))}
      </group>
    </>
  )
}
