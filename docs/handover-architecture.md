# Durable authoring workers and a short-lived coordinator — the merged architecture

PROVENANCE. This is the result of the blind-parallel four-eyes stage of 13.08.2026 (CLAUDE.md
§6) on the question: how can the batch keep three authoring lanes busy AND hand the session over
on context, when today a handover kills every worker the session spawned. Two lists were written
blind — **list A by Claude (Opus 5), list B by GPT-5.6 Sol** — and merged into the counted union
below, every entry accounted for as `only A`, `only B` or `merged with <id>`. Both raw halves are
versioned in `docs/four-eyes/` and the union is `docs/four-eyes/676-union.json`, so the count is
reproducible: `node scripts/blind-merge.mjs --a … --b … --union …`.

THE DEVIATION IS SETTLED. CLAUDE.md §6 sends the merge to the model that wrote NEITHER list,
because that is where a finding vanishes unnoticed. This stage spent nine days without that
model: the original merge was performed by Sol, the author of list B, a re-merge on 22.08.2026
by Claude Opus 5, the author of list A, and both are recorded as the weaker two-model fallback.
On 22.08.2026 at 18:14 the owner reported that new weekly volume had been released and asked for
the Fable suspension to be lifted; the owner flipped the switch at 18:26. The same evening Fable 5 —
which wrote neither half — folded the stage BLIND: from the two versioned halves alone, before
reading either fallback union, then compared its result against the recorded fold and justified
every difference from the halves. That third-model fold is the union below and supersedes both
fallback folds. The owner's express request that the resulting model rules not be implemented
before he has seen them stands untouched: this fold executes the standing §6 rule for this one
stage and changes no model rules.

WHAT THE THIRD-MODEL FOLD CHANGED. The blind fold reproduced the fallback's accounting shape —
61 entries, nine merged pairs — and seven of the nine pairs agree; it groups A2 (the survival
evidence) with B3 (the reference contract) where the fallback grouped A3a there, and it groups
B30 (the fresh session per landing) with A3c (the handover condition) where the fallback used
B33. Two fallback glosses are NOT carried into the union because neither half states them: the
"unverified" caveat on A2's measured 13.08.2026 survival evidence, and the rejection of B53's
acceptance thresholds — B53 stands as written, beside A8's own landed-throughput condition.
B15's actor, coordinator epoch, timestamps and last local and pushed commit — the loss Sol's
audit had found — stand in full in M16.

A CLAIM THAT THE OWNER HAD RULED THE FALLBACK SUFFICIENT stood in this paragraph for about
twenty minutes on 22.08.2026, and it was false: no such ruling was ever given. It was inferred
from the standing 20.08.2026 switch setting and written down as a confirmation. The cross-vendor
spec examination of point 834 refused the text built on it, and the record of what the owner
actually typed settles it. This is the same defect as the mislabelled half A described below — a
self-asserted claim with nothing behind it that anyone could check — and work-order point 840
exists to make that class of claim checkable.

WHAT WAS DONE ON 22.08.2026, and what it is worth. The raw halves had never been versioned —
list A lived only in a session scratchpad under `/tmp`, list B only in the untracked `local/` —
so the stage could not be re-merged, re-counted or re-reviewed at all. They are recovered and
versioned now, and `docs/four-eyes/README.md` makes filing both halves a rule.

A RE-MERGE was then run by Claude and audited by Sol. Because Claude wrote list A, that is a
same-vendor merge and is recorded as the fallback, not as a third-model result. Its accounting
holds exactly: 14 A + 56 B entries → 61 union entries (18 merged, 5 only A, 47 only B), every
input entry claimed once, no dangling reference and no duplicate — a count Sol reproduced
independently. FOUR ROWS had lost a clause and were restored by that re-merge — three of them
list-A clauses dropped by list B's author — and the third-model fold below keeps every
restoration. One is demonstrably consequential: A5b had already pointed at the existing batch lock and its fence as the thing a
coordinator lease must be reconciled with, the first fold dropped it, no union row mentioned a lock or a
migration afterwards, and Sol's audit of 22.08.2026 had to raise the missing migration rule again
from scratch.

