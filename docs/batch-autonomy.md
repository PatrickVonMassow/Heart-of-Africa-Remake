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
4. **The launcher** (survives crashes AND reboots). Runs `scripts/batch-autostart.mjs`
   every 15 min. Its TRIGGER differs by host and nothing else (point 474,
   03.08.2026): on **Windows** it is the Scheduled Task `HoA-Batch-Autostart`
   (indefinite, `StartWhenAvailable`); on **Linux** — where the repository lives
   today, in a container with no `cron`, `crond`, `systemctl` or `at` at all — it is
   a self-scheduling detached node daemon, `scripts/batch-launcher.mjs`
   (`--start` / `--stop` / `--status`), which records its pid and its last tick in
   `.claude/batch-launcher.json`, refuses to run twice, and outlives the session
   that started it. The rest of this entry holds on both hosts, because only the
   trigger changed: the tick runs the same launcher, through the same singleton.
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
   alive; a debounce marker avoids double-spawns; it resolves the CLI dynamically
   and HOST-NEUTRALLY (`resolveClaudeCli`, point 490 — an explicit
   `HOA_CLAUDE_CLI`, then the newest bundled Windows `claude.exe`, then `PATH`,
   then the usual install dirs; every candidate must exist, and finding none
   alerts with the platform and the directory count it searched). It also THROWS when imported
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
| 4 | API/usage limit reached → session dies | (4) the refusal is recognised by its own signature and treated as a WAITING state (point 444): no `failCount`, no pause file, and a probe in every ordinary 15-min tick — so work resumes within one tick of the reset instead of behind a backoff ladder that had climbed to two hours and a runaway brake that had paused the batch | the limit window itself (unavoidable); every probe and the moment work resumed are logged, so the reset rhythm is measured rather than assumed |
| 5 | Normal reboot, user logs in | (4) task persists + `StartWhenAvailable` + boot-time check → resurrects promptly after login | none beyond the login itself |
| 6 | **Forced Windows-Update reboot** | same as #5: the task survives the update; after the user logs back in it resurrects promptly (boot-time check makes the stale-but-recent lock read as dead) | **the user must log in** — see the one true residual below |
| 7 | Power loss / hard crash | same as #5/#6 (boot-time check) | user login |
| 8 | Two sessions (scheduler + a manually opened one) | the HARD SINGLETON (`scripts/batch-singleton.mjs`, 24.07.2026): atomic test-and-set acquire (exactly one winner, proven by real process races), pid-backed liveness (no false-dead under long tool calls), stand-down gates in EVERY guard for non-owners, and the active parallel-session detector with auto-remediation (launcher kills its own rogue spawn; the owner is blocked into `scripts/batch-doctor.mjs` verification). Full analysis: `docs/batch-singleton-analysis.md` | none — a second session refuses to act even if it exists |
| 9 | A guard has a bug / throws | all guards are **fail-open** (error → allow) so they can never freeze the session; the scheduler still backstops the idle case | none |
| 10 | The CLI moved — an app update, or a different host entirely | `resolveClaudeCli` (point 490): explicit `HOA_CLAUDE_CLI` → newest bundled Windows `claude.exe` → `PATH` → the usual install dirs, each candidate checked to exist. The Windows-only lookup cost three silent hours the night the batch moved to Linux | none — and a resolver that finds nothing now names the platform and what it searched |
| 11 | Batch stuck on one item (needs data / a user decision) | the guard says "pick a DIFFERENT open item"; only if ALL are user-blocked does it pause with a `Von dir zu klären` card | correct behaviour — nothing to do without the user |
| 12 | The launcher is gone (the scheduled task deleted, the daemon never started or killed) | on Linux the session re-arms it itself (`node scripts/batch-launcher.mjs --start`); on Windows the task must be re-created | Windows only: the agent cannot create a scheduled task — re-create it with the command below |
| 13 | Session ENDS at a point boundary (27.07.2026, deliberate — the context is the batch's dominant cost) | (4) the launcher spawns the successor once the old pid is provably dead; `batch-progress-guard` allows the stop only against a verified-closed point AND an armed task | a few idle minutes per point, traded for a fresh context |
| 14 | The launcher is DISABLED while the boundary is in use | the guard reads the launcher's REAL state each time — the task's `State` on Windows, the daemon's own record on Linux, both in one ready/running/disabled/unknown vocabulary — and blocks the stop when it is not armed (`unknown` counts as unarmed), so the session keeps working instead of stranding the batch | Windows: the user must re-arm it (`Enable-ScheduledTask`, elevated). Linux: the session re-arms it itself |
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
- **A PROBE OF OUR OWN MAY NOT RAISE IT (point 434 (8)).** The launcher logged
  `PARALLEL SESSIONS DETECTED: owner=preflight-test plus <real session>` sixteen
  times across four nights. The guard preflight's real-repo test runs every
  REGISTERED guard's `gather()` under the synthetic id `preflight-test`, and five of
  those ask `heldByOtherLiveOwner('preflight-test')`. When the session that OWNS the
  batch runs the unit suite in its own tree — the fast gate after every merge — the
  Vitest process's claude ancestor IS the lock's pid, so ownership resolved by
  PROCESS and `ownsLock` RESTAMPED the live lock's `sessionId` to `preflight-test`.
  The launcher then read that as the owner beside the real session. No free lock is
  needed for this, which is why it recurred at fast-gate frequency. The `preflight-`
  namespace is therefore RESERVED (`isProbeSessionId`; a real session id is a UUID
  and can never carry it): `resolveOwnership` never answers "mine" for a probe, so
  nothing restamps a lock to one; `acquire` refuses it the lock outright;
  `classifyParallel` is blind to it on either side; and the ancestor memo does not
  record it. The detector keeps its teeth against two real sessions — that case is
  pinned beside this one in `scripts/batch-singleton-core.test.mjs`.
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
    before, none after. Both kinds of entry are now settled: the nine files a parallel
    agent held were fixed and their `awaiting` debts DELETED, and every remaining
    exception is scoped by what the call CONTAINS (`matching: 'buildSpawnOptions'` —
    that helper sets the flag itself) rather than by which LINE it sits on. The
    rescoping has its own measured reason: the original entry pinned line 741, an
    unrelated commit in the same file moved the call to 736 within the hour, and the
    gate reported both an offender and a stale exception for a file nothing had
    changed. A line number says where a call is; an exemption is about what it does.
    The exception map is injectable so the rules ABOUT it are pinned independently of
    which entries happen to exist — paying the last debt must not redden the test that
    describes what a debt is.
  - **Cause 2, WINDOWS-HOST ONLY, and moot while the project runs on Linux:** the
    `HoA-Batch-Autostart` task runs `node.exe` directly with LogonType
    `Interactive`, so Task Scheduler opens a visible console every 15 minutes —
    ~96 windows a day on its own. The session it spawns does not need that console
    (the spawn already passes `detached: true`, `stdio` to a log file and
    `windowsHide: true`), so the task action must stop being a bare `node.exe`:
    either a hidden-launch wrapper, or the task set to run without a visible
    window. That touches the USER'S machine, not the repository, so it needs the
    user's go for the specific change — and the task's re-enabled state (user
    27.07.2026) must survive it. The `scripts/run-hidden.vbs` wrapper written for
    this is GONE (point 474): it was dead weight on the host the project now runs
    on, and re-writing sixty lines of VBScript is cheaper than carrying them
    through every audit until the Windows host is used again. The Linux daemon has
    no equivalent problem — it is started detached with `stdio: 'ignore'` and
    opens no window at all.

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
   order confirms the point closed and the launcher is armed, so the session
   finds out at the boundary rather than at a blocked turn end. On success it
   writes `.claude/batch-boundary.json` (session id + point + timestamp).
2. At the turn end `batch-progress-guard` re-judges the claim itself — the marker
   is a claim, not proof. It ALLOWS the stop only when the point is closed per
   `TASKS.md` + `docs/tasks-archive.md`, the marker is fresh and belongs to this
   session, and the launcher reports an armed state — `Get-ScheduledTask -TaskName
   HoA-Batch-Autostart` on Windows, the daemon's own record on Linux. It then
   consumes the marker.
3. Anything else blocks exactly as before: a point still open, a stale or foreign
   marker, an unhandled parallel-session alert, an unparseable work order — and,
   the important one, an **unarmed launcher**. A disabled launcher must never be
   able to turn "end this session" into "end the batch", so `disabled` and
   `unknown` both block and the message names the fix FOR THIS HOST — on Windows
   `Enable-ScheduledTask -TaskName 'HoA-Batch-Autostart'`, elevated, by the user;
   on Linux `node scripts/batch-launcher.mjs --start`, which the session may run
   itself. Verify either with `node scripts/batch-boundary.mjs --status`, whose
   `launcherProbe` field always reports the launcher's real state.

One decision worth keeping in view: **unknown counts as unarmed.** Erring toward
"keep working" costs context; erring toward "stop" can cost the whole batch. The
asymmetry decides it.

### What it actually bought — measured, 30.07.2026

Point 373 is delivered by a MEASUREMENT, not by a mechanism ("the point counts as
delivered when the rate is measured, not when the mechanism runs"), and the command
that measures it is `node scripts/measure-context-cost.mjs` — so the figures below can
be re-derived rather than believed. It reads the transcripts, splits them at the moment
the boundary FIRST fired (`.claude/boundary.log`, 28.07.2026 08:56Z) and weights each
turn's billed tokens into one comparable number (`COST_WEIGHTS`; a PROXY, stated as
one, not a bill).

| | turns | active h | weighted/h | spend from turns ≥ 150k context |
| --- | --- | --- | --- | --- |
| before | 27 560 | 343.5 | 4 942 044 | 97.3 % |
| after | 4 379 | 34.9 | 4 388 146 | 89.0 % |

Per session, the mechanism plainly works: the **median peak context fell from 650k to
284k** and the p90 from 1000k to 590k, with the share of sessions that ever crossed
150k down from 95.7 % to 77.8 %.

**And it is not enough.** The spend per active hour fell by only 11 % (ratio 0.888),
which carried through the point's own 1.25 %/h anchor is **1.11 %/h — still nearly
double the ~0.6 %/h that fits.** The reason is visible in the same table: the cost is
roughly linear in the live context, and a session that ends at 284k still spends 89 %
of its tokens above the 150k mark. Halving the PEAK barely moves a bill dominated by
everything below that peak. So the criterion as written — get under the ceiling — is
**NOT met**, and the boundary at a *point* boundary is too coarse a lever to meet it on
its own. Recorded here rather than smoothed over: a mechanism that runs is not a
mechanism that delivered.

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
3. **OWNERSHIP IS A LEASE, AND THAT IS THE WHOLE VERDICT (point 434, 30.07.2026).**
   For one night it was not, and the night was lost: at 21:50 both delegated agents
   died on a server-side 500, the environment's permission classifier went down
   moments later, and the owning session could not execute a single command. It had
   not crashed — it stood. The launcher ticked all night and concluded "owner
   alive" every time, because THREE separate verdicts each inferred liveness from
   silence and each was satisfied by a merely breathing process.
   All three are gone (`docs/batch-resilience.md` §6). What decides now:
   - **`leaseUntil` on the lock, renewed BEFORE each tool call** (PreToolUse, in
     `board-first-guard.mjs`) — never after it, because the PostToolUse heartbeat
     fires when a call RETURNS, so a lease renewed there would have to outlive the
     longest single call. The window is 60 minutes and a renewal happens at most
     every 5, giving a guaranteed 55 minutes of cover — above the LARGE regression
     (30–40 min) and about twice the longest undeclared call measured over this
     project's 43 transcripts / 32 440 tool calls (27.8 min; p99 8.9, p99.9 10.0).
     A wait that needs longer says so IN ADVANCE by writing a longer lease
     (`extendLease`); nothing is inferred from evidence any more.
   - **Expiry is arithmetic.** `assessOwner` compares two numbers and answers
     `lease-expired`; the ordinary takeover path — the one a dead owner has always
     opened — does the rest. There is no flag to pass, no wedge to prove and no
     own-spawn condition to satisfy. That condition is precisely what fell through
     to a log line on the lost night, because the owner had been started by hand.
   - **Nothing is killed.** The dispossessed process keeps running, stops owning
     the batch, and learns it at its next hook when the guards stand it down. The
     new lock records `takenFromExpiredLease`, and the launcher logs `LEASE
     EXPIRED: …` naming who, how long they were silent and what they had declared
     — there is no silent recovery. `verdictRepeat` still escalates once if the
     same expiry stands for two ticks: a takeover that does not resolve the
     standstill is the finding worth a person's attention.
   - **A fence backs it** (`.claude/batch-fence.json`, monotonic, never deleted):
     one PreToolUse chokepoint refuses a session whose fence has been superseded
     the four paths that have no guard of their own — the TASKS.md tick and archive
     move, `git merge`/`push`, the board publish and `dashboard-state.json`. Only a
     session that demonstrably HELD a fence can be refused, so a window that never
     drove the batch is never blocked, and a missing fence file blocks nobody.
   A declaration no longer extends ownership at all: it is read for the REPORT, and
   `LAUNCHER_WORK_MAX_AGE_MS` bounds how long it stays readable as one.
4. **The threshold that preceded it (point 433, superseded).** Before the lease,
   the launcher's own wedge verdict was brought down from four hours to 45 minutes
   and given the power to act. That mechanism — `WEDGED_MS`, `WEDGE_NOTIFY_MS`,
   `wedgeAction`, `wedgeTakeover`/`takeWedged`, the two-stage silence report — no
   longer exists; the measurement behind it survives as the calibration of the
   lease window above. Recorded because the log lines it wrote still sit in
   `.claude/autostart.log`, and the handover observer still parses them.
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
6. **A quota block is a WAITING state, not a failure (point 444, user 30.07.2026).**
   Item 5's ladder assumes a failed spawn means something is broken. A usage limit
   is the other case, and nothing here told them apart: the refusal landed in
   `failCount`, the wait doubled toward its two-hour ceiling and after three of them
   the runaway brake wrote `.claude/batch-paused` — a batch stopped for the night by
   a condition that repairs itself on the hour. The user's rule rules out pacing:
   *"wenn du durch die Kontingent-Bremse blockiert wirst, musst du es immer wieder
   probieren, um zu merken, wann du neues Budget hast und ab dann weiterarbeiten"*.
   - **Recognised by its own signature.** The launcher records the size of
     `.claude/autostart-run.log` at each spawn (`state.runLogAt`), so the segment a
     spawn wrote is exactly its own; `detectQuotaSignature` searches the last few
     lines of it for the refusal wordings — the witness is `You've hit your session
     limit · resets 4:20pm (Europe/Berlin)`, which that log carries three times over
     from 22.07.2026. Deliberately narrow: a WARNING ("approaching your usage
     limit") and a session's own prose about limits are not refusals.
   - **Its own state** (`judgeSpawnOutcome`): `state: 'quota'` leaves `failCount`
     untouched, so the runaway brake is never approached and no pause file is
     written; `spawnBackoffMs({ quota: true })` short-circuits the ladder to its
     floor, so the probe rides the ordinary 15-minute tick. That is affordable
     because a blocked start fails at once and consumes practically nothing — the
     reason for the backoff does not apply.
   - **Measurable, not assumed.** Every probe and the moment work resumed go into
     `.claude/autostart.log` (`QUOTA BLOCK: … probe N, blocked for M min` and
     `QUOTA BLOCK OVER: work resumed after N probe(s) over M min`), so the real
     reset rhythm can be read off. The per-spawn "Resurrected" push is suppressed
     while a block stands (`announceSpawn`) — a standing condition must not buzz an
     unattended phone every quarter of an hour — and returns with the first spawn
     after it clears. An ordinary failure drops the record and climbs the ladder
     exactly as before.
   - **A stillborn spawn is not progress** (`spawnProgressed`, found while wiring
     the above). The launcher's own `pending-spawn` lock is stamped milliseconds
     AFTER `lastSpawnAt` and re-stamped when it binds the child, so "a lock claimed
     after the spawn" was true of every tick — and a spawn that died before
     converting it left it standing. Read as progress, that called a stillborn
     spawn a success and no refusal would ever have reached the classification. An
     unconverted pending lock now counts for nothing, which is the same fact
     `lockConverted` already carries into `judgePreviousSpawn`.
   - **Drill:** `node scripts/quota-drill.mjs` hands the real launcher
     (`batch-autostart.mjs --quota-report <segment>`, which exits before a tick's
     first side effect) a segment carrying the refusal line and asserts the
     invariants, plus the unsignatured control that must still climb.

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
| **All of it, not some — except a SILENT LOG beside moving output** | One finished agent ends the declaration. That is the point: the finished agent's work is now the session's next action, and re-declaring the rest is one command. The one exception is point 434 (5): a `log` that has gone quiet never on its own supports the conclusion "dead" while a `branch` or `worktree` in the same declaration is still moving. On 30.07.2026 a bundle agent was declared dead on `evidence-gone: silent for 59 min` while its worktree had committed four minutes earlier, and the successor rebuilt two finished points. The ignored item is reported, never hidden (`ignored`), and the reverse never holds: a quiet worktree beside a fresh log still blocks |
| **It ends with the WORK, not on a clock** | `IN_FLIGHT_MAX_AGE_MS` (45 min, `HOA_IN_FLIGHT_MAX_MIN` to tune) still blocks — but only where nothing in the declaration is producing OUTPUT (point 434 (6b)). Nothing refreshes a declaration while the work runs, so as a flat expiry it read `live:false, expired` on 29.07.2026 while its agent had been building for 63 minutes and was mid-merge. A branch or worktree that still moves needs no deadline: it stops checking out `WORK_FRESH_MS` after the last commit, all by itself. A pid or a log, which can look alive indefinitely without producing anything, keeps the clock |
| **The verdict NAMES its evidence** | Every assessment reports `judgedOn` — `git` (the work's own output), `process`, `log` or `none` — and `describeInFlight` puts it in the allow message and the boundary log. The 30.07 mistake was invisible precisely because "evidence-gone" never said which source had answered |
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

**Before you REPLACE a delegated agent, ask its output** (point 434 (5)). The
declaration decides whether a wait may continue; the costlier question — may this
agent be declared dead and respawned — has its own command, and it is answered
from the work's own git activity:

```
node scripts/batch-in-flight.mjs --agent-check --worktree <path> [--branch <ref>] [--log <path>]
```

Exit 0 permits the replacement, exit 1 refuses it, and both print WHY and on which
evidence (`agentOutputVerdict` / `respawnDecision`). Three rules, all from the
30.07 incident: git activity is the primary evidence and its window
(`RESPAWN_GRACE_MS`, 30 min) is deliberately WIDER than the wait's, because
killing a live agent costs everything it built and then costs the rebuild too; a
fresh log still refuses (only SILENCE proves nothing) — but not forever: past
`LOG_OVERRIDES_QUIET_GIT_MS` (twice the grace) measured-quiet output outranks it,
or an agent wedged in a printing loop would be replaceable only by hand; and where
neither worktree nor branch can be read the answer is `unmeasurable`, which refuses
as well — "I could not look" must never read as "it is gone". Run it AGAIN in the
seconds before the spawn: on 30.07 the branch tip moved one minute before the
replacement was started.

**The worktree stamp measures the WORK, not the git commands** (point 434 (5b)).
It reads TWO sources and the verdict NAMES the one that answered: the gitdir mtimes
(index, HEAD, COMMIT_EDITMSG — the last git OPERATION) and the newest WORKING FILE,
found through `git --no-optional-locks status --porcelain -z`. The second half is
what the first cannot see — an agent editing source for twenty minutes runs no git
command, and exactly that worktree read "quiet for 21 min" while its agent was
mid-edit. The `--no-optional-locks` is why the probe does not refresh the index it
reads, so a supervisor's own look can no longer become the evidence (four-eyes
review, finding 5). Name BOTH the worktree and the branch where you can: a
commit-based branch stamp is still the strongest single source there is.

Decision logic: `scripts/batch-in-flight-core.mjs` (pure, dependency-injected,
Vitest-covered in `scripts/batch-in-flight-core.test.mjs`). IO and probes:
`scripts/batch-in-flight.mjs`. The marker is `.claude/batch-in-flight.json`,
derived from the caller's lock path via `statePathsFor`, so a redirected lock
redirects it too (finding 3).

### The repair runs before the successor (30.07.2026, point 442)

`scripts/batch-doctor-core.mjs` has known how to find and mend an interrupted
session's leftovers — a half-done merge, an unattributable dirty tree, a diverged
`main` — since the parallel-session incident. What was missing was a CALLER on the
way in: the launcher spawned a successor into whatever the previous death had left
behind, and the successor had to notice by itself. That is judgment where a
mechanism belongs, and over a fortnight alone it is judgment nobody is there to
exercise.

The launcher now runs the doctor after its environment preflight and before it
acquires the pending-spawn lock, without `--gate` so the check costs a second or
two — the three-minute suite stays a session's job.

**It may WRITE only where the previous owner is provably gone** (`repoRepairAllowed`:
`pid-dead`, `pid-reused`, `heartbeat-predates-boot`, `handed-over`, `no-lock`,
`legacy-stale`). An expired LEASE alone is deliberately not in that set: such a
process is usually ALIVE and merely silent — the 30.07.2026 permission outage had
exactly that shape, and it stands down at its next hook — so `git merge --abort` or
`git stash push -u` in its tree would discard the merge it is resolving. There the
check is read-only and the successor is told instead.

**But the lease no longer SHADOWS a provably dead pid** (point 443 (g), four-eyes
re-review). `assessOwner` tests the expired lease BEFORE it probes the pid, so an
owner that is BOTH dead and lease-expired — the machine slept, the launcher was off
for an hour, i.e. the likely shape of an unattended fortnight — read `lease-expired`,
and the launcher declined to mend its tree even though the process was gone.
`repoRepairAllowed` now consults the probe on that one branch and permits the write
once the process is provably gone (the pid absent, or its start time proving REUSE).
Absent evidence still means "not gone": an unreadable probe may never license a
write into a live owner's tree.

**It never refuses to spawn.** The first draft did, and that was the mechanism
making things worse than the status quo: an exit-1 state — a committed conflict
marker, a repair blocked by a file lock — is TRUE at every tick until somebody
intervenes, so the batch would have stood still for the whole fortnight while
pushing an urgent notification every fifteen minutes. Refusing also contradicts the
other half of this change: the mandate exists so a SESSION can deal with an unclean
tree, and a session is exactly what can fix a mangled work order by hand. So a
finding means "spawn, and tell it": `repoRepairDecision` returns `mandate: true`,
the launcher drops `.claude/repo-mandate.json`, and the alert is marked `standing`
so `standingAlertDue` throttles it to one push per interval. `failCount` stays
untouched — a torn tree is not a broken environment.

The same seam is checked from the other side: `batch-resume-hook.mjs` prefers that
fresh one-shot marker (so the common case costs nothing) and otherwise asks the
doctor itself, without `--repair` and without `--gate`. Note what that does NOT
mean: the doctor's AUTO level still runs, i.e. a fetch and a strictly-behind
fast-forward — the same fast-forward a resuming session would do first anyway. For a
session that actually owns the batch it prepends `resumeRepairMandate`: "REPO NOT
CLEAN — MEND IT BEFORE YOU WORK", naming the command that clears it. Two independent
looks at one seam, because the one that fails is never the one you expected.

FAIL-OPEN both times. A doctor that cannot run at all spawns anyway and says so
loudly (the session side stays silent about it — the launcher's alert already
carries that news, and a session cannot mend a broken doctor). A safeguard may cost
a diagnosis; it may never cost the work.

**THE MANDATE MARKER, under test at last** (point 443 (h)). The shortcut above rests
on three mechanics that lived in untested wiring: it is ONE-SHOT (the first reader
consumes it, readable or not — a corrupt marker used to throw past the deletion and
be re-parsed at every session start for ever), it EXPIRES (past
`MANDATE_MAX_AGE_MS` it describes a tree that has since been worked in, and a marker
stamped in the future is not trusted either), and a CLEAN tick DELETES any marker a
failed earlier tick left, so no healthy successor is ever handed a false "repo not
clean". The rule is now pure in `mandateMarkerVerdict`, the file handling in
`consumeMandateMarker` / `writeMandateMarker` / `clearMandateMarker`, and both are
swept by the Vitest layer. In the same pass the launcher's two spawn-failure exits —
a missing `claude.exe`, a `spawn` that threw — were changed from a bare
`process.exit(1)` to `bail(1)`: `state.repoAlertAt` is set minutes earlier, and
throwing it away means the STANDING repo alert fires unthrottled at every following
tick, in a mode that is already alarming.

### Every critical action is a transaction (30.07.2026, point 443)

**THE PRINCIPLE: every critical action is a transaction with an idempotent cleanup
step, and that step runs at every start BEFORE any work — never "the session
remembers to".** Point 442 gave the cleanup a caller; this gives it eyes. A kill
during a critical action leaves more behind than a half merge, and none of the
following was visible to the doctor before:

- **(a) stale git locks.** `index.lock`, `refs/**/*.lock` and `packed-refs.lock`
  survive a killed commit or push, and while one lies there EVERY git write is
  refused — including the doctor's own repairs, which is why this action is planned
  FIRST. Age is the proof, and it is generous (`GIT_LOCK_STALE_MS`, 10 min): a
  younger lock may belong to a running git, and taking one from it corrupts exactly
  what this repairs.
- **(b) worktrees.** Two shapes, one bookkeeping and one a real deletion: a
  registration whose directory is gone (`git worktree prune`, planned `auto`), and a
  DIRECTORY under `.claude/worktrees/` that git no longer lists — six were lying
  around on 30.07.2026, four from the previous night. The removal is repair-gated and
  goes through `scripts/worktree-cleanup.mjs`, which detaches the `node_modules`
  junction first; without that order the delete takes the MAIN tree's dependencies
  with it. A one-hour idle window guards it, so a tree being created right now is
  never mistaken for debris.
- **(c) orphaned verification processes.** A headless browser and a dev server left
  by an aborted verify run hold the ports the next run needs and eat CPU for the rest
  of the absence. Matched by COMMAND LINE and by this checkout's path (the shared
  `classifyProcess`/`strayProcesses` of `verify/machine-load-core.mjs`) — never by
  process name, and never a stranger's browser — and only where no live session could
  own them.
- **(d) a truncated `TASKS.md`.** `tasksParses` has detected this since the doctor was
  written and nothing repaired it, yet the file is VERSIONED. It is restored from
  `HEAD` with the damaged bytes kept aside under `.claude/`, and by `git show` rather
  than `git checkout --`, so the index stays as the interrupted session left it.
  Where HEAD is broken too the alert stays: restoring one broken file over another is
  not a repair.
- **(e) a stale pending-spawn lock.** A launcher's reservation that no session ever
  converted reserves the batch against every future tick. Two proofs, not one: past
  its own stale window AND the recorded process gone — the window alone would race a
  slow but healthy spawn.
- **(f) a half-published board.** The board is the one thing the user can see while
  away. The detection is deliberately LOCAL — no fetch in a launcher tick: the
  publisher records the sha256 of the bytes it pushed (`pagesPublishedHash`) and
  persists a failure (`publishFailed`), so a local board whose hash differs IS the
  half-published state. `scripts/board-publish.mjs` re-runs. And the local file is
  now written ATOMICALLY (`writeTextAtomic`, four-eyes F3): it used to be a plain
  `writeFileSync`, so a kill mid-write left torn bytes — which this very check
  reads as "behind" and this very repair would then PUSH to the public page.

The decisions are pure in `planRemediation` (`scripts/batch-doctor-core.mjs`); the
gathering and the repairs are in `scripts/batch-doctor-states.mjs`, each taking its
repository root and `git` runner as a parameter so the Vitest layer drives every one
of them on a throwaway repository. **Idempotence is the property under test**: each
case repairs, re-detects (which must find nothing) and repairs a second time, which
must neither throw nor change anything. A cleanup that is only safe the first time is
not a cleanup a launcher may run at every tick.

**ABSENT DATA, NEVER WRONG DATA** — the four-eyes finding, and the rule this module is
read against from now on. An inner `catch` that turns a FAILURE into plausible-looking
data defeats the outer fail-open, which can only protect against data that is MISSING.
`listWorktreePaths` swallowing a `git worktree list` failure returned `[]` — "git knows
of no worktree" — and every live agent tree past the idle window then read as an orphan;
in repair mode that deletes a running agent's uncommitted work, and the idle window is
no shield, because a directory's mtime never moves while the agent writes in
SUBdirectories. Registration is the only shield, so an unreadable list must mean NOT
JUDGED. The same shape sat in `restoreTasksFromHead`, where an unreadable `TASKS.md`
counted as a missing one and would have been overwritten from HEAD with no backup
taken: only `ENOENT` means "nothing to keep". And where a repair is destructive the
EXECUTE step re-judges rather than trusting the gather — `removeOrphanWorktrees`
refuses a target that is registered now (`judgeTarget` treats a registered worktree as
a licensed `--force` removal), and `clearStalePendingSpawn` re-reads the lock it is
about to delete, because a launcher tick or a returning session can win it in between
and two sessions in one batch is the incident the singleton exists to prevent.

**AGE IS EVIDENCE EVERYWHERE, not only where it was convenient.** Locks get ten
minutes and worktrees an hour; the process sweep had nothing, so a verify run started
thirty seconds ago was indistinguishable from a fortnight-old leftover. `ownerAlive`
covers a run the BATCH started — not one the user starts in a bare terminal with the
launcher armed, and not a delegated agent's in-flight gate outliving its dead parent
(`pid-dead` licenses `--repair`). `STRAY_MIN_AGE_MS` now gates it, and a process whose
age cannot be established is spared: a spared leftover eats CPU, a killed live run
destroys work. The same asymmetry decides the other fallbacks — `ownerAlive` defaults
to TRUE when it cannot be read, so an unreadable owner SUPPRESSES the sweep, and
`EPERM` on a kill is reported as a FAILURE rather than counted as an ending.

### The watcher that does not live on this machine (30.07.2026, point 434)

`.github/workflows/batch-watchdog.yml` asks, every thirty minutes and from
GitHub, the only question that survives a dead machine: **did `main` move while
work was open?** It dates HEAD, counts the open points in `TASKS.md` — the work
order carries only open ones, so a plain count is the honest number — and pushes
an ntfy alert when the tree has stood still past `STALL_MINUTES` (120) with points
outstanding. Tunable in the workflow's `env`, and it runs on `workflow_dispatch`
too, so it can be exercised on demand.

WHY IT IS NOT A SECOND LOCAL WATCHDOG. On the night of 30.07.2026 the batch stood
still for six hours. The launcher DID diagnose it — nine "WEDGED owner" lines over
two hours — and could not act; then its log simply stops at 02:21. That stop is
the evidence: standby, a disarmed launcher or a dead one takes the whole local
layer down as ONE unit, and a twin on the same trigger, the same node binary and
the same disk would have gone with it. Independence, not
thoroughness, is what this layer buys.

WHAT IT DELIBERATELY DOES NOT DO. It never spawns and never writes to the
repository. One spawner is enough — the launcher owns the debounce state
(`autostart-last.json`) that a second one could not see, and two spawners produce
double boots that then have to be reaped as rogue. A watchdog that mutates what it
watches is a new failure mode, not a guard.

AND IT CANNOT GO RED. The morning it was written, 53 of the last 100 CI runs had
failed and the owner's inbox was flooded; a watchdog that fails would add to
exactly the noise it exists to cut through. Every step ends successfully, the
finding travels by push notification, and a missing `NTFY_TOPIC` secret is
reported in the log rather than as a failure. Its honest limits: alert only, and
GitHub's cron drifts — 15 to 60 minutes late is normal, which is acceptable for a
night watchman and is why it is a backstop rather than the primary rescue (that is
point 433, in the launcher).

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
4. **The bound is the LEASE, not a stall verdict (point 434, 30.07.2026).** This
   item used to describe `WORK_STALL_TICKS` — six launcher ticks of complete
   silence, after which `assessOwner` returned `work-stalled` and the launcher
   could reap a headless spawn of its own making. That verdict is GONE, together
   with `WEDGED_MS` and the two-stage silence report, because all three inferred
   liveness from silence and all three read the standstill of 29./30.07.2026 as a
   live owner. What bounds a standstill now is the owner's own `leaseUntil`: it is
   renewed BEFORE each tool call and expires by arithmetic (item 3 above), so
   nothing needs to decide whether a silence "means" anything. The launcher no
   longer kills anything at all on this path — an expired lease costs the lock and
   nothing else, and the process learns it at its next hook.

Two deliberate narrownesses, so neither reads as an oversight.

- **The launcher reads a declaration with its OWN window**,
  `LAUNCHER_WORK_MAX_AGE_MS` (four hours), never with the Stop guard's
  `IN_FLIGHT_MAX_AGE_MS` (45 min). The two questions genuinely differ: the guard
  asks "may a turn end ride on this?", where an aged declaration must stop
  counting, while the launcher asks "what was this owner waiting on?" — a question
  age does not disqualify. Since point 434 the answer feeds the REPORT and nothing
  else, so the window bounds how long a declaration stays quotable, not what may be
  done to the session holding it. (Historically this asymmetry was where the
  demolished `work-stalled` verdict turned out to be dead code: asked with the
  guard's 45 minutes, the constants it needed were mutually exclusive and it never
  fired once across five simulated hours. The verdict is gone; the window keeps its
  own written-out value so it can never collapse by borrowing another constant.)
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
Since point 434 no amount of live evidence protects a lock: the lease does that,
and only by being renewed. Evidence that goes quiet is reported, evidence that
keeps moving is reported too, and neither buys the owner a minute more of
ownership than it asked for in advance.

Pinned in `scripts/batch-singleton-core.test.mjs` (an expired lease is takeable
and a running one is not, a fresh heartbeat with an implicit lease reads ALIVE, a
dead or reused pid stays dead whatever the evidence says, the fence is granted on
acquisition and survives the lock being deleted, and a renewal is owner-guarded,
rate-limited and refused under a stale fence — plus `isOwnSpawn`, which pins that
only a spawn of the launcher's own making, matched by pid AND start time, is ever
killed), in `scripts/batch-lease-core.test.mjs` (the pure lease/fence/chokepoint
rules, each case naming the failure of 29./30.07. it would have prevented) and in
`scripts/batch-in-flight-core.test.mjs` (`assessOwnerWork`,
`selfReferentialEvidence`, and the real pipeline driven across five hours to show
the declaration now reports while the lease decides).

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
| take | the returning window | the SAME command again: `acquire` succeeds and clears the claim. (Its next `SessionStart` does the same thing by itself.) The stamp keeps the freed lock RESERVED for it in the meantime (bound 1a), so this is not a race |

**A claim is a REQUEST, never a transfer.** Nothing in it writes the lock:
ownership is still gained only through the atomic `acquire` in
`batch-singleton.mjs`, whose test-and-set is what makes two racing windows resolve
to exactly one owner. A claim can therefore never produce a second driving
session — the failure the whole singleton exists to prevent.

**Four bounds, each measurable rather than a matter of taste.**

1. **It is bounded by the thing it WAITS FOR, not by a clock somebody feeds**
   (point 434 (6a), 30.07.2026). As a flat 30-minute expiry this bound was shorter
   than the owner's own gap between clean turn ends — a 30-40 minute suite outlives
   it — so a takeover recorded at the start of one lapsed unseen, and keeping it
   alive needed a background refresher that itself died silently (measured
   29.07.2026 20:00 in session 10a2d2e0: a watcher hit a 60-minute timeout and the
   claim would have lapsed at 20:29 with nobody the wiser). So **while a live owner
   still holds the lock the claim does NOT age**: it is honoured for as long as the
   window that wrote it lives, which bound 2 reads off the process rather than off
   a deadline. The clock survives in exactly the two places where nothing else
   bounds the wait — an ERRAND claim carrying its own issuer (`claim.by`, e.g. the
   chat watcher's responder claim, whose recorded pid is the WATCHER's and
   therefore no bound on the errand at all; `claimIsBounded`), and a claim with
   **nobody left to wait for**. In that second case `CLAIM_MAX_AGE_MS` (30 min,
   `HOA_CLAIM_MAX_MIN`) bounds it — counted, like every age here, **from when the
   claim was recorded**, never from the moment the lock fell free — and after it the
   ordinary handover takes over so the batch is never left ownerless. `assessClaim`'s
   `ownerHolding` defaults to FALSE, so a caller that cannot answer gets the bounded
   reading, the direction that can never strand the batch. And it means a LIVE
   SESSION owner and nothing else (`ownerIsHolding`): read as bare lock existence it
   also matched the launcher's own `pending-spawn` placeholder, and the crash path
   then closed a loop — the launcher reaps the dead owner and spawns, the successor
   reads `ownerHolding` off that placeholder, honours the claim with no aging, stands
   down without converting the spawn, and the next tick spawns again (four-eyes
   review, Fable 5, 30.07.2026).
1a. **A RELEASED claim is NOT a claim** (point 434 (6c), measured 30.07.2026
   10:10-10:16). A record with `releasedAt` AND `releasedBy` both set was still
   honoured: the owning session released to it, the claiming window never took it,
   and the batch then ran for an HOUR with no lock at all while every guard and
   heartbeat behaved as though it were owned — and the boundary that followed
   released to the same dead claim a second time (`.claude/boundary.log`: two
   RELEASED lines, no HANDOVER). The stamp means the hand-over already happened,
   so no reader but the claim's own writer may ever HONOUR it again: nothing
   releases to it twice, and a returning window may claim straight over it.
1b. **…but it RESERVES the freed lock while its claimant lives** (point 461,
   observed live 30.07.2026 17:10-17:16). Reading a released record as plain ABSENT
   was the other half of the same hour: `boundary.log` records `RELEASED to
   103806e3… by 3c5d6964…` at 17:10:22 and the lock shows `acquiredAt` 17:11 — the
   RELEASING session took the batch back at its own next turn end, because what it
   had just freed reserved nothing. The user's window then had to WIN A RACE
   against automated acquirers, and the window that is answering the user is
   exactly the one not polling: it lost by six minutes, and the takeover had to be
   forced by stopping the owner process. So a released claim is unhonourable AND
   reserving. `assessClaim` answers `reserve` instead of plain absent, and
   `reservationDecision` refuses the acquire on it — for the launcher, the chat
   watcher, the resume hook, a third window's Stop guard and the releasing session
   alike. What it does NOT refuse is a deliberate `batch-claim.mjs --session <id>`
   from another window: that path acquires a free lock directly, as it always has,
   and it is the manual override the mechanism is meant to keep. The reservation
   holds off the automated acquirers, not a person at a keyboard, and the texts say
   so rather than promising a protection that is not there; and the acquire that
   overrides CLEARS the spent record, so it cannot go on reserving against the
   launcher's crash recovery. THE BOUNDS are the ones already there, not a new
   clock: the claimant must
   be PROVABLY alive by the pid + start-time identity probe (a closed window frees
   the lock instantly — the probe decides, never a deadline), the take-up window
   caps it counted FROM THE RELEASE (a window left open but never taking what it
   asked for cannot hold the batch), an ERRAND claim reserves nothing because its
   pid names its issuer rather than a taker, and the claimant's own path is
   untouched because the own-claim branch is asked first. `HANDOVER_GRACE_MS` is
   deliberately not reused — it means the pid-alive handover before a successor
   takeover, and overloading it would couple two calibrations. The reservation
   lives in the CLAIM file and never in the lock: a new lock kind would have to be
   learned by `assessOwner`, `spawnDecision`, `heldByOtherLiveOwner`,
   `resolveOwnership`, `acquire`, `release`, the launcher assessment and the
   boundary card, and a reserved lock would read as not-alive and be spawned into
   (four-eyes review, Fable 5, 30.07.2026 — it corrected the first draft, which put
   the reservation on the lock). Every text that mentions a release says what is
   reserved and what ends it: the stand-down's way back, the claim CLI's `--status`
   and the German boundary card.
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
   direction costs at most one more turn, because the claim stands only as long as
   the claimant's own process does.

Two consequences that are easy to miss and were both built:

- **The claimant is a second live top-level session by DESIGN.** It would trip the
  parallel-session detector, and that block demands the doctor before any further
  batch work — the one thing a handover never gets past. So the owner's guard
  excludes the honoured claimant from `detectParallel`. A session that announced
  itself through the sanctioned channel is not the covert second driver the
  detector was written for; an unannounced one is still flagged exactly as before.
- **A claim RESERVES the batch, before AND after the release.** Once the owner lets
  go, the lock lies FREE until the claiming window runs its next command, and ANY
  window that reaches an acquire in that gap would take it. So every door asks
  `reservationDecision` first — `batch-autostart` skips its tick, `chat-watcher`
  wakes no responder, `batch-resume-hook` does not acquire, the owner's own Stop
  guard (`batch-progress-guard`) does not re-acquire, and the boundary card names
  the claiming window because the launcher will not spawn. Without the Stop guard's
  one, a stood-down window would take the freed lock at its next turn end, see the
  claim, judge the moment clean and release again — repeated "handed back" messages
  and RELEASED spam in `boundary.log`. Bounds 1a and 1b are the two halves of the
  released state: never honourable again (so nothing releases to it twice), still
  reserving (so nobody takes the lock off the window it was freed for). The
  claimant's OWN claim reserves nothing against itself (`assessClaim` answers
  `mine`, never `honour` and never `reserve`), so the window the batch is waiting
  for still acquires; and every stand-down ends at the same two bounds — the
  claiming window's own life, and the take-up window — so a claim can never strand
  the batch.
