# TASKS — sequential feature batch

The OPEN work order. A ticked point moves, verbatim and with its number, into
`docs/tasks-archive.md`; `tasks-archive-guard` blocks a tick left behind here.
States are `[ ]` open and `[x]` done — nothing in between.

**Where the rules live.** The build, the test tiers, the branch/merge workflow
and the closing cycle are in CLAUDE.md (§5, §6, §7.2, §9) and are NOT repeated
here. The WORKING ORDER lives in the dashboard's Warteschlange — one place, and
`queue-order-guard` holds it. Do not write ordering prose into this file: the
overrides that used to stand here described points long since finished, and a
second place for the same fact is the drift this project keeps paying for.

This file and every entry in it are written in English. Commit messages never
reference the point number.

## Regression command

```sh
npm run test:unit   # fast layer (jsdom) — always
npm run test:small  # + the everyday browser gate
npm test            # LARGE: build → lint → vitest → every suite → preview
```

Per point: build + lint + audit + the whole Vitest layer, plus the browser
suites the diff touches. The LARGE run is mandatory when a point touches a scene
core (TravelScene/Wildlife/PlaceScene, the renderer/post pipeline, store.ts), at
every ~4th point as a collective gate, before every closing, and whenever a
flake retry failed twice.

Diff → browser-suite mapping: `src/i18n/` → i18n · store/systems logic → Vitest
only (flow if the core loop is touched) · `src/scenes/place/` → collision,
polish, settings · `src/scenes/travel/` → enrichments, events, health ·
`src/render/` → settings, enrichments, polish · `src/ui/` → i18n, enrichments,
settings, flow · journal/TTS → voice, handwriting · `src/world/` → world,
enrichments · `scripts/verify/X.mjs` → X itself · `*.md` → docs. When unsure,
include the suite.

Flake policy: if exactly ONE suite fails on a check from the flake list below,
rerun that suite standalone once — green counts as green and is noted in the
tick; red twice is a real investigation. The list (this is its only home): the
movement 0.00 m read, the bathe probability, TTS timing, the calf-sacrifice
behaviour window, frame-starved screenshot probes, and the spawn body-spacing
settle window. WATCHDOG: if this scoping ever lets a bug through that a full run
would have caught, report it to the user at once and the policy is reconsidered.

**Every point adds a test on the appropriate layer** — Vitest for anything
assertable without a browser, a browser suite only for the
scene/RAF/geometry/CSS/audio/screenshot cases (`scripts/verify/README.md`).

On failure after correction attempts: STOP, report, and do not build further on
a broken base. Tests are never weakened; a red run is fixed in the production
code.

**Where doc updates go (user 26.07.2026):** a criterion in CLAUDE.md §7.1 states
WHAT must hold; its chain of proof lives in `docs/acceptance-evidence.md` under the
same number. A point that adds or changes a verifiable behaviour updates the criterion
AND its evidence section in the same commit; a point that only adds a test touches the
evidence section alone. Older specs below still say "CLAUDE.md §7.1" for both halves —
read that as "the criterion and its evidence section".

## Checklist

- [ ] 174. Tag the demo build `v0.3` and publish it at
  https://patrickvonmassow.github.io/Heart-of-Africa-Remake/v0.3/.
  GATE (user, 19.07.2026): tag v0.3 only after ALL of these are green — 175 (the
  jumping trees, user-confirmed on WebGPU), 177 (deterministic suite), 176 (drought
  drink-reach cap), the play-test bugs 178/179/180/181/183, 184 (the pre-tag
  hardening pass), AND a final closing run (Vitest + LARGE regression, dead-code/.md
  audit, lint/CVE clean) at that verified HEAD. v0.3 must ship none of those bugs
  nor any regression the closing catches.
  FINAL TAG HELD FOR THE USER (default, user away 19.07.2026): the tag + /v0.3/
  publish is the one irreversible, outward-facing step — do ALL the work up to it,
  then report "ready to tag" and WAIT for the user's go, unless the user has
  explicitly authorized auto-tagging. When authorized: tag `v0.3` at that HEAD and
  serve it at /v0.3/ — mirror how the other tags are wired (the `.github/workflows`
  Pages build + its tag loop `for tag in v0.1 v0.2 v0.3 poc`; a tag push may not
  trigger the deploy, so use the same mechanism v0.1 used). Then FREEZE it: never
  re-point or change v0.3 unless the user elaborately asks (tags-only-on-request
  memory). The v0.3 content is the 175/177/176/178-183/184-closed, closing-verified
  HEAD; 182 and 163/166/170 come AFTER the tag.