THE RESTORATIONS ARE NOT A CLEAN BILL. Sol's review of that re-merge found a further loss the
re-merge had missed — its row for B15 kept the state vocabulary but dropped the actor,
coordinator epoch, timestamps and last local and pushed commit that B15 requires of every point
state — which shows
the sweep was not exhaustive. Structural checks cannot find these: the id accounting balances and
the two union representations agree while a row is substantively incomplete. The third-model
fold of 22.08.2026 closed the known gaps; the B15 fields stand in full in M16 below.

A CORRECTION, WITHDRAWN THE SAME DAY, is recorded here because the document carried it briefly
and someone may have read it. Half A's own heading claims Fable 5 wrote it. On that label this
paragraph was rewritten to say list A was Fable's, which would have made Claude an eligible
merger. The label is false: the transcript metadata shows `claude-opus-5` generated half A, and
Fable had stopped serving nearly three hours earlier. The original attribution above is the
correct one. `docs/four-eyes/676-provenance.md` carries the reading.

The rejected alternatives are kept deliberately: they are the cheap-looking answers this stage
ruled out, and an implementer who does not see them re-proposes them.

| Union entry | Sources | Disposition and merged meaning |
|---|---|---|
| M1 | A1+B1 merged | Decision: the two goals are not inherently conflicting; the conflict is an artefact of coupling worker lifetime and recoverability to the main session's process parentage. The successor already has the information it needs — the in-flight declaration names branch, worktree, pid and log — it lacks only a live process. Handover must therefore cease to mean terminating active work. |
| M2 | A2+B3 merged | The coupling is provably breakable, and the detached Sol authoring lane (scripts/author-sol.mjs) is the proof and the reference: measured 13.08.2026, it ran through the supervising session's landing of another point, a board rebuild and a failed boundary attempt, and would have survived that session's death. Treat that proven path as the reference worker contract: stable worktree and branch, detached launcher ownership, step commits, periodic pushes, heartbeat, log, and explicit terminal status. |
| M3 | only A3a | Delegated AUTHORING runs as a detached process (the author-sol.mjs shape), never as an in-process Agent-tool subagent, whenever the point is authored rather than judged. |
| M4 | only B2 | Split the system into a short-lived coordinator plane and a session-independent worker plane: sessions select work, review, verify, land, and record progress, while durable workers author isolated points. |
| M5 | only B4 | Add a model-neutral detached-worker adapter around available CLI runners; an adapter is handover-capable only if it satisfies the same checkpoint, push, heartbeat, status, and cancellation contract as author-sol.mjs. |
| M6 | only B5 | Do not relabel an Agent-tool child as durable: unsupported agents remain session-bound, and a boundary is blocked until those particular children finish or are safely stopped. |
| M7 | only B6 | Make the OS launcher daemon, rather than a main session, the parent and lifecycle owner of every handover-capable worker so session exit cannot kill it. |
| M8 | only B7 | Give every run a stable batch id, point id, attempt id, process-start identity, branch, worktree, base SHA, PID, log path, heartbeat path, and launcher lease. |
| M9 | only B8 | Enforce the cap of three active authoring processes globally in the daemon, not separately in each session, so overlapping coordinator epochs cannot temporarily create six workers. |
| M10 | only B9 | Let the main session pre-authorize a bounded ready queue of concrete work-order points with dependencies, base SHA, branch, and worktree; the daemon may refill a freed slot only from that queue. |
| M11 | only B10 | Keep point selection with the main session: the daemon starts already-delegated queue entries but must never invent work, reorder dependency-blocked points, or broaden a point's scope. |
| M12 | only B11 | Record a reason code and duration whenever fewer than three lanes run despite three eligible points; valid reasons include dependency blocking, review-backlog pressure, adapter unavailable, and durability failure. |
| M13 | only B12 | Apply an explicit completed-review backlog limit so automatic refilling cannot produce an unbounded pile of stale branches while serial landing remains slower than authoring. |
| M14 | only B13 | Store an append-only, checksummed event journal at <git-common-dir>/codex-batches/<batch-id>/events.jsonl, in the shared Git common directory outside every worktree and transcript, as the coordination record that survives session replacement. |
| M15 | only B14 | Maintain an atomically replaced derived snapshot (<git-common-dir>/codex-batches/<batch-id>/snapshot.json) for fast resume while retaining the event journal as the auditable source used to detect partial or contradictory writes. |
| M16 | only B15 | Represent each point in the snapshot as queued, running, checkpointing, ready-for-review, landing, landed, failed, stalled, or cancelled, and record with each state the actor, the coordinator epoch, timestamps, the last commit, and the last pushed SHA. |
| M17 | A3b+B16 merged | The in-flight declaration becomes the ADOPTION RECORD: extend it with stable batch, job, attempt, and process-start identities plus a transferable flag — PID alone is insufficient because it can be reused. What is missing today is exactly that nothing tells the successor the run is now its own. |
| M18 | A5a+B17 merged | A transferable declaration remains probeable across coordinator sessions and expires LOUDLY when heartbeat, log advancement, checkpoint SHA, or launcher ownership stops agreeing: expiry must alert, not merely unblock, or an adopted run dies unnoticed. |
| M19 | only B18 | Before handover, request a checkpoint from every running durable worker and require acknowledgment that all current work is committed and pushed; completion of the point is not required. |
| M20 | only B19 | If a worker cannot checkpoint within the bounded interval, mark it non-transferable and block the boundary with its job id and recovery choices instead of silently risking uncommitted work. |
| M21 | only B20 | Make handover two-phase: --prepare performs bookkeeping, board updates, daemon health checks, checkpoint barriers, landing-lock checks, and successor-input validation without creating the boundary marker. |
| M22 | only B21 | Make --commit the main session's final repository action: atomically seal the snapshot, record the next coordinator epoch and nonce, create the marker, receive the launcher's durable receipt, and then end the session. |
| M23 | only B22 | Forbid bookkeeping, guard remediation, status edits, refills, or other tool work after batch-boundary.mjs --commit; all such work belongs before --commit or in the successor. |
| M24 | only B23 | Fence the old coordinator epoch when the marker is accepted and reject further mutations under that epoch, making accidental post-boundary work an immediate error rather than merely deleting the marker silently. |
| M25 | only B24 | Record marker creation, deletion, old-session exit, successor start, and successor-ready acknowledgment independently; alert if the marker disappears, the old session remains alive, or no successor becomes ready within the configured deadline. |
| M26 | only B25 | On startup, the successor reads the work order, sealed batch snapshot, event journal tail, launcher process table, in-flight declarations, and current local and remote branch SHAs; it does not depend on the predecessor's transcript. |
| M27 | A4+B26 merged | Give the successor the capability it lacks today: resume supervision of processes it did not spawn — adopt by stable job id, query status, renew declarations, request checkpoints, cancel workers, classify outputs, and land completed branches without reparenting their processes; notice completion without a harness notification (poll the log and branch tip through the existing probe) and hand findings back to a worker for a second leg. |
| M28 | only B27 | Reconcile every recorded lane as running, completed, stalled, missing, divergent, or orphaned before spawning anything; print every mismatch and place unresolved lanes in a red progress-board state. |
| M29 | only B28 | Refill only after reconciliation and global-cap acquisition, preventing duplicate work when a worker finished or a launcher restarted during the handover gap. |
| M30 | A5b+B29 merged | Failure mode: two sessions adopt the same run or coordinate at once. Half A holds that the batch lock and its fence already serialise ownership; half B requires the daemon to grant exactly one renewable coordinator lease per batch, with all queue, cancellation, landing, and bookkeeping mutations carrying its epoch so old and new sessions cannot both coordinate. Build the lease; the lock and fence remain the session-side serialisation. |
| M31 | A3c+B30 merged | The handover condition changes from 'no agent in flight' to 'the point I was LANDING is landed': running authors are handed on, not waited out. Use a fresh main session after each completed landing, or earlier at a conservative context watermark, because one 30-90 minute review-and-landing unit is already a natural atomic coordinator epoch. |
| M32 | only B31 | Preserve serial landing and require a batch-wide landing lock; durable authoring parallelism does not authorize parallel merges, work-order edits, or progress-board updates. |
| M33 | only B32 | Journal the candidate SHA, target SHA, diff-review completion, gate results, graphic artifact hashes, merge SHA, bookkeeping update, and board update so a crash mid-landing is detected and recoverable. |
| M34 | only B33 | Planned boundaries occur only before a landing starts or after its journal reaches 'landed'; after an unplanned crash, the successor repeats any human judgment whose completion cannot be proven. |
| M35 | only B34 | Keep both graphics-backend judgments in the main session and persist their artifact paths, hashes, backend names, and result in the landing journal; worker claims never substitute for these checks. |
| M36 | only B35 | Revalidate a completed branch against the current landing base because earlier serial landings may make its recorded base stale; conflicts or changed gates return it to an explicit rework state. |
| M37 | only B36 | A worker may report ready-for-review only when its worktree is clean, required checks have a recorded result, and its terminal commit is visible on the expected remote branch. |
| M38 | only B37 | A heartbeat timeout, unexpected exit, push failure, dirty terminal worktree, or missing log changes the lane to a named failure state, frees no ambiguous lease, and raises a board/probe alert. |
| M39 | only B38 | Prevent duplicate writers with a daemon-held attempt lease and process-start identity; restart only after death is proven, and fail closed if ownership or the worktree lock is uncertain. |
| M40 | only B39 | Require stale attempts to verify their current lease before every checkpoint and push; a fenced attempt that resumes must stop and leave its branch intact for inspection. |
| M41 | only B40 | If the local registry is corrupt or missing, reconstruct only provable facts from the work order, launcher records, worktrees, logs, and pushed branches, and quarantine uncertain points instead of declaring them complete. |
| M42 | only B41 | Refuse a boundary when the daemon, state directory, remote push destination, or successor-launch path is unhealthy; a fast handover is not successful unless the work and the next coordinator are recoverable. |
| M43 | only B42 | Cancellation caused by obsolete requirements or dependency changes goes through the daemon, records the reason and last pushed SHA, waits for lease release, and preserves the branch rather than deleting evidence. |
| M44 | only A5c | Failure mode: a detached run outlives its point with nobody landing it. The board now-card and the ETA rule make an unattended run visible to the reader. |
| M45 | only A6a | Rejected: raising the pool cap. The binding constraint is LANDING throughput (30-90 minutes per point in the main session today), not authoring slots; more parallel authors only queue at the same door. |
| M46 | A6b+B43 merged | Rejected: the coordinator session refilling authoring slots to stay busy, and continuous refilling with in-process Agent-tool children in particular — the former grows main-session context for no added throughput, the latter perpetuates the original lifetime dependency and makes every fast boundary destructive. |
| M47 | only B44 | Rejected: routinely draining all three lanes before every boundary, because it solves safety by deliberately sacrificing parallelism and recreates the observed long idle tail. |
| M48 | only B45 | Rejected: relying on the one detached Sol lane alone while two session-bound lanes remain; the remaining child is still enough to block handover, so durability is a per-active-lane invariant. |
| M49 | only B46 | Rejected: transferring opaque child handles or copying the old transcript into the successor — neither preserves process ownership, and transcript growth would defeat the measured reason for handover. |
| M50 | A6c+B47 merged | Rejected: moving diff judgment, dual-backend picture verification, serial landing, work-order bookkeeping, or board ownership into authoring workers; those are the serial duties that define the main session — coordinator responsibilities and quality gates. |
| M51 | only B48 | Rejected: treating a PID, log activity, boundary marker, or unpushed local commit as sufficient proof by itself; acceptance requires mutually consistent launcher identity, lease, heartbeat, branch SHA, and durable record. |
| M52 | only B49 | Rejected: making the boundary marker survive arbitrary same-session work, because the launcher could then resume from a stale snapshot; post-marker work must invalidate and alarm, not be hidden. |
| M53 | only A7 | The larger driver the problem statement understates: main-session context grows mostly from HARVESTING and BOOKKEEPING (diffs, gates, guard remedies, board work), not from spawning — measured 13.08.2026, one point's review plus guard loops dominated the session. Therefore also split the coordinator ROLES: a short-lived dispatcher that only spawns, and a lander that only reviews and lands one point, so neither carries the other's history. |
| M54 | only A8 | Measure with scripts/measure-context-cost.mjs over a full day, in both scopes: median main-session context at handover, and the share of spend above 150k context (the 87-94 % figure that motivated the boundary). Success is that figure falling while the number of points landed per day does not. |
| M55 | only B50 | Generate the canonical result from the event journal, launcher timestamps, lane reason codes, boundary receipts, and per-session context-token samples, and publish it in the progress board for each batch. |
| M56 | only B51 | Report eligible three-lane utilization as time with three active workers divided by time with at least three eligible authorized points, excluding only individually recorded reason intervals. |
| M57 | only B52 | Report handover checkpoint wait, marker-to-successor-ready latency, running workers carried across each boundary, landing duration, and the share of token spend occurring above 150k context. |
| M58 | only B53 | Accept the design after a representative multi-point batch reaches at least 90% eligible three-lane utilization, p95 checkpoint wait at most three minutes, p95 successor-ready latency at most five minutes, and less than 10% of tokens above 150k. |
| M59 | only B54 | Require zero lost worker attempts, duplicate active writers, overlapping coordinator leases, unaccounted idle intervals, or silently missed boundaries; any nonzero count fails the trial regardless of average speed. |
| M60 | only B55 | Roll out first with the already-proven author-sol.mjs adapter behind a handover-capable flag, then enable other adapters only after crash, stall, push-failure, marker-deletion, daemon-restart, and split-brain drills pass. |
| M61 | only B56 | Retain the existing drain-before-boundary rule as the explicit safe fallback whenever any active lane lacks the durable contract; degradation is visible and slower, but never loses work. |

