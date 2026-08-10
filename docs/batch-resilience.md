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
| I | ~~The launcher log ENDS at 02:21~~ **— WITHDRAWN 30.07.2026, this failure did not happen** | The log ticks every 15 minutes through to 08:36. What ends at 02:21 is the `WEDGED owner` line, because the owner's heartbeat ticked once and the verdict flipped to `skip: owner alive (fresh-heartbeat)`. I is not a second failure; it is H seen from the launcher's side. |

**The pattern behind A–I:** every layer could OBSERVE the stall and none could ACT
on it — and where authority existed, a condition kept it from reaching. An
observation that is written down feels like protection, which is what makes this
the expensive kind of failure.

**Root-caused 30.07.2026.** H is explained as far as the artefacts reach: the
heartbeat ticked sporadically through the dead stretch (0, 15, 30 and 1 minutes
old at successive launcher ticks), so the session was completing SOME calls and
producing nothing — precisely the case a heartbeat-renewed liveness test cannot
see. I was a misreading of the log and is withdrawn above. Nothing further is
recoverable from the artefacts, and the design already assumes this case, so the
build may be frozen.

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
launcher that was running perfectly — it ticked all night and drew the wrong
conclusion from a heartbeat. That is the local layer's real weakness, and no
second local layer fixes it.

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

