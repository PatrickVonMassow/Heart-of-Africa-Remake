// The grass fire's flames and smoke (design.md §19.8/§19.13): TSL materials and
// geometry for the two instanced sprite sets Wildlife.tsx places along the
// burning line from grassFireFront.ts. MODULE singletons (point 96): a fresh
// material per mount would re-link the travel programs on every re-entry.
//
// The flames are camera-facing tongues whose shape is a scrolling noise inside
// each sprite; the sprite itself never moves or scales per frame. The line it
// replaces was 14 equal quads each scaled by |sin(9t + 1.7·i)| — a phase that
// steps by 1.7 rad per neighbour, i.e. a wave TRAVELLING down the line at about
// five quads a second, which is the "strange waves" read at bird's-eye
// distance. Here every tongue animates on its own seed, with no phase that
// relates one to the next, so nothing travels along the line.

import * as THREE from 'three/webgpu'
import { attribute, float, hash, instanceIndex, mix, mx_fractal_noise_float, smoothstep, time, uniform, uv, vec2, vec3 } from 'three/tsl'
import { QUALITY_PRESETS, DETAIL_LEVELS } from '../../config/quality'

type FloatNode = ReturnType<typeof float>

/** Instance capacity: the richest level's count, so a level switch never rebuilds. */
export const FIRE_FLAME_MAX = Math.max(...DETAIL_LEVELS.map((l) => QUALITY_PRESETS[l].grassFireFlames))
export const FIRE_SMOKE_MAX = Math.max(...DETAIL_LEVELS.map((l) => QUALITY_PRESETS[l].grassFireSmoke))

/** Overall flame brightness (fades the tongues out as the line burns out). */
export const FIRE_FLAME_FADE_U = uniform(1)

/** A unit quad standing on its lower edge, so a sprite's origin is its foot. */
export const fireFlameGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)

/** A unit quad centred on its origin, plus one fade value per puff. */
export const fireSmokeGeo = new THREE.PlaneGeometry(1, 1)
export const fireSmokeFade = new THREE.InstancedBufferAttribute(new Float32Array(FIRE_SMOKE_MAX), 1)
fireSmokeFade.setUsage(THREE.DynamicDrawUsage)
fireSmokeGeo.setAttribute('puffFade', fireSmokeFade)

function flameMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = THREE.DoubleSide
  m.blending = THREE.AdditiveBlending
  const seed = hash(instanceIndex.toFloat().mul(7.31).add(1.7)).mul(40) as unknown as FloatNode
  const rate = hash(instanceIndex.toFloat().mul(3.17).add(9.1)).mul(0.9).add(2.2) as unknown as FloatNode
  const p = uv()
  const n = mx_fractal_noise_float(vec3(p.x.mul(2.4).add(seed), p.y.mul(1.7).sub(time.mul(rate)), seed), 2) as unknown as FloatNode
  // The tongue: wide at the foot, narrowing to a ragged tip; the noise bends
  // its edges and licks its tip, so no two tongues and no two moments match.
  const cx = p.x.sub(0.5).abs().mul(2)
  const width = float(1).sub(p.y).pow(0.65).mul(n.mul(0.35).add(0.9))
  const body = smoothstep(float(0), float(0.28), width.sub(cx))
  const tip = float(1).sub(smoothstep(float(0.55), float(1.0), p.y.add(n.mul(0.22))))
  const foot = smoothstep(float(0), float(0.08), p.y)
  // White-gold at the root, orange through the body, a deep red at the tip.
  const lower = mix(vec3(1.0, 0.92, 0.62), vec3(1.0, 0.5, 0.1), smoothstep(float(0.02), float(0.45), p.y))
  m.colorNode = mix(lower, vec3(0.75, 0.16, 0.03), smoothstep(float(0.45), float(0.9), p.y)).mul(1.7)
  m.opacityNode = body.mul(tip).mul(foot).mul(FIRE_FLAME_FADE_U).clamp(0, 1)
  return m
}

function smokeMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = THREE.DoubleSide
  const seed = hash(instanceIndex.toFloat().mul(5.13).add(0.3)).mul(30) as unknown as FloatNode
  const p = uv()
  const d = p.sub(vec2(0.5, 0.5)).length().mul(2)
  const n = mx_fractal_noise_float(vec3(p.mul(2.2).add(seed), time.mul(0.25)), 2) as unknown as FloatNode
  const puff = float(1).sub(smoothstep(float(0.25), float(1.0), d.add(n.mul(0.25))))
  const fade = attribute('puffFade', 'float') as unknown as FloatNode
  // Grass smoke: a warm grey, darker in its core.
  m.colorNode = mix(vec3(0.33, 0.3, 0.27), vec3(0.55, 0.52, 0.48), d)
  m.opacityNode = puff.mul(n.mul(0.25).add(0.75)).mul(fade).mul(0.62).clamp(0, 1)
  return m
}

export const fireFlameMat = flameMaterial()
export const fireSmokeMat = smokeMaterial()
