# 1455 step 1: blind evaluation A (Claude Opus 5.5)

Verbatim from the Claude-lane evaluation; the neutral question is quoted in docs/1455-step1-eval-b.md.

# 1455 blind evaluation, model A (Claude lane)

Question: may two browser suites run at once on this host, and under which conditions?
I measured everything below this session (read-only). I did not read eval-b.md.

## 1. Verdict: YES-UNDER-CONDITIONS, not yet allowed. The 1452 data cannot decide it.

**Throughput.** The measured bottleneck is local acceptance on one heavy-job slot: 33.3 h of
acceptance phase against 7.1 h of authoring. Inside it are 15.8 h of finished suite time plus
~4.3 h of hung runs in 70.5 h (`docs/1452-throughput-inventory.md`). 1452 M3 measured
one pair at 13m 44s / 13m 39s wall clock against 18m 56.5s serial. That is a 27 % gain on an
unbalanced pair, and a balanced pair can gain up to ~45 %. The per-suite slowdown was
1.5–3.5 %. The 1452 rule rejected pair mode because it judged single-suite duration, and
that is the wrong measure for the stated goal. On throughput alone, pairing pays as long as
the induced red rate stays under ~10–20 % per run. A false red costs one quiet rerun plus a
diagnosis, about 20–30 min, against ~5–12 min saved per pair.

**Real gain is smaller than the pair gain.** A pair only exists when two independent suites
are ready at the same moment. That happens in two cases:
1. The two backends of the same section for one point. This is the common both-backend case.
2. Two points in acceptance at once. After 1444, 7.5 h of finished branches waited behind
   one local acceptance.

Fix loops (73 % of finished suite minutes are red runs) are serial and do not pair. My
estimate is 15–30 % less suite wall clock, i.e. roughly 2–5 h per 70 h window. It is
calibratable and must be read off a real cycle.

**Why not yet.**
- **Too few runs.** 4 overlapped runs with 0 reds bound the overlap-added red rate only
  below 53 % (95 %, exact one-sided: 1 − 0.05^(1/4)).
- **M3 was in one checkout, and its frame verdicts were contaminated.** Both runs shared
  `verification/`, and the run-record frame counter counted the other run's pictures:
  - water-stand-table: 2 frames quiet (`03-56-54-724.run.json`), but 13 and 14 "written"
    when overlapped (`04-08-28-344`, `04-22-53-350`).
  - villager-dress: 28 quiet, 30 overlapped.

  That is a measured path to a false "frames complete" (R1). 1452 did not notice it.
- **The pair tested little.** M3 measured one WebGPU+WebGPU pair. It had no WebGL 2 run, no
  timing-sensitive probe and no full suite. The short partner covered only ~41 % of the
  long run.

## 2. Risks

