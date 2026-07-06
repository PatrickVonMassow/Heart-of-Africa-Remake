// Shared sky dome: TSL gradient sky with sun disc, halo and drifting
// clouds. TSL keeps it renderer-agnostic (WebGPU / WebGL 2, CLAUDE.md §3).

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import {
  clamp,
  color,
  dot,
  exp,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  normalize,
  positionLocal,
  pow,
  smoothstep,
  time,
  vec3,
} from 'three/tsl'

export interface SkyPreset {
  zenith: string
  horizon: string
  /** Color below the horizon line (hides the dome bottom). */
  ground: string
  sun: string
  /** 0..1 cloud coverage. */
  clouds: number
}

export const TRAVEL_SKY: SkyPreset = {
  zenith: '#3d76c4',
  horizon: '#cfe0ea',
  ground: '#8a94a0',
  sun: '#fff2d0',
  clouds: 0.55,
}

export const PORT_SKY: SkyPreset = {
  zenith: '#3f7fc9',
  horizon: '#d8e6ee',
  ground: '#9aa4ac',
  sun: '#fff3d6',
  clouds: 0.4,
}

export const VILLAGE_SKY: SkyPreset = {
  zenith: '#4a82b8',
  horizon: '#e2e3c8',
  ground: '#a0a08a',
  sun: '#ffefc2',
  clouds: 0.5,
}

/**
 * Sky dome centered on the camera. `sunDirection` must match the scene's
 * directional light so the sun disc and the shadows agree.
 */
export function SkyDome({
  preset,
  sunDirection,
  radius = 900,
}: {
  preset: SkyPreset
  sunDirection: [number, number, number]
  radius?: number
}) {
  const ref = useRef<THREE.Mesh>(null)

  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial()
    m.side = THREE.BackSide
    m.depthWrite = false
    m.fog = false

    const dir = normalize(positionLocal)
    const y = dir.y
    const sun = normalize(vec3(...sunDirection))
    const mu = dot(dir, sun)

    // Single-scatter atmosphere (design.md §2): Rayleigh extinction over a
    // flat-earth air mass plus Henyey-Greenstein Mie forward scattering.
    // Compact approximation, consistent with the sun direction.
    const airMass = float(1).div(max(y, 0.0).add(0.12))
    const betaR = vec3(0.11, 0.26, 0.56) // stylized Rayleigh coefficients (r<g<b)
    const transmittance = exp(betaR.mul(airMass).negate())
    const phaseR = mu.mul(mu).add(1).mul(0.75).mul(0.4).add(0.6)
    const rayleigh = vec3(1, 1, 1).sub(transmittance).mul(phaseR)
    const g = 0.78
    const phaseM = float((1 - g * g) / (4 * Math.PI)).div(
      float(1 + g * g).sub(mu.mul(2 * g)).max(0.0001).pow(1.5),
    )
    const mie = phaseM.mul(airMass.min(6)).mul(0.045)
    const sky = rayleigh
      .mul(vec3(0.62, 0.78, 1.05))
      .add(vec3(1.0, 0.9, 0.72).mul(mie))
      .mul(1.08)

    // Regional mood tint (§19) stays as a subtle modulation.
    const tinted = mix(sky, sky.mul(color(preset.zenith).mul(2.4)), 0.14)

    // Muted ground tone below the horizon.
    const below = mix(color(preset.horizon), color(preset.ground), clamp(y.negate().mul(4), 0, 1))
    let col = mix(below, tinted, smoothstep(float(-0.015), float(0.01), y))

    // Sun disc plus a wide warm halo.
    const s = max(mu, 0)
    const disc = pow(s, float(1200)).mul(3.0)
    const halo = pow(s, float(6)).mul(0.22)
    col = col.add(color(preset.sun).mul(disc.add(halo)))

    // Slow drifting cloud bank, faded out toward the horizon.
    if (preset.clouds > 0) {
      const cuv = dir.xz.div(y.abs().add(0.22)).mul(0.9)
      // Remap the signed MaterialX noise to [0, 1] before thresholding.
      const n = mx_fractal_noise_float(vec3(cuv.x.add(time.mul(0.006)), cuv.y, 3.7), 4)
        .mul(0.5)
        .add(0.5)
      const cover = smoothstep(float(0.62 - preset.clouds * 0.22), float(0.85), n)
        .mul(smoothstep(float(0.02), float(0.18), y))
      const cloudCol = mix(color('#f6f9fc'), color('#c8d2da'), n)
      col = mix(col, cloudCol, cover.mul(0.9))
    }

    m.colorNode = col
    return m
  }, [preset, sunDirection])

  // Keep the dome glued to the camera so it behaves like a far sky.
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position)
  })

  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 32, 20]} />
    </mesh>
  )
}
