// Horizon maps at runtime (design.md §2.7 "The land shades itself over hundreds
// of kilometres"). Two RGBA maps baked offline from the DEM
// (scripts/build-horizon-maps.mjs) hold per texel the horizon slope toward six
// sun directions plus a mean horizon; the bird's-eye terrain material reads
// them through the nodes below:
//   - shade: the ground darkens where the land toward the sun rises above the
//     sun's elevation (the slices bracketing the azimuth are blended);
//   - sky occlusion: hollows lose ambient light by their mean horizon.
// The maps are fetched LAZILY behind the level gate (horizonMapGate.ts): at the
// low level they are never requested, and until they arrive (or while the level
// does not want them) both terms are exactly 1 — the terrain as before.
// Settlements have their own scene and ground and never read these.

import * as THREE from 'three/webgpu'
import { atan, float, fwidth, max, min, mix, positionWorld, smoothstep, texture, uniform, vec2, vec4 } from 'three/tsl'
import { balance } from '../config/balance'
import { UNITS_PER_DEGREE } from '../world/geo'
import { createHorizonMapGate } from './horizonMapGate'
import { horizonSliceBlend } from './horizonSlices'

/** Geographic extent of the baked maps (= the DEM's; horizonMaps.test.ts
 *  checks it against public/geodata/horizon.json). */
export const HORIZON_BOUNDS = { lonMin: -20, lonMax: 53, latMin: -37, latMax: 38 } as const
/** Texel count of the baked maps (checked the same way); the loaded image's
 *  own size replaces it on arrival. */
export const HORIZON_MAP_SIZE = { width: 1460, height: 1500 } as const

const DEG = Math.PI / 180

// --- CPU side: the uniform values, pure ---------------------------------------

export interface HorizonUniformValues {
  /** 1 applies the maps, 0 leaves the terrain exactly as without them. */
  enabled: number
  /** Blend weights of slices 0..3 (map A) and 4..5 (map B). */
  weightsA: [number, number, number, number]
  weightsB: [number, number]
  /** The sun's elevation the shadow test compares against (radians). */
  sunElevation: number
  /** The azimuth lay outside the baked arc and was clamped to its end. */
  clamped: boolean
  shadedAzimuth: number
}

export function horizonUniformValues(opts: {
  wanted: boolean
  loaded: boolean
  azimuthDeg: number
  elevationDeg: number
}): HorizonUniformValues {
  const blend = horizonSliceBlend(opts.azimuthDeg)
  const w = blend.weights
  return {
    enabled: opts.wanted && opts.loaded ? 1 : 0,
    weightsA: [w[0], w[1], w[2], w[3]],
    weightsB: [w[4], w[5]],
    sunElevation: opts.elevationDeg * DEG,
    clamped: blend.clamped,
    shadedAzimuth: blend.shadedAzimuth,
  }
}

/** Half-width (degrees) of the soft shadow edge: widened with the relief
 *  exaggeration so the edge spans more than one texel's slope swing. */
export function horizonShadowSoftnessDeg(baseDeg: number, reliefScale: number, perRelief: number): number {
  return baseDeg + perRelief * reliefScale
}

function smoothstepCpu(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Screen pixels one texel spans along its LONGER projected side, from the
 *  map UV's per-pixel change (fwidth) and the map size. The shorter side must
 *  not decide: a foreshortened texel 80 px wide and 20 px deep shows its
 *  blocks across the 80. The shader node mirrors this per fragment. */
export function horizonPixelsPerTexel(fwidthU: number, fwidthV: number, width: number, height: number): number {
  return 1 / Math.max(Math.min(fwidthU * width, fwidthV * height), 1e-6)
}

/** Weight of the horizon terms by magnification (1 = full, 0 = faded out):
 *  a texel covering more than `startPx` screen pixels starts to fade, at
 *  `endPx` it is gone. The shader node mirrors this per fragment. */
export function horizonCloseFade(pixelsPerTexel: number, startPx: number, endPx: number): number {
  return 1 - smoothstepCpu(startPx, endPx, pixelsPerTexel)
}

// --- GPU side: the shared nodes ------------------------------------------------

function placeholder(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

const enabledU = uniform(0)
const weightsAU = uniform(new THREE.Vector4())
const weightsBU = uniform(new THREE.Vector2())
const sunElevationU = uniform(0.3)
const reliefU = uniform(balance.horizonMaps.reliefScale)
const shadowStrengthU = uniform(balance.horizonMaps.shadowStrength)
const softnessDeg = () => {
  const h = balance.horizonMaps
  return horizonShadowSoftnessDeg(h.shadowSoftnessDeg, h.reliefScale, h.shadowSoftnessPerRelief)
}
const softnessU = uniform(softnessDeg() * DEG)
const fadeStartU = uniform(balance.horizonMaps.closeFadeStartPx)
const fadeEndU = uniform(balance.horizonMaps.closeFadeEndPx)
const mapSizeU = uniform(new THREE.Vector2(HORIZON_MAP_SIZE.width, HORIZON_MAP_SIZE.height))
const skyStrengthU = uniform(balance.horizonMaps.skyOcclusionStrength)

// World position -> map UV: x = lon * UNITS_PER_DEGREE, z = -lat * UNITS_PER_DEGREE;
// row 0 of the map is the north edge (flipY off), so v runs from latMax down.
const B = HORIZON_BOUNDS
const horizonUV = vec2(
  positionWorld.x.div(UNITS_PER_DEGREE).sub(B.lonMin).div(B.lonMax - B.lonMin),
  positionWorld.z.div(UNITS_PER_DEGREE).add(B.latMax).div(B.latMax - B.latMin),
)
const mapA = texture(placeholder(), horizonUV)
const mapB = texture(placeholder(), horizonUV)

// The horizon terms' weight at this fragment: enabled, and faded out where one
// texel covers so many screen pixels that its blocks would show.
function createWeightNode() {
  const texelsPerPixel = min(fwidth(horizonUV.x).mul(mapSizeU.x), fwidth(horizonUV.y).mul(mapSizeU.y))
  const pixelsPerTexel = float(1).div(max(texelsPerPixel, 1e-6))
  return enabledU.mul(float(1).sub(smoothstep(fadeStartU, fadeEndU, pixelsPerTexel)))
}
let weightNode: ReturnType<typeof createWeightNode> | null = null
const horizonWeight = () => (weightNode ??= createWeightNode())

/** Ground brightness factor from the sun-direction horizon (1 = sunlit). */
function createShadeNode() {
  const a = mapA.mul(mapA) // decode: slope = byte^2 (slopeMax 1)
  const b = mapB.mul(mapB)
  const slope = a.dot(vec4(weightsAU)).add(b.xy.dot(vec2(weightsBU))).mul(reliefU)
  const lit = smoothstep(softnessU.negate(), softnessU, sunElevationU.sub(atan(slope)))
  return mix(float(1), mix(float(1).sub(shadowStrengthU), float(1), lit), horizonWeight())
}

/** Ambient-light factor from the mean horizon: sin^2 of the mean horizon angle. */
function createSkyOcclusionNode() {
  const b = mapB.mul(mapB)
  const s = b.z.mul(reliefU)
  const s2 = s.mul(s)
  const occluded = float(1).sub(skyStrengthU.mul(s2.div(s2.add(1))))
  return mix(float(1), occluded, horizonWeight())
}

let shadeNode: ReturnType<typeof createShadeNode> | null = null
let skyNode: ReturnType<typeof createSkyOcclusionNode> | null = null
/** Factor on the terrain's albedo: the land's own shadow. */
export function horizonShadeNode() {
  return (shadeNode ??= createShadeNode())
}
/** The terrain material's ambient occlusion: the sky a hollow cannot see. */
export function horizonSkyOcclusionNode() {
  return (skyNode ??= createSkyOcclusionNode())
}

// --- Loading -------------------------------------------------------------------

async function decodeRaw(blob: Blob): Promise<TexImageSource> {
  // Straight alpha must survive: map A's alpha holds a slice, not opacity.
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('horizon map <img> decode failed'))
        img.src = url
      })
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

