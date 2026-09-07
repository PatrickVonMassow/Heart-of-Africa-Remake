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
/** A pair overlapping this deep (or deeper) in both axes is UNREADABLE: at
 *  18 px — one full line height — the boxes share a line and read as one word
 *  salad. The comparison is >= (Sol review, 17.08.): "as deep as a line" IS the
 *  unreadable class, not one pixel past it.
 *
 *  WHAT CHANGED 07.09.2026 (point 1067): a single unreadable FRAME used to red
 *  the whole run, so the depth had no cushion at all while the count had one —
 *  and the measurement says both bars are looking at the same transient. The
 *  depth still names the unreadable class; how many frames may hold it is the
 *  cushion below, which is why `deepFrames` is now part of the reading. */
export const FUSE_HARD = 18
/** Grazes may stand in at most this share of frames — the cushion the count and
 *  the depth now share.
 *  Why a cushion at all: the declutter decides at the layer's 10 Hz refresh
 *  while the subjects walk every frame, so two boxes decided a legal LABEL_GAP
 *  apart can drift past the tolerance for a frame or two before the next
 *  refresh separates them — the mechanism's cadence, not a standing layout. A
 *  REAL defect is not in this band: the measured old-code failure held fused
 *  pairs in 90/90 frames, and the fixed layout in 0/3600 (quiet machine) — the
 *  cushion only keeps a loaded lane's transient from redding a whole suite run
 *  (fail-soft on environment, LOUD on product bugs).
 *
 *  WHY THE DEPTH SHARES IT, measured 07.09.2026 (point 1067). The depth bar used
 *  to have no cushion: ONE frame of the 90 reaching FUSE_HARD reddened the run.
 *  What was measured, on the WebGL 2 lane the reds were reported from:
 *   - `declutterLabels` cannot PLACE an overlapping pair — it puts a box only
 *     where no already-placed box comes within LABEL_GAP, else a line higher,
 *     else nowhere — so every fused frame is a pair that MOVED into itself
 *     after placement, and the rectangles say so: pairs 22–29 px apart where the
 *     layout demands 48–56, i.e. 27–41 px of travel since the decision.
 *   - 2160 frames sampled frame by frame (quiet WebGL 2, quiet WebGPU, squeezed
 *     WebGL 2) held 0 fused pairs, and the drawn box matched a freshly measured
 *     one to 0.0 px, so nothing is under-sized.
 *   - The check itself: 1/8 runs red unthrottled, 5/8 red at ~1/4 core, 0/8 red
 *     on WebGPU at that same squeeze — load-shaped and lane-shaped.
 *   - 22 traced runs: the window sampled BEFORE the shutter held 0 fused frames
 *     in every single one; every fusion the check ever counted stood in the
 *     window after it, lasted 1–3 frames, and had moved geometry under it (43 of
 *     45 fused frames). None of them carried the previous frame's places under a
 *     new text list, so it is drift, not a stale layout.
 *  A transient of one to three frames on a lane whose frames last 130–170 ms is
 *  the cadence this cushion exists for, and the depth is what that cadence
 *  reaches first: two labels on the SAME line already overlap the full 19 px
 *  vertically, so `min(across, down)` crosses 18 px as soon as they graze at all.
 *  The count bar therefore excused what the depth bar reddened, on the same
 *  frames. Both now read the same cushion. */
export const FUSE_MAX_SHARE = 0.05

/** The cushion for the DENSE crowd (the village), measured 07.09.2026 for point
 *  1067. The share above is set for the sparse savanna, where a fused frame is
 *  rare; the village holds 17–23 labels at once, so far more pairs sit near the
 *  legal minimum gap and any drift crosses the 6 px tolerance at once. What the
 *  squeezed WebGL 2 lane really produced there, across 22 traced runs at about a
 *  quarter core: up to 9 fused frames of 90, every one of them a pair that MOVED
 *  into itself after a placement the declutter could not have made overlapping.
 *  The quiet lane produced 0 of 90 in the same scene, and the point-628 defect
 *  held a fused pair in 90 of 90. So 15 % (13 of 90) clears the measured
 *  transient with room and still reds anything that stands. */
export const FUSE_CROWD_SHARE = 0.15

