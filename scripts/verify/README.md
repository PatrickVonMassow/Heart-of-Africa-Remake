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

`npm test` (`scripts/verify/run-all.mjs`) runs, in order: type-check + build →
lint → **vitest (fail-fast)** → the Playwright browser suites against the dev
server → the production-preview smoke test.

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

The **WebGPU lane pins the opposite way** on Linux — `--use-angle=swiftshader`
`--enable-features=Vulkan` `--use-vulkan=swiftshader`, all three. There is no
hardware Vulkan device Chrome will accept on this host (see `docs/host-environment.md`),
and with the stacks left to disagree the lane reports an adapter, initialises
`isWebGPUBackend` and paints NOTHING: the page throws `Instance dropped in
popErrorScope` and the canvas stays black behind a live HUD. It is the correct
picture at software speed, and `backend-lane-check.mjs` labels it as software so it
can never be read as the GPU.

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

| Tier | Command | Browser suites | Preview |
|------|---------|----------------|---------|
| **SMALL** (everyday gate) | `npm run test:small` | `docs, i18n, flow, health, events, collision, voice` — fast, low-flake, core coverage (doc/i18n consistency, the one E2E core loop, health/events/collision, TTS) | no |
| **LARGE** (default) | `npm test` / `npm run test:large` | **all 18** — SMALL plus the heavier scene/geometry/screenshot suites (`world, handwriting, polish, gamepad, touch, settings, invariants`), `startup` (the point-337 loading-picture freeze budget), `benchmark` (the in-game F8 measurement run), `report` (the F6 bug-report archive, whose PNG member is decoded and checked for real scene content) and `enrichments` (the wildlife/atmosphere staging, which carries the rotating family flakes) | yes |

Both tiers run the same Vitest + build + lint preflight. SMALL is a strict subset
of `DEV_SUITES`; keep it that way. New heavy or flaky browser scenarios join
LARGE only (they must not slow or flake the everyday gate).

The suite→tier→backend map itself is a **pure module**: `scripts/verify/tiers.mjs`
holds `DEV_SUITES` / `SMALL_SUITES` / `WEBGL_ONLY_SUITES` and the arg, suite and
backend-plan functions `run-all.mjs` drives, and `scripts/verify/tiers.test.mjs`
pins them in the Vitest layer (the subset rule, the WebGPU skip, and that a bare
LARGE run plans WebGL 2 → WebGPU while a pinned `VERIFY_GL` / SMALL / a bare suite
filter stays single-backend). Change the map in `tiers.mjs` and this README
together — never only in the runner.

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
which is why the baseline runs twice by default, `--runs n`), or
**INCONCLUSIVE** (the baseline never ran that check).

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
| `settings.mjs` | eye-height, in-scene walk measures, `user-select` CSS, lion-feed, ambience/proximity audio, village speech really scheduling audio (§13.4: near vs. out of earshot vs. phrase), Tab focus, TRAA pipeline toggle (rebuild + non-black frame + leak gate, WebGL 2 path) | `src/config/balance.test.ts`, `src/systems/movement.test.ts`, `src/systems/ambience.test.ts` (the speech scheduling), `src/communication/speaking.test.ts` (pace, pause, attenuation, hearing), `src/state/store.debug.test.ts`, `src/ui/DebugMenu.test.tsx` (incl. the TRAA checkbox) |
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

Two suites carry no assertion, each for a structural reason:

| Suite | Why no `assertBackend` |
|---|---|
| `docs` | Pure Node doc-structure check — it never opens a browser. |
| `preview` | Runs the PRODUCTION build, where `window.__renderer` is dev-only and does not exist. It also runs on the WebGL 2 lane only (the WebGPU pass skips the preview). |

A full LARGE run (`npm test` / `npm run test:large`, no `VERIFY_GL` pinned) now
covers BOTH backends automatically (point 204b): run-all runs the whole LARGE on
WebGL 2 (with the build/lint/unit preflight + prod preview), then re-runs the
render browser suites on WebGPU (system Chrome) with the backend-agnostic
preflight/preview skipped (`RVA_SKIP_PREFLIGHT`). An explicit `VERIFY_GL=…` (the
render-verify gate's per-backend clear command), the SMALL tier, or a bare
single-suite filter stays a single-backend pass. The WebGL 2 pass runs first; a
failure there stops before WebGPU.

Per-backend commands (what the render-verify gate uses to clear a GUI change on
both backends):

```
VERIFY_GL=webgl  node scripts/verify/run-all.mjs polish   # WebGL 2 pass of one suite
VERIFY_GL=webgpu node scripts/verify/run-all.mjs polish   # WebGPU pass of one suite
npm test -- large polish                                  # the same suite on BOTH, preflighted
```

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
screenshot WITHOUT a path is a pixel probe and is left alone; `shot()` returns
the buffer for the few frames that are both.)

`FRAME_SUBJECT_SELFTEST=1 node scripts/verify/world.mjs` proves the gate still
bites — it stands the traveller in Cairo, claims Lake Victoria, and requires the
capture to be refused and no file written.

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
both were verified to render correctly on the WebGL 2 path.

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
