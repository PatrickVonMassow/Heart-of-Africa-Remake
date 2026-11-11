// TSL material of the 3D spring body (design.md §11.3, springGeometry.ts).
// Renderer-agnostic node material (WebGPU and the WebGL 2 fallback alike):
// - the welling dome BOILS: fractal noise plus a pulse lift its vertices,
// - concentric ripple rings run outward over the pool as a vertex wave with
//   bright crests,
// - the welling centre glows a bright, aerated white-blue,
// - the apron is damp dark ground that fades into the terrain at the rim.
// One singleton material (no per-spring re-link); its two live levers are
// module uniforms the <Spring> component mirrors from balance every frame.

import * as THREE from 'three/webgpu'
import {
  attribute,
  clamp,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl'
import { SPRING_FORM } from './springGeometry'

/** Vertical amplitude of the boil, world units (mirrors balance.spring.bubbleAmplitude). */
export const SPRING_BUBBLE_AMP_U = uniform(0.045)
/** Brightness of the welling centre and the ripple crests (mirrors balance.spring.glow). */
export const SPRING_GLOW_U = uniform(0.55)

let cache: THREE.MeshStandardNodeMaterial | null = null

export function getSpringMaterial(): THREE.MeshStandardNodeMaterial {
  if (cache) return cache
  const m = (cache = new THREE.MeshStandardNodeMaterial())
  // Transparent only so the apron's outer edge can fade into the ground;
  // the water itself is opaque and writes depth.
  m.transparent = true
  m.depthWrite = true
  m.metalness = 0.02

  // Cast: the TSL typings do not carry the attribute's float type through.
  const zone = attribute('springZone', 'float') as unknown as ReturnType<typeof float>
  const wet = attribute('springWet', 'float') as unknown as ReturnType<typeof float>
  const domeEdge = SPRING_FORM.domeFraction / SPRING_FORM.poolFraction

  // 1 on the dome, 0 past it.
  const domeMask = smoothstep(float(0), float(domeEdge), zone).oneMinus()
  // The ripple band between the dome and the pool edge.
  const rippleMask = smoothstep(float(domeEdge * 0.7), float(domeEdge * 1.15), zone).mul(
    smoothstep(float(0.82), float(1.0), zone).oneMinus(),
  )
  // 1 on the water sheet, falling across the shoreline into the apron.
  const waterMask = smoothstep(float(0.8), float(0.97), wet)

  // Boil: fine noise drifting in time plus a welling pulse from the centre.
  const boil = mx_fractal_noise_float(
    vec3(positionLocal.x.mul(9), positionLocal.z.mul(9), time.mul(1.8)),
    2,
  )
  const pulse = sin(time.mul(5.0).sub(zone.mul(12)))
  const wave = sin(zone.mul(19).sub(time.mul(3.2)))
  const lift = domeMask
    .mul(boil.mul(0.7).add(pulse.mul(0.3)))
    .add(rippleMask.mul(wave).mul(0.35))
    .mul(SPRING_BUBBLE_AMP_U)
    .mul(waterMask)
  m.positionNode = positionLocal.add(vec3(0, lift, 0))

  // Colour: deep pool water, lighter shallow welling, bright aerated centre,
  // pale ripple crests, damp dark earth on the apron.
  const crest = smoothstep(float(0.55), float(0.95), wave.mul(0.5).add(0.5)).mul(rippleMask)
  const froth = clamp(boil.mul(0.5).add(0.5), 0, 1)
  const welling = domeMask.mul(froth.mul(0.5).add(0.5))
  const deep = mix(color('#24607f'), color('#5fa9bd'), domeMask.mul(0.7))
  const bright = clamp(welling.mul(0.8).add(crest.mul(0.55)).mul(SPRING_GLOW_U.mul(1.4)), 0, 1)
  const water = mix(deep, color('#e6f7fa'), bright)
  const damp = mix(color('#3f3a2c'), color('#5b5340'), wet.oneMinus())
  m.colorNode = mix(damp, water, waterMask)
  m.emissiveNode = color('#bfe9f2').mul(bright.mul(0.35).mul(waterMask))
  m.roughnessNode = mix(float(0.9), float(0.08), waterMask)
  // The apron fades out onto the terrain over its outer part.
  m.opacityNode = smoothstep(float(0.0), float(0.45), wet)
  return m
}
