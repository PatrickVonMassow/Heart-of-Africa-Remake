# Point 947 — identical input for the blind-parallel standstill sweep

Both halves of the four-eyes stage receive THIS FILE and nothing else. Neither half
sees the other's list. A third model merges them through `scripts/blind-merge.mjs`
and counts every entry exactly once (CLAUDE.md §6, divergent mode).

Assembled 26.08.2026 from the measured record: `.claude/batch-activity.jsonl`, the
work order, `docs/batch-autonomy.md`, and the four incidents below, each of which
was measured rather than inferred.

## The question, exactly

> Enumerate every state in which the batch STANDS STILL although workable points
> exist. For each: name the mechanism, the file it lives in, the precise condition
> that produces the standstill, and either its fix or an explicit classification as
> an insurmountable blocker.

The user's order of 26.08.2026, ~17:05, verbatim:

> "Es darf niemals vorkommen, dass die Batch einfach anhält - es sei denn, es ist ein
> absolut unlösbares Problem, das sich auch nicht zurückstellen lässt (z. B. indem
> stattdessen mit einem anderen Task weiter gemacht wird). […] Reihe hinter 935 einen
> Punkt ein, der gründlich, mit vier Augen blind voneinander analysiert, ob es noch
> ähnliche Fälle geben kann und wie man diese sicher behebt. Ziehe in Erwägung,
> zusätzlich zu den Mechanismen, die das sichern, Fallback-Mechanismen einzuführen,
> die unvorhergesehene Fälle behandeln, sodass es doppelte Sicherheit gibt, dass die
> Batch auf jeden Fall weiter läuft."

An ACCEPTABLE stop is only a truly insurmountable blocker that cannot be deferred —
the standing example is "no acceptable serving model available". Everything else,
including a single stuck point, is NOT an acceptable stop: the batch defers that
point and takes another.

## The four measured incidents this sweep must cover

1. **The launcher started the owner session inside a point WORKTREE** (point 944).
   The board bookkeeping split between the worktree and the main checkout, and the
   session died of it. Related standing rule: memory `session-cwd-stays-in-main-tree`.

2. **A dead owner beside a LIVE delegate wedged resurrection** (point 945). The
   protection rule for running delegates read the delegate's normal progress as a
   foreign live writer and refused every resurrection, while the watchdog counted the
   SAME refusal ticks as "started without progress" and pulled the runaway pause at
   three. After the pause expired the identical loop ran again. Two hours of
   standstill; only the user noticed.

3. **The board-first wedge after a landing** (point 937, extended 26.08.2026).
   `land-point` ran merge, gate, tick, archive and push, then failed at its `board`
   step because the publish refused a focus naming the point its own tick had just
   closed. The repair put the idle card back up, after which `board-first-guard`
   blocked every remaining mutation — including `land-point`'s own cleanup step. The
   documented way out, `board.mjs closing <N>`, is dead: it writes a NUMBERED card and
   the now-projection drops any numbered card whose point is no longer open.

4. **A CI run whose job never STARTED** (point 953). During the GitHub incident of
   26.08.2026 a Pages deploy run concluded `failure` with its build job stuck queued —
   conclusion `null`, zero steps, no runner. `ci-status-guard` hard-blocks the turn end
   on that red, and point 711's retry cannot reach it by design: the retry lives inside
   the deploy job's steps, and a job that never started has no steps.

Two further measured stops from the same day, for the class rather than the instance:

5. **A red vitest type-check on `main`** (point 948) stopped the verify tier at
   `test-types`, so NO point could reach its suites until it was repaired.

6. **A gate whose only documented way out has no command that writes it** (point 942):
   the criticality gate reads a ledger row that nothing in `scripts/` can produce, so an
   honestly-filed refusal must hand-append JSON or stay blocked.

## Where the mechanisms live

The candidate surface, as it stands in the tree today. This is where to look; it is
NOT a claim that each one has a defect, and it is not exhaustive.

- Launcher and supervision: `scripts/batch-autostart.mjs`, `batch-autostart-core.mjs`,
  `batch-launcher.mjs`, `batch-launcher-core.mjs`, `chat-watcher.mjs`,
  `chat-watcher-core.mjs`
- Ownership and liveness: `scripts/batch-lock.mjs`, `batch-claim.mjs`,
  `batch-claim-core.mjs`, `batch-in-flight.mjs`, `batch-in-flight-core.mjs`
- Pause and resume: `scripts/batch-pause.mjs`, `batch-pause-core.mjs`,
  `batch-resume-hook.mjs`, `batch-resume-hook-core.mjs`, `batch-doctor.mjs`
- The point boundary: `scripts/batch-boundary.mjs`, `batch-boundary-core.mjs`,
  `batch-boundary-plane.mjs`
- Turn-end and action gates: `scripts/batch-progress-guard.mjs`, `board-first-guard.mjs`,
  `ci-status-guard.mjs`, `closing-guard.mjs`, `render-verify-guard.mjs`,
  `branch-hygiene-guard.mjs`, `criticality-review-guard.mjs`, `findings-guard.mjs`,
  `commission-guard.mjs`, `clear-claim-guard.mjs`, `prep-guard`, `dashboard-guard.mjs`
- Routing and model policy: `scripts/author-routing-core.mjs`, `fable-switch.mjs`,
  `sol-share.mjs`, `model-guard.mjs`
- The written inventory of the mechanisms and their intended composition:
  `docs/batch-autonomy.md` (§ "The layered mechanisms", § "Failure-mode table",
  § "Every park carries a restart clock").

## What the answer must look like

A list. Each entry is one line, with a stable id, the file the entry is about, and one
sentence naming the defect or the required final state:

    A1 | scripts/batch-autostart.mjs | <one line: the exact condition that stands the batch still, or the final state required>

Rules for the list:

- One STATE per entry. If a mechanism can stand the batch still in two distinct ways,
  that is two entries.
- Name the CONDITION, not the symptom: what has to be true for the refusal to persist.
- A pair of mechanisms that only wedges IN COMBINATION is its own entry, and names both.
- Where the honest answer is "this is an insurmountable blocker", say so explicitly and
  say why deferring the point does not help — an unexamined stop is not a blocker.
- Do not propose the double-safety lane's design here; that is the point's second half.
  An entry may note what a fallback would have to observe to catch its case.