All 14 A identifiers and all 56 B identifiers appear exactly once: 14 A + 56 B entries → 61 union entries (18 merged, 5 only A, 47 only B), counted by `blind-merge.mjs`.

The apparent A6b/B9 disagreement is resolved narrowly: continuous session-local refilling is rejected, but daemon refill from a bounded, pre-authorized queue is allowed while backlog headroom exists. A3c/B33 does not require authors to finish before handover; it requires the serial landing operation itself to be either not started or durably complete.

## Final proposal

### Final state

All authoring lanes that may survive a boundary run as daemon-owned detached workers. An active Agent-tool child is explicitly non-transferable and therefore blocks the boundary unless it finishes or is safely stopped.

The main-session coordinator is short-lived. Dispatcher epochs select and authorize work; lander epochs perform review, browser judgment, serial landing and bookkeeping. A planned handover happens after a landing completes—or earlier at the context watermark when no landing is in progress—using a checkpointed, two-phase boundary. The successor adopts supervision from durable repository-adjacent state without inheriting the previous transcript.

A bounded ready queue and completed-review backlog limit preserve parallelism without overwhelming the serial landing stage. Drain-before-boundary remains the safe degraded mode.

### Files and durable records

The implementation lives in:

- `CLAUDE.md`: lifecycle rules, role split, boundary prohibition, rejected alternatives and fallback.
- `scripts/author-sol.mjs`: first conforming worker adapter.
- `scripts/detached-agent.mjs`: common worker contract and adapter interface.
- `scripts/batch-daemon.mjs`: new daemon entry point, global cap, leases, fencing and process ownership.
- `scripts/batch-dispatch.mjs`: authorized queue, dependencies and backlog control.
- `scripts/batch-in-flight.mjs`: transferable adoption records and probes.
- `scripts/batch-checkpoint.mjs`: checkpoint requests and bounded acknowledgment barrier.
- `scripts/batch-boundary.mjs`: `--prepare` and `--commit`.
- `scripts/resume-batch.mjs`: startup hook that locates and adopts a batch.
- `scripts/batch-reconcile.mjs`: evidence reconciliation and quarantine.
- `scripts/land-point.mjs`: landing lock and crash-recoverable landing journal.
- `scripts/batch-board.mjs`: progress-board projection and alerts.
- `scripts/batch-metrics.mjs` and `scripts/measure-context-cost.mjs`: operational and context measurements.
- `<git-common-dir>/codex-batches/<batch-id>/events.jsonl`: checksummed source journal.
- `<git-common-dir>/codex-batches/<batch-id>/snapshot.json`: atomic resume snapshot.
- `<git-common-dir>/codex-batches/<batch-id>/landing.json`: current landing transaction.
- `<git-common-dir>/codex-batches/<batch-id>/receipts/`: checkpoint and boundary receipts.

