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
// TAKING it (28.07.2026, point 388) is the other half, and the half that was
// missing: permission to stop and the ACT of handing over are different things.
// A session that closed a point and recorded NO marker is now BLOCKED with the
// one command that takes the boundary, and the stop this guard allows RELEASES
// the batch to the launcher (markHandover) — the night of 28.07.2026 the turn
// ended, the process lived on, the lock stayed held and the launcher skipped 21
// ticks in a row. The handover is written HERE and nowhere else: only this branch
// has established a fresh session-bound marker, a verifiably closed point and an
// armed launcher. A crash, a wedge or an ordinary turn end never reaches it.
// WAITING IS NOT IDLING (28.07.2026, point 388, fifth live finding): this guard
// could not see work it had HANDED OUT. With three delegated agents building and
// a browser suite running, it blocked eight turn ends in a row demanding the next
// queue item — which the session could not start (pool at its cap, the suite on
// the machine the next item needed), so eight replies reached nobody. A session
// may now DECLARE what it waits on (scripts/batch-in-flight.mjs) and the stop is
// allowed while a probe still confirms that work is running. It is not a way off
// the block: the declaration expires, its evidence is re-proved every turn end,
// and the lock stays HELD, so nothing is handed over to anyone.
// THE USER TAKES THE BATCH BACK (28.07.2026, point 395): the night belongs to
// fresh sessions, but the way BACK was missing. A window the user returns to
// records a CLAIM (scripts/batch-claim.mjs); this guard is where the owner SEES
// it, and — at the first CLEAN turn end, never mid-merge and never with a
// delegated agent or a verification still running — RELEASES the lock and says so
// in its own transcript. It is the boundary's sibling: there the batch goes to
// the launcher, here it goes to the window the user is sitting at, which is why
// the claim is honoured ahead of a valid boundary.
// Format-safe: a TASKS.md whose checkboxes no longer parse blocks with a warning
// instead of silently reading "complete". Fail-open on any error.
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  acquire,
  detectParallel,
  markHandover,
  raiseParallelAlert,
  readUnhandledAlert,
  progressGuardDecision,
  readOwnerLock,
  release,
  BOUNDARY_LOG_PATH,
} from './batch-singleton.mjs'
import { gatherBoundary } from './batch-boundary.mjs'
import { LAUNCHER_TASK_NAME } from './batch-boundary-core.mjs'
import { gatherInFlight } from './batch-in-flight.mjs'
import { describeInFlight } from './batch-in-flight-core.mjs'
import { clearClaim, gatherClaim, gitOperationInProgress, markClaimReleased } from './batch-claim.mjs'
import { describeClaim, releaseDecision, reservationDecision } from './batch-claim-core.mjs'
import { isPaused } from './batch-lock.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
// One source of truth with the withdrawal that cancels these lines (finding 3):
// both sit beside the lock, so a redirected lock redirects the log with it.
const BOUNDARY_LOG = BOUNDARY_LOG_PATH

/** Leave a trace of every handover — the acceptance evidence for point 388, and
 *  the line that tells a later reader why the launcher took over a live pid. */
