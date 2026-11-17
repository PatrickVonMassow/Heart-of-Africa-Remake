// The settlement rain's node materials (design.md §19.13), built apart from
// the component so Vitest can generate both backends' shaders from them.

import * as THREE from 'three/webgpu'
import {
  attribute,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cameraPosition,
  dot,
  float,
  floor,
  hash,
  mod,
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
import { rainLayerSpecs, type RainLayerSpec } from './rainLayers'

// The column rises from the ground under each drop, so it is 1.5 m (the eye
// height) taller than the old eye-based 15 m one. RAIN_COUNT is the low
// preset's count (and the tests' default); a preset's `rainDrops` sets it.
export const RAIN_COUNT = 770
export const RAIN_RADIUS = 16 // a tight column around the head, not the travel 55
export const RAIN_HEIGHT = 16.5 // from the ground under each drop upward
export const RAIN_FALL_SPEED = 22
const STREAK_WIDTH = 0.02
// The geometry's modelled length; the drawn length follows the drop's velocity
// relative to the camera (rainLayers.ts streakVector).
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
    /** The camera's aspect (width / height), to measure screen length in frame heights. */
    aspect: uniform(16 / 9),
    /** The camera's eased velocity (m/s), for the streak's relative motion. */
    camVel: uniform(new THREE.Vector3()),
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
 *  rebuild disposes its own buffer only); `lit` is the quality lever, `specs`
 *  the depth layers (rainLayers.ts; drop k is in layer k mod n). */
