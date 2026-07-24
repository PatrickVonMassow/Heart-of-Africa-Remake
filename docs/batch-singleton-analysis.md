# Batch singleton — root-cause analysis and the hard mutual exclusion

Incident (night of 23./24.07.2026): TWO live Claude sessions drove the batch and
committed to `main` concurrently — the interactive session `f8c46e2f` and a
scheduler-spawned headless session `e9407cae`. This document is (A) the full
root-cause analysis of every way a parallel session could arise, cited to the
code and the on-disk evidence, and (B) the design of the hard singleton +
active detector that replaces the advisory coordination. The implementation
lives in `scripts/batch-singleton.mjs` (core), `scripts/batch-doctor.mjs`
(owner-side verification/remediation) and the rewritten hooks/guards; tests in
`scripts/batch-singleton-core.test.mjs` and `scripts/batch-doctor-core.test.mjs`.

## A. Root cause: how e9407cae arose (evidence-pinned)

Timeline (times UTC; local = UTC+2):

| Time | Event | Evidence |
|---|---|---|
| 23.07 19:46:06 | The machine boots (the user's evening reboot). | `Win32_OperatingSystem.LastBootUpTime` = 23.07.2026 21:46:06 local |
| night | Interactive session `f8c46e2f` works the batch (worktree agents, serial merges on `main`). | `git reflog show main`: continuous commits/merges 22:xx–04:51Z |
| ~04:27 | Last lock heartbeat of `f8c46e2f` before a long gap — the session is mid-turn (its merges land 04:51:28Z), so no tool call COMPLETES for ~24 min, and the heartbeat hook only fires on completion. | autostart.log 04:36:16Z: "skip: a session is alive (lock **9 min** old)" |
| 04:51:16.067 | Autostart tick: lock ~24 min old > its 12-min freshness window → declares the batch dead → **spawns pid 25848** and writes the one-shot `autostart-authorized.json`. The boot heuristic did NOT fire (no "lock predates this boot" log line — the lock postdated the 19:46Z boot), and the wake-from-sleep grace did not apply (no tick gap: 04:06/04:21/04:36/04:51 all present). | autostart.log 04:51:16Z "RESUMING … launched pid 25848"; `batch-autostart.mjs` (old) lines 92–116 |
| 04:51:17.746 | The spawned session **e9407cae** starts; its SessionStart hook consumes `autostart-authorized.json` and claims the lock **unconditionally** (the authorized path skipped every lock check). | `batch-lock.json`: `startedAt: 1784868677746` (= spawn + 1.7 s); the marker file consumed (deleted by `clearAuthorized()`) |
| 04:51:28/35 | `f8c46e2f`'s in-flight turn completes and merges `feat/283-buried-animal` + `feat/281-backdrop-ridge` to `main` — **two drivers now interleave on `main`**. | reflog 06:51:28/06:51:35 local |
| 04:51–06:21 | Both sessions work: duplicate "Record … as complete" commits, an un-tick cherry-pick ("Reopen the 1890-picture point"), competing TASKS.md ticks. | reflog 04:56–06:28Z |
| 06:21:37 | e9407cae's last heartbeat (`claimedAt: 1784874097318`). | `batch-lock.json` |
| 06:25 | Containment: scheduled task disabled, `.claude/batch-paused` written. | `batch-paused` content |
| analysis time | **pid 25848 is STILL ALIVE** (claude, StartTime 24.07 06:51:16 local) — the `-p` run never exited. It must be killed in the apply steps. | `Get-Process -Id 25848` |

So the trigger was **not** the reboot heuristic: it was the **12-minute
claimedAt-age liveness window** meeting the reality that a heartbeat is written
only when a tool call *completes* — a single long tool call/turn (browser
regressions and merge sequences routinely run 20–40 min) starves the heartbeat
while the session is perfectly alive. The reboot merely shaped the night; the
same hole had already fired before: 22.07 09:21Z, 12:21/12:36/12:51Z (three
spawns → RUNAWAY auto-pause) and 23.07 16:36Z — and the 22.07 spawned session
itself reported "Zwei Sessions liefen parallel" in `autostart-run.log`.

### Every path that could start batch work, and what (didn't) stop it

| # | Path | Started work when | What stopped a second session (OLD) |
|---|---|---|---|
| 1 | **SessionStart resume hook** (`batch-resume-hook.mjs`) — every top-level session: VS Code window, `claude`, `claude -p` | Open TASKS points, not paused, lock free/stale (45-min `STALE_MS`) or **`autostart-authorized` present → claimed UNCONDITIONALLY** | `lockStatus` check-then-set (two simultaneous starters both read 'free' and both claim); the 'held' branch was **advisory prose** to the model ("do not resume") — nothing enforced it; the authorized path overrode ANY lock |
| 2 | **OS Scheduled Task** `HoA-Batch-Autostart` → `batch-autostart.mjs` → spawns `claude -p` | Lock older than 12 min, or `claimedAt < bootTime` ("lock predates boot"), debounce 10 min | Liveness was **age-only** (no pid) → false-dead under long tool calls (the incident); reboot alone counted as death; the launcher never claimed the lock itself — pure check-then-spawn, and the spawned session claimed unconditionally minutes later |
| 3 | **PostToolUse heartbeat** (`lock-heartbeat-hook.mjs`) | Every tool call of ANY session in the repo: `lockStatus !== 'held' → claimLock` | Nothing — a chat window running one tool **silently became the batch owner** (conscription) the moment the lock was free/stale |
| 4 | **Stop-hook `batch-progress-guard.mjs`** | Turn end with open points: lock not 'held' → `claimLock` + hard-block "DO NOT STOP THE BATCH" | Nothing — it actively **dragged** any non-owning session into batch work when the lock aged past 45 min |
| 5 | **The other Stop/prompt guards** (dashboard, prep, render-verify, queue-order, tasks-spec, ci-status, conciseness, card-topic, integrity, dashboard-reminder) | Turn end / user prompt | **Ownership-blind** — they pushed batch duties (publish the board, do prep, verify renders) onto ANY session, owner or not |
| 6 | **Manual** (`claude -p` by hand, a second VS Code window) | Via path 1 | Same advisory-only handling |
| 7 | **Model context momentum** | A restarted interactive session with batch context simply continues its plan | Nothing mechanical — the 'held' message was a suggestion |

Advisory-only checks that had to become hard: the check-then-set claim
(`lockStatus`+`claimLock`), the age-only 12-min liveness, the unconditional
authorized claim, reboot-equals-death, the conscription claims in the heartbeat
hook and progress guard, and the ownership-blindness of the whole guard chain.

## B. The hard singleton (implemented)

One module — `scripts/batch-singleton.mjs` — is now the sole authority.
`scripts/batch-lock.mjs` keeps only the pause API and a read-only lock view;
`lockStatus`/`claimLock`/`releaseLock` are gone.

### 1. Owner lock with REAL liveness

`.claude/batch-lock.json` (schema v2, field-compatible with old readers) holds
`sessionId`, `claimedAt` (heartbeat), `pid` + `pidStartedAt` (the owning
**claude.exe** process, resolved once at acquisition by walking the hook's
parent chain via CIM — verified live on this machine), `kind`
(`session`/`pending-spawn`), `acquiredAt`. The PostToolUse hook refreshes the
heartbeat **only for the owner**.

`assessOwner()` decides liveness conservatively — dead means *provably* dead:

- heartbeat < 5 min (`DEAD_CONFIRM_MS`) → **alive**, no probe needed. A fresh
  heartbeat always wins — **reboot alone is never sufficient** when a
  re-claimed session has heartbeat-ed after the boot (the mandated case).
- heartbeat predates the current boot → **dead** (no claude survives a reboot;
  a live re-claimed session would have written a post-boot heartbeat).
- pid recorded: `kill(pid,0)` + start-time comparison (pid-reuse detection).
  **Alive pid ⇒ alive owner, regardless of heartbeat age** — this is the exact
  fix for the incident (mid-long-tool-call ≠ dead). Hours-stale + alive is
  flagged `wedged`: still never silently replaced; the launcher notifies the
  user (and may kill only a wedged process it spawned itself).
- legacy lock without pid: generous 45-min age bound.

### 2. ATOMIC acquisition (test-and-set)

- First claim: exclusive file create (`openSync(…, 'wx')`) — one winner by the OS.
- Takeover of a dead lock: a **reap mutex** (`mkdirSync` of
  `batch-lock.json.reaping` — atomic) serializes reapers; *inside* the mutex the
  lock is re-read and re-assessed, so a racer can never clobber a freshly
  re-claimed live lock; then unlink + `'wx'` create. A crashed reaper's mutex
  (> 60 s) is cleared, with `mkdir` still the atomic point.
- A corrupt lock file younger than 60 s is treated as mid-write → held.
- Proven by REAL races: six concurrent node processes on a free lock and on a
  dead-owner lock each produce exactly one `acquired`
  (`batch-singleton-core.test.mjs`, scenario 1).

### 3. STAND-DOWN everywhere

`heldByOtherLiveOwner(sid)` gates the **entire** guard chain: dashboard-guard,
prep-guard, batch-progress-guard, render-verify-guard, queue-order-guard,
tasks-spec-guard, ci-status-guard, dashboard-conciseness/card-topic/integrity
guards, and the UserPromptSubmit dashboard-reminder (which instead prints an
explicit STAND-DOWN notice). A session that does not hold the live lock is
treated as paused — no block, no push, no dashboard/prep duty. The
progress-guard is the only Stop-time acquirer, and only via the atomic
`acquire`; a missing session id now errs toward stand-down (the OS launcher
guarantees progress, so idling a ghost is safe; conscripting one is not).
The SessionStart 'held' branch prints an explicit STAND-DOWN instruction
(no batch actions, no merges, no TASKS/dashboard edits) plus the manual
override commands for the user.

### 4. The launcher spawns only through the same lock

`batch-autostart.mjs` now: assesses the owner with the full pid probe → skips
while alive (or wedged) → on provable death performs the **atomic acquire of a
`pending-spawn` lock BEFORE spawning** (acquire loses ⇒ no spawn — the race
window is closed); after spawning it rebinds the pending lock to the child pid.
The spawned session's SessionStart **converts** the pending lock to itself only
if its own claude ancestor pid matches `spawnedPid` (or the fresh one-shot
marker vouches) — `convertPendingSpawn` refuses on any non-pending lock, so no
authorization can ever override a live session again. A pending lock with a
dead child reaps normally after 10 min.

### 5. Active detector + auto-remediation

Detection signals (repo-scoped, subagent-safe):

- The SessionStart hook records every **top-level** session id in
  `.claude/sessions-seen.json`; the PostToolUse hook stamps per-sid activity in
  `.claude/session-activity.json`. `classifyParallel()` flags a sid that (a) is
  a recorded top-level session, (b) is not the owner, (c) has tool activity
  fresher than 10 min. Subagents/worktree agents never fire SessionStart, so
  they can never be flagged (tested).
- Frequency: **every turn end** (wired into `batch-progress-guard.mjs`) and
  **every launcher tick** (`batch-autostart.mjs`, time-based even when no
  session is stopping).

Remediation, automatic and logged:

- The non-owner stands down by the guard gates (above) and is told so at the
  next user prompt.
- The **launcher kills a rogue spawn of its own making** (its recorded child
  pid alive but not the lock owner, past the 10-min pending grace), logs it to
  `autostart.log` and notifies via ntfy. A rogue *interactive* session is never
  killed — it is stood down and the user is notified urgently.
- The **owner is blocked into verification**: the progress guard raises
  `.claude/parallel-alert.json` and blocks with the instruction to run
  `node scripts/batch-doctor.mjs --gate`. The doctor gathers the repo state
  (half-done merge, dirty tree, conflict markers, main↔origin divergence,
  TASKS.md parseability), plans via the pure `batch-doctor-core.mjs`, executes
  safe fixes, and gates the destructive-looking ones behind `--repair`:
  - half-done merge → `git merge --abort`;
  - unattributable concurrent edits → **quarantine stash** (named, recoverable);
  - diverged `main` → **rescue branch** (`rescue/parallel-<ts>`) then hard
    reset to `origin/main` (the published, known-good lineage) — suspect work
    is thrown away from `main` but never lost, and the discard is logged loudly;
  - behind-only → fast-forward; ahead-only = normal owner state, untouched;
  - mangled TASKS.md / conflict markers → alert-level, fixed by hand.
  Every detection and action is appended to `.claude/doctor.log`; a consistent
  verdict (optionally with the `--gate` fast gate green) marks the alert
  handled and the batch continues.

### 6. Test coverage (all green: `npx vitest run scripts/`)

1. Two racing starters → exactly one wins — real child processes, free lock
   AND dead-owner takeover.
2. Live owner, fresh heartbeat → starter refuses (incl. post-reboot).
3. Provably dead owner (stale + dead pid / pre-boot heartbeat / pid reuse) →
   takeover allowed.
4. The reboot case with a fresh re-claimed heartbeat → NO spawn; plus the true
   incident root cause pinned: stale heartbeat + LIVE pid → NO spawn.
5. Non-owner at the progress guard → stands down (never conscripted; missing
   sid also stands down); owner + unhandled alert → block-remediate; owner
   normal → block-continue.
6. Detector: genuine second session flagged; subagents and stale sessions not.
7. Doctor planner: consistent → continue; diverged → rescue+reset (repair-
   gated); dirty-during-parallel → quarantine; owner WIP alone → untouched.

## Apply steps (for the main session — in this order)

1. **Confirm the rogue session is gone.** pid 25848 (e9407cae's claude) was
   still alive during the analysis but exited on its own by 09:12 local.
   Verify: `Get-Process -Id 25848` must error ("no longer running"); if a
   process with that id exists, check its StartTime — only `claude` started
   24.07.2026 06:51:16 would be the rogue (`Stop-Process -Id 25848 -Force`).
2. **Merge** `feat/batch-singleton` into `main`; run the fast gate
   (`npx vitest run scripts/` + `npm run lint`).
3. **Delete the stale old-format lock and alert state** so the new code starts
   clean: `.claude/batch-lock.json`, `.claude/parallel-alert.json` (if
   present), `.claude/autostart-last.json`, `.claude/autostart-state.json`.
4. **`.claude/settings.json`: NO change required.** Every hook keeps its
   registered script name (SessionStart → batch-resume-hook, SessionEnd →
   lock-release-hook, PostToolUse "" → lock-heartbeat-hook, Stop chain
   unchanged, UserPromptSubmit → dashboard-reminder-hook). The
   timestamp-guard entries are untouched.
5. **Restart the interactive session** (hooks reload only at session start) so
   its SessionStart runs the atomic acquire and records the pid identity.
   Verify with `node scripts/batch-singleton.mjs status` (expect this
   session as owner, `pid-alive`).
6. When ready to resume the batch: delete `.claude/batch-paused`.
7. **Re-enable the scheduled task — ONLY after steps 1–6 are done and verified**
   (the singleton merged to `main`, the rogue pid dead, the old lock deleted,
   `status` showing the expected owner):
   `Enable-ScheduledTask -TaskName 'HoA-Batch-Autostart'`
   Optional (elevated shell, per the task's ACL): tighten the tick from 15 to
   5 min — the launcher is cheap and now spawn-safe:
   ```powershell
   $t = Get-ScheduledTask -TaskName 'HoA-Batch-Autostart'
   $t.Triggers[0].Repetition.Interval = 'PT5M'
   Set-ScheduledTask -TaskName 'HoA-Batch-Autostart' -Trigger $t.Triggers
   ```
