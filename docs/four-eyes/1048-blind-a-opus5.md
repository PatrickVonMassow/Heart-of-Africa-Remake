# Point 1048 — blind half A (Claude Opus 5)

Written from `docs/blind-1048/material.md` alone, before half B was read. The
machine-mergeable form of this list is `1048-blind-a-opus5.json`; this file is
its reasoning.

## The one sentence

Every safeguard in the batch answers the question *"is the owner alive?"*, and
the incident is a session that was maximally alive and produced nothing. The
answer is not another liveness probe: it is to make **observable progress** the
only currency that buys the owner more time, and to give every wait a bounded,
registered, self-terminating form.

## A1 — the self-matching wait can never return

`while pgrep -f "npm exec vitest" >/dev/null; do sleep 30; done` is executed by
a shell whose *own* `/proc/<pid>/cmdline` contains the literal `npm exec
vitest`. `pgrep -f` therefore matches the watcher itself, and — once a second
watcher exists — each matches its siblings. The predicate is true forever by
construction; the wait is for a run that finished before the loop started.

This is not a typo to be corrected once. The session's own instructions already
name `scripts/verify/run-wait.mjs --await` as *the* blocking wait; the defect is
that nothing refuses the hand-rolled alternative. **Final state:** a pure
classifier recognises the poll-loop shape in a Bash segment (a `while`/`until`
whose condition runs `pgrep`/`pidof`/`ps`/`jobs` and whose body sleeps, or a
`sleep` immediately followed by the same check) and refuses it, naming
`run-wait.mjs --await` as the replacement. The classifier additionally flags the
self-matching case specifically — the pattern appears verbatim inside the
command line that will carry it — because that one is not merely wasteful but
non-terminating.

## A2 — waits stack without bound

The session woke roughly every ten minutes and spawned another watcher; ten
stood at 01:00. No component counts a session's outstanding background waits, so
the tenth cost exactly as little as the first, and the stack itself was the
clearest possible evidence of the wedge while being visible to nothing.

**Final state:** one wait slot per session. A declared wait is registered with
its pid, its subject and its deadline; declaring a second while the first is
live *replaces* it (and terminates the first) rather than adding to it, and the
attempt is journalled. The count of live waits is itself an emergency input: two
or more simultaneous waits from one session is, by construction, a defect.

## A3 — the heartbeat is not progress (the core repair)

`skip: owner alive` rests on `assessment.alive === true`: a fresh heartbeat and
a live pid. A session in an eternal loop keeps making tool calls, so it keeps
the heartbeat fresh; the launcher skipped every tick for 107 minutes while the
work order advanced by nothing. Point 958 predicted exactly this and the
prediction was left as a prediction.

`batch-emergency-core.mjs` already has the right currency —
`BATCH_PROGRESS_KINDS` (`first-parent-commit`, `committed-boundary`,
`delegated-branch-moved`) and `latestProgressAt` — but it lives on an
independent hourly timer that the launcher's skip path never consults.

**Final state:** the launcher's skip becomes conditional. The owner keeps the
batch while *either* observable progress is younger than
`EMERGENCY_THRESHOLD_MS`, *or* a **corroborated** verification lease is live —
corroborated in the sense `activeVerificationLease` already demands: a named
record and command, a pid that is actually alive, and a progress sample inside
the lease window. Neither ⇒ the launcher takes the batch **regardless of
heartbeat freshness**, logging that it overrode a live heartbeat and why.

**The bound, stated:** the last observable progress plus 60 minutes
(`EMERGENCY_THRESHOLD_MS`) is when recovery becomes due; the successor is
running within one launcher tick (15 minutes) of that. **Worst case 75 minutes,
enforced by the launcher alone, with no human in the loop.** The measured
incident would have been recovered at ~00:05 instead of 00:52.

## A4 — the broken ETA promise is evidence, not a warning

The published now-card said "~HH:MM" and that promise stood 81+ minutes past
while the launcher only warned. An overdue ETA is the owner's own
self-reported progress claim failing — the cheapest progress signal available,
and the only one the *reader on the phone* can see.

**Final state:** `pastEtaCards`' `minutesPast` becomes an input to the same
decision as A3. An ETA more than one launcher tick past, *together with* no
observable batch progress, is not a warning: it is a second, independent
witness that the owner is not advancing, and it takes the takeover path. On its
own — with progress still flowing — it stays a warning, because a slipped
estimate during real work is ordinary.

## A5 — a marker of a dead pid must not be believable