| Id | Risk | Likelihood | How it shows |
|---|---|---|---|
| R1 | **Shared frame directory → false approval.** `framesWrittenSince` (`scripts/verify/run-record.mjs:174`) counts distinct names by mtime in `<checkout>/verification/` with no run identity. A run that is short of frames is masked by the partner's frames. The hang sampler (`run-logged.mjs:393–420`) is kept alive by the partner's frames, so a wedged run's HUNG verdict is delayed. | **Certain in one checkout** (measured: +11/+12 and +2). None across checkouts, because `OUT` and `FRAME_DIR` resolve per checkout root. | A receipt that says `extra` or "complete" for a run that stopped short. A hung run reported SLOW until the partner ends. |
| R2 | **The second-started run is labelled "loaded".** machine-load counts the partner as a `verifyRun` stray, so the level is `loaded`. Every polish suite is in `TIMING_SENSITIVE_SUITES`, so the action is `flag` and the run says "its timing verdicts do NOT count as evidence". Both M3 partners carry this line. This conflicts with "a red stays a red": a real red could be waved off as load. The first-started run carries no label (asymmetric). | Certain for the second-started run | The log line "the machine is loaded … do NOT count as evidence". |
| R3 | **Memory.** Idle is ~17 %. Solo peaks: villager-dress 66 % (+49 points), water-stand-table 38–40 % (+23). The pair reached 73–75 % only because the two peaks did not coincide: if they had, 17 + 49 + 23 = 89 % > 85 %. Two heavy sections (e.g. villager-dress on both backends): 17 + 49 + 49 ≈ 115 %, which means swap or OOM under WSL2. The full polish-villagers run (43 min) and LARGE were never memory-sampled. villager-dress peaks in its last minute (still growing). | High for heavy+heavy, low for heavy+light | Samples above 85 %, swap use, browser crash or "Target closed", a hung run. |
| R4 | **GPU contention cannot be seen.** Both lanes reach the same GPU through `/dev/dxg` (WebGPU, and WebGL 2 via Mesa `d3d12`). machine-load reports "GPU load NOT measured" on this host. | Medium | Only indirectly: a lower frame rate leads to R5 reds and longer durations. |
| R5 | **Timing-sensitive checks.** At a lower frame rate each frame's step is larger, and settle and shutter windows slip. The rotating WebGL 2 adult-errands checks are exactly of this kind. Firing counts in 15 WebGL 2 runs since 18.10: jar mouth under water 3, foam drifted after shutter 3, filmed adult walks on between frames 2, order-at-stand 6. On WebGPU, "sprint" fired 5 times in 26 runs. water-stand-table WebGL 2 "one whole water errand recorded … frames, timeout" is red on every recent WebGL 2 run (frame-budget bound). | Medium–high | A higher firing rate of these check names in overlapped runs. |
| R6 | **WebGL 2 is more load-sensitive than WebGPU.** It had a longer and noisier record (villager-dress WebGL 2 6/9 green against WebGPU 25/26). M3 had no WebGL 2 at all. | Medium, unmeasured | A WebGL 2 red that appears only in pairs. |
| R7 | **LARGE runs.** 115–121 min both-backend, with build and preview; it is the closing and bundle evidence. Its memory profile is unknown, and a pair would stretch the window in which any contention can hit. | High cost if it goes wrong | A LARGE red that does not reproduce. |
| R8 | **Picture checks and screenshot timing.** Frames shot under contention can catch a late glTF body arrival, LOD or settle state. The shutter checks catch a missing subject, but not every quality difference. `picture-stability` metrics would drift if calibrated from pair runs. | Low–medium | Frame metrics outside their STABLE band. A person judging a degraded frame. |
| R9 | **Ports.** `_server.mjs` takes an OS-assigned port (listen 0), closes it, then binds vite with `--strictPort`, with one retry. `gpu-backend-probe` and `ttsCache` use listen(0) directly. Playwright uses a pipe and a temporary profile, with no fixed debugging port. | Negligible | "server did not bind … retrying" twice, then a red. |
| R10 | **Shared state across checkouts.** `.claude/render-verify-state.json` is an unlocked read-modify-write (atomic rename, but last writer wins), so two exits at the same moment can lose one run record. That fails closed: it costs a rerun, not a false green. Worktree `node_modules` is a symlink to the main one, so `node_modules/.vite/deps` is shared, and a checkout with a different lockfile or vite config re-optimizes under the partner's server (reload or 504). `run-wait.mjs` with no log argument refuses when two runs are live (U13): safe. | Low | A missing run record. A vite reload in the middle of a suite. An "ambiguous" refusal. |
| R11 | **Same-section same-backend pair in one checkout.** Identical frame names overwrite each other, so a picture judgement would read the other run's frame. | Certain if done | — (forbidden by C2) |
| R12 | **A third load beside a pair.** M1 accepted only one remote review beside one suite. Unit, build or lint beside a suite is rejected (M2, +12 %). | — | — (forbidden by C6) |

## 3. Conditions and stop rule

- **C1 Admission by pairing, not globally.** Pair two suites or sections only if both have a
  measured solo memory profile and either:
  - the coincident-peak sum (idle + Δa + Δb) is ≤ 85 %, or
  - the sampled pair peak (T6) stayed ≤ 80 % over ≥ 5 pairs.

  heavy+heavy (two villager-dress-class runs) stays forbidden until T1 shows otherwise.
