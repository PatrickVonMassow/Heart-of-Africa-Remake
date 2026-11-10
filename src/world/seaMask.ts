// The sea surface's land mask (point 314). The open-sea plane (render/water.ts)
// used to fade out by the DEM's raw land flag, while the terrain decides its
// shore by `shoreLandFraction` — the raster flag rebuilt from the smooth vector
// coast near the shore (point 209) and from the trim boundary (point 210). The
// two coasts disagree by up to a few texels, so the plane left terrain sea bare
// (its pale, greenish shallow floor showing in blocky patches rimmed by shore
// foam) and laid itself over terrain land. Baking the terrain's own land
// fraction at every texel centre makes the plane follow the coast the ground
// was built from.

/** Texels farther than this from any raster land/sea edge keep the raster
 *  flag. The vector coast acts within COAST_SMOOTH_BAND (0.08 deg) of the
 *  raster coast DISTANCE field, which reaches past ~3 texels of the flag edge
 *  along the trimmed Red Sea shore; 12 texels is the measured reach at which
 *  the bake equals the terrain everywhere (seaMask.test.ts pins it). */
export const SHORE_TEXEL_REACH = 12

/**
 * The texels (row-major indices) of a `width` x `height` raster of binary land
 * `flags` (1 = land) that lie within `reach` texels of a land/sea flag edge —
 * the only ones whose terrain land fraction can differ from their flag. Two
 * separable dilation passes keep the gate linear in the texel count.
 */
export function shoreTexels(flags: Uint8Array, width: number, height: number, reach = SHORE_TEXEL_REACH): Int32Array {
  const n = width * height
  const edge = new Uint8Array(n)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      const f = flags[i]
      if ((x + 1 < width && flags[i + 1] !== f) || (y + 1 < height && flags[i + width] !== f)) {
        edge[i] = 1
        if (x + 1 < width) edge[i + 1] = 1
        if (y + 1 < height) edge[i + width] = 1
      }
    }
  }
  // Horizontal then vertical box dilation by `reach` (running window counts).
  const horiz = new Uint8Array(n)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let count = 0
    for (let x = 0; x < Math.min(reach, width); x++) count += edge[row + x]
    for (let x = 0; x < width; x++) {
      if (x + reach < width) count += edge[row + x + reach]
      if (x - reach - 1 >= 0) count -= edge[row + x - reach - 1]
      if (count > 0) horiz[row + x] = 1
    }
  }
  const near = new Uint8Array(n)
  let total = 0
  for (let x = 0; x < width; x++) {
    let count = 0
    for (let y = 0; y < Math.min(reach, height); y++) count += horiz[y * width + x]
    for (let y = 0; y < height; y++) {
      if (y + reach < height) count += horiz[(y + reach) * width + x]
      if (y - reach - 1 >= 0) count -= horiz[(y - reach - 1) * width + x]
      if (count > 0) {
        near[y * width + x] = 1
        total++
      }
    }
  }
  const out = new Int32Array(total)
  let k = 0
  for (let i = 0; i < n; i++) if (near[i]) out[k++] = i
  return out
}

/**
 * The terrain's land fraction at every texel centre: `landAt(x, y)` on the
 * shore texels, the flag everywhere else (which is what the terrain returns
 * there). The render side runs the same split time-sliced.
 */
export function bakeShoreLand(
  flags: Uint8Array,
  width: number,
  height: number,
  landAt: (x: number, y: number) => number,
  reach = SHORE_TEXEL_REACH,
): Float32Array {
  const out = Float32Array.from(flags)
  for (const i of shoreTexels(flags, width, height, reach)) out[i] = landAt(i % width, (i / width) | 0)
  return out
}