- [ ] 184. PRE-TAG HARDENING — a MUCH stronger, systematic quality pass to reach a
  high-confidence bug-free state before the final closing run and the v0.2 tag.
  User decision 19.07.2026, after a cluster of elementary-functionality bugs kept
  surfacing in play (178 vultures pop in; 179 a lion tunnels through parent + calf;
  180 elephants wedge at a shore; 181 skyline fauna float; 183 animals pop into the
  frame while driving) DESPITE point 173's quality push. Runs AFTER the individual
  fixes 178-183 and hunts what remains.
  EXECUTION (user-approved 19.07.2026): run 184 with ULTRACODE (multi-agent
  Workflow orchestration) on OPUS 4.8, effort HIGH — xhigh for the design/audit
  phase (the invariant-harness architecture and the five-class sweeps), high for
  implementation; trivial mechanical sub-stages (the WebGL2 smoke scaffold, blunt
  test skeletons) may drop to a cheaper model / low effort via per-agent override.
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
  MODEL MIX (user decision, 20.07.2026): run the audit sweeps with a MIX of Opus 4.8
  AND Fable 5 agents (Workflow `opts.model: 'opus'` / `'fable'`) — NOT for a proven
  Fable capability edge (unverified, its name hints at a different specialisation) but
  for MODEL DIVERSITY: the code was written mostly by Opus, so a different-model auditor
  carries different blind spots and catches what the author-model is systematically
  blind to. Distribute the five sweeps (A-E) across both models; where budget allows,
  double-cover a sweep with one agent of each so the two lenses overlap on the same area.
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
  audited, found, fixed and the residual risk. Only THEN the final closing run,
  then the v0.2 tag (174). Docs: quality/process point; adds a CLAUDE 7.1 verifiable
  line for the new invariant suite and updates the CLAUDE 5/7.2 test architecture;
  the 172/177 disciplines. (Requested 19.07.2026 — "be significantly more
  thorough"; gates v0.2 together with 178-183.)
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

- [ ] 200. VERIFY-SCRIPT ROBUSTNESS pass — fix the 26 wall-clock/radius
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
  PROGRESS 21.07.2026: converted the six named non-enrichments waits (commit
  7ed3c56) + six enrichments family/predator/scavenge/rescue STAGING settles to
  __sleepSim (5127afa, af4533f) — all touched suites green.
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

- [ ] 203. EXTEND 184 — a SYSTEMATIC visual + liveness bug-finder (user request
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

- [ ] 205. A WORLD & FUNCTIONALITY PLAUSIBILITY AUDIT — a THIRD audit kind beyond
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

- [ ] 207. ADDITIONAL FINDING METHODS that complement the existing audits (Pillar
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

- [ ] 224. DEMO CHECKPOINT — full closing run → publish the checkpoint as `v0.2` at
  /v0.2/ and re-point the `poc` tag, both playable (user request 22.07.2026).
  GATE/POSITION: the NEXT milestone right AFTER the terrain task (215) once
  everything is stable and 215 is done — a visible demo update for the terrain
  smoothing, NOT waiting for every open bug. Run it when 215 is finished + the tree
  is stable (build/lint/CVE clean, full Vitest + the LARGE browser regression on
  BOTH backends green — the §7.2 closing cycle per docs/maximum-qa.md's closing
  steps). STEPS: (1) full closing cycle (Vitest + LARGE regression both backends,
  dead-code/stale-doc pass, lint/audit clean) — only proceed if GREEN; (2) at that
  verified GREEN main HEAD, create the `v0.2` release tag and re-point the `poc` tag
  to it, and push both tags (these are the explicit, authorized tag ops per the user
  — the standing exception to [[tags-only-on-request]] for THIS request; do NOT touch
  v0.1); (3) the GH-Pages deploy builds each tag into its path (deploy-pages.yml,
  guarded, worktree --base=/…/<tag>/) — the workflow's tag loop is
  `for tag in v0.1 v0.2 poc` (v0.3 joins it when 174 ships) so the same Pages
  artifact serves them — verify the deploy is green and ALL URLs resolve 200: root =
  main, /poc/ = the poc tag, and /v0.2/ =
  https://patrickvonmassow.github.io/Heart-of-Africa-Remake/v0.2/, all with correctly
  based asset URLs (the MSYS-mangling Git-Bash trap is documented). This is
  outward-facing: run only after the closing is GREEN; report the result. Then FREEZE
  v0.2 (never re-point unless the user elaborately asks). DOCS: README version
  section. Do NOT touch the v0.1 tag; 174 (v0.3, at /v0.3/) is a separate later
  release.

- [ ] 264. INTRASPECIES COMBAT — TERRITORIAL/DOMINANCE FIGHTS WITHIN A SPECIES (user
  23.07.2026; queue position: directly AFTER point 224). Animals of the SAME species
  fight each other. RESEARCH FIRST (Fable-5 pass, recorded in a new
  `docs/intraspecies-combat-1890.md`, cited): which of the game's ~1890 African
  species realistically engage in intraspecific fighting (territorial disputes,
  dominance/rut, resource/mate competition) and how — e.g. male antelope/wildebeest
  horn-clashes in the rut, hippo territorial battles (often lethal), male lion
  dominance fights, crocodile territorial combat, elephant musth clashes — so the
  mechanic applies to the species it truly fits and not to those that do not (map
  each of the game's species to fights / does-not-fight, with the driver and lethality
  from the research). BUILD the mechanic on the researched species: some individuals
  carry a "wants to fight" disposition. Two interaction paths — (a) BOTH want to
  fight: they RUN TOWARD each other (converge to contact); (b) ONE wants to fight and
  targets another: it HUNTS/chases the other — the chase resolves either as a DRIVE-OFF
  (the aggressor is satisfied once the other flees far enough, breaks off, no kill) or
  a CATCH (it runs the other down). When two same-species animals COLLIDE and at least
  one wants to fight, a FIGHT happens: it lasts a few (calibratable) seconds — a visible
  clash — and ENDS with ONE of the two DYING (the loser dies; its body enters the
  ordinary carcass system so scavengers/vultures work it like any death). The
  loser/winner outcome is a calibratable roll (may weight by species/size). All timings
  and chances (fight duration, drive-off distance/chance, per-species fight
  disposition rate, catch vs drive-off) are balance values, debug-editable (§21.2).
  Reuse the existing chase/flee + collision + carcass machinery (the §19 hunt/flee
  steps, `deflectAroundCircle`/collision, the caught/stain/carcass system) — do NOT
  build a parallel path; the intraspecies fight is a new state layered on the shared
  drama/hunt core (like the §19.8 dramas resolving through one core). Every started
  fight/chase RESOLVES (a hard deadline backstop, like the other dramas — invariant
  I4). Anchors: `src/scenes/travel/wildlifeBehavior.ts` (the fight/chase state, a pure
  outcome/drive-off resolver + the per-species fight table), `src/scenes/travel/
  Wildlife.tsx` (the converge/chase/fight drives + the clash pose + the loser death →
  carcass), `src/render/fauna.ts` (a fight/clash pose if needed), `src/config/
  balance.ts` + `src/ui/DebugMenu.tsx` (the calibratable values), `docs/intraspecies-
  combat-1890.md` (the research). VERIFIABLE: pure tests — the per-species fight table
  (a fighting species fights, a non-fighting one never does), the converge-vs-hunt
  decision, the drive-off-vs-catch resolver (bounded, deterministic per roll), the
  fight outcome (exactly one of two dies, loser → carcass), and every fight resolves by
  the deadline; a live check in `scripts/verify/enrichments.mjs` that a staged pair of
  a fighting species clashes and one dies (body scavenged). DOCS: `docs/intraspecies-
  combat-1890.md` (research, same branch as the build or a preceding research commit),
  design.md §19 (the intraspecies-combat behaviour), §21.2 (the new balance values).
  No player-visible text unless a journal/debug label is added (then both languages).
  NOTE: `wildlifeBehavior.ts`/`Wildlife.tsx`/`fauna`/`balance` — the wildlife-behaviour
  cluster; do NOT delegate the BUILD concurrently with another Wildlife.tsx point. The
  RESEARCH half (the docs file + the species table) is a standalone Fable pass with no
  code, safe to run in parallel; the build follows on the researched species.

- [ ] 265. ELDERLY (GERIATRIC) ANIMAL VARIANTS — an OLD version of each suitable
  species, visibly aged AND behaviourally distinct, plus natural death of old age
  (user 23.07.2026). PRIORITY/POSITION: queued BEFORE point 203 (do this content
  feature before the 203 visual bug-finder). RESEARCH FIRST (a standalone Fable pass,
  no code, safe to run in parallel): realistic geriatric APPEARANCE and BEHAVIOUR for
  the game's fauna (the savanna grazers, elephants, the predators) and a realistic
  natural-DEATH process — recorded, cited, in a new `docs/fauna-behaviour-1890.md`
  (matching the citation/marker discipline of `docs/peoples-1890.md`; if a fauna doc
  already exists, extend it). What to establish: the visible senescence cues (thinner/
  sway-backed body, duller/greyer or worn coat, prominent shoulder/hip bones, worn or
  broken tusks and sunken temples on old elephants, a stiffer/limping gait); the
  behavioural shifts (moves slower; old males ousted from the herd and turning
  SOLITARY — the classic old buffalo/elephant bull; withdrawal from intraspecies
  contests: an elder no longer INITIATES a §264 fight and always LOSES to a younger
  adult, fleeing an impending conspecific conflict); and the real basis for a
  "dying" pattern (an old elephant's last molars wear out, so it seeks soft forage
  near water/marsh and dies there — the grounded kernel the §4.4 "elephant graveyard"
  folklore romanticizes; vultures do gather around a visibly dying/weak animal). Add
  any further fitting, game-appropriate geriatric traits the research turns up. BUILD
  (per the research): (a) APPEARANCE — an elderly-adult build schema analogous to the
  point-169 baby schema (`buildLionCub`/the grazer calves) in `src/render/fauna.ts`
  (`buildElderly*`/an age flag on the adult build): clearly-old cues per the research,
  pure-tested for its proportions/part markers like the calf schema. (b) BEHAVIOUR —
  pure helpers in `src/scenes/travel/wildlifeBehavior.ts`: an elderly adult moves at a
  calibratable reduced speed factor, never initiates §264 intraspecies combat and
  ALWAYS loses to a younger adult (the §264/§125 outcome matrix returns the elder as
  loser; the elder flees an impending conspecific conflict), and — for GRAZERS and
  the big cats (NOT elephants) — an ousted old male withdraws from the herd/pride and
  turns solitary (per `docs/fauna-behaviour-1890.md`: old elephant BULLS keep high
  status, so no ostracism for them; the crocodile gets NO elderly variant — no legible
  aged cues). (c) NATURAL DEATH — an elderly animal occasionally dies with NO external
  cause, at a calibratable low rate; the DYING PROCESS is depicted (`Wildlife.tsx` + a
  pure state helper): the animal slows progressively, the §19.6/§22 poor-condition
  vultures GATHER over it and descend as it collapses (the ground-truth reuse of the
  pt-22 omen — the "patient circling of a doomed animal" is embellished, so key the
  flock on the distressed/downed animal, not a long pre-death circle), it falls dead,
  and the vultures consume it through the existing carcass system. An ELEPHANT that
  begins dying instead drifts toward WATER (its worn last molars can no longer grind
  coarse forage, so it seeks soft riverside/aquatic vegetation) and dies THERE — the
  REAL mechanic per the research; the §4.4 elephant graveyard is framed as WHERE these
  water-side deaths accumulate (folklore landmark + accurate mechanic coexisting), and
  the mass death-pilgrimage is MYTH and is NOT built. (d) CALIBRATION — the elderly fraction of adults, the elderly speed
  factor, the natural-death rate, and the dying-slowdown duration are `balance.ts`
  values, debug-editable (§21). Ties to point 264 (the elder always loses a fight),
  point 169 (the analogous age schema), §4.4 (the graveyard death) and §19.6 (the
  vultures). VERIFIABLE: pure tests (`src/render/fauna.test.ts` — the elderly schema's
  aged proportions/markers, built alongside the calves; `src/scenes/travel/
  wildlifeBehavior.test.ts` — elderly speed factor strictly below the adult, elder
  never initiates and always loses §264 combat, the natural-death roll boundaries, the
  dying-slowdown curve, and the elephant-dying-target picking the graveyard); a live
  check in `scripts/verify/enrichments.mjs` (a forced elderly natural death: slows →
  vultures circle → falls → consumed; a dying elephant heads to the graveyard) with a
  screenshot, picture-verified on BOTH backends. DOCS: `docs/fauna-behaviour-1890.md`
  (research, in the SAME branch/commit as the build it informs), design.md §19 (a new
  subsection: elderly variants, their behaviour, natural death and the elephant
  graveyard death), the balance values. Any new sighting/death journal text in BOTH
  languages with voice markup. NOTE: heavy `wildlifeBehavior.ts`/`Wildlife.tsx`/
  `fauna.ts`/`balance` overlap — do NOT delegate the BUILD concurrently with another
  wildlife point; the RESEARCH half and the pure schema/behaviour helpers (in new
  files) can start in parallel, the scene wiring waits for the wildlife cluster to be
  free. Implementation-ready.

- [ ] 269. BIRDS FLEE BY FLYING + REGION-APPROPRIATE AERIAL PREDATORS (research-gated)
  (user 23.07.2026). Two linked additions, BOTH gated on a Fable research pass first.
  (A) FLIGHT-CAPABLE BIRDS ESCAPE BY FLYING: every bird species that can fly gets a
  GROUND (perched/sitting/feeding) state and an IN-AIR (flying) state; when it flees a
  ground predator (or an approaching elephant) it TAKES OFF and flies, which puts it
  OUT OF REACH of ground predators and elephants (they can no longer catch it in the
  air). A ground predator can catch a bird ONLY if it SURPRISES it while the bird is
  still ON THE GROUND (took off too late) — an airborne bird is safe from ground
  hunters. So the existing bird fauna (the shore/scavenger birds, the plover, vultures,
  etc.) needs the ground↔air state and a takeoff-on-flee transition.
  (B) AERIAL PREDATORS (research settled — docs/fauna-behaviour-1890.md §B): add
  region-appropriate FLYING predators (raptors) that hunt prey birds and catch them IN
  THE AIR, per the researched per-region table (§B2.1): falcons (peregrine/lanner/
  barbary) and the two hawk-eagles (African, Ayres's) attack by a STOOP/DESCEND, while
  the accipiter/harrier/fish-eagle majority use an air-catch tail-chase or an ambush
  from cover (no height). The stoop is BUILT — but as a SCRIPTED "descend-and-strike"
  EVENT (the raptor enters high, plunges onto a flying bird, strikes, resolves), NOT a
  persistent 3D flight-height simulation (the research explicitly warns against a full
  altitude-band layer, since most raptors don't use height). So there is at most a
  simple two-state high/low for the stoop event itself, not a per-bird altitude field.
  RESEARCH FIRST (Fable pass, docs-only, extend `docs/fauna-behaviour-1890.md`): which
  African raptors/aerial hunters (~1890, by region) take BIRDS as prey; their hunting
  mode (stoop/dive vs. tail-chase), typical prey birds, whether flight-height layering
  and a surprise-from-above are realistic, and whether "a ground predator only gets a
  bird caught on the ground" matches real behaviour. Produce a cited per-region aerial-
  predator + prey-bird table with the same PERIOD/INFERRED/MYTH markers, and a short
  "Implementation brief" (§B4 — already delivered; the research half is DONE). BUILD
  (after the wildlife cluster is free): the bird ground/air state machine +
  takeoff-on-flee (pure flee helpers in `src/scenes/travel/wildlifeBehavior.ts`, wired
  in `src/scenes/travel/Wildlife.tsx`) — with the researched fly/no-fly split (small
  birds and flamingos fly to escape, the flamingo with a laborious running take-off as
  a vulnerable window; plover CHICKS crouch/freeze and can be caught, the adult flies
  and does the broken-wing distraction); the aerial-predator species (build in
  `src/render/fauna.ts`, seeded from a new region-keyed aerial-predator pool per §B2.1)
  with an air-catch tail-chase for the ambush guild and the SCRIPTED descend-and-strike
  for the falcon/hawk-eagle guild; ground predators lose the airborne target. Reuse the
  existing hunt/flee/carcass machinery; every started drama resolves (I4). All
  calibratable (takeoff trigger distance, the stoop's high/low band, dive chance/speed,
  aerial-hunt rate) and debug-editable. VERIFIABLE: pure tests — a fleeing bird
  transitions to air and a ground predator's reach excludes an airborne bird while a
  still-grounded (surprised) one is catchable; the aerial predator's air-catch and (if
  built) the height-gated dive; region pools sane. Live check / screenshot: a forced
  ground-predator approach makes birds take off and escape, and (if built) an aerial
  predator stoops on a flying bird — on BOTH backends. DOCS: `docs/fauna-behaviour-1890.md`
  (research); design.md §19 (bird flight escape + aerial predators). Any new
  sighting/journal text both languages with voice markup. NOTE: wildlife-render/behaviour
  cluster (Wildlife.tsx/wildlifeBehavior.ts/fauna.ts) — the RESEARCH runs in parallel
  now; the BUILD waits for the cluster to be free and does NOT run concurrently with
  another Wildlife.tsx point. Implementation-ready once the research lands.

- [ ] 285. HUNT ACCUMULATION BUGS AND MEMORY LEAKS — A REPEATABLE FABLE ANALYSIS
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

- [ ] 295. DEV-BUILD RENDER-RESOURCE LEAK INVARIANT (user 24.07.2026, from the retrospective
  §3.12/§8 — the in-game-assert principle applied to GPU resources). A `import.meta.env.DEV`
  invariant that asserts the renderer's render-target / texture counts (`renderer.info`)
  stay BOUNDED across scene transitions and effect-toggle rebuilds — `console.error` + a
  probe log when the count grows beyond a threshold across a transition. So a GPU-resource
  leak like the point-276 WebGPU TRAA render-target leak (47→50 across toggle cycles, caught
  only because one settings.mjs check happened to run) SCREAMS in EVERY dev session and every
  test run, not just that one check. Generalize the existing "TRAA toggle stress: no
  render-target leak" settings.mjs check to more transitions (scene switch travel↔place,
  detail-level changes, effect toggles). ANCHORS: `src/render/Effects.tsx` / the renderer
  setup, a new dev-assert module (arm early, extend as systems change); `scripts/verify/
  settings.mjs`. VERIFIABLE: a pure test of the bound/threshold logic; a live check that a
  forced leak trips the assert and a normal session/toggle does not (both backends). No
  player-visible text. PROCESS: Fable-5 plan-review BEFORE, Fable-5 safety-review AFTER
  (safe / all cases / no side effects), merge to main ONLY when all green (user 24.07.2026).

- [ ] 297. PERIODIC GUARD-CHAIN & MEMORY AUDIT (user 24.07.2026, retrospective §7;
  hygiene/observation). A repeatable consolidation pass over the Stop-hook guard chain (11+
  hooks run every turn end) and the memory files (contradictory/tempering pairs like
  deploy-fable-proactively ↔ fable-sparingly): list each guard/memory with last-modified,
  flag redundancy/contradiction, consolidate — same spirit as the `.md` docs audit. Keeps the
  guard "immune system" from becoming an autoimmune disease. ANCHORS: a checklist doc + an
  enumerating script (guards in `scripts/`, memories in the memory dir). VERIFIABLE: the audit
  produces a report; no runtime invariant. (Lighter point.)

- [ ] 298. MODEL-DIVERSITY FOR HARD/CRITICAL CHANGES — criticality triage + an ENFORCED
  diverse review (user 24.07.2026; retrospective lesson). STANDING RULE: before building any
  feature/point, assess its DIFFICULTY × CRITICALITY — a "must-always-work" change (a guard,
  the batch singleton, save/load, anything hard to reverse or load-bearing for the whole
  system) is HIGH-criticality. For a HIGH item, apply MODEL-DIVERSE review: either (a) the
  primary model (Opus) builds and a Fable-5 subagent reviews the PLAN before and the RESULT
  after (truly safe / works in ALL cases / no negative side effects), or (b) Fable builds and
  Opus cross-checks — a second, DIFFERENT pair of eyes on the risky work. Merge only when the
  diverse review is green. Generalizes the ad-hoc Fable sandwich on points 294/295 into a
  standing practice; extends the audit-with-model-diversity and switch-to-fable-when-stuck
  memories from "audits" / "when stuck" to "proactively, by criticality". MECHANISM (enforced,
  not remembered): (1) a CRITICALITY tag convention on TASKS points ("Criticality:
  low|med|high" + a one-line rationale); (2) a Stop-hook guard (pure core + Vitest + fail-open,
  the project's guard schema) that, when a HIGH-criticality point is ticked/merged on main,
  requires a recorded model-diverse-review marker (HEAD-bound, like render-verify-guard) — a
  high tick without that record BLOCKS. ANCHORS: a new `scripts/criticality-review-guard.mjs`
  + `-core.mjs` + Vitest, `.claude/settings.json` (Stop hook), a review-record marker file,
  docs (the rule in CLAUDE.md working-method + the retrospective). VERIFIABLE: pure test of
  the guard core (high + no review → block; high + review → allow; low/med → allow; malformed
  → fail-open) and a synthetic high-criticality tick that fires the guard. This point IS itself
  high-criticality (a must-work guard) → build it under its OWN rule: Fable-5 plan-review
  BEFORE, Fable-5 safety-review AFTER, merge to main ONLY when all green. No player-visible text.

- [ ] 299. BIRD'S-EYE SETTLEMENT COLLISION — you must not walk THROUGH a settlement (user
  24.07.2026, screenshot; for AFTER the v0.2 tag). Now that entry is Space-only (point 244),
  the bird's-eye traveller walks straight THROUGH a village/settlement footprint, which looks
  wrong. ADD a bird's-eye COLLISION for settlements (like the existing tree/animal collision,
  §11/§19): the traveller cannot cross a settlement's footprint — sliding movement at its edge,
  no tunnelling on a fast step. BALANCE WITH ENTRY (the crux): the Space enter-radius
  (`settlementEntry`) must stay REACHABLE — the collision must NOT stop the traveller BEFORE he
  reaches the enter-radius, or he can never enter. So the enter-radius must be >= the collision
  radius: the "Space to enter" prompt arms at or OUTSIDE the collision boundary, so approaching
  a settlement you always enter the enter-zone (prompt shown, key armed) before/as the collision
  halts you, and a Space press there enters. Calibratable relation (collision radius vs enter
  radius) in balance. NON-OVERLAP INVARIANT: no two places' enter-radii may overlap — Cairo and
  the future walkable Giza pyramids (point 273), adjacent ports/villages — else entry is
  ambiguous. Enforce a GLOBAL pure test that every pair of enter-radii is disjoint (place
  positions / clamp radii so they never intersect); point 273 already proves its Giza disc
  non-overlapping with Cairo — generalise that to ALL places.
  THE COLLIDER MUST NEVER TRAP THE TRAVELLER — the failure this point would otherwise
  CREATE (user 25.07.2026). Several paths put him at a place's exact centre, which is
  INSIDE the new footprint: the debug jump-to (`debugJumpTo` in `src/state/store.ts`,
  reached from every named map point in the §21.3 picker) lands on the map point itself,
  and a resumed snapshot or a successor start restores a position that was recorded at a
  port. Before Space-only entry, walking out simply re-entered the settlement; with a
  collider and no automatic entry, he would stand inside a wall he cannot cross. TWO
  RULES, both required:
  (1) THE COLLIDER IS ONE-WAY. It blocks CROSSING IN, never getting OUT. A traveller who
  is already inside the footprint — however he got there — may always move freely to the
  outside. This is the general invariant and it covers every future teleport nobody has
  thought of yet, including a save written by an older build.
  (2) A JUMP TO AN ENTERABLE PLACE ENTERS IT (user 25.07.2026). Jumping to a settlement
  or the Giza monument site puts the traveller straight INSIDE, in the first-person
  view — which is what a jump to a place is for, and what the jump effectively did
  before entry became key-only (landing on the centre triggered the automatic entry).
  It goes through the ORDINARY entry path, so everything an entry normally does still
  happens — discovery, the port checkpoint, the orientation markers. A debug jump is
  meant to reach the real state, not a special one. Jumping to a target that cannot be
  entered — a mountain, a waterfall, a lake, the graveyard, the tomb, a natural site —
  is a bird's-eye jump exactly as today. The bird's-eye position is set as well, so
  LEAVING the place afterwards puts the traveller where he would have been.
  VERIFIABLE additionally: pure — a step from inside the footprint toward the outside is
  NOT blocked while a step from outside toward the inside is (the one-way rule, swept
  over the place roster); the jump target resolver classifies every entry in the §21.3
  picker as enterable or not. Live — jumping to a village lands in the first-person view
  inside it, leaving it puts the traveller outside the footprint and free to walk away,
  and jumping to a mountain still lands in the bird's-eye view. ANCHORS: the bird's-eye collision
  (`src/systems/movement.ts` / the travel-scene collider set that already handles trees/animals),
  `src/scenes/travel/settlementEntry.ts` (enter radius + the collision-radius relation), the
  world/place roster (positions + radii). VERIFIABLE: pure tests that the settlement collision
  blocks a straight walk through the footprint while a Space press within the enter-radius still
  enters (the collisionRadius <= enterRadius invariant), and that all place enter-radii are
  pairwise disjoint (Cairo / villages / ports / pyramids); a live check (`scripts/verify/flow.mjs`
  or `enrichments.mjs`) that the traveller is stopped at a settlement edge and cannot cross it,
  yet still enters with Space. No new player-visible text (reuses the existing prompt).

- [ ] 300. ANIMAL GAIT REALISM — leg cadence must match forward speed, no foot-skating (user
  24.07.2026; for later/v0.3). The animals' leg-swing speed looks too fast for their forward
  movement — they read as GLIDING/skating over the ground rather than walking on their feet.
  ESPECIALLY the panorama skyline silhouettes (points 255/286) but ALSO the walkers inside
  settlements. FIX: either model the gait physically correctly (the stance foot stays PLANTED on
  the ground while the body moves forward over it; the leg cadence is derived from ground
  distance covered, so one full stride = a fixed forward distance = the foot's planted-to-lift
  ground travel), OR — if a full physical foot-IK is too compute-heavy in-game — tune the
  gait-phase-per-distance (stride length) so the feet do not skate. The panorama gait is already
  distance-driven (point 255: gaitPhase from the drifted arc); investigate why it STILL reads too
  fast — likely the stride length (forward distance per full cycle) is too short, so legs cycle
  faster than the ground passes. VERIFY (the user's method — concrete + testable): a SERIES OF
  SCREENSHOTS across an interval — when a leg that has just swung forward moves BACK (stance
  phase), its FOOT must stay at the SAME ground position while the animal advances (the plant foot
  is fixed to the ground, the body translates over it; no sliding). Add a PURE test that the
  stride length equals the foot's stance ground-travel (feet planted, not skating), and a LIVE
  screenshot-series check (a skyline silhouette AND a settlement walker) that a tracked foot's
  screen position stays ~fixed through its stance phase while the body moves forward.
  SLOPE FOOTING (user 24.07.2026, second facet of the same "feet on the ground" system): when an
  animal walks UP or DOWN a slope, its front (uphill) or back (downhill) feet FLOAT in the air —
  the body/legs do not conform to the incline (screenshot: a skyline silhouette on a dune with a
  foot hovering above the terrain). FIX: sample the terrain height under EACH foot (or pitch the
  body to the local ground slope) so ALL feet contact the sloped ground, not just the ones on the
  body's reference plane. VERIFY (screenshot): on an up-slope AND a down-slope, no foot hovers
  above the terrain — every planted foot touches the ground it stands on (panorama silhouette on a
  dune AND a settlement walker on sloped ground). ANCHORS: the
  panorama gait (`src/scenes/place/panoramaWildlife.ts` — gaitPhase / legSwingAngle /
  panoramaGaitDistance, points 255/286), the settlement-walker gait, `src/render/fauna.ts` (the
  leg pivots). No player-visible text.

- [ ] 303. CODE REVIEW OF ALL CHANGES SINCE v0.1 — validate every test is still VALID (user
  24.07.2026). QUEUE POSITION: the NEXT task after 224. Stale tests keep surfacing only as
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

- [ ] 306. CLOSING-COMPLETENESS ENFORCEMENT — a closing must not be able to SKIP a step (user
  24.07.2026, after the v0.2 closing skipped the dead-code / stale-doc / stale-comment cleanup —
  the very thing that distinguishes a closing from a plain LARGE regression). ROOT CAUSE: the
  closing cycle's steps (§7.2 / Maximum-QA Phase 8 / this file) were tracked only by fallible
  MEMORY; under the pressure of getting the regression green through many stale checks, the
  regression got done but the cleanup + the .md audit were skipped, and nothing blocked it.
  MECHANISM (enforced, not remembered): (1) an explicit machine-readable CLOSING CHECKLIST
  enumerating EVERY closing step (from §7.2 + Maximum-QA Phase 8): full LARGE both-backends
  flake-free, dead-code cleanup, stale-doc audit, stale-comment audit, `.md` cruft audit (section
  numbers preserved), implementation-sections current, graphics-detail-doc current, cross-browser/
  mobile smoke, open-items list, simplifications named. (2) a HEAD-bound CLOSING-STATE record
  (like `render-verify-guard`) where each step is checked off WITH evidence for the specific
  closing commit. (3) a Stop-hook guard (pure core + Vitest + fail-open, the project schema) that
  BLOCKS creating/moving a version tag AND any "closing complete" claim / 224-style tick unless
  EVERY checklist item is recorded done for the current HEAD — so a version release is impossible
  with an incomplete closing. Wire it into the version-release process (the `version-release`
  memory + CLAUDE.md §9 + docs/maximum-qa.md Phase 8/9). ANCHORS: `scripts/closing-guard.mjs` +
  `-core.mjs` + Vitest, a closing-checklist definition module, `.claude/settings.json` (Stop hook),
  `.claude/closing-state.json`. VERIFIABLE: pure tests (block on any unchecked step, allow when all
  checked, fail-open on malformed) and a synthetic version-tag attempt with an incomplete checklist
  blocked. MUST-WORK guard → build under the point-298 criticality rule, and per the user's explicit
  instruction have Fable-5 verify the mechanism is 100 % RELIABLE (it cannot let an incomplete
  closing through) before it counts as done. No player-visible text.

- [ ] 308. DASHBOARD SYNC GUARD — enforce that the »Woran ich gerade arbeite« card stays in sync
  A written rule (»keep the dashboard current«) has no automation — at point 306, I forgot to update
  the card while closing work ran in the background. The rule MUST be mechanically enforced: build a
  Stop-hook guard that BLOCKS a turn-end if the card title does NOT match the real current state
  (running agents, checked-out Git branch, TASKS.md point state). The guard is READ-ONLY: it does
  not update the card, only detects and blocks drift. Core decision logic (git branch checks, card
  title parse, TASKS.md scan) must be pure and Vitest-coverable. Deliverables: pure core logic +
  15+ test cases (stale-card detection, branch-match, agent-pool polling) + fail-open Stop-hook
  wrapper + a report of what drifts the guard catches (e.g. card says »306« but HEAD is on
  »feat/224-…«). This guard exemplifies point 307's mechanism-first principle: instead of relying
  on memory, a technical gate enforces rule compliance.

- [ ] 309. SERVING-MODEL DEGRADATION: REPAIR + TRIPWIRE (user 25.07.2026). REPAIR: the
  late-evening session of 24.07 ran silently on Haiku 4.5 (proven by the Co-Authored-By
  commit trailers) and merged three deliveries that missed their specs; main is RESTORED
  to the last pre-degradation state fd85464 on every touched path — the placebo
  proximity-call fix incl. its assert-nothing tests (expect(true)) reverted (292
  reopens), the unwired detect-load stub removed (296 reopens), the rubber-stamp
  guard-chain audit removed (297 reopens), the load-corrupted verification PNGs
  restored, the three TASKS ticks undone — while the legitimately recorded
  .claude/closing-state.json is kept; the load-tainted working-tree churn (PNGs, retro
  appendix, ineffective settings additionalDirectories, untracked pre-push stub) and the
  unauthorized local .git/hooks/pre-push are discarded. MODEL ALLOWLIST (user
  25.07.2026): ONLY Opus 5 (default), Opus 4.8 (fallback when Opus 5 is unavailable)
  and Fable 5 (occasional four-eyes work) may run the batch — Sonnet, Haiku and every
  other model are NOT acceptable; if the policy cannot be held, the batch STOPS. The
  batch autostart therefore launches `--model claude-opus-5[1m] --fallback-model
  claude-opus-4-8[1m]` (flag verified against the bundled CLI). TRIPWIRE
  (mechanism-first): a Stop-hook guard (pure core scripts/model-guard-core.mjs +
  fail-open wrapper scripts/model-guard.mjs, wired FIRST in the Stop chain) parses the
  recent commits' Co-Authored-By trailers; any commit after the committed baseline
  (.claude/model-guard-baseline.json) authored by a Claude model OUTSIDE the allowlist
  BLOCKS the turn end with a pause-the-batch instruction and pings ntfy — a degraded
  session is caught at its FIRST commit, and an unknown future model name fails
  closed. The guard stands down while .claude/batch-paused exists (no block loop once
  paused); the batch-resume hook names the allowlist on every session start.
  VERIFIABLE: model-guard-core Vitest sweep (trailer parse incl. malformed lines,
  allowlist pass for Opus 5/Opus 4.8/Fable 5 variants, breach for Haiku AND Sonnet AND
  unknown models, mixed-co-author flagging, human co-authors and merge commits
  ignored, baseline cutoff boundary, empty log); the repaired state passes the full
  LARGE regression on a quiet machine (both backends), which also re-validates the
  four Opus points merged before the degradation (262/273/293/305).

- [ ] 310. LOW-PRESET PERFORMANCE PASS FROM THE S25 BENCHMARK (user 25.07.2026). Input:
  the user's real-device F8 report local/samsung-s25-bench.json (Galaxy S25, Adreno
  8xx, WebGPU with real GPU timestamps, production build 4f1d6f4). Findings to work
  from: LOW holds 60 fps vsync-capped, but the GPU median is 6.95-9.83 ms — thin
  headroom for thermal throttling or 120 Hz; the LOW frame is dominated by
  travel-dressing (53 % of triangles, ~535k tris in savanna) and a biome-INDEPENDENT
  unnamed system ("(unnamed) MeshStandardNodeMaterial", constant 425,118 tris / 180
  meshes in EVERY phase — 78 % of the desert frame); dpr is the strongest lever
  overall (baseline GPU 18.55→8.39 ms driving at dpr 1) and LOW already caps it at 1.
  SALVAGED IDEA (25.07, from the retired `feat/276-wildlife-lod` branch — see point
  329): throttling the BEHAVIOUR updates of off-screen animals cuts the driving
  frame cost. The branch itself was retired unmerged (219 commits behind main, its
  three files moved on 16/9/1 commits since), but the lever is sound and belongs
  here: update animals outside the rendered frame at a reduced rate (projected via
  the shared `isOnScreen`, never an assumed radius — the point-172 rule), keeping
  every §19 drama deadline in sim time so no drama stalls. Judge it on the CPU
  series of the F8 report, where the S25 shows 7.6-8.7 ms at LOW.
  DIAGNOSIS DONE (25.07, main session): the unnamed 425k system IS the river/lake
  water geometry — `src/scenes/travel/Rivers.tsx` mounts the ribbon mesh and every
  lake sheet with NO `name` prop (around the `<mesh geometry={geometry}
  material={riverMat}>` / lake map), so `groupKey` in src/systems/benchmark.ts falls
  back to the material name `MeshStandardNodeMaterial`; the courses are global and
  biome-independent, which explains the constant count in every phase. Deliver:
  (a) NAME those groups (and any other unnamed one) so the F8 report attributes
  every system, (b) a LOW flora/dressing DENSITY lever (calibratable
  instance-count factor on top of the existing floraFogFactor radius cut — the §19.9
  dressing keeps reading as savanna, only thinner), (c) a LOW geometry lever for the
  identified 425k-tris system (e.g. coarser river-ribbon tessellation on LOW if it is
  the water — every §11.3 continuity/never-buried invariant must keep passing), (d)
  only if a-c leave the headroom short: a touch-preset-only dpr cut below 1 (the touch
  preset stays a SUBSET of low). EVERY new lever gets entries in ALL THREE
  QUALITY_PRESETS levels (the src/config/quality.test.ts completeness gate and the
  docs/graphics-detail-levels.md sync test enforce this), stays debug-tunable within
  its level, and reads through the point-276 effective-selector pattern. VERIFIABLE:
  pure tests for each new preset key; the §11.3/§19 suites stay green at LOW (ribbon
  continuity, dressing-streaming no-pop projection checks); picture checked on BOTH
  backends at LOW; and a fresh F8 run (headless as smoke, the user's S25 as the real
  price check) shows a clearly lower LOW GPU median in the dressing-dominated savanna
  phases without a visual regression the user rejects.

- [ ] 312. ANIMALS ARE WATER-SHY, NOT WATER-BARRED (user 25.07.2026, revising the
  point-192 rule; former point 324 is folded in here). The rule was read far too
  strictly: "animals must not stand around in water" — so that a canoe passage stays
  clear — hardened into "water is off limits to them". What the player sees is a
  fleeing animal PRESSING against the waterline or skating along the bank hunting for
  a way around, instead of simply swimming across; and a calf swept into the water
  sticking at the bank so its drama never plays out.
  THE RULE IS STATED IN ONE PLACE — design.md §19.5. This point BUILDS it; do not
  restate it elsewhere.
  (a) NO SPAWN, NO LINGERING — unchanged, and the reason the rule exists. An animal
  never spawns in water and never idles, grazes, rests or waits in it; one that comes
  to rest on water makes for the nearest bank. A channel the player canoes must never
  be blocked by a parked animal. This half must stay demonstrably intact — and it is
  what ENDS every water passage: the moment a flight stops, the animal turns for the
  NEAREST bank and SWIMS out under its own power. It is never snapped back onto land,
  which is how the old setback behaved; shyness must read as shyness, not as a
  teleport.
  (b) CROSSING IS ORDINARY: a ROAMING animal may take on a channel rather than turn
  from it, governed by the calibratable `balance.waterCross.*` (width, readiness).
  (c) FLIGHT IS UNRESTRICTED. Fleeing anything — a predator, an oncoming elephant, the
  traveller, fire — the animal enters the water the moment its escape leads there: no
  dead-end precondition, no pressure radius, no width limit, no chance roll.
  CONCRETELY: the along-shore deflection (`deflectedStep`) applies to the OCEAN edge
  ONLY, so a flight meeting a river or lake goes IN rather than sliding along the bank.
  A juvenile returning to its parent (§19.8) moves under the same freedom.
  (d) A WATER DRAMA OWNS ITS ACTOR (the folded 324): while a §19.8 water drama runs —
  the swept calf, the wading rescuer, a crocodile's victim — no leave-the-water rule
  may pull the animal out. The exemption keys on the DRAMA STATE, not on the species.
  (e) TWO INVARIANTS UNTOUCHED: the open sea of §11 stays the world's edge (the ocean
  setback is exactly as it is), and every water passage RESOLVES — a bank is reached or
  the deadline grounds the animal there (invariant I4), so nothing swims forever.
  ANCHORS: `fleeCrossing`, `crossingTarget`, `deflectedStep` and the water setback in
  `src/scenes/travel/wildlifeBehavior.ts`, with their call sites in
  `src/scenes/travel/Wildlife.tsx` (the three flight sources — predator flee, elephant
  dart, player-shy — and the calf follow branch); `waterEdgeRules.ts` holds the
  drinker/bather bank targeting, which does NOT change.
  WHAT SHRINKS RATHER THAN GROWS: the boxed-trigger machinery this point once called
  for (a pressure radius, a boxed-persistence hysteresis, a crossing chance for
  flights) is NOT to be built — under (c) a flight needs no trigger at all. Add no
  balance values for it.
  DOCS in the same commit: design.md §19.5 already states the target; CLAUDE.md §7.1
  point 12 currently carries a forward-pointer at the superseded claim and must be
  rewritten to the built state when this lands, dropping that pointer.
  VERIFIABLE: pure — a flight step whose heading meets river or lake water is NOT
  deflected along the bank, while the same step at an ocean edge still is; a roaming
  crossing still honours its width and readiness values while a flight ignores both; a
  drama-flagged animal is setback-exempt while its drama runs and subject to it again
  afterwards; an idle animal that ends up on water heads for the nearest bank. Live
  (`scripts/verify/enrichments.mjs`, both backends): an elephant driven at a grazer on
  a STRAIGHT bank — where an along-shore slide IS available — sends it into the water
  and out the far side; an animal the PLAYER drives into a river and then leaves alone
  is out of the water within moments — swimming to the nearest bank, its path sampled
  so it is a swim and not a jump; the staged swept calf reaches mid-channel and its
  drama resolves; and across a driven pass no animal is found standing in a channel, so
  the canoe lane stays clear.

- [ ] 314. DRIFTING PALE PATCHES ON WATER (user 25.07.2026, screenshot: bird's-eye at
  a river mouth near the ocean — two elongated pale/greenish patches ON the water
  surface near the shore, which MOVE/CHANGE as the traveller walks; "immer noch
  gelegentlich", i.e. the class was seen before). DIAGNOSE BY THE PICTURE first
  (drive the reported shore on both backends, screenshot series), then root-cause —
  candidate hypotheses to check, not to assume: (1) shore/crest foam sampled in a
  non-world-anchored space so the mask swims with the camera; (2) the far-sheet vs
  near-water overlap at the coast (zoom-gated far sheet showing through); (3) the
  point-211 ribbon-row lift re-evaluating per terrain-chunk LOD so lifted rows pop
  as chunks stream (matches "changes while walking"); (4) foam from the river mouth
  bridge (MOUTH_BRIDGE) rows extending into the shelf. FIX the identified cause; the
  §11.3 continuity/never-buried/mouth-bridge invariants stay green. VERIFIABLE: a
  driven enrichments check at the reported spot asserts the water pixels stay
  stable while the traveller moves (frame-diff over the water region bounded, on
  BOTH backends), plus the screenshot pair before/after; pure test for whichever
  sampling rule was wrong.

- [ ] 315. THE SPHINX IS REBUILT FROM SCRATCH, FAR MORE ELABORATE (user 28.07.2026,
  superseding every earlier display report about it — the flicker, the shape and the
  half-buried read are all answered by the new model, not by patching the old one). The
  user's verdict on the deployed build: "die Darstellung der Sphinx gefällt mir allgemein
  nicht … man kann sie kaum als Sphinx erkennen", and the screenshot shows why — a stack
  of plain boxes with a slab on top, reading as a gate or a table, at a monument every
  player recognises on sight. The FIRST-PERSON view is what matters most; the bird's-eye
  landmark and the §2.5 skyline silhouette are named as "auch nicht schön" and are part of
  the same job.
  THE TARGET: a Great Sphinx that is recognisable at a glance from any standpoint a player
  can reach, and worth walking up to — a couchant lion body with the forepaws stretched
  forward, a human head in the nemes headdress with its brow band and the folded lappets
  falling to the chest, the broken nose and the missing beard of the real monument, the
  chest between the paws, and the weathered horizontal banding of the limestone courses.
  It is the one built landmark in the game with a FACE; it must not be the crudest.
  ACCURACY AND RECOGNISABILITY, and how to hold both: `docs/giza-1890.md` records the
  ~1890 state — the body buried to the shoulders, only head, neck and upper back standing
  clear, which is exactly what makes the current model unreadable. Do NOT dig it out; the
  period state is researched and stands. Buy the recognisability from DETAIL and from the
  drift's own shape instead: the emergent head carries the nemes, the face and the neck at
  a resolution that reads from across the site, and the sand mound is modelled as a body
  UNDER sand — a long couchant swell with the shoulders' shape showing through and the
  back ridge breaking the surface — rather than a heap beside a box. A player who has
  never seen the site must be able to say "that is the Sphinx"; a player who knows it must
  find the 1890 burial line where the photographs put it. If, once built, those two
  genuinely cannot be reconciled, say so with the pictures rather than quietly abandoning
  either — the choice is then the user's.
  ALL THREE SCALES, one model, three levels of detail: (a) FIRST-PERSON at the site, the
  full model; (b) the BIRD'S-EYE landmark, seen from above and far — the silhouette from
  that angle is what carries it, so the paws, the body swell and the head must be
  distinguishable at the travel scale rather than a lump; (c) the §2.5 SKYLINE silhouette
  from Cairo (point 82), where only the outline exists and it must still read as a
  crouching figure with a raised head. Derive them from ONE definition so the three cannot
  drift apart, the way the Giza plateau's two records did (point 338).
  COST IS PART OF THE JOB: the site model may be elaborate, but it is drawn every frame at
  a place the player stands in. Sort it into the quality levels like every other optical
  feature (§21, `QUALITY_PRESETS` in `src/config/quality.ts`) — a fuller mesh on high, a
  reduced one on low — and report the measured frame cost at the site on BOTH backends at
  LOW and at MEDIUM. A level that cannot afford the full mesh gets the reduced one, named
  and tested, never a silent downgrade.
  WHAT THIS REPLACES: the old spec asked for a mound envelope and blamed a coplanar sheet
  for a flicker at the body's base. Both die with the old geometry — but the flicker is
  still the sharpest acceptance signal available, so the live check MOVES the camera
  rather than taking one still, and no z-offset may be used to hide a fight that the new
  model should not have.
  VERIFIABLE: pure Vitest on the shared definition — the three levels of detail come from
  one source, the burial line matches the documented ~1890 state, head and upper back
  stand clear of the drift while every other body part sits below it, the drift's
  footprint does not exceed the body's by more than its skirt, and the collidable mass
  still matches the drawn body (point 378's rule). Live on BOTH backends: a screenshot SET
  from several standpoints inside the site — face on, in profile, from behind, and one low
  enough to look along the drift — plus the bird's-eye landmark and the Cairo skyline
  frame, judged by the picture; and a moving-camera pass that shows no flicker anywhere on
  the model.
  DOCS in the same commit: `docs/acceptance-evidence.md` §15/§25 gain the chain, and
  `docs/graphics-detail-levels.md` the new per-level entries.
- [ ] 316. SWIMMER TRAPPED IN A RIVER-MOUTH NOTCH (user 25.07.2026, screenshot at the
  Nile delta mouth ~31.4N/30.4E: swimming without a canoe, the downstream current
  outruns the swim speed so he cannot go back upstream, and the ocean boundary
  blocks WITHOUT letting him slide sideways along it — a softlock in the notch
  between river mouth and coast; user's proposed solution: there must BE no such
  notch, and every other river-to-ocean transition needs the same check). Fix BOTH
  layers: (1) GEOMETRY per the user's proposal — at every sea mouth the
  coast/mouth-bridge junction must not form a concave water pocket that the current
  pushes into; adjust the mouth-junction shaping (§11.3 point 211) so the water
  edge meets the coast without a trap notch, and SWEEP all sea-mouth rivers
  programmatically for such pockets (a pure test walking each mouth's water cells:
  from every swimmable cell there exists an exit path on which the current does not
  exceed swim speed); (2) MOVEMENT GUARANTEES as the backstop — the ocean boundary
  resolves swimming movement by SLIDING tangentially (like settlement collision)
  instead of a hard stop, and the passive downstream drift never pushes INTO a
  blocked boundary (drift clamped by the same resolve). The §11.3 continuity,
  mouth-bridge and never-buried invariants and the ocean-impassable rule stay
  intact (no new way to leave the continent). VERIFIABLE: the all-mouths
  escapability sweep (pure); a staged swim in the reported notch drifts, slides
  along the coast and gets out alive (enrichments, both backends); the §11.2/redSea
  suite stays green.
  ANCHORS (read-only prep 25.07, main session — layer (2) is confirmed): in
  src/state/store.ts the bird's-eye move resolves a blocked step as a HARD STOP —
  it samples the target cell, and `if (isBlocked(...)) { set({toast: oceanBlocked});
  return }`, with no tangential retry. Settlement collision has had sliding for a
  long time; the overland move never got it, so a traveller pressed against the
  ocean boundary by the current has no lateral escape at all — exactly the
  reported softlock. The drift itself already refuses to push INTO blocked ocean
  (the same `isBlocked` guard in the drift step), so the drift is not the trap; the
  missing slide is. FIX SHAPE for layer (2): on a blocked step, retry along the
  boundary tangent (project the intended step onto the free direction, the way the
  settlement resolve does) before giving up, and keep the toast only for the case
  where every direction is genuinely blocked. That change alone would let the
  reported situation resolve even before the geometry work of layer (1) lands —
  worth doing first and verifying separately.

- [ ] 319. CROCODILE KILL AFTERMATH: PREY DISSOLVES WITHOUT SINK OR VISIBLE SCAVENGER
  (user 25.07.2026: a crocodile seized an animal, the crocodile disappeared at some
  point, and the prey then kept slowly dissolving — possibly "eaten" with no vulture
  visible). Per §19.16 a crocodile KILL must SINK — the river keeps the body, no
  bank carcass, no vulture; a slow in-place dissolve with no visible actor matches
  NO legitimate path. INVESTIGATE the victim's state machine after the croc leaves:
  every crocodile exit path (kill → sink; grip-deadline release → victim freed
  ALIVE; croc streamed out by the view ring mid-drama) must leave the victim in a
  consistent, VISIBLE state — either sinking (kill) or alive and walking (release);
  the carcass-shrink animation must only ever run with a visible feeding/scavenging
  actor present (lion feed, vulture flock, ground scavenger), never as an invisible
  decay. Likely suspects to check: the caught victim being handed to the ordinary
  land-carcass system when the grip ends instead of the sink path, and the shrink
  timer running detached from any feeder. VERIFIABLE: pure tests over the croc exit
  paths (kill/sink, deadline-release/alive, ring-despawn — victim state asserted
  for each); an enrichments stage reproducing the reported sequence (catch → croc
  leaves → victim must either sink or stand up, and NO shrink without an actor —
  add a dev-assert for "shrinking carcass has no feeder" so every session detects
  it); both backends.

- [ ] 320. SPRINGS AS REAL 3D BUBBLING WATER (user 25.07.2026: the springs still
  read as a mere symbol — animated now, but flat; they should LOOK like a spring
  with water bubbling three-dimensionally). Rework the §11.3 spring depiction at
  travel scale into a small 3D water feature. ANCHOR (25.07, main session): the
  current spring is built in `src/scenes/travel/Rivers.tsx` as a stack of FLAT discs
  — circle meshes rotated `-Math.PI / 2` (the pool, a damp-ground ring and the
  animated ripple), which is exactly why it reads as a symbol however it animates.
  Replace that stack with: a low dome/upwelling mesh whose
  surface visibly bubbles (TSL displacement/normal animation — renderer-agnostic,
  both backends), a bright welling centre with concentric ripple rings, a small
  wet pool/outflow meeting the terrain (no floating disc, no billboard), sized to
  read at the default zoom 0.5 without dominating. Calibratable size/intensity
  under balance (debug-editable); quality-level entries for ALL THREE
  QUALITY_PRESETS (the completeness gate enforces this) — LOW may use a cheaper
  variant but the feature stays visible. VERIFIABLE: the existing "at least one
  spring" check extended: the spring mesh is 3D (non-flat bounding box), its
  surface animates over sim time (vertex/pixel delta between two sampled frames at
  the spring, both backends), and it sits ON the terrain (no gap/clip at the rim —
  ray/heights check); screenshot pair added to the §7.2 evidence set; the picture
  judged on BOTH backends per the render rule.

- [ ] 321. GRASS FIRE READS WRONG ON EVERY COUNT (user 25.07.2026 with screenshot:
  the burning-grass event shows a column of flat orange blocks — no recognizable
  FIRE FRONT, "strange waves" that make no sense, and the burn SCARS do not read as
  burnt ground). Rebuild the §14/§19 grass-fire depiction: (a) a readable FRONT — a
  curved, advancing line of flame with a bright leading edge and smoke rising
  behind it, not a stack of quads; (b) identify and drop/rework whatever produces
  the wave artefact (likely the animated flame sheet's UV/vertex wobble read at
  bird's-eye distance); (c) BURN SCARS that read as burnt earth — dark, sooty
  ground tint following the terrain like the point-267 blood tint, with soft
  irregular edges, not orange blocks. Calibratable extent/speed under balance,
  quality entries for all three levels. VERIFIABLE: pure tests for the front
  geometry (advancing line, bounded curvature, scar polygon trailing the front) and
  the scar tint sampling; live check that the front's leading pixels read clearly
  brighter/warmer than the trailing scar and the scar clearly DARKER than unburnt
  savanna; screenshot 131 refreshed and judged on BOTH backends.

- [ ] 322. STAGED-EVENT FAILURES ARE EASY TO MISS (user 25.07.2026: staging "calf
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

- [ ] 323. BLOOD STAINS ARE PERFECT CIRCLES (user 25.07.2026: they should have
  natural, irregular contours). Point 267 made the stain a terrain-following ground
  TINT, but its footprint is still a circle. Give it an organic outline: a
  per-stain seeded noise/domain-warp on the tint's radial falloff (the technique
  the §3.3 biome borders use), so every stain has its own ragged contour and no
  circle reads anywhere; size and irregularity calibratable. VERIFIABLE: pure test
  that the mask radius varies with angle by a bounded but clearly non-zero amount
  and differs between seeds (no two stains alike, none circular); screenshot 137
  refreshed, judged on BOTH backends.

- [ ] 326. A PARENT DIES WITH NO VISIBLE CAUSE AFTER A CROCODILE KILL (user
  25.07.2026: crocodile took a calf, crocodile gone, the parent stood at the death
  spot and simply fell over dead — reading as suicide). Every §19.8 death must have
  a VISIBLE cause on screen (a predator that reaches it, a trample, a drowning, a
  fall). Audit the vigil/grief paths against the crocodile case: a parent standing
  vigil after a crocodile kill either is taken by a VISIBLE predator (the point-121f
  draw that spawns beyond the ring and walks in) or survives and rejoins — never
  dies in place with no actor. Add a dev-assert "death without a visible cause"
  covering every death path so the class is caught in every session. Related to
  point 319. VERIFIABLE: pure test enumerating the death causes, each setting a
  cause field; the assert fires on a synthetic causeless death; a staged
  croc-kill-then-vigil ends in one of the two legitimate outcomes; both backends.

- [ ] 327. TWO NEARBY CARCASSES MUST SHARE ONE VULTURE FLOCK (user 25.07.2026: a
  second flock spawns and the two overlap). Give the §19.6 flock a claim over a
  carcass CLUSTER: a new carcass within a calibratable radius of a flock's current
  target joins that flock's queue instead of drawing a second flock, and the flock
  works them in turn, leaving only when the cluster is done. No two flocks may be
  active within the cluster radius. VERIFIABLE: pure test of the cluster claim (a
  carcass inside joins, one outside draws its own flock; boundary exact); live
  check with two staged carcasses close together — exactly one flock, both eaten,
  no overlap; both backends.

- [ ] 328. VULTURES DO NOT VISIBLY LAND (user 25.07.2026: "they seem to fly one
  moment and stand the next — is there a landing at all?"). Add a real landing
  approach to the §19.6 flock AND the lone ground scavenger: a descending glide
  along the approach heading with slowing forward speed, a flare with raised wings
  just before touchdown, then the standing pose — over a calibratable window long
  enough to read at bird's-eye distance; likewise a visible take-off (run/flap into
  the climb) instead of an instant switch to flight. VERIFIABLE: pure test of the
  landing profile (height decreases monotonically to the landed height across the
  window, forward speed decreases, the flare pose fires in the last phase); live
  check that a landing bird's sampled height passes through intermediate values (no
  single-frame snap) while the point-128 "stands on its own ground" clearance still
  holds; screenshot of the flare; both backends.

- [ ] 329. DECIDE THE FATE OF THE TWO SURVIVING STRAY BRANCHES (25.07.2026 branch
  cleanup: 133 fully-merged branches and 26 orphaned worktrees were removed; two
  carried unmerged work whose value had to be judged rather than deleted or blindly
  merged).
  (a) `feat/276-wildlife-lod` — VERDICT 25.07: RETIRED UNMERGED, idea salvaged into
  point 310. Reason (user-reported, then measured): the branch stood 219 commits
  behind main; its three files had moved on 16 (Wildlife.tsx), 9
  (wildlifeBehavior.ts) and 1 (terrain.ts) commits since — merging a 539-line
  rework across that gap would fight every wildlife fix of the last two days for a
  lever that is easier to rebuild than to reconcile. The LEVER (throttling
  off-screen animal behaviour updates) is now an explicit sub-task of point 310,
  where it is implemented fresh against current code and priced on the S25 report.
  (b) `feat/278-dressing-growth` (24.07, 275 lines: an ALTERNATIVE fix for the
  wildlife duplication that main solved differently in d9ee271, plus enrichments
  checks and pure tests) — STILL OPEN: diff its test coverage against what main has
  and salvage any check main lacks; then drop the branch.
  VERIFIABLE: a written verdict per branch (done for (a)), the branch deleted
  locally AND on GitHub afterwards, and the regression green on whatever landed.

- [ ] 330. FULL POST-DEGRADATION ASSURANCE PASS — nothing new starts until this is
  100 % green (user 25.07.2026, after three separate leftovers were found by chance:
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

- [ ] 331. CLOSING-GUARD HARDENING FROM THE 25.07 REVIEW (findings of the
  model-diverse review that cleared the merged guard commits; all low severity, none
  blocking, hence one small bundled point). (a) The option-swallowing quantifier in
  `isVersionTagCommand` (scripts/closing-guard-core.mjs) is exponentially ambiguous
  over runs of dash-tokens — measured 736 ms on a synthetic 34-flag input, doubling
  per two flags; unreachable by real git usage (a real subcommand fails the star in
  O(1), a 20-flag `git log` measured 0 ms) but a PreToolUse HANG is not covered by
  the wrapper's fail-open, which only catches throws. Fix: drop the redundant
  `-[cC]` alternative, bound the star (e.g. `{0,10}`), restrict the swallowed
  argument to `[^-\s]\S*`; add a timing assertion to the test sweep. (b) A `-C
  <path>` whose PATH ends in a tag name now false-positives (`git -C /build/poc push
  origin main` blocks) — exclude the `-C`/`--git-dir`/`--work-tree` argument from the
  segment before the version/poc matching. (c) Real release acts still MISSED
  (pre-existing, not introduced): `git push origin +v0.3` (force refspec) and `git
  push origin :v0.3` (tag delete) — add `+` and `:` to the version/poc prefix class;
  keep the remaining FN-6…FN-12 items recorded as future hardening. (d) DOC DRIFT:
  three places still say the guard is a PreToolUse(**Bash**) hook although PowerShell
  — the primary shell here — is matched too (scripts/closing-guard-core.mjs:11,
  scripts/closing-guard.mjs:5, CLAUDE.md §9); and the `isVersionTagCommand` JSDoc
  "Matches:" list never gained `gh release create` or the quoted forms. (e) No test
  covers the wrapper's `tool_name === 'PowerShell'` branch — add one. VERIFIABLE:
  the existing 30-case sweep stays green and gains cases for (a)-(c) and (e); the
  documented contract matches the code.

- [ ] 333. WHY THE DOCS DRIFT — AND A MECHANISM AGAINST IT (root-cause analysis
  25.07.2026, user question "where does all this drift come from — were there
  problems before the degraded session too?"). ANSWER: yes, and it has nothing to do
  with that session. Measured on the four features merged after v0.2: 262 touched
  design.md (+2 lines) and NOT CLAUDE.md; 273 touched both (+17/+2) but only ADDED
  its new paragraphs and left the five older places that state the now-false "ten
  ports"; 293 touched design.md and the detail-level doc but not CLAUDE.md §7.1; 305
  touched ONLY docs/graphics-detail-levels.md — the one doc with a SYNC TEST
  (src/config/qualityDoc.test.ts) — and left design.md §2.7/§21/§21.3 stating the
  opposite. The pattern is exact: a doc gets updated where a MECHANISM demands it or
  where the author is already writing; a fact that lives REDUNDANTLY in several
  places drifts in all the copies nobody was editing. The deeper cause is the
  redundancy itself — "the ten port cities" is asserted in five places, LOW's shadow
  behaviour in four. BUILD: (a) a pure DOC-FACT guard that pins the small set of
  facts stated redundantly across design.md/CLAUDE.md against the CODE that owns
  them (known-from-start count from `KNOWN_FROM_START_PLACES`, per-level quality
  values from `QUALITY_PRESETS`, the debug jump-to category list from the menu's own
  groups, the balance-value names the docs cite) — it fails when a doc's number
  disagrees with the code's, like qualityDoc.test.ts already does for one doc; (b) a
  merge-time check that a feature commit touching a §7.1-covered system also touched
  the doc section that covers it, or says why not; (c) reduce the redundancy where
  possible — one authoritative statement per fact, referenced elsewhere (the
  §7.1-references-design.md convention already exists; apply it to the drifted
  facts). METHOD: model-diverse (a second model reviews the fact inventory for
  completeness — an incomplete inventory is the failure mode). VERIFIABLE: the guard
  fails on each of point 332's real drifts when they are re-introduced, and passes
  on the corrected docs; the fact inventory is listed in the guard's header.
  SCOPE WIDENED (user 25.07.2026: "establish mechanisms that make such
  inconsistencies and redundancies impossible in future"): the point delivers a
  STANDING regime, not a one-off sweep. (d) SINGLE SOURCE OF TRUTH as the primary
  cure: for every fact the audit found duplicated, ONE place states it and the
  others reference that place — CLAUDE.md §7.1 already follows this convention
  toward design.md (§7.1 cites sections instead of repeating content, per the
  claude-71-reference-not-duplicate rule) and it is simply not applied to counts,
  defaults and enumerations; extend it there, and where a doc must restate a value
  for readability, mark it as derived and cover it by (a). (e) A DUPLICATION
  DETECTOR that fails when a NEW redundant statement of a covered fact appears
  (a count/keybinding/default that the inventory owns showing up in a second
  place), so the redundancy cannot creep back after (c) removed it. (f) The
  merge-time check of (b) becomes part of the standing gate, not a review step:
  a commit that changes a fact-owning constant must touch the doc that owns the
  fact, or state why not. (g) The regime is documented in CLAUDE.md §4 (docs
  conventions) so a future contributor — human or model — finds the rule where the
  documents themselves are described. ACCEPTANCE for the whole point: re-running
  the 25.07 coherence audit against the finished state reports no drift and no
  new duplication, and each mechanism fails on a deliberately re-introduced
  violation.
  GUARD INVENTORY (from the 25.07 forensic sweep — build these checks in this
  order, best value first; the ENUMERATION checks alone would have caught 6 of the
  11 older drifts): (1) design.md §21.2's tunable list vs the debug menu's own
  number fields; (2) design.md §21.3's toggle/tool list vs the menu's checkboxes
  and selects; (3) the jump-to category list (design.md §21.3 + CLAUDE.md §7.1
  pt 20) vs the menu's groups; (4) the touch-preset lever list (design.md §17.5 +
  §7.1 pt 30) vs `activateTouch`; (5) docs/peoples-1890.md's village coordinates vs
  `VILLAGE_HEARTLANDS`; (6) the known-from-start set (five doc sites) vs
  `KNOWN_FROM_START_PLACES`; (7) the F-key roster vs the HUD's key handling.
  Then the COUNTS, each owned by one code constant: ports/peoples/rivers,
  waterfalls/lakes, cultural landmarks/natural sites, village plans, ice massifs,
  seasonal-dress peoples, benchmark configs, quality levels. Then the DEFAULTS the
  docs quote (walk speed, strafe factor, ambience volume, starting money, start
  date and the 1890-1895 window, ivory range, shadow-map sizes, level default and
  cycle order, the F3 loadout numbers, the thunder delay band).
  TWO FURTHER ROOT CAUSES the sweep exposed, to be addressed by the regime:
  (i) a DOC AUDIT WITHOUT A CODE CHECK can make drift WORSE — a 17.07 docs-only
  audit rewrote a terse correct line into an elaborate false one; every doc audit
  must therefore verify against the CODE, never against neighbouring prose;
  (ii) docs get written against the TASKS SPEC rather than the shipped code — the
  cited `panoramaVicinityRadius` never existed in any commit, it came from a spec
  draft; a doc's symbol citations must be checked against the code that shipped.

- [ ] 336. THE WHOLE CROCODILE STAGING FAMILY IS FRAGILE — REBUILD IT, NOT ONE CASE
  AT A TIME (escalated 25.07.2026 after four consecutive runs each failed a DIFFERENT
  crocodile check). History: the lunge case was found resting on an unpinned
  assumption (its red turned out to be machine load, proven by a quiet-machine
  repeat) and was pinned; the next run failed the TOO-LATE case, where the parent
  arrived in time after all and the crocodile took it instead of the calf; that was
  pinned too; the next run failed the VANISH case with gripped:false — the crocodile
  never seized at all (diag: drink true, dist 0.1, crocLunge false). Fixing one case
  per run is a treadmill: the family shares one `crocDrama` helper whose five modes
  each depend on a different implicit precondition (a distance, an arrival time, a
  drink state, a lunge that must fire), and every one of them is a separate way for
  the staging to miss while the GAME behaves correctly.
  DO INSTEAD — one rebuild of the helper: (a) every mode states its preconditions
  EXPLICITLY and asserts them before measuring, so a miss reports "staging did not
  reach its precondition" instead of accusing the product; (b) every mode pins its
  outcome roll (rescue, lunge and too-late now do; vanish and sacrifice must too);
  (c) the seizure itself is established deterministically — poll for the grip with a
  generous sim budget and FAIL THE STAGING, not the behaviour, if it never happens;
  (d) each mode gets its own tiny setup helper instead of one branching function, so
  a change to one ending cannot shift another's timing (the point-311 lesson at test
  level). VERIFIABLE: enrichments green on BOTH backends THREE times in a row on a
  quiet machine — the flake-free bar the closing gate needs; a staging miss produces
  a distinct, self-naming failure message; the five §19.16 endings still each assert
  their real outcome (no masking). RELATED: this is the concrete first slice of point
  200's flake work, and point 294's auto-classification would have labelled all four
  reds "staging, not product" without a manual repeat each time.

- [ ] 342. HOLD CTRL TO NAME WHAT ACTS ON SCREEN (user 25.07.2026; design.md §17.8
  states the target). While Ctrl is held, every animal, person and usable object on
  screen carries a small floating label naming WHAT it is — "Adult giraffe", "Dead
  giraffe calf" — in both perspectives. Scenery does not: no tree, rock, grass tuft or
  wall. Ctrl is currently unbound (no `ctrlKey` handler exists in `src/`), so nothing
  is being taken away from another control.
  (a) WHAT QUALIFIES — one pure predicate, not a scatter of checks at each call site:
  a thing is named when it can MOVE or the player can DO something with it. In: the
  bird's-eye fauna (the 13 species of `Species` in Wildlife.tsx — elephant, giraffe,
  zebra, wildebeest, antelope, warthog, flamingo, crocodile, plover and the four
  predators — plus vultures and carcasses), the settlement inhabitants and their
  animals, and the usable objects (a pitched camp, a set-down canoe). Out: the flora
  and dressing instances of `SPECIES` in TravelScene.tsx (acacia … kopje), terrain,
  buildings that are not enterable, and the §2.5 horizon silhouettes — those are
  backdrop, not actors. Two exclusions carry design weight and must be pure-tested as
  such: a MAP POINT is never named by this layer (settlements and landmarks keep their
  own labels under the §17.2 discovery gate, so the layer can never leak an
  undiscovered name), and a CONCEALED animal is not named while concealed — the
  submerged crocodile of §19.16 stays silent until it lunges, or the ambush is dead.
  (b) THE TEXT — kind, then age where the game distinguishes one, then state where it
  changes what is seen (dead). The fauna roster is NOT yet localized: `src/i18n/de.ts`
  and `en.ts` carry no species names at all today (`nameCompleteness.test.ts` covers
  places and landmarks only), so this point ADDS them for the whole roster, plus the
  inhabitant roles (elder, trader, villager) and the object kinds.
  GERMAN GRAMMAR IS PART OF THE FEATURE, not a translation afterthought: "Totes
  Giraffen-Jungtier" is not "tot" + "Giraffen-Jungtier" pasted together, and "Tote
  Giraffe" inflects differently. Each entry therefore carries what its language needs
  to inflect — for German the noun's GENDER beside the noun — and the composition is a
  pure function of (kind, age, state, language). Never build the string by
  concatenation at the render site.
  (c) RENDERING AND COST. Project through the live camera with the existing shared
  `isOnScreen` (the point-172 rule: the true frustum, never an assumed radius) and
  label only what is really drawn; cap the count at a calibratable nearest-N
  (`balance.labelOverlay.maxLabels`, debug-editable) so a crowded savanna stays
  readable and the frame does not fall over. Reuse the existing floating-label
  machinery of the map/region labels rather than inventing a second one, and mount the
  layer only while Ctrl is down — an idle hold-free frame must cost nothing.
  (d) THE KEY. Hold-to-show on keydown/keyup of Control. Do NOT preventDefault: the
  browser's own Ctrl combinations stay the browser's. Clear the layer on `blur` and on
  `visibilitychange`, and re-sync from the `ctrlKey` flag of the next input event —
  a release missed while the player alt-tabbed must never leave labels standing (the
  bug this rule exists to prevent). Holding Ctrl changes nothing else: no pause, no
  movement change, no focus shift. Touch and gamepad get no equivalent in this point.
  DOCS: design.md §17.8 and the §17.5 control line already state it; CLAUDE.md §7.1
  point 9 (status bar / HUD) gains the built behaviour when this lands.
  VERIFIABLE: pure — the qualifies predicate sweeps the FULL rosters (every fauna
  species in, every flora/dressing species out, map points out, a concealed crocodile
  out while hidden and in once it lunges); the text composition sweeps every (kind ×
  age × state) in BOTH languages for a non-empty, non-id string, and pins the four
  reported forms exactly ("Adult giraffe", "Dead giraffe calf", "Erwachsene Giraffe",
  "Totes Giraffen-Jungtier") plus a feminine/neuter pair proving the gender is really
  applied; the nearest-N cap keeps the nearest and drops the farthest. Component
  (`src/ui/`) — the layer renders on Ctrl down, disappears on keyup, and is cleared by
  a blur without a keyup. Live (`scripts/verify/enrichments.mjs` bird's-eye and
  `scripts/verify/polish.mjs` settlement, BOTH backends, with screenshots): holding
  Ctrl labels the animals in view and no plant, every label sits on an on-screen
  subject, and releasing clears every one.

- [ ] 343. THE SUN STANDS WHERE IT REALLY STOOD — ELEVATION FROM DATE AND LATITUDE
  (user 25.07.2026; design.md §2.7 states the target). Today `SUN_DIR` is a hard
  constant in BOTH scenes — `[0.5, 0.62, 0.38]` in `src/scenes/travel/TravelScene.tsx`
  and `[0.52, 0.68, 0.34]` in `src/scenes/place/PlaceScene.tsx`, an elevation of ~45°
  for the whole continent and the whole five-year window. The season only dims and
  reddens it. That is why the relief reads flat: at that angle a 3000 m massif throws
  ~3 km of shadow, about ONE DEM texel.
  TARGET: derive the sun's elevation and azimuth from the real solar geometry —
  declination from the DATE (the same date that drives §19.13) and the traveller's own
  LATITUDE — at a FIXED local solar hour. There is no time of day in this game and
  none is being added; the hour is a calibratable constant, `balance.sun.hour`,
  DEFAULT 16:00. That default is load-bearing and must not be "tidied" to noon: at
  local noon the sun stands 90° over the equator in March and 83° over Cairo in June,
  which casts no usable shadow at all, while at 16:00 the elevation runs about 7°-37°
  across the entire map and year (Cairo 37° June / 11° December, Cape Town 9° in its
  June winter). One hour later breaks it — at 17:00 the Cape sun in June is BELOW the
  horizon, and a fixed hour must never put the sun under the horizon anywhere in the
  world window (lat -37..38, all 365 days).
  EVERYTHING THE SUN FEEDS MUST FOLLOW IT, or the picture contradicts itself: the
  directional light AND its shadow camera in both scenes, the sky dome's disc and halo
  (`src/render/sky.tsx`, whose `sunDirection` must keep agreeing with the light — its
  own comment says so), and the baked environment light
  (`createEnvironmentTexture`/`IBL_SUN` in `src/render/Effects.tsx`), re-derived when
  the date or the position changes and NEVER per frame.
  THE SKY PRESETS ARE THE REAL WORK, not the arithmetic. They are authored for a high
  sun; a low sun under an unchanged noon-blue dome reads as a bug — the same failure
  the overcast handling already guards against (a dimmed sun under a bright blue sky,
  sky.tsx). The horizon must warm and redden as the sun drops. Judge this by the
  PICTURE on both backends, not by the uniform.
  WATCH THE SHADOW QUALITY at the low end: cascaded shadow maps degrade at grazing sun
  angles (long shadows, peter-panning, cascade seams). If the 7° end proves ugly, clamp
  the elevation used for the SHADOW camera to a calibratable floor while the visible
  sun keeps its true angle — and record that as a deliberate divergence, never silently.
  NOT A QUALITY LEVER: this is world model like the seasons and applies at EVERY
  graphics level. It adds no per-frame cost and gets no `QUALITY_PRESETS` key.
  DEBUG: the sun direction stays inspectable and the hour editable in the debug menu
  (§21.2), so a tester can walk the whole range without waiting for a date.
  VERIFIABLE: pure (`src/systems/`) — declination and hour angle produce the known
  elevations above (Cairo June/December, the equator at equinox, Cape Town June), the
  hemispheres invert across the year, and a SWEEP over the full world bounds × all 365
  days asserts the sun never falls to or below the horizon at the default hour (the
  17:00 counter-case is pinned as the witness that the bound is real); the azimuth is
  westerly in the afternoon for both hemispheres. Live (`scripts/verify/
  enrichments.mjs` + `polish.mjs`, BOTH backends, screenshots): the same place rendered
  in June and in December differs measurably in pixels and in shadow direction; a
  settlement's shadows agree with its sky-dome sun disc rather than pointing elsewhere;
  no console errors.
  DOCS: design.md §2.7 already states it; CLAUDE.md §7.1 point 14 gains the built
  behaviour when this lands.

- [ ] 344. EYE ADAPTATION AND SUN GLARE, HIGHEST QUALITY LEVEL (user 25.07.2026;
  design.md §2.7 states the target). BUILDS ON POINT 343 — before the sun is low there
  is nothing to be dazzled by, and with a 50° vertical field of view the first-person
  camera sees roughly -25°..+25°, so the 16:00 sun (6.7°..37°) sits IN FRAME whenever
  the traveller turns west over most of the map and year. Both halves belong in ONE
  point: they share the same tuning pass over the same image, and building them apart
  would mean turning the same dial twice.
  (a) EYE ADAPTATION — the effect the player reads as high dynamic range. The exposure
  follows the frame's mean luminance (from the HDR buffer's mip chain, not a CPU
  readback): facing the sun darkens the scene, turning into a lane's shade opens it up
  again. The range is BOUNDED and calibratable around today's fixed
  `toneMappingExposure` of 1.05 (`src/App.tsx`) — `balance.exposure.*`,
  debug-editable — and the two directions have their own time constants (brightening
  fast, darkening slow, as an eye does). A bounded controller, never free-running.
  FIRST PERSON ONLY. The bird's-eye view keeps its fixed exposure: design.md §2.7
  forbids post-processing that costs the map view its readability, and a map whose
  brightness breathes while driving is precisely that. This is a rule, not a
  performance choice — do not "unify" the two scenes.
  (b) GLARE. The sun disc in `src/render/sky.tsx` (`disc = pow(s, 1200) * 3.0`) must
  sit clearly above the bloom threshold so it blooms on its own, plus the upstream
  `three/addons/tsl/display/LensflareNode.js` WITH an occlusion test: a hut wall or
  roof edge moving in front of the sun kills the glare in the same frame. Without that
  test the flare survives its occluder and reads as a sticker on the lens — the single
  detail that separates a convincing glare from a cheap one.
  QUALITY: highest level only, with entries for all three levels in `QUALITY_PRESETS`
  (`src/config/quality.ts`) and `docs/graphics-detail-levels.md` updated in the same
  commit — the completeness gate and the doc-sync test both fail otherwise.
  ESTIMATED COST ~0.3-0.8 ms; the real number comes from F8 on the user's hardware.
  VERIFIABLE: pure — the exposure controller maps luminance to a target within its
  clamp, converges from both directions, honours its asymmetric time constants and
  cannot run away from a black or a blown-out frame; the preset completeness and doc
  sync cover the new keys. Live (BOTH backends, screenshots): in a settlement facing
  the sun the rendered frame's mean brightness FALLS within a bounded number of frames
  and recovers when the traveller turns away — measured in PIXELS, never in the
  uniform (the §7.2 lesson that three rounds of uniform-level checks once passed while
  the player saw nothing); the glare is present with the sun in the open and gone with
  a building between; and in the bird's-eye view a driven pass leaves the exposure
  UNCHANGED, which is the readability guard's own witness.
  DOCS: design.md §2.7 already states it; CLAUDE.md §7.1 point 14 gains the built
  behaviour when this lands.

- [ ] 345. SUN SHAFTS THROUGH WHAT STANDS IN THE WAY, HIGHEST QUALITY LEVEL (user
  25.07.2026). With the low afternoon sun of point 343, a palm crown, a roof edge, the
  Djinguereber minaret or the Giza pyramids finally have something to cast shafts
  through. Wire the upstream `three/addons/tsl/display/GodraysNode.js`
  (`godrays(depthNode, camera, light)`) into the post chain in `src/render/Effects.tsx`
  beside the existing GTAO/bloom/TRAA nodes.
  FIRST PERSON ONLY, and for a reason worth writing down: screen-space godrays need
  the light IN the frame, and the bird's-eye camera looks ~60° down while the sun
  stands at most 37° up — it is never in that frame. Wiring the pass there would cost
  milliseconds for an effect nobody can see. Do not enable it in the travel scene.
  QUALITY: highest level only, entries for all three levels in `QUALITY_PRESETS` plus
  `docs/graphics-detail-levels.md` in the same commit.
  THIS ONE IS PRICED BEFORE IT IS KEPT. It is the only effect in this family with a
  real per-pixel cost (estimated +1.5-3 ms; on the measured S25 baseline of ~12.6 ms
  GPU that is +12-25 %). Run F8 on the user's hardware BEFORE and AFTER on the same
  build and record both digests in the commit. If the cost is not worth the picture,
  the point is closed by REMOVING the pass and recording the measurement — that is a
  legitimate outcome, exactly as the SSR removal was, and it must not drag point 344
  with it.
  VERIFIABLE: pure — the preset completeness gate and the doc-sync test cover the new
  key; the pass is absent from the travel scene's chain by construction. Live (BOTH
  backends, screenshots): in a settlement with the sun behind a roof edge, the pixels
  along the sun direction brighten measurably against the same frame with the level
  stepped down — judged on the image, not on the flag; no console errors; the F8
  before/after numbers are recorded.

- [ ] 346. HORIZON MAPS BAKED FROM THE DEM — SELF-SHADOWING AND SKY OCCLUSION AT
  PLANETARY RANGE (user 25.07.2026; design.md §2.7 states the target). A new offline
  step beside `scripts/build-geodata.mjs` measures, per DEM texel, the HORIZON ANGLE —
  how high the land rises around that point — and the terrain shader reads it. Two
  effects out of one bake: the land SHADES ITSELF far beyond any shadow map's reach,
  and every hollow sees less sky than the ridge above it and is lit accordingly.
  IT ONLY PAYS BECAUSE OF POINT 343, and depends on it: at the old fixed ~45° sun a
  3000 m massif threw ~3 km of shadow, about one DEM texel. At the 16:00 sun's low end
  (~9°) the same massif throws ~19 km — nearly seven texels, visible terrain shading
  across the view.
  THE ALGORITHM IS THE WHOLE FEASIBILITY QUESTION. Naive ray marching is 8.8 M texels ×
  directions × ~100 steps ≈ billions of samples and is not an option in Node. Use the
  standard horizon SWEEP (per direction, march the grid line by line keeping a monotone
  stack of candidate horizons), which is linear in texels — seconds, not hours. Pin the
  sweep against a brute-force reference on a SMALL patch in the tests: that comparison
  is what proves the fast path correct.
  ONLY SIX DIRECTIONS ARE NEEDED, and the reason is worth keeping: because the hour is
  FIXED (point 343), the sun's azimuth never leaves a 74° westerly arc — 233°..307°
  over the entire map and every day of the year. Bake that arc at ~15° steps (6 slices)
  plus ONE direction-averaged sky-occlusion channel; a full circle would be wasted
  storage. The fragment interpolates between the two slices bracketing the current
  azimuth.
  IF THE DEBUG HOUR LEAVES THE ARC (the `balance.sun.hour` field of point 343 is
  editable), the shading must CLAMP to the nearest baked slice and say so through the
  dev channel — never silently shade from the wrong direction. Pure-test that clamp.
  ASSET BUDGET, to be settled by the PICTURE and recorded: 7 channels (6 + occlusion)
  in two RGBA textures. At half DEM resolution (1460×1500, ~6 km per texel) that is
  ~17.5 MB raw, roughly 5-9 MB as PNG; at quarter resolution ~4.4 MB raw, ~1.3-2.2 MB.
  Start at half, and drop to quarter if the download budget bites — today's whole
  `dem.png` is 6 MB, so this may not dwarf it. Horizon angles are low-frequency and a
  soft, kilometre-scale shadow edge is physically right, so a coarse map is not a
  compromise in the way a coarse shadow map would be.
  SCOPE: the bird's-eye TERRAIN only. Settlements have their own local scene and ground
  and are untouched.
  QUALITY: on at MEDIUM and HIGH, off at LOW — and at low the extra textures are NOT
  FETCHED at all, since the runtime cost is one texture lookup but the download and
  video memory are what a weak device actually cannot afford. Entries for all three
  levels in `QUALITY_PRESETS` plus `docs/graphics-detail-levels.md` in the same commit.
  THE FETCH IS GATED ON THE EFFECTIVE LEVEL, not merely the use of the result: at low
  the request is never issued, so a `?quality=low` link (point 347) costs the player
  those megabytes NOTHING — the whole reason that link exists. The gate must therefore
  sit at the request, never at "load it and ignore it". Two consequences to build for:
  the load is LAZY and keyed on the level, and RAISING the level at runtime (F9, the
  debug picker) fetches the maps then and applies them when they arrive, without
  blocking the frame or stalling the level switch. Pure-test both directions — no
  request at low, exactly one request when the level rises, and none again on a second
  rise.
  DOCS: design.md §2.7 already states it; the preprocessing must be documented
  reproducibly like the existing geodata pipeline (§7.1 point 13), and CLAUDE.md §7.1
  point 14 gains the built behaviour when this lands.
  VERIFIABLE: pure — the sweep matches a brute-force horizon reference on a small
  synthetic patch (a cone, a ridge, a flat plain: a flat plain yields horizon 0 in
  every direction, a wall yields the analytic angle); the azimuth arc actually covers
  every (latitude, day) the game can produce, with a case just outside it clamping and
  reporting; sky occlusion is monotone (a pit is more occluded than the ridge beside
  it); the preset completeness and doc-sync gates cover the new keys. Live
  (`scripts/verify/enrichments.mjs`, BOTH backends, screenshots): at a massif with the
  low-sun date, the ground on the sun-facing side reads measurably brighter in PIXELS
  than the ground in its lee at the same elevation band, and that contrast is FLAT with
  the quality level stepped to low — the effect is judged on the image, never on the
  flag; no console errors; the build step is reproducible from a clean checkout.

- [ ] 347. THE STARTING QUALITY LEVEL FROM THE URL (user 25.07.2026; design.md §21.1
  states the target). `?quality=low|medium|high` on any deployment URL — the GH-Pages
  root, `/poc/`, a `/vX.Y/` folder — opens the session at that level, so a link handed
  to someone whose hardware is known already fits it. Case-insensitive; an unknown,
  empty or missing value leaves the ordinary default (`medium`) standing without any
  player-visible complaint.
  FOLLOW THE EXISTING IDIOM, do not invent a second one: a PURE parse function beside
  `benchmarkFromUrl` (`src/systems/startBenchmark.ts`) taking the raw `location.search`
  and returning a `DetailLevel | null`, with the call site applying it.
  APPLY IT BEFORE THE FIRST FRAME, not after mount. `detailLevel` is NOT persisted
  today (no localStorage in `src/state/ui.ts`), so this is purely the initial value —
  but setting it from an effect after the first render would draw a frame at medium and
  then rebuild the whole post chain and shadow maps, a visible hitch on exactly the
  weak hardware the low link is meant for. Seed the store's initial state from the URL.
  AND IT DECIDES DOWNLOADS, not just looks. Level-gated ASSETS — the horizon maps of
  point 346 are the first, several megabytes of them — must see the URL level before
  they decide whether to fetch. A `?quality=low` link that still pulls the high-level
  assets and then ignores them would defeat its own purpose on the exact connection it
  was sent to. Whichever of the two points lands second must verify this pairing:
  loading with `?quality=low` issues NO request for a level-gated asset.
  DELIBERATELY UNCHANGED: the touch preset (§17.5) still applies its own subset-of-low
  flags when the touch layer arms, even if the URL asked for high. That is the existing
  rule — the preset is tied to the touch layer, not to a guess about the device — and a
  URL parameter is not a reason to break it. Do not "fix" this.
  NO TOAST. F9 announces a CHANGE; a URL-set level is the session's starting default
  and announces nothing.
  VERIFIABLE: pure — the parser sweeps the three level names, mixed case, an unknown
  value, an empty search, a search carrying other parameters (`?bench=short&quality=low`
  in either order), and a repeated parameter, returning null wherever the value is not
  a level. Component/live — a page loaded with `?quality=low` has the low preset in
  effect on its FIRST rendered frame (assert through an effective selector, e.g. sun
  shadows off, not the raw field), `?quality=high` likewise, and no console errors.
  DOCS: design.md §21.1 already states it; name the parameter in the README's play
  links if that file lists them, so the shareable form is discoverable.

- [ ] 348. THE VILLAGE FIRE IN THE RAIN (user 25.07.2026, screenshot: the Zulu village
  under visible rain, the §19.10 fire burning uncovered in the open with the
  inhabitants standing around it as if the weather were not happening). Point 142
  already made the fire answer to a place's own COLD, harmattan and karif; RAIN is the
  driver it never got, and rain is the one that contradicts the picture outright — an
  open fire in the open does not burn through a downpour.
  TWO MORE FAULTS IN THE SAME OBJECT, reported 27.07.2026 with a screenshot of the
  Mbuti village under rain, and they must be fixed WITH the rain behaviour rather than
  after it — a shrinking flame that keeps them would only shrink the fault:
  (a) THE FLAME FLOATS. A fire reduced by the weather still stands ON the ground: its
  base sits in the hearth, on the fire pit's own surface, at every size the rain rule
  produces. Whatever scales it must scale it about its base, not its centre — check the
  full range the rule can reach, including the smallest, because the gap grows as the
  flame shrinks.
  (b) THE VILLAGERS WALK THROUGH IT. The fire needs a collider — the user's own
  suggestion, and the right one: the hearth plus a calibratable clearance radius
  (a `balance` value, debug-editable) joins the settlement's collider set, so inhabitants
  path AROUND it and the player cannot stand in the flames either. The §2.6 rule that no
  walker may be trapped applies: adding an obstacle in the middle of a yard must not
  strand anyone, so the errand-target validation runs against the widened set.
  VERIFIABLE for both: pure Vitest — the flame's base stays at hearth height across the
  whole scale range (the floating case fails before the fix), and the hearth collider is
  in the set every walker path is validated against, with no walker target left inside
  it; live, one first-person frame in the rain showing flame on ground, and a walker
  observed pathing around the hearth rather than through it.
  RESEARCH FIRST, then build — this is a people question, not a graphics question.
  Establish from `docs/peoples-1890.md` (extending it where it is silent) where each
  people's cooking fire actually SAT around 1890: a hearth inside the dwelling, a
  roofed cooking shelter beside it, or an open yard fire. The Zulu case in the
  screenshot is the likely "hearth inside the hut" reading, but it must be confirmed
  rather than assumed, and the answer will differ by people.
  THEN THE BEHAVIOUR, decided per people from that evidence — the §19.13 dress rule is
  the model to follow (six peoples change their dress on real evidence, sixteen do not;
  a blanket rule for all would be the invention this project refuses): under rain past
  a calibratable intensity, a village either shelters its fire under a structure that
  people REALLY built there, or the yard fire is out and the life vignette moves under
  cover — inhabitants inside or under the eaves, the fire relit when the rain passes.
  DO NOT put a generic canopy over every village fire. A shelter that no one there
  built is the same class of error as a garment no one there wore.
  KEEP: the point-142 cold/harmattan/karif behaviour, and the §19.10 vignette's normal
  dry-weather life, entirely unchanged.
  DOCS in the same commit: design.md §19.10 and §19.13 gain the rain driver;
  `docs/peoples-1890.md` gains the hearth/shelter evidence AND its implementation
  section is updated in the same commit (the standing rule that research and the game
  table never drift apart).
  VERIFIABLE: pure — every people in the roster has a DECIDED rain behaviour (the sweep
  fails on a people nobody decided about, exactly as the dress sweep does); the rain
  threshold is a calibratable, debug-editable value and the transition is deterministic;
  a village whose people keep an indoor hearth shows no yard fire under rain, and lights
  it again when the rain stops. Live (`scripts/verify/polish.mjs`, BOTH backends,
  screenshot): the Zulu village forced into heavy rain shows the decided state rather
  than an uncovered burning fire, and the same village in dry weather is unchanged from
  today.

- [ ] 349. THE ROOF CLIPS THE CAMERA UNDER THE EAVES (user 25.07.2026, screenshot from
  the Zulu village: standing under a hut's overhanging roof, the near plane cuts into
  the roof — the underside fills the view with a hard horizontal edge and open sky
  above it). The §2.6 clearance rule (§7.1 point 16) was written for WALLS: "pressing
  against a building must never show its inside", and the collider is the wall body.
  The OVERHANG is the gap — it reaches out over ground the player may legitimately
  stand on, and at the 1.5 m eye height the roof underside can sit below the camera's
  near plane.
  DO NOT FIX IT BY FENCING THE EAVES OFF. Standing under an overhang out of the rain is
  exactly what an eave is for, and point 348 may well want the inhabitants there.
  TARGET — the same kind of invariant the walls already have, extended upward: over
  EVERY spot the player can stand, the lowest roof surface above him clears the eye
  height plus the camera's near plane plus a margin. Where a roof's outer rim is lower
  than that, either the rim is raised or the collider is extended so that the low strip
  is not standable — decided per building type, and the roofs that read right today
  must not be reshaped for it.
  CHECK THE SURFACE ITSELF WHILE THERE: a roof seen from below must be a real surface,
  not a back face one can see through. If any roof is single-sided, give it an inner
  face or render it double-sided.
  ANCHORS: the hut/roof builders and the collider set in `src/scenes/place/` (the
  layout and collision modules that already pin door reachability and window
  clearance), and the eye height / near plane in the first-person camera setup.
  VERIFIABLE: pure (`src/scenes/place/layout.test.ts` or the collision test beside it) —
  for every place, every building type and several seeds, the minimum roof-underside
  height over the standable area is at least eye height + near plane + margin; a
  deliberately lowered rim FAILS the test (the regression witness). Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the player walked to the
  eaves of a hut in a village AND in a port sees the roof from below as a solid
  surface, with no sky wedge and no view into the interior; no console errors.

- [ ] 350. THE KNEELING VILLAGER IS A SQUASHED VILLAGER (user 25.07.2026, deployed
  build: a figure in the Zulu village alternates between normal and visibly FLATTENED).
  ROOT CAUSE, already located: `Figure` in `src/scenes/place/PlaceLife.tsx` fakes
  kneeling with a NON-UNIFORM vertical squash — `scale={[scale, scale * (kneel ? 0.75 :
  1), scale]}` (line ~60) on top of a shortened body cone (`bodyH = kneel ? 0.55 : 1.0`).
  The squash applies to the WHOLE figure, the head included, so the head reads as a
  flattened ellipsoid: kneeling shortens the legs, it does not compress the skull. And
  the alternation the user sees is `TaskWalker` (line ~496) swapping the standing and
  kneeling groups by VISIBILITY when it starts and ends its work at the well — an
  instant pop between two different-looking figures.
  TARGET: a kneeling pose built from PROPORTIONS, not from a vertical scale. The lower
  body folds (a shorter, wider base) and the whole figure sits lower, while the head and
  every other part keep their true shape — the group's scale stays UNIFORM. And the
  transition reads as a movement rather than a swap: the figure lowers into the pose and
  rises out of it over a short, calibratable time, so no frame shows one figure replaced
  by another. Every user of `kneel` gets it — the cook, the fire tender and the errand
  walker at the well.
  VERIFIABLE: pure (`src/render/figures.test.ts` or a test beside it) — the kneeling
  build applies no non-uniform scale (x, y and z factors equal) and its head radius
  matches the standing figure's, while the pose is genuinely lower (a bounded overall
  height reduction); the standing build is unchanged. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): across the frames in which a
  task walker starts and finishes its work, no single frame changes the figure's
  rendered height by more than the transition's per-frame step — the pop is what the
  check is for.