- **The stand-down and the boundary card SAY which of the two is happening.**
  `batch-resume-hook`'s way-back text used to end at "re-running the SAME command
  takes it" and never mentioned that a claim ages at all, so a returning session
  claimed once, waited, and never learned why nothing happened; it now states both
  halves of bound 1 and, since bound 1b, what a release leaves standing instead of
  sending the user into a race. And the boundary card used to announce "Ich übergebe an eine
  frische Sitzung … Sie nimmt den nächsten Punkt der Warteschlange auf" even while
  a window held an honoured claim — which is exactly when `batch-autostart`
  reserves the batch and SKIPS the spawn, so the batch went to that window and the
  card told the user his takeover had been overtaken. `batch-boundary.mjs` now
  reads the claim through the same `gatherClaim` and prints the German card for
  the state it found (`boundaryDestination` / `boundaryCardText`, one Vitest case
  per state).

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

### A window that is NOT the master can still enqueue what the user says (30.07.2026, point 462)

Claiming the batch is one way back; it takes minutes to hours, and the
conversation does not wait. On 30.07.2026 a window held a pending claim for an
hour while the user settled three decisions and had two documents evaluated.
`TASKS.md` is main-only and batch-owned, so nothing could be enqueued — the specs
lived in a scratchpad **outside** the repository and would have died with the
window.

