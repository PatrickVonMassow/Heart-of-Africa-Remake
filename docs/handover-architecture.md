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
holds exactly: 14 A + 56 B identifiers → 70 source identifiers → 61 union entries, of which 9
are merged rows consuming 18 identifiers and 52 carry a single identifier each (5 only A, 47 only
B), every input entry claimed once, no dangling reference and no duplicate — a count Sol reproduced
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
| M1 | A1+B1 merged | Decision: the two goals are not inherently conflicting; the conflict is an artefact of coupling worker lifetime and recoverability to the main session's process parentage. The in-flight declaration names branch, worktree, pid and log — enough to LOCATE the run, but not to adopt it: PID is reusable, so adoption additionally requires the stable batch, job, attempt and process-start identities and the adoption record that M17 defines. Handover must therefore cease to mean terminating active work. |
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

All 14 A identifiers and all 56 B identifiers appear exactly once. The two units are counted separately, because they do not add up to each other: 70 SOURCE IDENTIFIERS (14 A + 56 B) map onto 61 UNION ENTRIES — 9 merged rows consuming 18 identifiers, and 52 rows carrying one identifier each (5 only A, 47 only B). Counted by `blind-merge.mjs`.

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

The attached material did not disclose the existing progress-board source path or this repository's test conventions, so the union named test files in conventions that do not exist here. THEY ARE TRANSLATED BELOW RATHER THAN LEFT TO THE IMPLEMENTER, each with the union's original name beside it: Vitest lives beside its subject as `scripts/<name>.test.mjs` and `src/**/*.test.ts[x]` (`npm run test:unit`), browser suites are `scripts/verify/<name>.mjs` driven by `npm test -- <suite>`, and there is no Playwright and no `tests/` directory. A step whose files do not exist yet is marked unbuilt where it is named.

### What stands on `main`, and who owns the rest

This document is the design. It is NOT a description of the deployed plane, and the
distinction is written down here because a reader who mistakes one for the other will
believe the lane already survives a boundary. It does not: today's authoring path is
still the one that runs, and it still dies with its session.

The front stage of point 676 was built on `feat/834-durable-authoring-lane` and then CUT
along its subsystem seams on 24.08.2026, because what remained was cross-vendor review of
~12,000 lines that no single round can hold. Each seam is its own work-order point, lands
on its own branch, and carries its own review:

| Step below | Owning point | State |
|---|---|---|
| — this document | 890 | lands first; every other seam is judged against it |
| — the four-eyes artefacts, the fold and the merger check | 889 | built, behind 890 |
| 1 schemas and invariants, and the activation flag | 891 | built, not yet on `main` |
| 2 the durable state store and its journal | 892 | built, not yet on `main` |
| 4 attempt leases and epoch fencing | 893 | built, not yet on `main` |
| 3 the daemon, its control plane and the worker contract | 894 | built, not yet on `main` |
| 8, and the slice of 9 it needs | 895 | built, not yet on `main` |
| the drills, and switching the lane on | 834 | built, lands last |
| 5 dispatch, 6 the checkpoint barrier, 7 the two-phase boundary, the rest of 9, 10 the board projection, 11 the metrics and the staged trials | 676 | UNBUILT — the remainder of 676, which begins after 834 |

Until 834 has landed and the flag has been switched on, nothing in this repository advertises
a surviving lane, and `scripts/durable-lane-flag-core.mjs` REFUSES to enable one.

### Ordered work

1. Define schemas and invariants before process changes.

   Add `scripts/batch-schema-core.mjs`, the pure schema and invariant layer every later step reads. Specify identities, attempt states and their valid transitions, the coordinator credential and its lease epoch, the daemon record and its lock copy, checksum framing, the schema version rule, retry request ids and the rule that every mutating command declares its compensation and is idempotent. The daemon-pair table of mechanism 2 is decided here rather than assumed, and the credential's acceptance cases — a push under a previous generation refused, a fence store that lost its generation refusing to mint — belong to this step. Verify with `npx vitest run scripts/batch-schema-core.test.mjs` (the union's `scripts/__tests__/batch-schema.test.mjs` is translated to this repository's convention).

   `CLAUDE.md`'s lifecycle rules are NOT written here, and that is the dark rule rather than an omission: the lane may not be advertised until steps 8 AND 9 are green — reconciliation without a landing a successor can finish still strands adopted work, so crash-recoverable serial landing is part of the interlock, exactly as `STEPS_REQUIRED_FOR_ACTIVATION` in `scripts/durable-lane-flag-core.mjs` encodes it — and CLAUDE.md is where this project states what runs. They land with that slice, together with the activation flag's release.

