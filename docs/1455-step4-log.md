# 1455 step 4: deciding test — run log

Plan: `docs/1455-step2-merged-plan.md` (approved by GPT-6.1 Sol, §8).

## Setup (27.10.2026)

- Build: `190dd4524`, two detached checkouts `local/1455/wt-a`, `local/1455/wt-b`
  (worktree-bootstrap LINK, C2/C3).
- Watcher: `local/1455/pair.sh <tag> <dirA> <glA> "<argsA>" [<dirB> <glB> "<argsB>"
  [stagger]]` — §4.1 as approved: members under `setsid setpriv --pdeathsig TERM`, EXIT
  trap ends both groups, 5 s `/proc/meminfo` samples, > 85 % aborts the later member, a gap
  > 15 s marks the run VOID, frames archived to `local/1455-frames/<log id>/`. Each run
  writes `local/1455/runs/<stamp>-<tag>/{mem.log,status,A.out,B.out}`.
- Smoke run (one member, water-stand-table WebGPU, wt-a): GREEN 5m 49s, 2 frames (the
  quiet M3 count), status OK, 2 frames archived, peak memory sampled.

## Progress

- Block 1 quiet references started 12:57 (`local/1455/refs-block1.sh`): adult-errands
  WebGL 2 ×10, then villager-dress WebGPU ×5, sequential on wt-a. Output
  `local/1455/refs-block1.out` ends with `BLOCK1-REFS-DONE`.
- Next: block 1 pairs (adult-errands WebGL 2 ×2 back-to-back on wt-a ‖ villager-dress
  WebGPU on wt-b, 5 windows, alternating start order), then blocks 2–4 with their
  references directly before each block (§4.2–4.3).
- Block 1 pairs, first attempt 14:13 (`runs/2026-10-27T14-13-36-pair-b1-1`): the watcher
  died about 1 min in together with the session that had launched it (no `status`, last
  memory sample 14:14:32, member A at 0/23 frames, member B never started). VOID — no
  evidence either way. §4.1 sweep found no surviving browser, `run-logged`, `vite` or
  checkout process. Restarted 14:37 detached from the session (`setsid nohup`), so a
  session end no longer ends a watcher.

## Block 1 quiet references — adult-errands WebGL 2

| Run | Result | Duration | Frames | Failing |
|---|---|---|---|---|
| ref-ae-gl-1 | RED | 6m 18s | 9/23 | order at the stand (charged, point 642, webgl) |
| ref-ae-gl-2 | RED | 6m 10s | 9/23 | same |
| ref-ae-gl-3 | RED | 5m 51s | 9/23 | same |
| ref-ae-gl-4 | RED | 6m 23s | 6/23 | order at the stand; adult walks on between moving-capture frames 1 and 2 (point 1404) |
| ref-ae-gl-5 | RED | 7m 41s | 9/23 | order at the stand; water rim band (point 568) |
| ref-ae-gl-6 | RED | 6m 29s | 9/23 | order at the stand; river-bank foam after the shutter (point 1456); water rim band (point 568) |
| ref-ae-gl-7 | RED | 6m 09s | 6/23 | order at the stand; walks on between frames 1 and 2 (point 1404); water rim band (point 568) |
| ref-ae-gl-8 | RED | 6m 05s | 9/23 | order at the stand; water rim band (point 568); exit 2 only from STRIKE notices of intermittent charges (1456, 1202) |
| ref-ae-gl-9 | RED | 6m 09s | 9/23 | order at the stand; water rim band (point 568); exit 2 only from STRIKE notices of intermittent charges (1456, 1202) |
| ref-ae-gl-10 | RED | 7m 41s | 9/23 | order at the stand; water rim band (point 568) |

