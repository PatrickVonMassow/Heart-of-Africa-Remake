// The seasonal greenness FIELD (design.md §19.13, point 151): a small
// continent-covering texture the travel scene's ground and vegetation sample
// PER POSITION through a baked 'seasonUV' attribute — replacing the single
// player-position uniform whose per-frame drift made every visible crown
// slide ("fly") while walking a wetness gradient, and whose zone flips
// snapped the whole scene at once (user bug, 16.07.2026).
//
// Spatially the field is SMOOTH: each texel stores a blend of the season
// slots (hyper-arid + the climate zones), precomputed ONCE by blurring the
// one-hot slot map with a ~2 degree kernel — so a zone border is a gradient,
// never an edge. Temporally it is driven per frame from the calendar: the 15
// slot greens move with the day (lerped, so a debug month jump fades), and
// the texel values are their weighted blend. Nothing reads the player.
//
// The texel value is the TINT value the old uniform carried (0 = full straw,
// 0.5 = neutral, 1 = full lush), so the shader curves are unchanged.

import * as THREE from 'three/webgpu'
import { attribute, float, texture, vec2 } from 'three/tsl'
import { SEASON_SLOTS, seasonSlotAt, slotGreenness } from '../systems/season'
import { elevationAt } from '../world/geodata'

// Continent bounds (generous past the world trim) and texel size.
const LON0 = -20
const LON1 = 55
const LAT0 = -36
const LAT1 = 38
const RES = 0.5 // degrees per texel
export const FIELD_W = Math.round((LON1 - LON0) / RES) // 150
export const FIELD_H = Math.round((LAT1 - LAT0) / RES) // 148
const SLOTS = SEASON_SLOTS.length
// Two box passes of r=2 cascade into a triangle kernel whose reach is
// EXACTLY 2 degrees (4 texels). The first cut (r=4, two passes) reached 4
// degrees and leaked the southern plateau's summer-rain swing into the Congo
// basin's pixel check 2.4 degrees from the border — the Congo must not swing.
const BLUR_RADIUS = 2

const fieldData = new Uint8Array(FIELD_W * FIELD_H)
fieldData.fill(128) // neutral until the first update
export const SEASON_FIELD_TEX = new THREE.DataTexture(fieldData, FIELD_W, FIELD_H)
SEASON_FIELD_TEX.format = THREE.RedFormat
SEASON_FIELD_TEX.type = THREE.UnsignedByteType
SEASON_FIELD_TEX.magFilter = THREE.LinearFilter
SEASON_FIELD_TEX.minFilter = THREE.LinearFilter
SEASON_FIELD_TEX.wrapS = THREE.ClampToEdgeWrapping
SEASON_FIELD_TEX.wrapT = THREE.ClampToEdgeWrapping
SEASON_FIELD_TEX.needsUpdate = true

// Per-texel slot weights, built lazily (needs the DEM for elevations).
let weights: Float32Array | null = null

function buildWeights(): Float32Array {
  const w = new Float32Array(FIELD_W * FIELD_H * SLOTS)
  // One-hot slot map.
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      const lat = LAT0 + (y + 0.5) * RES
      const lon = LON0 + (x + 0.5) * RES
      const slot = seasonSlotAt(lat, lon, elevationAt(lat, lon))
      w[(y * FIELD_W + x) * SLOTS + slot] = 1
    }
  }
  // Two passes of a separable box blur per slot plane — the zone borders
  // become ~2 degree gradients; weights stay normalized (each pass preserves
  // the per-texel sum of 1).
  const tmp = new Float32Array(FIELD_W * FIELD_H * SLOTS)
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal.
    for (let y = 0; y < FIELD_H; y++) {
      for (let x = 0; x < FIELD_W; x++) {
        for (let s = 0; s < SLOTS; s++) {
          let acc = 0
          let cnt = 0
          for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k++) {
            const xx = x + k
            if (xx < 0 || xx >= FIELD_W) continue
            acc += w[(y * FIELD_W + xx) * SLOTS + s]
            cnt++
          }
          tmp[(y * FIELD_W + x) * SLOTS + s] = acc / cnt
        }
      }
    }
    // Vertical (back into w).
    for (let y = 0; y < FIELD_H; y++) {
      for (let x = 0; x < FIELD_W; x++) {
        for (let s = 0; s < SLOTS; s++) {
          let acc = 0
          let cnt = 0
          for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k++) {
            const yy = y + k
            if (yy < 0 || yy >= FIELD_H) continue
            acc += tmp[(yy * FIELD_W + x) * SLOTS + s]
            cnt++
          }
          w[(y * FIELD_W + x) * SLOTS + s] = acc / cnt
        }
      }
    }
  }
  return w
}

// The lerped slot greens — the temporal smoothing the old uniform had.
const greens = new Float32Array(SLOTS).fill(0.5)
let greensSeeded = false

/**
 * Drive the field for this frame: move every slot's greenness toward its
 * calendar target (blend as the old uniform: a debug month jump fades over a
 * moment) and rewrite the texture as the weighted slot blend, mapped through
 * the season strength to the tint value the shaders consume.
 */
export function updateSeasonField(
  day: number,
  startYear: number,
  override: number | null,
  strength: number,
  blend = 0.02,
): void {
  if (!weights) weights = buildWeights()
  const s = Math.min(1, Math.max(0, strength))
  for (let i = 0; i < SLOTS; i++) {
    const target = slotGreenness(day, i, startYear, override)
    // First drive seeds directly: the game starts mid-calendar, not neutral.
    greens[i] = greensSeeded ? greens[i] + (target - greens[i]) * blend : target
  }
  greensSeeded = true
  for (let t = 0; t < FIELD_W * FIELD_H; t++) {
    let g = 0
    for (let i = 0; i < SLOTS; i++) g += weights[t * SLOTS + i] * greens[i]
    fieldData[t] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (g - 0.5) * s)))
  }
  SEASON_FIELD_TEX.needsUpdate = true
}

/** The baked per-vertex/per-instance texture coordinate for a position. */
export function seasonFieldUV(lat: number, lon: number): [number, number] {
  return [
    Math.min(1, Math.max(0, (lon - LON0) / (LON1 - LON0))),
    Math.min(1, Math.max(0, (lat - LAT0) / (LAT1 - LAT0))),
  ]
}

/** CPU read of the field's tint value at a position (checks/dev hooks). */
export function seasonFieldTintAt(lat: number, lon: number): number {
  const [u, v] = seasonFieldUV(lat, lon)
  const x = Math.min(FIELD_W - 1, Math.max(0, Math.round(u * FIELD_W - 0.5)))
  const y = Math.min(FIELD_H - 1, Math.max(0, Math.round(v * FIELD_H - 0.5)))
  return fieldData[y * FIELD_W + x] / 255
}

/** The current lerped slot greens (checks/dev hooks). */
export function seasonFieldGreens(): number[] {
  return [...greens]
}

/** TSL: the field's tint value sampled through the baked 'seasonUV'. */
export function seasonFieldTintNode(): ReturnType<typeof float> {
  const uv = attribute('seasonUV', 'vec2') as unknown as ReturnType<typeof vec2>
  // Cast: the TSL typings do not thread the swizzled float type through.
  return texture(SEASON_FIELD_TEX, uv).r as unknown as ReturnType<typeof float>
}
