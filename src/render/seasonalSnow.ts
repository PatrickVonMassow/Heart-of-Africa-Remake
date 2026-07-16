// Seasonal snow on the two massifs that really take it (design.md §19.13,
// point 141): the High Atlas (Nov-Apr) and the Drakensberg (Jun-Aug). A
// COLOUR-ONLY shader term — after the bare-branches shards, geometry stays
// untouched; snow is a whitening of the terrain's composed colour inside two
// fixed massif masks, above a height that sinks as the winter deepens (the
// research: the Atlas line "settles to 1,400 m" in the hard months).
//
// Permanent ice (Kilimanjaro, Mount Kenya, Rwenzori) is NOT here: it is baked
// into the terrain vertex colours in world/terrain.ts, date-independent, so it
// also shows on the far sheet and the map. This module is only the part that
// must move with the calendar.

import { float, mix, positionWorld, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { Vector2 } from 'three/webgpu'
import { snowMassifDef } from '../systems/season'

export const ATLAS_SNOW_U = uniform(0)
export const DRAKENSBERG_SNOW_U = uniform(0)
// Hail (point 141b): a brief white dusting of the ground around the storm —
// the one defensible white ground at low altitude. Centre follows the
// traveller (the storm cell is where the weather is computed).
export const HAIL_U = uniform(0)
export const HAIL_CENTER_U = uniform(new Vector2())

/** Drive from the frame loop with `seasonalSnowAt` for each massif. */
export function setSeasonalSnow(atlas: number, drakensberg: number) {
  ATLAS_SNOW_U.value = atlas
  DRAKENSBERG_SNOW_U.value = drakensberg
}

/** Drive from the frame loop with `hailAt` and the traveller's world position. */
export function setHail(strength: number, x: number, z: number) {
  HAIL_U.value = strength
  ;(HAIL_CENTER_U.value as Vector2).set(x, z)
}

/** Dev-hook readout (the app-graph rule: never read uniforms via a parallel import). */
export function seasonalSnow(): { atlas: number; drakensberg: number; hail: number } {
  return { atlas: ATLAS_SNOW_U.value, drakensberg: DRAKENSBERG_SNOW_U.value, hail: HAIL_U.value }
}

const SNOW_TONE = vec3(0.93, 0.94, 0.96)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function massifTerm(centerLon: number, centerLat: number, radiusDeg: number, depth: any) {
  // World mapping: x = lon * 10, z = -lat * 10 (the game's fixed projection).
  const cx = centerLon * 10
  const cz = -centerLat * 10
  const r = radiusDeg * 10
  const d = positionWorld.xz.sub(vec2(cx, cz)).length()
  const inMassif = smoothstep(float(r), float(r * 0.55), d)
  // The snow line sinks as the winter deepens: high shoulder dusting at the
  // window's edge, down toward the valleys at its peak.
  const lineY = float(3.4).sub(depth.mul(1.1))
  const aboveLine = smoothstep(lineY, lineY.add(0.5), positionWorld.y)
  return inMassif.mul(aboveLine).mul(depth)
}

/**
 * Whiten a composed terrain colour where the season's snow lies. Apply to the
 * final colour node; identity when both uniforms are 0.
 */
// The col parameter is any vec3-valued TSL node; the exact node type varies by
// call site, so it is typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seasonalSnowNode(col: any) {
  const atlas = snowMassifDef('atlas')
  const drak = snowMassifDef('drakensberg')
  // The hail dusting: a radial white patch around the storm, light on purpose
  // (a dusting, not a snowfield) and gone with the storm.
  const hailD = positionWorld.xz.sub(HAIL_CENTER_U).length()
  const hail = smoothstep(float(42), float(22), hailD).mul(HAIL_U).mul(0.45)
  const t = massifTerm(atlas.lon, atlas.lat, atlas.radiusDeg, ATLAS_SNOW_U)
    .add(massifTerm(drak.lon, drak.lat, drak.radiusDeg, DRAKENSBERG_SNOW_U))
    .add(hail)
    .clamp(0, 1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mix(col as any, SNOW_TONE as any, t.mul(0.9) as any)
}
