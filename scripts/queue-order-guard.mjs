// Stop hook (user mandate 22.07.2026): GUARANTEE the batch rules the assistant
// repeatedly broke despite reminders — (1) the dashboard Warteschlange works
// known-bug FIXES before the finder/QA tickets (memory
// queue-order-fixes-before-finders) and renders the work order's own sequence,
// (1c) an APPENDED point is ranked once, deliberately, before the turn ends
// (point 590), and (2) no dashboard card claims a point is done
// ("behoben"/"erledigt"/…) while it is still open in TASKS.md. The
// decision logic lives in queue-order-guard-core.mjs (pure, Vitest-covered);
// this wrapper only reads the two files and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { writeTextAtomic } from './atomic-write.mjs'
import { evaluate } from './queue-order-guard-core.mjs'
import { closedPointsOf, openPointsOf } from './board-queue-core.mjs'
import { ARCHIVE_PATH } from './tasks-source.mjs'
import { RANK_RECORD_PATH, parseRankRecord, settleRecord } from './queue-rank-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { repoPath } from './repo-paths.mjs'

const TASKS = repoPath('TASKS.md')
const DASHBOARD = repoPath('.batch-dashboard.html')
const RANKS = repoPath(RANK_RECORD_PATH)
const PAUSE = repoPath('.claude/batch-paused')

/** A file's text, or '' where it is not there — this guard never fails over a
 *  file it only consults. */
const readIfPresent = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

/** The guard's I/O half, shared with the preflight (point 365 D). */
export function gatherQueueOrderInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  // A checkout without TASKS.md STANDS DOWN — deliberately, and not the same as
  // reading it as empty: the core would then see every queue card as pointing at
  // a point that does not exist and block on a broken checkout, which is a guard
  // bug trapping the session. The pre-refactor code threw here and fell open;
  // this keeps that outcome, but says so instead of relying on the throw.
  if (!existsSync(TASKS)) return { applicable: false, why: 'no TASKS.md in this checkout' }
  return {
    applicable: true,
    inputs: {
      // A MISSING BOARD IS NO LONGER A STAND-DOWN (point 590). The board rules
      // simply have nothing to judge without one — dashboard-guard owns that
      // case — but the append gate is a statement about the work order alone,
      // and standing the whole guard down would let a checkout with no board yet
      // append-and-forget its way past it.
      dashboardHtml: existsSync(DASHBOARD) ? readFileSync(DASHBOARD, 'utf8') : '',
      tasksMd: readFileSync(TASKS, 'utf8'),
      rankRecordJson: existsSync(RANKS) ? readFileSync(RANKS, 'utf8') : null,
    },
  }
}

/**
 * Move the provenance baseline to the order as it now stands — the one thing this
 * guard writes.
 *
 * WHY THE GUARD KEEPS IT. The baseline is "the open set when nothing was
 * outstanding", and the turn end is the only moment that is known to be true; a
 * point that lands closes without anybody running the rank CLI, and a baseline
 * that never dropped it would let it back in unquestioned when it reopens.
 * `settleRecord` refuses to move while a question stands, so this can never
 * swallow an unranked append. Atomic, and wrapped: a guard that throws is a guard
 * that traps the session, and no write is worth that.
 */
function settleBaseline({ tasksMd, rankRecordJson }, path = RANKS) {
  try {
    const record = parseRankRecord(rankRecordJson)
    // QUIET IS NOT SILENT. A torn record makes the gate draw no verdict — fail-open
    // by decree — and that is exactly the state nobody would notice, because the
    // only thing that used to say so was a CLI nobody runs while the gate is quiet.
    // Blocking would trap the session, so the guard says it instead.
    if (record.torn) {
      console.error(
        `queue-order-guard: ${RANK_RECORD_PATH} does not parse — the append gate is QUIET until it is ` +
          'repaired. Which copy can be restored depends on the git state, and the CLI establishes it: ' +
          'node scripts/queue-rank.mjs --status',
      )
    }
    // A WORK ORDER MID-MERGE IS NOT A READING (cross-vendor review, ninth pass).
    // Every rule below reads the order it is SHOWN, and a conflicted file shows
    // blocks in an order neither side wrote — enough for an appended point to
    // look deliberately placed and be absorbed into the baseline for good.
    // Conflict markers say so outright, so nothing is concluded from such a file;
    // the guard's own judgment still runs, only no state moves.
    if (/^<{7}|^>{7}/m.test(String(tasksMd ?? ''))) {
      console.error('queue-order-guard: TASKS.md holds conflict markers — not moving the rank baseline from it')
      return
    }
    const open = openPointsOf(tasksMd)
    // THE TICKS, BUT ONLY WHERE THEY ARE NEEDED. A baseline point leaves it
    // because it is no longer in the open order — except when that order reads
    // as EMPTY, where absence proves nothing and the work order's own tick is
    // the evidence instead (see settleRecord). That is the only case worth
    // reading the 1.3 MB archive for, and it is the case that never happens on
    // an ordinary turn.
    const closed = open.length ? [] : closedPointsOf(`${tasksMd}\n${readIfPresent(ARCHIVE_PATH)}`)
    const settled = settleRecord(open, record, { at: new Date().toISOString(), closed })
    if (settled.changed) writeTextAtomic(path, `${JSON.stringify(settled.record, null, 2)}\n`)
  } catch (e) {
    console.error(`queue-order-guard: could not settle the rank baseline (continuing): ${e && e.message}`)
  }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rules are global truth, not session-local */
    }

    const gathered = gatherQueueOrderInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0) // paused / non-owner / no work order

    const result = evaluate(gathered.inputs)
    // The read-only preflight shares `gatherQueueOrderInputs` but never this: an
    // advisory "would you block?" must not move any state.
    settleBaseline(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`queue-order-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
