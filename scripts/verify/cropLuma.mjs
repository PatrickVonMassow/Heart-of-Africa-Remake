// HOW A GROUND CROP IS READ (work-order 641).
//
// The settlement-edge measurement in polish.mjs judges the painted edge by the
// luminance of small ground crops with the band switched on and off. It used to
// read the crop's MEAN of a single picture, and that is not robust: on
// 11.08.2026 the `giza (wet)` check went red on WebGPU at `outside ×0.963` — the
// open land outside a settlement reported as darkened by the band, on a crop the
// band cannot reach.
//
// MEASURED CAUSE (not inferred). Sampling that crop 284 times over 90 s at giza
// with the wet override on, band strength fixed, sun and hemi light constant:
// the crop's mean sat at 102.5 and jumped to 114.0 — +11.4 % — about every 13 s,
// eleven times in 150 s. The saved frames show what it is: the RAIN of §19.13
// draws close-to-camera streaks, and a bright near-white streak roughly 14 px
// wide falls straight through the 150×46 crop. It is not load, not the band, not
// an unsettled ground state — it is a TRANSIENT in the picture that the reading
// had no defence against, and whichever of the on/off/on shots it lands in
// biases that shot by up to a ninth of its value. The arithmetic matches the
// reds: with the measured ×1.1137 contamination, a streak in one of the two ON
// shots gives ×1.057 — the reading point 549 recorded, to three decimals — one
// in the OFF shot ×0.898, and a sliver of 4–5 px the ×0.963 this repairs.
//
// WHY NOT SIMPLY THE CROP'S MEDIAN. A spatial median over the crop's pixels does
// reject the streak — but it also rejects the defect the check exists to catch.
// The outside crop clears the band by only 0.3 m, so the FIRST way the band can
// genuinely go wrong is by reaching a few of the crop's near rows: a leak over 8
// of the 46 rows reads ×0.968 on the mean, which is the red it should be, and
// ×1.000 on the spatial median, which is silence. A statistic that cannot be
// fooled by rain and cannot see a real leak either is worse than the bug.
//
// THE STATISTIC, THEREFORE, SEPARATES THE TWO AXES. A rain streak is transient
// in TIME and a band effect is not, so the rejection happens in time and the
// measurement in space:
//
//   per-pixel MEDIAN across the shot's reads   → a streak that crosses a pixel
//                                                in a minority of the reads
//                                                leaves no trace at all
//   then the crop's MEAN of those pixels       → every pixel counts as much as
//                                                it did before, so a band effect
//                                                over ANY part of the crop is
//                                                measured at full strength
//
// The reads must therefore be different PICTURES of the same scene: polish.mjs
// spaces them by both frames and the page's own elapsed time, because a streak
// lingers ~0.7 s and twelve frames can be 0.2 s.
//
// The spatial median keeps ONE job: deciding when the crop has stopped moving
// (`cropMedian`). That loop wants a reading a passing streak cannot restart, and
// it measures nothing.
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

/** The arithmetic mean, which is what MEASURES the band: it weighs every pixel,
 *  so an effect over part of the crop moves it in proportion to the part. */
export function mean(values) {
  const n = values.length
  if (n === 0) return null
  let sum = 0
  for (let i = 0; i < n; i++) sum += values[i]
  return sum / n
}

/** The SETTLE reading of one crop: the spatial median, whose only job is to say
 *  whether the picture has stopped moving. A rain streak must not restart that
 *  loop, and no band strength is being compared here. */
export function cropMedian(samples) {
  return median(samples)
}

/**
 * THE READING OF ONE SHOT, from repeated reads of the SAME crop.
 *
 * Per-pixel median across the reads first — a transient that covers a pixel in a
 * minority of them is dropped outright, not averaged in — then the crop's mean,
 * so a band effect over any part of the crop is carried at full strength.
 *
 * `reads` are the luminance samples of each read, all of the same crop and so of
 * equal length; anything else is a caller bug and reads back as null.
 */
export function shotReading(reads) {
  if (!Array.isArray(reads) || reads.length === 0) return null
  const pixels = reads[0].length
  if (pixels === 0) return null
  for (const r of reads) if (r.length !== pixels) return null
  const acrossReads = new Float64Array(reads.length)
  let sum = 0
  for (let i = 0; i < pixels; i++) {
    for (let j = 0; j < reads.length; j++) acrossReads[j] = reads[j][i]
    sum += median(acrossReads)
  }
  return sum / pixels
}