- [ ] 351. THE VILLAGE CHILDREN PLAY A GAME OF TAG (user 25.07.2026). They run wild
  through the settlement, around the huts and past the fire. One of them is IT and
  chases the others; whoever is caught becomes the new IT and must catch someone else.
  Any number plays — one chaser and every other child in the group. That is what the
  §19.10 village life is for: figures visibly doing something, not following a path.
  A PATH IS NOT A GAME, and this is the design point the build must not undo: any fixed
  route — a ring around the well, an orbit at a set radius, a tour of waypoints — is
  periodic, and the eye recognises it within two passes. A chase is not periodic because
  its target REACTS. Do not implement it as a path with a moving centre.
  THE CHASE. The chaser continuously targets the NEAREST catchable runner, so it switches
  opportunistically when someone crosses its path — the way children really play, and the
  difference between a game and one long pursuit of a distant child. Runners steer away
  from the chaser, preferring open ground. On a catch, within a small calibratable
  distance, the caught child becomes the chaser.
  STAMINA IS WHAT MAKES IT LEGIBLE, and it is the heart of the mechanic rather than a
  flourish. Every child carries a sprint reserve that drains while running flat out and
  refills at a trot or standing. A runner who has spent it slows and is run down — so a
  catch happens for a reason the viewer can SEE, instead of the round being cut short
  from outside.
  THE TOP SPEED FADES, IT DOES NOT SNAP. The pace a child can hold is a CONTINUOUS
  function of what is left in its reserve — full sprint while fresh, tapering as the
  reserve empties, reaching the floor pace only at empty. A child therefore visibly runs
  out of steam over seconds, the way a real one does, and the moment of catching up is a
  gradual closing rather than a step change nobody can miss reading as a switch.
  KEEP THE TWO MECHANISMS APART, because collapsing them is the obvious mistake: the
  CURVE governs what a child CAN do, the two thresholds govern what it CHOOSES to do
  (press on, or break off and recover). By the time the low threshold sends it into
  recovery it is already visibly slower — the decision confirms what the picture has
  been showing, instead of announcing it.
  THE SPRINT IS SPENT DELIBERATELY, NEVER CONTINUOUSLY. A child that always runs at
  whatever its current maximum is can never recover, and a chaser who empties its
  reserve once would stay a hopeless trotter for the rest of the round — the game would
  be over without ending. So both roles PACE themselves: a runner sprints only while the
  chaser is inside a pressure distance and trots when the gap is comfortable; a chaser
  sprints only while it is actually closing on a target within reach, and cruises
  otherwise. Sprinting is a decision, not the default.
  AND RECOVERY IS ITS OWN INTENTION. Below a low reserve a child BREAKS OFF and moves at
  a deliberate recovery pace — slow enough to actually refill, which the pressure rule
  above must not override — until its reserve passes a higher resume threshold. Two
  thresholds, not one: a single boundary would flicker between pressing and recovering
  frame by frame, the same hysteresis the animals' dodge and guard states already use.
  For the chaser this reads as the most human moment of the whole game: it gives up the
  pursuit, trots and puffs, then picks a fresh victim and bursts again.
  Speeds, drain and recovery rates, the pressure distance and both thresholds are
  calibratable (`balance.villageLife.*`, debug-editable). Two shaping rules: a floor
  below which the pace never falls while a chase runs — a child frozen mid-game reads as
  a bug, a trotting one reads as winded — and per-child variation in reserve and
  recovery, so the group never tires in unison.
  HOW IT READS, given the figures the game has: the villagers are cones with sphere
  heads and NO legs (only the fauna and the §2.5 silhouettes have a stride), so the
  sprint cannot be shown by leg cadence. It is carried by SPEED and POSTURE — a forward
  lean while sprinting, upright and near-still while recovering. Giving human figures
  legs is NOT part of this point.
  USE THE WILDLIFE STEERING, NOT THE WALKER SLIDE. The village walkers resolve obstacles
  by sliding along a collider and stopping — which is exactly what reads as bumping into
  things. `deflectedStep` (`src/scenes/travel/wildlifeBehavior.ts`, used by every fleeing
  animal) probes around the heading and CONTINUES the run past an obstacle. A chase wants
  that one, and reusing it is why this behaviour is small rather than large.
  FOUR FAILURE MODES THE BUILD MUST CLOSE, each a lesson this project has already paid
  for elsewhere:
  (1) INSTANT RE-TAG. Without a guard the two children swap the role every frame and
  stand jittering together — and with several players it would keep the game visually a
  two-child affair while the others idle. The new chaser owes the freshly-tagged child a
  short calibratable immunity and turns away before resuming: the same hysteresis that
  keeps the animals' dodge and guard states from flapping.
  (2) STICKING ON GEOMETRY. A chase pinned on a hut corner is worse than the bumping it
  replaces; the deflected step plus a nudge keeps them running.
  (3) LEAVING THE PLAY AREA. Children stay inside the walkable settlement, out of the
  fire ring, and never inside a collider — playing must not become a way to stand where a
  walker may not.
  (4) A GAME THAT NEVER RESOLVES. Stamina is what normally ends a round; a hard cap
  remains only as the backstop for the §19.8 house rule that nothing runs forever, after
  which the group breaks off into ordinary idling for a while before starting again.
  KEEP UNCHANGED: the adults' errands, and the point-155 guarantees (an errand target
  needs a clear standing circle and an escape direction; a pinned walker is nudged free
  after its window).
  A BY-PRODUCT worth noting in the commit: pursue-and-evade with stamina is reusable — a
  goat bolting from someone, a dog in a port — so keep it a helper rather than burying it
  in the children.
  BUILT UNDER FOUR EYES (user 25.07.2026): the PLAN is reviewed by the second model
  before any code is written, and the IMPLEMENTATION is reviewed after. Several
  interacting continuous quantities (reserve, curve, two thresholds, pressure distance,
  immunity window) plus a role that moves between figures is precisely the shape in
  which rare states hide.
  THE TEST SCENARIOS ARE DESIGNED TWICE, INDEPENDENTLY, AND THEN UNITED (user
  25.07.2026) — not written by one model and reviewed by the other. A reviewer handed a
  finished list checks THAT LIST; it anchors on what it is shown and produces far less
  than it would have from a blank page. So:
  (a) Each model designs its OWN complete set of test scenarios from the same inputs —
  this specification and the code anchors — and each set is written to its author's own
  standard of completeness, as if it were the only one.
  (b) Neither sees the other's set, or any hint of it, until both are finished. A set
  produced after glimpsing the other is not an independent set and must be discarded.
  (c) The two sets are then merged into a UNION with duplicates removed. Deduplication
  is by MEANING, not by wording — two scenarios describing the same state in different
  words are one — and where it is genuinely unclear whether one subsumes the other, BOTH
  are kept. Erring toward keeping is cheap; erring toward merging loses exactly the rare
  case this method exists to find.
  (d) A scenario that only ONE model thought of is the most valuable item in the whole
  set. Those are marked as such in the merged list rather than buried, and none may be
  dropped for being unusual — being unusual is the point.
  (e) The scenarios in the union are then implemented as the tests.
  THE EDGE CASES BELOW ARE A FLOOR, NOT THE SET. They are already known, so both models
  start from them — but a set that merely restates them has added nothing, and each set
  is judged by what it contributes BEYOND this floor: a child caught WHILE
  recovering; a catch landing exactly on the immunity boundary; two catches resolving in
  the same frame; the group shrinking to two, and to ONE — the transhumant villages of
  point 142 thin seasonally, so the player count genuinely changes with the calendar and
  a lone child must fall back to ordinary idling rather than chase itself; a runner
  cornered between huts with the chaser closing; the player standing in the path or
  walking through the game; a chase running while the season, the rain or the day
  changes underneath it; and the scene being left mid-chase.
  ARM AN INVARIANT, do not rely on tests alone. The dev assert channel (point 207(i),
  `devAssert`) turns every session — including the user's own play — into a detector for
  exactly the rare cases tests miss. Assert continuously: exactly ONE chaser exists in a
  playing group, no child stands inside a collider or outside the walkable radius, the
  reserve stays within its bounds, no child holds the chaser role past the resolve cap,
  and no child is stationary below the floor pace while a chase is running. A violation
  reports itself in the console with the state that produced it, so a debug report names
  the situation instead of describing a feeling.
  VERIFIABLE: pure — the reserve drains only at sprint pace and refills below it, never
  leaves its bounds, and the pace never drops below the floor while a chase runs; the
  speed cap is MONOTONE in the reserve and CONTINUOUS — full sprint at full, the floor at
  empty, and no jump between neighbouring reserve levels larger than a bounded step, so a
  snap cannot creep back in; a
  spent runner is strictly slower than a fresh chaser (so a catch is reachable) while a
  fresh runner is strictly faster (so it is not immediate); a child driven to empty
  RECOVERS: simulated forward under constant pressure it drops to its recovery pace,
  its reserve rises past the resume threshold and it sprints again — the exhausted-
  forever case is the regression witness, and the two thresholds are boundary-tested so
  no state flickers between them; the role swap grants immunity
  for its window and cannot re-tag inside it (boundary-exact); the chaser's target is the
  nearest catchable runner and never the immune one; a child's step never enters a
  collider or leaves the walkable radius. Live (`scripts/verify/polish.mjs`, BOTH
  backends, screenshot): over a sampled interval the children's paths are NOT periodic —
  their headings cover a wide spread rather than circling — the distance between chaser
  and nearest runner rises and falls repeatedly, the chaser's identity changes at least
  once, and at least one child is seen slowing to recover; no child is pinned against
  geometry and none stands still for the whole interval.

