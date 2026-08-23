// DEFER ONE NARROW CONFIRMATION — advisory questions are decided and recorded.
//
// Only the closed outward-facing/hard-to-reverse acts in user-gate-core may use
// this gate. An advisory question takes --self-decide, which writes a workable
// SELF-DECIDED marker and its complete retroactive-veto card.
//
//   node scripts/defer-for-user.mjs <point> --act <key> --detail "<what>" --prepared "<what stands prepared>"
//   node scripts/defer-for-user.mjs --self-decide <point> --question "<question>" --decision "<decision>" --evidence "<evidence>" --consequence "<consequence>" --veto-action "<exact action>"
//   node scripts/defer-for-user.mjs --migrate
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
import { execFileSync } from 'node:child_process'
import { writeTextAtomic } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'
import { notify } from './notify.mjs'
import {
  CONFIRMATION_ACTS,
  clearMarkers,
  gateReport,
  markAnswered,
  markGated,
  migrateLegacyGates,
  parseUserGates,
  prepareAdvisoryDecision,
} from './user-gate-core.mjs'
import { parseWorkablePoints } from './queue-order-guard-core.mjs'

const TASKS = repoPath('TASKS.md')
const today = () => new Date().toISOString().slice(0, 10)

const USAGE = [
  'usage:',
  `  node scripts/defer-for-user.mjs <point> --act <${Object.keys(CONFIRMATION_ACTS).join('|')}> --detail "<the concrete act>" --prepared "<the safe prepared state>"`,
  ...Object.entries(CONFIRMATION_ACTS).map(([key, what]) => `      --act ${key}  — ${what}`),
  '  node scripts/defer-for-user.mjs --self-decide <point> --question "<question>" --decision "<decision>" --evidence "<evidence>" --consequence "<consequence>" --veto-action "<exact action>"',
  '  node scripts/defer-for-user.mjs --migrate',
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

/**
 * A FLAG IS NEVER A VALUE (fifth cross-vendor round, GPT-5.6 Sol, 23.08.2026).
 * `--detail --prepared "verified locally"` used to store the literal
 * `"--prepared"` as the detail: a typed gate, or a decision card, with a field
 * nobody wrote. A missing or flag-shaped value is no value, and the field check
 * downstream then names exactly which one is missing.
 */
const option = (args, name) => {
  const i = args.indexOf(name)
  if (i < 0) return ''
  const value = String(args[i + 1] ?? '')
  return value.startsWith('--') ? '' : value.trim()
}

/** The short spellings this command answers — today only `-h`. A repeat is a
 *  repeat whichever spelling it was written in, so the check compares the flag
 *  a token MEANS, not the characters it was typed with (sixth cross-vendor
 *  round, GPT-5.6 Sol, 23.08.2026: `-h -h` slipped past a check that only ever
 *  looked at `--`). Single-dash tokens that are NOT a known alias stay out of
 *  it — a field value may legitimately begin with a dash.
 */
const FLAG_ALIASES = new Map([['-h', '--help']])

/** The flags that consume NO value. Every OTHER flag takes the next token, and
 *  a token sitting in that value slot is never read as a flag — otherwise a
 *  field whose value is spelled like one would be refused for the wrong reason
 *  (sixth cross-vendor round, GPT-5.6 Sol, 23.08.2026). */
const VALUELESS_FLAGS = new Set(['--help', '-h', '--list', '--migrate'])

/**
 * A REPEATED FLAG IS A MISTAKE, NOT A CHOICE (fifth cross-vendor round, GPT-5.6
 * Sol, 23.08.2026). `indexOf` keeps the FIRST value and drops the rest in
 * silence, so `--decision old --decision new` recorded "old" and said nothing.
 * Whichever the author meant, one of them was going to be wrong.
 */
const repeatedFlag = (args) => {
  const seen = new Set()
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i])
    const previous = i > 0 ? String(args[i - 1]) : ''
    if (previous.startsWith('-') && !VALUELESS_FLAGS.has(previous)) continue
    const flag = FLAG_ALIASES.get(arg) ?? arg
    if (!flag.startsWith('--')) continue
    // Named as it was TYPED, with the flag it means beside it when the two
    // differ — otherwise `--help -h` would be refused under a name the reader
    // cannot find on their own command line.
    if (seen.has(flag)) return arg === flag ? arg : `${arg} (the same flag as ${flag})`
    seen.add(flag)
  }
  return ''
}

/** Add an idempotent decision record before changing TASKS: a marker without
 * its promised card is the worse half-written state. */