Base rate (10 quiet runs, counted from each run's `A.out` FAIL lines; the row texts above name only the leading signatures): order at the stand (642) 10/10; water rim band (568) 10/10; river-bank foam after the shutter (1456) 3/10 (runs 2, 4, 6); walks on between frames (1404) 2/10 (runs 4, 7). Median duration 6m 14s (5m 51s – 7m 41s).

Verdict after 6 of 10 (27.10.2026): the order-at-stand signature fired in 6 quiet runs, above
the "more than 5 of 10" bound of plan §4.3 whatever the last four show — adult-errands
WebGL 2 is **no usable probe**; WebGL 2 timing-sensitive pairing stays unqualified. The
remaining references still run: block 3 pairs adult-errands WebGL 2 and its signature-rate
comparison needs ≥ 10 quiet runs.

Earlier reading after 3 of 10: the order-at-stand signature fires in every quiet run so far. If it
holds above 5 of 10, §4.3 applies: adult-errands WebGL 2 is no usable probe and WebGL 2
timing-sensitive pairing stays unqualified (block 1 then reduces to the memory/duration
role of its villager-dress member; the probe verdict is recorded as "unqualified"). The
remaining 7 references run on to fix the base rate; nothing is filed — the signature is
already charged.

## Block 1 quiet references — villager-dress WebGPU

| Run | Result | Duration | Frames | Peak memory |
|---|---|---|---|---|
| ref-vd-gpu-1 | GREEN | 13m 12s | 28 | 66.0 % |
| ref-vd-gpu-2 | GREEN | 13m 23s | 28 | 62.5 % |
| ref-vd-gpu-3 | GREEN | 13m 04s | 28 | 69.5 % |
| ref-vd-gpu-4 | GREEN | 12m 54s | 28 | 66.6 % |
| ref-vd-gpu-5 | GREEN | 13m 46s | 28 | 69.0 % |

Median 13m 12s; solo frame count 28; peak 62.5–69.5 %. ref-vd-gpu-4: `pair.sh` was edited
on disk while that watcher was running (the pdeathsig/fold change, 4817cde03), and bash read
the changed file mid-loop: the sampler covered the whole run (156 samples, no gap), the
post-loop step died with a syntax error, so no `status` was written and its frames were not
archived before ref-vd-gpu-5 reused wt-a. Its duration, verdict, frame count and memory stand;
its frames are not used for picture judgement (four archived quiet captures remain). Rule
kept for the rest of the test: `pair.sh` is not edited while a watcher runs.

## Block 1 pair 1 — ABORT-MEMORY (27.10.2026, 15:35–15:48)

Run `local/1455/runs/2026-10-27T14-35-49-pair-b1-1` (start order: adult-errands WebGL 2 ×2
on wt-a first, villager-dress WebGPU on wt-b 60 s later).

| Member | Result | Duration | Frames | Note |
|---|---|---|---|---|
| A1 adult-errands WebGL 2 | RED | 6m 27s | 9/23 | order at the stand (642), water rim band (568), plus three names that never fired in the 10 quiet runs: jar's mouth under the surface (−0.2498 m against −0.25 m), "nothing stands between him and the lens", "still under it at the shutter" |
| A2 adult-errands WebGL 2 | RED | — | 9/23 | order at the stand (642), water rim band (568) only |
| B villager-dress WebGPU | ABORTED | 11m 40s of a 13m 12s median | 28 (= solo) | TERM by the watcher at 15:48:29, sample 85.5 % |

Memory: rose with both members up to 80.2 % (15:43:49), dropped when A1 ended, then climbed
again under A2 + B to 81.5, 82.3, 84.7 and 85.5 % (15:48:14–15:48:29). Samples were 5 s
apart with no gap (154 samples). The sweep afterwards found no surviving process.

Quiet profiles from the block-1 references (first sample → peak): adult-errands WebGL 2
17.4–19.9 → 37.7–39.9 % (Δ ≈ 20 points), villager-dress WebGPU 10.9–19.0 → 62.5–69.5 %
(Δ ≈ 47–55). That puts idle + Δa + Δb at ≈ 88 %, so C1 would not have admitted this
pairing in production. The plan had made only block 3 conditional on C1 and left block 1
unconditional, so the test ran into the budget it was meant to protect. The pair met
exactly what C1 predicted. This is a finding about the plan, not a flaky run.

## Verdict (step 5)

**FAIL** under §4.4 ("no sample > 85 %"), and §4.3 stops the test at its first FAIL. The
plan is not changed after the failure. Moving the criterion after seeing a result is the
thing the six-eyes procedure exists to prevent, and C9 relaxes no threshold. So the point's
step 5 applies: **the bound stays at one browser suite**, recorded in
`docs/batch-owner-runbook.md` ("Local heavy jobs"). Step 6 (implementation) and step 7
(practice) lapse.

What the one completed window still shows, as information only:
- every pairing with a villager-dress-class member (Δ ≈ 50) has at most ≈ 15 points of
  headroom above idle, so only light partners would fit, and the measured pair gain was
  largest exactly for the heavy suites;
- adult-errands WebGL 2 under overlap fired three timing names never seen in its 10 quiet
  runs (1 window, so no rate claim).

A narrower re-qualification (only C1-admitted light pairings, a new six-eyes plan) is
possible but not started: it is a new solution and needs a user order.