- [ ] 352. THE SETTLEMENT EDGE PAINTED ON THE GROUND (user 25.07.2026; design.md §2.6
  states the target). In the first-person view the boundary is invisible until crossing
  it swaps the scene. Show it in the ground itself: the swept, trodden earth of the
  settlement giving way to open land across a soft band.
  IT MUST NOT LIE. The band sits at the SAME radius the leave check uses — `layout.radius`
  in `src/scenes/place/PlaceScene.tsx` (`if (Math.hypot(p.x, p.z) > layout.radius)`) —
  read from that one source, never a second constant that can drift from it. A visible
  edge in the wrong place is worse than none, because the player will trust it.
  QUIET, AND OF THE WORLD. A tonal and textural change in the ground — swept earth
  inside, open ground outside — not a drawn ring, not a glow, nothing a traveller of
  1890 would not have seen underfoot. The outline WANDERS slightly instead of describing
  a machined circle: reuse the domain-warp the biome borders already use (§3.3) rather
  than inventing a second noise. The wander is bounded so the visible band never departs
  from the true radius by more than a small tolerance — it may look natural, it may not
  mislead.
  EVERY PLACE KIND: village, port and the Giza monument site. Keyed on `PLACE_KINDS`
  totality (point 335) so a fourth kind cannot compile without deciding about it.
  SEASON-PROOF: the ground bleaches and greens with the season through the baked seasonUV
  field (§19.13), so the edge must stay readable at BOTH ends of the year rather than
  vanishing into the dry-season straw.
  NO QUALITY KEY, and the reason belongs in the commit: this is a term in the ground
  material that is already drawn, not a pass — it has no measurable cost, like the sun
  model of point 343 and unlike the effects that earn a `QUALITY_PRESETS` entry.
  VERIFIABLE: pure — the band's radius derives from `layout.radius` for every place in
  the roster (change the layout radius and the band follows), the warp stays within its
  bounded tolerance at every sampled angle, and the kind sweep covers all `PLACE_KINDS`.
  Live (`scripts/verify/polish.mjs`, BOTH backends, screenshots): standing inside a
  village near the edge, a ground crop AT the boundary differs measurably in pixels from
  a crop well inside and from one outside; the same holds in a port and at the monument
  site, and in both a dry and a wet month; walking straight over the visible band is
  the frame in which the place is left — the truth check; no console errors.