**One function owns the verdict** (point 612, with point 614's cross-point ruling).
Point 612's idle window and point 517's lease extension pull the SAME `leaseUntil`
arithmetic in opposite directions, so whichever landed second as an independent
patch would silently undo the first. The whole question — does this lock still
belong to its owner, and until when — is therefore answered by `ownershipVerdict`
over `effectiveLeaseUntil` in `scripts/batch-ownership-core.mjs`, and 517's
extension is expressed INSIDE `effectiveLeaseUntil`, never beside it.
`assessOwner` reads the files and the pid probe and asks that one function; only
the pid branches, which are probe semantics, stay with it.

**Two things a live pid may no longer do** (point 612, measured 10.08.2026 —
35 minutes of idle batch in one incident). First, it may not outrank an explicit
HANDOVER: the mark now frees the lock at once, with no grace and without the old
`claimedAt <= handedOverAt` qualifier, because any later write of the lock breaks
that comparison WITHOUT deleting the flag — a late PostToolUse hook is enough — and
the handover then stops counting while it still sits in the file. A handover is
withdrawn by DELETING it, which is an explicit act. Second, it may not stand in for
SESSION liveness: one `claude` process hosts every session of a window (it survives
`/clear`, and `pidStartedAt` records the container process's start), so successive
sessions write the same pid and the pid-alive branch can never observe a dead one.
A session that took the lock and has **not completed one tool call since**
(`claimedAt` still equal to `acquiredAt`), with nothing declared in flight, loses it
after the idle window — five minutes, calibratable via `HOA_IDLE_WINDOW_MIN`. The
rule stops deliberately short of "no state change within the window": a single tool
call runs past five minutes about once in a hundred here and the LARGE regression is
one call of 30–40 minutes, so the broader wording would dispossess working sessions
routinely and spawn a successor beside each — the 24.07.2026 double-spawn as an
everyday event. Nothing is killed either way.

**A state change is the OWNER'S OWN.** The idle window may only be moved by
something the owner wrote — its heartbeat, a commit of its own, a board write
(`ownerActivityAt`) — and never by a file timestamp. The launcher today prints
`declared work advancing — worktree … active 1 min ago (working files|git
metadata)` off mtimes alone, so a leaked dev server or a file watcher touching a
worktree would keep a dead-idle owner "active" for as long as the takeover override
(1 h) or the work-max-age (4 h) allows. `idleVerdict` therefore takes no
"is it advancing?" signal at all, and `ownershipVerdict` reads only `work.declared`
— a declaration the owner wrote — never `work.advancing`. The same three inputs
answer for a takeover CLAIM that reserves the batch without working (point 616),
which is why the function is free of the lock.

**Standby is the accepted loss case.** All stamps are epoch, so DST is irrelevant
and an NTP step only matters if it exceeds the window. Sleep is the real one: the
wall clock advances, no code runs, and the owner loses the lease through no fault
of its own. The cost is bounded to uncommitted in-context work, which commit-per-
step already keeps small; that is the deal, written down rather than discovered.

**Known blind spot:** a worktree subagent's tool calls run in the parent session and
renew the PARENT's lease. A wedged parent with one ticking background child
therefore never expires — the inverse of this night, and the reason layer 3 judges
repository output instead.

**BUILT, 30.07.2026** — `scripts/batch-lease-core.mjs` (pure) plus its I/O in
`batch-singleton.mjs` (`renewLease`, `extendLease`, `grantFence`, `readFence`) and
the chokepoint in `board-first-guard.mjs`. Three decisions the build settled, none
of them free choices:

- **The window is 60 minutes, renewed at most every 5** — so the guaranteed
  coverage is 55. It has to exceed the longest legitimate SINGLE call, because
  renewal happens before the call: the LARGE regression at 30–40 minutes and the
  longest measured undeclared call at 27.8. The demolished valve's 45 could not be
  kept for exactly that reason. The ladder stays monotone: renew 5 < lease 60 <
  the external watcher's 120, and a launcher tick is 15, so recovery lands within
  75 minutes of a standstill instead of never. The rate limit is not a nicety —
  writing this file twice per tool call is what produced five `EPERM … rename
  batch-lock.json` failures on 28.07.2026.
- **A lock without `leaseUntil` carries an implicit one** (`claimedAt + LEASE_MS`),
  so nothing needs a migration step somebody has to remember: the live owner that
  merges the change keeps working and writes a real lease at its next call.
- **Staleness is read from the session's OWN grant**, never from "does not hold the
  lock". A session is fenced out only when it demonstrably held a fence and the
  mark has moved past it; one that never drove the batch has no grant on record and
  can never be blocked. The chokepoint therefore runs BEFORE the ordinary
  `heldByOtherLiveOwner` stand-down — a dispossessed session is not the owner, so
  that exit is precisely the door it would leave by — and it refuses four families
  of call and nothing else. Which call belongs to a family is read through the
  SHARED classifier (`command-classify-core.mjs`, point 473), per segment and on the
  command head: `git log --merges` is not a merge, and a guarded script NAMED inside
  a grep is not that script being run. What CARRIES a command is unwrapped first
  (`expandSegments` — `bash -c "…"`, a combined `-lc`, `eval`, `$( … )`,
  backticks), and a wrapper's own flags, flag VALUES and positionals are stepped
  over (`sudo -u me git push`, `timeout 60 bash -c …`): the old string regexes
  saw through all of that by accident, and losing it would let a dispossessed
  session push through any shell. At THIS gate the conservative direction wins,
  unlike the fail-open idle claim — past the unwrapping depth it REFUSES rather
  than shrugs, because "we stopped reading" is no licence.
  Reads, local commits and its own file work continue,
  and every other guard still stands down for it, so the Stop chain cannot demand
  of it the publish this refuses.

**REVISED 08.08.2026 (point 556) — an expired lease is NECESSARY, NOT SUFFICIENT.**
The paragraph above ("Consequently there is no probing at the acquire door") held
for the door and was wrong for the TICK. Measured 05:45Z: `LEASE EXPIRED: 5551713b…
(pid 4048953) has not renewed for 63 min — taking the batch`, logged while that
owner was alive, mid-verification, with its delegated agent's worktree active — and
the tick printed BOTH corroborating signals in the same breath (`the pid was alive`,
`active 2 min ago (working files)`). Four earlier ticks had skipped on exactly those
signals at 5, 9, 18 and 33 minutes; only the lease branch overrode them. The root
cause is structural, not a threshold: the waiting rule prescribes staying inside ONE
long-blocking call, and a session inside one renews nothing, so obeying the rule
ages its own lease to expiry precisely while it is most productive — the longer the
verification, the surer the dispossession.

Two changes, both in the pure core:

- **The takeover asks the corroborating signals** (`leaseTakeoverDecision`). It
  takes the batch only where the pid is dead or unidentifiable, or the declared work
  is not advancing; a live pid AND advancing declared work make the tick SKIP and
  say which lease age it overrode. A live pid alone is never enough, because a
  wedged process breathes. TWO BOUNDS keep that override from becoming the mirror
  failure — a wedged-but-alive owner holding the batch for ever, which before this
  resolved inside the hour (four-eyes review, confirmed finding 1):
  - it must rest on PRODUCED output. `assessOwnerWork.advancing` is true if any
    answerable item checks out, and a declared `--pid` checks out for merely
    EXISTING — this file's own "a live process (nothing produced), the weakest".
    `judgedOn === 'process'` (or nothing at all) therefore corroborates nothing;
    `git` and `log` do, `log` being what an honest background run declares.
  - it EXPIRES. `TAKEOVER_OVERRIDE_MAX_MS` is one further window, so total silence
    stays inside two hours and the ladder stays monotone (renew 5 < lease 60 <
    override +60 ≤ the external watcher's 120). And the launcher keeps ESCALATING
    while it skips, so the one state where it deliberately declines to act is not
    also the one state nobody is ever told about.
- **Every door reads the corroborated verdict, not just the launcher** (confirmed
  finding 2). Leaving it launcher-deep was its own incident one layer out: in
  exactly the state the launcher protects, `chat-watcher`, `batch-resume-hook` and
  a non-owner's `batch-progress-guard` still read that owner as dead and took the
  batch off it. One gatherer — `scripts/batch-owner-work.mjs` — now fills
  `assessOwner`'s and `acquire`'s `work` at all of them. It lives in its own module
  because the dependency runs the other way (`assessOwnerWork` and the probes sit
  above batch-singleton), and it gathers NOTHING unless the lock is in a state
  where corroboration could change the answer, so the git probes stay off the hook
  path. `batch-claim` is deliberately left out: that is a person taking the batch
  into the window they are sitting at, the manual override the whole mechanism
  serves — and it is the way back a dispossessed session is told to use.
- **A declared wait extends the lease**, which is what this paragraph used to say
  was unbuilt. `batch-in-flight.mjs --waiting-on` now calls `extendLease` for
  `DECLARED_WAIT_LEASE_MS` (4 h, pinned to `LAUNCHER_WORK_MAX_AGE_MS`). Point 556
  offered the alternative of renewing at call START as well as at completion; it was
  REJECTED, and the reason is arithmetic: a renewal buys exactly one `LEASE_MS`
  however often it fires, and the case at issue is a call that never completes. The
  extension records itself on the lock (`declaredWait: { at, until }`) so
  `declaredWaitStale` can end it early when the declaration's own evidence stops
  advancing — the window is bought in advance, not granted unconditionally. That
  early end requires a declaration STILL ON FILE, and the clause is load-bearing:
  without it the same bug returns one step later, when a session whose agent has
  finished starts a 40-minute regression inside one call, has no renewal to write
  (its lease is still the extension) and no declaration left to advance. A wait
  that is over simply stops being conditional; `--clear` drops the marker and
  deliberately leaves the lease where it stands. A wait whose evidence HAS died
  does not dispossess on the spot either (confirmed finding 3): it withdraws the
  extension, and the ordinary lease then runs from the owner's last heartbeat — so
  the session that forgot `--clear` and walked into a NEW long call is judged on
  its own silence, not on the paperwork of a finished wait.

**And the dispossessed owner is TOLD.** A takeover writes `lastTakeover:
{ from, reason }` into the fence file, and the PostToolUse hook injects
`dispossessionNotice` once per fence number, so a session that lost the batch
mid-verification learns it at its very next hook — not at the merge it can no
longer make.

### Layer 2 — the launcher may act (point 433)

The narrow `isOwnSpawn` condition goes: a wedged owner is taken over whoever
started it. The threshold comes down, and a repeated verdict escalates. Layer 1
makes this cheap — the launcher stops judging wedgedness and finds an expired
lease.

**433 also carries the failCount fix from §4**, because without it this layer is
what turns a quiet night into a loud one.

**A release is an EVENT, not a state to be discovered** (point 612). On 10.08.2026
the outgoing session handed over correctly at 13:20 and the lock was released; the
launcher ticks every 15 minutes and would not have looked before 13:31; at 13:28 an
unattended window took the free lock, so the 13:31 tick correctly found a live owner
and spawned nobody. Every part behaved as built and the batch stood still for half
an hour. So the daemon now WATCHES the lock while it sleeps (`ownershipSignal` /
`releaseSpawnDecision` in `batch-launcher-core.mjs`, polled every
`WAKE_POLL_MS` = 5 s) and cuts the sleep short the moment NOBODY OWNS THE BATCH ANY
MORE — the successor starts within seconds. The event is every ownership-ending
transition, not the handover mark alone: an idle lapse and an expired lease end
ownership just as definitively, and a signal hung on the mark would leave exactly
those two waiting out the quarter hour. So the watcher asks `assessOwner` — the same
verdict the tick uses — and one code path decides "ownership just ended". Three
properties keep it safe: it reacts to a CHANGE, never to a standing state, so a lock
that has been free for hours does not tick the launcher four times a minute; `WAKE_MIN_GAP_MS`
floors two early ticks a minute apart, so a tick that cannot spawn (backoff, quota,
preflight) cannot spin; and it SPAWNS NOTHING — all it does is shorten a sleep, so
the tick it brings forward is the same `batch-autostart.mjs` child as ever and the
hard singleton, the claim reservation and the atomic acquire are untouched. The
15-minute tick REMAINS the backstop for everything no signal covers (a killed
session, a missed write, an unreadable lock).

### Layer 3 + 4 — one external watcher, off this machine

The first revision wanted a second local watcher. Two things kill that. It would
share the whole local fate — standby, a dead node, a disabled task, and that
scheduled task HAS been found disabled once — and, more decisively, it would ask
the same question off the same local evidence: this night's launcher was awake
throughout and still concluded "owner alive" from a heartbeat. A twin on the same
scheduled-task infrastructure, the same node binary, the same disk and the same
power state would have concluded the same thing at the same moment.

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

**BUILT 30.07.2026** as a pure decision core plus one command, because the party
that spawns children is the MAIN SESSION and no hook fires when a delegated agent
dies. `scripts/child-retry-core.mjs` decides; `scripts/child-retry.mjs` does the
I/O. **The main session runs it the moment a delegated agent dies, before it
decides anything itself:**

```
node scripts/child-retry.mjs --point <n> --branch <ref> --death "<what the harness said>"
     [--child <agent id>] [--brief-revision <sha>] [--reported-complete] [--tokens <n>]
```

It answers exactly one of four verdicts and never spawns anything:

- **RETRY** — with the backoff to wait out (2 min, then 8 min) and a prompt hint
  that says CONTINUE where the child had already committed and REPEAT where it
  had not. Whether it committed is read from the BRANCH, never from a quiet log,
  which is layer 5b's rule applied at the moment of the retry decision.
  Precisely, the probe counts commits on the branch that are **not yet on
  `main`** (`git rev-list --count main..<branch>`), so a branch already merged
  reads as "nothing to continue" — the right answer for a retry prompt, and the
  reason `--committed` / `--no-committed` can override it. Any git failure
  answers "not committed": evidence that cannot be established never counts as
  established.
- **NO-RETRY** — the default. A death outside the allowlist, a child that
  reported a step complete, a changed branch or brief revision, the second retry
  already spent, or the point's token budget gone.
- **OUTAGE-PAUSE** — two distinct children dead of the same signature inside 15
  minutes. It pauses the batch, writes a German reason into
  `.claude/batch-paused`, files a board card and sends an urgent notification.
  Nothing is retried.
- **STAND-DOWN** — the batch is paused, or this session does not own the lock.
  It records nothing in that case; a session that may not act leaves no
  footprints either.

The exit code is always 0 — the verdict is the output, not the status. An
internal error degrades to "no automatic verdict, decide by hand": fail-open in
the sense that it never traps the session, but deliberately NOT to "retry",
because a retry taken on a decision the code could not make is the exact
retry-into-an-outage this layer exists to prevent. Its runtime state (the outage
window and the per-point retry/token budget) lives in `.claude/resilience/`;
deleting it forgets the window, never work. `--status`, `--complete --point <n>`
and `--forget --point <n>` read and adjust it by hand.

**It is deliberately NOT idempotent per death.** Running the identical command
twice for ONE death books two retries against that point's budget. The command
has a single disciplined caller — the main session, once per dead child — and a
death carries no id the command could deduplicate on without inventing one. The
failure mode is therefore the safe direction: a double-run exhausts the budget
early and stops retrying, it never grants an extra attempt. `--forget --point
<n>` re-opens a budget spent by mistake.

**THE ESCALATION LADDER, the remainder of part (1), built with it** — the
external watchdog of layers 3+4 alerts every 30 minutes and shares its ntfy topic
with the CI-red alert, so a repeated identical alert must not repeat identically.
`scripts/alert-escalation-core.mjs` (pure) and `scripts/alert-escalation.mjs`
(I/O) sit in front of `scripts/notify.mjs`, so EVERY local alert climbs: sent at
once, then not before 15, 30, 60 and 120 minutes, the ntfy priority rising with
the rung — and the LAST RUNG PAUSES THE BATCH with a board card instead of
buzzing a fifth time, which is the whole point: an alert can be slept through, a
paused batch that explains itself cannot. Two alerts count as identical when
their text matches with digit runs collapsed, so the watchdog's rising minute
count is ONE climbing alert while CI-red keeps its own ladder on the shared
topic. Six hours of silence resets a ladder. The ladder may only RAISE a
caller's priority, never lower it — and, per the contract below, it raises only
for an alert that is allowed to reach the pause rung at all.

**THE PAUSE RUNG IS FOR CONDITIONS, NOT FOR EVENTS** — the blocker the four-eyes
review found, and the one thing to understand before adding a caller. The
ladder's premise, "the same alert again means the same condition is still
unanswered", is true of the watchdog, of CI-red and of a wedged owner. It is
false of an EVENT notification: `batch-autostart` posts "Resurrected" on every
successor spawn — the designed healthy flow several times a night — and its text
is identical once digit runs collapse. Simulated at a 45-minute point cadence it
reached the last rung after about five hours and would have paused a perfectly
healthy batch, the exact opposite of this layer's purpose; the six-hour reset
never fires on a busy night. So **the pause rung requires the CALLER's own
declared priority to be `high` or above**. An alert posted at `low`/`default` is
an event: it throttles to at most one every 120 minutes and keeps going out,
never pausing and never falling permanently silent. The gate reads the caller's
priority, never the rung's own raised one, which would defeat it. **A caller's
priority is therefore part of the contract, not decoration** — routine recurring
notifications must not be declared urgent.

**Priority escalation and the pause are ONE ladder**, so an alert that may not
pause does not climb in priority either: below the threshold every rung is
delivered at the caller's own priority. Otherwise the rung-4 "urgent" would have
buzzed the phone for a routine successor spawn every two hours — the same
contract broken from the other side. (Still owed on the caller side, in the file
that owns them: `Resurrected` and `Leaked worker reaped` should also pass
`{ escalate: false }`, since their every occurrence is genuinely news. Until that
lands they are throttled rather than mis-escalated, which is the safe direction.)

**The rung is booked only after the message is actually out.** Booking it before
the POST meant one transient ntfy failure silenced a standing alert for a whole
rung gap — up to two hours — which is the failure `board-watchdog.mjs` documents
guarding against. `escalate()` returns a commit callback; `notify()` calls it on
a confirmed delivery, and an uncommitted send simply re-decides at the same rung
next time. The PAUSE is not deferred: it is the safety action and happens even if
the notification then fails to send.

Two further asymmetries are deliberate. **Fail-open means DELIVER**: an
unreadable ladder file, a clock that jumped backwards or a throw anywhere inside
sends the message unthrottled, because a throttle that swallows an alert is worse
than a duplicate buzz. And **the ladder does not stand down for a non-owner** —
it governs a channel rather than a session's actions, and its principal caller,
the OS launcher, owns no lock and never will; a lock-keyed stand-down would
switch it off precisely in the unattended case it exists for. It does stand down
for an already-paused batch (the pause is a state, not an action to repeat), and
`HOA_ALERT_ESCALATION=off` disables it entirely.

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

And the same mistake sat one layer further in. The worktree probe stat'd four GIT
paths — the gitdir, `index`, `HEAD`, `COMMIT_EDITMSG` — so what it dated was the last
git OPERATION: an agent writing source files for twenty minutes reads as `quiet`, which
is exactly what was measured live while an agent was mid-edit. The contamination ran the
other way too, since a reader's own `git status` in that worktree refreshes the index and
resets the clock. So the probe now also dates the newest WORKING FILE — through `git
--no-optional-locks status --porcelain -z`, which cannot rewrite the index it reads — and
every verdict names WHICH of the two sources answered.

## 5. What must NOT be built

- **No rescue that depends on the wedged session noticing.** It is definitionally
  the party that cannot.
- **No second local watchdog.** It shares the local fate AND the local evidence;
  this night's launcher was awake all night and still read a heartbeat as life.
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

**DONE, 30.07.2026**, in the commit that made the lease authoritative. Gone:
`WORK_STALL_TICKS` / `WORK_STALL_MS` / `WORK_DECLARATION_TOLERANCE_MS` and the
`work-stalled` verdict; `wedgeAction`; `wedgeTakeover` and `acquire`'s `takeWedged`
option; `silenceStage`, `wedgeStage`, `wedgeNotifyDecision` and the two-stage
silent-owner report in the launcher; `WEDGED_MS`, `WEDGE_NOTIFY_MS` and the
`wedged` flag on the assessment; `spawnDecision`'s third outcome `skip-wedged`; and
with the kill-then-take valve, the launcher's `waitForExit`/`sleepSync`.
`assessOwner` no longer takes a `work` argument at all — a declaration is a report
now, never a claim on the batch.

Two things survived, and the reasons are worth keeping:

- **`isOwnSpawn`**, narrowed to what it was always for — the launcher may only KILL
  a process it started itself. Point 433 removed that condition from the TAKEOVER
  and kept it on the kill; the takeover is gone, the kill of a rogue own spawn is
  not, and dropping the check with it would let the launcher end an attended window
  of the user's. It is also what `reapableSpawns` uses to garbage-collect the
  launcher's own spawn records, which is not a liveness verdict about the owner.
- **`verdictRepeat`** (point 433 (c)), re-pointed at the lease verdict and renamed
  at its key helper (`wedgeOwnerKey` → `ownerStateKey`). The failure it answers is
  not the wedge but the REPORT — a launcher that reads the same thing every tick
  and keeps saying it. A takeover that does not resolve the standstill, tick after
  tick, is exactly what a person still needs to hear.

## 7. Order of the build

1. **Point 433 with §4 folded in** — the smallest delta on code that already works,
   and the threshold alone would have acted at 00:06 instead of never.
2. **The external watcher (layers 3+4 merged)** — the only layer with no shared
   local cause of death, and the only one that judges repository OUTPUT rather
   than a heartbeat — which is what failure H defeated.
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
  RENEWAL INTERVAL — the guaranteed cover is `LEASE_MS - LEASE_RENEW_INTERVAL_MS`
  (55 min) and it must exceed the longest legitimate single call (corrected wording,
  30.07.2026: a call longer than the WINDOW does lose the lease, which is the deal
  §3 writes down, not a defect a test could assert away); a fence file that was
  deleted does not lower the high-water mark.
- Takeover (point 556): an expired lease with a LIVE pid and ADVANCING declared work
  yields SKIP, naming the lease age it overrode; expired plus a dead or
  unidentifiable pid yields TAKEOVER; expired plus a live pid whose declared work has
  gone stale yields TAKEOVER; a declared wait covers a call blocking past the lease
  and ends early when its own evidence stops moving. The live proof is on the real
  lock and fence files: a session inside one blocking call 100 minutes long is still
  the owner afterwards (`scripts/batch-singleton-core.test.mjs`).
- Notice (point 556): a takeover records whom it dispossessed and why, and the
  spawned PostToolUse hook delivers that to the fenced session exactly once
  (`scripts/chat-delivery-hook.test.mjs`).
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
