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

"Obsolete: no" verdicts were not judged.

## Counts

Points: 261 plan "yes" (253 agreed + 8 resolved yes: 330, 464, 857, 956, 972,
1096, 1099, 1226), all 261 resolved to numbers.

| archive | backlog | drop |
|---|---|---|
| 6 | 250 | 5 |

Backlog entries: 53 plan "yes" (38 agreed + 15 resolved), all 53 mapped to a
`## ` heading of today's `docs/backlog.md`. The 109 headings match A's §6 order
one to one (B1 = "The give's second evidence frame…", B109 = "v0.3.1 closing
cleanup"); no ambiguous mapping.

| delete | keep | drop |
|---|---|---|
| 7 | 46 | 0 |

Deleted: B1, B12, B28, B32, B47, B63, B71.

## Dropped verdicts

- 803, 1361, 1461: already closed in the archive.
- 1101: reproducible false approval today; `ci-gate-verdict.mjs` outside a
  runner still prints "CI gate passed." and exits 0.
- 1467: real blockade still reproducible; the doctor's quarantine stash does
  not protect `.claude/closing-state.json` and aborts a live closing LARGE.

## Open questions

- 330: the plan folds its need into open 303; archiving it needs that line
  appended to 303 first.
- B72: the five branches are gone on origin, but the main checkout's local
  branches and the two unmerged ones need the user's written disposition (O7).
- 646, 798 (doctor deletes or stashes live work) stay `backlog`; their data
  risk is plausible but was not reproduced here, so they were not dropped.
- Renamed successors keep several defects alive: `review-sol.mjs` →
  `cross-review.mjs` (856, 896, 915, 933), `author-sol` → `author-delegate`
  (729, 836, 962, 1001), astra/fable switch → lane routing/switch (875, 1369).
  896's unknown-flag rejection in `cross-review.mjs` was not verified.
- The clone is shallow, so fixing commits were checked in the tree, not with
  `git log -S`.
