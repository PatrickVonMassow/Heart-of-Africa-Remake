# 1444 — provenance of the blind stage (delegated halves)

Both halves and the merge are DELEGATED halves (docs/four-eyes/README.md): each was
produced by `scripts/ask-lane.mjs`, whose banner names the model it reached. Commissioned
by the owner session d884b663 (Opus 5.5) on 25.10.2026.

| Half | Command | Banner (verbatim, first line of the `.md`) |
|---|---|---|
| A | `ask-lane.mjs --lane main --kind audit` | `ask-lane: asking Opus 5.5 (effort medium) for a audit — 192834 characters of material …` |
| B | `ask-lane.mjs --lane cross --kind enumerate` | `ask-lane: asking GPT-6.1 Sol (effort high) for a enumerate — 192834 characters of material …` |
| Merge | `ask-lane.mjs --lane scarce --kind audit --anyway` | `ask-lane: Fable 5.1 (effort medium) answered the audit in 334s — 7 entries` |

Identical inputs: both halves received the same 192 834-character raw-material bundle on
stdin (merges, main commits, folded `.claude/batch-activity.jsonl` and launcher log, verify
run records, log inventory, the runbook, lane-routing head, pool-cap and commission-guard
excerpts). Half B's prompt carried the point's GOAL, CONSTRAINTS, DEPENDENCY ON 1443 and
ANALYSIS only; half A's prompt additionally carried the point's MEASUREMENT section.