The attached material does not disclose the existing progress-board source path, Vitest directory convention or Playwright directory convention. The work order therefore names new test files below; the implementer must first map them to the repository’s established directories if those conventions differ.

### Ordered work

1. Define schemas and invariants before process changes.

   Update `CLAUDE.md` and add schema modules used by `scripts/detached-agent.mjs`. Specify identities, states, valid transitions, lease epochs, checksum framing, schema version, retry request IDs and the rule that every mutating command is idempotent. Verify with `npx vitest run scripts/__tests__/batch-schema.test.mjs`.

2. Build the durable state store.

   Implement append-only journal writes, checksum validation, atomic snapshot replacement, replay and corruption quarantine. Require write–flush–rename durability for a committed snapshot or receipt. Verify normal replay, truncated final record, checksum mismatch and interrupted snapshot replacement with `npx vitest run scripts/__tests__/batch-state.test.mjs`.

3. Implement the daemon and the Sol adapter.

   Add `scripts/batch-daemon.mjs`; move transferable process parentage, leases, stable identities, logs and heartbeats under it. Adapt `scripts/author-sol.mjs` without changing its proven authoring behavior. Commands must include `node scripts/batch-daemon.mjs start`, `status`, `stop` and `drill`. Verify worker survival after launcher-client exit, global-cap enforcement and daemon restart with `npx vitest run scripts/__tests__/detached-agent.test.mjs scripts/__tests__/batch-daemon.test.mjs`.

