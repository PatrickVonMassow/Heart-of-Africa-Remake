// DEFER A POINT THAT NEEDS THE USER'S DECISION — without stalling the batch
// (user request 22.07.2026; the mechanism behind it, point 450).
//
// A blocking question must never freeze the batch until an answer arrives, and
// over a fortnight's absence it must not jam the queue either. So instead of a
// blocking AskUserQuestion the assistant: (1) marks the point here, (2) gives it
// a "Von dir zu klären" card on the board, (3) moves on to the next point.
//
//   node scripts/defer-for-user.mjs <point> "<why the user is needed>"
//   node scripts/defer-for-user.mjs --clear <point>     # the answer arrived
//   node scripts/defer-for-user.mjs --forget <point>    # remove a leftover marker
//   node scripts/defer-for-user.mjs --list              # what is waiting, and why
//
// THE REASON IS MANDATORY. The queue skips a gated point *after recording why*,
// and this marker is that record — the only durable one, readable by every
// session and by the board. A gate with no reason is refused here.
//
// WHAT THE MARKER DOES, once written (all of it in scripts/user-gate-core.mjs,
// which documents the syntax):
//   · the board's queue card sorts to the BACK and its meta says, in German,
//     that the point waits on the reader rather than on work;
//   · the queue-order guard stops counting it as open fix work, so a finder
//     queued ahead of it is no longer reported as misordered;
//   · the delegation pool stops offering it as a candidate, so an idle slot
//     owes no reason for work nobody may start.
// `--clear` does not simply delete the marker: it records the ANSWER, which
// puts the point back at the HEAD of the queue — it waited, so it does not
// queue behind everything appended while it did.
import { readFileSync, statSync } from 'node:fs'
import { writeTextAtomic } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'
import { notify } from './notify.mjs'
import { clearMarkers, gateReport, markAnswered, markGated, parseUserGates } from './user-gate-core.mjs'
import { parseWorkablePoints } from './queue-order-guard-core.mjs'

const TASKS = repoPath('TASKS.md')
const today = () => new Date().toISOString().slice(0, 10)

const USAGE = [
  'usage:',
  '  node scripts/defer-for-user.mjs <point> "<why the user is needed>"',
  '  node scripts/defer-for-user.mjs --clear <point>',
  '  node scripts/defer-for-user.mjs --forget <point>',
  '  node scripts/defer-for-user.mjs --list',
].join('\n')

/**
 * TASKS.md IS MAIN-ONLY (CLAUDE.md §6). A linked worktree carries a `.git` FILE
 * rather than a directory, which is the cheapest reliable way to recognise one —
 * and a delegated agent editing the work order in its own worktree is exactly
 * the mistake the main-only rule exists to prevent.
 */
function refuseInWorktree() {
  try {
    if (statSync(repoPath('.git')).isFile()) {
      console.error(
        'defer-for-user: this is a linked worktree, and TASKS.md is main-only. ' +
          'Run this in the main checkout, or report the gate to the session that owns it.',
      )
      process.exit(1)
    }
  } catch {
    /* no .git at all (a tarball checkout) — nothing to refuse */
  }
}

const read = () => readFileSync(TASKS, 'utf8')
const write = (text) => writeTextAtomic(TASKS, text)

const [a, b] = process.argv.slice(2)

if (a === '--help' || a === '-h' || a === undefined) {
  console.log(USAGE)
  process.exit(a === undefined ? 1 : 0)
}

if (a === '--list') {
  const lines = gateReport(read())
  console.log(lines.length ? `user gates in the work order:\n${lines.join('\n')}` : 'no point is waiting on the user')
  process.exit(0)
}

if (a === '--forget') {
  // The leftover case `gateReport` names: a marker still standing on a point
  // that has since been ticked, or a gate that should never have been written.
  refuseInWorktree()
  const n = Number(b)
  if (!Number.isFinite(n)) {
    console.error(USAGE)
    process.exit(1)
  }
  const r = clearMarkers(read(), n)
  if (!r.ok) {
    console.error(`defer-for-user: ${r.error}`)
    process.exit(1)
  }
  write(r.text)
  console.log(`point ${n}: the user-gate markers are removed.`)
  process.exit(0)
}

if (a === '--clear') {
  refuseInWorktree()
  const n = Number(b)
  if (!Number.isFinite(n)) {
    console.error(USAGE)
    process.exit(1)
  }
  const r = markAnswered(read(), n, { at: today() })
  if (!r.ok) {
    console.error(`defer-for-user: ${r.error}`)
    process.exit(1)
  }
  write(r.text)
  console.log(
    r.wasGated
      ? `point ${n}: the answer is recorded — it returns to the HEAD of the queue. Remove its "Von dir zu klären" card and rebuild the board: node scripts/board-queue.mjs`
      : `point ${n} was not gated; it is marked answered anyway and now sorts to the head of the queue.`,
  )
  process.exit(0)
}

refuseInWorktree()
const n = Number(a)
const reason = String(b ?? '').trim()
if (!Number.isFinite(n)) {
  console.error(USAGE)
  process.exit(1)
}
if (!reason) {
  console.error(
    'defer-for-user: a gate needs a REASON — the queue skips the point after recording why it waits.\n' +
      `${USAGE}`,
  )
  process.exit(1)
}

const before = read()
const marked = markGated(before, n, { since: today(), reason })
if (!marked.ok) {
  console.error(`defer-for-user: ${marked.error}`)
  process.exit(1)
}
write(marked.text)

// EVERYTHING GATED IS A DIFFERENT SITUATION and the user must hear about it:
// there is no next point to move on to. The batch is NOT paused from here —
// the lock is another mechanism's to write — but the state is reported loudly
// rather than left to look like an idle session.
const workable = parseWorkablePoints(marked.text)
const gates = parseUserGates(marked.text)
const stranded = workable.size === 0

await notify(
  stranded ? `Point ${n} needs you — and nothing else is workable` : `Point ${n} needs you`,
  `${reason}\n\n${
    stranded
      ? `All ${gates.gated.length} open point(s) now wait on you. Answer in chat or on the board and the batch resumes.`
      : "Answer in chat / on the board; I've moved on to the next point meanwhile."
  }`,
  'high',
)

console.log(`point ${n} marked as waiting on you since ${today()}: ${reason}`)
if (stranded) console.log('EVERY open point now waits on the user — there is no next point to move on to.')
console.log('Now: add its "Von dir zu klären" card, rebuild the board (node scripts/board-queue.mjs) and continue elsewhere.')
console.log('When the answer arrives: node scripts/defer-for-user.mjs --clear ' + n)
process.exit(0)
