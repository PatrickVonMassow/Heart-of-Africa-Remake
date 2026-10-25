# Batch-owner runbook

This is role-specific operating policy for the session that owns and dispatches
the autonomous batch. `scripts/batch-resume-hook.mjs` injects it only after the
SessionStart path proves ownership. Delegated authors and stand-down sessions do
not need it and must not act on it.

## Dispatch and landing

- At most three non-overlapping, worktree-isolated authoring lanes may be open
  (`commission-guard` enforces the cap and the explanation owed for a free slot);
  how many are filled follows "Throughput with cloud authoring". The owner retains picture judgment, serial
  landing/deploy, and board publication.
- Generate an author's spec with `node scripts/point-brief.mjs <N>`; named
  sections may be read on demand, an ambiguous or insufficient brief is
  escalated, and a brief from an older revision is regenerated.
- A delegation that only locates or summarizes (where is X, which files touch
  Y, collect status or log facts) uses `subagent_type: "Explore"`; authoring,
  review, suites, and anything that writes, commits, or verifies keep their
  current agent types, and the model policy is unchanged.
- A cloud authoring delegate (cloud switch ON) runs build, lint, and Vitest
  on its branch and hands over the pushed sha, the three gate results, and
  open issues. Local acceptance of that branch then runs only what needs the
  quiet machine: the covering browser tier suites (`scripts/verify/tiers.mjs`),
  the picture check (both backends when `isBackendSensitivePath` applies),
  review, and landing; the local tier run stays mandatory and cloud green is
  never browser-suite evidence. A cloud unit result that a later local run
  contradicts is filed as a finding.
- Land with `node scripts/land-point.mjs <N> --model <m>`. It drives the no-ff
  merge, fast gate, work-order tick/archive commit, push, board publish, and
  worktree cleanup, stopping on the first failed step. The post-merge gate is
  mandatory even after a clean merge.
- Schedule a heavy run onto a quiet machine. A whole `polish` pass and a full
  LARGE are 55 and 119 measured minutes (`docs/picture-check-cost.md` §7), and
  load alone moves a suite by about a fifth, so an expensive run started while a
  second author is building buys a slower run and a redder one. This is
  scheduling, not construction: no guard enforces it, and `--plan` printing the
  observed band is the whole of its machinery.
- Await a background build log with `node scripts/verify/run-wait.mjs
  --await-log <log>` (as a background call), never an `until grep` loop. A
  STALLED or TIMEOUT result is diagnosed and reported, not re-awaited blindly.
- User-facing aesthetic judgment is against deployed `main`. A test-green,
  independently picture-checked improvement lands before asking whether it is
  aesthetically good enough. Use a branch preview only when the user's eyes are
  required to establish that the change is safe to land.

## Throughput with cloud authoring

Plan of point 1444 (six eyes: blind halves main chain / cross lane, merge scarce
lane, break check cross lane; record `docs/four-eyes/1444-*`). Practice only — no guard
enforces it; it replaces the user order of 23.10.2026 it refines.

**Baseline.** 25 distinct points landed between the 1409 merge (21.10.2026 19:02Z)
and the 1297 merge (25.10.2026 22:05Z): 99.0 h, **3.96 h per landed point**, 3.42 h
without the 13.6 h host-down stretch of 24./25.10. Losses parallelism does not cure:
host down 13.6 h, suite repeats about 8 h, hung WebGPU runs about 4 h. Only one cloud
author ever ran (1440: submission to merge 1.3 h).

**After 1443 alone.** 1443 drained the pool (1414, 1432, 1333, 1297 merged 25.10.2026
11:53Z–22:05Z; closed 22:27Z). From the first free slot (1333 merge, 21:10Z) to
26.10.2026 00:30 local, no cloud author was commissioned and no batch-daemon ran: the
old mode has no step that commissions while a point is accepted, so a free pool does
not by itself overlap anything. The goal is therefore not met by 1443 alone, and a
further old-mode cycle is not run first — it would spend at least 48 h of the credit
that expires 05.11.2026 to measure a mode with no overlap step. The measured cycle
below compares the new mode against the pre-1443 3.42 h.