4. Implement transferable declarations and fencing.

   Extend `scripts/batch-in-flight.mjs` with batch/job/attempt/process-start identity and `transferable`. Add one coordinator lease per batch and require its epoch on mutations, checkpoints and pushes. Verify PID reuse, stale epochs, duplicate attempts, lease expiry and a resumed fenced worker with `npx vitest run scripts/__tests__/batch-in-flight.test.mjs scripts/__tests__/batch-leases.test.mjs`.

5. Add bounded dispatch and backpressure.

   Implement explicit queue authorization, dependency checks, global three-lane acquisition, review-backlog ceiling and underutilization reason intervals in `scripts/batch-dispatch.mjs`. Automatic refill must not create or broaden work. Verify ordering, six-worker split-brain prevention, backlog throttling and reason accounting with `npx vitest run scripts/__tests__/batch-dispatch.test.mjs`.

6. Add the checkpoint barrier.

   Implement checkpoint request IDs, committed-and-pushed acknowledgments and bounded timeout handling in `scripts/batch-checkpoint.mjs`. A timeout must identify the non-transferable job and offer wait, cancel or drain—not silently continue. Verify clean checkpoint, push failure, timeout, duplicate request and late acknowledgment with `npx vitest run scripts/__tests__/batch-checkpoint.test.mjs`.

