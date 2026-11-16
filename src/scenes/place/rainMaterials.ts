// The settlement rain's node materials (design.md §19.13), built apart from
// the component so Vitest can generate both backends' shaders from them.

import * as THREE from 'three/webgpu'
import {
  attribute,
  cameraPosition,
  dot,
  float,
  floor,
  hash,
  instanceIndex,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { balance } from '../../config/balance'

type FloatNode = ReturnType<typeof float>

// The column rises from the ground under each drop, so it is 1.5 m (the eye
// height) taller than the old eye-based 15 m one, with 10 % more drops: the
// sky above the eye keeps the old 700 drops over the same 15 m span.
export const RAIN_COUNT = 770
export const RAIN_RADIUS = 16 // a tight column around the head, not the travel 55
export const RAIN_HEIGHT = 16.5 // from the ground under each drop upward
export const RAIN_FALL_SPEED = 22
const STREAK_WIDTH = 0.03
const STREAK_LENGTH = 1.1 // longer than the travel scene's so they read at eye height
const RAIN_COLOR: [number, number, number] = [0.66, 0.72, 0.8]
const PUFF_COLOR: [number, number, number] = [0.55, 0.47, 0.37] // splashed wet earth
const RING_LIFT = 0.012 // the ring sits just above the water, never inside it

/** Two crossed slim quads with the lower tip at y = 0, so a streak reads from
 *  any yaw in one instanced draw. */
function crossedStreak(): THREE.BufferGeometry {
  const w = STREAK_WIDTH / 2
  const h = STREAK_LENGTH
  const g = new THREE.BufferGeometry()
  // prettier-ignore
  const pos = [-w, 0, 0, w, 0, 0, w, h, 0, -w, h, 0, 0, 0, -w, 0, 0, w, 0, h, w, 0, h, -w]
  // prettier-ignore
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  return g
}

/** The per-frame inputs both materials read. */
export function createRainUniforms() {
  return {
    opacity: uniform(0),
    eye: uniform(new THREE.Vector2()),
    sun: uniform(new THREE.Vector3(0, 1, 0)),
    light: uniform(1),
  }
}
export type RainUniforms = ReturnType<typeof createRainUniforms>

/** The per-drop spot attribute (x, arrival y, z, water flag), shared by the
 *  drops and their impacts. */
function createRainSpots(): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(RAIN_COUNT * 4), 4)
  a.setUsage(THREE.DynamicDrawUsage)
  return a
}

/** Drop and impact materials and geometries over one fresh spot buffer (so a
 *  rebuild disposes its own buffer only); `lit` is the quality lever. */
