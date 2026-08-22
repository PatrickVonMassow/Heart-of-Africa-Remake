# Proposal A — Fable 5, written 13.08.2026 before seeing any other proposal

## A1. The two goals are not in conflict; the coupling is an artefact
The handover does not wait on agents because the successor lacks INFORMATION — the in-flight
declaration already names branch, worktree, pid and log, and every agent commits and pushes to
its own branch. It waits because a delegated agent is an in-process CHILD of the session: ending
the session kills it and destroys its uncommitted work. The conflict is process parentage, not a
trade-off between throughput and context.

## A2. Evidence that the coupling is breakable
The Sol authoring lane (scripts/author-sol.mjs) runs the codex CLI DETACHED, in its own worktree,
committing at every step. Measured 13.08.2026: it ran through the supervising session's landing of
another point, through a board rebuild and through a failed boundary attempt, and would have
survived that session's death.

## A3. The mechanism: make delegated work ADOPTABLE, not OWNED
1. Delegated authoring runs as a detached process (the author-sol shape), never as an in-process
   subagent, whenever the point is authored rather than judged.
2. The in-flight declaration becomes the ADOPTION RECORD: the successor reads it and takes over
   supervision. It already carries everything needed; what is missing is that nothing tells the
   successor "this is yours now".
3. The handover condition changes from "no agent in flight" to "the point I was LANDING is
   landed". Running authors are handed on, not waited out.

## A4. What the successor must be able to do that it cannot today
Resume supervision of a process it did not spawn: notice completion without a harness
notification (poll the log/branch tip through the existing probe), and hand findings back for a
second leg. Today only the spawning session gets the completion signal.

## A5. Failure modes and how each is made loud
- An adopted run dies unnoticed: the in-flight probe already expires when the named work stops
  moving; expiry must alert rather than merely unblock.
- Two sessions adopt the same run: the batch lock plus the fence already serialise ownership.
- A detached run outlives its point (nobody lands it): the board's now-card and the ETA rule
  make an unattended run visible to the reader.

## A6. What I would NOT do
- Not raise the pool cap. The binding constraint is LANDING throughput (30-90 min per point in
  the main session today), not authoring slots; more parallel authors only queue at the same door.
- Not let the session refill slots to stay busy — that is the branch of the dilemma that grows
  context for no throughput.
- Not move picture judgment or landing out of the main session; they are the serial duties that
  define it.

## A7. The second, larger driver, which the stated problem understates
The main session's context grows mostly from HARVESTING and BOOKKEEPING — reading diffs, running
gates, guard remedies, board work — not from spawning. Measured today: the review of one point
plus guard loops dominated the session. Therefore also split the ROLES: a short-lived dispatcher
that only spawns, and a lander that only reviews and lands one point, so neither carries the
other's history.

## A8. How it is measured
`scripts/measure-context-cost.mjs` over a full day, in both scopes: median main-session context
at handover, and the share of spend above 150k context (the figure that motivated the boundary,
87-94 %). Success is that figure falling while the number of points landed per day does not.
