# The batch must not be able to stand still

Design document, 30.07.2026. Written after an unattended night produced nothing:
work stopped at 21:50 and the state at 04:19 was byte-for-byte what it had been
six hours earlier. The user's instruction that day was explicit — preventing this
reliably outranks batch progress.

This document is the ANALYSIS and the DESIGN. The build is work-order point 434,
except layer 2, which is point 433 and already in flight.

---

## 1. What actually happened, in order

| # | Failure | Why nothing caught it |
|---|---|---|
| A | Both delegated agents died on a server-side HTTP 500 | Nothing retried them. A dead child was reported to the parent and that was the end of it. |
| B | The environment's permission classifier went down; the owning session could not execute a single command | A session in this state cannot heal itself — it is waiting on a call that never returns. It had not crashed, so no crash handler applied. |
| C | The launcher concluded "WEDGED owner" eight times over two hours and only logged it | The verdict carried no authority. Detection was never the gap. |
| D | Before that, 221 minutes of silence read as "owner alive" | `WEDGED_MS` is four hours — longer than the unattended stretch it would have to save. |
| E | The in-flight declaration expired during the night | Expiry meant "the stop is no longer excused", which matters only to a session that is still taking turns. Nothing else followed. |
| F | One notification went out at 00:06 and was never repeated or escalated | A single message to a sleeping user is indistinguishable from silence. |
| G | The lock stayed held the whole time | It is a lock with an owner, not a lease with an expiry: releasing it requires somebody to decide, and the only two candidates were the wedged session and a launcher without authority. |

**The pattern behind A–G:** every layer could OBSERVE the failure and none could
ACT on it. That is the expensive kind, because an observation that is written down
feels like protection.

## 2. What the established practice does about it

Researched 30.07.2026; sources at the end. Five patterns are directly applicable.

**Leases instead of locks.** A lease is a time-bound grant that the holder must
keep renewing; when the holder crashes or *pauses*, the lease simply expires and
another node may take over. Nobody has to conclude anything — expiry is not a
judgement, it is arithmetic. Because a paused holder can wake up and still try to
write, leases are paired with **fencing tokens**: a monotonically increasing number
that the resource checks, so a stale holder's late write is refused rather than
racing.

**Heartbeat and progress are different signals.** A heartbeat proves the process
exists. It does not prove the work advances — the documented hard case is the agent
that "keeps running and spending tokens but makes no progress, looking normal from
the outside even as the heartbeat fires and API calls succeed". Liveness therefore
has to be judged on OUTPUT, not on a timestamp a hook writes.

**Supervision with authority.** Supervisor patterns auto-restart crashed children
and *recycle* stuck ones; the watchdog force-restarts a session rather than
reporting it. The buddy variant gives each worker a peer that watches its
heartbeat, attempts soft recovery, then escalates.

**Dead man's switch.** An EXTERNAL service expects a check-in and alerts when it
fails to arrive. Its value is precisely the failure mode local monitoring cannot
see: the job that never ran, and the monitor that died with it.

**Federation against the single watcher.** One watching node is itself a single
point of failure — "silence looks the same as death". The answer is peers that
watch each other and broadcast, not a bigger single watcher.

## 3. The design: five independent layers

Independence is the requirement, not thoroughness. Layers that share a code path
fail together, and this night failed with a launcher that was running perfectly.

### Layer 1 — the lock becomes a lease (removes G, and most of C and D)

`.claude/batch-lock.json` gains `leaseUntil` and `fence`. The PostToolUse heartbeat
already runs on every tool call and simply extends `leaseUntil` by the lease window.
Once `leaseUntil` is in the past, the lock is FREE — no probe, no verdict, no
authority needed; the existing atomic acquire is the only door and it now also
opens for an expired lease.

`fence` increments on every acquisition. Every write that matters — a lock renewal,
a boundary, a handover — carries the fence it was written under and is refused if
the current fence is higher. That is what makes it safe for a wedged session to
wake up hours later: it can no longer act as the owner, and it finds out at its
next hook instead of corrupting the state.

**Window:** long enough that a legitimate long-running step never loses the batch,
short enough to save a night. Measure the real gap between two tool calls across
the transcript corpus and set the window well above its 99th percentile — and note
that a declared in-flight wait (a verification, a delegated agent) EXTENDS the lease
as long as the declared work itself is provably moving. A verification must never be
shot in the back.

### Layer 2 — the launcher may act (point 433, in flight)

The place that already reaches the "wedged" verdict gets the authority to take the
lease and spawn the successor, the threshold comes down, and a repeated verdict
escalates instead of repeating. Layer 1 makes this cheap: the launcher no longer
has to *judge* wedgedness, it just finds an expired lease.

### Layer 3 — a second, independent watcher (removes C's single-watcher risk)

A separate scheduled task — not the launcher, not sharing its decision core —
whose only job is: *did the repository move?* It judges on OUTPUT, per §2: a new
commit, a board publish, a boundary entry. If none of those changed within its
window while a lease is held, it releases the lease and triggers a successor, and
it says so in its own log.

Two watchers with the same authority need a tie-break, and the fence provides it:
whoever acquires first raises it, the loser sees the higher fence and stands down.

### Layer 4 — a dead man's switch outside this machine (removes F)

The batch checks in to an external heartbeat monitor after every closed point and
at least every N minutes. If the check-in stops, the EXTERNAL service alerts —
which is the only layer that survives the machine being off, the launcher being
disabled, and both local watchers dying. The check-in must carry the open-point
count, so a check-in that arrives while nothing progresses is still a failure the
service can see.

Escalation ladder, because one message to a sleeping user is silence: local rescue
first, then a notification, then a repeated-verdict escalation with a rising
interval, and finally a paused batch with a board card that tells the morning what
happened.

### Layer 5 — a delegated agent's death is retryable (removes A)

A child that dies on a transient API error is retried by the parent with backoff
and a bounded count, on its existing branch, so the work already committed is the
starting point rather than a loss. Two supports already exist and stay: commit
early and push after every commit, and the rescue commit for what was not yet
committed. What is missing is only the retry itself, plus the rule that a child's
transient death must never be reported as a completed step.

## 4. What must NOT be built

- **No "the owner notices".** The wedged session is definitionally the party that
  cannot notice; every rescue has to come from outside it.
- **No single bigger watchdog.** That is the failure mode of §2's federation note.
- **No shortening that shoots a verification in the back.** A declared, provably
  moving wait extends the lease; only silence expires it.
- **No silent recovery.** Every take-over writes its reason where the morning
  reader will find it: the log, the board, and the notification channel.

## 5. How each layer is proven

Each layer gets a pure decision core plus Vitest, per the project schema, and each
test states the night it would have prevented:

- Lease: an expired lease is takeable by a stranger; a fresh one is not; a renewal
  under a stale fence is refused; a declared moving wait extends it; a declared
  wait whose work is dead does not.
- Second watcher: no repository movement plus a held lease yields RELEASE-AND-SPAWN;
  movement yields skip; a concurrent take by the launcher is lost cleanly on the
  fence.
- Dead man's switch: a missed check-in window produces the outbound alert; a
  check-in carrying an unchanged open-point count over N windows escalates.
- Retry: a transient child death retries with backoff up to the cap; a
  non-transient one does not; the retry starts from the child's existing branch;
  the cap being reached escalates rather than passing silently.

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
