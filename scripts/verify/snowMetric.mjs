// Pure pixel metric for SNOW COVER in a rendered frame crop (point 503).
//
// WHY THIS EXISTS. The first version of the Atlas snow check counted pixels
// whose DARKEST channel exceeded 205 — "near white" — and demanded 2 % of the
// crop. Measured on 04.08.2026 the February High Atlas read 1.2-1.3 %, twice in
// a row, while the picture showed an unmistakably snow-capped range. The frame
// says why: this scene never produces a near-white pixel at all. Under the
// filmic tone mapping and the warm desert light the WHOLE frame — HUD, journal
// parchment and sunlit snow alike — tops out at a darkest channel of 210, and
// sunlit snow lands around (215, 212, 205). An absolute 205 threshold therefore
// sits INSIDE the snow's own brightness distribution: the same frame yields
// 14 % at 195, 1.5 % at 205 and 0 % at 215. It measured the top sliver of the
// snow's exposure, not the extent of the snow.
//
// So the measure asks what the eye asks instead: snow is BRIGHT and it is
// NEUTRAL. The sand it must be told apart from is bright too, but strongly
// warm — sunlit dune sand reads (230, 209, 142), a chroma spread of 88, while
// snow stays within a handful of levels across the three channels. That
// separation is not marginal: on the live frames the February crest reads ~31 %
// and the July crest 0.0 % — at EVERY brightness/chroma pair swept between
// 155/12 and 195/35. Nothing else in the frame (label plates, HUD, rock,
// vegetation) ever crosses it.
//
// Both thresholds are exported so a check can state the ones it used.

/** Darkest channel a snow pixel must exceed (0..255). */
export const SNOW_MIN_CHANNEL = 175
/** Largest channel spread (max - min) a snow pixel may show. */
export const SNOW_MAX_CHROMA = 25

/** Whether one RGB triple reads as snow: bright enough and neutral enough. */
export function isSnowPixel(r, g, b, minChannel = SNOW_MIN_CHANNEL, maxChroma = SNOW_MAX_CHROMA) {
  const lo = Math.min(r, g, b)
  const hi = Math.max(r, g, b)
  return lo > minChannel && hi - lo < maxChroma
}

/**
 * The fraction (0..1) of a raw RGB(A) buffer that reads as snow.
 *
 * @param data raw pixel bytes, as sharp's `.raw().toBuffer()` returns them
 * @param info the accompanying `{ width, height, channels }`
 * @param opts optional `{ minChannel, maxChroma }` overrides
 */
export function snowFraction(data, info, opts = {}) {
  const { width = 0, height = 0, channels = 3 } = info ?? {}
  const px = width * height
  if (!px || !data) return 0
  const minChannel = opts.minChannel ?? SNOW_MIN_CHANNEL
  const maxChroma = opts.maxChroma ?? SNOW_MAX_CHROMA
  let snow = 0
  for (let i = 0; i < px; i++) {
    const o = i * channels
    if (isSnowPixel(data[o], data[o + 1], data[o + 2], minChannel, maxChroma)) snow++
  }
  return snow / px
}
