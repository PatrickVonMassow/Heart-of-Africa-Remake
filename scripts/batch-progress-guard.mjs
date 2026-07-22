// Stop hook (user mandate 22.07.2026): GUARANTEE the batch never idle-stops.
// While open, non-deferred TASKS points remain and .claude/batch-paused is absent,
// this BLOCKS the turn from ending — the assistant must continue the next item (and
// wait for a running validation by POLLING within the turn, never by yielding).
//
// Ownership-aware (Fable-5 audit #10): it blocks only the session that OWNS the
// batch lock (or that legitimately becomes the owner). A different, still-live
// session — e.g. a second VS Code window the user opened to chat — is allowed to
// stop, so it is never dragged into batch work. Refreshes this session's lock when
// it blocks. Format-safe (#12): a TASKS.md whose checkboxes no longer parse blocks
// with a warning instead of silently reading "complete". Fail-open on any error.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { lockStatus, claimLock, isPaused } from './batch-lock.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))

let sid = ''
try {
  sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin — proceed without an id (treated as owner, errs toward blocking) */
}

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

try {
  if (isPaused()) process.exit(0) // user-paused: a clean stop is allowed

  const text = readFileSync(TASKS, 'utf8')
  const open = []
  let sawCheckbox = false
  let sawDone = false
  for (const l of text.split('\n')) {
    if (/^- \[/.test(l)) sawCheckbox = true
    if (/^- \[x\] \d+\./.test(l)) sawDone = true
    const m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.push(Number(m[1]))
  }

  // Format sanity: checkboxes exist but nothing parses as a point → do NOT read
  // this as "batch complete" and silently allow idle.
  if (open.length === 0 && sawCheckbox && !sawDone) {
    block(
      'TASKS.md format not recognized (checkbox lines exist but no "- [ ] N." points parsed). ' +
        'Do NOT treat this as a finished batch. Check TASKS.md formatting before stopping.',
    )
  }
  if (open.length === 0) process.exit(0) // batch complete: a clean stop is allowed

  // Ownership: a DIFFERENT live session owns the batch → this one is not the
  // worker → let it stop (do not drag a second/chat window into the batch).
  if (sid && lockStatus(sid, Date.now()) === 'held') process.exit(0)

  // This session is (or now becomes) the batch worker — refresh ownership + block.
  if (sid) { try { claimLock(sid, Date.now()) } catch { /* no lock dir */ } }

  const list = open.slice(0, 12).join(', ') + (open.length > 12 ? ', …' : '')
  block(
    `DO NOT STOP THE BATCH. ${open.length} open TASKS point(s) remain (${list}) and the batch is not ` +
      `paused. Continue the NEXT queue item now — implement it, commit, push, tick it. If a validation ` +
      `is running, WAIT by POLLING within this turn (read the log file / TaskOutput), never by ending the ` +
      `turn to idle. Keep the dashboard current as you go. The batch went idle for HOURS after silent ` +
      `stops; that must not recur. The ONLY legitimate ways to end this turn: (a) every point is done, or ` +
      `(b) the user asked you to stop — then create .claude/batch-paused and stop. If you are blocked on a ` +
      `user decision for EVERY open item, that is also a legitimate pause: create .claude/batch-paused with ` +
      `a reason and add a "Von dir zu klären" dashboard card. Otherwise pick a DIFFERENT open item.`,
  )
} catch {
  process.exit(0) // never hard-block on a guard error
}
