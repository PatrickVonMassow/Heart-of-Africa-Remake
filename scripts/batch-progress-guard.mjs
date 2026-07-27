// Stop hook (user mandate 22.07.2026): GUARANTEE the batch never idle-stops.
// While open, non-deferred TASKS points remain and .claude/batch-paused is absent,
// this BLOCKS the turn from ending — the assistant must continue the next item (and
// wait for a running validation by POLLING within the turn, never by yielding).
//
// HARD SINGLETON (24.07.2026, after the e9407cae double-session incident):
//   - It pushes ONLY the session that holds the live batch lock. A non-owner
//     session STANDS DOWN unconditionally (allowed to stop, never conscripted)
//     — even a session with no readable session id. Ownership is only ever
//     gained through the ATOMIC acquire in scripts/batch-singleton.mjs; the
//     old check-then-claim conscription is gone.
//   - ACTIVE PARALLEL-SESSION DETECTOR: each turn-end, the owner checks for a
//     second live top-level session (fresh tool activity by a non-owner sid in
//     THIS repo — subagents never register, so they are never flagged). On
//     detection it blocks with a remediation instruction: verify the repo with
//     scripts/batch-doctor.mjs before any further batch work.
// POINT BOUNDARY (27.07.2026, point 373): ending is no longer always an idle
// stop. When the session has recorded a boundary (scripts/batch-boundary.mjs)
// for a point the WORK ORDER confirms closed, and the OS launcher is really
// ARMED, this guard ALLOWS the stop — the fresh session the launcher brings up
// carries the next point at a fraction of the context cost. A boundary claim for
// a point still open, or with an unarmed launcher, blocks exactly as before.
// Format-safe: a TASKS.md whose checkboxes no longer parse blocks with a warning
// instead of silently reading "complete". Fail-open on any error.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  acquire,
  heartbeat,
  detectParallel,
  raiseParallelAlert,
  readUnhandledAlert,
  progressGuardDecision,
} from './batch-singleton.mjs'
import { gatherBoundary, clearBoundary } from './batch-boundary.mjs'
import { LAUNCHER_TASK_NAME } from './batch-boundary-core.mjs'
import { isPaused } from './batch-lock.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))

let sid = ''
try {
  sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin — sid stays empty → this session can never be conscripted */
}

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