- [ ] 353. SHELTERED GROUND STAYS LESS WET (user 25.07.2026). In the rain the whole
  settlement floor darkens uniformly, so the earth under a roof overhang or a tree crown
  soaks exactly like the open yard. Make wetness SPATIAL — and less, not none: ground
  under cover reads drier than the open ground around it, but never bone dry, because
  wind-blown rain and splash reach under every eave (the user's own correction, and the
  realistic reading).
  WHY IT IS CHEAP, and the reason to build it this way: a settlement's roofs and trees
  do not move. The coverage is therefore computed ONCE when the place is built — a
  shelter mask over the ground disc, derived from the layout's known building footprints
  with their roof overhangs and the tree crown radii — not per frame and not per fragment
  against a list of obstacles. Prefer that CPU bake over a top-down depth pass: it needs
  no extra render target, and it is pure-testable, which a GPU pass is not.
  THE COMBINATION: the existing global ground wetness (`setGroundWetness` /
  `groundWetnessFactor`, wired through `src/render/seasonTint.ts` and the season module)
  is multiplied by the mask through a calibratable `balance.rain.shelterStrength` that is
  strictly BELOW full, so full cover reduces the wetness without ever reaching zero.
  Edges are soft — a hard-edged dry disc under a tree would look worse than the uniform
  wetness it replaces.
  THE DRIP LINE, if it comes cheap: just OUTSIDE the eaves the runoff makes a band
  WETTER than the open ground. It is the detail that sells the whole effect, and it is
  the same mask read at its gradient. Calibratable; drop it rather than fake it.
  KEEP: dry weather completely unchanged — with no rain the mask must make NO visible
  difference anywhere.
  A USEFUL BY-PRODUCT to note in the commit: this same mask answers "is this spot under
  cover", which is what point 348 needs to move village life under a roof.
  NO QUALITY KEY: a one-time bake plus a texture lookup in a material already drawn, like
  point 352 — record the reasoning rather than adding a lever for nothing.
  VERIFIABLE: pure — the mask built from a layout with one hut is high under the roof
  footprint, falls off across a soft margin and is zero well outside it; a tree crown
  produces the same under its radius; the combined wetness at full shelter is strictly
  between zero and the open-ground value (the "less wet, not dry" rule, boundary-tested),
  and equals the open value everywhere when the shelter strength is zero. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): in a village forced into
  rain, a ground crop under a hut's eaves reads measurably lighter in PIXELS than a crop
  in the open yard, while in dry weather the two crops match — judged on the image, not
  on the uniform.

