// The verdict behind the polish suite's slope-footing check (point 412).
//
// Point 300 seats every planted panorama foot on the ground drawn under it, and
// the live check went from 23 % of stance frames over the gate to a clean PASS
// on both backends. But the same PASS line reported `slope over the wheelbase
// [0.00, 0.00, 0.00, 0.00]` and `pitch [0.000 x4]`: at the place it ran the
// silhouettes stood on the flat disc-horizon line, so the seating it exists to
// prove was a NO-OP in the measured frame. The green was true but weak — it said
// the code does not break flat ground, not that it fixes sloped ground.
//
// So the check is a SERIES: many samples across the walk, the ones that stood on
// genuinely sloped ground counted, and a FAILURE when that count is zero. A
// check that never met its own subject must not report success. The distribution
// is reported with the verdict, so the next reader judges the evidence rather
// than the word PASS.
//
// Pure on purpose — the decision is pinned in the Vitest layer, the browser only
// supplies the samples.

/**
 * Rise across an animal's OWN wheelbase (world units) from which a stance counts
 * as standing on sloped ground. Calibratable: 0.05 is a tilt a viewer reads,
 * and far above the exactly-0.00 the flat disc-horizon line produces.
 */
export const MIN_WHEELBASE_SLOPE = 0.05

/** Foot gap allowed, as a fraction of the animal's own body height. */
export const MAX_FOOT_GAP_RATIO = 0.05

/** Sloped samples the series must contain before its verdict means anything. */
export const MIN_SLOPED_SAMPLES = 3

/**
 * Judge a series of stance samples. Each sample is one silhouette in one frame:
 * `{ gap, h, slope, pitch, stretch }` — the vertical gap between the tracked
 * foot and the ground drawn under it, the animal's world height, the rise over
 * its wheelbase, its body pitch and its leg reach.
 *
 * Returns `{ ok, reason, detail, total, sloped, worstSloped, worstFlat,
 * maxSlope }`. `ok` is false when the series is empty, when it contains too few
 * SLOPED samples (the point-412 defect — a verdict without its population), and
 * when a sloped sample's foot hangs off its ground.
 */
export function judgeFootingSeries(samples, opts = {}) {
  const minSlope = opts.minSlope ?? MIN_WHEELBASE_SLOPE
  const maxRatio = opts.maxRatio ?? MAX_FOOT_GAP_RATIO
  const minSloped = opts.minSloped ?? MIN_SLOPED_SAMPLES
  const rows = (samples ?? []).filter((s) => s && Number.isFinite(s.gap) && Number.isFinite(s.h))
  const ratio = (s) => Math.abs(s.gap) / Math.max(1e-6, s.h)
  const sloped = rows.filter((s) => Math.abs(s.slope ?? 0) >= minSlope)
  const flat = rows.filter((s) => Math.abs(s.slope ?? 0) < minSlope)
  const maxSlope = rows.length > 0 ? Math.max(...rows.map((s) => Math.abs(s.slope ?? 0))) : 0
  const worstSloped = sloped.length > 0 ? Math.max(...sloped.map(ratio)) : null
  const worstFlat = flat.length > 0 ? Math.max(...flat.map(ratio)) : null

  const distribution =
    `${rows.length} stance samples, ${sloped.length} on sloped ground ` +
    `(rise >= ${minSlope}; steepest ${maxSlope.toFixed(3)})` +
    (worstSloped == null ? '' : `, worst sloped foot gap ${worstSloped.toFixed(3)} of body height`) +
    (worstFlat == null ? '' : `, worst flat ${worstFlat.toFixed(3)}`)

  if (rows.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      detail: 'MEASURED NOTHING — no silhouette had its tracked leg in stance across the whole series',
      total: 0,
      sloped: 0,
      worstSloped: null,
      worstFlat: null,
      maxSlope: 0,
    }
  }
  if (sloped.length < minSloped) {
    return {
      ok: false,
      reason: 'no-slope',
      detail:
        `MEASURED THE WRONG THING — only ${sloped.length} of ${rows.length} stance samples stood on ` +
        `sloped ground (needs ${minSloped}); steepest rise over a wheelbase ${maxSlope.toFixed(3)}, ` +
        `below the ${minSlope} floor. The seating under test never ran; sample where relief rises.`,
      total: rows.length,
      sloped: sloped.length,
      worstSloped,
      worstFlat,
      maxSlope,
    }
  }
  const bad = sloped.filter((s) => ratio(s) >= maxRatio)
  return {
    ok: bad.length === 0,
    reason: bad.length === 0 ? 'ok' : 'gap',
    detail: bad.length === 0 ? distribution : `${bad.length} sloped samples hang off the ground — ${distribution}`,
    total: rows.length,
    sloped: sloped.length,
    worstSloped,
    worstFlat,
    maxSlope,
  }
}

/**
 * Judge the companion body-pitch rule over the same series: no body leans past a
 * stand-able incline. Judged on the SLOPED samples for the same reason — a flat
 * stance has no pitch to be wrong about.
 */
export function judgePitchSeries(samples, opts = {}) {
  const minSlope = opts.minSlope ?? MIN_WHEELBASE_SLOPE
  const maxPitch = opts.maxPitch ?? 0.3
  const minSloped = opts.minSloped ?? MIN_SLOPED_SAMPLES
  const rows = (samples ?? []).filter((s) => s && Number.isFinite(s.pitch))
  const sloped = rows.filter((s) => Math.abs(s.slope ?? 0) >= minSlope)
  if (sloped.length < minSloped) {
    return {
      ok: false,
      detail:
        `MEASURED THE WRONG THING — only ${sloped.length} of ${rows.length} stance samples stood on ` +
        `sloped ground (needs ${minSloped}): a flat stance cannot lean.`,
      sloped: sloped.length,
      worst: null,
    }
  }
  const worst = Math.max(...sloped.map((s) => Math.abs(s.pitch)))
  return {
    ok: worst <= maxPitch + 1e-6,
    detail: `${sloped.length} sloped stance samples, steepest body pitch ${worst.toFixed(3)} rad (cap ${maxPitch})`,
    sloped: sloped.length,
    worst,
  }
}
