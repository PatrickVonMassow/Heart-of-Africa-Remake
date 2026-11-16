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
import { effectiveRainImpacts, effectiveRainLitDrops, useUi } from '../../state/ui'
import { rainAmount, sunDimFactor } from '../../systems/season'
import { PlaceGroundContext } from './PlaceGroundContext'
import { buildRainMaterials, createRainUniforms, RAIN_COUNT, RAIN_RADIUS } from './rainMaterials'
import { shelterCoverAt } from '../../render/shelterWetness'
import { dropArrival, dropBases, impactFlag, wrapToColumn } from './rainTouch'

/** Seconds between full arrival refreshes (dig spoil grows under the rain). */
const ARRIVAL_REFRESH_S = 1

export function PlaceRain({ wetness }: { wetness: React.MutableRefObject<number> }) {
  const ground = useContext(PlaceGroundContext)
  const sun = useSceneSun()
  const lit = useUi(effectiveRainLitDrops)
  const impacts = Math.min(RAIN_COUNT, Math.max(0, useUi(effectiveRainImpacts)))
  const group = useRef<THREE.Group>(null)
  const state = useRef({ refreshIn: 0, live: false, tiles: new Int32Array(RAIN_COUNT * 2) })

  const bases = useMemo(() => dropBases(RAIN_COUNT, RAIN_RADIUS), [])
  const uniforms = useMemo(createRainUniforms, [])
  // `spots`: per-drop world spot (x, arrival y, z, water flag), shared by drops and impacts.
  const { spots, dropMaterial, dropGeometry, impactMaterial, impactGeometry } = useMemo(
    () => buildRainMaterials(uniforms, lit),
    [lit, uniforms],
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
    state.current.live = false
  }, [ground, spots])

  useFrame(({ camera }, dt) => {
    const target = rainAmount(wetness.current, balance.season.weatherStrength)
    uniforms.opacity.value += (target - uniforms.opacity.value) * Math.min(1, dt * 1.5)
    const on = uniforms.opacity.value > 0.01
    if (group.current) group.current.visible = on
    if (!on) {
      state.current.live = false
      return
    }
    uniforms.eye.value.set(camera.position.x, camera.position.z)
    uniforms.sun.value.set(sun.light[0], sun.light[1], sun.light[2]).normalize()
    uniforms.light.value = sunDimFactor(wetness.current, balance.season.weatherStrength)
    if (camera instanceof THREE.PerspectiveCamera) {
      uniforms.tanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    }
    // Arrivals: a drop is re-sampled when it wraps to a new tile, and all of
    // them once a second (or on a fresh start) so growing spoil is followed.
    const st = state.current
    st.refreshIn -= dt
    const all = !st.live || st.refreshIn <= 0
    if (all) st.refreshIn = ARRIVAL_REFRESH_S
    st.live = true
    const a = spots.array as Float32Array
    const period = RAIN_RADIUS * 2
    let dirty = false
    const tiles = st.tiles
    for (let k = 0; k < RAIN_COUNT; k++) {
      const x = wrapToColumn(bases[k * 2], camera.position.x, period)
      const z = wrapToColumn(bases[k * 2 + 1], camera.position.z, period)
      const tx = Math.round((x - bases[k * 2]) / period)
      const tz = Math.round((z - bases[k * 2 + 1]) / period)
      if (!all && tiles[k * 2] === tx && tiles[k * 2 + 1] === tz) continue
      tiles[k * 2] = tx
      tiles[k * 2 + 1] = tz
      const arrival = dropArrival(ground, x, z)
      a[k * 4] = x
      a[k * 4 + 1] = arrival.y
      a[k * 4 + 2] = z
      a[k * 4 + 3] = impactFlag(arrival, shelterCoverAt(x, z))
      dirty = true
    }
    if (dirty) spots.needsUpdate = true
  })

  return (
    <group ref={group} name="place-rain">
      <instancedMesh args={[dropGeometry, dropMaterial, RAIN_COUNT]} frustumCulled={false} />
      {impacts > 0 && (
        <instancedMesh
          key={impacts}
          name="place-rain-impacts"
          args={[impactGeometry, impactMaterial, impacts]}
          frustumCulled={false}
        />
      )}
    </group>
  )
}
