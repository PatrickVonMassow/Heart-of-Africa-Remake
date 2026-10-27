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
