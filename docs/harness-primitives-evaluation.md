# Harness primitives vs. our hand-built batch layer

The user's question of 30.07.2026, in his words: is there not an established
mechanism for token-frugal parallel batch work, rather than reinventing one? The
honest answer has three parts, and this document holds all three, layer by
layer — which of our pieces a harness primitive **replaces**, which we **keep**
and why, and which primitive is **not available to us at all**, checked rather
than assumed.

Two rules govern every verdict below (work-order point 373 d):

- **A piece is kept only with its reason recorded.** "We built it already" is
  not a reason.
- **The decision criterion is the measured one** — the %/h of the weekly quota
  (`node scripts/measure-context-cost.mjs`), not preference. Where a verdict
  below cannot yet be settled by measurement, it says so instead of pretending.

Availability was **probed on 07.08.2026** from a delegated worktree agent in
this container. A harness build can add or withdraw a tool, so every row carries
the command that re-checks it. Re-run the probes before acting on a "not
available" verdict that is more than a few weeks old.

---

## 1. Isolation of parallel agents — REPLACED (and already in use)

Our piece: worktree-isolated subagents, one branch per point (CLAUDE.md §6,
`docs/batch-autonomy.md`).

The primitive: the Agent tool's `isolation: "worktree"` (and `EnterWorktree`)
does exactly this — a temporary git worktree per agent, cleaned up when
unchanged. We do not hand-roll checkouts; the primitive carries it.

Verdict: **replaced, nothing left to build.** The hand-built remainder is
`scripts/worktree-cleanup.mjs`, which exists because the *branch* and its remote
must go with the worktree — a repository-hygiene rule of ours, not an isolation
mechanism.

## 2. The launcher that starts a session at all — KEPT

Our piece: the OS task `HoA-Batch-Autostart` / `scripts/batch-launcher.mjs`,
plus the singleton it wins before spawning.

The primitives: cron-style scheduling (`CronCreate`, the `schedule` and `loop`
skills, `ScheduleWakeup`).

Verdict: **kept**, on the reasons already recorded in
`docs/rule-corpus-audit.md` A31 — a wakeup re-arm only means something inside a
live session's own loop, and a session-scoped cron dies with the session it was
created in. The launcher's whole job begins where no session exists. It also has
to win the `pending-spawn` lock before spawning, which no scheduler knows about.

## 3. A hard output-token ceiling per point — NOT AVAILABLE (checked)

Our gap: nothing caps a point's spend. The point-373 boundary cuts *between*
points; inside a heavy one the context grows unchecked.

The primitive the point names: the Workflow tool's BUDGET, with its
`remaining()` query — precisely the control that was missing on 20.07.2026.

Checked 07.08.2026: **the Workflow tool is not exposed in this environment.**
`ToolSearch "+workflow"` returns no such tool, from a delegated agent whose
`.claude/settings.json` still allowlists the *name* `Workflow` — an allowlist
entry is a permission, not an availability. `docs/rule-corpus-audit.md` A3
independently records the `Workflow`/`opts.model` mechanism as retired.

Verdict: **the gap stays ours.** What stands in for it today is the point
boundary (measured: peak context 650k → 284k median, but only −11 % per active
hour) plus §7 below, which attacks the largest single contributor inside a
point. Re-check with `ToolSearch "+workflow"`; if it returns, its BUDGET is the
first thing to try against the 0.6 %/h ceiling, because it is the only
*hard* limit any layer here could have.

## 4. Resuming a crashed run — KEPT (by necessity, and it is cheaper)

Our piece: `batch-resume-hook.mjs` re-orients a fresh session for ~600 tokens;
rescue commits (`[skip ci]` + `Rescue:` trailer) keep interrupted work durable;
`batch-doctor` remediates the repository.

The primitive: the Workflow tool's run-resume, which replays the unchanged
prefix of agent calls. Unavailable for the same reason as §3.

