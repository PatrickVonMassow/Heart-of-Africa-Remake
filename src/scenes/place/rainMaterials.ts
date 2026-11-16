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
  vec3,
  vec4,
} from 'three/tsl'
import { balance } from '../../config/balance'

// The column rises from the ground under each drop, so it is 1.5 m (the eye
// height) taller than the old eye-based 15 m one. RAIN_COUNT is the low
// preset's count (and the tests' default); a preset's `rainDrops` sets it.
export const RAIN_COUNT = 770
export const RAIN_RADIUS = 16 // a tight column around the head, not the travel 55
export const RAIN_HEIGHT = 16.5 // from the ground under each drop upward
export const RAIN_FALL_SPEED = 22
const STREAK_WIDTH = 0.02
const STREAK_LENGTH = balance.rain.dropLengthM
const RAIN_COLOR: [number, number, number] = [0.66, 0.72, 0.8]
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
    /** tan of the camera's vertical half-FOV (the place camera's fov 50). */
    tanHalfFov: uniform(Math.tan((25 * Math.PI) / 180)),
  }
}
export type RainUniforms = ReturnType<typeof createRainUniforms>

/** The per-drop spot attribute (x, arrival y, z, water flag), shared by the
 *  drops and their impacts. */
function createRainSpots(count: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4)
  a.setUsage(THREE.DynamicDrawUsage)
  return a
}

/** Drop and impact materials and geometries over one fresh spot buffer (so a
 *  rebuild disposes its own buffer only); `lit` is the quality lever. */
export function buildRainMaterials(uniforms: RainUniforms, lit: boolean, count = RAIN_COUNT) {
  const spots = createRainSpots(count)
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
  // Near the eye a streak shortens to at most dropMaxFrameFraction of the frame,
  // thins to its width at dropWidthCapM and fades out before its full length
  // fits (rainTouch.ts: streakFitDistance, dropLengthScale, dropWidthScale,
  // dropNearFade), so none reads as a pole.
  const base = vec3(spot.x, spot.y.add(fall), spot.z)
  const centreDist = base.add(vec3(0, STREAK_LENGTH / 2, 0)).sub(cameraPosition).length()
  const fit = float(STREAK_LENGTH).div(uniforms.tanHalfFov.mul(2 * balance.rain.dropMaxFrameFraction))
  const shorten = centreDist.div(fit).clamp(0, 1)
  const thin = centreDist.div(balance.rain.dropWidthCapM).clamp(0.05, 1)
  dm.positionNode = positionLocal.mul(vec3(thin, shorten, thin)).add(base)
  const nearFade = smoothstep(float(balance.rain.dropNearFadeM), fit, centreDist)
  const dropAlpha = uniforms.opacity.mul(edgeFade).mul(nearFade).mul(balance.rain.dropOpacity)
  if (lit) {
    // Lit streak: dim against the bright sky behind an upward glance, bright
    // against the dark huts and ground at eye level, glinting toward the sun.
    const view = normalize(positionWorld.sub(cameraPosition))
    const skyBehind = smoothstep(float(-0.02), float(0.3), view.y)
    const visible = mix(float(1), float(balance.rain.dropSkyVisibility), skyBehind)
    const glint = max(dot(view, uniforms.sun), float(0)).pow(6).mul(balance.rain.dropSunGlint)
    dm.colorNode = rainCol.mul(uniforms.light).mul(glint.add(0.8)).mul(variation)
    dm.opacityNode = dropAlpha.mul(visible).mul(variation.mul(0.4).add(0.6))
  } else {
    dm.colorNode = rainCol
    dm.opacityNode = dropAlpha
  }
  const dg = crossedStreak()
  dg.setAttribute('rainSpot', spots)

  // The impact: ONE flat ring just above the surface, tinted by the water flag
  // — pale on water, dark wet earth on ground (a faint crown, never a bright
  // disc); it shrinks to a few pixels and fades out near the eye
  // (rainTouch.ts impactSizeScale, dropNearFade).
  const im = new THREE.MeshBasicNodeMaterial()
  im.transparent = true
  im.depthWrite = false
  im.side = THREE.DoubleSide
  im.fog = false
  // w: 1 water ring, 0 ground crown, −1 none (under a roof).
  const water = spot.w.max(0)
  const splashes = spot.w.greaterThanEqual(0).select(float(1), float(0))
  const age = float(RAIN_HEIGHT).sub(fall).div(RAIN_FALL_SPEED)
  const life = balance.rain.impactLife
  const t = age.div(life).clamp(0, 1)
  const eyeDist = vec3(spot.x, spot.y, spot.z).sub(cameraPosition).length()
  const impactFit = float(2 * balance.rain.impactRadiusM).div(
    uniforms.tanHalfFov.mul(2 * balance.rain.impactMaxFrameFraction),
  )
  const sizeCap = eyeDist.div(impactFit).clamp(0, 1)
  const radius = t.mul(0.75).add(0.25).mul(balance.rain.impactRadiusM).mul(sizeCap)
  const p = positionLocal // a unit quad in x/y, [-1, 1]
  im.positionNode = vec3(spot.x, spot.y.add(RING_LIFT), spot.z).add(vec3(p.x, float(0), p.y).mul(radius))
  const d = uv().sub(0.5).length().mul(2)
  const ring = smoothstep(float(0.6), float(0.82), d).mul(smoothstep(float(1), float(0.84), d))
  const eyeFade = smoothstep(float(balance.rain.impactNearFadeM), float(balance.rain.impactNearFullM), eyeDist)
  const fade = float(1).sub(t).pow(2).mul(age.lessThan(life).select(float(1), float(0))).mul(splashes)
  im.colorNode = mix(vec3(...balance.rain.impactGroundColor), rainCol.mul(0.7), water).mul(uniforms.light)
  im.opacityNode = ring
    .mul(fade)
    .mul(eyeFade)
    .mul(edgeFade)
    .mul(uniforms.opacity)
    .mul(balance.rain.impactOpacity)
  const ig = new THREE.PlaneGeometry(2, 2)
  ig.setAttribute('rainSpot', spots)
  return { spots, dropMaterial: dm, dropGeometry: dg, impactMaterial: im, impactGeometry: ig }
}