**Bounds** (provisional; changed only by the measured cycle below):

- Cloud authors submitted or running: at most **1**, counted from submission — a
  cloud session has no branch until it pushes, so `commission-guard` cannot see it;
  `batch-in-flight --status` (its declaration) is what is checked. Reason: 1 is the
  smallest bound that overlaps authoring with acceptance at all; it carries no
  capacity claim, and every branch that waited over a day needed post-sync rework.
  A higher bound needs a measured cycle showing both acceptance standing idle for
  want of a ready successor and no finished branch waiting over a day; it then
  changes this number and the switch-over condition together.
- Finished branches waiting for acceptance: at most **1**. `POOL_CAP` 3 stays the
  branch ceiling, never a target; a free slot is explained with
  `--slots-free "1444 bound: one cloud author"`.
- Local heavy jobs: **1**. While a browser suite, unit gate or picture check runs,
  start no other local agent, browser or Vitest run (a running local author is
  checkpointed first); cloud authoring continues. Reason: both overlapped suite
  runs of 23.10 went red, and load moves a suite by about a fifth.
- Credit (expires 05.11.2026): commission only what local acceptance can land
  before then.
- `batch-daemon` stays off while these bounds hold: its refill fills to
  `DAEMON_POOL_CAP` 3 and has no lower setting on its command line (measured
  26.10.2026). Starting it first needs that cap set to the bound.

**Switch-over.** From the first point after 1444: when a local acceptance window
opens, `batch-in-flight --status` shows fewer submitted or running cloud authors than
the bound and no finished branch waits, commission the next ready, file-disjoint queue point through
`author-delegate`/cloud-switch, declare it, and continue the acceptance. The
existing `independentOpenPoints` decides disjointness; the successor is adopted at
the boundary as today. Picture-fix loops stay local (`author-routing-core`).

**Acceptance discipline (kept).** Gate a branch only after its author declares it
final, on its exact pushed SHA; rerun only the checks a later commit invalidates.
Spend suite waits on lightweight work (early review, preparing the next acceptance).
After **one** repeat of an unchanged SHA, section, backend and failure signature,
diagnose before running it again; a relevant commit or a recorded changed condition
(an environment repair) reopens it. A red already charged to an open point with
`main` unchanged in that section reuses the recorded `main` run.

**Manageable.** The in-flight declaration is one record that a new `--waiting-on`
replaces, so each declaration names every concurrent job: its text says what runs
where and why (`"cloud author 1450 (session <id>); local suite polish-villagers for
1449"`), and each job adds its evidence (`--branch`, `--worktree`, `--log`, `--pid`).
`node scripts/batch-in-flight.mjs --status` then prints that text and all items in
one output; a job missing from it is the owner's defect, not a gap in the command.

**Simplified.** Routine retrospective, guide-attest and queue-rank refreshes go into
one bookkeeping commit per boundary; a user-order publication receipt keeps its own
required timing and is never deferred into that commit. A wait declaration uses the suite's measured
duration (`run-wait --plan`), not the 45-minute default.

**Kept unchanged.** Pool cap and `commission-guard`, cloud-switch ON, lane routing
`default`, single owner and serial landing, boundary and ownership fence,
`run-wait` (a `running/-` hang is STALLED and diagnosed), `land-point.mjs`, local
tier suites, both-backend picture check, cross-vendor review. Cloud green never
stands in for a browser suite.

**Measured cycle.** After 1444 lands, `batch-standstill-report.mjs` over the next
five landed points or 48 h, whichever is later — this is also the post-1443
baseline, since the drained pool is what first allows the one cloud author. Record
per point where each delegation ran, cloud sessions active during acceptance,
waiting branches and repeats. Success: below 3.42 h per landed point without
host-down time; otherwise name the class that absorbed the gain. One cycle is an
observation, not proof.

## Boundary, lease, claims, and wake-up

