# Test architecture (hybrid: Vitest + Playwright)

Shared boot helpers for suites and probes live in `_boot.mjs` (bootGame,
enterTravel, jumpAndEnter) — new scripts use them instead of repeating the
launch/clear/wait boilerplate. Per-point runs are SCOPED (Vitest always,
browser suites by the diff mapping in TASKS.md); when the full chain is
mandatory is stated once, in TASKS.md beside that mapping.

The regression is split in two layers so the bulk runs in **seconds** and can
never flicker on RAF/browser timing, while the handful of things that truly
need a real browser stay in Playwright.

| Layer | Where | Runner | What it covers |
|---|---|---|---|
| **Vitest (jsdom)** | `src/**/*.test.ts[x]` | `npm run test:unit` | Pure logic, store transitions, and HTML-HUD component classes/text. No browser, no dev server; the whole layer runs in seconds. |
| **Playwright** | `scripts/verify/*.mjs` | `npm test -- <suite>` | Only browser-dependent checks: the R3F/three scene + RAF wildlife, real layout geometry, canvas/WebGL init, pointer-lock, TTS audio, the CLAUDE.md §7.2 acceptance screenshots, and one end-to-end core flow. |

```
npm run test:unit     # fast Vitest layer only (jsdom)
npm run test:watch    # Vitest in watch mode
npm run typecheck:test # tsc over the test files
npm test              # full (LARGE) regression: build + lint + test-types + vitest, then EVERY browser suite + preview
npm run test:small    # build + lint + vitest, then the SMALL everyday browser gate (no preview)
npm run test:large    # == npm test (explicit LARGE)
npm test -- unit      # just the vitest stage, via the full runner
npm test -- flow      # just the named browser suite(s) (dev server managed for you)
```

`npm test` runs, in order: type-check + build → lint → **vitest (fail-fast)** →
the Playwright browser suites against the dev server → the production-preview
smoke test. The runner itself is `scripts/verify/run-all.mjs`; the three npm
commands above reach it through the LOGGED wrapper described next.

### In a WORKTREE, bootstrap the dependencies FIRST (points 569/573/606)

```
node scripts/worktree-bootstrap.mjs      # first command in a new worktree; no-op in the main tree
```

`node_modules/` is git-ignored, so a git worktree — where CLAUDE.md §6 builds
every point — checks out without it and **no gate can start**: npm resolves
`vitest` and `oxlint` from `node_modules/.bin` before a script runs. The
bootstrap derives the main checkout from git's COMMON directory
(`git rev-parse --git-common-dir`, whose parent is the main working tree), and
links its `node_modules` when the two `package-lock.json` files are byte
identical — seconds instead of a per-worktree install. A branch that CHANGED the
lockfile gets a real `npm ci` instead, because linking would silently verify
against the wrong dependency tree. The decision table is pure in
`scripts/worktree-bootstrap-core.mjs`.

Remove such a worktree only with `scripts/worktree-cleanup.mjs`: it DETACHES the
link first, where `git worktree remove` and `rm -rf` follow it and delete the
main tree's dependencies.

**Anything a test SPAWNS resolves through `scripts/local-bin.mjs`, never through
`process.cwd()`.** That is the fix behind those points and the rule that keeps
them fixed — see "A spawn that never ran is not a rejection" below.

### The run's output goes to a FILE, the caller reads a digest (point 373 e)

`npm test`, `npm run test:small` and `npm run test:large` run through
`scripts/verify/run-logged.mjs`, which spawns the runner, writes its WHOLE
output to `local/verify-logs/<stamp>-<label>.log` (git-ignored) and lets the
caller read a bounded selection instead of the transcript. The reason is context
cost, not tidiness: a green run prints one line per suite, but a red one echoes
the entire vitest dump or build error — and a background run pays for that again
on **every poll**. Measured on a red unit run (07.08.2026): **476 lines / 30 542
chars → 66 lines / 3 782 chars**, of which only 15 lines arrive while the run
goes (what a poll sees). The digest is BOUNDED — at most `--keep` structured
lines plus a `--tail`-line raw tail — so the factor grows with the size of the
run, and a LARGE regression's transcript is many times a unit run's.

What the caller still sees — the constraint the selection is built around is
that a **failing run stays fully diagnosable**:

- LIVE, while it runs: the runner's own structured lines only — the per-suite
  `PASS/FAIL/SKIP` verdicts, the stage headings, the retry/flake notices, the
  indented `FAIL …` / `ERR: …` echoes (vitest's own ` FAIL  file > case` lines
  wear that shape too). About one line per suite, so a background poll shows
  progress and a red suite names itself the moment it goes red.
- AT THE END: exit code, duration, how much was captured, the log path, the
  FAILING units by name with their first failing checks, and — only on a
  failure — the last ~40 raw lines, which catch a crash stack no pattern names.
- ON DEMAND, never `cat`:

```
node scripts/verify/run-logged.mjs --show <log> --tail 120
node scripts/verify/run-logged.mjs --show <log> --grep "FAIL|ERR:|Error" --max 60
```

Flags the wrapper consumes (everything else is forwarded to `run-all.mjs`
verbatim): `--stream` echoes every raw line (the pre-373 behaviour), `--quiet`
drops the live echo and puts the structured lines in the end digest instead,
`--keep N` / `--tail N` set the two budgets, `--log-file P` picks the log path.
`npm run test:e2e` is the unwrapped runner for when the raw stream is wanted.

Which lines survive is the pure module `scripts/verify/run-digest-core.mjs`,
pinned by `run-digest-core.test.mjs` in the Vitest layer — including the
asymmetry that matters: an indented block continuing a `#` heading is kept (the
quiet-machine report), an indented failure dump following a verdict line is not.

### A run is AWAITED, never polled (point 592)

Measured over six days (09.08.2026): **2857 responses were polls — 10.9 % of the
weighted spend** — and another 1189 were bare idle holders (3.6 %). The longest
unbroken poll chain was **437 responses** for a result that is one word, and a
42-minute LARGE run polled every 30 s costs ~1.9 M weighted **for the loop
alone**. So the loop is gone, and three things replace it.

**1. Ask what the run costs before you start it.**

```
node scripts/verify/run-wait.mjs --plan large    # or small, or a suite name
```

It answers from the measured medians of `docs/picture-check-cost.md` §1 (kept in
lockstep by `run-wait-core.test.mjs`, which parses that table back out): how long
the run is expected to take, how many frames it owes, and — the decision that
matters — whether it may be **one blocking foreground call** at all, or is longer
than a shell call may run and has to go to the **background**, where the harness'
own completion notification announces the exit.

**2. Await it.**

```
node scripts/verify/run-wait.mjs --await [<log>] [--timeout <s>]   # ONE blocking call
node scripts/verify/run-wait.mjs --receipt [<log>]                 # a finished run, again
```

`--await` returns when the run is over and prints its receipt; neither counts as
a poll, because nobody looked. With no `<log>` both resolve the newest run.

**3. Where a look is genuinely unavoidable, it is COUNTED.**

```
node scripts/verify/run-wait.mjs --status [<log>]
```

The first wait is **0.9 × the measured median**, not 30 s; five looks are the
whole budget; past **2.5 ×** the expectation the run is *hung*, not slow. Each
`--status` raises the count, says how many are left, and names the two ways out.
The count is printed in the receipt, so the rule is visible in the transcript
rather than remembered.

