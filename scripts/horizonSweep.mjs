// Horizon sweep over a height grid (design.md §2.7 "The land shades itself").
// Pure functions, no I/O: used by build-horizon-maps.mjs and pinned against the
// brute-force reference by src/render/horizonSweep.test.ts.
//
// For one azimuth the horizon of a texel is the steepest rise (tan of the
// elevation angle, >= 0) of any terrain AHEAD of it in that direction. Naive
// ray marching costs texels x steps; the sweep below is linear in texels:
// the grid is cut into parallel lines along the direction, each line is walked
// from its far end backwards, and a monotone stack keeps the upper convex hull
// of the samples already passed (all of them lie ahead of the current one).
// The tangent from the current sample to that hull is its horizon; samples the
// new one hides below a hull edge are popped and can never be a tangent again.
//
// Lines run one texel apart across the direction, so a texel centre generally
// falls between two lines; its horizon is the linear blend of both lines'
// horizons at its column. The heights along the texel's own ray are the same
// blend of both lines' heights (rows are interpolated linearly), so the blend is
// an upper bound of the exact ray horizon, tight where both lines peak at the
// same distance — and exact on axis-aligned directions.

/** A march direction as an integer grid step [east, south] in texels. Integer
 *  steps make every texel centre fall exactly on one sweep line (see
 *  sweepHorizon), so the sweep equals the brute-force ray march exactly. */

/** The six sun directions baked as shadow slices. At the fixed 16:00 hour the
 *  sun's azimuth stays inside 233.1-306.8 degrees over every latitude of the
 *  map and every day of the year, so the bake covers that arc — 233.13 to
 *  306.87 degrees, ~15 degree steps — instead of a full circle. Mirrored by
 *  HORIZON_AZIMUTHS in src/render/horizonSlices.ts (a unit test keeps both equal). */
export const SUN_STEPS = [
  [-4, 3],
  [-5, 2],
  [-8, 1],
  [-8, -1],
  [-5, -2],
  [-4, -3],
]

/** Azimuth (degrees clockwise from north) of a grid step [east, south]. */
export function stepAzimuth([e, s]) {
  return ((Math.atan2(e, -s) * 180) / Math.PI + 360) % 360
}

export const SUN_AZIMUTHS = SUN_STEPS.map(stepAzimuth)

/** Sixteen directions round the full circle (~22.5 degree spacing) averaged
 *  into the sky-occlusion channel. */
export const OCCLUSION_STEPS = [
  [1, 0], [5, 2], [1, 1], [2, 5], [0, 1], [-2, 5], [-1, 1], [-5, 2],
  [-1, 0], [-5, -2], [-1, -1], [-2, -5], [0, -1], [2, -5], [1, -1], [5, -2],
]

/** Largest encodable horizon slope (tan 45 degrees). */
export const SLOPE_MAX = 1

/** Encode a slope (tan >= 0) as a byte; sqrt spends the precision on the low
 *  angles that decide a low sun's shadow. Decode: (b / 255)^2 * SLOPE_MAX. */
export function encodeSlope(slope) {
  const v = Math.min(Math.max(slope, 0), SLOPE_MAX) / SLOPE_MAX
  return Math.round(Math.sqrt(v) * 255)
}