Verdict: **kept.** Note the shapes differ even if it returns: a replay restores
an *agent call sequence*, while our resume restores a *session's orientation*
from committed state. The second is what a batch that lives in git needs, and it
costs three orders of magnitude less than the "clear the context and re-read the
work order" alternative (`TASKS.md` is ~78k tokens; the resume hook is ~600).

## 5. Watching in-flight work — PARTLY REPLACED, and narrowed

Our piece: the in-flight declaration (`scripts/batch-in-flight*.mjs`) plus
polling an agent's log.

The primitives: background agents notify on completion by themselves, and the
`Monitor` tool streams filtered events from a long-running command.

Verdict: **narrowed, not retired.**

- For "tell me when it is done", the completion notification replaces log
  polling outright — use it, and stop tailing agent output. (Reading a
  subagent's raw transcript file is worse than useless: it is the whole
  conversation.)
- What no primitive answers is the question our declaration exists for: an agent
  that has gone quiet — is it alive? That verdict is drawn from the work's OWN
  output in git (`outputFresh` beats a pid that merely exists), and it must
  survive the death of the session that started the agent. A `Monitor` dies with
  its session; the declaration file outlives it and is what the successor reads.

So: the *wait* is the primitive's, the *survivorship judgement* stays ours.

## 6. Remote execution — CHECKED, and NOT available here

What it would buy: the one layer that survives a dead machine or a dead line —
the residual the user knowingly accepted when he declined a paid API key for the
vacation hardening.

Probe, 07.08.2026: an Agent launched with `isolation: "remote"` **ran locally**.
It reported `Linux …-microsoft-standard-WSL2, x86_64, not remote` on a branch
`worktree-agent-<id>` — i.e. the ordinary local worktree isolation. The gate did
not grant remote execution, and — the part worth remembering — **it did not fail
loudly either**; the call succeeded and silently degraded.

Verdict: **not available; the residual stands.** Two consequences: do not plan a
resilience layer on remote execution without re-probing first, and never infer
from a successful `isolation: "remote"` call that the work is off this machine —
ask the agent where it is (`uname -a`), which is what this probe did.

## 7. The volume of a verify run's output — BUILT (no primitive)

Our gap, and the one both models named in the 30.07.2026 four-eyes review: a
verify run's transcript is the largest single contributor to context growth
*inside* a point. `run-all.mjs` prints one line per suite while it is green, but
on a red one it echoes the whole captured output — the entire vitest dump, the
entire build error — and a background run pays for that again on every poll.

No harness primitive addresses this: the Bash tool streams what a command
prints, and that is its job.

Verdict: **built** — `scripts/verify/run-logged.mjs` writes the run's whole
output to `local/verify-logs/` and hands the caller the structured lines plus, on
a failure, the failing units by name and a bounded raw tail; `--show` reads a
window back. `npm test`, `npm run test:small` and `npm run test:large` go through
it; `npm run test:e2e` is the unwrapped path. Measured on a red unit run
(07.08.2026): 476 lines / 30 542 chars → 66 lines / 3 782 chars, of which 15
lines arrive during the run — every failing test still named. The output is
bounded, so the factor grows with the run. See `scripts/verify/README.md`.

## 8. The policy layer — KEPT, and no primitive claims it

The singleton across OS-started sessions, the work order and its guards, the
board, the repository doctor, the chat channel. These encode *this project's
rules* — what may end a turn, what may be merged, what the user is told — not
orchestration. A harness primitive that replaced them would have to know the
rules, and none does.

Verdict: **kept**, and this is the one class where "we built it already" is
beside the point: nothing else was ever going to.

---

## What is still open after this evaluation

- The %/h criterion is **not met** and this document does not meet it: it
  removes no layer that costs tokens per hour. The remaining candidates are
  point 373's (a)/(b)/(c) — a boundary at a bundle member, delegating the
  reading-heavy part of a point, an explicit per-point budget — to be picked by
  measurement.
- A **full-day %/h re-measurement** after §7 is in use is a later observation,
  not something this pass could produce; recompute with
  `node scripts/measure-context-cost.mjs`.
