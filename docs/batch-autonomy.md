# Batch autonomy — how the batch keeps making progress, and every way it could stop

Goal: the autonomous TASKS batch keeps working through open points until the batch
is **done** or the user **explicitly pauses** it — surviving idle turns, crashes,
session limits, and reboots. This document is the FULL failure-mode analysis
(instead of patching one hole at a time). It lists every scenario in which
progress could stop, what handles it, and the single residual that is genuinely
outside the agent's control.

## The layered mechanisms

1. **Stop-hook `scripts/batch-progress-guard.mjs`** (per session, loaded at session
   start). While TASKS.md has open, non-deferred points and `.claude/batch-paused`
   is absent, it **hard-blocks the turn from ending** — the agent must continue
   the next item (waiting on a validation by polling within the turn, never by
   yielding to idle). It also refreshes the lock heartbeat (below) each turn-end.
   Since 27.07.2026 it makes ONE exception, the point boundary — see the section
   further down. Fail-open: any error → allow (a guard bug can never freeze the
   session).
2. **Recurring heartbeat cron** (this-session only). Fires every ~15–20 min while
   the REPL is idle and re-invokes the agent. A backstop for a live session whose
   Stop-hook is not yet active (hooks load at the NEXT session start after they are
   added). Dies with the session.
3. **SessionStart hook `scripts/batch-resume-hook.mjs`** (across sessions). When a
   NEW session starts, it claims the batch lock and re-issues the continue
   instruction — so a freshly opened session auto-resumes the batch.
4. **OS Scheduled Task `HoA-Batch-Autostart`** (survives crashes AND reboots). Runs
   `scripts/batch-autostart.mjs` every 15 min (indefinite) with `StartWhenAvailable`.
   The launcher spawns a headless `claude -p` to resume the batch **only** when the
   owner is PROVABLY dead per the hard singleton (`scripts/batch-singleton.mjs`):
   heartbeat AND a real OS pid check — a live claude process blocks takeover no
   matter how stale the heartbeat (a long tool call starves the heartbeat, not the
   process), and a reboot alone is never death while a fresh post-boot heartbeat
   exists. Since 28.07.2026 the owner's DECLARED WORK is a third input: a silent
   session whose delegated agent is still committing reads alive, and only a stall
   — nothing moving for six ticks, with the declaration still the owner's last
   word — reads wedged (see "Liveness is judged by PROGRESS" below). The spawn itself goes through the SAME atomic acquire (a
   `pending-spawn` lock is won BEFORE spawning; losing the race means no spawn).
   Guards: skips while paused, while the batch is complete, and while the owner is
   alive; a debounce marker avoids double-spawns; it finds the newest bundled
   `claude.exe` dynamically (survives app updates). It also THROWS when imported
   rather than run — the whole file executes at module load, so a bare `import()`
   of it (a syntax check, a tooling scan) used to be indistinguishable from
   running it, and once launched a session inside a git worktree.
5. **Message watcher `scripts/chat-watcher.mjs`** (29.07.2026). A long-lived local
   process subscribed to the chat INBOX topic, so a message arriving into an idle
   machine wakes a light responder within seconds instead of waiting for (4). It
   is NOT a second driver: it spawns only with no live owner and no honoured
   claim, files a bounded `batch-claim` for the responder's lifetime, and obeys
   the same pause and format-alarm stops as (4). It gets no scheduler of its own —
   (4) is its supervisor and starts, restarts and stops it. See "The board also
   runs BACK" below.

## Failure-mode table