try {
  const paused = isPaused()

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
  const formatSuspect = open.length === 0 && sawCheckbox && !sawDone

  // Ownership through the atomic acquire ONLY (it refuses while a live other
  // owner exists, resolves races to one winner, and refreshes when it is ours).
  let ownership = 'none'
  if (sid && !paused && open.length > 0) {
    ownership = acquire(sid) // 'acquired' | 'mine' | 'held' | 'lost-race'
  }

  // Active detector (owner only): a second live top-level session?
  let unhandledAlert = null
  if (ownership === 'mine' || ownership === 'acquired') {
    const parallel = detectParallel(sid)
    if (parallel.length > 0) {
      raiseParallelAlert({ detectedBy: 'batch-progress-guard', ownerSid: sid, parallel })
    }
    unhandledAlert = readUnhandledAlert()
    try {
      heartbeat(sid)
    } catch {
      /* best effort */
    }
  }

  // Boundary claim (point 373) — only ever gathered for the owning session, and
  // only that path probes the OS scheduled task.
  let bound = { marker: null, boundary: null, launcher: 'unknown' }
  if (ownership === 'mine' || ownership === 'acquired') {
    try {
      bound = gatherBoundary(sid)
    } catch {
      /* an unreadable marker is simply no boundary → the ordinary block applies */
    }
  }

  const decision = progressGuardDecision({
    sid,
    paused,
    openCount: open.length,
    formatSuspect,
    ownership,
    unhandledAlert: !!unhandledAlert,
    boundary: bound.boundary,
    launcher: bound.launcher,
  })

  if (decision === 'allow-boundary') {
    // Consume the marker: it authorised THIS stop, not the next one. The batch
    // LOCK is deliberately NOT released — a session that frees it while its own
    // process is still winding down invites the launcher to spawn a successor
    // beside it, which is the double-session class this project already paid
    // for. The successor takes over the honest way, once the pid is provably
    // dead.
    clearBoundary()
    process.exit(0)
  }

  if (decision === 'block-launcher') {
    block(
      `POINT BOUNDARY REFUSED — point ${bound.boundary?.point ?? '?'} is closed, but the OS launcher task ` +
        `"${LAUNCHER_TASK_NAME}" is ${bound.launcher}, so NOTHING would restart the batch and ending here ` +
        `would strand it. Keep working: continue with the next open point in this session. To make the ` +
        `boundary usable, the user must run \`Enable-ScheduledTask -TaskName '${LAUNCHER_TASK_NAME}'\` in an ` +
        `elevated PowerShell (the assistant cannot); verify with \`node scripts/batch-boundary.mjs --status\`.`,
    )
  }

  if (decision === 'allow' || decision === 'stand-down') process.exit(0)

  if (decision === 'block-format') {
    block(
      'TASKS.md format not recognized (checkbox lines exist but no "- [ ] N." points parsed). ' +
        'Do NOT treat this as a finished batch. Check TASKS.md formatting before stopping.',
    )
  }

  if (decision === 'block-remediate') {
    const who = (unhandledAlert.parallel ?? []).map((p) => p.sid).join(', ') || 'unknown'
    block(
      `PARALLEL SESSION DETECTED (${who}) — a second top-level session has run tools in this repo ` +
        `within the last minutes. You hold the batch lock; the other session's guards make it stand ` +
        `down, but its writes may already be in the tree. Before ANY further batch work: run ` +
        `\`node scripts/batch-doctor.mjs --gate\` and follow its verdict (exit 2 → rerun with ` +
        `--repair; it quarantines/rescues suspect work recoverably and logs every action to ` +
        `.claude/doctor.log). Also verify the dashboard and TASKS.md match main. When the doctor ` +
        `reports "consistent", continue the batch.`,
    )
  }

  const list = open.slice(0, 12).join(', ') + (open.length > 12 ? ', …' : '')
  const claim =
    bound.boundary && bound.boundary.reason !== 'no-marker' && !bound.boundary.valid
      ? `A boundary was claimed for point ${bound.boundary.point ?? '?'} but REFUSED (${bound.boundary.reason}) — ` +
        'a marker does not close a point; the work order does. Merge and tick it first. '
      : ''
  block(
    `DO NOT STOP THE BATCH. ${claim}${open.length} open TASKS point(s) remain (${list}) and the batch is not ` +
      `paused. Continue the NEXT queue item now — on its own feat/<point>-<slug> branch off main: ` +
      `implement it, commit + push the branch after every commit, merge to main only when it is ` +
      `complete + verified, and tick it in TASKS.md on main at the merge (CLAUDE.md §6). If a validation ` +
      `is running, WAIT by POLLING within this turn (read the log file / TaskOutput), never by ending the ` +
      `turn to idle. Keep the dashboard current as you go. The batch went idle for HOURS after silent ` +
      `stops; that must not recur. The legitimate ways to end this turn: (a) every point is done; ` +
      `(b) the user asked you to stop — then create .claude/batch-paused and stop; (c) you have just ` +
      `MERGED AND TICKED a point, and NO delegated agent is still in flight — that is a POINT BOUNDARY, so ` +
      `END THE SESSION instead of pulling the next point into this context (the context is the batch's ` +
      `dominant cost): run \`node scripts/batch-boundary.mjs <the closed point>\`, and when it confirms, ` +
      `stop. The OS launcher starts a fresh session and batch-resume-hook re-orients it from TASKS.md. ` +
      `Let a running agent pool DRAIN first — ending mid-flight throws its work away. If you are blocked on a ` +
      `user decision for EVERY open item, that is also a legitimate pause: create .claude/batch-paused with ` +
      `a reason and add a "Von dir zu klären" dashboard card. Otherwise pick a DIFFERENT open item.`,
  )
} catch {
  process.exit(0) // never hard-block on a guard error
}
