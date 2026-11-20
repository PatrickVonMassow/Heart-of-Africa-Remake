# Obsolete verdicts of the infrastructure-simplification plan, re-validated

Source: branch `feat/1463-infra-simplification`, `docs/four-eyes/1463-union-opus-v3.md`
§4 (open points) and §5 (backlog entries), resolved through analyst A's groups
G1–G8 and positions B1–B109 (`1463-blind-a-opus55.md`) and B's headings
(`1463-blind-b-sol.md`). §4/§5 are identical in `1463-union-fable-v2.md`; the
final check and both rechecks change no §4/§5 verdict. Data:
`docs/1558-obsolete-verdicts.json`. Checked against the tree of 20.11.2026.

## Rule

Part 2 of the plan (removing pillars, any code or hook change) stays parked.
Each plan verdict "obsolete: yes" got exactly one disposition:

- Points: `archive` (done or void today: fixed, subject gone, or duplicate of a
  closed point), `backlog` (plan reason is "pillar deleted in M-Dx/M-Sx" and
  that pillar still exists, so the defect is deferred under the freeze), `drop`
  (verdict no longer holds: already closed, player impact, real blockade,
  security/data risk, false approval, or game work).
- Backlog entries: `delete` (void, subject removed, or FIXED), `keep` (defect
  still exists in kept infrastructure, or player impact).

A `backlog` row rests on the approved plan's per-point verdict plus the
presence today of the pillar that plan step deletes; it parks the point
verbatim and loses nothing, so it does not claim a per-point reproduction.

"Obsolete: no" verdicts were not judged.

## Counts

Points: 261 plan "yes" (253 agreed + 8 resolved yes: 330, 464, 857, 956, 972,
1096, 1099, 1226), all 261 resolved to numbers.

| archive | backlog | drop |
|---|---|---|
| 4 | 250 | 7 |

Backlog entries: 53 plan "yes" (38 agreed + 15 resolved), all 53 mapped to a
`## ` heading of today's `docs/backlog.md`. The 109 headings match A's §6 order
one to one (B1 = "The give's second evidence frame…", B109 = "v0.3.1 closing
cleanup"); no ambiguous mapping.

| delete | keep | drop |
|---|---|---|
| 1 | 52 | 0 |

Deleted: B1. B47 stays: the cited fix bounds one gather test, not
both named ones. B63 stays: it carries the ten-round abort rationale. B32 stays: the closed 1199/1111 fixed the
live-history gather cases (B47), not its `bootstrapBase` case. B71 stays: which
run forms still write logs into a worktree is unresolved. B28 stays: its retry half is void, but the
polish expectation is still 340900 ms against a ~28-min run. B12 stays: the
leftover carrier file and its header sit on the host and cannot be checked here.

## Dropped verdicts

- 803, 1361, 1461: already closed in the archive.
- 1101: reproducible false approval today; `ci-gate-verdict.mjs` outside a
  runner still prints "CI gate passed." and exits 0.
- 330: stays open; 303 does not yet carry its assurance requirement.
- 932: the handover brake shows the fence can refuse, not that the
  observe-mode arming question is resolved.
- 1467: real blockade still reproducible; the doctor's quarantine stash does
  not protect `.claude/closing-state.json` and aborts a live closing LARGE.

## Open questions

- 330: closes only after its assurance requirement is appended to 303.
- B72: the five branches are gone on origin, but the main checkout's local
  branches and the two unmerged ones need the user's written disposition (O7).
- 646, 798 (doctor deletes or stashes live work) stay `backlog`; their data
  risk is plausible but was not reproduced here, so they were not dropped.
- Renamed successors keep several defects alive: `review-sol.mjs` →
  `cross-review.mjs` (856, 896, 915, 933), `author-sol` → `author-delegate`
  (729, 836, 962, 1001), astra/fable switch → lane routing/switch (875, 1369).
  Measured for 896: `cross-review.mjs` still accepts an unknown flag.
- The clone is shallow, so fixing commits were checked in the tree, not with
  `git log -S`.