**The spec must be written by the window the user is TALKING TO.** Only it holds
the conversation the spec comes from, and the owner will never see it. A note
saying "the user wants something" is worthless, so the deposit is the FINISHED
final-state spec, leaving the owner only the mechanical half it alone may do.

That deposit goes into the **findings carrier**, which already is the lock-free
atomic append by a non-owner, already has a drain protocol and already has its
guard wired. No second carrier: two carriers are two drain disciplines to forget
one of. The chat inbox stays untouched — it carries the user's phone words,
signed, capped and delivered as untrusted input; a window-authored multi-KB spec
is a different writer and a different trust model.

    node scripts/finding.mjs --request "<title>" --spec-file <path> \
         --why-file <path> --quotes-file <path> [--constraints-file <path>] \
         [--doc-impact-file <path>] [--open-questions-file <path>] \
         [--bundle "<deutscher Name>"] [--refs "<…>"] [--rev <sha>]
    node scripts/finding.mjs --requests | --show "<title>"      # what waits, and its spec
    node scripts/finding.mjs --queued "<title>" --point <N>     # it reached the work order
    node scripts/finding.mjs --blocked "<title>" --why "<reason>"

Every long field arrives as a FILE. A final-state spec on a PowerShell command
line hits the quoting rules and the ~32K limit, and its umlauts do not survive
the shell — the same reason the board takes its German prose on stdin.