Take every point boundary in two phases. After the point being landed is merged
and ticked, run `node scripts/batch-boundary.mjs --prepare <point>`, finish the
bookkeeping it names, then run `--commit <point>` as the last repository action
and end the session. A committed marker is sealed; `--clear` explicitly
withdraws it. Pushed author checkpoints transfer at the boundary and the next
owner adopts them with `node scripts/batch-in-flight.mjs --adopt`; unpushed work
drains first, while a recorded running verification may transfer.

The context path uses the same boundary with `--context`. The handover mark is
122k and the ceiling is 150k. The PreToolUse context fence carries a handover
brake: at or past 122k (reading plus pending debit) it DENIES a start — agent,
browser suite, new point, authoring — and names the boundary, in both fence
modes; finishing, reads and the boundary stay allowed. The brake is armed only
while the launcher is armed; with a dead, unknown or stopped launcher it stays
at observe and `node scripts/context-fence-guard.mjs --status` says so. The
ceiling admission keeps its own default mode, `observe`, and refuses nothing.
`node scripts/context-incidents.mjs --trend` prints the seven-day overshoot
verdict.

Ownership is a lease in `.claude/batch-lock.json`, renewed before each tool call.
An expired, non-advancing owner stops owning. The ownership fence refuses that
session's merge/push, work-order tick, board publication, and dashboard-state
write. To take the batch back into a visible window, run
`node scripts/batch-claim.mjs --session <id>`; the owner finishes a safe unit,
with no merge or uncheckpointed work mid-flight, transfers pushed author
checkpoints and recorded runs, releases, and that same claim takes ownership.
The claimant adopts the transferred declaration before starting anything else.
A claim ages only once no live owner holds the lock (or as an errand claim),
dead claimants are ignored, and one session wins. Never infer a
dead child from the owner lock: run `batch-in-flight.mjs --agent-check` over its
declared worktree and branch; unreadable output is unknown, not death. Never ask
the user to close a headless owner: verify its pid, use the claim, and use pause
→ stop → release only for the forced path. Withdraw an unused claim before
leaving the window unattended.

`scripts/chat-watcher.mjs` may wake a bounded responder for inbox work only when
there is no live owner and no honored claim, or past `DEFERRAL_MS` for a message
a waiting owner has not collected; the launcher supervises it. A user
message interrupts the batch rather than ending it: answer it, then make the
turn's last action a batch action. The launcher and repair path are described in
`docs/batch-autonomy.md`.

## Standstill journal and report

Run `node scripts/batch-standstill-report.mjs --since 14d` from any checkout to
measure the batch without taking its lock. `--until <UTC>`, `--repo <main
checkout>`, `--ref <first-parent ref>`, `--threshold-min <N>`, and `--json` narrow
or machine-read the same report. The default threshold is 20 minutes: it keeps
the measured four-day baseline comparable and is five minutes beyond one normal
15-minute launcher tick, so scheduler jitter alone does not become a reported
stall.

The command declares every path it read: first-parent commit times, autostart log
and last-start record, boundary and pause markers, boundary log, verification run records, session
transcripts, and `.claude/batch-activity.jsonl`. Linked worktrees append to that
one journal in the main checkout. Each line carries a fenced sequence, UTC time,
event, session/point, pid plus process start, ownership generation, cause, and
evidence. The journal is telemetry, not a guard: a failed append never blocks a
tool, handover, or spawn.

Classification precedence is blocked by user → quota → environment → named
verification → advancing delegated work → completed foreground tool activity →
named CI wait → writer veto → handover → idle owner → no worker → unknown. The
order is applied after splitting at every event boundary, so every millisecond
has one class and no overlap. Meanings:

- Foreground work requires a timestamped session-linked tool call; a transcript
  line, heartbeat, or living process alone is not work.
- Delegated work requires a bounded declaration with a matching live process or
  advancing branch, worktree, or output log. Verification additionally names the
  command, progress lease, and terminal receipt. CI wait names ref, SHA,
  workflow, run id, observations, and terminal result.
- Handover runs from the committed boundary or worker exit to successor claim.
  User, quota, environment, and writer-veto blocks retain their measured cause;
  a writer veto records the writer identity, generation where known, last fenced
  operation, and exact blocking interval.
