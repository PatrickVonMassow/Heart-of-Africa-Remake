# The batch must not be able to stand still

Design document, 30.07.2026, second revision — the first was reviewed by the other
model against the code and the logs and came back GO-WITH-CHANGES with two new
failures, one self-contradiction and one hole in the central promise. All of it is
folded in below; the review's own verdict is recorded in
`.claude/mechanism-reviews.jsonl`.

Written after an unattended night produced nothing: work stopped at 21:50 and the
state at 04:19 was byte-for-byte what it had been six hours earlier. The user's
instruction that day was explicit — preventing this reliably outranks batch
progress.

The build order is work-order point 434, except layer 2, which is point 433.

---

## 1. What actually happened, in order

| # | Failure | Why nothing caught it |
|---|---|---|
| A | Both delegated agents died on a server-side HTTP 500 | Nothing retried them. A dead child was reported to the parent and that was the end of it. |
| B | The environment's permission classifier went down; the owning session could not execute a single command | A session in this state cannot heal itself — it waits on a call that never returns. It had not crashed, so no crash path applied. **No layer below heals this by itself; see §4.** |
| C | The launcher concluded "WEDGED owner" **nine** times over two hours and acted on none | Its authority is real but NARROW: `wedgeAction` may kill and take over only its OWN spawn (`batch-singleton.mjs:470–483`). The night's owner was started by hand, so `isOwnSpawn` was false and the verdict fell through to a log line. The gap is the CONDITION, not the absence of power. |
| D | Before that, 221 minutes of silence read as "owner alive" | `WEDGED_MS` is four hours (`batch-singleton.mjs:60`) — longer than the unattended stretch it would have to save. |
| E | The in-flight declaration expired during the night | Expiry means "the stop is no longer excused", which matters only to a session still taking turns. Nothing else followed. |
| F | One notification went out at 00:06 and was never repeated or escalated | A single message to a sleeping user is indistinguishable from silence. |
| G | The lock stayed held the whole time | It is a lock with an owner, not a lease with an expiry: releasing it requires somebody to decide, and the only candidates were the wedged session and a launcher whose authority did not reach it. |
| H | At 02:21 the owner CAME BACK — "fresh-heartbeat, 0 min old" — and still produced nothing until 04:19 | The heartbeat proves the process lives, not that work advances. This is §2's documented hard case, live in the same night, and it is exactly what a heartbeat-renewed lease cannot see. |
| I | The launcher log ENDS at 02:21; no further tick, not even the line a paused batch would write | The entire local watcher infrastructure can fall silent as a unit — standby, a disabled task, a dead launcher. Root cause still open, and it is the empirical reason layer 3 may not live on this machine. |

**The pattern behind A–I:** every layer could OBSERVE the stall and none could ACT
on it — and where authority existed, a condition kept it from reaching. An
observation that is written down feels like protection, which is what makes this
the expensive kind of failure.

**Still to root-cause before the build is frozen:** why H produced nothing after
waking, and why the log stops at I.

## 2. What the established practice does about it

Researched 30.07.2026; sources at the end.

**Leases instead of locks.** A lease is a time-bound grant the holder must keep
renewing; when the holder crashes or *pauses*, it expires and another node may take
over. Nobody concludes anything — expiry is arithmetic. Because a paused holder can
wake and still write, leases are paired with **fencing tokens**: a monotonically
increasing number the resource checks, so a stale holder's late write is refused
rather than racing.

**Heartbeat and progress are different signals.** A heartbeat proves the process
exists. The documented hard case is the worker that "keeps running and spending
tokens but makes no progress, looking normal from the outside even as the heartbeat
fires and API calls succeed". Failure H is that case. Liveness must therefore be
judged on OUTPUT.

**Supervision with authority**, **dead man's switch** (an EXTERNAL service that
expects a check-in and alerts on its absence — it catches the job that never ran
and the monitor that died with it), and **federation against the single watcher**
("silence looks the same as death" on one node).

## 3. The design

