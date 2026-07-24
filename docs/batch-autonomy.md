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
   Fail-open: any error → allow (so a guard bug can never freeze the session).
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
   exists. The spawn itself goes through the SAME atomic acquire (a
   `pending-spawn` lock is won BEFORE spawning; losing the race means no spawn).
   Guards: skips while paused, while the batch is complete, and while the owner is
   alive; a debounce marker avoids double-spawns; it finds the newest bundled
   `claude.exe` dynamically (survives app updates).

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
- **Trust self-heals.** A headless `claude -p` in an untrusted workspace ignores
  the allow-list (a permission prompt would hang the unattended run). The launcher
  sets `hasTrustDialogAccepted` for the repo in `~/.claude.json` before spawning.

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
   it. The live dashboard artifact also likely does not update headlessly (publishing
   needs the claude.ai connection a `-p` run may lack). So while the user is away the
   batch progresses and is visible on **GitHub**; the live chat + dashboard resume
   when the user reopens VS Code + a Claude chat (SessionStart then resumes visibly).
   This is a hard limit of an interactive-extension chat, not a hole to patch.

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
tool work, and publish parity (repo file bytes == the content last handed to the
Artifact tool, recorded automatically by the PostToolUse heartbeat — so
"edited" can never masquerade as "live"; the two-file repo/scratchpad split is
bridged by `scripts/dashboard-publish.mjs`).

The standard cycle after any dashboard edit:
`node scripts/dashboard-publish.mjs` → Artifact publish of the synced scratchpad
file (same artifact url) → `node scripts/dashboard-guard.mjs --synced
.batch-dashboard.html` (which doubles as the focus confirmation when card and
focus agree). On every work switch: `node scripts/focus.mjs set <N> "<what>"`.
Headless sessions without the Artifact tool record
`dashboard-publish.mjs --defer "<reason>"` — a logged escape valve covering the
current content only. What stays judgment: the machine verifies the card's
POINT NUMBER, publish state and freshness, never the truth of the prose.

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
