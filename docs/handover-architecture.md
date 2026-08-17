# Durable authoring workers and a short-lived coordinator — the merged architecture

PROVENANCE. This is the result of the blind-parallel four-eyes stage of 13.08.2026 (CLAUDE.md
§6) on the question: how can the batch keep three authoring lanes busy AND hand the session over
on context, when today a handover kills every worker the session spawned. Two lists were written
blind — list A by Claude (Opus 5), list B by GPT-5.6 Sol (`local/sol-blind-proposal.md`, not
versioned) — and merged into the counted union below, every entry accounted for as `only A`,
`only B` or `merged with <id>`.

DEVIATION, NAMED RATHER THAN INHERITED SILENTLY: CLAUDE.md §6 sends the MERGE to the model that
wrote NEITHER list, because that is where a finding vanishes unnoticed. This merge was performed
by Sol, the author of list B, while a third model (Fable 5) existed. The union is therefore
usable as a specification but NOT yet a valid four-eyes result: before implementation begins the
merge is re-run by the model that wrote neither list, against list B and the A entries preserved
in the table below. This is work-order point 676's first step, not a footnote.

The rejected alternatives are kept deliberately: they are the cheap-looking answers this stage
ruled out, and an implementer who does not see them re-proposes them.

| Union entry | Sources | Disposition and merged meaning |
|---|---|---|
| M1 | A1+B1 merged | The conflict is caused by session-bound process lifetime, not by parallelism itself; handover must preserve active work. |
| M2 | only A2 | Retain the reported 13 August 2026 detached-Sol survival result as motivating evidence, but mark it unverified because its logs were not attached. |
| M3 | A3a+B3 merged | Durable authoring uses the detached `author-sol.mjs` contract—isolated branch/worktree, checkpoints, pushes, heartbeat, log and terminal status—not Agent-tool children. |
| M4 | A3b+B16 merged | Extend the in-flight declaration into a transferable adoption record with batch, job, attempt and process-start identity; PID alone is insufficient. |
| M5 | A3c+B33 merged | A planned boundary may occur before landing begins or after the landing journal says `landed`, never during landing; authors need only checkpoint. |
| M6 | A4+B26 merged | A successor must adopt supervision by stable job identity, query and control workers, classify results and land them without process reparenting. |
| M7 | A5a+B17 merged | A transferred declaration remains probeable and must alert, rather than silently unblock, when its evidence expires or becomes inconsistent. |
| M8 | A5b+B29 merged | A batch-wide renewable coordinator lease, epoch and fence prevent two sessions from adopting or mutating the same batch. |
| M9 | only A5c | Every unattended detached run remains visible on the progress board with point, owner state, heartbeat and ETA. |
| M10 | only A6a | **REJECTED:** Raising the three-worker cap does not fix the serial 30–90-minute landing bottleneck and can enlarge the review queue. |
| M11 | A6b+B43 merged | **REJECTED:** Refilling session-bound Agent children merely to keep a session busy preserves the fatal lifetime dependency and grows context. |
| M12 | A6c+B47 merged | **REJECTED:** Diff judgment, dual-backend picture verification, landing, work-order edits and board ownership must not move into authoring workers. |
| M13 | only A7 | Separate short-lived dispatcher and lander coordinator epochs so neither accumulates the other role’s transcript and bookkeeping history. |
| M14 | only A8 | Preserve full-day measurement through `scripts/measure-context-cost.mjs`: median context at handover, spend above 150k and points landed per day. |
| M15 | only B2 | Establish a short-lived coordinator plane and session-independent authoring-worker plane. |
| M16 | only B4 | Add `scripts/detached-agent.mjs` as a model-neutral adapter; an adapter is transferable only after satisfying the durable-worker contract. |
| M17 | only B5 | Unsupported Agent-tool children remain session-bound and must finish or be safely stopped before a boundary. |
| M18 | only B6 | Make a daemon—not the main session—the parent and lifecycle owner of transferable workers. |
| M19 | only B7 | Persist batch, point, attempt, process-start identity, branch, worktree, base SHA, PID, log, heartbeat and launcher lease for every run. |
| M20 | only B8 | Enforce the three-author global cap in the daemon across all coordinator epochs. |
| M21 | only B9 | Permit refill only from a bounded, explicitly pre-authorized queue containing concrete points, dependencies, base SHA, branch and worktree. |
| M22 | only B10 | The daemon may start authorized entries but may not select new work, broaden scope or violate dependency order. |
| M23 | only B11 | Journal the reason and duration whenever three eligible lanes exist but fewer than three run. |
| M24 | only B12 | Apply a completed-review backlog limit so parallel authoring cannot create an unbounded stale-branch queue. |
| M25 | only B13 | Use an append-only checksummed journal under `<git-common-dir>/codex-batches/<batch-id>/events.jsonl` as the durable source of truth. |
| M26 | only B14 | Atomically replace a derived `snapshot.json` for fast resume while retaining the journal for audit and corruption detection. |
| M27 | only B15 | Model point states explicitly as queued, running, checkpointing, ready-for-review, landing, landed, failed, stalled or cancelled. |
| M28 | only B18 | During boundary preparation, request and acknowledge committed-and-pushed checkpoints from all running durable workers without waiting for point completion. |
| M29 | only B19 | A worker missing the checkpoint deadline becomes non-transferable and blocks handover with explicit recovery choices. |
| M30 | only B20 | Implement two-phase handover: `--prepare` validates state and obtains checkpoints without creating the final marker. |
| M31 | only B21 | `--commit` atomically seals state, advances the coordinator epoch, creates the marker and obtains a durable launcher receipt as the old session’s final action. |
| M32 | only B22 | Forbid all tool work and bookkeeping after successful boundary commit. |
| M33 | only B23 | Fence the old coordinator epoch when commit is accepted and reject every later mutation carrying that epoch. |
| M34 | only B24 | Independently record marker creation/deletion, old-session exit, successor start and successor-ready acknowledgment, alerting on missed deadlines. |
| M35 | only B25 | The resume hook reconstructs from the work order, sealed state, journal tail, launcher table, declarations and local/remote SHAs—not the old transcript. |
| M36 | only B27 | Reconcile every recorded lane as running, completed, stalled, missing, divergent or orphaned before new dispatch and show unresolved states in red. |
| M37 | only B28 | Refill only after reconciliation and global-cap acquisition. |
| M38 | only B30 | Use post-landing as the natural boundary point, with an earlier conservative context watermark when needed. |
| M39 | only B31 | Preserve serial landing behind a batch-wide landing lock. |
| M40 | only B32 | Journal candidate and target SHAs, review completion, gates, graphic hashes, merge SHA, bookkeeping and board updates for crash recovery. |
| M41 | only B34 | Persist both main-session graphics-backend judgments and artifact hashes; worker assertions cannot replace them. |
| M42 | only B35 | Revalidate completed branches against the current landing base and send conflicts or changed gates to explicit rework. |
| M43 | only B36 | Permit `ready-for-review` only for a clean worktree with recorded checks and a terminal commit visible on the expected remote branch. |
| M44 | only B37 | Convert timeout, exit, push failure, dirty worktree or missing evidence into a named alerted failure state without ambiguously freeing ownership. |
| M45 | only B38 | Prevent duplicate writers through daemon-held attempt leases, process-start identities and fail-closed worktree locks. |
| M46 | only B39 | Require lease validation before every checkpoint and push; fenced attempts stop while preserving their branches. |
| M47 | only B40 | Reconstruct only provable facts after registry loss or corruption and quarantine uncertainty. |
| M48 | only B41 | Refuse handover if the daemon, durable state, remote push destination or successor launch path is unhealthy. |
| M49 | only B42 | Cancel through the daemon, recording reason and last pushed SHA, waiting for lease release and preserving evidence. |
| M50 | only B44 | **REJECTED:** Routinely draining all lanes before every boundary is safe but defeats parallelism and recreates the idle tail. |
| M51 | only B45 | **REJECTED:** Making only the Sol lane durable is insufficient while any other active lane remains session-bound. |
| M52 | only B46 | **REJECTED:** Opaque child handles or copied transcripts provide neither durable ownership nor context reduction. |
| M53 | only B48 | **REJECTED:** PID, log activity, marker or local commit alone is inadequate proof; independent identity, lease, heartbeat, SHA and durable-state evidence must agree. |
| M54 | only B49 | **REJECTED:** Allowing arbitrary work after boundary commit makes its snapshot stale; attempted post-commit mutation must fail and alert. |
| M55 | only B50 | Generate canonical batch metrics from journal events, launcher timestamps, reason codes, receipts and context samples, then publish them on the board. |
| M56 | only B51 | Calculate eligible three-lane utilization from active-worker time over time with at least three authorized, dependency-ready points, with explicit excluded intervals. |
| M57 | only B52 | Report checkpoint wait, marker-to-successor-ready latency, workers carried through boundaries, landing duration and spend above 150k context. |
| M58 | only B53 | **REJECTED AS THE SOLE ACCEPTANCE TEST:** Its thresholds are useful targets, but utilization can be gamed and must be paired with landed-throughput and baseline comparisons. |
| M59 | only B54 | Require zero lost attempts, duplicate writers, overlapping coordinator leases, unaccounted idle intervals and silently missed boundaries. |
| M60 | only B55 | Roll out the proven Sol adapter first; enable another adapter only after the complete failure-drill suite passes. |
| M61 | only B56 | Retain drain-before-boundary as the explicit safe fallback whenever any active lane is not transferable. |