- [ ] 354. RAIN FALLS FROM A BRIGHT BLUE SKY IN THE SETTLEMENT (user 25.07.2026,
  deployed build: the Zulu village on 03.01.1890 — high summer rains — with clear rain
  streaks against an almost cloudless blue dome). Under rain the sky must read heavy.
  THE MECHANISM EXISTS AND IS WIRED, which is what makes this worth a careful look
  rather than a quick tint: `PlaceScene.tsx` computes `skyOvercastParams(wet, strength)`
  each frame and calls `setSkyOvercast(grayMix, cloudBoost)`, and the parameters are
  substantial at that date — `grayMix = 0.75 × wetness × weatherStrength`, with the same
  wetness that is visibly producing the rain streaks. So the numbers say overcast while
  the picture says blue. DIAGNOSE WHERE THE VALUE IS LOST before changing any constant:
  candidates are the uniform not reaching the PLACE dome's material instance (the travel
  dome and the settlement dome are separate mounts), `balance.season.weatherStrength`
  sitting low, the gray being mixed under a base colour that dominates it, or the cloud
  deck not thickening at all — the screenshot shows essentially no cloud despite a
  `cloudBoost` of the same magnitude. Name the actual cause in the commit.
  THE TEST DID NOT CATCH IT, AND THAT IS THE SECOND HALF OF THIS POINT. The settlement
  season checks in `scripts/verify/polish.mjs` assert on the VALUES behind
  `__placeSeason()` — "the rains gray the settlement dome and thicken its cloud deck"
  compares numbers, not pixels. They are green while the player sees a blue sky. This is
  the exact failure the project already recorded once for the seasons (point 147: three
  rounds of uniform-level checks passed while the player saw nothing), and the remedy is
  the one that worked there — MEASURE THE PICTURE. Replace or supplement those
  assertions with a pixel comparison of the same sky region in a dry month and in a wet
  month at the SAME settlement, the way the travel ground already proves its season
  (screenshots 115/116). A parameter assertion may stay as a supporting check; it may not
  be the evidence.
  KEEP: the dry-season sky unchanged, the §19.13 thunderstorm flash and the harmattan
  dust dome (their own axis, not the wet gray) untouched, and the rain streaks as they
  are — the streaks are not the complaint.
  VERIFIABLE: pure — `skyOvercastParams` keeps its curve (already tested); a new test
  pins whatever wiring turns out to be broken, so it cannot silently return. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshots): a crop of the SKY above the
  horizon at one settlement is measurably darker and less saturated in its wet month
  than in its dry month, and the difference is large enough that a person would call it
  overcast; the existing dry-month picture is unchanged.

- [ ] 355. BLIND PARALLEL WORK AS THE GENERAL FOUR-EYES MECHANISM (user 25.07.2026).
  Establish what point 351 tries in one place as the project's standard way of running
  the four-eyes principle, and write it into the German analysis documents.
  THE METHOD: for a GENERATIVE stage, both models work from the same inputs to their own
  complete result, neither seeing the other's until both are done; the two results are
  then merged into a union with duplicates removed BY MEANING, keeping both wherever it
  is unclear that one subsumes the other; an item only one model produced is marked
  rather than buried, and none is dropped for being unusual.
  THE REASON, and it belongs in the documents because it is what makes the method worth
  its cost: a reviewer handed a finished list CHECKS THAT LIST. It anchors on what it is
  shown and produces far less than it would have from a blank page — so review is the
  wrong instrument whenever the risk is the item nobody thought of.
  THE SCOPE LIMIT IS PART OF THE RULE, or it will be applied where it cannot work.
  Blind-parallel fits DIVERGENT stages — what could go wrong, which scenarios to test,
  which designs are possible, where a system might break. It does NOT fit CONVERGENT
  ones: "is this diff correct", "does this implementation match its spec", "is this
  measurement sound" all judge a specific artefact, which cannot be produced twice
  independently. Those keep the ordinary review — with one borrowed refinement: the
  reviewer reads the ARTEFACT before the author's rationale, so it is not anchored by
  the justification either.
  WHO THE SECOND AUTHOR IS MATTERS, and the rule says so: the two sets are worth what
  their errors are UNCORRELATED. Two runs of the SAME model, kept blind from each other,
  are independent in what they saw but not in how they think — they sample different
  paths through the same prior, which is a genuine second look and no more. Two
  DIFFERENT models are independent in both, and that is where the method earns its
  cost. So cross-model is the default pairing (§6 allowlist); same-model blind parallel
  is the acceptable fallback when the second model is unavailable, recorded as the
  weaker variant rather than passed off as the full method. WHEN THAT FALLBACK IS USED,
  DECORRELATE BY FRAMING rather than trusting sampling noise: give the second run a
  deliberately different vantage — a hostile tester, a maintainer inheriting the code, a
  player trying to break it — because a re-run of the same prompt varies most where the
  model is unsure and least where it is confidently blind, which is the wrong way round.
  COST AND WHEN IT APPLIES: the generative stage runs twice, so roughly double for that
  stage. It therefore applies where four-eyes already applies by the criticality triage
  (point 298), not everywhere.
  ONE AUTHORITATIVE PLACE, and this point must not repeat the mistake its own
  retrospective records — the model rule once stood in six places and retracting it cost
  more than establishing it had. The NORMATIVE text goes in CLAUDE.md §6 beside the
  existing four-eyes definition (which currently reads "one model plans and/or builds,
  the other reviews" and needs to become the two-mode rule); everything else REFERS to
  it:
  - `docs/analysis_de/vibe-coding-anleitung.md`: extend the EXISTING four-eyes tip
    rather than adding a second one, in the reader's register, and carry the cost marker
    convention already used there (this is a roughly 2x tip for the affected stage).
    Respect the document's word budget — make room by tightening, not by raising it.
  - `docs/analysis_de/retrospektive-zusammenarbeit.md`: record the LESSON (anchoring,
    and why divergent and convergent stages need different instruments) in the register
    of the surrounding entries.
  - The working memory that carries the four-eyes rule is updated to point at the
    normative text instead of restating it.
  VERIFIABLE: the rule's normative wording exists exactly ONCE across CLAUDE.md and the
  docs (a grep for the defining sentence finds one hit, the others being references);
  the guide stays within its word budget; the retrospective-currency guard is satisfied
  after the edit; `npm run test:unit` and the docs suite stay green. No code changes, so
  no browser regression.

- [ ] 356. THE INHABITANTS NOTICE THE TRAVELLER (user 25.07.2026). Today they do not:
  in `src/scenes/place/PlaceLife.tsx` the player appears ONLY as a collision radius, so
  a settlement is a diorama that happens to be occupied. Being SEEN is the strongest
  signal that a place is inhabited, and for a European walking into an African village
  in 1890 it is also the historically obvious reaction.
  TARGET: within a calibratable notice radius an inhabitant turns its head — the whole
  figure's facing, since these figures have no separate head — toward the traveller for
  a few seconds, then returns to its errand. Children break off what they are doing and
  stare a moment longer; the goats shy a step away. Everyone keeps their task: this is a
  glance, never a state that stops the village.
  RULES THAT KEEP IT FROM BECOMING CREEPY OR MECHANICAL: a cooldown per inhabitant so
  the same figure does not track the player continuously; a cap on how many notice at
  once (a whole village turning in unison reads as a horror film, not a place); the turn
  rides the existing capped turn rate rather than snapping; and a drama or errand that
  must not be interrupted (the elder in an audience, a walker inside a building) is
  exempt. Values in `balance.villageLife.*`, debug-editable.
  VERIFIABLE: pure — the notice predicate fires inside the radius and not outside,
  respects the cooldown, and never selects more than the cap; the resulting facing is a
  bounded step toward the player, never a snap. Live (`scripts/verify/polish.mjs`, BOTH
  backends, screenshot): walking past a group, at least one inhabitant's yaw turns
  measurably toward the player and returns afterwards, while the errands continue.
  DOCS: design.md §19.10 gains the glance beside the existing village vignettes.

- [ ] 357. THE VILLAGE SOUNDS INHABITED (user 25.07.2026). Checked: the settlement
  soundscape in `src/systems/ambience.ts` runs exactly ONE layer for a village —
  `setTarget('drums', 0.5)`. No voices, no pestle, no goats, no fire. Sound carries
  "inhabited" further than any visual, and its absence is not noticed until it is there.
  TARGET, as layers over the existing master ambience volume (§20), each with its own
  calibratable level like `balance.birdsongVolume`: a low murmur of VOICES at
  conversational distance; the thud of the mortar, timed to the pestle that is already
  animated rather than looping free; goats; and the fire's crackle rising as the
  traveller nears the fire ring (the §19.1 proximity model already exists for animal
  calls — reuse it, do not build a second one).
  THE VOICES STAY WORDLESS, and that is a decision, not a shortcut: the language
  mechanic of §13.4 is explicitly undecided and under review, so anything resembling
  speech would commit the game to an answer this point has no business giving. A murmur
  commits to nothing and can be replaced when §13 is settled.
  KEEP: the drums as they are, the port and travel soundscapes untouched, and the single
  master volume in charge of everything (§20).
  VERIFIABLE: pure (`src/systems/ambience.test.ts`) — each new layer's gain follows its
  own slider and the master, is zero outside a village, and the fire layer rises and
  falls with distance across a swept range. Live (`scripts/verify/settings.mjs`): inside
  a village the new layers are audible in the graph's gain values and fall silent when
  the master is muted; no console errors.
  DOCS: design.md §19.10/§20 name the village layers.

- [ ] 358. SMOKE OVER THE FIRE, DUST UNDER THE FEET (user 25.07.2026). A thin smoke
  column drifting from the §19.10 fire reads as "someone lives here" from further away
  than any figure does, and dust kicked up where a walker crosses dry ground makes the
  ground feel walked on rather than walked over.
  TARGET: a slow, thin smoke plume above the fire that leans with a calibratable drift
  and thins with height; and a small, short-lived dust puff at a walker's feet on DRY
  ground only. Both tie into what already exists: the smoke thins or gutters under rain
  the way the fire itself already answers to weather (point 142), and the dust is
  suppressed once the ground is wet (the wetness the season already drives, and the
  sheltered-ground mask of point 353 where that lands first).
  QUALITY: declare all three levels in `QUALITY_PRESETS` with the doc kept in sync —
  this is the kind of small optical addition the §21 convention exists for. Keep it
  cheap: a handful of soft billboards, not a particle system with a budget.
  VERIFIABLE: pure — the plume's drift and thinning are a function of height and the
  weather factor, and the dust predicate is false on wet ground and true on dry; the
  preset completeness and doc-sync gates cover the new keys. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshots): above the fire the pixels
  differ from the same crop with the effect disabled, in dry weather a walking
  inhabitant raises visible dust and in rain it does not.
  DOCS: design.md §19.10.

- [ ] 359. THE CATTLE PEOPLES' KRAAL IS EMPTY (user 25.07.2026, from the Zulu village
  screenshot: the enclosure stands there with nothing in it — `PlaceLife.tsx` puts GOATS
  in a pen, cattle do not exist). For a Zulu umuzi the cattle enclosure is not scenery
  but the centre of the homestead, and an empty one is a conspicuous absence.
  EVIDENCE FIRST, as with every people question here: establish from
  `docs/peoples-1890.md` which of the 22 peoples kept CATTLE around 1890 and in what
  arrangement — a central kraal, a herd out at pasture, none at all — and extend the
  research section where it is silent. The cattle-less peoples (the Bemba among them,
  per the existing rinderpest text) get NO cattle; the camel peoples keep camels.
  THEN THE HERD, and this is what makes it more than decoration: the game already models
  the great rinderpest panzootic of 1888-1897 (`rinderpestPhase`, docs/peoples-1890.md
  §5) and already tells it in the first-visit vignettes. The kraal must agree with that
  text — full in 1890, devastated from 1891/92, slowly recovering afterwards, with the
  phase read from the VISIT DATE exactly as the vignette reads it. A village whose
  journal entry speaks of the emutai while its kraal stands full would contradict itself.
  KEEP: the goats and their pen as they are; the §19.10 life, the layout and the
  colliders otherwise untouched; cattle are collidable like any other solid body.
  VERIFIABLE: pure — every people resolves to a decided cattle arrangement (the sweep
  fails on an undecided one, as the dress sweep does); the herd size falls across the
  rinderpest phases for a cattle people and stays zero for a cattle-less one, boundary-
  tested at the phase dates; the animals stay inside the pen and out of its fence. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the Zulu kraal holds cattle
  in 1890 and visibly fewer in 1893, and the Bemba village has none in either year.
  DOCS in the same commit: design.md §19.10 and the implementation section of
  `docs/peoples-1890.md` (the standing rule that research and game table never drift).