An entry carries the title, the spec, the bounds the user named (verbatim and
separate from the spec), the observed problem, the user's decisive sentences with
their date — the "user DD.MM.YYYY" citations the work order requires exist ONLY
in the depositing window — the design.md/CLAUDE.md/memory changes the ruling
implies, a proposed bundle, the refs plus the revision it was cut from, and any
open questions.

- **`pending` → `queued <point>`** on the drain: the owner appends the spec
  VERBATIM and numbers it.
- **A non-empty `openQuestions` routes to a decision card, NEVER to a TASKS
  append** — an undecided spec in the queue is a question standing where an
  instruction belongs. `--queued` REFUSES such a deposit and names `--blocked`;
  the route is enforced, not merely displayed.
- **`blocked` is the escape hatch.** `--blocked` writes the decision card FIRST
  and only then retires the entry, so an undrainable request is escalated to the
  user visibly instead of being parked. If the card cannot be written the request
  stays pending and says so.
- **The write-back re-reads the carrier.** A transition is decided on the text
  that was read and applied to the text that is there NOW, by the deposit's exact
  identity (timestamp, session, full title). Another window's append lands in
  exactly that gap — for `--blocked` the whole card subprocess sits in it — and
  writing the old text back would erase it silently.
- **A malformed entry warns, never blocks** — a half-written deposit is still
  listed and named, because dropping it is the exact failure the carrier ends.
