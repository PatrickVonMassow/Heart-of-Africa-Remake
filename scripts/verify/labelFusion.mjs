// Verdict for the hold-Ctrl no-fusion assertions (point 628): do two label
// boxes print into each other? The rectangles are sampled IN the page, over
// many consecutive frames; this pure half judges the series, so the bar itself
// is testable in the fast layer.
//
// Why a series and not one instant: the declutter decides at the layer's own
// 10 Hz refresh while the subjects walk on every frame, so the single moment
// right after a refresh — which is exactly when a converged DOM poll returns —
// is the moment LEAST able to see a stale decision. The defect this bar exists
// for (the point-600 evidence frame reading "Villager llager") is a STANDING
// fusion: pairs tens of pixels deep, in most frames of any window. What it
// must not red on is the mechanism's own cadence: between two refreshes a
// walking pair can drift a few pixels into each other on a fast machine, for
// a frame or two, and the next refresh separates them again.
//
// The bar therefore refuses the first and tolerates the second: no pair may
// EVER overlap deeper than FUSE_HARD in both axes (half a box height — the
// unreadable class), and shallow grazes may stand in at most FUSE_MAX_SHARE
// of the sampled frames.

/** Overlap in BOTH axes beyond this many CSS pixels counts as a fused pair. */
export const FUSE_TOLERANCE = 6
/** No pair may ever overlap this deep (or deeper) in both axes: at 18 px —
 *  one full line height — the boxes share a line and read as one word salad.
 *  The comparison is >= (Sol review, 17.08.): "as deep as a line" IS the
 *  unreadable class, not one pixel past it. */
export const FUSE_HARD = 18
/** Shallow (under FUSE_HARD) grazes may stand in at most this share of frames.
 *  Why a cushion at all: the declutter decides at the layer's 10 Hz refresh
 *  while the subjects walk every frame, so on a fast machine two boxes decided
 *  a legal LABEL_GAP apart can drift past the tolerance for a frame or two
 *  before the next refresh separates them — the mechanism's cadence, invisible
 *  at <0.1 s, not a standing layout. A REAL defect is not in this band: the
 *  measured old-code failure held fused pairs in 90/90 frames, and the fixed
 *  layout in 0/3600 (quiet machine) — the cushion only keeps a loaded lane's
 *  transient from redding a whole suite run (fail-soft on environment, LOUD on
 *  product bugs). */
export const FUSE_MAX_SHARE = 0.05

/**
 * Judge one sampled series. `reading` is what the page-side sampler returns:
 *   samples      — frames sampled (must cover at least a couple of refreshes),
 *   fusedFrames  — frames in which ANY pair overlapped beyond FUSE_TOLERANCE,
 *   worstDepth   — deepest min(across, down) overlap any pair ever showed,
 *   worstPair    — that pair, described ("A"ד B" WxH px),
 *   labelsMin    — fewest labels any sampled frame held,
 *   labelsMax    — most labels any sampled frame held.
 * A reading that measured no crowd is a FAILURE: this bar exists for the dense
 * scene, and an empty sample would certify nothing (the point-628 lesson —
 * the defective frame stood in the repo while every check was green). The
 * floor binds labelsMin, the WHOLE sample (Sol review, 17.08.): a peak of two
 * labels in one frame followed by 89 frames with every label unmounted is a
 * scene hiding labels instead of placing them, not a certified crowd — and a
 * sampler that never reported the floor is refused outright.
 * `minLabels` is that floor: 2 where the caller stages a crowd (the village),
 * 1 where a lone subject is a legitimate scene (the open savanna, whose
 * presence bar is a separate check). It clamps at 1 — no caller may accept an
 * empty picture.
 */
export function judgeLabelFusion(
  reading,
  { tolerance = FUSE_TOLERANCE, hard = FUSE_HARD, maxShare = FUSE_MAX_SHARE, minLabels = 2 } = {},
) {
  if (!reading || reading.samples <= 0) {
    return { ok: false, detail: 'nothing sampled — the layer must be up while the sampler runs' }
  }
  const { samples, fusedFrames, worstDepth, worstPair, labelsMin, labelsMax } = reading
  if (!Number.isFinite(labelsMin)) {
    return { ok: false, detail: 'the sampler reported no per-frame label floor (labelsMin) — peak alone is not a reading' }
  }
  const floor = Math.max(1, minLabels)
  if (labelsMin < floor) {
    return {
      ok: false,
      detail:
        `the crowd did not hold: as few as ${labelsMin} label(s) in a sampled frame ` +
        `(peak ${labelsMax}) — under the ${floor}-label floor, nothing proven`,
    }
  }
  const allowed = Math.floor(samples * maxShare)
  const standing = fusedFrames > allowed
  const deep = worstDepth >= hard
  const ok = !standing && !deep
  const detail =
    `${fusedFrames}/${samples} frames held a pair fused beyond ${tolerance} px` +
    ` (allowed ${allowed}), deepest ${worstDepth.toFixed(0)} px` +
    (worstPair ? ` [${worstPair}]` : '') +
    `, ${labelsMin}–${labelsMax} labels across the sample` +
    (deep ? ` — as deep as the ${hard} px unreadable bar` : '')
  return { ok, detail }
}
