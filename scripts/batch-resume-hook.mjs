// SessionStart hook: auto-resume the TASKS.md batch (user mandate 2026-07-14 —
// the batch must complete autonomously; no session may sit idle waiting for a
// "continue"). Prints the resume instruction only while TASKS.md still has
// unticked points AND it is safe to resume:
//   - a user PAUSE marker (.claude/batch-paused) suppresses auto-resume entirely
//     until an explicit go (added 2026-07-14 after a parallel-instance stop);
//   - a batch LOCK held by another still-fresh session suppresses it too, so two
//     Claude instances never work the same repo in parallel.
// Otherwise the hook claims the lock for this session and emits the instruction.
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { lockStatus, claimLock, readLock, isPaused, pauseReason } from './batch-lock.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Where git stands: current branch + whether a merge is half-done. A resumed
 *  session must know this — a crash can leave a stale feature branch or a
 *  conflicted index checked out (feature-branch workflow). Empty on any git
 *  failure (never blocks the hook). */
function gitStanding() {
  try {
    const g = (args) =>
      execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    const branch = g(['rev-parse', '--abbrev-ref', 'HEAD'])
    let merging = false
    try {
      const p = g(['rev-parse', '--git-path', 'MERGE_HEAD'])
      merging = existsSync(isAbsolute(p) ? p : join(REPO_ROOT, p))
    } catch {
      /* unknown merge state — report just the branch */
    }
    return (
      `Git: on branch "${branch}"` +
      (merging
        ? ' — a MERGE IS IN PROGRESS (conflicted/half-done index): resolve and finish it, or abort it, FIRST.'
        : '.')
    )
  } catch {
    return ''
  }
}

// The OS autostart launcher (batch-autostart.mjs) writes this one-shot marker
// when it spawns a session to TAKE OVER a dead batch. It authorizes THIS session
// to resume regardless of the lock's age — the launcher already decided the
// previous session is dead (12-min freshness + boot check), which the 45-min
// STALE_MS here would otherwise not yet agree with. Recent (<10 min) + one-shot.
const AUTH_PATH = fileURLToPath(new URL('../.claude/autostart-authorized.json', import.meta.url))
function autostartAuthorized(nowMs) {
  try {
    const m = JSON.parse(readFileSync(AUTH_PATH, 'utf8'))
    return m && typeof m.at === 'number' && nowMs - m.at < 10 * 60 * 1000
  } catch {
    return false
  }
}
function clearAuthorized() {
  try {
    rmSync(AUTH_PATH)
  } catch {
    /* already gone */
  }
}

// SessionStart hooks receive a JSON payload on stdin ({ session_id, source, … }).
// A missing id falls back to a fresh random id, which errs toward NOT resuming
// (an unknown session can never match a fresh lock → treated as 'held').
let sessionId = randomUUID()
try {
  const parsed = JSON.parse(readFileSync(0, 'utf8'))
  if (typeof parsed.session_id === 'string' && parsed.session_id) sessionId = parsed.session_id
} catch {
  // no/!JSON stdin — keep the random fallback
}

try {
  const tasks = readFileSync(new URL('../TASKS.md', import.meta.url), 'utf8')
  // Unticked point lines, MINUS the ones the user explicitly deferred: a point
  // line carrying a `DEFERRED` marker is excluded from the batch and must never
  // auto-resume (2026-07-15 fix — a parallel session resumed onto the excluded
  // point 96 because the "except 96/100" exclusion lived only in the chat, not
  // where this hook could see it). The exclusion now travels in TASKS.md itself.
  const openLines = tasks.split('\n').filter((l) => /^- \[ \] \d+\./.test(l))
  const open = openLines.filter((l) => !/\bDEFERRED\b/.test(l))
  if (open.length === 0) {
    // Nothing actionable — the batch is finished, or every remaining point is
    // user-deferred. Start silently either way.
  } else {
    const nums = open.map((l) => l.match(/\d+/)[0]).join(', ')
    const header = `[batch-resume] TASKS.md has ${open.length} open point(s): ${nums}.`
    const now = Date.now()
    if (isPaused()) {
      const why = pauseReason()
      console.log(
        `${header} The batch is PAUSED by the user (.claude/batch-paused${why ? `: ${why}` : ''}). ` +
          'Do NOT auto-resume — wait for an explicit go from the user. When the user ' +
          'says to continue, clear the pause marker (scripts/batch-lock.mjs clearPaused, ' +
          'or delete .claude/batch-paused) before resuming.',
      )
    } else if (autostartAuthorized(now)) {
      // The OS autostart launcher spawned this session to resurrect a dead batch.
      claimLock(sessionId, now)
      clearAuthorized()
      console.log(
        `${header} ${gitStanding()} Resumed by the OS autostart launcher (the previous session was ` +
          'dead). Continue the batch autonomously per CLAUDE.md/TASKS.md — feature-branch workflow ' +
          '(§6): each point on its OWN feat/<point>-<slug> branch off main; implement -> docs -> ' +
          'tests -> atomic commit + push the BRANCH after every commit; merge to main ONLY when the ' +
          'point is complete + verified (tests green; render/GUI changes picture-checked on BOTH ' +
          'backends); TASKS.md is MAIN-only — tick the point on main at the merge; cross-cutting ' +
          'changes (guards, docs, dashboard, process files) go directly to main. Then the Closing. ' +
          'Read the handoff memory resume-184-qa-framework first. This session now holds the batch ' +
          'lock; do NOT idle-stop (the batch-progress-guard enforces this). First check git status ' +
          'AND the checked-out branch above for work already underway.',
      )
    } else if (lockStatus(sessionId, now) === 'held') {
      const lock = readLock()
      const ageMin = Math.round((now - lock.claimedAt) / 60000)
      console.log(
        `${header} But the batch LOCK is held by ANOTHER session (claimed ${ageMin} min ago, ` +
          '.claude/batch-lock.json). Do NOT auto-resume — another Claude instance is (or was) ' +
          'working the batch, and two instances on one repo collide on git and the dev server. ' +
          'Tell the user the batch appears active elsewhere; resume only if the user confirms ' +
          'this is the sole instance (then delete the lock file or wait for it to go stale).',
      )
    } else {
      claimLock(sessionId, now)
      console.log(
        `${header} ${gitStanding()} Standing user instruction: continue the batch autonomously per ` +
          'CLAUDE.md/TASKS.md, point by point, then the Closing steps — without waiting for the ' +
          'user to say "continue". Feature-branch workflow (§6): each point on its OWN ' +
          'feat/<point>-<slug> branch off main; implement -> docs -> tests on both layers -> full ' +
          'regression -> atomic commit + push the BRANCH after every commit; merge to main ONLY ' +
          'when the point is complete + verified (tests green; render/GUI changes picture-checked ' +
          'on BOTH backends); TASKS.md is MAIN-only — tick the point on main at the merge; ' +
          'cross-cutting changes (guards, docs, dashboard, process files) go directly to main. ' +
          'First check git status AND the checked-out branch above for work already underway, and ' +
          'do not double-start regressions. This session now holds the batch lock ' +
          '(.claude/batch-lock.json); refresh it as you work (claimLock) and release it ' +
          '(releaseLock) or set the pause marker when you stop.',
      )
    }
  }
} catch {
  // No TASKS.md — nothing to resume; stay silent.
}