- **A body line that is itself a field marker is escaped** with one leading
  backslash in the file and restored on read. The specs most likely deposited
  here are specs about this mechanism, and one containing a bare `#spec` line
  would otherwise lose everything after it out of the field it must carry
  verbatim.

**The gate is the point boundary**, not every turn end: a mid-branch owner cannot
write `TASKS.md` at all, so `findings-guard` fires the request rule only on the
turn that TAKES the boundary (`batch-boundary.mjs <point>`; `--status`/`--clear`
only read). It stands down for a non-owner and for a paused batch like every
guard here, and it is fail-open. Findings keep their own, unchanged rule.

**The board shows what waits.** The queue rebuild renders one card under the
Warteschlange naming the pending requests, so the user sees his instruction
arrived and where it stands without asking. Its titles are neutralised for the
board — paths, `§`-refs, point references and the umlauts a shell mangled — and
the `blocked` decision card's title goes through the same neutralisation. That
keeps the SHAPES a deposit usually carries from being judged on the owner's turn
for text it never wrote; it is a neutralisation, not a proof, because the guards
read the whole card and a body written elsewhere can still need a hand edit.

Pure layer: `scripts/findings-request-core.mjs` (with the head/kind parsing in
`scripts/findings-core.mjs`), Vitest-covered in
`scripts/findings-request-core.test.mjs`.

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
**instant on login** (instead of within ~15 min) on the WINDOWS host, add an
at-logon trigger once, from an **elevated** PowerShell (modifying the task needs
admin rights, which the agent does not have):

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
tool work, and publish parity (repo file bytes == the content last pushed to the
live page — so "edited" can never masquerade as "live").