- **C2 Separate checkouts.** Each pair member runs in its own checkout, so `verification/`,
  `dist/` and the frame counter are separate (fixes R1, R11). For one point's two backends,
  the second runs from a worktree at the same SHA. Check that the both-backend guard credits
  a run recorded from that worktree (branch/head keying in `render-verify-state`). If it
  does not, use the point's own worktree plus the main tree on the same SHA.
- **C3 Same deps.** Both checkouts are identical in `package.json`, `package-lock.json` and
  `vite.config.*` (R10). A branch that changes dependencies runs solo.
- **C4 Own port per run.** This is already true (`_server.mjs`). Change nothing; just never
  pin `--port`.
- **C5 Never in a pair:**
  - LARGE and closing runs
  - `benchmark` (performance numbers), voice, touch and `startup`
  - picture-stability calibration runs
  - full polish suites until their solo memory profile is measured
- **C6 Nothing else heavy beside a pair.** No unit, build or lint gate and no local agent
  (M2). A remote review stays allowed only beside a single suite (M1 is not proven for pairs).
- **C7 Memory sampled.** Sample memory every 5 s for every pair and abort the later-started
  member if a sample is > 85 %. This uses the existing `/proc/meminfo` sampling from 1452, not
  a new guard.
- **C8 A red stays a red.** The R2 "loaded" label is informational only. A red in either
  member is charged like a quiet red, never filed to the charge ledger as load, and never
  covered by a retry (a retry is SUSPECT).
- **C9 Stop rule.** Any uncharged red in an overlapped run, or a memory sample > 85 %, or a
  HUNG run, switches pair mode off (bound back to 1). Pair mode returns only after a quiet
  rerun of the red section on the same build:
  - The red reproduces quiet: it belongs to its owning point, and pair mode resumes.
  - It does not reproduce in 2 quiet runs: it is overlap-attributed. Pair mode stays off
    until that cause is diagnosed and filed.
- **C10 Waits name their log.** Always call `run-wait.mjs <log>` with the log path. Never use
  the newest-live default.

## 4. The deciding test

Common to all blocks:
- One build (the 1452 same-build `git diff --quiet` set), a quiet host, no other heavy job.
- Every run goes through `run-logged.mjs`.
- Memory is sampled every 5 s with the shared pair log.
- **Every pair runs in two separate checkouts (C2).**
- The later member starts 60 s after the first, so the heavy phases overlap.

- **T1 Solo memory profiles (quiet references).**
  - Runs: 1 sampled solo run each of villager-dress WebGPU and WebGL 2, water-stand-table
    WebGPU, water-jar-carried WebGL 2 and adult-errands WebGL 2.
  - Gives: Δpeak above idle, for C1.
  - Existing data reused: villager-dress WebGPU 66 %, water-stand-table 38–40 %.
- **T2 Quiet duration and red references on the test build.**
  - villager-dress WebGPU 5 (3 exist on 9044a6684 if same-build; else 5 new)
  - water-stand-table WebGPU 3
  - water-jar-carried WebGL 2 3
  - villager-dress WebGL 2 3
  - adult-errands WebGL 2 **10** (the base firing rate of each rotating check name)
- **T3 Known-green detector pairs (zero-red test).** Sections with a clean recent record:
  villager-dress WebGPU (25/26, clean since 24.10) and water-jar-carried WebGL 2 (5/5).
  water-stand-table WebGPU is accepted from M3.
  - **A (WebGPU+WebGPU):** villager-dress WebGPU ‖ water-stand-table WebGPU, 3 new pairs.
    With M3's 2 that makes 5, but M3's frame verdicts are void (R1).
  - **B (mixed backend, the real both-backend case):** villager-dress WebGPU ‖
    water-jar-carried WebGL 2, 5 pairs.
  - **D (WebGL 2 + WebGL 2):** water-jar-carried WebGL 2 ‖ adult-errands WebGL 2, 5 pairs.
    Only allowed if T1 admits it (C1).
  - **Pass:**
    - 0 overlap-attributed reds (C9 attribution) in ≥ 30 known-green member runs.
      That bounds the added red rate below 9.5 % at 95 %.
    - At most 1 attributed red is allowed only if 15 more pairs then show 0 (≥ 60 runs,
      bound ≈ 7.7 % for one red in 60).
    - 2 or more attributed reds: FAIL.
  - Statistical note: with a base red rate of ~4 % (1/26), plain "0 reds" over 30 runs would
    fail by chance ~70 % of the time. That is why each red is attributed through a quiet
    rerun first.
