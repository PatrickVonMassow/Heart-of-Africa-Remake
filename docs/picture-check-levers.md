# Cheaper picture verification — the levers, and what the replay did to them

Second phase of work-order point 361. The *before* figures live in
[`picture-check-cost.md`](picture-check-cost.md); this document does not repeat
them, it spends them.

The method is the divergent/convergent four-eyes of work-order point 355. Listing
the candidate levers is a **divergent** question, so two models list them
independently and blind and the union is evaluated. The replay is
**convergent**, so one model runs it and the evidence is readable before the
author's rationale.

---

## 1. Lever list A — Opus 5, written blind

Written after reading `picture-check-cost.md` and `render-verify-core.mjs`, and
**before** any second list existed. Committed on its own so the order is
provable in git history rather than asserted.

The measurement's load-bearing fact shapes the whole list: **a frame's reviewing
cost is a function of its VIEWPORT ALONE** — `⌈w/28⌉ × ⌈h/28⌉` visual tokens —
and is uncorrelated with its byte size, its scene complexity or its colour
depth. Every lever below is therefore judged on what it does to *pixel
dimensions* or to *frame count*, never on what it does to megabytes.

### A1 — Crop to the affected region
Screenshot only the rectangle a change can move, not the full frame. 1440×900
(1,716 tokens) down to, say, 560×420 (20 × 15 = 300 tokens): **5.7×**.
Risk: the region must be known in advance, and the two clips already on disk
(566×613, 420×300) show the suites can do it.

### A2 — Downscale before inspection
Resize the frame before it enters a reviewing context. 1440×900 → 720×450 is
26 × 17 = 442 tokens: **3.9×**. Half-size is not half-cost, because the patch
grid is a ceiling on each axis, so the saving is slightly better than quadratic
in the linear factor. Risk: a one-pixel-scale defect (a stepped coast, a hairline
horizon strip) may not survive the resample. This is exactly the lever the point
says to prove rather than assume.

### A3 — Contact sheet (tile many frames into one image)
Because cost is per *image* and grows with its area, N frames tiled into one
sheet at 1/√N scale cost what ONE frame costs. A 37-shot `enrichments` run as a
6×7 sheet at 1440×900 is 1,716 tokens instead of 63,492: **37×**. This is the
single largest arithmetic lever available and it preserves the frame COUNT,
which A2 and A4 do not. Risk: it is A2 with a brutal scale factor (each tile is
240×128), so it inherits A2's fine-detail question in its worst form. Likely
useful as a *triage* sheet that names which frame to open at full size, not as
the inspection itself.

### A4 — Inspect one view per change instead of every frame a suite emits
A path→frame map: a change under `src/render/flora.ts` is reviewed on the flora
frames only. Reduces the 37-shot run to the 2–4 frames that can have moved.
Risk: the map is a claim about coupling, and a wrong map hides a bug in a frame
nobody opened. The stepped coast moved a frame nobody would have mapped to
`redSea.ts`.

### A5 — Emit fewer frames per run
Attack the producer: merge redundant `enrichments`/`polish` shots. Directly hits
the measured hot spot (one suite = 29 % of all frames written). Risk: a deleted
shot is a permanently lost control; indistinguishable from weakening.

### A6 — Golden-image pre-filter (machine decides whether a look is needed)
Keep a per-suite, per-backend baseline frame in the repository. After a run, diff
each new frame against its baseline; only frames whose diff exceeds a threshold
are put in front of a reader. On a change that moves three frames, the reviewing
cost of a 37-shot run falls from 63,492 tokens to 5,148: **12×** on that run, and
to ZERO on a run that moved nothing. Converges with point 207 (ii)'s open
golden-image method — build one thing, not two.
This is the lever with the best cost/risk shape, because it never *hides* a
changed picture; it only skips unchanged ones. Its whole risk sits in the noise
floor: if the renderer is not deterministic, everything is flagged and nothing is
saved.

### A7 — Diff-derived crop
A6 and A1 combined, with the machine choosing the rectangle: crop each flagged
frame to the bounding box of its changed pixels (plus margin). Removes A1's
"guess the region" failure mode entirely — the region is *measured*, not
predicted. Compounds with A6: 3 flagged frames at 400×300 = 3 × 165 tokens
instead of 3 × 1,716.

### A8 — Cross-backend diff instead of two inspections
The guard's most expensive demand is "both backends". Instead of looking at both
sets, diff the WebGPU frame against the WebGL 2 frame of the SAME view and look
only where they disagree. Halves the dual-backend cost, and it targets the exact
class the guard was built for — the point-210 stepped coast WAS a backend
divergence. Risk: a bug present identically on both backends produces a clean
cross-diff, so this can only ever *supplement* a history baseline, never replace
one.

### A9 — Determinism as the enabling precondition
A6/A7/A8 are worthless above a noisy floor. TRAA jitter, wildlife RAF motion, the
in-game clock and `Math.random` all move pixels between two runs of identical
code. `scripts/verify/benchmark.mjs` already installs a seeded PRNG over
`Math.random` and steps a fixed 1/60 s timestep for exactly this reason; the
screenshot path should borrow it. Not a saving in itself — a prerequisite whose
absence rejects three other levers.

### A10 — Perceptual metric rather than raw pixel equality
If A9 cannot drive the floor to zero, the pre-filter needs a metric tolerant of
sub-pixel dither and AA noise but sensitive to structure. Judged by whether it
separates the corpus's real defects from the corpus's run-to-run noise, not by
reputation.

### A11 — Retarget the guard's default suite (no method change at all)
`suggestSuite()` falls back to `'enrichments'` — the 37-frame suite. Its
two-backend pair is 121,374 tokens, **11× the same check through `flow`**. Making
the fallback the cheapest suite that covers the changed paths is a pure routing
change: no frame is cropped, downscaled or skipped, and the control is
bit-identical. Cheapest lever on the list by implementation cost.

### A12 — Separate WRITING a frame from SURFACING it
Runs already write 413 frames in two days; nothing records what was *looked at*
(gap 1 of the measurement). Have the suite write everything as now, but print a
short, ranked list of the frames worth opening. Costs nothing, loses nothing, and
closes the measurement's largest gap by making "what was reviewed" a recorded
number.

### A13 — Rejected on arithmetic before any replay
Greyscale, palette reduction, PNG re-compression, JPEG quality, byte-size budgets
and de-duplicating identical PNG blobs by hash. All of them reduce *bytes*, and
the measurement proves bytes are not the expensive resource: every 1440×900 frame
on disk costs exactly 1,716 tokens across a 24× byte spread. These are recorded
as considered-and-rejected so the next reader does not re-derive them.

---

<!-- §2 (the blind second list), §3 (the replay) and §4 (the outcome) follow in
later commits, so that the order in which they were written stays provable. -->