The standard cycle after any dashboard edit:
`node scripts/board-publish.mjs` (the live page — works in every session) →
`node scripts/dashboard-guard.mjs --synced .batch-dashboard.html` (which doubles
as the focus confirmation when card and focus agree). On every work switch:
`node scripts/focus.mjs set <N> "<what>"`. What stays judgment: the machine
verifies the card's POINT NUMBER, publish state and freshness, never the truth of
the prose.

**Every remedy names those two commands and nothing else (point 435).** They live
once, in `scripts/board-remedy.mjs`, and every board guard imports them — until
30.07.2026 each guard carried its own copy still pointing at the retired claude.ai
mirror, and a remedy is read at the moment of a block and FOLLOWED. The board's
CONTRACT — four sections, transport, update discipline — is likewise stated
exactly once, in the memory `batch-dashboard-artifact`; nothing restates it. The
canonical file is the git-ignored `.batch-dashboard.html` in the repo root,
resolved by `boardFilePath()` so nothing measures a stale copy. `scripts/board-remedy.test.mjs`
holds the three gates: no remedy names the retired path, only the canonical file
is measured, and the reference count outside a labelled legacy note is zero.

**The prompt-injected reminder states only what no gate can (point 436).** It is
the most expensive text here — `scripts/dashboard-reminder-hook.mjs` puts it into
EVERY user prompt — and most of it repeated rules the machine already refuses to
break: the four sections, their order and the card wrappers (`structureViolations`,
before any publish), the `open`-attribute ban (`auto-open`) and the queue card's
header meta (`queue-meta`). Measured, dropping those took it from 2153 to 843
characters (−61 %), 283 to 112 words, and 31 concatenated source lines to a
single call. What is left is judgement no check can make —
information in a foreign section, the phone-portrait look, and proposing a
structure change as a card instead of making it — plus the commands, with the
structure itself a POINTER to the memory. The text lives in the pure module
`scripts/dashboard-reminder-core.mjs` under a measured character budget, and
`dashboard-reminder-core.test.mjs` pins both directions: `ENFORCED_CLAIMS` may not
reappear (and the case proves those gates really do fire), `UNENFORCEABLE_DUTIES`
and `REMINDER_COMMANDS` may not disappear.

