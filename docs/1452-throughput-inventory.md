# 1452 step 1: measured throughput inventory

Window: 24.10.2026 00:00Z to the 1418 merge (26.10.2026 22:29Z), 70.5 h, 20 landed
points. Times are local (CEST to 25.10 03:00, then CET). This is measurement only: it
proposes no remedy.

Sources: `git log --first-parent main` (merge and tick commits), branch commits and
merge-of-main commits, `local/verify-logs/*.run.json` (85 suite runs in the window),
`local/*-cloud-start.log`, `*-cloud-author.log`, `*-handover.txt`, `*-review*.log`,
`*-fix-send.log`, `.claude/boundary.log`, `.claude/autostart.log`, the 58 session
transcripts, and the standstill report JSON (`batch-standstill-report.mjs --since
2026-10-24T00:00:00Z --json`).

`i` marks a value that is inferred (from commit, file mtime or session gaps) rather than
logged as a phase. Phase boundaries: **commission** = brief/cloud start or the first
session working the point. **Authoring** = commission to the last authoring commit or
cloud handover. **Waiting** = a finished or old branch nobody worked on. **Acceptance** =
suites, picture check, cross-vendor review, and the fix rounds they triggered.
**Main sync** = re-gating or rework caused by a merge of main into the branch.
**Landing** = merge commit to tick commit (`land-point.mjs`).

## Per point

Class: game = diff touches `src/`. Loc: cloud = a `claude --cloud` start or cloud-author
log exists. Suites: runs / finished minutes / red (exit 1, own or unresolved) /
partial (exit 2, every red charged elsewhere). The window caps start→merge for branches
older than 24.10 (window start 24.10 00:00Z to the merge time in UTC). Sync hours are
added on top of the phases for 1446 and 1433 but contained in Wait/Accept for 1333 and
1297; the rows keep their sources' convention.

| Point | Class | Loc | Start→merge h | Author h | Wait h | Accept h | Suites | Sync (n / h) | Land h | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1439 | infra | local | 0.23 i | 0.18 i | 0 | 0.05 | – | 0 | 0.47 | extra fix commit during landing |
| 1438 | infra | local | 0.22 i | 0.05 | 0 | 0.17 | – | 0 | 0.13 | queued 00:05, started 03:48 |
| 1440 | infra | cloud | 1.30 | 0.38 | 0 | 0.92 | – | 0 | 0.27 | first cloud author |
| 1441 | infra | local | 0.33 | 0.03 | 0 | 0.30 | 1/0/0/0 | 0 | 0.13 | docs suite only |
| 1442 | infra | local | 20.1 (6.7 without host-down) | 0.03 | 13.4 (host down) | 6.6 i | 12/145/4/0, 5 hung (~4.3 h i) | 1 / 0 | 0.13 | full polish-villagers red, split off as its own point |
| 1446 | infra | local | 4.07 | 0.5 i | 0 | 2.87 i | 7/140/2/1 | 1 / 0.7 i | 0.13 | full runs 42 and 41 min |
| 1414 | game | local | 36.7 | 0.05 (24.10 00:10) | 35.3 i (13.4 host down) | 1.42 | 3/17/2/1 (+1 main run) | 1 / – | 0.14 | sync then fix at acceptance start |
| 1432 | game | local | 40.2 | 1.05 | 35.6 i (13.4 host down) | 3.17 | 19/116/9/2, 4 same-SHA repeats | 1 / – | 0.13 | 4 review rounds |
| 1333 | game | local | 45.2 (branch from 20.10) | 0 in window | 40.8 i | 4.42 | 9/128/6/3 | 2 / 0.9 i | 0.13 | 5 fix commits, 4 reviews |
| 1297 | game | local | 46.1 (branch from 05.10) | 0 in window | 45.6 i | 0.47 | 2/3/0/0 | 1 / 0.43 i | 0.13 | sync forced a harness rework |
| 1444 | infra | local | 1.08 i | 0.93 | 0 | 0.15 | – | 0 | 0.13 | six-eyes analysis |
| 1445 | infra | local | 0.37 | 0.23 | 0 | 0.13 | – | 0 | 0.13 | |
| 1437 | infra | local | 0.02 | 0.02 | 0 | 0 | – | 0 | 0.13 | one commit |
| 1433 | infra | cloud | 1.33 | 0.35 (+0.17 commission) | 0 | 0.54 | – | 1 / 0.28 | 0.13 | |
| 1415 | game* | cloud | 6.37 | 0.63 | 0.6 i (idle 10:44–11:20) | 5.1 | 15/208/8/0, 9 same-SHA repeats | 0 | 0.13 | the batch's longest acceptance after 1444 |
| 1388 | infra | cloud | 5.07 | 0.07 | 3.6 i (finished, behind 1415) | 1.38 | – | 0 | 0.15 | authored 08:33–08:36 during 1415 acceptance |
| 1416 | game | cloud | 1.32 | 0.50 | 0 | 0.75 | 4/24/1/3 | 1 / 0.07 | 0.15 | |
| 1451 | infra | cloud | 0.75 (1.98 from filing) | 0.12 | 0.15 i | 0.48 | – | 0 | 0.13 | |
| 1417 | game | cloud | 5.92 | 1.10 (3 cloud rounds) | 1.38 i (16:47–18:10) | 3.08 | 5/136/4/1 | 2 (1 cloud) / 1.4 i | 0.14 | 1450 folded in; incident (b); duplicate fix (c), attribution open (see c); phases sum to 5.56 h (6.96 h with sync) against 5.92 h |
| 1418 | game | cloud | 4.65 | 0.83 (2 rounds) | 2.49 i | 1.33 | 5/28/2/1 (+1 main run) | 1 / 0.02 | 0.15 | see (a) |
| **Median** | | | **2.70** | **0.21** | **0** (8.5 among the 10 that waited; 1.38 among the 5 after 1444) | **0.84** | | | **0.13** | |
| **Total** | 8 game / 12 infra | 8 cloud | | **7.1** | not additive (see below) | **33.3** | 85 runs (82 allocated per point + 2 main runs; 1 run and 2 of the 40 reds unallocated), 15.8 h finished + ~4.3 h hung i | 12 syncs / ~3.8 i | **3.2** | |