**The receipt.** `run-logged.mjs` writes a RUN RECORD beside the log
(`<log>.run.json`) before it spawns anything and closes it with a structured
receipt: exit code, the backend(s) read off the run's own banners, the suites,
the `git HEAD` it ran on, the log path, the failing names **uncut**, the polls,
and **frames expected against frames written**. That last pair is the half point
375 cannot see — its shutter refuses a frame whose subject is missing, but a
frame that was never written at all is silent, and a run that photographs 60 of
its 94 frames exits 0 today. The expectation is a measured **floor** (the table
of 09.08.2026 plus `startup`'s one frame, which the recorder never logged), so
*fewer* is the alarm and *more* only means suites have gained frames since.

The **backend** in the receipt is the lane each suite really opened, not the pass
it sat in: `laneFor` routes `touch`/`voice` to WebGL 2 inside a WebGPU gate, so
an unpinned `npm test -- voice` reports WebGL 2 and a SMALL run reports both.

**The wait is still visible.** Point 402 (b) demanded polling because a silently
waiting session was indistinguishable from a dead one. That is now the hook's
job, not a model turn's: duty (8) of `scripts/lock-heartbeat-hook.mjs` writes the
`batch-in-flight` declaration while a run is provably going — same file, same
shape, same evidence `batch-progress-guard` re-probes at every turn end — and
withdraws it the moment the run is over, so the guard blocks a stop again exactly
when the result becomes the session's next action. The decision is pure in
`scripts/wait-marker-core.mjs`; it never overwrites a declaration a person wrote,
never fires for a non-owner or a paused batch, and refuses a run whose log has
gone quiet (that is a wedge, not a wait).

### Host bring-up — once per machine (point 475)

The browser suites need a browser, and `npm install` does not put one there. One
documented command does, on every platform:

```
npm run verify:bringup          # install what is missing, then report
npm run verify:bringup -- --check   # report only, install nothing
```

**No suite ever installs implicitly** — a regression that quietly downloads
~180 MB mid-run is a surprise, not a convenience — so a fresh machine runs this
once and never again.

| Lane | Needs | Where it comes from |
|---|---|---|
| WebGL 2 (`VERIFY_GL=webgl`) | Playwright's **bundled** Chromium | `npm run verify:bringup` installs it (`playwright install chromium`). |
| WebGPU (`VERIFY_GL=webgpu`) | A **system Chrome/Chromium** (point 184) | A package manager, so it needs root: `npx playwright install --with-deps chrome` on Linux (a distro `chromium` serves it too), `npx playwright install chrome` on Windows/macOS. The bring-up reports its absence with the command; it cannot install it for you. |

**The report and the launch name the same browser.** On Linux the bring-up PROBES
(`google-chrome`, `chromium`, `/opt/google/chrome/chrome`, `/snap/bin/chromium`, …)
and the lane launches the path it found, as Playwright's `executablePath`. Handing
the path over is what makes the report honest: the `chrome` CHANNEL resolves, inside
playwright-core's registry, to `/opt/google/chrome/chrome` and its beta/dev/canary
siblings and **nothing else**, so a chromium-only host used to be reported "present"
and then die on Playwright's generic channel error. Windows and macOS are not probed
at all and keep the historical `channel:'chrome'` launch byte for byte. Whether a
particular build really brings up a headless WebGPU adapter is not a probe's question:
`assertBackend` answers it on the running renderer, and a lane that came up on WebGL 2
fails loud.

The **graphics stack is chosen by platform** (`launch-args-core.mjs`, swept by
`launch-args-core.test.mjs`): Windows keeps `--use-angle=d3d11` exactly as it always
had it, macOS `metal`, and Linux gets `--use-angle=gl` with `GALLIUM_DRIVER=d3d12`
in the browser's environment. That pair is what reaches the GPU behind `/dev/dxg`
in the WSL container — `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX
4070 Ti), OpenGL 4.6)` — measured at 170 renderer calls per second against the 22.7
of the SwiftShader lane it replaced (point 493; the `flow` suite went from red and
unfinished after ten minutes to green in 58 seconds). Both halves are load-bearing:
without `libgl1`/`libegl1` ANGLE has no driver to open, and without the Gallium pin
Mesa 25 serves llvmpipe while every interface still looks healthy. `VERIFY_ANGLE`
and `VERIFY_GALLIUM` override either without touching the code (`VERIFY_GALLIUM=none`
sets nothing at all). Linux additionally launches with `--no-sandbox`,
`--ignore-gpu-blocklist` and `--disable-dev-shm-usage`, which container images need;
Windows and macOS keep their argument list unchanged.

The **WebGPU lane rides the same GL chain** on Linux, through Dawn's OpenGLES
backend: `--use-gl=angle --use-angle=gl --use-webgpu-adapter=opengles
--force-webgpu-compat` (point 505). Vulkan is a dead end here — the only Vulkan
device is Dozen, whose `fullDrawIndexUint32 = false` Dawn's Vulkan backend
refuses, so it falls back to its bundled SwiftShader and no flag reaches into
that (`docs/host-environment.md`). The GLES path bypasses Vulkan entirely and
draws on the 4070 Ti: 103.7 renderer calls per second against the software
lane's 15.3, 487 KB frames against 29 KB.

Where the GL chain is absent the lane keeps the SOFTWARE flags —
`--use-angle=swiftshader --enable-features=Vulkan --use-vulkan=swiftshader`, all
three — because Dawn's GLES backend would have nothing to open. `hasHardwareGlChain`
(`system-chrome.mjs`) decides, and the two sets never mix: with the stacks left to
disagree the lane reports an adapter, initialises `isWebGPUBackend` and paints
NOTHING (`Instance dropped in popErrorScope`, a black canvas behind a live HUD).
`backend-lane-check.mjs` prints the GL chain beside the adapter on this lane —
Chrome hands an unprivileged page an all-empty `GPUAdapterInfo`, so the adapter
string alone could never label a software rasteriser as one.

**The FEATURE LEVEL is the third signal**, beside backend and drawn pixel. three.js
always requests `compatibility` and then decides by `core-features-and-limits`: the
GLES adapter carries none, so three sets `compatibilityMode`, drops MSAA and runs
compat branches the player never enters. `assertBackend` reads the level and hands it
to the run recorder (`featureLevel` in each record; `render-verify-guard.mjs status`
prints it), and `coveringRun(runs, backend, since, {featureLevel:'core'})` refuses a
compat run — and a record written before the level existed. Without it the gate would
book compat as coverage of the player's path, the same confusion class as software
reported as hardware. Unasked, the gate still judges by backend alone: on a host whose
only WebGPU adapter is compat, demanding core would block every render change with no
way to clear it.

Without a system Chrome the **WebGPU lane fails LOUD** — `WebGPU backend
unavailable on this host` — and stops. It is never quietly served by WebGL 2, and
because nothing launches, no run record is written, so `render-verify-guard` cannot
mistake the attempt for WebGPU coverage: a WebGL 2 picture says nothing about the
WebGPU one (point 210).

### The fast layer's timeout is load-proof, not tight (point 398)

`vitest.config.ts` sets `testTimeout: 20_000` (and the same for `hookTimeout`).
Vitest's default is 5000 ms, and that bar could not survive this project's own
steady state: on 28.07.2026 `npm run test:unit` went red on `main` twice within
ten minutes while delegated agents were building — 2 failures, then 5 — and
every single one was `Test timed out in 5000ms`, not one an assertion. Run
alone on the same commit the same files passed (`src/render/water.test.ts` in
1.55 s, the `crocodileIdleYaw` case in 2.27 s). The cause was the MARGIN: the
slowest honest cases here do real work — a git probe, a heavy constructor, a
child process — at 1.5–2.3 s of a 5 s budget, so any load at all doubles them
past it. The consequence was not a cosmetic red: `pre-push-gate` blocked the
push, and its retry did not save it, because the load reading was taken after
the step, when the machine already read quiet again (that half is fixed too —
see the push-gate section below, where the opening reading and `worseLoad`
live). These are deterministic pure-logic and jsdom tests: a case that passes in
2 s and one that HANGS are orders of magnitude apart, so the generous ceiling
costs nothing on a green run and still fails a real hang.

It is not a licence to get slow. `slowTestThreshold` is pinned at 1000 ms, so
every case over a second is still printed with its duration and a test growing
from 2 s to 15 s stays visible instead of hiding inside the larger budget. A
single case that legitimately needs longer gets **its own** explicit timeout
(third argument to `it`) — the floor is not raised a second time. All three
values, and a deliberately hanging case that must still be failed rather than
stall the suite, are pinned by `src/test/vitestConfig.test.ts`.

### Regression tiers (point 173)

The browser suites split into two selectable tiers, so a change can be gated at
the right cost (the regression-tiers rule: per task, pick Vitest-only /
Vitest+SMALL / Vitest+LARGE; the **closing cycle ALWAYS runs LARGE**):

| Tier | Command | Backend | Browser suites | Preview |
|------|---------|---------|----------------|---------|
| **SMALL** (everyday gate) | `npm run test:small` | WebGPU | `docs, i18n, flow, health, events, collision, voice` — fast, low-flake, core coverage (doc/i18n consistency, the one E2E core loop, health/events/collision, TTS) | no |
| **LARGE** (default) | `npm test` / `npm run test:large` | WebGL 2, then WebGPU | **all 18** — SMALL plus the heavier scene/geometry/screenshot suites (`world, handwriting, polish, gamepad, touch, settings, invariants`), `startup` (the point-337 loading-picture freeze budget), `benchmark` (the in-game F8 measurement run), `report` (the F6 bug-report archive, whose PNG member is decoded and checked for real scene content) and `enrichments` (the wildlife/atmosphere staging, which carries the rotating family flakes) | yes |

Both tiers run the same Vitest + build + lint preflight. SMALL is a strict subset
of `DEV_SUITES`; keep it that way. New heavy or flaky browser scenarios join
LARGE only (they must not slow or flake the everyday gate).

The suite→tier→backend map itself is a **pure module**: `scripts/verify/tiers.mjs`
holds `DEV_SUITES` / `SMALL_SUITES` / `WEBGL_ONLY_SUITES` / `DEFAULT_BACKEND` and
the arg, suite, lane and backend-plan functions `run-all.mjs` drives, and
`scripts/verify/tiers.test.mjs` pins them in the Vitest layer (the subset rule,
the WebGPU default, the touch/voice lane, and that a bare LARGE run plans
WebGL 2 → WebGPU while a pinned `VERIFY_GL` / SMALL / a bare suite filter stays
single-backend). Change the map in `tiers.mjs` and this README together — never
only in the runner.

`scripts/verify/textureLeak.mjs` is the second such pure module: the verdict and
the per-kind survivor breakdown of the TRAA-toggle render-target gate in
`settings.mjs`, pinned by `scripts/verify/textureLeak.test.mjs`. Its lesson is
worth generalising (point 334): **a browser reading is only evidence at a steady
state.** The gate compared two raw `renderer.info.memory.textures` samples taken
600 ms after a toggle — but a rebuilt post pipeline allocates its render targets
only on the next RENDERED frame, and a headless page nothing forces to paint
falls to zero rAF ticks for seconds (36 frames per 600 ms while screenshots
flow, 0-2 once they stop). Sampling that dip as the baseline made a fully
disposed-and-rebuilt pipeline look like a +14 leak on WebGPU only. Any check
that samples a lazily allocated resource must force a frame and poll until the
reading repeats.

That reading is now a STANDING invariant, not one gate (point 295):
`src/render/renderLeak.ts` is armed in every DEV session before the first frame
and files each settled `renderer.info.memory` reading under a signature of the
levers that legitimately change the resident set — scene mode and settlement,
detail level, TRAA/SSAO/bloom, sun and fire shadows. A RETURN to a signature that
costs more render targets than before is a `console.error` through `devAssert`
(so every suite's console-error gate fails on it) plus an entry in
`window.__renderLeak.state()`. Two calibrations from the measurement, both worth
knowing before touching it: the first settled reading after entering a
settlement lands while the place is still building (Cairo: 18 render targets
where its steady state is 22), so a signature spends its first TWO readings
forming a high-water baseline; and the texture half is deliberately coarse with
a ratcheting baseline, because terrain, flora and settlement materials keep
streaming in — the render-target half carries the strictness. The bound and
settle logic is pure (`src/render/renderLeak.test.ts`); the live half is in
`settings.mjs`, which walks the transitions three times, asserts nothing trips,
then leaks six real render targets and asserts that it does. One thing to know
while WORKING on the pipeline: editing `src/render/Effects.tsx` to add or drop a
pass legitimately changes the resident set under an unchanged signature, so the
next transition reports a leak until the page is reloaded — `window
.__renderLeak.reset()` in the console clears the recorded baselines without one.

`scripts/verify/liveness.mjs` is the third: the main-thread block attribution
behind `voice.mjs`'s TTS cold-load gate, pinned by
`scripts/verify/liveness.test.mjs`. Its lesson is the point-334 one from the
other side (point 304): **a stalled picture is not a stalled thread, and the
system under test is not automatically to blame.** The gate used to measure the
raw gap between `requestAnimationFrame` timestamps and charge the TTS cold load
for it. On a quiet machine that read ~15 000 ms — and reproduced unchanged with
the TTS worker stubbed out entirely: it is the startup frame awaiting the
scene's shader-program links (`GLES2Implementation::GetProgramiv` →
`CommandBufferProxyImpl::WaitForGetOffset` in a CDP trace), one ANIMATION FRAME
spanning 15 s while a 50 ms `setInterval` kept ticking with a 63 ms worst gap —
the main thread was never blocked. So liveness is measured on a timer train
(no compositor involved) and each stall is attributed: the part covered by the
page's own frame callbacks is the renderer's and is reported, the rest is what
the gate binds. `VOICE_STALL_SELFTEST=5000` injects a real 5 s main-thread busy
loop into the cold-load window to prove the gate still bites.

`startup.mjs` (point 337) is the other side of that same coin, and it uses the
same module for the opposite verdict. The startup shader compile that point 304
correctly *excused* is itself the defect — a frozen picture is a frozen picture
however free the thread is — so this suite measures both trains from document
start and gates their MAXIMUM against the balance value
`balance.startup.pictureFreezeBudgetMs`, reporting the attribution split
instead of subtracting it. That matters because the defect has two different
shapes: on WebGL 2 it blocked the thread for 21 s inside two animation frames,
on WebGPU the thread stayed free (worst stall 1.0 s) while nothing was painted
for 12.4 s. `STARTUP_STALL_SELFTEST=1` restores the old blocking path through
the dev hook `__asyncPipelinesOff` and asserts the gate goes red — 17.5 s
(WebGL 2) and 6.7 s unpainted (WebGPU) against 2.7 s and 1.4 s with the fix on,
re-measured 27.07.2026 on a quiet machine. The attributed block stayed at
0.3-0.5 s throughout, which is exactly the number that must NOT be the one
gated; the full table is in `docs/acceptance-evidence.md` §14.

Its measurement window closes on the picture, never on a clock. A fixed tail is
a wall-clock guess of the very quantity being measured: on a slower machine it
ends mid-stall and under-reports the standstill the gate exists to catch. So the
window closes on `pictureSettled` (`liveness.mjs`) — a trailing stretch in which
the tick train never gapped and frames kept being painted, required to reach
BOTH edges of that stretch so the quiet tail of a freeze that just ended cannot
pass for a live picture. The predicate is pure and unit-tested
(`liveness.test.mjs`), including the case that it survives being stringified
into the page, which is how the suite runs it where the sample trains live.

The same run found that the suite's "neutral" first-gesture key had stopped
being neutral: F8 starts the in-game render benchmark (point 277), which swept
ten graphics configs inside the measurement. A verification's filler inputs need
re-checking whenever the game binds a new key.

`scripts/verify/animalShare.mjs` is the fourth: the decision layer of the
lurking-crocodile check in `enrichments.mjs` (design.md §19.16), pinned by
`animalShare.test.mjs`. Its lesson (point 382) is about what a pixel check is
allowed to compare against: **judge a picture by something IN the picture, never
by a hand-set number.** The check asked whether a lunging crocodile reads as an
ANIMAL rather than as water, and answered it with an absolute channel delta
between two rect means against a threshold of 45 — so it decided on the second
decimal of a colour average, read 44.2 and 44.6 in one evening on a quiet
machine, and 37.5-45.7 across fifteen frames on both backends — landing on the
passing side of its own 45 exactly once. The picture was never in
doubt; a mean over the rect dilutes the body with the water beside it, and the
dilution moves with the projection. The replacement measures the share of a rect
whose colour sits further from that frame's OWN water colour than a fixed
multiple of the water's OWN spread: scale every colour distance by any factor
and the share does not move, so brightness, exposure, backend and zoom cannot
flip the verdict. The criterion is written once and the check FEEDS IT THE
HIDDEN FRAME, asserting it still says no — a threshold that only ever sees
today's good picture has no proven teeth.

Its second lesson is about staging. Half the spread was not the measure at all:
the traveller drifts downstream for a wall-clock-dependent stretch after the
jump, and the staging's water-cell search starts from wherever he ended up, so
one run sampled the falls' foam as its water reference and another the "Unknown
waterfall" map label as its water. **A check that stages a scene must pin what
the scene depends on before anything can move it** — the drift freeze moved to
the jump, and three separate sessions then staged the identical cell and rect.

### Running ONE section of a suite (point 566)

```
npm test -- enrichments --section=crocodile-hidden   # one block, not the pass
node scripts/verify/run-all.mjs enrichments --section=nope   # names every section
```

Repairing a single check used to cost a whole suite pass. Measured 08.08.2026 on
point 342: the feature took 22 minutes, the remaining four and a half hours were
verification — and two of the three repair commits repaired the CHECK, not the
game. Each replayed `enrichments` whole (251 checks, >17 min on the WebGL 2
lane), then again on the second backend.

A name filter on `check()` buys nothing here: the suites are linear scripts —
boot, jump, wait for herds, assert, jump on — and the cost is the navigation, the
waits and the screenshots, not the assertion. So the skippable unit is a
**section**: a named block that owns the setup it needs plus its checks. The
`// --- … ---` comments were already those boundaries; `section('<slug>')` in
front of each turns one into a declaration.

- `scripts/verify/sections.mjs` is the pure module (pinned by `sections.test.mjs`):
  `listSections` reads the declarations out of the suite SOURCE — no hand-kept
  list to drift — and `resolveSelection` decides what a request means.
- The runner validates the name **before** it builds or boots anything and
  refuses an unknown one naming every section that exists. A typo must never boot
  a browser, assert nothing and exit 0.
- Every `PASS`/`FAIL` line carries `[--section=<slug>]`, appended after the
  detail so the check's NAME (and with it the red ledger and the baseline
  classifier) is unchanged — a failing check thus prints the argument that
  re-runs it alone.