### The board's transport (28.07.2026, point 400)

The board used to be publishable only through a tool the **headless successor
session does not have**. On 28.07. at 15:38 one edited the board and recorded a
deferral — in the flagship mode (user away, batch resurrected by the scheduler)
the board could not be updated AT ALL, and the user found a board standing still
for over an hour before any guard did. A commit and a push are things that
session has, so the board is published by a script.

| | where | why there |
|---|---|---|
| content | orphan branch `board`, ONE commit, force-updated | not on `main`, so a publish is not a source change: no CI (which watches `main` and `feat/**`), no Pages deploy (which rebuilds the game **and every frozen version tag** — minutes of runner time for a status card). No parent, so the branch never grows |
| reader's URL | `https://patrickvonmassow.github.io/Heart-of-Africa-Remake/board/` | `public/board/index.html`, a source file deployed once with the site by the workflow that already runs. It fetches the content branch at load, so the URL is stable while the content behind it moves without a deploy |
| the check | `https://raw.githubusercontent.com/…/board/board.html` | plain HTTPS, no auth, no tool binding — the verification reads the PAGE, not a record of an attempt |

The board carries its open-point set as a `hoa-board-open` meta, stamped on the
way out (never into the repo file, whose bytes every publish record attests).
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
    node scripts/board-queue.mjs set <N> --title --text-stdin    # …its German title
    node scripts/board-queue.mjs set <N> --estimate "~2 h"       # …its estimate
    node scripts/board.mjs title <N> "…"     # retitle a now- OR queue card
    node scripts/board.mjs none "<Grund>"    # the gap card, with NO point to close

**Every text goes in on stdin, and a flag is never prose.** `--text-stdin` now
fills whichever field it follows in both commands, `--none`'s reason included —
that gap card is written at every session boundary and was the last place a
German text still reached the board as a command-line argument, where a Windows
shell eats the umlauts. Until `board-queue.mjs set` had the flag, a session that
tried to pipe prose into it stored the literal string `--text-stdin` as the card
body, and six cards showed the user a flag where their explanation belonged; no
card-writing command will store a `--…` value as prose any more, and a text that
really starts with a dash goes after a bare `--`. A **blank line** in any piped
text becomes a `<p>` boundary, so the sanctioned command can produce what
`dashboard-conciseness-guard` demands instead of forcing a hand edit.

**"Gerade keine laufende Arbeit" is a STATE and a CLAIM TO STOP (point 470).**
The user reported the same defect four times in one evening: the card stood while
three things were in flight, the last time three copies deep. Both halves were
mechanical. Writing it needed a point to close (`done <n> --none`), and the
boundary is exactly the moment when no point is open — so the session hand-edited
the board file, and a hand-edit APPENDS (one of them also broke the section
markup). `board.mjs none` now writes it with no point at all, it REPLACES any
copy standing instead of adding one, promoting real work sweeps it away, and it
is refused outright while a numbered card still stands. The other half is the
claim itself: "nothing is running" is a statement about the FUTURE of the turn,
true only if the session stops now — so `board-first-guard` denies the next
state-changing call while it stands, naming both ways out (put a card up, or
stop). Reads, the board's own commands and the whole session-ending set
(`batch-boundary.mjs`, the focus stamp, the publish, the tick) stay open, and the
rule is fail-open: an unreadable board never costs a call. Unlike the
focus/publish deny it does NOT stand down after firing once — its remedy is a
single never-blocked command, and standing down would leave the lie on the board
for the rest of a turn that demonstrably kept working. `batch-boundary.mjs` reads
the board and prints whichever of the two commands actually works.

**A READ IS JUDGED AS ONE (point 473).** The first classifier matched regexes over
the whole command STRING, and within minutes it denied two pure reads: a `grep` of
the board whose quoted pattern held a `>`, and `git worktree list`, whose verb it
never saw as a subcommand. `scripts/command-classify-core.mjs` is now the ONE
classifier both PreToolUse gates ask — the idle claim and the fence chokepoint,
which each had their own before. A call is split into the segments a shell would
run, and each is judged on its command HEAD plus, where that is not enough, its
SUBCOMMAND: `worktree list` vs `add`, `npm ls` vs `run`, `git stash list` vs
`push`, `git tag` vs `git tag v0.4`. Quoted text decides nothing, a pipe into
`tee` and a `> file` are writes while `2>&1` is not, only a genuinely
state-changing segment denies — and the deny NAMES that segment. What CARRIES a
command is unwrapped and judged too (`bash -c "…"`, `eval`, `$( … )`, backticks),
so a wrapper hides neither a write from the idle claim nor a `git push` from the
fence; inside single quotes both are inert, exactly as a shell reads them.
Anything undecidable reads as READ at the idle claim — it under-blocks by design,
because a blocked turn produces nothing — while the lease fence is the opposite
case and judges conservatively: a session that lost the batch must not move
shared history.

**The board is written LF, whatever wrote it.** The markup anchors are matched
with literal newlines, so a board an editor once wrote back in Windows text mode
made `board-archive-rotate.mjs` miss the Erledigt section entirely and `attest`
crash on a board that looked perfect in the browser. Every writer normalises now.