| # | Scenario (progress could stop) | Handled by | Residual |
|---|---|---|---|
| 1 | Live session ends a turn idle (silent stop) | (1) Stop-hook hard-block | none, once the hook is active (next session start) |
| 2 | Live session, Stop-hook not yet active (added mid-session) | (2) heartbeat cron re-invokes on idle | none (in-session) |
| 3 | Session crashes / is closed, PC stays on | (4) scheduler resurrects ≤15 min | none |
| 4 | API/usage limit reached → session dies | (4) scheduler retries every 15 min; succeeds after the limit resets | slow during the limit window (unavoidable) |
| 5 | Normal reboot, user logs in | (4) task persists + `StartWhenAvailable` + boot-time check → resurrects promptly after login | none beyond the login itself |
| 6 | **Forced Windows-Update reboot** | same as #5: the task survives the update; after the user logs back in it resurrects promptly (boot-time check makes the stale-but-recent lock read as dead) | **the user must log in** — see the one true residual below |
| 7 | Power loss / hard crash | same as #5/#6 (boot-time check) | user login |
| 8 | Two sessions (scheduler + a manually opened one) | the HARD SINGLETON (`scripts/batch-singleton.mjs`, 24.07.2026): atomic test-and-set acquire (exactly one winner, proven by real process races), pid-backed liveness (no false-dead under long tool calls), stand-down gates in EVERY guard for non-owners, and the active parallel-session detector with auto-remediation (launcher kills its own rogue spawn; the owner is blocked into `scripts/batch-doctor.mjs` verification). Full analysis: `docs/batch-singleton-analysis.md` | none — a second session refuses to act even if it exists |
| 9 | A guard has a bug / throws | all guards are **fail-open** (error → allow) so they can never freeze the session; the scheduler still backstops the idle case | none |
| 10 | `claude.exe` moved by an app update | launcher globs `claude-code\*\claude.exe` and picks the newest | none |
| 11 | Batch stuck on one item (needs data / a user decision) | the guard says "pick a DIFFERENT open item"; only if ALL are user-blocked does it pause with a `Von dir zu klären` card | correct behaviour — nothing to do without the user |
| 12 | Scheduled task deleted (by the user or a cleanup tool) | — | not recoverable by the agent; re-create with the command below |
| 13 | Session ENDS at a point boundary (27.07.2026, deliberate — the context is the batch's dominant cost) | (4) the launcher spawns the successor once the old pid is provably dead; `batch-progress-guard` allows the stop only against a verified-closed point AND an armed task | a few idle minutes per point, traded for a fresh context |
| 14 | The scheduled task is DISABLED while the boundary is in use | the guard reads the task's REAL state each time and blocks the stop when it is not armed (`unknown` counts as unarmed), so the session keeps working instead of stranding the batch | the user must re-arm it (`Enable-ScheduledTask`, elevated) |
| 15 | **The RUNTIME kills the session for waiting on a delegated agent** (28.07.2026, four deaths in one afternoon) | the spawn carries `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, so a `claude -p` waits indefinitely for its background tasks instead of terminating at 600 s; what bounds a wait instead is PROGRESS — see the section below | none for a healthy wait; a genuinely frozen one is reported and taken over after six launcher ticks (90 min), and only while the declaration is the owner's last word |
| 16 | The user writes from the phone and NOTHING is running (29.07.2026) | (5) the watcher wakes a light responder within seconds under a bounded claim; if the watcher is itself down, (4) still delivers the message into the next spawn prompt | ≤ 15 min in the watcher-down case — the pre-watcher bound, never worse |

## The hard singleton (24.07.2026 — replaces the advisory lock)

After the e9407cae incident (two sessions drove the batch concurrently; full
root-cause chain in `docs/batch-singleton-analysis.md`), coordination moved
from advisory claim-and-check to a HARD mutual exclusion in
`scripts/batch-singleton.mjs`:

- **Real liveness.** The lock records the owning claude process's OS pid (+
  start time, pid-reuse-proof); dead = provably dead (dead/reused pid,
  heartbeat predating the boot, or a very stale legacy lock). A live pid with a
  stale heartbeat is ALIVE — the old 12-min age window read exactly that state
  as dead and double-spawned.
- **Atomic acquisition.** First claim by exclusive `'wx'` create; takeover of a
  dead lock under an mkdir reap-mutex with re-verification inside — two racing
  starters resolve to exactly one winner (tested with real processes).
- **Stand-down.** Every Stop/prompt guard treats a non-owner as paused
  (`heldByOtherLiveOwner`); the PostToolUse heartbeat refreshes ONLY the
  owner's lock and never claims. A second session refuses to act even if it
  exists. The SessionStart hook prints an explicit STAND-DOWN instruction to a
  losing session.
- **Launcher discipline.** The autostart wins a `pending-spawn` lock BEFORE
  spawning (losing the race = no spawn); the spawned session converts that lock
  to itself pid-bound. The one-shot `autostart-authorized` marker only helps the
  binding — it can no longer override a live lock.
- **Active detector + remediation.** Top-level sessions and per-session tool
  activity are recorded (`sessions-seen.json` / `session-activity.json`);
  a second live top-level session (never a subagent) is detected each turn end
  AND each launcher tick. The launcher kills its own rogue spawn; the owner is
  blocked into `scripts/batch-doctor.mjs`, which verifies the repo (merge
  state, dirty tree, conflict markers, main↔origin divergence, TASKS.md) and
  remediates recoverably (abort half-merge, quarantine stash, rescue branch +
  reset to origin/main), logging everything to `.claude/doctor.log`.
- **The doctor's gate accuses no one it cannot convict (point 431, 29.07.2026).**
  Three times in one afternoon `--gate` declared the repo CONSISTENT and then
  reported the unit suite as broken by "the concurrent writes"; the same suite,
  standalone on the same commit minutes later, was fully green — the gate had been
  competing with a delegated agent's build. So the gate now reads the machine per
  command (the point-296 quiet check, plus a scan for live agent worktrees) and
  `judgeGateRun` grades each red: only a red on a MEASURED-QUIET machine with no
  live worktree keeps the old wording and the stop order, a red under load is
  INCONCLUSIVE — it names what was running and asks for a repeat once the pool is
  idle, exit 0, the batch continues. In the log the evidence-grade red is printed
  FIRST, so a reader sees which verdict counts. An unmeasured machine is not quiet:
  it was believed once already.
- **The demand is satisfied by a state, not by a turn (point 431).** The hook fired
  the ~3-minute gate every turn while the other session merely existed. What is
  judged is the STATE — this HEAD beside these parallel session ids — so a green
  gate records that pair (`satisfiedGate` in `doctor-state.json`) and
  `batch-progress-guard` drops the demand until the head moves or a new session
  appears. Only a judgeable green records it: no `--gate`, a real red, an
  inconclusive red or a pending repair all keep the demand live
  (`shouldRecordSatisfaction`).
- **An alert must name someone ELSE (point 431).** Twice in one evening the hook
  reported "PARALLEL SESSION DETECTED (10a2d2e0…)" — the id of the session reading
  it. The live detector always excluded the owner, but the alert is a FILE: written
  by whoever noticed, read back later. Both the doctor and the guard now run the
  record through `otherSessionsIn`, which drops the reader's and the owner's own
  ids; an alert left naming nobody is discarded (and the doctor logs that it was),
  and the block message names the OTHER session it found. An alert that cannot say
  who else was there is not evidence of anyone else being there.
  Decisions pure in `scripts/batch-doctor-core.mjs`, covered by
  `scripts/batch-doctor-core.test.mjs`.
- **Trust self-heals.** A headless `claude -p` in an untrusted workspace ignores
  the allow-list (a permission prompt would hang the unattended run). The launcher
  sets `hasTrustDialogAccepted` for the repo in `~/.claude.json` before spawning.
- **NOTHING MAY OPEN A CONSOLE WINDOW (point 401, user report 28.07.2026: "es
  poppen immer wieder Konsolenfenster auf, die mir den Fokus stehlen").** On Windows
  a child console process gets a NEW console window unless `CREATE_NO_WINDOW` is
  set, which in Node is `windowsHide: true`. Only 7 script files set it; every member
  of the Stop chain that shells out to git did not — and the Stop chain runs at EVERY
  turn end with several git calls per guard, so a turn ended in dozens of window
  flashes. Two causes, both measured:
  - **Cause 1, fixed:** every child-process call under `scripts/` now sets the flag.
    It is behaviour-neutral — it suppresses a window, not output. Because the fix is
    mechanical, only a gate keeps it: `scripts/window-hide-core.mjs` audits the whole
    script tree (comments and string bodies MASKED, so prose that mentions `spawn`
    cannot match) and `scripts/window-hide-core.test.mjs` FAILS the unit layer on any
    call without the flag — the same shape as the quality-preset completeness gate,
    so a newly added `execFileSync` is caught at once. Its `ALLOW` map holds the
    documented exceptions, each with a written reason, and a stale entry is itself a
    failure: an `awaiting` entry is a debt, and deleting it is how the debt is proven
    paid. Verified as a negative control against the pre-401 tree: 70 offenders
    before, none after. Both kinds of entry have since been settled: the nine files a
    parallel agent held were fixed and their `awaiting` debts deleted, and the one
    genuine exception is written against WHAT the call does (`optionsFrom:
    ['buildSpawnOptions']` — the helper sets the flag itself) rather than which LINE it
    sits on. That change has its own measured reason: the original entry pinned line
    741, an unrelated commit in the same file moved the call to 736 within the hour,
    and the gate went red on correct code while the real rule still held. A line
    number says where a call is; the exemption is about what it does.
  - **Cause 2, ATTENDED and still open:** the `HoA-Batch-Autostart` task runs
    `node.exe` directly with LogonType `Interactive`, so Task Scheduler opens a
    visible console every 15 minutes — ~96 windows a day on its own. The session it
    spawns does not need that console (the spawn already passes `detached: true`,
    `stdio` to a log file and `windowsHide: true`), so the task action must stop being
    a bare `node.exe`: either a hidden-launch wrapper, or the task set to run without
    a visible window. That touches the USER'S machine, not the repository, so it needs
    the user's go for the specific change — and the task's re-enabled state (user
    27.07.2026) must survive it. Until then the 15-minute flash remains, and it is the
    only one left.

## The point boundary — ending a session is now part of the design (27.07.2026)

Until point 373 every mechanism above pushed in ONE direction: keep the session
alive. That was right against the idle stop and wrong against the bill. Measured,
80–94 % of the token spend sat above 150k of context, because one session carried
point after point; run 24/7 that is 1.25 %/h of the weekly quota where ~0.6 %/h is
what fits. The context, not the work, is the dominant cost.

So a batch session now **ends deliberately at a point boundary** and the launcher
(mechanism 4) brings up a fresh one, which `batch-resume-hook` re-orients from
TASKS.md. Nothing new drives the batch — the loop is the one that already existed;
what changed is that ending became a legal way to finish a turn.

How it works:

1. The session merges the point, ticks it on `main`, lets any delegated agent pool
   DRAIN (a subagent lives inside the session — ending mid-flight throws its
   unfinished work away, and only its pushed commits survive), and then runs
   `node scripts/batch-boundary.mjs <point>`. That command REFUSES unless the work
   order confirms the point closed and the scheduled task is armed, so the session
   finds out at the boundary rather than at a blocked turn end. On success it
   writes `.claude/batch-boundary.json` (session id + point + timestamp).
2. At the turn end `batch-progress-guard` re-judges the claim itself — the marker
   is a claim, not proof. It ALLOWS the stop only when the point is closed per
   `TASKS.md` + `docs/tasks-archive.md`, the marker is fresh and belongs to this
   session, and `Get-ScheduledTask -TaskName HoA-Batch-Autostart` reports an armed
   state. It then consumes the marker.
3. Anything else blocks exactly as before: a point still open, a stale or foreign
   marker, an unhandled parallel-session alert, an unparseable work order — and,
   the important one, an **unarmed launcher**. A disabled task must never be able
   to turn "end this session" into "end the batch", so `disabled` and `unknown`
   both block and the message names the fix
   (`Enable-ScheduledTask -TaskName 'HoA-Batch-Autostart'`, elevated, by the user).

One decision worth keeping in view: **unknown counts as unarmed.** Erring toward
"keep working" costs context; erring toward "stop" can cost the whole batch. The
asymmetry decides it.

**A TAKEN BOUNDARY IS WITHDRAWN BY WORK — AND A PAGER IS NOT WORK (point 426).** The
marker is withdrawn by any tool call that reads as continuing the batch, which is
correct (working is proof the session is not finished) and is judged by
`handoverSurvivesCall` → `isClosingSetCommand`: the command line is split at its
separators and EVERY segment must be a closing-set script. On 29.07.2026 that cost a
full turn, measured: `node scripts/focus.mjs set … | tail -2` counted as ordinary
work, because `tail` is not a closing script, so the command reported "boundary
recorded", the marker silently vanished, and the next Stop hook demanded the boundary
again with nothing anywhere naming the cause. Two changes, both inside the existing
mechanism:

- **A trailing output pager is tolerated.** `head`, `tail`, `more` and `cat`
  (`OUTPUT_PAGERS`) may TRAIL a closing line without making it ordinary — shortening
  the output is only looking at it. The widening is the narrowest that covers that
  case, because the dangerous direction is a KEPT handover beside real work: a pager
  in the MIDDLE still counts as work (it would hide whatever follows), a pager ALONE
  is not a closing line, and the opaque-segment ban (`$(…)`, backticks, `>`, `<`) is
  untouched — so `| cat > file` and `| tail $(…)` still withdraw.
- **Every marker withdrawal is recorded.** `withdrawHandover` appends `MARKER
  WITHDRAWN for point N by <session> — triggered by <call>` to `.claude/boundary.log`
  (a sibling of the lock, never the repo default), with the call described by
  `describeWithdrawalTrigger`. The write is best-effort and may never break a tool
  call; no marker means no line, since the log records events rather than tool calls.

The standing advice survives the fix as advice rather than as a workaround: take the
boundary as the LAST action of the turn. A `&&` chain or a redirection around it
still withdraws, by design.

Pure logic and its witnesses: `scripts/batch-boundary-core.mjs` +
`scripts/batch-boundary-core.test.mjs` (launcher-state classification, point
closure against the split work order, marker assessment, and the three verdicts
the point names: closed point + armed launcher → allow, work still open → block,
unarmed launcher → block).

## Taking the boundary — the other half (28.07.2026, point 388)

The design above ended at "the stop is permitted", on the reasoning that the old
process dies within minutes and the successor takes over the honest way. On the
first night it was live, that assumption cost five and a half hours: the session
ended its TURN and kept its PROCESS — an interactive window fires no `SessionEnd`,
so `lock-release-hook` never ran — and the launcher, correctly, refused to spawn
beside a live owner. It logged `skip: owner alive` every fifteen minutes, then
`WEDGED owner: pid alive but heartbeat 245 min old`, twenty-one diagnoses without
a consequence. **Permission to stop and the act of handing over are two different
things, and only the first was built.**

Three changes, and none of them loosens the singleton:

1. **The boundary is TAKEN, not offered.** When a point was closed IN THIS
   SESSION and no marker is recorded, `batch-progress-guard` blocks with its own
   verdict (`block-take-boundary`) naming the single command, instead of burying
   it in the general "do not stop" wall. It only ever fires for a tick this
   session made (`tick.at >= lock.acquiredAt`) — otherwise a fresh successor
   would be sent home for its predecessor's point and the batch would ping-pong
   instead of work — and only while the launcher really is armed, so the guard
   can never demand a boundary the CLI would refuse.
   **WHEN IT FALLS DUE IS ASKED BY TIME, NOT BY A COMMIT COUNT (point 399).** The
   question is "was a point ticked within `BOUNDARY_DUE_MS` (90 min)", and it used
   to be answered by `lastWorkOrderTick`, which scans the newest FIVE work-order
   commits. A batch turn routinely appends points: on 28.07.2026 eight append-only
   commits landed after the tick of point 338, the tick fell out of that window, and
   the guard demanded NOTHING for the whole 90 minutes in which it should have been
   demanding the boundary — so the session kept the lock and carried the next point
   in the same context, the exact cost point 373 exists to avoid. The same blind spot
   had already been fixed one layer down, on the handover observer. `gatherBoundary`
   now asks `lastWorkOrderTickSince`: one `git log --since` over the two work-order
   paths, scoped to the same window as the answer, then `git show` only on the
   candidates inside it (capped at `TICK_SCAN_MAX`, since this runs in a Stop hook at
   every turn end). `tickedPointsInDiff` keeps the rule that an archive move is not a
   tick, an unreadable git answers "not due" rather than throwing, and the
   count-limited `lastWorkOrderTick` keeps its shape for any caller that wants the
   most recent closure cheaply — the guard is simply no longer that caller. Measured
   on this repository the day the fix landed: the count-limited scan answered `null`
   while the windowed one found the tick of point 412.
2. **A handover releases the batch — as an annotation, not a release.** At the
   moment the guard ALLOWS the stop, and only there, it marks the lock
   `handedOver` (`markHandover`). `assessOwner` then reads that lock as free, and
   the launcher's next tick spawns the successor even though the pid still lives.
   The three properties that keep the singleton intact:
   - It is written in exactly ONE place, the `allow-boundary` branch, which is
     reached only after a fresh session-bound marker, a point the work order
     confirms closed and an armed launcher. A crash, a wedge or an ordinary turn
     end never reaches it.
   - It is **withdrawn the moment the session goes back to WORK**: `heartbeat()`
     deletes the fields on a tool call, a PreToolUse withdrawal (piggy-backed
     on `board-first-guard`, whose matcher already covers every state-changing
     tool) clears it BEFORE a long call starts, and the UserPromptSubmit hook
     clears it on the user's first word — earlier than any tool call, and it
     arrives even in a turn that never makes one. That matters because sixteen
     Stop hooks run after `batch-progress-guard` and several can block: the
     session's first act after such a block may be one 40-minute verification,
     during which no heartbeat would land (four-eyes review, findings 1 and 4).
   - …but NOT by the work those guards DEMANDED (live finding 2, below): the
     handover and its marker survive a call confined to the CLOSING SET.
   - …and NOT by a call that happened BEFORE the handover was written (point 396,
     measured in `.claude/boundary.log`). Two of the ten boundary attempts on the
     morning of 28.07.2026 were cancelled 117 ms and 154 ms after being written —
     `HANDOVER point 338` at 11:42:00.469Z, `WITHDRAWN point 338` at 11:42:00.586Z,
     and the same shape ten minutes later. No session works again within 117 ms: a
     continuation needs a model round trip. What happened is that the Stop chain
     wrote the handover while the PostToolUse heartbeat of the turn's LAST tool call
     was still in flight, delayed by the same file contention that produced that
     morning's EPERM retries — and the next turn was told to take the boundary
     again, the very loop point 388 was opened on. So `withdrawalIsCausal` decides:
     where the payload carries the call's own timestamp (`hookCallTimestamp`) it is
     compared with `handedOverAt`, and where it does not, a handover younger than
     `HANDOVER_SETTLE_MS` (1 s, `HOA_HANDOVER_SETTLE_MS`) is never withdrawn. The
     MARKER FILE is protected by the same test as the flag — deleting it is what
     forces the re-take — and a late hook does not touch `handedOverAt` forward
     either, so a stream of them cannot keep a handover alive indefinitely. This is
     NOT "ignore withdrawals": a session that genuinely carries on working still
     withdraws its boundary, or the five-and-a-half-hour standstill comes back.
   - While the process is still alive the successor waits `HANDOVER_GRACE_MS`
     (15 minutes, one full launcher tick). A headless `claude -p` exits and is
     taken over at once by the ordinary dead-pid path, so the grace only ever
     costs an interactive window something.
3. **A silent owner is reported, and a deepening silence escalates.** Past a
   calibratable age (`WEDGE_NOTIFY_MS`, `HOA_WEDGE_NOTIFY_MIN` to tune) the
   launcher sends one `high` ntfy notification, and one `urgent` one
   again when the same silence crosses `WEDGED_MS` — keyed on session + pid + the
   heartbeat it fell silent at + the stage, so the same stall is not repeated
   tick after tick, while a deeper or a later one is. One report and then
   permanent silence would repeat the incident's own shape, which was that nobody
   looked.
4. **AND THE VERDICT NOW HAS A CONSEQUENCE (point 433, 30.07.2026).** For one
   night it did not, and the night was lost: at 21:50 both delegated agents died on
   a server-side 500, the environment's permission classifier went down moments
   later, and the owning session could not execute a single command. It had not
   crashed — it stood. From 00:06 the launcher logged the identical line every
   fifteen minutes — "WEDGED owner: pid alive but heartbeat 251 min old", then 266,
   281, 296 … 371 — nine findings over two hours, no successor, no release, nothing.
   A verdict without a consequence is a comment. Four changes, all in the launcher:
   - **The threshold, measured.** `WEDGED_MS` was FOUR HOURS, longer than any
     unattended stretch worth rescuing; it is now **45 minutes**, calibrated against
     the only thing that legitimately starves the heartbeat — one long tool call,
     since the heartbeat is a PostToolUse hook. Measured over this project's 43
     transcripts (32 440 tool calls): p99 8.9 min, p99.9 10.0 min, fifteen calls
     above 15 min; of the ten above 20 min, five were waits on the USER and three
     were declared background waits, so the longest undeclared unattended call was
     27.8 min. `WEDGE_NOTIFY_MS` is now DERIVED as one launcher tick below it, so
     the ladder can never invert.
   - **The launcher acts.** `wedgeTakeover` licenses taking the lock through the
     SAME atomic acquire (`takeWedged`, re-verified inside the reap mutex, so two
     launchers can never both act and an owner that came back to life in the race
     window keeps its lock). Nothing is killed: the wedged process keeps running,
     stops owning the batch, and learns it at its next hook when the guards stand it
     down. The new lock records `takenFromWedged`, so the morning reader sees why.
   - **The own-spawn condition is GONE.** `wedgeAction` could always kill and take
     over — but only the launcher's OWN spawn, and that night's owner had been
     started by hand, so the verdict fell through to a log line. A wedged owner is
     now taken over whoever started it. The reap still needs the stronger
     `work-stalled` finding; age alone may dispossess but never end a process.
   - **Repetition is the signal.** `verdictRepeat` escalates once when the same
     verdict has stood for two ticks and then stops printing it. What reads
     identically nine times is not truer the tenth, only dearer.
   What may NEVER trigger a take: an in-flight declaration merely growing old. A
   declaration whose work still ADVANCES keeps the owner alive-and-not-wedged at any
   age, and `LAUNCHER_WORK_MAX_AGE_MS` was written out as its own four-hour value
   instead of borrowing `WEDGED_MS` precisely so the drop to 45 minutes could not
   turn an expiry into a dispossession. A long verification is not shot in the back.
5. **A spawn into a broken environment is not a rescue (point 433, the hole the
   second model's review found — `docs/batch-resilience.md` §4).** Item 4 alone
   would turn a silent night into a loud one: the successor wedges the same way, and
   the runaway brake never caught it because `failCount` rose only when the spawn's
   pid was GONE — a chain of alive-but-wedged successors burns tokens all night and
   looks busy. Three answers:
   - **A preflight before the spawn** (`judgeSpawnPreflight`): cheap, local probes —
     git answers, the state directory is writable — and a refusal blocks the spawn,
     raises `failCount` and notifies urgently. An INCONCLUSIVE probe never blocks:
     the preflight must not become a new way for the batch to stand still. It cannot
     see a permission service that refuses tool calls INSIDE a session, which is
     exactly what failed that night — that is what the next item is for.
   - **Living is not working** (`judgePreviousSpawn`): a spawn that neither converts
     the lock nor produces a first commit within a calibratable window
     (`SPAWN_PROVE_MS`, 20 min, `HOA_SPAWN_PROVE_MIN`) counts as a FAILURE even
     though its process breathes. Three of those reach the runaway brake, which
     pauses the batch and signals.
   - **The backoff escalates** (`spawnBackoffMs`): the ten-minute debounce doubles
     per recorded failure up to two hours, and falls back to the floor the moment a
     spawn makes progress.

### What the first live run found (28.07.2026)

The mechanism above ran for a morning and produced three boundary stops, none of
which handed anything over. The evidence is in `.claude/boundary.log`; each
finding and its fix:

| # | What the log shows | Why | Fix |
| --- | --- | --- | --- |
| 1 | `FAIL-OPEN: the guard errored and allowed the stop (EPERM … rename batch-lock.json.tmp-<pid> -> batch-lock.json)`, five times | The guard rewrote the lock three times within milliseconds (acquire's heartbeat, an explicit heartbeat, `markHandover`) and a scanner still held the file the previous rename had replaced. The throw escaped into the fail-open catch — with the marker ALREADY consumed | The redundant heartbeat is gone; the write retries over a short backoff (`scripts/atomic-write.mjs`) and stays atomic; `markHandover` reports instead of throwing; the marker is consumed only if the handover landed; and a failure is stated in the same breath as the allow, so a session never stops believing it passed the batch on |
| 2 | `HANDOVER point 378` at 08:56:12, `WITHDRAWN point 378` at 08:56:16 — twice | The Stop chain sent the session back for a timestamp, a review record, a dashboard republish, and each round un-took the handover. A boundary that survives only a turn with nothing left to do is not a mechanism | The withdrawal distinguishes work that CONTINUES the batch from work a Stop guard DEMANDED: a call confined to the CLOSING SET (the board, the review ledger, the work order's own entry, the boundary's own bookkeeping, and the scripts that satisfy those guards) carries the handover AND its marker forward; anything else ends both. Narrow on purpose — an unknown tool, an unparseable command or one non-closing segment in a chain all withdraw (`handoverSurvivesCall`) |
| 3 | `WITHDRAWN point 388 by s1` — `s1` is a TEST session id | The unit suite reached into the live `.claude/`: `withdrawHandover` defaulted its log path to the repo while the test had redirected only the lock. The pre-push gate runs that suite on every push | Every state file is derived from the caller's lock path (`statePathsFor`), so a redirected lock redirects the whole family; a pure test pins that none of them lands in the repository |
| 4 | the marker consumed while the lock kept no flag | Suspected a compaction renaming the session id under the lock. The evidence did NOT support it — the consumed marker proves ownership resolved fine, and #1 explains the state completely | Kept as a HARDENING, not a fix: ownership resolves on the recorded process when the id no longer matches, and re-stamps the lock. It cannot widen — the pid must be our own ancestor with a matching start time, so a second window is still a second window, and an unestablished ancestry falls back to the id |

The marker's lifecycle follows from #2: it is no longer consumed by the stop it
authorises, so a blocked turn end leaves the session something to stop on. What
retires it is the withdrawal, or the session's own `SessionEnd`
(`clearOwnBoundary`) — a successor must never meet a marker naming a point it
did not close.

### The end of an agent's life: ONE cleanup command

A finished agent's worktree is removed with **`node scripts/worktree-cleanup.mjs
<path>`** — never with a bare `git worktree remove`, never with `rm -rf`. Both of
those delete the MAIN tree's `node_modules`, because an agent worktree carries a
JUNCTION to it and the recursive delete follows the link. That happened twice in
one afternoon on 29.07.2026 (two agents, two different removal commands), and
each time the repair was a full `npm install` after `npm run build` reported
`'tsc' is not recognized` and the push gate went red on a state that was fine.
Measured on a throwaway repository the same day: `git worktree remove --force`
with the junction in place destroys the link target; with the junction detached
first it does not.

The script does exactly that, in that order — detach every link inside the tree
(the link goes, its target does not), then hand the removal to git, then prune.
It REFUSES the main checkout, anything git does not know as a worktree, and any
path that is not strictly inside the tree being removed. Why one script rather
than a rule in each agent's prompt: the two damaged runs used two different
commands, and a rule that must be re-obeyed per prompt is the rule that already
failed twice. The regression is `scripts/worktree-cleanup-core.test.mjs`,
including a NEGATIVE CONTROL that reproduces the damage with the bare git command
— without it the positive case would pass with the fix removed.

Should the dependencies go missing anyway, `npm run build` now says so itself
(`scripts/deps-preflight.mjs`): the cause, `npm install` as the repair, and this
script as the prevention.

**Known residuals, named rather than hidden.** A delegated agent still in flight
at a handover can wake the old session after the successor has spawned; its tool
calls withdraw the handover only while it still owns the lock, so the containment
past that point is the parallel-session detector and `batch-doctor`, as for any
rogue window (four-eyes finding 2 — the drain rule stays a rule, not a gate).
During the handover window `heldByOtherLiveOwner` reads false, so a third session
may be conscripted into the batch; that has always been true of a dead lock, and
it is new only in that the previous owner's process may still exist (finding 8).
And for the first time `acquire()` reaps a lock whose owner can still write: a
delayed `heartbeat()` rename can clobber a freshly created pending-spawn lock, a
millisecond-wide race that both traced interleavings self-heal (finding 3).

### Waiting is not idling — declaring work that is in flight (fifth live finding)

The guard can see the work order, the lock and the launcher. It could not see work
the session had **handed out**. On 28.07.2026, with three delegated agents
building and a browser suite occupying the machine, every attempt to end the turn
was met with *"DO NOT STOP THE BATCH — continue the NEXT queue item now"*, eight
times in a row. The queue item could not be continued (the pool was at its cap and
the next item needed the machine the suite was using) and the turn could not end,
so the session wrote eight replies that reached nobody. Its own text names polling
as the sanctioned way to wait, but nothing a polling session does satisfies it.

So the session may now **declare** what it is waiting on, in the shape
`prep-guard --prepped` already uses:

```
node scripts/batch-in-flight.mjs --waiting-on "<what>" \
     [--pid <alive, and the same process>] [--branch <committed to recently>] \
     [--worktree <git-active recently>] [--log <still being written to>]
node scripts/batch-in-flight.mjs --status    # what the Stop hook would decide
node scripts/batch-in-flight.mjs --clear     # the wait is over
```

`batch-progress-guard` then returns `allow-in-flight` instead of
`block-continue`/`block-take-boundary`, and **says in the allow what it is waiting
on** (and in `.claude/boundary.log` as a `WAIT` line), so a later reader of the
transcript can see why the turn ended. It does not touch the lock: a waiting
session is still the working session, the launcher keeps seeing a live owner and
no successor is spawned beside it.

It is deliberately not a way off the block — the five-and-a-half-hour standstill
is what that block exists for. Four properties keep an abandoned wait from
becoming an idle night:

| property | how |
| --- | --- |
| **Evidence, not assertion — and RECENCY, never existence** | Every item is answered by a probe, and every answer must be FRESH. A `pid` must be alive AND have started when the declaration says (`probePid`, compared with `PID_START_TOLERANCE_MS` the way `resolveOwnership` compares the lock's — a reused pid is a stranger). A `branch` counts only while its tip commit is younger than `WORK_FRESH_MS` (15 min); a `worktree` only while git activity in it is (its gitdir's index/HEAD/COMMIT_EDITMSG and the directory's own mtime); a `log` only while it is younger than `LOG_FRESH_MS` (15 min). Windows are overridable per item at the format level (`freshMs`; the CLI has no flag for it). An unknown kind never passes. Declaring is verified up front, so a typo fails at the command, not at a turn end |
| **All of it, not some** | One finished agent ends the declaration. That is the point: the finished agent's work is now the session's next action, and re-declaring the rest is one command |
| **It expires** | `IN_FLIGHT_MAX_AGE_MS` (45 min, `HOA_IN_FLIGHT_MAX_MIN` to tune). Past it the guard blocks exactly as before, whatever the declaration says and however live its evidence looks |
| **Ownership, by the lock's own rules** | Honoured only for the session that holds the batch lock **and** wrote the declaration — resolved by `resolveOwnership`, the same function the lock uses, so a context compaction that mints a new session id keeps it while a genuinely second window fails it. No second notion of liveness was invented for this |
| **The pool runs at its cap, or says why not** (point 427) | Delegation allows THREE concurrent agents, and until now the cap was only an UPPER bound: a session could commission ONE point, declare a wait, break no rule, and leave two slots empty for ninety minutes beside a queue of independent points — which is what the user found and asked about. The wait is now allowed only once the idle slots are accounted for. `gatherSlots` counts the agents the declaration's own evidence SHOWS (`declaredAgentCount` over worktrees and branches), reads the open work order, and asks `slotReasonDecision`. It answers "no reason needed" on its own for every state in which the slots are genuinely unusable — pool at its cap, a queue whose remaining points all touch the running branch's files, `.claude/batch-paused`, a closing freeze (CLAUDE.md §9), recognised from the closing checklist `closing-guard` already records for the CURRENT head (`.claude/closing-state.json`) — writing it is a side effect of DOING the closing, so nothing has to be remembered; `.claude/closing-freeze` stays as a hand-placed override — and otherwise demands `--slots-free "<why>"`. The demand also errs toward silence by construction: a queued point whose spec names NO files is never a candidate, and an unreadable running-file set answers "no demand". It is refused at the declaration as well as at the turn end (`block-slots-free`, wording pinned in `slotsRemedy`), so the session learns at the command rather than at a blocked stop |

What it never overrides: a parallel-session alert (remediation cannot wait on an
agent), an unarmed launcher, or a boundary already taken. A due boundary it does
pass — ending mid-flight would throw the agents' work away — and the allow says so,
naming the point still to be taken once the wait is over.

**Why recency and not existence** (four-eyes review, 28.07.2026 — the one real
"yes" to *can this switch the block off*): this repository carries ~94 `feat/*`
and `worktree-agent-*` branches, many days old, and the guard's block message
steers sessions to exactly the `--branch`/`--worktree` kinds. On bare existence,
naming any of them would have passed the up-front check and every re-proving, held
the full 45 minutes and been renewable with one command — the weak kinds were the
common path, not a corner case. Judged on recency, a quarter of an hour without a
commit or a git operation means the agent is finished, stuck or gone, and in all
three cases the session's next action is to look rather than to keep waiting.

**The residual this used to leave open — now closed from the outside.** Expiry is
measured from the declaration's timestamp and only ever evaluated when the Stop
hook next runs, so the 45 minutes bound how long a declaration is HONOURED, not
how long a session may idle: a session that stops on `allow-in-flight` and is
never re-invoked would sit on the lock exactly as the night of 28.07.2026 did.
Detecting that from OUTSIDE the session was named here as a separate mechanism
with its own risk; it is the one point 402 built, below.

Decision logic: `scripts/batch-in-flight-core.mjs` (pure, dependency-injected,
Vitest-covered in `scripts/batch-in-flight-core.test.mjs`). IO and probes:
`scripts/batch-in-flight.mjs`. The marker is `.claude/batch-in-flight.json`,
derived from the caller's lock path via `statePathsFor`, so a redirected lock
redirects it too (finding 3).

### Liveness is judged by PROGRESS, not by age (28.07.2026, point 402)

The batch sessions of that afternoon were not crashing. `.claude/autostart-run.log`
carries the executioner's own words, four times:

```
Background tasks still running after 600s; terminating.
Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.
```

A print-mode session (`claude -p`, which is how every resurrected worker is
spawned) waits at most ten minutes for its background tasks after its turn ends,
and the runtime then TERMINATES the process. The batch's designed steady state is
"delegate the point to a worktree-isolated agent and wait for it" (CLAUDE.md §6),
and a delegated agent routinely runs longer than that — the point 398 agent took
12.7 minutes. So the session was killed WHILE ITS AGENT WAS STILL BUILDING, every
time the agent was slower than the ceiling. That is the whole of that day's
"frequent session deaths": three takeovers without a handover in
`.claude/autostart.log` (`no owner lock — taking over`), each one a session that
had just been shot, and the `failCount` bumps that followed.

**No fixed time limit.** Any single number is wrong in both directions: long
enough not to shoot a healthy agent is long enough for a hung one to sit
undetected, and short enough to notice a hang is short enough to shoot a healthy
build. The trade-off exists only because the ceiling measures ELAPSED TIME. The
question that separates the two cases is whether the work is still ADVANCING, and
the probes that answer it were already built and tested for the in-flight
declaration above.

1. **The runtime ceiling goes to infinite.** The spawn now carries an environment
   (it carried none at all), with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` — the
   value the runtime's own message documents. Deliberate: the runtime knows
   nothing about the work, so it must not hold the policy. The launcher-scoped
   `HOA_BG_WAIT_CEILING_MS` can put a ceiling back; an inherited value of the
   runtime's own variable cannot, so a stray environment can never silently re-arm
   the kill. Built purely in `scripts/batch-autostart-core.mjs` because the
   launcher itself may never be imported, and pinned in
   `scripts/batch-autostart-core.test.mjs`.
2. **The wait is visible.** A session waiting on an agent POLLS within the turn
   rather than sitting silent — which `batch-progress-guard` already demands, and
   which the resume prompt now says in as many words. Every poll is a tool call
   and every tool call refreshes the heartbeat, so a healthy waiting session never
   looks dead. A SILENT wait is what made a working session indistinguishable from
   a corpse.
3. **The launcher judges progress.** `assessOwner` takes the owner's declared work
   as an input (`assessOwnerWork` in `scripts/batch-in-flight-core.mjs`, wired in
   `scripts/batch-autostart.mjs`): an owner with a silent heartbeat reads
   `work-advancing` — alive, never wedged — while a branch tip, a worktree, a log
   or a pid it declared still shows movement inside its freshness window. Same
   probes, same `checkEvidence`, no second notion of liveness. Two asymmetries
   make it honest: the launcher asks whether ANY declared work is moving (the
   guard asks whether ALL of it is, because a finished agent is the session's next
   action — but one finished agent among three is no reason to shoot the session),
   and evidence recency alone decides "is it moving", so an aged declaration still
   proves progress. A DEAD pid stays dead whatever the evidence says: the process
   checks come first and are untouched.
4. **The only bound left is on stall, not on duration.** When nothing has advanced
   for `WORK_STALL_TICKS` launcher ticks (6 = 90 minutes of complete silence:
   no tool call from the owner AND no declared work moving), `assessOwner` returns
   `work-stalled`. The launcher then sends an urgent ntfy naming what stalled and,
   if the frozen owner is a headless spawn of its OWN making, reaps it and takes
   over in the same tick — after CONFIRMING the exit, because taking the lock
   beside a running process is the e9407cae incident. An interactive window is
   never killed; the user is told instead. A healthy agent, however slow, advances
   something, so a false kill needs the work to be genuinely frozen. Some bound
   must remain (nothing can decide halting), but it now measures the right thing.

**Why 90 minutes and not 30** (four-eyes review, finding 1.1). The heartbeat is a
PostToolUse hook, so ONE long tool call starves it, and the longest LEGITIMATE
silence in this repository is a LARGE browser regression at roughly 30-40 minutes
— which is what `WEDGE_NOTIFY_MS` is calibrated against. A 30-minute stall bound
therefore sat BELOW the documented normal silence, and this verdict can end in a
kill. Six ticks follows the same better-than-2x headroom rule.

Three deliberate narrownesses, so none reads as an oversight.

- **Only a CURRENT declaration may tighten the bound** — but "current" is measured
  with the LAUNCHER's window, `LAUNCHER_WORK_MAX_AGE_MS` (four hours), never with
  the Stop guard's `IN_FLIGHT_MAX_AGE_MS`. Past it a
  declaration still proves progress but no longer licenses the stall verdict, and
  the pre-402 four-hour valve covers the rest exactly as before.
  **This is where the feature was dead code** (second four-eyes review,
  28.07.2026, finding A). The launcher first asked with the guard's 45 minutes,
  and the three constants are then mutually exclusive: the declaration had to be
  older than the 90-minute stall bound and younger than 45 minutes at the same
  moment, and `lastWord` pins the two ages to the SAME number because the declare
  command's own PostToolUse heartbeat lands seconds after `declaration.at`. Driven
  minute by minute over five hours after a total freeze, `work-stalled` never
  fired once; every tick fell through to the four-hour valve. The two questions
  are genuinely different — the guard asks "may a turn end ride on this?", where
  an aged declaration must stop counting, while the launcher asks "is this the
  owner's LAST WORD?", where age is not the disqualifier — and widening the
  launcher's window reopens no idle-night hole, because `lastWord` already
  excludes every session that worked after declaring. The window is four hours —
  written out rather than borrowed from `WEDGED_MS`, which point 433 dropped to 45
  minutes; borrowed, it would have collapsed with it and turned a declaration's
  EXPIRY into a dispossession —
  rather than the bare minimum that makes it non-empty (`WORK_STALL_MS +
  WORK_DECLARATION_TOLERANCE_MS`) because non-empty is not reachable: that value
  opens a band two minutes wide, and the launcher looks once per
  `LAUNCHER_TICK_MS`, so seven schedules in eight would step straight over it.
  `scripts/batch-in-flight-core.test.mjs` drives the real
  `assessOwnerWork` → `assessOwner` pipeline across five hours and asserts that
  every phase of the 15-minute schedule sees the stall — hand-crafted `work`
  objects, which is what the original tests used, cannot witness this.
- **The declaration must be the owner's LAST WORD** (four-eyes review, finding
  1.1). `assessOwner` licenses `work-stalled` only while
  `claimedAt <= declaredAt + WORK_DECLARATION_TOLERANCE_MS` — the same comparison
  the handover rests on, for the same reason: the PostToolUse heartbeat stamps
  `claimedAt` on every tool call, so a heartbeat NEWER than the declaration proves
  the session went on working after declaring. Nothing forces a session to clear a
  declaration when its agent finishes, and the replayed failure was exactly that:
  declare, agent finishes, merge, start `npm run test:large`, and 31 minutes of
  perfectly legitimate silence later a still-current declaration with quiet
  evidence would have been read as a stall and reaped MID-REGRESSION. Such
  leftover paperwork now licenses at most the old four-hour valve.
- **A declaration no probe can answer is treated as no evidence rather than as
  proof**, so an unanswerable kind can neither keep a corpse alive nor be gamed
  into one.

**What may be declared is restricted too** (four-eyes review, finding 1.2).
Recency made existence-only evidence honest, but nothing restricted WHAT could be
named, and some things are eternally fresh by construction: the REPO ROOT as a
`--worktree` (every `git status` the declaring session runs touches its index),
or `main` / the declaring checkout's OWN current branch as a `--branch` (both move
on work that is not the work being waited for). Such a declaration would have held
indefinitely AND suppressed the silent-owner notification — leaving the session
LESS observed than declaring nothing at all. `selfReferentialEvidence` refuses all
three at declaration time, where the mistake is one command away from being fixed.

**And the refusal now sees what was MEANT, not what was typed** (second four-eyes
review, 28.07.2026, finding B). It can only compare names, and the CLI used to
hand it the raw argument: `--worktree .` from the repo root, `<root>/.` and
`<root>/../hoa` all named the checkout itself, while `--branch @` (git's own alias
for HEAD), `--branch heads/main` and `--branch main@{0}` all named things that move
on their own. All of them were driven live and all of them slipped through, then
probed eternally fresh. Two changes close the family rather than the six examples:
the CLI RESOLVES every `--worktree`/`--log` to an absolute path (`absPath`) and
every `--branch` through `git rev-parse --symbolic-full-name` (`resolveRefName`),
and STORES the resolved form — which it should do regardless, because the launcher
probes from its own working directory, not from the one the declaration was
written in. `normRef` keeps a string belt for what git will not resolve (`heads/…`
and a `…@{0}` revision expression have no symbolic name), and `@` joins `main` and
`HEAD` on the always-refused list.
And past the `WEDGED_MS` threshold the launcher notifies REGARDLESS of
whether work is advancing (`silenceStage`), naming the evidence in the message —
notify only, never a kill. The TAKE is the stricter of the two: `wedgeTakeover`
refuses while work advances, so live evidence still protects the owner's lock even
where it no longer buys it silence.

Pinned in `scripts/batch-singleton-core.test.mjs` (a silent heartbeat with a
moving branch reads ALIVE, the same silence with every probe quiet reads WEDGED,
a heartbeat NEWER than the declaration never reaches a kill, a dead or reused pid
stays dead whatever the evidence says, an unanswerable declaration is no evidence,
and with NO declaration the pre-402 verdict is unchanged — plus `isOwnSpawn`,
`silenceStage` and `wedgeAction`, which pin that only a spawn of the launcher's own
making, matched by pid AND start time, is ever killed) and in
`scripts/batch-in-flight-core.test.mjs` (`assessOwnerWork`,
`selfReferentialEvidence`).

### The two costs of switching the ceiling off, and what pays them

Neither is a corner case; both were named by the four-eyes review and both are
handled in `scripts/batch-autostart-core.mjs`.

**A pid is not an identity** (finding 1.3). Every "the launcher may reap a spawn of
its own making" path used to compare `lock.pid === state.lastPid`. `state.lastPid`
persists indefinitely and carries no start time, and Windows recycles pids
aggressively — so a days-old spawn exits, an INTERACTIVE window later inherits that
number and takes the batch lock, and the launcher would have killed the user's own
window. `isOwnSpawn` now demands the pid AND a process start time matching
`state.lastSpawnAt` within `SPAWN_IDENTITY_TOLERANCE_MS`; an unverifiable start
time answers no. Both call sites use it: the wedge reaping and the older
rogue-spawn remediation.

**Waiting forever leaks processes** (finding 1.4). The 600-second ceiling used to
end a `claude -p` whose turn had finished but whose background task never exits —
a dev server left running is routine here. After a handover the launcher
overwrites `state.lastPid`, so nothing tracked those any more, and a leaked
session holds the ports the next session's verify suites need. The launcher
therefore keeps a short LEDGER (`state.spawns`, `recordSpawn`, capped at
`SPAWN_LEDGER_MAX`) of what it spawned and when, and each tick reaps
(`reapableSpawns`) any entry that is alive under the SAME identity, past its
`SPAWN_REAP_MIN_AGE_MS` boot window, not the lock owner nor a pending-spawn's
child, and SUPERSEDED — either another session holds the lock now, or a later
spawn exists. That last clause is what keeps a lock file which merely went missing
from turning a healthy worker into a target.

The sweep runs **before every guard that ends the tick** — the user pause, an
unreadable work order, `open === 0` and an honoured user claim (second four-eyes
review, 28.07.2026, finding C). It sat below them at first, and the guard it sat
below most often is `open === 0`: the FINAL session of a completed batch is
exactly the one whose dev server outlives it, and from the next tick onward the
launcher exited at "batch complete" before ever reading the ledger. The leak the
ledger was built for was the one leak it never reaped. A reason not to SPAWN is
not a reason to leave a process holding ports, and the sweep needs only the state,
the lock and a pid probe. Those early exits therefore write the state back
(`bail`), so a pruned ledger is never lost.

### Observing one handover end to end

Every part of this worked on the night it failed, so the acceptance is not a green
test suite but ONE observed handover. `node scripts/batch-handover-observe.mjs`
(read-only — it writes nothing, touches no lock, starts no session, and is safe
from a worktree) prints the five links with the evidence for each, and exits 0
complete / 1 pending / 2 broken:

| link | proved by | a broken link looks like |
| --- | --- | --- |
| `close` | the point the NEWEST `HANDOVER` line names is closed in the split work order (`closureOf`: gone from `TASKS.md`, ticked in `docs/tasks-archive.md`), with the commit that ticked it printed alongside as evidence where it is still findable — an archive move cancels out and is never a tick | the handed-over point still reads `- [ ] N.`, or there is no handover line to anchor on and no tick either |
| `take` | `.claude/boundary.log`: `HANDOVER point N by <sid>` | no such line — the session stopped without taking the boundary, the failure of 28.07.2026; the guard must have blocked with "TAKE THE POINT BOUNDARY" |
| `spawn` | `.claude/autostart.log`: `launched pid <pid>` after the handover, preceded by `HANDOVER accepted: …` when the process still lived, or by `no owner lock — taking over` on the headless path, where a `claude -p` has already exited and SessionEnd freed the lock | `skip: owner alive` more than one grace window (15 min) after the handover — the handover never reached the lock, or a `WITHDRAWN` line in `boundary.log` says a tool call took it back. A `handover-grace` skip is the mechanism waiting on purpose and never counts. A spawn preceded by `owner provably dead` also counts as broken: the batch continued, but by the old route — the lock EXPIRED rather than being handed over |
| `takeover` | `.claude/batch-lock.json` names a DIFFERENT session, kind `session`, with a heartbeat after the handover | still the old session, or still the launcher's own `pending-spawn` lock, ten minutes after the spawn — the successor never converted it |
| `work` | a commit on `main` after the spawn: the next point's branch or its first atomic commit | nothing committed — the successor stood down (lock) or `batch-resume-hook` never oriented it |

The anchor is the HANDOVER, never "the newest tick": a tick falls out of any log
window behind append-only work-order commits — eight of them buried the tick of
point 338 on 28.07.2026, and a handover that had demonstrably completed read as
"no ticked point found on main" — whereas the closure of the point a handover
names does not expire.

`work` is the one link a machine cannot close: no commit names the session that
wrote it, so the observer prints the commit and the reader confirms the hand.

#### The observed run — 28.07.2026, all five links

The acceptance of point 388, read out of the logs rather than inferred. Point 338
was merged and ticked at 11:12:27Z (`23000d7`); the session then took the boundary
and ended:

| link | evidence, with its time |
| --- | --- |
| `close` | point 338 closed in the work order, ticked 11:12:27Z (`23000d7`) |
| `take` | `boundary.log` 12:34:39.809Z — `HANDOVER point 338 by b1498420-…` |
| `spawn` | `autostart.log` 12:51:15.440Z — `HANDOVER accepted: … spawning the successor`, then `launched pid 32680` |
| `takeover` | `batch-lock.json` held by `5be59bde-…`, kind `session`, pid 32680 |
| `work` | `652a8ba` — the successor's first commit, confirmed by hand |

Two costs the run made visible, both by design rather than defects. The launcher
spent one full `HANDOVER_GRACE_MS` (15 min, 12:34 → 12:51) because the handing-over
process was an interactive window that stays alive; a headless `claude -p` exits
and is taken over at the next tick. And the boundary was taken and withdrawn ten
times between 11:27Z and 12:34Z before one held — eight of those withdrawals were
the session legitimately working on, two were the race recorded as point 396.

The run itself belongs to the MAIN session in the main tree: it needs the live
batch lock, and no worktree agent may take or release it. The natural occasion is
the next point that closes — merge, tick, run `node scripts/batch-boundary.mjs
<point>`, stop, and read the observer afterwards. Nothing about the design forces
the batch to be stopped for the observation; the chain is exactly the ordinary
path through a point boundary.

## The way back — claiming the batch into the window you are sitting at (28.07.2026, point 395)

Everything above is a way OUT: a session ends and something else picks the batch
up. There was no way IN. The user returns to a window that has been silent for
hours, types `/clear`, says "I am back" — and that window resolves as a non-owner
and correctly STANDS DOWN, while the night session keeps the lock and keeps
working. The only move left was to kill the other session's lock by hand
(`batch-singleton.mjs release`), which races whatever it was doing.

So the returning window records a CLAIM, and the owner hands the batch back.

```
node scripts/batch-claim.mjs --session <id>   claim it — or take it, if it is free
node scripts/batch-claim.mjs --status         who holds it, what is pending, how old
node scripts/batch-claim.mjs --withdraw --session <id>    never mind
```

The user says nothing but "I am back"; the session runs the command itself. The
session id is the one thing a CLI cannot look up — it gets no hook payload — so
`batch-resume-hook` PRINTS the whole command with the id already in it at the
moment it stands the session down. That message is what the returning user reads.

The chain, and where each link lives:

| step | who | what happens |
| --- | --- | --- |
| claim | the returning window | `acquire` first: with no live owner the claim is satisfied AT ONCE and the command reports the batch is yours. Otherwise `.claude/batch-claim.json` records `{ sessionId, pid, pidStartedAt, at }` |
| see | the owner's Stop hook | `batch-progress-guard` gathers the claim before the parallel detector and asks `releaseDecision` whether this is a clean moment |
| release | the owner's Stop hook | at a clean moment: `handBackToClaimant` — a real release, not a handover — and ONLY where the release really happened is the claim stamped `releasedAt`; `.claude/boundary.log` gets `RELEASED to <sid> by <sid>`, and the session is told out loud that it is no longer the batch worker. Where the lock did not name this session there is nothing to release, and nothing is stamped: the stamp is a promise to the claiming window and a session that freed nothing must not make it |
| take | the returning window | the SAME command again: `acquire` succeeds and clears the claim. (Its next `SessionStart` does the same thing by itself.) |

**A claim is a REQUEST, never a transfer.** Nothing in it writes the lock:
ownership is still gained only through the atomic `acquire` in
`batch-singleton.mjs`, whose test-and-set is what makes two racing windows resolve
to exactly one owner. A claim can therefore never produce a second driving
session — the failure the whole singleton exists to prevent.

**Four bounds, each measurable rather than a matter of taste.**

1. **It EXPIRES** (`CLAIM_MAX_AGE_MS`, 30 min, `HOA_CLAIM_MAX_MIN`). A claim file
   left by a window that was closed hours ago must never hand the batch to nobody.
2. **The claimant must be ALIVE, by IDENTITY.** The recorded pid must exist AND
   have started when the claim says — a reused pid is a stranger. Same rule
   `checkEvidence` applies to a declared background run; `resolveOwnership`
   answers "is this claim mine", so there is no second notion of liveness beside
   the lock's. That is also what stops a compaction-renamed owner from releasing
   the batch to itself: the owner asks with its own lock's process identity, so
   its own claim reads as its own.
3. **ONE claim at a time.** `claimWriteDecision` refuses a second claim while a
   first is live, so two windows are never both told the batch is coming to them.
4. **The owner releases only at a CLEAN moment.** Never mid-merge, never with a
   delegated agent still building or a verification running. The in-flight
   evidence is the existing one (`assessInFlight().live`) and the git state is
   probed (`MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `REBASE_HEAD`, an
   unmerged index). Anything unclean makes the claim WAIT — it stays pending and
   every block message names it — and it is honoured at the next turn end. The
   git probe has a THIRD answer besides "clean" and a named operation:
   `GIT_STATE_UNVERIFIABLE`, when it could not find out (a timeout under load, a
   git that would not run). It waits too — "I could not look" read as "all clear"
   is exactly the release-mid-merge this bound exists to prevent, and the timid
   direction costs at most one more turn because the claim expires on its own.

Two consequences that are easy to miss and were both built:

- **The claimant is a second live top-level session by DESIGN.** It would trip the
  parallel-session detector, and that block demands the doctor before any further
  batch work — the one thing a handover never gets past. So the owner's guard
  excludes the honoured claimant from `detectParallel`. A session that announced
  itself through the sanctioned channel is not the covert second driver the
  detector was written for; an unannounced one is still flagged exactly as before.
- **A live claim RESERVES the batch.** Once the owner lets go, the lock lies FREE
  until the claiming window runs its next command, and ANY window that reaches an
  acquire in that gap would take it. So all three doors ask
  `reservationDecision` first: `batch-autostart` skips its tick,
  `batch-resume-hook` does not acquire, and the owner's own Stop guard
  (`batch-progress-guard`) does not re-acquire. Without that third one a stood-down
  window would take the freed lock at its next turn end, see the claim, judge the
  moment clean and release again — repeated "handed back" messages and RELEASED
  spam in `boundary.log`. The claimant's OWN claim reserves nothing against itself
  (`assessClaim` answers `mine`, never `honour`), so the window the batch is
  waiting for still acquires; and all three stand-downs are bounded by the same
  expiry, so a claim can never strand the batch.

Where two verdicts are close the mechanism chooses NOT to release: the owner
keeping the batch for one more turn is a nuisance, a merge cut in half is a repair
job.

Decision logic: `scripts/batch-claim-core.mjs` (pure, dependency-injected,
Vitest-covered in `scripts/batch-claim-core.test.mjs`). IO, probes and the CLI:
`scripts/batch-claim.mjs`. The claim file is derived from the caller's lock path
via `statePathsFor`, so a redirected lock redirects it too (finding 3).

The one residual is the same one the in-flight declaration has: the guard only
runs at a TURN END. A session that has stopped and is never re-invoked never sees
the claim — its lock then ages out the honest way, and the claim expires with it.

## The two true residuals (NOT in the agent's control)

1. **Auth needs a logged-in profile.** `claude` needs the user's interactive,
   logged-in Windows profile for its stored authentication. If the user is **not
   logged in** (a forced-update reboot left the machine at the lock screen, or the
   user logged off), no mechanism can run an *authenticated* Claude. It resumes the
   moment the user logs in.

2. **The headless resume is INVISIBLE in the VS Code chat.** The scheduler runs
   `claude -p` in the background — it keeps the batch WORKING (commits pushed to
   GitHub) but does **not** open VS Code or a Claude chat, so the user sees no live
   output there after a reboot. VS Code is not in autostart, and even if it were,
   the extension does not auto-open a resuming chat — there is no CLI/API to trigger
   it. So while the user is away the batch progresses and is visible on **GitHub**;
   the live chat resumes when the user reopens VS Code + a Claude chat (SessionStart
   then resumes visibly). This is a hard limit of an interactive-extension chat, not
   a hole to patch. The BOARD is no longer part of this residual: since point 400 it
   is published by a script, so a headless run updates it like any other session
   (see *The board's transport* below). Only the chat is invisible.

Mitigation, and why it is small in practice: the moment the user logs in, the task
resurrects the batch (promptly, thanks to `StartWhenAvailable` + the boot-time
check). A forced update reboots and then waits at the login screen for the user
anyway; the batch simply resumes when they next log in. To make that resume
**instant on login** (instead of within ~15 min), add an at-logon trigger once,
from an **elevated** PowerShell (modifying the task needs admin rights, which the
agent does not have):

```powershell
$t = New-ScheduledTaskTrigger -AtLogOn
$existing = (Get-ScheduledTask -TaskName "HoA-Batch-Autostart").Triggers
Set-ScheduledTask -TaskName "HoA-Batch-Autostart" -Trigger (@($existing) + $t)
```

## Dashboard currency (enforced, not reminded)

The living progress dashboard must ALWAYS reflect the real batch state — above
all the now-card ("Woran ich gerade arbeite"). Reminders repeatedly failed
(latest: the card still said point 200 while the work had pivoted to 210 after a
user question), so currency is machine-enforced by `scripts/dashboard-guard.mjs`
(Stop hook; decision logic in `dashboard-guard-core.mjs`, Vitest-covered). It
blocks turn-end on nine invariants: registered board, fresh vs HEAD, no ticked
point in the queue, every open point visible, a DECLARED focus
(`scripts/focus.mjs set <N> "<what>"`), now-card title == declared focus, an
acknowledged pivot check after every user prompt (`focus.mjs confirm` — armed
automatically by the UserPromptSubmit hook), a re-affirmation after ~30 min of
tool work, and publish parity (repo file bytes == the content last published, to
the live page or via the Artifact tool — so "edited" can never masquerade as
"live"; the two-file repo/scratchpad split is bridged by
`scripts/dashboard-publish.mjs`).

The standard cycle after any dashboard edit:
`node scripts/board-publish.mjs` (the live page — works in every session) →
`node scripts/dashboard-guard.mjs --synced .batch-dashboard.html` (which doubles
as the focus confirmation when card and focus agree). While the claude.ai mirror
is still kept, `node scripts/dashboard-publish.mjs` → Artifact publish of the
synced scratchpad file (same artifact url) runs alongside it; either publish
satisfies the parity invariant, and each records its own hash. On every work
switch: `node scripts/focus.mjs set <N> "<what>"`. What stays judgment: the
machine verifies the card's POINT NUMBER, publish state and freshness, never the
truth of the prose.

### The board's transport (28.07.2026, point 400)

The board used to be publishable only through the Artifact tool, and the
**headless successor session has none**. On 28.07. at 15:38 one edited the board
and recorded `publishDeferred: "headless successor session — no Artifact tool
available here"` — in the flagship mode (user away, batch resurrected by the
scheduler) the board could not be updated AT ALL, and the user found a board
standing still for over an hour before any guard did. A commit and a push are
things that session has, so the board is published by a script.

| | where | why there |
|---|---|---|
| content | orphan branch `board`, ONE commit, force-updated | not on `main`, so a publish is not a source change: no CI (which watches `main` and `feat/**`), no Pages deploy (which rebuilds the game **and every frozen version tag** — minutes of runner time for a status card). No parent, so the branch never grows |
| reader's URL | `https://patrickvonmassow.github.io/Heart-of-Africa-Remake/board/` | `public/board/index.html`, a source file deployed once with the site by the workflow that already runs. It fetches the content branch at load, so the URL is stable while the content behind it moves without a deploy |
| the check | `https://raw.githubusercontent.com/…/board/board.html` | plain HTTPS, no auth, no tool binding — the verification reads the PAGE, not a record of an attempt |

The board carries its open-point set as a `hoa-board-open` meta, stamped on the
way out (never into the repo file, whose bytes the Artifact mirror attests).
That fingerprint is what a fetched page is compared against.

**The floor of "current".** The push lands in seconds, but raw.githubusercontent
answers with `cache-control: max-age=300`. Every check therefore cache-busts AND
tolerates `LIVE_GRACE_MS` (6 min) of disagreement: a page that differs while the
publish is still settling reports `settling`, not an alarm. Only a page still
behind past the grace — or one that cannot be read at all — is a fault, and an
unreadable page is **never** called current.

    node scripts/board-publish.mjs           # push the board live
    node scripts/board-publish.mjs --check   # fetch the live page and judge it
    node scripts/board-publish.mjs --url     # print the URLs
    node scripts/board-queue.mjs             # rebuild the queue from the work order
    node scripts/board-queue.mjs set <N> "…" # write one queue card's prose

`scripts/board.mjs` runs the publish itself, so the one-command board loop keeps
the live page current without a second step. **The stamp may not lie:** the
publisher REFUSES a board that does not show every open point — the fingerprint
asserts that it does, and a board going live stamped current while a card is
missing is exactly the 28.07. failure, only now with two green checks over it.
That is invariant (4) of the Stop audit applied earlier, like the structure gate
beside it. The way out is the GENERATOR, not a hand edit: `board-queue.mjs`
rebuilds the Warteschlange as a projection of TASKS.md over the prose in
`.claude/board-queue.json`, giving a point nobody has written up yet a stub card
(and the audit accepts that stub's `Schätzung offen` by name, so it cannot
deadlock). `board.mjs queue` is a different command — it MOVES a current-work
card back — and it throws on a point that has no card at all, which is precisely
the case the refusal catches.

The watchdog runs as its own process (`scripts/board-watchdog.mjs`), called by
the launcher. That is not tidiness: on this platform a `process.exit()` after any
`fetch` tears undici's socket down mid-close and ABORTS the process
(`UV_HANDLE_CLOSING`, exit 127 — measured). The launcher exits that way at
fifteen points, so it holds no fetch at all, and the child cannot take a
resurrection down with it.

**What each layer buys, honestly.** The due mark (`lock-heartbeat-hook.mjs`)
notices a changed open-point set after any tool call and persists `publishDue`,
so a session that dies before publishing hands the mark to its successor. The
deny (`board-first-guard`) refuses a turn's first state-changing call while that
mark stands — everywhere now, because every session can run the remedy. The
watchdog (`batch-autostart.mjs`, every 15 min) fetches the live page and sends
the ntfy alert when it is behind or unreadable, or when a `publishDue` /
`publishFailed` has survived a whole tick; each fault is keyed, so one standing
problem is reported once rather than four times an hour. That last layer is the
only one that still speaks when the session itself is wedged — which is exactly
when the user is away. Residual: the watchdog disabled AND a session wedged at
the same time. And every Stop guard stays fail-open by CLAUDE.md §7.2 decree, so
this is not literally 100 %.

The claude.ai artifact stays **mirrored** until the user has moved their
bookmark; `dashboard-publish.mjs` is unchanged and still does its half.

**What each half owns (29.07.2026, point 419).** Splitting one document into a
shell plus a fragment silently took four properties with it — the shell had them,
the fragment did not, and nothing asked. Each is now owned by the FRAGMENT, which
is the half that survives every transport (Pages shell, artifact mirror, the raw
file opened straight from disk):

| property | owner | what enforces it |
|---|---|---|
| the queue's titles, prose, estimates and **the user's order** | `.claude/board-queue.json`, projected over the work order by `board-queue.mjs` | the data file is the only home of the order; `queueOrder` appends anything unlisted by number, which is explicitly *not* the user's prioritisation |
| the 30-second self-refresh | `board-refresher-core.mjs`, embedded verbatim | `structureViolations` refuses a board without it; jsdom runs it against both page shapes |
| the phone viewport | a `<meta name="viewport">` in the fragment itself | `structureViolations` → `viewport-missing` |
| prose instead of placeholders | the generator's stub is a stop-gap, not a resting state | `dashboard-guard-core` → `queue-stubbed` above a quarter of the cards or three in a row |

The lesson under all four: the shell may only carry what a reader can lose
without harm. A property the board NEEDS belongs in the fragment, because the
fragment is what gets written into someone else's document.

### The board also runs BACK — a message channel from the phone (29.07.2026)

Until now the board was one-way: the user read status and could not answer it.
The chat is the way back, and it lives on the GH-Pages board rather than in the
claude.ai artifact for a measured reason — the artifact frame runs under a strict
CSP with no fetch, XHR or WebSocket to any host, so a page there cannot send
anything anywhere. Where that mirror is still open, the section renders a
localized "the chat needs the web board" notice instead of a dead input.

**What it guarantees, in each mode.** A message reaches a RUNNING session within
**seconds** — at its next tool call — and it reaches an IDLE machine within
**seconds** too, because the watcher below wakes a responder for it. The
launcher's 15-minute tick is now only the BACKSTOP: it is what still delivers if
the watcher is down, and it is what brings the watcher back. The first two bounds
come from reusing something that already runs (the launcher ticks and already
speaks to the network; the PostToolUse hook `scripts/lock-heartbeat-hook.mjs`
already runs on every tool call); the third costs one open connection.

| the machine is… | who delivers | bound |
|---|---|---|
| running a batch session | the PostToolUse hook, from the local spool | seconds |
| idle, watcher up | the watcher wakes a light responder | seconds |
| idle, watcher down | the next launcher tick spawns a session with the message in its prompt | ≤ 15 min |
| paused by the user | nobody — the message is spooled and waits for the go | until resumed |

**The watcher: a message wakes the machine** (`scripts/chat-watcher.mjs`, the
decisions pure in `scripts/chat-watcher-core.mjs`). A long-lived local process
subscribes to the INBOX topic over ntfy's streaming `/json` endpoint — one open
connection, no model, no tokens while nothing happens. It is a subscription and
not a poll for two reasons: a process polling every few seconds walks into ntfy's
free-tier rate limit, and a poll cannot be faster than its interval. `/sse` was
available and refused: both are one connection, but the JSON stream is
byte-for-byte what `parseNtfyLine` already reads, so a streamed message and a
polled one go through literally the same verification.

**It must not become a second batch session, and that shaped everything.** The
first design said "use the same lock as the launcher", which is self-defeating in
both directions: taking the OWNER lock makes the woken session the batch owner,
and `progressGuardDecision` then conscripts it into working the whole queue — the
opposite of a quick answer; taking NO lock makes it exactly the parallel
top-level session `classifyParallel` raises an alert about, and that alert blocks
the real owner's turn end. The compatible channel already existed: the watcher
spawns ONLY when `assessOwner` reports no live owner AND no honoured claim, and
for the responder's lifetime it files a BOUNDED `batch-claim` — already a reason
for the launcher to stand down at its tick. It never touches the pending-spawn
conversion.

**What the claim does NOT buy, said plainly.** `classifyParallel`'s `exclude`
list keys on a SESSION ID, and the claim's is synthetic
(`chat-responder-<uuid>`) — it can never equal the responder's real session id,
which nothing knows before that session starts. The responder is therefore **not
excluded** from the parallel-session detector. In the ordinary run that costs
nothing: the launcher bails at the honoured claim *before* it detects, and the
wake gate refuses to spawn beside a live owner at all. It bites only in the
narrow window where the watcher dies while its responder is still answering —
the claim stops being honoured, a tick may spawn a real owner, and that owner's
guard *will* raise a parallel alert naming the responder. Bounded (ten minutes)
and visible (the alert is the point), but real, and stated rather than promised
away.

**The claim names the WATCHER's own process, and that is the load-bearing
detail.** `assessClaim` honours a claim only while the recorded pid exists and
started when the claim says it did, so a watcher that is SIGKILLed, or a machine
that reboots, releases the claim by ceasing to exist — there is no exit path on
which a dead watcher leaves the batch reserved, and the 30-minute expiry is only
the second bound. Naming the RESPONDER's pid instead reads better and is wrong:
the responder's own SessionStart hook would resolve that claim as ITS OWN
(`resolveOwnership` matches by process) and would then acquire the owner lock —
precisely the outcome the paragraph above forbids.

**The responder is stood down — and told what it MAY do.** That branch of
`scripts/batch-resume-hook.mjs` had one message, written when the only way to
reach it was "another window holds the lock": *do NOT edit TASKS.md*. For the
responder that forbade the one duty it was woken for — appending an instruction
as a work-order point — so an instruction from the phone would be read, obeyed
into silence and lost. The branch now NAMES its situation first
(`scripts/batch-resume-hook-core.mjs`, `standDownKind`): the responder is told it
may answer and may append a point, and may not merge, work the queue or take the
lock; a bystander beside a responder is told that too; and the "no lock on disk"
case no longer asserts that another session owns a lock that does not exist.

**A message is marked consumed only against EVIDENCE that it was answered.** The
responder does not own the batch, so stage 2's per-tool-call delivery never
claims for it — without an ack every message a responder answered would be
handed to the next batch session and answered again. But the ack may *not* key
on the exit code: a responder that stands down and ends its turn cleanly exits 0
too, so acking on that would take the user's instruction off the spool with
nobody having answered it — a silent loss, worse than the wait this removes. The
evidence is a reply the transport ACCEPTED (`recordReplyReceipt` in
`scripts/chat-reply.mjs`, written after `res.ok`), and it must postdate the
spawn. No receipt, no ack: the message stays pending and the next session gets
it, which costs a duplicate at worst.

**The same stops as the launcher.** `.claude/batch-paused` and the work-order
format alarm both suppress a wake (the alarm rule itself is single-sourced in
`scripts/tasks-source.mjs`, so the launcher and the watcher cannot drift). A
live owner suppresses it too — stage 2 is already delivering to that session.

**The responder is LIGHT.** Its prompt forbids the work order: read the message,
answer with `scripts/chat-reply.mjs`, append a point if the message is an
instruction, then exit. A one-line question does not pay for a batch
orientation. Its reply is obligatory — it is also the receipt (see below) — and
it is bounded at ten minutes, after which it is killed and the reservation
released.

**Lifecycle: no second scheduled task.** `HoA-Batch-Autostart` already runs every
few minutes, at boot included, and is the one thing here that runs when nothing
else does — so it is the supervisor. Each tick asks `watcherSupervision` whether
the watcher is alive (by pid AND start time, so a recycled pid is never mistaken
for it) and starts one if it is not, kills it while the batch is paused, and
leaves a healthy one alone. Start-at-boot, restart-after-crash and stop-on-pause
are then three readings of one line. A responder orphaned by a crashed watcher is
ADOPTED by its successor rather than duplicated. Everything the watcher spawns
carries `windowsHide: true` (point 401 — a console window popping up steals the
user's focus, and this process wakes while the user is elsewhere), and the
watcher REFUSES to run from a git worktree, where its claim and pidfile would
land in a checkout nothing reads.

**A reconnect replays and decides nothing twice.** A dropped stream is resumed
from its own cursor with one second of overlap, and ntfy replays what it still
holds; the ledger of seen ntfy AND envelope ids — seeded at start from the spool,
consumed messages included — drops every one of them as `duplicate`. A COLD start
replays only the last 15 minutes rather than the full 12-hour retention: anything
older has already been through a launcher poll, so missing it costs exactly the
pre-watcher behaviour, while replaying half a day would wake a responder for
every instruction in it.

    node scripts/chat-watcher.mjs --dry-run  # subscribe, DECIDE, spawn nothing
    node scripts/chat-watcher.mjs --status   # is one running, and what does it hold
    node scripts/chat-watcher.mjs --stop     # stop it (the next tick starts it again)

`--dry-run` is how the subscription gets PROVEN. The live path can only be
observed on a machine with no session running, which is the machine nobody is
sitting at — so the dry run opens the real subscription, verifies each arriving
envelope through the same `chat-core` path, prints one
`{event, decision, reason}` line per event and spawns, claims and spools nothing.
From a session that is holding the batch lock it reports `skip / owner-live`, and
that line arriving within seconds of a phone message is the proof.

**Per-tool-call delivery, and the two rules that shape it.** The hook reads the
LOCAL spool only — a hook on every tool call must never do network I/O — and
injects what it finds as
`{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}`.
That shape is not decoration: a hook's plain stdout on exit 0 goes to the debug
log and is **never** shown to the model, so built the obvious way every message
would be silently invisible. And with an empty spool the hook emits **nothing at
all**, not even a "no new messages" line: injected context is re-sent with every
later request for the rest of the session, so one idle line would cost tokens at
tool-call rate, and the user's condition for the whole mechanism is that it costs
nothing while they send nothing. Like every guard here it stands down for a
session that does not own the batch lock and for a paused batch, and it is
fail-open and silent on every error — the channel may never break a tool call.

**A message is QUEUED, never an interrupt.** The injected block says so: arriving
mid-merge it is read and the session finishes the atomic step first. A question
is answered with `scripts/chat-reply.mjs`; an instruction becomes a work-order
point per append-and-defer, and the reply says so.

**Delivery is AT-LEAST-ONCE where the two paths meet, and that is a choice.** A
message still waiting when the launcher spawns a session rides into the spawn
PROMPT *without* being claimed off the spool, so that session reads the same
words again when its hook claims them at its first tool call. Claiming at the
handover instead would make delivery at-most-once: a spawn that dies before its
first tool call — or whose prompt never reaches a model — would take the user's
message with it. Seeing an instruction twice costs a few tokens; losing it costs
the user their message, so the duplicate is the side to err on. Within one
running session delivery is exactly-once, because the claim precedes the
injection.

**The spool is a directory, one file per message** (`.claude/chat-spool/`,
`scripts/chat-spool.mjs`). The poller creates each file atomically (tmp+rename
with the retry ladder of `scripts/atomic-write.mjs`); the consumer RENAMES it
into `consumed/` **before** it emits it. Both halves matter. Consuming first is
what stops the same message being injected on every following tool call — the
token leak the rule above exists to prevent — and a rename is an operation
exactly one caller can win, so two readers can never deliver one message twice.
Removing a line from a shared `.jsonl` instead would race the poller's append,
and is not atomic on this platform anyway (the measured `EPERM … rename` of a
scanner holding a file open; a per-tool-call reader is precisely that load). A
consumed file is kept rather than deleted: the replay ledger is seeded from the
spool, so a message that vanished without trace could be accepted again for as
long as ntfy still caches it. A stage-1 `.jsonl` left on disk is migrated into
the directory on the first tick and archived as `.migrated-<ts>` — never dropped.

**The transport** is ntfy, already a dependency (`scripts/notify.mjs`): one INBOX
topic phone → agent, one OUTBOX topic agent → phone. ntfy.sh caches a message for
**12 hours** (*"Messages you publish are temporarily cached on our servers
(default: 12 hours)"*, <https://docs.ntfy.sh/privacy/>; the server default
`cache-duration: 12h`, <https://docs.ntfy.sh/config/>). That is why the launcher
polls **before every guard, the user pause included**: whether the batch is
paused, complete or wedged may not decide whether a message survives at all.
Past 12 hours it is gone from the cache, which is also why the acceptance window
is set to the same 12 hours — beyond it a replay is impossible anyway.

**A DROPPED message does not look delivered** (`dropNoticeDecision` /
`dropNoticeText` in `scripts/chat-core.mjs`). The page renders a sent message like
any other — display never asks whether the machine accepted it — so a message
dropped because the phone's clock runs further ahead than the five-minute skew
left the user looking at a delivered-looking message the agent never received.
That is the failure this channel exists to prevent, mirrored. The launcher's tick
now posts a signed notice to the OUTBOX naming the reason, and the page shows it
as an agent message.

**What earns a notice is narrower than "a drop", and every exclusion is
load-bearing.** Only a VERIFIED envelope earns one: a failed signature gets no
answer at all, because replying would turn the outbox into an ORACLE for someone
probing the inbox topic. A `duplicate` earns none — the original was accepted and
delivered, so the words did land, and a notice would additionally hand a captured
envelope an amplifier. And of the two halves of `stale`, only `ahead` (the clock
running fast) qualifies; `expired` (older than the window) does NOT, because it is
indistinguishable from a message that was accepted long ago and has since aged out
of the envelope ledger — a four-eyes review proved a replay of a DELIVERED
instruction landing exactly there, which would have told the user that something
the machine had already carried out never arrived. The information to tell the two
apart is genuinely gone, so the notice is narrowed rather than guessed at, and
nothing is lost in practice: the acceptance window matches ntfy's cache, so an
`expired` message is one the transport has dropped as well. `ahead` is safe by
construction — acceptance requires `age >= -skew`, and at every earlier moment
such an envelope's age was more negative still, so no past poll can have taken it.

The notice **never quotes the message**: the two topics are derived separately so
that knowing one reveals nothing about the other, and the signed timestamp
identifies the message on its own. One notice per envelope id (kept in its own
age-bounded ledger) and at most `MAX_DROP_NOTICES` per poll, so a broken clock
cannot become an outbox flood. It is posted with `postOutbox`, never `sendReply`:
a notice is not an ANSWER, and a reply receipt written for one would make the
watcher mark the user's message consumed with nobody having answered it.

**The replay bound is a WINDOW, not a count** (`envelopeRetentionMs` /
`pruneIdLedger` in `scripts/chat-core.mjs`). Both id kinds used to share one
500-entry array that dropped events pushed into as well — so a few hundred junk
posts to a known inbox topic evicted the accepted envelope ids, and a captured
envelope could then be replayed under a fresh transport id and be accepted a
second time. The spool-seeded ledger softened that but did not close it: its
bound is the consumed-file retention, not the acceptance window. The two are now
separate. Transport ids stay cheap and count-capped; an accepted ENVELOPE id is
kept for `maxAgeMs` plus the clock skew — exactly as long as `assessEvent` could
still accept it — and dropped events never reach that ledger at all, so the flood
path cannot touch it. Past the window the id is forgotten and the message it
named is refused anyway, as `stale`. The launcher's poll and the watcher's
subscription both hold the pair, and a message whose spool write FAILED is struck
from both, or it would be lost for good.

**An UNPAIRED machine and a BROKEN one are told apart** (`classifySecret` /
`readSecretStatus` in `scripts/chat-secret.mjs`). The channel is opt-in, so a
machine with no `.claude/chat-secret` stays silent — that is correct. But every
other way that read can fail (a permission error, a directory in its place, a
file that exists and holds nothing) takes the whole channel down: the topics
cannot be derived, so every message the user sends is dropped before it is even
parsed. Both states used to answer `null` and neither was reported. The reader
now returns `absent` or `unreadable`; the inbox tick answers `ok: false` plus a
machine-readable `fault` for the second, and the launcher logs it every tick and
pushes it to the signal topic at most every six hours (`standingAlertDue` — it is
a standing condition, not an event, and an unattended machine must not notify a
phone all night). That push is the one chat fault that leaves the machine out of
band, because the chat itself can no longer carry it. The watcher refuses to run
on it — and because it exits BEFORE writing its pidfile, the supervisor would
otherwise start a fresh doomed process at every tick, so the launcher does not
start one at all while the fault stands. A watcher already running is left alone:
it read the secret at its own start.

**The security model — the part that shaped the design.** The board page is
PUBLIC, and an ntfy topic name IS its access: anyone who knows it can read and
post. A topic embedded in that page would be an open prompt-injection port into a
session that runs with permissions pre-granted and a GitHub token on disk; the
realistic worst case is command execution on the user's machine. So:

| layer | what it does |
|---|---|
| derived topics | `hoa-<32 hex>` from SHA-256 over the shared secret, domain-separated per direction. No topic name is in any tracked file or in the published HTML; the page derives them client-side with WebCrypto |
| the secret | git-ignored `.claude/chat-secret` on the machine, `localStorage` on the phone. Never committed, never logged, never echoed into a page |
| HMAC-SHA256 | over the canonical `(direction, id, ts, text)`, every field JSON-quoted so no two different messages share a canonical form. Both directions are signed — and the DIRECTION is inside the signed string, see below |
| the drop rules | `scripts/chat-core.mjs` drops anything unsigned, mis-signed, older than the window, or already seen — **before** it is spooled. A drop of a VERIFIED envelope is reported back to the sender (see below); a failed signature never is |
| the dedupe | TWO ledgers: the ntfy ids rotate under a count cap, the accepted ENVELOPE ids are kept for the whole acceptance window (see below). Both are rebuilt from the spool — the consumed messages included, since one already read is exactly the one a re-poll must not hand over again. The cursor in `.claude/chat-state.json` only narrows the next poll: losing or corrupting it replays the whole window and spools nothing twice |

**The direction is part of the signature, and that was a correction.** The first
cut signed only `(id, ts, text)` under one key for both topics — so an
agent-signed OUTBOX envelope could be copied verbatim and POSTed to the INBOX:
same key, same canonical form, a transport id the inbox ledger had never seen. It
verified, was spooled, and reached the spawn prompt **as the user's words**. That
needs no secret at all: the ntfy.sh operator sees both topics and every plaintext
envelope, and so does a TLS-inspecting proxy on the phone's network, because the
page polls both. A four-eyes review caught it before the first device was paired.
The direction is now signed and deliberately **not** carried on the wire — the
verifier supplies it from the topic it actually polled, so a replay is judged
against the channel it arrived on rather than a label the attacker copied along
with everything else. What the signature therefore guarantees is what it always
claimed to: a message read on the inbox was written by whoever holds the secret,
*for the inbox*.

**A signature is authentication, never authorisation.** It says WHO wrote a
message, not what may be done with it. The "treat it as untrusted input" rule
therefore stays ON TOP of the signature, and the launcher writes it into the
spawn prompt itself: a chat message is never authorisation for an outward-facing
or irreversible step — no tag, no publish, no force-push, no delete. Those keep
needing the user's own word through the normal channel. Each message is also
flattened and quoted in that prompt, so it cannot forge a second list entry or
pass itself off as framing.

**KNOWN BOUNDARY: the secret shares an origin with the game.** `localStorage` is
scoped to an ORIGIN, and `patrickvonmassow.github.io` is one origin for every
page this project publishes — the board at `/board/`, the deployed game at `/`,
`/poc/` and every frozen `/vX.Y/`. Any script running on any of them can read the
chat secret. So an XSS in the game, or a supply-chain compromise anywhere in its
dependency tree, opened in the same phone browser, hands over the channel: with
the secret an attacker derives both topics, reads everything and writes messages
that verify. The signature cannot help — at that point the attacker legitimately
holds the key.

This is not fixable cheaply on GitHub Pages: a separate origin means a separate
host (a `*.github.io` user page is one origin per account, and a custom domain
or a different host is a bigger change than this channel is worth today). It is
recorded rather than left unstated, and it bounds what the channel may ever be
trusted with — which is the same bound the paragraph above sets for a different
reason. Rotating is cheap if it is ever suspected:
`node scripts/chat-secret.mjs --rotate`.

**The page.** A collapsible section at the top of the board viewer, DEFAULT
CLOSED, that makes no request at all until it is opened; message list above,
input below at `font-size: 16px` (below that iOS zooms the page on focus), with
`env(safe-area-inset-bottom)` padding and autoscroll to the newest message. It is
INJECTED in DOM rather than written into the viewer's body: the viewer replaces
its own document (`document.open/write/close`), so static markup there would be
wiped the moment the board content lands — the JS realm survives that, so the
section is rebuilt into the new body, on the success path and on the failure path
alike. Two properties follow. Nothing of the chat reaches the board CONTENT, so
no section-parsing module ever sees it and the four-section mandate is intact by
construction; and it is not a `<details>`, so the board fragment's own remembered
open cards cannot shift.

    node scripts/chat-secret.mjs --init      # create the secret and print it once
    node scripts/chat-secret.mjs --topics    # also show the derived topics (local only)
    node scripts/chat-inbox.mjs              # one poll: verify, spool, advance the cursor
    node scripts/chat-inbox.mjs --pending    # what is waiting for the session
    node scripts/chat-inbox.mjs --ack 1      # consume the oldest waiting message by hand
    node scripts/chat-reply.mjs "…"          # answer, signed, to the phone

**Pairing a phone**, once: run `node scripts/chat-secret.mjs --init` on the
machine, open the board on the phone, expand *Nachricht an den Agenten* and paste
the secret. It stays in that browser and is sent nowhere. `--rotate` replaces it
and un-pairs every device.

### The duties come before the answer, not after it

The Stop chain runs AFTER the closing reply is composed. So a guard that blocks
does not merely cost a turn — it forces a SECOND message, and the user reads the
same answer twice. Reported repeatedly and finally with a verbatim example: the
19:18 and 19:19 replies were the same text (`timestamp-guard` twice that
afternoon, the dashboard's focus reconcile once). The reconcile arms on EVERY
user prompt, so any turn where the user writes and the focus has not yet been
confirmed ends that way. It is the chain's SHAPE, not randomness.

Two rules follow, and neither of them loosens a guard:

1. **Satisfy the chain before composing the reply.** The routine turn-end duties
   — `focus.mjs confirm`, the publish/`--synced` cycle above, the boundary — are
   done FIRST; `node scripts/guard-preflight.mjs --for answer --session <id>`
   reports read-only what would still block. The closing reply is the LAST thing
   written (CLAUDE.md §7.2).
2. **A blocked turn is acknowledged, not repeated.** When a guard blocks anyway,
   the next message states in a sentence or two what was fixed and does not give
   the previous answer over again. The guards say so themselves now: every one
   of them asks for a SHORT closing acknowledgement led by the exact line it
   hands over — `shortAckDemand()` in `scripts/closing-reply-core.mjs` is that
   single wording, and `findRepeatDemands()` is the ratchet, a pure test that
   reads the live Stop chain out of `.claude/settings.json` and fails on any
   guard whose message asks for the answer a second time.

## Render-verify (both backends — enforced, not reminded)

Every GUI/rendering/shader fix must be verified on BOTH renderer backends —
`VERIFY_GL=webgpu` (system Chrome, the user's real backend) AND `VERIFY_GL=webgl`
(the shipped fallback) — judged by the rendered PICTURE, before it is
committed/ticked/called done. The reminder alone failed (22.07.2026: the
point-210 sea-coast fix was "done" after a WebGL2-only check while the WebGPU
picture was still stepped — the fix never touched the water shader's path), so
the rule is machine-enforced by `scripts/render-verify-guard.mjs` (Stop hook;
decision logic in `render-verify-core.mjs`, Vitest-covered; state in the
git-ignored `.claude/render-verify-state.json`).

How it works, mechanically:

- **Evidence is recorded inside the suite process, never self-reported.**
  `scripts/verify/_browser.mjs` arms `scripts/render-verify-recorder.mjs` on
  every browser-suite launch; at process exit it records backend, suite, exit
  code, whether `assertBackend` CONFIRMED the backend, and the screenshots the
  run actually wrote. Only an exit-0 record counts as coverage, and only if it
  finished AFTER the last edit of any changed render file (an earlier run never
  saw the final code).
- **The gate fires on committed render changes.** At turn-end the Stop hook
  diffs the verified baseline (`clearedHead`) against HEAD; if the diff touches
  the render set (`src/render/**`, `src/scenes/**`, `src/ui/**`, `src/App.tsx`,
  `*.tsl.*`, the browser verify suites) it BLOCKS until a passing run per
  backend is recorded — naming the missing backend and the exact command. When
  both are covered it advances the baseline by itself. Fail-open: any guard
  error → allow.
- **The standard command pair for a render fix** (then LOOK at both frames —
  the screenshots in `verification/` — before committing/ticking):

  ```
  VERIFY_GL=webgpu node scripts/verify/run-all.mjs <suite>
  VERIFY_GL=webgl  node scripts/verify/run-all.mjs <suite>
  ```

  Pick the suite whose screenshots show the changed view. Inspect with
  `node scripts/render-verify-guard.mjs status`.
- **The loud escape valve:** if one backend genuinely cannot be judged headless
  (e.g. a washed-out WebGPU frame — that is a FINDING, not a pass), record
  `node scripts/render-verify-guard.mjs --defer "<reason>"`. It covers the
  CURRENT head only, is logged in the state file, and must be named in any
  report. `--clear "<reason>"` exists for the manual-hardware-verified case.

What stays judgment: the machine proves a passing run per backend happened
after the change — it cannot prove a human (or the assistant) actually LOOKED
at the frames. Looking is the standing rule; the gate makes skipping a backend
impossible, not skipping the inspection.

## Signal channel + never blocking on the user

- **Out-of-band notification (ntfy):** `scripts/notify.mjs` POSTs to `ntfy.sh/<topic>`
  (topic in the gitignored `.claude/ntfy-topic`; subscribe once on the phone). No
  auth, works headless and from the launcher. The launcher notifies on
  resurrection, on a stalled batch (auto-pause), and on a missing claude.exe; the
  batch should notify on a failed `git push` (write `.claude/push-failed`).
- **A pending user decision NEVER stalls the batch** (user rule 22.07.2026). The
  assistant does NOT block on `AskUserQuestion` during autonomous work. When a
  point needs the user: add a *Von dir zu klären* dashboard card, run
  `node scripts/defer-for-user.mjs <N> "<question>"` (marks the point
  `AWAITING-USER`, pings the phone), and MOVE ON to the next workable point.
  `AWAITING-USER` points still count as open (the batch is not done) but are
  SKIPPED when picking the next item; the user's answer clears them
  (`defer-for-user.mjs --clear <N>`). Only if EVERY open point is `AWAITING-USER`
  does the batch pause (`setPaused`) and notify — a legitimate wait, not a stall.
- **Tool permission prompts** don't fire for the batch: `defaultMode: dontAsk` +
  a trusted workspace (`hasTrustDialogAccepted`) + an allow-list covering every
  tool the batch uses. Avoid editing `.claude/settings.json` mid-batch (the one
  file that always prompts). Headless `-p` in the trusted repo never prompts.

## Operating it

- **Pause** (stop all resurrection + the in-session guard): create `.claude/batch-paused`.
  Resume: delete it.
- **Disable the OS task**: `schtasks /delete /tn HoA-Batch-Autostart /f`
- **Logs**: `.claude/autostart.log` (gitignored) records every launcher decision.
- **Chat**: pair a phone with `node scripts/chat-secret.mjs --init`; the launcher
  polls it on every tick. `--rotate` un-pairs every device. Turning it off is
  deleting `.claude/chat-secret` — an unpaired machine simply never polls.
- **Runaway safety**: if the agent ever loops unproductively (re-spawning and
  burning the limit each cycle without advancing a point), pause it; the design
  favours a stuck-but-recoverable state over silent idle.

## Parallel subagents and the working tree (enforced, not reminded)

Two parallel file-mutating subagents once shared the ONE working tree
(22.07.2026): both left uncommitted edits, the files entangled, and selective
commits became fragile. The standing rule:

- **Parallel file-mutating subagents run with `isolation: 'worktree'`** — each
  gets its own git worktree and commits independently; the trees never contend.
- **Non-isolated agents must touch NON-OVERLAPPING files** and leave their work
  **UNCOMMITTED**; the parent harvests, verifies and commits serially.

Enforcement: the `PreToolUse` hook (`matcher: "Agent"`,
`scripts/worktree-reminder.mjs`, logic in `worktree-reminder-core.mjs`,
Vitest-covered) injects this rule into the model's context whenever a
BACKGROUND Agent is spawned without worktree isolation. It never blocks the
spawn — a non-blocking allow with the reminder as the decision reason — and is
fail-open (any error → no-op). Foreground agents, already-isolated agents and
every other tool pass silently. Like the other guards it respects
`.claude/batch-paused`, and like every hook change it needs a session restart
(or `/hooks` reload) to take effect.
