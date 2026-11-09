// Pure pixel reading of the BURNING grass fire in frame 131 (design.md §19.8/
// §19.13). The old guard of that frame read state flags (trapped, calfDead,
// resolved) and the shutter waited for the smoulder, so a frame with no fire
// visible passed. This reads the DRAWN fire instead, from four crops of the
// same frame, all located by projecting the fire's own geometry:
//
//   front   — the leading edge of the burning line (flames + ember edge)
//   scar    — the ground the line has passed, well behind it
//   unburnt — open savanna beside the scar at the same depth in the picture
//   smoke   — the air just behind the line, where the puffs rise
//
// and asks the four things the eye asks: are there flame pixels at the front;
// is the front clearly brighter AND warmer than the scar; is the scar clearly
// darker than the unburnt land; is there smoke-grey above the line that the
// unburnt land does not have. With the fire's drawing switched off
// (balance.grassFire.drawn = false) every one of those collapses, which is the
// negative control the section runs on the same crops.
//
// Thresholds are first calibrations (OPEN: confirm on both backends against the
// first live frames) and are exported for the unit test.

/** A flame pixel: bright, red-dominant (r >= g >= b) and SATURATED — sunlit
 *  dry grass is warm too, but its (r − b)/r stays under ~0.47. */
export const FLAME_MIN_RED = 200
export const FLAME_MIN_SATURATION = 0.55
/** Share of the front crop that must be flame. */
export const FLAME_MIN_SHARE = 0.06
/** The front must out-shine the scar by this factor and margin (luma). */
export const FRONT_OVER_SCAR_RATIO = 1.6
export const FRONT_OVER_SCAR_MARGIN = 30
/** The front must be warmer (mean r − b) than the scar by this margin. */
export const FRONT_WARMER_MARGIN = 25
/** The scar must be darker than the unburnt land: at most this fraction of it. */
export const SCAR_UNDER_UNBURNT_RATIO = 0.75
/** A smoke pixel: near-neutral, mid-grey. */
export const SMOKE_MAX_CHROMA = 30
export const SMOKE_MIN_LUMA = 50
export const SMOKE_MAX_LUMA = 180
/** Smoke share the smoke crop needs, absolute and above the unburnt crop's. */
export const SMOKE_MIN_SHARE = 0.05
export const SMOKE_OVER_UNBURNT = 0.03

/** Mean luma, mean warmth (r − b), flame share and smoke share of a raw crop. */
export function regionStats(data, channels) {
  const n = Math.floor(data.length / channels)
  let luma = 0
  let warmth = 0
  let flame = 0
  let smoke = 0
  for (let i = 0; i < n; i++) {
    const r = data[i * channels]
    const g = data[i * channels + 1]
    const b = data[i * channels + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    luma += l
    warmth += r - b
    if (r >= FLAME_MIN_RED && r >= g && g >= b && r - b >= FLAME_MIN_SATURATION * r) flame++
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    if (chroma <= SMOKE_MAX_CHROMA && l >= SMOKE_MIN_LUMA && l <= SMOKE_MAX_LUMA) smoke++
  }
  const k = Math.max(1, n)
  return { n, luma: luma / k, warmth: warmth / k, flameShare: flame / k, smokeShare: smoke / k }
}

/** The verdict over the four crops' stats; every failed condition is named. */
export function readFireFrame({ front, scar, unburnt, smoke }) {
  const failed = []
  if (!(front.flameShare >= FLAME_MIN_SHARE)) failed.push('no flame at the front')
  if (!(front.luma >= scar.luma * FRONT_OVER_SCAR_RATIO && front.luma - scar.luma >= FRONT_OVER_SCAR_MARGIN))
    failed.push('front not brighter than the scar')
  if (!(front.warmth - scar.warmth >= FRONT_WARMER_MARGIN)) failed.push('front not warmer than the scar')
  if (!(scar.luma <= unburnt.luma * SCAR_UNDER_UNBURNT_RATIO)) failed.push('scar not darker than unburnt savanna')
  if (!(smoke.smokeShare >= SMOKE_MIN_SHARE && smoke.smokeShare - unburnt.smokeShare >= SMOKE_OVER_UNBURNT))
    failed.push('no smoke behind the line')
  const r = (v) => Math.round(v * 1000) / 1000
  const brief = (s) => ({ luma: r(s.luma), warmth: r(s.warmth), flame: r(s.flameShare), smoke: r(s.smokeShare) })
  return { pass: failed.length === 0, failed, front: brief(front), scar: brief(scar), unburnt: brief(unburnt), smoke: brief(smoke) }
}

/** Screen-space bounding box of projected points, clamped to the viewport;
 *  null when the box is off screen or degenerate (a crop the frame lacks). */
export function boxOf(points, vw, vh, minSize = 6) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  x0 = Math.max(0, Math.floor(x0))
  y0 = Math.max(0, Math.floor(y0))
  x1 = Math.min(vw, Math.ceil(x1))
  y1 = Math.min(vh, Math.ceil(y1))
  if (!(x1 - x0 >= minSize && y1 - y0 >= minSize)) return null
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 }
}