export function buildRainMaterials(uniforms: RainUniforms, lit: boolean) {
  const spots = createRainSpots()
  const spot = attribute('rainSpot', 'vec4') as unknown as ReturnType<typeof vec4>
  const i = instanceIndex.toFloat()
  const phase = hash(i.mul(3))
  // (phase·H − t·speed) mod H, written out: a floored mod on both backends.
  const v = phase.mul(RAIN_HEIGHT).sub(time.mul(RAIN_FALL_SPEED))
  const fall = v.sub(floor(v.div(RAIN_HEIGHT)).mul(RAIN_HEIGHT))
  const edge = max(spot.x.sub(uniforms.eye.x).abs(), spot.z.sub(uniforms.eye.y).abs()).div(RAIN_RADIUS)
  const edgeFade = smoothstep(float(1), float(0.4), edge)
  const variation = float(1).sub(hash(i.mul(7.13).add(0.5)).mul(balance.rain.dropVariation))
  const rainCol = vec3(...RAIN_COLOR)

  const dm = new THREE.MeshBasicNodeMaterial()
  dm.transparent = true
  dm.depthWrite = false
  dm.side = THREE.DoubleSide
  dm.fog = false
  // Near the eye a streak thins (its projected width capped at the width it has
  // at dropWidthCapM) and fades out (rainTouch.ts dropWidthScale/dropNearFade).
  const base = vec3(spot.x, spot.y.add(fall), spot.z)
  const centreDist = base.add(vec3(0, STREAK_LENGTH / 2, 0)).sub(cameraPosition).length()
  const thin = centreDist.div(balance.rain.dropWidthCapM).clamp(0.05, 1)
  dm.positionNode = positionLocal.mul(vec3(thin, 1, thin)).add(base)
  const nearFade = smoothstep(
    float(balance.rain.dropNearFadeM),
    float(balance.rain.dropNearFullM),
    positionWorld.sub(cameraPosition).length(),
  )
  if (lit) {
    // Lit streak: dim against the bright sky behind an upward glance, bright
    // against the dark huts and ground at eye level, glinting toward the sun.
    const view = normalize(positionWorld.sub(cameraPosition))
    const skyBehind = smoothstep(float(-0.02), float(0.3), view.y)
    const visible = mix(float(1), float(balance.rain.dropSkyVisibility), skyBehind)
    const glint = max(dot(view, uniforms.sun), float(0)).pow(6).mul(balance.rain.dropSunGlint)
    dm.colorNode = rainCol.mul(uniforms.light).mul(glint.add(0.8)).mul(variation)
    dm.opacityNode = uniforms.opacity
      .mul(edgeFade)
      .mul(nearFade)
      .mul(0.8)
      .mul(visible)
      .mul(variation.mul(0.4).add(0.6))
  } else {
    dm.colorNode = rainCol
    dm.opacityNode = uniforms.opacity.mul(edgeFade).mul(nearFade).mul(0.8)
  }
  const dg = crossedStreak()
  dg.setAttribute('rainSpot', spots)

  // The impact: ONE quad, parameterised by the water flag — flat and ringed
  // on water, a standing soft puff (turned to the eye) on ground.
  const im = new THREE.MeshBasicNodeMaterial()
  im.transparent = true
  im.depthWrite = false
  im.side = THREE.DoubleSide
  im.fog = false
  // w: 1 ring (water), 0 puff (ground), −1 none (under a roof).
  const water = spot.w.max(0)
  const splashes = spot.w.greaterThanEqual(0).select(float(1), float(0))
  const age = float(RAIN_HEIGHT).sub(fall).div(RAIN_FALL_SPEED)
  const life = balance.rain.impactLife
  const t = age.div(life).clamp(0, 1)
  const radius = t.mul(0.75).add(0.25).mul(balance.rain.impactRadiusM)
  const toEye = vec2(cameraPosition.x.sub(spot.x), cameraPosition.z.sub(spot.z))
  // (the tiny x bias keeps it finite with the eye straight above the spot)
  const right = normalize(vec3(toEye.y.add(1e-4), float(0), toEye.x.negate()))
  const p = positionLocal // a unit quad in x/y, [-1, 1]
  const flat = vec3(p.x, float(0), p.y)
  const puff = right.mul(p.x).add(vec3(0, p.y.add(1).mul(0.6), 0))
  const shapeOffset = mix(puff, flat, water).mul(radius)
  im.positionNode = vec3(spot.x, spot.y.add(water.mul(RING_LIFT)), spot.z).add(shapeOffset)
  const d = uv().sub(0.5).length().mul(2)
  const ring = smoothstep(float(0.6), float(0.82), d).mul(smoothstep(float(1), float(0.84), d))
  const disc = smoothstep(float(1), float(0.15), d)
  const shape = mix(disc, ring, water) as unknown as FloatNode
  const fade = float(1).sub(t).pow(2).mul(age.lessThan(life).select(float(1), float(0))).mul(splashes)
  im.colorNode = mix(vec3(...PUFF_COLOR), rainCol, water).mul(uniforms.light)
  im.opacityNode = shape.mul(fade).mul(edgeFade).mul(uniforms.opacity).mul(balance.rain.impactOpacity)
  const ig = new THREE.PlaneGeometry(2, 2)
  ig.setAttribute('rainSpot', spots)
  return { spots, dropMaterial: dm, dropGeometry: dg, impactMaterial: im, impactGeometry: ig }
}
