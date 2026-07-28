// The decision layer of the lurking-crocodile check in enrichments.mjs
// (CLAUDE.md §7.1 pt. 12, design.md §19.16). Kept pure and separate so the rule
// — and above all its TEETH — can be pinned in the Vitest layer instead of only
// by running a browser suite for twenty minutes.
//
// WHY THIS EXISTS (point 382). The check asks one question: does the lunging
// body read as an ANIMAL rather than as the water it came out of? It used to
// answer that with an absolute channel delta between two rect MEANS, compared
// against a hand-set 45 — and so decided on the second decimal of a colour
// average. It read 44.2 and 44.6 in one evening on a quiet machine (the same
// check twice: the candidate-real signature, not the load one), and 37.5-43.7
// across twelve staged repeats measured for this point on both backends — red on
// every one of them. The picture was never in
// doubt; the measure was. A mean over the rect DILUTES the body with the water
// beside it, and how much it dilutes moves with the projection, so the number
// carries the zoom and the camera as much as the crocodile.
//
// THE REPLACEMENT is scale-free. Within ONE frame:
//   median colour of the rect  the water (water is the majority of these rects,
//                              so the median pixel IS a water pixel)
//   d_i                        each pixel's L1 distance from that median
//   spread                     the median of the d_i — the water's own scale
//   share                      #{ d_i > sigmas · spread } / (ordinary pixels)
// Multiply every colour distance in the rect by any λ — a brighter sky, a
// darker backend, a passing cloud, a different exposure — and both d_i and
// `spread` scale with it, so the share does not move. Add any constant to every
// channel and nothing moves either. It is a FRACTION of the rect, so the
// projection drops out too. The only absolute left is the 1-unit floor under
// `spread`, which is one 8-bit step: the smallest colour difference that exists.
//
// Bright specular/foam is water, not animal, and is dropped BEFORE anything is
// measured — including before the reference colour is taken. The old code
// excluded foam from the count but left it in the MEAN, so a rect with foam in
// it reported nearly every water pixel as crocodile (measured 2548 of 2613 on an
// unpinned staging that had wandered onto the falls).

/** Pixels brighter than this in EVERY channel are specular/foam: water, not animal. */
export const FOAM_MIN_CHANNEL = 200
/** How many "water spreads" from the water colour a pixel must sit to read as animal. */
export const ANIMAL_SIGMAS = 6
/** Below this fraction of ordinary (non-foam) pixels the median is no longer the
 *  water and the measure has no meaning — it reports null rather than a number
 *  that looks like one. */
export const MIN_ORDINARY_FRACTION = 0.6
/** The risen body must repaint at least this share of its own footprint.
 *  Measured 0.303-0.316 over twelve staged repeats on both backends, so a 3x
 *  margin — and it is a GEOMETRIC share of the rect, not a colour value. */
export const STRIKE_MIN_SHARE = 0.1
/** …and must beat the water's own floor in the same rect this many times over.
 *  The clause that bites when the water itself is busy: a foaming or
 *  shadow-crossed rect raises the floor, and the bar rises with it. */
export const SEPARATION = 8

const medianOf = (arr) => {
  const s = Float64Array.from(arr).sort()
  return s[s.length >> 1]
}

/**
 * The share of a rect that does not belong to the water population around it.
 * @param {{data: ArrayLike<number>, n: number, ch: number}} s raw RGB(A) sample
 * @param {number} [sigmas]
 * @returns {{share: number|null, spread?: number, kept: number, n: number, med?: number[]}}
 */
export function animalShare(s, sigmas = ANIMAL_SIGMAS) {
  const R = [], G = [], B = []
  for (let i = 0; i < s.n; i++) {
    const r = s.data[i * s.ch], g = s.data[i * s.ch + 1], b = s.data[i * s.ch + 2]
    if (Math.min(r, g, b) > FOAM_MIN_CHANNEL) continue
    R.push(r); G.push(g); B.push(b)
  }
  const kept = R.length
  if (kept < s.n * MIN_ORDINARY_FRACTION) return { share: null, kept, n: s.n }
  const med = [medianOf(R), medianOf(G), medianOf(B)]
  const d = new Float64Array(kept)
  for (let i = 0; i < kept; i++) d[i] = Math.abs(R[i] - med[0]) + Math.abs(G[i] - med[1]) + Math.abs(B[i] - med[2])
  const spread = Math.max(medianOf(d), 1)
  const T = sigmas * spread
  let c = 0
  for (let i = 0; i < kept; i++) if (d[i] > T) c++
  return { share: c / kept, spread, kept, n: s.n, med }
}

/**
 * The water floor a strike must beat: whatever share the SAME rect shows with no
 * crocodile over it, never below one pixel's worth. A reference rect too foamy to
 * measure yields 1, which no share can beat — the check then fails loudly rather
 * than trusting an unmeasurable staging.
 */
export function waterFloor(refShare, pixels) {
  return Math.max(refShare === null || refShare === undefined ? 1 : refShare, 1 / Math.max(pixels, 1))
}

/**
 * THE CRITERION, written once so the very same function can be fed the HIDDEN
 * frame and demanded to say no. Both clauses are dimensionless.
 * @param {{share: number|null}} a the measured share of the frame under test
 * @param {number} floor the water floor from `waterFloor`
 */
export function readsAsAnimal(a, floor, { minShare = STRIKE_MIN_SHARE, separation = SEPARATION } = {}) {
  return a.share !== null && a.share !== undefined && a.share >= minShare && a.share >= separation * floor
}
