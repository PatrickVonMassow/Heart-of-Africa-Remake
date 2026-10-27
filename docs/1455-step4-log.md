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

## Block 1 quiet references — adult-errands WebGL 2

| Run | Result | Duration | Frames | Failing |
|---|---|---|---|---|
| ref-ae-gl-1 | RED | 6m 18s | 9/23 | order at the stand (charged, point 642, webgl) |
| ref-ae-gl-2 | RED | 6m 10s | 9/23 | same |
| ref-ae-gl-3 | RED | 5m 51s | 9/23 | same |
| ref-ae-gl-4 | RED | 6m 23s | 6/23 | order at the stand; adult walks on between moving-capture frames 1 and 2 (point 1404) |
| ref-ae-gl-5 | RED | 7m 41s | 9/23 | order at the stand; water rim band (point 568) |
| ref-ae-gl-6 | RED | 6m 29s | 9/23 | order at the stand; river-bank foam after the shutter (point 1456); water rim band (point 568) |

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