- **T4 Timing-sensitive probe (WebGL 2), on adult-errands WebGL 2.**
  - Setup: 5 villager-dress WebGPU runs (13 min each) as partners. Each hosts 2 back-to-back
    adult-errands WebGL 2 runs (~5 min each), giving 10 overlapped runs.
  - The partner runs also count toward T3.
  - Counted: per run, the firing of each rotating check name (jar mouth, foam drift, filmed
    adult walks on, order-at-stand, sprint, heading-in-one-frame). The steady charged
    rim/handover pair is excluded.
  - **FAIL** if any of these holds:
    - total rotating firings overlapped > quiet + max(3, 50 % of quiet);
    - a check name fires ≥ 2× overlapped that never fired in the 10 quiet runs;
    - one-sided Fisher on "any rotating red per run" gives p < 0.10.
  - Limit (stated): with n = 10 per arm at a base of ~20–40 % this detects only about a 2×
    rise. A smaller effect is left to the C9 stop rule in live use.
- **T5 Throughput, read off T3 and T4.**
  - Pair wall clock ≤ 0.80 × the sum of the quiet medians (median over pairs).
  - Each member ≤ 1.15 × its quiet median, so the existing runtime and ceiling expectations
    in `run-wait` stay valid.
  - Recorded, not used to judge: the 1452 "above the quiet median" rule.
  - After admission, landed points per hour over the next real cycle are compared with the
    post-1444 control (2.53 h per point). Pair mode stays only if they are not worse.
- **T6 Memory.**
  - No sample > 85 % in any pair.
  - A pair admitted under the C1 measured-peak branch needs every peak ≤ 80 %.
- **T7 Frame integrity.**
  - In every pair, each member's `framesWritten` equals its solo T2 count (e.g.
    water-stand-table 2, not 13).
  - This proves C2 works. Any cross-count is a FAIL.

The test is run in sequence and stops at the first FAIL. Order:
1. T1
2. T2
3. T4 (riskiest: WebGL 2 and timing)
4. T3 B
5. T3 D
6. T3 A

Host time is ≈ 2.75 h of quiet references plus ≈ 3.75 h of pairs, about 6.5 h, unattended
on a quiet host. If T4 or B fails early, it stops after ~2 h.

## 5. Tooling to re-tune (no new mechanisms)

- **`docs/batch-owner-runbook.md`, "Local heavy jobs".** Change the bound 1 to "2 browser
  suites under C1–C10", and only after T1–T7 pass. Replace the M3 REJECTED line with the
  T-result. Keep `POOL_CAP` untouched.
- **`docs/1452-step5-measurement.md`.**
  - Note that the M3 frame counts are cross-contaminated (R1).
  - Note that its decision rule measured duration, not throughput.
- **Load label (R2).**
  - Pair runs use the existing `--on-load=flag`.
  - The runbook states that the label never discounts a red (C8).
  - Alternatively, use `--on-load=off` for the pair, which still reports the load.
  - Do not use `defer`: it would make the second member skip.
- **Frame directory (R1).** Use separate checkouts (C2) instead of a new run-identity
  field. `HOA_FRAME_DIR` is no fix, because suites write to `OUT`, which is resolved per
  checkout.
- **`run-wait.mjs`.** Change nothing; always pass the log (C10).
- **1452 memory sampling.** Reuse the `/proc/meminfo` 5 s sampling, and use a sample over
  85 % as the abort signal (C7).
- **`scripts/verify/README.md`.** Add one paragraph: pairs only across checkouts, and never
  for LARGE, benchmark, voice or touch.
- **Open item.** Check whether the both-backend guard credits a run recorded from a
  same-SHA second worktree (C2). If it does not, that is a current blockade of pair use and
  is fixable under the freeze rule. Note it in `docs/backlog.md`.