All 14 A identifiers and all 56 B identifiers appear exactly once. No supplied section was marked `TRUNCATED`. A2’s empirical claim cannot be independently confirmed from the attached material.

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

    Capture at least one baseline full day under the old drain rule and multiple full-day durable-worker batches with comparable eligible work. Success requires zero safety incidents; p95 checkpoint wait no more than three minutes; p95 marker-to-successor-ready latency no more than five minutes; less than 10% of token spend above 150k; median handover context materially below baseline; and points landed per day no worse than baseline. The 90% eligible three-lane-utilization target is supporting evidence, not a substitute for landed throughput.

### Additional omissions found during synthesis

Neither blind list fully specified schema upgrades, durable-write semantics, command idempotency, daemon authorization, artifact retention, host resource pressure or experimental sampling. The implementation must therefore also:

- Version journals and snapshots, reject unknown future schemas and test migration of the immediately preceding version.
- Use idempotency keys for every daemon mutation and boundary/checkpoint retry.
- Restrict daemon control and state paths to the repository owner; never execute commands derived from mutable worker output.
- Define retention for landed/cancelled attempts, preserving audit records while eventually pruning logs and worktrees.
- Enforce configurable CPU, memory and disk headroom in addition to the three-process cap.
- Record sampling method, batch mix, eligible intervals and exclusions so context and throughput comparisons cannot be selected after the fact.

