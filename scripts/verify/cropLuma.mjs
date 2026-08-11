// HOW A GROUND CROP IS READ (work-order 641).
//
// The settlement-edge measurement in polish.mjs judges the painted edge by the
// luminance of small ground crops with the band switched on and off. It used to
// read the crop's MEAN, and the mean is not robust: on 11.08.2026 the `giza
// (wet)` check went red on WebGPU at `outside ×0.963` — the open land outside a
// settlement reported as darkened by the band, on a crop the band cannot reach.
//
// MEASURED CAUSE (not inferred). Sampling that crop 284 times over 90 s at giza
// with the wet override on, band strength fixed, sun and hemi light constant:
// the crop's MEAN sat at 102.5 and jumped to 114.0 — +11.4 % — about every 13 s,
// eleven times in 150 s. The saved frames show what it is: the RAIN of §19.13
// draws close-to-camera streaks, and a bright near-white streak roughly 15 px
// wide falls straight through the 150×46 crop. It is not load, not the band, not
// an unsettled ground state — it is a transient in the picture that the reading
// had no defence against, and whichever of the on/off/on shots it lands in
// biases that shot by up to a ninth of its value. The arithmetic matches the
// reds exactly: a streak in ONE of the two ON shots gives (114.0+102.6)/2/102.6
// = ×1.057, which is the giza outside reading point 549 recorded, and one in the
// OFF shot gives ×0.90 — the ×0.963 and ×0.980 readings are partial hits.
//
// THE FIX IS THE STATISTIC. The band's own effect is a multiplicative tone over
// the WHOLE crop, so every pixel carries it and no pixel carries it more than
// another: the MEDIAN measures it exactly as well as the mean. An intruder that
// covers a minority of the crop, however bright, cannot move the median. On the
// two saved frames: mean 102.56 → 114.22 (+11.4 %), median 102.60 → 103.30
// (+0.68 %). The read-level median on top of it drops a contaminated read
// entirely, so a single streak leaves no trace at all.
//
// The decisions are pure and pinned in cropLuma.test.mjs; the browser side only
// hands the pixels over.

/** Rec-601-ish weights, kept byte for byte from the measurement they replace, so
 *  the numbers this suite reports stay comparable across the change. */
export function luminance(r, g, b) {
  return 0.35 * r + 0.5 * g + 0.15 * b
}

/** Every pixel's luminance in a raw crop, as sharp hands it over. */
export function luminanceSamples(data, { width, height, channels }) {
  const out = new Float64Array(width * height)
  for (let i = 0; i < width * height; i++) {
    out[i] = luminance(data[i * channels], data[i * channels + 1], data[i * channels + 2])
  }
  return out
}

/** The middle value — the even case averages the two middle ones so the reading
 *  moves continuously with the picture instead of snapping between pixels. */
export function median(values) {
  const n = values.length
  if (n === 0) return null
  const sorted = Float64Array.from(values).sort()
  const mid = n >> 1
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The reading of one ground crop: robust to anything covering a minority of it
 *  (a rain streak, a bird, a passing figure), exact on the whole-crop tone
 *  change the edge band actually makes. */
export function cropLuminance(data, info) {
  return median(luminanceSamples(data, info))
}

/** The reading of one SHOT, from its repeated crop readings: the median again,
 *  so a single read taken while a streak crossed the crop is dropped rather than
 *  averaged in. */
export function shotReading(reads) {
  return median(reads)
}
