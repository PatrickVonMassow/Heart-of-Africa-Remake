// THE APPEND GATE (point 590) — an appended point is ranked ONCE, deliberately.
//
//   node scripts/queue-rank.mjs --status                          # what is still unranked
//   node scripts/queue-rank.mjs --ranked <N> --why "<one line>"   # last IS right, and why
//   node scripts/queue-rank.mjs --seed --why "<one line>"         # arm: what stands today is judged
//
// WHY IT EXISTS. Append-and-defer puts a new point at the END of the work order,
// and since the board's queue is rendered from that order (point 608) the end is
// also where the user sees it. That position is a DEFAULT, not a judgment — on
// 09.08.2026 the freshly appended point 589 landed at the very back although the
// user wanted it worked at once. So the turn that appends a point owes ONE
// decision: move the point's block inside TASKS.md to where it belongs, or record
// here that last is right. `queue-order-guard` blocks the turn end until one of
// the two has happened.
//
// WHICH POINTS ARE NEW is read off the PROVENANCE baseline in the same record —
// the open set as it stood when the order was last settled — never off the
// numbers or the positions (see queue-rank-core.mjs). This command therefore does
// two things on every write: it records the decision, and, once NOTHING is
// outstanding, it advances that baseline to today's order.
//
// THE RECORD IS TRACKED, not runtime state: both halves are repository history,
// and a clone that inherited nothing would re-ask about every point ever appended.
// Decisions about points that are no longer open are dropped on every write — the
// archive keeps the history, this file keeps the live judgments.
import { existsSync, readFileSync } from 'node:fs'
import { writeTextAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { repoPath } from './repo-paths.mjs'
import { readTasksOpen } from './tasks-source.mjs'
import { QUEUE_REBUILD_CMD, openPointsOf } from './board-queue-core.mjs'
import {
  RANK_CMD,
  RANK_RECORD_PATH,
  SEED_CMD,
  TORN_RECORD_MESSAGE,
  appendGateState,
  parseRankRecord,
  pruneRankRecord,
  recordRank,
  seedRecord,
  settleRecord,
} from './queue-rank-core.mjs'

const RECORD = repoPath(RANK_RECORD_PATH)

/**
 * The record as stored. The guard and this CLI read the same bytes through the
 * same parser, and then treat an UNREADABLE file oppositely on purpose: the guard
 * stays quiet, because a guard may draw no verdict from state it cannot read,
 * while this command is LOUD and refuses to act — writing would replace every
 * decision the file holds with the one being made.
 */
export function readRankRecord(path = RECORD) {
  const record = parseRankRecord(existsSync(path) ? readFileSync(path, 'utf8') : null)
  if (record.torn) throw new Error(TORN_RECORD_MESSAGE)
  return record
}

/**
 * Store the record, advancing the provenance baseline if — and only if — nothing
 * is outstanding any more. A decision that answers the last open question settles
 * the order in the same write; one that leaves another question standing does
 * not, or the point still in question would be swallowed into the baseline.
 */
function writeRankRecord(record, open, path = RECORD) {
  const settled = settleRecord(open, record, { at: new Date().toISOString() })
  const next = settled.changed ? settled.record : pruneRankRecord(record, open)
  writeTextAtomic(path, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

function flagValue(argv, flag) {
  const at = argv.indexOf(flag)
  if (at < 0) return null
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

if (isMainModule(import.meta.url)) {
  try {
    const argv = process.argv.slice(2)
    const open = openPointsOf(readTasksOpen())
    const record = readRankRecord()
    const why = flagValue(argv, '--why')

    if (argv.includes('--ranked')) {
      const point = Number(flagValue(argv, '--ranked'))
      if (!open.includes(point)) throw new Error(`point ${point} is not open in the work order`)
      writeRankRecord(recordRank(record, point, { why, at: new Date().toISOString() }), open)
      console.log(`queue-rank: point ${point} keeps the place the work order gives it — "${why.trim()}"`)
      console.log(`Recorded in ${RANK_RECORD_PATH}. Rebuild the board's queue: ${QUEUE_REBUILD_CMD}`)
    } else if (argv.includes('--seed')) {
      // THE ARMING BASELINE, and nothing more: the order as it stands today is
      // taken as judged, with one stated reason, so a newly armed (or freshly
      // cloned) checkout does not owe an answer for history nobody in the
      // session judged. Every point appended afterwards is decided individually.
      const before = appendGateState(open, record)
      const next = writeRankRecord(seedRecord(record, open, { why, at: new Date().toISOString() }), open)
      console.log(
        `queue-rank: baseline armed with ${next.settled.points.length} open point(s) — "${why.trim()}"` +
          (before.pending.length ? ` (this also settles ${before.pending.join(', ')})` : ''),
      )
    } else {
      const state = appendGateState(open, record)
      if (state.state === 'unarmed') {
        console.log(`queue-rank: no baseline recorded — nothing says which of the ${open.length} open point(s) are new.`)
        console.log(`  Arm it once, for the whole order at once: ${SEED_CMD}`)
        process.exitCode = 1
      } else if (state.state === 'settled') {
        console.log(
          `queue-rank: every appended point has been ranked (${state.baseline.length} point(s) in the baseline)`,
        )
      } else {
        console.log(`queue-rank: ${state.pending.length} appended point(s) still unranked: ${state.pending.join(', ')}`)
        console.log(
          '  they stand last because that is where append-and-defer puts them, not because that is where they belong.',
        )
        console.log('  Either MOVE the point’s block inside TASKS.md to where it belongs (verbatim, with its number),')
        console.log(`  or record that last is right: ${RANK_CMD}`)
        process.exitCode = 1
      }
    }
  } catch (e) {
    console.error(`queue-rank: ${e.message}`)
    process.exitCode = 1
  }
}