**The queue is ONE FLAT LIST, and the bundle is never rendered.** It was grouped
by bundle for a few hours on 30.07.2026 and the user had it taken back out the
same evening: a flat queue IS the working order, read top to bottom, while a
grouped one is not, because the pool draws its three slots from different
bundles. `docs/work-packages.md` keeps the bundles as the internal collision map
and the priority ranking; the board reads it no more. The empty-body rule of
`auditDashboard` therefore has no exemption again — the group card was the only
one that ever bought one.

**A fallback title is REPORTED, never silently taken.** `queueEntries` still
falls back `authored → work-order headline → "Punkt N"` (a nameless card is
worse), but the middle rung is the work order's own headline, which is English by
rule and written in capitals — so an appended point reached the German board
shouting, and nothing said so. `board-queue.mjs` names the affected points on
every rebuild and the publisher names them again, each with the command that
fixes it; the same report covers the cards still carrying `Schätzung offen`,
which `auditDashboard` accepts by name and would otherwise let stand for ever.
The comparison is against the PARSED headline, never a language heuristic.
`parseTaskTitles` normalises line endings first: its `$`-anchored pattern matched
nothing at all on a CRLF checkout, so the middle rung had been dead there and the
user read a run of cards saying "444 Punkt 444, 445 Punkt 445 …" on his phone.

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

The claude.ai mirror was **retired on 29.07.2026** when the user moved their
bookmark. `dashboard-publish.mjs` is the labelled legacy path and survives only
for its offline `--defer` valve; nothing in the loop calls it.

**What each half owns (29.07.2026, point 419).** Splitting one document into a
shell plus a fragment silently took four properties with it — the shell had them,
the fragment did not, and nothing asked. Each is now owned by the FRAGMENT, which
is the half that survives every transport (Pages shell, the retired mirror, the
raw file opened straight from disk):

| property | owner | what enforces it |
|---|---|---|
| the queue's titles, prose, estimates and **the user's order** | `.claude/board-queue.json`, projected over the work order by `board-queue.mjs` | the data file is the only home of the order; `queueOrder` appends anything unlisted by number, which is explicitly *not* the user's prioritisation |
| the 30-second self-refresh | `board-refresher-core.mjs`, embedded verbatim | `structureViolations` refuses a board without it; jsdom runs it against both page shapes |
| the phone viewport | a `<meta name="viewport">` in the fragment itself | `structureViolations` → `viewport-missing` |
| prose instead of placeholders | the generator's stub is a stop-gap, not a resting state | `dashboard-guard-core` → `queue-stubbed` above a quarter of the cards or three in a row |

The lesson under all four: the shell may only carry what a reader can lose
without harm. A property the board NEEDS belongs in the fragment, because the
fragment is what gets written into someone else's document.

**The chat is INJECTED into the content, so every content swap must put it back
(29.07.2026, point 423).** Nothing about the message channel may enter the board
content, so the viewer builds it and inserts it into the rendered board — and
since it sits under the board's heading, it sits inside `<main>`, which is
exactly what the 30-second refresher replaces wholesale. `injectChat` ran once
per document load, so every successful refresh deleted the channel and nothing
restored it; on a phone that reads as "the section is gone", because returning to
the browser makes the page visible and fires the poll in the same moment the
reader looks. The seam is therefore a documented signal, not markup and not a
shared variable: the refresher dispatches `hoa-board-swapped` on `window` after a
swap (`BOARD_SWAP_EVENT` in `scripts/board-refresher-core.mjs`), the viewer
listens and re-injects, and the injection is idempotent. The reader's
typed-but-unsent draft, the open/closed state, the messages already read and the
fact that they were TYPING (focus and caret position) live in the viewer's
`chatState`, so they survive the rebuild — otherwise the channel would lose words
on a 30-second timer, and a rebuilt-but-unfocused field would shut the phone
keyboard mid-word. A first load restores nothing, so it steals no focus. A `MutationObserver` on `<main>` covers
the lag while a board published with an older refresher announces nothing.

### The board also runs BACK — a message channel from the phone (29.07.2026)

Until now the board was one-way: the user read status and could not answer it.
The chat is the way back, and it lives on the GH-Pages board rather than on the
retired claude.ai mirror for a measured reason — that frame ran under a strict
CSP with no fetch, XHR or WebSocket to any host, so a page there could not send
anything anywhere. Opened outside the web board, the section renders a localized
"the chat needs the web board" notice instead of a dead input.

**What it guarantees, in each mode.** A message reaches a RUNNING session within
**seconds** — at its next tool call, *while it makes tool calls* — and it reaches
an IDLE machine within **seconds** too, because the watcher below wakes a
responder for it. The "at its next tool call" half is only a bound while the
session is actually acting, and that had to be made true rather than assumed
(point 424): a session that has DECLARED A WAIT makes no tool calls, and its
delegated agent works in a worktree whose own spool is empty, so a message left to
it waited 34 minutes under a correctly logged `skip / owner-live`. The deferral
therefore has a DEADLINE. The watcher re-reads the pending spool on its own clock
and anything older than `DEFERRAL_MS` (3 minutes, calibratable via
`HOA_CHAT_DEFER_MS`) is decided again with the owner gate lifted — it wakes a
responder as it would for an idle machine, under the same bounded claim. Age is
the trigger and no declaration is read: a session that is genuinely working
collects the message within seconds, so its messages never get old, and the
deadline can only fire on one that is idle or waiting. The age is measured from
the SPOOLED `receivedAt`, so a restarted watcher cannot reset the clock, and a
message already handed to a responder is never handed again — one answer, not one
per window. The
launcher's 15-minute tick is now only the BACKSTOP: it is what still delivers if
the watcher is down, and it is what brings the watcher back. The first two bounds
come from reusing something that already runs (the launcher ticks and already
speaks to the network; the PostToolUse hook `scripts/lock-heartbeat-hook.mjs`
already runs on every tool call); the third costs one open connection.

| the machine is… | who delivers | bound |
|---|---|---|
| running a batch session | the PostToolUse hook, from the local spool | seconds |
| a session that owns the batch but WAITS (no tool calls) | nobody at first; past `DEFERRAL_MS` the watcher wakes a responder anyway | ≤ ~4 min |
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

**Lifecycle: no second launcher.** The launcher (the Scheduled Task on Windows,
the `batch-launcher.mjs` daemon on Linux) already runs every few minutes, at boot
included, and is the one thing here that runs when nothing else does — so it is
the supervisor. Each tick asks `watcherSupervision` whether
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

**A NOTIFIED ENVELOPE IS NEVER ACCEPTED AFTERWARDS (point 430).** `ahead` is safe
against a PAST acceptance, but not against a FUTURE one: the envelope's stamp is
fixed while `now` advances, so waiting alone brings it inside the window, and a
replay whose transport id a flood had evicted from the count-capped `seen` could be
accepted minutes after the sender was told "NICHT angekommen". The notice is the
half that cannot be taken back, so the notified ledger is read by the verification
too — a notified envelope drops as `duplicate` for as long as it is remembered.
That matches what the notice asks for (fix the clock and send AGAIN, which is a new
envelope) and settles the second notice by construction, since a `duplicate` earns
none. The same tick is covered as well, not only the next state read.

**Both facts of one tick reach the log (point 430).** The launcher's chat log was an
`if/else if` chain, which made a failed SPOOL WRITE and a refused DROP NOTICE
mutually exclusive: the storage fault took the first branch and the notice clause
never ran, so the one thing those counts exist to make loud went silent. The lines
are composed by `chatInboxLogLines` in `scripts/chat-core.mjs` instead — a pure
function returning both.

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
- **Stop the launcher**: on Linux `node scripts/batch-launcher.mjs --stop` (start
  it again with `--start`, read it with `--status`); on Windows
  `schtasks /delete /tn HoA-Batch-Autostart /f`. Either way the batch stops being
  resurrected and the point boundary is refused — which is correct: nothing would
  restart it.
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