async function loadMap(name: string): Promise<THREE.Texture> {
  const res = await fetch(`${import.meta.env.BASE_URL}geodata/${name}.png`)
  if (!res.ok) throw new Error(`failed to load ${name}.png: HTTP ${res.status}`)
  const tex = new THREE.Texture(await decodeRaw(await res.blob()))
  tex.flipY = false
  tex.premultiplyAlpha = false
  tex.colorSpace = THREE.NoColorSpace
  tex.generateMipmaps = false // ~6 km texels: the bird's-eye view magnifies them
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

let loaded = false
let wanted = false
const gate = createHorizonMapGate(async () => {
  const [a, b] = await Promise.all([loadMap('horizon-a'), loadMap('horizon-b')])
  mapA.value = a
  mapB.value = b
  const img = a.image as { width: number; height: number }
  mapSizeU.value.set(img.width, img.height)
  loaded = true
  return { a, b }
})

let lastSun = { azimuthDeg: 270, elevationDeg: 20 }
let lastClamped = false

function apply(): void {
  const v = horizonUniformValues({ wanted, loaded, ...lastSun })
  enabledU.value = v.enabled
  weightsAU.value.set(...v.weightsA)
  weightsBU.value.set(...v.weightsB)
  sunElevationU.value = v.sunElevation
  reliefU.value = balance.horizonMaps.reliefScale
  shadowStrengthU.value = balance.horizonMaps.shadowStrength
  softnessU.value = softnessDeg() * DEG
  fadeStartU.value = balance.horizonMaps.closeFadeStartPx
  fadeEndU.value = balance.horizonMaps.closeFadeEndPx
  skyStrengthU.value = balance.horizonMaps.skyOcclusionStrength
  if (import.meta.env.DEV) {
    // Dev channel: a sun outside the baked arc is clamped, and said so.
    if (v.clamped !== lastClamped && wanted) {
      console.info(
        v.clamped
          ? `[horizon] sun azimuth ${lastSun.azimuthDeg.toFixed(1)}° is outside the baked arc; shading clamped to the ${v.shadedAzimuth.toFixed(1)}° slice`
          : '[horizon] sun azimuth back inside the baked arc',
      )
    }
    ;(window as unknown as Record<string, unknown>).__horizonMaps = {
      requests: gate.requests,
      loaded,
      wanted,
      enabled: v.enabled,
      shadowStrength: shadowStrengthU.value,
      closeFadeStartPx: fadeStartU.value,
      clamped: v.clamped,
      shadedAzimuth: v.shadedAzimuth,
    }
  }
  lastClamped = v.clamped
}

/** The effective level's wish for the maps. Fetches them (once) when it first
 *  holds; never blocks — they apply when they arrive. */
export function setHorizonMapsWanted(want: boolean): void {
  wanted = want
  const pending = gate.update(want)
  apply()
  pending?.then(apply, (e) => console.warn('[horizon] maps unavailable:', e))
}

/** The current sun (degrees) and any balance edit: re-derives the uniforms. */
export function setHorizonSun(azimuthDeg: number, elevationDeg: number): void {
  lastSun = { azimuthDeg, elevationDeg }
  apply()
}
