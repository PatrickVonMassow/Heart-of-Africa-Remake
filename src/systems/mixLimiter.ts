// The last stage of the audio graph (design.md §19.1, point 1156): a fixed
// transfer curve between the master gain and the destination.
//
// WHY A CURVE AND NOT A COMPRESSOR. The design promises that the mix CANNOT
// leave full scale. A `DynamicsCompressorNode` rides the gain with an attack,
// so the first sample of a transient passes through it un-reduced — it lowers
// the odds of a clip, it does not remove them. A waveshaper is a pure function
// of the sample: whatever arrives, what leaves is bounded by the curve's own
// range, with no state and nothing to outrun.
//
// WHAT IT COSTS. Below the threshold the curve is the identity, bit for bit, so
// the player's ambience volume, the village speech factor and the chief's drum
// peak pass untouched. Above it the excess is bent towards the ceiling, which
// rounds the very top of a transient that lands on an already loud moment.

import { balance } from '../config/balance'

/** A `WaveShaper`'s curve is indexed over an input of ±1, so the stage scales
 *  into that domain and back out again. 2 keeps sums up to ±2 — 6 dB over full
 *  scale, against a measured worst case of 1.336 — on the shaped part of the
 *  curve instead of flat against the table's edge, which would be a hard clip
 *  by another name. */
export const MIX_LIMITER_DOMAIN = 2

/** Curve resolution. ODD, so the table has an exact sample at zero and the
 *  stage adds no DC offset to a silent graph. */
export const MIX_LIMITER_CURVE_POINTS = 2049

/** The stage's transfer function, for one sample: the identity below the
 *  threshold, and above it a knee that approaches the ceiling without ever
 *  reaching it. `tanh` is used for its unit slope at zero, which makes the two
 *  halves meet with the same gradient — the knee opens smoothly out of the
 *  identity rather than cornering into it. */
export function limitMixSample(x: number): number {
  const ceiling = Math.max(0, balance.mixLimiter.ceiling)
  const threshold = Math.max(0, Math.min(balance.mixLimiter.threshold, ceiling))
  const magnitude = Math.abs(x)
  if (magnitude <= threshold) return x
  const head = ceiling - threshold
  const sign = x < 0 ? -1 : 1
  if (head <= 0) return sign * threshold
  return sign * (threshold + head * Math.tanh((magnitude - threshold) / head))
}

/** The table the `WaveShaper` carries: `limitMixSample` over the scaled domain.
 *  The browser reads it with linear interpolation, and the knee is concave, so
 *  an interpolated value can only fall SHORT of the curve — never past the
 *  ceiling. */
export function mixLimiterCurve(points: number = MIX_LIMITER_CURVE_POINTS): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const unit = (2 * i) / (points - 1) - 1
    curve[i] = limitMixSample(unit * MIX_LIMITER_DOMAIN) / MIX_LIMITER_DOMAIN
  }
  return curve
}

/** How the browser reads a shaper's table: indexed over an input of ±1 with
 *  linear interpolation, and an input outside that range clamped to the table's
 *  end. The tests measure THROUGH the deployed stage with this — reading the
 *  `curve` the shaper really carries and applying the gains around it — rather
 *  than re-evaluating the formula beside the graph. */
export function readCurveTable(curve: Float32Array, input: number): number {
  const unit = Math.max(-1, Math.min(1, input))
  const position = ((unit + 1) / 2) * (curve.length - 1)
  const low = Math.floor(position)
  const high = Math.min(curve.length - 1, low + 1)
  return curve[low] + (curve[high] - curve[low]) * (position - low)
}