export function buildRainMaterials(
  uniforms: RainUniforms,
  lit: boolean,
  count = RAIN_COUNT,
  specs: readonly RainLayerSpec[] = rainLayerSpecs(1),
) {
  const spots = createRainSpots(count)
  const spot = attribute('rainSpot', 'vec4') as unknown as ReturnType<typeof vec4>
  const i = instanceIndex.toFloat()
  const n = specs.length
  // The drop's layer, and a per-layer constant picked by a select chain (one
  // node graph, no backend branch).
  const li = n === 1 ? float(0) : mod(i, float(n))
  const pick = (values: number[]) => {
    let acc = float(values[0])
    for (let j = 1; j < values.length; j++) acc = li.greaterThan(j - 0.5).select(float(values[j]), acc) as unknown as typeof acc
    return acc
  }
  const speed = pick(specs.map((l) => l.fallSpeed))
  const radius = pick(specs.map((l) => l.radiusM))
  const layerOpacity = pick(specs.map((l) => l.opacity))
  const phase = hash(i.mul(3))
  // (phase·H − t·speed) mod H, written out: a floored mod on both backends.
  const v = phase.mul(RAIN_HEIGHT).sub(time.mul(speed))
  const fall = v.sub(floor(v.div(RAIN_HEIGHT)).mul(RAIN_HEIGHT))
  const ex = spot.x.sub(uniforms.eye.x)
  const ez = spot.z.sub(uniforms.eye.y)
  const edge = max(ex.abs(), ez.abs()).div(radius)
  // Ordered smoothstep edges only (edge0 < edge1): a reversed pair is undefined
  // in GLSL, so a falling ramp is written 1 − smoothstep(lo, hi, x).
  const edgeFade = float(1).sub(smoothstep(float(0.4), float(1), edge))
  // A far layer fades out inside its inner distance, so it reads behind the near one.
  const inner = pick(specs.map((l) => l.innerFadeM))
  const innerFade =
    n === 1 ? float(1) : inner.greaterThan(0).select(smoothstep(inner.mul(0.6), inner, ex.mul(ex).add(ez.mul(ez)).sqrt()), float(1))
  const variation = float(1).sub(hash(i.mul(7.13).add(0.5)).mul(balance.rain.dropVariation))
  const rainCol = vec3(...RAIN_COLOR)

  const dm = new THREE.MeshBasicNodeMaterial()
  dm.transparent = true
  dm.depthWrite = false
  dm.side = THREE.DoubleSide
  dm.fog = false
  // Near the eye a streak shortens to at most dropMaxFrameFraction of the frame
  // AFTER the full projection (off-axis and pitch included: both tips in clip
  // space, rainTouch.ts streakScreenScale's closed form), thins to its width at
  // dropWidthCapM and fades out before its full length fits by depth alone
  // (streakFitDistance, dropNearFade), so none reads as a pole.
  // The streak is the segment the lower tip swept over the exposure, seen from
  // the moving camera (rainLayers.ts streakVector): its length and direction
  // follow the drop's velocity relative to the camera, clamped.
  const D = balance.rainDepth
  const rel = vec3(uniforms.camVel.x.negate(), speed.negate().sub(uniforms.camVel.y), uniforms.camVel.z.negate())
  const relSpeed = rel.length()
  const len = relSpeed.mul(D.exposureS).clamp(D.streakMinM, D.streakMaxM)
  // At zero relative speed the streak stands upright, as streakVector's mirror.
  const dir = relSpeed.greaterThan(1e-6).select(rel.negate().div(max(relSpeed, float(1e-6))), vec3(0, 1, 0))
  const base = vec3(spot.x, spot.y.add(fall), spot.z)
  const centreDist = base.add(dir.mul(len.mul(0.5))).sub(cameraPosition).length()
  const fit = len.div(uniforms.tanHalfFov.mul(2 * balance.rain.dropMaxFrameFraction))
  const viewProj = cameraProjectionMatrix.mul(cameraViewMatrix)
  const c0 = viewProj.mul(vec4(base, 1))
  const c1 = viewProj.mul(vec4(base.add(dir.mul(len)), 1))
  const dc = c1.sub(c0)
  const w0 = c0.w
  const maxFrac = float(balance.rain.dropMaxFrameFraction)
  const kx = dc.x.mul(w0).sub(c0.x.mul(dc.w)).mul(uniforms.aspect)
  const ky = dc.y.mul(w0).sub(c0.y.mul(dc.w))
  const k = kx.mul(kx).add(ky.mul(ky)).sqrt().mul(0.5)
  const den = k.sub(maxFrac.mul(w0).mul(dc.w))
  const solved = maxFrac.mul(w0).mul(w0).div(max(den, float(1e-9))).clamp(0, 1)
  const inFront = c0.w.greaterThan(balance.rain.streakMinDepthM).and(c1.w.greaterThan(balance.rain.streakMinDepthM))
  const shorten = inFront.select(den.greaterThan(0).select(solved, float(1)), float(0))
  const thin = centreDist.div(balance.rain.dropWidthCapM).clamp(0.05, 1)
  const along = positionLocal.y.div(STREAK_LENGTH).mul(len).mul(shorten)
  dm.positionNode = base.add(dir.mul(along)).add(vec3(positionLocal.x, 0, positionLocal.z).mul(thin))
  const nearFade = smoothstep(float(balance.rain.dropNearFadeM), fit, centreDist)
  // Soft ends (rainLayers.ts streakEndFade): a short soft head, a long tail fade.
  const t = uv().y
  const endFade = smoothstep(float(0), float(D.headSoft), t).mul(float(1).sub(smoothstep(float(1 - D.tailSoft), float(1), t)))
  const dropAlpha = uniforms.opacity
    .mul(edgeFade)
    .mul(innerFade)
    .mul(nearFade)
    .mul(endFade)
    .mul(layerOpacity)
    .mul(balance.rain.dropOpacity)
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
  const age = float(RAIN_HEIGHT).sub(fall).div(speed)
  const life = balance.rain.impactLife
  const it = age.div(life).clamp(0, 1)
  const eyeDist = vec3(spot.x, spot.y, spot.z).sub(cameraPosition).length()
  // Projected-size bound (rainTouch.ts impactSizeScale): the Frobenius norm of
  // the projection's Jacobian over world x and z at the ring's centre.
  const ivp = cameraProjectionMatrix.mul(cameraViewMatrix)
  const ic0 = ivp.mul(vec4(spot.x, spot.y, spot.z, 1))
  const iw = ic0.w
  const ax = ivp.mul(vec4(1, 0, 0, 0))
  const az = ivp.mul(vec4(0, 0, 1, 0))
  const jxx = ax.x.mul(iw).sub(ic0.x.mul(ax.w)).mul(uniforms.aspect)
  const jxy = ax.y.mul(iw).sub(ic0.y.mul(ax.w))
  const jzx = az.x.mul(iw).sub(ic0.x.mul(az.w)).mul(uniforms.aspect)
  const jzy = az.y.mul(iw).sub(ic0.y.mul(az.w))
  const perMetre = jxx.mul(jxx).add(jxy.mul(jxy)).add(jzx.mul(jzx)).add(jzy.mul(jzy)).sqrt().mul(0.5).div(iw.mul(iw))
  const fits = float(balance.rain.impactMaxFrameFraction).div(max(perMetre.mul(2 * balance.rain.impactRadiusM), float(1e-9)))
  const sizeCap = iw.greaterThan(balance.rain.streakMinDepthM).select(fits.clamp(0, 1), float(0))
  const ringR = it.mul(0.75).add(0.25).mul(balance.rain.impactRadiusM).mul(sizeCap)
  const p = positionLocal // a unit quad in x/y, [-1, 1]
  im.positionNode = vec3(spot.x, spot.y.add(RING_LIFT), spot.z).add(vec3(p.x, float(0), p.y).mul(ringR))
  const d = uv().sub(0.5).length().mul(2)
  const ring = smoothstep(float(0.6), float(0.82), d).mul(float(1).sub(smoothstep(float(0.84), float(1), d)))
  const eyeFade = smoothstep(float(balance.rain.impactNearFadeM), float(balance.rain.impactNearFullM), eyeDist)
  const fade = float(1).sub(it).pow(2).mul(age.lessThan(life).select(float(1), float(0))).mul(splashes)
  im.colorNode = mix(vec3(...balance.rain.impactGroundColor), rainCol.mul(0.7), water).mul(uniforms.light)
  im.opacityNode = ring
    .mul(fade)
    .mul(eyeFade)
    .mul(edgeFade)
    .mul(innerFade)
    .mul(uniforms.opacity)
    .mul(balance.rain.impactOpacity)
  const ig = new THREE.PlaneGeometry(2, 2)
  ig.setAttribute('rainSpot', spots)
  return { spots, dropMaterial: dm, dropGeometry: dg, impactMaterial: im, impactGeometry: ig }
}