/**
 * Judge one sampled series. `reading` is what the page-side sampler returns:
 *   samples      — frames sampled (must cover at least a couple of refreshes),
 *   fusedFrames  — frames in which ANY pair overlapped beyond FUSE_TOLERANCE,
 *   deepFrames   — of those, the frames whose deepest pair reached FUSE_HARD,
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
/**
 * Merge two sampled windows into one reading. The suites sample a window
 * BEFORE their screenshot and a second one AFTER it (Sol review, 17.08.): a
 * check that closes its sample and then opens the shutter certifies a picture
 * it never measured — a fusion beginning in the gap is photographed green.
 * No page-side sampler can read the compositor's exact screenshot moment, so
 * the capture is BRACKETED: it lies between two adjacent measured windows,
 * and a standing defect at the shutter is standing in at least one of them.
 *
 * RESIDUAL (Sol re-review, 17.08.; accepted, not fixable from the page): the
 * bracket cannot see (1) a fusion that exists ONLY between the last measured
 * frame before the shutter and the first one after — i.e. one that both
 * appears and vanishes inside the capture itself — nor (2) a shallow
 * (< FUSE_HARD) fusion that coincides with the capture while staying inside
 * the FUSE_MAX_SHARE tolerance of the merged series, nor (3) the label FLOOR
 * at that same instant (third Sol round): both windows can satisfy `minLabels`
 * while the labels are gone from the captured composite alone, so the bar can
 * certify a screenshot without the crowd it demands. It cannot, because no
 * script-side reading exists for the compositor's exact screenshot instant:
 * rAF sampling observes the frames around the capture, never the captured
 * composite itself — which is the very reason the shutter is bracketed rather
 * than "measured". What makes the hole improbable rather than impossible, and
 * the honest form of that claim (same round): the SUBJECTS move every frame, so
 * geometry does change on the capture's timescale — but the placement does not.
 * The declutter's decisions persist until its next 10 Hz refresh, so per-frame
 * drift moves a box by the distance a villager walks in ~16 ms, which is the
 * shallow class (2) already names, not the full-line overlap this bar exists
 * for. A defect of THAT class stands for whole refresh intervals and lands in
 * at least one window; only a capture-synchronous unmount could take the floor
 * out, and nothing schedules one.
 */
export function mergeFusionReadings(a, b) {
  // BOTH halves are required (Sol re-review, 17.08.): a merge that fell back to
  // one side would silently degrade the bracketed certification to exactly the
  // one-sided check the bracket replaced. An empty half judges as a FAILURE
  // that names itself.
  const aEmpty = !a || !(a.samples > 0)
  const bEmpty = !b || !(b.samples > 0)
  if (aEmpty || bEmpty) {
    const missing = aEmpty && bEmpty ? 'both windows' : aEmpty ? 'the pre-shutter window' : 'the post-shutter window'
    return { samples: 0, missing }
  }
  const deeper = b.worstDepth > a.worstDepth ? b : a
  return {
    samples: a.samples + b.samples,
    fusedFrames: a.fusedFrames + b.fusedFrames,
    // A sampler that reports no deep count at all is refused by the judge below
    // rather than silently counted as zero — `undefined + undefined` is NaN, and
    // NaN > allowed is false, which would turn a missing reading into a pass.
    deepFrames: a.deepFrames + b.deepFrames,
    worstDepth: deeper.worstDepth,
    worstPair: deeper.worstPair,
    labelsMin: Math.min(a.labelsMin, b.labelsMin),
    labelsMax: Math.max(a.labelsMax, b.labelsMax),
  }
}

export function judgeLabelFusion(
  reading,
  { tolerance = FUSE_TOLERANCE, hard = FUSE_HARD, maxShare = FUSE_MAX_SHARE, minLabels = 2 } = {},
) {
  if (!reading || reading.samples <= 0) {
    const cause = reading?.missing
      ? `${reading.missing} of the bracket measured no frames — an empty half certifies nothing`
      : 'the layer must be up while the sampler runs'
    return { ok: false, detail: `nothing sampled — ${cause}` }
  }
  const { samples, fusedFrames, deepFrames, worstDepth, worstPair, labelsMin, labelsMax } = reading
  if (!Number.isFinite(labelsMin)) {
    return { ok: false, detail: 'the sampler reported no per-frame label floor (labelsMin) — peak alone is not a reading' }
  }
  // THE DEEP COUNT IS MANDATORY (point 1067): it is what the depth bar now reds
  // on, so a sampler that does not report it has measured half the bar, and a
  // missing count must fail loudly instead of passing as zero.
  if (!Number.isFinite(deepFrames)) {
    return { ok: false, detail: 'the sampler reported no deep-frame count (deepFrames) — the depth bar has nothing to read' }
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
  // THE DEPTH READS THE SAME CUSHION AS THE COUNT (point 1067): the unreadable
  // class is still `>= hard`, but it must STAND — a frame or three of it on a
  // lane whose frames last a sixth of a second is the drift the cushion above
  // is spelled out for, and the old bar reddened on exactly one such frame.
  const deep = deepFrames > allowed
  const ok = !standing && !deep
  const detail =
    `${fusedFrames}/${samples} frames held a pair fused beyond ${tolerance} px` +
    ` (allowed ${allowed}), ${deepFrames} of them at the ${hard} px unreadable bar` +
    `, deepest ${worstDepth.toFixed(0)} px` +
    (worstPair ? ` [${worstPair}]` : '') +
    `, ${labelsMin}–${labelsMax} labels across the sample` +
    (deep ? ` — the unreadable overlap STANDS` : '')
  return { ok, detail }
}
