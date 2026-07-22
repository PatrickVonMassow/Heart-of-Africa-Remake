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
   The launcher spawns a headless `claude -p` to resume the batch **only** when no
   live session is working it. Liveness = the lock's `claimedAt` heartbeat, plus a
   **boot-time check**: a lock claimed before the machine booted belongs to a dead
   session, so a reboot is detected deterministically and resurrected at once.
   Guards: skips while paused, while the batch is complete, and while a session is
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
| 8 | Two sessions (scheduler + a manually opened one) | lock heartbeat + launcher liveness skip + SessionStart lock-contention handling + `MultipleInstances IgnoreNew` | slight redundancy at worst, never a stop |
| 9 | A guard has a bug / throws | all guards are **fail-open** (error → allow) so they can never freeze the session; the scheduler still backstops the idle case | none |
| 10 | `claude.exe` moved by an app update | launcher globs `claude-code\*\claude.exe` and picks the newest | none |
| 11 | Batch stuck on one item (needs data / a user decision) | the guard says "pick a DIFFERENT open item"; only if ALL are user-blocked does it pause with a `Von dir zu klären` card | correct behaviour — nothing to do without the user |
| 12 | Scheduled task deleted (by the user or a cleanup tool) | — | not recoverable by the agent; re-create with the command below |

## Extra hardening after the reboot/visibility probing (22.07)

- **Resurrection actually resumes.** The launcher spawns at 12-min lock staleness,
  but the SessionStart hook treats a lock as "held by another live session" until
  45-min `STALE_MS` — so a spawned session would have refused to resume in that
  window. The launcher now writes a one-shot `autostart-authorized` marker;
  SessionStart, seeing it, claims the lock and resumes regardless of lock age.
- **A live lock never falsely reads dead.** `scripts/lock-heartbeat-hook.mjs`
  (PostToolUse, every tool) refreshes `claimedAt` continuously, so a long working
  turn cannot age the lock past the launcher's window and trigger a redundant
  (now-authorized, colliding) spawn.
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
