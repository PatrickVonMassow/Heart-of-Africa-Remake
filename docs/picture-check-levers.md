# Cheaper picture verification — the levers, and what the replay did to them

Second phase of work-order point 361. The *before* figures live in
[`picture-check-cost.md`](picture-check-cost.md); this document does not repeat
them, it spends them.

The method is the divergent/convergent four-eyes of CLAUDE.md §6. Listing
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

## 2. Lever list B — Fable 5, written blind

Asked the same question from the same measurement, forbidden to read §1 or any
`feat/361-*` branch, and confirmed it did not. Summarised here; the wording is
condensed, the content is not.

| | Lever | Mechanism |
| --- | --- | --- |
| B-A | **Snap the viewport to 28-px multiples** | 1440×900 is billed as 52 × 33 patches = 1456×924 px, so 16 px of width and 24 px of height are paid for and not delivered. 1428×896 = 51 × 32 = 1,632 tokens, 4.9 % off every frame for an identical picture. |
| B-B | Downscale before review | 720×450 = 442 tokens, 3.9×. |
| B-C | Crop to the region of interest | The repo already ships two clips (462 and 165 tokens). |
| B-D | Diff-gated review against the tracked baselines | Only changed frames reach a reader; 12× on a typical change, zero on an unchanged suite. |
| B-E | Deterministic capture as D's precondition | Lift the F8 benchmark's seeded PRNG and fixed 1/60 s timestep into `_boot.mjs`. |
| B-F | **Temporal-variance probe for flicker** | Capture N consecutive frames, assert per-pixel variance in still regions. Covers the one corpus row a still frame cannot cover in principle. |
| B-G | Cross-backend machine diff instead of a second review | ~2×, and it targets the stepped coast directly. |
| B-H | Path-aware suite routing | `suggestSuite()` parrots the last suite and otherwise defaults to the 37-frame one; a diff→suite map routes a HUD change to `flow`: 11×. |
| B-I | **Split `enrichments` into topic sub-suites** | A change owes only its covering sub-suite; ~7×. |
| B-J | **Fail fast on the expensive suite** | Eight of ten recorded `enrichments` runs failed and still wrote all 37 frames at 951–1029 s — ≈ 2.1 h of failing wall clock in the two-day window. |
| B-K | Thumbnail contact sheet, escalate on suspicion | 37 thumbnails at 448×280 = 5,920 tokens; 5.5×. |
| B-L | **PNG byte delta as a zero-token ranking signal** | Bytes are worthless as a cost measure but not as a *content* measure: at fixed dimensions a byte delta is a free anomaly signal. |
| B-M | **Pixel probes that read the rendered frame** | The sunken sphinx passed because the assertion was `sphinxBuried === true`; a probe that projects the bounding box and reads real pixels costs zero review tokens. |
| B-N | **Make WebGPU the headless-testable, even primary, lane** | 39 of 40 recorded runs were WebGL 2 while two of the eight corpus bugs are WebGPU-only — the practised split has the wrong primary. |
| B-O | Instrument what a reader actually opened | Closes the measurement's largest gap and lets the guard demand *frames inspected* rather than *run passed*. |
| B-P | **Prompt-cache the stable baselines** | Attacks the re-read multiple rather than the first read. |
| B-Q | **Untrack `verification/` (LFS or ignore)** | 75.5 MiB in every clone, a new blob per re-baseline. Storage, not tokens; a history rewrite, so a user decision. |

### What the second list added, and what it corrected

Independent convergence on eight levers — downscale, crop, contact sheet,
golden diff, determinism, cross-backend diff, suite routing, fewer frames —
is itself evidence that the obvious search space was covered. The value sat in
the divergence, and it was real:

- **B-A** is arithmetic nobody in list A saw: the patch grid rounds *up*, so the
  current viewport buys 1,716 tokens of billing for 1,296,000 px of picture when
  1,345,344 px would cost the same. List A reasoned about scaling the image and
  never about the quantisation.
- **B-F**, **B-M** and **B-L** attack the problem from outside the picture
  entirely, and B-F covers corpus row 2, which no still frame can cover at all.