A first merge request reached Fable without the lists and constraints (wrong file paths in
the owner's shell); its answer was discarded unread as a merge and the request repeated.

The JSON halves are parsed verbatim from the `P<n> |` and `A<n> |` lines of each answer:
A's proposals P1–P16 are A1–A16, A's measurement findings A1–A18 are A17–A34; B's P1–P16
are B1–B16.

## Prompt — half B
```
You are one of two BLIND, independent analysts for a work-order point of a single-owner autonomous coding batch (an LLM "owner" session that delegates authoring to local agents or cloud sessions, then runs local browser test suites, a picture check, a cross-vendor review and a serial landing on main; sessions end at every point boundary and a launcher spawns the successor). Answer only from the attached raw material; say "not measurable from the material" where it is.

THE POINT'S TASK:
Raise the batch's working pace through measured cloud use and parallelisation (local included), without overloading the machine or the owner.

DEPENDENCY ON 1443: 1443 drains the open-branch pool (five open feat branches against POOL_CAP 3 made commission-guard refuse every new cloud authoring lane, measured 24.10.2026). This point starts only after 1443 has landed. Its analysis first measures what 1443 alone changed (cloud lanes commissioned in parallel to local acceptance once slots are free) and then addresses only what still slows the batch; it neither duplicates nor undoes 1443's work.


GOAL: Points land faster per wall-clock day. Cloud authoring and local work run in parallel where that shortens the cycle; the batch switches to that way of working as the result of this point.

CONSTRAINTS (binding):
  - Manageable: at any time the owner can name in one short command output what runs where (cloud sessions, local agents, suites) and why. No new orchestration layer when an existing mechanism (pool cap / commission-guard, batch-daemon, author-delegate, cloud-switch, run-wait) can carry it; CLAUDE.md infrastructure freeze applies — prefer switching off or simplifying an obstructing rule over building a new one.
  - Not overloaded: a bounded number of concurrent cloud authors and local heavy jobs, derived from the measurement, not guessed; quiet acceptance windows for browser suites and picture checks stay intact (memory verify-suites-need-a-quiet-machine); cloud credit (expires 05.11.2026) is not spent on work that cannot be landed.
  - Unchanged quality gates: local browser tier suites, picture check (both backends when isBackendSensitivePath applies), cross-vendor review and land-point.mjs remain mandatory; cloud green never stands in for a browser suite.
  - Single owner, serial landing on main.

ANALYSIS (both blind halves):
  0) Baseline after 1443: with the pool drained, how many cloud authors ran in parallel to local acceptance, and how long per landed point.
  a) Where the wall-clock time of the last ~25 landed points went: authoring, waiting for review, local suites, re-runs after red, picture checks, handover/boundary, and time with no live owner. Every hour assigned once.
  b) Which of those stretches could overlap with another point's stretches, and what the actual limit is (local acceptance throughput, machine load, owner context, file overlap between points).
  c) Which existing rules or mechanisms prevent the overlap today, and whether each should be loosened, switched off or kept.

FINAL STATE:
  - A merged, approved and recorded plan (in docs/batch-owner-runbook.md, replacing what it supersedes) that states the concurrency bounds and the switch-over.
  - The batch actually runs that way after this point lands: the next points after it are worked under the new mode, and one measured cycle after landing confirms a shorter time per landed point or names why not.
  - If the baseline after 1443 already shows the goal met, the point closes with that measurement as a recorded finding instead of a change.
  - Tests at the right layer (Vitest) for any changed decision logic.


NOTE on step 0: point 1443 landed on 25.10.2026 ~23:27 local time (its merges are the last ones in the material); so the post-1443 baseline has at most zero full cycles — state what can and cannot be concluded.

ANSWER FORMAT (binding):
1. MEASUREMENT: steps 0, a, b, c with numbers taken from the material (hours, counts, per-point spans). Show the hour allocation for a) as a table; every hour assigned once.
2. PROPOSALS: a numbered list, one line each, in exactly this line form (it is machine-merged):
   P<n> | <rule/mechanism/file it touches, or "procedure"> | <one line: what to change, the concrete bound or number, and the measured reason>
   Prefer switching off or simplifying an obstructing rule over building a new one. Include the concurrency bounds (cloud authors, local heavy jobs) with their derivation and the switch-over step. Include KEEP entries (P<n> | <rule> | KEEP: why) for mechanisms you checked and would not change.
3. RISKS: what each proposal could break.
```

## Prompt — half A (adds the MEASUREMENT section)
```
OWNER-SIDE MEASUREMENT (context for this half only):
MEASUREMENT (owner-side context — NOT for the blind half B):
  Measured 25.10.2026, 02:23 by a non-owner chat session.
  - Cloud switch ON since 23.10.2026; only ONE cloud authoring session was ever started (local/1440-cloud-author.log, 24.10.2026 04:41). 1441 and 1442 left only local worktree and log traces, no cloud start log.
  - Point 1443 (open, at the front) already names one cause: five open branches against POOL_CAP 3, so commission-guard refuses every new cloud lane. This session's earlier reading that the pool is inactive because no batch-daemon process runs was incomplete: the cap binds through commission-guard.
  - The batch works one point at a time: delegate, wait blocking, land, end at the boundary. docs/batch-owner-runbook.md:60 paces cloud authoring to what local acceptance can land.
  - No landing between 24.10.2026 09:40 (1441) and 25.10.2026 02:17; 1442's last commit 24.10. 13:39; the launcher took over only at 02:17 with "heartbeat-predates-boot" (host restart), so roughly 12 h had no live owner.
  - Game points ran long rounds on their branches: 1393 53 commits / 38 h, 1402 7 / 18 h, 1405 17 / 12 h, 1404 24 / 8 h (author and fix-up commits not separable from git alone).
  - 1442's last suite run polish-villagers ended "9/23 frames, 14 missing" (local/1442-dress-cost-short-webgpu.log).
  - Open stale branches: 1297 (idle since 06.10.), 1347 (66 commits, idle since 21.10.), 1333, 1414, 1432.
  - Of the last 25 merges roughly 9 are game points.
```

## Prompt — merge
```
You are the THIRD, distinct model merging a blind-parallel analysis of work-order point 1444 (raise an autonomous coding batch's working pace through measured cloud use and parallelisation without overloading machine or owner). Half A (Opus 5.5, Claude lane) and half B (GPT-6.1 Sol, cross lane) analysed the same raw material independently; A additionally saw an owner-side measurement note (A17–A34 are A's corrections to that note and to the material). Both full answers and both id lists are attached.

THE POINT'S GOAL AND CONSTRAINTS:
GOAL: Points land faster per wall-clock day. Cloud authoring and local work run in parallel where that shortens the cycle; the batch switches to that way of working as the result of this point.

CONSTRAINTS (binding):
  - Manageable: at any time the owner can name in one short command output what runs where (cloud sessions, local agents, suites) and why. No new orchestration layer when an existing mechanism (pool cap / commission-guard, batch-daemon, author-delegate, cloud-switch, run-wait) can carry it; CLAUDE.md infrastructure freeze applies — prefer switching off or simplifying an obstructing rule over building a new one.
  - Not overloaded: a bounded number of concurrent cloud authors and local heavy jobs, derived from the measurement, not guessed; quiet acceptance windows for browser suites and picture checks stay intact (memory verify-suites-need-a-quiet-machine); cloud credit (expires 05.11.2026) is not spent on work that cannot be landed.
  - Unchanged quality gates: local browser tier suites, picture check (both backends when isBackendSensitivePath applies), cross-vendor review and land-point.mjs remain mandatory; cloud green never stands in for a browser suite.
  - Single owner, serial landing on main.

ANALYSIS (both blind halves):
  0) Baseline after 1443: with the pool drained, how many cloud authors ran in parallel to local acceptance, and how long per landed point.
  a) Where the wall-clock time of the last ~25 landed points went: authoring, waiting for review, local suites, re-runs after red, picture checks, handover/boundary, and time with no live owner. Every hour assigned once.
  b) Which of those stretches could overlap with another point's stretches, and what the actual limit is (local acceptance throughput, machine load, owner context, file overlap between points).
  c) Which existing rules or mechanisms prevent the overlap today, and whether each should be loosened, switched off or kept.

FINAL STATE:
  - A merged, approved and recorded plan (in docs/batch-owner-runbook.md, replacing what it supersedes) that states the concurrency bounds and the switch-over.
  - The batch actually runs that way after this point lands: the next points after it are worked under the new mode, and one measured cycle after landing confirms a shorter time per landed point or names why not.
  - If the baseline after 1443 already shows the goal met, the point closes with that measurement as a recorded finding instead of a change.
  - Tests at the right layer (Vitest) for any changed decision logic.

DEPENDENCY ON 1443: 1443 drains the open-branch pool (five open feat branches against POOL_CAP 3 made commission-guard refuse every new cloud authoring lane, measured 24.10.2026). This point starts only after 1443 has landed. Its analysis first measures what 1443 alone changed (cloud lanes commissioned in parallel to local acceptance once slots are free) and then addresses only what still slows the batch; it neither duplicates nor undoes 1443's work.


YOUR TASK:
1. Merge BY MEANING, not by union: every input id (A1–A34, B1–B16) is counted exactly once, either as its own union entry or folded with others. Where A and B DISAGREE (e.g. cloud author bound 2 vs 1, "change now" vs "measure one post-1443 cycle first"), resolve it with an explicit reason grounded in the measured numbers and keep only the resolved version. A finding that is only a material/measurement correction stays as its own entry marked FINDING.
2. Output FIRST a JSON object exactly of this shape inside a ```json fence:
   { "mergedBy": "Fable 5.1", "entries": [ { "id": "U1", "from": ["A1","B2"], "defect": "<the merged plan item or finding, one or two sentences, including the concrete bound/number and the resolution reason where the halves disagreed>" } ] }
3. Then a section MERGED PLAN: the final plan as it would be written into docs/batch-owner-runbook.md (replacing the "Throughput with cloud authoring" section): concurrency bounds with derivation, the switch-over step, what is switched off/simplified, what is KEPT, and the measured-cycle check after landing. At most ~45 lines, plain markdown, no new orchestration layer (CLAUDE.md infrastructure freeze).
4. Then a section DECISION LOGIC CHANGES: list any change to code decision logic the plan requires (file, function, what changes), or "none" — prefer none.
```
