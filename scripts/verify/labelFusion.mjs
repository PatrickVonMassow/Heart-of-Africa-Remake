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
/** No pair may ever overlap deeper than this in both axes: at 18 px the boxes
 *  share a full line and the pair reads as one word salad. */
export const FUSE_HARD = 18
/** Shallow (≤ FUSE_HARD) grazes may stand in at most this share of frames —
 *  inter-refresh drift, not a standing layout. */
export const FUSE_MAX_SHARE = 0.05

/**
 * Judge one sampled series. `reading` is what the page-side sampler returns:
 *   samples      — frames sampled (must cover at least a couple of refreshes),
 *   fusedFrames  — frames in which ANY pair overlapped beyond FUSE_TOLERANCE,
 *   worstDepth   — deepest min(across, down) overlap any pair ever showed,
 *   worstPair    — that pair, described ("A"ד B" WxH px),
 *   labelsMax    — most labels any sampled frame held.
 * A reading that measured no crowd is a FAILURE: this bar exists for the dense
 * scene, and an empty sample would certify nothing (the point-628 lesson —
 * the defective frame stood in the repo while every check was green).
 * `minLabels` is that floor: 2 where the caller stages a crowd (the village),
 * 1 where a lone subject is a legitimate scene (the open savanna, whose
 * presence bar is a separate check).
 */
export function judgeLabelFusion(
  reading,
  { tolerance = FUSE_TOLERANCE, hard = FUSE_HARD, maxShare = FUSE_MAX_SHARE, minLabels = 2 } = {},
) {
  if (!reading || reading.samples <= 0) {
    return { ok: false, detail: 'nothing sampled — the layer must be up while the sampler runs' }
  }
  const { samples, fusedFrames, worstDepth, worstPair, labelsMax } = reading
  if (labelsMax < minLabels) {
    return { ok: false, detail: `only ${labelsMax} label(s) in the picture — under the ${minLabels}-label floor, nothing proven` }
  }
  const allowed = Math.floor(samples * maxShare)
  const standing = fusedFrames > allowed
  const deep = worstDepth > hard
  const ok = !standing && !deep
  const detail =
    `${fusedFrames}/${samples} frames held a pair fused beyond ${tolerance} px` +
    ` (allowed ${allowed}), deepest ${worstDepth.toFixed(0)} px` +
    (worstPair ? ` [${worstPair}]` : '') +
    `, ${labelsMax} labels at peak` +
    (deep ? ` — DEEPER than the ${hard} px unreadable bar` : '')
  return { ok, detail }
}
