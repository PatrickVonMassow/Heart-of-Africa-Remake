# 1455 step 2: merged plan — two browser suites at once

Merger: Fable 5.1 (third model). Inputs: `docs/1455-step1-eval-a.md` (Claude Opus 5.5)
and `docs/1455-step1-eval-b.md` (GPT-6.1 Sol). Counted halves and union:
`docs/four-eyes/1455-blind-a-opus5.json`, `1455-blind-b-sol.json`, `1455-union.json`.
A's text carried ids only for R/C/T; the merger assigned `AV1` (verdict), `AT0` (the
test's common protocol) and `AU1–AU8` (the tooling bullets in order) without changing
the text. B's file echoes its 34 entries twice; normalised to one entry per id.

## 1. Verdict

**Yes under conditions, not yet allowed.** The bound in the runbook stays at one
browser suite until the deciding test (§4) passes. Both halves agree, and the merger
confirms, that the 1452 M3 rejection measured the wrong quantity: single-suite duration
(+1.5–3.5 %) instead of acceptance throughput (13m 44s for 18m 56.5s of serial work,
−27 %). Pairing pays while the overlap-added red rate stays below ~10 % (a false red costs
20–30 min against 5–12 min saved per pair); the real gain is smaller than the pair gain
because only both-backend passes of one point and two points in acceptance pair, and fix
loops (73 % of suite minutes) do not. Landed-point throughput stays unmeasured until the
follow-up window (§4.5).

## 2. What the merger verified in the code and records

| Claim | Result |
|---|---|
| A: the M3 pairs ran in one checkout and counted each other's frames | **Confirmed.** `local/verify-logs/2026-10-27T04-08-28-344-polish-villagers.log` lists the partner as `another verify/browser suite run — FROM THIS CHECKOUT /workspace/hoa/…`. `run.json` `framesWritten`: water-stand-table 2 quiet (03-56-54) vs 13 and 14 overlapped (04-08-28, 04-22-53); villager-dress 28 quiet (M1-q1..q3) vs 30 overlapped. `framesWrittenSince` (`scripts/verify/run-record.mjs:174`) counts by mtime in `<checkout>/verification/` with no run identity; `run-logged.mjs` says so itself for the hang sampler. This also explains B's T8 question (28 vs 30). |
| A: frames and the counter resolve per checkout | **Confirmed.** `OUT` in `scripts/verify/_polish.mjs:18` and `FRAME_DIR` in `run-record.mjs:30` both resolve from the checkout; logs go to the common root. `HOA_FRAME_DIR` would move only the counter. |
| A's open item / B's C4: does the both-backend guard credit a run from a second worktree at the same SHA | **Yes — no blockade.** `render-verify-guard.mjs:104` "Shared evidence is scoped to commits, never to the checkout that wrote it"; `coverageForHead` keys on `run.head` ancestry; state lives at the common repo path; `render-verify-worktree.test.mjs` pins "writes worktree state and receipts to the main checkout". |
| B: ports and BASE_URL unverified | **Verified, nothing to re-tune.** `_server.mjs`: `listen(0)` → `--strictPort` → one retry on a fresh port; base built from that port; per-child kill tree. |
| A: the second-started run is labelled loaded | **Confirmed** in the same log: "MACHINE UNDER LOAD … the run proceeds, its timing verdicts do NOT count as evidence". `annotateResult` lets a green count; `--on-load=off` still reports the load; `defer` would skip the member. The digest has no loaded branch. |
| B: LARGE exclusivity | **Already enforced**: `run-logged.mjs` waits for a live LARGE wrapper in any worktree (README "Before launching a suite"); `VERIFY_NO_WAIT=1` is the only escape and stays unused. Sections do not wait on each other, which is why M3 could overlap. |
| Memory sampler | The 1452 samples are an ad-hoc `/proc/meminfo` loop (`local/1452-mem-m3-*.log`, `HH:MM:SS used_kib= pct=`), not a script; reusing it is re-tuning, not a new mechanism. Host: 15.9 GB; 85 % ≈ 13.2 GiB; idle at M3 start 16.3 %. |
| Charged reds | `scripts/render-verify-charges.mjs` already charges the steady polish-villagers shutter-timing signatures to 1456 and 1292; they stay charged, but their frequency is compared between arms (§4.3, F10). |