- **A `--section` run is PARTIAL and is never coverage.** The run recorder stamps
  `partial` on the record from `VERIFY_SECTION`, and `runVerdict` refuses it
  whatever the exit code, so `render-verify-guard` cannot be cleared by one. This
  is the repair loop; acceptance and closing runs stay whole-suite.
- **A selected section that never EXECUTED fails the run.** `listSections` reads
  the source as text, so a name surviving only inside a comment (or behind a
  branch nothing reaches) would otherwise boot a browser, assert nothing and
  exit 0. The suite checks `sections.unrun()` at its end and fails on it: a green
  that proves nothing is the one outcome that would make this mechanism
  dangerous.
- Sectioning a further suite is additive: wrap each block in
  `if (section('<slug>')) { … }` and give each block the jump/wait it inherited
  from the one before. A suite that declares none keeps working unchanged and
  refuses `--section` with that reason.
- **Which suites are sectioned (point 595 finished what 566 began).** Every
  browser suite is, except two that are ONE measurement each and would gain a
  single section naming the whole file: `startup` (one liveness window across the
  whole load) and `benchmark` (one F8 sweep, which every check afterwards reads
  out of the same report). `docs` drives no browser at all. `invariants` is
  sectioned by ROUTE STOP, and its declarations therefore SELECT a stop rather
  than wrap a block — the two invariants are judged over the driven route at the
  end, so a partial run judges them over the stops that ran.
- **A partial run must not damage the runs after it.** `voice` records the TTS
  asset cache (point 88) and seals it as COMPLETE at the end; one section asks
  for a fraction of the assets, so the seal is skipped on a partial run
  (`sections.partial`) — otherwise the cheap rung would make every later STRICT
  run abort on a gap it created itself. A suite that WRITES a shared artefact
  owes the same check.
- **A section is a BLOCK SCOPE, so anything two of them share lives ABOVE
  them.** A helper declared inside one block is invisible to the next, and
  nothing says so until the browser run reaches the call: `pinFamily`, declared
  in `calf-predation-drama` and used from `coastal-walk-off`, aborted the whole
  `enrichments` pass after 176 of 251 checks — 27 minutes to find. That class is
  now caught in the FAST layer: `.oxlintrc.json` arms `no-undef` over
  `scripts/**/*.mjs` (with the browser AND node global sets, since these files
  carry `page.evaluate` callbacks), so `npm run lint` refuses it in a tenth of a
  second, and `scope.test.mjs` keeps the rule armed by running the real config
  over a fixture of exactly that shape.
- **The delegation brief ROUTES a render point here (point 595).** The rung
  existed and was unused: checked 09.08.2026, `--section` appeared in this file
  and in `tiers.mjs` and nowhere else — in no brief, no agent prompt, no rule
  text — and not one recorded render-verify run was partial. So
  `scripts/point-brief-core.mjs` carries the VERIFICATION LADDER in the brief of
  every point whose spec can move a picture: section → suite → whole set while
  repairing, the full fast gate and the whole suite as the proof, the both-backend
  picture proof once, on `main`-merged-into-the-branch, with the verified
  `git HEAD` reported. It is a building block of the brief, not a paragraph
  somebody has to remember.
- **And the brief NAMES the check, with its sections (point 598).** The same
  brief carries a generated ORIENTATION: the paths the spec itself names with
  each file's own header line, what lives in their directories, and — read from
  the work order's own `Diff → browser-suite mapping` paragraph — which suite
  proves the point, followed by that suite's declared `--section` names. All of
  it is read from the tree at generation time (`readTree` in
  `scripts/point-brief.mjs`), so it cannot go stale, and all of it is framed as
  a HINT: the spec decides what changes, the block only says where to look. An
  unknown name lists the real ones, so `--section=list` is the way to see a
  suite's blocks without booting anything.
- **The one recurring defect is a section that does NOT own its setup**: it
  reads a scene the block before it staged, so it passes in the whole run and
  fails standalone. Where blocks genuinely share one staging they belong in ONE
  section; where they do not, the section repeats the jump itself. Prove it by
  running every section alone once and diffing its checks against the whole
  run's — that sweep is how `calf-jitter` and `elephant-trampling` were caught.

## A spawn that never ran is not a rejection (points 573/606)

Two rules, both from one defect. `scope.test.mjs` resolved its linter as
`resolve(process.cwd(), 'node_modules/.bin/oxlint')`, which does not exist in a
worktree — and the suite lied in **both** directions: its ACCEPT cases went red
for the environment (five per worktree run, which teaches the pool to discount
red), while its REJECT cases stayed **green**, because a spawn that never started
exits non-zero exactly like a tool that ran and refused. A lint rule the suite
exists to keep armed could have rotted away unnoticed.

1. **Resolve through `scripts/local-bin.mjs`**, never through `process.cwd()`.
   `findLocalBin(name)` walks up from the checkout, then reaches the MAIN working
   tree via git's common directory (a worktree outside the main checkout has no
   ancestor holding `node_modules`), then falls back to PATH; nothing found is
   REPORTED by `describeMissing` — the tool and every directory searched — not
   guessed. Where a red would only mean "this machine has no linter", the case
   SKIPS with that reason printed: a red must mean a defect.
2. **Establish that the process RAN before reading its exit code.** `didRun()`
   takes a spawn result and an optional `expect` shape for the tool's OUTPUT
   (never its NAME — the shell says `oxlint: not found` too), and `NOT_RUN()`
   words the failure identically everywhere. Any "it rejected" assertion goes
   through a helper that checks the run FIRST, so a missing binary reports itself
   instead of being counted as a verdict.

`scripts/verify/spawn-assertion-gate.test.mjs` keeps rule 2 from coming back: it
reads the test files, and a negative exit-code assertion about a spawned process
that nothing in its case establishes as having RUN turns it red. It is a pure
gate in the fast layer — the same build as the frame-subject gate, not another
Stop hook. Satisfy it by asserting something POSITIVE about that spawn's output
(`toContain` on its stdout/stderr) or by going through `didRun`; a `.not.toContain`
proves nothing, because empty output satisfies it.

## Is the machine QUIET? — before the run (point 296)

A timing verdict taken under load is not evidence. On 27.07.2026 that cost three
invalid runs and one wrong conclusion: `enrichments` was run while a full unit
run and two agents shared the machine, reported two failures, reported a
DIFFERENT one on the retry, and was called "a real failure, not a flake" — the
same suite was green on a quiet machine in exactly those checks. The same day, a
unit run produced four `Test timed out in 5000ms` failures in tests that pass in
582 ms alone; the cause was a dev server from an earlier verify run that nobody
had shut down.

