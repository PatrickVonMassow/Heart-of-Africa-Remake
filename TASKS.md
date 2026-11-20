# TASKS — sequential feature batch

The OPEN work order. A ticked point moves, verbatim and with its number, into
`docs/tasks-archive.md`; `tasks-archive-guard` blocks a tick left behind here.
States are `[ ]` open and `[x]` done — nothing in between.

**Where the rules live.** The build, the test tiers, the branch/merge workflow
and the closing cycle are in CLAUDE.md (§5, §6, §7.2, §9), not here. The WORKING
ORDER is the order of the open points IN THIS FILE; the dashboard's Warteschlange
is derived from it (`board-queue.mjs`) and `queue-order-guard` keeps them in
sync — a second place for one fact is the drift this project keeps paying for.

This file and every entry in it are written in English. Point titles use sentence case rather than full uppercase;
acronyms and individual emphasised words may stay capitalised. Commit messages never reference the point number.

**A point may state its acceptance condition machine-readably**, because prose
alone let a point be ticked for feeling finished. A body line beginning `PROOF:`
names a command; the tick is refused until it has run at the CURRENT HEAD
(`node scripts/point-proof-guard.mjs --ran <N> --evidence "<result>"`; `--status`
lists what is outstanding). Opt-in, EVERY such line demanded, and one inside a
code span or quotes — as here — is prose, not a demand.

## Regression command

```sh
npm run test:unit   # fast layer (jsdom) — always
npm run test:small  # + the everyday browser gate
npm test            # LARGE: build → lint → vitest → every suite → preview
```

Per point: build + lint + audit + the whole Vitest layer, plus the browser suites
the diff touches. LARGE runs once per BUNDLE and before every closing, plus inside
the bundle that touches a scene core (TravelScene/Wildlife/PlaceScene, the
renderer/post pipeline, store.ts) and whenever a flake retry failed twice.

Diff → browser-suite mapping: `src/i18n/` → i18n · store/systems logic → Vitest
only (flow if the core loop is touched) · `src/scenes/place/` → collision,
polish, settings · `src/scenes/travel/` → enrichments, events, health ·
`src/render/` → settings, enrichments, polish · `src/ui/` → i18n, enrichments,
settings, flow · journal/TTS → voice, handwriting · `src/world/` → world,
enrichments · `scripts/verify/X.mjs` → X itself · `*.md` → docs. When unsure,
include the suite.

Flake policy: if exactly ONE suite fails on a check from this list — its only
home — rerun that suite standalone once; green counts and is noted in the tick,
red twice is a real investigation. The list: the movement 0.00 m read, the bathe
probability, TTS timing, the calf-sacrifice behaviour window, frame-starved
screenshot probes, the spawn body-spacing settle window. WATCHDOG: if this
scoping ever lets through a bug a full run would have caught, report it to the
user at once and the policy is reconsidered.

**Every point adds a test on the appropriate layer** — Vitest for anything
assertable without a browser, a browser suite only for the
scene/RAF/geometry/CSS/audio/screenshot cases (`scripts/verify/README.md`).

On failure after correction attempts: STOP, report, do not build on a broken base.
Tests are never weakened; a red run is fixed in the production code.

**Where doc updates go (user 26.07.2026):** CLAUDE.md §7.1 states WHAT must hold,
`docs/acceptance-evidence.md` proves it under the same number. A changed or added
behaviour updates BOTH in one commit; a point that only adds a test touches the
evidence alone. Older specs saying "CLAUDE.md §7.1" mean both halves.

## Work packages (bundles)

Open points are worked in BUNDLES: one branch, one verification, one regression
round, a commit per member point. `docs/work-packages.md` is the table — which
point sits where, what stays unbundled, in what order. Every open point appears
there exactly once; a new point joins a bundle when appended.

## Checklist

THE ORDER OF THIS RELEASE (user 12.08.2026, stated repeatedly and forgotten as often):
everything that touches the COMMUNICATION MECHANIC comes FIRST — the mechanic itself, the
proof text that signs it off, and the bugs that keep the user from ever reaching it in play —
then point 633 (the closing run), then point 174 (the tag). A newly appended point of that
kind is MOVED to the front in the same turn that files it; leaving it where append-and-defer
put it is the mistake this line exists to stop.


- [ ] 1543. Smooth the CPU hitches while driving on medium and high AWAITING-CONFIRMATION(2026-11-20; user-input: Notebook-Benchmark laut Perf-Doku fahren plus Intel-Konsolenfehler in Kairo kopieren, hand back: Benchmark-JSON und Konsolentext, where: local/ plus Chat-Notiz, safe prepared state: Zweig gepusht und gate-gruen)
  Observed: The user's notebook benchmark shows CPU p95 of 41 ms (medium) and 52 ms (high) during the drive against medians of 9-12 ms: periodic hitches that the player feels as stutter even when the GPU average would be fine. The user requires medium to be clearly smoother on mid-range notebooks.

  Final state: while driving (savanna-driving route), the CPU frame time on medium and high has no recurring multi-frame spikes: CPU p95 stays within 2x the CPU median. The responsible systems (streaming of terrain/flora dressing, chunk builds, shader/pipeline compilation, GC — identified by measurement) spread their work across frames, move it off the frame (worker/idle time) or pre-warm it.

  Evidence required:
  - Per-system attribution of the spikes (profile or timing marks) in the point's evidence.
  - Benchmark on WebGPU, medium-preset and high-preset savanna-driving: CPU p95 <= 2x median (reference before: medium 8.8 / 41.2 ms, high 12.2 / 52.4 ms on the user's notebook).
  - Vitest for changed scheduling logic; no visible pop-in regression (picture check of a driving frame).

  Bounds the user named (verbatim):
  - Queue position: FIRST in the work order, ahead of every open point (user order 18.11.2026: "ganz vorne in der Queue"). The three performance requests of 18.11.2026 run in this order: medium dpr cap, desert pixel cost + shadows-off inversion, driving CPU hitches. A request that does not converge is split (standing rule).
  - Four eyes (user order 18.11.2026: "als Vier-Augen-Task"): convergent review by a cross-vendor model per scripts/cross-review.mjs before landing; record the reviewer in a Reviewed-By trailer.
  - Reference measurement: user benchmark "Lenovo GIP-Notebook (neu).json" (2026-11-18, webgpu, AMD RDNA-3 notebook GPU, 1536x960 @ dpr 1.25, build c8f3995). The older "Lenovo GIP-Notebook.json" (without "(neu)") is void by user order and must not be used.
  - Target for this notebook class: medium below 20 ms GPU median in savanna-standing, desert-standing and savanna-driving (> 50 fps). Low is already playable and must not get worse. High may gain speed only without noticeable loss of picture quality.
  - All preset values stay in src/config/quality.ts (calibratable marked); no new runtime dependency.
  User approval 18.11.2026: "Ja, so als drei Aufträge einreihen"
  Source: user request of 18.11.2026 17:20 (spec cut from b08561942).
  Bundle: Steuerung & Performance.
  ADDENDUM 19.11.2026 (user request "Remove the CPU stutter while driving", folded in as a duplicate of this point):
  Placement: at the very front of the work-order queue, right after the desert-haze point (user order 19.11.2026).

  Observed in the user benchmark "hoa-bench-2026-11-18-webgpu-dritter-Durchlauf.json" (webgpu, AMD RDNA-3 notebook, build f24ce38): in savanna-driving the CPU median stays ~8-10 ms but the CPU p95 jumps sporadically — baseline 10.5 ms, yet high-preset (same settings as baseline) 49.9 ms, terrain-cap-84 36.3, climate-haze-off 38.8, medium-preset 31.4, all-off 20.6 (p99 up to 61 ms). Frame p95/p99 follow (e.g. high-preset 51.5 / 65.2 ms). The spikes do not follow the config, so they are intermittent main-thread work while driving — suspected terrain-chunk / dressing streaming, unconfirmed. Player impact: visible stutter in every preset.

  Final state: the cause of the driving CPU spikes is named from a profile and fixed (work spread over frames or moved off the main thread); savanna-driving CPU p95 <= 2x its median in every config of a full benchmark run on the user's notebook.
  Test: Vitest for changed logic; Playwright benchmark suite on WebGPU; the user's notebook report.
  Bundle: Steuerung & Performance.
  Source: user request of 19.11.2026 19:00 UTC via the findings carrier (session unknown).

- [ ] 1520. Render targets leak across rebuilds at travel|medium since the solar sun landed
  Measured 14.11.2026 (full WebGPU enrichments on main 33db311fd, log local/verify-logs/2026-11-14T06-43-15-751-enrichments.log): 8x [ASSERT] render-resource-leak at travel|medium|traa/-/bloom/sun/fire/band, renderTargets 45 -> 58/68/72/365/370, then place:cairo 365 -> 395. The same leak shows on feat/344 b9082f151 (log 2026-11-14T05-34-10-777, 46 -> 397). Absent in the last full main run f7f328b10 (13.11.2026, before point 343 landed); every section involved is green alone.
  Player impact: GPU memory grows across pipeline rebuilds in a long session.
  Final state: a rebuild at travel|medium disposes what it replaces; renderTargets stay within the +2 allowance across the full enrichments run.
  Test: a full WebGPU enrichments run (VERIFY_SUITE_TIMEOUT_MS=5400000) without render-resource-leak asserts, plus a Vitest case for the disposal if the cause lies in browserless pipeline code.
  Source: finding of the 344 session, 14.11.2026 07:35.
  Remeasured 15.11.2026: `npm test -- settings --section=render-leak-watch` reds identically on main dcf4949c7 and feat/357 6a1071735 (travel|medium|traa/-/bloom/sun/fire/band 25 -> 29, +4, allowed +2), so the settings leak watch shows the same leak.
  Bundle: Sonne & Himmel.

- [ ] 507. A lost WebGPU device ends the run quietly and the picture black
  (measured 05.08.2026, both quiet runs of `invariants` on the software WebGPU
  lane). The suite ends `2 pass, 0 fail` with 9 and 2 console errors —
  `AbortError: Failed to execute 'mapAsync' on 'GPUBuffer': A valid external
  Instance reference no longer exists`, `THREE.WebGPURenderer: WebGPU Device
  Lost: Reason: unknown`, `OperationError: Instance dropped in popErrorScope`.
  The checks after the loss never run at all; only the console-error gate turns
  the suite red, so the count reads like a partial pass and the loss itself is
  named nowhere. The same loss in the shipped game is what point 493 photographed
  on the mispinned lane: a black canvas behind a live HUD.
  FINAL STATE:
  1. The renderer NOTICES a lost device: `device.lost` is awaited, and the loss
     goes to the dev-mode assert channel with its reason, so every test run and
     every manual session detects it at the moment it happens.
  2. A suite whose device dies FAILS AT THE LOSS, naming it, instead of reporting
     the checks it managed before — a check count that stops early may never read
     as a pass.
  3. The player is told rather than left with a black picture: a lost device
     raises the same localized, dismissible notice path as the WebGL 2 fallback
     (both languages, from the language files), naming that the picture stopped
     and what to do — never a silent black canvas behind a live HUD.
  4. Whether the loss is the software lane's device giving up under a long run or
     a teardown racing an in-flight readback is decided BY THE EVIDENCE the first
     step now produces, and the answer is written into
     `docs/host-environment.md`'s lane section.
  "THE SOFTWARE WEBGPU LANE" IN THIS POINT'S HEADING IS DEAD (carried 20.08.2026 from the
  10.08.2026 four-eyes work-order analysis, whose one premise to re-measure this was, and it
  was measured that day at `622f5113`): `node scripts/verify/backend-lane-check.mjs` reports
  BOTH lanes drawing the game on the card — `ANGLE (Microsoft, D3D12 (NVIDIA GeForce RTX
  4070 Ti))` — with the WebGPU chain at `level=compatibility`. The device loss recorded here
  therefore cannot be charged to a software device giving up under a long run, which removes
  one of item 4's two candidates before the work starts: what is left to decide between is
  the compatibility chain itself and a teardown racing an in-flight readback.
  VERIFIABLE: a Vitest case proves the loss handler fires the assert and the
  localized notice from a simulated `device.lost` in both languages; a browser
  case proves a suite that loses its device reports the loss as its failure
  rather than a truncated pass; and `VERIFY_GL=webgpu npm test -- invariants`
  either completes on this host or names the device loss as its verdict.
  AMENDMENT TO POINT 507 (append to its text; do not open a new point). Placement: user order 20.11.2026 "A umsetzen" — work it as a user-ordered point.
  Field evidence (20.11.2026, user's very weak notebook: Intel Gen-8 adapter, Chrome 140, WebGPU, build 0fdb5b5): the F8 render benchmark `local/Sehr schwaches Notebook - hoa-bench-2026-11-20-webgpu.json` reports drawCalls 0 and triangles 0 in ALL 42 rows and a vsync-capped 60 fps even for high-preset with SSAO — impossible on that GPU. three's Renderer returns early from render() once `_isDeviceLost` is set (node_modules/three/src/renderers/common/Renderer.js:886), so the device was lost and the benchmark measured empty frames and published them as valid. The device loss of 507 therefore happens on a real player device, not only on a test lane.
  Additional final states:
  5. The render benchmark (src/systems/benchmarkRun.ts) detects a lost device (or a measured phase with drawCalls 0) and ends the run as INVALID, naming the reason in its summary and JSON (`aborted`/reason), instead of writing rows; it never reports fps for frames that drew nothing.
  6. The bug report / state dump (src/state/stateDump.ts) carries the renderer's GPU health: device-lost flag with reason, and the WebGPU uncaptured errors (validation/pipeline errors, capped list with count of omitted) seen in the session, so a report from a player device names GPU failures without DevTools.
  Test: Vitest — the benchmark run with a simulated lost device (or drawCalls 0) yields an invalid result with the reason and no rows; the state dump includes a simulated uncaptured error and the device-lost reason. Both language files if any player-visible text is added.
  Source: user benchmark and bug report of 20.11.2026 (local/Sehr schwaches Notebook - *).

- [ ] 1290. On WebGL 2 the lion feeding scene shows neither the lion nor its prey, only a shadow and the blood stain
  Measured 04.10.2026 on feat/1283 (base a13dcae0e), `settings --section=lion-feeding`, VERIFY_GL=webgl: frame 68-lion-feeding without a wait shows only grey haze with place labels (no terrain); with a 4 s wait it shows terrain, the blood stain and one predator shadow, but neither the lion mesh nor the prey mesh. WebGPU shows lion, lying prey and stain in the same section. The section's checks read poses only, so they stay green while the animals are invisible.
  Done when: the cause is measured on WebGL 2 (mesh visibility/material compile vs. staging timing), the lion and its prey render on WebGL 2 as on WebGPU, and the section asserts the rendered animals, not only their poses; frame picture-checked on both backends.
  Bundle: Tierverhalten.
  Criticality: medium — a player on the fallback backend sees a feeding scene without animals.

- [ ] 1447. Every settlement visit leaves its render pipelines and heap behind
  Final state: leaving a place releases what it built: after entering and leaving N different villages the renderer's cached pipeline count (`renderer._pipelines.caches.size`), the JS heap and Chrome's GPU-process memory return to a bounded level instead of growing with N (the cause named: which materials/objects outlive their place); a dev invariant or browser check pins the bound; the villager-dress fresh-page staging of point 1446 (`DRESS_REBOOT_EVERY`) may then be lifted.
  Observed problem: `polish-villagers --section=villager-dress` on feat/1446 6e1622764, 25.10.2026 05:51-05:58 UTC, 22 villages visited in turn (`gpu-load` rows in local/verify-measure/villager-dress.jsonl): pipelines 64 -> 993 (~40 per village, never falling), JS heap 286 -> 1709 MB, renderer-tracked textures 56 -> 156; Chrome's `--type=gpu-process` RSS 0.4 -> 9.7 GB at ~1.35 GB per minute (host has 15 GB). In the full suite the earlier sections add to it and the GPU process was lost around the 16th village (point 1446). A player who travels village to village grows the same load without bound.
  Source: measurement of point 1446, 25.10.2026; reproducible player impact (CLAUDE.md §2 finding intake). Related: 285 (accumulation and leak hunt).
  Bundle: Session- & Repo-Hygiene.

- [ ] 1144. Three of six probed village layouts leave no way out of the settlement,
  and the dev assertion that says so has been firing unread (measured 17.09.2026 while
  reviewing point 1045). `buildLayout` ends with
  `const wayOut = pickWayOut(colliders, radius, bank)` and a `devAssert(wayOut !== null,
  'way-out-missing', …)` at `layout.ts` ~1794. That assertion fires, and the same three
  layouts fail IDENTICALLY on `main` and on `feat/1045-village-water-path`, so the gate
  work is not the cause and the defect is older than it:
  `bambara-village@2861293141`, `mandinka-village@1716508768` and
  `mandinka-village@3170420543` all return `wayOut === null`, against three that return a
  bearing (`bambara-village` at 2987912600, 7 and 1337). Point 1045 saw this ONCE over its
  124-seed sweep and filed it verbatim as "recorded here, not diagnosed"; the six-pair
  probe says the share is far larger than one in 124, and it is not confined to one people.
  WHAT IS NOT YET KNOWN, and is the first half of this point: what the player actually
  loses. `wayOut` is read twice further down — the flora and the loose rocks standing ON
  the crossing are cleared with `onWayOut(...)` — so a null bearing may mean only that no
  lane is swept clear, or it may mean the built fabric really does ring the place with no
  gap a walker fits through. Measure that against the collider set at `WALKER_RADIUS`
  before choosing a repair; the assertion's own text ("the built fabric leaves no crossing
  of the boundary free") claims the second, and has never been checked.
  Final state:
  - Either every village layout carries a way out, or the cases that cannot are named with
    a measured reason and the assertion stops claiming more than it knows.
  - The dev assertion no longer fires in a green suite run: today `layout.test.ts` prints
    it five times and passes anyway, which is exactly how it stayed unread.
  Test: Vitest over the layout — sweep the river villages and assert `wayOut !== null`
  (or the named, measured exception), plus a walker-radius check that the crossing the
  bearing names is really free. No picture check unless the repair moves the fabric.
  Criticality: medium until the player impact is measured; high if the second reading holds
  and the player can be shut inside a settlement.
  Refs: src/scenes/place/layout.ts (`pickWayOut`, the `way-out-missing` devAssert, `onWayOut`),
  src/scenes/place/layout.test.ts
  Bundle: Dorfleben

- [ ] 1169. The children shuffle on the spot above the gate on roughly a tenth of the world
  seeds (measured 20.09.2026 while point 1094 moved the teaching checks onto the seed axis;
  reproducible, no browser needed).
  MEASURED STATE: `shuffleWindows` over `play('bambara-village', seed, 60)` — the very
  instrument the shipped gate uses (`scripts/verify/childMotionMetric.mjs`) — run over
  bambara seeds 1-60. Six of the sixty read the WORST child ABOVE the shipped 0.25 % gate:
  seed 27 at 0.367 %, seed 30 at 1.299 %, seed 33 at 0.282 %, seed 35 at 0.311 %, seed 40 at
  0.254 % and seed 50 at 0.254 %. Seed 30 is five times the gate. Every other measure of
  those layouts is healthy — the least judgeable child 0.966-0.983, no carry, no rescue, no
  overlap — so this is the shuffling itself and not a metric artefact.
  WHY IT WAS INVISIBLE: the sample that judges this varied the VILLAGE (bambara, maasai,
  swahili) and pinned the seed. The player learns the language in `ROCK_VILLAGE_ID` alone
  and is dealt a fresh seed at every start, so the axis that reaches him went unjudged.
  Point 1094 put the sample on the seed axis and this fell out of it; 1094 deletes test
  breadth and builds nothing, which is why the fix is its own point.
  WHAT THE BROWSER ADDED ON 21.09.2026, and what it did NOT: point 690 moved the
  `children-motion` gate onto the port and the bankless village, and over six runs of that
  section on its branch, both backends, four went green and two red — WebGPU at `c05d0e205`
  read maasai-village at 0.25 % and cairo at 0.94 % (group 0.31 %, bursts 0.07 %), WebGL 2
  earlier read cairo at 2.80 %. Every red carried this class's signature, 1.29 m walked
  inside a quarter of a metre. It is NOT established that the port shuffles worse than the
  village: all six reds fell on the SECOND or THIRD settlement of a loop that chained three
  traces into one browser session and none ever on the first, and giving each settlement a
  fresh page removed them. That coupling is repaired in 690 and is not this point's; what
  remains this point's is the shuffling itself, which the seed spread below measures without
  a browser at all.
  Final state: no bambara seed of 1-60 reads the worst child above the shipped gate over the
  judged minute, the same holds for the port and the bankless village, and the sample in
  `tagShuffle.test.ts` carries at least one of the six seeds above so the repair cannot be
  read off a lucky layout.
  Test: Vitest — the six seeds above run inside the gate, mutation-checked; the existing
  three-seed sample keeps its cases and gains the silent round's two settlement kinds.
  Refs: src/scenes/place/tagShuffle.test.ts (`PLACES`, `the children never shuffle on the
  spot`), scripts/verify/childMotionMetric.mjs (`shuffleWindows`, `CHILD_MOTION.shareGate`),
  src/scenes/place/bankGame.ts (the bank round) and src/scenes/place/tagGame.ts (the silent
  round the ports and the bankless villages play)
  Criticality: medium — it is the user's own report of 648/656, alive on about a tenth of
  the worlds he can be dealt, and it is player-visible wherever it fires.
  ALSO OWNS THE BROWSER CHARGES (09.11.2026, from point 1068): both children-motion entries in
  `scripts/render-verify-charges.mjs` now name 1169, because a quiet unthrottled WebGPU probe
  read the same signature (1.13 m inside 0.27 m, bursts clean); the fix strikes them. Lead from
  1068: src/scenes/place/tagGame.ts ~1150-1205 documents this composition at catch moments (a
  cornered runner beside the standing chaser, the ex-chaser's U-turn) — check first whether the
  red windows coincide with catches; then the catch steering, not the gate, is the repair.
  Bundle: Dorfleben.

- [ ] 1205. The lion does not move on once the elephant-trampling carcass is consumed.
  PROBLEM, measured 24.09.2026 by the point-312 author: `npm test -- enrichments
  --section=elephant-trampling` is 13 pass, 1 fail — "Lion moves on once the carcass is consumed"
  — and the identical red reproduces with the section alone on main b3c0715bf, so it predates 312.
  FINAL STATE: once the carcass is consumed the lion leaves the site as §19.8 requires (every
  drama resolves), and the section is green on WebGPU; if the check rather than the lion is wrong,
  the check is corrected with the measured reason.
  Criticality: medium — a predator parked at a spent carcass is visible to the player.
  Test: `npm test -- enrichments --section=elephant-trampling` green; a Vitest case if the leave
  decision is a pure helper. Refs: src/scenes/travel/Wildlife.tsx, scripts/verify/enrichments.mjs.
  Bundle: Tierverhalten.

- [ ] 1227. Settlement rain reaches the ground.
  PROBLEM, found by closing 633's blind cleanup (docs/blind-633/decisions/c09.json U4841):
  `PlaceRain.tsx` places the rain column's base at eye height (1.5 m) with fall in
  [0, RAIN_HEIGHT), so streaks run from eye height upward and never reach the ground.
  FINAL STATE: the column is centred on the eye as the comments intend; streaks visibly reach the
  ground in a settlement.
  Criticality: medium — visible in every rainy settlement.
  Test: unit assertion on the column bounds; picture of a rainy settlement on both backends.
  Refs: src/scenes/place/PlaceRain.tsx.
  Bundle: Dorfleben.

- [ ] 1229. A predator robbed of its chase victim walks off from where it stands.
  PROBLEM, found by closing 633's blind cleanup (docs/blind-633/decisions/c11.json U5474):
  the crocodile-steal abort in `Wildlife.tsx` sets `s.lx/s.lz` to the kill-site flank although the
  predator is still chasing elsewhere, so it visibly teleports.
  FINAL STATE: the walk-off starts from the predator's current position, like the swim-escape
  give-up.
  Criticality: medium — a visible teleport in the panorama.
  Test: unit case for the steal abort keeping the predator's position.
  Refs: src/scenes/travel/Wildlife.tsx.
  Bundle: Tierverhalten.

- [ ] 1269. The tag beat's side-on standpoint search finds every stand occluded
  Source: first measured 02.10.2026 ~19:30 in the WebGL 2 covering run of point 1129 on 001ef76f1
  (`polish-children`, section `tag-catch`, log
  `local/verify-logs/2026-10-02T17-08-03-519-polish-speech-polish-settlement-polish-children-polish-villagers.log`);
  no earlier recorded log holds this signature, the check moved unchanged from
  `scripts/verify/polish.mjs`, and the section alone was green 47 s later on the same head.
  THE RED. "a clear side-on standpoint on the beat" read `every standpoint occluded`: after the
  held catch beat, `standBeside(beat.caughtAt, beat.runnerAt ?? beat.caughtAt, beat.caughtAt)`
  found no candidate stand whose sight line to the caught child was free, so frame
  `1176-tag-beat` was not taken. The section stages Cairo itself, so it is not an order effect;
  the port's walls, stalls and walkers around a beat that happens near a wall are the candidates.
  Final state:
  - The cause is measured (which candidates were tried and what occluded each, over repeated
    `--section=tag-catch` runs on a quiet machine on WebGL 2); a search that gives up while an
    honest side-on view exists is fixed in the search (more bearings or distances, or a later
    beat), with no check weakened and no occlusion tolerance wider than the evidence.
  - `polish-children --section=tag-catch` green on WebGPU and WebGL 2; frame `1176-tag-beat`
    picture-checked.
  Tests: the existing Playwright section; no new mechanism.
  Bundle: Testinfrastruktur.
  Criticality: low — test-frame staging only, no player impact; it blocks the green of
  `polish-children` on WebGL 2.

- [ ] 1264. The village pounder's pestle pounds the air above its mortar
  Source: cross-vendor review of point 1251 (02.10.2026), same geometry as the fishers' eater.
  `src/scenes/place/PlaceLife.tsx` `Pounder`: the 1.05 m pestle's centre rests at 1.05 m, so its
  foot stops at 0.525 m while the mortar is 0.42 m tall — every stroke ends 10 cm above the rim.
  Final state:
  - At the bottom of the stroke the pestle's foot is inside the mortar (point 1251 uses a rest of
    mortar height − 0.12 m + half the pestle), and the pounder's hands still ride the shaft.
  - A browser check samples the pestle height and asserts the foot reaches the mortar.
  Tests: the existing village Playwright section that photographs the pounder gains the assertion.
  Bundle: Dorfleben.
  Criticality: low — visible at every pounding village, no mechanic affected.

- [ ] 1265. The boatman's first reading comes too late at the mute shore
  Source: covering WebGPU pass of point 1129 (02.10.2026); reproduced alone on `main` fe28c8bde
  (log `local/verify-logs/2026-10-02T11-31-07-724-polish.log`) and on feat/1129 (log
  `2026-10-02T11-28-50-894-polish-villagers.log`), so it is not the split's.
  THE RED. `polish --section=mute-shore-scene`: "a boatman`s reading appears within a few seconds
  of entry, without ROCK marked heard" — boat at 9.69 s against `canoe.firstCallSeconds` 4 + 3 s
  slack; the child reads at 3.24 s and ROCK is not heard. `villager-canoe` was green at 0fac48504
  on both backends the same morning; candidates are the earshot moves 6e64d0e37, d2c3e690b and
  eb68d9f3f.
  Final state:
  - The commit that delayed the boat's first call is named with the reading on either side.
  - The boatman's first reading lands within `firstCallSeconds` + 3 s of entry again, or the
    window's premise is revised with the reason recorded.
  - `polish(-villagers) --section=mute-shore-scene` green on WebGPU and WebGL 2.
  Tests: the existing Playwright check; no new mechanism.
  Bundle: Dorfleben.
  Criticality: medium — the mute shore's lesson starts with the boatman's call.

- [ ] 1309. A hard-edged dark rectangle shows in the burning-grass travel frame
  Source: findings carrier 05.10.2026 16:35, found on the picture check of point 1287.
  verification/131-burning-grass.png shows a straight-edged dark rectangle (with horizontal bars) in the lower right of the bird's-eye view, on main (d8a093e50, WebGL 2) and on WebGPU and WebGL 2 at point 1287 alike; not caused by the camera shift. Looks like a shadow or overlay with a rectangular footprint.
  Final state: the cause is measured in game (which mesh, overlay or shadow draws the rectangle) and removed; the burning-grass travel frame shows no straight-edged artefact on either backend.
  Verifiable: the burning-grass frame on both backends, picture-checked per §7.2; a right-layer test for the corrected cause.
  Bundle: Wetter & Wasser.

- [ ] 1395. Point gesture release squats the glTF figure (virtual arm longer than the drawn reach)
  Queue position: with point 1383 (Dorfleben), whose point/reach step touches the same arm.
  Source: owner measurement 20.10.2026 on feat/1345-child-chaser-teleport (split from point 1345, whose spec named this squat as a related CROUCH_MAX case): in the runtime-pose export (src/render/villagerRuntimePose.test.tsx, subject `point`, adult, bearing 0.6) the hips sit at 0.51 of standing height at t=2.11 s. The cause is not the CROUCH_MAX fallback: while the arm lowers from the point (pitch -1.71 to -1.50) the arm off its rest pose counts as a contact arm (skinnedFigure.tsx `contactArm`, no `extras.reach`), its target is the virtual primitive hand (a straight arm longer than the glTF reach 0.47), the standing shortfall is 0.13-0.37, and the crouch really reaches it (-0.008 at 1.1), so `contactCrouch` picks 0.3 rising to 1.0 over about eight frames.
  Final state: a gesture arm is no contact for the crouch: a pointing villager on the glTF body never squats at the end of the gesture; low work contacts (the jar fill, the dig) keep their crouch.
  Verifiable: the export's `point` subject keeps its hips at 0.85 or more of standing height in every frame (Vitest in src/render/villagerRuntimePose.test.tsx); skinnedFigureCrouch.test.tsx stays green.
  Criticality: medium - every pointing villager on medium/high presets.
  Bundle: Dorfleben.
  Further source: user bug report hoa-state-2026-10-21-3318564123 (2).zip (21:05:18Z), user words: "Warum bückt er sich, wenn er zum Häuptlingshütte zeit und warum zeigt seine Hand nicht geradeaus, sondern leicht nach unten." The man in dark blue points toward the chief's hut in a crouch with his arm slightly below horizontal - consistent with the measured release phase (arm pitch -1.71 to -1.50 while the crouch fires).
  Additional check: after the fix, the pointing hand aims level at the target while the gesture is held (not only at release); if it does not, split a separate point for the aim.
  Owned browser checks (charged by point 1465, 29.10.2026, bisected to the 1295 glTF merge 2eb4f1384; trace: hand 0.65 -> 0.82 -> 0.34 squat -> rest within a second): polish-speech --section=chief-to-drummer "the drummer's arm is raised in the pointing frame (point 1272)" and "the man and his word offer their keys at the same time (point 1139)" green on both backends; strike both charges in scripts/render-verify-charges.mjs.

- [ ] 1396. Two walking villagers stand inside each other at the village centre
  Queue position: with point 1383 (Dorfleben), after the planted-soles work of point 1330.
  Source: finding 20.10.2026 10:54 from the point-1330 picture check: verification/1295-village-walker-mid-stride-webgl2.png at f59ddaa0a shows a walking woman and a man behind her standing inside each other at the village centre (WebGL 2). Villager separation, not the planted-soles gait; WebGPU not yet judged for it.
  Final state: two villagers moving through the village never interpenetrate; their bodies keep a visible gap while walking past or behind each other.
  Verifiable: a Vitest case on the villager movement layer asserts a minimum body distance between every pair of walking villagers over a simulated village walk; the 1295 walk frame shows no overlapping bodies on both backends.
  Criticality: medium - visible in the village walk frame.
  Bundle: Dorfleben.

- [ ] 1422. Villager knee snaps when a walker leaves the walk gait in a corner
  Source: finding 22.10.2026 09:46 from the point-1402 moving capture (seed 42, walker 0, WebGPU 60 Hz fixed clock): while the walk share drops 1 -> 0 in a ~2.8 rad/s corner the knee jumps 0.49-0.66 rad per frame (shin.L 0.836 -> 1.499) into a deep-knee pose; present on main 9ecb039 before 1402, same on WebGL 2.
  Final state: the knee angle changes smoothly through the walk-to-idle gait blend in a corner; no per-frame knee jump beyond the clip's own range.
  Verifiable: a Vitest on the villager pose layer bounds the per-frame knee change across a gait blend in a turn; a moving capture shows no leg snap on both backends.
  Criticality: medium - visible leg snap when villagers turn.
  Bundle: Dorfleben.

- [ ] 1423. Villager heel strike stops the swinging foot dead
  Also: a flat foot drops its kept heading in sharp curves.
  Source: finding 22.10.2026 09:46 from the point-1402 joint-speed sweep: the heel is caught while the clip still swings it forward ~2 m/s (foot up to 2.8x clip max speed, shin ~4 rad/s reversal at 144 Hz); at 3.5 rad/s yaw the flat foot gives up its kept heading at the end of flat stance (foot reversal 4.1-4.6 rad/s). Pre-existing; the 3x margin in villagerClipPose.test.ts exists because of the heel strike.
  Final state: heel strike decelerates the foot without a dead stop, and a flat foot keeps its heading through sharp curves; the 3x margin in villagerClipPose.test.ts can drop.
  Verifiable: villagerClipPose.test.ts with a tightened foot-speed margin and a sharp-curve heading case; a moving capture on both backends.
  Criticality: medium - visible foot jerk in village walks.
  Bundle: Dorfleben.

- [ ] 1425. Carried water jar jumps from hip to shoulder within a few frames
  Source: finding 22.10.2026 19:24 from the point-1404 moving capture (WebGL 2, seed 42, Bambara village, errand villager 1, frames 255-261 at 60 Hz, branch e962c7841): the carried jar swings from hanging low at the hip to raised beside the shoulder within ~6 frames (~0.1 s) while the carrier walks on.
  Final state: the jar moves from hip to shoulder as a visible lift over a natural duration, never as a pop between two carry poses.
  Verifiable: a Vitest on the carry-pose transition bounds the jar's per-frame displacement; a moving capture on both backends shows the lift.
  Criticality: medium - visible pop on every water carrier.
  Bundle: Dorfleben.

- [ ] 1427. A running child pushed back by separation walks backwards
  Source: finding 23.10.2026 05:21Z during point 1424 (present on main): a runner pressing against another body at 2.4 m/s is pushed back by the separation step and walks backwards (0.49 m at t 104 s), seen only in chaotic replays of tagShuffle.facing.
  Final state: separation slows or sidesteps a pressing runner but never moves it against its facing faster than a walk.
  Verifiable: a Vitest replay in tagShuffle.facing bounds the backwards walk under separation; a moving capture shows no backwards push.
  Criticality: low - rare, only in crowded moments.
  Bundle: Dorfleben.

- [ ] 1457. A fleeing child no longer flips to the other rim direction after a wall deflection
  Final state: in the tag round, a wall deflection of an evader's course no longer feeds
  `evadeHeading` a deflected `current` that flips the flee to the opposite rim direction
  (traced at maasai-village/4 child 1, t≈5.95 s: −280° → −69°, then `turnBeforeRun` turns the
  child on the spot into a playmate), and the side is not locked either (locking it, attempt 1
  in `docs/1081-steering-trace.md` §5, made the sweep worse). Judged over the 66-pair sweep of
  point 1081 (maasai, hausa, swahili, zulu, san, tuareg × seeds 1–10, 99) at every cadence:
  the number of pairs at or above `CHILD_MOTION.shareGate` and the sum of worst shares fall
  against the recorded baseline (6 pairs, sum 3.50 % native), with no pair worse than it was.
  Test: Vitest — the traced maasai-village/4 episode as a case: the evader keeps its rim
  direction through the deflection; plus the sweep numbers in the commit message.
  Refs: src/scenes/place/tagGame.ts (`evadeHeading`, `moveChild`, `turnBeforeRun`),
  docs/1081-steering-trace.md §4–§5, docs/1081-probes/ (sweepProbe, sweep.sh, sum.mjs).
  Bundle: Dorfleben.

- [ ] 1458. Two playmates meeting head-on pass each other, and the crowded case samples more than one settlement
  Final state: two tag-round children meeting head-on at the floor pace pass each other on a
  side they keep until they are past, rather than re-deciding every frame (the per-frame and
  timed veers of `docs/1081-steering-trace.md` §6 lowered the sum by 6–47 % but none held the
  gate and the best had no robust neighbourhood). Over the 66-pair sweep of point 1081 at every
  cadence, every pair reads under `CHILD_MOTION.shareGate` (0.25 %), and neighbouring parameter
  values hold it too, so no lucky constant is pinned. The crowded construction in
  `tagShuffle.test.ts` then runs at least three tag-round village/seed pairs (including the
  former worst, maasai-village/4, and mandinka-village/99) at every cadence, and
  `CROWDED_CADENCE_GATE` is removed or re-derived from what the fix leaves. Not a raised gate on
  its own. Builds on 1457.
  Test: Vitest — the crowded construction over the named pairs at every cadence.
  Refs: src/scenes/place/tagGame.ts (`moveChild`), src/scenes/place/tagShuffle.test.ts,
  scripts/verify/childMotionMetric.mjs, docs/1081-steering-trace.md §4–§6.
  Bundle: Dorfleben.

- [ ] 1473. Bambara errand adult lost in the water-back walk during the continuous route
  Source: communication `continuous-route` alone on aed84aa2f, WebGPU (`local/verify-logs/
  2026-10-30T09-58-38-857-communication.log`, 30.10.2026), step 9-fit-and-journal: the dev invariant
  `[ASSERT] adult-atom-lost — bambara-village: water-back pair 2/3/walk: forced after 239.96s; overrun
  situation water-out pair 3/2 (speaker blocked)`. Not seen in the closing LARGE runs.
  Final state:
  - The cause is measured: why pair 2/3's water-back walk never completes while pair 3/2's water-out
    overruns with a blocked speaker (a mutual block between the two pairs or a lost goal).
  - The errand completes or releases inside its bound with that reason fixed, with a unit test; the
    assert stays loud. Green in a whole communication run on both backends; its charge is struck.
  Tests: Vitest for the errand scheduler; the existing Playwright step.
  Bundle: Dorfleben.
  Criticality: medium - a villager stuck on an errand is player-visible.

- [ ] 1492. On the low preset the task walker's head-load cone pierces the bundle at full kneel
  (measured 09.11.2026 on feat/1301 43d129505, polish-villagers --section=village-walk, WebGPU).
  With detailLevel low, at the first frame with `inhabitant.userData.kneel === 1` the task
  walker still holds its bundle at chest height on the body axis, and the blue wrap cone's apex
  sticks out through the box top, identically from both flanks
  (verification/1301-village-kneel-low.png of that run). The skinned figure
  (1432-village-load-set-down) holds it in front of the chest without contact.
  Player impact: visible on the low preset at every set-down and pick-up.
  Final state: at full kneel on the low preset no part of the figure's mesh intersects the load.
  Test: Vitest geometry check of the low-preset kneel pose against the load box; picture on both
  backends (polish-villagers --section=village-walk).
  Refs: src/scenes/place/placeFigure.tsx, src/render/figureWalk.ts
  Criticality: low — cosmetic, low preset only, but player-visible.
  Bundle: Dorfleben.

- [ ] 1494. An elephant-trampled animal dies on clean ground — no stain is pushed
  Final state: `npm test -- enrichments --section=elephant-trampling` is green on WebGPU: the trampled animal lies dead over a ground stain ("Elephant tramples a smaller animal (dead over a stain)").
  Observed problem: the section is red on origin/main 2c9fefacc (WebGPU, fresh detached tree, 09.11.2026 16:42) and twice on feat/453-lion-prey with "zebra, 0 stain(s)". The victim dies but no stain is pushed; the trampled body is the first natural zebra herds.zebra[0]. Point 453's diff touches neither trample nor stain code, so the red is owned by no point. Point 1205 (lion moves on) is a different check in the same section.
  Player impact: a trampled animal lies on clean ground.
  Test: the section above green; a Vitest case for the trample-to-stain path if the cause sits in browserless logic.
  Source: picture check of the 453 landing session, 09.11.2026.
  Bundle: Tierverhalten.

- [ ] 1496. Grass fire: close the four cross-vendor review objections point 321 landed without
  Final state: the four objections of the GPT-6.1 Sol review of feat/321 b2023ba (passes 2/6/7, verdict merge-with-fixes) are fixed on main and `npm test -- enrichments --section=burning-grass` is green on both backends with the frame judged: (1) `src/scenes/travel/burnScarNode.ts` uses `1 - smoothstep(0, depth, dFront)` instead of the reversed-edge `smoothstep(depth, 0, dFront)`, which is undefined in GLSL; (2) the scar width derives from the swept curved front, so the flank ground the front passed is sooted too, pinned by a Vitest flank-coverage case; (3) the negative control in `scripts/verify/enrichments.mjs` reuses the positive crop boxes and requires valid on-screen captures instead of accepting off-screen crops after the sim advanced; (4) `src/scenes/travel/Wildlife.tsx` reuses one preallocated record instead of allocating a `setBurnScar` options object every frame.
  Observed problem: point 321 was landed on 10.11.2026 before these objections were fixed; the review had asked for the fixes and a both-backend rerun before landing.
  Player impact: (1) can render the scar edge wrongly on a driver that takes the undefined branch; (2) leaves unsooted strips at the flanks of a curved fire; (4) adds per-frame garbage.
  Test: Vitest for the scar width; the burning-grass section on both backends.
  Source: cross-vendor review of point 321, 09.11.2026; landing slip 10.11.2026.
  Measured 10.11.2026: the whole enrichments pass on main 091e97140 failed frame 131 on both backends (no flame at the front, frontAtShutter 24.05) while the burning-grass section alone was green — the crop timing of objection 3; charged to this point in scripts/render-verify-charges.mjs.
  Bundle: Wetter & Wasser.

- [ ] 1499. A predator appears out of nowhere at a calf crushed by an elephant and eats it
  User bug report 10.11.2026 23:06, evidence /backup/hoa/local/PredatorErscheintAusDemNichts.zip (seed 1116517146, travel, region north, x/z 290.95/-146.00, day 561.94, webgpu, production build 51c7783). User text: Ein Jungtier wurde unter den Fuessen eines Elefanten zerquetscht und daraufhin ist an seinem toten Koerper ein Praedator erschienen, der es auffrisst. Frame: a spotted cat feeds on a red carcass under the circling vultures beside the traveller, elephant herd below; the predator was not there before and did not walk in. The JSON wildlife section names every animal, carcass and flock. Expected: a scavenger/predator reaching a carcass approaches from outside visibly (or is streamed in out of view), never spawns at the carcass. Also visible again: the plank-like oversized vultures (see request Make elderly animals recognisable at game distance). PLACEMENT (user order 10.11.2026 23:06, verbatim: Das nach Greisentiere und Geier einreihen): as its own point directly behind the elders/vultures part of that request, i.e. after 1489 and elders/vultures, ahead of the elephant graveyard and every other open point.
  User addition 10.11.2026 23:09 to the finding A predator appears out of nowhere at a calf crushed by an elephant and eats it (same evidence /backup/hoa/local/PredatorErscheintAusDemNichts.zip): the calf had just been crushed under an elephant's feet; the user suspects that this death path itself makes the predator appear. Check first whether the trample/crush death creates its carcass through a path that also places (spawns or teleports) a feeder at the body, unlike the ordinary hunt/old-age carcass; a quick grep for trample+spawn in src/scenes/travel found nothing obvious, so trace it in the runtime. Same point, same placement as the original finding.
  Final state: a feeder at any carcass, the trample/crush death included, has walked there on screen from where it was; no predator is placed or teleported onto a body.
  Test: Vitest on the crush-death carcass path (no feeder spawned at the body); picture on both backends at the evidence spot.
  Bundle: Tierverhalten.

- [ ] 1215. Top-centre HUD notices overlap and become unreadable.
  PROBLEM, seen 25.09.2026 in the point-659 route evidence (both backends green, picture-judged):
  on the WebGL 2 fallback the dismissible graphics notice, a toast and the place-title card share
  the same top-centre slot, so the toast text is drawn across the notice text and the title
  (`communication-webgl-1790356605654-09-after-fit.png`: "Dummy message: the puzzle ... is solved."
  over "Graphics notice: WebGPU is unavailable ..."; also `-07-answer-sounding.png`). On WebGPU the
  "Chief" title card covers the start of the toast (`communication-webgpu-1790355374457-05-chief-walks-out.png`)
  and the "Bandiagara" title covers the talus block's crown (`-08-impression-and-socket.png`).
  FINAL STATE: notices in the top slot stack or queue without overlapping, every one readable in
  full; a place title never covers toast text. Both languages, desktop and phone portrait.
  Criticality: medium — the puzzle-success toast and the fallback notice are unreadable while both show.
  Test: a Playwright layout check that the notice, toast and title boxes do not intersect when all
  three are shown, on WebGL 2 (where the notice appears) and WebGPU; picture check on both backends.
  Refs: src/ui/Hud.tsx, the graphics-notice and place-title components.
  Bundle: Kommunikation.

- [ ] 551. The transient status hint is drawn on top of the region name (seen
  07.08.2026 in the verification frames `121-harmattan-pall-january.png` and
  `122-atlas-snow-february.png`, WebGL 2, and reproducible in every frame the
  enrichments suite writes while the canoe hint stands). The centred hint "The canoe is
  dead weight on land and slows me — better left in a camp for long overland stretches."
  and the region name occupy the SAME strip of the status bar, and both are drawn: the
  frames read "Westcanoe is dead weight …" and "Northanoe is dead weight …", the region
  word running into the hint's first word. It is not a clipping artefact — the hint's
  own bordered box sits over an unhidden label.
  Acceptance criterion 9 (`CLAUDE.md` §7.1) puts BOTH there on purpose: the region is a
  permanent stat and the hint renders "CENTRED inside the status bar itself, not in a
  separate floating panel". So the collision is by construction, and the fix belongs on
  the hint's side, not by moving it back out into a panel.
  FINAL STATE: while a transient hint stands, the status bar YIELDS the strip it needs —
  whatever permanent element the hint would overlap is hidden for its lifetime (not
  faded, not shifted under it) and comes back unchanged when the hint expires. The hint
  keeps its centred position and its box. Which elements can be yielded is decided by
  measured overlap, not by a hard-coded guess about which stat sits where.
  VERIFIABLE: a Vitest case on the HUD component — with a hint active, the overlapped
  permanent element is not rendered, and after the hint expires it is back; plus a
  browser frame showing the hint over a status bar with no text behind it. Both
  languages, since the German hint has a different width.
  Criticality: medium — nothing breaks, but it is the first thing in the picture a reader
  sees as sloppy, and it is in every screenshot the suites write.
  MERGED 20.11.2026 (1560): 1516 is folded in. The same hint also covers the compass heading
  (verification/131-burning-grass.png, 327-vulture-cluster-one-flock.png: "Westcanoe…" / "Eastcanoe…"),
  so the heading is a yieldable element too. 1516's remedy (move the hint below the bar) is rejected by
  criterion 9. Added check: a Playwright layout check that, with a hint raised in play, the hint's box
  intersects no visible status-bar text box; picture-checked on both backends. 1215 stays separate.

- [ ] 1488. Villager clothing: one fix per listed defect, one final picture check (user order 05.11.2026; amends the working method of 1482 under 1487)
  The 24-hour budget of 1487 did not limit precision: since 04.11 17:00, 34 of 57 main commits were bookkeeping ("Record the picture judgement / delegation / withdraw verdict ..."); the child hip cloth alone took nine commits on 05.11 morning. A time box cuts the list, it does not cut the per-candidate ritual. Replace the method of 1482:
  1. Each defect on 1482's frozen list gets exactly ONE fix. All fixes land on the one branch; no picture judgement between them.
  2. ONE final picture check at game distance, by eye, both backends: does it look right to a player, and is coverage met (see the companion request "No sensitive body part exposed from any view or pose" - its views and poses are part of this check).
  3. A fix that fails that check is not iterated: it is reverted, the old state stays, the defect goes to docs/backlog.md. Exception: any coverage/exposure failure is never reverted to an exposing state; it keeps getting fixed until it holds.
  4. No intermediate status/record commits on main; one closing commit with the result per defect.
  5. 1341 is dropped (closed as cancelled). After 1482 clothing is done; 1379 stays only as its own later point.
  Add as the FIRST item of 1482's frozen list: the kneeling Bambara woman whose white breast cloth stands off the torso as a stiff ring, so the overhead camera looks into it and the breast is bare. Evidence: /backup/hoa/local/BlosseBrueste.zip (seed 1768195175, place bambara-village, x/z -59.45/-130.99, webgpu, build 39e8ab8; user text "Man kann Frauen in den BH schauen.").
  Bundle: Dorfleben.

- [ ] 1221. The Cairo place ground is no longer flat white at the start.
  PROBLEM, measured 26.09.2026 on main 96f8c1e: in flow frame `verification/06-start-journal.png`
  (WebGL 2, 1 FPS at the shutter) the whole foreground floor of the Cairo place is untextured
  near-white; the frame committed 8–9 days earlier shows the same.
  FINAL STATE: the cause is found — the shutter fires before the ground material is ready (a
  check that does not reach its state) or a player really sees a white floor — and fixed; the
  frame shows the textured place ground on both backends.
  Criticality: medium — possibly the first view of the game has no ground texture.
  Test: flow picture check of 06-start-journal on WebGL 2 and WebGPU.
  Refs: the place scene ground material, scripts/verify/flow.mjs start-journal shutter.
  Bundle: Siedlungsgeometrie.

- [ ] 1220. The WebGL 2 notice no longer covers the start journal's title.
  PROBLEM, measured 26.09.2026 on main 96f8c1e: flow frame `verification/06-start-journal.png`
  (WebGL 2) shows the dismissible compatibility notice drawn OVER the open journal panel, its
  "Verstanden" button on the "Tagebuch" heading. The frame committed 8 days earlier shows the
  notice behind the panel and the title readable.
  FINAL STATE: at a WebGL 2 start with the journal open, the notice and the journal title are
  both readable (neither covers the other); the notice stays dismissible.
  Criticality: low — the journal title is hidden at every WebGL 2 start until dismissal.
  Test: a Playwright layout check in the flow or layout suite asserting the notice's box does
  not intersect the journal header on WebGL 2; picture check of 06-start-journal.
  Also measured 01.10.2026 on feat/1219 (local/1219-no-context.png, mobile emulation): the
  no-backend notice added by point 1219 sits over the journal heading and its tabs the same
  way; the fix covers both notices.
  Refs: the compatibility notice component, the journal panel, verification/06-start-journal.png.
  Bundle: Steuerung & Performance.

- [ ] 519. The journal's handwriting exists only on the author's own machine
  (measured 05.08.2026 while verifying point 394 in this Linux container). The
  journal's handwritten look (§16/§16.3, acceptance criterion 29) is asked for by
  NAME alone: `font-family: 'Segoe Script', 'Bradley Hand', 'Comic Sans MS',
  cursive` (`src/index.css:700`, and the observation input at :885). All three are
  HOST fonts — Segoe Script ships with Windows, Bradley Hand with macOS, Comic Sans
  with neither Linux nor Android. Where none is installed the browser falls back to
  the generic `cursive`, which on this host resolves to DejaVu Sans: an upright
  sans-serif. The chronicle then reads as plain text, the stroke-by-stroke reveal
  writes in that plain text, and the whole conceit of a hand-written journal is gone
  — for every player not on Windows or macOS, and for every verification frame
  captured off such a host (which is why frames 81/82/83 regenerated in a container
  are weaker evidence than the Windows-captured originals).
  FINAL STATE: the handwriting SHIPS WITH THE GAME instead of being borrowed from
  the host. One open-licence handwriting face is self-hosted as an `@font-face`
  from a repository-local woff2 (subset to the characters the two language files
  actually use, German umlauts and ß included), declared FIRST in both stacks with
  today's host fonts kept behind it and generic `cursive` last. It loads from the
  bundle like every other asset — never from a CDN, so the game's own look never
  needs a network — and the licence text travels with the file. Its size is stated
  in the commit that adds it, per the dependency-justification rule.
  VERIFIABLE: pure Vitest that both stacks name the bundled family first and that an
  `@font-face` rule defines it from a repository-local path (no `http(s):` source);
  and a browser check on this container — which has none of the three system fonts —
  that the journal's rendered text is actually drawn in the bundled face
  (`document.fonts.check`) and measures a different width from the generic fallback,
  so a silent fallback fails loudly instead of quietly producing plain text.
  Screenshot 81 refreshed on the bundled face.

- [ ] 1521. The San village is built of Zulu-style beehive huts
  Seen 14.11.2026 on the point-348 fire-rain frame 348-san-flame-on-hearth-rain (WebGPU, feat/348 d1805cbbb): the San village shows large thatched beehive huts with doorways and a Market Hut and Chief's Hut in a ring like the Zulu village, while design.md §2.6/§4.5 give each people its own period organising principle (dispersed camps without lanes) and the San journal entry itself speaks of "shelters of bent grass".
  Player impact: a people's settlement shows another people's architecture.
  Final state: the San village is built from the dwellings and arrangement docs/peoples-1890.md records for the San around 1890; if that record is silent, it gains the evidence first.
  Test: a Vitest sweep that the San layout uses its own dwelling type and plan, plus one first-person frame of the San village.
  Source: finding of the 348 session, 14.11.2026 18:43.
  Bundle: Siedlungsgeometrie.

- [ ] 1526. Kraal cattle read as antelope
  Seen 15.11.2026 on the point-359 frames 359-zulu-kraal-1890/1893 (WebGPU and WebGL 2, main e56c8f28c): several cattle carry long, straight, upright horns and a narrow head; they read as oryx or eland rather than Sanga/Nguni cattle (lyre-curved horns, broad head, hump). The Zulu pen's east side also shows an open stretch where a cow stands at the edge.
  Player impact: a village herd looks like wild antelope standing in a pen.
  Final state: the cattle in `src/render/cattle.ts` show curved horns, a broad head and a hump per the breeds docs/peoples-1890.md names; the pen reads closed or shows a deliberate gate.
  Test: a Vitest case on the cattle geometry parameters, plus the kraal-cattle frames of polish-settlement on both backends.
  Source: picture check of the 359 session, 15.11.2026 21:34.
  Bundle: Dorfleben.

- [ ] 415. The Tuareg tent reads as a heap of sand (29.07.2026, user in the Tuareg
  village, North: "what are these cones supposed to be? Sand piles? They look more like
  mini tents"). They ARE tents — `Tent` in `PlaceScene.tsx` is a single
  `coneGeometry(r·1.25, h)` in the cloth material, a 0.45-unit pole and a small dark
  entrance flap. Standing on pale sand in the pale cloth colour, a smooth tall cone
  reads as a dune, and the flap is far too small to say otherwise. The user's reaction
  is the correct one: nothing in the shape says "someone lives here".
  THE REAL FORM IS ALMOST THE OPPOSITE, and it is what makes it readable: a Tuareg tent
  (ehen) of that period is LOW and WIDE, not tall and pointed — mats or hides stretched
  over an arched wooden frame, dark against the sand, with the long side open toward the
  lee and the frame's poles and guy lines visible. Height well under a standing person,
  width several times the height. RESEARCH IT FIRST against `docs/peoples-1890.md`
  (Tuareg material is in §2.4 and §7.2) and record what the sources support before
  modelling; where the evidence is thin, say so in the point rather than inventing
  detail — the accuracy principle of this project applies to dwellings as much as to
  clothing, and the guide's own rule is that a real system is never faked.
  WHAT TO BUILD: replace the cone for the NORTH dwelling kind with the arched form —
  a low curved shell, dark mat/hide colouring against the light ground, an open side,
  and the frame legible at eye height (design.md §2.6 asks for structure and weathering
  at eye height, which a smooth cone cannot carry). Keep it cheap: this is a village
  dressing element and appears many times.
  CHECK THE OTHER PEOPLES' TENTS at the same time: the `tent` kind is also used to dress
  the market in other regions. Those are trade awnings, not dwellings, and must not
  inherit the desert form — say which shape each use gets.
  VERIFIABLE: pure Vitest on the geometry description (the north dwelling is wider than
  it is tall, and the market awning is not the same part), plus the existing layout
  tests. Live (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the Tuareg
  village photographed at eye height — the tents must be distinguishable from the ground
  by colour as well as by shape, which is exactly what fails today.
  DOCS in the same commit: `docs/peoples-1890.md` §8 (the research-to-game table) gains
  the dwelling row for the Tuareg, per the standing rule that the implementation
  sections move with the rendering.

- [ ] 205. A world & functionality plausibility audit — a third audit kind beyond
  code bugs (Pillar 2) and visual/behaviour bugs (203): does the world and its
  functionality make SENSE and COHERE, not just work? (user request 20.07.2026:
  there may be systems that work but are pointless, useless, or run counter to
  others.) For EACH system/feature — walk design.md's feature list AND the §7.1
  acceptance systems — ask:
   (1) PURPOSE: does it make sense in-world (~1890 Africa) AND as a mechanic, and
       would a player grasp why it exists?
   (2) USE: does it actually affect the game loop, or is it dead weight nobody
       engages — a building you enter for nothing, an item never needed, a stat
       shown but never decisive, a mechanic with no consequence?
   (3) COHERENCE: does it CONTRADICT or undercut another system — one rewards what
       another punishes, two overlapping mechanics that only confuse, a shortcut
       that trivialises a challenge?
   (4) SETTING FIT: consistent with the researched ~1890 world + design.md intent
       (no anachronism; plausible geography, ecology, economy)?
   (5) WORTH: does it earn its complexity, or add surface without depth?
  WORLD PLAUSIBILITY specifically: the ECOLOGY (every predator has prey and every
  prey a plausible predator in its own region; the herds/dramas are ecologically
  sensible), the ECONOMY (trade is meaningful — goods have a use, prices force
  decisions, the ferry/bazaar/village-barter each have a reason, the money-vs-gifts
  split coheres), EXPLORATION (each region/landmark has a reason to visit; the goal
  is reachable, motivated, and the hint cascade truly leads there), SURVIVAL
  (provisions/health/afflictions create real decisions, not noise), and the
  CROSS-SYSTEM loop (exploration → language → hints → goal; reputation → access;
  economy → equipment → capability) actually holds together.
  RESEARCH-BACKED WORLD ACCURACY (added per user 23.07.2026): beyond coherence,
  run a RESEARCH pass over EVERY concrete element of the game world and check it
  against the ACTUAL ~1890 record — verified against real sources, NOT free
  invention. The trigger/exemplar: the Great Sphinx of Giza was BURIED TO THE
  SHOULDERS in sand until the 1920s excavation, so a ~1890 depiction must show it
  sand-buried — yet it was built free-standing (fixed within the walkable-pyramids
  scene, point 273). That is a case of insufficient prior research, and the concern
  generalises: sweep the whole world for the same class of error — each landmark
  and monument (its real ~1890 state of construction/ruin/burial), each people's
  material culture and settlement form, the flora/fauna ranges, the rivers/lakes/
  ice, the trade goods and their period plausibility, place names and their 1890
  forms — asking for EACH: is this accurate for the EPOCH (~1890, not modern, not
  ancient), the REGION, and the SEASON as depicted? Flag every anachronism or
  unresearched guess with the correct researched state and a source. This is
  ANALYSIS + PROPOSALS ONLY — change nothing now; because the world keeps evolving
  until 205 runs, fold this research into 205's pass then so the latest state is
  audited. Most findings are design judgments for the USER; clear objective
  inaccuracies (a monument in the wrong physical state for 1890, an anachronistic
  good, a mis-dated name) are filed. A model-diverse (Fable) research lens is
  welcome within the point-200 token limits.
  METHOD: system-by-system + the cross-system matrix, and PLAY the loop end to end
  asking "why am I doing this / does it matter". OUTPUT: unlike the mechanical
  audits, most findings here are DESIGN JUDGMENTS — design.md is authoritative and
  design changes are the USER's call — so each is written up and DISCUSSED WITH THE
  USER, not autonomously "fixed". Only clear OBJECTIVE incoherences (a predator
  with no prey in a region, an item with literally no effect, two directly
  contradictory rules) get filed as points; the rest are a design conversation. A
  model-diverse pass is welcome (a Fable lens on "does this cohere") within the
  point-200 token limits.

- [ ] 932. The context fence has stood in observe mode for six days with no visible arming point
  (systematic dormant-feature sweep 26.08.2026, prompted by the same buried-activation pattern as
  925). Point 700 built and armed the fence; commit e0813568 (20.08. 02:21) set
  `CONTEXT_FENCE_MODE_DEFAULT` to `observe` in `scripts/context-watermark-core.mjs`, and only
  `HOA_CONTEXT_FENCE_MODE=armed` arms a session — a variable nothing in the repository sets. Its
  refusals are recorded silently and refuse nothing. Re-arming exists only as a CONDITION inside
  open point 747, itself preconditioned by three others, so the switch has no visible point of its
  own — the pattern the user just ruled against for 925.
  FINAL STATE:
  - THE ARMING IS ITS OWN VISIBLE STEP, either as this point's own deliverable or as a decision
    card that asks for it — not a side-condition of a point four dependencies deep.
  - THE OBSERVED RECORD IS READ FIRST. Six days of observe-mode refusals are exactly the evidence
    for whether arming is safe: what WOULD have been refused, how often, and in which sessions.
    That reading comes before the switch, and its result is written down.
  - A DORMANT DEFAULT SAYS SO WHERE IT IS SET: a shipped feature whose default disarms it carries
    the reason and the condition for arming beside the constant, so the next sweep needs no
    archaeology.
  ALSO NOTED, no action here: the point-589 speech-silence alarms are dead (`watchProducer` has
  only the tag round as a caller) while the debug menu still ships both sliders in both languages
  — carried as an item inside open point 686, so it is not forgotten, but the sliders currently
  promise an alarm that cannot fire. Everything else the sweep found is deliberate and documented.
  VERIFIABLE: the observe-record reading is evidence in the point; Vitest over the fence core that
  the armed mode refuses what the observed mode recorded, and that the default is whatever this
  point decides, asserted against the constant rather than against a copy of it.
  Criticality: medium-high — the fence is the one mechanism that stops a session from starting new
  work past the watermark, and this session ran to 272k tokens with it observing.
  Bundle: Session- & Repo-Hygiene.

- [ ] 938. Three recorded `enrichments` reds name a TICKED point, so nothing can ever own them
  (measured 26.08.2026 on `.claude/render-verify-state.json` while answering point 734's sixth
  round). The `webgpu/enrichments` runs of 17.08.2026 08:46, 09:07 and 09:26 each carry the same
  unaccounted check red — "the streamed dressing does not grow over a session at a fixed anchor
  (point 278)" — recorded with `point=null` and `featureLevel=compatibility`. That check is point
  278's own live witness, and 278 is TICKED. Under the charge-expiry rule a charge dies with its
  point, so this red has NO owner it could ever be charged to: the ledger requires an OPEN point,
  and point 734's retroactive route — proven in the same round by a Vitest case, a new
  `RED_CHARGES` entry reaching the blocking question of a run already on disk — has nothing to bind
  it to. This is exactly the "unowned product defect" hole point 734's own text names, met in the
  wild for the first time.
  DECIDE BY MEASUREMENT, NOT BY TASTE — the two readings are opposite and only one can be true:
  either the dressing-growth regression 278 fixed is BACK (the check is right and the game is
  wrong), or the check is stale on the compatibility feature level, where the adapter's own
  streaming behaviour differs from the core lane it was written against (the check is wrong and the
  game is fine). Every one of the three recorded runs is `featureLevel=compatibility`, which is a
  reason to suspect the second and no proof of it.
  FINAL STATE:
  - THE MEASUREMENT IS TAKEN FIRST: the fixed-anchor instance count is re-measured on BOTH feature
    levels, and the verdict names which of the two readings the numbers support.
  - THE RED GETS AN OWNER EITHER WAY. If the regression is back, this point owns it and fixes it.
    If the check is stale, this point re-scopes the check and says so where it is written.
  - THE THREE STORED RUNS STOP BLOCKING WITHOUT A DEFERRAL, through one ledger entry scoped
    `suite=enrichments`, `backend=webgpu`, `kind=check` — which is precisely what point 734's
    retroactive route exists for, and this point is its first real user.
  VERIFIABLE: the re-measurement with its numbers on both feature levels; the Vitest witness of
  whichever half turns out to be wrong; and `node scripts/render-verify-guard.mjs --status` on a
  quiet machine showing the three 17.08. runs accounted for with no `--defer`.
  Criticality: medium-high — a red nobody can own is the one state the charge ledger cannot
  express, and it blocks the render window for as long as it stands.
  Bundle: Steuerung & Performance.

- [ ] 886. A unit case fails on the first run after every push, because a network probe inside it
  outlasts its own timeout. MEASURED 24.08.2026 in the point-848 worktree:
  `scripts/guard-preflight-core.test.mjs` > "holds each gather step to the applicable/inputs
  contract on the REAL repo" ran into its 30000 ms timeout. The cause was measured, not guessed, by
  timing every gather step: `ci-status-guard` took 38150 ms and every other step stayed under
  500 ms. GitHub Actions is unreachable from this container ("GitHub Actions could not be read"), so
  the COLD probe burns its network timeout for each pushed ref before answering. Warm, the same file
  passes in 3,4 s; on a branch whose refs were already probed, in 5,4 s.
  WHY IT MATTERS MORE THAN A SLOW TEST: the red appears on the first full run after any push and is
  green on the next, so it presents exactly like a flake and invites the retry that CLAUDE.md §7.2
  calls SUSPECT and covering nothing. It cost this session two full suite runs to tell apart from a
  real defect, and it will cost that to every session that pushes before it verifies.
  FINAL STATE: the case no longer depends on reaching the network. Choose between a short probe
  timeout under test, warming the probe before the suite, and budgeting the case for the cold
  offline path — and write the REASON where the next reader of a red run will look.
  VERIFIABLE: with the network unreachable and the probe cache emptied, the file passes on its first
  run; a case pins whichever bound was chosen, so the fix cannot rot back into a timeout.
  Criticality: low — no product behaviour, but it manufactures false reds in the one place the house
  rules forbid treating a red as noise.
  Bundle: Session- & Repo-Hygiene.

- [ ] 807. Pushed work for an open point can lie on a branch that nothing points at, and the next
  session rebuilds it from main (measured 21.08.2026, 09:20, while resuming the batch).
  WHAT WAS MEASURED. Two branches carried work pushed 39 and 49 minutes earlier:
  `feat/779-three-missing-commands` at ff25c000, whose own commit message records three green
  gates on that head, and `feat/769-764-timestamp-header-guard` at 28d48437, which carries a
  recorded cross-vendor review. The session that built them died without a point boundary and
  without an in-flight declaration, so `node scripts/batch-in-flight.mjs --status` answered
  `no-declaration` and no mechanism named either branch. They were found only because the
  resuming session listed `git worktree list` by hand while checking for a half-finished merge.
  WHY IT MATTERS: a session that takes point 779 runs `node scripts/point-brief.mjs 779`, which
  never looks for an existing `feat/<point>-…` branch, and then branches fresh from `main` — so
  built, reviewed and green work is silently rebuilt. The park list of `commission-guard` is the
  only place such a branch becomes visible, and it is filled BY HAND: the resuming session parked
  both AFTER finding them, which is exactly the step a dead session cannot take. The in-flight
  adoption path already covers the session that ends properly; this is the case where it ends
  improperly, which is the case that needs the backstop.
  FINAL STATE: taking a point states, from git and without being asked, whether a branch or
  worktree for that point already exists — its tip, how far behind `main` it stands, whether it
  is parked, and with what reason. The reading is derived from the refs themselves, not from a
  hand-maintained list, so a branch nobody parked is still named. Continuing it or discarding it
  then becomes a deliberate choice instead of an omission.
  VERIFIABLE: Vitest over the pure reading — a ref set containing `feat/779-…` yields that branch
  for point 779 with its distance from `main`; a parked branch is reported WITH its park reason; a
  point with no branch yields nothing rather than a false match; and a branch whose name merely
  contains the digits of another point (`feat/1779-…`, `feat/779x-…`) is not reported for it.
  Criticality: medium — no product defect, but its failure mode is paying twice for finished work,
  and it fires precisely when a session died without cleaning up, which is when nobody is watching.
  Bundle: Session- & Repo-Hygiene.

- [ ] 658. The egress allowance must survive a container restart and the hours after it (user
  12.08.2026: "Das ist auch schon zum zweiten Mal passiert. Sorge dafür, dass das den
  Container-Neustart überlebt. Deine bisherige Maßnahme scheint also nicht wirksam gewesen zu
  sein."). MEASURED, and confirmed independently by GPT-5.6 Sol at effort high (diagnose,
  12.08.2026): the container's egress allowance is an ipset of RESOLVED IP LITERALS, written
  once by `.devcontainer/init-firewall.sh` at container start. `api.openai.com` is in that
  domain list, so the boot run is not what is missing — the addresses behind that name ROTATE,
  and the set keeps the snapshot. `api.github.com` survives because GitHub publishes CIDRs and
  the script adds those. The periodic top-up that was meant to re-resolve never ran once (fixed
  12.08.2026 in `scripts/batch-autostart.mjs`: a missing pid file on a fresh container threw out
  of the whole block), and even now it runs on the launcher's 15-minute tick.
  MEASURED AGAIN 17.08.2026, 09:50, AND ONE SENTENCE ABOVE IS WRONG: the boot run IS part of
  what is missing. Every Sol call failed, and the cause was not rotation — `chatgpt.com`,
  `auth.openai.com` and `api.openai.com` were absent from the set ENTIRELY. `postStartCommand`
  runs `/usr/local/bin/init-firewall.sh`, the copy baked into the IMAGE on 04.08.2026, whose
  domain list predates those three names; the repository's `.devcontainer/init-firewall.sh` has
  carried them since 10.08.2026 and nothing installs it, so only a container REBUILD would ever
  pick them up while every ordinary restart drops the lane again. Repaired for this container
  with `node scripts/firewall-allow.mjs` (additive, no flush). The cost is not only the outage:
  with Sol unreachable `review-sol.mjs` hands the review to the Anthropic chain and
  `ask-sol.mjs` exits 3 — each correct alone, together they move the whole load back onto the
  scarcer pool and SUSPEND the two-vendor policy of CLAUDE.md §6 without anyone deciding to.
  FINAL STATE: a cross-vendor review, a model call or a package fetch never fails on a stale
  allowance, on a container that has just come up or one that has run for a day. Concretely:
  1. The refresh is TTL-AWARE, not tick-shaped: it re-resolves at about half the shortest TTL
     of the names it holds (single-digit minutes for these hosts, not 15), with jitter.
  2. It is ARMED BY THE CONTAINER'S OWN START, not by whoever happens to open a session — the
     same boot path that arms the batch launcher, so a restart restores it unattended.
  3. It does not GROW without bound: the dynamic names live in their own set, refreshed by
     generation or by entry timeout, so a day of rotation does not leave a day of addresses
     standing. The static, published-CIDR names stay where they are.
  4. Every failure is LOUD, never skipped: the refresher not starting or dying, `sudo -n`
     refused, the set missing, DNS returning nothing, an insert failing, or the post-refresh
     probe still unreachable. A DNS failure keeps the last entries for a bounded grace period
     and is reported as a failure, never as a successful refresh.
  5. THE LIST THE CONTAINER BOOTS FROM IS THE REPOSITORY'S (17.08.2026). A domain added to
     `.devcontainer/init-firewall.sh` takes effect on the NEXT restart with no image rebuild —
     either the start path installs that file over the image copy, or it reads the domain list
     from the checkout. A name that is in the repository's list but not in the running set is
     itself one of the loud failures of (4).
  6. A session LEARNS OF THE CUT-OFF BEFORE IT WASTES A CALL ON IT: the batch's start-up check
     reports the OpenAI lane as unreachable, names `node scripts/firewall-allow.mjs` as the
     repair, and says what it costs in policy terms — while it holds, cross-vendor review is
     unavailable and authoring cannot go to Sol, so the §6 split is suspended, not ignored. It
     REPORTS; it never repairs the firewall unasked.
  NOT IN SCOPE, recorded so it is not re-derived: name-based matching in netfilter itself does
  not exist — a hostname in a rule is resolved once into literals. The only real name policy is
  a DNS-coupled set (dnsmasq `ipset=`/`nftset=` populating the set as answers are issued) or an
  egress proxy that enforces CONNECT/SNI; both need the privileged startup lifecycle to recreate
  them, which is why (2) is the load-bearing half. Sol's full answer, with its judgement of /24
  widening (worse than exact refresh: 256 addresses per answer, unrelated CDN tenants, and the
  present OUTPUT rule permits every port to them), is the design input.
  VERIFIABLE: a restart of the container, then a probe of `api.openai.com` immediately and again
  after the rotation window that broke it twice — both reachable with no manual step; the
  refresher's own log shows the re-resolves; a forced DNS failure produces the loud report and
  keeps the grace-period entries; and a unit test pins the schedule and the failure reports.
  Criticality: high — it takes out the cross-vendor review the four-eyes rule depends on, and it
  did so twice unnoticed.
  Bundle: unbundled (infrastructure).

- [ ] 456. The test that is only green in the side tree (retrospective §3.68, 30.07.2026;
  bundle Testinfrastruktur). Two blockers of one day shared a cause: a test passed because a
  git-ignored file is ABSENT in the agent's worktree while it exists in the main tree — it
  measured its environment, not the behaviour, and would have gone red on the merge. Add a
  pure hygiene gate in the Vitest layer, after the pattern of this project's completeness
  gates (`src/config/quality.test.ts`): a test file must have its paths INJECTED and may not
  read a real repository path — `.claude/`, a git-ignored path, an absolute path into the
  checkout. Existing offenders are either fixed or listed in an explicit, justified allowlist,
  so the gate starts green and cannot be "fixed" by growing that list silently.
  ONE SHAPE THE GATE MUST CATCH BY NAME (charged here 20.08.2026 from its measured
  instance, point 773): a root DERIVED at run time — `realpathSync(ROOT)`,
  `git rev-parse --show-toplevel`, `import.meta.url` walked up to a checkout — is a
  real repository path just as an absolute literal is, and it is the worse kind,
  because the case then measures WHICH checkout it ran in and is green in the main
  tree while red in every worktree. `scripts/cut-account-core.test.mjs` is the
  standing example, and it stays 773's to fix; the gate is what stops the next one.
  VERIFIABLE: the gate's own tests (a compliant file passes, each forbidden shape fails, an
  allowlisted file passes with its reason present); `npm run test:unit` stays green.
  THE SAME CLASS FROM THE OTHER SIDE (measured 10.08.2026): `scripts/worktree-bootstrap.mjs`
  answered "NONE — this checkout already has node_modules" for a `node_modules/` that held
  exactly `.tmp`, `.vite` and `.vite-temp` — no package, no `.bin`. The brief calls that
  script the FIRST command in a new worktree, so its verdict is read as "set up". Commands
  still ran, but only because the worktrees sit INSIDE the main checkout and Node resolution
  walks up into it; anything that probes a PATH instead of resolving — the
  `<root>/node_modules/.bin/oxlint` shape point 606 replaced in `scope.test.mjs` — missed,
  and its red read as a defect in the change under test.
  ALSO IN FINAL STATE: the presence check requires a real dependency (a package directory or
  `.bin`), never a directory Vite created, and the verdict NAMES where the resolution
  actually lands. VERIFIABLE additionally: a fixture worktree whose `node_modules` holds only
  cache directories is reported as NOT bootstrapped and is linked.

- [ ] 558. A verify run taken in a worktree is destroyed with the worktree (measured
  08.08.2026 at the merge of point 549; bundle Testinfrastruktur). The render-verify
  ledger lives at `.claude/render-verify-state.json`, and `scripts/repo-paths.mjs`
  resolves `REPO_ROOT` from the SCRIPT's own location — so a suite run inside a git
  worktree writes its record into THAT worktree, never into the main tree, and
  `scripts/worktree-cleanup.mjs` deletes it with the directory. The cost is exact: the
  three WebGPU `polish` runs that proved point 549 on its branch were gone the moment
  the branch's worktree was cleaned, and `render-verify-guard` — correctly, by what it
  can see — demanded the WebGPU suite again on `main`, ~15 minutes more for a picture
  already taken. CLAUDE.md §6 delegates every point to a WORKTREE-isolated agent, so
  this hits EVERY delegated render point: the agent's own backend evidence never
  reaches the guard that asks for it, and the session either re-runs it or writes a
  deferral for a run that actually happened.
  FINAL STATE: a verify run records where the guard reads it — one ledger per
  REPOSITORY, not per working tree. The ledger path resolves against the git COMMON
  directory (`git rev-parse --git-common-dir`, whose parent is the main tree) instead
  of the script's own path, so a run inside a worktree lands in the main tree's
  `.claude/render-verify-state.json` and survives the cleanup. Each record NAMES the
  tree and the commit it was taken on, so a branch run is distinguishable from a main
  run, and the guard's coverage question is unchanged — was this backend proven since
  the last render-file edit — with no new exemption. Every other `.claude/` state a
  worktree agent WRITES and the main session later READS is checked in the same pass
  and either moved to the common directory or documented as deliberately per-tree.
  ONE SUCH SITE IS ALREADY MEASURED (20.08.2026, by the agent on point 758):
  `scripts/finding.mjs` derives the carrier path from `REPO_ROOT` as well, so a finding
  recorded inside a worktree lands in a worktree-scoped directory that no session reads
  and that the worktree cleanup deletes with the directory — the agent's finding on the
  CLAUDE.md follow-up was lost exactly that way and survived only through its closing
  report. A delegated agent therefore has NO working channel for a finding except the
  report, which is the one thing the carrier exists to replace. It moves to the common
  directory with the ledger.
  VERIFIABLE: a Vitest case pins the resolution in both directions — with a `.git`
  FILE pointing at a worktree gitdir the ledger path comes out in the MAIN tree, with
  an ordinary `.git` directory it is unchanged (the case must fail against today's
  code, or it proves nothing); a run recorded from a worktree is found by
  `coveringRun` in the main tree after that worktree is removed; and a finding recorded
  from a worktree is listed by `finding.mjs --drain` in the main tree.
  Criticality: medium — no product defect, but it voids the evidence of every
  delegated render point silently, which pushes the session toward re-running or
  deferring what was already proven.

- [ ] 574. A bare verify script photographs whatever server holds port 5173 (found
  09.08.2026 during the point-264 picture check; it had already invalidated one accepted
  picture acceptance before anyone noticed).
  `scripts/verify/enrichments.mjs` — and every suite that reads it — falls back to
  `BASE_URL ?? 'http://localhost:5173/'`. Run standalone, as the repair loop and every
  delegation brief tell an agent to do, the suite attaches to whatever dev server happens
  to be listening on that port. On 09.08.2026 that was a leftover server from an abandoned
  worktree, serving code from BEFORE the fix under test: every check passed, every frame
  looked plausible, and the picture that was accepted showed the OLD build. `run-all.mjs`
  cannot hit this — it starts its own server on a free port in its own working directory —
  so the trap sits exactly on the path taken when someone is iterating fast.
  FINAL STATE: a suite started without a server of its own REFUSES to run rather than
  guessing a port. The fallback to a hard-coded 5173 is removed; with no `BASE_URL` the
  suite either starts its own dev server (preferred — the repair loop stays one command)
  or exits naming the command that does. Where a server IS supplied, the suite asserts
  before its first screenshot that the server it reached serves THIS working tree — a
  build stamp the dev server exposes and the suite compares against the checkout it runs
  from — so an attached-to-the-wrong-server run dies loudly instead of photographing a
  stranger.
  SECOND WAY A FRAME PROVES NOTHING: IT IS EMPTY (found 11.08.2026, landing point 610).
  The collision suite rewrote `verification/52-collision-port-wall.png` as an ENTIRELY
  BLACK picture on the WebGPU lane — 23 KB against 657 KB, nothing in it but the HUD bar,
  where the frame is named for the port wall the camera is pressed against — and the run
  exited 0 with the shutter (`scripts/verify/frameSubject.mjs`) raising nothing. The same
  frame on the WebGL 2 lane shows the lit wall, so the picture proof was void on exactly
  the lane the player uses. The shutter projects the SUBJECT into the frame and asks
  whether it is in view; it never asks whether anything was DRAWN, and an empty picture
  answers "in view" as readily as a full one.
  FINAL STATE: the shutter refuses a frame with nothing drawn in it, on the same footing
  as one whose subject is out of view and with the same loud message — judged by what the
  renderer reports for the frame it just wrote (draw calls / triangles, the reading
  `sceneReady` already takes), never by file size. WHY the WebGPU lane draws that wall
  black while WebGL 2 draws it lit is ESTABLISHED as part of this, not guessed: either the
  player standing at a wall sees black on his own backend — a game defect, which then gets
  its own point — or the headless WebGPU lane cannot draw that view, which the deferral
  path must then say out loud instead of writing a frame.
  VERIFIABLE: pure Vitest for the refusal (no BASE_URL and no own server → a non-zero exit
  naming the remedy, never a run), for the stamp comparison (a mismatched stamp fails) and
  for the empty-frame refusal (a renderer reading of zero drawn geometry → no frame
  written, remedy named); plus the real proof — a suite pointed at a server from a
  DIFFERENT checkout must fail, where today it passes green, and the black port-wall frame
  must be refused where today it is written.
  Criticality: high — it does not break the game, but it silently voids the picture
  proof, which is the one check this project cannot replace with a test.

- [ ] 567. A killed session leaves its verify run behind, and nothing stops it
  (measured 09.08.2026, 00:12–00:14, on the resumption after the point-342 session died;
  bundle Testinfrastruktur). The dead session's `run-all polish enrichments` (pid 1641328)
  was still running nine minutes later, together with its Vite dev server and its headless
  Chrome, and it competed for the machine with the run the successor had just started.
  That is precisely the load that makes the software WebGPU lane report rate checks as
  product defects (points 506/564), so the successor's first evidence was worthless before
  it was read.
  TWO MECHANISMS LOOKED AND BOTH LET IT PASS:
  (a) `batch-doctor` ran first and reported `strayProcesses=0`. Its stray probe judges the
      MAIN checkout, and every one of these processes was launched from an agent WORKTREE
      (`.claude/worktrees/…`), so the one mechanism whose whole job is to mend a torn tree
      before work resumes did not see the loudest torn thing in it.
  (b) The point-296 quiet-machine check DID see them — it named all three by pid with
      "FROM THIS CHECKOUT" and the sentence "a forgotten dev server has already cost a whole
      unit run" — but only as a WARNING, after the run had already started, and its remedy
      (`--on-load=defer`) has to be passed BEFORE the run by someone who already knows. So
      the check that found the problem also let the tainted run proceed.
  FINAL STATE:
  1. `batch-doctor`'s stray probe covers EVERY checkout of this repository — the main tree
     and every registered worktree — so a verify run, dev server or automation browser from
     any of them is a stray. `--repair` ends them, logged by pid and command like every
     other repair, because an owner that is provably dead cannot own a process either.
  2. The quiet-machine check ACTS on its own finding: leftovers belonging to this project
     (a verify suite, a Vite server, an automation browser) are not a warning but a HALT —
     the run stops before its first frame, naming the pids and the one command that clears
     them. A run started against known self-inflicted load produces evidence nobody may use,
     which is worse than no run.
  3. The halt is overridable for the case where the leftovers are deliberate
     (`--on-load=proceed`), and an overridden run is marked in its output as taken under
     known load, so its timing verdicts are never later read as clean.
  VERIFIABLE: pure Vitest — the stray probe returns a worktree-launched verify process for a
  repository whose worktree list contains it, and `--repair` plans its termination; the
  quiet-machine verdict is HALT for a self-owned leftover, PROCEED for an unrelated busy
  machine, and PROCEED-MARKED under the override, with the pids named in every case.
  Criticality: medium, frequency HIGH (every killed session can leave one behind).

- [ ] 460. A red verification must be diagnosable without re-running it (30.07.2026; bundle
  K). `runSuite` in `scripts/verify/run-all.mjs` captures each suite's complete output, prints
  only the verdict line plus, on a failure, the `FAIL`/`ERR:` lines and a hardcoded 12-line
  tail — and then DISCARDS the rest. So the context is already bounded; what is missing is the
  EVIDENCE. Diagnosing a red suite today means running it again, and a browser suite on two
  backends is the most expensive wall-clock item we have.
  FINAL STATE: `runSuite` — and the preview and cross-browser paths — writes each suite's
  complete captured output to `local/verify-logs/<run-stamp>/<suite>-<backend>.log` (`local/`
  is git-ignored) and prints that path beside the verdict line, so a session reads the tail of
  a NAMED file instead of re-running the suite. The failure tail length becomes calibratable
  (`VERIFY_FAIL_TAIL`, default the current 12) and applies to EVERY failure, not only a crash.
  What must NOT change: the SUITES' own stdout stays full — the runner parses `^PASS`/`^FAIL`
  counts, `console errors: (\d+)` and `failedChecks` out of it, and condensing the suites
  rather than the runner would blind exactly that parsing. A suite invoked DIRECTLY (`node
  scripts/verify/render.mjs`, the render-verify-guard's per-backend runs) is out of scope; the
  documented route for a condensed run is the runner's filter form, and
  `scripts/verify/README.md` says so. NOT the mechanism: a context compaction — a lossy
  summary of guard, lease and focus state is exactly what the point boundary was built to
  avoid.
  VERIFIABLE: the pure shaping (verdict line, the path line, the calibratable tail length,
  what a green versus a red suite prints) is covered in the Vitest layer; the live path is
  proven by an existing browser suite run writing its log file.
  PRIORITY: behind 458 and 459 — it is a wall-clock and diagnosis saving, not the context
  saving it was drafted for.

- [ ] 455. A red that load did not explain (30.07.2026, measured: `batch-doctor --gate` called
  a real unit-test failure INCONCLUSIVE because of "1 live agent worktree", and that worktree
  had last been written the previous evening; bundle Testinfrastruktur). The load excuse is
  right in principle (retrospective §3.22/§3.48) and was wrong here: it downgraded a genuine
  red — the retro ledger demanding entries for three lessons — to "repeat later", which
  unattended means the batch runs on a red tree for hours. A worktree only counts as LIVE
  evidence of load when something has recently been WRITTEN in it (the probe of point 434
  already dates an agent by its edits — reuse it, do not build a second one), and the verdict
  names its evidence: which worktree, how old its newest edit, what CPU was measured. A stale
  worktree directory is debris (443) and never an excuse.
  THE SAME EXCUSE FROM THE PROCESS SIDE (11.08.2026, measured): the quiet-machine check of the
  verify runner counted the BATCH SESSION ITSELF as "another verify/browser suite run" — its
  evidence line named `pid 1373729: /usr/local/share/npm-global/bin/claude -p Autonome
  Batch-Wiederaufnahme …`, because the session's own prompt text contains the verify script
  names and the probe matches the whole command line. Unattended that is total: every run of an
  autonomous session declares itself loaded, so every red it takes is "not authoritative" by
  house rule. A process counts as load only when it IS a suite (its argv NAMES a
  `scripts/verify/` entry point as the program, not inside a prompt), and the session's own
  process and its descendants never count as load against themselves.
  ONE JUDGEMENT, ONE OWNER, AND IT SITS HERE (20.08.2026). Point 564 demands the other half of
  the same question and pulls the other way: a check failing in BOTH runs may not be called a
  candidate real failure while the machine reading is UNKNOWN or LOADED. The two reach different
  modules — verified 20.08.2026: this point's verdict lives in `describeLoad`/the gate verdict of
  `scripts/batch-doctor-core.mjs` and in the process probe of
  `scripts/verify/machine-load-core.mjs`, 564's in `repeatSignature`/`formatRepeatReport` of
  `scripts/verify/baseline-classify-core.mjs` — so one fix does NOT serve both, and each is built
  where it lives. What may not differ is the CRITERION, and it is owned here, because this point
  corrects the probe both verdicts read. The criterion: load must be SHOWN, never inferred from a
  reading that could not be taken. A worktree nobody has written in, the session's own process
  and a counter this host does not have are all "nothing known", and nothing known is not load.
  THE MEASUREMENT NOBODY HAS TAKEN, and 564's default rests on it: over the recorded runs on this
  host, how often the quiet-machine check can report a MEASURED-quiet machine at all. UNDECIDED
  is the right verdict for a machine that could not be shown quiet and the wrong one as a
  permanent state — on a host with no GPU busy counter it would turn every twice-failing check
  into UNDECIDED for good, which is precisely the standing excuse this point exists to withdraw.
  If the measurement shows a quiet reading is unreachable here, the criterion names the
  substitute evidence (CPU and load average, with the worktree and own-process rules above) that
  a quiet verdict may rest on, so both verdicts keep a reachable green.
  BOTH HALVES MEASURED TOGETHER, 27.08.2026, 00:12, on main `6edd81fd`, and the gate is now
  structurally suspended rather than occasionally wrong. `node scripts/batch-doctor.mjs --gate`
  reported `npm run test:unit FAILED but the verdict is INCONCLUSIVE (load) — 7 live agent
  worktree(s)` and, in the same line, `GPU load NOT measured (no sysfs gpu_busy_percent, no
  nvidia-smi)`. Neither excuse held: `ps` over all seven worktree paths found NO process in any of
  them, and their newest commits are 3, 4, 8, 9, 9, 12 and 14 days old — parked branches, i.e.
  precisely the debris case this point already rules out. `liveAgentWorktrees()` in
  `scripts/batch-doctor.mjs` takes every path under `worktrees/` straight from `git worktree list
  --porcelain` and asks neither for a recent edit nor for a process, so while this batch parks
  feature branches — its normal state — `isEvidenceGrade()` can never return true. Add the host's
  permanently missing GPU counter and the two clauses close on each other: the quiet reading is
  unreachable AND the worktree excuse never lifts, so NO red this gate ever takes can be evidence,
  and its own verdict line ends `do NOT stop the batch on this`. That is the permanent-UNDECIDED
  state the paragraph above warns against, reached from both sides at once.
  WHAT THE RED ACTUALLY WAS, since the excuse hid it: nothing. Re-run by hand the same hour, the
  suite reported 430 files and 14 015 tests ALL PASSED and still exited 1, because the global
  teardown of `scripts/repository-integrity.mjs` had seen a ref move — point 955. The moving ref
  was this session creating the next point's own feature branch at 00:12:28Z, four seconds before
  the run ended. So the load excuse was covering a false red from a different mechanism, and the
  tree it refused to judge was entirely green: the two defects hand each other an alibi.
  VERIFIABLE: Vitest on the pure verdict — a red beside a worktree whose newest edit is hours
  old is BROKEN, not inconclusive; a red beside a worktree edited a minute ago stays
  inconclusive; the reason string names the deciding measurement. Plus, on the process probe: a
  `claude -p "<prompt naming scripts/verify/run-all.mjs>"` argv is NOT load, a real
  `node scripts/verify/run-all.mjs polish` argv IS, and the session's own pid never counts.

- [ ] 603. The ground's micro-detail sits just under its own bar, and nobody owns it
  (measured 10.08.2026 during the acceptance of the play-session packages; the triage point
  of 04.08.2026 named this failure and closed without giving it an owner). The `settings`
  check `first-person ground shows micro-detail (edge energy)` reads a Laplacian mean of
  1.08–1.09 against a bar of 1.1 — red twice in a row on a QUIET machine, and
  `baseline-classify` against the pre-merge commit calls it PRE-EXISTING / stale
  assumption. It has therefore been red for days while every run charged it to "known",
  which is precisely how a check stops being evidence.
  WHAT MAKES IT WORTH A POINT rather than a threshold nudge: 1.08 against 1.1 is not a
  wrong number, it is a number without a verdict. Either the ground genuinely lost the
  grain that acceptance criterion 15 demands at eye height, or the crop the check measures
  no longer contains the surface it was written for. On 04.08.2026 the same check read 0.00
  with AND without the graphics card, which proved it was not the hardware and left the
  question open.
  FINAL STATE, decided BY THE PICTURE and never by the number (the triage point's own
  rule): take the frame the check measures at the current head, look at it, and say which
  of the two it is. If the ground lost its relief, that is a render defect and is fixed. If
  the check crops somewhere the relief never was, the CHECK is corrected — with the reason
  written into it — and never by lowering the bar until it passes. Whichever it is, the
  check goes green on a quiet machine twice in a row, or it is deleted with its reason.
  UNTIL THEN this point is where that red is charged, so an acceptance run can state its
  reds honestly instead of carrying an unowned one.
  Criticality: medium — no crash and nothing the player reports, but an unowned red inside
  the everyday gate is a hole in the one signal every other point is judged by.

- [ ] 528. The deploy that never reaches a runner leaves the site stale, and point
  526 IS UNPROVEN ON THE LIVE PATH (measured 06.08.2026, immediately after 526
  merged). Point 526's VERIFIABLE demands, besides its Vitest layer, ONE REAL
  DEPLOY RUN proving a commit still reaches the live site. That proof could not be
  taken: from 15:35 UTC GitHub Actions was degraded — two runs died in `Set up
  job` with `Failed to resolve action download info. Error: Internal Server
  Error` / `Service Unavailable`, `workflow_dispatch` answered HTTP 500, and the
  one run whose build succeeded (31117749040) had its `deploy` job cancelled at
  16:15:56 UTC with ZERO steps recorded, 15.5 minutes after becoming eligible —
  it never got a runner. What 526 DID prove against a real red run is its
  classifier: `classifyFailureCause` read run 31116867124 as `external` with the
  remedy naming the unblock command, so item 4 holds. Items 1, 2 and 5 — the
  cancel-and-retry inside a run that actually executes — remain unexercised.
  Consequence meanwhile: `main` stands at ee125053 while the site still serves
  c728c816, so the user judges render work against a stale build.
  The classifier half was BUILT the same evening, on `main`, because the guard was
  holding the session over a red no push could clear: a failed job that executed
  no step of ours now reads as external — but only where the failing workflow's
  OWN file is proven unchanged since its last green run, since a broken `uses:`
  or `runs-on` dies in the same shape and IS ours; such a red no longer blocks the
  turn end, it re-alerts hourly instead, and the waiver is judged against EVERY
  red on the commit so one outage cannot excuse another workflow's real failure.
  Two-pass Fable review recorded. What that leaves is below.
  FINAL STATE:
  1. The live proof of 526 is taken: one deploy run whose `deploy` job really
     executes, whose `Verdict` step prints its explicit line, and after which the
     served site matches `main`. Recorded in `docs/acceptance-evidence.md` beside
     the criterion it belongs to.
  2. It is settled by measurement whether the deploy job's own
     `timeout-minutes: 25` contributed to the cancellation (the 15.5-minute gap
     says it did not, but the value was chosen without this failure in view);
     the value is either justified in a comment or corrected.
  3. A deploy that never reached the site is NOTICED without a human looking:
     the batch learns that the served build lags `main`, names both revisions,
     and retries once GitHub answers again — the site being stale is the fault
     that matters, not the run being red. This is the item the outage showed to
     matter most: every alarm the project has fires on a RED RUN, and none on a
     site that quietly serves yesterday.
  4. The reviewer's two recorded residuals are closed or written off with a
     reason: a workflow byte-identical to its last green run can still be broken
     from outside (a retired `runs-on` image, a yanked action tag), which the
     "untouched" proof reads as an outage though only a push fixes it; and
     `fetchJobs` walks only the first 30 jobs of a run.
  VERIFIABLE: pure Vitest on the stale-site comparison (served revision vs
  `main`) and on the two residuals of item 4, plus the one real deploy run of
  item 1 with its run id recorded.

- [ ] 510. The render-verify core counts a run that never confirmed its backend
  (four-eyes review of point 505's gate change, 05.08.2026 — the reviewer cleared
  that change and left these three beside it).
  FINAL STATE:
  1. `coveringRun` (`scripts/render-verify-core.mjs`) counts a run only when it
     also CONFIRMED its backend. Today it reads the exit code alone, so a run that
     never reached `assertBackend` covers — and since that call is what writes the
     feature level, such a run carries neither signal and still passes. Vitest
     pins both directions.
  2. `coveringRun(runs, b, since, null)` no longer throws: the options default
     catches `null` as well as `undefined`, or the totality test stops claiming
     more than holds. The outer guard catches it fail-open today, so this is
     honesty about the core's contract, not a live defect.
  3. The CLOSING (§9) demands a core-level WebGPU sighting once per release, so a
     compatibility-level lane never becomes the sole WebGPU evidence for a tag.
     The turn gate stays level-agnostic — demanding core there would hard-block
     every render change on a host whose only adapter is compat (point 505).
  VERIFIABLE: Vitest — an unasserted run never covers, an asserted one does, and
  the options default survives `null`; `scripts/closing-guard-core.mjs` carries the
  core-level step and `--status` lists it.
  RE-MEASURED 20.08.2026 (work-order review), because it was read elsewhere as delivered
  by the backend-verification work: it is not. Clause 1 STANDS — `runVerdict` in
  `scripts/render-verify-core.mjs` still returns `covers: true` on `Number(run.exit) === 0`
  alone, and `coveringRun` only ever filters on `featureLevel` when a caller passes one, so
  the `"asserted": true` the recorder already writes into every run of
  `.claude/render-verify-state.json` is data no gate reads. Clause 3 stands too: no
  core-level step appears in `CLOSING_STEPS`. Struck from clause 2 is only its behaviour
  half — the options are destructured as `options ?? {}`, so `null` no longer throws; what
  is left of it is the Vitest pin, which covers `undefined` and not `null` today.

- [ ] 518. The shutter judges its aim before the wait and never re-judges (found
  05.08.2026 while closing point 489). `captureFrame` checks that the frame's
  declared subject is in the picture, and only THEN waits up to 120 s for the scene
  to finish drawing. Nothing re-judges the aim afterwards. Where the camera drifts
  during that wait, the frame is written with its subject out of view while the
  shutter reports it was in view — precisely the class of defect points 375 and 489
  exist to prevent. The drift is not hypothetical: the Nile current carries the
  traveller downstream for as long as he stands in the river (CLAUDE.md §7.1 pt. 21),
  which is why frames 117/118 had to be re-aimed immediately before each shot rather
  than once at the start.
  FINAL STATE:
  1. The subject check runs AGAIN after the readiness wait, immediately before the
     shutter opens, and that second reading is the one that decides. A frame whose
     subject left the picture during the wait FAILS LOUDLY, naming what was found
     instead — the same message the first check already produces.
  2. The re-probe costs nothing where nothing moved: it is the existing projection
     read, not a second settle.
  3. The re-aim that points 117/118 carry today is no longer the mechanism that
     keeps a drifting frame honest — it may stay as an aim, but the guarantee comes
     from the shutter.
  TWO MORE FINDINGS FROM THE FOUR-EYES REVIEW OF 489 (Fable 5, 05.08.2026, verdict
  merge-with-fixes — they belong here because they are the same gate and the same
  file, and one verification round should close all three):
  4. STILLNESS CONFLATES FINISHED WITH NOT-RENDERING. The readiness verdict reads
     only the draw-call and triangle counts, so a render loop that has STALLED
     freezes them exactly as a finished scene does — and the shutter opens on a
     half-built frame. The wait must additionally demand that the frame counter is
     ADVANCING, so "the numbers stopped moving" can only mean the scene settled,
     never that drawing stopped.
  5. THE QUIET WINDOW HAS ALMOST NO MARGIN. `quietMs` is 5 s against a plateau
     measured at 4 s — one second of reserve on the host the wait was written for,
     and this is the class of value that a slower host eats first. Set it from the
     measured plateau with a stated factor, calibratable like every other such
     value, rather than as a bare constant. The blank-frame FLOOR is re-measured in
     the same pass: `sceneReady-core.mjs` states blank frames stand at 5.5k
     triangles while `world.mjs` measured blank washes at 14–16k against a 20k
     floor — two comments in the same change contradict each other, and the
     surviving one is whichever the measurement supports.
  6. `settle: false` IS UNREACHABLE FOR EVERY KIND BUT `world`.
     `normaliseDeclaration` (`scripts/verify/frameSubject-core.mjs`) keeps the
     `settle` field only for `world` frames and drops it silently for `general`,
     `local` and `place`, so those can never ask for the drawn-only mode. The
     measured consequence is in `scripts/verify/visualsweep.mjs`: its filmstrip
     frames are `general` frames taken WHILE THE TRAVELLER DRIVES AWAY — the motion
     IS the strip — and they now serve the full stand-still wait, which under
     continuous streaming risks the 120 s timeout and in any case destroys the
     1.8 s cadence the strip exists for. The mode must be reachable from every kind
     whose frame can legitimately photograph a moment, and a dropped field must
     never be the silent answer.
  7. AN ELEMENT FRAME PHOTOGRAPHS THE WHOLE SCENE WITH NO WAIT AT ALL (measured
     05.08.2026 on the point-394 branch: `verification/81-handwriting.png` showed a
     BLACK settlement — no ground, no buildings, only floating labels — while the
     same suite's later frame drew Cairo's alley completely; reproduced on a quiet
     machine, so it is systematic, not load). `sceneReadyMode`
     (`scripts/verify/sceneReady-core.mjs`) returns `'none'` for every
     `kind: 'element'` frame, on the reasoning that a DOM subject is complete the
     moment it is on screen — but `captureFrame` then takes a FULL-PAGE screenshot
     unless the declaration carries `clip` or `locator`, so the whole 3-D scene
     behind the element is photographed with no readiness wait at all. Measured
     across `scripts/verify/*.mjs`: 22 element frames, 21 of them full-page, none
     using the `sceneReady: true` escape hatch. The mode must follow the CAPTURE,
     not the subject: an element frame that writes the full page serves the same
     stand-still wait as any other scene frame, and only a clipped or locator-bound
     capture keeps the no-wait mode. `scripts/verify/sceneReady.test.mjs` pins the
     current rule (its "its subject is DOM" case) and changes with it.
     REPRODUCED ON `main` (05.08.2026 21:25, both backends green): a plain `flow`
     run rewrote `verification/02-port-cairo-trade.png` with the settlement behind
     the trade dialog BLACK, where the committed frame shows Cairo's alley. So this
     is not one branch's accident — every element frame in the set is one slow load
     away from photographing an empty world, and the eight frames that run rewrote
     were restored rather than committed.
  8. NOTHING EVER ASKS WHETHER THE CANVAS DREW (found 09.08.2026 by the four-eyes
     review of point 566). A `place` or `local` frame proves its subject through the
     DOM labels, and those labels sit in the HUD layer — they are on screen whether
     or not the scene behind them rendered. Measured: that branch rewrote
     `verification/77-enrich-village-life.png` from a Maasai village (huts, fire,
     inhabitants, 669 KB) to a BLACK canvas carrying only the HUD and the Market
     Hut / Chief's Hut / Elder labels (31 KB), and the shutter opened on it and
     exited 0. Item 7 closes the no-wait path that produces such a frame; this item
     closes the ACCEPTANCE of one, which is the half that makes it evidence.
     FINAL STATE: any capture that includes the canvas additionally requires the
     canvas to have DRAWN — the written frame is sampled and REFUSED when one colour
     occupies more than a calibratable share of it (start at 98 %: a rendered
     African scene never approaches that, while a black or single-wash canvas
     exceeds it immediately). The refusal names the dominant colour and its share,
     in the same voice as the subject refusal. A frame that legitimately photographs
     a near-uniform picture declares that intent explicitly rather than being
     exempted by kind, so the exemption is visible in the declaration and not a
     silent property of the mode. A clipped or locator-bound capture that never
     includes the canvas is out of scope.
     CORROBORATED 09.08.2026 by running each `enrichments` section alone: the fault
     is not one frame and not only BLACK. `88-canoe-ride.png` collapsed 993 KB → 47 KB
     as a uniform GREY HAZE at 11 FPS, `104-region-border-river.png` 1.39 MB → 51 KB
     as a black canvas carrying only the HUD and its "Unknown waterfall"/"Unknown
     lake" labels — both accepted, both exit 0. Most such captures pass `settle:
     false`, whose readiness mode requires only THAT a picture exists. This is why
     the measure is colour DOMINANCE and not file size: on identical code one
     section's frame moved 261 KB ↔ 662 KB between two runs, so size decides
     nothing and a reviewer must open the image.
  The re-probe of item 1 applies in the STAND-STILL mode only: the drawn-only wait
  is near zero, and re-probing there would add flake on exactly the fast-moving
  subjects that mode serves. The stale comment in `frameSubject.mjs` claiming
  nothing moves the camera during the wait is corrected in the same commit — commit
  `02be8c7d` already falsifies it. The Vitest gap the review names is closed with
  it: the readiness mode is currently tested on hand-built objects only, never
  through `normaliseDeclaration`, which is what hid item 6.
  VERIFIABLE: pure Vitest on the shutter's decision (subject in view before AND
  after → written; in view before, gone after → refused with the second reading in
  the message; a frame that needs no readiness wait behaves exactly as today; a
  canvas-bearing frame whose picture is one colour past the share is refused naming
  that colour, while a rendered frame and a declared near-uniform one pass; a
  full-page element frame serves the stand-still wait while a clipped or
  locator-bound one does not), and live the two Aswan frames stay green.

- [ ] 523. The panorama leave-capture comes out empty, and two checks on `main`
  HAVE BEEN RED FOR IT (measured 05.08.2026 while closing point 480, on BOTH
  backends, and classified PRE-EXISTING on `main` by
  `node scripts/verify/baseline-classify.mjs polish --ref origin/main`). The two
  failing checks are `the leave capture bakes the surrounding terrain into the band
  (point 227)` and `the band is compass-true`. The numbers name the cause rather
  than a threshold: the leave-capture reads OPAQUE 0.000 with 0 px west and 0 px
  east — it captures NOTHING, so both checks judge an empty image and neither can
  pass. Whatever the band looks like in the game, its evidence has been absent long
  enough that a red on `main` stopped being noticed, which is exactly the state
  point 387 exists to end.
  THE TWO DIAGNOSED CAUSES ARE ON RECORD, one per failing check, and both were
  measured 3 of 3 runs on the slow container host during the point-499 triage
  (04.08.2026). FOR THE TERRAIN BAND: the capture fires as the travel scene
  MOUNTS, so no amount of waiting afterwards can change what it photographed,
  and `panoramaCaptureReady` gates on terrain chunks being COMMITTED rather
  than DRAWABLE — on the fast Windows host the two coincide, on this one they
  do not. The gate therefore has to hold until the surrounding terrain actually
  RENDERS, read from what the renderer draws and never from a chunk count or a
  wall-clock allowance; point 227's grey-horizon check stays and is not
  weakened; and a capture that would still be unready at its deadline says so
  instead of silently writing a black or terrainless band.
  FOR THE COMPASS PILLAR: the water fractions of the SAME capture became
  non-zero once the scene was built, so the capture happens and the DEV probe
  pillar is simply not in it. The recorded suspicion is that
  `hasPanoramaCapture` short-circuits the re-capture, so the check's
  `delete window.__placePanorama` clears the hook but not the cached image and
  the pillar is added to a capture that is never taken again. That suspicion is
  CONFIRMED OR REFUTED at the code before anything is changed — a fix built on
  the wrong cause is the more expensive mistake — and then either the probe
  reliably enters the capture it is set up for, or the orientation is measured
  another way that does not depend on injecting geometry into a cached capture,
  whichever is chosen written down with its reason.
  FINAL STATE: the leave-capture produces a non-empty image again — the cause is
  found and named (a capture taken before the panorama is drawn, a target that
  moved, or a capture path that silently yields a blank surface), not worked around
  by lowering the opacity floor. Both checks then judge a real picture and pass on
  both backends. If the capture legitimately cannot run headless on one backend,
  that is a recorded deferral naming the backend, never a quiet skip.
  VERIFIABLE: `polish` green on WebGL 2 and WebGPU on a quiet machine, with the
  leave-capture's opacity and its west/east pixel counts printed in the run so an
  empty capture can never again read as a threshold miss; plus a pure test that the
  check FAILS on an all-transparent capture instead of reporting a band verdict.
  Both checks pass three consecutive runs on the container host and the band is
  inspected as a PICTURE once, not only as a number; and the compass check FAILS
  when the panorama orientation is deliberately inverted — a check that cannot
  fail proves nothing.

- [ ] 200. Verify-script robustness pass — fix the 26 wall-clock/radius
  findings in the test scripts (Pillar-2 group E; exact list in the 184 log:
  20 in enrichments, plus polish 270, settings 183/277, flow 242, voice 56,
  touch 75). Two patterns, both established: (1) render-loop behaviours polled
  on the SIM clock (__pollSim/__sleepSim/simTime) or on the check's OWN
  condition — never a fixed wall wait (the point-177 class; the elephant-roam
  and lion-feed flakes were exactly this); (2) "in view / beyond the ring"
  judged by __camera.onScreen/ndc projection — never an assumed radius (the
  point-172 class), with checks that TEST a radius-feature keeping the radius
  but saying so. Work file-by-file, run each touched suite after its change
  (both backends for the WebGPU-lane suites; touch/voice webgl-only), and
  fold the result into the final-closing 3× flake-free gate — this point IS
  the systematic version of the one-off de-flakes done so far (some findings
  may already be partly fixed, e.g. settings 277: verify against HEAD first).
  NARROWED 20.08.2026: the systematic SWEEP is no longer this point's job. The inventory of the
  26 sites and both patterns moved to point 642, which owns the sweep, the state-versus-timing
  classification and the gate that keeps the pattern out, and which is the later user instruction
  on exactly this subject; two points demanding one sweep is how it gets done twice or not at all.
  Struck here is the headline mandate "fix the 26 findings". What STAYS is everything this point
  measured that 642 does not carry: the rotating single failure of `enrichments` with its named
  sites and their causes, the DECISION between root-causing the four staging settles and charging
  them in the ledger, the dead ends recorded below so they are not repeated, the tripwire's
  one-frame tolerance, and the owed quiet-machine reading of the dressing streamer.
  PROGRESS 21.07.2026: converted the six named non-enrichments waits (commit
  7ed3c56) + six enrichments family/predator/scavenge/rescue STAGING settles to
  __sleepSim (5127afa, af4533f) — all touched suites green.
  MEASURED 09.08.2026 (closing point 566, WebGL 2): the residue is a ROTATING
  SINGLE failure, and it is what makes the suite unable to produce a clean run on
  demand. Six runs of `enrichments` on byte-identical product code (`src/` did not
  change) gave one fully green 251/251 and five runs of 249–250 pass with 1–2 red
  — never the same check twice: "prey squeezed against a bank flees ALONG it"
  (pt. 201; the failing sample ended `onWater:true`, path 8.2 / net 6.2, against
  11.3 / 11.3 when it passes), "holding Ctrl names the animals in view" (pt. 342;
  `0 animals of 1 labels`), "a calf out of reach past the reunion window is handed
  to the adoption" (pt. 341; `separated:false`) and "a predator staged during the
  window still makes the calf RUN" (pt. 369; `fleeBefore 5 == fleeAfter 5`). The
  runner's own classifier called both double-reds a LOAD/FLAKE signature, and a
  baseline run of the CURRENT checks against the pre-566 tree reproduced the same
  instability — so these are the suite's own staging, not a product defect and not
  the sectioning. Each is a STAGING settle of exactly the two patterns above; fixing
  them is what makes a green run repeatable rather than lucky.
  AND THEY ARE NAMED BUT NOT CHARGED (found 09.08.2026 while preparing point 309).
  The measurement above pins each rotating red to an OPEN point (201, 342, 341, 369),
  but `scripts/render-verify-charges.mjs` holds exactly ONE entry (point 506, polish,
  goat walker) and none of these four. `render-verify-core`'s `runVerdict` counts a
  run as covering only when EVERY red is charged to an open point, so an `enrichments`
  run comes back UNACCOUNTED even though its reds are measured, owned and understood.
  The cost is exact: point 309's one remaining gate is a green LARGE run, and that gate
  cannot be reached by waiting for a quiet machine — the run would have to come up clean
  on the one-in-six chance the measurement recorded.
  DECIDE, DO NOT DRIFT: either these four staging settles are fixed here (the point's
  own job, and the honest fix), or the four reds are CHARGED to their points in the
  ledger the mechanism provides for exactly this case. Charging is legitimate — it is
  what the ledger is for — but it silences the checks, so it is a deliberate decision
  written down with its reason, never a quiet workaround. Whichever is chosen, 309 stops
  waiting on a green that cannot arrive.
  PROGRESS 21.07.2026 (evening): three more increments, each validated green +
  pushed — (1) FAIL-SOFT against a whole-run ABORT (7360b62): a rare mid-check
  scene remount briefly nulls window.__wildlife; a non-optional herdsRef access
  threw an UNCAUGHT error that killed the entire run and DEFEATED the auto-retry
  (a crash on attempt 1 + any rotating flake on attempt 2 = double failure). The
  collision-drive loops now optional-chain the hook and __pollSim wraps its
  doneFn in try/catch — a crash becomes at worst one recoverable check miss. This
  was the key structural win: the suite now reaches green via retry-cushioning as
  designed. (2) Canoe/swim staging settles -> condition polls (same commit).
  (3) The collision drive-in/escape loops bound by SIM time with a wall cap
  (79ff2cb) — a wall-timed window ran too few frames under load (escaped 0 vs
  5.3). NEXT / NOT YET DONE (a flood-convergence batch was tried and REVERTED
  unvalidated — do it right): replace the long weather blend waits
  (waitForTimeout 4000-4500, "blends at 0.02/frame": Nile flood ~5047, Okavango
  ~5090, harmattan ~5119) with a convergence poll — BUT settle on the value the
  CHECK ACTUALLY READS, not just the blend driver: the harmattan check reads
  __climate.fog().far, which LAGS __climate.dust() by its own fog blend, so
  settling on dust() returned before fogFar closed and the Jan<Aug assertion
  failed (161 vs 153). Settle on fogFar (and for the Nile settle on surfaceAt,
  for the Okavango on deltaWaterScale — whatever the check compares), or poll
  until ALL read values are stable. Speeds up every run ~15-20 s AND de-flakes.
  FLAKE SITES OBSERVED IN THE 25.07 CLOSING RUNS (three LARGE runs, quiet machine — each
  red was a DIFFERENT check, which is the signature of rotating flakiness rather than a
  regression): flow fails its FIRST navigation on a cold dev server in every one of the
  three runs (0 pass / exit 1, the networkidle wait) and passes on retry — the most
  reproducible site and the best next fix; collision once (19/20); enrichments twice, at
  DIFFERENT checks — the point-267 blood-stain-on-a-slope check (holeFraction 0 but the
  blob/soak counts short) and the point-278 dressing-growth check reporting samples
  [0,0,0,0,0], i.e. a measurement that collected NOTHING rather than a real growth
  reading (the same class as points 292/334/304 — the check, not the product). Fix these
  four first: they are what stands between the suite and the flake-free closing gate.
  REMAINING drama flakes still rotating (cushioned by the retry, to root-cause
  for the closing's strict 3x gate): point-102 vicinity count, plover 145b,
  calf-play, parent-guards-calf, the crocodile-spawn cluster. NEW SITES seen in
  the 25.07 quiet-machine LARGE (point-309 re-validation): flow's FIRST
  navigation `networkidle` wait times out on a cold dev server (failed twice in
  the LARGE, then 31/31 green on an isolated retry — wait for the app's own
  ready signal instead of networkidle); rotating one-off reds in enrichments:
  the crocodile eye-knobs check (274), the STAGED parent-sacrifice calfFreed
  flag, and the 121f drawn-predator (each red exactly once across two tries).
  PROGRESS 22.07: the lone-scavenger-185 landing is now DETERMINISTIC (commit
  f76dc3d) — before polling, remove other carcasses from its target pool + shove
  nearby live animals clear + commit the bird to the injected carcass. CLOSING
  NOTES for the others (do NOT repeat these dead ends): (a) the vicinity-102
  budget must NOT simply be widened — MORE sim time lets the seeded grazers
  WANDER out of the leave-point radius (the code comment says exactly this), so a
  bigger budget is counterproductive; fix by counting from the settlement ANCHOR
  (where the seeder guarantees the min) or by pinning the count to the immediate
  post-leave moment. (b) calf-play (samples:0): a calf gambols only ~25% duty
  (GAMBOL 4s/16s) AND canPlay needs no active lion + calf near its parent (not
  play-locked) + a CALF_HUNT_SPECIES; force a young calf beside its parent with
  playLock cleared so it stays play-eligible through the poll. (c) plover-145b
  (dead:true): the bird dies before its broken-wing act — keep it alive / force
  its lure state. TRIPWIRE-TRANSIENT
  ROBUSTNESS (for the closing's 3× flake-free): the point-203A anchoring tripwire
  intermittently fires ONE console-error per several enrichments runs on a rare
  1-frame anchoring transient at a state transition — observed a floating
  wildebeest and a buried shore-seeded drinker at the waterline, different each
  run, none reproducible, imperceptible at 60 fps. The tripwire samples per
  frame, so it catches the single transition frame before the next frame
  corrects. FIX for the closing: make the tripwire tolerate a 1-frame transient
  — only console.error when the SAME animal violates on 2+ consecutive
  assert-visits (a per-animal strike counter), so a persistent float (a real
  bug) still fails loudly while a one-frame spawn/drink/shore-seed transition
  does not. Do this as part of the closing prep so the LARGE gate can reach 3×
  clean.
  OBSERVED 22.07 (a WebGL enrichments run during the 210b work): 207 pass, 2 fail,
  0 console-errors — both KNOWN rotating staging flakes, cushioned by the retry:
  (1) plover-145b again `dead:true` (the bird died before its broken-wing act —
  the documented cause above); (2) the point-129 witness "a tree contact blocks
  the entry but leaves N/S/W free" with `reached:false` (minDist 1.41, N/S/W all
  ~2.2-2.4 free) — a NEW entry for the rotating-flake list: the driven post-
  collision move did not COMPLETE in the frames allotted (the 200 SIM-clock class,
  not a real collision bug — the free directions are all open). ADD to the
  closing root-cause set: poll the point-129 driven move on the SIM clock / its
  own arrival condition rather than a fixed frame budget. The point-102 vicinity
  check (this session's anchor fix) PASSED first try, confirming that fix.
  OBSERVED 24.07 (a WebGL enrichments run under CPU overload during the 278
  verify): the point-121 check "a feed that ends without a kill leaves no remnant"
  failed `{deadBefore:4,deadAfter:5,calfAlive:true}` — a NEW rotating-flake entry.
  It counts GLOBAL dead animals over a 2.5-sim-second window during which OTHER
  dramas keep running, so any unrelated concurrent predation in that window fails
  it even though the STAGED feed left the calf alive and no remnant. Confirmed a
  load flake, not a real bug: the same check PASSED on a quiet-machine re-run
  (222 pass, 0 fail). ROOT-CAUSE FIX for the closing: scope the assertion to the
  staged feed — count only deaths of the feed's own actors (or freeze other hunts
  for the window), not the global dead-count, so a concurrent drama can't fail it.
  LESSON reinforced (memory `verify-suites-need-a-quiet-machine`): never run a
  verify suite while a worktree agent builds — evaluate a red only on a quiet box.
  OBSERVED 05.08.2026 (a WebGL enrichments run on the Linux container host, while
  closing point 489): first try 243 pass / 2 fail at the point-119 trampling and the
  point-128 scavenger-drama checks, green on retry (245/0) — neither in that diff's
  touch set, so a THIRD and FOURTH rotating site on this host. The same day, under
  load, the point-278 dressing-growth check read `{samples:[0,0,0,0,0]}` — the
  `__sleepSim(6)` settle elapsed with too few frames for the streamer to populate the
  desert anchor, so `liveInstances()` legitimately read 0; on a quiet machine the same
  check reads `{samples:[18,18,18,18,18]}` and passes. That is this point's pattern (1)
  exactly: a streaming behaviour measured against a settle rather than against its own
  condition. Fix it by polling until the anchor's instance count is non-zero, not by
  lengthening the settle.
  MEASURED AGAIN 17.08.2026 ON MAIN, and it is no longer only a branch's problem: the same
  check read `{samples:[0,0,0,0,0]}` TWICE in one enrichments run on a feature branch and
  then again on plain `main` in a section-only run — same numbers every time, no rotation.
  Two agents were building during all three, so the quiet-machine reading that would tell
  the known load flake apart from a DEAD streamer is still owed, and it is the deciding
  measurement: `{samples:[18,…]}` confirms the flake and the poll fix above, another
  `{samples:[0,…]}` on a quiet box means the desert anchor streams nothing at all any more,
  which is a player-visible regression of the §19.9 dressing and belongs in its own point
  rather than here. Take that reading before touching the check.
  THE ROTATING FAMILY HAS THREE NAMED MEMBERS, all still open (carried 20.08.2026 from the
  10.08.2026 four-eyes work-order analysis, which proposed folding them here): point 336
  (the crocodile staging family, four consecutive runs each failing a different check),
  point 568 (the polish water-sameness check, red then green at the identical commit and
  seed) and point 570 (the children-photographable check, red on `main` and green twice on
  the same change). 336 and 570 already name this point in their own text; 568 did not, and
  now does. They stay separate points because each has its own suspected cause, but they
  are ONE measurement: the quiet-machine repeat run this point owes is taken for all four
  at once rather than paid three more times.
  NARROWED 16.09.2026 (point 1137's covering both-backend LARGE, quiet machine, merge
  candidate 154b54c15, WebGL 2 lane): `flow` is now THE red that stops a both-backend
  LARGE dead. It failed BOTH attempts with `page.reload: Timeout 30000ms exceeded`
  waiting for `networkidle` (`scripts/verify/flow.mjs:118`, the reload AFTER
  `localStorage.clear()`), printed 0 pass / 0 fail and no named check, and the runner
  classed it UNCLASSIFIED — so the charge table cannot match it and the run closes "own
  or unresolved". Because lane 1 went red the run NEVER PROCEEDED to the WebGPU lane:
  while this stands, no single invocation can produce a both-backend picture, which is
  exactly what the release proof needs. That makes this the most valuable of the flake
  sites above, not merely the most reproducible.
  WHAT THIS RULES OUT: the cause documented in flow.mjs' own header comment — the Kokoro
  model download holding `networkidle` open — does NOT apply here. The TTS cache was
  COMPLETE in that worktree (`.cache/tts/.complete` present, 14 files), so
  `installTtsCache` ran strict and served from disk rather than reaching the CDN. The
  documented fix is already in place and the suite timed out anyway; look past it. The
  fix this point already names stands and is cause-independent: wait for the app's own
  ready signal instead of `networkidle`.
  OBSERVED 26.09.2026 (closing LARGE, WebGL 2, main 2a617300a): communication
  `continuous-route` "Three dig initiators lapsed without their invitation" (invitation emitted
  unheard) and the point-121 remnant check again (`deadAfter:2`, calf alive) — both green alone
  on a quiet machine at 487ad8d4f; charged here as rotating-flake entries.
   OBSERVED 18.11.2026 (full enrichments run, WebGPU, feat/336 5f15007e4, 31 min, log
   2026-11-18T02-22-27-712): 8 reds that are green in isolation — burning-grass flame/smoke
   luminance, calf-predation-drama living shield (2), elderly-natural-death giraffes out of
   frame, calf-crossing-flee arrival variant, bird-flight-escape (flamingo flight, take-off
   frame, peregrine). burning-grass and calf-predation-drama run before the only changed block,
   so not the crocodile rebuild. Suspect: state leaking between sections on the shared page, or
   run-time load (31 instead of 16 min).

- [ ] 422. The beginner guide is full, and four lessons are still outside it
  (29.07.2026, found while doing the guide review the currency guard demands).
  `docs/analysis_de/vibe-coding-anleitung.md` sits at EXACTLY its budget — measured
  13.08.2026, 415 lines of 415 and 3677 words of 3677 (`scripts/guide-brevity-core.mjs`).
  The gate is right to hold it there: a beginner guide that grows without bound stops being
  read, and a full guide makes every new lesson pay for its place. FOUR lessons are still
  waiting, and each is a pitfall in the guide's own form:
  (A) changing WHERE or HOW something is delivered does not carry the old path's guarantees
  along, and what no test pins falls away SILENTLY — the page still loads, the tests stay
  green, only a promise no longer holds. Point 419 measured four such losses from one move.
  Its special case: logic living in a file version control does not track, which no test and
  no second model can see.
  (B) a mechanism defeats itself as soon as the rule is followed exactly (13.08.2026,
  retrospective §3.116): the handover's own prescribed follow-up counts as work and deletes
  the marker it just wrote — three times in one day — and a guard asked by hand, as the rule
  demands, blocks forever on an stdin that only the automatic call supplies. The test question
  belongs in the guide: what happens when someone follows the instruction to the letter, and
  what when they additionally invoke it by hand?
  (C) two rules block each other, so the helper can neither act nor stop (19.08.2026, the
  mechanism half is point 751): what one rule demands at the exit is what another forbids,
  and the helper repeats the same refusal instead of getting out. Its prompt: every lock
  needs an exit no other rule takes back — and if you find yourself repeating, that
  repetition IS the finding, not the answer. The entry is owed in FOUR lines: written out
  once, it cost 5 lines and 79 words over the budget and was taken back out because
  `guide-brevity-core.test.mjs` was the unit layer's only red and blocked every push — which
  is this point's forcing function doing its job, not a reason to skip the lesson. The
  reverted wording stands verbatim in commit 9b484e41 and is the draft to fold in, not to
  invent a second time.
  (D) a bar meant to stop a rejected state from returning was calibrated on the author's OWN
  intended layout and was therefore satisfied by exactly that rejected state (27.08.2026,
  retrospective §3.202, points 967/969): "at most two content rows" is what the rendering the
  user had rejected spends. A check derived from the intended solution measures the author's
  intention and not the user's complaint; it is compatible by construction with every rendering
  its author thought right. Its prompt belongs beside the existing »Fehlalarm behoben« entry,
  which is the same subject from the other side: calibrate a bar against the REJECTED state, and
  treat it as unfinished until a control that RESTORES that state fails it.
  DECIDE AND DO, in this order: (1) read the guide whole and judge which existing entry is
  now the WEAKEST — the budget is a forcing function, so a new lesson earns its place by
  displacing one, not by widening the frame; (2) for (C) the cheapest displacement is
  already identified: MERGE it into the existing »Die Grenze spricht erst beim Aufhören«
  bullet, which is the same subject seen from the other side, and pay for the merged entry
  by tightening ~40 words of the neighbouring bullets; (3) only if genuinely nothing is
  weaker and nothing merges, raise both budgets deliberately in `guide-brevity-core.mjs`
  with the justification in the same commit, the way the doc-budget ceilings are raised —
  this is the LAST resort, not the first; (4) either way the new pitfall goes in with its
  prompt, in the guide's established form.
  VERIFIABLE: `scripts/guide-brevity-core.test.mjs` stays green (the real guide inside its
  budget), the guide contains the new pitfall, and `node scripts/retro-refresh.mjs
  --guide-reviewed` is re-attested afterwards.
  STRUCK 20.08.2026 (work-order review): the deadlock premise — "two mechanisms pulling
  opposite ways, with no path through". Two things took it back. The user withdrew the
  escalation generally on 10.08.2026 (point 621: where no tightening of comparable value
  exists, RAISE the ceiling in the same commit and justify it there), so step (3) above is
  a decision we may take rather than a question that stalls; and the path was walked this
  morning — commit 77d34781 paid a new pitfall out of six neighbouring entries instead of
  out of the ceiling. The 13.08. measurement is stale with it: the guide stands at 413 of
  415 lines and 3556 of 3677 words (measured 20.08.2026), so a small entry fits today
  without displacing anything. Everything else here holds: the lessons are still out
  of the guide, and (1)–(4) are still the order to work them in.
  NOTE: the guide currency was attested on 29.07. against the sources of that day; the
  review found this gap and could not close it, which is what this point exists for.
  ALSO OWED HERE (27.08.2026, found while landing point 969). Commit `2dbce90f` — the one that
  delivered lesson (A) into the guide and the retrospective — is already on `main` and carries a
  recorded DO-NOT-MERGE from GPT-5.6 Sol: a false-refusal imperative, no semantic enforcement of
  the new rule, and no retrospective edit. Nothing answered it, so `mechanism-review-guard`
  raises it at EVERY turn end, and until it is answered the rule COUNTS as enforced while it is
  not — which is the state that guard exists to prevent. Answer the three named defects and
  record the re-review at a commit that DESCENDS from `2dbce90`; a verdict on work that does not
  contain the fix answers nothing. This is part of the same guide work, so it is done in this
  point rather than in one of its own.

- [ ] 531. The spec documents still describe the old bird's-eye collision (found
  06.08.2026 while closing point 299, escalated by the building agent rather than
  guessed around). Point 299 added a settlement footprint to the bird's-eye
  collision and made a debug jump to an enterable place ENTER it, but the spec still
  describes the state before it.
  RE-MEASURED 20.08.2026, AND TWO OF THE THREE NAMED PASSAGES HAVE MOVED OR GONE.
  What still stands, unchanged: `design.md` §11 names the bird's-eye colliders as the
  large solid dressing (trees and boulder piles) and the wildlife only, with no
  settlement footprint. STRUCK is the `CLAUDE.md` §7.1 point 4 half — after the
  20.08.2026 cut that criterion carries only the pointer to `design.md` §11.1/§11.2
  and no "trees and animals" wording at all. The wording did not disappear, it MOVED:
  `docs/acceptance-criteria-detail.md` §4 now carries it, and that copy still omits
  the settlement footprint, so the third target is that file, not `CLAUDE.md`.
  ALSO STRUCK is the §21.3 premise: the jump-to entry there describes the picker's
  grouping and sorting and says nothing at all about which view a jump lands in, so
  there is no false claim left to correct — only the missing statement of the rule.
  FINAL STATE: `design.md` §11 names the settlement footprint among the bird's-eye
  colliders with its one-way rule, §21.3 states that a jump to an ENTERABLE target
  enters it while a jump to any other target stays a bird's-eye jump, and
  `docs/acceptance-criteria-detail.md` §4 matches. The evidence chain
  (`docs/acceptance-evidence.md` §4) was updated with point 299 and is correct.
  THE BUDGET STILL BLOCKS design.md, which is why this was not done in the same
  commit: re-measured 20.08.2026 it stands at EXACTLY its ceiling in
  `scripts/doc-budget-core.mjs`, 850 of 850 lines and 28,488 of 28,488 words, so not
  one word of the correction fits. `docs/acceptance-criteria-detail.md` has 2 lines
  and 17 words of room, which the shorter half may fit into. The words are won back
  by TIGHTENING prose in the same files — per the standing rule a blocked budget means
  shorten or merge, and raising a ceiling is the last resort and needs the user's
  agreement. If no tightening of comparable value is found, the point ESCALATES the
  ceiling question to the user instead of silently raising it.
  VERIFIABLE: the doc-budget guard green with both passages present;
  `scripts/verify/docs.mjs` no worse than the state its own filed point already
  records; a grep for "trees and animals" finds no bird's-eye collision passage that
  omits the settlement.

- [ ] 532. The collision suite counts a different number of checks every run
  (found 07.08.2026 while merging point 349). Three runs of `collision` against the
  SAME tree (`main` 72fe646a) reported 19, 24 and 25 checks: the 24-check run failed
  `PoC village: the teaching stone is in the layout — null` on both its try and its
  retry, the 19-check run never ran that check at all and went green, and WebGPU
  reported 25 green. So a green `collision` run does not prove the coverage the
  previous green run had, and a real teaching-stone defect disappears by itself on
  the next run. This is the class of the closed point 404 — a passing count over a
  set that silently shrank — one suite further on, and it defeats the flake policy
  too: "the same check failed twice" cannot be judged when the check is not always
  asked.
  FINAL STATE:
  1. The suite's check SET is deterministic: the same tree asks the same questions
     every run, on both backends. Whatever the suite currently picks procedurally —
     the evidence points at WHICH settlement it reaches for, and whether that one
     happens to carry a teaching stone — is chosen from a pinned seed or iterated in
     full, not sampled.
  2. A check that cannot run REPORTS that it did not run, as a named skip with its
     reason. A silently absent check is the defect here; a loud skip is not.
  3. The run's summary states the expected check count beside the actual one and
     FAILS when they differ, so a shrunken set is a red rather than a smaller green.
     Where the count is legitimately variable, the pinned expectation says so with
     its range and its reason.
  4. SETTLE THE TEACHING STONE FIRST, because the answer decides (1): is the stone
     optional in the PoC village by design, or was it missing when the 24-check run
     read `null`? If it is genuinely sometimes absent, the check states the
     precondition and skips loudly per (2); if it must always be there, the null is
     a product bug and is fixed here.
  VERIFIABLE: pure Vitest over the suite's check registry where the choice is
  derivable, plus three consecutive `collision` runs on a quiet machine — WebGL 2 and
  WebGPU — reporting the SAME check count, and a deliberately removed check turning
  the run red instead of shrinking it.

- [ ] 607. The evidence for criterion 20 names a control count that is two dozen short
  (found while delivering point 605). `docs/acceptance-evidence.md` §20 states that the
  completeness test pins "132 controls"; the debug menu now carries 158. The number was
  right when it was written and has not been maintained since, which makes the evidence
  chain read as current while it is not.
  FINAL STATE: the count is not written in prose at all. §20 names the TEST that pins the
  completeness (which is what actually holds the property) and states the count only
  where a machine keeps it true — or, if the number stays in the document, the sync test
  that already guards `docs/graphics-detail-levels.md` gains the same duty for this
  figure, so a drifted count fails the unit layer instead of quietly aging. The rest of
  `docs/acceptance-evidence.md` is swept for the same class of hand-maintained number in
  the same commit.
  IT DRIFTED AGAIN, measured 20.08.2026 (carried from the 10.08.2026 four-eyes work-order
  analysis, not a fresh finding): `docs/acceptance-evidence.md` §20 now reads "a COMPLETENESS
  pin names all 165 controls" where this point quotes 132 and the menu carried 158 when it
  was written. Three figures for one hand-maintained sentence, in ten days — which is this
  point's own thesis with a third data point under it. The fix is not to write 165 there;
  it is to take the number out of the prose or put a test in charge of it.
  VERIFIABLE: Vitest — the guard fails on a deliberately wrong count and passes on the
  real one; `npm run test:unit` green.
  Criticality: low — a documentation defect, but in the file the closing run reads as
  proof.

- [ ] 609. The proof guard is built, taught and wired to nothing (found 10.08.2026 by the
  second model while clearing point 594). `scripts/point-proof-guard.mjs` refuses the tick of
  a point whose `PROOF:` line has not run at the current HEAD — the mechanism exists, has a
  register, a `--status` and a CLI, and point 594 just taught it to recognise the landing
  command. It has NO hook entry in `.claude/settings.json`. Its PreToolUse mode therefore
  never runs: no `PROOF:` line has ever been demanded of anyone, and 594's teaching bites
  only once somebody arms it. This is the retrospective's lesson "built, tested, documented — and
  put in nobody's way" again, in the one family whose whole purpose is to be in the way.
  FINAL STATE:
  1. The guard is ARMED in `.claude/settings.json`, in the PreToolUse chain beside the other
     tick gates, and a run proves it fires: a point carrying a `PROOF:` line cannot be ticked
     until its command has run at HEAD, and one without such a line is untouched.
  2. WIRING IS ATTENDED WORK — `.claude/settings.json` prompts on every edit, so this point is
     done in a session with the user present, not by a delegated agent.
  3. THE CLASS, NOT THE CASE: every guard the repository ships is checked for the same gap.
     `scripts/guard-inventory-core.mjs` already knows the inventory — it gains the question
     "is this guard reachable from the settings chain at all?", and an unwired guard is named
     loudly rather than counted as present. `guard-health-guard` carries the verdict, so the
     next one cannot sit unwired for a month.
  CARRIED FROM THE 10.08.2026 four-eyes work-order analysis (not a fresh finding), which
  judged this point a fold into point 542 — and 542 has since landed. RE-CHECKED
  20.08.2026: `point-proof-guard` is named in `.claude/settings.json`,
  `INTENTIONALLY_DORMANT` in `scripts/guard-health-core.mjs` is empty again, and item 3 is
  built as well — `scripts/guard-inventory-core.mjs` raises an `orphan` finding for an
  enforcer-named script no hook and no git hook names, with its Vitest case in
  `scripts/guard-inventory-core.test.mjs`. What is left of this point is item 1's LIVE
  proof alone: a recorded run in which a point carrying a `PROOF:` line is refused the tick
  until its command has run at HEAD, and one without such a line is ticked untouched.
  VERIFIABLE: Vitest — the inventory check fails on a fixture whose guard has no hook entry
  and passes when it has one; plus the recorded live proof of 1, since an armed hook is the
  one thing the unit layer cannot demonstrate about the real settings file.
  Criticality: medium — nothing the player sees, but it is a gate everyone believed was
  closed, and the belief is what made it worth nothing.

- [ ] 611. The fence test tolerates what it claims to forbid (four-eyes finding on point
  604, 10.08.2026). `src/scenes/place/layout.test.ts:664` asserts that no dwelling grows
  through a fence with `toBeGreaterThan(-0.5)`, while the worst real case — the tuareg
  camp's tent through its own windbreak — measures -0.463 m: 3.7 cm of headroom, no comment
  naming what is tolerated, and a test name that claims more than it enforces. The measured
  field (second model, 10.08.2026): tuareg -0.463, maasai +0.04, somali +0.06, pedi +0.12,
  zulu +0.17. They are open wedge corners rather than closed pockets — a player backs out
  the way he came — which is why 604 shipped without them, but a silent threshold is how
  the next real crossing arrives unnoticed.
  FINAL STATE: either the tuareg camp is seated so its tent clears its windbreak like every
  other plan, or the tolerated case is NAMED in the test — the specific plan, the measured
  value and why an open corner is acceptable — with the threshold set just past the named
  case rather than at a round number, so a NEW crossing fails even while the old one stands.
  The other four plans are asserted positive, not merely above -0.5.
  VERIFIABLE: Vitest — the named case passes, a deliberately worsened plan fails, and the
  four clear plans are held above zero.
  Criticality: low — nothing traps the player today, but the assertion is the one thing
  standing between a future crossing and the picture.

- [ ] 498. What the software second lane costs the full regression, measured
  (user 04.08.2026, asking against the open decision "Zweite Bahn läuft in
  Software — reicht das?"). Point 493 restored both lanes and measured ONE
  suite: `flow` runs 58 s on the hardware WebGL lane and 3 min 41 s on the
  software WebGPU lane, a factor of 3.8. What nobody has measured is the number
  the user actually decides on — the WHOLE regression. A LARGE run is two passes
  (the full set on WebGL 2 with preflight and prod preview, then every suite
  except `touch`/`voice` on WebGPU), so the software lane is not a small tail:
  it is a second near-complete pass at software speed. The pre-container figure
  on record is "30–40 minutes" (`docs/batch-resilience.md`), taken on Windows
  where BOTH passes had the GPU.
  FINAL STATE:
  1. One LARGE run on `main` is timed end to end, and the two passes are timed
     SEPARATELY — the WebGL pass and the WebGPU pass — because only the split
     shows what the software lane costs and what the GPU gained.
  2. `docs/host-environment.md` records all of it beside the existing per-suite
     figures: the two pass durations, the total, the 30–40 min Windows baseline
     it is compared against, and the date and machine state of the run (a
     measurement taken under a running agent pool is worth less, and says so).
  3. The comparison is stated HONESTLY in both directions: the WebGL pass is
     faster than it was on Windows, the WebGPU pass slower, and the answer to
     "is the total worse than before" follows from the measured numbers rather
     than from the factor 3.8 extrapolated.
  4. The measured total is carried onto the open decision card, so the user
     decides against a number rather than an estimate.
  5. THE MACHINE STATE IS PART OF THE NUMBER (user 05.08.2026). The host carried
     other load through the morning, so a run taken then is a SECURED UPPER BOUND
     and is labelled as one wherever it is written down. An upper bound settles
     the question only while it stays BELOW the 30–40 min Windows baseline; above
     it, the run is repeated on a quiet machine before any verdict is drawn.
  6. The software-lane premise is gone (point 505): the WebGPU pass now draws on
     the card at 0.73× the WebGL lane's rate rather than the software lane's 0.26,
     so the factor 3.8 is history and the measurement records what REPLACED it.
  VERIFIABLE: `docs/host-environment.md` names both pass durations, the total
  and the baseline with its date; the run's own log is quoted for each figure;
  and no figure in that section is an extrapolation — every one is a wall-clock
  reading of a run that happened.

- [ ] 514. The compatibility lane has two reds the WebGL lane does not (measured
  05.08.2026 on `main`, both lanes run minutes apart on the same machine, right
  after the lane moved onto the card in point 505). `enrichments` on the WebGPU
  compatibility lane died twice for different reasons — run 1 after 157 green
  checks with `page.evaluate: TypeError: Cannot read properties of undefined
  (reading 'herdsRef')`, i.e. `window.__wildlife` was gone at the moment of
  access; run 2 with `frame 72-water-victoria-falls — its subject is not in the
  rendered picture`. The SAME suite on WebGL 2, twice, showed neither: 244 pass
  and only the measures-nothing dressing flake point 200 already lists. The lane
  is now the project's second evidence lane, so its own faults have to be
  separated from the product's.
  FINAL STATE:
  1. The herdsRef red is CLASSIFIED, on a quiet machine, as either a lane fault or
     a product defect — the suspicion is recorded so nobody re-derives it: the
     dev hook is deleted on unmount and the compat lane builds the scene on a
     different schedule, so the access may fall into a window the suite does not
     wait through.
  2. What turns out to be the suite's own timing is fixed at the READINESS, not
     with a longer wait: the access waits for the hook the same way the boot
     sequence does.
  3. What turns out to be a product difference between the feature levels is
     stated in `docs/host-environment.md`, so a reader knows which lane can carry
     which verdict.
  4. Nothing here weakens the shutter: a frame whose subject is not in the picture
     stays a failure — the point fixes the cause, never the assertion.
  5. `settings` belongs to the same classification (measured 06.08.2026, twice):
     on the compatibility lane every check that switches TRAA OFF fails, because
     the MSAA path it falls back to cannot exist there — `RGBA16Float does not
     support multisampling` arrives as an uncaptured GPUValidationError and the
     scene then renders black (mean 2.2). WebGL 2 passes the same suite 52/0
     minutes apart. If that is structural, the host-environment section says so
     and the lane's verdict for MSAA checks is recorded as unavailable rather
     than red.
  6. IT IS NO LONGER ONE SUITE'S PROBLEM (09.08.2026, two delegated agents
     independently, on different branches and on the merge-base): the same
     `RGBA16Float does not support multisampling` and the same black frames now
     stand between every RENDER point and its merge, because CLAUDE.md §6 demands
     the picture proof on BOTH backends where they can differ. `baseline-classify`
     labels 16 of 17 `settings` failures pre-existing, WebGL 2 passes the same tree
     59/1 with no console error — so the product is not what is red, the lane is.
     Until this point closes, a render package can be verified on WebGL 2 and its
     WebGPU half is OWED, and that owing is stated at the merge rather than passed
     over in silence. This is what raises the point's urgency; it changes nothing
     about what it must deliver.
  7. A SECOND, CHEAPER DEFECT OF THE SAME FAMILY, found while chasing the first:
     `bootGame` in `scripts/verify/_boot.mjs` calls `webglLaunchOptions` WITHOUT the
     environment, so the Gallium pin never lands and any probe built on that boot
     renders a BLACK canvas while the real suites render the game. It cost one agent
     two probe runs and it is exactly the shape that gets misread as a product
     defect. Fixed here, with a pure test that the boot's launch options carry the
     pin.
  NARROWED 20.08.2026: the SECOND red, `frame 72-water-victoria-falls — its subject
  is not in the rendered picture`, leaves this point and is CHARGED to point 521,
  which carries the same frame id and, unlike this point, a MEASURED cause for it:
  `debugJumpTo` sets the position instantly while the travel camera springs, and the
  shutter then fires after a fixed 1500 ms. Struck with it is this point's guess that
  the falls frame sits differently because the compatibility lane forces MSAA off —
  that guess was never measured, and a measured cause outranks it. Nothing else moves:
  the herdsRef red, the `settings`/MSAA classification of items 5 and 6 and the
  `bootGame` pin of item 7 all stay here.
  THE LANE IS HARDWARE-BACKED AND RUNS AT COMPATIBILITY LEVEL, measured 20.08.2026 at
  `622f5113` with `node scripts/verify/backend-lane-check.mjs` (carried from the 10.08.2026
  four-eyes work-order analysis, which asked for exactly this measurement): both lanes draw
  the game through `ANGLE (Microsoft, D3D12 (NVIDIA GeForce RTX 4070 Ti))`, and the WebGPU
  chain reports `level=compatibility`. That is the answer item 5 was waiting for — the
  missing multisampling is the compatibility branch three.js takes, not a slow or software
  device — so it IS structural, and the consequence is bigger than one suite's verdict: this
  lane is coverage of the WebGPU code path and NOT of the core path a player with a full
  WebGPU device gets. The host-environment section says it in those terms, so a reader knows
  which verdict the lane can carry.
  VERIFIABLE: `enrichments` and `settings` run green twice in a row on the
  compatibility lane on a quiet machine, or the host-environment section names the
  difference that makes it structurally impossible there. Plus: a probe built on
  `bootGame` renders the scene, not a black canvas.

- [ ] 521. The enrichment suite aims by stopwatch and aborts before its own
  EVIDENCE (found 05.08.2026 while closing point 323). `scripts/verify/
  enrichments.mjs` jumps the traveller with `debugJumpTo` — which sets the
  POSITION instantly while the travel camera SPRINGS toward it — and then waits a
  fixed 1500 ms before shooting. Whether the camera has arrived is therefore a
  question of frame rate: on a loaded machine, or on the slower backend, it has
  not, and `72-water-victoria-falls` fails "subject not in the picture". The
  failure is not cosmetic — it ABORTS the run before frame 137, the picture the
  blood-stain criterion is judged by, so a green product looks red and its evidence
  never gets taken. Measured: four such aborts on WebGPU under load, 245/245 green
  on the same tree once the machine quietened.
  Measured a third time on the WebGPU COMPATIBILITY lane (05.08.2026, charged here
  from point 514 on 20.08.2026): the same `72-water-victoria-falls` frame missed its
  subject there while the WebGL 2 run of the same suite, minutes apart, did not.
  FINAL STATE: the wait after a jump POLLS the camera having arrived — the spring's
  own settle, read through the existing `window.__camera` projection the shutter
  already uses — instead of counting milliseconds, with a stated timeout that fails
  with the measured distance still to go. `scripts/verify/fixedWaits.test.mjs`
  already forbids fixed waits in the verify scripts; this one survives because it
  is written as a bare `waitForTimeout` the rule's pattern misses, so the rule is
  widened to catch it in the same pass.
  THE SAME CLASS IN `polish`, measured 06.08.2026 while closing point 480: the tag
  frame's standpoint took FOUR iterations to find (a tree and an empty paddock, two
  children behind an adult, a hut wall filling the screen), and a fresh run on the
  other backend still wrote a frame with the chase pair NOT in it while every tag
  check passed — so the aim is fragile in both suites, and a frame can miss its
  subject without anything failing. The frame that carries the criterion is
  additionally shot from beside a hut whose unlit side fills the picture's left
  quarter: legible, but the standpoint is chosen by luck rather than by a rule.
  The aim therefore belongs where the shutter can judge it — the subject
  declaration (§7.2, point 375) names the PAIR, and the shutter refuses the frame
  when it is not drawn, instead of the script hunting for a standpoint by hand.
  VERIFIABLE: pure Vitest that the fixed-wait rule flags this shape, and the
  enrichments suite green on BOTH backends on a machine that is deliberately busy;
  for the tag frame, a run whose standpoint misses the pair FAILS instead of
  writing the frame.
  FOLDED IN FROM POINT 572 (measure 11, "the capture is deterministic, or the attempt is
  abandoned"): the settled camera is this point's own subject, so the rest of that measure
  is delivered here rather than by a second owner of the capture path. Beyond the poll,
  the PRNG is seeded and the timestep fixed exactly as in the F8 benchmark, and
  `node scripts/picture-stability.mjs` is RE-MEASURED afterwards — point 375's shutter
  closed part of this and the stability has not been re-measured since. The extension
  carries its own ABORT criterion: if the noise floor does not fall below the smallest
  real defect (0.75 %), the investment is written off and recorded as such in
  `docs/picture-check-levers.md`, which is a result, not a failure. Nothing diff-based is
  enabled by this point itself.

- [ ] 548. The panorama band's two review observations (second model, 07.08.2026; it
  judged BOTH as non-blocking and asked for them as their own point rather than as
  argument). (a) THE ONCE-PER-SESSION CAPTURE TARGETS DO NOT SURVIVE A RENDERER
  RECREATION. `src/scenes/travel/panoramaCapture.ts` holds `targets` module-global, and
  the band is GPU-initialised by one clearing pass on whichever renderer was live at the
  FIRST capture. `WebGLTextureUtils.copyTextureToTexture` destructures the destination's
  `textureGPU` with no lazy init, so a NEW renderer — a context loss, a canvas remount —
  would copy into an uninitialised texture and the empty band of point 545 returns
  SILENTLY, with every check green. Unreachable today (one renderer per app lifetime,
  context loss unhandled app-wide), which is why it is low: the capture is no worse off
  than the rest of the game. Remedy: re-run the band's init clear when the renderer
  identity changes, and pin the identity check in the pure layer.
  (b) THE ENTER-SIDE FIRST-CAPTURE STALL HAS NO BUDGET GATE. `withSynchronousPipelineCompile`
  costs a measured ~3.4 s in ONE frame for the first capture on the slow WebGL 2 lane
  (~0.2–0.4 s warm, none on WebGPU), and it lands on the APPROACH into a settlement —
  a path every player on the fallback backend takes. Point 96's fluidity check bounds
  the LEAVE only (`scripts/verify/polish.mjs`), and the capture fires outside its
  measured window, so nothing today would notice that cost growing. It is bounded,
  once per session and honestly documented — a hitch, not a hole — but this project
  enforces rather than remembers. Remedy: a measured budget on the enter transition
  the way `balance.startup.pictureFreezeBudgetMs` bounds the startup standstill,
  calibratable and debug-editable like its sibling.
  FINAL STATE: a renderer recreated mid-session gets a correctly initialised band rather
  than a silently empty one, and the enter-side capture stall is bounded by a check that
  fails when it grows.
  VERIFIABLE: a Vitest case for the renderer-identity re-init, and a browser check that
  measures the ENTER transition the way point 96 measures the leave.
  Criticality: low — neither is reachable or harmful today; both are the kind of thing
  that stays invisible until the day it is not.

- [ ] 563. The tag frame's new readability judge has three soft spots (four-eyes
  review of point 524 by the second model, 08.08.2026, verdict merge; bundle
  Testinfrastruktur). `scripts/verify/tagFrameReading.mjs` decides whether the
  village-tag evidence frame readably shows both children, and it was accepted as
  correct — its 67 px floor is genuinely derived from the figure's own geometry and
  its Vitest pin goes red without a browser. Three findings are recorded rather than
  fixed in that merge, because none of them is the failure the point closed and each
  needs its own measurement.
  FINAL STATE:
  1. THE OCCLUSION BAND STILL ADMITS A HUGGING OCCLUDER. A hit is counted as the
     child itself while it lies within ±15 % of the child's distance, so a surface
     roughly 0.8 m in front of the pair at a 5.5 m stand reads as the child at every
     sample: `occluded` stays 0 and `confirmed` reaches 5 while a human sees a rock.
     The probe names what it hit (`hitName`), and the verdict uses that name — a
     sample confirms the child only when the thing hit IS the child — so the distance
     band stops being the sole evidence of identity.
  2. THE FLOOR IS TIED TO A GEOMETRY NOTHING PINS. `KID_HEIGHT` and `KID_BODY_WIDTH`
     mirror the rendered figure (`src/scenes/place/PlaceLife.tsx`, `src/render/
     figures.ts`) by hand; a future change to the figure silently invalidates the
     derived 67 px without any test noticing. A Vitest sync test derives both from
     the figure source and fails when they drift apart — the same shape as the
     existing quality-doc sync test.
  3. A RED RUN NAMES THE WRONG STANDPOINT. In `scripts/verify/polish.mjs` the
     diagnostic calls its report the "best read" while the variable it prints is
     overwritten by every failing bearing, so a red run hands the reader the LAST
     bearing tried instead of the best one seen — the reader then investigates a
     standpoint that was never the near miss. The reported reading is the best one
     by the judge's own ranking, or the message says plainly that it is the last.
  VERIFIABLE: pure Vitest — a reading whose confirming hits are all a foreign object
  is rejected (1); the sync test fails on a deliberately altered figure constant (2);
  the diagnostic picks the best of a series of failing readings, not the last (3).
  No browser run is needed for any of the three.

- [ ] 564. "Candidate real failure" is asserted with confidence the run did not earn
  (measured 08.08.2026, 18:22Z). The retry classifier calls a check that fails in BOTH
  runs a "CANDIDATE REAL FAILURE" and names the diff words it touches — here `polish`
  "settlement walker (goat): the planted foot holds its ground spot (point 300)", twice,
  with the note "[touches the diff: goat, foot, hold, point]" against a change that only
  attached a metadata field to that group. Re-run on a quiet machine 100 minutes later,
  same code: `polish` 164 pass, 0 fail, FIRST try. The failure was machine load, and the
  classifier had already said so in its own log — the point-296 quiet-machine check ran
  at the top of that same run and reported "MACHINE STATE UNKNOWN: GPU load NOT measured
  (no GPU busy counter on this host)". The two verdicts never meet.
  WHY THE HEURISTIC IS WRONG HERE, precisely: it reads a repeated failure as evidence of
  a real defect because a FLAKE is assumed to rotate. Load does not rotate — a check that
  measures a RATE (frames, stance intervals, settling) fails deterministically for as long
  as the machine is busy, so the very checks most likely to be load-victims are the ones
  the heuristic is most confident about. The diff-word match compounds it: matching on
  "goat, foot, hold, point" against a spec that contains those words is a coincidence
  detector, not evidence.
  FINAL STATE:
  1. The classifier's verdict CARRIES the machine reading it was made under. Where the
     quiet-machine check reported UNKNOWN or LOADED, a twice-failing check is reported as
     UNDECIDED — "failed twice, but the machine could not be shown to be quiet; re-run on
     a quiet machine before believing this" — never as a candidate real failure.
  2. The rate-sensitive checks are MARKED as such where they are defined (the same set
     point 642 carries from the withdrawn point 506 for a lane that cannot answer a check),
     and the classifier says so when one
     of them is the twice-failing check.
  3. The diff-word match is reported as what it is: a word overlap, not a causal link. It
     may not appear at all in an UNDECIDED verdict, where it reads as corroboration.
  WHAT COUNTS AS LOAD IS OWNED BY POINT 455 (20.08.2026). This point keeps its own subject — the
  retry classifier's confidence wording, the marking of rate-sensitive checks and the demotion of
  the diff-word match — and takes the definition of load from there: which evidence counts, that
  a stale worktree and the session's own process never do, and what an unmeasurable machine
  means. The two verdicts sit in different modules and are built separately, but they may not
  disagree about the criterion. The one thing rule 1 may not become is a permanent verdict: 455
  names the measurement of whether a measured-quiet reading is reachable on this host at all, and
  rule 1 follows its answer — with a substitute reading if quiet is unreachable, so UNDECIDED
  stays the exception it is written to be.
  VERIFIABLE: pure Vitest over the classifier — the same twice-failed input yields
  CANDIDATE REAL FAILURE under a measured-quiet machine and UNDECIDED under an unknown or
  loaded one; a rate-marked check is named as rate-sensitive in the verdict; and the
  diff-word list is absent from an UNDECIDED verdict.

- [ ] 570. The children-photographable check reds on the pinned world (measured
  09.08.2026 on `main` at 3e33ff83, WebGL 2, immediately after point 557 pinned the world
  seed at the launcher; bundle Testinfrastruktur). `polish`'s check "the game is
  photographable: both children read whole, apart and at least 67 px tall, unoccluded,
  WITH the village behind them (point 524)" went RED. Point 524 is CLOSED, so this red
  belongs to nobody: it is either a regression against a criterion the project already
  accepted, or a check that was never stable and only looked stable because every run
  walked a different world.
  WHAT THE EVIDENCE SAYS SO FAR: the point-557 agent ran `polish` twice on the same
  change and this check passed BOTH times; the first run on `main` failed it. So it is
  not simply "the pinned world puts the children out of view" — that would fail every
  time. Two candidates remain: a genuine intermittency in where the children are placed
  or when the frame is taken, and a load sensitivity (the failing run shared the machine
  with a finishing agent).
  FINAL STATE: the cause is ESTABLISHED before anything is tuned — run the check ten
  times on the pinned seed on a QUIET machine and record how many pass. If it fails
  consistently, the children's placement regressed against point 524 and the PRODUCT is
  fixed; if it rotates, it joins the staging-settle family of point 200 and is fixed the
  same way (poll on the app's own clock, never a fixed wait). The threshold (67 px,
  unoccluded, village behind) is NOT relaxed to make the red go away — it is the wording
  point 524 was accepted against.
  MEASURED FURTHER THE SAME MORNING, and it shifts the odds: across four `polish` runs on
  09.08.2026 the suite failed with THREE DIFFERENT pairs of checks and passed twice — the
  children pair, then the water check alone, then two `giza (wet)` checks, then two clean
  runs (WebGL 2 exit 0, WebGPU exit 0 on the retry). So the children check is most likely
  another member of the rotating staging family of point 200 rather than a regression
  against point 524. It is NOT ruled out — the ten-run measurement below still decides —
  but expect the staging fix, not a product fix.
  VERIFIABLE: ten consecutive runs on the pinned seed with the same verdict, and the
  cause named in the commit message with its evidence.
  Criticality: medium — it may be a real regression against a closed criterion, and until
  it is owned it blocks every render-set change from ever recording a covering run.

- [ ] 322. Staged-event failures are easy to miss (user 25.07.2026: staging "calf
  mired at waterfall" appeared to do nothing; the user later suspected an unseen
  error message). Make every debug stage/trigger outcome UNMISSABLE: a persistent,
  clearly styled result banner — success names what was staged and where, failure
  names the missing precondition in plain language ("no waterfall within reach —
  jump to a waterfall first") — staying until dismissed or superseded, both
  languages. Also RE-CHECK the mired-at-waterfall staging itself against a
  realistic debug session: if its precondition search radius is too small, widen it
  or teleport-stage like the other dramas. VERIFIABLE: pure test of the
  outcome→message mapping (every stageable event has success AND failure text in
  both languages, no silent path); settings.mjs live-checks the banner on an unmet
  precondition and a successful stage; both languages.

- [ ] 303. Code review of all changes since v0.1 — validate every test is still valid (user
  24.07.2026). QUEUE POSITION: first of the post-v0.1 review work — this stood as "the NEXT task after 224"
  until the user withdrew 224 on 20.08.2026, and it must not point at an archived number. Stale tests keep surfacing only as
  incidental findings (today alone: a strict type-check, heavy fuzz timeouts, and checks that
  ASSUMED pre-276 defaults — SSAO on, campfire shadows off — so they measured the wrong
  state; worst case is a check that stays GREEN while the feature is broken). Do a SYSTEMATIC
  review of the ENTIRE diff since the `v0.1` tag (code AND tests): for each area, does the
  test still assert what it claims, at a REACHABLE state, judged by the REAL signal — or has
  a later change made it stale / tautological / always-green? Focus classes: checks that
  assume a default a later point changed (the point-276 default flips are the template),
  pixel/screenshot thresholds calibrated against a since-changed look, and invariants a
  refactor turned into no-ops. Fix or re-validate each finding. METHOD: a COMBINATION of
  Opus 5 and Fable 5 (model-diverse review, the point-298 spirit) — the two models review the
  diff independently and cross-check findings. START ONLY AFTER the user's VS Code restart
  (so it runs on Opus 5). ANCHORS: `git diff v0.1..HEAD`, all `src/**/*.test.ts[x]` and
  `scripts/verify/*.mjs`. VERIFIABLE: a written report per reviewed area with a verdict
  (valid / stale→fixed), each stale test fixed with its correction. No player-visible text.

- [ ] 285. Hunt accumulation bugs and memory leaks — a repeatable Fable analysis
  (user 24.07.2026, learning from point 278: a fixed anchor drew ever more animals
  because streamed wildlife re-seeded on every return without releasing the
  re-homed originals — an UNBOUNDED growth that a normal test never caught because
  it only checks one moment, not a trend). Establish a proactive, REPEATABLE method
  — like point 205 is for world plausibility — that finds this whole bug class
  before the user does. Use MODEL DIVERSITY: a thorough FABLE analysis (different
  eyes than the Opus authors, per the audit rule), delivered in TWO prongs.
  PRONG A — CODE REVIEW for the leak/accumulation classes: resources created but
  never disposed (three.js geometries/materials/textures/render targets, instanced
  buffers — `renderer.info.memory` should be flat at a fixed state); growing
  collections never pruned (module-level Map/Set/array caches, the `refineCache`/
  `chunkLatestKey`/`spawnedChunks`-style maps, event/subscription registries);
  streaming or respawn that re-adds without truncating the previous fill (the 278
  class — re-seed keyed on distance while a re-homed entity outlives its key);
  React effects whose cleanup is missing or wrong (listeners, RAF, timers,
  observers); per-frame allocations that feed GC pressure. Produce a findings list,
  each with the file/line and the mechanism.
  PRONG B — RUNTIME TESTS that catch a TREND, not a moment: a reusable probe/harness
  (build on `scripts/perf-breakdown.mjs` + the point-277 count probes) that drives
  the real game over TIME — repeated jumps/round-trips between anchors, long driving,
  repeated place enter/leave (scene mount/unmount) cycles — and asserts that the
  measured quantities CONVERGE rather than grow: scene-graph triangle/mesh counts
  per system, `renderer.info.memory.geometries`/`.textures`, `performance.memory`
  JS heap (Chromium), instanced counts, and listener counts. A monotonic rise beyond
  a small tolerance over N cycles is a finding. Make it a script that can be re-run
  each release (a `scripts/verify/leaks.mjs` or a documented harness), on BOTH
  backends where the metric is backend-relevant.
  DELIVERABLE: the findings (evidence = the growth curve per finding), ranked by
  severity; propose fixes. Land the clear, self-contained fixes as their own atomic
  commits/points; file the larger ones as follow-up TASKS points. VERIFY each fix
  the point-278 way — a pure convergence test that FAILS on the old behaviour and a
  live trend check. DOCS: record the method and the run recipe (design.md where a
  system changes, plus a short `docs/leak-hunt.md` or a section in
  `docs/perf-276-findings.md`). This is analysis-first: diagnose and propose before
  changing load-bearing streaming/render code. Budget the fan-out (per the
  workflows-token-budget rule) — scope Prong A inline first, then run Prong B's
  harness. Implementation-ready.

- [ ] 330. Full post-degradation assurance pass (user 25.07.2026, after three separate
  leftovers were found by chance:
  the board's broken umlauts, the board's inconsistency, and a whole night's work
  sitting unpushed on a feature branch). The user's verdict on the cleanup so far:
  incomplete. Do ALL of the following, in this order, and report each with evidence:
  (A) COMPLETENESS — prove that every piece of work exists on GitHub `origin/main`:
  no local commit ahead of origin (`git rev-list --count origin/main..HEAD` == 0 on
  every checkout), no stash, no untracked-but-wanted file, no remote branch holding
  work that main lacks, and the working tree clean; the deployed page builds from
  that same commit. (B) RESIDUE HUNT — sweep for further traces of the degraded
  session beyond the three already found: re-run the mojibake detector over EVERY
  text file in the repo (not just the board), diff main against the pre-degradation
  commit fd85464 file-by-file and justify every remaining difference, check for
  orphaned/never-referenced files added that evening, stale `.claude` state, and any
  test whose assertions cannot fail (the `expect(true)` class) anywhere in the
  suite. (C) FEATURE AUDIT SINCE v0.2 — for EVERY feature merged after the v0.2 tag
  (bafd9b2, 24.07 21:15): 262 orphan adoption, 273 walkable Giza site, 293 benchmark
  low-preset profiling, 305 LOW sun-shadows-off, 306 closing-completeness guard, 308
  dashboard-sync guard, 309 model tripwire, 313 dashboard consistency audit — judge
  the IMPLEMENTATION for plausibility (does it do what its spec claims, at the state
  a player/operator actually reaches?) and the TESTS for validity (would each test
  FAIL if the feature were reverted? does it assert the real signal or a proxy?).
  Use model diversity: a different model than the author reviews. (D) GREEN PROOF —
  a FULL CLOSING RUN, not merely a regression (user 25.07.2026: "the closing
  contains a full regression anyway"): all eleven steps of `scripts/closing-guard-core.mjs`
  (`CLOSING_STEPS`), driven with `node scripts/closing-guard.mjs --status` and
  `--step <id> --evidence "<proof>"` per step — the LARGE regression on a QUIET
  machine on BOTH backends being one of them, plus lint/audit, the dead-code,
  stale-doc, stale-comment and .md audits, the research-doc implementation
  sections, the graphics-detail-level doc, the §7.1 acceptance confirmation, the
  open-items list and the simplifications list. CLOSING FREEZE applies (CLAUDE.md
  §9): no parallel agent work may land while it runs — the in-flight bug agents
  must be merged or parked FIRST, and the closing then runs on the frozen main.
  Any red is either fixed or recorded as a known, justified exception with the
  user's ruling. (E) COHERENCE —
  does everything still fit together (user 25.07.2026)? Cross-check, for the whole
  current state: design.md and CLAUDE.md §7.1 against what the code actually does
  (every feature merged since v0.2 must be described where the docs describe its
  system, and no doc may still pin behaviour the code has left behind); the
  implementations against their tests (every §7.1 "Verifiable" clause names a test
  that exists and still asserts that clause); the research docs' implementation
  sections (peoples-1890 §8, climate-1890 §9, graphics-detail-levels) against the
  code they mirror; the dashboard against TASKS.md (already guarded — confirm the
  guard covers what the 25.07 audit found by hand); and the memory corpus against
  the rules actually in force. VERIFIABLE: a written report per section with the
  commands run and their output; the tick happens only when (D) is genuinely green
  and (E) reports no unexplained mismatch.

  PROGRESS 25.07 (main session): (A) done — 0 local commits ahead of origin/main,
  clean tree, no work-bearing remote branch left (13 fully-merged ones deleted on
  GitHub), the two remaining stashes identified as deliberately parked older work
  (a dead-session perf-bench edit 23.07, a picture-rejected coast attempt 22.07 —
  both pre-degradation, left untouched). (B) partly done — a repo-wide sweep of
  2305 text files found NO double-encoded text outside this guard's own source
  (a self-reference: the detector flagged the damaged sequences quoted in its own
  comment; rewritten so it no longer quotes them), and NO assertion-free test: the
  five candidates the sweep flagged all assert through helper functions
  (`fired()`, `foliageOf()`, `expectRise()`), i.e. scanner false positives. Still
  open in (B): the file-by-file diff against fd85464 and the orphaned-file check.
  (B) COMPLETED 25.07: the file-by-file diff against fd85464 (excluding the
  screenshots) shows 16 differences, every one of them accounted for as today's own
  work — the model tripwire, the dashboard audit, the guard wirings, the two
  analysis docs, the queued points and the deliberately kept closing-state; nothing
  unexplained remains. The orphan scan over all 61 scripts found exactly one never
  imported file, `scripts/check-deployed-benchmark.mjs`, which is a deliberate
  manual tool (documented "Usage:" header, point 277) and not debris. A
  model-diverse review of the two guard commits merged this morning
  (closing-guard fixes + dashboard-sync wiring) additionally verified: the reverted
  Haiku files are byte-identical to the pre-degradation state, the three stub files
  are absent, no merge artefacts remain, and the retained closing-state cannot
  pre-satisfy the tag gate (it is keyed to a different commit; `--status` reports
  0/11 at HEAD). That review's own findings are queued as point 331.

  STRUCK 20.08.2026 (work-order review): the opening freeze, "nothing new starts until
  this is 100 % green". It has not been in force for weeks — hundreds of points have been
  opened and landed since 25.07. — and a clause nobody honours only teaches that the work
  order may be ignored. The pass itself STANDS, without the freeze: (A) and (B) are done
  above, and (A) is now held continuously by `branch-hygiene-guard` and `ci-status-guard`
  rather than by a one-off sweep, so a re-run of (A) is a confirmation, not a hunt.
  (C), (D) and (E) are still owed as written.

- [ ] 203. Extend 184 — a systematic visual + liveness bug-finder (user request
  20.07.2026: "Bugs wie die … sollten leicht für dich zu finden sein … Kannst
  du 184 dahingehend erweitern, dass es selbst viel mehr Bugs in der Richtung
  findet?"). ROOT CAUSE of the miss: the invariant harness checks POSITIONS
  (I1 pop-in / I5 ocean / I6 interpenetration), but the whole recurring class
  the user keeps stumbling on is either RENDERED-GEOMETRY-vs-terrain (187 croc
  submerged, 202 vultures clipping, 190 Lake Edward floating, 185 scavenger,
  196 drinkers) or LIVENESS (188 predator pacing, 201 calf stuck, 193 idle
  standoff, 191 foreign family) — neither systematically swept. THREE additions,
  all cost-light (NO agent fan-out — pure/live checks + me inspecting
  screenshots in the main loop; the point-200 token concern applies):
  (A) ANCHORING INVARIANT — the highest-value one. A render hook exposes, per
  rendered animal/bird/prop each frame, its world (x,z), the LOWEST point of its
  POSED+SCALED mesh (bounding-box min-y after the live pitch/roll/scale — for a
  bird that means the pecking head and the spread wing tips), and a support
  point. A driven sweep over all regions asserts for every rendered thing: its
  lowest point is NOT below the sampled ground at its footprint (no clip — sample
  under the wing/limb EXTENTS, not just the centre), it is NOT far above the
  ground with nothing under it (no float), and a water-dweller sits at the
  rendered water SURFACE (no submerge/hover). This single check catches
  187/202/190/185/196 and their future recurrences.
  (B) LIVENESS INVARIANT — the deferred I3/I4 generalised. Over a long driven +
  staged observation, track each actor's position and state; flag any actor in a
  LIVE state (a hunt mode, a leave, a chase-victim, a caught, a finished feed)
  whose position is FROZEN (variance ~0) or OSCILLATING (paces a short segment)
  past a calibratable deadline, and any predator within touch range of LIVE prey
  where for a window neither engages nor flees. Catches 188/201/193 and kin.
  Extend (A) to STATIC water bodies too: every lake sheet / marsh fan sits at or
  just above its own bed and no edge vertex hangs over the lower neighbouring
  terrain (retro-catches 190 Lake Edward, 189 Sudd) — the same geometry-vs-terrain
  idea applied to the placed water, swept over all 8 lakes + the natural sites.
  (C) VISUAL SCREENSHOT SWEEP + INSPECTION — the catch-all for what the
  invariants do not anticipate, done the way the USER finds them but
  exhaustively: drive to a diverse set of spots and STAGE each drama (hunt,
  rescue, crocodile, trample, drink, flood, each biome/season), screenshot each,
  and VISUALLY inspect every image for anomalies (buried / floating / overlapping
  / mis-posed / wrong-looking things). Each anomaly → verify against the code →
  file a real one as its own point + fix. Keep a checklist of scenes so the sweep
  is repeatable and grows.
  KEEP THE VIRTUAL EYES OPEN FOR "LOOKS-WRONG" ODDITIES (user directive
  21.07.2026): the inspection must catch not only functional bugs but things that
  are functionally FINE yet look WEIRD to a human eye — the aesthetic/plausibility
  class the user keeps spotting: the stepped coastline (209), the sea-arm poking
  into the desert (210), a river that stops short of the sea with a beach gap or a
  notch punched in the water (211), and any similar "it works but it's ugly/odd"
  artefact (jagged edges, seams, holes, mismatched scale/colour, an object that
  reads wrong even though nothing errors). These pass every functional check, so
  ONLY the eye finds them — treat "does this look right to a human?" as a
  first-class question on every frame, and file each real one as its own point.
  (D) CROSS-SYSTEM / TARGETING SANITY — the class where a reaction or event fires
  for the WRONG actor or situation (derived from the past reports 162 a flock
  descends on a family the parent just SAVED, 168 carrion not shown when it
  should be, 191 a foreign family chases the hunter, 194 the lion claims the
  crocodile's prey). Invariant: every emergent system OWNS a unique actor (no two
  claim one — the 194 seam), and every reaction is KEYED to its correct trigger
  (only the victim's OWN parent charges/shields; a kill-flock forms only over a
  real feed or remnant; a scavenger commits only to an unowned carcass). Track,
  each frame, the (system → actor) map and the (reaction → trigger) link across a
  driven + staged run and assert no shared claim and no mismatched reaction.
  (E) VISIBLE-EFFECT / "the picture, not the uniform" — the point-147 lesson made
  a standing check (three rounds of uniform-level checks once passed while the
  player saw NOTHING; also 143 rain inside a settlement, 144 plants change,
  164/167 season/rain transitions): for each state toggle (season month, rain,
  flood, harmattan, fire, dress, dry-season bleach) assert the RENDERED frame
  changes measurably in PIXELS between the two states at a spot that should show
  it, AND that the state does NOT leak where it must not (no rain in a rainless
  desert, the season is the PLACE's not the traveller's). Pixel-diff based, a
  small fixed scene set. Retro-catches the whole "passes numerically, invisible
  on screen" family.
  (C) IS THE PRIMARY NET, NOT A FALLBACK (user insight 20.07.2026: "Es kann nicht
  sein, dass ich eine Minute zufällig drauf los laufe und mir direkt mehrere Bugs
  ins Auge springen, obwohl du gerade eine aufwändige Härtung vorgenommen hast").
  The invariants only find what I THOUGHT to check; the game is visual + emergent,
  so the reliable net is to LOOK at it the way the user does — but exhaustively.
  Make (C) a DENSE, standing, repeatable sweep: a grid of locations (each biome,
  each named place + landmark, coasts, river banks, lakes, the graveyard) × a set
  of staged situations (each drama, drink/bathe, flood, fire, each season/weather).
  CRITICAL (user 20.07.2026): a jump to a spot is only the POSITIONING — most bugs
  appear only while MOVING and OVER TIME (pop-in, plants jumping, the predator
  pacing, the calf snagging while it flees, streaming/edge artefacts). So at each
  spot DRIVE (hold a walk, and also a longer traverse across the region) and
  capture a FILMSTRIP of frames along the path, and LET the emergent dramas play
  out — capture a temporal SEQUENCE over several seconds, not one static shot. The
  static shot serves only the anchoring class; the driven filmstrip + the drama
  sequence are what catch the movement/emergent bugs. I VISUALLY inspect every
  frame (and the frame-to-frame deltas) for anything that looks off, logging each
  anomaly. Aim for the coverage a human would need hours of play to hit.
  TIME AXIS (user 20.07.2026): the sweep also varies the CALENDAR — MONTHS and
  YEARS (1890-1895) — and checks the weather/season effects AND THEIR TRANSITIONS
  are correct at the right place: harmattan Sahel Jan-Mar vs Aug, Atlas snow Feb
  vs Jul, the Nile flood crest Oct vs low Apr (at Aswan), the Okavango flood in
  the local-dry Jul vs Jan, equatorial ice, hail only in a heavy storm, the
  rinderpest years vs a clear year, the dry-season bleach vs the wet green, and
  the border-easing of rain (167). Sample intelligently — each feature at its
  PEAK month and an OFF month at its OWN location, plus a couple of stepped
  transitions to see the ease-in — not the full month×place cross product.
  BACKEND AXIS: run the whole sweep on BOTH WebGL2 AND the real WebGPU (the
  system-Chrome lane) — some visual bugs are WebGPU-ONLY (175 crown jitter, 181
  silhouette float) and never show on the headless WebGL2 path the first pass
  used.
  FULL DIMENSION SET (thought through 20.07.2026 — the sweep varies ALL of these,
  sampled intelligently, not the full cross product):
   1. LOCATION (biome, named place, coast, river bank, lake, landmark, graveyard).
   2. SITUATION/EVENT (each drama: hunt/rescue/sacrifice/crocodile/trample/vigil;
      drink & bathe; the weather events: flood, fire, hail, lightning).
   3. MONTH (season/weather + the transitions between them).
   4. YEAR 1890-1895 (rinderpest years, the deadline stages, the flood cycle).
   5. BACKEND (WebGL2 + real WebGPU).
   6. MOVEMENT (static vs a driven filmstrip — the movement/streaming bugs).
   7. ZOOM — the big one: the pop-in / streaming / far-sheet / haze / flora-edge
      class is ZOOM-DEPENDENT (164/171/172/183). Sample the achievable 0.25 & 0.5
      AND the unlocked wide debug zooms up to the whole-continent view; a bug at a
      wide zoom is invisible at 0.5 and vice versa.
   8. SCENE/PERSPECTIVE — the other big one: everything so far is the bird's-eye
      TRAVEL scene, but the FIRST-PERSON SETTLEMENTS are a whole scene with their
      own classes (walker stuck 155/198, collision/clipping into walls 16, dense
      building fabric, inhabitants using dwellings, the §2.5 panorama + its
      wildlife 181, the skyline landmarks). Sweep each port + a sample of villages:
      walk around inside, press against walls, watch the inhabitants and the
      panorama. Also the bird's-eye ⇄ settlement TRANSITION.
   9. PLAYER STATE — the rendered traveller changes: canoe RIDDEN on water vs
      DRAGGED on land, the wound on the figure by severity, swimming chest-deep,
      the item-in-use glow, afflictions. Sweep the canoe on water AND land, a
      wounded figure, a swim.
   10. TIME OF DAY / SUN — if the sky/sun varies within a day (verify), sweep the
      lighting extremes; else note it is fixed.
   11. TRAVEL DIRECTION / CAMERA HEADING — the panorama capture is bearing-
      dependent (82/99); drive several headings.
  The two most important additions are ZOOM (7) and the SETTLEMENT scene (8) —
  neither was in the first pass, and both hide whole bug families.
  SAMPLING METHOD (user 20.07.2026 — the dimensions span a huge space that can
  only be grazed; a principled sample beats a sparse grid). Three ideas combined:
   • SPLIT BY COST. The automated invariants (A/B/D/E/F-N) are CHEAP (pass/fail,
     no human) — run them on a DENSE sample (many location×time×zoom points, even
     thousands). The VISUAL inspection (C) is EXPENSIVE (my eyes) — sample it
     SPARSELY but smartly, and reserve extra visual budget for wherever an
     invariant already flags something. This alone reallocates most of the space
     to the cheap axis.
   • TARGETED for CAUSALLY-LOCATED effects. Weather/season/flood/dress/rinderpest
     do not need a cross product — each effect lives at KNOWN coordinates. Drive
     the effect→coordinate map from docs/climate-1890.md and design.md §19.13:
     each effect at its PEAK month + an OFF month + one stepped TRANSITION, at its
     OWN place. Exact and complete for that family, ~40 cases, no combinatorics.
   • PAIRWISE (2-wise) COVERING ARRAY for the GENERIC dimensions (location,
     movement, zoom, backend, scene, player-state, heading). Empirically the large
     majority of bugs are triggered by ONE factor or the interaction of TWO — a
     covering array that hits every PAIR of dimension-values needs only ~dozens of
     cases (generate with IPOG/AETG-style greedy), not the full product, yet
     catches all 1- and 2-factor interactions. Generate the array in the finder.
   • RISK-WEIGHTED + ADAPTIVE on top. Over-sample the known-hot regions (coasts,
     water edges, the dramas, the exact user-reported spots) and the
     recently-CHANGED code; and DENSIFY around any anomaly a pass turns up (an
     invariant flag or a visual hunch) — a second, finer sample in that slice.
   NET: dense-cheap invariants + a pairwise+targeted+risk visual sample (~100-150
   inspected scenarios) + adaptive follow-up — good coverage at a feasible cost,
   instead of a false-comfort sparse grid. This is the honest answer to "why did a minute of walking beat
  the hardening"; A/B/D/E are the cheap automated first pass under it.
  MORE INVARIANT CLASSES (derived by thinking through what else can look wrong —
  the cheap automated complements to the visual sweep):
   - (F) FACING/ORIENTATION: a moving animal's rendered facing tracks its
     velocity (no walking backwards/sideways); a figure/sign/door faces a sane
     direction (doors already checked — extend to animals + props).
   - (G) SCALE/PROPORTION: every rendered thing is within its species/type size
     band; a calf is smaller than its parent; no giant/tiny outlier; a landmark's
     apparent size is plausible.
   - (H) STATIC-OBJECT OVERLAP: no two solid statics interpenetrate (buildings,
     rocks, large flora, props, landmark meshes) and no label overlaps a monument
     — the I6 idea applied to the non-animal scene.
   - (I) MATERIAL/COLOUR: no pure-black or magenta (missing-texture) pixels where
     geometry renders; no z-fight flicker on a static camera (temporal diff);
     colour plausible per biome (no snow in the desert, no bone-dry tropics).
   - (K) WATER CONTINUITY/FLOW: rivers stay one unbroken descending ribbon (no
     gap, no uphill run, flow direction matches the descent) — extend the pt-21
     checks with a monotonic-descent + flow-direction assertion.
   - (N) TELEPORT/FROZEN: no rendered thing jumps > a threshold in one frame (the
     179/183 tunneling/pop class, generalised); a MOVING animal's animation phase
     advances (no frozen T-pose).
  BUILD ORDER: (A) first (retro-catches the most, cheap), then (B), (D), (E), the
  cheap extras (F/G/H/I/K/N) as they fit, and (C) the dense visual sweep as the
  standing pre-closing pass — run the WHOLE finder before the final closing.
  Across all classes this would have caught the great majority of the past
  emergent-scene reports without the user ever seeing them. Run the whole finder BEFORE the final
  closing so the batch of finds is fixed in one push. Each real find is its own
  atomic point/commit. Docs: CLAUDE §7.2 gains the anchoring + liveness invariant
  suites; this is the pillar the harness was missing.
  DONE (A) 21.07.2026 — the anchoring tripwire is BUILT and it immediately paid
  for itself. Implementation: a throttled (~1/13 per frame) dev-only assert in
  the wildlife render loop compares each rendered body's height against the
  terrain sampled at its OWN anchor (a.x/a.z), tolerances −0.75·scale/+2.5·scale
  (buried/floating), exemptions exactly mirroring the water-sweep's drama locks
  (plus drink until 196) so scripted poses are never flagged; violations go
  through the 207(i) devAssert channel and fail ANY suite. A `grounded` gate
  (set on the animal's first water-sweep visit, which now HARD-sets the standing
  height instead of easing) keeps test-staged injections with hard-coded y from
  false-firing before their first sweep correction. WHAT IT CAUGHT (the real
  class bug, fixed in the same commit): movers carried STALE standing heights —
  every follow/flee/dodge/guard/charge/vigil step updated x/z but not y, so
  on any slope the whole background herd slowly sank into (or floated off) the
  earth as it drifted; the worst case was the ordinary calf-follow step (every
  background calf tails its parent). Fixed by making EVERY mover carry its own
  ground height (land only — water occupants belong to their dramas), including
  the two sweep-skipped rescue-parent walks (the land approach to a calf in the
  water and the escort back), and by refreshing the locally captured render
  height in the same frame a correction lands (no one-frame buried render on a
  long-dt hitch). Proof: enrichments 207 pass / 0 fail / 0 console-errors with
  the tripwire armed; build+lint+vitest+audit clean. (B)-(N) and the visual
  sweep (C) remain open above.
  READ IT AS THE INSPECTION HALF, and nothing more (carried 20.08.2026 from the 10.08.2026
  four-eyes work-order analysis, not a fresh finding): (A) is DELIVERED and standing in the
  code — the anchoring tripwire with its `grounded` gate and its buried/floating visits
  sits in `src/scenes/travel/Wildlife.tsx` and reports through the 207(i) assert channel —
  yet the block still reads as sixty lines of unstarted work in every context that loads
  the work order. WHAT REMAINS is (B), (D), (E), the cheap extras (F/G/H/I/K/N) and (C) as
  the standing pre-closing sweep; the (A) paragraphs are history and are not work.

- [ ] 207. Additional finding methods that complement the existing audits (Pillar
  2 code, 203 visual/behaviour, 205 plausibility) and together lift coverage
  sharply (user request 20.07.2026). The existing net is designed-scenario
  invariants + an inspected visual sweep + static review; these orthogonal METHODS
  raise sensitivity a lot:
   (i) [DONE 21.07.2026] IN-GAME INVARIANT ASSERTIONS — built as
     src/systems/devAssert.ts (dev-only, per-code rate limit, console.error so
     EVERY suite's console-error gate fails on a violation, window.__assertLog
     for probes; 3 pure tests). First invariants live, piggybacked on the
     water-sweep slice at no extra pass: finite positions, the crossing/caught/
     croc-grip deadlines (I4 made loud). Proven silent across two full
     enrichments runs (207/0 incl. every staged drama). Extend the invariant
     set opportunistically as systems change. ORIGINAL: the biggest force-multiplier. Instrument the
     game code with DEV-MODE assertions that fire the MOMENT a rule breaks,
     ANYWHERE (no animal rendered below its ground; no NaN/Infinity position;
     every started drama carries a deadline; a lake sheet never below its bed;
     herd counts within bounds; nothing on impassable ocean). One __assert channel
     to the console → every test run AND every manual play session becomes a
     detector, not just where a test happens to look. Turns silent corruption
     loud. DO THIS FIRST — it multiplies every other test's and the user's own
     play's sensitivity at once.
   (ii) GOLDEN-IMAGE DIFFERENTIAL — cheap automated visual regression: bake a
     baseline of the 203 sweep frames; future runs DIFF against them and flag any
     unintended pixel change. A no-inspection alarm that a fix did not break the
     look elsewhere; complements the inspection-heavy sweep.
   (iii) PROPERTY FUZZING + DISTRIBUTION CHECKS — random-sample the state space
     (positions, months, states) and run the cheap invariants on thousands of
     random states (edge cases the designed grid misses); over a long run collect
     distributions (hunt directions, calf ratios, drama outcomes, spawn counts)
     and assert they are not degenerate (the 135/169 variety class).
   (iv) SOAK / ENDURANCE — fast-forward a LONG sim run with the invariants +
     assertions live, watching for leaks, herd ballooning, drama accumulation,
     slowdown, drift (bugs that only surface after long play, e.g. the 186 pin).
   (v) METAMORPHIC RELATIONS — checks needing no golden reference: a round trip
     A→B→A returns to the same state; the same scene at two zooms shows the same
     animals; month X and X+12 look the same; leave-and-re-enter is stable.
   (vi) AUTOMATED PLAYER-JOURNEY across seeds/strategies — extend the one E2E flow
     to many, asserting the goal stays reachable, the hint cascade always leads
     there, no softlock, the deadline beatable.
   (vii) CONSOLE/TELEMETRY MINING — scan every run's console for warnings / NaN /
     shader-recompile / dropped-frame / THREE-deprecation noise, fail on new ones.
  BUILD ORDER: (i) then (ii) first (highest leverage), the rest layer in over the
  finder. These join 203/204/205 as the pre-tag quality framework.
  READ IT AS (ii)-(vii), AND (ii) IS GATED (carried 20.08.2026 from the 10.08.2026
  four-eyes work-order analysis, not a fresh finding). (i) is delivered, by this point's own
  DONE record and `src/systems/devAssert.ts`, so the block is no longer a seven-part
  proposal. And the golden-image differential of (ii) may NOT simply be built: point 361's
  bug replay REJECTED it (`docs/picture-check-levers.md` — the quietest frame diverges
  27.81 % against a 0.75 % signal, and the buggy season diffs 91.60 % and would sail through
  a "did it change?" gate), and CLAUDE.md §7.2 admits the method only once
  `scripts/picture-stability.mjs <suite>` reports STABLE. 361 also handed this point the
  levers that survived as NEW controls rather than cheaper ones — the temporal-variance
  probe, fail-fast on `enrichments`, frame-reading pixel probes, a WebGPU-primary lane. So
  (ii) begins at the stability gate, not at a baseline bake.

- [ ] 184. Pre-tag hardening — a much stronger, systematic quality pass to reach a
  high-confidence bug-free state.
  User decision 19.07.2026, after a cluster of elementary-functionality bugs kept
  surfacing in play (178 vultures pop in; 179 a lion tunnels through parent + calf;
  180 elephants wedge at a shore; 181 skyline fauna float; 183 animals pop into the
  frame while driving) DESPITE point 173's quality push.
  STRUCK 20.08.2026 — THE GATE AND THE POSITION, not the method. This was written as
  pre-tag hardening running after 178-183 and gating the v0.2 tag; 178 to 183 are all
  archived done, `v0.2` is a shipped and frozen tag (point 663 treats it as frozen),
  and the release in preparation is `v0.3` (point 174). So the point no longer sits
  before a tag and gates nothing: it is a systematic hardening method that belongs to
  the current release's closing, and point 203 carries its extension.
  EXECUTION (user-approved 19.07.2026): run 184 with ULTRACODE (multi-agent
  Workflow orchestration) on OPUS 4.8. Every stage runs at MEDIUM effort — the
  July HIGH/xhigh split was superseded on 22.09.2026, when Medium became the tier
  for all Anthropic-lane work.
  The audit sweeps and the adversarial finding-verification are the reasoning heart
  — keep those on Opus 4.8. First step is the WebGPU lane (Pillar 3); it may be
  pulled forward if needed to verify a play-test fix (e.g. 181's likely
  WebGPU-specific float).
  WHY 173 DID NOT CATCH THESE — the gap 184 must close: 173 hunted PURE-LOGIC test
  gaps and added ~90 VITEST tests. Vitest runs in jsdom — no 3D scene, no camera,
  no RAF wildlife, no rendering — so it is STRUCTURALLY BLIND to this whole class
  (pop-in, float, wedge, tunnel, unresolved drama), which lives only in the live
  browser scene. 173 ran the EXISTING Playwright checks (and tiered them) but added
  NO systematic, world-wide, CONTINUOUS invariant sweep; the existing browser
  checks assert SPECIFIC scenarios at SPECIFIC spots, and some measure by PROXY (a
  radius, a wall-clock wait) so they stay GREEN while the player sees a bug (183:
  the point-165 check is green at its Maasai spot while the real pop is elsewhere).
  And nobody ran ADVERSARIAL PLAY across the world — exactly how the user found
  them. So 184 attacks the LIVE-SCENE / EMERGENT / VISUAL layer systematically, not
  with more pure-logic tests. THREE PILLARS:
  PILLAR 1 — a CONTINUOUS-INVARIANT "long adversarial play" harness (the core new
  work; a new LARGE-tier suite, e.g. scripts/verify/invariants.mjs). ONE Playwright
  session drives a LONG scripted traversal that crosses EVERY region and biome
  (debugJumpTo between region waypoints, then drive with KeyW + turns while
  SWEEPING THE FULL STANDARD ZOOM RANGE 0.25-0.5 — both the closest 0.25 and the
  widest-standard 0.5, and points between — NEVER a debug wide zoom. BINDING (user
  19.07.2026): everything must work across the WHOLE standard-mode zoom range; a
  green result at only one level, or at a debug zoom, does not count — that
  praxisfremd-zoom testing is exactly what hid bugs the player saw (183). If point
  182 lands first, the standard range starts at 0.125), forces BOTH dry and wet
  seasons at each, enters/leaves
  several settlements, drives river corridors (the Nile end to end), and provokes
  the dramas (inject predators/calves/crocodiles as the existing checks do). EVERY
  FRAME it evaluates GLOBAL INVARIANTS over the live state
  (__wildlife/__camera/__player/__vegetation/__rivers), judged by PROJECTION
  (__camera.onScreen/ndc) and the SIM CLOCK (simTime), and FAILS with full context
  {simTime, invariant, species, pos, ndc} on the FIRST violation:
    I1 NO POP-IN — every animal is off-screen the frame it first joins the herds,
       land AND river, achievable zoom (178/183 class).
    I2 NO FLOAT — every rendered figure / silhouette / landed bird / dragged hull
       foot-y is at its ground/horizon anchor, |delta| bounded (181/128 class).
    I3 NO WEDGE — no animal/inhabitant with a move target stays within epsilon of
       its position past a bounded stuck window (180/155 class).
    I4 NO UNRESOLVED DRAMA — every started drama (caught calf, lunge, charge,
       vigil, mourning, trample, plunge) resolves within its window (179/121 class).
    I5 NO ANIMAL ON IMPASSABLE WATER/OCEAN outside the sanctioned water dramas.
    I6 NO BODY INTERPENETRATION beyond the design.md 19.5 separation threshold.
    I7 NO PREDATOR TUNNELING — a predator that reaches its victim resolves
       (catch/contact/drive-off), never passes through, dt-robust at a big clamped
       dt (179 class).
    Each invariant is ALSO a PURE predicate unit-tested in Vitest with crafted
    states, so the rule itself is testable and the live pass only wires it to the
    scene.
  PILLAR 2 — a SYSTEMATIC CODE AUDIT of the five recurring failure classes, run as
  SEVERAL PARALLEL SUBAGENT SWEEPS (the 173 analysis pattern, aimed at the
  scene/emergent layer), each READING its area and reporting findings WITH CODE
  EVIDENCE: (A) every spawn/despawn/seed/stream path gated by an ASSUMED RADIUS
  (viewR / fog.far / 100x-zoom / a hard-coded distance) instead of the projected
  frustum; (B) every wedge/pin site (water, terrain corners, buildings, props,
  bodies, settlement edges); (C) every ground/horizon anchor (feet vs centre,
  slope/scale lift, with/without a capture); (D) every catch/charge/lunge/
  swept-resolve for dt-tunneling and non-resolution; (E) every live check in
  scripts/verify/*.mjs judging "in view" by a radius or waiting by wall-clock
  instead of projection/sim-clock. Each confirmed finding is fixed and covered by a
  Pillar-1 invariant or a pure test; a non-trivial one may become its own TASKS
  point + atomic commit; small ones fixed inline. LOG every finding.
  MODEL DIVERSITY IN THE SWEEPS (user decision 20.07.2026; its model NAMES struck
  20.08.2026): the reason stands — the code was written mostly by one model, so a
  different-model auditor carries different blind spots and catches what the
  author-model is systematically blind to, and where budget allows a sweep is
  double-covered so two lenses overlap on the same area. The named mix of Opus 4.8 and
  Fable 5 agents is gone: CLAUDE.md §6 now routes authoring to Sol and Opus 5, gives
  Fable 5 only lane-tagged points and the first serving fallback, and leaves Opus 4.8
  as a serving fallback alone. Distribute the five sweeps (A-E) cross-vendor under §6.
  PILLAR 3 — an AUTOMATED WEBGPU LANE (the headless-WebGPU breakthrough,
  19.07.2026 — this replaces the old "manual checklist because headless can't do
  WebGPU"). PROVEN: WebGPU IS testable headless AND autonomously — launch SYSTEM
  Chrome (Playwright channel:'chrome') with --headless=new + --enable-unsafe-webgpu
  + --enable-gpu and navigate to a localhost (SECURE-CONTEXT) page; the game then
  runs on the REAL WebGPU backend (measured: __renderer.backend.isWebGPUBackend =
  true, webglFallback = false, a correct ~548 KB scene screenshot, ZERO console
  errors, on the NVIDIA GPU, no window). The old belief was a Playwright
  BUNDLED-Chromium limitation (its headless requestDevice fails), not a principle.
  BUILD a WebGPU LANE into the verify harness — a launcher switch: bundled-chromium
  / WebGL2 (as today) PLUS system-Chrome / WebGPU — and run the Pillar-1 invariant
  harness AND the acceptance screenshots on the WebGPU backend, ASSERTING the
  backend really is WebGPU (isWebGPUBackend, never a silent fallback). This catches
  the WebGPU-ONLY classes autonomously: the point-175 crown jitter, the reverted
  TRAA/SSR black-screen (pt.32), any backend-specific race. Keep the WebGL2 lane
  too (the game ships both). This is the FIRST step of 184 — Pillars 1-2 gain their
  real teeth once the invariants run on the actual WebGPU backend the player uses;
  and as the lane's own proof, try to REPRODUCE point 175's jitter headless on it.
  A tiny manual note remains only for what even the WebGPU lane cannot see (a
  subjective look call). Caveat: needs a real GPU + Chrome (present on the user's
  machine); flag if a GPU-less CI would fall back.
  BUILD NOTE (scoped 20.07.2026, from the harness): all ~15 verify suites currently
  launch their OWN browser with the identical line `const browser = await
  chromium.launch({ args: ['--enable-unsafe-webgpu','--use-angle=d3d11','--enable-gpu']
  })` — Playwright's BUNDLED Chromium, which silently runs WebGL2 headless despite the
  flags. So the lane is a small, mechanical refactor: (1) add scripts/verify/_browser.mjs
  exporting `launchVerifyBrowser()` that reads an env switch (e.g. VERIFY_GL) — 'webgpu'
  -> `chromium.launch({ channel:'chrome', args:['--headless=new','--enable-unsafe-webgpu',
  '--enable-gpu'] })`, 'webgl' -> today's bundled line — plus `assertBackend(page,'webgpu')`
  reading `window.__renderer.backend.isWebGPUBackend` and THROWING on a silent fallback
  (the guardrail); (2) replace each suite's launch line with the helper and call
  assertBackend right after the game first loads (after the initial waitForFunction
  (window.__game)); (3) in run-all.mjs (launchServer is at ~line 102) loop the suite runs
  over the backend dimension per the TIER DESIGN below and set VERIFY_GL. Do NOT hand-edit
  15 files ad hoc at the end of a session — this is Pillar 3's structured job (validate
  WebGPU-headless holds under FULL-suite load + determinism first, per conditions a-c).
  PROGRESS (20.07.2026, commit 4cc4049): step (1) DONE — scripts/verify/_browser.mjs
  built with launchVerifyBrowser (VERIFY_GL webgpu=system-Chrome+--headless=new /
  webgl=bundled+ANGLE, default webgl during roll-in) + assertBackend (throws on a
  silent fallback via __renderer.backend.isWebGPUBackend). Step (2) STARTED — settings.mjs
  is the first converted suite and the lane is PROVEN END-TO-END: settings runs the FULL
  suite on the REAL WebGPU backend under system Chrome (webgl default 30/0 unchanged;
  VERIFY_GL=webgpu ran with assertBackend confirming WebGPU — no silent fallback). FIRST
  CATCH (the lane's value shown immediately): under WebGPU the 5 lion-feed checks fail
  with ALL-ZERO animation values (head pitch 0, prey-side 0, stain scale 1.0) — the
  render loop is still cold in the checks' wall-clock window (WebGPU shader compile), a
  TEST-ROBUSTNESS gap (the point-177 sim-clock discipline not yet applied to settings'
  feeding block), NOT a game bug (the feed plays on real WebGPU hardware). REMAINING:
  make the timing-sensitive checks WebGPU-robust (wait for the render loop to warm /
  sim-clock the sampling), convert the other suites the same way, wire run-all.mjs's
  tiers over the backend dimension, then flip the default per conditions a-c. This is
  the flagship's determinism work — continue with fresh focus, not rushed.
  PROGRESS 2 (20.07.2026): the feed catch CLASSIFIED as TIMING and fixed WebGPU-robust
  (poll for the depiction; commit a10607f) — settings 30/0 on BOTH backends. Then the
  four biggest/most-diverse suites are on the lane: settings (first-person), enrichments
  (wildlife — 202/0 on WebGPU FIRST TRY, the point-177 sim-clock already hardens it,
  commit 7d48fb6), flow (core loop — 32/0 on WebGPU) and collision (settlement, commit
  6a12035). collision surfaced 8 more timing-class catches: 7 EJECTIONS (push from a
  collider centre to the surface) starved by a fixed pushFrames on the slower WebGPU
  frames — fixed with a poll-based pushUntilClear (webgl 20/0, webgpu ejections pass).
  The PATTERN is now clear and repeatable: render-loop-driven behaviour read via a
  fixed wall-clock window fails on WebGPU's colder/slower headless frames; the fix is
  always to POLL for the behaviour (never a bigger fixed wait — a naive settle bump to
  fix the 8th catch, the chief-hut door LATCH re-arm, let a walker drift onto a door
  standpoint and flaked webgl, so it was reverted). OPEN Pillar-3 items: (i) the
  collision operable check needs a proper latch-aware / walker-robust poll rework so
  the chief-hut door opens on WebGPU without perturbing webgl (currently webgpu 19/20);
  (ii) convert the remaining 9 suites (events/health/voice/i18n/polish/gamepad/
  handwriting/touch/preview) applying the same poll pattern to any timing-class catch;
  (iii) wire run-all.mjs's tiers over the backend dimension; (iv) flip the default per
  conditions a-c. The lane itself is comprehensively PROVEN; the rest is the systematic
  grind — fresh focus.
  PROGRESS 3 (20.07.2026, commits 4c41447 + 2b16df0): ALL 12 DEV SUITES converted to
  the lane (settings/enrichments/flow/collision/events/health/polish/voice/i18n/
  gamepad/handwriting/touch — only preview, the prod-build suite, is left). webgl green
  across all (the default is unchanged). On WebGPU: settings/enrichments/flow/events/
  health/i18n GREEN; the timing-class catches fixed via the poll pattern were the feed,
  the 7 collision ejections and the vulture-circling check. The remaining WebGPU
  catches are ALL the SAME timing class and now clearly a SYSTEMATIC rework rather than
  one-offs: (a) the input-driven suites gamepad (5)/touch (3)/voice (1)/handwriting
  read moved 0.00 / yaw 0.00 / hang because synthetic input -> render-loop movement is
  not processed in a fixed wall-clock window on the slower/colder WebGPU headless
  cadence — every such check must POLL for the movement/yaw/interaction to happen; (b)
  the collision operable chief-hut door (latch re-arm — a naive fixed-settle bump
  traded it for a webgl walker-drift flake, so it needs a latch-aware/walker-robust
  poll); (c) the polish "direct enter falls back" capture reads active true and STAYS
  true past a 15 s poll — a DEEPER, non-timing WebGPU finding (a panorama capture
  persists on a direct place->place enter on WebGPU where WebGL2 falls back), to be
  investigated (real capture-caching difference vs a test-ordering artifact). NEXT
  (the flagship's core, fresh/deliberate — ideally the Ultracode workflow the user
  approved for 184): (1) systematically poll-ify the input/RAF checks + the operable
  rework; (2) investigate the polish capture finding; (3) convert preview + wire the
  run-all tiers over the backend dimension + flip the default; (4) Pillar 1 (the
  continuous-invariant harness) and Pillar 2 (the audit sweeps) — still untouched, the
  bulk of 184's original scope. The WebGPU lane (Pillar 3's foundation) is DONE and
  PROVEN; what remains is the methodical determinism rework + Pillars 1-2.
  PROGRESS 4 (20.07.2026, commits 83f7682 + b45ade8): the SIMPLE timing class is now
  fixed and its poll pattern proven — gamepad's 5 input checks (stick/yaw/journal/
  interact) were poll-ified with two reusable helpers, holdAxesUntil (hold a stick and
  poll the check's own condition, then centre) and pulseButtonUntil (pulse a button on
  clean edges until its effect lands), and gamepad is now 9/0 on BOTH backends;
  handwriting's WebGPU HANG (a bare .entry.writing click waiting on actionability) was
  removed with a force+timeout+catch click (now 9/1, was a hang). But the OTHER input/
  RAF suites turned out to be DEEPER, system-Chrome-specific findings, NOT the simple
  timing class (a poll fix for touch made it WORSE and was reverted): (a) touch — the
  CDP Input.dispatchTouchEvent injection produces NO movement at all under system
  Chrome + WebGPU (holding the finger through a 15 s poll still read moved 0.0), so it
  is a CDP-touch/system-Chrome incompatibility, not frame starvation; (b) voice — the
  Kokoro TTS never reaches the speaking state under system-Chrome-WebGPU, so its
  300000 ms speak-state waits hang the suite; (c) handwriting's click-to-finish still
  fails (9/10); plus the earlier (d) collision operable chief-hut latch (19/20) and (e)
  polish capture-persistence. These five are genuine investigations (system-Chrome CDP/
  TTS quirks vs real issues), NOT quick polls — do them deliberately, not rushed. So
  the honest 184 state: Pillar 3's lane + the tractable timing-class rework are DONE;
  the deeper findings (a-e), preview + the tier wiring + default flip, and Pillars 1
  (invariant harness) and 2 (Ultracode audit) — the bulk of 184's original scope —
  remain, best as a fresh/deliberate effort.
  PROGRESS 5 (20.07.2026, commit 50ea09d): preview (the prod-build suite) routed
  through launchVerifyBrowser too — ALL 15 verify suites now use the shared lane
  launcher; the webgl default is byte-identical so the normal regression is unchanged
  (preview has no DEV __renderer, so no assertBackend — its WebGPU validation goes with
  the tier wiring). READ-ONLY PREP for the touch finding (a): the virtual stick
  (src/ui/TouchControls.tsx) drives movement through POINTER events — onStickDown does
  setPointerCapture(pointerId) and records the origin, onStickMove fires setTouchStick
  ONLY when `stickPointer.current === e.pointerId`. So the likely reason CDP touch
  produces no movement under system-Chrome-WebGPU is a pointer-synthesis difference:
  the touchStart/touchMove may synthesise INCONSISTENT pointerIds (so onStickMove's id
  guard rejects the move), or setPointerCapture rejects the synthetic id, or the hit
  test misses .touch-stick. Confirming needs LIVE instrumentation on system Chrome
  (log the pointerId/target reaching onStickDown vs onStickMove) — not a read-only
  deduction and not a blind poll; do it deliberately.
  PROGRESS 6 (20.07.2026): tried the live pointer diagnostic but run-all.mjs FILTERS a
  suite's stdout to the PASS/FAIL lines, so a console.log('PTRDIAG …') is dropped —
  seeing it needs a DIRECT run against a standalone dev server (extra plumbing). The
  KEY insight makes that unnecessary for the resolution, though: the exact pointerId
  cause does not change the outcome. touch's arm TAP (touchStart+End) works but its
  stick/drag (touchStart+MOVE) does not, and voice's TTS never reaches the speak state
  — both are system-Chrome-HEADLESS limitations (CDP touchMove/pointer-capture and the
  Kokoro WASM speak-state), not game bugs. RESOLUTION (a user tier-design call, flagged
  in the dashboard's "Von dir zu klären"): run touch + voice WebGL2-ONLY and the other
  13 on WebGPU+WebGL2 — legitimate under condition (a) (the WebGL2 fallback is tested
  regardless), but it DEVIATES from "GROSS = all suites on both backends", so it needs
  the user's ok (or the alternative: a deliberate workaround — synthetic pointer events
  for touch, an alternative TTS speak detection for voice). This resolves findings (a)
  touch and (b) voice into a tier decision; (c) handwriting click-finish, (d) collision
  operable latch, (e) polish capture-persistence remain smaller investigations.
  DIRECTION (user 19.07.2026, "run all browser regression on WebGPU?"): make
  WebGPU the PRIMARY/default browser-regression lane — it matches what the player
  runs and catches the WebGPU-only class across the WHOLE suite, not just a special
  test. THREE conditions before flipping the default: (a) KEEP a WebGL2 lane — the
  game ships the WebGL2 fallback for WebGPU-less hardware (CLAUDE §3), so it must
  not go untested (at least a smoke subset every run, the full suite periodically);
  (b) VALIDATE DETERMINISM FIRST — a backend switch shifts every check's render/RAF
  timing profile (incl. the ~15 s WebGPU cold-load stall, App.tsx), and since 177
  is entirely about timing determinism, confirm all ~200 checks stay green AND
  flake-free on WebGPU across several runs before defaulting, or a new flake source
  replaces the old; (c) MEASURE THE COST — the per-launch WebGPU cold-load slows
  the regression; quantify it and, if steep, keep the fast WebGL2 lane for the
  quick everyday gate and run WebGPU on the LARGE tier. Also revisit the
  __ttsForceWasm hook (CLAUDE §3): with a real WebGPU device present, decide
  whether the voice suite still forces WASM (the render-WebGPU vs onnxruntime-
  WebGPU GPU-process contention, point 117) or exercises the WebGPU voice path.
  TIER DESIGN (user 19.07.2026): SMALL runs the current small-tier suite set (point
  173's fast low-flake subset — same suites, same count) on WEBGPU, plus one WebGL2
  SMOKE test (init + a render screenshot + one core flow, so a grossly broken
  fallback is caught). LARGE runs ALL browser suites on BOTH backends — once on
  WebGPU, once on WebGL2 — plus the prod preview. Vitest stays the fast
  backend-independent inner loop. Prerequisites: 177's determinism landed and the
  suites proven green AND flake-free on WebGPU; measure the per-launch cold-load
  cost. Updates CLAUDE §5, scripts/verify/run-all.mjs and scripts/verify/README.md;
  the suite→tier map is unchanged — each tier gains a backend dimension.
  THE TIER DESIGN ABOVE IS DELIVERED AND IS STRUCK FROM WHAT REMAINS (verified
  20.08.2026): `scripts/verify/tiers.mjs` carries `DEFAULT_BACKEND = 'webgpu'` with
  `laneFor`/`WEBGL_ONLY_SUITES`, `run-all.mjs` re-invokes itself per planned backend
  pass through `planBackends`, and CLAUDE.md §7.2 states the everyday WebGPU lane, the
  complete WebGL 2 lane on LARGE and the touch/voice routing to WebGL 2 as settled
  rules — so Pillar-3 items (iii) tier wiring, (iv) default flip and the touch/voice
  question PROGRESS 6 left for the user are all closed. What is still open in Pillar 3
  is only the three deeper findings: (c) handwriting click-to-finish, (d) the collision
  operable chief-hut latch and (e) the polish capture-persistence.
  ACCEPTANCE: (1) the invariant suite (Pillar 1) exists, covers I1-I7 across the
  WHOLE standard-mode zoom range (0.25-0.5, both ends, NEVER a debug zoom — the
  user's binding 19.07.2026 addition specifically for 184), and is GREEN across at
  least THREE consecutive LARGE runs with NO rotating flakes (sim-clock/projection
  throughout); (2) every audit finding (Pillar 2) is fixed
  and regression-covered; (3) the full LARGE regression is green 3x flake-free; (4)
  the WebGPU lane (Pillar 3) runs the invariant harness AND the acceptance
  screenshots on the REAL WebGPU backend (isWebGPUBackend asserted, no silent
  fallback) and is green, with any residual manual-only item named; (5) a written
  summary of what was
  audited, found, fixed and the residual risk. Docs: quality/process point; adds a
  CLAUDE 7.1 verifiable line for the new invariant suite and updates the CLAUDE 5/7.2
  test architecture; the 172/177 disciplines. (Requested 19.07.2026 — "be
  significantly more thorough". The "only THEN the v0.2 tag" ordering was struck
  20.08.2026 with the gate above.)
  PILLAR-2 FINDING LOG (read phase complete, harvested 20.07.2026; full "why"
  texts in the workflow journal wf_716721d3-a95). 51 deduped findings; the
  agent-verify phase was stopped on the user's token concern — each finding is
  verified INLINE at fix time instead. Disposition: 3 filed individually
  (Wildlife 736 → 187 croc-under-surface; Wildlife 3454 → 194 claim-steal;
  Wildlife 3614 → 188 leave-no-deadline, matches the user's ocean-pacing
  report); game-code groups → 195 (radius-not-frustum spawn/despawn: Wildlife
  3441, 3386, 1462+1465, 1084, 3432 + wildlifeBehavior 628, 282), 196
  (bed/ground-anchor depictions: Wildlife 2806, 2751, 2282, 913), 197
  (drama-state exclusions/gating: Wildlife 2091+2092, 3048, 2056, 2136, 1978,
  3340), 198 (PlaceLife 764 nudge failure), 199 (canoeDrag 152 pitch-clamp
  drift); the 26 verify-SCRIPT robustness findings (wall-clock/radius in
  enrichments 753, 928, 946, 969, 1058, 1092, 1141, 1146, 1292, 1671+1690,
  1973, 2375, 3027, 4071, 4102, 4182, 4544, 4611, 4756, 5335; polish 270;
  settings 183, 277; flow 242; voice 56; touch 75) → 200.

- [ ] 615. The not-run gate is disarmed by a comment, and the bootstrap skips its own
  LOCKFILE CHECK (four-eyes review of the landed point 573 by the second model,
  10.08.2026, verdict merge-with-fixes; both defects live-verified by the reviewer, not
  argued). Point 573 closed the false green where a spawn that never ran was read as
  "the linter rejected". Two holes remain in the mechanisms it delivered:
  1. `establishesRun` (`scripts/verify/spawnAssertion.mjs`) matches its RUN_ESTABLISHERS
     against the UNMASKED case text, while every other match in that module runs over
     `maskCode` output — the module's own rule that a string must never be mistaken for
     code. So a COMMENT naming the helper disarms the gate: a case that asserts a
     non-zero exit as a rejection, with `// TODO: route this through didRun once the
     helper lands` above it, yields zero findings. Two further spellings of the same
     defect also slip past: `expect(r.status !== 0).toBe(true)` (the boolean wrap) and
     `expect(r.status).toBe(1)` (the literal code).
     FINAL STATE: run-establishment is decided over MASKED text like every other match in
     the module, and the boolean-wrap and literal-non-zero spellings are recognised as
     the same assertion as `not.toBe(0)`. The alias and wrapper cases
     (`const { status: verdict } = spawnSync(…)`) stay outside the gate's reach and are
     NAMED as its documented limit rather than silently missed.
  2. `planBootstrap`'s `hasOwnDeps` short-circuit (`scripts/worktree-bootstrap-core.mjs`)
     returns "this checkout already has node_modules" BEFORE the lockfile hash is
     compared, so a worktree whose lockfile has since diverged — by its own change or by
     merging main's — keeps running its gates against the donor's dependency tree. That
     is precisely what the plan's own `lockDiffers` reason exists to prevent.
     FINAL STATE: the lockfile hash is compared whenever a linked or installed
     `node_modules` is already present, and a divergence installs for real instead of
     proceeding. A DANGLING link (the donor's tree deleted) is relinked or installed
     rather than throwing a bare EEXIST, and its message names the remedy.
  VERIFIABLE: pure Vitest — the comment-disarmed snippet above, the boolean wrap and the
  literal non-zero each produce a finding; a case that genuinely establishes the run
  produces none; and the plan for a present-but-diverged lockfile is "install", for a
  dangling link "relink or install", both with their reason. Plus the real proof for the
  bootstrap half: a worktree bootstrapped, its lockfile then changed, re-bootstrapped,
  and the resulting tree is the one its own lockfile describes.
  Criticality: medium — both halves restore a signal the fast layer is believed to give
  and does not, which is the same failure class point 573 was opened for.

- [ ] 618. A modified key still does two things at once outside the calendar row
  (four-eyes finding on point 601, 10.08.2026, recorded with its merge verdict). Point 601
  closed this defect class for the calendar keys: a chord the game hands back to the browser
  must not ALSO run the game's own handler, or one press does two things and the game's half
  is silent. The reviewer found the class survives in three places 601 did not reach, all of
  them pre-existing.
  FINAL STATE:
  1. `onTab` in `src/ui/Hud.tsx` goes through the same modifier check as every other
     handler instead of bypassing `onKeyPress`. Today a windowed Ctrl+Tab switches the
     browser tab AND toggles the journal; Ctrl+Tab is not one of the three reserved chords
     the prevention path can swallow, so standing the handler down is the only cure.
  2. Meta counts as a modifier wherever Ctrl and Alt already do. On macOS the game acts on
     Cmd+G (dig), Cmd+C (pitch camp) and Cmd+M (map) while the browser or the OS runs its
     own command on the same press — the same one-press-two-things the point closed, and
     the comment in `src/systems/keyboardGuard.ts` claiming nothing a page does reaches
     these is true only of Cmd+W/T/N.
  3. The four YEAR-key registrations get the same test cover the month keys have. Removing
     their opt-in currently passes the suite, although Ctrl+NumpadAdd is a browser zoom the
     game deliberately hands back.
  VERIFIABLE: Vitest — Ctrl+Tab leaves the journal closed and the event unprevented, so the
  browser keeps its chord, while a plain Tab still toggles it; each of the Meta-modified
  game keys leaves its action untaken; and each of the four year keys is pinned in both
  directions, so removing an opt-in reds the suite.
  Criticality: medium — it takes no session down the way Ctrl+W did, but every instance is
  a silent state change the player did not ask for and cannot see the cause of.

- [ ] 619. The dressing pair no longer gestures, and design.md says so (user decision
  10.08.2026, answering the card the point-580 fix raised). The village's conversing pair
  is pure dressing that never utters anything, and since gestures were tied to speech
  behind the earshot gate it only stands, turns and shifts its weight. `design.md` §19.10
  still promises the older behaviour, and the user chose the simpler of the two ways
  offered: strike the gesturing rather than give the pair a voice.
  FINAL STATE: in `design.md` §19.10 the vignette reads "pairs stand together in
  conversation" — the ", gesturing" is struck, and nothing else in the sentence or the
  list around it changes. No code changes: the behaviour the line now describes is what
  already ships. The word count drops, so no budget question arises.
  VERIFIABLE: the phrase "in conversation, gesturing" no longer occurs in `design.md`, and
  the existing gesture tests stay green — the delivered behaviour is untouched, this point
  only makes the document describe it.
  Criticality: low — it is a documentation correction, but an uncorrected line is a
  standing invitation to "restore" a behaviour that was deliberately removed.

- [ ] 620. A frame passes its checks while showing nothing at all (measured 10.08.2026
  while landing point 588; bundle Testinfrastruktur). `VERIFY_GL=webgl node
  scripts/verify/run-all.mjs polish --section=speech-guess` passes all 11 checks and writes
  `148-speech-guess-invitation.png` / `149-speech-guess-dialog.png` showing the note and the
  dialog over PURE BLACK — no village, no sky. It is neither the host nor the change: the
  `villager-gestures` section on the SAME tree and the SAME backend draws the settlement in
  full, and `speech-guess` on WebGPU draws it in full. The section stages itself onto
  whichever object named `inhabitant` `scene.traverse` finds FIRST and teleports the player
  four units beside it; on the slower WebGL 2 lane (1–2 FPS) that pick is taken before the
  scene has settled, so the camera lands where it sees nothing. The frame-subject shutter
  (point 375) passed it, correctly by its own rule: the label's anchor DOES project into the
  frame. The subject was present; the world behind it was not.
  FINAL STATE:
  1. The `speech-guess` section stages only once the scene has SETTLED — the same
     "triangle count still moving" settle the worldmodel frames already use — and picks its
     figure deterministically rather than by traverse order, so the frame is the same
     picture on either backend.
  2. The shutter learns the second half of point 375's promise: a frame whose subject is in
     view but whose PICTURE is empty is refused, naming what it found. "Empty" is judged by
     the scene the frame claims (a `local`/`place` frame must have the settlement drawn),
     not by a pixel threshold — point 361 rejected pixel metrics as a gate, and this is a
     question about the scene graph, which the page can answer directly.
  VERIFIABLE: the section's two frames show the settlement on BOTH backends; a unit case
  over the shutter's pure core refuses a frame whose declared subject projects into an
  otherwise undrawn scene and accepts the same frame once the scene is drawn.
  Criticality: medium — nothing the player sees is broken, but a real regression in that
  view is invisible on the WebGL 2 lane for as long as this stands, which is the exact harm
  the picture check exists to prevent.

- [ ] 622. A verify run that ran nothing reports green, and an unknown flag runs
  EVERYTHING (found 10.08.2026 while verifying point 592; bundle Prüfkosten).
  Two shapes of the same hole in `scripts/verify/tiers.mjs`' `parseArgs`, both
  reproduced today: `node scripts/verify/run-logged.mjs --help` sorted `--help`
  into `flags`, left `filter` empty and therefore started a FULL both-backends
  LARGE run (killed after it had booted); `node scripts/verify/run-all.mjs helth`
  intersected a typo'd suite name to the EMPTY set and printed `ALL GREEN — 0
  suites run` in under a second. The second is the dangerous one — it is a green
  verdict for a run that proved nothing, the failure class points 375 and 574
  exist for; the first only burns 42 minutes.
  FINAL STATE:
  1. An argument the runner does not know is REFUSED before anything is built or
     booted — an unknown flag and a filter token naming no suite each exit
     non-zero within a tenth of a second and name what does exist. The
     `--section` path's early validation in `run-all.mjs` is the model and the
     place to join.
  2. `--help` / `-h` prints the usage of `run-all.mjs` and of
     `scripts/verify/run-logged.mjs` and exits 0 WITHOUT running anything.
  3. A run whose chosen suite set is EMPTY is never GREEN: it exits non-zero and
     names the filter that matched nothing. "0 suites run" is a failure verdict.
  4. `scripts/verify/tiers.test.mjs` pins all three in the fast layer, including
     that a KNOWN flag (`--baseline`, `--section=…`, `--quiet`) still parses.
  VERIFIABLE: `node scripts/verify/run-all.mjs helth` exits non-zero naming the
  suites, `node scripts/verify/run-logged.mjs --help` prints usage and runs
  nothing, `npm run test:unit` green.
  Criticality: medium — it touches the argument path of every regression command,
  so a mistake there silences the whole gate; the other model's mechanism review
  applies.

- [ ] 626. The boulder's proof proves the wrong thing (four-eyes review by GPT-5.6 Sol of
  the landed point 585, 11.08.2026; two findings re-verified against the tree before
  filing). 585 stood the landmark erratic on the ground and was landed on a green picture
  — but its evidence does not hold what it claims, and a second defect class it fixed is
  untested:
  1. THE SEAT CHECK IS SELF-REFERENTIAL. `scripts/verify/world.mjs:154-174` calls the
     block "seated" when `r.y` equals `r.groundY` — both read from the SAME site object.
     That proves the SCENE COPIED the site's number, never that the block stands on the
     DRAWN terrain. It is exactly the proxy this project forbids (CLAUDE.md §7.2: judge by
     the rendered result, never by an assumed value). The check must read the height of the
     drawn mesh under the block's footprint — the vertices the bird's-eye mesh was built
     from — and compare THAT with the drawn base.
  2. A NEW TEST ASSERTS AGAINST AN OCEAN. `src/scenes/place/groundScatter.test.ts` never
     calls `setupGeodata()`, so its world is water everywhere — the trap 585's own report
     named for two other files, reproduced in the file it added. It loads the dataset, or
     it proves nothing about the shore rule.
  3. AND THE PLACEMENT STILL HAS EDGES the review named and nobody has refuted: the
     footprint is probed at 25 discrete points, so a wet or blocked sliver between them
     survives; an exhausted search returns the village coordinate WITHOUT proving it dry;
     and the all-water seed 4242 is returned wet with `communicationRock.test.ts:207-232`
     blessing it. Either each is genuinely unreachable in play — then the test says so in
     one line — or the search fails LOUDLY instead of returning a spot it cannot vouch for.
  VERIFIABLE: the seat check FAILS when the scene is made to draw the block a metre above
  its site (a deliberate regression, reverted), which the current check cannot detect;
  `groundScatter.test.ts` green with the geodata loaded; and a stated verdict per edge in 3.
  Criticality: HIGH — this is the landmark the communication goal is dug up at, and the
  check that was supposed to protect it does not.

- [ ] 627. The Victoria Falls frame photographs somewhere else (measured 11.08.2026 on
  `main` at 3f639f0d, after the point-585 landing; bundle Testinfrastruktur). `world`
  reds on ONE of its seven landmark frames: `15-worldmodel-victoria-falls — its subject is
  not in the rendered picture: off the left and bottom edge of the frame`. It survived the
  suite's own retry, and it is WEBGPU-ONLY: the same suite on WebGL 2, in the same sitting,
  writes all seven frames green — which is why the charge that accounts for it is scoped to
  that lane and a WebGL 2 red stays a real red. On the 585 branch the WebGPU run had passed
  minutes earlier, so it is either a genuine regression of the jump or a rotating timing
  failure, and which of the two is exactly what this point must settle. The six
  other landmarks (Khartoum, Lake Victoria, Kilimanjaro, the Congo mouth, Cape Town, Lake
  Chad) pass in the same run, so it is not the shutter and not the projection: those refuse
  correctly, which is why this was caught at all.
  MEASURED AGAIN 26.08.2026 on `main` at f178ea6d, and it decides the question above: the
  SAME failure, word for word — "its subject is not in the rendered picture: off the left and
  bottom edge of the frame" — now reds on `11-worldmodel-khartoum-confluence` instead, twice
  including the suite's own retry, in two separate sittings, the second on a quiet machine.
  The other six landmarks pass, and `world` on WebGL 2 writes all seven green in the same
  sitting. Khartoum was one of the six that PASSED on 11.08., so this is not a placement
  change at one site: the signature ROTATES between landmarks, which is the second of the two
  causes this point had to choose between. It is therefore an unsettled jump, and the fix is
  the one point 514 already states for its own instance — the wait after a jump POLLS the
  camera having arrived rather than counting milliseconds. Both frames are charged to this
  point in `scripts/render-verify-charges.mjs`, each scoped to `world`/WebGPU.
  MEASURED A THIRD TIME 13.09.2026, on main at 49cef70ee645, and this round carries the
  DETAIL the earlier records lack. Two `baseline-classify.mjs world` runs on a quiet machine
  (load 0.35 over sixteen cores) both red on `11-worldmodel-khartoum-confluence` with the same
  wording, while the other six landmarks pass in both — the rotation stands, and point 995,
  which owns making these entries narrowable at all, now has a recorded measurement to narrow
  this one by.
  AND THE CHARGE DID NOT REACH THE RED, which is a second thing this point has to carry. The
  WebGPU world run of 13.09. reported both this frame and the talus pair as UNACCOUNTED, and
  the reason is structural rather than a mis-filing: the entry is scoped to the compatibility
  feature level, and a run that records no level — or records `core` — matches no level-scoped
  charge. Measured against the shipped ledger that day: `chargeFor` on this red answers point
  627 at `compatibility` and NOTHING at `core` or at no level at all. So a known, owned,
  reproducible red reads as unowned whenever the world suite does not record the level it drew
  at, and `render-verify-guard` then blocks on a defect that is already filed. Whatever this
  point decides about the jump, the world run has to record its feature level, or this entry
  cannot account for the red it was written for.
  FINAL STATE: the cause is NAMED with evidence — the jump to (-17.9, 25.9) not settling
  before the shutter opens, a camera clamp at that latitude, or a real placement change —
  and fixed at that cause. If it is timing, the frame waits on the STATE the jump reaches,
  never on a wall-clock; a fixed sleep is not an answer here (CLAUDE.md §7.2). The charge
  entry in `scripts/render-verify-charges.mjs` that currently accounts for this red goes
  when the point is ticked.
  VERIFIABLE: `world` green on BOTH backends, three runs each, the falls frame written and
  showing the falls; and the deliberate regression (a jump that does not settle) must make
  the check red again.
  Criticality: medium — it blocks no player, but an unaccounted red on `main` blinds the
  render gate for every later change.

- [ ] 647. A full-suite red on the 629 branch whose test nobody can name (11.08.2026, 18:03,
  on `feat/629-cleanup-spares-live-worktrees`). One test in a full `npm run test:unit` run
  failed; the run's output was truncated before the name was read, and no vitest report
  artifact is kept in the repository, so the test cannot be recovered from the run. It is
  filed rather than explained, because point 640 forbids the other closings: the same test
  set had been green four minutes earlier and has been green 5/5 since, and that covers
  nothing.
  THE ONE CANDIDATE, RECORDED AS A HYPOTHESIS AND NOT AS A CAUSE. In that same window the
  author found and fixed a genuine sub-millisecond `mtime` vs `Date.now()` race in a test he
  had just written (`f5a6feb8`, the index-refresh case). It is the only nondeterminism known
  to have been introduced in that window, so it is the first thing to test — but nothing ties
  it to the red beyond the coincidence of timing.
  FINAL STATE, TWO HALVES. (a) The red is named: either the candidate above is confirmed by
  reproducing a failure with the pre-`f5a6feb8` test and showing it absent after, or another
  cause is found; if neither is reachable, this point closes by RECORDING that the run is
  unrecoverable and naming what was changed so it cannot happen again. (b) The reason it is
  unrecoverable is removed: a full unit run keeps a machine-readable report of which tests
  failed (vitest's own reporter into a git-ignored path is enough), so the next red of this
  kind is answerable from the record instead of from memory. Half (b) is what makes half (a)
  the last time this question is unanswerable.
  VERIFIABLE: for (b), a deliberately failing test leaves its NAME in the report file and a
  green run leaves a report with no failures — pinned by a Vitest case over whatever pure
  part the wiring has, plus one real run. For (a), whichever of the two closings applies,
  recorded with its evidence.
  Criticality: medium — the red is on a branch, not on `main`, and the fast gate still stands
  between it and a landing; what makes it worth a point is that it could not be ANSWERED,
  which is the condition points 455, 640 and 643 all exist to end. Bundle: Testinfrastruktur.

- [ ] 653. Every acceptance criterion's detail section is bound to the code it describes (user
  11.08.2026: "Ja, natürlich teste ich von der Kommunikationsmechanik nur den aktuellen Stand.
  Den habe ich ja selbst spezifiziert und dich bauen lassen und für den bauen wir bald die 0.3.
  Bevor die gebaut wird, will ich ihn testen."). MEASURED: `docs/acceptance-criteria-detail.md` §7 still describes the OLD
  placeholder — the village elder handing out a glossary and direction words, plus the §13.4
  notice that the real mechanic is undecided, "do not build on them — and do not PROTECT them
  either" — while the user's specified mechanic is built and deployed on `main`:
  `src/communication/` with `lexicon`, `speaking`, `heard`, `speechLabel`, `speechTarget`,
  `spokenGesture`, `drumMessage` and `chiefReply`, and the teaching adults and children of the
  Bambara village. That section is the text a closing and a version tag read as PROOF, so a
  stale one signs off a built mechanic as a placeholder and invites the next change to sacrifice
  it. Nothing in the repository notices, because no rule ties the section to the code.
  
  FINAL STATE:
  
  1. Every numbered section of `docs/acceptance-criteria-detail.md` carries a machine-readable
     header declaring the source paths it describes and the revision it was last checked
     against — the same shape the graphics-detail doc and the retrospective already use
     (`src/config/qualityDoc.test.ts`, `scripts/retro-currency-guard.mjs`).
  2. A Vitest FAILS when code under a declared path has moved since that revision, naming the
     section, the paths and the commits, so the section is re-read and re-stamped (or rewritten)
     in the same commit as the code change.
  3. A section that declares NO path fails as well: no silent exemption, and a criterion whose
     subject genuinely has no code (e.g. build/lint hygiene) declares that explicitly instead.
  4. §7 is the first section STAMPED under 1 to 3, and only stamped. NARROWED 20.08.2026:
     the concrete REWRITE of §7, of its short form in `CLAUDE.md` §7.1 point 7 and of the
     evidence chain in `docs/acceptance-evidence.md` §7 is struck from this point and is
     owned by the document sweep (point 692), because the communication mechanic was rebuilt
     on 13.08.2026 — text written here would describe the superseded mechanic a second time,
     and the concrete wording may only be written against the landed rebuild. What stays with
     the sweep travels with it: what is REALLY still open from `design.md` §13.4 (the
     invented, researched language per region) stands as a clearly bounded remainder. This
     point keeps the durable half — the binding of every criterion's detail section to the
     code it describes, for all 32 — and stamps §7 once the sweep has left it correct.
  
  VERIFIABLE: Vitest against a fixture — a section whose paths moved after its stamp fails, one
  whose paths did not passes, a pathless section fails, and a section naming a path that does
  not exist fails loudly rather than passing vacuously. The real repository run is the gate; the
  initial stamping pass is part of this point, so it lands green.
  
  Note the cost honestly: the path map is written once for all 32 criteria, and the mechanism
  catches "the text is STALE", not "the text is WRONG" — a section rewritten carelessly still
  passes. It would have caught this case, because `src/communication/` is young and the section
  is old.

- [ ] 694. The children's accepted WebGL 2 composition needs a home that survives a tick
  (found 14.08.2026 by the cross-vendor review of point 666 — Claude Opus 5 on the Sol-authored
  branch — and verified against the mechanism itself, not argued). Point 666 answered the
  player-visible standstill with a behaviour fix and settled its REMAINING WebGL 2 red by its
  option (b): a charge in `scripts/render-verify-charges.mjs` naming the composition
  (`no child walks without getting anywhere`, worst child 3, 1.29 m walked inside 0.32 m, an
  expected live rate of one run in ten), narrowed to that backend and that measured detail.
  THAT ACCEPTANCE CANNOT SURVIVE ITS OWN POINT'S TICK, and the ledger says so in its own header:
  "The moment the owning point is ticked, its entries stop clearing anything" — pinned by
  `render-verify-core.test.mjs` ("charges only points the work order still holds OPEN"). MEASURED
  on the branch before the landing: point 666 chargeable while open, NOT chargeable once ticked,
  so `npm run test:unit` would have gone red on main the moment 666 was ticked and the accepted
  red would have been uncovered from that same moment — the state point 666 was filed to prevent
  (point 640). The charge was therefore re-pointed HERE at 666's landing, and this point owns the
  composition until it has a durable answer.
  AND THE SCOPE IT INHERITED IS ALREADY TOO NARROW, MEASURED THE SAME NIGHT (14.08.2026, 03:58,
  the `polish` re-run on main, c71d6780, WebGPU): `no child walks without getting anywhere` red
  at 0.29 % of the judged time — worst child 1 at 22.2 s, 1.42 m walked inside 0.31 m, 3 of 4664
  one-second windows, and 0.00 % in the 0.5 s bursts. That is the SAME composition, on the OTHER
  backend, at a DIFFERENT measurement, so the inherited entry — scoped to WebGL 2 and to the
  exact string "1.29 m walked inside 0.32 m" — covers neither. What the evidence does and does
  NOT say about the point-666 fix (sharpened by the cross-vendor review, 14.08.2026): point 666
  measured this same composition at 0.31 % on a live-cadence replay seed BEFORE that fix existed,
  so the composition PREDATES it and today's 0.29 % is of the same magnitude — but one prior
  severity value is not a band, no post-fix incidence RATE was measured, and this point may
  therefore not assume the fix left the rate untouched. Measuring that rate is part of the work.
  AND THE VEHICLE IT INHERITS ONLY WORKS FORWARD (measured 14.08.2026, 04:36, through the real
  parser and the real recorder path, pinned by a Vitest case): a suite prints `FAIL <name> —
  <detail>`, `failedChecks` parses the detail out, and `chargeReds` reads it and STAMPS the owner
  — so a `detailMatch` entry does fire while a run is being recorded. What the record then keeps
  is name/key/kind/point; the detail is DROPPED, and 0 of 99 recorded reds carry one. So the
  ledger's own promise — "it is CHARGED to the OPEN point that owns it; the charge counts at
  once, no re-run needed", and "THE CHARGE IS READ AS IT STANDS NOW, not as it stood when the run
  was recorded" — holds for a plain `match` and NOT for a `detailMatch`: a red that is already
  recorded can never be charged afterwards. That is why the WebGPU red above stayed unexplained
  after its entry was written, and why closing it needed a deferral plus a re-run rather than the
  charge the mechanism advertises. Fail-safe in direction (an unmatched red stays loudly
  uncharged, never blessed), and it is the FIRST thing this point repairs: a measurement must be
  chargeable AFTER the fact — the record carries what the rule reads — before any acceptance is
  written on top of it. TWO
  CONSEQUENCES BIND THE ANSWER BELOW: the acceptance is BACKEND-INDEPENDENT (the artefact is
  about the one-second window meeting a live dt cadence, not about a renderer), and an
  acceptance keyed to an exact measured number CANNOT work for a stochastic artefact — every
  run mints a new signature, so the entry would never match twice. What may be accepted is a
  SHAPE (a marginal exceedance of the gate by a single event), never a check-wide blanket: the
  defect this check was built for reads 1.5 %, 22 % and 99 %, orders of magnitude away.
  FINAL STATE, one of two, decided by measurement and not by preference:
  (a) THE MEASURE IS SHARPENED so a single legitimate event can no longer read as pacing — the
      one-second window is the suspect, the GATE stays untouched at 0.25 %, and the recorded
      PRE-CURE traces are re-read to prove the sharpened measure still goes RED on the defect it
      was built for. That proof is mandatory: a measure that no longer sees the original bug is
      worse than the red it silences. The charge entry leaves the ledger with the sharpening.
  (b) THE ACCEPTANCE IS MADE PERMANENT AND EXPLICIT — a vehicle for a known, justified,
      permanently accepted red, the way `scripts/audit-check.mjs`'s ALLOW map carries an
      advisory with no upstream fix: SEPARATE from the charge ledger, which is temporary by
      construction and expires with its point, and carrying the evidence, the measured rate and
      a dated justification. It stays as NARROW as the evidence allows — this backend, this
      check, this measured signature — so every other red of the same check stays unaccounted.
      The charge entry moves into that vehicle and leaves the ledger.
  VERIFIABLE: for (a), the sharpened measure re-read over BOTH the recorded pre-cure traces (must
  go red) and the post-cure traces on both backends (must go green); for (b), the permanent entry
  plus Vitest cases pinning that a red NOT of that signature is still uncovered AND that the entry
  does not expire with any point's tick — the failure this point exists to answer.
  Criticality: medium — no player sees it; what is at stake is that the release branch's last
  children red closes by a NAMED cause instead of by a retry (point 640).
  Bundle: Dorfleben.

- [ ] 698. The children cross the traveller's line too rarely for the picture the bank round
  PROMISES (measured 17.08.2026 on `feat/687-roam-bound-fixes`; the user decided the same day to
  land the round as it stands and calibrate the density here). The round's acceptance is that the
  children play PAST the traveller, and the check that claimed it counted a crossing over the
  WHOLE simulation — roaming, gathering, running, regrouping alike — so drift while roaming
  satisfied it. Counted only while the round is actually RUNNING, three of four measured cases
  show NO child crossing at all inside the old 200 s window; over 600 s the four cases reach
  2/3/1/4 of four children, with the FIRST crossing at 251 s, 81 s, 447 s and 228 s of game time
  (bambara@42, bambara@2972259115, nubian@42, mandinka@99). A player standing at the stretch's
  middle therefore waits minutes for the thing the round exists to show. The mechanic is sound —
  this is density, not correctness, which is why it is deferred rather than blocking.
  FINAL STATE:
  - A traveller standing at the middle of the stretch sees a child pass him within a SHORT,
    stated wait — set the target as a balance value and name it here when it is chosen (a first
    guess: a crossing within ~30 s in the median case, every case under a minute).
  - It is reached through the round's OWN calibratable numbers (run length, the pause between
    runs, how the catcher picks its target, where the group re-forms) — all of them balance
    values the debug menu already edits. No new mechanism, and the round's rules do not change.
  - The measurement is the phase-coupled one: crossings counted ONLY while the round runs. The
    figures above are the baseline this point improves on, and the new figures replace them in
    the test's comment when it lands.
  ALSO OPEN, FOUND IN THE SAME MEASUREMENT: at three of the four seeds every run ended as a full
  three-tag sweep — zero arrivals, zero regroup phases — so the arrival `ROCK` call and the
  multi-run cycle effectively never play there. Judge whether the dodge is doing its job before
  calibrating the density, because a round that always ends in a sweep is also a round whose
  length is decided by something other than the numbers above.
  VERIFIABLE: the phase-coupled Vitest measurement over the same four cases, asserting the chosen
  target rather than "greater than zero"; plus the browser section's traveller check, which must
  see a child pass inside its window rather than at the end of a long one.
  Criticality: medium — nothing is broken, but the round's whole purpose is a picture the player
  currently has to wait minutes for.
  Author lane: astra.
  Why the lane: the communication mechanic is authored by Astra (user 08.09.2026); the
  rendered picture, the browser suites and the landing stay in the main session.
  Bundle: Dorfleben.

- [ ] 699. An actor label is drawn through the landmark label behind it (seen 17.08.2026 in the
  hold-Ctrl evidence frame `verification/147-ctrl-actor-labels.png`, on WebGL 2 and WebGPU
  alike, while judging the picture of the Ctrl layer's declutter). The declutter that point 628
  delivered keeps ACTOR labels apart from one another, and the picture proves it does. It does
  not know the OTHER label layer: the italic world labels of the discovery-gated map naming
  (`§17.2`). In the frame, the box `Adult giraffe` sits on top of `Unknown landmark` and cuts
  its last letters away — the same thing the player reported about two villagers, one layer
  further out. A zoomed crop is at `local/699-actor-over-landmark-label.png`.
  FINAL STATE:
  - The declutter reasons over EVERY drawn label box, not only the actor ones: a world label and
    an actor label that would overlap are separated by the same rule that separates two actor
    labels, and neither is drawn through the other.
  - Where they cannot both be placed, the ACTOR label yields — a world label names a place the
    player is navigating by, and it is the rarer of the two; a villager's name may wait a metre.
    If the measurement contradicts that ranking, say so and rank the other way, but rank it.
  - The measurement covers it: the sampled fusion check point 628 built (`scripts/verify/
    labelFusion.mjs`) takes the world labels into its rect set, so this defect fails a check
    rather than needing an eye. It must be shown to FAIL on today's code before it passes.
  VERIFIABLE: the fusion check extended and shown red on the current frame, green after; plus
  the picture — frame 147 with no box cutting into another, judged on both backends.
  Criticality: low — both labels stay half-readable and nothing is misnamed; it is the same
  visual untidiness one layer out, found while proving the layer below it correct.
  Bundle: Chat & Tafel.

- [ ] 725. The goat's release frame may still teleport the foot, and the test measures around it
  (GPT-5.6 Sol, 19.08.2026, in a review round spent as point 684's demanded real over-limit run —
  so this is a REVIEW VERDICT on landed code, not a play-session observation, and it is UNVERIFIED:
  nobody has reproduced it). The verdict on commit 9c9425a, the goat foot-planting work of point
  697, reads: `src/render/fauna.ts` clears `contact` on release but returns only a clamped release
  pose, so on the next still-in-stance frame `previous === null` recaptures the procedural endpoint
  and reproduces the same ~0.46-leg one-frame jump the change set out to remove — one frame later.
  It names the test as measuring around it: the case in `src/render/fauna.test.ts` asserts that the
  fresh pose reaches its new contact but never compares it against the PRECEDING release-frame
  position, and `stance: pose.contact !== null` keeps that very frame out of `judgeStanceSlip`, so
  the suite goes green over the jump rather than over its absence. That is the "looks-wrong-but-
  passes" shape our own rules warn about, which is why it is filed rather than dropped.
  FINAL STATE:
  - THE MEASUREMENT DECIDES THE POINT, and it comes first: the foot position is sampled across the
    release frame and the two frames around it, on a real animation, and the frame-to-frame
    distance is compared against the same threshold `judgeStanceSlip` uses. The number is recorded
    in the point's closing note whichever way it falls — a point closed by "no jump was measured"
    is a legitimate close, and the recorded number is what makes it one.
  - IF THE JUMP IS REAL, the release frame carries the foot from its held contact to the
    procedural endpoint over the frames the gait allows, so no single frame moves it further than
    the walk itself does.
  - THE MEASUREMENT WINDOW COVERS THE RELEASE FRAME EITHER WAY. Whatever the first step measures,
    a frame excluded from `judgeStanceSlip` is a frame no invariant watches: the release frame
    enters the judged set, so a future regression there fails a suite instead of passing one.
  THIS POINT OWNS WHAT THE GOAT-STANCE RED MEANS, AND MEASURES IT BEFORE ANYONE EXCUSES IT
  (20.08.2026). Point 642 carries — folded in from the withdrawn point 506 — the rule that a
  check whose subject is a RATE declares the throughput it needs and SKIPS below it, and it names
  `polish`'s goat planted foot as a member of that class (1 usable stance interval where it needs
  3). Read beside the verdict above, the two say opposite things about one red: a lane that
  cannot answer the check, or a product defect the check measures around. 506's own premise is
  already gone — re-measured 20.08.2026, `node scripts/verify/backend-lane-check.mjs` shows BOTH
  lanes hardware-backed on the same GPU, WebGPU at compatibility rather than core level, so there
  is no software lane left to blame — but that reading says nothing about what causes this red,
  and no third measurement exists. THE MEASUREMENT: the release-frame sampling above is run on
  the hardware lane, and the same run records how many usable stance intervals `polish` actually
  gets there. Both numbers go into the closing note whichever way they fall. Until they exist the
  check is neither excused as lane-limited nor charged as a defect, and 642 may not classify it.
  VERIFIABLE: Vitest over the pure pose logic — a sampled sequence across a release frame whose
  per-frame displacement stays within the gait's own step, and a synthetic sequence carrying an
  injected jump on exactly the release frame that FAILS, proving the window now covers it.
  Criticality: medium — it is one frame of one animal, but a test that measures around the very
  frame it was written for hides the next regression as reliably as this one.
  Bundle: Tierverhalten.

- [ ] 824. A killed authoring run strands uncommitted work that nothing drains, and the handover
  reports it as still running (measured 21.08.2026, 20:0x). The dispatching session died and took
  its delegated GPT-5.6 Sol run with it as a child process. The handover was half-complete by
  construction: the in-flight DECLARATION transferred correctly and the successor adopted it, but
  the run itself was dead, and the worktree held ten modified plus two new files that no commit
  covered. `docs/batch-owner-runbook.md` says "unpushed work drains first", and nothing enforces
  it — a drain only happens on the orderly path, which is exactly the path an unexpected death
  does not take.
  TWO FAULTS COMPOUND, AND THE SECOND HIDES THE FIRST: the adopted declaration named a pid that
  `kill -0` reported ALIVE, so the successor first judged the run to be still building. That pid
  was the short-lived shell wrapper, not the authoring process. Liveness was therefore asserted
  from a process that was merely dying more slowly than its child.
  WHAT IT COSTS: `scripts/author-sol.mjs` refuses to start on a dirty tree — correctly, so new
  work cannot be confused with pre-existing edits — so the stranded remains BLOCK the very
  continuation they belong to. The only way forward was a hand-written rescue commit (`16f71296`,
  `[skip ci]`, attributed to Sol) to get the tree clean again.
  FINAL STATE: a transferred declaration proves liveness against the AUTHORING process, not a
  wrapper, and reports a dead run as dead rather than as in flight. A worktree left dirty by a
  dead run has a named, recorded drain the successor can run — one command that preserves the work
  as an attributed, CI-skipped rescue commit and hands back a clean tree — instead of each
  successor reconstructing that by hand.
  VERIFIABLE: pure cases over the liveness judgement — a declaration whose authoring pid is gone
  reads NOT live even while a wrapper pid survives; a genuinely running author still reads live.
  Plus a case over the drain: a dirty worktree from a dead run yields a clean tree and a rescue
  commit carrying `[skip ci]` and the author model's trailer, and a dirty worktree with a LIVE run
  is refused instead of committed out from under it.
  QUEUE RANK: behind point 174, at the end of the order. Reason: it cost one session a manual
  repair, not correctness, and under the user's ruling of 20.08.2026 a machine-filed point of this
  urgency waits for the release.
  Criticality: medium — no data is corrupted, but delegated work is stranded and the board reports
  a run that no longer exists.
  Bundle: Session- & Repo-Hygiene.

- [ ] 827. The firewall that cuts Sol off is the image's copy, and nothing compares it with the
  repository (measured 22.08.2026, 01:57-02:05, after the user said the recurring Sol outage is
  ours to fix rather than his). The container boots the INSTALLED firewall script at
  `/usr/local/bin` (`postStartCommand`, `/workspace/.devcontainer/devcontainer.json:86`), and that
  script is BAKED INTO THE IMAGE by the Dockerfile (line 154, from the read-only outer
  `/workspace/.devcontainer` copy). The repository's own `.devcontainer/init-firewall.sh` is a
  DIFFERENT file and is never executed. Diffed on the day, the installed copy is missing exactly
  the hosts the repository added on 11.08.2026 after the previous outage — `auth.openai.com`,
  `api.openai.com`, `chatgpt.com`, plus `us.aws.cdn.hf.co` and `cdn.jsdelivr.net` — and nothing
  else differs. THAT IS THE WHOLE RECURRENCE: every container start rebuilds the ipset from the
  stale copy without Sol's hosts, a session tops it up by hand with `scripts/firewall-allow.mjs`,
  and the next VS Code restart throws the top-up away. The repository fix of 11.08. has therefore
  never taken effect once.
  WHAT ALREADY HAPPENED AND WHAT DID NOT: the live top-up ran, all three OpenAI hosts answer, and
  `node scripts/review-sol.mjs --probe` passes, so Sol works in the container that measured this.
  Installing the repository copy over the one at `/usr/local/bin` was refused by the main-write
  fence (point 821's subject) because that window held no batch lock, so the executed script is
  still the stale one and the NEXT RESTART BREAKS SOL AGAIN.
  FINAL STATE: (1) the executed firewall script is RECONCILED with the repository's copy rather
  than trusted — either the boot path runs the repository's file, or a session-start step installs
  it when the two differ — so a rebuilt image cannot silently reintroduce an old allowlist; (2) the
  drift is DETECTED AND NAMED, never silently repaired, because a divergence between the file we
  edit and the file that runs is the class of defect that has now cost this project its authoring
  lane twice; (3) the reconciliation can never seal the container: it installs, and where the
  running ipset lacks hosts the installed script names, it tops up ADDITIVELY through
  `scripts/firewall-allow.mjs` — never a flush.
  VERIFIABLE without a restart: Vitest over the pure comparison — identical files reconcile to
  nothing, a missing host is reported by name, an unreadable installed script fails soft — plus an
  assertion that the additive top-up is the only repair the reconciliation performs.
  NOTE FOR WHOEVER TAKES IT: the container has passwordless root (`sudo -n -l` reports NOPASSWD
  ALL), so the install itself is one command; the work is the detection and the test, not the
  privilege.
  QUEUE RANK: behind point 174, at the end of the order. Reason: the machine filed this point
  itself out of a drained finding, and the user ruled on 20.08.2026 that such a point does not
  overtake the release. The outage it describes is covered in the meantime by the live top-up
  (`scripts/firewall-allow.mjs`), which any session can repeat after a restart — that repair is
  what this point removes the need for, not what it waits on.
  Criticality: medium — it installs a file the container boots from, so its dangerous direction is
  a firewall that seals the container; the additive top-up and the never-flush rule are what the
  test pins.
  Bundle: Session- & Repo-Hygiene.

- [ ] 851. Re-running a cancelled CI run cancels the newer commit's run on the same branch.
  MEASURED 23.08.2026, 06:4x. `scripts/ci-failure-cause-core.mjs` tells the session that a
  cancellation can only be cleared by re-running the workflow — "No push in this repository can
  clear a cancellation — re-run the workflow and confirm it goes green" — and omits what that
  costs. `.github/workflows/ci.yml` uses concurrency group `ci-${{ github.ref }}` with
  `cancel-in-progress: true`, so re-running an OLDER sha's run on `main` joins the same group as
  the run for the branch tip and CANCELS it. Today that turned one cancellation into two:
  re-running 32617308480 (d0626dcc) cancelled the in-progress 32618119861 (f86464b9), which then
  needed its own re-run.
  FINAL STATE: the repair advice names the tip's run rather than the stale one, because the tip's
  verdict is the one the batch actually needs; where it still advises a re-run of an older run it
  says to do so only while no run for that ref is in progress, and to re-run the tip afterwards.
  VERIFIABLE: unit cases over the cause reporter — a cancelled older run while a newer run for the
  same ref is in progress yields advice that names the NEWER run and does not order an immediate
  re-run of the older one; a cancelled run that IS the tip yields the plain re-run advice
  unchanged.
  Criticality: low — no product behaviour; the cost is a self-inflicted second cancellation and
  the batch time spent clearing it.
  Bundle: Session- & Repo-Hygiene.

- [ ] 906. The delegated author's interim push cannot recover a branch it rewrote itself, and its
  failure report names an undefined range. MEASURED 25.08.2026 on `feat/894-daemon-control-plane`,
  during GPT-5.6 Sol's second review leg on point 894. The runner pushed two commits, then rewrote
  that same history locally — the trees were byte-identical on both sides (`2a98e852…`), only the
  parent chain differed. From that moment every interim push failed as `non-fast-forward … the tip
  of your current branch is behind its remote counterpart`, and `scripts/author-sol.mjs` retried the
  identical plain push for the remaining ten minutes of the run instead of reconciling. Two defects
  sit on that path. First, the interim push has no lease-gated recovery, so a branch the runner
  itself rewrote stays unpushable for the rest of the run and every later checkpoint is invisible on
  the remote — the exact exposure behind the house rule that only what was pushed survives. Second,
  the diagnostic that should name the unpushed commits printed `fatal: ambiguous argument
  'undefined..undefined'`, so it built its rev range from two undefined variables and reported
  nothing usable about what was at risk. The run's closing report then said `PUSH FAILED — the work
  is committed but only local`, which is true of the local ref and misleading about the work: the
  content was already on the remote. This is the same class as the 24.08.2026 entry in the
  retrospective timeline, but that one ended at the misleading report; this one adds that the run
  cannot get out of the state on its own. SEEN AGAIN 25.08.2026 on `feat/907-interpreter-stdin-write`:
  the run pushed `669b14e8`/`1430a855`/`a5293c31`, then rewrote the same three commits locally as
  `8e0a2341`/`c6988d8c`/`293ae43d` with a `Rescue:` body, and `git diff HEAD origin/…` was EMPTY —
  identical trees, different parents. The closing report again said the work was local-only, and the
  main session recovered it by resetting the local branch onto the remote tip it already matched.
  A THIRD INSTANCE, measured 27.08.2026 01:15-01:19 on `feat/953-never-started-ci-red`: the
  wrapper pushed the leg's two commits at 01:15:17, and at 01:18:49 the local branch carried two
  commits with the same subjects, a byte-identical tree (`91fd8e7b…` on both sides) and different
  SHAs, so the final push was rejected and the closing report again said the work was local-only.
  The main session recovered the same way as on 25.08. — proving the trees identical, then resetting
  onto the remote tip — which is a hand-measured escape, not a path, and the only push that would
  have "worked" from that state is a force push over the wrapper's own publication.
  FINAL STATE: the interim push reconciles a rewritten branch through the same lease-gated
  compare-and-swap the wrapper already uses for checkpoints — a rejected push is re-observed, an
  already-contained head is accepted, and a head that legitimately supersedes the remote is pushed
  under a lease on the observed tip rather than retried bare; a remote that moved outside the local
  history still refuses. The failure diagnostic names the actual commits at risk or says it could
  not determine them, and never prints an undefined range.
  VERIFIABLE: unit cases over the interim-push path — a runner that rewrites its own pushed history
  reconciles and reports the checkpoint transferred; a genuinely unpushed head still reports failure;
  a divergent remote still refuses; and the diagnostic on each of those three paths contains no
  `undefined` and names either the commits or its own inability to name them.
  Criticality: medium — it loses no work, but it blinds the remote for the rest of a run and its
  report sends the reader looking for work that was never lost.
  Bundle: Session- & Repo-Hygiene.

- [ ] 909. The test type-check has been red on main for a week, and no gate that runs says
  so. MEASURED 25.08.2026 on main at 745fb37b: `npx tsc -p tsconfig.vitest.json --noEmit`
  fails with three errors. `src/render/fauna.test.ts(803)` is a real type error — the loop
  initialiser `firstBody = { x: 0, z: 0, yaw: 0 }` lacks the `y` that commit 6cf23dea added
  to `FootPlantBodyPose`, so the inferred type no longer satisfies `footPlantPose`. The
  other two are TS7016 for `.ts` tests importing project `.mjs` with no declarations
  (`fauna.test.ts` → `scripts/verify/stanceSlip.mjs`, arrived 17.08.2026;
  `fableEscalationDoc.test.ts` → `scripts/author-routing-core.mjs`, arrived 19.08.2026).
  `tsconfig.vitest.json` extends `tsconfig.app.json` and re-includes the tests with
  `exclude: []` but sets no `allowJs`, so a `.ts` test importing a `.mjs` script is an
  error by construction.
  WHY IT WAS INVISIBLE, and this is the larger half: `test-types` runs ONLY in the local
  verify runner (`scripts/verify/run-all.mjs:379`). The GitHub workflow does not run it, so
  CI reported GREEN on main throughout; the landing fast gate (build, lint, unit) does not
  run it either, so no landing was ever stopped. A gate nothing routinely runs is not a
  gate, and a week is how long that took to notice.
  FINAL STATE: `tsc -p tsconfig.vitest.json --noEmit` is green on main, and a gate that
  actually runs would have caught it — either CI runs `test-types`, or the landing gate
  does, and whichever is chosen is the one the red is proven against.
  VERIFIABLE: the type-check green on main; a deliberately reintroduced type error in a
  test file measured RED by the chosen gate, not merely by a manual `tsc`; `npm run
  test:unit`, lint, build.
  Criticality: medium — it breaks no shipped behaviour, but it is a dark gate, and the
  three errors it hid are the evidence of what a dark gate costs.
  Bundle: Session- & Repo-Hygiene.

- [ ] 917. A closed point's branch and worktree outlived its merge, and the guard that should
  see it stood down instead. MEASURED 25.08.2026 on `main` at `8f158f91`: point 834 stands in
  `docs/tasks-archive.md`, so it is closed — yet `/workspace/hoa/.claude/worktrees/point-834`
  is still a registered worktree and `feat/834-durable-authoring-lane` is 122 commits ahead of
  `main`, i.e. it is NOT an ancestor of `main`. CLAUDE.md §6 is explicit that the merge ends the
  branch: local branch, remote branch and worktree all go.
  WHICH OF THE TWO IT IS MATTERS. Either the point landed through a different branch and those
  122 commits are spent rubbish holding a worktree open, or closed work is sitting outside
  `main` and the archive entry is a lie. Nothing may be deleted before that is decided.
  NOT THE SAME THING, and deliberately out of scope: the other eight worktrees (581, 595/598,
  686, 687 twice, 713, 734, 752, 847) belong to points still OPEN in `TASKS.md`. That is parked
  work, not a hygiene fault, and this point does not touch it.
  THE BACKSTOP DID NOT MEASURE. `node scripts/branch-hygiene-guard.mjs --status` answered only
  "steht zurück — another live session owns the batch lock" and reported no state at all. A
  stand-down is right for ACTING on another owner's tree; refusing to REPORT means the one
  command built to find this class of leftover cannot be used to find it.
  FINAL STATE: point 834's branch is decided on evidence — its content is either shown to be
  contained in `main` and branch plus worktree are removed with `scripts/worktree-cleanup.mjs`,
  or the gap is named and filed as its own point. And `branch-hygiene-guard --status` reports
  the measured state even under another owner's lock, marking clearly that it will not act.
  VERIFIABLE: Vitest over the guard's pure decision — a status request under a foreign live lock
  yields a full report with `mayAct: false`, while an ACTING request under the same lock still
  stands down; plus a case that a worktree whose point is archived and whose branch is not an
  ancestor of `main` is reported as a leftover, and one whose point is still open is not.
  MEASURED AGAIN 25.08.2026, at the landing of point 885 — and it names the likely cause of the
  whole pile: `land-point.mjs` refused to remove `/workspace/hoa/.claude/worktrees/point-885` and
  its branch, reporting "not a direct `agent-<id>` child of `.claude/worktrees/` — the harness did
  not create it". The worktree was standing on exactly the branch that had just been merged. Both
  had to be removed by hand with `scripts/worktree-cleanup.mjs` and `git branch -d/--delete`.
  Seven of the ten survivors are named `point-<N>` or `point-<N>-<slug>`, so a session that does
  not happen to name its worktree the way the harness would have gets no cleanup at all — while
  CLAUDE.md §6 states that the merge ends the branch and names no condition on its name. The
  guard's own load probe then counts every survivor as a live agent worktree, which is why the
  batch doctor keeps calling a red `test:unit` inconclusive on an otherwise idle host.
  ALSO IN FINAL STATE: cleanup removes the worktree standing on the merged branch whatever it is
  called, and refuses only what is genuinely not this point's — the detached baseline checkouts
  under `local/verify-baseline/` stay untouched.
  Criticality: med — no player-visible defect, but it is the one command that answers whether
  closed work is really in `main`.
  Bundle: Modell & Wächter.

- [ ] 926. The world suite's Victoria Falls frame misses its subject, and it has been red for
  a while. MEASURED 26.08.2026 on `main` (f14cf8e9) with
  `node scripts/verify/baseline-classify.mjs world --ref main`: the frame
  `15-worldmodel-victoria-falls` fails with "its subject is not in the rendered picture: off
  the left and bottom edge of the frame", red in BOTH baseline runs, and red again in the
  point-595 proof run on its merge candidate. It is NOT point 595's: the landmark loop and the
  check are byte-identical between `main` and that branch apart from the section wrapper's
  indentation, so 595 neither caused the red nor tightened the check — it is only the run that
  finally read it out loud.
  IT IS NOT THE VICTORIA FALLS — IT IS THE LANDMARK LOOP. Measured the same night on the
  WebGL 2 lane of the same tree: there Victoria Falls PASSES and
  `11-worldmodel-khartoum-confluence` fails instead, with the identical symptom "off the left
  and bottom edge of the frame". One frame out of the seven-landmark loop misses its subject on
  every run, and WHICH one it is moves between the lanes. So the camera aim for any single
  landmark is NOT the defect; the loop's staging is: `jump(lat, lon)` returns before the camera
  has settled where the shutter then judges it, and whichever landmark the shutter catches
  mid-flight is the one that reddens. A verdict reached by nudging one landmark's coordinates
  until its check goes green would only move the red to the next frame, and that is exactly the
  papering-over CLAUDE.md §7.2 forbids.
  FIRST JOB is therefore to make `jump` wait on the state the shutter reads — the same class as
  the point-489 blank picture and the point-375 shutter, one layer further out — rather than to
  re-aim a camera.
  THE FRAME IS ACCEPTANCE EVIDENCE for criterion 3 (world model) and 13 (real geodata), so a
  frame the shutter refuses is a missing proof, not a cosmetic blemish.
  VERIFIABLE: `npm test -- world` green whole-suite on WebGPU and WebGL 2 — all seven landmark
  frames present in `verification/` with their subjects visibly in the picture, on BOTH lanes
  and without a retry, since a red that moves between frames is precisely what a single green
  run cannot rule out.
  Criticality: medium — acceptance evidence is missing, but nothing in the game is broken by it.
  Bundle: Testinfrastruktur.

- [ ] 927. The F6 bug report hands the user an archive WITHOUT the picture. MEASURED
  26.08.2026 on `main` (f14cf8e9) with `node scripts/verify/baseline-classify.mjs report --ref
  main`: three checks of the report suite fail — "the archive holds picture, state, overlay and
  description" (the zip holds only `.json`, `-overlay.json` and `.txt`), "member `<stem>.png` is
  present" and "the archive carries a screenshot — no PNG member". Red in BOTH baseline runs,
  and red again in the point-595 proof run on its merge candidate. It is NOT point 595's: the
  archive block is byte-identical between `main` and that branch apart from the section
  wrapper's indentation.
  THIS IS A PRODUCT DEFECT, NOT A TEST DEFECT, and it is the worse half of the two reds found
  that night: the picture is the whole reason the report exists, and the report is the channel
  the user hands bug reports over on. Every archive taken since the regression is worth less
  than it looks.
  IT IS A WEBGPU-ONLY DEFECT, measured the same night: the identical tree run on the WebGL 2
  lane passes the report suite whole, 33 checks, with all four members present. Only the WebGPU
  lane loses the picture — and WebGPU is the everyday lane the player gets, so the defect sits
  on the path that matters, while the green lane is the control proving the assembly itself is
  sound. That narrows the cause to the canvas readback: a WebGPU canvas read outside the
  rendered tick, or without the backbuffer preserved, yields an empty or failing capture where
  WebGL 2 still hands one out.
  THE SECOND HALF OF THE POINT IS THE SILENCE, and it is the half that let this run unnoticed:
  the assembly DROPS the member instead of failing, so a picture-less archive looks exactly like
  a good one. An archive that cannot carry its picture must say so, in the UI, at the moment it
  is written.
  VERIFIABLE: `npm test -- report` green whole-suite on WebGPU and WebGL 2 with all four
  members present; a Vitest case that the assembly REFUSES to hand out an archive whose picture
  is missing rather than shipping three members quietly; plus lint, build, `npm run test:unit`.
  Criticality: high — a silently picture-less bug report is a broken channel to the user, and it
  degraded unnoticed.
  Bundle: Testinfrastruktur.

- [ ] 939. The 19.08. `webgpu/startup` red is a dev-server transient with no owner (measured
  26.08.2026 on `.claude/render-verify-state.json` while answering point 734's sixth round). The
  run of 19.08.2026 12:09:17 carries one unaccounted console red: "Failed to load resource: the
  server responded with a status of 504 (Outdated Optimize Dep)" — Vite's dependency optimizer
  re-bundling in the middle of the run. By CLAUDE.md's own classification that is an
  ENVIRONMENT/STAGING transient, which fails soft, and not a product defect; but the recorder
  captured it as an ordinary console red, no open point owns it, and the ledger may not charge an
  unfiled red. So a transient that the rules say to fail soft on blocks the gate exactly as a
  product defect would.
  FINAL STATE:
  - THE LANE STOPS PRODUCING THIS RED. The dev server is warmed before the suite starts, so the
    optimizer has re-bundled before the first navigation rather than during it.
  - THE CAPTURE KNOWS THE DIFFERENCE. This exact 504 signature is classified as environment rather
    than product where the console capture decides, and the run says which it saw — a soft-failing
    transient must not be indistinguishable from a defect in the record.
  - THE STORED RUN GETS ITS DISPOSITION through the retroactive route point 734 provides, so it
    stops blocking without a `--defer`.
  VERIFIABLE: Vitest over the console classification — the exact 504 text is read as environment,
  a neighbouring 504 from the app itself is NOT; a warm-up whose absence reproduces the red at
  least once; and the stored 19.08. run accounted for in `--status`.
  Criticality: medium — one run, one line, but it is the cheapest possible demonstration that the
  gate cannot tell a broken machine from a broken game, and that confusion is what makes a red
  gate get waved through.
  SEEN AGAIN 13.09.2026 ON A LANE THE LEDGER CANNOT REACH, and that is the half this point did not
  know it had. The covering picture run of point 1072, `webgpu/flow` on main at 88e6aec92: first
  attempt 36 pass, 0 fail and exactly two console reds, both this 504, the retry clean at 36 pass /
  0 console errors, 8 of 8 frames written on both attempts. So far it is the same transient as the
  four lanes already charged. What is NEW is that no charge could be written for it: `flow` prints
  its console errors inside the tail block rather than as top-level `ERR:` lines, so the recorder
  stored the failing run with NO `reds` array at all, the retry marker fell back to
  `SUSPECT_UNNAMED`, and the run reads as "the first attempt failed without naming a check". A
  ledger entry for that placeholder would excuse every future unnamed failure of the lane —
  including a crash — which is precisely the over-broad signature the charge table forbids, so the
  only valve left was `--defer`. The third bullet of the FINAL STATE therefore has a second
  addressee: as long as a suite's console reds do not reach the record under their own names, the
  disposition route cannot be applied to them at all, and the lane can only ever be deferred.
  THE CAUSE IS NOW MEASURED, not only described (14.09.2026, three `flow` runs on main in one
  sitting). `scripts/render-verify-recorder.mjs` keeps a result line only when it is anchored at the
  line START (`KEPT_LINE`: `FAIL`, `ERR:`, `console errors:`), but `flow` prints its console errors
  INDENTED inside its own tail block — `      | console errors: 2` and then `      |   - <text>`.
  Nothing matches, so the record is written with no `reds` array at all (checked in
  `.claude/render-verify-state.json` for all four `flow` failures of 13. and 14.09.), the guard
  synthesises "the run failed without reporting a single red", and the retry falls back to
  SUSPECT_UNNAMED. That is why THIS lane, alone among the suites, can never be charged, and why
  points 1072, 1073 and the session of 14.09. each had to write the same `--defer` by hand.
  THE TRANSIENT ITSELF IS THE COLD CACHE, reproduced the same morning: the first browser run after
  a push had changed source files reported the two 504s, and the two runs after it — WebGL 2 and
  WebGPU, cache now warm — were clean on the FIRST attempt, 36/0/0 and 8/8 frames each. Warming the
  dev server before the suite starts, the first bullet above, is therefore the whole remedy.
  Bundle: Session- & Repo-Hygiene.

- [ ] 948. A red vitest type-check reached `main` and blocked every tier for every point (measured
  26.08.2026, 17:39, on `main` fe9ee0dc). `tsc -p tsconfig.vitest.json` failed with three errors:
  two implicit-any `.mjs` imports in `fableEscalationDoc.test.ts` and `fauna.test.ts`, and one
  `FootPlantBodyPose` call missing `y`. The verify tier stops at `test-types`, so NO point could
  reach its suites until 928faee1 repaired it. The repair is landed; the CLASS is not. The open
  question is how the landing gates of the points that introduced those imports and that call
  reported green — either they never ran the vitest tier, or the type-check was skipped for them.
  FINAL STATE:
  - THE GATE'S OWN RECORD ANSWERS IT. For each of the three offending commits it is established
    from the recorded run whether `test-types` ran, was skipped, or was never reached, and the
    finding names which of the three it was. A gate whose record cannot answer that question is
    itself the defect.
  - THE HOLE THAT LET IT THROUGH IS CLOSED, wherever the answer puts it: a tier that reports green
    while `test-types` did not run, a landing that accepts such a record, or a skip path that no
    longer has a reason to exist.
  VERIFIABLE: Vitest over the tier's own reporting — a run in which `test-types` did not execute
  cannot produce a green verdict, and the record it writes names the omission. Plus the historical
  proof: the three commits are classified from their stored records, not from a re-run.
  Criticality: high — it is a repository-wide stop, it hit every point at once, and the mechanism
  that should have caught it reported green.
  Bundle: Testinfrastruktur.

- [ ] 949. A module that resolves repository paths from `import.meta.url` sends a fixture's reads
  and writes back into the live checkout (measured 26.08.2026, 17:57). `scripts/verify/run-record.mjs`
  derived its log directory from the module's own location, so the fixture repository that
  `scripts/dashboard-reminder-hook.test.mjs` builds — `HOA_REPO_ROOT` plus cwd both in a temp dir —
  still saw the LIVE verify run. Both of that test's cases were therefore red in every tier run
  since 1e4a25b9 (22.08.2026) and green standalone; a red that appears only inside the gate is the
  hardest kind to see. Repaired in 6e30025f for that one module. The CLASS is the point: every
  module that resolves repository paths from `import.meta.url` instead of `repo-paths.mjs` can do
  the same thing, and a fixture that reads live state is a test that proves nothing.
  FINAL STATE:
  - THE SWEEP IS DONE AND NAMED: every `scripts/` module that derives a repository path from
    `import.meta.url` is enumerated, and each is either moved onto `repo-paths.mjs` or carries a
    written reason why its own location is the honest source.
  - IT CANNOT COME BACK: a guard refuses a new repository-path resolution from `import.meta.url` in
    the paths the sweep cleared, and names `repo-paths.mjs` in the refusal.
  VERIFIABLE: Vitest — a fixture repository built in a temp dir sees ONLY its own state for each
  swept module (the negative control being the pre-6e30025f behaviour, which must fail the case);
  and the guard refuses a planted `import.meta.url` path resolution in a cleared file.
  Criticality: high — it silently converts fixtures into readers of live state, and it hid two red
  cases inside the gate for four days.
  Bundle: Testinfrastruktur.

- [ ] 951. Three verification suites navigated into a 90 MB CDN download, and one of them died
  saying nothing at all (measured 26.08.2026, 18:25, with a request probe). `flow`, `world` and
  `preview` navigate with `waitUntil: 'networkidle'` while `speech.ts` pre-warms the Kokoro model at
  game start; the only request still open at the 30 s timeout was the model body on
  `us.aws.cdn.hf.co`. `flow` died UNCLASSIFIED — no FAIL line at all — in both attempts of every
  run, so its red said nothing about the code. `handwriting.mjs` had already met and documented the
  same cause; the remedy, consuming the cache `voice.mjs` records, is now in all four. TWO THREADS
  STAY OPEN, and they are this point:
  FINAL STATE:
  - THE CACHE ACTUALLY SERVES. `voice` reported `hits:0 misses:12` against a cache marked COMPLETE
    on 04.08.2026; in strict mode a complete cache must serve, so the recorded keys are established
    against the assets the app really requests, and either the keys or the recording are corrected.
    The measured result is `hits:12 misses:0`, or a written reason why a miss is legitimate.
  - A SUITE THAT REPORTS ZERO CHECKS IS A LOUDER VERDICT THAN ONE THAT FAILS A CHECK. An
    unclassified death is reported as its own kind, distinct from a failure, and it never passes as
    a plain red whose cause is left to the reader.
  VERIFIABLE: the `voice` run's own hit/miss counters against the COMPLETE cache; and Vitest over
  the verdict layer — a suite that completes zero checks produces the unclassified verdict with its
  own text, while a suite that fails one check keeps the ordinary failure verdict.
  Criticality: medium-high — it cost three suites their meaning and one of them reported nothing at
  all, which is the worst thing a verification lane can do.
  Bundle: Testinfrastruktur.

- [ ] 968. A render path that can never cover itself keeps the picture gate shut. MEASURED
  27.08.2026, 10:26-10:35: `scripts/render-verify-core.mjs` counts every `scripts/verify/*.mjs`
  outside its `NON_RENDER_VERIFY` list as a render path, so point 963's edit to
  `scripts/verify/board-layout.mjs` reopened the picture gate for BOTH backends, on top of the
  game-render paths that a clean full `polish` pass on WebGPU (06:35) and WebGL 2 (06:57) had
  already covered. But board-layout cannot answer that gate at all: it draws no game view, it
  launches `chromium` directly instead of going through `scripts/verify/_browser.mjs`, so it never
  arms `render-verify-recorder.mjs`, and it never records a screenshot — it measures
  `getBoundingClientRect()` over the published board. I ran it green on both backends (66 pass each,
  0 fail, 0 console errors); neither run was recorded and neither covered anything. The gate could
  then only be answered by re-running an unrelated ~46-minute `polish` pass or by a deferral.
  FINAL STATE: a browser suite that renders no game view and selects no GL backend is not a render
  path, so editing it never opens the picture gate; and no suite can be classified as a render path
  while being structurally unable to record a covering run — the two facts are decided by one rule
  rather than by two lists that can drift apart.
  VERIFIABLE: Vitest over the classifier — `scripts/verify/board-layout.mjs` is not a render path;
  a suite that goes through `_browser.mjs` still is; and a case that asserts every path the
  classifier calls a render path is reachable by a run the recorder can actually write.
  MEASURED AGAIN 27.08.2026, 17:50 while landing point 969, which shows the cost is recurring and
  not a one-off: the same edit to the same suite reopened the gate, green runs on WebGPU AND
  WebGL 2 at the same HEAD (132 checks each) covered nothing, and the only way past was a logged
  deferral — the second one this file has needed in a day. That is the failure mode: the loud
  escape becomes the routine route and stops being read. It also cost a duplicate point (972),
  written before the bundle check found this one — the fourth time that has happened.
  Criticality: med — it does not lose work, but it blocks the picture gate behind a run that has
  nothing to do with the change, which is how deferrals get written for the wrong reason.
  Bundle: Testinfrastruktur.

- [ ] 991. A run record has no identity of its own, so indistinguishable records share one
  signature. MEASURED 28.08.2026, rounds 11 and 12 of point 734, which refused the argument that
  two real runs always differ in their millisecond stamps and asked for a mechanism.
  `runIdentity` in `scripts/render-verify-core.mjs` hashes the record's whole canonical CONTENT
  (the round-5 decision) into 64 non-cryptographic bits, and `signedClosureDraft` in
  `scripts/render-verify-guard.mjs` de-duplicates the open runs by it and signs `open[0]`. Two
  records are therefore one identity in TWO ways: byte-identical content — one run written twice,
  or two runs that really happened in the same millisecond on both stamps with the same head,
  exit, screenshot list and reds — and a hash collision between records that differ.
  WHAT IT COSTS: no coverage — a signed closure never makes a run cover a backend — so the worst
  case is one evidence sentence disposing of two records that were not the same measurement. It
  was decided on 28.08.2026 to keep CONTENT and state both residuals at the site, because a
  record-time id reaches no record already on disk and the fallback would reintroduce the two
  disagreeing identities the fifth round removed.
  FINAL STATE: the recorder writes a unique `runId` at record time; `runIdentity` prefers it and
  falls back to the content hash for a record written without one; the closure route names one
  and only one record either way, and the CLI's `--run <id>` keeps working for both shapes.
  VERIFIABLE: Vitest — two records identical in every other field but carrying different `runId`
  values are two open runs the draft refuses to sign blind and offers by id; a record without a
  `runId` still closes by its content hash; an existing closure on file still matches the record
  it was written for.
  Criticality: low — it costs no coverage and both families it serves are legacy classes.
  Bundle: Session- & Repo-Hygiene.

- [ ] 996. A result line arriving as malformed bytes is stored under a name the suite never
  printed, and the record still reads complete. MEASURED 28.08.2026 by the twenty-seventh and
  twenty-eighth cross-vendor rounds of point 734. The tap decodes byte writes through a
  `StringDecoder` (`feedBytes` in `scripts/render-verify-recorder.mjs`), which substitutes U+FFFD
  for any sequence it cannot read — there and then, not at `end()`. A `FAIL` or `ERR:` line
  carrying such a sequence therefore reaches `record.reds` under an identity nothing can match a
  charge or a closure to, while `truncated` stays unset and the run counts as a complete recording.
  Point 734 marks the other half — the INCOMPLETE tail `end()` surfaces — because that one is
  exact.
  WHY IT IS ITS OWN POINT AND NOT A LINE IN 734: marking this needs telling a SUBSTITUTED U+FFFD
  from one the suite legitimately printed. Round 27 counted substitutions against the EF BF BD the
  decoded window itself carried, and round 28 measured what that costs — a legitimate U+FFFD split
  across two decode windows or two writes is emitted in the later piece, whose bytes no longer
  carry the sequence, so the count reports a substitution that never happened and calls a sound run
  INCOMPLETE. A false truncation blocks the render set, which is the failure point 734 exists to
  end, so the marking was withdrawn and the reason pinned by a Vitest case.
  FINAL STATE: the tap can say whether a decode really substituted — a fatal `TextDecoder` in
  streaming mode, a decoder that reports it, or a per-stream accounting that survives a split — and
  a result line that was substituted marks the run as an incomplete recording, while a line that
  merely PRINTS U+FFFD marks nothing.
  VERIFIABLE: Vitest over the real tap — malformed bytes inside a result line set `droppedLines`,
  a legitimate U+FFFD split across two writes does not, and neither does one delivered whole.
  Criticality: low — it needs a suite to emit malformed UTF-8, which none has; it is filed because
  the silent rename is exactly what point 734 forbids everywhere else.
  Bundle: Session- & Repo-Hygiene.

- [ ] 1009. The benchmark run borrows the world and never gives it back, and it leaves `Math.random`
  replaced (measured 29.08.2026 in the LARGE run on `feat/687-roam-bound-fixes`, WebGL 2, then
  classified against the merge-base `4acf6039abe0`: all six checks are already red on `main`, so
  this is not the branch's).
  Six checks of `scripts/verify/benchmark.mjs` fail on every run and NOTHING owns them: no open
  point names them and `scripts/render-verify-charges.mjs` carries no `benchmark` entry at all. A
  red with no owner is exactly what CLAUDE.md §7.2 forbids — it rides along in every LARGE run and
  trains the reader to skip it.
  WHAT IS MEASURED: `restored: ssaoEnabled — false -> true`, `restored: travelZoom — 1.5 -> 0.5`,
  `restored: travelSpeed — 7.25 -> 5.6`, `restored: seed — 18900701 -> 42`, `restored: day — 181 ->
  0`, and `Math.random is the original function again`. The F8 measurement run BORROWS the world to
  make its rows comparable — it pins a seed and a day, fixes the travel zoom and speed, forces the
  SSAO switch, and replaces `Math.random` so the same frame is drawn twice the same way — and it
  returns none of it. The last one is the one that spreads: a session that has pressed F8 keeps a
  patched `Math.random` for the rest of its life, so every later check and every later minute of
  play draws from the benchmark's generator rather than the game's, and a world at seed 42 on day 0
  is not the world the player stood in before pressing the key. The two WebGPU timestamp rows fail
  on the baseline in the same run and belong to the same lane.
  FINAL STATE: the benchmark restores every value it changed — the five settings by name and
  `Math.random` by identity — whatever exit path it takes, including a throw and an early abort,
  because a measurement that can poison the session it ran in is worse than no measurement. What it
  borrowed is recorded in one place rather than assumed at each call site, so a value added to the
  run cannot be forgotten on the way back. If a value genuinely CANNOT be restored, the run says so
  by name and the check asserts that named exception rather than passing silently.
  VERIFIABLE: the six named checks go green in the `benchmark` suite on both backends; a Vitest
  case that a benchmark run which throws mid-way still restores every borrowed value and the
  original `Math.random`; and a case that adding a borrowed value without registering it fails,
  so the next one cannot be forgotten the same way.
  Criticality: medium — it loses no code and no save, but it silently changes the world and the
  random source of any session that measured itself, and it has stood unowned in every LARGE run.
  ALSO MEASURED 19.11.2026 (main ae28726, WebGL 2): the world behind the finished benchmark dialog
  renders black in `verification/136-benchmark-report.png` (WebGPU shows the street); likely the same
  unreturned world — the fix's WebGL 2 frame must show the scene again, else file it separately.
  Bundle: Session- & Repo-Hygiene.

- [ ] 1011. The WebGPU compatibility lane throws five console errors in every run that no charge
  names (measured 29.08.2026 in the LARGE run on `feat/687-roam-bound-fixes`, WebGPU,
  recorded featureLevel=compatibility, twice in the same run).
  `scripts/verify/settings.mjs` records two console pseudo-checks that `scripts/render-verify-charges.mjs`
  does not match: `THREE.WebGPURenderer: Async render pipeline creation failed
  (renderPipeline_ShadowMaterial_1867 / _1868, renderPipeline_MeshStandardMaterial_25 / _1005,
  renderPipeline_MeshStandardNodeMaterial_999 / _1006, renderPipeline_RenderPipeline_9350):
  [Invalid TextureView] is invalid due to a previous error` and `Uncaptured WebGPU
  GPUValidationError: [Invalid CommandBuffer from CommandEncoder "renderContext_11/_14/_32/_42"]
  is invalid due to a previous error`.
  A CAUSE IS SUSPECTED AND NOT ESTABLISHED — and the difference is the whole of this point.
  Point 514 §5 describes a root that would explain these: on the compatibility lane the MSAA
  fallback cannot exist, `RGBA16Float does not support multisampling` arrives as an uncaptured
  GPUValidationError, and its own `why` already lists "the invalid msaa-texture/view/command-buffer
  and async-pipeline errors" as that cascade. But NOTHING IN THE RECORD TIES THESE TWO TEXTS TO
  THAT ROOT: a charge reads one red and never the run around it, so the connection is a reading,
  not a measurement. What IS measured is only this: two compatibility-level WebGPU runs of
  29.08.2026 emitted both texts, and 514's four `match` patterns cover only `RGBA16Float ... does not sup`, `[Invalid Texture "output-msaa"]`,
  `[Invalid Texture "normal-msaa"]` and `[Invalid TextureView] is invalid due to a previous error`.
  The two texts above begin differently, so the anchored patterns never reach them and the same
  measured lane fault blocks the gate through a third door.
  FINAL STATE: every console error of this cascade that the compatibility lane emits is either
  matched by a charge scoped exactly as its siblings are — `suite: 'settings'`, `backend: 'webgpu'`,
  `featureLevel: 'compatibility'`, `kind: 'console'` — or the lane records the MSAA family as
  UNAVAILABLE rather than red, which is the decision point 514 owes anyway. Scope stays narrow on
  purpose: on a CORE adapter, the one the player runs, each of these stays a real red.
  A CHARGE WAS WRITTEN FOR THIS AND WITHDRAWN, 30.08.2026 — read this before writing another.
  Two cross-vendor rounds (GPT-5.6 Sol, effort high) returned do-not-merge on every pattern tried,
  and the second one named why the family cannot be charged from the record as it stands:
  - The stored console NAME is normalised to 120 characters. For the longest object measured,
    `renderPipeline_MeshStandardNodeMaterial_1006`, the cut lands at `[Invalid Tex` — BEFORE the
    cascade's own marker, `is invalid due to a previous error`. So the name can carry the prefix
    and the downstream object's first letters, and nothing that establishes the root.
  - The untruncated DETAIL does carry the whole sentence, but these seven texts share ONE derived
    key while naming SEVEN different pipeline objects, so the recorder marks the detail VARIED and
    refuses any `detailMatch` against it. That safeguard is working, not failing.
  Every pattern that still matched the measured reds therefore also matched an unrelated pipeline
  or command-buffer failure on the same lane — which is the one property a charge must never have.
  FILING THIS POINT IS THE DISPOSITION; an over-broad charge would not be one. The reds stay REAL
  REDS and the render gate stays blocked on them until this point or point 990 lands, and 990 is
  the one that would make a charge writable at all: it owns letting an entry declare the ROOT its
  downstream sentence depends on. This point should be worked AFTER 990 for that reason.
  VERIFIABLE: the `settings` suite's recorded console reds on a compatibility-level WebGPU run are
  all accounted for by `node scripts/render-verify-guard.mjs --status`; and a Vitest case in
  `render-verify-core.test.mjs` that whatever mechanism closes them matches the measured text and
  does NOT match the same wording without the cascade's signature.
  Criticality: medium — it loses nothing and the cause is known, but a red nobody owns teaches the
  reader to skip the whole report, which is the habit every charge in that table exists to prevent.
  Bundle: Session- & Repo-Hygiene.

- [ ] 1012. The measurement runs demand GPU timestamps from an adapter that has none (measured
  29.08.2026 in the LARGE run on `feat/687-roam-bound-fixes`, WebGPU, recorded
  featureLevel=compatibility, twice in the same run).
  Two checks of `scripts/verify/benchmark.mjs` fail: `WebGPU: real GPU timestamps were measured
  for every row - 0/33 rows, reason "adapter without the timestamp-query feature"` and `WebGPU:
  real GPU timestamps were measured for the low-preset rows too - 0/3 low rows with gpu`. The red
  text states its own cause: the adapter does not expose `timestamp-query`, so no run on this lane
  can ever turn these two green. Point 1009 already records that "the two WebGPU timestamp rows
  fail on the baseline in the same run and belong to the same lane", but 1009's subject is the
  benchmark BORROWING the world and not giving it back - its final state and its verifiable list
  name only the five restored settings and `Math.random`, so the timestamp pair rides along in its
  prose without an owner that can close it.
  FINAL STATE: a capability the host does not have is reported as UNAVAILABLE, not as a failure.
  The benchmark asks the adapter for `timestamp-query` before it asserts on timestamps; where the
  feature is absent the two checks record the absence by name and the run stays green on that
  count. On an adapter that DOES expose the feature a missing timestamp stays a real red - the
  point removes a false verdict, never the assertion.
  VERIFIABLE: the two named checks report UNAVAILABLE with the adapter's feature list on the
  measured compatibility lane and the `benchmark` suite no longer reds on them; a Vitest case that
  an adapter reporting `timestamp-query` still fails the checks when rows carry no GPU time, so the
  assertion survives where it can be asked.
  Criticality: low - it costs no code and no data, but it is a check that cannot pass on the lane
  it runs on, which is a red trained to be ignored.
  Bundle: Session- & Repo-Hygiene.

- [ ] 1043. The speech-label check stands on one figure, and that figure is a coin toss.
  `polish --section=speech-hypothesis` picks a figure of the maasai village to speak over and
  proves the label sits ON it by ray-probing the rendered scene: the first surface along the
  sight line must be the figure itself, `0.85 <= hitDistance / targetDistance <= 1.15`. Ten
  named figures are offered to it, each at two stand-backs.
  MEASURED 02.09.2026, WebGL 2, on `feat/686-five-word-lexicon-game` and on the merge-base
  `1ae86eb2a` alike: the probe list is IDENTICAL run to run for the first five figures —
  `2.00@ground-disc, 2.00@ground-disc, 0.21@CylinderGeometry, 1.15@BoxGeometry, 1.58@ground-disc,
  1.58@ground-disc, 1.56@ground-disc, 1.58@ground-disc, 1.57@ground-disc, 1.58@ground-disc` — so
  five of the ten candidates NEVER qualify, deterministically, and the whole check hangs on
  figure #5, whose own probe reads `0.97@SphereGeometry` on a run that passes and
  `1.57@ground-disc` on one that does not. A ratio of 1.55-1.58 is the signature of a ray that
  sailed PAST the figure and hit the ground beyond it.
  WHAT IT COST: two SUSPECT records and one unaccounted red against the 686/687 merge candidate
  on 02.09.2026, none of them that candidate's. IT IS NOT THAT CANDIDATE'S: sampled the same day
  with `polish --section=speech-hypothesis` on WebGL 2, THREE of NINE section runs on the
  merge-base code went red on the first attempt (twice this check, once two console errors) and
  NONE of four did on the branch. The flake is pre-existing and belongs to no landing.
  A SECOND CHECK OF THE SAME SECTION, AND THE SAME FRAGILITY (measured 03.09.2026,
  06:09:56Z, webgl/polish in the LARGE run on `feat/1047-bank-game-readable`): `the
  speaking figure itself stands in the frame, under its note (point 485)` wants the body
  under its label in at least six of eight sampled frames and read `body at (651, 776),
  label bottom 700 — 3/8 frames`. The speaker WALKS through the sampling, so the check
  measures whether a walking figure stays in its note's column for eight shutters — the
  same staleness that makes the candidate probe a coin toss, one step further along.
  IT IS NOT THE BANK-GAME BRANCH'S. Sampled the same day with
  `throttle-probe polish --section=speech-hypothesis --no-throttle --runs 6` on a quiet
  host (load 0.6), on BOTH sides: six runs on `main` at 7913c60e9 and six on the branch
  at ec2ed0280 — TWELVE section runs, and this check went red in NONE of them. (One of
  the twelve reddened on the Vite optimize-dep 504 that point 939 owns, on the WebGL 2
  lane, where 939's ledger entry is scoped to WebGPU.) So the single occurrence is
  unreproduced on either side and says nothing about the change under it; it is charged
  to this point in `scripts/render-verify-charges.mjs`, scoped to a sample that fell
  SHORT of the bar — a run that measured nothing at all is a different red and stays
  real.
  WHAT POINT 1058 CHANGED UNDER THIS POINT (06.09.2026). The second check named above —
  `the speaking figure itself stands in the frame, under its note (point 485)` — is no
  longer this point's. It stopped being a flake on 04.09.2026, went red in five of six
  runs on a quiet host, was filed as 1058, and 1058 measured the cause from the frames:
  the note sat correctly over its speaker in EVERY sample, and the body walked out of the
  frame SIDEWAYS (bodyX 496, 360, 234, 123, 11, -70, -140, -208 of a 1440-wide viewport)
  because the block aimed its camera ONCE and then took eight shutters of a figure that
  the paired DIG summons sends off to its site in the same breath as its word. The shot
  now follows its subject before every sample, so this point's third final-state bullet —
  the chosen speaker judged where it IS — is already met for that check, and its charge in
  `scripts/render-verify-charges.mjs` is retired with 1058. What remains open here is the
  FIRST half: the candidate probe whose first five figures never qualify, and a check that
  rests on figure #5 alone.
  Final state:
  - WHY THE FIRST FIVE NEVER QUALIFY IS MEASURED, not guessed. The probe aims at
    `e[13] + max(0.4, scaleY)` above the figure's own origin and reads the group's scale; either
    that height misses those figures, or they carry no geometry `__placeRayHit` can see at all.
  - The check then rests on more than one candidate, or it says out loud that it rests on one
    and why that is the best the scene can offer.
  - AND THE CHOSEN SPEAKER IS JUDGED WHERE IT IS. Whatever the section asserts about the
    note over a figure holds for a figure that KEEPS WALKING while the samples are taken —
    either the sampling follows it, or the check says in its own text that it accepts a
    minority of frames and why.
  - The two console errors observed on one attempt of the same section are named, or shown not
    to exist.
  Test: the browser section stays the proof; the fast layer pins whatever selection rule
  replaces the current one.
  Criticality: medium — it blocks landings that have nothing to do with it, and a retry-green is
  SUSPECT, which covers no backend at all.
  Refs: scripts/verify/polish.mjs (section speech-hypothesis), src/scenes/place/PlaceScene.tsx
  Author lane: astra.
  Why the lane: the communication mechanic is authored by Astra (user 08.09.2026); the
  rendered picture, the browser suites and the landing stay in the main session.
  Bundle: Testinfrastruktur.

- [ ] 1044. A crashed suite's stack is swallowed before any log can keep it, so the sign-off
  the picture gate asks for cannot be given.
  `render-verify-guard --crashed` asks for "what the kept log shows — the death". Twice now a
  landing has stalled on exactly that: four crashed records on 29.08.2026 (the reason point 1016
  was filed, which recorded the kept log as a FILTERED view and declined to sign) and six on
  02.09.2026, all with `crashSource: uncaught-exception` and no death visible anywhere.
  MEASURED 02.09.2026, both halves:
  - `run-logged.mjs` is NOT the filter. Its `consume()` calls `log.write(text)` on every raw
    chunk, so the kept log holds the whole stream it is handed; only the CONSOLE echo is
    selected. The 29.08.2026 reading was wrong about which layer loses the line.
  - `run-all.mjs` IS the filter. `runSuite` spawns each suite with `encoding: 'utf8'` rather
    than `stdio: 'inherit'` and echoes only lines matching `/^FAIL|ERR:/`; the twelve-line tail
    that would carry the stack is echoed ONLY when the suite exits non-zero with NO FAIL line
    (`scripts/verify/run-all.mjs:207-213`). A suite that prints a FAIL and THEN dies therefore
    loses its stack before run-logged ever sees it — which is the whole recurring case.
  - THE DEATH ITSELF, measured by running `world.mjs` and `enrichments.mjs` outside `run-all`
    against a dev server: it is the SHUTTER'S OWN THROW — `Error: frame NN-…: its subject is not
    in the rendered picture`, thrown at `captureFrame` (`scripts/verify/frameSubject.mjs:261`)
    and awaited uncaught in the suite, so Node's uncaught-exception path fires and the terminal
    reporter never runs. The record then holds exactly the red the throw carried, and that red
    is charged like any other. The same two aborts explain the recurring "N frames missing"
    receipt note: both suites stop short of their frame lists.
  Final state:
  - The tail is echoed whenever the suite exits non-zero, not only when it printed no FAIL, so
    a crash that follows a red is diagnosable from the kept log alone.
  - A crash that IS a frame-subject throw says so where the guard reads it, rather than
    presenting as an unexplained death that needs a hand-written sign-off every time.
  Test: a fixture suite that prints a FAIL and then throws; the kept log must contain the throw.
  Criticality: medium — it does not touch the game, but it has now blocked two landings and the
  only way through is to re-measure the death by hand, which is half an hour each time.
  Refs: scripts/verify/run-all.mjs, scripts/verify/run-logged.mjs, scripts/render-verify-recorder.mjs
  Bundle: Testinfrastruktur.

- [ ] 1046. The children's bank round hardly ever carries anyone past the middle of the
  stretch (measured 02.09.2026 while answering the cross-vendor findings of point 688).
  The replay in `tagShuffle.test.ts` used to walk adult bodies to the water's FOOT, which
  stands on the children's own stage — a place the shipped scene pointedly refuses as a
  stroll target. A grown man crossing the round shoves children over the middle of the
  stretch, and a good share of the "the stretch was run" events were his doing. With the
  replay driving the shipped choreography instead, measured at `12b17c25a`, the event is
  rare: bambara-village@42 needs 1711 s of play and 13 runs before its first crossing;
  the other three cases fall at 175 s, 290 s and 358 s. The middle of the stretch is
  exactly where the browser section plants the traveller, so "the children run PAST him"
  is a thing the player rarely gets to see at all.
  Final state:
  - A round that reaches its stage ends at a rock often enough that a watching player sees
    the stretch actually run, rather than a chase that peters out in a tag short of it.
  - The number that says so is measured and stated, not assumed: the replay's first
    crossing falls inside a window a player would plausibly watch.
  Test: Vitest over the bank round — the first run-phase crossing of the stretch's middle
  falls within the stated window at every swept village and seed.
  Criticality: medium — the round is the whole of what the children teach, and its most
  legible moment is the one that hardly happens.
  Refs: src/scenes/place/bankGame.ts, src/scenes/place/tagShuffle.test.ts (the bank-round
  replay and `BANK_ROUND_WINDOW`)
  Bundle: Dorfleben.

- [ ] 1050. Two picture checks went red on the polish lane in one night and neither has an
  owner (read 03.09.2026 out of `.claude/render-verify-state.json`). Both runs were
  webgpu/polish at compatibility level, on a DIRTY tree at `a9013987e`, and both also
  carried the Vite optimize-dep 504 that point 939 owns:
  - 01:00:06Z — "bambara-village (wet): the boundary ground crop could be measured",
    detail "crop off-frame", section `settlement-edge`.
  - 01:27:16Z — "leaving after several settlement visits stays fluid (point 96)", detail
    "3683 ms", section `travel-panorama-capture`. In that same record the boundary-crop
    check was only SUSPECT — its retry came back green.
  The webgpu run at 02:09:51Z and the webgl run at 02:37:59Z were clean over 44
  screenshots each, which under point 640 closes nothing.
  WHY IT MATTERS: the two reds have different shapes and must not be waved through
  together. "crop off-frame" is a FRAMING failure and reads like a defect; "3683 ms" is a
  DURATION and reads like load. Neither has been separated from the host it was measured
  on, and an unowned red holds the render gate shut for every point that comes after.
  Final state:
  - Each red is decided on a measurement rather than on a later green: the throttle probe
    runs its own section on a quiet host (`node scripts/throttle-probe.mjs report
    --section=settlement-edge --runs 8`, and likewise `travel-panorama-capture`), and this
    point states the measured spread and the verdict — load or defect — for each.
  - A red the probe calls a defect is FIXED here; a red the probe calls load keeps its
    charge, with the measurement that earns it written down.
  SEEN AGAIN 07.09.2026, on the CORE lane this time and in the same pair: `bambara-village
  (wet): the outside ground crop could be measured — crop off-frame` at 05:03:34Z and `leaving
  after several settlement visits stays fluid (point 96) — 3292 ms` at 04:36:58Z, both webgpu/
  polish at bd050ddf8. Neither could be charged: this table scopes EVERY WebGPU entry to the
  compatibility level, and both runs recorded no level at all. Both runs were also aborted by
  that session on a host it had itself polluted — the 04:36 log says so in its own words ("the
  machine is busy … its timing verdicts do NOT count as evidence") and names the leftover dev
  server — and the cleaned re-run at 05:17:36Z was green over 44 screenshots. So the sighting is
  recorded here and deferred, not charged; the probe this point owes now has a second lane to
  compare.
  Test: the probe's report for both sections, plus — for whichever turns out to be a
  defect — an assertion on the layer that can hold it.
  Criticality: medium — no player has seen either symptom, but the pair blocks the render
  gate, and the framing red may be a real defect nobody has looked at yet.
  Refs: .claude/render-verify-state.json (the runs @2026-09-03T01:00:06.905Z and
  @2026-09-03T01:27:16.220Z), scripts/verify/polish.mjs, scripts/throttle-probe.mjs,
  scripts/render-verify-charges.mjs
  Bundle: Session- & Repo-Hygiene.

- [ ] 1074. A long verify run dies with the session that started it (measured twice on
  07.09.2026 in the point-1070 worktree; bundle Testinfrastruktur). `run-logged.mjs` stays in
  the STARTING SESSION'S process group, so a handover or a session end kills it mid-suite.
  The 19:05 regression was cut at 19:25:34 UTC — the same second the previous session handed
  the batch lock over (in-flight transfer stamp 1788809129134 = 19:25:29); the 18:25 run died
  the same way after `flow`. Neither was a product failure: both records read `exitCode 1`
  with `failing: []`, the log truncated mid-list, 51 of 76 and 14 of 76 frames written.
  THE COST IS PAID TWICE OVER: a truncated pass covers no backend, and a retry is SUSPECT and
  covers nothing (CLAUDE.md §7.2), so the ~20 minutes are not merely lost — the point could
  not land until the suites were run again. THE LESSON ALREADY EXISTS one file over: after ten
  sessions died mid-gate, TASKS.md:1054 tells the owner to run `land-point.mjs` under
  `setsid`. The verify runs never got it, and every caller is expected to remember.
  THIS IS THE COUNTERPART OF 567, NOT A DUPLICATE: 567 is the run that OUTLIVES its killed
  session and competes with its successor for the machine; this is the run that DIES with a
  session that ended normally. Fixing this one makes 567's stray case more common by
  construction, so 567's reaping is what keeps it safe — they are read together.
  FINAL STATE:
  1. `run-logged.mjs` detaches itself into its own process group, so a run survives the
     session that started it and no caller has to remember `setsid`. Removing the footgun is
     the whole change; it adds no guard, no ledger field and no flag anybody must pass.
  2. A run that is still alive when its starting session ends is reported as RUNNING rather
     than as a red: the sidecar keeps `status: "running"` and no `exitCode` is invented for
     it, so nothing later reads a survivor as a failure.
  3. A truncated pass is never silently a red. When a run ends without a terminal verdict and
     records no failing suite, its receipt says so in those words — "killed, not failed" —
     and names the last suite that reported, so the successor re-runs the REMAINDER instead
     of re-running everything or, worse, believing the product broke.
  VERIFIABLE: pure Vitest — a run started under the runner reports a process group id
  different from its parent's; a sidecar whose process is still alive classifies as running,
  not as exit 1; and a record with `exitCode 1`, an empty `failing` list and a frame count
  below the expectation classifies as KILLED with the last reporting suite named, while a
  record with the same exit code and a non-empty `failing` list stays a red.
  Criticality: medium, frequency HIGH — every context boundary and every handover can take a
  running suite with it, and the batch hands over on a fixed watermark.
  Refs: TASKS.md point 567 (the reaping counterpart), TASKS.md:1054 (the same lesson already
  drawn for the landing gate), scripts/verify/run-logged.mjs, scripts/verify/run-wait.mjs,
  memory `detach-long-running-landings`.
  Bundle: Testinfrastruktur — it edits `scripts/verify/run-logged.mjs` and the run sidecar
  that 1062 does not touch, so it may run beside the rest of the bundle; it is read together
  with 567, whose stray reaping is what makes a surviving run safe, and never worked beside it.

- [ ] 733. The loading picture freezes about twice as long as its own budget allows (measured
  19.08.2026, 13:50 and 13:51, the first two runs after point 732 brought the picture lane back).
  MEASURED, twice, on `feat/732-verify-gpu-backend` at b2f6f5f5, backend WebGPU, frame written
  1/1: the `startup` suite's assertion "the loading picture never freezes longer than the balance
  budget (4000 ms, design.md §21.2)" fails with a worst standstill of 7632 / 8167 / 7833 / 7801 ms
  across the two runs' two sections — roughly 2x the budget. The breakdown is the same every time:
  blocked thread ~3.3 s, inside ONE animation frame ~2.3 s, unpainted ~7.8 s.
  IT IS NOT LOAD, and that was checked rather than assumed: the four readings sit within 7 % of
  each other across two runs at load average 3.1–4.7, where a load artefact scatters. It is also
  not new breakage — it is newly VISIBLE: the lane could not run on this host at all until 732, so
  this assertion had never been evaluated here.
  WHAT IS NOT YET KNOWN, and is the first half of the work: whether the freeze belongs to the APP
  (startup work on the main thread) or to the BACKEND the lane now uses. Point 732 restored the
  picture through ANGLE's surfaceless EGL route, and the WebGPU lane rides a COMPATIBILITY adapter
  there; a compat adapter's shader compilation could plausibly own the 2.3 s inside one frame. The
  two are distinguished by MEASUREMENT before anything is changed — the same run on the WebGL 2
  lane, and against the deployed build the user actually plays, decides which it is. Naming the
  wrong half here would rebuild the wrong thing.
  FINAL STATE:
  - THE CAUSE IS NAMED with a measurement that separates app from backend, and the answer is
    written down where the next reader finds it — including the case "the budget is right and the
    app is too slow" and the case "this backend cannot meet a budget written for another one",
    which have different remedies.
  - THE STANDSTILL COMES UNDER THE §21.2 BUDGET on the lane the player uses, or the budget is
    re-derived FROM A MEASUREMENT on the backends we actually ship and design.md §21.2 moves with
    it in the same commit. The budget is not simply raised to whatever the current number is: it
    is a promise to the player about the loading picture, so a raise needs the reason a player
    would accept.
  - THE 2.3 s INSIDE ONE ANIMATION FRAME is accounted for by name. A single frame holding the main
    thread that long is the sharpest clue in the reading and the most likely single cause.
  VERIFIABLE: `node scripts/verify/run-logged.mjs --suites startup` green on BOTH backends, and
  the measurement that separated app from backend recorded with its numbers, so a later regression
  can be compared against it rather than re-argued.
  QUEUE RANK: behind point 174, at the end of the order (user 07.09.2026, 21:38, ruling on the
  question why this point stood before the release: the long first load "war ja anscheinend schon
  lange so, dann kann es ruhig auch noch für diesen Release so bleiben"). It stood between the
  communication mechanic and the closing 633 for one mechanical reason — the `startup` suite is
  red and 633 drives a full LARGE — and that reason does not hold: the red is CHARGED to this
  point in `scripts/render-verify-charges.mjs`, and CLAUDE.md §7.2 closes a red that is charged to
  its owning point. What the closing owes instead is written into point 633, including the case
  where the freeze shows outside this charge's `webgpu`/`compatibility` lane.
  Criticality: medium — it fails no player-visible correctness rule and the game does start, but
  it is a §21.2 promise the build currently breaks by 2x, and it keeps the `startup` suite red,
  which is the suite every other run is judged beside.
  Bundle: Session- & Repo-Hygiene.

- [ ] 1062. The position query stops answering after a language switch, and no gamepad
  evidence can be filed while it does.
  WHAT HAPPENS. Measured 06.09.2026 on TWO trees — `main` at 859aec1fd and
  feat/1052-chief-outside at 3aa7fd442 — with the section run in isolation
  (`npm test -- gamepad --section=position-query`), so nothing in the branch causes it.
  The first Select press answers: the English toast carries "Latitude" and "North" and the
  check passes. Then the suite switches the language (`window.__setLang('de')`), waits for
  `document.documentElement.lang` to read `de`, and presses Select again — and for the
  whole 8 s window `useGame.getState().toast` stays null. The check reports `"null"`, the
  suite retries once and fails identically, so the flake lane calls it a candidate real
  failure.
  WHAT IT COSTS. Acceptance criterion 30 is gamepad AND position query, and its browser
  evidence comes from exactly this suite: while the section is red, no gamepad run can be
  filed green, and every future LARGE carries the same red.
  WHAT IS NOT YET KNOWN — and settling it IS the first half of this point: whether the
  PLAYER is hit (the query really goes silent for anyone who switches language mid-run,
  which is a defect in the localized toast path) or only the HARNESS is (the injected
  `window.__pad` does not survive the re-render the language switch triggers, so the poller
  reads a real, empty gamepad list). Answer that BEFORE touching either side: a fix aimed
  at the wrong half leaves the other half broken and the suite green.
  Final state:
  - The cause is named in the commit — player path or harness — with the measurement that
    distinguishes them.
  - The named side is fixed, and the section passes twice in a row on a quiet machine.
  - If the player path is at fault, the localized toast is asserted on the Vitest layer
    too, where a language switch costs no browser.
  Test: `npm test -- gamepad` unfiltered (an incremental `--section` green is not the
  acceptance), plus Vitest over whatever pure part the cause turns out to have.
  QUEUE RANK: behind point 174, at the end of the order (user 07.09.2026, 21:38): switching
  language is rarely used functionality in the PoC, so this is neither the communication mechanic
  nor a player blockade. It stood before the release because the `gamepad` suite is red and 633
  drives a full LARGE, but that red is CHARGED to this point in
  `scripts/render-verify-charges.mjs`, and CLAUDE.md §7.2 closes a red that is charged to its
  owning point — the ledger had made the front position unnecessary before this point was ever
  ranked there. What the closing owes instead, criterion 30 reported with the German check named
  RED rather than filed green, is written into point 633. THE ORDERING PROSE WENT WITH THE MOVE
  (the duty the drained finding of 07.09.2026 recorded, now executed): the "it blocks the release,
  which is why it stands here" clause of the criticality line below and the twin sentence in
  `docs/work-packages.md` both said the old order, and no rank record and no guard points at
  either — `queue-rank.mjs` reports every point ranked and stays green through any move. Moving
  the block alone is not the move.
  Criticality: medium — the closing run of point 633 drives LARGE, LARGE runs the gamepad suite,
  and that suite stays red until this lands; under the ruling above the closing carries that red
  as a charged red instead of working this point first. Whether the PLAYER is hit is what the
  point decides first.
  Refs: scripts/verify/gamepad.mjs (section `position-query`), src/systems/gamepadMap.ts,
  the position-query toast in src/state/store.ts and both language files
  Bundle: Testinfrastruktur.

- [ ] 1079. The only fix for a live vitest advisory is a semver-major jump, and the
  advisory blocks every push until someone decides. GHSA-82fw-gwwq-j7x9 (path traversal /
  arbitrary file read via the `@vitest/mocker` redirect) appeared on 08.09.2026 and made
  `audit-check` red mid-session, which is the pre-push gate: the board could not publish and
  the session boundary could not commit. It is recorded in the `ALLOW` map of
  `scripts/audit-check.mjs` with the measured justification — dev-only dependency, never in
  the shipped bundle, and the attack needs vitest BROWSER MODE while `vitest.config.ts` runs
  `environment: 'jsdom'` with no browser block and nothing imports `@vitest/mocker`. That
  acceptance buys time; it is not the answer. The answer is to decide the upgrade to vitest
  4.1.11 deliberately: read its migration notes, run the full unit layer (14949 tests) and the
  vitest type-check against it, and either land the jump or record why we stay on 3.2.7 and
  what would change that. Do NOT let the ALLOW entry quietly become permanent — it names an
  unfixed arbitrary-file-read in our own toolchain.
  Refs: scripts/audit-check.mjs (`ALLOW`), vitest.config.ts, package.json (`vitest`,
  `@vitest/coverage-v8`), scripts/verify/tiers.mjs (the unit tier), docs/backlog.md.
  Bundle: Testinfrastruktur.

- [ ] 1101. A runner-only script answers "CI gate passed" to a question nobody asked
  (measured 11.09.2026).
  IT PERMITS A FALSE APPROVAL, which is the one class the infrastructure freeze keeps open.
  `scripts/ci-gate-verdict.mjs` runs INSIDE the GitHub runner after the gate steps, reads
  `GATE_EVENT`, `GATE_REF` and `GATE_OUTCOMES` from the environment, and always exits 0 by
  design. Called by hand — `node scripts/ci-gate-verdict.mjs --ref feat/1065-teaching-hands-touch
  --wait` — it ignores both flags, evaluates an EMPTY outcome set, prints "CI gate passed." and
  exits 0. This session did exactly that twice on 11.09.2026 and reported a green CI both times
  while measuring nothing at all; the branch's real run was still in progress, as the Stop
  guard said in the same minute. Nothing was actually shipped on that false green — the main
  push ran the full local gate and `gh run list` later showed CI success for 7ff2437a6 — but
  the script said "passed" for a ref it never looked at.
  Final state:
  - Called outside a runner, or with an argument it does not define, the script REFUSES: it
    names the one legitimate caller (the workflow step) and the command that answers the
    question a human is actually asking about a ref's CI. No verdict is printed on an empty
    environment.
  - Inside the runner nothing changes, exit 0 included — the point does not touch the gate's
    own behaviour.
  - Whatever the correct hand-call is (`gh run list --branch <ref>`, or the guard that already
    watches pushed refs) is named in the refusal, so the next session does not have to find it.
  Test. Vitest: an argv carrying an unknown flag refuses; an empty gate environment refuses;
  the recorded runner environment still produces today's verdict text and exit code.
  Refs: scripts/ci-gate-verdict.mjs, scripts/ci-gate-verdict-core.mjs, scripts/ci-status-guard.mjs.
  Criticality: high — a script that prints a pass for a question it never evaluated is a false
  approval, and it was believed twice within one hour of being called.
  Bundle: Session- & Repo-Hygiene.

- [ ] 1102. The drum picture is aimed by stopwatch and fires after the message has ended.
  MEASURED 11.09.2026 on a quiet machine, during point 1086's covering WebGL 2 picture run:
  `polish --section=chief-to-drummer` failed with "the drums were still speaking when the
  picture was taken — the message had already ended at the shutter", then passed on the
  retry. That pair is the signature this house already refuses to read as luck: a run that
  passes the second time is recorded SUSPECT and covers no backend, so one timing race costs
  a whole 56-minute pass. It is the first time this check has ever failed in the kept logs.
  IT IS THE SAME SHAPE AS POINT 521, MIRRORED. 521 shoots too EARLY — a fixed wait after a
  jump, and on a slow frame the camera has not arrived. This one shoots too LATE: the check
  wants the drums mid-message and the message is already over when the frame is taken. Both
  are a stopwatch standing in for a state nobody asked about.
  Final state:
  - The chief-to-drummer frame is taken when the drum message is PROVABLY still running —
    the suite waits on the speaking state the game already holds, not on a duration, and the
    check names that state in its failure text so the next reader is not guessing.
  - If the window is genuinely short, the suite says so where it matters: either it sizes its
    wait so both a fast and a slow frame land inside the message, or the check declares itself
    NON-PREDICTIVE for the narrow rung (`nonPredictive(...)`, point 1086), which the ladder
    then never credits.
  - No retry is used as the fix. The pass must be green on the FIRST attempt, because the
    second attempt is what makes the whole run suspect.
  Test. Vitest over the pure half: a window whose message has ended fails, one that is still
  running passes, and a declared non-predictive check never satisfies the ladder. Browser:
  `npm test -- polish --section=chief-to-drummer` green on the first attempt on both lanes.
  Refs: scripts/verify/polish.mjs (section `chief-to-drummer`), scripts/verify/sections.mjs,
  points 521, 640, 1086.
  Criticality: medium — it reddens no product code, but each occurrence burns a full covering
  pass and produces a SUSPECT record that covers no backend, which is how a finished point
  waits an extra hour.
  Bundle: Testinfrastruktur.

- [ ] 1111. Two cases in `scripts/mechanism-review-guard.test.mjs` run 19.4 s against a 20 s
  timeout, so the fast gate fails whenever the machine is not idle.
  MEASURED 11.09.2026 during the landing of point 1106. The landing stopped at its gate with
  "seeds the anchor from the one shape that carries the flag AND the baseline — Test timed out
  in 20000ms". Re-run ALONE on the same head the file is green, and the timings say why: that
  case takes 19396 ms and its sibling "stands down for every caller but the measuring read"
  takes 19453 ms, both against the 20000 ms default. The headroom is about 600 ms — three per
  cent. Load average at the failing run was 10.3, with a `batch-doctor` gate building beside
  it; on a quiet machine the identical landing went green through every step.
  IT IS NOT A FLAKE TO RETRY. `batch-doctor` reached the same verdict independently in the
  same window: its own unit gate "FAILED but the verdict is INCONCLUSIVE (load)". A test whose
  pass depends on what else the machine is doing is not evidence either way, and CLAUDE.md
  §7.2 says a retry is SUSPECT and covers nothing — so every landing that meets this pays a
  full gate to learn nothing, and the honest reading costs a separate isolated run.
  Final state:
  - Neither case depends on wall-clock headroom. Find what takes nineteen seconds inside a
    guard UNIT test first — a real subprocess or a wait the test does not need — and remove
    it, rather than raising the timeout, which only moves the cliff.
  - If the work is genuinely that long, it is not a unit test: it gets its own timeout with
    the measured reason written beside it, so the next reader knows the number is deliberate.
  - The gate stops being decidable by machine load: the same head gives the same verdict busy
    or idle.
  Test. Vitest: the two cases keep their assertions and run in a fraction of their present
  time; the file's slowest case is recorded in its header so a regression is visible.
  Refs: scripts/mechanism-review-guard.test.mjs (the two cases named above),
  scripts/land-point.mjs (the fast gate that stopped), scripts/batch-doctor.mjs (the
  independent load verdict), CLAUDE.md §7.2.
  Criticality: HIGH — it blocked a finished, reviewed point from landing and cost a full gate
  run, and it will do so again on any busy machine.
  Bundle: Testinfrastruktur.

- [ ] 1114. Repair pre-existing settings check: first-person ground shows micro-detail
  (edge energy) (filed automatically by a LARGE run on 12.09.2026 under point 1089's
  ownership rule; the user ordered these three reds filed at once on 10.09.2026).
  The first-person ground-detail frame shows measurable micro-detail and passes its
  edge-energy assertion. Diagnose and fix the rendering, staging or check defect responsible
  for the recurring red; preserve a meaningful assertion and add regression coverage. Prove
  settings --section=ground-detail, then the full settings suite on the affected backend.
  Observed 10.09.2026: point 1065 spent 23 full LARGE runs and 16.2 machine hours with no
  green run, and none of the recurring reds touched its own change. This point owns the
  settings red.
  Refs: scripts/verify/settings.mjs, point 1089, point 1065.
  Bundle: Testinfrastruktur.

- [ ] 1115. Repair pre-existing enrichments check: the streamed dressing does not grow over
  a session at a fixed anchor (filed automatically by a LARGE run on 12.09.2026 under point
  1089's ownership rule; the user ordered these three reds filed at once on 10.09.2026).
  Streamed dressing stays bounded over a session at a fixed anchor as required by point 278.
  Diagnose and repair the recurring dressing-growth failure without weakening the
  bounded-growth check; add regression coverage. Prove enrichments --section=dressing-growth,
  then the full enrichments suite on the affected backend.
  Observed 10.09.2026: this red held point 1065 across 23 full LARGE runs without ever
  touching its change. This point owns it.
  Refs: scripts/verify/enrichments.mjs, point 1089, point 1065, point 278.
  Bundle: Testinfrastruktur.

- [ ] 1119. Repair the arriving runner's contact hold, which reds under load and passes on a
  quiet machine (filed 12.09.2026 from a SUSPECT retry in point 1087's LARGE run, under point
  1089's ownership rule).
  The polish check `the arriving runner is read from ROCK to the far side of its contact hold`
  (`scripts/verify/polish.mjs` ~4937, `--section=children-bank-game`) reads the hold to its
  end on a loaded machine as it does on a quiet one, or its frame budget is stated and
  enforced so a short read fails for a named reason rather than as `ended false`.
  Measured 12.09.2026, WebGL 2 lane of the LARGE run in the point-1087 worktree: 137 readings,
  remaining 8.9589 s down to 3.1986 s, `ended false`, heard from 8.57 m against a 10 m radius,
  one unheard opening before acquisition. The retry of the same suite ran 266 pass / 0 fail,
  which the runner recorded as SUSPECT — a second pass covers nothing. The session had put
  its own build, type-check and push gate (15235 unit tests) on the same machine inside that
  window, so LOAD is the leading hypothesis and is not yet measured.
  FIRST STEP, before any repair: `node scripts/throttle-probe.mjs polish
  --section=children-bank-game --runs 8` on a quiet machine. If the probe reproduces the red
  under load only, the defect is the check's frame budget, not the game. If it reds on a quiet
  machine too, the arrival hold itself is short and the game owes the fix.
  The check belongs to point 1106, which is closed, so it cannot take a charge-ledger entry
  (`scripts/render-verify-charges.mjs` refuses a closed point) — which is why it is its own
  point.
  Refs: scripts/verify/polish.mjs (~4878-4960), scripts/throttle-probe.mjs,
  scripts/render-verify-charges.mjs, point 1106, point 1089, point 1087.
  Bundle: Testinfrastruktur.

- [ ] 1120. The baseline classification reads the branch under load and the baseline after it, so
  a load artefact is promoted to a REAL REGRESSION (measured 13.09.2026 on
  `feat/1072-village-speaks-with-direction`, WebGL 2 lane, in the mechanism point 1089 built).
  WHAT WAS MEASURED: the LARGE run reported `the dry settlement season reading settles before it
  is read` red after 60496 ms. The automatic classification then ran the merge-base
  `734be2f35bff` twice, found that check green in both runs, and printed REAL REGRESSION (green
  on baseline, red now) — the one verdict that holds a finished branch. It is not the branch's.
  Re-run once the LARGE run had left the host, same branch, same backend, same section
  (`VERIFY_GL=webgl node scripts/verify/run-all.mjs polish --section=settlement-season`): GREEN
  three times out of three, 9 pass / 0 fail each. The branch diff cannot reach the check at all —
  its only two touches to the verification machinery are registrations (`speechSampler.mjs` into
  `NON_RENDER_VERIFY` and into `fixed-wait-baseline.json`).
  WHY IT HAPPENS: the baseline runs AFTER the branch run, on a machine the branch run has
  meanwhile stopped loading. That run's own banner recorded `MACHINE STATE UNKNOWN` for the
  branch pass. So "green on baseline, red now" can mean nothing more than "quieter now", and the
  two sides are not comparable. The check is load-fragile in the way open point 642 describes: it
  waits with `requireChange: true` for the reading to MOVE inside a 60 s window, and 60496 ms is
  the full timeout — no movement was ever observed. That is the class of point 1119, one check
  further along the same suite.
  FINAL STATE: the classification can tell "the branch broke it" from "the branch's own run
  loaded the machine". Either both sides are read under comparable load — the baseline taken
  while the host is as busy as the branch read was, or both taken on a quiet host — or the
  verdict names the load it could not rule out. A classification that cannot read the machine
  may report UNRESOLVED; it may not assert REAL REGRESSION.
  EVIDENCE: a red that today's mechanism calls REAL REGRESSION, whose check then passes
  repeatedly on the quiet machine, is not reported as the branch's.
  Refs: scripts/verify/baseline-classify.mjs, scripts/verify/machine-load.mjs,
  scripts/verify/_browser.mjs (waitForReadingStable), scripts/verify/polish.mjs
  (~1410-1435), point 1089, point 642, point 1119.
  It edits `scripts/verify/baseline-classify.mjs`, the mechanism point 1089 built and 1114 and
  1115 were filed by, so it is worked after 1089 and never beside it.
  Bundle: Testinfrastruktur.

- [ ] 1123. When the batch owner dies mid-verification its run keeps going and nobody harvests the
  receipt (measured 14.09.2026).
  When the batch owner dies mid-verification, its run keeps going and NOBODY
  harvests the receipt. Close that gap.

  Measured 14.09.2026: owner 65f2ab12 (pid 739806) went `pid-dead` between
  10:07:31 and 10:12:35 with its two-backend LARGE for point 1056 still running.
  The successor took the lock and found run-all.mjs (pids 744989/745004) and a
  chrome-headless burning CPU in .claude/worktrees/point-1056, all green so far,
  with no process left that was waiting on the log.

  Two defects, one point:

  1. NO HARVESTER. A run whose waiter died is invisible: nothing declares the
     wait, nothing reads the receipt, nothing charges a red to its point. The
     next owner has to notice the stray processes by hand (`ps` for run-all.mjs
     plus chrome-headless) to even learn a run exists. Make the successor ADOPT a
     live run it finds — the wait-lease already models "this run belongs to a
     session", so the reconciliation that names a missing worker should also name
     an ownerless RUN and re-attach a waiter to it.

  2. THE CLAIM PATH PROMISES SOMETHING IT DOES NOT DELIVER. The text printed by
     `scripts/batch-claim.mjs` says the owner "releases the lock at the first
     CLEAN moment — never mid-merge, never with a delegated agent still building
     or a verification running, so nothing it is doing gets cut in half". Here
     the lock came free by `pid-dead` with a verification running, and the
     ledger records no `handover` and no boundary row for that session. Either
     make the wording conditional on an actual clean release, or say plainly that
     a dead owner frees the lock in whatever state it was in. The operator plans
     around that sentence — the successor nearly committed to main on the
     strength of it, which would have killed the orphaned LARGE at its unit stage
     for the third time (01.09., 08.09., see the quiet-machine memory).

  3. A KILLED RUN AND A SELF-EXIT LOOK THE SAME IN THE RECORD. Measured
     14.09.2026 on the aborted LARGE of point 1056
     (local/verify-logs/2026-09-14T07-41-21-135-large.log, 09:41-12:20): it stops
     inside the automatic baseline classification before its fourth red suite and
     never prints its own closing line. The receipt says exit 1, which proves
     nothing - `scripts/verify/run-logged.mjs` flattens a signalled child to
     `code === null ? 1 : code`, and the only place that names the signal is the
     digest field `command: <cmd> (killed by SIGxxx)`, which goes to the
     orderer's terminal and NOT into the `.run.json` record. Once the waiting
     session is gone, kill and self-exit can no longer be told apart - so the six
     red suites of that run cannot be classified at all, and each of them costs
     the next session a re-run to rule out. Cheap remedy: write the signal (or
     `exitedNormally`) into the record, not only into the digest.

  4. A RUN ON A FEATURE BRANCH CAN NEVER BE HANDED OVER. Measured 14.09.2026 at
     the context watermark, with the two-backend LARGE for point 1056 running:
     `scripts/batch-in-flight-core.mjs` tests a declared run with
     `sameHead(run.head, headNow)`, where `headNow` is the MAIN tree's HEAD while
     the run carries the HEAD of the worktree it runs in. The two agree only when
     main and the branch stand on the same commit — that is, essentially never
     while a point is in progress. The handover is refused with "its run covers
     HEAD <branch>, not the <main> being handed over" however well the run is
     evidenced, and none of the four offered ways out applies: a test run has no
     CHECKPOINT, RE-DECLARE with `--branch`/`--worktree` does not touch the
     comparison, ABANDON throws away hours of machine, and DRAIN forces the
     session to keep running above the watermark — which is exactly what the
     watermark exists to prevent. So the two guards contradict each other by
     construction. Cheap remedy: compare against the HEAD of the worktree the run
     runs in (or the branch the declaration names), not against the main HEAD.
  Criticality: high — a real blockade with a measured cost, plus a false-approval risk: the claim text
  promises a clean release that a pid-dead owner does not deliver.
  Refs: scripts/batch-claim.mjs, scripts/batch-in-flight.mjs, scripts/verify/run-wait.mjs,
  scripts/verify/run-all.mjs, scripts/verify/run-logged.mjs
  Bundle: Session- & Repo-Hygiene

- [ ] 1171. A bank-game unit test runs into its 20-second timeout on CI and blocks every main
  push (measured 21.09.2026 while landing the charge for point 1068's WebGPU sighting).
  WHAT FAILED: CI run 35580966090 for `origin/main` 54033d9f0 concluded "failure" on the
  `fast` job's unit stage — `src/scenes/place/bankGame.test.ts:1229`, "offers every play-rock
  ROCK with a solved touch at the speaker`s own spot over a Bambara cycle", `Error: Test timed
  out in 20000ms`. Everything else was green: 511 of 512 test files, 16,147 tests, 11 skipped.
  The whole unit layer took 1148 s there.
  THAT IT IS NOT THE COMMIT'S CONTENT IS MEASURED, NOT ASSUMED. The branch commit eaa481567,
  which contains 54033d9f0 in full, ran the SAME workflow one minute later and went GREEN. The
  red commit itself touches `scripts/render-verify-charges.mjs`, its test and `TASKS.md` — not
  one line of `bankGame`. So the red is a property of the run, not of the diff under it.
  WHAT IT COSTS, and why this is a point rather than a backlog line: `ci-status-guard` blocks
  every turn until a fixing push, so an unowned red on main stops the whole batch. It stopped
  this one.
  WHAT IS NOT MEASURED, named rather than assumed: how close the test runs to its 20 s on a
  quiet local machine; whether CI exceeds it reproducibly or only under load; and whether the
  combinatorial breadth of the case ("every play-rock", a whole Bambara cycle) is what makes it
  the one case in the layer that can hit a per-test bound.
  Final state: the test's cost is measured on a quiet host and on CI, and EITHER the case is
  made cheap enough to sit well inside the bound, OR the bound is raised for it with the
  measurement that justifies the number. A raised bound with no measurement behind it does not
  close this point.
  Test: `npx vitest run src/scenes/place/bankGame.test.ts` timed on a quiet host, the figure
  printed; then the same case green over three consecutive CI runs.
  Criticality: medium — no player loses anything, but it blocks the push gate every batch pays
  at, and an unowned red on main is exactly what the red policy forbids.
  Refs: src/scenes/place/bankGame.test.ts:1229, src/scenes/place/bankGame.ts, CI run
  35580966090
  Bundle: Session- & Repo-Hygiene.

- [ ] 1172. The dig-pair picture check finds no adults at all at the shutter and reds the whole
  `polish` pass (measured 21.09.2026 while landing point 1158).
  WHAT FAILED: `polish --section=adult-errands`, WebGPU, on `feat/1158-escape-cooldown-return`
  at eaa481567 — `FAIL and both are still at the stroke, on opposite sides of the hole` with
  `{"count":0,"striking":0,"away":[],"span":null,"opposed":false,"offLine":null}` (log
  `local/verify-logs/2026-09-21T09-35-28-998-polish.log`, 303 pass, 1 fail). `count: 0` means
  the check found NO villager still in the digging bout at the shutter, so the frame beside it
  photographs bare earth and the frame's own subject test cannot tell the difference.
  IT IS NOT POINT 1158'S, and that is measured. 1158 changes pointer-lock input handling; its
  only edit outside `pointerLock.ts` and its test is a comment in `PlaceScene.tsx`. The SAME
  branch tip ran the whole `polish` suite GREEN on WebGL 2 thirty minutes earlier — 304 checks,
  0 failures (log `local/verify-logs/2026-09-21T09-02-33-527-collision-polish-settings.log`).
  IT IS ALSO NOT POINT 1121'S. That point owns a different `adult-errands` red — the river-bank
  frame aiming at a drifting fleck — and its cause is the aim block at ~6044-6070. This red is
  the dig-pair block at ~6660-6715, a different check with a different subject.
  WHAT IS MEASURED SINCE: the same rung re-run ALONE on a quiet machine at the merged tip
  d3e82342d went green, 39 pass 0 fail in 2m 54s, and the red run printed "UNDER LOAD — NOT
  AUTHORITATIVE" itself, because two unit suites of the owning session were on the machine at
  the time. That is consistent with load — and consistent with a rare timing race, which is
  exactly why a later green closes nothing (point 640). The distinction is NOT measured.
  WHAT IS NOT MEASURED, named rather than assumed: whether `node scripts/throttle-probe.mjs
  polish --section=adult-errands --runs 8` reproduces it at a quarter of a core; whether the
  bout can end between `waitForFunction` picking the pair and the shutter opening three frames
  later, which is the same shape as 1121's race; and whether the WebGL 2 lane simply never hit
  the window rather than being immune.
  Final state: the red has a named cause and either the check no longer races its own subject —
  the pair it photographs is the pair that is IN the bout at the shutter, re-read at shutter
  time — or the run is shown to be load and the check left alone with the measurement that
  shows it. A check weakened into one that would pass on bare earth does not close this point.
  Test: `node scripts/throttle-probe.mjs polish --section=adult-errands --runs 8` for the
  reproduction, then `polish --section=adult-errands` green on a quiet machine on both backends.
  Criticality: medium — no player impact; it costs a whole `polish` pass its meaning and it
  reds on the everyday WebGPU lane, so every point behind it inherits an unaccounted red.
  Refs: `scripts/verify/polish.mjs` (~6660-6715, the `held` block and the 1125 frame),
  `scripts/render-verify-charges.mjs` (the entry filed with this point); sibling of point 1121.
  Bundle: Testinfrastruktur.

- [ ] 1175. A children's frame can pass green with no child in it: the shutter tests projection,
  the vantage tests a circle (measured 21.09.2026 while landing point 690).
  Bundle: Testinfrastruktur
  MEASURED STATE. `polish --section=children-motion` photographs the children of every staged
  settlement, and in `cairo` it returned GREEN six times with pictures holding one distant child,
  then none at all — while both guards said the subject was there. Neither guard is wrong about
  what it asks; they simply do not ask about occlusion:
  - the SHUTTER (point 375) refuses a frame whose declared subject does not PROJECT into the
    picture. A body standing behind a warehouse projects perfectly.
  - the VANTAGE search models every solid as a CIRCLE and tests the sightline against it. A port
    warehouse is a box collider; approximated by the circle through its corners it is too round
    at the faces and too fat at the corners, and the search reads a child behind a long wall as
    visible.
  The village never showed it because a village quarter is 13 m across with round huts in it, so
  the circle model is close to the truth and the group is always near its own centre. A port's
  children's quarter is 9.5 m in radius inside a settlement of 40 m, its buildings are boxes, and
  the group scatters — the two approximations meet their worst case together.
  WHY IT MATTERS BEYOND THE PICTURE: a green run whose frame does not contain its subject is the
  exact failure `CLAUDE.md` §7.2 exists against, and it is silent. Every settlement this check is
  ever extended to inherits it.
  Final state: the frame is refused unless a CHILD IS REALLY DRAWN in it, decided by the renderer
  rather than by a geometric model of the settlement — the scene's own occlusion answer for the
  declared child, not a circle the suite keeps its own copy of. A frame the game cannot supply is
  a red with the settlement named, never a green with a wall in it.
  Test: the check reds on a staged standpoint whose child is behind a building and passes on one
  whose child is in the open, both asserted in the same run, so the repair cannot be read off a
  lucky layout.
  Criticality: medium — no player impact; it costs every settlement's children's frame its
  meaning, and it does so silently, which is worse than a red.
  Refs: `scripts/verify/polish.mjs` (`__pickChildVantage`, the `children-motion` frame),
  the shutter's subject check (point 375). Sibling of the frame-aim points 1121 and 1125.

- [ ] 1177. Every full polish run is recorded as died of an uncaught exception after its own
  report, so no full polish pass has counted as a covering picture run since 21.09.2026 (owner
  finding 22.09.2026, while landing 1157).
  Bundle: Testinfrastruktur
  MEASURED in `.claude/render-verify-state.json`: the six full polish runs recorded since
  21.09.2026 15:43Z — 6c778f8 and 46c7120 on `main` (WebGPU and WebGL 2), 4fa7427, 9259d6d,
  3a82cc1 and 02eec84 on `feat/1157-weaver-loom` — all carry `crashed: true`,
  `crashSource: uncaught-exception`, `terminalVerdict: false`, although every one of them printed
  its own terminal line (`FAIL polish 234 pass, 1 fail` and the like) and its reds were classified
  against the charges. A `--section` run of the same suite never carries the marker. The recorder
  (`scripts/render-verify-recorder.mjs`, `uncaughtExceptionMonitor`) is doing what it says: Node
  really printed an uncaught exception in the polish process, after the report — but NOTHING
  KEEPS THAT EXCEPTION: the kept log (`local/verify-logs/*.log`) holds the runner's summary lines
  only, `.log.progress` is empty, and the suite's own stdout/stderr is not written anywhere. So the
  cause cannot be read from any run that has happened, and `render-verify-guard` refuses every
  full run as "incomplete — no charge may be accepted", which makes its covering-run demand
  unsatisfiable through polish.
  Final state: the exception is FOUND AND FIXED — the most likely seat is a section's teardown or
  a top-level `await` that rejects after the terminal reporter has printed (a Playwright timeout
  in a `finally`, or a dangling wait on a page already closed) — and, independently of the
  fix, the runner KEEPS the child's stderr tail (the last 200 lines) beside the log, so the
  next crash of this kind names itself. A full polish run then records `crashed: false` with a
  terminal verdict, and a charged red counts as accounted for.
  Test: a unit test on the recorder proves that a suite which prints its terminal line and then
  rejects a top-level promise is recorded with the exception text kept; and one full polish pass
  on WebGPU recorded without the crash marker is the evidence for the fix.
  Criticality: high — no player impact, but every picture proof of a landed point is silently
  refused, so the render guard either blocks every landing or is deferred around, which is the
  false-approval path CLAUDE.md §2 names.
  Refs: `scripts/render-verify-recorder.mjs` (armed.uncaught, line ~737), `scripts/verify/run-logged.mjs`,
  `scripts/verify/polish.mjs`, the six run records above; deferred around once on 22.09.2026 for
  point 1157 (`render-verify-guard --defer`).
  Further evidence (finding 26.10.2026): five polish-villagers runs on feat/1415 d3201e61c/e8e50941d (WebGPU 05:00, 05:22, 07:24; WebGL 2 08:24, 08:41) ended crashSource uncaught-exception after 0-38 screenshots, each log stopping at '# → polish-villagers running' with no thrown message kept.

- [ ] 1187. The weaver's hand check rotates: it reds inside the pass and greens on its own
  section, at the same tree (measured 22.09.2026 during the covering run of point 1182).
  WHAT WAS MEASURED, three runs, one machine, all WebGPU and all quiet:
  · full `polish` at e1b7d1561 — RED: "BOTH her hands are elsewhere half a pass later — the arms
    work, not only the tool" [--section=village-loom]. Left hand moved 0.045 m, RIGHT hand
    0.0137 m against a bar of 0.02 m, so one hand of two missed it.
  · `polish --section=village-loom` at 86c4babaf (`main`) — the check GREEN (12 pass, 0 fail;
    the run's exit 1 came from two Vite `504 Outdated Optimize Dep` console errors already
    charged to point 939).
  · `polish --section=village-loom` at e1b7d1561, the SAME tree that failed inside the pass —
    GREEN (12 pass, 0 fail, 0 console errors, exit 0).
  So the tree is not what moves. The check landed on 22.09.2026 with 503492100 ("make the
  loom's picture checks ask for arms"), and it samples the weaver twice "half a pass later":
  when the second shutter falls near a turning point of her stroke, the returning hand has
  travelled less than the bar and the check reds although the arms are working.
  THE FAMILY IS NAMED, NOT NEW: this is the rotating-staging family of points 200, 336, 568 and
  570, and point 642 is the decision about what to do with a check whose verdict depends on
  when the shutter falls. This point exists so the newest member is not rediscovered from
  scratch, and so a landing stops paying a 39-minute re-run for it.
  FINAL STATE: the cause is IDENTIFIED before anything is tuned — either the sample is taken at
  an arbitrary phase of the stroke (then the check waits for a stroke phase it names, the way
  the other loom checks poll on the app's own state, rather than on a fixed half-pass), or one
  arm genuinely stops while the other works (then it is a PRODUCT defect and the check is
  right). The bar is NOT lowered to make the red go away until it is established which of the
  two it is.
  Criticality: medium — it hides no product defect on its own, but it reds the covering gate of
  every point whose pass includes `village-loom`, and a rotating red is the thing point 549 was
  built to abolish.
  Test: the section runs ten times on the pinned world with the same verdict every time, and
  whichever cause was found is named in the commit message with its evidence.
  Refs: scripts/verify/polish.mjs:6123, commit 503492100, point 200, point 549, point 568,
  point 570, point 642, point 939
  Bundle: Testinfrastruktur

- [ ] 1192. A verification run that ran no suite is RED, never GREEN.
  PROBLEM. `npm test -- 'polish --section=village-loom'` (the suite and flag as ONE argument,
  as an unsplit zsh variable passes them) printed `ALL GREEN — 0 suites run` and a GREEN
  receipt with `suites: (none recorded)`, frames 0/0 (23.09.2026, 1174 worktree,
  `local/verify-logs/2026-09-23T05-51-19-866-polish_--section_village-loom.log`). Such a
  receipt can stand in for a ladder rung or a point's suite evidence: a false approval.
  FINAL STATE: `scripts/verify/run-all.mjs` exits non-zero with a named cause when the
  selected suite list is empty or an argument names no known suite; the receipt says RED.
  A unit test calls the real selection with an unknown/merged argument and asserts the red.
  Criticality: medium — permits a false approval (CLAUDE.md §2 finding intake).
  Refs: scripts/verify/run-all.mjs:717, scripts/verify/tiers.mjs (`parseArgs`, `suitesFor`).
  Bundle: Modell & Wächter

- [ ] 1197. The loom reads from the plaza in the eight village plans point 1191 left far.
  (Drained from the findings carrier, 23.09.2026; follow-up of point 1191.)
  Bundle: Dorfleben
  PROBLEM, measured 23.09.2026 on main after point 1191 with `buildLayout` over the loom.test.ts
  seeds (7, 42, 1337, 394349866, 1838110026): `loom-unseen-from-plaza` still fires for
  swahili-village at 7/1337/394349866/1838110026, tuareg-village at 1337/1838110026,
  hausa-village at 1838110026 and san-village at 394349866 (53 of 115 pairs on fd009039b, 8 now).
  Separately, the shipped Bambara plan's station stands 16.4 m from the nearest plaza stand,
  over the point's "~15 m", and bambara-village@42 keeps its 28.8 m seat because its plan
  cannot spare a compound (three enclosures is the floor). Traced on Bambara: west of the
  plaza the water head's talk separation, east the children's, north the 4 m inland slack
  leave no free ground within reach; the swahili coastrow has no household that may give way.
  FINAL STATE: none of these pairs fires the assert, the seat stays within 17 m of a stand,
  and the plan floors of point 1191 (compounds, dwellings, ksar block, dressing) still hold —
  the likely lever is a compound shifting outward on its ring rather than being left unbuilt.
  Criticality: medium. Test: Vitest over the five seeds; `polish --section=village-loom`.
  Refs: src/scenes/place/layout.ts (displacedBy, affordable, topUpCompounds),
  src/scenes/place/loom.ts (placeLoom passes), point 1191

- [ ] 1203. The voice suite reds on a network hiccup at huggingface.co.
  PROBLEM, measured 23.09.2026 on feat/1174 e5b3b6407, webgl/voice: `TTS assets recorded into
  the local cache` (scripts/verify/voice.mjs) failed with 12 assets served and one
  `fetchErrors` entry — `voices/bm_george.bin` from huggingface.co, "fetch failed". The check
  treats any fetch error as a product red, so an external network transient blocks the render
  gate until someone charges it by hand.
  FINAL STATE: a fetch error that is a network failure of the external model host (no HTTP
  status) is reported as an ENVIRONMENT transient — the check fails soft with that label and the
  run is not counted as a product red — while an HTTP error status or zero assets recorded stays
  a hard red. CLAUDE.md §7.2 ("fail soft for environment/staging transients") is the rule.
  Criticality: low — no player impact; it unblocks the gate from outside noise.
  Test: `npm test -- voice` on WebGL 2 with the host reachable (green) and with a blocked host
  route for one voice file (soft, labelled); a Vitest case if the classification is a pure helper.
  Refs: scripts/verify/voice.mjs, scripts/render-verify-charges.mjs.
  Bundle: Testinfrastruktur

- [ ] 1217. The gamepad and touch suites still call the Nubian chief out of his hut.
  PROBLEM, measured 26.09.2026 in the closing LARGE on main 5dff420 (WebGL 2 lane):
  gamepad `interact-chief` and touch `prompt-tap` red — the prompt shows, but
  `chiefOutside` stays false. Since 333c0c66d only Bambara's chief (DRUM_MESSAGE_VILLAGE)
  steps out (src/state/store.ts L798); the Nubian chief answers with the no-message toast.
  Both checks still enter `nubian-village` — a stale expectation, not a product defect.
  FINAL STATE: both checks enter the drum-message village (or assert the no-message toast
  in the Nubian one); gamepad and touch are green. Remove this point's charges from
  scripts/render-verify-charges.mjs when it lands.
  Criticality: low — test expectation; no player impact.
  Test: gamepad --section=interact-chief and touch --section=prompt-tap green.
  Refs: scripts/verify/gamepad.mjs, scripts/verify/touch.mjs, scripts/render-verify-charges.mjs.
  Bundle: Kommunikation.

- [ ] 1222. The WebGPU world suite no longer aborts on a click the dialog backdrop intercepts.
  PROBLEM, measured 27.09.2026 in the closing LARGE on main 4f6c83e (WebGPU pass, log
  `local/verify-logs/2026-09-26T20-55-22-675-large.log`): world ends 7 pass, 0 fail, exit 1 — a
  Playwright TimeoutError after 32 click retries because `<div class="dialog-backdrop">` intercepts
  pointer events. No open point carries this red.
  FINAL STATE: the cause is found (a dialog the suite does not close, or one a player cannot close)
  and fixed; world exits 0 on WebGPU and WebGL 2.
  Criticality: medium — the suite's exit hides every later world check on WebGPU.
  Test: world suite green on both backends.
  Refs: scripts/verify/world.mjs, the dialog backdrop component.
  Bundle: Testinfrastruktur.

- [ ] 1223. The WebGPU polish suite finishes inside its wall timeout.
  PROBLEM, measured 27.09.2026 in the closing LARGE on main 4f6c83e: polish was KILLED after the
  45-minute wall timeout on WebGPU; the WebGL 2 pass of the same run finished (its reds charged to
  1197 and 1202). No open point carries this red, and the kill hides every WebGPU polish result.
  FINAL STATE: it is measured whether the suite hangs or is slow; a hang is fixed, a genuine slow
  run is split or given a justified timeout; polish reports PASS/FAIL lines on WebGPU.
  Criticality: high — the largest picture suite yields no WebGPU evidence.
  Test: polish on WebGPU ends with its PASS/FAIL line inside the timeout.
  Refs: scripts/verify/polish.mjs, VERIFY_SUITE_TIMEOUT_MS.
  Bundle: Testinfrastruktur.

- [ ] 1224. The Victoria Falls enrichment frame shows its subject on WebGPU.
  PROBLEM, measured 27.09.2026 in the closing LARGE on main 4f6c83e (WebGPU pass): enrichments
  45 pass, 1 fail — frame `72-water-victoria-falls`: its subject is not in the rendered picture
  (off the left and bottom edge of the frame). No open point carries this red.
  FINAL STATE: the frame's camera frames the falls on both backends, or the subject declaration is
  corrected to what a player sees there.
  Criticality: medium — a water-realism evidence frame (§7.1 pt 21) is missing its subject.
  Test: enrichments green on both backends; picture check of the frame.
  Refs: scripts/verify/enrichments.mjs, the Victoria Falls water scene.
  Bundle: Testinfrastruktur.

- [ ] 1225. The place-scene unit tests pass in a full unit run under load.
  PROBLEM, measured 27.09.2026 by the closing cleanup's chunk authors (branches feat/633-cleanup-c01
  77fae9a1b, -c02 f77a6e33a, -c03 06843b44a, none touching src/): the full `npm run test:unit`
  went red on 20-second timeouts in src/scenes/place/layout.test.ts (3 tests) and bankGame.test.ts
  ("calls ROCK once with nobody arriving…") at machine load ~10-12; alone both files pass (669/669),
  and bankGame failed 1 of 3 isolated runs. The mandatory unit gate turns red at random.
  FINAL STATE: the cause is measured (slow setup, real-timer wait, or order dependence) and fixed so
  both files pass inside their timeout in a full run under parallel load; bankGame is deterministic.
  Criticality: medium — a random red blocks landings and invites a retry, which covers nothing.
  Test: three consecutive full unit runs with both files green; bankGame alone 10/10.
  Refs: src/scenes/place/layout.test.ts, src/scenes/place/bankGame.test.ts.
  Bundle: Testinfrastruktur.

- [ ] 1228. The fire tender faces the fire.
  PROBLEM, found by closing 633's blind cleanup (docs/blind-633/decisions/c09.json U4844):
  `PlaceLife.tsx` turns the fire tender toward the hard-coded point (-3.5, 2.5) instead of the fire
  at `firePos` (he stands at firePos − (1.3, 0.7)).
  FINAL STATE: his rotation aims at `firePos` in every village.
  Criticality: low — visible in villages whose fire is off that point.
  Test: unit assertion on the heading for a moved fire; picture in such a village on both backends.
  Refs: src/scenes/place/PlaceLife.tsx.
  Bundle: Dorfleben.

- [ ] 1236. The calf crossing fix leaves two wildlife reds on WebGL 2
  MEASURED 01.10.2026 ~12:19, whole `enrichments` on WebGPU (HEAD 933352068 of point 1249, suite-only change): `channel-crossing` red there too with the same `{"staged":true,"sawOnWater":false,"sawLowY":false,"landed":true}` — not WebGL-2-only.
  MEASURED 29.09.2026 ~14:33, full `VERIFY_GL=webgl node scripts/verify/run-all.mjs enrichments` on main after the 1234 landing (machine flagged UNDER LOAD, so timing verdicts are not authoritative; WebGPU full run: only the charged `72-water-victoria-falls` red). Reds:
  (1) `calf-crossing-flee` arrival variant: `{"start":{"terrain":"water","dP":1.25},"crossingEndedAt":0.08,"maxDP":1.4,"atEnd":{"toTarget":0.094,"terrain":"mountain"}}`. The traveller was never moved outside the ring (dP stays ~1.3 instead of 12), and the calf ends 0.094 from its target rather than on it.
  (2) `channel-crossing` (point 192): `{"staged":true,"sawOnWater":false,"sawLowY":false,"landed":true}`. The purposeful crossing lands without ever swimming; suspect the 1234 arrival snap (`waterCross.arriveUnits`) or the shy-ring interruption of a crossing.
  FINAL STATE: both causes are named and fixed (or (2) is shown to be load and not 1234, by a quiet re-run); `npm test -- enrichments --section=calf-crossing-flee` and `--section=channel-crossing` are green on both backends; the unrelated `dressing-growth` red of the same run is charged or filed on its own.
  Bundle: Tierverhalten.
  Criticality: medium.

- [ ] 1242. The river beyond the plate rim is a different, darker water than at the bank (both backends)
  MEASURED 30.09.2026 07:14Z, `VERIFY_GL=webgl npm test -- polish --section=adult-errands` on feat/1152 6922bdb2c: `the water beyond the plate's rim is the SAME water as the water at the bank (<= 12/255 per channel)` RED, far 11/92/104 against near 139/157/147, median step 127.5; its sibling `the handover zone itself carries neither band's edge` RED, median step 68.3. This is a STEADY red, not point 568's rotation (568 straddled 12-19): the same pair was red at step 99.6-126.1 in the LARGE runs of 26.09 and 28.09 (on both backends at 28.09 18:09Z and 21:55Z). On WebGPU the check was green on feat/1152 at 05:07Z, after point 1151's sky/water fix. Point 1152 (foam patches) did not cause it.
  ALSO RED ON WebGPU, measured 02.10.2026: the same pair red in the full `polish-villagers` pass on feat/1108 d6a9d37aa (median step 148.8 / 75.9; WebGL 2 25.1 / 12.5) and already on feat/1117 06312849a at 19:52Z (step 133.2) — before point 1108, which only moves the errand shots' cameras.
  STILL RED 05.10.2026, WebGPU full `polish-villagers` pass on feat/1295 b96a04e78 and on 85207f7c6 before any 1295 commit: median step 20.4 (beyond the rim) and 13.3 (rim-zone line).
  STILL RED 20.10.2026 on both backends, `polish-villagers --section=adult-errands` on feat/1347-garment-rebuild with game code identical to main 12e60bb30: the same two river-water checks.
  FINAL STATE: the far water continues the bank water's tone on BOTH backends and both checks are green there.
  Test: `polish --section=adult-errands` on both backends; a Vitest on the layer the fix touches.
  Refs: src/render/placeRiver.ts, scripts/verify/polish.mjs, point 568, point 1151.
  Bundle: Dorfleben.
  Criticality: medium — visible at every village river on the WebGL 2 fallback.

- [ ] 1243. Khartoum confluence: a straight-edged darker water wedge where the two Nile strips overlap
  SEEN 30.09.2026 in `11-worldmodel-khartoum-confluence` (world, landmark-frames) on BOTH WebGPU and
  WebGL 2, and in `126-clearance-khartoum`: from the junction two straight edges run outward and the
  water between them is a flatter, darker tone than either arm — two translucent river strips drawn
  over each other instead of one merged surface. Distinct from point 1242 (plate rim, WebGL 2 only).
  FINAL STATE: the confluence reads as one continuous water surface with no straight tonal edge.
  Test: `world --section=landmark-frames` picture on both backends; a Vitest on the layer the fix touches.
  Refs: the world river strip builder, point 1145 (its frames), point 1242.
  Bundle: Dorfleben.
  Criticality: medium — visible at every river junction the player crosses in the bird's-eye view.

- [ ] 1244. 648-village-children misses its subject off the bottom edge only inside a whole polish pass
  Split out of point 1145. MEASURED 22.09.2026 at e1b7d1561: a whole `polish` pass on WebGL 2 refused
  `648-village-children` off the BOTTOM edge twice in a row, while `polish --section=children-tag`
  passed 16/16 on the same tree and on `main` 86c4babaf; the same wording appeared in a whole WebGPU
  pass at 9259d6dd8. So an earlier polish section leaves the children or the camera displaced. Since
  point 1145 the miss is one failed check, not a dead pass.
  FINAL STATE: the frame is written with its subject inside a whole pass on both backends, or the
  leaking section is named and its state restored.
  Test: whole `polish` on WebGL 2; the section rung `children-tag`.
  Refs: scripts/verify/polish.mjs, point 1145.
  Bundle: Testinfrastruktur.
  Criticality: medium — one red check per polish pass until fixed.

- [ ] 1253. Picture sections that set a game condition by knob need a player-path counterpart
  Source: request deposited 01.10.2026 05:28 by session d17af0dd (findings carrier), cut from e9515346d.
  Lesson from point 1250: the 1245 polish section `villager-canoe` (scripts/verify/polish.mjs at 733e920) marked ROCK as heard (`g.hearUtterance(g.vocabulary.ROCK)`, justified as "a player standing here has met the rocks already") and cut the children's `roamSeconds` from 55 s to 8 s. Those two "spectator-time knobs" skipped exactly the two gates that left the boatmen and the children mute for over a minute after entry, so the suite was green while the player met a silent scene.
  Rule to record: a knob that only saves waiting time may stay, but whenever a test sets a GAME CONDITION by knob (a heard word, a skipped phase, a pre-seeded state, a shortened phase whose length decides what the player meets), the same behaviour also has a run that enters the scene the way the player does, with no knob turned — like the 1250 section at seed 2425147265.
  Final state:
  1. Audit the browser suites (polish, communication, and the others that write window.__balance or call store actions such as hearUtterance before measuring) and list every section that sets a game condition by knob.
  2. For each one, name its existing untouched player-path counterpart, or add one (an untouched entry plus a time-bounded assertion that the player meets the behaviour), or charge the gap to an open point.
  3. Write the rule once into scripts/verify/README.md (test strategy), next to the knob convention.
  Infrastructure freeze (CLAUDE.md §2) applies: NO new guard, hook or ledger field — this is test coverage plus one documentation rule.
  USER, verbatim:
  Assistant 01.10.2026: "Die Lehre daraus: Wenn ein Testknopf Zeit spart, darf er keine Spiellogik überspringen, sonst sieht der Test nicht mehr, was der Spieler erlebt. Jedes Mal, wenn ein Test eine Spielbedingung per Knopf setzt, muss es zusätzlich einen Lauf geben, der die Szene so betritt wie der Spieler. Soll ich das als Befund für den Batch einreichen?"
  user 01.10.2026: "Ja, mach das."
  Bundle: Testinfrastruktur.
  Criticality: medium — a knob-staged suite can stay green while the player meets a broken scene.

- [ ] 1263. The continuous route's river invitation never targets a speech label on WebGL 2
  Source: covering WebGL 2 pass of point 1262 (02.10.2026).
  THE RED. `VERIFY_GL=webgl npm test -- communication --section=continuous-route` on feat/1262 at
  7f3ad701a (main 543689b21 merged): steps 1-3 green, then `FAIL frame
  communication-webgl-1790917974739-04-river-invitation — its subject is not in the rendered
  picture: no element matches .speech-label.targeted` and `FAIL continuous route at 4-guesses:
  locator.waitFor: Timeout 30000ms exceeded` (log
  `local/verify-logs/2026-10-02T05-12-50-731-communication.log`). Machine quiet unverified. The
  same HEAD ran the section GREEN on WebGPU (log `…2026-10-02T04-58-15-452-…`).
  Final state:
  - The cause is named with its measurement (no RIVER speaker reaches the stand, or the label
    exists but is never targeted on WebGL 2?).
  - `communication --section=continuous-route` passes step 4 on WebGL 2 without a lengthened wait.
  Tests: Vitest for a logic cause; the existing Playwright step is the scene check.
  Bundle: Dorfleben.
  Criticality: medium — a WebGL-2-only red; it blocks the covering WebGL 2 communication proof
  in the next LARGE.

- [ ] 1266. The parked loom reads too small from its plaza stand
  Source: reopened 02.10.2026 from the backlog park of point 1255 (by point 1258), because the
  `village-loom` section switches the loom on for its own checks and its plaza red is identical
  on `main` and on feat/1129 (64.3-64.4 px at the 21.285 m stand); an unowned red blocks 1129's
  covering proof, and the park left no owner. Decision recorded by the batch owner: reopen
  rather than soften the check (1129 forbids weakening); veto = return it to the backlog and
  accept that `polish-villagers` cannot read green while the loom is parked.
  THE RED. `polish(-villagers) --section=village-loom`: "from the plaza the station stands at
  least 70 px tall on the screen" — {"px":64.36,"viewport":900,"dist":21.285}. On 23.09.2026
  the same search found 16.4 m and 94.9 px; candidates in `src/scenes/place/` include
  0bd2d2992, a1f26c86c and 22ec01c17.
  Final state:
  - The commit that moved the stand is named with the reading on either side of it.
  - Either the loom again reads from the plaza (>= 70 px from the nearest open stand), or the
    threshold's premise is revised with the reason recorded.
  - `polish-villagers --section=village-loom` green on WebGPU; frame 1183 picture-checked.
  Tests: the existing Playwright check is the right layer; no new mechanism.
  Bundle: Dorfleben.
  Criticality: low — the loom is switched off for the player (`loom.placed: false`).

- [ ] 1267. The speech-inaudible assert reads a stale speech bus at the end of a drum message
  Source: first measured 02.10.2026 16:20 in the WebGPU theme run of point 1129 on 9ff47b8f4
  (`polish-speech`, section `artefact-give`); no earlier recorded log holds this signature.
  THE RED. Right after the chief's drum answer, a 4-syllable phrase fired
  `[ASSERT] speech-inaudible — … leave the graph at 0.00e+0 (peak 0.083, speech bus 0.000,
  master 0.500 …) while the speech volume is 3`. `playDrumMessage` quiets the bus with
  `quietSpeechBus` (0 now, volume again at `now + duration`) and `playSpeech` exempts only
  `ctx.currentTime < speechQuietUntil`. Read from the code, not yet proven: `AudioParam.value`
  on the main thread is the rendering thread's last posted value, so for a render quantum or
  more after the window ends it can still read 0 while the restoring automation has already
  run — a detector false positive, not silent speech.
  Final state:
  - The cause is measured (log the param value against `currentTime - speechQuietUntil` at the
    firing, or reproduce it in Vitest with a stubbed context); if it is the stale read, the
    assert computes the chain from the scheduled level past the window instead of the
    stale `.value`, with no exemption wider than the evidence.
  - If the bus is really silent past the window, that is the product defect to fix instead.
  - A Vitest case pins the boundary; `polish-speech --section=artefact-give` green on WebGPU.
  Tests: Vitest (jsdom) in `src/systems/ambience.test.ts`; the existing Playwright section.
  Bundle: Testinfrastruktur.
  Criticality: low — no player impact measured; it blocks the green of `polish-speech`.

- [ ] 1268. The bank game's announcing child is read without its pointing arm
  Source: first measured 02.10.2026 ~17:50 in the WebGPU theme run of point 1129 on 74b86cc18
  (`polish-children`, section `children-bank-game`); no earlier recorded log holds this
  signature, and the check moved unchanged from `scripts/verify/polish.mjs`.
  THE RED. `and the same child POINTS it — the arm carries as far as the voice` read
  `{"kind":null,"t":0,"duration":0,"bearing":0}` while the preceding check (the announced
  word READ over the calling child inside the picture) passed in the same poll. `announceRun`
  (`src/scenes/place/bankGame.ts`) gives voice and `point` gesture together, so either the
  word label outlives the gesture (or belongs to an earlier announcement of the same word),
  or the gesture is cleared or never armed while the voice is offered — the second would be
  a player-visible mute arm.
  Final state:
  - The cause is measured (label age and gesture state at the poll, over repeated
    `--section=children-bank-game` runs on a quiet machine); a product cause is fixed in the
    game, a check cause is fixed by reading the gesture of the announcement the label
    belongs to, with no tolerance wider than the evidence.
  - `polish-children --section=children-bank-game` green on WebGPU; a Vitest case pins the
    voice/gesture pairing if the game owed the fix.
  Tests: Vitest (jsdom) beside `bankGame.ts`; the existing Playwright section.
  Bundle: Testinfrastruktur.
  Criticality: low — no player impact measured yet; it blocks the green of `polish-children`.

- [ ] 1270. The two-close-speakers shot finds no pair whose tails sit on their own anchors on WebGL 2
  Source: measured 02.10.2026 ~18:40 in the WebGL 2 covering run of point 1129 on 001ef76f1
  (`polish-speech`, section `speech-owner`, log
  `local/verify-logs/2026-10-02T16-39-56-622-polish-panorama-polish-speech-polish-settlement-polish-children-polish-villagers.log`);
  the check came with point 1238 and was last red during its own development on 29.09.2026;
  the section alone was green on the same head 27 min later, which does not close it.
  THE RED. "two close speakers are shot unobstructed, each tail on its own speaker's anchor, the
  older note receded and neither targeted (point 1238)": 16 pairs 1.2-4 m apart were tried; sight
  was clear (0.97-0.99) but every attempt read `tails false`, and one was rejected at the shutter.
  Final state:
  - The cause is measured over repeated `--section=speech-owner` runs on WebGL 2 on a quiet
    machine (which pairs, what each tail anchor read); a staging that gives up while an honest
    pair exists is fixed in the staging, and a real tail-anchor defect is fixed in the speech
    labels, with no check weakened.
  - `polish-speech --section=speech-owner` green on WebGPU and WebGL 2; its frame picture-checked.
  Tests: the existing Playwright section; no new mechanism.
  Bundle: Testinfrastruktur.
  Criticality: low — no player impact measured; it blocks the green of `polish-speech` on WebGL 2.

- [ ] 1292. The pounding check counts two strikes against three heard thuds on WebGL 2
  Measured 04.10.2026 on the covering WebGL 2 run of `polish-villagers` after point 1121
  (`local/1121-pv-webgl.log`): FAIL "both women strike the mortar and every strike is heard"
  `{heardThree:true, struck:2, heard:3, thuds:3}` [--section=village-pounding]. Not 1121's (that
  point only changed the river-bank aim block); the same check ran green on WebGPU minutes earlier.
  The strike counter appears to miss a strike whose thud was heard — a counting race, not a missing sound.
  Done when: the strike count and the heard thuds are read from the same moment, and the check stays
  able to fail on a strike that is truly silent.
  Bundle: Testinfrastruktur.
  Criticality: low — a test-side race, no player impact measured.
  Also on WebGPU (18.10.2026): full polish-villagers on feat/1375 35d84fe reds the same
  `{heardThree:true, struck:2, heard:3, thuds:3}` (log local/verify-logs/2026-10-18T02-30-03-836-polish-villagers.log);
  the next `--section=village-pounding` run was green, so the race is not WebGL-2-specific.
  Second wording (18.10.2026, main 7690109ce, WebGL 2 full polish-villagers after point 1354): FAIL
  "back at the mortar both strike again, half a stroke apart" — before [195,194] after [196,194], every
  gap 0.50: the 80-frame window missed the second woman's strike. Same counting race; 1354 only touched
  villager poses. Done-when covers this check too.

- [ ] 1296. The full world suite crashes on WebGPU at the rock-relief click behind an open dialog
  Measured 05.10.2026, 08:40-08:45, on main 69221cd36: `VERIFY_GL=webgpu` world (full suite) exits 1 twice in a row with
  "7 pass, 0 fail" and an uncaught TimeoutError — `page.locator('[data-form="rock-relief"]').click()`
  (`scripts/verify/world.mjs` ~412) retries 30× because `<div class="dialog-backdrop">` intercepts pointer events; last
  frame written 19-worldmodel-communication-erratic. The same suite ran green on WebGL 2 in between. Log:
  `local/verify-logs/2026-10-05T06-44-13-220-world.log`.
  Done when: the dialog whose backdrop covers the click is identified (measured, not assumed), and either the staging
  closes it before the act or a product defect that opens it there is fixed; the full world suite is green on both
  backends with no check weakened.
  Bundle: Testinfrastruktur.
  Criticality: medium — the world suite cannot cover a render change on WebGPU until it is fixed.

- [ ] 1300. The loom station and the mute-shore boatman reading are red in polish-villagers independent of any branch
  Queue position: end of the open work order.
  MEASURED 05.10.2026, WebGPU full `polish-villagers` pass on feat/1295 b96a04e78, and with near-identical numbers on 85207f7c6 before any 1295 commit: `village-loom` station 52.8 px tall seen from the plaza (check needs 70); `mute-shore-scene` boatman reading taken at 9.7 s (red). Not yet reproduced on a quiet machine.
  Final state:
  1. Each of the two checks is reproduced on a quiet machine on WebGPU and WebGL 2, or shown to be a load transient (then recorded as such and closed).
  2. A reproduced red is fixed at its cause (scene or check), not by loosening the threshold without a measured reason.
  3. `polish --section=village-loom` and `polish --section=mute-shore-scene` green on both backends.
  Test: the two sections above on both backends; a Vitest on the layer a fix touches.
  Bundle: Testinfrastruktur.

- [ ] 1381. The canoe-fish check sees its third fish hidden by an unnamed BoxGeometry on WebGL 2
  Queue position: end of Testinfrastruktur.
  Source: findings carrier 18.10.2026 21:55 (WebGL 2 covering run after point 1354). main 7690109ce,
  `VERIFY_GL=webgl` full polish-villagers, section villager-canoe: fish samples
  `[{px:84,seen},{px:72,seen},{px:64,seen:false,hit:BoxGeometry}]` — the check wants at least three
  unhidden fish of 25 px or more; green on WebGPU at the same head. 1354 only touched villager poses.
  Final state: the occluding BoxGeometry is named (which scene object it is) and either the check
  aims past it or the occlusion is fixed as a scene defect; the check stays able to fail when fish
  are truly hidden.
  Verifiable: `VERIFY_GL=webgl npm test -- polish-villagers --section=villager-canoe` green on two
  consecutive runs; WebGPU section stays green.
  Also (findings 25.10.2026, same section and occlusion reading): the children's-game check
  "from behind the upstream rock the children's game is in frame" saw 2/5 children on WebGL 2 at
  feat/1446 957968566 and again at feat/1333 8d9d3217e (log 2026-10-25T20-16-48-094), green on
  WebGPU; the same run also reddened "village walk: each arm swings against its own side's leg"
  (gait gaps) on WebGL 2 only. Name both causes here; split if they prove unrelated.
  Also (finding 26.10.2026, feat/1415 d3201e61c): the same gait-gap signature reddened WebGPU
  `--section=village-walk` once in three narrow runs ("planted stances were observed", "a planted
  foot does not slide"; walker 2 gaitWalk 0 at ~2 m/s), log local/1415-suspect-rungs.log, and
  "village walk: the camera found a free spot side-on to the walker" once in the full WebGPU run
  (log local/verify-logs/2026-10-26T06-39-00-663).
  Also (finding 09.11.2026, feat/1301 ec605e18b): the same side-on walker check red once on WebGL 2
  (green on WebGPU at that sha and on WebGL 2 at 1d55f9f75), log local/1301-walk-webgl.log.
  Bundle: Testinfrastruktur.
  Criticality: low — a test-side occlusion, no player impact measured.

- [ ] 1382. The WebGPU polish-villagers suite finishes inside its wall timeout.
  Queue position: front of Testinfrastruktur — the covering run of point 1380 is owed on both backends.
  Source: findings carrier 19.10.2026 04:01 (covering run after point 1380). main dd8bde59c,
  `VERIFY_GL=webgpu` full polish-villagers: KILLED after the 45-min wall timeout with 51 frames
  written (23 expected floor), last sign of life 16 s-3 min before the kill, so slow rather than
  hung. Log local/verify-logs/2026-10-19T03-15-30-181-polish-villagers.log. Section figure-micro
  was green on both backends at 949aa441a; the WebGL 2 covering run is still owed. Sibling of 1223
  (same symptom on `polish`).
  Final state: measured whether 1380's added sections pushed the suite past
  VERIFY_SUITE_TIMEOUT_MS; the suite is split or given a measured, justified timeout; the covering
  pass then runs on both backends.
  Verifiable: `VERIFY_GL=webgpu npm test -- polish-villagers` ends with its PASS/FAIL line inside
  the timeout; the WebGL 2 pass likewise.
  Bundle: Testinfrastruktur.
  Criticality: high — the villager picture suite yields no full WebGPU evidence.
  Recurred 19.10.2026 on BOTH backends at feat/1343 (WebGPU 3f4d620d9, log local/verify-logs/2026-10-19T09-37-31-282-polish-children-polish-villagers.log; WebGL 2 e5fbb1179, log local/verify-logs/2026-10-19T11-17-49-518-polish-children-polish-villagers.log): KILLED at 45 min each, so the fix covers both backends.
  Also owed once green (findings carrier 19.10.2026): the full `polish-villagers` covering run for landed point 1387, which was checked only with `--section villager-canoe` on both backends; its 19:20 run was aborted at the context watermark.
  Also (26.10.2026, feat/1415 d3201e61c): two WebGPU reds appear only in the long full run — "figure micro-structure: walk frame B shows the same walker at the opposite stride phase" (walker moved out of frame B; log local/verify-logs/2026-10-26T06-39-00-663) and "and he is still under it at the shutter" (adult-errands, the 05:21 run that crashed) — green on the merge-base and in three `--section=figure-micro` runs; measure whether full-run load causes them and split them off if not.

- [ ] 1383. Natural villager motion d: turning, point and reach, pick-up, carry, calibration sweep
  Queue position: directly after point 1343.
  Source: split from point 1343 on 19.10.2026 (owner decision under the standing split rule): its author delivered concept steps 15 and 16 only.
  Spec: docs/natural-villager-motion-concept.md steps 12, 14, 17, 18, 19 and step 20's remaining evidence; the concept's §7 kneel-clip item belongs with step 17. Calibration input: the caught-child hold (`VILLAGER_POSE.caughtSlump`) reads only faintly at the river bank's 10-14 m spectator distance.
  Carried from point 1343: concept step 16's softened knee and weight shift on the caught child (a per-leg pose on the standing legs) is built here.
  Final state: point 1316's final state 5 for walk, turn on the spot and in motion, run, dig, pick up, point, carry and reach, as the concept's steps specify them.
  Verifiable: each step's *Verified* list in the concept; penetration gate and full-ramp no-slide test green; before/after strip of walk, turn, run, dig, pick-up, point and carry; picture check in a port city and a village on both backends, judged by looking; cross-vendor code review record.
  Bundle: Dorfleben.
  Criticality: high - every villager, both backends.

- [ ] 1397. Village walk: planted-stance and foot-slide checks red on WebGL 2 only
  Queue position: with point 1396 (Dorfleben), after the planted-soles work of point 1330.
  Source: finding 20.10.2026 14:43 from the point-1347 inventory run: `polish-villagers --section=village-walk` red on WebGL 2 (planted-stance and foot-slide checks) and green on WebGPU on feat/1347-garment-rebuild, whose game code equals main 12e60bb30. Not investigated; may share a cause with 1330 or 1396.
  Final state: the village-walk planted-stance and foot-slide checks are green on both backends, or the WebGL 2 difference is named and fixed at its cause.
  Verifiable: `polish-villagers --section=village-walk` green on WebGL 2 and WebGPU; a Vitest on the layer the fix touches.
  Criticality: medium - a red regression lane on the fallback backend.
  Bundle: Dorfleben.

- [ ] 1428. Bank-game hands stand off their stones on main
  Source: finding 23.10.2026 09:54 during point 1424 (landing gate 2, present on main e35b98a19, WebGPU, quiet host): polish-children --section=children-bank-game is red on main — tapping hand 34.1 cm off the flank 8.96 s into the hold with the touch gesture 0.04 s old; child 3's hand 38.6 cm off the stone in the word frame (shoulder drawn -0.07 rad against -2.65 rad written); the arriving runner's drawn hand 31.6 cm off the far stone; 7 of 15 frames missing. Log: local/verify-logs/2026-10-23T07-28-33-313-polish-children.log.
  Final state: the tapping hand stays within 5 mm of the flank over the whole hold and is on the stone in the word frame; the arriving runner's drawn hand stays within 5 mm of the far stone; all 15 section frames are written.
  Verifiable: polish-children --section=children-bank-game green on both backends; a Vitest on the touch-pose timing where the cause is browserless.
  Criticality: medium - visible hands off the stone in every bank round.
  Bundle: Dorfleben.

- [ ] 1434. Two unowned WebGL 2 reds in the children suite: a standpoint in the open, and a child walking without getting anywhere
  Final state: the full WebGL 2 polish-children run on main is free of both reds, or each is traced to a named cause and fixed: (a) "the children are photographed from a standpoint in the open" (2 of 5 in the clear, maasai-village); (b) "no child walks without getting anywhere" (worst child 0 at 1.47 % of its own judged time, group 0.29 %, 18 of 5875 1 s windows). Read the log first and decide per red whether it is product or picture fixture; a fixture cause is fixed in scripts/verify, a product cause in the children's paths. Its charges in scripts/render-verify-charges.mjs die with this point.
  Observed problem: both reds came up on the full WebGL 2 run on main ac714e5cf after point 1424 landed (log local/verify-logs/2026-10-23T10-51-21-476-polish-children.log), owned by no point; the predecessor session deferred them with the order to file them as a point (render-verify-guard deferral at fcbf6a1).
  Source: render-verify-guard of 23.10.2026, deferral of the 1424 landing session.
  Bundle: Dorfleben.

- [ ] 1435. WebGL 2 water stand reds: the recorded water errand runs past its window, and the empty jar moves too fast in his first steps
  Final state: polish-villagers --section=water-stand-table is green on WebGL 2 as it is on WebGPU, or each red is traced to a named cause and fixed: (a) "one whole water errand was recorded" timed out (villager 1, 4052 frames in 240 s), which pulls "he sets the full jar down standing at the table" and "his report points at the water he set down" red with it; (b) "the empty jar is taken up from the plank" with the fastest move in his first steps 6.66 m/s (frame 230, 0.296 m in 45 ms, body turned 0.121 rad) against the 6 m/s carry-walk bound. Decide per red whether it is product (the jar pops as he turns off the table, or the carrier stalls on the way) or fixture (wall-clock window, frame pacing); a fixture cause is fixed in scripts/verify, a product cause in the water errand or the carried-prop hand-off. Its charges in scripts/render-verify-charges.mjs die with this point.
  Observed problem: the WebGL 2 section run on feat/1405-water-carrier-table 98049d22b (log local/verify-logs/2026-10-23T16-40-45-147-polish-villagers.log) after the WebGPU run at the same head was green; both WebGL 2 frames (take, report) show the user's three goals met. Split from 1405 so the user's report could land.
  Source: picture check of the 1405 landing session, 23.10.2026.
  Also on WebGPU (measured 25.10.2026): red (b) is red in the full WebGPU polish-villagers run on feat/1446 957968566 (log local/verify-logs/2026-10-25T07-06-50-791-polish-villagers.log: first steps 7.67 m/s, frame 124, 0.375 m in 49 ms, body not turned) and in the full WebGPU runs of 23.10. and 25.10.2026 03:40; the section run alone stays green there. Charged to this point for WebGPU too.
  Also on WebGPU (measured 25.10.2026): "his report points at the water he set down" red with 5 held frames (needs > 5; aim 0.071 m off, within 0.1) in the section run on feat/1432 f70d504a7 (log local/verify-logs/2026-10-25T14-50*-polish-villagers.log); green at e792c98b1 the run before with the same app code — the held-frame count depends on the frame rate inside the gesture window.
  Also on WebGPU (measured 26.10.2026): "the empty jar is taken up from the plank" reds with a third cause — the jar is lifted 0.24-0.28 m off the plank before it is in his hand (plank-to-hand gap <= 0.009 m) — in the full runs on feat/1415 d3201e61c (logs local/verify-logs/2026-10-26T05-52-03-752 and 06-39-00-663) and on its merge-base d034d5550 (local/verify-baseline-logs/polish-villagers-baseline-d034d55502aa-run1.log); the same lift (0.24 m) and "his report points at the water he set down" with the aim 0.102 m off (14 held frames) reddened the full WebGL 2 run on feat/1415 (log local/verify-logs/2026-10-26T09-01-27-566). Charged to this point on both backends.
  Also on WebGPU (measured 26.10.2026): "his report points at the water he set down" red with 9 held frames and the aim 0.137 m off (bound 0.1) in the section run on feat/1417 9bb6e1736, whose diff touches only the fishery (log local/verify-logs/2026-10-26T17-10-17-924-polish-villagers.log); the aim charge now covers both backends.
  Bundle: Dorfleben.

- [ ] 1449. Two unowned calf-in-river reds in the enrichments suite on WebGPU
  Final state: `npm test -- enrichments --section=calf-crossing-flee` and `--section=calf-shield-river` are green on WebGPU on a quiet machine, or each red is charged to its owning open point with the cause named: "the calf inside the traveller shy ring flees, into the river where its escape leads, its swim never taken for a fall-in" (measured `fallIn: true` at t 5.05 s, `chaseSwim: false`, `bouted: false`) and "a calf that swims the river ahead of its shield reaches the far bank and the hunt gives up (calf-in-water)" (measured: parent killed in the water at frame 34, the lion feeds and leaves, the calf alive on the savanna bank — the shield-ahead swim never staged). The stale charge of "every predator fits the region and period" to point 1013 is removed (it passed). The WebGL 2 run of both sections is recorded.
  Observed problem: full enrichments run on WebGPU, 26.10.2026 03:21-03:42, main 64bed6b45, machine quiet UNVERIFIED: 314 pass, 5 fail; three charged (938, 1236 twice), these two owned by no open point. Both stem from the calf-shield-river work landed with point 1297. Log: local/enrichments-webgpu-run.log.
  Source: findings carrier 26.10.2026 02:43 (enrichments run); a red closes only when fixed, charged or filed (CLAUDE.md §7.2).
  Bundle: Tierverhalten.
  Evidence 30.10.2026 23:44 (feat/642 724533d16, WebGPU, quiet unverified): `--section=calf-crossing-flee` ran the shy-ring flee check GREEN; its one red there is charged to 1236. One pass, not yet the final state.

- [ ] 1453. polish-speech speech-distance-scale crashes in the figureScreen test hook
  Final state: `npm test -- polish-speech --section=speech-distance-scale` runs to its 9 frames and is green on WebGPU on a quiet machine, or each remaining red is charged to its owning open point with the cause named. `figureScreen` (src/scenes/place/SpeechLabels.tsx) finds the figure's head geometry for the current figure build instead of assuming the first visible `figure-head` is a Mesh; a Vitest case pins the lookup.
  Observed problem: quiet WebGPU run 27.10.2026 02:54Z on main 9044a6684: RED after 53 s, 0/9 frames, `page.evaluate: TypeError: Cannot read properties of undefined (reading 'getAttribute') at figureScreen (SpeechLabels.tsx:261)`. The head found carries no geometry (likely a Group since a figure/garment rebuild). The suite last ran 03.10.2026, so the break went unseen for over three weeks. Log: local/verify-logs/2026-10-27T02-54-43-744-polish-speech.log.
  Criticality: low — dev test hook, no player impact measured; it blocks the green of `polish-speech`.
  Source: findings carrier 27.10.2026 02:55 (1452 step 5, M3 quiet reference); a red closes only when fixed, charged or filed (CLAUDE.md §7.2).
  Bundle: Dorfleben.

- [ ] 1460. Covering enrichments suite run on both backends for the two suite fixes of 27.10.2026
  Observed: commits 2eb353f2e (dressing-growth check sampled at the savanna anchor) and 27efb59ab (channel-crossing staged outside the shy ring) changed scripts/verify/enrichments.mjs; render-verify-guard records no covering run since — the last webgl run covered only section channel-crossing.
  Final state: VERIFY_GL=webgpu and VERIFY_GL=webgl node scripts/verify/run-all.mjs enrichments recorded clean (or every red charged to an open point), frames of both backends inspected.
  Criticality: low — verification debt; blocks the render-verify Stop guard. Needs a quiet machine.
  Bundle: Session- & Repo-Hygiene.
  Source: findings carrier 28.10.2026 04:10 'Enrichments covering run owed on both backends'.

- [ ] 1466. Ctrl actor labels fuse over most frames in a whole polish-speech run on WebGL 2
  Source: measured 29.10.2026 07:29 by point 1465 on feat/1465-polish-speech-webgpu-reds 56d0a9ae6,
  whole `polish-speech` on WebGL 2 (log `local/verify-logs/2026-10-29T06-29-04-941-polish-speech.log`).
  THE RED. "no two Ctrl labels fuse in the village crowd (point 628)": 50/90 frames held a pair fused
  beyond 6 px (allowed 13), 22 at the 18 px unreadable bar, deepest 19 px ["Child"×"Child" 30×19 px],
  16-19 labels in the sample. A SUSTAINED fusion, not the single-frame shape point 1010's charge owns.
  `--section=ctrl-actor-labels` alone was green on WebGL 2 on the same head minutes later (9/0), which
  does not close it; the WebGPU whole run of the same head had no such red.
  Final state:
  - The cause is measured: what the preceding sections leave behind (children's run state, crowd
    density, camera) that makes two child labels sit in each other over half the sample; a real
    label-placement defect is fixed in the labels, a staging leftover in the suite, no check weakened.
  - Whole `polish-speech` on WebGL 2 shows the check green; the charge in
    scripts/render-verify-charges.mjs is struck.
  Tests: the existing Playwright check; no new mechanism.
  Bundle: Testinfrastruktur.
  Criticality: low - WebGL 2 only, whole-suite only; a player may see two child Ctrl labels overlap.

- [ ] 1467. batch-doctor quarantine-stash aborts a live LARGE run
  Source: findings carrier 29.10.2026 19:04. At 19:02 `batch-doctor --repair` stashed the owner's
  uncommitted `.claude/closing-state.json` while the second closing LARGE on bcf9224ed was in its
  unit stage; the repository-integrity teardown failed with "own index changed" and the LARGE
  aborted red after 8m41s although all 18367 unit tests passed
  (`local/verify-logs/2026-10-29T18-54-19-533-large.log`). The doctor had seen the live run (it kept
  `verification/` out of the stash) and stashed anyway.
  Final state:
  - While a verify run is live, the doctor performs no index-mutating repair; it reports the dirty
    file instead. `.claude/closing-state.json` is not treated as an unattributable concurrent edit.
  Tests: a Vitest case in the doctor's test file for the live-run case.
  Bundle: Testinfrastruktur.
  Criticality: medium - a false red costs a full LARGE (2-3 h) and can stall a closing.

- [ ] 1468. Traveller head-height check at low detail reads just above its bound
  Source: findings carrier 30.10.2026 02:06. `enrichments --section=traveller-figure` on WebGL 2:
  "Traveller (low): his head stands at villager height" red on 54b326987 (28.10.2026 LARGE, headRise
  1.352 m) and a48606517 (30.10.2026, `local/verify-logs/2026-10-30T01-42-54-258-touch-enrichments.log`,
  1.356 m) against the bound 0.95 < headRise < 1.35; green in the 29.10.2026 LARGE on 8e0b36861.
  Not caused by the 1462 cleanup (red before it).
  Final state:
  - The cause is measured: whether the primitive (low) traveller figure stands too tall or the
    reading samples a pose-dependent head height; the figure or the bound is corrected with that
    reason, no check weakened without it.
  - The check is green on WebGL 2 and WebGPU; its charge in scripts/render-verify-charges.mjs is struck.
  Tests: the existing Playwright check.
  Bundle: Testinfrastruktur.
  Criticality: low - 6 mm over the bound at the low graphics level; hardly visible to a player.

- [ ] 1469. Load-sensitive waits in touch virtual-stick and the enrichments river-mouth hygiene step
  Source: findings carrier 30.10.2026 01:40/02:06. In the closing LARGE on a48606517
  (`local/verify-logs/2026-10-29T22-40-04-498-large.log`, WebGL 2, UNDER LOAD) touch "lifting the
  stick stops the walk — settled" was red and enrichments crashed at the river-mouth state-hygiene
  `page.waitForFunction` (scripts/verify/enrichments.mjs:1245, 30 s timeout). Both were green alone on a
  quiet machine 30.10.2026 03:05 (`local/verify-logs/2026-10-30T01-42-54-258-touch-enrichments.log`).
  Final state:
  - The touch settle wait (150 ms settle, then 200 ms drift < 0.1 m) cannot read a stalled frame as
    "settled" or a resumed one as drift; the river-mouth return wait waits on the jump completing
    with a cause-naming failure instead of a bare timeout.
  - Both suites are green in a whole LARGE on WebGL 2; the touch charge is struck.
  Tests: the existing Playwright checks.
  Bundle: Testinfrastruktur.
  Criticality: low - test-only; a false red costs a full LARGE.

- [ ] 1470. Caught-child frame of the bank game finds no shot inside its window in a whole run
  Source: v0.3.1 closing LARGE on d6fe67e7c, WebGL 2 (`local/verify-logs/2026-10-30T02-55-25-354-large.log`,
  30.10.2026): polish-children `children-bank-game` "a caught child was photographed standing slumped
  clear of the run, 10-14 m off (work-order 1239)" red — "no caught child could be photographed inside
  the window" (caughtMoments 568, alone 160, outside 3840, crowded 10720, collider 800). The same
  acquisition red was filed once before from a WebGPU run (archived, 19.10.2026) and closed by a quiet
  re-run; it recurs inside a whole LARGE.
  Final state:
  - The cause is measured: whether the window or the standpoint search misses caught moments that exist
    (568 seen, none shot), or the scene offers none clear of the run; the acquisition is fixed with that
    reason, no check weakened without it.
  - The check is green in a whole polish-children run on WebGL 2 and WebGPU; its charge in
    scripts/render-verify-charges.mjs is struck.
  Tests: the existing Playwright check.
  Bundle: Testinfrastruktur.
  Criticality: low - test-frame acquisition; no player impact shown.

- [ ] 1471. Moving capture of the turning errand adult reads it walking on between frames 1 and 2
  Source: v0.3.1 closing LARGE on d6fe67e7c, WebGL 2 (`local/verify-logs/2026-10-30T02-55-25-354-large.log`,
  30.10.2026): polish-villagers `adult-errands` "the filmed errand adult walks on between moving-capture
  frames 1 and 2 (point 1404)" red with no detail printed; not red in the earlier closing LARGE runs.
  Final state:
  - The check prints what it measured (positions/yaw of frames 1 and 2) and the cause is named: the
    adult standing still across the freeze, or the freeze holding life still between the two exposures.
  - The capture or the check is corrected with that reason; green in a whole polish-villagers run on
    WebGL 2 and WebGPU; its charge in scripts/render-verify-charges.mjs is struck.
  Tests: the existing Playwright check.
  Bundle: Testinfrastruktur.
  Criticality: low - test-only; a false red costs a full LARGE.

- [ ] 1472. Continuous route's downstream step finds no route from a water standpoint near Bandiagara
  Source: v0.3.1 closing LARGE on aed84aa2f, WebGPU (`local/verify-logs/2026-10-30T06-59-46-060-large.log`,
  30.10.2026): communication `continuous-route` "continuous route at 8-downstream-destination: No
  traversable route" — the traveller stood at lat 14.5628 / lon -3.8854 on terrain "water" (target
  x -34, z -141, toast "Discovered: Bandiagara"). The section alone on the same head (09:58 run) passed
  step 8, so it does not reproduce on every run.
  Final state:
  - The cause is measured: how the traveller came to stand on a water cell at the step-8 start (route
    overshoot, river crossing, spawn) and whether a player can reach the same state.
  - If a player can: the route or the movement keeps the traveller off untraversable water, with a unit
    test; otherwise the test's standpoint is corrected with that reason. Green in a whole communication
    run on WebGL 2 and WebGPU; its charge in scripts/render-verify-charges.mjs is struck.
  Tests: Vitest for a movement/route fix; the existing Playwright step.
  Bundle: Testinfrastruktur.
  Criticality: medium - possibly a player stuck on water; until measured, a false red costs a full LARGE.

- [ ] 1476. The rim water checks stay red after point 568 landed
  Source: owner 31.10.2026, landing point 1202. Point 568 landed (fb3132a95, phase-mean judging of the drifting streaks) and was ticked, but its four entries in scripts/render-verify-charges.mjs stayed, so the shipped-ledger unit test (`charges only points the work order still holds OPEN`) went red on main and stopped the 1202 landing gate.
  MEASURED 31.10.2026 at 9025afa7b (568 merged): `npm test -- polish-villagers --section=adult-errands` red on WebGPU AND WebGL 2, both rim checks — "the water beyond the plate's rim is the SAME water" (far 14/95/106 against near 31/85/95) and "the handover zone itself carries neither band's edge" (rim zone 8/87/100, median step 14.8: 9.5, 14.8, 21.3). Log: local/verify-logs/2026-10-31T12-34-50-156-polish-villagers.log.
  The four charges move from 568 to this point so the reds keep an owner.
  FINAL STATE: the per-run input behind the rim step named in 568's last evidence is fixed in the product or the check, both rim checks pass on WebGPU and WebGL 2 in three consecutive adult-errands section runs, and the four charges for this point are deleted.
  Test: `polish-villagers --section=adult-errands` on both backends; Vitest scripts/render-verify-core.test.mjs.
  Refs: archived point 568, scripts/render-verify-charges.mjs.
  Charged 31.10.2026 (findings carrier, polish-villagers --section=adult-errands, WebGPU, 5f6679479, 1 of 10 runs): the jar-mouth check rotates — 'the jar's mouth is tipped under the water surface — mouth at 0.097 m, surface at -0.25 m (hand 0.107, feet 0, ground -0.348)'; not in the classified baseline. It blocks the same three-green proof, so it is named and fixed or charged here.
  Criticality: medium — a standing red on every adult-errands run.
  Bundle: Dorfleben

- [ ] 1479. Villager far shoulder keeps a flat, corner-topped outline in walk rear-3/4 views
  Source: split from point 1478, owner picture check 02.11.2026 of feat/1478-shoulder-slab dd4538115 (garment-acceptance, cairo, 3 m, WebGPU and WebGL 2 identical): rows trousers-walk-man-rear34 and trousers-walk-child-rear34 show the far shoulder with a flat top edge and a near-right-angled outer corner. Frames: local/1478-after/1347-accept-trousers-walk-{man,child}-rear34-cairo-3m{,-webgl2}.png; before-frames local/1478-before/. The gait clips' shoulder turn is already 0 (VILLAGER_GLTF.clipShoulderKeep), so the clip swing is not the cause.
  FINAL STATE: the far shoulder of a walking man and child reads as a rounded shoulder at 3 m in rear-3/4 views on both backends; the cause (body mesh silhouette at the shoulder cap, skin weights, or shading) is named in the commit.
  Test: Vitest for the cause's layer; picture check of the two named garment-acceptance rows on both backends.
  Criticality: low - a corner on the far shoulder outline at close range from behind.
  Bundle: Dorfleben.

- [ ] 1483. Branch-hygiene guard tells us to delete a remote branch that still carries unmerged commits
  Source: Stop hook 03.11.2026 05:16 (owner session): branch-hygiene-guard listed origin/feat/1344-children-hand-contacts as "bereits in origin/main enthalten" with `git push origin --delete`, but `git cherry origin/main origin/feat/1344-children-hand-contacts` shows 2 unmerged commits (33671ebad, 43fd6e0d3) of open point 1344; only the stale local branch (c5dd0003a) was merged. Following the instruction deletes real work.
  FINAL STATE: the guard judges every remote branch by its own tip against origin/main and never lists a branch with unmerged commits for deletion.
  Test: Vitest for the guard core with a local branch merged and its remote ahead by one commit.
  Criticality: high - a deletion instruction that loses pushed work (data risk, CLAUDE.md §2 intake).
  Bundle: Session- & Repo-Hygiene.

- [ ] 1484. Agent liveness check permits replacing a live author on an unfetched remote ref
  Source: batch session 03.11.2026 13:53: `node scripts/batch-in-flight.mjs --agent-check --branch refs/remotes/origin/feat/1482-garment-driven-builder` printed "only a 27 min old commit ... A REPLACEMENT IS PERMITTED" from the stale local ref; origin held a 1 min old commit of the live cloud author session_019XD8QtXYcNHmCuQry2keV1. A duplicate author was started and stopped before its checkout.
  FINAL STATE: the agent check fetches a remote branch ref before judging it (or refuses replacement and says the ref is unfetched when the fetch fails).
  Test: Vitest for the check core with a remote ref whose fetched tip is newer than the local tracking ref.
  Criticality: high - a possible false approval to replace a working agent (CLAUDE.md §2 intake).
  Bundle: Session- & Repo-Hygiene.

- [ ] 1493. The tag catcher's hand misses the caught child in the full WebGPU polish-children run under load
  Final state: the full WebGPU polish-children run is free of the tag-catch red "at the catch frame the catcher's drawn hand is ON the caught child" (hand-right 9.0 cm off the trunk, hand radius 3.2 cm, catcher 1 -> caught 3) on a quiet machine, or it is traced to a named cause (fixture timing or product) and fixed. Its charge in scripts/render-verify-charges.mjs dies with this point. It also owns the tag-catch red "inside the prepare window one of the catcher's hands is held readied in front while the other keeps swinging" (WebGPU, a17e2f8e1, 09.11.2026 06:38; readied left sweep 0.074 / free right sweep 0.208, NOT HELD in a window from 2.30 m), charged there too.
  Observed problem: full WebGPU polish-children+report run on feat/680-place-life-dump a75df90ca, 09.11.2026 (log local/verify-logs/2026-11-09T12-08-14-648-polish-children-report.log), quiet-machine check "MACHINE NOT QUIET (busy)". The same head ran --section=tag-catch alone (log 2026-11-09T12-53-10-287), GREEN. Point 680 only adds a read-on-dump callback, so the red is owned by no point. The run's two bank-game reds belong to 1268 and 1470.
  Source: picture check of the 680 landing session, 09.11.2026.
  Bundle: Dorfleben.

- [ ] 1497. LOW geometry lever for the travel terrain (split from point 310, 10.11.2026)
  Source: point 310's cloud author (handover 799bbdd, 10.11.2026) named every travel system for F8
  and recomputed the constant unnamed 425,118-triangle group at LOW (docs/bench/310-projection.md):
  `travel-terrain` 352,832 tris (83 %), `travel-sea` 64,800 (15 %), the river ribbon at most 5,876
  (1.4 %). Point 310's lever (c) assumed the group was river water; a coarser ribbon would remove at
  most ~2,900 triangles, so (c) was not built there and is split off here with the corrected target.
  Final state:
  - A calibratable LOW geometry lever for the terrain chunks (e.g. fewer segments per ring at LOW,
    in `src/config/quality.ts` with entries in all three QUALITY_PRESETS levels, debug-tunable,
    read through the effective-selector pattern); the touch preset stays a subset of low.
  - Every §11.3 invariant keeps passing at LOW: rivers lie in their carved beds, never buried, one
    continuous ribbon (enrichments `rivers` and `water-stability` sections), no seam between chunks.
  - The removed triangles are computed against the 310 projection table, and a before/after F8 run
    of the three bench phases at LOW confirms the relative drop.
  Tests: a Vitest case per new preset key; the enrichments river sections and a LOW picture on both
  backends.
  Bundle: Steuerung & Performance.

- [ ] 1500. LOW detail: every collidable tree keeps its body under the density lever
  Finding 11.11.2026 (render-verify-guard): recorded enrichments runs before 11.11.2026 04:05 on both backends (webgpu and webgl) each carry the red 'LOW: collidable trees draw in full under the density lever' (scripts/verify/enrichments.mjs, LOW preset block); no open point owns it, the LOW preset point was settled in e16d89fe1. Player impact: under the LOW detail level a collidable plant (acacia, jungle, palm, baobab, kopje) of the full fill can be missing from the thinned fill, so the traveller collides with a tree that is not drawn.
  Final state: under LOW every collidable plant of the full fill is drawn in the thinned fill on the same ground (thinned count equals full count, none missing); only the small dressing (bush, rock, termite, deadtree, papyrus) is thinned.
  Test: Vitest on the density-lever fill (collidable species exempt from thinning); `npm test -- enrichments` LOW section green on both backends with the 310-low-savanna picture.
  Bundle: Steuerung & Performance.

- [ ] 1502. The Nile panorama water check sits on its own threshold
  Finding 11.11.2026 (render-verify-guard, covering polish-panorama run on main fe6570d, WebGPU): 'the Nile shows as a water signal in the band' failed with sectors 0.0010/0.0000/0.0002/0.0016 (total 0.0028 against the required > 0.003), while the `travel-panorama-capture` section alone passed it minutes later on the same tree. The capture's water fraction depends on the camera height over the bank dunes, so the check flips at its threshold; no open point owned it. Player impact: none measured, but the red blocks the covering run every render point owes.
  Final state: the check measures the Nile's presence with a margin the capture reliably clears (e.g. a capture aimed at the river or a threshold calibrated from recorded totals over repeated captures), and it still fails when the band shows no water at all (the 07.08.2026 all-zero signature).
  Test: `npm test -- polish-panorama --section=travel-panorama-capture` green on both backends across a throttle probe (`node scripts/throttle-probe.mjs polish-panorama --section=travel-panorama-capture --runs 8`).
  Bundle: Wetter & Wasser.

- [ ] 1503. The giraffe elder-versus-prime comparison frame misses both giraffes on WebGPU
  Finding 11.11.2026 (whole enrichments on main ed95b5bd2, WebGPU, 21:13): 'the comparison frame shows BOTH the old and the prime giraffe ... (point 1498)' failed with pre.ok false and the prime giraffe not found. Point 1498 is closed, so no open point owned the red. Player impact: none measured; the red blocks a green whole enrichments run.
  Final state: the giraffe comparison staging finds and frames both the elder and the prime giraffe on both backends, and the check still fails when either is absent from the frame.
  Test: `npm test -- enrichments` (the 1498 elder-versus-prime section) green on WebGPU and WebGL 2, with verification/1498-elder-vs-prime-giraffe.png picture-checked.
  Bundle: Tierverhalten.

- [ ] 1515. The bird flight escape section fails: the peregrine never stoops and the flushed flamingos leave the frame
  Measured 13.11.2026 (covering enrichments run for point 1508 on main 8d18bc787, WebGPU, log local/verify-logs/2026-11-13T12-10-39-535-enrichments.log): the whole pass failed 'a forced peregrine enters high, stoops on a flying bird, strikes, and the hunt resolves (design.md §19.19)' with outcome lost, preyDead false, strikeAirborne null. `--section=bird-flight-escape` alone on a quiet machine (log local/verify-logs/2026-11-13T12-39-04-346-enrichments.log) failed all three checks of the section: the flamingos took off 6/6 but escaped to a spread of 56.4 with airborne 0 and onScreen 0 in the take-off frame, and the forced peregrine never started its stoop. No open point owns design.md §19.19.
  Player impact: the staged flush scatters the flock out of the frame instead of a flying flock, and a forced peregrine hunt never resolves; the covering run of point 1508 is held red by it.
  Final state: the cause is measured in game and fixed; `npm test -- enrichments --section=bird-flight-escape` is green on WebGPU and WebGL 2 on a quiet machine, and the take-off frame and the stoop frame (verification/269-raptor-stoop.png) are picture-checked on both backends.
  Test: the section on both backends, plus a Vitest case if the cause lies in the pure bird-flight helpers; the 'check' charge of scripts/render-verify-charges.mjs for the three check titles dies with this point.
  Source: finding of the 1508 session, 13.11.2026 13:15.
  Measured again 13.11.2026: the whole enrichments pass on feat/1508-covering-enrichments 18d2abc41 ran all three checks green on WebGPU (log 2026-11-13T14-07-33-209) and WebGL 2 (log 2026-11-13T14-34-07-098); their charge was struck. The section run above stays the open evidence.
  Bundle: Tierverhalten.

- [ ] 1517. The fleeing adult at the reported Niger bank sometimes flips its heading once
  Measured 13.11.2026 (covering enrichments run for point 328 on main 2876db78a, WebGPU, log local/verify-logs/2026-11-13T19-18-53-221-enrichments.log): 'at the reported bank the fleeing adult enters the water once, flees once, never as a fall-in, and never flips or zigzags its heading' failed with flips 1, restarts 1, entries 1, the flip at d 1.84 around t 5.3 s with the lion idle. The section alone on the same sha passed 5/5 directly after — intermittent.
  Player impact: a fleeing animal at a river bank visibly turns back once mid-flight.
  Final state: the cause is measured (`node scripts/throttle-probe.mjs enrichments --section=water-edge-flee --runs 8` first, to separate load from logic) and fixed in game; the check stays as strict.
  Test: `npm test -- enrichments --section=water-edge-flee` green on WebGPU and WebGL 2 across a throttle probe, plus a Vitest case if the cause lies in the pure flee helpers; the charge in scripts/render-verify-charges.mjs dies with this point.
  Source: finding of the 343 session, 13.11.2026 20:47.
  Bundle: Tierverhalten.

- [ ] 1519. The board's slot line names why independently ready points are not started
  User message on the board chat, 14.11.2026 07:32 UTC: "1518 ist erledigt und trotzdem steht auf dem Dashboard \"2/3 Slots frei: Grund nicht messbar (unabhängig bereit: 348, 353, 354, 356, 357)\"."
  Measured 14.11.2026 08:33: after 1518 landed the board still says "2/3 Slots frei: Grund nicht messbar (unabhängig bereit: 348, 353, 354, 356, 357)". freeSlotReason in scripts/board-slots-core.mjs (~line 115) returns unmeasurable whenever free slots meet independent candidates, so 1518 never covered the most common state: room and ready points, but nothing started.
  Player impact: none in game; the board gives a non-answer to the main throughput question.
  Final state: in that state the line names the measured cause the batch is not filling the slot (e.g. batch lock held by a message responder/chat claim, no live batch session, context fence armed, serving-model or lane pause, CI wait, verify run holding the quiet machine, launcher not due), each read from its existing record (no new ledger fields, infrastructure freeze); only when none is measurable does "Grund nicht messbar" remain, and the finding then names the sources read.
  Test: Vitest cases in scripts/board-slots-core.test.mjs for each cause plus the residual case; a board-publish dry run on main shows a named reason for the current state.
  Source: user request f7555192, 14.11.2026.
  Bundle: unbundled.

- [ ] 1522. Settings suite: animal proximity call stays silent and ?quality=HIGH never builds the scene
  Measured 15.11.2026 on a quiet machine, WebGPU, identically on main dcf4949c7 and feat/357 6a1071735: `npm test -- settings --section=animal-calls` fails "a nearby animal raises its proximity call" with every level 0 ({"started":true,"baseline":0,"near":0,"prox":0,...}); `--section=quality-url` fails "?quality=HIGH opens at high on the first frame" because the scene reports triangles 0 / built false after 120 s, although level and shadows read high.
  Player impact: a nearby animal may make no sound; a session opened with ?quality=HIGH may never show its world.
  Final state: both sections pass on WebGPU on main; if either is a test-harness fault rather than a product defect, the check is repaired and the cause recorded.
  Test: the two named settings sections green on WebGPU, plus a Vitest case for the cause if it lies in browserless code.
  Source: classification of the settings reds of the 357 session, 15.11.2026.
  Bundle: unbundled.

- [ ] 1525. The full polish-settlement suite hangs on WebGPU
  Measured 15.11.2026: `VERIFY_GL=webgpu node scripts/verify/run-all.mjs polish-settlement` on main 7e60e49 (21:31-22:16) was killed by the 45-min wall timeout; it was started bare, so the hanging section is unknown. The preceding WebGL 2 run on feat/358 da7219770 lost its device (0 draw calls in 8 frames). Points 358 and 359 therefore landed on section runs only (359: `--section=kraal-cattle` green on both backends at fecd77446); the render-verify guard has no covering full run since.
  Player impact: none directly; it blocks the covering settlement check for every village render change.
  Final state: the hanging section is named from a logged run (`npm test -- polish-settlement`, with progress) and fixed or charged; a full polish-settlement run completes on WebGPU and on WebGL 2.
  Test: one full polish-settlement run per backend, completed within the suite timeout, with its frames inspected.
  Source: finding of the 358 session, 15.11.2026 21:16; restated at the 359 landing.
  Measured 16.11.2026 on feat/384 9e30eb37d (WebGPU, logged): one run KILLED at 45m07s with 35 frames while still writing (kraal-cattle: 359-zulu-kraal-1890 at 21:06, -1893 at 21:16); the re-run with VERIFY_SUITE_TIMEOUT_MS=7200000 wrote its last frame 356-inhabitant-glance at 21:43 and then nothing for 35 min with a 4 GB Chrome renderer — the hang sits at the start of `fire-smoke` (after `inhabitants-glance`); killed by hand. Logs local/verify-logs/2026-11-16T19-31-52-913- and 2026-11-16T20-18-07-151-polish-settlement.log.
  Bundle: Testinfrastruktur.

- [ ] 1528. WebGL 2: a driven-off crossing pair is not on a bank at the crossing deadline
  Measured 16.11.2026: `VERIFY_GL=webgl npm test -- wildlife` on main 36e83d5: 5 pass, 2 fail — "every ending resolves on a bank within the crossing deadline" and "the forced drive-off leaves parent and calf alive, both on a bank" fail with survivorsOnBank=false, survivors=2, parentAlive=true; WebGPU at the same HEAD 7/7 green. Likely a frame-rate dependent return or landing in point 362's channel return.
  Player impact: a parent and its calf can be left swimming past the crossing deadline.
  Final state: the driven-off pair reaches a bank within the crossing deadline at WebGL 2 frame rates; the cause is named (frame-rate dependence in the return step or the check's budget).
  Test: a Vitest case stepping the channel return at a low frame rate, plus the two wildlife sections green on WebGL 2 and WebGPU.
  Source: finding of the 362 session, 16.11.2026 04:00.
  Bundle: Tierverhalten.

- [ ] 1533. The full polish-settlement pass hangs on WebGPU after its inhabitants section
  Measured 17.11.2026 on main 579e7c4e6, WebGPU, no other local job: `VERIFY_GL=webgpu node scripts/verify/run-all.mjs polish-settlement` wrote its frames up to 356-inhabitant-glance (00:25), then wrote nothing for 20 min and was KILLED at the 45 min wall timeout. The three sections after it pass alone on the same SHA and backend: fire-smoke 1m 28s, walker-dust 2m 19s, kraal-cattle 3m 05s (local/verify-logs/2026-11-16T23-45-35-035-polish-settlement.log and its two successors).
  Player impact: none directly; the settlement render changes of 384 (and every later settlement point) cannot get a covering both-backend run, so the render-verify guard stays red.
  Final state: the cause of the stall inside the long pass is named (state carried from an earlier section, a wait that never resolves, GPU resource exhaustion, ...) and fixed, or the suite is split so each part finishes inside its timeout; a full polish-settlement pass completes on WebGPU and WebGL 2.
  Test: the full polish-settlement pass green on both backends; if a wait is the cause, a bounded wait that fails loud instead of hanging.
  Source: finding of the 1529 session, 17.11.2026 00:53.
  Bundle: Testinfrastruktur.

- [ ] 1534. Smooth the stair-stepped yellow sand band in the Giza backdrop foreland
  Split from point 1532 on 17.11.2026. In the user's backlit Giza report picture (seed 2226741265, giza, 15.01.1890 14:00, high, WebGPU) a bright yellow sand band at left and the foreland just above the ground disc carry dark/light horizontal streaks with stair-stepped edges (crop: local/1532-band.png, frame verification/1532-backdrop-backlit.png on feat/1532). Not yet measured which input carries it: the backdrop heightfield's per-vertex biome colour (48x320 polar grid, so a biome edge steps along the segments), ring-to-ring height alternation lit by the backlight, or the steepness mix on near-flat facets.
  Player impact: a hard-edged striped band sits between the walkable ground and the panorama hills.
  Final state: the band's cause is named by measurement (switching colour, steepness and normal terms off at the report spot) and fixed; the band's edges read smooth at the report spot.
  Test: Vitest for any changed colour or height blending; a Playwright frame at the report's spot on both backends, picture-checked.
  Also: where the near backdrop hill crosses the far hill, the overlap edge reads as a stair-stepped dark silhouette line (verification/1532-backdrop-backlit.png, x~720-850 y~400-465, both backends); geometry/silhouette aliasing, not rock noise. Measure and fix it in the same pass.
  Source: point 1532 side finding, user report 16.11.2026.
  Bundle: Siedlungsgeometrie.

- [ ] 1537. Frame 130-crocodile-lunge shows no crocodile on either backend
  Defect: after the crocodile staging rebuild (point 336) the enrichments frame `130-crocodile-lunge`
  aims at calfAt, but at the shutter no crocodile is visible: canoe and two giraffes on the bank, no
  lunge (verification/130-crocodile-lunge.png, WebGPU and WebGL 2, main 02e419de0, full enrichments
  runs 18.11.2026). The frame passes while missing its declared subject (CLAUDE.md §7.2), so it
  can back a false approval of the lunge staging.
  Done when: the frame holds the lunging crocodile wholly on screen at the shutter on both backends
  (closer camera or a shutter tied to the lunge pose), and a check asserts its projected presence.
  Test: Playwright enrichments section crocodile-ambush on both backends, picture-checked.
  Source: boundary picture check of point 336, 18.11.2026.
  Bundle: Tierverhalten.

- [ ] 1538. The limping straggler's heal check goes red on a full WebGPU wildlife run
  Measured 18.11.2026 08:59 on main after the 364 landing, full wildlife on WebGPU: 25 pass, 1 fail —
  'the limp heals on its window and the pair is back with its herd (point 363)' with healed/back true,
  gap 8.1 (gap0 14), parentBeside 1.52. The WebGL 2 full run was then refused by the ladder until
  --section=straggler goes green, so 364's covering wildlife run on both backends is still owed.
  Player impact: none directly; an unowned red keeps every full wildlife run from counting as coverage.
  Final state: the cause is named by measurement (a reunion distance the check reads too strictly, or a
  pair that really stays apart), the fix is made on that side, and --section=straggler passes on a
  quiet host over at least six runs on both backends.
  Test: Playwright wildlife --section=straggler on both backends, then the full wildlife run.
  Source: finding of the 364 session, 18.11.2026 08:01.
  Bundle: Tierverhalten.

- [ ] 1539. The calf-shield-river staging flakes on main and on branches alike
  Measured 18.11.2026 on a quiet WebGPU host, `--section=calf-shield-river` alternated between main
  d0a27cfc3 and feat/1063 93502b805: 5 of 7 green on each. Reds on main: calf-in-water ('a calf that swims
  the river ahead of its shield reaches the far bank and the hunt gives up') and calf-at-far-bank ('the
  lion reaches the shielding parent first …', 'the feeding lion is drawn at the body it reached …');
  logs local/verify-logs/2026-11-18T09-41-59-263 and 09-44-31-961. The same calf-in-water red stood in the
  full enrichments run 2026-11-18T09-00-34-933.
  Player impact: none directly; the section turns roughly every third enrichments run red without an owner.
  Final state: the cause is named by measurement (an unseeded random draw in the staging, or a chase whose
  timing depends on frame pacing), the staging is made deterministic or the check reads the outcome it
  means, and the section passes over at least six quiet runs on both backends. The charges in
  scripts/render-verify-charges.mjs die with this point.
  Test: Playwright enrichments --section=calf-shield-river on both backends, six runs each.
  Source: finding of the 1063 session, 18.11.2026 10:51.
  Bundle: Tierverhalten.

- [ ] 1540. The painted hut band sits buried inside the mud wall
  Found 18.11.2026 by the cross-vendor review of 1167 (receipt f52ee17aa9a0db80): VillageHut's painted
  band is a cylinder at 1.005·r, but the tapered wall's radius across the band's height is
  1.0093–1.0147·r, so the band (style.bandColor; red on the chief hut) lies inside the wall and does not
  show. Predates 1167.
  Player impact: every village hut lacks its regional painted band, the chief hut its red marking.
  Final state: the band's radii follow the wall taper at its upper and lower edge plus a small outward
  offset, in the hut's one builder (src/scenes/place/hutDoor.ts / VillageHut), so every hut kind follows.
  Test: Vitest — the band's radius exceeds the wall radius at both of its edges, at several hut radii,
  mutation-checked.
  Picture check: polish-villagers --section=hut-doorway on BOTH backends, the band visible on the wall.
  Source: finding of the 1167 session, 18.11.2026 15:29.
  Bundle: Siedlungsgeometrie.

- [ ] 1553. A bank-game catcher is not back in line when the charge starts
  Measured 19.11.2026: WebGPU `polish-children --section=children-bank-game` on feat/1164 7ba7344cc
  (only change a scatter-rock material; log local/verify-logs/2026-11-19T15-11-36-540-polish-children.log)
  red "the charge starts with every catcher back in one line before its rock": child 4 at -45.65/-7.19
  against its station -50.07/-1.24 (about 7.5 m off). The same section on main bb81bc0a9 ran green
  (log 2026-11-19T15-47-17-013), so the red is intermittent and owned by no point.
  Player impact: a child can still be running back across the bank while the others already charge
  the rock, which breaks the line the game is about.
  Final state: the charge waits until every catcher stands within its station tolerance (or the
  intermittent cause — fixture timing or product — is named and fixed); its charge in
  scripts/render-verify-charges.mjs dies with this point.
  Test: Vitest for the charge-start condition (no charge while a catcher is outside its station
  tolerance), mutation-checked.
  Picture check: polish-children --section=children-bank-game on WebGPU, green, the line frame showing
  every catcher in line.
  Source: finding of the 1164 session, 19.11.2026 16:30.
  Bundle: Dorfleben.