\* 1415 is a game point by the diff rule (13/13 files in `src/`), but its content is a
bug-report state dump, not gameplay.

Waits are not additive: the waits of 1414, 1432, 1333 and 1297 ran at the same time as
each other and as the host-down stretch. Their wall-clock union inside the window is
about 46 h. After 1444, the waits are 8.2 h, all on finished branches queued behind a
local acceptance (1388 3.6, 1418 2.5, 1417 1.4) or a short idle stretch.

## Window sums

- **Rate.** 70.5 h / 20 points = 3.52 h per point raw, and 2.86 h without host-down
  (13.4 h, 24.10 13:54 → 25.10 02:17). Before the 1444 landing (11 points, 47.7 h):
  4.34 raw / 3.12 without host-down. After the 1444 landing (9 points, 22.8 h): 2.53 h
  per point. Divided by the 4 game points (1415, 1416, 1417, 1418) the same 22.8 h give
  5.69 h, a ratio, not a per-game-point cost: those points' own start→merge times are
  6.37, 1.32, 5.92 and 4.65 h, and no pre-1443 game-only baseline exists to compare it with.
- **Suites.** 85 runs: 28 green, 12 partial, 40 red, 5 hung. Finished runs total 15.8 h,
  of which red runs are 11.5 h. The 11 full `polish-villagers` runs (median 43 min)
  total 8.1 h. Hung WebGPU runs (all 1442) add about 4.3 h (i).
- **Landing.** 8 min per point (the post-merge fast gate dominates), 3.2 h in total. It
  is never on the critical path.
- **Post-landing to next commission** (bookkeeping, retrospective, queue rank, session
  handover): mostly 0.15–0.5 h. Larger gaps: 1440→1441 3.1 h (main-based dress
  investigations), 1432→1333 1.3 h, 1445→1437 1.0 h, 1433→1415 1.1 h.