`.claude/batch-in-flight.json` named a pid dead since the afternoon and kept "a
verification is running" plausible all night. Measured again live on 04.09.2026:
the marker in this checkout names pid 1761118, which no longer exists, while
declaring a WebGPU lane in flight.

`assessOwnerWork` probes the `evidence` entries, but the declaration's *own*
writer identity (`pid` + `pidStartedAt`) is never required to be alive, so a
declaration with an empty `evidence` array — exactly the incident's shape — is
believed on its timestamp alone.

**Final state:** a declaration is believed only while its writer identity is
alive (pid exists *and* its start time matches `pidStartedAt`, so a reused pid
does not resurrect it). A declaration failing that test reads as *absent*, is
cleared by the first reader that notices, and the clearing is journalled. A
declaration with no evidence at all may suspend a tick for at most one
re-declaration interval, never indefinitely.

## A6 — two guards that jointly demand and forbid the same action

After `batch-boundary --commit` the boundary refuses every tool call, the
prescribed 90-second wait and the clock included. `ci-status-guard` refuses
every turn end until the pushed ref's CI concludes, and its refusal *prescribes*
that wait. The session could neither work nor stop and emitted identical
farewells until a person intervened. `scripts/ci-status-guard.mjs` contains no
occurrence of the word "boundary" — the two guards have never been told about
each other.

**Final state, with an explicit precedence:** *a committed boundary is
terminal.* Once the boundary is committed, every Stop-side guard that would
refuse the turn end stands down, because the CI obligation is not dropped but
**transferred** — the successor is handed it as a terminal handoff, which is
already the mechanism that exists (this very session was started with a
`CI-TERMINAL-HANDOFF` naming a red run). `ci-status-guard` gains the same
`applicable: false` stand-down it already has for a paused batch and for a
non-owner, with `cause: 'committed-boundary'`.

**Final state, generalised:** the class of defect is a guard prescribing a
remedy another guard refuses in the same state. Each Stop-side guard declares
its prescribed remedy commands in one table, and a Vitest sweep asserts that
every prescribed remedy is permitted by the boundary's refusal predicate in the
committed-boundary state. A future guard pair of this shape then fails a test
instead of costing a night.

## A7 — the boundary marker must escalate, not evaporate

The marker's validity was "no repository mutation since it was taken", so the
first later mutation silently invalidated it and the handed-over batch re-opened
with nobody told. Silence is the wrong direction for a marker whose whole
purpose is to end a session.

**Final state:** the boundary records a *generation* in the lock rather than a
fragile no-mutation claim. A mutation after a committed boundary does not
cancel the handover — it **escalates**: the event is journalled, the handoff is
re-armed, and (if it repeats) it alerts, because a session mutating the
repository after declaring itself finished is a defect worth a person's
attention, not a reason to quietly resume.

## A8 — the busy wedge needs a repetition detector

Both incidents ended the same way: the session emitted the *same* outcome over
and over — ten identical watcher spawns, then identical farewell messages —
until a human broke the loop. Identical repeated outcomes are the signature of a
wedge that stays busy, and nothing counts them.

**Final state:** consecutive identical turn outcomes from one session are
counted (the mechanism already exists for the launcher's own verdicts as
`verdictRepeat`). At a stated count with no observable batch progress in
between, the session is declared wedged: it is journalled, alerted, and handed
over on the ordinary successor path. This is the detector point 958 named and
did not build.

## A9 — every wait must be registered and bounded

A2's slot and A5's liveness test only work if *every* wait goes through one
door. Today a wait may be a `run-wait.mjs --await`, a `batch-in-flight
--waiting-on` declaration, or an undeclared hand-rolled loop, and only the first
two are visible.

**Final state:** `run-wait.mjs --await` registers its wait in the same registry
`batch-in-flight` writes, with a deadline derived from `--plan <tier>`'s
estimate; a wait past its deadline is not renewed silently but becomes a
no-progress finding on the A3 path. The refusal of A1 closes the third door.

## A10 — the incident replay is the acceptance test

Every entry above is a pure decision; the point's own test line asks for the
incident's *shape* replayed. **Final state:** one Vitest fixture carries the
measured 03.09.2026 timeline — a heartbeat refreshed every ten minutes, ten
stacked waits, an in-flight marker of a dead pid, an ETA 81 minutes past, and no
first-parent commit between 23:05 and 00:52 — and asserts that the composed
decision reaches recovery at or before the stated bound. A second fixture
carries the 17:45–17:47 deadlock and asserts that the committed boundary lets
the turn end. Per the drills rule both call the real recovery path rather than
recreating its aftermath.
