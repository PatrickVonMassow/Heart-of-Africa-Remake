// Sheltered ground stays less wet: the settlement ground's rain wetness made
// SPATIAL by the baked shelter mask (src/scenes/place/shelterMask.ts).
//
// local wetness = open · (1 − strength · cover) · (1 + dripBoost · drip)
//
// `open` is the shared GROUND_WET_U the season drives; `strength` is strictly
// below 1, so full cover makes the ground LESS wet but never dry — wind-blown
// rain and splash reach under every eave. In dry weather `open` is 0 and the
// product is exactly 0 wherever the mask says anything: no visible difference.
//
// One module texture and module uniforms, like the edge band's boundary LUT
// (edgeBand.ts): a place change rewrites the texels, never relinks a program
// (point 96). No quality key: a one-time CPU bake plus one texture lookup in a
// ground material already drawn costs nothing a lever could save.

import * as THREE from 'three/webgpu'
import { float, positionWorld, texture, uniform, vec2 } from 'three/tsl'
import { GROUND_WET_U } from './seasonTint'

/** Cells per side of the baked mask. Over a ~45-75 m half-extent this is
 *  0.18-0.3 m a cell, below the soft edge it has to carry. */
export const SHELTER_MASK_SIZE = 512

/** Ceiling on the shelter strength: full cover always leaves some wetness. */
export const MAX_SHELTER_STRENGTH = 0.95

// Bytes, RGBA: a byte texture filters on both backends (a float one does not,
// on WebGPU). R = cover, G = drip.
const SHELTER_TEX = new THREE.DataTexture(
  new Uint8Array(SHELTER_MASK_SIZE * SHELTER_MASK_SIZE * 4),
  SHELTER_MASK_SIZE,
  SHELTER_MASK_SIZE,
  THREE.RGBAFormat,
)
SHELTER_TEX.wrapS = THREE.ClampToEdgeWrapping
SHELTER_TEX.wrapT = THREE.ClampToEdgeWrapping
SHELTER_TEX.minFilter = THREE.LinearFilter
SHELTER_TEX.magFilter = THREE.LinearFilter
SHELTER_TEX.generateMipmaps = false
SHELTER_TEX.needsUpdate = true

const SHELTER_EXTENT_U = uniform(1)
const SHELTER_STRENGTH_U = uniform(0)
const DRIP_BOOST_U = uniform(0)

/** Clamp a configured shelter strength into [0, MAX_SHELTER_STRENGTH]. */
export function clampShelterStrength(s: number): number {
  return Math.min(MAX_SHELTER_STRENGTH, Math.max(0, Number.isFinite(s) ? s : 0))
}

/**
 * CPU mirror of `shelteredWetNode` — the same formula, kept in lock-step.
 * `open` 0..1, `cover`/`drip` 0..1 from the mask.
 */
export function shelteredWetness(
  open: number,
  cover: number,
  drip: number,
  strength: number,
  dripBoost: number,
): number {
  const s = clampShelterStrength(strength)
  const d = Math.max(0, dripBoost)
  return open * (1 - s * cover) * (1 + d * drip)
}

/** Upload a baked mask (`bakeShelterMask` at SHELTER_MASK_SIZE). */
export function setShelterMask(mask: { size: number; extent: number; cover: Float32Array; drip: Float32Array }) {
  const data = SHELTER_TEX.image.data as Uint8Array
  data.fill(0)
  if (mask.size === SHELTER_MASK_SIZE) {
    for (let k = 0; k < mask.cover.length; k++) {
      data[k * 4] = Math.round(Math.min(1, Math.max(0, mask.cover[k])) * 255)
      data[k * 4 + 1] = Math.round(Math.min(1, Math.max(0, mask.drip[k])) * 255)
    }
  }
  SHELTER_EXTENT_U.value = mask.extent
  SHELTER_TEX.needsUpdate = true
}

/** Clear the mask (no settlement drives it): every lookup reads open ground. */
export function clearShelterMask() {
  ;(SHELTER_TEX.image.data as Uint8Array).fill(0)
  SHELTER_TEX.needsUpdate = true
}

/** This frame's look from `balance.rain` (driven per frame, so an edit lands live). */
export function setShelterLook(cfg: { shelterStrength: number; dripBoost: number }) {
  SHELTER_STRENGTH_U.value = clampShelterStrength(cfg.shelterStrength)
  DRIP_BOOST_U.value = Math.max(0, cfg.dripBoost)
}

/** CPU read of `shelteredWetNode` at a world point (nearest mask cell, open
 *  ground outside it): the ground wetness a walker's foot stands on. */
export function shelteredGroundWetnessAt(x: number, z: number): number {
  const extent = SHELTER_EXTENT_U.value as number
  const i = Math.round(((x + extent) / (2 * extent)) * SHELTER_MASK_SIZE - 0.5)
  const j = Math.round(((z + extent) / (2 * extent)) * SHELTER_MASK_SIZE - 0.5)
  const inside = i >= 0 && j >= 0 && i < SHELTER_MASK_SIZE && j < SHELTER_MASK_SIZE
  const data = SHELTER_TEX.image.data as Uint8Array
  const k = (j * SHELTER_MASK_SIZE + i) * 4
  const cover = inside ? data[k] / 255 : 0
  const drip = inside ? data[k + 1] / 255 : 0
  return shelteredWetness(GROUND_WET_U.value as number, cover, drip, SHELTER_STRENGTH_U.value as number, DRIP_BOOST_U.value as number)
}

/** Read-only view of the driven state, for tests. */
export function shelterWetState() {
  return {
    extent: SHELTER_EXTENT_U.value as number,
    strength: SHELTER_STRENGTH_U.value as number,
    dripBoost: DRIP_BOOST_U.value as number,
    data: SHELTER_TEX.image.data as Uint8Array,
  }
}

/** The ground wetness at this fragment: GROUND_WET_U shaped by the mask. */
export function shelteredWetNode() {
  const p = positionWorld.xz
  const span = SHELTER_EXTENT_U.mul(2)
  const uv = vec2(p.x.add(SHELTER_EXTENT_U).div(span), p.y.add(SHELTER_EXTENT_U).div(span))
  const m = texture(SHELTER_TEX, uv)
  const open = GROUND_WET_U as unknown as ReturnType<typeof float>
  return open
    .mul(float(1).sub(SHELTER_STRENGTH_U.mul(m.r)))
    .mul(float(1).add(DRIP_BOOST_U.mul(m.g)))
}