- [ ] 360. THE INHABITANTS TAKE NOTICE OF EACH OTHER (user 25.07.2026). Every villager
  runs its errand alone: they pass within a metre of one another and nothing happens.
  A place where nobody acknowledges anybody reads as a set of independent machines
  sharing a courtyard.
  TARGET, three encounters built on what already exists in `src/scenes/place/
  PlaceLife.tsx`:
  (a) A MEETING. Two walkers whose paths cross stop for a few seconds, turn to face each
  other, exchange a small lean — the figures have no arms to raise, so the greeting is
  carried by facing, a brief bow-like lean and the pause itself — and then go on.
  (b) A HANDOVER. The errand walkers already carry a `bundle` or a `jar`; sometimes a
  meeting passes that load to the other, who carries it onward to ITS destination. The
  object must visibly change owner — one carrier, then the other, never two or none.
  (c) A GATHERING. More than one figure at the fire at the same time rather than the
  lone tender: two or three around it, one of them kneeling. This DEPENDS ON POINT 350 —
  the kneeling pose must be a real pose before several figures use it, or the gathering
  multiplies a visibly squashed figure.
  RULES: a meeting always ends (a window, then both resume — the house rule that nothing
  started runs forever); a pair that has just met is not eligible again for a cooldown,
  or two figures will greet each other in a loop; a meeting never begins where the pair
  would stand inside a collider or block a doorway; and the errands still COMPLETE — the
  village must not become a place where everyone chats and nothing arrives.
  KEEP: the point-155 guarantees (clear standing circle, escape direction, the pinned-
  walker nudge) and the ordinary errand rhythm as the backbone.
  VERIFIABLE: pure — the partner choice takes an available walker within the radius and
  never one already in an encounter or inside a building; the handover moves the load
  exactly once (source empty, target carrying); the meeting window expires
  deterministically and the cooldown blocks an immediate repeat. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): over a sampled interval at
  least one pair meets, both yaws turn toward each other, they part, and the errand
  targets are still reached afterwards; no walker is left standing past its window.
  DOCS: design.md §19.10 beside the existing village vignettes.

- [ ] 390. THE SAND AROUND THE PYRAMIDS IS NOT WALKABLE (user 28.07.2026, screenshot from
  the deployed build inside the Giza monument site: standing beside a pyramid, the desert
  reaches unbroken to the horizon and the traveller cannot go out into it — "man sollte
  über den Sand laufen können"). CAUSE: the site is a walkable DISC. `GIZA_SITE_RADIUS`
  (`src/scenes/place/gizaSite.ts`) is 60 m, and `PlaceScene` leaves the place the moment
  `hypot(p.x, p.z)` exceeds `layout.radius` — position-based by design (design.md §2.3,
  no exit key). At Giza that edge falls in the MIDDLE of a flat, empty, visibly continuous
  plain, so the picture promises ground the rules do not grant: the player either meets an
  invisible boundary or is thrown back to the bird's-eye view while still standing on the
  same sand.
  THE RULE TO HOLD, stated for every place and not only for Giza: the walkable ground must
  reach to where the PICTURE stops offering ground. Where the surroundings are a built or
  broken edge (a village's fence line, a port's quay, a slope) the disc may end there,
  because the eye reads a boundary. Where the surroundings are an open plain that continues
  unbroken — the desert sites are that case — the disc must extend far enough that a player
  walking outward meets the transition as a DISTANCE, not as a wall a few strides from the
  monument.
  DO IT IN THIS ORDER. (1) MEASURE, do not guess: from the site centre, at the in-game eye
  height, find the distance at which the drawn ground stops being flat open sand — the
  backdrop ring and the §2.5 panorama band are the reference (`panoramaStandY` /
  `discHorizonY` in `src/scenes/place/backdrop.ts`), and point 381 already pins that the
  backdrop meets the disc edge with no seam. Record the number. (2) RAISE the desert
  monument radius to that measured distance rather than to a round guess, and check what it
  costs: the disc carries ground detail, flora scatter and the walker errand grid, so
  report the frame time at the new radius on BOTH backends (the F8 benchmark does not route
  through settlements — measure with the FPS counter at the site, at LOW and at MEDIUM). If
  the cost is real, cap the radius at what the measurement affords and SAY SO with the
  number, rather than quietly leaving the wall closer than the picture promises. (3) The
  EXIT must stay findable: a player who walks outward has to reach the bird's-eye view
  without a hunt, so keep the position-based rule and, if the radius grows large, decide
  whether the §17.4 hint layer should name the direction. Do NOT add an exit key — the
  movement-based switch is design.md §2.3 and is not up for revision here.
  BEWARE THE COUPLED RULES, each already enforced elsewhere: the backdrop must still meet
  the ground with no hole and no unlit face at the new radius (point 381 —
  `src/scenes/place/backdrop.test.ts` sweeps a set of disc radii, add the new one), the
  panorama silhouettes stand on the higher of backdrop relief and the visible ground line
  (point 181) and must not end up inside the walkable area, and the settlement-entry disc
  separation between Giza and Cairo (`src/scenes/travel/settlementEntry.test.ts`) is a
  BIRD'S-EYE distance untouched by the site radius — do not "fix" it.
  VERIFIABLE: pure Vitest — the desert monument radius equals the measured open-plain
  distance (one constant, derived rather than written twice), and the backdrop sweep covers
  it. Plus the picture on BOTH backends: a frame from the site centre looking outward and
  one taken at the new edge, showing that the ground the player stands on runs to where the
  backdrop takes over.
  DOCS in the same commit: the `GIZA_SITE_RADIUS` comment states its measured basis, and
  `docs/acceptance-evidence.md` §15 gains the chain.
- [ ] 362. THE CROSSING TURNED BACK — the crocodile takes a calf mid-channel
  (user 26.07.2026; design.md §19.8 states the target). Two systems exist and have
  never met: the purposeful water crossing (`crossingTarget`/`shouldStartCrossing`
  in `src/scenes/travel/wildlifeBehavior.ts`, point 192) and the crocodile ambush
  (§19.16, `crocodileTargetWeight` and the hunt core). Join them into the one scene
  §19.8 is missing — a family in open water.
  A CROSSING TAKES THE FAMILY. When a parent with a living calf starts a crossing,
  the calf enters with it and swims at its flank (the existing leash, at the wade
  speed both already use); the pair is one crossing, not two. A calf alone never
  starts one.
  THE AMBUSH FIRES MID-CHANNEL. The crocodile's target weighting, today biased to
  drinkers and juveniles AT the bank, gains the swimming calf as its strongest
  case — a calibratable weight beside the existing ones (§21.2, debug-editable).
  THE REVERSAL IS THE PICTURE. On the seizure the parent turns round — against the
  direction the rest of the herd is taking — and swims back. Its heading reversal
  goes through the ordinary capped turn rate (§19.5: no body ever whips round), and
  the rest of the herd does NOT turn: it completes the crossing and walks up the far
  bank. That contrast is what the scene is for; a verification that cannot see it is
  not passing.
  THE ENDINGS ARE THE EXISTING ONES, not new: the return is a RESCUE, so it takes
  the rescue burst braked by `seasonFlowFactor` (`wadeSpeed`) and rolls the SAME
  §19.8 defence matrix used at the waterline — drive-off, taken-in-the-calf's-place,
  or too late. NO vigil exists here (the water takes the body, §19.8); a too-late
  parent makes the NEAREST bank and rejoins its herd. Every branch resolves on a
  bank — reuse the crossing deadline so nothing is left swimming (§19.5).
  ANCHORS: `src/scenes/travel/wildlifeBehavior.ts` (crossing, crocodile weighting,
  defence resolution, `wadeSpeed`), `src/scenes/travel/Wildlife.tsx` ~2373–2500
  (the water-drama frame code and its `seasonFlowFactor` calls) and ~3855 (the
  crossing swim speed), `src/config/balance.ts` `waterDrama`, `src/i18n/{de,en}.ts`
  for the debug label.
  VERIFIABLE: pure (`wildlifeBehavior.test.ts`) — a parent's crossing takes its calf
  and only its calf; the mid-channel weight beats the bank cases; the reversal
  respects the turn cap; each defence outcome reaches a terminal state and a
  too-late parent ends on a bank, never in the channel; no branch can leave the
  water-drama state set past the deadline. Live (`scripts/verify/wildlife.mjs`, ONE
  backend — this is behaviour, not shading; the reversal is judged on the recorded
  positions plus one screenshot): a seeded crossing produces a herd that finishes
  while one animal reverses.
  DOCS: design.md §19.8 + §21.2 already state it; add the balance value's comment
  and the acceptance-evidence line under §12.

- [ ] 363. THE STRAGGLER — a lame calf the herd leaves behind (user 26.07.2026;
  design.md §19.8 states the target). Every §19 drama is fast: a charge, a seizure,
  a plunge. This one is slow, and nothing is scripted to kill — it is the only
  scene in the game whose tension is WAITING.
  THE LAMENESS. With a calibratable chance (§21.2, debug-editable) a calf that
  SURVIVES a hunt — the parent drove the predator off (points 124/125/145c), or the
  chase simply broke off — is left lame: a calibratable speed penalty for a
  calibratable healing window. Keep the chance low; a drive-off that always cost
  something would turn the successful defence into a second sacrifice.
  THE HERD DRAWS AWAY. A lame calf cannot hold the group pace, and its parent does
  not leave it (the §19.8 constant, already implemented for the mire vigil of point
  123 — reuse that stay-behind, do not write a second one). The herd keeps its
  ordinary roaming; the pair simply falls behind and stands alone in the open.
  NO PREDATOR IS SENT. Do not spawn or steer one. The existing juvenile hunt bias
  now has an easier target because the pair is isolated and slow; that is the whole
  mechanism. If a hunt does find them the ORDINARY grammar runs (shield, charge,
  roll) — the parent does not surrender, because nothing has died.
  IT ALWAYS RESOLVES (the point-118 lesson): on the healing window the limp ends and
  the pair rejoins the herd; a streamed-away herd is the adoption/regroup case that
  already exists. A lame calf must never be left permanently detached.
  ANCHORS: `src/scenes/travel/wildlifeBehavior.ts` (the hunt outcome/drive-off
  resolution, the mire stay-behind, the leash and group pacing), `Wildlife.tsx` for
  the per-frame speed, `src/config/balance.ts` `waterDrama`'s neighbourhood (add the
  values beside the family-drama block), `src/i18n/{de,en}.ts` labels.
  VERIFIABLE: pure — the lameness fires only after a SURVIVED hunt and only on its
  chance; the penalty applies to the calf and the parent's stay-behind mirrors it;
  the pair falls measurably behind a roaming herd; the window heals and the pair
  rejoins; no state leaves a calf detached past the window. Live
  (`scripts/verify/wildlife.mjs`, ONE backend): with the chance forced to 1 a
  post-hunt pair is measurably behind the herd's centroid and later back with it.
  DOCS: design.md §19.8 + §21.2 already state it; balance comments and the
  acceptance-evidence line under §12.

- [ ] 364. THE FLOOD SWELLS THE DRAMA CURRENT — and can take a calf at the crest
  (user 26.07.2026; design.md §19.8 states the target). This point fixes a real
  inconsistency first and adds a drama second; both land together.
  THE BUG. `seasonFlowFactor(CURRENT_WEATHER.wetness, dryFlowFactor, wetFlowFactor)`
  (Wildlife.tsx ~2373/2466/2485/3855) keys the drama current on LOCAL wetness alone.
  The game's own flood model is deliberately REMOTE-fed (design.md §19.9, points
  138/139): the Nile crests at Cairo in October where it never rains, and the
  Okavango peaks in July inside Botswana's dry season. So today the water dramas run
  at their dry-season gentlest exactly when the modelled river is at its most
  dangerous. THE FIX: the effective factor is the HIGHER of the wetness-fed factor
  and a flood-fed one — `nileFloodAt`/`okavangoFloodAt` (`src/systems/season.ts`)
  scaled by a calibratable balance value (§21.2, debug-editable) — so the crest
  swells the current, shortens the self-rescue and brakes the rescue burst through
  the paths that already read the factor. Wire it in ONE place (a helper beside
  `seasonFlowFactor`) so no call site can be forgotten.
  THE DRAMA. At a swollen crest a crossing (point 362) can lose the calf to the
  CURRENT rather than to a crocodile: it is carried downstream past its parent's
  reach, and the parent turns downstream after it — a rescue on the same rolls and
  the same brake, which the point-122 drowning window may end for BOTH. This is the
  existing drowning drama reached by a new road, not a new death: reuse
  `drownSeconds`/`drownFlowThreshold` unchanged.
  WHAT MUST NOT CHANGE: the flood stays VERTICAL (§19.9) — no ground becomes water,
  no §4.2 village clearance moves, the ribbon keeps its width. Only the force
  changes. A test must pin that.
  SEQUENCING: 362 lands first (this point's drama rides its crossing); the flow-factor
  fix is independent and may land even if 362 slips.
  ANCHORS: `src/systems/season.ts` (`nileFloodAt`, `okavangoFloodAt`),
  `src/scenes/travel/wildlifeBehavior.ts` (`seasonFlowFactor`, `wadeSpeed`, the
  drowning core ~1745), `Wildlife.tsx` at the four call sites above,
  `src/config/balance.ts` `waterDrama`, `src/i18n/{de,en}.ts`.
  VERIFIABLE: pure — at Cairo in October (wetness 0) the effective factor is
  significantly above the dry floor and near the wet case, while a rainless
  non-flood day stays at the floor; the Okavango does the same in July; the factor
  is never LOWER than today's wetness-fed value anywhere (a pure sweep over the
  year × both systems); the drowning window and threshold are untouched; the flood
  changes no water mask, ribbon width or clearance (assert against the existing
  world sweep). Live (`scripts/verify/wildlife.mjs`, ONE backend): at the October
  crest a seeded crossing is visibly carried downstream and its rescue is slower
  than the same seed in the dry season.
  DOCS: design.md §19.8 + §21.2 already state it; balance comments and the
  acceptance-evidence line under §12.

- [ ] 373. THE SESSION BOUNDARY BECOMES AUTONOMOUS (user 27.07.2026: "implement it the
  way you recommend", against the plan to run the batch 24/7). Measured: 80 % of the
  token spend sits above 150k context, because one session carries point after point.
  At 24/7 that is the dominant cost — 1.25 %/h of the weekly quota, which is 210 % of it
  over a full week, where 0.6 %/h is the ceiling that fits.
  THE MECHANISM IS THE ONE THAT EXISTS: the batch session ENDS at a point boundary and
  the OS task `HoA-Batch-Autostart` brings up a fresh one, which `batch-resume-hook`
  re-orients from TASKS.md and the batch state. Nothing new is built; what changes is
  that the launcher is armed again.
  WHY THAT IS NOW SAFE, and it is the whole question — the task was disabled after the
  e9407cae double-session incident. Since then the hard singleton was built AND is
  verified live (27.07.2026): with this session holding the lock, `node
  scripts/batch-autostart.mjs` answered `skip: owner alive (fresh-heartbeat, heartbeat
  0 min old, pid 18492)` and spawned nothing. The launcher wins a `pending-spawn` lock
  before spawning, a losing session stands down through `heldByOtherLiveOwner`, the
  detector runs at every turn end AND every launcher tick, and `batch-doctor` remediates
  a damaged repo. The alternative — a live session spawning its own successor —
  GUARANTEES a window with two live sessions and is therefore rejected.
  THE ONE STEP THE ASSISTANT CANNOT DO: enabling the OS task is a system change the
  harness blocks. The user runs it once, in an elevated PowerShell:
  `Enable-ScheduledTask -TaskName 'HoA-Batch-Autostart'`. Until then the boundary stays
  attended (ask for `/clear`), and this point stays open.
  THEN, AND ONLY THEN, the loop changes: after a point is merged and ticked, the session
  ends deliberately instead of pulling the next point into the same context. That end is
  NOT an idle stop — `batch-progress-guard` must learn the difference, or it will block
  exactly the behaviour this point wants. Extend it: ending is legal when the current
  point is CLOSED and the launcher is armed; it stays illegal otherwise.
  VERIFIABLE: pure Vitest on the guard's core — a boundary stop with a closed point and
  an armed launcher ALLOWS, the same stop with work still open BLOCKS, and an unarmed
  launcher BLOCKS (so a disabled task can never strand the batch). Live: after the first
  autonomous boundary, `.claude/autostart.log` shows the spawn and the new session's
  first turn picks the next point.
  MEASURE THE RESULT: report the %/h rate for the first full day after the change
  against today's 1.25 %/h. The point counts as delivered when the rate is measured, not
  when the mechanism runs.

- [ ] 379. ABU SIMBEL BECOMES A WALKABLE SITE (user 27.07.2026; a FEATURE, and the user's
  own instruction is that the open DEFECTS come first — it waits behind them). The world carries
  eight built cultural landmarks (Meroë, Giza, Great Zimbabwe, Lalibela, Kilwa, Aksum,
  Gondar, Bandiagara) and four natural ones; the rock temples of Abu Simbel are absent,
  and they belong: in 1890 they stood — cleared of sand by Belzoni in 1817 and a fixed
  point of every Nile journey — at the Nubian reach the traveller passes on the way
  south, in their ORIGINAL place beside the river (the 1960s relocation is far outside
  this game's window, so the site sits at the historical coordinates, not the modern
  ones).
  IT IS ENTERABLE, LIKE THE PYRAMIDS (user 27.07.2026): the traveller walks up to it in
  the bird's-eye view and enters with SPACE, exactly as point 273 made the Giza monument
  site walkable — the same enter radius, the same discovery gate, the same non-overlap
  rule against every other place's enter disc, and a first-person site the player can
  cross. Point 273 is the pattern to follow rather than a second mechanism to invent;
  read what it built before designing anything.
  ONE PLACE, ONE LABEL — do not repeat the Giza mistake (user 27.07.2026). Making the
  pyramids walkable left the site defined TWICE, as a cultural landmark AND as a map
  point, so the bird's-eye view carries two overlapping names for one thing (that is
  work-order point 338, still open). Abu Simbel is entered into the world ONCE, in
  whichever of the two forms carries an enterable site, and it must NOT also stand as a
  second definition. Point 338 decides which form survives for Giza; this point follows
  that decision rather than inventing a third arrangement — and if 338 is still open
  when this is built, it is fixed FIRST, because building a second double label while
  the first is being removed is the same defect twice.
  VERIFIABLE for that half: a pure test asserting the site appears EXACTLY ONCE across
  the landmark and map-point definitions, and one bird's-eye frame at in-game zoom
  showing a single label.
  BUILD THE REST AS THE OTHER EIGHT ARE BUILT, not as a special case: an entry in
  `src/world/data/landmarks.ts` with its ~1890-correct coordinates, the field radius and
  water clearance the §4.2 sweep in `src/world/world.test.ts` applies to every landmark,
  a localized name in BOTH language files, a first-sighting journal entry in the §10
  kind-flavoured shape (both languages, §15 voice markup, once per landmark), the
  discovery bounty, and the debug-menu jump-to entry in its alphabetical place.
  THE FRAMING IS THE §4.4 ONE: an African achievement seen by a traveller, not a
  curiosity. Four colossal seated figures cut from the cliff face, a smaller temple
  beside them, the river below — the entry says what the traveller SEES and what it
  meant, in the register the other seven use.
  RESEARCH BEFORE PLACING: confirm the coordinates and the 1890 state against
  `docs/peoples-1890.md` (it already mentions the site) and the sources that document
  the other landmarks; if the research contradicts anything here, the research wins and
  the point is corrected rather than forced.
  VERIFIABLE: the existing landmark sweeps in `src/world/world.test.ts` cover it
  automatically once it is in the data (clearance, no overlap, the label rules); add the
  i18n completeness case both languages already have, and the first-sighting entry test
  beside the other landmarks'. One bird's-eye screenshot at in-game zoom showing the
  site labelled where it belongs on the Nile.
  DOCS in the same commit: `design.md` §4.4 (the landmark list is design content — this
  is a genuine addition and pays its measured words), CLAUDE.md §7.1 pt 25 where the
  eight are enumerated, and the evidence section.