Independence is the requirement, not thoroughness: this night failed with a
launcher that was running perfectly, and failure I shows the whole local layer can
go quiet together.

### Layer 1 — the lock becomes a lease

`.claude/batch-lock.json` gains `leaseUntil`. **Renewal happens in PreToolUse, not
PostToolUse.** The existing heartbeat fires *after* a call returns, so a lease
renewed by it must outlive the longest single call — and this repo legitimately runs
30–40 minute suites and has recorded 87 minutes of silence with work advancing. A
window sized for that is no better than today's four hours. Extending the lease
*before* the long call keeps the window short and the reader side pure; the pattern
already exists here (`withdrawHandover` runs from a PreToolUse hook for the same
reason, `batch-singleton.mjs:1170–1174`).

Consequently there is **no probing at the acquire door**. The first revision said
expiry is arithmetic and, two paragraphs later, that a declared in-flight wait
extends the lease "while the declared work is provably moving" — which puts the
judgement right back in. Declared work extends the lease by writing a longer
`leaseUntil` when it is declared, and the acquirer only compares numbers.

**The fence lives in its own file**, never deleted, monotonic, max-wins,
incremented under the existing reap mutex (`batch-singleton.mjs:804–830`, mkdir-
atomic). It cannot live inside the lock file: `acquire` deletes that file
(`:925`) and a corrupt one reads as null (`:744–748`), so the high-water mark would
be lost exactly when it matters and a fresh start at fence=1 would re-admit the old
owner's writes.

**Where the fence is actually checked.** The lock's own writers are already
sessionId-guarded and need nothing (`heartbeat` `:941`, `markHandover` `:1148`,
`updateOwnLock` `:985`, `withdrawHandover` `:1179`, `clearOwnBoundary` `:1226`).
Neither does `batch-claim` (own expiry plus pid probe) nor the read-only handover
observer. The paths that matter are the ones with NO guard today: the `TASKS.md`
tick and archive move, `git merge`/`push` to main, the board publish, and
`dashboard-state.json` merges (`lock-heartbeat-hook.mjs:111–127`). Those cannot each
check for themselves, so the check goes in **one PreToolUse chokepoint** — the slot
`board-first-guard` already occupies — which refuses every state-changing call from
a session whose fence is stale. Without that chokepoint the fence protects only the
file that was already protected, and the woken owner still pushes to main.

**Standby is the accepted loss case.** All stamps are epoch, so DST is irrelevant
and an NTP step only matters if it exceeds the window. Sleep is the real one: the
wall clock advances, no code runs, and the owner loses the lease through no fault
of its own. The cost is bounded to uncommitted in-context work, which commit-per-
step already keeps small; that is the deal, written down rather than discovered.

**Known blind spot:** a worktree subagent's tool calls run in the parent session and
renew the PARENT's lease. A wedged parent with one ticking background child
therefore never expires — the inverse of this night, and the reason layer 3 judges
repository output instead.

### Layer 2 — the launcher may act (point 433)

The narrow `isOwnSpawn` condition goes: a wedged owner is taken over whoever
started it. The threshold comes down, and a repeated verdict escalates. Layer 1
makes this cheap — the launcher stops judging wedgedness and finds an expired
lease.

**433 also carries the failCount fix from §4**, because without it this layer is
what turns a quiet night into a loud one.

### Layer 3 + 4 — one external watcher, off this machine

The first revision wanted a second local watcher. Failure I kills that: a twin on
the same scheduled-task infrastructure, the same node binary, the same disk and the
same power state dies of the same causes — and that task has already been found
disabled once.

So the question "did the repository move?" leaves the machine. A **GitHub Actions
cron** reads push age against the open-point count (both are in the repo) and posts
to the existing ntfy topic (as an Actions secret, never in the repo) when nothing
has moved. It needs no local infrastructure and survives the machine being off, the
scheduler being dead and standby. Its limits are honest: alert only, and cron jitter
of 15–60 minutes — acceptable for a night watchman.