A's per-name firing counts for adult-errands WebGL 2 (R5) were not re-counted; they are
A's measurement and only set the expectation for the baseline arm.

## 3. Conditions for pair mode (after the test passes) and the stop rule

- **C1 Admission by pairing** (U14): only section/backend combinations with measured solo
  memory profiles where idle + Δa + Δb ≤ 85 %, or the measured pair peak stayed ≤ 80 % over
  ≥ 5 pairs. heavy + heavy (two villager-dress-class members, Δ ≈ 49 points) is forbidden.
  Section receipts stay PARTIAL; no whole-suite pairing follows from section results.
- **C2 Separate checkouts** (U12): each member in its own checkout; the second backend
  of one point from a worktree at the same SHA (credited, §2).
- **C3 Same deps, immutable SHA** (U13): identical `package.json`, lockfile and
  `vite.config.*` (worktree-bootstrap LINK condition); a dependency-changing branch runs
  solo; nothing edited under a running member.
- **C4 Own port** (U11): already true; never pin `--port`.
- **C5 Never in a pair** (U15, U9): LARGE and closing runs, benchmark, voice, touch,
  startup, picture-stability calibration, full polish suites until profiled.
- **C6 Nothing else heavy beside a pair** (U16): no build/lint/unit gate, local author,
  agent, third browser or picture judgement; landing serial; a remote review (M1) only
  beside a single suite, not beside a pair, until measured.
- **C7 Memory sampled** (U17): the 1452 loop, 5 s, one log per pair; a sample > 85 %
  aborts the later-started member.
- **C8 A red stays a red** (U4): the "loaded" label on the second member is
  informational; no red is discounted, filed as load, or covered by a retry.
- **C9 Stop rule** (U18): any uncharged red in an overlapped run, a sample > 85 %, a HUNG
  run, a crash, lost coverage or doubtful frame provenance → bound back to 1, both
  members' evidence kept, no threshold relaxed. Recovery per cause (F5, F6):
  - *uncharged red*: 2 quiet reruns of the red section on the same build; reproduces quiet
    → charged to its owning point, pairs resume; absent in both → **unresolved** (not
    "attributed": a ~4 % base-rate red also vanishes in 2 reruns ~92 % of the time), pairs
    stay off until the cause is diagnosed and filed. A quiet rerun never erases the red.
  - *sample > 85 %*: that pairing loses admission; it returns only after ≥ 5 pairs with
    measured peak ≤ 80 % in a new qualification block.
  - *HUNG run or crash*: pairs stay off until the run log names the cause and it is filed;
    a cause reproduced solo is charged to its owner and pairs resume.
  - *lost coverage or doubtful frame provenance*: the affected member is rerun solo for its
    evidence; pairs stay off until the provenance cause is fixed and shown by one clean pair.
- **C10 Waits name their log** (U19): `run-wait.mjs <log>` always; `--again` wherever a
  fresh run is the point.

## 4. The deciding test

**4.1 Protocol** (U21): one build (the 1452 same-build `git diff --quiet` set), quiet host,
no other heavy job, every run through `run-logged.mjs --again`, two separate checkouts,
memory sampled every 5 s into one log per pair. The later member starts 60 s after the
first; which section starts first alternates across repetitions; overlap intervals are
read from `run.json` `startedAt`/`finishedAt`.
The memory loop is a watcher, not only a recorder (F2): on a sample > 85 % it sends TERM
to the later member's process group, confirms after 10 s that no child is left, and logs
the abort; the owning session's blocking wait checks the sample log's freshness at every
member finish, and a gap > 15 s counts as a failed sampler (stop, as a breach). Before the
next repetition reuses a checkout, every frame its run wrote is copied to
`local/1455-frames/<log id>/` (F3); the picture judgement works only from those copies.

**4.2 Quiet references** (U20), run block-wise immediately before their pair block:
solo memory profile for villager-dress WebGPU and WebGL 2, water-stand-table WebGPU,
water-jar-carried WebGL 2, adult-errands WebGL 2; duration/red references ≥ 3 each
(villager-dress WebGPU 5, reusing same-build runs where the diff holds); adult-errands
WebGL 2 **10** quiet runs for the per-name base rate.

**4.3 Pair blocks** (U22, U23) — 20 pairs, stop at the first FAIL:

| Block | Pair | Repetitions | Why |
|---|---|---|---|
| 1 | adult-errands WebGL 2 (×2 back-to-back) ‖ villager-dress WebGPU | 5 partners → 10 probe runs | timing-sensitive WebGL 2 probe, riskiest first |
| 2 | villager-dress WebGPU ‖ water-jar-carried WebGL 2 | 7 | the production both-backend case; mixed backend |
| 3 | water-jar-carried WebGL 2 ‖ adult-errands WebGL 2 | 5 (if C1 admits) | WebGL 2 + WebGL 2 |
| 4 | villager-dress WebGPU ‖ water-stand-table WebGPU | 3 | M3 redone across checkouts; proves frame integrity |

Statistics (F4, F7, F8): the independent unit is the **pair** (one shared host window),
not the member run. Qualification needs 20 pairs; if C1 does not admit block 3, its 5
pairs are replaced by 5 more block-2 pairs, and fewer than 20 completed pairs never
qualify. One rule: **any** unresolved red (C9) in a pair member → FAIL; a red that
reproduces quiet is charged and the pair is repeated. 0 failing pairs out of 20 bounds the
per-pair added red rate below 13.9 % at 95 % (1 − 0.05^(1/20)), under the worst-case
break-even of ~17 % (5 min saved per pair against a 30 min false red); the 9.5 % per-run
figure of the halves assumed independent member runs and is withdrawn. Timing probe: the
unit is the partner window (5 overlapped windows against 5 quiet windows of 2 runs each);
per rotating check name (jar mouth, foam drift after shutter, walks on between frames,
order-at-stand, sprint, heading-in-one-frame) FAIL if overlapped total > quiet + max(3,
50 % of quiet), or a name fires ≥ 2× overlapped that never fired quiet. At n = 5 windows
the probe catches only a gross rise; finer drift is left to C9 in production. If the quiet
arm shows a rotating red in more than 5 of 10 runs, the section is no usable probe and
WebGL 2 timing-sensitive pairing stays unqualified. Charged signatures (1456, 1292) stay
charged but are counted in both arms (F10): overlapped count > quiet + max(2, 50 % of
quiet) fails the qualification like an uncharged rise.

**4.4 Pass/fail thresholds** (U24, U17, U10, U28), all must hold: no sample > 85 % (≤ 80 %
for a pairing admitted on measured peaks) and no failed sampler; 0 unresolved reds;
probe passes; every member's `framesWritten` equals its solo count (any cross-count
FAIL); pair wall clock, from the first launch to the last completion, ≤ 0.80 × the sum of
the quiet medians of every run in the window (block 1: 2 × adult-errands + 1 ×
villager-dress) (F9); each member ≤ 1.15 × its quiet median; each
receipt names its own log, section, backend and load lines; a person judges every retained
pair frame against its declared subject and the quiet capture — a missing, substituted or
unusable required picture fails. Host time ≈ 6.5–7 h without a person, supervised by the owning session (§4.1) (≈ 2.5–3 h references,
≈ 4 h pairs); ≈ 2 h if block 1 fails.

**4.5 Operational follow-up** (U24): after admission, wall clock per landed point over the
runbook window (5 landed points or 48 h, whichever is later) against the post-1444 control
of 2.53 h per point, counting diagnosis, repeats, picture work and waits once. Pair mode
stays only if not worse.

## 5. Tooling to re-tune (no new mechanisms)

- `docs/batch-owner-runbook.md` "Local heavy jobs" (U25): after the pass, bound "1, or 2
  browser suites under C1–C10", the qualified pairings, exclusions and C9; replace the M3
  REJECTED line with the test result; keep `POOL_CAP`, the M2 prohibition and LARGE
  exclusivity.
- `docs/1452-step5-measurement.md` (U26): note the cross-contaminated M3 frame counts and
  that the rule measured duration, not throughput.
- `scripts/verify/README.md` (U27): one paragraph — pairs only across checkouts, never
  LARGE, benchmark, voice, touch, startup.
- Load probe (U4): keep the default `--on-load=flag`; the runbook states that the label
  never discounts a red; no wording change under the freeze.
- Frames (U12): separate checkouts, not `HOA_FRAME_DIR`, not a run-identity field.
- `run-wait.mjs` (U19): unchanged; always pass the log; re-measure expected durations only
  from the test's member durations.
