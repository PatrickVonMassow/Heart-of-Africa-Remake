// Far-terrain color match (design.md §21.4): the whole-continent sheet is a
// plain vertex-colored mesh, while the detailed chunks render the same biome
// tint multiplied by the splatted ground textures (TravelScene.tsx,
// createTerrainMaterial: vertexColor * albedo * 2.6, macro noise mean 1.0).
// To keep the sheet from reading as a pale "unrendered" frame around the
// chunk rectangle, its vertex colors bake in the same mean albedo response.

import type { SplatWeights } from '../../world/terrain'

/** Mean linear-space RGB of the four splat albedo textures
 *  (public/geodata/tex/{sand,grass,rock,forest}_a.png), measured once. */
export const MEAN_ALBEDO: ReadonlyArray<readonly [number, number, number]> = [
  [0.653, 0.499, 0.276], // sand
  [0.35, 0.326, 0.09], // grass
  [0.389, 0.323, 0.293], // rock
  [0.079, 0.212, 0.038], // forest
]

/** Same recentering boost the chunk material applies to the mid-gray albedo. */
export const ALBEDO_BOOST = 2.6

/**
 * Vertex color for the far-terrain sheet: the biome tint multiplied by the
 * splat-weighted mean texture albedo, matching the detailed chunks' average
 * ground response so the sheet blends with the chunk rectangle.
 */
export function farTerrainColor(
  tint: readonly [number, number, number],
  splat: SplatWeights,
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    let albedo = 0
    for (let i = 0; i < 4; i++) albedo += splat[i] * MEAN_ALBEDO[i][c]
    out[c] = tint[c] * albedo * ALBEDO_BOOST
  }
  return out
}
