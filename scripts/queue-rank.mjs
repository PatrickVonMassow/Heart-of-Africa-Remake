// THE APPEND GATE (point 590) — an appended point is ranked ONCE, deliberately.
//
//   node scripts/queue-rank.mjs --status                          # what is still unranked
//   node scripts/queue-rank.mjs --ranked <N> --why "<one line>"   # last IS right, and why
//   node scripts/queue-rank.mjs --ranked <N> --origin user --why …# the USER ranked it there
//   node scripts/queue-rank.mjs --ahead <N> --why "<one line>"    # it stands BEFORE the release, and why
//   node scripts/queue-rank.mjs --seed --why "<one line>"         # arm: what stands today is judged
//   node scripts/queue-rank.mjs --seed-boundary --why "<one line>" # arm: freeze the front of the order
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
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { writeTextAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { readTasksAll, readTasksOpen } from './tasks-source.mjs'
import { QUEUE_REBUILD_CMD, RELEASE_TAG_POINT, closedPointsOf, openPointsOf } from './board-queue-core.mjs'
import { releaseBoundaryProblemFrom } from './queue-order-guard-core.mjs'
import {
  ORIGIN_MACHINE,
  PLACE_AHEAD,
  PLACE_LAST,
  RANK_CMD,
  RANK_RECORD_PATH,
  SEED_CMD,
  tornRecordMessage,
  appendGateState,
  parseRankRecord,
  pruneRankRecord,
  recordProvenanceFrom,
  recordRank,
  seedBoundary,
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
  // The refusal names the source that HAS a readable copy, established the same
  // way the arming refusal establishes it — a fixed `git checkout HEAD` is wrong
  // wherever HEAD holds no copy, or holds the damage itself (ninth pass).
  if (record.torn) throw new Error(tornRecordMessage(recordProvenance().restore))
  return record
}

/**
 * Store the record, advancing the provenance baseline if — and only if — nothing
 * is outstanding any more. A decision that answers the last open question settles
 * the order in the same write; one that leaves another question standing does
 * not, or the point still in question would be swallowed into the baseline.
 */
function writeRankRecord(record, open, tasksMd = '', path = RECORD) {
  // The ticks matter only where the open order is empty — see settleRecord — and
  // that is also the only case worth reading the whole archive for.
  const closed = open.length ? [] : closedPointsOf(readTasksAll())
  // The release boundary freezes the baseline exactly as an unranked append does
  // (point 789), and it has to be applied HERE as well as in the guard: this
  // command writes the record too, and a settle from either side would remember
  // the breaching point as a survivor and end the question by forgetting it.
  const blocked = releaseBoundaryProblemFrom(tasksMd, record).breaches.map((b) => b.point)
  const settled = settleRecord(open, record, { at: new Date().toISOString(), closed, blocked })
  const next = settled.changed ? settled.record : pruneRankRecord(record, open)
  writeTextAtomic(path, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

/** One git question, answered without a window and without a throw. Injectable
 *  so the unit layer can drive the real output SHAPES — an unmerged stage line,
 *  an intent-to-add stub, a committed deletion — without a repository. */
const runGit = (args) => spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })

/**
 * Does this repository carry the rank record AT ALL — and if it does, which
 * command puts it back?
 *
 * `seedRecord` needs the first half to tell "a checkout that never had a
 * baseline" from "a tracked record somebody moved aside", which is the shape of
 * the escape out of an outstanding rank question. It needs the second because a
 * refusal is only closed by a remedy that WORKS: HEAD, the index and the commit
 * before a committed deletion are three different sources, and naming the wrong
 * one leaves the caller in the refusal (cross-vendor review, sixth pass).
 *
 * IT FAILS CLOSED. Where git says nothing usable — not installed, not a
 * repository, a broken index — the answer is "carried". The one legitimate
 * arming happens before the record is ever committed, so refusing wrongly costs a
 * message that names the restore, while allowing wrongly is the hole itself.
 */
export function recordProvenance(path = RANK_RECORD_PATH, git = runGit) {
  // Fail CLOSED on tracking — refusing wrongly costs a message, allowing wrongly
  // is the hole — but name NO restore: git established nothing here, and a
  // command nobody checked is how a refusal walks the caller into the next one
  // (cross-vendor review, tenth pass). The refusals print the inspection instead.
  const failClosed = { tracked: true, restore: '' }
  // A candidate is only worth NAMING as the remedy if its bytes are a record;
  // restoring torn ones would hand the caller from this refusal into the next.
  const readable = (rev) => {
    const out = git(['cat-file', '-p', rev])
    return out.status === 0 && !parseRankRecord(String(out.stdout ?? '')).torn
  }
  try {
    const inHead = git(['cat-file', '-e', `HEAD:${path}`]).status === 0
    // "<mode> <sha> <stage>\t<path>" — ANY stage proves an entry; only stage 0 is
    // one `git checkout -- <path>` can restore from (1/2/3 are the sides of an
    // unmerged conflict).
    const staged = git(['ls-files', '--stage', '--', path])
    const entry = staged.status === 0 ? (String(staged.stdout ?? '').trim().split('\n')[0] ?? '') : ''
    const match = entry.match(/^\d+ [0-9a-f]+ (\d)\t/)
    const indexStage = match ? Number(match[1]) : null
    const history = git(['rev-list', '-n', '1', 'HEAD', '--', path])
    // git said nothing usable — not installed, not a repository, a broken index.
    // The one legitimate arming happens before the record is ever committed, so
    // refusing wrongly costs a message naming the state, while allowing wrongly
    // is the hole itself.
    if (!inHead && indexStage === null && history.status !== 0) return failClosed
    const removedIn = String(history.stdout ?? '').trim()
    return recordProvenanceFrom({
      headOk: inHead && readable(`HEAD:${path}`),
      indexOk: indexStage === 0 && readable(`:0:${path}`),
      // Only where the copy before the removal is itself readable — otherwise the
      // record is carried but not recoverable from there either.
      removedIn: removedIn && readable(`${removedIn}^:${path}`) ? removedIn : '',
      known: inHead || indexStage !== null || Boolean(removedIn),
    })
  } catch {
    return failClosed
  }
}

/**
 * Put the freshly armed record under git at once.
 *
 * THE ARMING WINDOW IS THE LAST REMOVAL ROUTE (cross-vendor review, seventh
 * pass). `--seed` is refused on a record the repository carries, which leaves
 * exactly one moment where removing the file still reads as "a checkout that
 * never had a baseline": between the first arming and the commit that tracks it.
 * Append a point in that window, delete the record, seed again, and the
 * outstanding question is settled by the collective reason after all. Staging the
 * record closes that window in the same command that opens it — the record is a
 * TRACKED artefact by design, and an armed one sitting outside git is the
 * anomaly. AND IT IS PART OF THE ARMING, NOT AN AFTERTHOUGHT (cross-vendor
 * review, eighth pass): a warning that the staging failed left the record armed
 * but untracked, which is the escape itself. A staging that fails therefore UNDOES
 * the write and refuses, so the checkout is exactly as it was before.
 */
function stageRecord(path = RANK_RECORD_PATH) {
  try {
    const added = runGit(['add', '--', path])
    return added.status === 0 ? '' : String(added.stderr ?? '').trim() || `git add exited ${added.status}`
  } catch (e) {
    return (e && e.message) || 'git add could not be run'
  }
}

/** Put the checkout back as it was before an arming that could not be made
 *  durable — the previous bytes, or no file where there was none. */
function undoWrite(before, path = RECORD) {
  if (before === null) rmSync(path, { force: true })
  else writeTextAtomic(path, before)
}

/** The flags this command DISPATCHES on. Exactly one of them, exactly once. */
export const ACTION_FLAGS = Object.freeze(['--status', '--ranked', '--ahead', '--seed', '--seed-boundary'])

/** The flags that carry a value. Repeating one is the same silent loss: only the
 *  first occurrence is ever read. */
const VALUE_FLAGS = Object.freeze(['--why', '--origin'])

/**
 * WHICH ACTION THIS INVOCATION IS — or a refusal (cross-vendor review, fifth
 * pass).
 *
 * The dispatcher used to test flags one at a time, so a command naming two of
 * them did one and dropped the other WITHOUT SAYING SO: `--seed-boundary --ahead
 * 60` recorded a front decision and armed nothing, and `--ahead 60 --ahead 61`
 * answered for 60 while 61 stood unanswered. Both look like the command
 * succeeded. Exactly one action, each flag once, decided before anything is
 * written; no flag at all is the STATUS read, which is why '' is an answer
 * rather than an error. `--status` counts as an action too (sixth pass): left
 * out, `--status --ahead 60` chose the write and silently dropped the read the
 * caller also asked for.
 */
export function chosenAction(argv = []) {
  const list = Array.isArray(argv) ? argv : []
  const times = (flag) => list.filter((a) => a === flag).length
  for (const flag of [...ACTION_FLAGS, ...VALUE_FLAGS]) {
    if (times(flag) > 1) throw new Error(`${flag} was given ${times(flag)} times — only the first would be read`)
  }
  const given = ACTION_FLAGS.filter((flag) => times(flag) === 1)
  if (given.length > 1) {
    throw new Error(
      `${given.join(' and ')} are different decisions — give ONE of them, and run the command again for the ` +
        'other. Taking one and dropping the rest is how a command reports success for work it never did.',
    )
  }
  return given[0] ?? ''
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
    const tasksMd = readTasksOpen()
    const open = openPointsOf(tasksMd)
    const record = readRankRecord()
    const why = flagValue(argv, '--why')
    // Stated, never inferred: an omitted origin is the MACHINE's, so the user's
    // exemption from the release boundary can only be claimed out loud.
    const origin = flagValue(argv, '--origin') ?? ORIGIN_MACHINE

    // TWO DECISIONS, TWO FLAGS (point 789). `--ranked` answers the APPEND gate —
    // the end of the order is right — and `--ahead` answers the RELEASE rule —
    // it stands in front of the release, and why it cannot wait. Neither reason
    // answers the other question, so neither flag writes the other's record, and
    // an invocation naming more than one action is refused before any write.
    const action = chosenAction(argv)

    if (action === '--ranked' || action === '--ahead') {
      const ahead = action === '--ahead'
      const point = Number(flagValue(argv, action))
      if (!open.includes(point)) throw new Error(`point ${point} is not open in the work order`)
      const place = ahead ? PLACE_AHEAD : PLACE_LAST
      writeRankRecord(recordRank(record, point, { why, origin, place, at: new Date().toISOString() }), open, tasksMd)
      console.log(
        ahead
          ? `queue-rank: point ${point} stands BEFORE the release, filed by the ${origin} — "${why.trim()}"`
          : `queue-rank: point ${point} keeps the place the work order gives it, filed by the ${origin} — ` +
            `"${why.trim()}"`,
      )
      console.log(`Recorded in ${RANK_RECORD_PATH}. Rebuild the board's queue: ${QUEUE_REBUILD_CMD}`)
    } else if (action === '--seed-boundary') {
      // THE FRONT OF THE ORDER, FROZEN ONCE (point 789). Everything standing in
      // front of the release point today counts as the arrangement that predates
      // the rule; every point that reaches the front afterwards is judged on its
      // own. Like `--seed` it is a stated decision rather than something a guard
      // does for itself: an automatic freeze would grandfather the very breach it
      // was looking at.
      const before = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : null
      const next = writeRankRecord(
        seedBoundary(record, open, {
          releasePoint: RELEASE_TAG_POINT,
          why,
          at: new Date().toISOString(),
          present: before !== null,
          ...recordProvenance(),
        }),
        open,
        tasksMd,
      )
      // A FAILED STAGING UNDOES THE WRITE (cross-vendor review, 21.08.2026).
      // Reporting the failure while leaving the freeze on disk is the escape
      // itself: the front — breaches included — would be exempt from the next
      // turn on, out of a command that said it had done nothing.
      const unstaged = stageRecord()
      if (unstaged) {
        undoWrite(before)
        throw new Error(
          `armed nothing: ${RANK_RECORD_PATH} could not be staged (${unstaged}), and a freeze git does not carry ` +
            'is one a later removal cannot be told apart from a front that was never frozen. The checkout is ' +
            'unchanged; fix git and run the command again.',
        )
      }
      console.log(
        `queue-rank: release front frozen with ${next.boundary.points.length} point(s) in front of ` +
          `${RELEASE_TAG_POINT} — "${why.trim()}"`,
      )
      // AND THE WINDOW IS NAMED, exactly as `--seed` names its own (cross-vendor
      // review, 21.08.2026). Staging makes the freeze visible to git, but while
      // HEAD still holds a record WITHOUT a boundary, restoring that version
      // leaves a tracked, present, unarmed record — and the arming would take
      // today's front, breaches included, as legacy order. Only the commit ends
      // that, so the command says so instead of leaving it to be discovered.
      const headRecord = runGit(['cat-file', '-p', `HEAD:${RANK_RECORD_PATH}`])
      if (headRecord.status !== 0 || !parseRankRecord(String(headRecord.stdout ?? '')).boundary) {
        console.log(
          `  COMMIT ${RANK_RECORD_PATH} NOW. Until the repository carries this freeze, restoring the version in ` +
            'HEAD gives back a record that reads as never armed, and the next arming would grandfather whatever ' +
            'stands in front of the release then.',
        )
      }
    } else if (action === '--seed') {
      // THE ARMING BASELINE, and nothing more: the order as it stands today is
      // taken as judged, with one stated reason, so a newly armed (or freshly
      // cloned) checkout does not owe an answer for history nobody in the
      // session judged. Every point appended afterwards is decided individually,
      // and `seedRecord` refuses an already armed record — and a record the
      // repository still carries — so this can never be the shortcut out of an
      // outstanding question, by re-seeding or by removal.
      const before = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : null
      const next = writeRankRecord(
        seedRecord(record, open, {
          why,
          at: new Date().toISOString(),
          present: before !== null,
          ...recordProvenance(),
        }),
        open,
        tasksMd,
      )
      const unstaged = stageRecord()
      if (unstaged) {
        undoWrite(before)
        throw new Error(
          `armed nothing: ${RANK_RECORD_PATH} could not be staged (${unstaged}), and an arming that git does ` +
            'not carry is one a later removal cannot be told apart from a checkout that never had a baseline. ' +
            'The checkout is unchanged; fix git and run the command again.',
        )
      }
      console.log(`queue-rank: baseline armed with ${next.settled.points.length} open point(s) — "${why.trim()}"`)
      // AND THE WINDOW IS NAMED, because only a commit closes it (cross-vendor
      // review, tenth pass). Staging makes the record visible to git, but an
      // uncommitted one can be unstaged and removed again, leaving no trace and
      // no diff — the one state where a later reading cannot tell a removal from
      // a checkout that never had a baseline. Committing it ends that for good,
      // so the command says so instead of leaving it to be discovered.
      if (runGit(['cat-file', '-e', `HEAD:${RANK_RECORD_PATH}`]).status !== 0) {
        console.log(
          `  COMMIT ${RANK_RECORD_PATH} NOW. Until the repository carries it, this arming is only staged, and ` +
            'nothing that reads the checkout later can tell its removal from a baseline that never existed.',
        )
      }
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
      // The FRONT of the order, asked in the same breath as its end (point 789):
      // the append gate says nothing about a point that ranked itself ahead of
      // the release, and the status is where somebody looks before the guard does.
      const boundary = releaseBoundaryProblemFrom(tasksMd, record)
      if (boundary.reason) {
        console.log(`queue-rank: ${boundary.reason}`)
        process.exitCode = 1
      }
    }
  } catch (e) {
    console.error(`queue-rank: ${e.message}`)
    process.exitCode = 1
  }
}