export function decodeSlope(byte) {
  const v = byte / 255
  return v * v * SLOPE_MAX
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Reorient a grid so the march direction becomes +x with |dy/dx| <= 1, and
 * reduce the step to lowest terms: per column the line rises B/Q rows.
 * Returns the oriented grid plus the mapping back to the original indices.
 */
function orient(heights, w, h, [e, s]) {
  if (!Number.isInteger(e) || !Number.isInteger(s) || (e === 0 && s === 0)) {
    throw new Error(`grid step must be a non-zero integer pair, got [${e}, ${s}]`)
  }
  const transpose = Math.abs(s) > Math.abs(e)
  const major = transpose ? s : e
  const minor = transpose ? e : s
  const flip = major < 0
  const W = transpose ? h : w
  const H = transpose ? w : h
  const g = gcd(Math.abs(major), Math.abs(minor))
  const Q = Math.abs(major) / g
  const B = minor / g
  const src = (x, y) => {
    const ox = flip ? W - 1 - x : x
    return transpose ? ox * w + y : y * w + ox
  }
  const grid = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[y * W + x] = heights[src(x, y)]
  return { grid, W, H, Q, B, src }
}

/** Height at integer column x, fractional row y (linear across rows, clamped). */
function rowLerp(grid, W, H, x, y) {
  const yc = Math.min(Math.max(y, 0), H - 1)
  const y0 = Math.floor(yc)
  const y1 = Math.min(y0 + 1, H - 1)
  const f = yc - y0
  return grid[y0 * W + x] * (1 - f) + grid[y1 * W + x] * f
}

/**
 * Horizon slopes (tan of the horizon elevation, >= 0) of every texel toward the
 * grid step `step` ([east, south] in texels, integers). `cellMeters` is the
 * horizontal size of one texel; heights are meters. Returns a Float32Array in
 * the input's row-major layout.
 *
 * Line K samples column x at row (K + B*x)/Q, so lines run 1/Q rows apart and
 * every texel centre (row integer) lies on exactly one of them: the sweep is
 * the brute-force ray march, not an approximation of it. Cost: Q lines per
 * texel row, i.e. linear in texels with the small factor Q (<= 8 here).
 */
export function sweepHorizon(heights, w, h, step, cellMeters) {
  const { grid, W, H, Q, B, src } = orient(heights, w, h, step)
  const meters = Math.sqrt(1 + (B / Q) ** 2) * cellMeters // per column along a line
  const out = new Float32Array(w * h)
  // Valid samples need row in (-1, H), i.e. K + B*x in (-Q, Q*H).
  const kMin = -Q + 1 - Math.max(0, B * (W - 1))
  const kMax = Q * H - 1 - Math.min(0, B * (W - 1))
  const hullX = new Float64Array(W)
  const hullH = new Float64Array(W)
  for (let K = kMin; K <= kMax; K++) {
    let n = 0
    for (let x = W - 1; x >= 0; x--) {
      const num = K + B * x
      if (num <= -Q || num >= Q * H) continue
      const hp = rowLerp(grid, W, H, x, num / Q)
      while (n >= 2) {
        const sa = (hullH[n - 1] - hp) / (hullX[n - 1] - x)
        const sb = (hullH[n - 2] - hp) / (hullX[n - 2] - x)
        if (sb >= sa) n--
        else break
      }
      if (num % Q === 0 && num >= 0) {
        out[src(x, num / Q)] = n > 0 ? Math.max(0, (hullH[n - 1] - hp) / ((hullX[n - 1] - x) * meters)) : 0
      }
      hullX[n] = x
      hullH[n] = hp
      n++
    }
  }
  return out
}

/**
 * Brute-force reference: march every texel's own ray column by column (the
 * same row interpolation as the sweep) and keep the steepest rise. Quadratic;
 * only for small test patches.
 */
export function bruteHorizon(heights, w, h, step, cellMeters) {
  const { grid, W, H, Q, B, src } = orient(heights, w, h, step)
  const meters = Math.sqrt(1 + (B / Q) ** 2) * cellMeters
  const out = new Float32Array(w * h)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hp = grid[y * W + x]
      let best = 0
      for (let x2 = x + 1; x2 < W; x2++) {
        const y2 = y + (B * (x2 - x)) / Q
        if (y2 <= -1 || y2 >= H) break
        const s = (rowLerp(grid, W, H, x2, y2) - hp) / ((x2 - x) * meters)
        if (s > best) best = s
      }
      out[src(x, y)] = best
    }
  }
  return out
}

/** Mean horizon slope over the OCCLUSION_STEPS directions — the sky-occlusion
 *  measure (a hollow sees high horizons all round, a ridge low ones). */
export function meanHorizon(heights, w, h, cellMeters, steps = OCCLUSION_STEPS) {
  const acc = new Float32Array(w * h)
  for (const st of steps) {
    const s = sweepHorizon(heights, w, h, st, cellMeters)
    for (let j = 0; j < acc.length; j++) acc[j] += s[j]
  }
  for (let j = 0; j < acc.length; j++) acc[j] /= steps.length
  return acc
}