7. Add two-phase boundary handling.

   `node scripts/batch-boundary.mjs --prepare --batch <id>` performs health, landing-lock, bookkeeping, board, queue and checkpoint validation. `node scripts/batch-boundary.mjs --commit --batch <id>` seals the snapshot, advances the epoch, writes the marker, obtains the daemon receipt and fences the caller. Verify that commit is idempotent, failed prepare creates no marker, post-commit mutation fails, and unhealthy dependencies refuse handover using `npx vitest run scripts/__tests__/batch-boundary.test.mjs`.

8. Add successor startup and reconciliation.

   `node scripts/resume-batch.mjs --batch <id>` reads durable inputs and invokes `scripts/batch-reconcile.mjs`. Reconciliation compares journal, daemon, worktrees, local and remote SHAs before any refill. Unknown evidence is quarantined. Verify running, completed, stalled, missing, divergent, orphaned and corrupt-registry cases with `npx vitest run scripts/__tests__/batch-reconcile.test.mjs`.

9. Make landing crash-recoverable but serial.

   Add the batch-wide landing lock and staged journal to `scripts/land-point.mjs`. Persist diff judgment, gates and both picture-verification records before merge; persist merge, bookkeeping and board stages afterward. Revalidate against the current base. Verify crashes at every journal stage, stale-base rework, lock exclusion and repeated recovery with `npx vitest run scripts/__tests__/land-point.test.mjs`.