- [ ] 380. THE SURROUNDINGS SHOW THE NEIGHBOUR THAT IS REALLY THERE (user 27.07.2026,
  reported from the deployed build). Standing at the Giza monument site the traveller
  does NOT see Cairo on the horizon, while standing in Cairo he does see the pyramids —
  and in 1890 the two are barely fifteen kilometres apart, in flat desert, in plain
  view of each other. The asymmetry is the report; the rule it breaks is §2.5, which
  promises the surroundings panorama of the real map landscape.
  DIAGNOSE BEFORE BUILDING, because the two directions probably have DIFFERENT causes:
  the backdrop band (`src/scenes/place/backdrop.ts`) is built from `sampleTerrain`
  alone — relief, no settlements and no monuments — so it cannot be what shows the
  pyramids from Cairo; that view is far more likely Cairo's own local dressing. Confirm
  which mechanism draws each side before deciding where the fix belongs. A fix in the
  wrong one produces a pyramid that hangs in the sky, which is exactly the class points
  92/94/181 already paid for.
  THE TARGET: a settlement or monument that is genuinely within sight distance reads on
  the horizon from the other, at the right BEARING and the right apparent size, sitting
  on the ground the backdrop draws (`panoramaStandY`/`discHorizonY`, the point-181
  footing rule) — never floating, never a black sliver. Sight distance is a
  calibratable balance value, debug-editable, and the rule is symmetric by construction
  rather than by two hand-written cases.
  SCOPE HONESTLY: if the research shows the general case (every neighbouring place
  within sight) costs far more than the Giza↔Cairo pair the user reported, say so with
  the measured reason and deliver the general mechanism only if it is affordable —
  a hard-coded pair is NOT an acceptable substitute, because the next pair reopens it.
  VERIFIABLE: pure Vitest on the bearing/size/footing computation for a neighbour at a
  given distance (present within sight, absent beyond it, correct bearing on both
  sides — the symmetry pinned as a property, not as two examples); plus one Playwright
  frame from each side, judged by PROJECTING the neighbour into the picture per §7.2,
  never by an assumed radius.
  ORDER: point 381 (the torn seam at that very site) is FIXED FIRST — adding a
  neighbour to a horizon that is itself broken would build on sand.
  DOCS in the same commit: `design.md` §2.5 (what the panorama shows is design content)
  and CLAUDE.md §7.1 pt 31 with its evidence section.

- [ ] 384. RAIN THAT TOUCHES THE WORLD — WET GROUND, IMPACTS, LIT DROPS (user 27.07.2026,
  after looking at the settlement rain on the deployed build: "the rain is simply painted
  over the picture — it has no effect on the optics at all"). Measured against the code,
  that reading is nearly right: `src/scenes/place/PlaceRain.tsx` draws 700 instanced
  quads in an UNLIT `MeshBasicNodeMaterial` of one constant colour (0.66/0.72/0.8), fog
  off, depth-write off, inside a 15-unit column centred on the eye. The streaks do stand
  in the world and are occluded by huts — but nothing else in the scene knows it is
  raining. This point closes that gap with the three cheapest steps, in the order of
  effect per cost; point 385 carries the two dearer ones.
  (1) WET SURFACES — the biggest gain for the least work, and it needs no new particle.
  A single scene-wide wetness value (the place's own `rainAmount`, already computed)
  drives the existing materials: roughness down, albedo slightly darkened, specular
  response up, so ground, roofs and walls go dark and glossy and the village fire
  reflects in the wet earth. Sheltered ground is EXEMPT — work-order point 353 owns that
  rule; this point must not fight it, so read it first and drive both from one value.
  (2) THE RAIN REACHES THE GROUND, AND ARRIVES. Today the column is a fixed box around
  the head and drops recycle at its lower edge — which is why the player sees them stop
  in mid-air. A drop ends at the GROUND under it (the terrain/settlement height at its
  own x/z), and its end is an IMPACT: a short-lived, small ring or splash quad at that
  spot, alpha-fading, instanced like the drops themselves. On water the impact is a
  ring; on dust it is a puff — one shape parameterised, not two systems.
  (3) LIT DROPS INSTEAD OF ONE FLAT COLOUR. A streak's brightness follows the sun/sky
  direction and the view angle, so it reads bright against a dark hut and nearly
  vanishes against a bright sky, and the drops of one gust no longer look identical.
  QUALITY LEVELS ARE PART OF THE POINT, not an afterthought (§21 convention): every new
  lever gets a low/medium/high entry in `QUALITY_PRESETS` (`src/config/quality.ts`) and a
  row in `docs/graphics-detail-levels.md` — the completeness gate in
  `src/config/quality.test.ts` fails otherwise. Rain that costs frames on LOW is a
  regression, so low keeps the plain streaks and the wetness value at most; impacts and
  lit drops are medium/high.
  BOTH BACKENDS, ONE PATH: TSL only, no WebGPU-only branch (CLAUDE.md §3) — the
  reverted TRAA attempt is the precedent for what a second code path costs.
  VERIFIABLE: pure Vitest on the wetness mapping (dry → today's values, wet → the
  darkened/glossier set, sheltered ground unchanged) and on the impact placement (a
  drop's end equals the ground height under it, never the column's lower edge); the
  quality-preset completeness and doc-sync gates green; live, one first-person frame in
  the rain on BOTH backends showing wet ground and drops that arrive, judged by the
  picture, plus the §21 detail levels stepped through without a red.
  DOCS in the same commit: design.md §19.13 (what rain does to the picture is design
  content), `docs/graphics-detail-levels.md`, and CLAUDE.md §7.1 pt 12 with its evidence
  section.

- [ ] 385. RAIN WITH DEPTH AND WEATHER — LAYERS, STREAK SHAPE, DIMMED SUN (user
  27.07.2026; the second half of the rain work, deliberately LAST in the queue, after
  point 379). Point 384 makes the rain touch the world; this makes the rain itself read
  as weather rather than as particles.
  (4) DEPTH INSTEAD OF ONE CURTAIN: two or three layers at different distances and
  speeds, with the streak LENGTH following the drop's velocity relative to the camera
  and soft, faded ends rather than hard rectangles. That is the classic way volume is
  suggested without more particles — the count stays where it is or falls.
  (5) THE WEATHER CHANGES THE LIGHT: while it rains the sun is damped, the haze rises
  and the view distance shortens, so a downpour looks like one from inside a hut as well
  as from the open. This is where the rain stops being an overlay: the scene gets darker
  and flatter, and the fire is suddenly the brightest thing in the village.
  BOUNDARY: the blue sky under rain is work-order point 354 and stays there — this point
  changes the LIGHT, not the sky dome, and the two must be built so neither undoes the
  other. Read 354 before starting; if it is still open when this begins, say in the
  commit how the two interact.
  QUALITY LEVELS, as in 384: every lever gets its low/medium/high entry and its doc row;
  the layered rain and the light damping are medium/high, low keeps one layer and the
  undimmed sun.
  BOTH BACKENDS, ONE PATH: TSL only, no backend branch.
  VERIFIABLE: pure Vitest on the layer/velocity mapping (streak length follows relative
  speed; a stalled camera does not stretch a drop) and on the light damping (rain 0 →
  today's sun and haze exactly; rain 1 → the damped set; monotone in between); live, one
  first-person frame per backend in the open and one from under a roof, judged by the
  picture, at each detail level.
  DOCS in the same commit: design.md §19.13, `docs/graphics-detail-levels.md`, CLAUDE.md
  §7.1 pt 12 and its evidence section.

- [ ] 387. THE CHECKS THAT ARE RED ON MAIN ITSELF (27.07.2026, established with
  the baseline lane of point 294 — two runs against the merge-base, all four labelled
  PRE-EXISTING). The suite therefore cannot exit 0, and because `render-verify-guard`
  counts only a PASSING run, every backend-sensitive change that picks `polish` has to be
  cleared by hand. A red that everyone routes around is worse than a missing check: it
  trains the habit of overriding the gate.
  THE FOUR, each to be judged on its own — a stale assumption, a threshold on its edge
  and a real defect look identical from the outside, and this project has mistaken each
  for the others:
  · the rains dim the settlement sun and sky light — expected behaviour that does not
    exist yet; work-order point 385 is where it is built, so this check is asserting a
    FUTURE state. Decide: does the check wait for 385 (marked as such, not silently
    passing), or is it wrong about what today promises?
  · the leave capture bakes the surrounding terrain into the band (point 227).
  · the band is compass-true: a probe placed due west shows west, not east.
  · fire shadows ON: the ground behind a ring stone is measurably darker than beside it
    (design.md §19.10) — reported at 1.6 against a threshold of 2, the same
    sitting-on-its-own-edge shape as point 382's eye-knob check.
  · AND IN THE ENRICHMENTS SUITE, measured the same night on a quiet machine and
    labelled PRE-EXISTING by the baseline lane: the High Atlas whitens in February and
    bares in July (seasonal snow, point 141) — reported at 1.3 % white in February
    against 0.0 % in July, i.e. the CONTRAST exists and the check still refuses it, the
    third instance of a criterion deciding on a figure near its own bar. The crocodile
    eye-knob red in the same suite has its own point (382) and is not repeated here.
  FOR EACH: say whether the PRODUCT is wrong, the CHECK asserts something never
  promised, or the THRESHOLD decides on noise — and fix accordingly. Loosening an
  assertion to reach green is refused; a check that waits for unbuilt work is marked as
  waiting, with the point number it waits for, so the suite can exit 0 honestly.
  FIRST MEASUREMENT, 28.07.2026 11:52, quiet machine (CPU 13 %, GPU 0 %), WebGL 2:
  `polish` reports 59 pass, 4 fail, 0 console errors, and the four are exactly the four
  named above. Their figures change what each of them is:
  · the rains dim the settlement sun and sky light — dry `{sun 2.4, hemi 0.8}` against wet
    `{sun 1.993, hemi 0.664}`. The dimming EXISTS and is 17 %; the check is not asserting
    an unbuilt state after all, its BAR is above what today delivers. Decide the bar
    against what §19.9/§385 actually promise, and record the promise beside it.
  · the leave capture bakes the surrounding terrain into the band — "bottom-quarter opaque
    0.000", i.e. NOTHING opaque at the bottom of the band. That is a staging or capture
    failure, not a bad threshold: the check has nothing to measure.
  · the band is compass-true — "west 0px, east 0px". BOTH probes read zero, so the check
    cannot decide east from west; it is not reporting a mirrored band, it is reporting a
    blank one. Same family as the one above and probably the same cause.
  · fire shadows ON — per-stone lit-minus-shadow `[1.6, -1.3, 0]`. Not a criterion sitting
    on its edge: one stone shows a shadow, the next shows the OPPOSITE sign, the third
    nothing at all. Judge the product here before touching the number.
  AND THE BASELINE LANE AGREES, same session: the second run reported 55 pass / 8 fail,
  and its own classifier separated them without help — "the SAME check failed twice … a
  candidate REAL failure; the other 4 rotated between the runs and read as load". The four
  that failed twice are the four above. So the list is not stale: it is today's list, and
  the four extra reds of the second run (the dome graying, the fire glow under overcast,
  the settlement rain, the ground tint) are the load signature, not new defects.
  MEASURE BEFORE JUDGING A THRESHOLD: run the staging several times on a quiet machine
  (`node scripts/verify/machine-load.mjs` confirms) and record the spread beside the
  criterion, exactly as point 382 requires for the crocodile's eyes.
  VERIFIABLE: `polish` exits 0 twice in a row on a quiet machine on BOTH backends, with
  every surviving check unchanged in what it demands; each of the four resolved with its
  reason recorded in the commit.
  DOCS in the same commit: `scripts/verify/README.md` where the suite is described.

- [ ] 388. A PERMITTED BOUNDARY IS NOT A TAKEN ONE — THE NIGHT THE BATCH STOOD STILL
  (28.07.2026, measured). Point 373 made the batch session allowed to END at a closed
  point so the launcher can bring up a fresh one. On the first night it was live, the
  batch idled from 01:15 to 06:44 — five and a half hours — and the logs say exactly why:
  · the session had merged and ticked four points and no agent was in flight, so
    `batch-progress-guard` PERMITTED the stop, as designed;
  · nothing then TOOK the boundary: `scripts/batch-boundary.mjs` was never run, so no
    marker was written (`--status` afterwards: `"marker": null, "reason": "no-marker"`);
  · the session therefore just sat there, ALIVE and holding `.claude/batch-lock.json`;
  · the launcher did the right thing every 15 minutes — `skip: owner alive` — and from
    03:21 named the state precisely: `WEDGED owner: pid alive but heartbeat 245 min old`.
  It diagnosed the condition twenty-one times and never acted on it, because acting is
  not in its remit.
  THE DEFECT IS THE DECOUPLING: permission to stop and the ACT of ending the session are
  two different things, and only the first was built. A session that stops while holding
  the lock is worse than one that never stops at all — it blocks its own successor.
  BUILD THE OTHER HALF, and keep the singleton intact (a second live session is the
  incident class this whole apparatus exists to prevent):
  (a) THE BOUNDARY IS TAKEN, NOT OFFERED. When `batch-progress-guard` finds the boundary
  conditions met, it does not simply allow the stop: it requires the marker to exist
  (writing it is a single command the guard's own message names), and it says plainly
  that the batch will now hand over. A permitted stop WITHOUT a marker BLOCKS, with the
  command to take the boundary — the opposite of today's silence.
  (b) A HANDOVER RELEASES THE LOCK. Taking the boundary releases the batch lock (or
  marks it handed-over) so the launcher's next tick spawns the successor instead of
  reading a live owner. The release happens only for a VALID boundary — a crash, a
  wedge or an ordinary turn end must still leave the lock held, exactly as now.
  (c) THE WEDGE DETECTION EARNS A CONSEQUENCE. `batch-autostart` already recognises
  "alive but heartbeat N minutes old" and only logs it. Beyond a calibratable age it
  must NOTIFY (`scripts/notify.mjs`, the ntfy topic) so a silent night is reported
  rather than discovered the next morning. It must NOT kill the owner: a long verify run
  legitimately starves the heartbeat, which is why the age alone may not spawn.
  FIRST LIVE FINDING, 28.07.2026 10:44 — the run has already paid for itself before it
  finished: `.claude/boundary.log` carries a line `FAIL-OPEN: the guard errored and
  allowed the stop (EPERM: operation not permitted, rename batch-lock.json.tmp-9904 ->
  batch-lock.json)`. The atomic lock write can fail on
  Windows — an antivirus or indexer holding the target for a moment is the usual cause —
  and the guard then fails open, which is right for a guard but means the HANDOVER was
  silently not written. A handover that reports success while the lock keeps its old
  content is the night's failure in a new costume. Make the marking of the lock
  RETRY briefly on EPERM/EBUSY, and where it still fails, say so in the same breath as
  the allow: the stop may proceed, but the session must be told the handover did NOT
  happen, so it does not stop believing the batch was passed on.
  SECOND LIVE FINDING, 28.07.2026 11:00 — the boundary is WITHDRAWN by the very work the
  other guards demand. Taking it writes a marker; any further work withdraws it again
  ("the session is working again; the lock stays held"), which is right in itself. But the
  Stop chain routinely sends a session back to work AFTER the boundary is taken — a
  missing timestamp, an unreviewed mechanism commit, a dashboard whose HEAD moved — and
  each of those rounds silently un-takes the handover. Three rounds happened on the first
  live run, and every one ended with the guard reporting the batch as standing still. A
  boundary that only survives a turn with nothing left to do is not a mechanism, because
  the Stop chain's whole purpose is to find something left to do. FIX: the withdrawal must
  distinguish work that CONTINUES the batch from work a Stop guard DEMANDED — the latter
  is part of ending, not of carrying on. Simplest honest shape: the marker survives edits
  confined to the closing set (the board, the review ledger, the work order's own point)
  and is withdrawn by anything else. Whatever the shape, the acceptance is the same as
  below: one observed handover, not a green unit test.
  THIRD LIVE FINDING, 28.07.2026 11:20 — the UNIT SUITE writes into the REAL handover log.
  `.claude/boundary.log` carries lines "WITHDRAWN point 388 by s1", and `s1` is the test
  session id from `scripts/batch-singleton-core.test.mjs`. So a test run — which the
  pre-push gate performs on every push — reaches into the live batch state and can
  withdraw a boundary a real session has taken. The cores must be given their paths by
  their caller (a temp dir in the test), and no test may fall back to the repo's
  `.claude/`; a pure test asserting that the default paths are NOT touched when a base dir
  is passed keeps it that way.
  THE WEDGE ITSELF, 28.07.2026 11:40 — finding 1 is not a fluke, it is the failure. The
  boundary stop runs its course three times over and dies in the same place each time
  (07:03:01Z, 08:59:13Z, 09:35:31Z): the guard REACHES its boundary branch, CONSUMES the
  marker, and then the lock write throws `EPERM … rename batch-lock.json.tmp-<pid> ->
  batch-lock.json`. The throw escapes the branch, the fail-open wrapper catches it, logs
  FAIL-OPEN and allows the stop. Marker gone, no HANDOVER line, no handed-over flag — and
  the next turn the guard demands the boundary again, which is the loop this point was
  opened on. THREE OF THREE is not an antivirus fluke; find the concurrent writer (the
  PostToolUse heartbeat and the Stop guard reach for the same file at the same moment) and
  fix the write: retry with backoff, an exclusive-create lock or an in-place write, as the
  cause dictates. Two properties matter more than the mechanism chosen. The marker must
  NOT be consumed unless the handover actually succeeded — order it the other way round or
  restore it on failure. And `markHandover` must never take the whole guard down with it:
  a failure is reported IN the allow, "the stop may proceed, but the handover did NOT
  happen", so a session never stops believing it passed the batch on.
  IDENTITY, a hardening and NOT the fix (the same day's mis-diagnosis, corrected here
  rather than told as a story). Ownership hangs on the session id, and a context
  compaction mints a new one — so the reasoning that identity belongs on something stable
  stands, and the lock already records `pid` and `pidStartedAt`. But the marker WAS
  consumed at every attempt, which proves ownership resolved as ours, so this was never
  what wedged the batch. Do it if it is cheap and safe, pinned by a pure test (same pid +
  pidStartedAt but a different session id resolves as `mine`, a different pid does not, a
  stale `pidStartedAt` from a reused pid does not either) — and never let it widen
  ownership so far that a genuinely second window passes as ours, which is the one thing
  the singleton exists to prevent.
  FIFTH LIVE FINDING, 28.07.2026 11:55 — the guard cannot see work that is IN FLIGHT, so
  it cannot tell waiting from idling. Its own text names polling as the sanctioned way to
  wait ("WAIT by POLLING within this turn"), but nothing a polling session does satisfies
  it: with three delegated agents building and a browser suite running, every attempt to
  end the turn was blocked with "DO NOT STOP THE BATCH — continue the NEXT queue item now",
  eight times in a row. The queue item cannot be continued — the pool is at its cap and the
  next item needs the machine the suite is using — and the turn cannot end, so the session
  writes reply after reply that never reaches the user. The batch is not idle; the guard
  merely has no way to know. FIX: give the session a way to DECLARE what it is waiting on,
  the way `prep-guard --prepped` already works — a marker naming the in-flight work
  (agent branches, a running suite) and the time it was set. The guard then allows the stop
  while that work is provably still running and blocks again the moment it is not, so an
  abandoned wait still cannot become an idle night. Do not simply weaken the block: the
  five-and-a-half-hour standstill is what it exists for.
  TEST THE WHOLE CHAIN, NOT THE PARTS (user 28.07.2026). Every part worked last night
  and the batch still stood still, so a green unit layer proves nothing here. The
  acceptance is ONE observed handover end to end: a point closed, the boundary taken,
  the lock released, the launcher's next tick spawning a successor, and that successor's
  first turn picking up the next point — read out of `.claude/autostart.log` and the new
  session's own commits, never inferred. Run it in this repository at a real point
  boundary and record the log lines with their times. If the chain breaks anywhere, that
  break IS the finding and the point stays open.
  VERIFIABLE: pure Vitest — a met boundary without a marker blocks and names the
  command; with a marker it allows and the handover is recorded; a crash-shaped stop
  does not release the lock; the wedge notification fires once past the age and not
  again for the same owner. Live: one real boundary in this repository, with
  `.claude/autostart.log` showing the spawn and the successor's first turn picking up
  the next point — the acceptance point 373 could not yet show.
  DOCS in the same commit: CLAUDE.md §6's context-boundary bullet (it currently
  describes the half that exists) and `docs/batch-autonomy.md`.

## Closing (only after all points)

New points are appended BEFORE this section — it stays last in the file.

The closing cycle itself is CLAUDE.md §9: the machine-readable checklist in
scripts/closing-guard-core.mjs is the authority, and the PreToolUse guard denies a
version tag until every step is recorded with evidence. A standalone closing run may
also be taken as its own task now and then.
