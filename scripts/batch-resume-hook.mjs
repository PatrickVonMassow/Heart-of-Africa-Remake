// SessionStart hook: auto-resume the TASKS.md batch (user mandate 2026-07-14 —
// the batch must complete autonomously; no session may sit idle waiting for a
// "continue"). Prints the resume instruction only while TASKS.md still has
// unticked points AND it is safe to resume:
//   - a user PAUSE marker (.claude/batch-paused) suppresses auto-resume entirely
//     until an explicit go (added 2026-07-14 after a parallel-instance stop);
//   - a batch LOCK held by another still-fresh session suppresses it too, so two
//     Claude instances never work the same repo in parallel.
// Otherwise the hook claims the lock for this session and emits the instruction.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { lockStatus, claimLock, readLock, isPaused, pauseReason } from './batch-lock.mjs'

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
        `${header} Standing user instruction: continue the batch autonomously per ` +
          'CLAUDE.md/TASKS.md (implement -> docs -> tests on both layers -> full regression -> ' +
          'atomic commit + push -> tick), point by point, then the Closing steps — without ' +
          'waiting for the user to say "continue". First check git status and any in-progress ' +
          'point for work already underway, and do not double-start regressions. This session ' +
          'now holds the batch lock (.claude/batch-lock.json); refresh it as you work (claimLock) ' +
          'and release it (releaseLock) or set the pause marker when you stop.',
      )
    }
  }
} catch {
  // No TASKS.md — nothing to resume; stay silent.
}