- **B-P** carries a correction to the *measurement*, not just to the levers: the
  cost document treats "every frame read once" as an upper bound, but images sit
  in a reviewing context and are re-sent as input on every following turn unless
  cached. The real figure is a multiple of the stated one, not a fraction of it.
  That is recorded here as an unmeasured correction, not folded into any number.
- **B-N** reads the 39:1 backend split as a defect in the practice rather than
  as a neutral observation, which list A did not.

List A's own divergence, kept for the union: **A7** (let the machine choose the
crop from the diff bounding box rather than a human predicting it) and **A13**
(the six byte-shrinking ideas recorded as rejected on arithmetic).

---

## 3. The replay

The acceptance test the point demands: run each candidate against the state
*before* each historical bug was fixed and require it to FAIL. Reproduce with
`node scripts/picture-stability.mjs --help` and the corpus table in
[`picture-check-cost.md` §4](picture-check-cost.md#4-the-historical-corpus).

### 3.1 The corpus is thinner than it looks

`verification/` is tracked in git, so the frames as they stood at each bug's
parent commit can be extracted directly — no old checkout needs to build or run.
That makes the replay cheap. It also makes its coverage checkable, and the
check is unflattering. Of the eight rows, **three carry a usable before/after
frame pair**:

| Row | Usable pair? | Why not |
| --- | --- | --- |
| 1 stepped coast | **no** | The defect was WebGPU-only; every archived frame is WebGL 2, i.e. the picture that *looked fine*. The artefact cannot contain the bug. |
| 2 flora jitter | **no** | No screenshot exists, and none could: it is temporal. |
| 3 horizon strip | **no** | Its evidence frame `136-cairo-silhouette-footing.png` was `A`dded *by* the fix. The 16 pre-existing frames it re-baselined differ by 0.75–1.73 % of pixels, and the pair is not separable by eye even at full resolution. |
| 4 doubled Giza label | **no** | Never fixed. |
| 5 invisible season | partial | Buggy frames exist (`108`/`109`); no committed fixed counterpart of the same view. |
| 6 haze at default zoom | **yes** | `e581415` → `0bd1262`. |
| 7 sunken sphinx | **yes** | `de7717e` → `9d5fff7`, re-baselined by the fix itself. |
| 8 texture dip | **no** | Numeric, not a frame. |

Row 3 deserves its own sentence, because it changes what the corpus means: the
floating horizon strip was **not** caught by reviewing the frames the suite
already wrote. It was caught by someone going to look, and the frame that shows
it exists only because of that. A cheaper *review* of the standing frame set
would not have missed this bug; the standing frame set missed it.

### 3.1b A finding the replay produced on the way past

Assembling the corpus meant listing the files each fix touched, and row 1's list
is two entries long: `src/world/redSea.ts` and its test. That path is **not in
the render set** — `isRenderPath` covers `src/render/`, `src/scenes/`,
`src/ui/`, `src/App.tsx`, TSL modules and the browser suites, and `src/world/`
is none of them. Checked against the shipped code:

```
src/world/redSea.ts    render=false  dual=false
```

So the point-210 stepped coast — the incident named in the header of
`render-verify-core.mjs` as the reason the guard exists — **would not trip the
guard today.** It is recorded here and not fixed: widening the render set
*raises* the cost this point was opened to lower, so it is a decision, not a
tidy-up.

### 3.2 The noise floor — the result that decided the exercise

Every diff-based lever (A6, A7, A8, B-D, B-G) rests on one unstated assumption:
that two runs of *identical code* produce nearly identical pictures. Nobody had
measured it. So it was measured — `scripts/verify/world.mjs` run twice back to
back on WebGL 2, same commit, same machine, nothing changed in between:

| Frame | pixels differing at tol 0 | tol 8 | tol 24 | tol 48 | mean Δ (0–255) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `10-worldmodel-nile-delta-cairo` | 94.86 % | 33.31 % | 13.00 % | 7.91 % | 14.10 |
| `11-worldmodel-khartoum-confluence` | 83.23 % | 27.81 % | 7.43 % | 3.71 % | 9.25 |
| `12-worldmodel-lake-victoria` | 99.54 % | 98.62 % | 94.17 % | 86.40 % | **127.93** |
| `13-worldmodel-kilimanjaro` | 99.38 % | 81.48 % | 38.54 % | 18.44 % | 31.81 |
| `14-worldmodel-congo-mouth-boma` | 99.33 % | 85.28 % | 73.16 % | 62.43 % | 66.43 |
| `15-worldmodel-victoria-falls` | 99.49 % | 91.88 % | 72.50 % | 60.68 % | 77.63 |
| `16-worldmodel-cape-town` | 95.63 % | 44.21 % | 23.16 % | 12.74 % | 20.28 |
| `17-worldmodel-lake-chad` | 99.32 % | 89.69 % | 79.43 % | 66.10 % | 93.71 |

Set that against the corpus signals measured the same way: the horizon-strip
re-baselines move **0.75 %** and **1.73 %** of pixels at tolerance 8. **The
quietest frame in the noise table moves 27.81 % — thirty-seven times the
smallest real defect. The loudest moves 128 grey levels on average, which is
not noise at all.**

A second, independent probe run (`scripts/picture-stability.mjs world`, the tool
of [§4.3](#43-implemented-the-capture-stability-probe)) reproduced the finding
and sharpened it: **8 of 8 frames over the bar again, between 10.90 % and
80.18 %, but in a different rank order** — `15-worldmodel-victoria-falls` worst
at 80.18 % where it had been fourth, `12-worldmodel-lake-victoria` down to
28.60 % from 98.62 %. The instability is not a fixed per-frame pattern that a
per-frame tolerance could be fitted to. It is different every time.

`12-worldmodel-lake-victoria` explains itself when the two frames are opened:
one run captured a settled top-down view of the lake at 60 FPS; the other, on a
loaded machine, captured a wide unsettled landscape at 1 FPS with the camera
still travelling. Same code, same suite, same filename — **a different picture of
a different place.** The suite passed both times, because its assertions never
looked at the frame.

Two consequences, and the second is the more serious:

1. **No pixel-metric pre-filter can work on this capture path.** The signal sits
   two orders of magnitude below the floor. No tolerance separates them, and no
   perceptual metric (A10) rescues a comparison between two different views.
2. **The expensive control is weaker than it was believed to be.** A reviewer
   handed run B's `12-worldmodel-lake-victoria.png` is judging a picture that
   does not show what its name claims. This is a finding about the *current*
   check, produced by trying to make it cheaper, and it is reported as such.

### 3.3 The invisible season kills the diff gate a second time

Independently of the noise floor, corpus row 5 refutes the specific claim that a
diff gate would have caught the invisible season *better* than a human ("season
toggled, zero pixel diff is a hard FAIL"). Measured on the actual pre-fix frames
`108-season-flora-dry.png` and `109-season-flora-wet.png`:

| | pixels differing, tol 8 | mean Δ |
| --- | ---: | ---: |
| dry vs wet, **before** the fix | 91.60 % | 32.38 |
| dry vs wet, **after** the fix | 71.30 % | 47.25 |

The buggy season was not a null change. It moved 92 % of the pixels — it moved
them *wrongly*, dimming where it should have recoloured. A gate that asks "did
the picture change?" answers **yes** and waves it through. The bug was that the
change was the wrong change, and only a look sees that.

### 3.4 Verdicts

A lever must survive every case. A case that cannot be run is not a pass.

| Lever | Verdict | The case that killed it |
| --- | --- | --- |
| A6 / B-D golden-image pre-filter | **REJECTED** | §3.2 noise floor (quietest frame 27.81 % vs 0.75 % signal) **and** row 5, whose buggy season diffs at 91.60 % and passes a "did it change?" gate. |
| A7 diff-derived crop | **REJECTED** | Derives its rectangle from A6's diff; inherits its death. |
| A8 / B-G cross-backend diff | **REJECTED** | §3.2 a fortiori: same-backend, same-code noise already swamps the signal, and cross-backend noise is strictly larger. Would need §3.2 fixed first. |
| A10 perceptual metric | **REJECTED** | §3.2: `12-worldmodel-lake-victoria` is two different views, not two noisy renderings of one. No metric repairs that. |
| A2 / B-B downscale, A3 / B-K contact sheet | **REJECTED as a replacement** | Rows 1 and 3 cannot be run at all (§3.1), so the fine-detail class is untested — and it is exactly the class these levers are suspected on. Survives only as triage *over* frames that stay available at full size. |
| A1 / B-C hand-picked crop | **REJECTED** | Row 6: the haze defect is whole-frame, no crop contains it. Row 3: the defect appeared where no crop would have been aimed — the frame had to be invented. |
| A4 inspect one view per change | **REJECTED** | Row 1: the stepped coast came out of `src/world/redSea.ts`, which no coupling map would have pointed at a coastline frame. |
| A5 / B-I emit or keep fewer frames | **REJECTED** | Row 3: the corpus's own history runs the other way — the bug was caught by *adding* a frame. Row 2 additionally shows cross-topic coupling (a season mechanism breaking flora rendering). |
| A11 / B-H path→suite map, general form | **REJECTED** | Rows 2 and 5 both turn on `src/scenes/travel/TravelScene.tsx`, whose frames live in `world` *and* `enrichments` *and* `polish`. A map that routes it correctly routes it everywhere and saves nothing. |
| A11 / B-H, **narrowed to DOM-only changes** | **SURVIVES** | No corpus row is a `src/ui/`-only change, and the guard already proves that class needs one backend. See §4. |
| A9 / B-E deterministic capture | **SURVIVES as a precondition, not a saving** | Nothing kills it; §3.2 shows it is not a tweak but the whole battle, and it is what would resurrect A6/A7/A8. |
| A12 / B-O instrument what was reviewed | **SURVIVES, no saving on its own** | Nothing kills it. Without a trustworthy ranking (which needed A6) it can only record, not reduce. |
| B-A snap the viewport to 28-px multiples | **SURVIVES, not implemented** | No case can kill it — no information is removed. See §4 for why it is not taken now. |
| B-F temporal-variance probe | **SURVIVES, out of scope here** | Covers row 2, which nothing else covers. It is a *new control*, not a cheaper one; belongs with point 207 (ii). |
| B-J fail fast on the expensive suite | **SURVIVES, out of scope here** | Nothing kills it (the guard credits only exit-0 runs). Saves wall clock, not tokens. |
| B-L byte delta as a ranking signal | **REJECTED** | Row 5: the buggy season moved 92 % of the pixels, so byte-size ranking would have promoted it as "changed a lot" — the same false reassurance as A6. |
| B-M pixel probes reading the frame | **SURVIVES as an addition, never a replacement** | Row 5 is the standing proof that a probe checks only what it was written for. |
| B-N WebGPU as the primary lane | **SURVIVES, out of scope here** | Not a cost lever — it *raises* cost. A correctness finding about the practised 39:1 split. |
| B-P prompt-cache the baselines | **UNMEASURED** | Cannot be replayed from repository artefacts; its premise (frames re-billed per turn) is itself unmeasured. Recorded as a correction to the cost document, not as a lever taken. |
| B-Q untrack `verification/` | **OUT OF SCOPE** | Storage, not reviewing tokens; a history rewrite needs a user decision. |
| A13 the six byte-shrinking ideas | **REJECTED on arithmetic** | No replay needed: every 1440×900 frame costs 1,716 tokens across a 24× byte spread. |

---

## 4. What was implemented, and what the numbers are

### 4.1 The honest headline

**Of the twenty-two levers in the union, one was implemented as a saving.** The
central candidate — the machine pre-filter that would have removed most of the
reviewing cost — is not merely unproven but measurably impossible on the current
capture path, and the measurement that shows it also shows the existing check is
weaker than assumed. That is the outcome the point explicitly permits: *an
expensive control that works beats a cheap one that misses.*

### 4.2 Implemented: the guard suggests a suite it can justify

`suggestSuite()` in `scripts/render-verify-core.mjs` ignored the changed paths
entirely — it returned the most recently run suite, defaulting to the 37-frame
`enrichments`. That is a ratchet: one `enrichments` run makes the project's most
expensive suite the standing suggestion for every later, unrelated change.

It now takes the changed paths. When **every** changed render path is under
`src/ui/` — the class the guard already classifies as DOM-only and already
covers with a single backend — it suggests `flow`, whose eight frames are the
HUD and the end-to-end flow. Everything else keeps the old behaviour exactly:
the general path→suite map is rejected (§3.4), so nothing else is narrowed.

Measured, for that class, from `picture-check-cost.md` §1:

| | Frames | Reviewing tokens | Wall clock |
| --- | ---: | ---: | ---: |
| before (`enrichments`, 1 run) | 37 | 60,687 | 951.1 s |
| after (`flow`, 1 run) | 8 | 10,672 | 140.4 s |
| **factor** | **4.6×** | **5.7×** | **6.8×** |

### 4.3 Implemented: the capture-stability probe

`scripts/picture-stability.mjs` runs a suite twice and reports the per-frame
divergence of §3.2. It is not a saving — it is the instrument that produced the
result, and the acceptance gate any future determinism work (A9 / B-E) must
pass before a golden-image pre-filter may be attempted again. It turns "can we
diff frames yet?" from a belief into a command.

### 4.4 Recorded, deliberately not taken

- **B-A, snapping the viewport to 28-px multiples (4.9 %).** Free of catch-risk
  and free of implementation subtlety, but the verify viewport is the coordinate
  system every layout assertion in sixteen suites is written against. Changing it
  costs a full both-backend LARGE revalidation to bank 4.9 % of the token line.
  Take it at the next deliberate viewport change, where the revalidation is
  already being paid.
- **B-J, fail-fast on `enrichments`; B-F, the temporal-variance probe; B-M,
  frame-reading pixel probes; B-N, a WebGPU-primary lane.** All survive; none is
  a cheaper *picture check*. Three of them add a control and one changes which
  backend is primary. They belong to point 207 (ii) and to the routing question,
  not here.

### 4.5 The convergent review, and what it corrected

Per point 355 the replay result is convergent: the second model read §3's numbers
with no access to §3.4 or §4, and stated its own conclusions before seeing the
author's. It reached the same verdicts on the diff-gated family and on the
general routing map — and independently reached §3.1b's guard hole and the
observation that the archived frames function as decoration rather than as
baselines. Three of its objections stand and are folded in here rather than
argued with:

- **The signal figure is soft.** The 0.75 % / 1.73 % that the bar rests on are
  diffs between two single committed captures, so they contain one sample of
  capture noise each. The direction holds — the horizon-strip bug had to have a
  frame *invented* for it, so the existing frames provably did not show it — but
  the percentages are not clean measurements of a defect's visual footprint.
- **The season before/after comparison crosses frame sets.** The 91.60 % is
  measured on `108`/`109`; the 71.30 % on the differently framed `115`/`116`.
  The conclusion that matters needs only the pre-fix row (a buggy state passes a
  "did the picture change?" gate), so it survives; the after-number must not be
  leaned on.
- **n = 2, on a machine that was demonstrably loaded** — the 1 FPS badge is the
  proof. "Diff-gating fails on this capture path" is established by the exit-0
  frames of two different places alone. **"≈ 10 % is the intrinsic noise floor"
  is NOT established**, and this document should not be read as claiming it. The
  settling measurement is ten or more repeats on a quiet machine, and the same
  repeats with capture pinned, to separate state-noise from pixel-noise.

One genuine disagreement, recorded unresolved: the second model leaves
**downscaling standing** ("nothing in the evidence touches it"), where §3.4
rejects it as a replacement. Both readings agree on the fact — the lever is
**untested**, because the two fine-detail rows have no runnable case. The
difference is only what an untested lever counts as, and this point's own rule
decides that: a case that cannot be run is not a pass.

### 4.6 What this hands to the next reader

The one thing that would unlock the whole rejected family is **deterministic
capture** (A9 / B-E). §3.2 gives it a measurable acceptance bar: two consecutive
runs of a suite must agree to within a tolerance below the 0.75 % smallest
observed real signal, on every frame. `scripts/picture-stability.mjs` measures
exactly that. Until it reports a floor under that bar, no diff-gated review is
worth building — and `12-worldmodel-lake-victoria` says the first work is not a
tolerance knob but making the capture wait for the picture it names.

---

## 5. What the render set must CONTAIN (point 376, 27.07.2026)

§1–§4 asked how to make a picture check cheaper. This section asks the prior
question: **which changes owe one at all.** It was forced by a hole the corpus
itself exposes — `scripts/render-verify-core.mjs` did not classify
`src/world/redSea.ts` as a render path, so **the guard would not have demanded a
picture for corpus row 1**, the stepped coast that is the reason it exists.

The same evening produced the mirror error. Commits that touched only
`scripts/verify/*.mjs` — a baseline classifier, a machine-load probe, an
extracted server helper — each demanded a full both-backend picture check. None
of them can move a pixel: the harness *runs* the suites, it does not draw. Each
demand cost a real suite run and a turn, and a rule that cries wolf is one you
learn to work around.

### 5.1 The method

Four path predicates were replayed over `git log --first-parent main`, taking
each commit's own diff (`<sha>^..<sha>`, so a merge counts as the feature that
landed):

- **current** — `isRenderPath` as it stood before this point.
- **narrow** — current, minus the `scripts/verify/` scripts that drive no
  browser. Membership is a DENYLIST, not an allowlist, so an unrecognised verify
  script stays IN the set: a new suite must be safe by default, and only a new
  *helper* needs a list entry (`render-verify-core.test.mjs` re-derives the list
  from the directory and fails when it drifts).
- **(a)** — narrow, plus every world-geometry source (`src/world/`).
- **(b)** — narrow, plus a named exception list from the historical corpus,
  which names exactly one such file: `src/world/redSea.ts`.

### 5.2 The numbers

| window | current | (a) ADD / REMOVE | (b) ADD / REMOVE |
| --- | --- | --- | --- |
| last 100 commits (all of 27.07.2026) | 13 | **+0 / −8** | **+0 / −8** |
| whole first-parent history (1 220, 06.07.–27.07.) | 491 | **+18 / −2** | **+4 / −2** |

The point's own window — the last 100 commits — cannot separate the two options:
a day of process work touches no world geometry, so both are pure subtraction
there, removing 8 of 13 demands. The whole history separates them: (a) costs 18
commits over three weeks, 1.5 % of all commits and about one a day; (b) costs 4.

### 5.3 The decision: (a), the whole class

The 14 commits (a) adds and (b) does not are not a grey zone. Their subjects:
*sample DEM elevation bicubically so terrain relief reads without facets*,
*smooth the sea coast from the vector signed distance*, *level every lake bed so
no sheet floats over its shore*, *shift the Meroë pyramid field off the Nile*,
*grade the Red-Sea trim coast into a smooth underwater shelf*, *every village
keeps a minimum clearance to river water*. Every one of them changes what the
player sees; several ARE the visible-geometry defects other points were opened
to fix. A rule that demanded a picture for `redSea.ts` alone would still have
waved through the file carrying the terrain heightfield.

Replaying the corpus confirms the shape: under (a) **all seven rows with a fixing
commit demand the picture check**, row 1 included, where the old rule missed it.
Row 8 (the texture dip, fixed in `scripts/verify/settings.mjs`) stays in under
the harness narrowing, because `settings.mjs` drives a browser.

The two numbers together are why this is not a cost increase at all. In the
window that reflects how the project works *now*, the narrowing removes 8 of 13
demands while the widening adds none; across the whole history the net is +16 on
491, and it buys the one class that has already broken the picture in public.
