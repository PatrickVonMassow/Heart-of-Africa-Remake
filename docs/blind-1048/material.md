# Blind-parallel material — work-order point 1048

Both halves of the blind-parallel stage received EXACTLY this input and nothing
else. Neither half saw the other's answer before it was committed.

## The question put to both halves

> You are ONE HALF of a blind-parallel four-eyes analysis: write your own
> independent root-cause analysis and solution proposal, without knowing what
> the other half writes. A third model will merge both lists entry by entry, so
> deliver a NUMBERED LIST of discrete, independently mergeable entries — each
> with a short id-like title, the root cause, the concrete proposed mechanism
> (which file/decision core it lands in, what it measures, what it does), and
> how it is unit-testable.
>
> Cover at minimum, each as its own entry:
> 1. the self-matching watcher pattern (`pgrep -f` whose own command line
>    contains the pattern, so the loop can never terminate);
> 2. unbounded stacking of background watcher shells across wake-ups;
> 3. heartbeat freshness read as liveness while no batch progress happens
>    (the launcher's `skip: owner alive`);
> 4. the launcher's warn-only overdue now-card ETA (81+ min past, never
>    escalated to action);
> 5. a stale `.claude/batch-in-flight.json` naming a pid dead for hours, which
>    keeps "a verification is running" plausible indefinitely;
> 6. the SECOND wedge shape: guard pairs that jointly demand and forbid the
>    same action — after `batch-boundary --commit` the boundary refuses every
>    tool call including the prescribed wait, while `ci-status-guard` refuses
>    every turn end until the pushed ref's CI concludes and prescribes exactly
>    that refused wait, so the session can neither work nor stop;
> 7. the boundary marker being invalidated by the first later mutation,
>    silently re-opening a handed-over batch.
>
> Key the recovery on OBSERVABLE PROGRESS rather than liveness: state a bounded
> recovery time and how it is enforced without a human. The user is away for
> days; the batch may never stand still. Build on the attached decision cores
> rather than replacing them.

## The files handed to both halves

- `docs/blind-1048/point.txt` — the verbatim work-order point
- `scripts/batch-emergency-core.mjs`
- `scripts/batch-standstill-core.mjs`
- `scripts/launcher-stall-core.mjs`
- the `skip: owner alive` region of `scripts/batch-autostart.mjs`
- `scripts/verify/run-wait.mjs`

## The two halves

- A — Claude Opus 5: `docs/four-eyes/1048-blind-a-opus5.md` / `.json`
- B — GPT-5.6 Sol: `docs/four-eyes/1048-blind-b-sol.md` / `.json`
- merge — `docs/four-eyes/1048-union.json`