That same workflow IS the dead man's switch, which resolves the other hole:
**ntfy cannot notice an absence** — it forwards messages, it does not expect them.
Either something expects check-ins (healthchecks.io, ping URL kept beside the
git-ignored ntfy topic, its missed-ping webhook pointed at that topic) or the
watcher computes progress itself from the repo. The second is preferred: it needs no
new service, and the "check-in carries the open-point count" requirement only means
something where somebody evaluates it.

**The external watcher releases and alerts; it never spawns.** One spawner is
enough, and the launcher already owns the debounce state (`autostart-last.json`) that
a second spawner would not see — two spawners produce double boots that then have to
be reaped as rogue.

**BUILT 30.07.2026** as `.github/workflows/batch-watchdog.yml`, and narrower than
this section first proposed: it ALERTS only, it does not release. Releasing from
outside would mean write access to the repository state from a job that cannot see
the fence, which is a second failure mode rather than a second safeguard — the
release stays with layer 2, where the atomic acquire lives. Cadence 30 minutes,
`STALL_MINUTES` 120, both in the workflow's `env`; it dates HEAD and counts the
open points in `TASKS.md`. It also cannot go red, because the morning it was
written the owner's inbox was flooded by 53 failed runs and a watchdog that fails
would add to the noise it exists to cut through.

### Layer 5 — a child's transient death is retryable, an environment outage is not

Transience is an **allowlist**: HTTP 5xx/429/529, ECONNRESET/ETIMEDOUT, the
harness's own "API error" death. A red gate, a guard block or an escalated brief is
never transient, and the default is no retry. At most two retries with backoff, on
the same branch and the same brief revision; if the child committed since its spawn,
the retry prompt says CONTINUE, not repeat.

Three stop conditions, and the first is the lesson of this night: **the same
transient signature across two or more children inside one window is an environment
outage, not bad luck** — pause and report instead of retrying, because both agents
died on the same 500 and two retries each would have bought four more deaths.
Never retry a child that already reported a step complete. And cap the tokens a
single point may consume.

## 4. The hole the review found: failure B is not healed, only made louder

If the lease expires and a successor spawns **into the same broken environment**, it
wedges identically. And the runaway brake does not catch it: `failCount` only rises
when the spawn's pid is GONE (`batch-autostart.mjs:385`), so a chain of
alive-but-wedged successors never reaches it. Point 434 would then convert a silent
night into a loud, token-burning one — the opposite of the goal.

Three parts, and they belong to 433 because that is the layer that spawns:

1. **An environment preflight before the spawn** — can a trivial tool call complete
   at all? A spawn into a refusing environment is not a rescue.
2. **failCount counts the alive-but-wedged successor**: a spawn that lives but does
   not convert the lock or produce a first commit within M minutes counts as a
   failure.
3. **Escalating spawn backoff**, so the ladder rises instead of hammering.

This also answers "the successor runs straight into the same outage".

### Layer 5b — the same rule, applied to children (added 30.07.2026, after breaking it)

While this document was being written, a bundle agent's log fell silent for 59 minutes.
The in-flight declaration reported `evidence-gone: silent for 59 min`, and the agent was
declared dead and replaced. It was alive: its worktree had committed four minutes
earlier, and the branch tip moved one minute before the replacement was spawned. The
successor rebuilt two finished points, and both were about to build a third.

The declaration accepts a worktree, a pid, a branch or a log as evidence and weighs them
equally. A log is the weakest: an agent that works without printing is indistinguishable
from one that died. So where the declared work is an AGENT, git activity in its worktree
or on its branch is the PRIMARY evidence, a silent log alone never supports the
conclusion "dead", the probe names which evidence it judged on, and a respawn re-checks
git activity immediately before spawning.

This is §2's heartbeat-versus-progress rule one level down, at the layer that spawns
children rather than sessions — and it was broken by the author of the paragraph that
states it, which is the most honest argument in this document for why the rule needs a
mechanism instead of a reader.