function recordDecisionCard(card) {
  try {
    execFileSync(process.execPath, ['scripts/board.mjs', 'vdzk-add', card.title, card.body], {
      cwd: repoPath('.'),
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return
  } catch (error) {
    if (/open question .* already stands under/i.test(String(error?.stderr ?? ''))) return
    throw new Error(`decision card could not be recorded: ${String(error?.stderr ?? error?.message ?? error).trim()}`)
  }
}

const args = process.argv.slice(2)
const [a, b] = args

/* THE REFUSAL COMES FIRST, AND HELP IS NO EXCEPTION (sixth cross-vendor round,
 * GPT-5.6 Sol, 23.08.2026). Answering `--help` before anything was parsed left
 * one command line — `--help --help` — that reached an answer past the refusal,
 * so the rule read as "unless you ask for help". Nothing is lost by closing it:
 * the refusal prints the very usage that line asked for, only on stderr and
 * with a non-zero status, so the reader still gets their answer AND is told
 * they said the flag twice. */
const repeated = repeatedFlag(args)
if (repeated) {
  console.error(`defer-for-user: ${repeated} is given more than once — say it exactly once.\n${USAGE}`)
  process.exit(1)
}

if (a === '--help' || a === '-h' || a === undefined) {
  console.log(USAGE)
  process.exit(a === undefined ? 1 : 0)
}

if (a === '--list') {
  const lines = gateReport(read())
  console.log(lines.length ? `typed user-gate records in the work order:\n${lines.join('\n')}` : 'no typed user-gate record exists')
  process.exit(0)
}

if (a === '--migrate') {
  refuseInWorktree()
  const before = read()
  const migrated = migrateLegacyGates(before, { at: today() })
  if (migrated.entries.length === 0) {
    console.log('migration: no legacy AWAITING-USER marker exists')
    process.exit(0)
  }
  try {
    for (const card of migrated.cards) recordDecisionCard(card)
  } catch (error) {
    console.error(`defer-for-user: ${error.message}`)
    process.exit(1)
  }
  write(migrated.text)
  console.log('legacy user-gate migration:')
  for (const entry of migrated.entries) {
    console.log(`  ${entry.point}: ${entry.verdict} — reason: ${entry.reason || '— none recorded'}`)
  }
  process.exit(0)
}

if (a === '--self-decide') {
  refuseInWorktree()
  const n = Number(b)
  if (!Number.isFinite(n)) {
    console.error(USAGE)
    process.exit(1)
  }
  const before = read()
  const prepared = prepareAdvisoryDecision(before, n, {
    at: today(),
    question: option(args, '--question'),
    decision: option(args, '--decision'),
    evidence: option(args, '--evidence'),
    consequence: option(args, '--consequence'),
    vetoAction: option(args, '--veto-action'),
  })
  if (!prepared.ok) {
    console.error(`defer-for-user: ${prepared.error}`)
    process.exit(1)
  }
  try {
    recordDecisionCard(prepared.card)
  } catch (error) {
    console.error(`defer-for-user: ${error.message}`)
    process.exit(1)
  }
  write(prepared.text)
  console.log(`point ${n}: advisory question SELF-DECIDED; the decision card records evidence, consequence and exact veto action.`)
  console.log('The point remains workable. Rebuild the queue if it is not already present: node scripts/board-queue.mjs')
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
if (!Number.isFinite(n)) {
  console.error(USAGE)
  process.exit(1)
}
// THE ACT IS SELECTED FROM A CLOSED LIST, never described in prose: a sentence
// that merely sounded outward-facing used to park an advisory question.
const act = option(args, '--act')
const detail = option(args, '--detail')
const prepared = option(args, '--prepared')

const before = read()
const marked = markGated(before, n, { since: today(), act, detail, prepared })
if (!marked.ok) {
  console.error(`defer-for-user: ${marked.error}\n${USAGE}`)
  process.exit(1)
}
const reason = parseUserGates(marked.text).gated.find((g) => g.point === n)?.reason ?? ''
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

console.log(`point ${n} marked AWAITING-CONFIRMATION since ${today()}: ${reason}`)
if (stranded) console.log('EVERY open point now awaits a true confirmation — there is no next point to move on to.')
console.log('Now: add its "Von dir zu klären" card, rebuild the board (node scripts/board-queue.mjs) and continue elsewhere.')
console.log('When the answer arrives: node scripts/defer-for-user.mjs --clear ' + n)
process.exit(0)