- Memory (U17): the 1452 `/proc/meminfo` loop; a sample > 85 % is the abort signal.
- Guard (U2): unchanged — a same-SHA worktree run is already credited.

## 6. Disagreements resolved

| Topic | A | B | Decision and reason |
|---|---|---|---|
| Pair count | 13 pairs, ≥ 30 known-green member runs | 12 pairs, 3 pairings × 4 | 20 pairs in 4 blocks; A's statistical floor (30 green member runs → 9.5 % bound) is the binding number, B's count carried no bound. |
| WebGL 2 villager-dress ‖ water-stand-table WebGL 2 | not proposed | 4 pairs | Rejected: water-stand-table WebGL 2 is red on every recent run (charged), so it detects nothing, and the coincident sum (16 + 49 + 23 = 88–89 %) is inadmissible under C1. |
| Mixed-backend pair | villager-dress WebGPU ‖ water-jar-carried WebGL 2 | adult-errands WebGL 2 ‖ villager-dress WebGPU | Both kept: B's is A's timing probe (block 1); A's is the production both-backend case (block 2, 7 pairs so the green floor is reached). |
| Reference order | all references first, then pairs | interleaved, varied order | Block-wise: references directly before their block; launch order alternates. Bounds host drift at no extra host time while keeping A's stop-at-first-FAIL. |
| Launch timing | 60 s stagger | close together, alternate order | Both: 60 s stagger so the second probe sees the first (exercises the label asymmetry) and alternating order. |
| Full-suite pairs in the test | excluded until profiled | 4 full-suite pairs | Rejected for this test: whole-suite permission is a later measurement; the profile comes first (C5). |
| Throughput threshold | pair ≤ 0.80 × sum of quiet medians | pair sooner than the sum | A's 0.80: at 0.9 a single false red consumes the gain. |
| "Lost throughput advantage" as a stop trigger | — | yes | Not per run (noise); judged over the §4.5 window. |
| GPU diagnostics | not measurable | record available CPU/GPU load | Rejected as a test item: no GPU counter exists on this host; the probe's load average and stray list are recorded, not judged. |
| `--on-load` | flag, or off | keep the probe honest, flag mode | flag only; off drops the recorded label that marks a pair member. |
| Guard credit of a worktree run | open item for backlog | isolation unverified | Closed by code reading: credited by commit; no backlog item. |
| Remote review beside a pair | only beside a single suite | "existing M1 allowance" | Not beside a pair until measured (M1 ran beside one suite). |

Open after this merge: none between the halves. A's adult-errands firing counts are
unverified by the merger and are only the expectation for the quiet arm.

## 7. Id accounting

Every A and B entry sits in exactly one union entry; "kept" means a single-half entry
carried through, "merged" a fold, "rejected" a position rejected with its reason inside
the union entry that holds it.

| Union | From | Disposition |
|---|---|---|
| U1 | AV1, B1 | merged — verdict |
| U2 | B2, AU8 | merged — evidence limits closed by code reading |
| U3 | AR1, AR11, B10, B11 | merged — shared frames / observation errors (verified) |
| U4 | AR2, AC8, AU3, B32 | merged — load label; A's `off` alternative rejected |
| U5 | AR3, B5, B8 | merged — memory |
| U6 | AR4, B6, B25 | merged — GPU; B25's diagnostics item rejected |
| U7 | AR5, B4, B22 | merged — timing-sensitive checks |
| U8 | AR6, B7 | merged — backend extrapolation |
| U9 | AR7, B18 | merged — LARGE exclusive (already enforced) |
| U10 | AR8, B9, B27 | merged — pictures |
| U11 | AR9, AC4, B15, B31 | merged — ports verified |
| U12 | AC2, B16, AU4 | merged — separate checkouts |
| U13 | AC3, B14, AR10 | merged — same deps / immutable SHA |
| U14 | AC1, B12 | merged — admission by pairing |
| U15 | AC5 | kept (only A) — never-in-a-pair list |
| U16 | AC6, AR12, B13 | merged — nothing else beside a pair |
| U17 | AC7, B24, AU6, AT6 | merged — memory sampling and threshold |
| U18 | AC9, B19, B17 | merged — stop rule; B's throughput trigger moved to U24 |
| U19 | AC10, AU5, B33 | merged — waits name their log |
| U20 | AT1, AT2, B21 | merged — quiet references |
| U21 | AT0, B23 | merged — protocol; B's full-suite pairs rejected |
| U22 | AT3, B20, B3, B29 | merged — pair blocks and statistics; B's WebGL 2 dress ‖ water-stand pair rejected |
| U23 | AT4 | kept (only A) — timing probe |
| U24 | AT5, AT7, B26, B28 | merged — thresholds and operational follow-up |
| U25 | AU1, B30 | merged — runbook |
| U26 | AU2 | kept (only A) |
| U27 | AU7 | kept (only A) |
| U28 | B34 | kept (only B) — receipt separation check |

