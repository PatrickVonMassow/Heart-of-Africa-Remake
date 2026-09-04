# Point 1048 — blind half B (GPT-5.6 Sol)

Written from `docs/blind-1048/material.md` alone, in parallel with half A and
without sight of it. Handed back as the line form `id | file | defect`; the
machine-mergeable form is `1048-blind-b-sol.json`.

## B1 — `scripts/verify/wait-command-core.mjs`

SELF_MATCHING_PGREP — Root cause: `pgrep -f "npm exec vitest"` matches the watcher shells whose own argv contains that literal, so termination is impossible after Vitest exits. Mechanism: add a pure command-policy core used by the tool guard to reject process-name polling and require `run-wait.mjs --await`, which reads a named run record and validates its PID identity; test: fixture argv containing the pattern must be rejected, while a finished run record must make `--await` return immediately.

## B2 — `scripts/verify/run-wait-core.mjs`

WAIT_SINGLEFLIGHT — Root cause: every wake-up may create another independent background waiter because no durable ownership or deduplication exists. Mechanism: atomically acquire one wait lease keyed by run ID and owner generation; duplicate awaits attach to the existing receipt path or exit without spawning, and terminal records release the lease; test: ten concurrent acquire attempts produce exactly one owner and one terminal cleanup.

## B3 — `scripts/verify/run-wait.mjs`

EXPLICIT_RUN_IDENTITY — Root cause: resolving an omitted log to the “newest live” record can select an unrelated concurrent run and makes stale-state mistakes hard to distinguish. Mechanism: have the run launcher return an immutable run ID/record path and require that token for automated awaits, retaining newest-run lookup only for interactive status; test: overlapping quick and LARGE records always await the explicitly selected run.

## B4 — `scripts/verify/run-wait.mjs`

TIMEOUT_IS_STATE — Root cause: `--await` timeout only prints advice and exits 3, so a session can wake and start another wait without any durable escalation. Mechanism: write a `verification-wait-timeout` journal event containing run ID, last semantic progress, elapsed time and deadline; at 2.5× expectation or the absolute lease cap, atomically mark the run hung and invoke the recovery core; test: fake time crossing each threshold yields one event and one recovery request, never another waiter.

## B5 — `scripts/batch-in-flight.mjs`

STALE_INFLIGHT_REAP — Root cause: `.claude/batch-in-flight.json` is treated as plausible merely because it exists, even when its PID died hours ago. Mechanism: validate PID, process start time, run ID, command identity, renewable lease and run-record state on every read, then atomically tombstone invalid markers before any verification veto is considered; test: dead, reused, mismatched and lease-expired PIDs are reaped, while an exact live identity with fresh semantic progress survives.

## B6 — `scripts/batch-launcher.mjs`

HEARTBEAT_NOT_PROGRESS — Root cause: the shown owner-alive branch lets fresh `claimedAt` heartbeats veto launcher action although no batch result advances. Mechanism: evaluate `emergencyDecision` before the owner-alive skip and treat owner/PID health only as fencing information; skip solely when a bounded observable-progress lease exists, otherwise soft- or hard-recover despite fresh heartbeats; test: a live PID with minute-old heartbeats and stale progress recovers, while recent qualifying progress permits a skip.

## B7 — `scripts/batch-emergency-core.mjs`

SEMANTIC_PROGRESS_CLOCK — Root cause: generic activity, tool calls, watcher creation and log mtime can continually resemble work without changing an outcome. Mechanism: compute `latestObservableProgressAt` only from durable batch events, delegated-ref movement, verification result/phase advancement, or content-changing checkpoints; require evidence hashes/counters to change and explicitly exclude heartbeats and repeated identical observations; test: repeated identical events never advance the clock, while each approved event with a new value does.

## B8 — `scripts/batch-emergency-core.mjs`

BOUNDED_AUTONOMOUS_RECOVERY — Root cause: the present threshold, cooldown and renewable vetoes do not express one absolute deadline that no liveness signal can extend. Mechanism: persist `hardDeadlineAt = latestObservableProgressAt + 120 minutes`, schedule it in the launcher daemon, soft-recover at 60 minutes, and hard-recover at the deadline regardless of owner heartbeat or stale wait evidence; valid semantic progress alone moves the deadline, and host wake evaluates it immediately; test: fake-clock replay of fresh heartbeat plus eternal waits reaches hard recovery by 120 minutes without user input.

## B9 — `scripts/batch-launcher.mjs`

ETA_TO_ACTION — Root cause: an overdue now-card ETA produces only WARN output, so being 81+ minutes late has no operational consequence. Mechanism: convert ETA expiry plus stale semantic progress into an immediate emergency-core evaluation, escalating through soft and hard recovery rather than merely notifying; an overdue ETA with fresh progress causes a measured reforecast instead of a kill; test: the incident fixture recovers, while overdue-but-advancing and merely malformed ETA fixtures do not.

## B10 — `scripts/batch-emergency.mjs`

RECOVERY_TRANSACTION — Root cause: recording a strike or warning is not proof that recovery ran, and a partial kill/restart can leave competing owners. Mechanism: persist intent, fence the old owner generation, terminate its registered work, record each outcome, atomically transfer ownership, launch the successor with `emergencyHandoffPrompt`, and mark completion idempotently; test: injected failure after every phase can be retried to one successor with no duplicate deferral or owner.