const record = (line) => {
  try {
    appendFileSync(BOUNDARY_LOG, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* best effort — a guard never fails over its own bookkeeping */
  }
}

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

/** ALLOW, but say something. A hook payload without a `decision` lets the stop
 *  through; `systemMessage` surfaces the line to the session and the user. Used
 *  where the stop is legitimate but something the session believes is NOT true —
 *  a handover that did not reach the lock, or a guard that failed open. */
const warn = (message) => {
  try {
    process.stdout.write(JSON.stringify({ systemMessage: message }))
  } catch {
    /* best effort */
  }
  try {
    process.stderr.write(`[batch-progress-guard] ${message}\n`)
  } catch {
    /* best effort */
  }
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
  //
  // A RESERVATION COMES FIRST (point 395), the same one the launcher and the
  // resume hook honour. With the lock FREE, an honoured claim belongs to the
  // window the user is sitting at, and a THIRD window must not acquire into that
  // gap: it would take the lock the owner has just released, see the claim, judge
  // the moment clean and release again — churn, a repeated "handed back" message
  // and RELEASED spam in the boundary log. The claimant's own claim never reserves
  // against itself (assessClaim answers `mine`, not `honour`), so the window the
  // batch is waiting for still acquires here. Only asked when there is no lock to
  // acquire against, and free when no claim file exists.
  let ownership = 'none'
  if (sid && !paused && open.length > 0) {
    let reserved = false
    if (!readOwnerLock()) {
      try {
        reserved = !reservationDecision({ assessment: gatherClaim(sid) }).acquire
      } catch {
        /* an unreadable claim reserves nothing */
      }
    }
    if (!reserved) ownership = acquire(sid) // 'acquired' | 'mine' | 'held' | 'lost-race'
  }

  // A pending CLAIM (point 395) — gathered before the parallel detector, because
  // the claiming window IS a second live top-level session and would otherwise be
  // flagged as a rogue one. That block demands the doctor before any further batch
  // work, which is the one thing a handover never gets past; and a session that
  // announced itself through the sanctioned channel is not the covert second
  // driver the detector was written for. Cheap: with no claim file on disk this
  // returns before any probe runs.
  let claimInfo = { claim: null, honour: false, reason: 'not-gathered', claimantSid: null, mine: false }
  if (ownership === 'mine' || ownership === 'acquired') {
    try {
      claimInfo = gatherClaim(sid, { ownerLock: readOwnerLock() })
      // The claim has done its job the moment its OWN window owns the batch — the
      // same line the resume hook runs at its acquire. Left lying about, it would
      // keep the launcher standing down for the rest of its expiry while the
      // window it was written for is already working.
      if (claimInfo.mine) clearClaim()
    } catch {
      /* an unreadable claim is simply no claim → nothing changes */
    }
  }

  // Active detector (owner only): a second live top-level session?
  let unhandledAlert = null
  if (ownership === 'mine' || ownership === 'acquired') {
    const parallel = detectParallel(sid, {
      exclude: claimInfo.honour && claimInfo.claimantSid ? [claimInfo.claimantSid] : [],
    })
    if (parallel.length > 0) {
      raiseParallelAlert({ detectedBy: 'batch-progress-guard', ownerSid: sid, parallel })
    }
    unhandledAlert = readUnhandledAlert()
    // NO extra heartbeat here. `acquire` above already refreshed the lock (it
    // heartbeats on 'mine' and writes a fresh lock on 'acquired'), so this call
    // only ever rewrote the same small file a second time within milliseconds —
    // and the THIRD rewrite of the turn, markHandover, was the one that failed
    // with EPERM three times on 28.07.2026 while a scanner still held the file
    // the previous rename had just replaced. Writing the lock less is one of the
    // TWO defences; the other is the bounded retry in scripts/atomic-write.mjs.
    // There is deliberately no third: the write stays atomic — temp plus rename,
    // never an in-place truncate — so a concurrent reader can never see half a
    // lock (point 340). Where every attempt still fails, markHandover reports it
    // and the allow below says so.
  }

  // Boundary claim (point 373) — only ever gathered for the owning session, and
  // only that path probes the OS scheduled task.
  let bound = { marker: null, boundary: null, launcher: 'unknown', due: null }
  if (ownership === 'mine' || ownership === 'acquired') {
    try {
      bound = gatherBoundary(sid)
    } catch {
      /* an unreadable marker is simply no boundary → the ordinary block applies */
    }
  }

  // Declared in-flight work (point 388, fifth live finding) — gathered only for
  // the owner, and it returns before any probe runs when nothing is declared, so
  // an ordinary turn end pays nothing for it.
  let inFlight = { live: false, reason: 'not-gathered', summary: '', declaration: null }
  if (ownership === 'mine' || ownership === 'acquired') {
    try {
      inFlight = gatherInFlight(sid)
    } catch {
      /* an unreadable declaration is simply no declaration → the ordinary block */
    }
  }

  // IS THIS A CLEAN MOMENT TO HAND THE BATCH BACK? Only asked when a claim is
  // actually honoured, so the git probe costs an ordinary turn end nothing. A
  // merge, a building agent and a running verification all make it 'wait' — the
  // claim then simply stays pending and is honoured at the next turn end.
  let claimVerdict = { verdict: 'none', reason: claimInfo.reason }
  if (claimInfo.honour) {
    try {
      claimVerdict = releaseDecision({
        assessment: claimInfo,
        inFlightLive: inFlight.live === true,
        gitOperation: gitOperationInProgress(),
      })
    } catch {
      /* cannot judge cleanliness → do NOT release (the safe direction) */
      claimVerdict = { verdict: 'wait', reason: 'cleanliness-unverifiable' }
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
    boundaryDue: bound.due,
    inFlight: inFlight.live === true,
    claim: claimVerdict.verdict,
  })

  if (decision === 'allow-release') {
    // HAND THE BATCH BACK. A real release, not a handover: the user is not the
    // launcher, and leaving a lock behind that names a session which is done would
    // only make the claiming window wait for a grace window it should not have to.
    // The claim is stamped rather than deleted, so `--status` in the other window
    // can say the batch is waiting for it, and the launcher keeps standing down
    // until it is taken or the claim expires.
    const who = describeClaim(claimInfo)
    let released = false
    try {
      released = release(sid)
      markClaimReleased(claimInfo.claim, { by: sid })
    } catch {
      released = false
    }
    record(
      released
        ? `RELEASED to ${claimInfo.claimantSid} by ${sid} — the batch was claimed back into the user's window.`
        : `RELEASE FAILED for ${claimInfo.claimantSid} by ${sid} — the lock is unchanged and still held.`,
    )
    warn(
      released
        ? `YOU HAVE HANDED THE BATCH BACK. ${who} claimed it, this is a clean moment (nothing in flight, no ` +
            `merge half-done), so the batch lock was RELEASED. You are no longer the batch worker: do not start ` +
            `another point, do not merge to main, do not edit TASKS.md or the dashboard. The claiming window ` +
            `takes it with \`node scripts/batch-claim.mjs --session <its id>\`. This turn may end.`
        : `THE RELEASE DID NOT HAPPEN. ${who} claimed the batch and this stop is allowed, but the lock could ` +
            `NOT be released, so that window will keep waiting. Release it by hand: ` +
            `\`node scripts/batch-singleton.mjs release\`.`,
    )
    process.exit(0)
  }

  // Said at every turn end that does NOT release, so the owner knows somebody is
  // waiting and why it is still holding on.
  const claimNote =
    claimVerdict.verdict === 'wait'
      ? ` A CLAIM IS PENDING (${describeClaim(claimInfo)}): the user wants the batch back in their own window, ` +
        `and it is released at the first CLEAN turn end — this one is not clean (${claimVerdict.reason}). ` +
        `Finish what is in flight; do not start anything new.`
      : ''

  if (decision === 'allow-in-flight') {
    // The stop is allowed because the session is WAITING, and it says on what —
    // in the log and to the session — so a later reader of the transcript can see
    // why the turn ended instead of guessing at another silent stop.
    const what = describeInFlight(inFlight, inFlight.declaration)
    record(`WAIT by ${sid} — stop allowed while declared work runs: ${what}`)
    warn(
      `THE BATCH IS WAITING, NOT IDLE: ${what}. This turn may end; the batch lock stays HELD and nothing was ` +
        `handed over, so no successor will be spawned beside you. The declaration stops holding the moment any ` +
        `of that evidence stops checking out, and it expires on its own — so when the work lands, ACT on it ` +
        `(merge the agent, read the suite result), then either re-declare what is still running ` +
        `(\`node scripts/batch-in-flight.mjs --waiting-on …\`) or clear it (\`--clear\`).` +
        (bound.due ? ` Note: the boundary for point ${bound.due} is still DUE — take it once the wait is over.` : '') +
        claimNote,
    )
    process.exit(0)
  }

  if (decision === 'allow-boundary') {
    // HAND THE BATCH OVER (point 388). Waiting for the old process to die was
    // the flaw: an interactive window fires no SessionEnd, so the lock could
    // outlive the work by hours. The handover is not a release — the lock keeps
    // naming this session, work that CONTINUES the batch withdraws it again, and
    // a still-live pid buys the successor's spawn a grace window. The singleton
    // therefore still admits exactly one working session.
    //
    // THE WRITE COMES FIRST, AND THE MARKER IS NOT CONSUMED (live findings 1+2,
    // 28.07.2026). It used to run the other way round: clearBoundary(), then a
    // markHandover that threw EPERM straight into the fail-open catch. The stop
    // proceeded with the marker gone, no handover on the lock and nothing saying
    // so — and the next turn demanded the boundary again, a loop. The marker now
    // survives its own use: it is withdrawn by work that continues the batch,
    // never by being spent, so a Stop guard that sends the session back for a
    // timestamp or a review record does not un-take the boundary.
    const point = bound.boundary?.point ?? null
    const handed = markHandover(sid, { point })
    if (handed.handed) {
      record(
        `HANDOVER point ${point ?? '?'} by ${sid} — lock marked handed-over; the launcher may spawn the ` +
          `successor.${handed.attempts > 1 ? ` (the write needed ${handed.attempts} attempts)` : ''}`,
      )
      process.exit(0)
    }
    // The stop may proceed — a guard never traps a session — but it must NEVER
    // proceed silently, or the session stops believing it passed the batch on.
    const why = handed.reason === 'write-failed' ? String(handed.error?.message ?? handed.error) : handed.reason
    record(`HANDOVER FAILED point ${point ?? '?'} by ${sid} — ${why}; the lock is unchanged and still held.`)
    warn(
      `THE HANDOVER DID NOT HAPPEN. The boundary for point ${point ?? '?'} is valid and this stop is allowed, ` +
        `but the batch lock could NOT be marked handed-over (${why}), so the launcher will keep seeing a live ` +
        `owner and will NOT spawn a successor. Do not stop believing the batch was passed on: retry with ` +
        `\`node scripts/batch-boundary.mjs ${point ?? '<point>'}\` and end the turn again, or release the lock ` +
        `by hand (\`node scripts/batch-singleton.mjs release\`) once this session is really finished. The ` +
        `boundary marker was deliberately left in place, so a retry needs no new one.`,
    )
    process.exit(0)
  }

  if (decision === 'block-take-boundary') {
    block(
      `TAKE THE POINT BOUNDARY — point ${bound.due} was closed in this session and no boundary is recorded, so ` +
        `ending here would leave the batch STANDING STILL: the session would sit alive on the batch lock and the ` +
        `launcher would skip every tick (that cost five and a half idle hours on 28.07.2026). Do ONE of two ` +
        `things. (a) If the point is finished and NO delegated agent is still in flight, hand over: run ` +
        `\`node scripts/batch-boundary.mjs ${bound.due}\` and then stop — the batch is passed to a fresh session ` +
        `that the OS task starts and batch-resume-hook re-orients, which is how the context cost stays down. ` +
        `(b) If work is still in flight (an agent pool draining, a verification running, the merge unfinished), ` +
        `CONTINUE it in this turn — poll, never idle — and take the boundary when it is done. If you cannot ` +
        `poll it inside this turn, DECLARE the wait instead: \`node scripts/batch-in-flight.mjs --waiting-on ` +
        `"<what>" --branch <agent branch> --pid <background run> --log <its log>\`. The stop is then allowed ` +
        `while a probe still finds that work running — and blocked again the moment it does not.` +
        claimNote,
    )
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
      `(a2) you are WAITING on work already handed out that you cannot poll further in this turn — a ` +
      `delegated agent still building, a suite occupying the machine: DECLARE it with \`node ` +
      `scripts/batch-in-flight.mjs --waiting-on "<what>" --branch <agent branch> --worktree <its worktree> ` +
      `--pid <background run> --log <its log>\` and the stop is allowed while a probe still finds that work ` +
      `alive (it expires, and one dead item ends it — so act as soon as the work lands); ` +
      `(b) the user asked you to stop — then create .claude/batch-paused and stop; (c) you have just ` +
      `MERGED AND TICKED a point, and NO delegated agent is still in flight — that is a POINT BOUNDARY, so ` +
      `END THE SESSION instead of pulling the next point into this context (the context is the batch's ` +
      `dominant cost): run \`node scripts/batch-boundary.mjs <the closed point>\`, and when it confirms, ` +
      `stop. The OS launcher starts a fresh session and batch-resume-hook re-orients it from TASKS.md. ` +
      `Let a running agent pool DRAIN first — ending mid-flight throws its work away. If you are blocked on a ` +
      `user decision for EVERY open item, that is also a legitimate pause: create .claude/batch-paused with ` +
      `a reason and add a "Von dir zu klären" dashboard card. Otherwise pick a DIFFERENT open item.` +
      claimNote,
  )
} catch (e) {
  // Never hard-block on a guard error — but never allow a stop SILENTLY either:
  // this path is indistinguishable from "the batch may end", and a night was
  // lost to a stop nobody could account for afterwards. Since 28.07.2026 it is
  // said OUT LOUD as well as logged: five of these lines were written before
  // anyone noticed, and each one was a handover that never happened.
  const why = (e && e.message) || e
  record(`FAIL-OPEN: the guard errored and allowed the stop (${why}).`)
  warn(
    `THE BATCH GUARD FAILED OPEN and allowed this stop without deciding anything (${why}). If you were at a ` +
      `point boundary, the handover did NOT happen — check \`node scripts/batch-boundary.mjs --status\` and ` +
      `\`node scripts/batch-handover-observe.mjs\` before assuming the batch was passed on.`,
  )
  process.exit(0)
}
