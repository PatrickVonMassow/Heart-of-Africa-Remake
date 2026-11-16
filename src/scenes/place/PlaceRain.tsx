// Rain inside a settlement (design.md §19.13, point 143). The travel scene's
// rain field is calibrated for the bird's-eye camera — a wide column of
// TILTED streaks, because a plumb streak seen from above is nearly edge-on. At
// eye height none of that holds: the player looks horizontally, so the streaks
// must be near-VERTICAL, and the column is tight around the head rather than
// the travel field's 55-unit radius. So this is its own field, not a reused one.
//
// Driven by the place's own wetness (rainAmount), which is 0 in Cairo and every
// hyper-arid coordinate — so a port in the desert never rains, with no special
// case. Not a module singleton: the place scene rebuilds its materials each
// visit anyway (unlike the travel scene, point 96), so a per-mount material is
// consistent here.
//
// The rain touches the world: each drop owns a fixed world x/z (tiled by the
// column, rainTouch.ts) whose arrival surface the CPU samples ONCE per wrap into
// an instanced attribute, so a drop ends on the ground or the water under it,
// never in mid-air. Its impact replays the same fall in the shader — no CPU
// spawn. One path for WebGPU and WebGL 2: attributes and uniforms only.
//
// OPEN: a drop still falls THROUGH a roof to the floor (only its impact is
// withheld there); ending it on the roof needs a roof-height sampler.

import { useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import { useSceneSun } from '../../render/sceneSun'
import { effectiveRainDrops, effectiveRainImpacts, effectiveRainLitDrops, useUi } from '../../state/ui'
import { rainAmount, sunDimFactor } from '../../systems/season'
import { PlaceGroundContext } from './PlaceGroundContext'
import { buildRainMaterials, createRainUniforms, RAIN_RADIUS } from './rainMaterials'
import { shelterCoverAt } from '../../render/shelterWetness'
import { createRainSpotState, dropArrival, dropBases, impactFlag, rainDropCount, stepRainSpots } from './rainTouch'

/** Seconds over which a rolling refresh re-reads every arrival (dig spoil grows
 *  slowly under the rain); spread over the frames, never one spike. */
const ARRIVAL_REFRESH_S = 2

export function PlaceRain({ wetness }: { wetness: React.MutableRefObject<number> }) {
  const ground = useContext(PlaceGroundContext)
  const sun = useSceneSun()
  const lit = useUi(effectiveRainLitDrops)
  // The preset's drop count at full rain; fewer are drawn in lighter rain.
  const count = Math.max(1, Math.round(useUi(effectiveRainDrops)))
  const impacts = Math.min(count, Math.max(0, useUi(effectiveRainImpacts)))
  const group = useRef<THREE.Group>(null)
  const dropMesh = useRef<THREE.InstancedMesh>(null)
  const impactMesh = useRef<THREE.InstancedMesh>(null)
  const state = useRef(createRainSpotState(0))

  const bases = useMemo(() => dropBases(count, RAIN_RADIUS), [count])
  const uniforms = useMemo(createRainUniforms, [])
  // `spots`: per-drop world spot (x, arrival y, z, water flag), shared by drops and impacts.
  const { spots, dropMaterial, dropGeometry, impactMaterial, impactGeometry } = useMemo(
    () => buildRainMaterials(uniforms, lit, count),
    [lit, uniforms, count],
  )

  useEffect(
    () => () => {
      dropMaterial.dispose()
      dropGeometry.dispose()
      impactMaterial.dispose()
      impactGeometry.dispose()
    },
    [dropMaterial, dropGeometry, impactMaterial, impactGeometry],
  )

  // A new ground record (place change, dig layout) or a fresh spot buffer
  // re-samples every arrival.
  useEffect(() => {
    state.current = createRainSpotState(count)
  }, [ground, spots, count])
  const sample = useMemo(
    () => (x: number, z: number) => {
      const arrival = dropArrival(ground, x, z)
      return { y: arrival.y, flag: impactFlag(arrival, shelterCoverAt(x, z)) }
    },
    [ground],
  )

  useFrame(({ camera }, dt) => {
    const target = rainAmount(wetness.current, balance.season.weatherStrength)
    uniforms.opacity.value += (target - uniforms.opacity.value) * Math.min(1, dt * 1.5)
    const on = uniforms.opacity.value > 0.01
    if (group.current) group.current.visible = on
    // Off, the sampled arrivals stay valid (a new ground resets them).
    if (!on) return
    uniforms.eye.value.set(camera.position.x, camera.position.z)
    uniforms.sun.value.set(sun.light[0], sun.light[1], sun.light[2]).normalize()
    uniforms.light.value = sunDimFactor(wetness.current, balance.season.weatherStrength)
    if (camera instanceof THREE.PerspectiveCamera) {
      uniforms.tanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    }
    // Density follows the rain: the drawn prefix of the (uniformly scattered)
    // drops grows with the rain amount; impacts stay within it.
    const drawn = rainDropCount(count, uniforms.opacity.value, balance.rain.dropDensityMinFraction)
    if (dropMesh.current) dropMesh.current.count = drawn
    if (impactMesh.current) impactMesh.current.count = Math.min(impacts, drawn)
    // Arrivals: sampled when a drop wraps to a new tile, plus a rolling refresh.
    const st = state.current
    if (st.tiles.length < drawn * 2) return // the reset effect has not run yet
    const a = spots.array as Float32Array
    const dirty = stepRainSpots(st, a, bases, drawn, camera.position.x, camera.position.z, RAIN_RADIUS * 2, dt, ARRIVAL_REFRESH_S, sample)
    if (dirty) spots.needsUpdate = true
  })

  return (
    <group ref={group} name="place-rain">
      <instancedMesh ref={dropMesh} args={[dropGeometry, dropMaterial, count]} frustumCulled={false} />
      {impacts > 0 && (
        <instancedMesh
          key={impacts}
          ref={impactMesh}
          name="place-rain-impacts"
          args={[impactGeometry, impactMaterial, impacts]}
          frustumCulled={false}
        />
      )}
    </group>
  )
}