- No-worker standstill requires explicit process loss or a launcher skip with no
  owner. Idle-owner standstill requires an owner interval with no higher-ranked
  work evidence.
- Missing, contradictory, torn, or pre-journal evidence is `unknown`. Commit
  gaps, heartbeats, and live pids create boundaries or liveness only; they never
  promote unknown time into work.

The first historical run and the reproducible 21 August/four-day fixtures are in
`docs/standstill-analysis-809.md`.

## Authoring and four eyes

`scripts/author-routing-core.mjs` owns the routing cut; the lanes are role
records in `scripts/model-lanes.mjs`, the only place naming models. At the
`default` routing the main chain authors; the scarce lane authors tagged points
and automatic review-round escalations through
`scripts/author-delegate.mjs --lane scarce`, as `CLAUDE.md` §6 states. Review is
cross-vendor through `scripts/cross-review.mjs`: a lane of another vendor than
every author of the range. Serving fallback order is the main chain, the scarce
lane (when switched on), then the main fallback; a different serving model
pauses the batch.

**After a lane rename lands** (scripts or state files renamed, as on the
generic-lane change): the owner restarts the batch daemon before the next
point starts, because a running daemon keeps invoking the script names its
loaded code holds, and the memory entries naming old commands are updated in
the same handoff.

For blind-parallel work, each input entry carries an id. The third model merges
by meaning through `scripts/blind-merge.mjs`, and every input is counted exactly
once as only A, only B, or merged with another id. Record that third model with
`scripts/mechanism-review.mjs --merged-by`; it may not be either author unless
only two models existed.

## Release and closing

A version tag is a delivery: complete the closing cycle on the exact commit,
obtain explicit approval for that tag, create `vX.Y`, and move `poc` to the same
commit. Tag pushes do not rebuild the Pages targets, so dispatch the deployment
workflow (or land a later `main` push) and verify both `/vX.Y/` and `/poc/`.

`poc` is NOT a version tag, and the coupling runs one way only (user decision
20.09.2026): a new `vX.Y` pulls `poc` up to it, but `poc` may run AHEAD of the
newest version. It is the current playable build, moved to any `main` commit on
request — no closing run, no approval beyond that request, and `closing-guard`
does not gate it. Only the version tag itself is a release act.

Freeze code during closing. Merge or park in-flight branches before it begins;
no author work lands until the closing completes. The machine-readable sequence
is `CLOSING_STEPS` in `scripts/closing-guard-core.mjs` and is driven with
`--status` and `--step <id> --evidence <proof>`.

## Board and owner-only operating hooks

- Drain waiting findings (`node scripts/finding.mjs --drain` lists them from the
  memory carrier) into the work order, commit and push main, then run
  `node scripts/finding.mjs --drained "<title>" --point <N>` (or `--why` for a
  backlog/duplicate drain). Queue waiting user requests (`--requests`) in this
  order: `--show`, a verbatim append, `--appending "<title>" --point <N>`,
  commit, push main, and only then `--queued` — it proves point N on
  origin/main and refuses otherwise. `node scripts/carrier-reconcile.mjs`
  re-checks every tick against TASKS.md + archive (doctor, session start and
  land-point run it); a RED there is a possibly lost user order. `--blocked`
  is only for one that cannot be carried out. A deferral leaves it pending:
  past the watermark, no `--blocked` and no decision card — `--commit
  --context` hands it on in the carrier and the successor queues it.
- Use `scripts/board.mjs` serially; concurrent calls race on the dashboard file.
  The canonical source is `.batch-dashboard.html` at the repository root and
  `scripts/board-publish.mjs` publishes it to Pages. Its five-section structure
  (the collapsed “Entscheidungsprotokoll” last, below “Erledigt”) changes only
  with explicit approval; never auto-open a card.
- Keep one current-work card per active point, every open point in the queue,
  and only genuine user decisions under “Von dir zu klären”. The board may use a
  public HTTPS transport; privacy is not a constraint.
- The batch never idle-stops, survives crash/reboot through the launcher, and
  signals failures through `scripts/notify.mjs`. Use read-only preparation while
  verification runs. The dormant guards are armed only in an attended point.
