// Shared sky dome: TSL gradient sky with sun disc, halo and drifting
// clouds. TSL keeps it renderer-agnostic (WebGPU / WebGL 2, CLAUDE.md §3).

import { useLayoutEffect, useMemo, useRef } from 'react'
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
  uniform,
  vec3,
} from 'three/tsl'
import { HARMATTAN_PALE, RAIN_GRAY } from '../systems/season'
import { HARMATTAN_DUST_U, OVERCAST_CLOUDS_U, OVERCAST_GRAY_U } from './skyOvercast'
import type { SkyPreset } from './skyPresets'

/**
 * Sky dome centered on the camera. `sunDirection` must match the scene's
 * directional light so the sun disc and the shadows agree; both come from
 * the one scene sun (render/sceneSun.ts). It is a uniform, so a new date or
 * latitude moves the disc without rebuilding the material.
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
  const sunU = useMemo(() => uniform(new THREE.Vector3(0, 1, 0)), [])
  useLayoutEffect(() => {
    sunU.value.set(...sunDirection).normalize()
    // Live check (enrichments --section=solar-sun): the dome's real sun.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__skySun = sunU.value
  }, [sunU, sunDirection])

  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial()
    m.side = THREE.BackSide
    m.depthWrite = false
    m.fog = false

    const dir = normalize(positionLocal)
    const y = dir.y
    const sun = normalize(sunU)
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

    // Low afternoon sun (design.md §2.7): the presets are authored for a high
    // sun, so as it drops the horizon warms and reddens — strongest under the
    // sun, a faint glow opposite — and the zenith loses some of its noon blue.
    // sin(elevation) runs ~0.12 (7°) .. ~0.6 (37°) at the default hour.
    const lowSun = float(1).sub(smoothstep(float(0.1), float(0.62), sun.y))
    // Horizontal directions divided by a floored length, not normalize(): an
    // overhead sun (or the view straight up) has a zero xz and would yield NaN.
    const flatDir = (v: typeof sun) => v.xz.div(max(v.xz.length(), 1e-4))
    const towardSun = max(dot(flatDir(dir), flatDir(sun)), 0).mul(0.75).add(0.25)
    const band = float(1).sub(smoothstep(float(0.0), float(0.42), y)).mul(smoothstep(float(-0.02), float(0.01), y))
    const warmCol = mix(color('#f2b27a'), color('#e0703c'), lowSun.mul(towardSun))
    col = mix(col, warmCol, band.mul(towardSun).mul(lowSun).mul(0.62))
    col = col.mul(float(1).sub(lowSun.mul(0.18).mul(smoothstep(float(0.3), float(1), y))))

    // Sun disc plus a wide warm halo. Under the harmattan (point 140) the
    // disc shows Dobson's "mild red" through the pall, and the HALO is MUTED —
    // the counter-intuitive, researched half: "sunrises and sunsets lose their
    // lustre; haloes may disappear altogether". Do not make the dust sunset
    // spectacular; the phenomenon is the opposite.
    const s = max(mu, 0)
    const disc = pow(s, float(1200)).mul(3.0)
    // HARMATTAN_DUST_U carries paleMix = 0.7·d (harmattanSkyParams), so /0.7
    // recovers the dust d; 0.75 and 0.8 are that function's haloMute and
    // sunRedden, keeping the halo factor >= 0.25.
    const halo = pow(s, float(6)).mul(0.22).mul(float(1).sub(HARMATTAN_DUST_U.mul(0.75 / 0.7)))
    const sunCol = mix(color(preset.sun), color('#c4502a'), HARMATTAN_DUST_U.mul(0.8 / 0.7).clamp(0, 1))
    col = col.add(sunCol.mul(disc.add(halo)))

    // Slow drifting cloud bank, faded out toward the horizon. Built
    // unconditionally so the wet season can thicken the deck over any preset;
    // the presence factor fades a very thin deck out.
    {
      const effClouds = float(preset.clouds).add(OVERCAST_CLOUDS_U).clamp(0, 1)
      const presence = effClouds.mul(4).clamp(0, 1)
      const cuv = dir.xz.div(y.abs().add(0.22)).mul(0.9)
      // Remap the signed MaterialX noise to [0, 1] before thresholding.
      const n = mx_fractal_noise_float(vec3(cuv.x.add(time.mul(0.006)), cuv.y, 3.7), 4)
        .mul(0.5)
        .add(0.5)
      const cover = smoothstep(float(0.62).sub(effClouds.mul(0.22)), float(0.85), n)
        .mul(smoothstep(float(0.02), float(0.18), y))
        .mul(presence)
      // Rain clouds are the darker, heavier end of the same deck.
      const cloudCol = mix(color('#f6f9fc'), color('#c8d2da'), n).mul(
        float(1).sub(OVERCAST_CLOUDS_U.mul(0.35)),
      )
      col = mix(col, cloudCol, cover.mul(0.9))
    }

    // Overcast (§19.13): the whole dome, sun disc included, washes toward the
    // rain tone — a dimmed sun under a bright blue sky would read as a bug.
    col = mix(col, color(RAIN_GRAY).mul(0.62), OVERCAST_GRAY_U)
    // The harmattan pall (point 140): a whitish-ochre dust wash, NOT the wet
    // gray — the sky loses its blue into a milky pall. Applied after the rain
    // mix; the two never fire together (the dust season is the dry season).
    col = mix(col, color(HARMATTAN_PALE).mul(0.9), HARMATTAN_DUST_U)

    m.colorNode = col
    return m
  }, [preset, sunU])

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