- **Standstill report classes.** `totals.byClass` puts the whole 70.92 h under
  `unknown`. Every one of the 27,709 timeline intervals has the cause
  `contradictory-evidence` and carries the journal-sequence item
  `{previousSeq:66, seq:67}`, so the report yields no class split. Union of time by
  evidence type, read from the same intervals (overlapping, not additive):

  | Evidence | Hours |
  |---|---|
  | Owner lock held | 70.81 |
  | Tool/agent call in flight | 49.37 |
  | Verification records | 15.82 |
  | Command leases | 17.07 |
  | Wait leases | 9.80 |
  | Point leases | 1.82 |
  | CI wait | 1.86 |
  | No work evidence | 17.91 |

  The 17.91 h with no work evidence fall 14.81 h on 24.10, 1.20 h on 25.10 and 1.90 h on
  26.10. The report's ≥20 min intervals: 24.10 07:19 (47 min), 11:50 (54 min), 13:54
  (802 min, host down). The derived idle run ≥20 min is 26.10 10:44 (35 min).
  `commitGaps`: 51 main gaps of ≥20 min (56.4 h). The two longest are 16.95 h (the
  host-down stretch) and 4.74 h (26.10 06:35–11:20, inside the 1415 acceptance).

## Bottleneck and idle times

**Bottleneck: local acceptance, run serially by the single owner session on the single
heavy-job slot.** It takes 33.3 h of phase time against 7.1 h of authoring and 3.2 h of
landing. Within it, suite time dominates: 15.8 h finished plus ~4.3 h hung, and 73 % of
the finished minutes are red runs. The full `polish-villagers` pass alone takes about
43 min per backend, and points that touch villagers run it on both backends, often
twice. Per game point after 1444, acceptance runs 0.75–5.1 h while authoring runs
0.5–1.1 h. Cloud authoring did not limit throughput: every cloud branch was handed
over within 0.1–1.1 h. Branches then waited for the owner (1388 3.6 h, 1418 2.5 h,
1417 1.4 h).

Idle times measured:
- Host down 13.4 h (24.10 13:54 → 25.10 02:17).
- Hung WebGPU runs ~4.3 h i (1442).
- Old branches waiting for days before the window (1414, 1432, 1333, 1297; about 46 h
  of union in the window, overlapping the host-down stretch).
- Finished cloud branches waiting for acceptance after 1444: 7.5 h.
- Owner idle with no work evidence ≥20 min outside host-down: 47 min + 54 min (24.10)
  and 35 min (26.10).
- Post-landing bookkeeping before the next commission: 0.15–3.1 h per point.

## Limitations

- The window is short (2.9 days) and includes a 13.4 h host-down stretch.
- Only 4 of the 9 points after 1444 are game points, and one of them (1415) is
  diagnostics. The post-1444 rate rests on 4 game samples, two of which (1417, 1418)
  overlapped each other.
- Phase boundaries are inferred from commits, file mtimes and session spans. No
  per-point phase journal exists. Every Author, Wait, Accept and Sync value above is
  inferred unless it is a logged suite duration or a merge/tick timestamp.
- Fix rounds for locally authored points (1414, 1432, 1333, 1446) are counted in
  acceptance. They cannot be separated from re-gating without session-level tool
  timing.
- Main-sync cost is inferred as the re-gate or rework after the sync commit. For 1414
  and 1432 the sync opened the acceptance, so its cost is not separable.
- Cloud author location contradicts the brief's list (cloud since 1444: 1433, 1451,
  1418). Cloud-start logs also exist for 1415, 1388, 1416 and 1417. This table follows
  the logs.
- The standstill report's class totals are unusable (all `unknown`), so the class
  split above is derived from evidence types and overlaps.
- Review durations are not logged. Only review log mtimes and record commits exist.
- No `local/1418-land.log` or `1417` land log was written. Landing time comes from the
  merge and tick commits.

## Owner items

**(a) 1418 acceptance.** No local build/lint/unit layer ran before the merge. The
handover records "no repeated build/lint/unit layer before the merge (point 1436
item 2)", and the branch relied on the two cloud gate runs (622 test files green on
b5a256d and on 2e90db0). Only the mandatory post-merge `land-point` fast gate ran build,
lint and unit (23:29 → 23:38). Acceptance timeline:
- Cloud handover 19:19.
- Review 20:56 (1.6 h wait behind 1417).
- Fix sent 20:57.
- Cloud fix handover 21:18, picked up about 22:10 (0.9 h wait).
- Sync, re-review and suites 22:51–23:28: collision 1 + 9 min, adult-errands 4 × 6 min,
  one of them a comparison run on main.