## B11 — `scripts/batch-emergency.mjs`

DESCENDANT_REAP — Root cause: retiring only the owning PID leaves accumulated watcher shells alive, allowing them to consume resources and preserve misleading process matches. Mechanism: register spawned waits under owner/run identity and terminate the bounded descendant process group during recovery, verifying start times before signalling and never scanning by broad command substring; test: a tree containing ten watchers is fully retired while unrelated similarly named processes remain untouched.

## B12 — `scripts/guard-compatibility-core.mjs`

GUARD_DEADLOCK_INVARIANT — Root cause: after `batch-boundary --commit`, the boundary forbids all tool calls while `ci-status-guard` requires a specific wait before permitting turn end, leaving the allowed-action intersection empty. Mechanism: centralize guard arbitration and assert that every required action is permitted in the same state; for a committed boundary, make CI monitoring transferable and permit turn end rather than prescribing a forbidden tool call; test: the full boundary/CI state truth table contains no `must-do X` state where X is forbidden.

## B13 — `scripts/ci-status-guard-core.mjs`

CI_OWNERSHIP_HANDOFF — Root cause: CI completion responsibility remains attached to a session that has already committed its terminal boundary. Mechanism: on boundary commit, durably transfer the pushed ref, check/run identity and notification responsibility to the launcher, after which the CI guard stands down for that session while the launcher records CI transitions and initiates recovery on failure or timeout; test: pending CI plus committed boundary permits stop and continues monitoring through the same check ID.

## B14 — `scripts/batch-boundary-core.mjs`

DURABLE_BOUNDARY_FENCE — Root cause: deriving boundary validity from an unchanged worktree lets the first later mutation silently erase the handover and reopen completed authority. Mechanism: persist the boundary as an immutable generation/ref transition; reject subsequent mutations under that generation and require an explicit audited `--reopen` or successor claim, never automatic invalidation; test: a post-boundary mutation is denied and the marker remains valid, while explicit reopen creates a new generation without altering history.

## B15 — `scripts/batch-emergency-core.mjs`

VERIFICATION_LEASE_BOUNDS — Root cause: process-alive and output-mtime evidence can make a hung or chatty verification indefinitely suspend recovery, and sequential runs can reset per-run caps. Mechanism: renew leases only on semantic run progress, retain PID/start-time checks, cap each run and the cumulative suspension for one batch-progress boundary, and never let a lease pass the 120-minute hard deadline without qualifying progress; test: chatty unchanged output, sequential replacement runs and future-dated leases cannot defer recovery, while measured advancing verification can.

## B16 — `scripts/batch-standstill-core.mjs`

WAIT_IS_NOT_WORK — Root cause: a live owner or open wait interval may receive a positive activity classification even after the underlying run has terminated. Mechanism: derive verification and CI intervals from paired durable records and fresh semantic leases, close them immediately on terminal/dead identity, and classify the remaining owner interval as `IDLE_OWNER`; test: the 23:05–00:52 replay attributes the post-run eternal-watcher period to idle owner, not verification.

## B17 — `scripts/batch-emergency-core.mjs`

PROGRESS_BOUNDARY_RESET — Root cause: cooldown and strike state can survive unrelated observations or be reset by non-progress activity, producing either delayed recovery or repeated soft strikes. Mechanism: key the entire recovery episode to the exact durable progress boundary and reset it only when `latestObservableProgressAt` advances; test: heartbeats and watcher wakes preserve the episode, while a commit or delegated-ref move clears strikes and establishes a new deadline.

## B18 — `scripts/batch-emergency-drill.mjs`

REAL_PATH_INCIDENT_DRILL — Root cause: a test that merely constructs the expected aftermath cannot prove that the production actor detects, fences and restarts the wedge. Mechanism: build the historical fixture with live heartbeat, finished verification, stale in-flight PID and ten eternal-wait claims, then invoke the real launcher-to-emergency recovery entry point with fake clock/process adapters; test: the drill proves one soft action, bounded hard recovery, descendant cleanup, successor launch and continued queue movement.

## B19 — `scripts/batch-emergency-core.mjs`

SINGLE_RECOVERY_AUTHORITY — Root cause: overlapping mechanisms from points 947, 958 and 1048 could race, duplicate kills or apply different definitions of progress. Mechanism: retain this core as the sole progress/deadline decision authority, narrow 947 to total-wedge evidence collection and 958 to busy-wedge detection, and route both to one idempotency key `(progressAt, ownerGeneration)`; test: simultaneous triggers from all three sources yield one recovery transaction and one successor.

## B20 — `scripts/batch-launcher.mjs`

ACTIONABLE_AUDIT_TRAIL — Root cause: repeated green skips and warnings conceal which evidence overruled stale progress, making another wedge appear healthy indefinitely. Mechanism: log structured values for progress kind/time, owner identity, verification validity, ETA overdue duration, deadline and selected action on every tick, with alerts describing recovery outcomes rather than liveness; test: golden records for the incident contain no “healthy/owner alive” verdict and identify the exact deadline and recovery reason.
