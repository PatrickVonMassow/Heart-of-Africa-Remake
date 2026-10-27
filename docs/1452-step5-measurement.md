# 1452 step 5: measurements under real load

The approved plan is `docs/four-eyes/1452-union-r1.json` (step 4 re-check: APPROVE). Step 5
measures every entry that adds local load before step 6 decides. Entries that add no local
load (U1–U3, U8, U12–U17) need no load measurement; their effect is read off the next
measured cycle (step 8).

| Id | Entry | Load added | Protocol | Accept when |
|---|---|---|---|---|
| M1 | U4: cross-vendor review beside a running suite | a remote model call (`scripts/cross-review.mjs`) | one known-green suite section, same build, 2 quiet runs and 2 runs with a review running beside them, host memory sampled in the loaded runs | loaded duration not above the quiet median, zero added reds, sampled loaded host peak within budget |
| M2 | U5(2): one CPU gate (build, lint, unit) beside one browser suite | `npm run build`, `npm run lint`, `npm run test:unit` | same section and build, 2 quiet and 2 loaded runs, host memory sampled | as M1, peak host memory within budget, and landed points/hour above a current-policy control |
| M3 | U5(1): two browser suites at once | a second suite on its own port | two different known-green sections, same build, each 2 quiet and 2 overlapped, host memory sampled | as M2; the bound stays 1 unless all hold |
| – | U5(3): local author beside a suite | – | not measured now: relevant only after the cloud credit expires 05.11.2026 (U5) | – |

**Same build** (review 28b7f92, finding 1): the compared runs need not share a SHA, but
`git diff --quiet <a> <b> -- src public index.html package.json package-lock.json 'vite.config.*' 'playwright*.config.*' tests scripts/verify`
must exit 0 between every pair of them — game code, dependencies, build and browser-test
configuration and the verification scripts. Checked 27.10: 69b25f938 = 8945394d7 = 9044a6684.

**Memory budget** (review 28b7f92, finding 2; plan line 47 "peak host/process memory" for all
three; calibratable): peak host memory in use (MemTotal − MemAvailable from `/proc/meminfo`,
sampled every 5 s over the whole run, so every workload running counts) stays at or below
85 % of MemTotal — on this 15 GiB host at least 2.3 GiB stay available. A sampled run records
its peak and its sample log under `local/`. M1's loaded runs l1/l2 were not sampled (review f8b00a5d): M1's memory check needs one
more loaded run with sampling; its duration joins the loaded set.

**Points/hour** (plan line 47, missing from the first draft): M2 and M3 also need landed
points/hour above a current-policy control, read from the step-8 cycle notes.

Every run is recorded by `scripts/verify/run-logged.mjs`; the comparison quotes each run's
`local/verify-logs/*.run.json`. Results are appended below as they arrive.

## Results

Reference section for M1/M2: `polish-villagers --section=villager-dress`, WebGPU (57 green
runs on record). Second section for M3: `polish-speech --section=speech-distance-scale`.

| Run | Variant | SHA | Started (UTC) | Duration | Verdict | Load avg at start | Log |
|---|---|---|---|---|---|---|---|
| M1-q1 | quiet | 69b25f938 (main) | 27.10 00:30 | 13m 12s | GREEN, 28 frames | 0.13 | `local/verify-logs/2026-10-27T00-30-26-762-polish-villagers.log` |
| M1-q2 | quiet | 69b25f938 (main) | 27.10 00:44 | 15m 05s | GREEN, 28 frames | not read (concurrent: owner session pushing the branch, CI remote) | `local/verify-logs/2026-10-27T00-44-14-560-polish-villagers.log` |
| M1-l1 | review beside (`cross-review.mjs` on 8945394, GPT-6.1 Sol, ~10 min of the run) | 8945394d7 (main; no `src/` change since 69b25f938) | 27.10 01:12 | 13m 17s | GREEN, 28 frames | 1.96 (decaying pre-push gate) | `local/verify-logs/2026-10-27T01-12-34-675-polish-villagers.log` |
| M1-l2 | review beside (`cross-review.mjs` of this protocol, GPT-6.1 Sol, 2.8k chars, first ~9 min of the run) | 9044a6684 (main; same build as q1/q2/l1) | 27.10 01:35 | 13m 19s | GREEN, 28 frames | 3.06 | `local/verify-logs/2026-10-27T01-34-59-921-polish-villagers.log` |
| M1-q3 | quiet, memory-sampled (planned as l3; no review overlapped the run — the re-check of ef5db73 had finished before its start, so it counts as quiet) | 9044a6684 (main; same build) | 27.10 01:50 | 13m 27s | GREEN, 28 frames | 0.88 | `local/verify-logs/2026-10-27T01-50-17-866-polish-villagers.log`; samples `local/1452-mem-m1-l3.log`, peak 66.4 % (10.8 GiB of 15.5 GiB) |
