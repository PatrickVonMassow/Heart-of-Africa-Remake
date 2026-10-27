# 1452 step 5: measurements under real load

The approved plan is `docs/four-eyes/1452-union-r1.json` (step 4 re-check: APPROVE). Step 5
measures every entry that adds local load before step 6 decides. Entries that add no local
load (U1–U3, U8, U12–U17) need no load measurement; their effect is read off the next
measured cycle (step 8).

| Id | Entry | Load added | Protocol | Accept when |
|---|---|---|---|---|
| M1 | U4: cross-vendor review beside a running suite | a remote model call (`scripts/cross-review.mjs`) | one known-green suite section, same SHA, 2 quiet runs and 2 runs with a review running beside them | loaded duration not above the quiet median, zero added reds |
| M2 | U5(2): one CPU gate (build, lint, unit) beside one browser suite | `npm run build`, `npm run lint`, `npm run test:unit` | same section and SHA, 2 quiet and 2 loaded runs, peak memory sampled | as M1, and peak memory within budget |
| M3 | U5(1): two browser suites at once | a second suite on its own port | two different known-green sections, each 2 quiet and 2 overlapped | as M2; the bound stays 1 unless all hold |
| – | U5(3): local author beside a suite | – | not measured now: relevant only after the cloud credit expires 05.11.2026 (U5) | – |

Every run is recorded by `scripts/verify/run-logged.mjs`; the comparison quotes each run's
`local/verify-logs/*.run.json`. Results are appended below as they arrive.

## Results

Reference section for M1/M2: `polish-villagers --section=villager-dress`, WebGPU (57 green
runs on record). Second section for M3: `polish-speech --section=speech-distance-scale`.

| Run | Variant | SHA | Started (UTC) | Duration | Verdict | Load avg at start | Log |
|---|---|---|---|---|---|---|---|
| M1-q1 | quiet | 69b25f938 (main) | 27.10 00:30 | 13m 12s | GREEN, 28 frames | 0.13 | `local/verify-logs/2026-10-27T00-30-26-762-polish-villagers.log` |