10. Project state and alerts into the board.

    Implement `scripts/batch-board.mjs` to show every lane, heartbeat age, ETA, coordinator epoch, backlog, boundary state and red mismatches. Alerts cover stalled workers, missing successor readiness, marker deletion and rejected old-epoch mutations. Verify data projection with `npx vitest run scripts/__tests__/batch-board.test.mjs`, then browser behavior with `npx playwright test tests/progress-board-batch.spec.ts tests/batch-handover.spec.ts`.

11. Implement unbiased metrics.

    Derive metrics exclusively from durable events and independently sampled session context. Preserve `scripts/measure-context-cost.mjs` for full-day median context and points/day; make `scripts/batch-metrics.mjs` report utilization, exclusions, checkpoint wait, successor latency, carried workers, landing duration and safety incidents. Backlog-pressure time must be reported separately rather than erased from the denominator. Verify calculations with `npx vitest run scripts/__tests__/batch-metrics.test.mjs`.

12. Run staged failure trials.

    First enable only `author-sol.mjs`. Run normal handover plus worker crash, stall, push failure, dirty worktree, marker deletion, daemon restart, corrupt snapshot, PID reuse, duplicate coordinator, remote outage and checkpoint-timeout drills through `node scripts/batch-daemon.mjs drill --scenario <name>`. Run the complete regression layers with `npx vitest run` and `npx playwright test`. Enable another adapter only after all drills pass.

13. Measure a representative trial before changing the default.

    Capture at least one baseline full day under the old drain rule and multiple full-day durable-worker batches with comparable eligible work. Success requires zero safety incidents; p95 checkpoint wait no more than three minutes; p95 marker-to-successor-ready latency no more than five minutes; less than 10% of token spend above 150k; median handover context materially below baseline; and points landed per day no worse than baseline. The 90% eligible three-lane-utilization target applies together with the landed-throughput condition, not instead of it.

### Additional omissions found during synthesis

Neither blind list fully specified schema upgrades, durable-write semantics, command idempotency, daemon authorization, artifact retention, host resource pressure or experimental sampling. The implementation must therefore also:

- Version journals and snapshots, reject unknown future schemas and test migration of the immediately preceding version.
- Use idempotency keys for every daemon mutation and boundary/checkpoint retry.
- Restrict daemon control and state paths to the repository owner; never execute commands derived from mutable worker output.
- Define retention for landed/cancelled attempts, preserving audit records while eventually pruning logs and worktrees.
- Enforce configurable CPU, memory and disk headroom in addition to the three-process cap.
- Record sampling method, batch mix, eligible intervals and exclusions so context and throughput comparisons cannot be selected after the fact.

## The raw blind halves

They are versioned, not reproduced here. A section of this document once claimed to be "List B,
as written blind"; it was not. It carried 67 entries against list B's 56, and all 56 comparable
rows disagreed with the raw text — it was the union itself, renumbered, with `B<n>` standing for
`M<n>`. That is what made the stage look unrecoverable, and it is removed rather than corrected,
because the raw halves now have a home that cannot drift from them:

| Half | Model | Entries | File |
|---|---|---|---|
| A | Claude Opus 5 | 14 | `docs/four-eyes/676-blind-a-opus5.json` / `.md` |
| B | GPT-5.6 Sol | 56 | `docs/four-eyes/676-blind-b-sol.json` / `.md` |
| Union | folded by Claude Fable 5 (22.08.2026) — the third model, which wrote neither half | 61 | `docs/four-eyes/676-union.json` |
