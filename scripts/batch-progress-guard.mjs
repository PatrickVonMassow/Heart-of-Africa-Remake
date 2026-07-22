// Stop hook (user mandate 22.07.2026): GUARANTEE the batch never idle-stops.
// The repeated failure it prevents: ending a turn while the batch still has open
// TASKS points and nothing is scheduled to resume — which left the batch sitting
// idle for HOURS. Reminders and "measures" that were only discipline or that
// needed a session restart kept failing, so this is a HARD block.
//
// While there are open, non-deferred TASKS points AND the user has not paused the
// batch (.claude/batch-paused), this BLOCKS the turn from ending. The assistant
// must then continue the next queue item — and, if a validation is running, WAIT
// for it by POLLING within the turn (read its log / TaskOutput), never by yielding
// to idle. The ONLY clean ways to end a turn: the batch is complete, or the user
// asked to stop (create .claude/batch-paused).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const TASKS = R('../TASKS.md')
const PAUSE = R('../.claude/batch-paused')

try {
  if (existsSync(PAUSE)) process.exit(0) // user-paused: a clean stop is allowed
  const lines = readFileSync(TASKS, 'utf8').split('\n')
  const open = []
  for (const l of lines) {
    const m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.push(Number(m[1]))
  }
  if (open.length === 0) process.exit(0) // batch complete: a clean stop is allowed

  const list = open.slice(0, 12).join(', ') + (open.length > 12 ? ', …' : '')
  const reason =
    `DO NOT STOP THE BATCH. ${open.length} open TASKS point(s) remain (${list}) and the batch is not ` +
    `paused. Continue the NEXT queue item now — implement it, commit, push, tick it. If a validation ` +
    `is running, WAIT by POLLING within this turn (read the log file / TaskOutput), never by ending the ` +
    `turn to idle. Keep the dashboard current as you go. The batch went idle for HOURS after silent ` +
    `stops; that must not recur. The ONLY legitimate ways to end this turn: (a) every point is done, or ` +
    `(b) the user asked you to stop — then create the file .claude/batch-paused and stop. If you are ` +
    `blocked on a user decision for the current item, pick a DIFFERENT open item instead of stopping.`
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
} catch {
  process.exit(0) // never hard-block on a guard error
}