So `run-all.mjs` reads the machine ONCE, before the preflight, through the pure
module `machine-load-core.mjs` (probe in `machine-load.mjs`, pinned by
`machine-load.test.mjs`). Three things are read: the CPU busy DELTA over a short
window, the GPU engine utilisation, and the process table — for another verify or
vitest run, a build, a vite dev/preview server, or an automation browser. The
run's own process tree is excluded; **a sibling is not**, because a second agent
under the same session is exactly the load worth seeing. Each leftover is reported
once per process TREE (raw, one dev server counts as two and one headless browser
as five), ours first, with the `taskkill`/`kill` line that ends it.

**The GPU is read because it is what these suites actually compete for (point
386).** The process table deliberately ignores a person's ordinary browser — right
for CPU work, wrong for the device the render suites draw with. A video is decoded
and composited on the GPU while the CPU stays near idle, and on the evening of
27.07.2026 the probe reported "QUIET, CPU 4 %" during exactly such a session and
was believed. On Windows the per-adapter engine counters (the ones the task
manager's GPU graph is drawn from) are readable without a new dependency: the
per-process rows of one engine are summed, the engines are then MAXed rather than
summed, and the pid never leaves the parsing function. The report says a number
and its consequence — `GPU 44 % — a video or another 3-D application is using the
device` — and nothing about which application it is or what the person has open.
The bar sits lower than the CPU's (20 % / 55 % against 35 % / 70 %) because a GPU
is a serialised device: another client's steady fifth is queue time our frames
wait behind. Where no such counter exists the probe SAYS so and the machine is
`unknown` — never quiet on an unmeasured device.

| Level | When | Effect on a pick containing `settings, enrichments, polish, startup, voice, benchmark` |
|---|---|---|
| `quiet` | CPU below 35 %, GPU below 20 %, nothing of ours running | run; its verdict is evidence |
| `busy` | CPU ≥ 35 %, GPU ≥ 20 %, or ANY leftover — an idle dev server counts, its damage is invisible to a CPU reading | run + FLAG (default), or defer |
| `loaded` | CPU ≥ 70 %, GPU ≥ 55 %, or a competing verify/vitest run | run + FLAG (default), or defer |
| `unknown` | the probe could not read the machine, or the GPU counter was unavailable | run; reported as unproven, never as quiet |

The label at the END of the run is asymmetric, and that asymmetry is the content:
**load produces false REDS, not false greens.** A green under load still counts —
under GPU load too; the new signal labels, it never blocks and never voids a green. A
red from a timing-sensitive suite under load is `UNDER LOAD — NOT AUTHORITATIVE`
and prints the command to re-run it alone. A failure with no red suite (a broken
build, a lint finding) is left unlabelled — load did not cause it, and a label
printed where it does not belong stops being read.

```
node scripts/verify/machine-load.mjs         # ask first: exit 0 quiet, 2 not quiet
node scripts/verify/machine-load.mjs --json  # same, machine-readable
npm test -- large --on-load=defer            # skip the run instead of flagging it
VERIFY_ON_LOAD=off npm test                  # switch the check off entirely
VERIFY_LOAD_FORCE=loaded npm test -- docs    # self-test the wiring on a quiet machine
```

This is the half that acts BEFORE a run; the section below is the half that reads
a red AFTER it, and they share their vocabulary (`load signature`, "judge a red
only on a quiet machine") because they describe one phenomenon from two ends.

### The PUSH GATE asks the same question (point 389)

The pre-push gate predates this rule and used to consult nothing, so it measured
the machine as much as the code: on 28.07.2026 `npm run test:unit` passed standing
alone, three times, while the same command inside `pre-push-gate.mjs` went red and
refused the push, on a machine the probe called "UNDER LOAD, CPU 45 % across 16
cores" because two delegated agents were working.

It now applies the asymmetry the suites apply. On a RED it reads the level through
this probe; if the machine is not quiet it re-runs THAT step ONCE and uses the
second result. Nothing else moves — a red on a quiet machine still blocks
immediately, a step that fails twice blocks whatever the machine says, and there
is no skip, no warn-instead-of-block and no bypass. Every retry PRINTS what is
being re-run and why, and the verdict line carries it too (`unit was re-run once
after a red taken under load` / `unit failed TWICE — the load was not the cause`),
because a silent retry would hide a real intermittent defect. The decision is pure
in `pre-push-gate-core.mjs` and pinned in `pre-push-gate-core.test.mjs`.

**Where the reading is taken, and what it costs.** The probe is a SNAPSHOT, and a
red produced while a neighbour was building can be followed a second later by a
quiet reading. So on the FULL gate a reading is also taken BEFORE the first step
and the WORSE of the two decides (`worseLoad`) — a machine seen busy at either end
was not quiet while the step ran. On the LIGHT gate it is not: measured
28.07.2026, the probe costs 2.6 s while `lint` runs in 0.5 s and `audit` in 1.6 s,
so a pre-reading would more than double a feature-branch push (agents push per
commit) to catch a spike that cannot hide inside a half-second run. `build` and
`unit` are the minute-long steps a whole storm fits inside, and there the same
2.6 s is noise. A green push pays for no probe at all on the light gate, and one
on the full gate; the re-run itself is timed and printed, so its cost is measured
rather than assumed. An unreadable probe reports `unknown`, which buys a re-run —
never quiet, never a certified red. A level the wrapper does not recognise is said
out LOUD and treated the same way: a silently drifted `--json` contract would turn
"a quiet red blocks immediately" into "every red buys a retry" on every machine
with nothing red to notice it, so the shape is pinned by a test that runs the CLI
with `VERIFY_LOAD_FORCE=busy` (asynchronously — a `spawnSync` inside a vitest
worker starves its own `onTaskUpdate` RPC and reddens the whole run).

### The gate also counts HOW MUCH ran (point 404)

A red run is not the only broken run. On 28.07.2026 one unit run reported **3546
passing tests while 34 test FILES had failed to load**; the run an hour earlier
had **4214 tests over 153 files**. A damaged dependency tree — a platform package
missing its entry file — makes whole suites unloadable, and an unloadable suite
does not fail: it VANISHES from the totals, so the report reads *greener* than a
red run. The same night the tree was destroyed outright (`node_modules` in the
main tree went empty when stale worktrees were removed, and the build failed with
"tsc is not recognized") — the same failure class, one step louder. Nothing in the
chain compared the number of EXECUTED files with the last known state, so every
gate waved it through; it was noticed only because a review agent could not start
the tests either and said so.

So the gate now captures the unit step's output as well as printing it, reads its
`Test Files` / `Tests` summary, and compares the file count with the **last green
run's own count** — never a hard-coded number, which would rot with every added
suite. The baseline lives in `.claude/pre-push-gate-state.json` (git-ignored, per
CHECKOUT: each worktree has its own dependency tree). Both numbers appear in the
gate's own line — `unit ran 153 files / 4214 tests` — so the size of the evidence
base is visible on a green push too, not only when it blocks.

#### The discriminator is on DISK, not in the memory

The first version of this gate blocked **once** and recorded the lower count as
it blocked, telling the pusher to run it again. That waves through exactly the
failure it exists to catch: a damaged tree drops 153 files to 119, push #1
blocks and records 119, push #2 — the tree *still* damaged, 34 suites still
invisible — passes, because 119 === 119. Nothing distinguished "understood and
deliberate" from "retried without fixing", and in this repository most pushes
come from autonomous agents whose natural reaction to a red gate is `npm ci` and
another push (four-eyes finding, verified at the extreme: a shrink to zero
recorded a baseline of zero, and the next zero-file run passed).

So the executed count is compared with the **checkout** first. A suite genuinely
DELETED leaves the tree; a suite that could not LOAD is still lying in it. The
gate walks the roots of vitest's own include globs (`src/`, `scripts/` — mirrored
in `TEST_FILE_PATTERNS` and pinned identical to `vitest.config.ts` by a test) and
counts the files present; `node_modules` is never descended, because the one
moment this number matters is the moment that directory is the broken thing.

| This run | Verdict |
|---|---|
| more files than the last green run | passes, baseline advances |
| the same | passes |
| fewer files, and **just as many on disk** | passes — the suites are gone from the tree; the baseline follows the deletion down, no second push needed |
| **files on disk that did NOT run** | **blocks**, naming the difference — regardless of the baseline, and records nothing |
| fewer files, tree **not countable** | **blocks** — it is unknown whether they were deleted or failed to load; records nothing |
| no baseline recorded | passes and records — *unless* files on disk did not run, which is how a fresh clone off an already-damaged tree is stopped from recording a poisoned-low first baseline |
| summary unreadable | passes, compares nothing, records nothing |
| the unit step itself was red | already blocked; its count is not taken as a baseline |

A block is therefore **not** cleared by re-running: it is cleared by repairing the
tree, or by pushing once with `HOA_ACCEPT_TEST_FILE_DROP=1`, the deliberate,
named second escape hatch — recorded in the state file as an `acknowledgedDrop`
block (`from`, `onDisk`, `at`, and `from: null` where there was no baseline at
all) so a waved-through drop stays auditable rather than looking like an ordinary
green. The state file is written through `scripts/atomic-write.mjs`, so a torn
write cannot garble the JSON into "no baseline at all".

The comparison, the glob translation, the parse (colour escapes and all) and the
state shape are pure in `pre-push-gate-core.mjs` and pinned in
`pre-push-gate-core.test.mjs`, which also greps the wrapper to prove it actually
asks the question; a garbled summary yields nulls and never throws.

#### When a green run exits non-zero

The parse is also what lets the gate recognise a runner that **died** rather than
a test that failed: a complete summary naming no failure, beside a non-zero exit.
Measured three times on 28.07.2026 — every test passing, exit 1, on a
`[vitest-worker]: Timeout calling "onTaskUpdate"` under constant load from
parallel agents. It still blocks (a run that could not finish proved nothing),
but the verdict now names what was *observed* instead of asserting a cause. The
old line "failed TWICE — the load was not the cause" was simply false: the load
never went away between the two runs.

### The COMMIT-MSG hook: a rescue must not mail the user (point 408)

The third versioned hook (`scripts/git-hooks/commit-msg`, wired by the same
`npm install` as the other two) runs `commit-scope-guard.mjs --message` — the
message half of the guard whose file half runs at `pre-commit`. It exists
because of one night on `feat/300-gait-matches-speed`: a delegated agent was
killed mid-build, its uncommitted work was committed and pushed at once
(durability first — nothing may stay only local), CI ran on that half-finished
state, went red, and mailed the repository owner. The follow-up commit was
green and `main` was never red; the whole cost was one failure mail for a state
nobody claimed was finished.

The fix is a commit-message convention, not a workflow change. A RESCUE commit
carries `[skip ci]` in its **subject**, which GitHub Actions honours for push
events, and a `Rescue: <what was interrupted>` trailer:

```
Keep the interrupted gait work [skip ci]

Rescue: agent killed mid-build; the next commit finishes and runs CI.
```

**Both halves or neither** — that is the whole design. A rescue trailer without
the marker still mails the user, so it is refused naming the marker; a bare
`[skip ci]` silently skips a real gate, so it is refused naming the trailer —
and with it every other spelling GitHub honours, anywhere in the message:
`[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`, and the unbracketed
`skip-checks: true` trailer that reads like nothing at all. Only the SUBJECT
marker satisfies the rescue half, because that is the placement the convention
states and the one a log line shows. An ordinary message is untouched, and a garbled or
unreadable one blocks nothing: the decision is `evaluateCommitMessage` in
`commit-scope-guard-core.mjs`, pure, fail-open and pinned in
`commit-scope-guard-core.test.mjs`, which also drives the guard over a rejected
and an accepted message so the wiring is proven by running it.

Durability is untouched: the commit still exists, still pushes, still survives
the session. Only the run is skipped — and the NEXT commit on that branch, the
one that finishes the work, carries neither marker nor trailer and runs CI
normally.

The convention is unchanged by point 513, only its reason has narrowed: a branch
run mails nobody now, so what the marker still buys is that a half-finished state
raises no alert, no red commit status and no entry to triage at all. Both halves
are still refused without each other.

### CONFIRM GREEN, not "notice red" (`ci-status-guard`, point 387)

The pre-push gate runs the same unit suite CI runs, so it catches everything
**except what differs by platform** — and that is exactly what went wrong on
30.07.2026. A negative control reproduced a Windows incident (git's removal
following a junction into its target) and asserted it on every platform, so it
failed every hosted Ubuntu run and passed on the machine that wrote it. A second
cause the same night was cost: the mechanism gate's containment probe spawned one
git process per (pending commit, ledger record) **pair**, 26–38 s past its own
budget. Both mailed the repository owner and nobody in the session learned:
`ci-status-guard` asked GitHub about `git rev-parse HEAD` alone, the owning
session's HEAD was `main` and green, and thirteen red branch runs stood unseen.
Measured across the last 100 runs that night: 53 red, 26 of them on `main`,
spread over three weeks.

Two rules came out of it, and both are enforced rather than remembered:

**A test whose subject is OS behaviour asserts PER PLATFORM, never by skipping.**
A skip would mean the assertion silently says nothing on the platform that
actually runs it; the fix asserts the damage where the damage exists and the
platform's own behaviour elsewhere.

**A check inside the unit layer that walks REAL git history is bounded by
CONSTRUCTION, not by a raised timeout,** states its worst case in a comment and
stays inside it. The containment probe's budget had already been raised once; the
second raise would have hidden it again. It is now `attachCoverage` in
`mechanism-review-guard.mjs` — `1 + R` git calls, R being the records on this
branch, and zero when nothing mechanism-shaped is pending — pinned by call COUNT,
not wall clock, in `mechanism-review-guard.test.mjs`.

And the guard itself changed target. The unit of judgement is now the **pushed
ref**, and a push does not count as landed until the run for that exact sha has
**concluded green** — which closes the whole class regardless of cause, platform
differences included, where merely noticing red closes only the cases someone
happens to look at. Concretely (`ci-status-guard-core.mjs`, pure and pinned in
`ci-status-guard-core.test.mjs`):

- **Every ref this repository pushed** is judged, not just HEAD. A delegated
  agent pushes under the parent's session id and into the shared reflog, so those
  refs are the parent's responsibility. The ref is named in the block message.
- **The list comes from the local push reflog** (`update by push` entries only —
  a fetch is somebody else's branch), never from an API sweep over branches.
  Four local git calls per turn end, ~30 ms measured, none of them growing with
  the number of branches or with repository age.
- **An unfinished run is a WAIT, not a pass** — and the wait has a ceiling
  (`WAIT_BUDGET_MS`), past which the guard fails open and says so, because a wait
  without a ceiling would trap a session behind a queue that never drains. It
  keeps asking after the ceiling, though: a run that concludes red an hour later
  — the runner-famine shape — is still judged. The ceiling outranks the answer
  cache, so a wait recorded a minute ago cannot hold the turn past it.
- **The common turn costs nothing.** A concluded green — and a commit no
  workflow covers, such as a `board` push or a `[skip ci]` rescue commit — is
  cached **per sha** and never asked about again; a red or an unfinished run is
  re-asked at most once a minute. Never per REF: a ref written off would silently
  pass the red of the very next commit on it, and the rescue push is the routine
  way onto that path.
- **A deleted ref is dropped** rather than reported forever, and the ntfy alert
  goes out once per (ref, sha).
- **Fail-open, with the reason STATED.** Offline, rate-limited or unreadable →
  the stop is allowed and the guard writes which ref it could not judge, because
  a silently swallowed API error is indistinguishable from a green.

### Where a CI failure is announced (point 513)

A red run on `main` mails the repository owner, as it always did. A red run on a
`feat/**` branch does **not** — and the absence of that mail says nothing about
the branch. Read this before concluding a branch is green.

Two deliberate rules collided here. A branch push runs the LIGHT local gate
(lint + audit; the full gate per intermediate commit costs more than a red branch
is worth), while CI runs the FULL gate on every branch push — so an agent
committing mid-work produced red runs, and each one mailed the owner. There is no
repository-side switch for that mail: GitHub sends it for the run's failure
CONCLUSION. So the routine `feat/**` push has no such conclusion any more. Every
step of the job carries `continue-on-error` for that one case, and the run ends
green whatever the gate found (`.github/workflows/ci.yml`; the decision is pure
in `ci-gate-verdict-core.mjs`, the writing in `ci-gate-verdict.mjs`, both pinned
step by step in `ci-gate-verdict-core.test.mjs`).

The verdict is therefore carried by four other things, and a branch failure is
found in them:

- the **ntfy topic** — the alert names the failed gate steps and says that no mail
  follows. On a branch run this alert IS the notification, and it needs the repo
  secret `NTFY_TOPIC` (the value of the local `.claude/ntfy-topic`). Measured
  08.08.2026: the secret is NOT set, so the step logs "NTFY_TOPIC secret not set"
  and no alert goes anywhere — until it is set, the commit status below is the
  only signal that leaves the run page.
- the **commit status** on the pushed sha (`ci/gate (branch)`): a red ✗ beside the
  commit, and one API field for anything that asks later. Commit statuses notify
  nobody, which is why they are usable here.
- the **run summary**, which states in words that the green tick is not a green
  gate, and lists every step's outcome.
- the `::error` **annotations** on the run page.

What stays exactly as it was: `main` (hard steps, red run, mail — it is the branch
the deploy builds from), a manual `workflow_dispatch` and a pull request on any
branch (a deliberate ask keeps its honest red), and the rescue convention below —
a `[skip ci]` commit still produces no run at all.

One consequence to know: `ci-status-guard` judges the run CONCLUSION, so it no
longer blocks a turn on a branch gate failure — a red branch is expressly normal
now. The gate that still stands in front of a branch push is the local pre-push
gate.

## Triaging a RED run (point 294)

A red is now read, not asserted. Two signals, both decided in the pure module
`baseline-classify-core.mjs` (pinned by `baseline-classify.test.mjs`):

**1. The repeat signature — free, always on.** A failed browser suite is retried
once (point 200). The runner used to conclude from "it failed twice" that this
was "a real failure, not a flake". That is not what two failures prove: on
27.07.2026 `enrichments` failed two staging checks, then a completely different
one (the crocodile eye knobs) on the retry, on a machine carrying a unit run and
two agents — and none of the three checks had anything to do with the change
under test. So the verdict now comes from the failing check NAMES:

| Both runs failed at… | Verdict |
|---|---|
| the SAME check | `CANDIDATE REAL FAILURE` — it reproduces; find out whether the change caused it |
| DISJOINT checks | `LOAD/FLAKE SIGNATURE` — the fingerprint of a busy machine, not of a defect; re-run the suite alone on a quiet machine before believing it |
| no parseable FAIL line (crash, wall-timeout kill) | `UNCLASSIFIED` — say so, never guess |

Check identity folds measured numbers away (`12 vultures circle` is the same
check as `9 vultures circle`), and the console-error texts count as pseudo-checks
so the console-gated suites (`world`, `i18n`) can be triaged at all. Each check
is annotated with whether its name touches the branch diff — a weak
corroborating hint, never a verdict.

**2. The baseline classification — OPT-IN, because it is a second browser run.**

```
npm test -- --baseline                 # classify every suite that failed twice
VERIFY_BASELINE=1 npm run test:small   # same, via the environment
node scripts/verify/baseline-classify.mjs enrichments          # one suite, on demand
node scripts/verify/baseline-classify.mjs polish --ref HEAD~1  # against a named commit
```

It re-runs the failing suite against the pre-change baseline (the merge-base with
`main` by default) in a REUSED detached worktree under the git-ignored
`local/verify-baseline/<sha>` — no second `npm install`: Node resolves
`node_modules` up the ancestor directories, and the checkout lives inside the
repo. At most two baselines are kept. Each currently failing check comes back as
**REAL REGRESSION** (green on the baseline), **PRE-EXISTING / STALE ASSUMPTION**
(already red there — the 24.07. SSAO ground-edge and proximity-fade cases),
**UNSTABLE ON BASELINE** (it flaked there too, so the baseline decides nothing —
which is why the baseline runs twice by default, `--runs n`),
**INCONCLUSIVE** (the baseline reached the end and simply never had that check —
it is newer than the baseline), or **NOT CLASSIFIED — THE BASELINE RUN DIED**.

**The lane's own failure modes (point 418).** A baseline pass can end without
answering anything, and that must never read as a verdict:

| what happened | how it reads | where the evidence is |
| --- | --- | --- |
| the baseline pass produced no output at all (crash, timeout, the server never came up) | `the baseline run did not produce a result — NOT classified` | the kept log |
| the baseline pass ended EARLY — it printed **no FAIL line at all** and exited non-zero (or was killed), having either reached fewer checks than the current run or simply exited non-zero; an exit code of 0 is never a death, whatever it counted | `*** THE BASELINE LANE DIED: run N ended after X of the current run's Y checks … last check reached: "…"`, and every unreached check verdicts **baseline-died**, not inconclusive | the kept log + the last 12 output lines printed inline |
| the baseline pass REPORTED failures but still reached fewer checks | a `NOTE:` caveat **after** the verdicts — they stand | the kept log |
| the baseline pass ran to the end | the ordinary four verdicts above | — |

On 29.07.2026 two baseline passes of `enrichments` each stopped after 55 of 243
checks with exit 1 and zero failures, and the three reds all came back
"INCONCLUSIVE — the check did not run on the baseline". A lane that dies at a
quarter of the suite costs the full runtime and answers nothing, so it is now
LOUD — but only where the run reported NOTHING. A baseline that printed FAIL
lines did its job, so a shortfall there is a caveat, never an annulment: the
serverless suites run the baseline's OWN script copy, and a change that adds
checks leaves a legitimately red baseline permanently shorter. It KEEPS its
evidence either way: every run's stdout+stderr is written to
`local/verify-baseline-logs/<suite>-baseline-<sha>-run<n>.log` (and
`<suite>-current.log`) before anything is judged — a sibling of the checkouts, so
the retention prune can never delete it. The yardstick is the current run's check
count: `run-all` passes it as `--current-checks <n>`, and a direct run measures it
itself. With `--strict`, a died or resultless baseline exits 1 like a real
regression — it produced no triage at all.

It runs the CURRENT check against the BASELINE app, so only the product differs
— and it prints what can bend that reading: a suite file that changed since the
baseline, moved dependencies or shared boot helpers, and the backend the
comparison ran on (`VERIFY_GL` is honoured; a WebGPU red must be classified on
WebGPU). It refuses when the baseline resolves to the current commit, and it
fails soft: a triage aid must never turn a readable red into a crashed run. The
suite result stays the gate — `--strict` is there for a caller that wants a
non-zero exit on a real regression.

`docs` is a pure-Node suite, so it needs no server on either side
(`SERVERLESS_SUITES` in `tiers.mjs`; a `docs`-only run starts no vite at all) and
the baseline runs the baseline tree's OWN copy of it.

## What a fix must PROVE (point 589)

Twelve defects shipped in ONE mechanic whose twelve points had all been accepted
as finished, and the gate reported green throughout. The cause was not too few
tests: the tests checked the MECHANISM and not the RESULT. `speechProbe` counted
the syllables a source PLANNED, so it could not hear the same tone multiplied by
zero further down the bus; the label tests checked the visibility rule and the
presence in the DOM, not whether the note stood at the speaker's head; the
catch-game tests checked the game logic, not whether two children occupied one
point in space. That is the "green against a proxy" failure CLAUDE.md §7.2 warns
about — the rule existed, this area did not follow it. Two rules bind every fix
from here:

**1. Per fix, ONE assertion at the level the player experiences it.** SOUND is
judged at the END of the chain — the level that actually reaches the output, not
the level a source planned. POSITION is judged in WORLD space — do two bodies
overlap, does the note sit within a hand's breadth of the head — not by the rule
that was supposed to place it. A fix whose assertion can only reach the mechanism
NAMES IN ITS COMMIT why the result is not assertable; that is a permitted
outcome, silently asserting the proxy instead is not. The worked example is
`playSpeech` (`src/systems/ambience.ts`): it asserts the level that actually
LEAVES the graph — peak × speech bus × master — against the player's own slider,
because point 577's tone was planned at a perfect level and multiplied by zero
one node further down, with every plan-level measurement green.

**2. One PLAY ACCEPTANCE per package.** A package of play-session fixes is not
finished by its suites. The parts were each accepted and the COMPOSITION never
was — nobody ever stood in the village as a player, with sound, for two minutes.
So the MERGED result is entered as a player — the scene, the sound, two minutes —
and what was SEEN and HEARD is recorded with the merge.

And for anything time-dependent, neither rule reaches far enough: see the
long-run alarm below.

## Adding tests for a new feature (do this every time)

Every new feature must get a test on **one or both** layers — pick by what the
test observes:

- **Vitest** (`src/**/*.test.ts[x]`) for anything that can be asserted without a
  real browser: pure functions, `balance` values, `useGame`/`useUi` store
  actions + state, and the **HTML HUD** components via React Testing Library
  (render the component, assert classes/text). The store graph is three-free, so
  it imports directly in jsdom; terrain-dependent logic loads the real DEM once
  via `src/test/store.ts` → `setupGeodata()`. Follow `src/state/store.travel.test.ts`
  (store) and `src/ui/StatusBar.test.tsx` (component) as templates.
- **Playwright** (`scripts/verify/*.mjs`) only for what jsdom cannot do: the
  three.js scene / RAF wildlife, real layout geometry (`getBoundingClientRect`,
  scroll, z-order), canvas/WebGL init, `user-select` CSS, pointer-lock, gamepad
  input, TTS audio, and the §7.2 acceptance screenshots.

Never add a store/logic/HUD-text assert to Playwright when it can live in
Vitest — that is exactly the coupling this split removed.

### A system that must KEEP PRODUCING carries a long-run alarm (point 589)

Twelve defects shipped in one mechanic whose twelve points had all passed their
gates, and one of them — the adults falling permanently silent after minutes —
was out of reach of every suite by construction: a suite simulates seconds. So
the running game measures it. `watchProducer` (`src/systems/devAssert.ts`) is the
existing assert channel's LONG-RUN family: a producer that has emitted nothing
for longer than its own specified window raises the ordinary `console.error`,
which every suite's console gate fails on and every manual session shows. Wired
so far: `errands-silent` (the adults' utterances and the errands they stage),
`tag-silent` (the children's play — a catch or a fresh round), and
`child-speech-silent` (what the children say). `window.__longRun` reports every
watch live.

Two rules keep it worth having: it judges the OUTPUT (an utterance staged, a
round played), never the timer that was supposed to produce one; and a producer
that is legitimately quiet — nobody to speak to, nothing to speak about, a group
of one — is not judged at all. Each window is a `balance` value, debug-editable,
and each is covered in the fast layer both ways: a stalled producer trips it, a
healthy one stays silent through half an hour of simulated play.

When a new system must keep producing, add a watch rather than a test that hopes
to be looking at the right second.

## Old → new coverage map

Every assert removed from Playwright has an equivalent (or stricter) Vitest
check that is green. The seven scripts below were **deleted** because every one
of their asserts moved to Vitest.

| Deleted script | New home (Vitest) |
|---|---|
| `economy.mjs` | `src/systems/economy.test.ts` (pure pricing/ferry/sites), `src/state/store.economy.test.ts` (bazaar/ferry/bounty/dig/capacity/trade), `src/ui/Dialogs.test.tsx` (village gifts-not-$), `src/ui/JournalPanel.test.tsx` (bounty telegraphic transfer) |
| `reputation.mjs` | `src/state/store.reputation.test.ts` (gifts/expulsion/friend/robVillage), `src/ui/Dialogs.test.tsx` (rob-confirm gate) |
| `camps.mjs` | `src/state/store.camps.test.ts` (pitch/store/take/loot/village-cache). *Map X-marker drawing (canvas) is dropped; the underlying `freeCamps` state is covered.* |
| `hints.mjs` | `src/state/store.hints.test.ts` (knowing villages, gift→hint→decode either order, triangulation, gift-lore), `src/i18n/i18n.test.ts` (in-world words in the dictionaries). *The rendered in-world word is now shown only in the journal screenshots.* |
| `expedition.mjs` | `src/state/store.expedition.test.ts` (staged warnings/expiry/successor), `src/ui/Hud.test.tsx` (deadline-recalled overlay, no successor button) |
| `checkpoint.mjs` | `src/state/store.saveload.test.ts`, `src/ui/Hud.test.tsx` (load-menu table) |
| `saveload.mjs` | `src/state/store.saveload.test.ts` (per-port snapshots/restore/successor/migration), `src/ui/Hud.test.tsx` (load-menu columns + health word) |

The scripts below were **trimmed** to their browser-only remainder; their
ported asserts now live in Vitest:

| Trimmed script | Kept (browser-only) | Moved to Vitest |
|---|---|---|
| `startup.mjs` | the loading picture's freeze budget: tick train + painted-frame gaps from document start, attributed via `liveness.mjs`, gated on `balance.startup.pictureFreezeBudgetMs`; screenshot 142 | `src/render/asyncPipelines.test.ts`, `src/ui/DebugMenu.test.tsx` (the budget field), `scripts/verify/liveness.test.mjs` |
| `world.mjs` | 8 bird's-eye screenshots + console gate | `src/world/world.test.ts` (counts, terrain-on-land, hydrology) |
| `i18n.mjs` | 5 localization screenshots + console gate | `src/i18n/i18n.test.ts`, `src/ui/{StatusBar,JournalPanel,Dialogs,DebugMenu}.test.tsx` |
| `health.mjs` | vultures at poor condition (RAF) + console gate | `src/state/store.health.test.ts`, `src/ui/Hud.test.tsx` (veil, defeat) |
| `events.mjs` | touch-a-lion / touch-a-hyena contact (RAF scene) | `src/systems/events.test.ts`, `src/state/store.events.test.ts` |
| `settings.mjs` | eye-height, in-scene walk measures, `user-select` CSS, lion-feed, ambience/proximity audio, village speech really scheduling audio (§13.4: near vs. out of earshot vs. phrase) and the live sub-bus gains behind it (point 577: the syllables survive `ambientVolume` 0, and only their own slider silences them), Tab focus, TRAA pipeline toggle (rebuild + non-black frame + leak gate, WebGL 2 path), the DEV render-resource leak invariant across scene switches / detail levels / effect toggles incl. a forced real leak (point 295), the keyboard-lock WIRING (work-order 601: the shipped bundle asks for the lock at the fullscreen + pointer-lock transition and gives it back with either or a hidden tab) | `src/config/balance.test.ts`, `src/systems/keyboardGuard.test.ts` (the chord set and the lock's state machine), `src/systems/movement.test.ts`, `src/systems/ambience.test.ts` (the speech scheduling and its bus routing), `src/communication/speaking.test.ts` (pace, pause, attenuation, hearing), `src/state/store.debug.test.ts`, `src/ui/DebugMenu.test.tsx` (incl. the TRAA checkbox) |
| `enrichments.mjs` | all wildlife/RAF, drei map/region labels, river/graveyard scene, layout geometry, real WheelEvent, screenshots | `src/systems/movement.test.ts`, `src/state/store.*.test.ts`, `src/ui/{StatusBar,Hud,DebugMenu}.test.tsx` |
| `voice.mjs` | movement-while-journal-open (scene), TTS read-aloud (assets from the local `.cache/tts/` record-and-replay cache — first run records from the CDNs, later runs are strictly offline; delete the dir to re-prime), the cold-load main-thread liveness gate (see `liveness.mjs`), screenshots | `src/journal/voiceMarkup.test.ts`, `src/i18n/i18n.test.ts`, `src/ui/JournalPanel.test.tsx`, `scripts/verify/liveness.test.mjs` |
| `touch.mjs` | touch/tablet layer (`hasTouch` context, real CDP touch): guard mounts the overlay on first touch + mobile quality preset, virtual-stick walk, right-half look drag, tappable prompt, two-finger pinch zoom | `src/systems/touchInput.test.ts`, `src/state/ui.test.ts`, `src/ui/Hud.test.tsx` (touch absence/presence), `src/ui/DebugMenu.test.tsx` (SSAO/shadow checkboxes) |

### `polish.mjs`: the checks that need a POPULATION, not an instant

Two of its checks measure something that only happens SOMETIMES, so each is a
SERIES over the walk rather than one sampled frame, and each fails loudly when
its own subject never occurred:

- **Slope footing (points 300/412).** "Every planted panorama foot touches the
  ground drawn under it" used to run at `maasai-village` and read ONE instant.
  It passed — while reporting `slope over the wheelbase [0.00, 0.00, 0.00,
  0.00]` and `pitch [0.000 x4]`: the silhouettes there stand on the flat
  disc-horizon line, so the seating the check exists to prove was a NO-OP in the
  measured frame. It now samples ~30 frames, COUNTS the samples that stood on
  genuinely sloped ground (rise over the animal's own wheelbase ≥
  `MIN_WHEELBASE_SLOPE`), judges only those, and FAILS when that count is zero.
  The decision is the pure module `footingSeries.mjs`, pinned by
  `footingSeries.test.mjs` in the Vitest layer. The place is chosen because the
  slope is measurably there, not assumed: `pedi-village` puts every stance
  sample on a slope, `sidama-village` and `capetown` a smaller share, while
  `maasai-village` and `berber-village` measure 0.000 across 150 samples. The
  check walks that list and names in its verdict which place supplied the
  population; running out of places is a failure, never a quiet pass.
- **Settlement animals (point 413).** No goat may stand inside a fence, hut or
  prop, and none inside another goat — sampled over 20 reads of the herd, with
  the deepest penetration and the closest pair reported, plus the frame
  `143-village-goat-separation`.
- **Villager gestures (point 479).** The four poses — beckon, point, refuse,
  indicate — are photographed at conversational distance from a standpoint the
  suite RAY-PROBES clear first (a camera dropped on a fixed bearing lands inside
  a hut in a dense settlement and would photograph a wall), each forced through
  the dev hook `__placeForceGesture` and awaited on the GESTURE's own clock, not
  the wall clock. Then the standing conversation is sampled over 60 reads: since
  point 580 the pair must be QUIET — it used to cycle the four gestures as
  ambient dressing with no utterance behind them, a mute pantomime at any
  distance — so no live gesture may appear, none may run past its own duration,
  the two never gesture over each other, and a figure that is not speaking stands
  exactly at rest. The state machine itself is pure
  (`src/render/gesture.test.ts`), and so is the rule that binds a gesture to the
  range its utterance carries (`src/communication/spokenGesture.test.ts`); only
  the poses the renderer actually DRAWS need the browser.
- **The hypothesis over the speaker's head (point 485).** The label's lifetime
  and its binding to the note are pure Vitest; the browser owes only the
  ATTACHMENT, which no unit test can see. A named inhabitant is made to speak a
  heard utterance, and the rendered label's DOM box is compared with that
  figure's own projected anchor — read in the SAME evaluate, over 8 frames, so
  no frame passes between deciding and measuring. The delivered bug was a label
  parked at the scene origin, which this misses by hundreds of pixels. Plus the
  frame `146-speech-hypothesis-label`.

Kept largely intact (already browser-only): `flow.mjs` (the one E2E core loop +
buy-price layout geometry), `collision.mjs`, `gamepad.mjs`, `polish.mjs`,
`handwriting.mjs` (the writing animation is timing/DOM-sensitive and stays
here; consumes the `.cache/tts/` replay cache because adding an entry
auto-narrates — voice.mjs owns and primes that cache), `docs.mjs` (pure Node
doc-structure check), `preview.mjs` (production build acceptance).

## Backend assertion coverage (point 204)

Every browser suite launches through `launchVerifyBrowser()` and calls
`assertBackend(page)` right after the renderer initialises (`window.__renderer`):
a run launched with `VERIFY_GL=webgpu` that SILENTLY fell back to WebGL 2 (or a
`webgl` run that came up on WebGPU) fails LOUD instead of giving false
confidence. Covered: collision, enrichments, events, flow, gamepad, handwriting,
health, i18n, invariants, polish, settings, touch, visualsweep, voice, world.
The same call records the WebGPU **feature level** the run came up at (point 505,
above): on the container's GLES lane that is `compatibility`, on a core adapter
`core`, and on the WebGL 2 lane it does not apply.

Two suites carry no assertion, each for a structural reason:

| Suite | Why no `assertBackend` |
|---|---|
| `docs` | Pure Node doc-structure check — it never opens a browser. |
| `preview` | Runs the PRODUCTION build, where `window.__renderer` is dev-only and does not exist. In a LARGE run it rides the WebGL 2 pass only (the WebGPU pass skips the preview). |

A full LARGE run (`npm test` / `npm run test:large`, no `VERIFY_GL` pinned) now
covers BOTH backends automatically (point 204b): run-all runs the whole LARGE on
WebGL 2 (with the build/lint/unit preflight + prod preview), then re-runs the
render browser suites on WebGPU (system Chrome) with the backend-agnostic
preflight/preview skipped (`RVA_SKIP_PREFLIGHT`). An explicit `VERIFY_GL=…` (the
render-verify gate's per-backend clear command), the SMALL tier, or a bare
single-suite filter stays a single-backend pass. The WebGL 2 pass runs first; a
failure there stops before WebGPU.

### Which lane runs WITHOUT being asked (point 571, user 09.08.2026)

**The everyday lane is WebGPU; WebGL 2 is the regression lane.** With no
`VERIFY_GL` pinned, `npm run test:small` and a bare suite filter
(`npm test -- polish`) come up on WebGPU — the PLAYER's backend. WebGL 2 is what
every LARGE run covers, and LARGE is not rare: it is mandatory on a scene core,
at roughly every fourth point as a collective gate, and before every closing.

The evidence for the direction: the work order records **no** defect that showed
on WebGL 2 alone. Every one-backend defect ran the other way — point 334 (the
TRAA render-target leak, WebGPU only, while the same suite was 39/39 green on
WebGL 2), point 506 (the goat-stance check, red in both WebGPU runs, green on
WebGL 2) and point 210, where a coast fix read "done" on WebGL 2 while the WebGPU
picture was still stepped. Cost does not argue against it either: measured
09.08.2026 on this host, `polish` took 14.5 / 14.2 min on WebGL 2 and 13.1 /
14.4 min on WebGPU — the software WebGPU lane is not the slower one.

Two things the swap deliberately does **not** change:

- **`touch` and `voice` keep their WebGL 2 lane, inside the everyday gate.**
  Headless WebGPU drives neither the CDP touch events nor the TTS speak state, so
  they are **routed** to WebGL 2 (`laneFor` in `tiers.mjs`; run-all pins
  `VERIFY_GL` per suite) rather than dropped. `voice` therefore stays in the SMALL
  gate exactly as before, and `npm test -- touch` runs the suite instead of
  resolving to nothing. They are SKIPPED in one place only: the WebGPU pass of a
  both-backends LARGE run, whose companion WebGL 2 pass already ran them
  (`RVA_WEBGL_COVERED`) — logged as a `SKIP` line, never a silent gap. A routed
  suite prints a `LANE` line for the same reason.
- **`render-verify-guard` still demands BOTH pictures.** A change on a
  backend-sensitive path (`isBackendSensitivePath` in
  `scripts/render-verify-core.mjs`) is cleared only by a recorded run per backend,
  as before. What this point changed is which lane runs *without being asked*, not
  what a render merge must prove.

**The residual, stated rather than assumed away:** a regression that is visible
**only** on WebGL 2 now surfaces at the next LARGE run instead of at the next
point. That is the accepted price, and the evidence above — no such defect on
record, ever — is why it is acceptable.

Per-backend commands (what the render-verify gate uses to clear a GUI change on
both backends):

```
VERIFY_GL=webgl  node scripts/verify/run-all.mjs polish   # WebGL 2 pass of one suite
VERIFY_GL=webgpu node scripts/verify/run-all.mjs polish   # WebGPU pass of one suite
npm test -- large polish                                  # the same suite on BOTH, preflighted
```

### A run whose reds are ACCOUNTED FOR still counts (point 550)

The gate used to count an exit-0 run and nothing else, and on 07.08.2026
`polish` could not exit 0 for reasons belonging to OTHER points: the
render-target assert of point 546 fired as a console error on both backends
(fixed and ticked 08.08.2026 — its entry left the ledger with the tick, which is
the expiry working as designed), and the goat-stance check reds on the software
WebGPU lane (point 506). Every change
under `scripts/verify/` — a pure comment diff included — could then be cleared
only by a hand-written `--defer`, and a gate overridden by hand routinely stops
being a gate.

So a run covers a backend when it is **clean** (exit 0) **or accounted for**:
every failing check and console error in it charged to an **open** work-order
point. The mechanics:

- the recorder taps the run's own `FAIL  …` / `ERR: …` lines, parses them with
  `baseline-classify-core.mjs` (the same reading the triage lane uses) and writes
  them into the run record, each with the point it was charged to;
- the ledger is `scripts/render-verify-charges.mjs` — data only, one entry per
  known red, scoped by suite/backend/kind and carrying a dated reason;
- `runVerdict` in `render-verify-core.mjs` decides, and keeps `clean` and
  `accounted` apart everywhere they are reported: the clearance is recorded as
  `clearedVia: 'accounted-for'` with its charges, `status` prints them, and the
  Stop hook says so out loud.

What still does **not** clear: a red charged to nothing (that is a FINDING, file
it — a ledger entry is not where an unfiled red goes), a red charged to a point
that is ticked or deferred (the exception expires with the point that owned it),
a run that failed without reporting a single red, a run whose output flooded past
the capture cap (the dropped line may have been the unfiled red, so the cap
itself becomes an unaccounted red), and a run that CRASHED rather than reported —
`uncaughtExceptionMonitor` catches that, because node prints an uncaught
exception straight to fd 2 where no tapped stream write can see it. `--defer`
stays for what genuinely cannot be judged headless.

## The world seed is pinned AT THE LAUNCHER (points 549/557)

The game draws its settlement layouts from one run seed, random unless the
DEV-only `?seed=<n>` pins it. Unseeded, a suite walks a different world every
attempt: `polish` gave eight attempts and no two the same verdict, its two reds
on `zulu village hut` naming two DIFFERENT huts through the same picker. So the
lane pins the seed — every check still decides on the picture the game draws, on
the SAME world each time, which is what makes a verdict repeatable at all.

**One route, no per-suite plumbing.** `applySeedRoute` (`verify-seed.mjs`) is
applied where the browser is OPENED — `_browser.mjs` (`launchVerifyBrowser`),
`_boot.mjs` (`bootGame`) and `crossbrowser.mjs`'s per-engine launch — and wraps
`page.goto`, so whatever URL the runner hands a suite arrives seeded. A suite
therefore inherits the pin by opening a browser and cannot fall out of it.

That shape is the point-557 repair: the pin used to sit at a call site.
`collision.mjs` wrote `?seed=42` into its DEFAULT url, which
`process.env.BASE_URL ?? …` discards the moment `run-all` passes a port — so it
had been running unseeded for years while its comment claimed determinism. **A
dead pin is worse than no pin**: when such a suite rotates, the log says the
layout was fixed and the reader rules the layout out first. `verify-seed.test.mjs`
now fails on that wiring — on a `seed=` literal in a suite, on a suite that opens
a browser outside the route, and on a launcher that stops applying it.

**Every run says which world it walks**, in the suite's own output:

```
# world seed 42 — pinned at the launcher (point 549); VERIFY_SEED=random sweeps another world
# world seed NOT APPLIED — preview: the production build reads no ?seed …
```

`UNSEEDED_SUITES` in `verify-seed.mjs` names the deliberate exemptions with their
reason; `preview` is the only one (the prod build carries no dev hook, so it
cannot be pinned at all). Being listed there is a claim that PRINTS.

**The cost, and how it is covered (decided with point 557).** A lane pinned to
one seed only ever photographs ONE world, so a layout defect that needs a
different seed goes unseen. The everyday gate keeps the pin — a repeatable
verdict is what a gate is for — and the other worlds are covered by an occasional
SWEEP:

```
VERIFY_SEED=random npm run test:large     # draws a seed, prints it, runs on it
VERIFY_SEED=1234567 npm run test:large    # reproduce exactly what the sweep found
```

The seed is drawn in Node, not left to the game, precisely so the run can name
it: a red from a sweep is reproduced by pinning the number it printed. Run the
sweep at each closing cycle (§7.2) and whenever settlement layout code changes;
an unrecognised `VERIFY_SEED` value throws rather than quietly running pinned.
**Accepted residual:** between two sweeps a seed-specific layout defect can sit
unnoticed. That is deliberate — the alternative, a rotating seed on the daily
gate, buys breadth by giving up the repeatable verdict point 549 was created to
restore.

## Screenshots are NOT comparable between runs (point 361)

The frames these suites write cannot be diffed against a stored baseline, and
this is measured, not suspected. `node scripts/picture-stability.mjs <suite>`
runs a suite twice on identical code and reports how far each frame moved:
`world` on WebGL 2 moved **every one of its eight frames** between 11 % and 98 %
of pixels, in a different rank order each time, while the smallest real defect
in the project's historical picture-caught bugs moved 0.75 %. One pair had
captured different views of different places — the capture races the camera
settle under load, and the suite passes either way because its assertions never
look at the frame.

Consequences for anyone extending this directory:

- **A screenshot is documentation, not an assertion.** Assert on the DOM, on
  `window.__camera` projections or on numeric probes; never on a stored image.
- **No golden-image gate, no cross-backend pixel diff, no diff-derived crop**
  until the probe reports STABLE. The rejected levers and the case that killed
  each are in `docs/picture-check-levers.md` §3.4; what the check costs is in
  `docs/picture-check-cost.md`.
- **A new frame should wait for the picture it names.** Poll the app's own state
  until the view has settled rather than a fixed wait (see `fixedWaits.mjs`);
  that is also the first work any future determinism effort has to do.
- **Measure a BUILT scene, and say so (point 499).** `_browser.mjs` carries two
  helpers for exactly this, and anything reading pixels or a settling value should
  use them: `waitForSceneBuilt(page)` waits for the renderer's triangle count to
  pass a floor and stop GROWING for 5 s, and `waitForReadingStable(page, readFn)`
  watches EVERY number a reading carries — the ones the check asserts, not one
  proxy beside them — and reports whether it truly settled, with `requireChange`
  for a value pushed into the scene that needs a moment to take hold. Both return
  their verdict rather than a bare value, so a suite can FAIL with "the scene never
  finished" instead of measuring an empty frame. Traced on the container host: the
  first-person scene is black at 3 s, sits still at 33 346 triangles from 9 s to
  13 s, and only reaches its final 83 037 at 24.6 s. Six checks across four suites
  were reporting product failures against pictures and readings that had not
  formed — a black frame reads as "no ground detail", an unrendered probe pair as
  "no fire shadow", a half-lerped season as "the preset is wrong".

## A frame must show what its name claims (point 375)

The consequence above has teeth now. Two runs of `world` on identical code
photographed different places — `12-worldmodel-lake-victoria` caught the settled
lake once and a mid-travel landscape the other time — and both exited 0. So the
check moved to the SHUTTER: `frameShutter(page, OUT)` returns
`shot(name, declaration)`, and before the PNG is written the declared subject is
projected through the LIVE camera (`__camera.onScreen`/`ndc` in the bird's-eye
view, the place camera's own matrices inside a settlement), never against an
assumed radius. A subject that is not in the picture FAILS the suite, naming the
frame, what it claimed and what was found instead — and the file is not written.

| Declaration | Subject | Checked by |
|---|---|---|
| `{ world: { lat, lon } }` or `{ world: { x, z } }` | a place, a landmark, a live thing in the scene | projected to NDC through `__camera`; the camera must also have SETTLED (`settle: false` for a deliberately moving frame) |
| `{ local: { x, z, y? } }` | a building, prop or silhouette inside a settlement | projected through `__placeCamera`'s own matrices |
| `{ place: '<id>' }` | the interior of that settlement | the game stands in it |
| `{ element: '<selector>' }` | a HUD/overlay/dialog frame | EVERY match is examined; one of them must be shown and inside the viewport (`locator:` also shoots that element) |
| `{ general: '<why>' }` | a deliberate general view | nothing — but the REASON is mandatory, so a missing subject check is never an oversight |

`scene: 'travel' \| 'place'` is implied by the first three and may be added to
any of them. The judgement, the message and the declaration rules are pure
(`frameSubject-core.mjs`, pinned by `frameSubject.test.mjs`); only the probe, the
settle poll and the write live in `frameSubject.mjs`. The same test file carries
the GATE: a `page.screenshot({ path })` anywhere in this directory outside the
shutter fails the unit layer, so a new frame cannot skip its declaration. (A
screenshot WITHOUT a path is a pixel probe and declares no subject — it is a
measurement, not evidence; `shot()` returns the buffer for the few frames that
are both.)

**Every capture carries the harness budget (point 492).** The write and the
pathless pixel probe are one budget from one place — `CAPTURE_BUDGET_MS` in
`frameSubject.mjs`, 120 s, with the reason written beside it. A probe therefore
goes through `capturePixels(page, '<site>', { clip?, locator? })` rather than
`page.screenshot(...)`: on a GPU-less host under suite load Playwright's silent
30 s default is exceeded exactly as the writes' was, and the suite then dies far
from the check it was running. An exceeded budget names the harness and the site
instead of surfacing as a bare Playwright timeout, and the second gate in
`frameSubject.test.mjs` (`findUnbudgetedCaptures`) fails the unit layer on a raw
`.screenshot(` left anywhere in this directory.

`FRAME_SUBJECT_SELFTEST=1 node scripts/verify/world.mjs` proves the gate still
bites — it stands the traveller in Cairo, claims Lake Victoria, and requires the
capture to be refused and no file written.

### …and the picture must be DRAWN when it is taken (point 489)

Proving the aim is not enough: a subject projects into an empty grey frame
exactly as well as into a finished one. Measured on the Linux container host, the
travel scene climbs from 99 draw calls / 5.5k triangles at 5 s to 222 / 745k at
30 s, and two suites photographed that gap and exited 0 — `world` a 47 kB blank
village, `collision` an empty `52-collision-port-wall.png`. Neither waited on the
clock alone; `world` waited on a healthy frame RATE, which an EMPTY scene reaches
fastest of all.

So the shutter also waits for the scene to be DRAWN, for every frame whose
subject lives in it. How much it waits for is the frame's own declaration
(`sceneReadyMode`): an `element` frame waits for nothing (its subject is DOM); a
frame taken deliberately in motion (`settle: false` — the crocodile's lunge, the
fire line) waits only until there IS a picture, because a quiet window would
photograph the aftermath; everything else waits for the scene to stand still.
`sceneReady: true|false` overrides either way. The condition is the renderer's own PER-FRAME
counters — `info.render.drawCalls` and `info.render.triangles`, never the
cumulative `info.render.calls`, which climbs on a finished scene as fast as on a
building one — standing still within 10 % over a trailing 5 s window, above a
floor of 20 000 triangles. Judged on the SPREAD, not on growth: a falling count
is a region unloading after a jump, which is no more a finished picture. The
tolerance is relative because a finished scene never stands perfectly still —
wildlife and culling moved the counts by 1-7 % in every settled state measured,
against 20-98 % while building.

The wait is polled, never a fixed sleep, and a scene that does not settle inside
`timeoutMs` (120 s) REFUSES the frame loudly instead of writing half a picture.
The verdict is pure (`sceneReady-core.mjs`, pinned by `sceneReady.test.mjs`
including its timeout path); the in-page sampler and the poll live in
`frameSubject.mjs`. A page with no `window.__renderer` at all (the production
preview) cannot be judged and is not held up — the frame is written with that
said in its log line. The live proof runs in `world.mjs`: the first world frame
is taken straight out of the scene switch, with nothing waiting in between, and
its own byte count is asserted against the blank picture (measured here: 37-48 kB
empty, 1008 kB drawn).

**Its first finding, and what it was (27.07.2026).** `polish`'s
`93-orientation-highlight` was refused on a quiet machine, twice: no
`.building-highlight` was inside the viewport. The §17.3 feature was sound — the
gift is accepted and both markers render — the FRAME was simply never aimed.
`probeSilhouetteFooting` borrows the camera to walk the player onto every
panorama silhouette's bearing and used to hand back only x/z, so the yaw stayed
on the last silhouette and every frame after it inherited that aim; measured
live, the markers then projected to ndc (26.2, 12.6) and (1.62, 1.63). The probe
now restores the whole pose, and the frame aims itself at the marked building.
Read it as the model case: when the shutter refuses, ask FIRST whether the frame
was ever pointed at its subject. Do NOT resolve a refusal by redeclaring the
frame `general` — a check that reports its own subject as optional is the
failure this mechanism exists to prevent.

## Headless limitations

WebGPU IS drivable headless — but only through **system Chrome**
(`channel: 'chrome'` + `--headless=new` on a localhost page, which `_browser.mjs`
selects for `VERIFY_GL=webgpu`); Playwright's *bundled* Chromium has no WebGPU
adapter and silently falls back, which is exactly what `assertBackend` now makes
loud. Two suites stay WebGL2-only (`touch`, `voice`): headless WebGPU under
system Chrome drives neither the CDP touch events nor the TTS speak state, and
both were verified to render correctly on the WebGL 2 path. They are ROUTED to
that lane wherever a run picks them (point 571 above), so making WebGPU the
everyday lane did not take them out of the everyday gate.

Two documented artifacts of the WebGL 2 fallback path (not real-hardware bugs):

- **Ground black-patch class (point 111).** `pow(negative, y)` is `NaN` on
  WGSL/WebGPU but returns a value on GLSL/WebGL 2, so a shader that fed a
  possibly-negative base into `pow` (the ground's Worley `oneMinus().pow(3)`)
  blackened only on WebGPU. The fix clamps the base; the class is a reminder that
  a clean WebGL 2 run does not prove WebGPU shader math.

- **~15 s rAF stall in the built app (point 105) — headless-only artifact.** The
  `vite preview`/production bundle showed a ~15 s requestAnimationFrame gap
  ~14.5 s after boot on a fresh headless profile (TTS-independent; dev was clean).
  The user confirmed on real Chromium/WebGPU (deployed page, fresh tab, ~30 s
  idle) that **no freeze occurs on real hardware**, so it is an artifact of the
  headless WebGL 2 fallback path (compositor/GPU-process timing), not a bug.
  Closed 15.07.2026; nothing to fix.