## 5. What must NOT be built

- **No rescue that depends on the wedged session noticing.** It is definitionally
  the party that cannot.
- **No second local watchdog.** Failure I is the counter-evidence.
- **No two spawners.**
- **No window that kills a running verification** — that is what PreToolUse renewal
  is for.
- **No silent recovery.** Every take-over writes its reason where the morning
  reader finds it: log, board, notification.

## 6. What gets demolished when layer 1 lands

Three overlapping liveness verdicts must not coexist, each with its own review and
its own thresholds. Layer 1 replaces: `WORK_STALL_*`, the `wedgeAction` /
`isOwnSpawn` construction, the silence staging, and the four-hour `WEDGED_MS` valve.
The build removes them in the same commit that makes the lease authoritative, or
the next reader inherits three answers to one question.

## 7. Order of the build

1. **Point 433 with §4 folded in** — the smallest delta on code that already works,
   and the threshold alone would have acted at 00:06 instead of never.
2. **The external watcher (layers 3+4 merged)** — the only layer with no shared
   local cause of death, and failure I is its justification.
3. **Layer 1** — the right core, and the largest, riskiest rebuild: fence
   persistence, a window calibrated from the transcript corpus, the chokepoint gate.
   It follows 433 with its own four-eyes review.
4. **Layer 5**, which is independent of all of the above.

## 8. How each layer is proven

Each layer gets a pure decision core plus Vitest, and each case names the night it
would have prevented. Additionally one case per layer proving INDEPENDENCE: the
layer still acts while the other layers' inputs are missing or stale.

- Lease: an expired lease is takeable by a stranger; a fresh one is not; a renewal
  under a stale fence is refused; a PreToolUse renewal covers a call longer than the
  window; a fence file that was deleted does not lower the high-water mark.
- Chokepoint: a stale-fence session is refused a push, a tick, a board publish and a
  dashboard-state merge; a current-fence session is not.
- External watcher: no push movement plus open points yields the alert; movement
  yields silence; it never spawns.
- Spawn safety: a refusing environment preflight blocks the spawn; a live successor
  without lock conversion or a first commit within M raises failCount; backoff rises.
- Retry: a transient death retries with backoff up to the cap; a non-transient one
  does not; two children with the same signature pause the batch instead; a child
  that reported completion is never retried.

## Sources

- [Lease Pattern in Distributed Systems Explained — Ajit Singh](https://singhajit.com/distributed-systems/lease/)
- [How to Detect When Your AI Agent Is Stuck (And What to Do About It) — DEV](https://dev.to/clawgenesis/how-to-detect-when-your-ai-agent-is-stuck-and-what-to-do-about-it-ce9)
- [How AI Agents Handle Stalled Tasks and Timeouts: Lessons From My Production Failure — DEV](https://dev.to/bobrenze/how-ai-agents-handle-stalled-tasks-and-timeouts-lessons-from-my-production-failure-1jj9)
- [AI Agent Self-Healing: Automated Recovery and Resilience Patterns — Zylos Research](https://zylos.ai/research/2026-03-02-ai-agent-self-healing-recovery-patterns/)
- [How to Implement Watchdog Patterns for Field Reliability — Hubble Network](https://hubble.com/community/guides/how-to-implement-watchdog-patterns-for-field-reliability/)
- [Dead man's switch, explained for developers — crontap](https://crontap.com/blog/dead-man-switch-explained-for-developers)
- [How to Set Up Heartbeat and Dead Man's Switch Alerts — OneUptime](https://oneuptime.com/blog/post/2026-02-06-heartbeat-dead-man-switch-opentelemetry-pipeline/view)
- [Posthumous: A Federated Dead Man's Switch — metafunctor](https://metafunctor.com/post/2026-02-14-posthumous/)
- [Never Get Caught Blind: Securing Your Monitoring Stack with a Dead Man Switch — Saifeddine Rajhi](https://seifrajhi.github.io/blog/securing-monitoring-stack-dead-man-switch/)