2. Build the durable state store.

   Implement append-only journal writes, checksum validation, atomic snapshot replacement, replay and corruption quarantine. Require write–flush–rename durability for a committed snapshot or receipt. Verify normal replay, truncated final record, checksum mismatch and interrupted snapshot replacement with `npx vitest run scripts/batch-state-core.test.mjs scripts/batch-state.test.mjs scripts/batch-state-durability.test.mjs` (the union's `scripts/__tests__/batch-state.test.mjs`, translated).

3. Implement the daemon and the Sol adapter.

   Add `scripts/batch-daemon.mjs`; move transferable process parentage, leases, stable identities, logs and heartbeats under it. Adapt `scripts/author-sol.mjs` without changing its proven authoring behavior. Commands must include `node scripts/batch-daemon.mjs start`, `status`, `stop` and `drill`. Verify worker survival after launcher-client exit, global-cap enforcement and daemon restart with `npx vitest run scripts/detached-agent.test.mjs scripts/batch-daemon-core.test.mjs scripts/batch-daemon.test.mjs` (the union's `scripts/__tests__/…`, translated).

4. Implement transferable declarations and fencing.

   Extend `scripts/batch-in-flight.mjs` with batch/job/attempt/process-start identity and `transferable`. Add one coordinator lease per batch and require its epoch on mutations, checkpoints and pushes. Verify PID reuse, stale epochs, duplicate attempts, lease expiry and a resumed fenced worker with `npx vitest run scripts/batch-attempt-lease-core.test.mjs scripts/batch-in-flight-core.test.mjs` (the union's `scripts/__tests__/batch-in-flight.test.mjs` and `scripts/__tests__/batch-leases.test.mjs`, translated).

5. Add bounded dispatch and backpressure.

   Implement explicit queue authorization, dependency checks, global three-lane acquisition, review-backlog ceiling and underutilization reason intervals in `scripts/batch-dispatch.mjs`. Automatic refill must not create or broaden work. Verify ordering, six-worker split-brain prevention, backlog throttling and reason accounting with `npx vitest run scripts/batch-dispatch-core.test.mjs` (the union's `scripts/__tests__/batch-dispatch.test.mjs`, translated; neither file exists yet — this step is unbuilt).

6. Add the checkpoint barrier.

   Implement checkpoint request IDs, committed-and-pushed acknowledgments and bounded timeout handling in `scripts/batch-checkpoint.mjs`. A timeout must identify the non-transferable job and offer wait, cancel or drain—not silently continue. Verify clean checkpoint, push failure, timeout, duplicate request and late acknowledgment with `npx vitest run scripts/batch-checkpoint-core.test.mjs` (the union's `scripts/__tests__/batch-checkpoint.test.mjs`, translated; neither file exists yet — this step is unbuilt).

7. Add two-phase boundary handling.

   `node scripts/batch-boundary.mjs --prepare --batch <id>` performs health, landing-lock, bookkeeping, board, queue and checkpoint validation. `node scripts/batch-boundary.mjs --commit --batch <id>` seals the snapshot, RECORDS the fence it ran under, writes the marker, obtains the daemon receipt and fences the caller. It does NOT advance the fence — acquisition is that number's only writer (mechanism 2); an earlier draft of this step said otherwise and would have made the boundary a second, unsynchronised writer of it. Verify that commit is idempotent, failed prepare creates no marker, post-commit mutation fails, and unhealthy dependencies refuse handover using `npx vitest run scripts/batch-boundary-core.test.mjs` (the union's `scripts/__tests__/batch-boundary.test.mjs`, translated).

8. Add successor startup and reconciliation.

   `node scripts/resume-batch.mjs --batch <id>` reads durable inputs and invokes `scripts/batch-reconcile.mjs`. Reconciliation compares journal, daemon, worktrees, local and remote SHAs before any refill. Unknown evidence is quarantined. Verify running, completed, stalled, missing, divergent, orphaned and corrupt-registry cases with `npx vitest run scripts/batch-reconcile-core.test.mjs scripts/batch-reconcile.test.mjs` (the union's `scripts/__tests__/batch-reconcile.test.mjs`, translated).

9. Make landing crash-recoverable but serial.

   Add the batch-wide landing lock and staged journal to `scripts/land-point.mjs`. Persist diff judgment, gates and both picture-verification records before merge; persist merge, bookkeeping and board stages afterward. Revalidate against the current base. Verify crashes at every journal stage, stale-base rework, lock exclusion and repeated recovery with `npx vitest run scripts/land-point-core.test.mjs scripts/batch-landing-core.test.mjs` (the union's `scripts/__tests__/land-point.test.mjs`, translated).

10. Project state and alerts into the board.

    Implement `scripts/batch-board.mjs` to show every lane, heartbeat age, ETA, coordinator epoch, backlog, boundary state and red mismatches. Alerts cover stalled workers, missing successor readiness, marker deletion and rejected old-epoch mutations. Verify data projection with `npx vitest run scripts/batch-board-core.test.mjs` (unbuilt), then browser behaviour with `npm test -- <suite>` against a suite under `scripts/verify/` — this repository has no Playwright and no `tests/` directory, so the union's `tests/*.spec.ts` names are translated, not created.

11. Implement unbiased metrics.

    Derive metrics exclusively from durable events and independently sampled session context. Preserve `scripts/measure-context-cost.mjs` for full-day median context and points/day; make `scripts/batch-metrics.mjs` report utilization, exclusions, checkpoint wait, successor latency, carried workers, landing duration and safety incidents. Backlog-pressure time must be reported separately rather than erased from the denominator. Verify calculations with `npx vitest run scripts/batch-metrics-core.test.mjs` (the union's `scripts/__tests__/batch-metrics.test.mjs`, translated; the file does not exist yet — this step is unbuilt).

12. Run staged failure trials.

    First enable only `author-sol.mjs`. Run normal handover plus worker crash, stall, push failure, dirty worktree, marker deletion, daemon restart, corrupt snapshot, PID reuse, duplicate coordinator, remote outage and checkpoint-timeout drills through `node scripts/batch-daemon.mjs drill --scenario <name>`. Run the complete regression layers with `npm run test:unit` and the LARGE browser gate `npm test` (CLAUDE.md §5); there is no Playwright here. Enable another adapter only after all drills pass.

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

### The three mechanisms the synthesis owed

The union describes a durable lane but leaves three of its load-bearing parts as instructions
rather than mechanisms. They are written out here, before any of them is built, because each one
is where the lane either survives or quietly does not. Every one of them was refused once by a
cross-vendor reading (GPT-5.6 Sol, effort high, 22.08.2026, nine findings on the first draft) and
what follows is the answered form; where a claim is now MEASURED rather than argued, the
measurement is named.

#### 1. How the daemon escapes the session that starts it

This is the defect that killed the run of 21.08.2026, so it is stated against the code that failed
and against a drill that reproduces it. `scripts/author-sol.mjs` spawns `codex` like this:

```js
const child = spawn('codex', args, {
  cwd, env: childEnv(process.env), windowsHide: true,
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

**The binding that decides it is the stdio shape.** Run
`node scripts/detached-escape-drill.mjs` and it measures both shapes against the same kill: a
parent that is its own group leader, a child spawned `detached` and `.unref()`ed EITHER WAY so
that stdio is the only variable, the parent's whole process group then SIGKILLed as a dying
session takes its children, and an observer outside that group. Measured 22.08.2026 on the
project's Linux container — with `stdio: ['ignore', 'pipe', 'pipe']` the child died two beats
after the kill, its own log ending `raised: EPIPE`; with `stdio: ['ignore', fd, fd]` it was still
beating at rate three seconds later, reparented to pid 1.

**What that drill does and does not establish.** It is a Node worker that writes to stdout and
does not handle the error, not `codex` — so it shows that for a child of that shape the pipe
decides, and it does NOT prove by itself that the historical run died of exactly this. The worker
deliberately does not choose its own fate: its handler records the cause and rethrows, so what
ends the process is the runtime's default rather than a policy the drill wrote for itself. Whether
`codex` would survive a broken stdout is not ours to decide, and that is the argument for removing
the pipe rather than for handling the error. The drill also refuses to conclude anything when the
two shapes behave alike, which is what it did when an earlier harness sent the kill to the wrong
process group.

That correction matters, because the two bindings the first draft blamed are not lifetime
bindings at all:

- **`detached: true` alone already survives the group signal.** It makes the child a group leader,
  so a signal addressed to the session's process group never reaches it. Today's lane has this and
  still died.
- **The missing `.unref()` binds the parent's EVENT LOOP, not the child's life,** and the awaited
  `runCodex` call binds the parent's CONTROL FLOW. Neither can kill a child whose parent is
  SIGKILLed. They matter for a different reason, and the mechanism still needs them: while the
  spawning tool call cannot return, the session cannot go on working and cannot hand over, so the
  lane would be "durable" only by outliving a session that was never allowed to leave.
- **Whether `EPIPE` kills depends on the child's error handling,** and `codex` is not ours to
  change. That is precisely why the answer is to remove the pipe rather than to handle the error.

The repository already contains a process that escapes correctly, and the daemon copies it rather
than inventing a second answer: `scripts/batch-autostart.mjs` starts its supervisor with
`spawn(…, { cwd: REPO, detached: true, stdio: ['ignore', out, out] })` followed by `.unref()`,
where `out` is a file descriptor from `openSync(path, 'a')`. Nothing the daemon writes needs a
live reader, so no parent's death can break a write, and the log file is the record a later
session reads.

Three rules complete the mechanism:

- **The spawning call NEVER awaits the daemon.** It returns as soon as the daemon has written its
  own identity record — pid, pid start time, schema version, the fence it is serving, and the
  LAUNCH NONCE — into the state store, and the caller waits for THAT FILE with a bounded timeout.
  The nonce is generated by the spawning call and passed in `argv`; a readiness record carrying
  any other nonce is a previous daemon's and does not satisfy the wait. Without it a stale record
  from a dead launch would end the wait immediately.
- **Workers are children of the daemon, never of a session.** A session that wants authoring asks
  the daemon to start it; the daemon spawns it by the same pattern. This is what makes the lane
  transferable at all: after the session dies, the worker's parent is still alive and still owns
  it, so a successor adopts a supervised process rather than an orphan.
- **The identity is pid AND pid start time.** A bare pid is not an identity, as this repository
  already learned in `scripts/batch-singleton.mjs`, where `PID_START_TOLERANCE_MS` exists so a
  recycled pid cannot read as a live owner. `node scripts/batch-daemon.mjs stop` signals the
  recorded pid after checking that start time, never a process group inherited from a parent that
  may no longer exist.

**WHAT THIS ESCAPE DOES NOT SURVIVE, stated so nobody claims more for it.** It defeats
process-group signalling and nothing beyond it. A teardown by cgroup — a systemd scope, a
container stop, a killed dev container — takes the daemon with everything else in that scope, and
so does the loss of the user, the mount namespace or the repository mount. Those are not failures
of this mechanism; they are the case where the whole host went away, and the recovery path for
them is the same fresh-session discovery starting from a COLD daemon and durable state. The lane
claims survival of a dead SESSION, not of a dead host.

#### 2. Migrating today's batch lock to the coordinator lease

Ownership today is `.claude/batch-lock.json` — session id, pid, pid start time, a heartbeat, a
`leaseUntil` and a monotone `fence` — acquired by the atomic test-and-set in
`scripts/batch-singleton.mjs`, with every guard standing down for a non-owner. The union adds a
renewable coordinator lease with an epoch. Two owner records covering the same batch is exactly
the shape that produces a split brain, so the relation between them is fixed here.

**THE EPOCH IS THE LOCK'S FENCE. There is no second counter.** The first draft had the daemon mint
its own epoch and re-read the lock only at renewal, and the cross-vendor reading broke it in one
interleaving: A holds the lock at epoch 7, A's lock expires, B acquires it, and before B mints
epoch 8 or A renews, A submits a mutation carrying epoch 7 — which the daemon's cached current
epoch still accepts. A separate counter cannot be made atomic against a lock it does not share.
So it is not separate: the coordinator epoch IS the FENCE this repository already keeps —
monotonic, taken by every acquisition, durable in `.claude/batch-fence.json` because `acquire`
deletes the lock file, and copied onto the live lock as `lock.fence` (the lock this batch is
running under carries 603). Ownership and authority are therefore read from one record, and the
lock file is the single serialization point for both.

**Precedence.** The batch lock remains the sole authority on whether a session may work at all.
The fence it carries is the sole authority on whether a mutation of daemon-owned state is
accepted. A session needs both, and neither can grant what the other denies, because they are one
record.

**Validation, at the moment of mutation.** Every daemon mutation presents `(sessionId, fence)`.
The daemon holds NO cached notion of the current epoch. It re-reads `.claude/batch-lock.json` for
each mutation and accepts only when all of the following hold at that instant: the lock's
`sessionId` equals the presented one, the lock's `fence` equals the presented one, and the lock is
live by the existing test — pid and pid start time match, and the heartbeat is within its lease.
The daemon serializes mutations against itself, so this read-and-decide is one operation per
mutation. It records the fence it validated in the journal entry, so a later reader can see which
regime authorized which write. Every one of those equalities requires the value PRESENT on both
sides before it is compared: two absent values compare equal, so a presentation carrying no
session or no usable fence would otherwise match a lock that lost the same field. Absence-equality
is identity nowhere in this design — not here, not in the process and attempt comparisons.

**That does NOT make the window zero, and the mechanism says so.** Serializing the daemon's own
mutations does not serialize the lock file, which `release` and `acquire` write from other
processes. A release can land between the daemon's validation and its write, so a mutation can
still commit microseconds after its author stopped holding the lock. No arrangement of two
independently written files removes that window; what removes its EFFECT is detection and
compensation, and the design owes all three parts:

- **Re-validate after the write.** The daemon reads the lock again immediately after the journal
  write and compares fence and session against what it validated. Unchanged is the ordinary case
  and the mutation stands.
- **Compensate when it changed.** A mutation whose lock moved under it is reversed by its own
  compensation and the reversal is journalled beside it: a started worker is stopped and its
  branch preserved, a queued job is withdrawn, a lease grant is revoked. Every mutation the daemon
  accepts must therefore DECLARE its compensation, and a mutation without one cannot be
  registered — that is a case in step 1's command table, not a convention.
- **Refuse it downstream.** Every journal entry carries the fence it was written under, AND the
  journal records every fence transition. An entry is legitimate exactly when its fence is the one
  in force at its own position in the journal, and reconciliation (step 8) quarantines the entries
  that fail THAT test — not everything below the successor's own fence, which is what the third
  answer said and which would have quarantined all legitimate predecessor history, transferred
  workers included, at every ordinary handover.

  **THE JOURNAL HAS EXACTLY ONE WRITER, AND ITS TAIL IS ALLOWED TO SAY "I DO NOT KNOW".** Two
  earlier answers each gave the transition to a different author — first the daemon, then the
  acquirer — and both failed for the same reason: two independent writers cannot establish an
  order between their own appends. Letting the daemon write it left the record hostage to traffic
  (validate 7, lock moves to 8, append the 7, crash before any 8 arrives, and transition 8 lands
  behind the entry it should have condemned); letting the acquirer write it merely moved the same
  race to the acquirer's append.

  So the daemon is the only writer, transitions included, and where it cannot prove the order it
  says so instead of inventing one. On restart the daemon reads the lock. If the current credential
  has no transition in the journal, every entry after its own last CONFIRMED position — the last
  entry it had both written and re-validated before the crash — is marked `unverified`, because it
  cannot prove whether those entries were written before or after the credential moved.
  Reconciliation quarantines exactly those, and nothing else: confirmed history stays history,
  including transferred workers.

  **THE UNVERIFIED TAIL IS NOT LOCAL-ONLY, AND RECONCILIATION MUST GO AND LOOK.** Claiming it was
  local by construction was wrong in both directions: a push can land and its journal entry follow
  before the crash, and an intent entry can precede a push that then succeeded. Either leaves an
  unverified entry describing an act that is published and uncompensable. So the journal is
  written in a way that makes the question ANSWERABLE, and reconciliation answers it against the
  remote rather than assuming:

  - **Intent precedes the act, and names an OBJECT rather than a counter.** Before any publishing
    act the daemon appends an intent entry carrying a unique publication id, and for every ref it
    will move, the exact object id it expects to find there and the exact object id it will leave.
    The commits exist locally before the push, so the after-oid is known in advance. The entry
    exists before the push can, so no landed push lacks a record.
  - **Recovery asks the remote about those objects, on the WORK ref, in ONE ordered procedure.**
    The earlier wording gave a rule and then a fallback that contradicted it, so an implementation
    reading only the first sentence would have called rewritten work abandoned. There is one
    procedure, and it runs to the end before it concludes anything. For each unverified publishing
    intent, reconciliation fetches the ref the intent named — `main` or a feature branch, never
    the credential ref, which carries a blob and has no history — and then:

    1. `git merge-base --is-ancestor <after-oid> <that ref>` succeeds → **LANDED.** This stays
       true through any number of later publications, which is what a `seq` comparison could not
       do.
    2. Otherwise the publication id is searched as a commit trailer in that ref's history →
       found means **LANDED-REWRITTEN**, recorded as such, so nobody later reads it as a clean
       landing.
    3. Otherwise, if the ref is still at the recorded expected-before oid → **ABANDONED.** Only
       the unmoved ref proves it. An earlier wording also concluded ABANDONED when the moved
       ref's history "contains that oid and nothing derived from this attempt", and that consumed
       a case the next outcome must quarantine: a rewrite that lost its publication trailer and
       an unrelated successor leave exactly that evidence, so it decides nothing.
    4. Otherwise → **UNKNOWN, and quarantined.** The ref moved in a way this attempt's own record
       cannot explain — a rewrite that lost the trailer looks exactly like an unrelated successor,
       and neither the expected-before oid nor its presence in the history can tell them apart.
       Guessing here is what the whole mechanism exists to avoid.
  - **Nothing is inferred from the credential's current value,** because a `seq` is reused by a
    later attempt after a failed one and cannot tell landed from superseded from abandoned.
  - **Two things are quarantined, and the earlier wording named only one.** An entry with NO
    publishing intent is quarantined locally — that is the case the local-and-reversible argument
    covers. An entry WITH a publishing intent that the procedure above ends at UNKNOWN is
    quarantined too, and it is not covered by that argument at all: it may have published. It is
    marked as such, so nobody later reads a quarantined entry as uniformly local.

  "The fence in force at position i" therefore remains the last transition at or before i for the
  confirmed prefix, and the tail is resolved by evidence rather than read as a fact. A position no
  transition precedes has NO fence in force, and an entry standing there — like one that names no
  position at all — is quarantined rather than passed: "no rule was in force" is not "no rule
  applies", because nothing authorized that write either.

**EVERY PUBLISHED MUTATION IS UNCOMPENSABLE, and there are two of them.** A pushed merge can
already have been fetched, read or built on, and "reverting" it is a new commit, not a reversal.
The same is true of a worker's checkpoint push (M40), which the earlier draft overlooked while
naming landing as the only case. Neither can rest on compensation, and both need the same thing:
a check that is not separate from the act.

**Non-fast-forward rejection does not supply it.** A stale coordinator that still holds the
landing lock keeps the rightful successor from pushing at all; the target ref therefore never
moves, and the stale push stays fast-forwardable and succeeds. Git's atomicity fences concurrent
ref MOVEMENT, not a dispossessed pusher — that was the hole in the third answer.

**THE FENCE THEREFORE LIVES ON THE REMOTE, where both parties actually meet.** The coordinator
credential is a pair — a random `generation`, minted when the fence store is created, and the
monotone `fence` within it — and it is published as a ref, `refs/hoa/coordinator`, whose blob
carries exactly that pair. Acquisition advances it; every publishing act then goes out as ONE
atomic push carrying both the work and the credential:

```
git push --atomic --force-with-lease=refs/hoa/coordinator:<the oid of my current credential> \
    origin <branch or main> refs/hoa/coordinator
```

**THE CREDENTIAL REF MUST ACTUALLY MOVE ON EVERY PUBLICATION.** If the pushed value equals the
one already there, git may classify the ref as up to date and leave it out of the remote
transaction altogether — and then the lease is not evaluated as part of it. A predecessor that
advertised while the ref still named it, and then spent a minute uploading a pack, could still
land its branch update after the successor had advanced the ref. So the credential is
`(generation, fence, seq)` and **`seq` increments on every publishing act**: each push is a real
update of that ref under a lease on its own previous value, inside the same atomic transaction as
the work. A publication whose credential update is a no-op is a publication with no fence, and the
command that builds it refuses to construct one.

The lease is a compare-and-swap on the credential ref. A coordinator whose successor has ALREADY
advanced that ref pushes a lease that no longer matches; the lease fails and `--atomic` means the
branch or `main` update does not happen either. Worker checkpoint pushes use the identical form,
so M40's "check the lease before pushing" becomes a check that IS the push rather than one that
precedes it.

**THE INTERVAL BEFORE THE SUCCESSOR'S ADVANCE IS NOT A WINDOW OF TWO PUBLISHERS.** Between B's
local acquisition and B's advance of the credential ref, the ref still carries A's credential, so
A's push is accepted. An earlier answer tried to close that with a clock — A stops δ before its
lease expires — and that was wrong twice over: re-reading a clock and then acting is the same
check-then-act race one level down, and no margin can be enforced against scheduling delay or push
latency. **The clock rule is withdrawn.** What actually holds is a rule about who may publish:

- **The ref decides, and only the ref.** Whoever's credential `refs/hoa/coordinator` carries is
  the one publisher. Not "the lock holder", not "whoever's lease is fresh" — the ref.
- **B advances the ref before it publishes anything — after acquiring the lock and starting a
  daemon if one is to be started, in the one mandatory order fixed below — and publishes nothing
  before that push has landed.** Until then B is not a publisher, by its own rule. An earlier
  sentence here called the advance "the first act of acquisition", which the mandatory order
  contradicts; it was simply false and is gone.
- **A remains a publisher until the ref moves,** and that is CORRECT rather than a leak: during
  that interval A is the only party the ref names and B has published nothing, so there is exactly
  one publisher throughout. The instant B's advance lands, A's next lease fails.
- **Nothing is timed, so nothing depends on a clock.** A push that was in flight when A died is
  either accepted before B's advance — A was still the named publisher — or rejected by the lease
  afterwards. There is no third outcome, and no assumption about drift, scheduling or latency
  survives in this argument at all.

What this costs is honest, and the first draft understated it as "the length of one push". The
CAS carries no priority: every publication by A moves the ref, so each one makes B's pending
advance fail its lease, and nothing on a plain git remote can make B's write win against a
predecessor that keeps publishing. What actually bounds A is LOCAL: every publication in this
design is preceded by lease validation against the lock (M40, and the per-mutation validation
above), so a predecessor RUNNING THIS DESIGN'S CODE observes its dispossession at the next
validation and can win at most the publications already past validation — publications are
serialized, so that is at most one, which is where the one-push figure comes from and the only
place it holds. A process that skips that validation — a bug, a rolled-back binary, a rogue —
is not automatically boundable by any rule here, and the design says so instead of claiming
otherwise: B's advance RETRIES on each lease failure against the freshly read credential and
publishes nothing until it lands, so safety never lapses; every failed advance is an ALERT
naming the credential that beat it, which identifies the still-publishing predecessor; and
sustained failure escalates to the operator, whose kill is the bound. Starvation here is a
liveness loss, detected and named — never a second publisher. What the CAS buys is unchanged:
the property is decided by an atomic operation on the far side rather than by two clocks
agreeing.

The landing's safety therefore comes from serialization plus a fenced remote update, and the local
fence is what stops a dispossessed coordinator from acquiring the landing lock in the first place.
Claiming compensation for either of these would have been a lie.

The honest claim is therefore narrower than the first draft's, and narrower again than the
previous wording of this sentence: the fence makes a dispossessed coordinator's work DETECTABLE
within one mutation, and REVERSIBLE only where the mutation is daemon-local and compensable.
A mutation that was already PUBLISHED is not reversible at all — that is what "uncompensable"
above means, and residual 2 deliberately leaves one such push standing. Detection is the whole
of the guarantee there; reversal is not offered.

**ONE WRITER OF THE FENCE, AND IT IS ACQUISITION.** The union's step 7 has `--commit` "advance the
coordinator epoch", which would make the boundary a second, unsynchronised writer of the same
number and reopen everything above. It does not advance it. `--commit` seals the snapshot and
RECORDS the fence it ran under; the next acquisition takes the next number, as every acquisition
already does. Step 7 is corrected to that wording in the same commit that builds it.

**FENCE LOSS IS FAIL-CLOSED, AND SO IS JOURNAL LOSS.** `.claude/batch-fence.json` is monotonic
and never deleted, but "never" is an intention, not a guarantee — a wiped `.claude`, a restored
backup or a re-seeded file can hand out a number that a durable record already carries, and then a
stale `(sessionId, fence)` pair becomes valid again. So the daemon does not trust the file alone:
at start, and at every mint, it compares it against the highest fence any record in its own
journal carries, and mints nothing while the file is missing or lower.

That check is only as good as the journal, which is the second half of the rule and the half the
first draft left out: **a missing or checksum-failing journal itself prohibits minting.** An old
fence file beside a lost journal would otherwise find no higher value and cheerfully hand out a
reused number — the comparison would pass precisely because the evidence was gone. In that state
the daemon refuses every mutation and raises an alert, and recovery is an OPERATOR act, never an
automatic one.

**RECOVERY MINTS A NEW GENERATION; IT DOES NOT RESEED A COUNTER.** Reseeding above the highest
surviving number is worthless in exactly the case that requires recovery: if every durable record
is gone, there is no highest number to be above, and a credential someone still holds can collide
with the new one. That is why the credential is a PAIR. Recreating the fence store mints a fresh
random `generation`, and a credential from any earlier generation matches nothing — the number
never has to be proven unique, because the generation already is. The published
`refs/hoa/coordinator` carries the pair, so an erased-but-still-held credential fails its lease at
the remote as well, which is the one place a lost local store cannot hide it. Its acceptance test
is in step 1's schema table: a push under a previous generation is refused, and a fence store that
has lost its generation refuses to mint rather than inventing one. A batch that cannot prove who
owns it must stop, not guess.

**Split-brain prevention.** Two sessions cannot hold the lock; that is the existing test-and-set,
and it is the only exclusion primitive in the design. The case the lock alone never covered is a
session that KEEPS WORKING after losing it, and the fence closes exactly that: its next mutation
presents a number the file no longer carries.

**Rollback: the REGIME IS THE DAEMON'S EXISTENCE, not a flag anybody reads.** A flag consulted per
call lets one mutation cross regimes. Sealing the flag into a daemon's identity fixes that for one
daemon but not for two, and the cross-vendor reading was right that flag-then-drain and
drain-then-flag both leave a window in which an old-regime daemon and a new-regime caller overlap.
So the flag does not define the regime at all. It defines one thing only: **whether a daemon may
be STARTED.** The regime is then a fact about the world rather than a setting —

- **A live daemon means the new path.** There is at most one, because `start` claims the daemon
  identity record by exclusive create and refuses while a live one exists, by the same pid and
  pid-start-time test used everywhere else here.
- **No daemon means today's path,** exactly as it runs now.

That forbids two daemons. It does NOT by itself forbid a legacy caller that read "no daemon",
began an old-path operation, and was still inside it when a daemon started — and an exclusive
create the legacy path never touches cannot see that caller. Confining the start to the boundary
window does not fix it either: `--prepare` proves quiescence at an INSTANT, and proving is not
reserving; the same lock-owning session could begin a legacy operation immediately afterwards.

**So the daemon's existence is ALSO A FIELD OF THE BATCH LOCK — a copy of its record, not a
second record.** `start` writes a `daemon` field — pid, pid start time, generation — into
`.claude/batch-lock.json`, and `stop` clears it the same way. **And that write is a
COMPARE-AND-SWAP, not a replacement** — the distinction the first draft blurred by calling it
"the same atomic test-and-set": exclusive create only governs a lock that does not exist, and a
bare write–rename over an existing lock would let a writer that prepared its update under fence
7, stalled, and woke after B acquired fence 8 overwrite B's lock with its stale record — the old
coordinator valid again, installed by the very file that dispossessed it. So every update of an
EXISTING lock — the heartbeat, the `daemon` field, its clearing — runs under the same reap mutex
that already serializes takeover: take the mutex, RE-READ the lock, refuse unless it still names
the writer's own `sessionId` and `fence` at that instant, only then rename the new content over,
release the mutex. A stale writer fails the re-read and installs nothing; a takeover holds the
mutex, so the two cannot interleave. Only under that rule is "only the lock owner writes the
lock" true as a mechanism rather than an intention. The consequences follow without any new
primitive:

- **"Is there a daemon?" and "may I work?" are ONE READ for the current lock owner,** so that
  owner cannot act on a pair of answers taken at two different instants. That is an ATOMICITY
  property and nothing more: the durable record is the daemon's own identity file (below), the
  lock's field is a copy of it, and the two CAN be apart — the write orders and the invariant that
  make every such state decidable are settled in "THE PAIR IS TWO FILES" further down.
- **Only the lock owner can start or stop one,** because only the lock owner can write the lock.
- **A legacy operation and a daemon start of the SAME session cannot overlap,** because a session
  is one thread of control: it is either inside a legacy operation or writing the lock, never both.

**That is not the whole answer, and the earlier draft stopped there.** Two actors do still exist
when A begins a legacy operation while owning the lock, A's lease then expires or its death is
observed, and B becomes owner and writes the `daemon` field while A is still inside that
operation. The single-thread argument covers the current owner and says nothing about a former
one, and re-reading the lock "immediately before" the irreversible act only moves the race — it
does not remove it.

**Half of it has a real answer, and the other half is a LIMIT that is stated rather than argued
away.** What a legacy operation can do irreversibly is publish, or mutate local state.

Publication is answered: it is decided at the remote by the credential lease above, which needs no
clock and no local re-read. A dispossessed operation's push fails once the successor's advance has
landed, and before that it is still the one named publisher.

Local state is NOT answered, and the previous draft's claim that it is "journalled with the
credential it ran under, and therefore reversible" was false twice. A legacy operation that began
before the daemon existed cannot journal through it, and letting legacy code append directly would
break the one-writer rule the section above depends on. Nor does local imply reversible —
terminating a process is local and final.

**So the honest statement is a scope limit, and it is a limit rather than a reassurance.** An
operation that began on the old path is not covered by any mechanism here, and this text does NOT
claim it is left unharmed: a daemon started while such an operation is running can touch the same
local state, and nothing in this design prevents that. It is a known residual, recorded as one. The
design's obligation is to avoid CREATING the situation where it can, and the one restriction that
actually holds is narrow:

- **A daemon may be started only before the starting session has begun any operation of its own.**

  **ONE ORDER, because two rules each claimed the "first act".** Acquisition owes the credential
  ref its advance before anything may be published, and a daemon start owes the lock its
  immediacy — read separately, bootstrap could satisfy neither. They are ordered, and this is the
  only sequence: **acquire the lock → start the daemon, if one is to be started → advance
  `refs/hoa/coordinator` → and only now may anything be published.** The very first advance has no
  previous value to lease, so it leases the ref's ABSENCE — `--force-with-lease=refs/hoa/coordinator:`
  with an empty expected oid, which git accepts only while the ref does not exist. Two sessions
  racing to create it therefore cannot both win, and the loser re-reads and acquires normally.
  The lease and the claimed current credential must AGREE about absence, in both directions:
  claiming no credential is published while leasing a real oid would skip every advance check and
  reopen the rollback door those checks close, so the push construction refuses the combination. "First act" for the daemon
  means before any operation; "first act" for the credential means before any publication. The
  daemon start is not a publication, so it precedes the advance without violating it.
- **AND ONLY WHEN NOTHING OF THE OLD PATH IS STILL RUNNING — probed, not assumed.** Without this,
  starting a daemon beside a former owner's live operation is an uncovered safety violation rather
  than a residual: two writers of the same local state, one of them uninstrumented.

  **A previous draft said a legacy operation "runs inside a session process, so it cannot outlive
  one", and mechanism 1 of this very document refutes that.** `scripts/author-sol.mjs` spawns a
  DETACHED child; whether it survives its parent depends on its stdio, which is the entire subject
  above. Probing former session pids therefore proves nothing about their detached children. So
  the precondition probes the work, not only the workers:

  - no other live session that ever held the lock (`scripts/batch-singleton.mjs`, by pid and pid
    start time — what it already answers as "live parallel sessions");
  - no in-flight declaration that still checks out (`scripts/batch-in-flight.mjs --agent-check`,
    which probes branch, worktree, pid and log rather than trusting the record);
  - no live process holding any worktree of this repository.

  **And the limit of that, stated rather than assumed away: it is exactly as strong as the
  declaration coverage.** An old-path child nobody declared cannot be found by any of these
  checks. That gap is not a side note — it IS the defect this whole point exists to remove, and
  until the point lands the honest reading is that the first daemon must be started when the batch
  is provably idle, not merely between two operations.
- **A former owner's legacy operation is out of scope,** written down rather than covered: its
  published acts are refused by the credential ref once the successor has advanced it, and its
  local acts have whatever recoverability today's code gives them — which this design neither
  measures nor improves.

The exclusion the earlier drafts claimed does not exist. Naming the residue is what keeps the rest
of this section true.

#### The residuals this design does not remove

Written here because a mechanism that hides its limits is worse than one that has none, and
because each of these is a candidate for its own work-order entry rather than a line someone
discovers while building:

1. **An undeclared old-path child can evade every start check.** The precondition probes live
   sessions, in-flight declarations and worktree processes, and none of those can see a detached
   child nobody declared — which is precisely the condition this point exists to remove, so it is
   at its worst before the point lands and gone after it. Until then the honest reading is that
   the first daemon is started when the batch is provably idle. This design also does not measure
   or improve the recoverability of work begun on the old path.
2. **One push of publishing authority after local dispossession.** The credential ref decides who
   publishes, so between a successor's local acquisition and its advance of that ref, the
   predecessor is still the named publisher. This is deliberate — it keeps exactly one publisher
   at all times — but it means a lock file and the remote can disagree about ownership for the
   length of one push.
3. **The unprovable journal tail after a daemon crash.** Resolved against the remote where an
   entry names a publishing intent, quarantined where it does not. An entry that is neither is not
   possible by construction, but the construction is a rule the implementation must keep.
4. **The drill's check-to-signal interval, and the part of it that is invisible.** Node exposes no
   pidfd, so a recycled pid is detected after the fact rather than prevented — and one branch
   cannot be detected at all: if the worker exits, its number is reused, the stranger is signalled
   and the stranger then vanishes, the probe answers exactly what a clean reap answers. The
   detection is best-effort: the drill reports every uncertainty it can OBSERVE — a refusal to
   signal, a failed signal, a survivor, an unreadable state, a changed identity — and this one it
   cannot observe at all. Its silence therefore means "nothing left to report", never "the process
   I spawned is the one that died".

**A daemon persists across the sessions that follow, and the lock is NOT what carries it across.**
`acquire` deletes the lock file — that is why the fence lives in `.claude/batch-fence.json` rather
than in the lock — so a `daemon` field of the lock cannot survive a handover, and an earlier draft
that said it did was wrong. The durable record is the daemon's own identity file in the state
store, which no lock operation touches. The lock's field is a COPY of it, written by acquisition
after reading it, and that copy is what makes "is there a daemon" and "may I work" one atomic read
FOR THE CURRENT OWNER. Persistence comes from the durable record; atomicity comes from the copy;
neither claim rests on the other. Rollback is then a single operation with
nothing to interleave: `node scripts/batch-daemon.mjs stop --drain` refuses new mutations,
completes the at most one mutation in flight (they are serialized, so the wait is bounded by a
single operation), cancels its workers through the cancellation path that preserves their branches
and last pushed SHAs, seals the snapshot, releases the identity record and exits. The flag is set
off BEFORE the drain, where its only effect is to stop a new daemon starting behind the one that
is leaving; it never switches a caller's path, because no caller reads it. State left behind is
INERT rather than migrated: the old path never reads the daemon's store, so its fence-bearing
records are retained as audit. Turning the flag back on starts a fresh daemon that reads the
sealed snapshot through step 1's version rule and quarantines it rather than guessing if the
schema is not one it knows.

**The two degenerate combinations.** A lock with no daemon is the normal case today and stays
legal. A daemon with no live lock is an error, and the daemon answers it by refusing every
mutation and raising an alert — never by choosing an owner itself.

**THE PAIR IS TWO FILES, SO WHAT MAKES IT SAFE IS A WRITE ORDER AND AN INVARIANT — not the claim
that it cannot disagree.** The persistence paragraph above says the durable record is the
daemon's identity file and that the lock carries a copy of it; an earlier draft added that the two can therefore never
disagree, and that is false. A crash between the two writes leaves them apart, `acquire` deletes
the lock file and takes the copy with it, and a daemon that exits releases the record while the
copy still names it. The schemas of step 1 encode STATES, so this pair's transitions are settled
here, BEFORE they are encoded — otherwise the schemas encode a lie.

- **The record** is `<state-store>/daemon.json`: pid, pid start time, generation, schema version,
  the fence being served, the launch nonce. Its only writer is the daemon itself, by
  write–flush–rename, and `start` claims it by exclusive create.
- **The copy** is the `daemon` field of `.claude/batch-lock.json`: pid, pid start time and
  generation, nothing else. Its only writer is the mutex-guarded compare-and-swap defined above
  — re-read, match own `sessionId` and `fence`, only then rename — so only the CURRENT lock
  owner can install it, and it is a CACHE — it exists so that "is there a daemon" and "may I
  work" are one read for the current owner, and for nothing else.

**Two write orders, and each is crash-safe in the same direction.** START writes the record
durably first; the lock owner then reads it, matches the launch nonce, probes the identity and
writes the copy. STOP clears the copy first; the daemon releases its record as its last act. A
HANDOVER deletes the lock file, so the copy is gone by construction and the successor rewrites it
from the record. Every one of these leaves, at worst, a record with no copy — the ordinary state
at every handover, never an incident.

**THE INVARIANT, in one sentence: the record is the sole authority on the daemon's existence, and
the copy may only ever be ABSENT, MATCHING or SUPERSEDED — never NOVEL.** "Older" is not an order
on the generations themselves — they are random strings, and the ambiguous-generations row below
says so — so the first draft's formal `copy.generation <= record.generation` compared values that
carry no order and is withdrawn. The order EXISTS, but it lives in the JOURNAL, which records
every mint: a copy's generation is SUPERSEDED exactly when the journal records it as minted and
records the record's generation as minted after it. Formally: the copy is absent, or its
generation equals the record's, or the journal's mint history orders it strictly before the
record's. A copy is trusted only when it matches the record exactly and the record's pid and pid
start time probe live; liveness is never read from the copy. Both write orders can produce
absence and supersession and neither can produce novelty, so a copy whose generation the journal
CANNOT PLACE — never minted there, or the journal unreadable — is not a race this design lost:
it is corruption or missing evidence, and it fails closed.

**The observations, and what each one resolves to.** Reconciliation is idempotent: running it
twice changes nothing, because every resolution is a write toward the record's own truth.

**The order of the questions is part of the mechanism.** Whether the copy is POSSIBLE at all is
asked first, because a copy no write order could have produced says nothing about liveness and
must not be resolved by it. Only then does the record's own probe decide, because the record is
the authority on existence: a dead record is COLD whatever the copy says, and the copy's staleness
is part of that resolution rather than a reading competing with it. An unprobed record is read
exactly like a dead one — this table never treats "not asked" as "alive", and a probe that
carries no AFFIRMATIVE verdict is "not asked": a failed or partial probe returns an identity
without an answer, and un-negated is not the same as confirmed.

| Record | Copy | Probe | Reading | Resolution |
|---|---|---|---|---|
| absent | absent | — | no daemon | today's path, legal and normal |
| present | matching | live | healthy | nothing to do |
| present | absent | live | unadopted — a handover, or a crash between the two writes | the lock owner probes the record and writes the copy |
| present | absent | dead or unprobed | cold record | reconcile its workers (step 8), release the record; a new daemon mints a new generation |
| present | matching | dead or unprobed | stale copy | as cold record, and clear the copy |
| present | journal-superseded generation | live | superseded copy | the record wins; rewrite the copy from it |
| present | journal-superseded generation | dead or unprobed | cold record | the record is what must be reconciled, and the copy goes with it |
| present | differing generation the JOURNAL cannot place — never minted there, or the journal unreadable | — | ambiguous generations — the strings themselves carry no order, and without the journal's mint history "superseded" is unprovable: the same evidence fits an earlier copy beside a live record and a newer copy beside a rolled-back record | refuse every mutation and alert; an operator supplies the ordering evidence — never an automatic rewrite or release |
| absent | present | — | orphaned copy | clear the copy; a daemon is never concluded from the copy alone |
| present | a generation the journal orders AFTER the record's, or no generation, or this generation under another process identity | — | impossible by construction | refuse every mutation and alert; an operator act, never an automatic one |
| no generation | any | — | impossible by construction | a record nothing can be compared to fails closed like the row above |

Its acceptance cases are step 1's own: every row of this table decided from the pair alone, and
the forbidden row refused rather than resolved.

#### 3. Ordered ownership for the prose-only omissions

The "Additional omissions" section states six requirements without an owner, a step or a test, and
a requirement in that state is not scheduled work. Each is placed here, in the ordered work above,
with the file that owns it and a case that can actually FAIL — the cross-vendor reading refused
three rows of the first draft for restating their requirement as their own test. Test paths follow
this repository's convention, Vitest beside its subject as `scripts/<name>.test.mjs`, and not the
`scripts/__tests__/` and `tests/` conventions the union assumed, neither of which exists here.

| Requirement | Step | Owning file | Acceptance case that can fail |
|---|---|---|---|
| Schema versioning and migration | 1 | `scripts/batch-schema-core.mjs` | a current record accepted, one version ahead REFUSED, one version behind migrated and re-read equal |
| Idempotency of every daemon mutation | 1, 2 | `scripts/batch-schema-core.mjs`, `scripts/batch-state-core.mjs` | one case per command in the daemon's command table, each applying the same key twice and asserting one state change — plus an ENUMERATING case that fails when a registered command has no idempotency case, so a new command cannot be added without one |
| Idempotency of boundary and checkpoint retries | 6, 7 | `scripts/batch-checkpoint.mjs`, `scripts/batch-boundary.mjs` | a repeated checkpoint request id acknowledged once; `--commit` run twice sealing once and the fence asserted UNCHANGED both times — acquisition is that number's only writer, and `--commit` never advances it |
| Daemon authorization — control | 3 | `scripts/batch-daemon.mjs` | a control request from a foreign uid refused; a worker-supplied string asserted never to reach an exec path |
| Daemon authorization — state paths | 3 | `scripts/batch-daemon.mjs` | the state directory, its files and the control socket created owner-only, asserted by mode and owner; a state path that is a symlink refused; a state path outside the git common directory refused |
| Retention of landed and cancelled attempts | 3 | `scripts/batch-daemon-core.mjs` | an aged LANDED attempt keeps its record and loses log and worktree; an aged CANCELLED attempt likewise; a young attempt of either kind keeps both — the aged-cancelled case is what stops "never prune anything" from passing |
| Resource headroom beside the process cap | 5 | `scripts/batch-dispatch-core.mjs` | dispatch refused under each of the CPU, memory and disk thresholds separately, each refusal naming its reason, and the reason reported rather than swallowed |
| Sampling that cannot be selected afterwards | 11 | `scripts/batch-metrics-core.mjs` | the plan — method, batch mix, eligible interval, exclusions — is SEALED into the journal before the interval opens, and the report carries that plan's hash; a report whose plan hash is missing, or was sealed after the interval's first event, is REFUSED. Metadata attached to a finished report cannot pass |

#### The drill that reproduces the real regression

The three mechanisms above are claims until this passes, and a launcher-client exit, a daemon
restart and a normal handover are all easier than what actually happened. The drill kills the
SPAWNING SESSION mid-authoring — the process that ran the tool call, by signal to its process
group, without warning.

**It is observed from outside the blast radius.** A harness inside the killed process group cannot
report on survivors, so the observer is started before the kill, in its own session, and it is
what records the outcome.

**Adoption is proven by an OPERATION, never by a reading.** A fresh session that merely finds and
labels the daemon and worker records proves nothing: checkpointing, cancellation, supervision or
landing may all be broken behind a correct-looking list. The drill therefore requires, after the
kill: the daemon still running under its recorded pid and start time; the worker still running and
its branch carrying a NEW pushed SHA that did not exist at the moment of the kill; a fresh session
acquiring the lock, presenting the new fence, and getting a new checkpoint request ACKNOWLEDGED by
that daemon; and one post-adoption lifecycle operation completing — a cancellation that preserves
the branch, or a landing.

It runs as `node scripts/batch-daemon.mjs drill --scenario parent-death` and is a precondition of
activation itself — the steps-8-and-9 slice the flag's interlock waits for — not a later trial.


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