## List B, as written blind (index)

B1 | CLAUDE.md | The parallelism/handover conflict is a session-lifetime artefact; handover must preserve active durable work.
B2 | CLAUDE.md | Retain the reported 13 August 2026 detached-Sol survival result as unverified motivating evidence because its logs were not attached.
B3 | scripts/author-sol.mjs | Make detached Sol the reference authoring contract with isolated worktree, checkpoints, pushes, heartbeat, log and terminal status.
B4 | scripts/batch-in-flight.mjs | Turn in-flight declarations into adoption records with batch, job, attempt and process-start identities.
B5 | scripts/land-point.mjs | Permit planned boundaries only before landing begins or after the landing journal reaches landed.
B6 | scripts/batch-reconcile.mjs | Let successors adopt, inspect, control and land durable jobs by stable identity without process reparenting.
B7 | scripts/batch-in-flight.mjs | Make expired or inconsistent transferred declarations alert loudly rather than silently unblock.
B8 | scripts/batch-daemon.mjs | Use one renewable coordinator lease, epoch and fence per batch to prevent double adoption.
B9 | scripts/batch-board.mjs | Keep every unattended run visible with point, state, heartbeat and ETA.
B10 | CLAUDE.md | REJECTED: raising the worker cap does not fix serial landing throughput and can enlarge the review backlog.
B11 | CLAUDE.md | REJECTED: continuous refill with session-bound Agent children preserves destructive handover coupling.
B12 | CLAUDE.md | REJECTED: authoring workers must not own review judgment, picture verification, landing, bookkeeping or the board.
B13 | CLAUDE.md | Separate short-lived dispatcher and lander coordinator epochs so neither carries the other role’s history.
B14 | scripts/measure-context-cost.mjs | Measure full-day median handover context, spend above 150k and points landed per day.
B15 | CLAUDE.md | Split coordination from session-independent authoring workers.
B16 | scripts/detached-agent.mjs | Provide a model-neutral adapter and grant transferability only to implementations satisfying the complete durable contract.
B17 | CLAUDE.md | Treat unsupported Agent-tool children as session-bound and block boundaries until they finish or stop safely.
B18 | scripts/batch-daemon.mjs | Make the daemon the process parent and lifecycle owner of transferable workers.
B19 | scripts/detached-agent.mjs | Persist stable run identity, branch, worktree, base SHA, PID, log, heartbeat and launcher lease.
B20 | scripts/batch-daemon.mjs | Enforce a global three-author limit across coordinator sessions.
B21 | scripts/batch-dispatch.mjs | Refill only from a bounded pre-authorized queue of concrete dependency-ordered points.
B22 | scripts/batch-dispatch.mjs | Keep selection and scope decisions with the coordinator; the daemon only starts authorized entries.
B23 | scripts/batch-dispatch.mjs | Journal a reason and duration whenever three eligible lanes exist but fewer than three run.
B24 | scripts/batch-dispatch.mjs | Stop refill at an explicit completed-review backlog limit.
B25 | <git-common-dir>/codex-batches/<batch-id>/events.jsonl | Store the append-only checksummed coordination source of truth outside worktrees and transcripts.
B26 | <git-common-dir>/codex-batches/<batch-id>/snapshot.json | Maintain an atomically replaced resume snapshot derived from the journal.
B27 | <git-common-dir>/codex-batches/<batch-id>/snapshot.json | Record explicit point states, actor, epoch, timestamps and local/pushed commit identities.
B28 | scripts/batch-checkpoint.mjs | Before handover require every durable worker to acknowledge a committed-and-pushed checkpoint, not point completion.
B29 | scripts/batch-checkpoint.mjs | Make checkpoint timeout render a worker non-transferable and block handover with explicit recovery choices.
B30 | scripts/batch-boundary.mjs | Implement prepare as a noncommitting health, bookkeeping, lock and checkpoint validation phase.
B31 | scripts/batch-boundary.mjs | Implement commit as the final old-session action that seals state, advances epoch, creates the marker and obtains a durable receipt.
B32 | CLAUDE.md | Forbid all tool work and bookkeeping after successful boundary commit.
B33 | scripts/batch-daemon.mjs | Fence the old epoch on commit and reject every later mutation from it.
B34 | scripts/batch-daemon.mjs | Record and monitor marker creation, deletion, old-session exit, successor start and successor-ready acknowledgment.
B35 | scripts/resume-batch.mjs | Resume from durable state, launcher records, declarations and branch SHAs without the predecessor transcript.
B36 | scripts/batch-reconcile.mjs | Classify every lane before dispatch and quarantine unresolved mismatches in a red board state.
B37 | scripts/batch-reconcile.mjs | Refill only after reconciliation and global-cap acquisition.
B38 | CLAUDE.md | Prefer a fresh coordinator after each landing or earlier at a conservative context watermark.
B39 | scripts/land-point.mjs | Preserve serial landing through a batch-wide landing lock.
B40 | scripts/land-point.mjs | Journal every landing stage and its evidence so a crash is detectable and recoverable.
B41 | scripts/land-point.mjs | Persist both main-session graphics-backend judgments and artifact hashes.
B42 | scripts/land-point.mjs | Revalidate ready branches against the current landing base and route conflicts or changed gates to rework.
B43 | scripts/detached-agent.mjs | Permit ready-for-review only for a clean worktree, recorded checks and a terminal commit visible remotely.
B44 | scripts/detached-agent.mjs | Convert heartbeat, exit, push, cleanliness or evidence failures into named alerted states.
B45 | scripts/detached-agent.mjs | Prevent duplicate writers with attempt leases, process-start identity and fail-closed worktree locks.
B46 | scripts/detached-agent.mjs | Require lease validation before every checkpoint and push, stopping fenced attempts without deleting their branches.
B47 | scripts/batch-reconcile.mjs | Reconstruct only provable facts after registry damage and quarantine uncertainty.
B48 | scripts/batch-boundary.mjs | Refuse handover when daemon, durable state, remote push or successor launch is unhealthy.
B49 | scripts/batch-dispatch.mjs | Cancel through the daemon while recording reason and last pushed SHA and preserving the branch.
B50 | CLAUDE.md | REJECTED: routinely draining all lanes before every boundary defeats parallelism and recreates the idle tail.
B51 | CLAUDE.md | REJECTED: durability of only one lane is insufficient while any active lane remains session-bound.
B52 | CLAUDE.md | REJECTED: opaque child handles and copied transcripts provide neither durable ownership nor context reduction.
B53 | CLAUDE.md | REJECTED: PID, log, marker or local commit alone cannot prove a worker is safely transferable.
B54 | CLAUDE.md | REJECTED: arbitrary post-marker work makes the sealed handover state stale and must fail visibly.
B55 | scripts/batch-metrics.mjs | Generate canonical metrics from durable events, launcher times, reason codes, receipts and context samples.
B56 | scripts/batch-metrics.mjs | Report eligible three-lane utilization with every excluded interval individually recorded.
B57 | scripts/batch-metrics.mjs | Report checkpoint wait, successor-ready latency, carried workers, landing duration and high-context spend.
B58 | progress board | REJECTED AS SOLE TEST: the numeric latency and utilization targets require baseline throughput and safety checks to prevent gaming.
B59 | progress board | Fail the trial for any lost attempt, duplicate writer, overlapping coordinator lease, unaccounted idle interval or silent boundary miss.
B60 | CLAUDE.md | Roll out the proven Sol adapter first and gate every later adapter on the full failure-drill suite.
B61 | CLAUDE.md | Retain drain-before-boundary as the explicit fallback whenever any active lane is non-transferable.
B62 | scripts/batch-state.mjs | Version journal and snapshot schemas and use durable write-flush-rename semantics with tested migration.
B63 | scripts/batch-daemon.mjs | Authenticate local control, restrict state permissions and never execute commands derived from mutable worker output.
B64 | scripts/batch-daemon.mjs | Define auditable retention and safe pruning for terminal logs, receipts, branches and worktrees.
B65 | scripts/batch-dispatch.mjs | Apply configurable CPU, memory and disk headroom alongside the process-count cap.
B66 | scripts/batch-metrics.mjs | Fix the baseline, sampling method, batch mix and exclusion rules before evaluating results.
B67 | scripts/batch-daemon.mjs | Give every mutating daemon, checkpoint and boundary request an idempotency key so retries cannot duplicate actions.
