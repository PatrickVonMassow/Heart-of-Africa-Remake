# What one rendered-picture check costs

Measurement phase of work-order point 361. The rendered-picture check is this
project's most expensive control and it dominates the remaining work — 42 of the
67 open points touch the canvas — yet the price of a SINGLE check had never been
measured. This document records that price. It is a *before* figure: it proposes
nothing and changes nothing, so that a later phase has a baseline any *after*
figure can be compared against.

Everything below is either **measured** from artefacts in the repository or
**derived** from a measured input by arithmetic that is shown in place.
Nothing is estimated by feel. Where a number could not be obtained, the gap is
named in [§5](#5-what-could-not-be-measured) rather than filled.

Reproduce the per-suite and per-image tables with:

```
node scripts/measure-picture-cost.mjs          # readable summary
node scripts/measure-picture-cost.mjs --json   # full per-image detail
```

Sources, all read as-is:

| Source | What it gives |
| --- | --- |
| `verification/*.png` (97 files) | pixel dimensions and byte sizes of the frames the last runs wrote |
| `scripts/verify/*.mjs` | the screenshot filenames each suite writes |
| `.claude/render-verify-state.json` | 40 recorded verify runs: suite, backend, exit code, wall clock, shot count |
| `scripts/render-verify-core.mjs` | what the Stop-hook guard demands of a "covering run" |

Measurement window for the run log: **2026-07-25 13:05 UTC — 2026-07-27 11:30 UTC**.

---

## 1. Per suite: screenshots, bytes, runtime

Shot counts are what the recorder observed a passing run actually write.
Byte totals and token totals are summed over those files as they sit on disk.
Runtime is the **median wall clock of passing WebGL 2 runs** in the log; `n` is
how many passing runs that median rests on — several suites have only one, so
those figures are single observations, not distributions.

| Suite | Shots | Dimensions | Bytes on disk | Reviewing tokens | Median runtime (WebGL 2) | n |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `enrichments` | 37 | 1440×900 (35), 566×613, 420×300 | 36,891,166 | 60,687 | 951.1 s | 1 |
| `polish` | 21 | 1440×900 | 14,682,022 | 36,036 | 340.9 s | 1 |
| `flow` | 8 | 1280×800 | 3,926,969 | 10,672 | 140.4 s | 4 |
| `world` | 8 | 1280×800 | 7,679,587 | 10,672 | 73.1 s | 1 |
| `i18n` | 5 | 1440×900 | 1,428,771 | 8,580 | 34.4 s | 1 |
| `handwriting` | 3 | 1440×900 | 2,166,374 | 5,148 | 34.9 s | 1 |
| `settings` | 3 | 1440×900 | 3,470,438 | 5,148 | 194.2 s | 1 |
| `voice` | 3 | 1440×900 | 1,815,121 | 5,148 | 120.1 s | 1 |
| `collision` | 2 | 1440×900 | 283,721 | 3,432 | 66.5 s | 1 |
| `benchmark` | 1 | 1440×900 | 406,565 | 1,716 | 133.8 s | 2 |
| `health` | 1 | 1440×900 | 418,191 | 1,716 | 61.8 s | 1 |
| `preview` | 1 | 1280×800 | 486,458 | 1,334 | 29.0 s | 2 |
| `events` | 0 | — | 0 | 0 | 46.1 s | 1 |
| `gamepad` | 0 | — | 0 | 0 | 67.6 s | 1 |
| `invariants` | 0 | — | 0 | 0 | 167.0 s | 2 |
| `touch` | 0 | — | 0 | 0 | 75.1 s | 1 |
| **Total (attributed)** | **93** | | **73,655,383** | **150,289** | **2,536.0 s = 42.3 min** | |

`docs` is absent: it is a pure-Node check that opens no browser, so the recorder
never logs it and it writes no frames.

**Four screenshots on disk belong to no suite.** `106-season-rain.png`,
`107-season-dry.png`, `108-season-flora-dry.png`, `109-season-flora-wet.png`
(5,516,514 bytes, 6,864 tokens together) carry mtimes of 16.07.2026 and no
current source under `scripts/verify/` writes them. They are stale artefacts of
a removed check; they are excluded from the totals above and are the reason the
97 files on disk exceed the 93 a full run produces. (They are also the frames
the *invisible season* of [§4](#4-the-historical-corpus) was accepted on — see
that row.)

Aggregate over all 97 files on disk: **79,171,897 bytes (75.5 MiB), 157,153
visual tokens**, mean 816,205 bytes per frame.

All 97 are **tracked in git** (`git ls-files verification/` returns 98 entries —
the 97 frames plus a README), the four stale ones included. The 75.5 MiB is
therefore repository weight carried by every clone, not scratch output; and each
re-baselined frame writes a new blob into history rather than replacing one.
History size was not measured.

### Tier totals

Suite membership from `scripts/verify/tiers.mjs`.

| | Suites | Shots | Reviewing tokens | Summed median runtime |
| --- | ---: | ---: | ---: | ---: |
| SMALL (`npm run test:small`) | 7 | 19 | 29,548 | 469.3 s = 7.8 min |
| LARGE, one backend (`test:large`) | 16 + preview | 93 | 150,289 | 2,536.0 s = 42.3 min |
| LARGE, both backends (`npm test`) | — | 182 | 294,096 | — |

The both-backend row follows the wiring in `tiers.mjs`: the WebGPU pass skips
the preflight, the prod preview, and the two WebGL2-only suites (`touch`, which
writes no frames, and `voice`, which writes 3). So the second pass adds 89 shots
and 143,807 tokens on top of the first pass's 93 / 150,289.

### Two runtime observations from the log

- **Failure is not cheaper for the expensive suite.** All ten recorded
  `enrichments` runs took between 951.1 s and 1029.0 s, and eight of them exited
  non-zero. A failing run still wrote all 37 frames. `flow` behaves the other
  way: its failing runs abort early at 59.8–90.4 s against 130.9–156.1 s for a
  passing one.
- **WebGPU was roughly half the wall clock of WebGL 2 on the one suite where
  both were recorded.** `flow` on WebGPU: 75.5 s (one run). `flow` on WebGL 2:
  130.9 / 136.2 / 144.6 / 156.1 s (four runs, median 140.4 s). One WebGPU
  observation is not a distribution — this is noted, not concluded. The log holds
  39 WebGL 2 runs and 1 WebGPU run.
- **Machine load moves the figure by about a fifth.** The same `flow` suite,
  passing, on the same backend, spans 130.9 s to 156.1 s across four runs — a
  19 % spread with no code change between them.

---

## 2. The reviewing cost: what it costs to LOOK at one frame

This is the figure the point turns on, and the one nobody had. A suite's CPU
minutes are cheap and parallelisable; the frames are not, because looking at one
means paying for it as input tokens in a reviewing context.

### The rule, and its source

From the Claude vision documentation
(`platform.claude.com/docs/en/build-with-claude/vision`, fetched 2026-07-27),
verbatim:

> Claude views images in patches instead of pixels. Each patch is a 28×28-pixel
> block of the image, referred to as a visual token. An image, therefore, costs
> `⌈width / 28⌉ × ⌈height / 28⌉` visual tokens.

The same page gives the per-tier ceilings. Models from Claude 4.7 on are the
**high-resolution** tier: long edge ≤ 2576 px and ≤ 4784 visual tokens. Anything
larger is downscaled first. This project's authoring model is Opus 5, which is
in that tier, and **no screenshot in `verification/` reaches either ceiling** —
the largest is 1440 px on the long edge and 1716 tokens — so the formula applies
unclamped to every frame here. (`measure-picture-cost.mjs` asserts this: it
reports `any image clamped by the tier limits: false`.)

Pricing: Opus 5 input is **$5.00 per million tokens**
(`claude-api` skill model table, cached 2026-06-24).

### Per screenshot

Arithmetic shown; both viewport sizes come from the suite sources
(`_boot.mjs` defaults to 1440×900; `flow.mjs` and `world.mjs` use 1280×800).

| Viewport | Patches wide | Patches high | Visual tokens | Input cost @ $5/M | Count on disk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 | ⌈1440/28⌉ = ⌈51.43⌉ = 52 | ⌈900/28⌉ = ⌈32.14⌉ = 33 | 52 × 33 = **1,716** | $0.00858 | 78 |
| 1280×800 | ⌈1280/28⌉ = ⌈45.71⌉ = 46 | ⌈800/28⌉ = ⌈28.57⌉ = 29 | 46 × 29 = **1,334** | $0.00667 | 17 |
| 566×613 (clip) | 21 | 22 | **462** | $0.00231 | 1 |
| 420×300 (clip) | 15 | 11 | **165** | $0.00083 | 1 |

**A full-frame screenshot costs about 1,700 tokens to look at.** For scale: that
is roughly the token weight of 1,300 words of English prose, paid per frame, for
a picture a reader may spend two seconds on.

Byte size is uncorrelated with reviewing cost. The frames range from 62,967 to
1,498,871 bytes — a 24× spread — while every 1440×900 frame among them costs
exactly 1,716 tokens. **PNG size measures the scene's complexity; token cost
measures only the viewport.** Any figure quoted in megabytes describes disk and
network, not the expensive resource.

### Per suite, and per covering run

Tokens if every frame the suite writes is put in front of a reader:

| Suite | Shots | Tokens | Cost @ $5/M | Share of a 1M context |
| --- | ---: | ---: | ---: | ---: |
| `enrichments` | 37 | 60,687 | $0.303 | 6.1 % |
| `polish` | 21 | 36,036 | $0.180 | 3.6 % |
| `flow` | 8 | 10,672 | $0.053 | 1.1 % |
| `world` | 8 | 10,672 | $0.053 | 1.1 % |
| `i18n` | 5 | 8,580 | $0.043 | 0.9 % |
| `handwriting` / `settings` / `voice` | 3 | 5,148 | $0.026 | 0.5 % |
| `collision` | 2 | 3,432 | $0.017 | 0.3 % |
| `benchmark` / `health` | 1 | 1,716 | $0.009 | 0.2 % |
| `preview` | 1 | 1,334 | $0.007 | 0.1 % |

`scripts/render-verify-core.mjs` decides how many passing runs a change owes.
A **backend-sensitive** change (anything in the render set outside `src/ui/`)
needs a passing run on *both* backends; a **DOM-only** change under `src/ui/`
needs one. Doubling the rows above accordingly:

| Change class | Suite | Runs | Shots | Tokens | Cost @ $5/M | Wall clock |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| DOM-only (`src/ui/`) | `flow` | 1 | 8 | 10,672 | $0.053 | 140.4 s |
| Backend-sensitive, cheap suite | `flow` | 2 | 16 | 21,344 | $0.107 | ≈ 281 s |
| Backend-sensitive, guard default | `enrichments` | 2 | 74 | 121,374 | $0.607 | ≈ 1,900 s = 32 min |
| Whole LARGE, both backends | all | — | 182 | 294,096 | $1.470 | — |

`enrichments` is the guard's fallback suggestion: `suggestSuite()` in
`render-verify-core.mjs` returns the most recently run suite and defaults to
`'enrichments'` when the log holds none. Its two-backend pair is **121,374
tokens — 12 % of a 1M context window, and 11× the cost of the same check run
through `flow`.** The both-backend wall clock is derived (2 × the WebGL 2 median),
not measured; no WebGPU `enrichments` run exists in the log.

---

## 3. The real review pattern

How many frames a verification actually puts in front of a reader, from the 40
recorded runs. Reporting the distribution, not only the average, because the
average is not near anything.

**23 passing runs, shots per run, sorted:**

```
0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 3, 3, 3, 5, 8, 8, 8, 8, 8, 8, 21, 37
```

| Statistic | Value |
| --- | --- |
| Runs recorded (window 25.07 13:05 — 27.07 11:30 UTC) | 40 |
| Passing (exit 0) | 23 |
| Non-zero exit | 17 |
| Median shots per passing run | **3** |
| Mean shots per passing run | 5.5 |
| Maximum | 37 |
| Passing runs writing **no** frame at all | 5 of 23 (22 %) |
| Passing runs writing ≥ 8 frames | 8 of 23 (35 %) |
| Backend split across all 40 runs | 39 WebGL 2, 1 WebGPU |

The distribution is bimodal, not centred: a majority of runs write 0–3 frames,
and a tail of `flow`/`world` (8), `polish` (21) and `enrichments` (37) carries
almost all the reviewing weight. **The single `enrichments` passing run in the
window produced 37 of the 127 frames written by all 23 passing runs — 29 % of
them, from 4 % of the runs.**

Failing runs still write frames: across all 40 runs the shot counts include eight
separate 37-shot `enrichments` failures. Counting every run, passing or not,
**the two days in the window wrote 413 screenshots**, which at 1,716 tokens each
would be roughly 709,000 tokens if each had been looked at once.

**The backend split contradicts the standing rule as practised in this window.**
The guard demands both backends for a backend-sensitive change, but 39 of 40
recorded runs were WebGL 2 and only one was WebGPU. This is reported as a
measurement of what happened, not as a judgement of it.

---

## 4. The historical corpus

The eight bugs the point names, each with the commit that fixed it and the commit
immediately before it (its first parent), plus the suite and frame that showed
it. This is the replay corpus a later phase runs against; assembling it is the
mechanical, expensive part of that phase, so it is assembled here. **Every hash
below was verified with `git log -1` and `git rev-parse <fix>^`.** The rows are
listed, not judged.

| # | Bug | Fixing commit | Parent (before) | Suite | Frame(s) that showed it |
| --- | --- | --- | --- | --- | --- |
| 1 | Stepped coast on one backend (pt. 210) | `9284f05` 2026-07-22 | `01fa8a8` | `world`, `visualsweep` | `10-worldmodel-nile-delta-cairo.png`; sweep `cairo-coast-f*.png` |
| 2 | Flora jitter (pt. 175) | `be444d1` 2026-07-19 | `5963979` | `enrichments` | **none — no screenshot** |
| 3 | Floating horizon strip at the monument site (pt. 181) | `c2dcb0a` 2026-07-24 | `6f63bac` | `polish` | `136-cairo-silhouette-footing.png` (+ re-baselined `100`, `103`, `105`) |
| 4 | Doubled Giza label (pt. 338) | **none — still open** | — | (none exists) | — |
| 5 | Invisible season | `4e9ad8b` 2026-07-16 | `74f1619` | `enrichments`, `polish` | `106`–`109-season-*.png` (the stale four); post-fix gate `115`/`116-savanna-{dry,wet}.png` |
| 6 | Haze at default zoom | `d833863` 2026-07-12 | `e581415` | `world` (bug), `enrichments` (the check that missed it) | `10-worldmodel-nile-delta-cairo.png`, `14-worldmodel-congo-mouth-boma.png`, `16-worldmodel-cape-town.png`; the blind check shot `87-continent-zoom.png` |
| 7 | Sunken sphinx | `9d5fff7` 2026-07-24 | `de7717e` | `polish` | `103-giza-sphinx-travel.png`, `139-giza-walkable-site.png`, `100-cairo-giza-skyline.png` |
| 8 | Texture count that dipped rather than leaked (pt. 334) | `d98f0c7` 2026-07-25 | `f81a009` | `settings` + `textureLeak` | **numeric, not a frame** (nearest: `69-traa-on.png`) |

Full hashes, in the same order:

```
1  fix 9284f05fa1f7ef7f9cad856c3cf38d15d8b71ec8  before 01fa8a8a5b419df672155b5c3c49f685e4fd7b25
2  fix be444d12c00cce4e1cfbb7fd762c50443f9bce76  before 5963979520a567a06c4f776da9eaf1c70ed7a5d1
3  fix c2dcb0a91bd482d47eeb0228f5e8b502ef6ada33  before 6f63bac0665a4ec1ef7dc67893e66a36877ab347
4  (no fixing commit; queued only, d4d525864cdafac94d137acb5e6a0c7875270a0d)
5  fix 4e9ad8b8e4a8a0f45acb9f5e97f2951d1a4af345  before 74f16198caf478b6b121964f8ff28f841fc6f802
6  fix d83386342e1c1b13485dd239c309af8f88ad6a13  before e581415046a47699f8367f4e92fb98532c48032c
7  fix 9d5fff73fc70a2fff3941ce279c9b036bbe75003  before de7717ec50d2d23f808af8a42f861408dbb1b496
8  fix d98f0c76768a7fff8c744c9b5534fd079a72a490  before f81a0091c1bcd4de836f6a9f585a1d89f5c97013
```

What each fix changed, one line each:

1. `src/world/redSea.ts` — `NORTHEAST_BOUNDARY` control points tightened through
   the Gulf-of-Suez head so water fingers and the isthmus strip fall on the
   trimmed ocean side. This is the incident named in the header of
   `scripts/render-verify-core.mjs`: called done after a WebGL2-only check while
   the WebGPU picture was still stepped. It is why the guard exists.
2. `src/render/flora.ts` (`splitFoliage`) + `src/scenes/travel/TravelScene.tsx` —
   the dry-season crown collapse moved off a custom per-instance attribute read
   in `positionNode` (whose re-upload raced the vertex stage on WebGPU) onto a
   second crown `InstancedMesh`'s instance matrix.
3. `src/scenes/place/backdrop.ts` + `PlaceScene.tsx` — introduced
   `panoramaStandY` / `discHorizonY`; silhouette feet anchor to the higher of the
   relief at their own spot and the settlement's visible ground line, instead of
   a fixed `EYE_HEIGHT`.
5. `src/scenes/travel/TravelScene.tsx` — the wet end of the season tint was a
   multiplicative dimming (`c × (0.7, 1.08, 0.7)`) while the dry end was a real
   luma-keyed recolour; both ends became recolours about the mid-year colour.
6. `src/scenes/travel/Climate.tsx` + new `src/render/demElevation.ts` — haze quads
   fade across the shoreline via a shared decoded-DEM elevation texture and clear
   by ~1.25× zoom.
7. `src/render/landmarks.ts` (`buildSphinx`) — the sand drift became a soft cone
   whose base sits at ground level, replacing a flat-topped cylinder whose rim
   read as a hard disc.
8. `scripts/verify/settings.mjs` + new `scripts/verify/textureLeak.mjs` — the gate
   forces a frame after each toggle and polls until the reading repeats, and is
   now two-sided: a *falling* count FAILS as an untrustworthy measurement.

### Three rows that qualify the corpus

- **Row 2 has no screenshot.** The flora jitter is WebGPU-only and headless
  Chromium has no WebGPU adapter for that path, so the `enrichments` checks
  measure the rebuild *rate*, not the picture. A replay phase cannot compare
  frames for this bug.
- **Row 4 was never fixed.** Point 338 is still `[ ]` in `TASKS.md`; the only
  commit naming it (`d4d5258`) queues it and touches `TASKS.md` alone. The two
  records still sit at split coordinates — `src/world/data/landmarks.ts:123`
  (lon 30.59, lat 29.98) and `src/world/geo.ts:267` (lat 29.75, lon 30.85) — and
  the `enrichments` check its spec calls for does not exist yet.
- **Row 7 is a medium-confidence attribution and has an open successor.** No
  commit says the Sphinx sank below terrain. `a50c799` *deliberately* buried it
  to the shoulders (1890 accuracy, pt. 279a); `9d5fff7` then fixed the resulting
  wrong read. A later re-report, point 315 "the buried Sphinx reads wrong on the
  ground", is still open. `9d5fff7` does have the property the corpus wants: its
  parent shipped a green `polish` run whose only Sphinx assertions were the
  value checks `monuments.sphinxBuried === true` and
  `culturalLandmarks.ids.includes('giza')`.

Row 8 is the corpus's only non-visual member, and row 1 the only one whose fix
commit touched no screenshot at all — its evidence is a pure test in
`src/world/redSea.test.ts`.

---

## 5. What could not be measured

Named rather than filled, per the project rule that only measured numbers are
communicated as measured.

1. **How many frames a reader actually looks at.** This is the largest gap and it
   sits directly under the point's central question. `.claude/render-verify-state.json`
   records what a run *wrote*; nothing records what entered a reviewing context.
   Every token figure in [§2](#2-the-reviewing-cost-what-it-costs-to-look-at-one-frame)
   is therefore an **upper bound conditional on every written frame being read
   once**. A reviewer who opens three frames from a 37-frame `enrichments` run
   pays 5,148 tokens, not 60,687. No instrumentation exists to tell the two apart.
2. **Fresh runtimes on a quiet machine.** The brief permitted one run of the two
   cheapest suites; I did not take it. Seven worktrees with file-mutating agents
   were live in this repository during the measurement, so a run now would have
   measured load, not cost — the same reason the brief forbade running the full
   regression. The repository's own run log already covers all sixteen suites
   from a clean sequential LARGE pass on 25.07.2026, which is better data than a
   loaded run would have produced. The 19 % `flow` spread reported in
   [§1](#two-runtime-observations-from-the-log) is the measured size of that
   load effect.
3. **WebGPU runtimes for fifteen of sixteen suites.** The log holds exactly one
   WebGPU run (`flow`, 75.5 s). Every both-backend wall clock in this document is
   derived as 2 × the WebGL 2 median and is labelled as derived.
4. **Runtime distributions.** Eleven of sixteen suites have `n = 1` passing run in
   the window. Those medians are single observations.
5. **Whether the token rule matches what the harness actually bills.** The rule and
   the tier ceilings are taken from the vendor documentation cited in
   [§2](#the-rule-and-its-source), not verified against a `count_tokens` call on
   an actual screenshot. The arithmetic is checkable; the rule's applicability to
   the exact transport used by the reviewing harness is not verified here.
6. **The cost of a *human* looking at a frame.** Only the model-side token cost is
   quantified. The user's own review time is not measured and is not in scope.

---

## 6. The four numbers to carry forward

1. **One full-frame screenshot costs 1,716 visual tokens to look at** (1440×900);
   1,334 at 1280×800. About $0.0086 and $0.0067 of Opus 5 input.
2. **A LARGE regression on both backends produces 182 frames = 294,096 tokens**
   ≈ $1.47, ≈ 29 % of a 1M context — if every frame is read once.
3. **The guard's default covering pair (`enrichments` × 2 backends) is 74 frames
   = 121,374 tokens and about 32 minutes of wall clock** — 11× the token cost of
   the same two-backend check run through `flow`.
4. **The median passing run writes 3 frames, but one suite writes 37.** The
   distribution is bimodal; a single `enrichments` run accounted for 29 % of all
   frames written by the 23 passing runs in the window.
