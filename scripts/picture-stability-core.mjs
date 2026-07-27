// Pure decision logic of the capture-stability probe (picture-stability.mjs is
// the I/O wrapper: it drives the suite, reads the PNGs and restores the tracked
// frames). Kept side-effect-free so the Vitest layer can sweep it without a
// browser (scripts/picture-stability-core.test.mjs).
//
// WHY THIS EXISTS (point 361). Every diff-based way of making the rendered-
// picture check cheaper — a golden-image pre-filter, a cross-backend diff, a
// diff-derived crop — rests on one assumption nobody had measured: that two runs
// of IDENTICAL code produce near-identical pictures. Measured, they do not. Two
// back-to-back runs of scripts/verify/world.mjs on WebGL 2, same commit, same
// machine, disagreed on up to 94 % of pixels above tolerance 24, and one frame
// differed by 128 grey levels on average because the two runs had captured
// different views of different places — the capture races the camera settle
// under load. The smallest REAL defect in the historical corpus moves 0.75 % of
// pixels. Signal sat two orders of magnitude below the floor, so the whole
// family was rejected (docs/picture-check-levers.md §3.2/§3.4).
//
// This module turns "can we diff frames yet?" from a belief into a command. Fix
// the capture, run the probe, and when the floor drops under SIGNAL_BAR the
// rejected levers become worth attempting again.

/**
 * The smallest real defect the historical corpus produced, as a fraction of
 * pixels differing above TOLERANCE: the floating horizon strip's re-baseline of
 * verification/105-cairo-panorama-giza-clear.png moved 0.75 % of the frame.
 * A capture path whose run-to-run noise reaches this cannot support a pre-filter
 * — the filter would be answering noise, not the picture.
 */
export const SIGNAL_BAR = 0.0075

/**
 * Per-channel delta above which a pixel counts as changed. 8/255 is generous to
 * dither and AA and still far below any defect in the corpus.
 */
export const TOLERANCE = 8

/**
 * Compare two raw, alpha-stripped pixel buffers of the same geometry.
 * Returns the fraction of pixels whose largest channel delta exceeds `tol`,
 * plus the mean and maximum delta. Total: never throws on well-formed input,
 * and reports a size mismatch rather than guessing.
 */
export function comparePixels(a, b, { width, height, channels = 3, tol = TOLERANCE } = {}) {
  const n = width * height
  if (!a || !b || a.length < n * channels || b.length < n * channels) {
    return { sizeMismatch: true, ratio: 1, mean: 255, max: 255 }
  }
  let changed = 0
  let sum = 0
  let max = 0
  for (let i = 0; i < n; i++) {
    const o = i * channels
    const d = Math.max(
      Math.abs(a[o] - b[o]),
      Math.abs(a[o + 1] - b[o + 1]),
      Math.abs(a[o + 2] - b[o + 2]),
    )
    sum += d
    if (d > max) max = d
    if (d > tol) changed++
  }
  return { sizeMismatch: false, ratio: changed / n, mean: sum / n, max }
}

/**
 * Roll the per-frame rows into a verdict. `stable` is the claim a golden-image
 * pre-filter needs: EVERY frame must sit under the bar, because one unstable
 * frame is one frame the filter would flag on every run for ever.
 */
export function summarise(rows, bar = SIGNAL_BAR) {
  const usable = Array.isArray(rows) ? rows.filter((r) => r && typeof r.ratio === 'number') : []
  if (usable.length === 0) return { frames: 0, stable: false, worst: null, worstRatio: null, overBar: [] }
  let worst = usable[0]
  for (const r of usable) if (r.ratio > worst.ratio) worst = r
  const overBar = usable.filter((r) => r.sizeMismatch || r.ratio > bar).map((r) => r.frame)
  return {
    frames: usable.length,
    stable: overBar.length === 0,
    worst: worst.frame,
    worstRatio: worst.ratio,
    overBar,
  }
}

/** Human-readable table of the rows, worst first. */
export function formatRows(rows) {
  const sorted = [...rows].sort((x, y) => y.ratio - x.ratio)
  const w = Math.max(5, ...sorted.map((r) => r.frame.length))
  const head = 'frame'.padEnd(w) + '   differing   mean Δ   max Δ'
  const body = sorted.map(
    (r) =>
      r.frame.padEnd(w) +
      (r.sizeMismatch ? '   SIZE MISMATCH' : `${(r.ratio * 100).toFixed(2).padStart(11)}%${r.mean.toFixed(2).padStart(9)}${String(r.max).padStart(8)}`),
  )
  return [head, ...body].join('\n')
}