- Merge 23:29.

Active local acceptance was 1.33 h. Handover to merge was 4.17 h.

**(b) Parallel-session incident 26.10 19:09.**
- Autostart logged "owner process measured inactive (pid-reused) — taking over" at
  18:09:25Z and launched session f562b927.
- The live owner 802b57ac (pid 4006293) kept writing until 18:12Z.
- The 1417 full WebGPU run on 1e681ce07 (17:50Z, 22 min, red) ended inside the overlap.
- The successor synced main (19:13) and committed c1bb057d0 (19:16), then re-ran both
  full backends (19:19–20:44, 84 min). The handover cites only those re-runs.

Estimated cost: about 0.4 h (i). That is the 22 min run made obsolete plus the lost
context of the 1.1 h owner session. The 84 min re-run was owed anyway for the new SHA,
so it is not counted.

**(c) 26.10 20:56 duplicate fix.** Session 1cf5b053 spawned the subagent "Fix rack
eating head-scratch pose" at 20:55. It ran for 17.4 min with 70 tool uses and
**181,408 tokens**. Over the same time the cloud session, sent the same request at
20:53, pushed 413364252/6933d7a5d (20:56/20:59). The local push was rejected
non-fast-forward and nothing from it landed. Wall-clock cost to the batch: none on the
critical path, since the cloud fix arrived first. The cost is 181k tokens and 17 min
of a local agent running beside the cloud author. Whether (c) belongs to 1417 or to the
1418 fix of item (a) (review 20:56, fix sent 20:57), and which SHA 1417 was gated on,
cannot be resolved from the material: 1417's handover cites only the 19:19–20:44
re-runs, which predate these fix commits.

**(d) feat/1347-garment-rebuild.**
- **Pool slots.** `POOL_CAP` (3, `batch-in-flight-core.mjs`) counts unmerged
  `refs/heads/feat` and `refs/remotes/origin/feat` branches, minus parked ones
  (`openBranchSlots`). `commission-guard` uses the same count. `DAEMON_POOL_CAP` (3,
  `batch-daemon-core.mjs`) counts only daemon attempts that are running,
  checkpointing or stalled, and the daemon was off.
- **Park.** 1347 has been parked since 25.10.2026 21:38:35Z by point 1443, at tip
  e4edd697, which is unchanged. It occupies no slot now: measured today,
  `open []`, `slotsFree 3`, `parkedOut [feat/1347-garment-rebuild]`.
- **Before the park.** From branch creation (20.10 14:19) to the park it held a slot,
  45.6 h of it inside this window. With 1414, 1432, 1333 and 1297 also unmerged the pool
  stood at four or more against the cap of 3 until the 1443 merges, so the guard refused every
  call that opened a new feat branch; how 1439–1446, 1444 and 1433 were commissioned
  then is not shown in the material.
- **Leftovers.** The worktree `.claude/worktrees/point-1347` still stands. Its last
  commit is from 21.10 and it is 626 commits behind main.

**(e) The overlapped reds of 23.10.** The overlap was 04:59:58Z–05:10Z. Run A was 1424
`polish-children --section=children-motion` (10 min, exit 2, its red charged to 1244).
Runs B were 1405 `polish-villagers --section=water-stand-table` at 05:02:04Z and
05:08:38Z, both exit 1, plus a duplicate 05:08:27Z start that never finished. All three
logs say "MACHINE UNDER LOAD … timing verdicts do NOT count as evidence". The B logs
name a leftover `run-wait.mjs` process as another suite run.

Cause: two authors' suites on one GPU. Only the 05:08:38 check "one whole water errand
was recorded … timed out" is unique to the overlapped run. The jar-take and pointing
reds repeated on solo runs of the same SHA (05:14–05:30Z, 4 runs, exit 1), so load
was not their only cause.