A: 39 entries (AV1, AR1–AR12, AC1–AC10, AT0–AT7, AU1–AU8); B: 34 (B1–B34); union 28.

`blind-merge.mjs` count: see the appended record below.

### blind-merge record (27.10.2026)

    node scripts/blind-merge.mjs --a docs/four-eyes/1455-blind-a-opus5.json \
        --b docs/four-eyes/1455-blind-b-sol.json --union docs/four-eyes/1455-union.json \
        --merged-by "Fable 5.1" --model-a "Claude Opus 5.5" --model-b "GPT-6.1 Sol"
    → 39 A + 34 B entries → 28 union entries (68 of the 73 input entries merged,
      4 only A, 1 only B): every input entry accounted for
    (list authorship UNVERIFIED — no transcript path recorded; the halves' commit
     a31cabd43 and this one carry the author trailers)

Command it printed, to be run by the owner on the landing sha (not run here — the
merger does not record its own fold):

    node scripts/mechanism-review.mjs --record <sha> --model "<the second model>" \
        --verdict merge --mode blind-parallel --merged-by "Fable 5.1" \
        --union "docs/four-eyes/1455-union.json" --list-a "docs/four-eyes/1455-blind-a-opus5.json" \
        --list-b "docs/four-eyes/1455-blind-b-sol.json" \
        --accounting "39 A + 34 B entries → 28 union entries (68 of the 73 input entries merged, 4 only A, 1 only B): every input entry accounted for" \
        --evidence "<what the stage found>"

## 8. Final check (step 3) and fixes

Checker: GPT-6.1 Sol (cross lane, other vendor than the merger Fable 5.1), via
`scripts/ask-lane.mjs --kind audit`, 27.10.2026. First verdict: REJECT, 10 objections
(A1–A10). Fixes by Claude Opus 5.5 (author of half A, not the merger); the fixed plan goes
back to the same checker before anything is implemented.

| Id | Objection (short) | Fix |
|---|---|---|
| F1 / A1 | runbook says only a user decision may trade single-suite slowdown for pair gain | No change: that user decision is point 1455 itself (user order 27.10.2026): "this point replaces that criterion for this question with the goal above" and step 5 "A 2-4 % slower single suite is acceptable when the pair's wall-clock gain outweighs it". The test (step 4) is ordered by the same point. |
| F2 / A2 | > 85 % abort has no watcher; "unattended" | §4.1: the loop aborts the later member's process group, confirms no child is left, stale samples (> 15 s) stop the test; §4.4 wording. |
| F3 / A3 | frames overwritten before the picture judgement | §4.1: copy each run's frames to `local/1455-frames/<log id>/` before reuse. |
| F4 / A4 | two contradicting acceptance rules | §4.3: one rule — any unresolved red fails; the 15-pair extension is dropped. |
| F5 / A5 | one recovery path for all stop causes | C9: recovery per cause. |
| F6 / A6 | 2 quiet reruns cannot attribute a red to overlap | C9: such a red is "unresolved", not attributed; it still stops pairs and fails the test. |
| F7 / A7 | member runs are not independent | §4.3: unit = pair (20 pairs → < 13.9 % per pair, under the ~17 % break-even); probe unit = partner window, power stated honestly. |
| F8 / A8 | skipping block 3 drops below the floor | §4.3: replaced by 5 more block-2 pairs; < 20 pairs never qualify. |
| F9 / A9 | block 1 denominator | §4.4: sum of every run's quiet median in the window, first launch to last completion. |
| F10 / A10 | charged signatures could hide an overlap rise | §2, §4.3: charged signatures counted in both arms with a failing threshold. |
