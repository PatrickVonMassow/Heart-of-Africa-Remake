// Point 372 — one command for the board instead of six.
//
// Keeping the board current used to cost six tool calls per change (edit,
// publish, Artifact, --synced, focus, prep), several times per point, each
// billed at the whole context. That is also why the board lagged: a six-step
// ritual gets postponed, a one-step one does not.
//
//   node scripts/board.mjs now    <point> "<status>"  # queue → current work
//   node scripts/board.mjs status <point> "<text>"    # restate a now-card's status
//   node scripts/board.mjs queue  <point> ["<text>"]  # current work → back to queue
//   node scripts/board.mjs done   <point> ["<text>"]  # current work → Erledigt
//   node scripts/board.mjs vdzk-remove "<title>"      # drop an answered question
//   node scripts/board.mjs focus  <point> "<note>"    # declare focus + stamp
//   node scripts/board.mjs attest                     # rotate, publish, audit, confirm
//
// The Artifact publish is tool-bound and cannot be scripted, so the loop is
// exactly: (1) an editing command, (2) the Artifact call, (3) `attest`.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  berlinStamp,
  promoteToNow,
  removeVdzk,
  setCardStatus,
  toDone,
  toNow,
  toQueue,
} from './board-core.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const run = (args) => execFileSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' })


/** Apply a pure card edit, rotate the archive overflow, publish, and say what is left by hand. */
function edit(fn, done) {
  writeFileSync(BOARD, fn(readFileSync(BOARD, 'utf8')))
  console.log(done)
  console.log(run(['scripts/board-archive-rotate.mjs']).trim().split('\n')[0])
  // THE LIVE PAGE IS PUBLISHED HERE (point 400, delta D — four-eyes finding 2).
  // This is the one-command board loop, so a loop that only synced the
  // scratchpad left the LIVE page behind on every edit while the Artifact half
  // cleared the due mark — the launcher would then alert about a board the
  // session had updated exactly as documented, which trains the reader to
  // ignore the one channel that speaks when a session is wedged.
  //
  // A REFUSAL MUST BE READABLE (four-eyes NEW-2). The child's stdio is piped, so
  // a non-zero exit throws — and an uncaught throw here would abort the rest of
  // the loop AND reduce the publisher's whole remedy text to `e.message`. The
  // refusal is the most useful thing it ever prints, so it is printed, and the
  // mirror still runs: the board file is already written either way.
  let published = true
  try {
    console.log(run(['scripts/board-publish.mjs']).trim().split('\n')[0])
  } catch (e) {
    published = false
    console.error(String(e.stderr || '').trimEnd() || `board-publish failed: ${e.message}`)
    console.error('The LIVE page was NOT updated — fix the above, then: node scripts/board-publish.mjs')
    process.exitCode = 1
  }
  console.log(run(['scripts/dashboard-publish.mjs']).trim().split('\n').pop())
  // The success line is GATED (four-eyes NEW-3): printed unconditionally it sat
  // two lines under "The LIVE page was NOT updated", so a session skimming the
  // tail read success in exactly the failure case this reporting exists for.
  if (published) console.log('The live page is updated. Mirror it while the artifact still exists:')
  console.log('NEXT: publish the scratchpad file via the Artifact tool, then: node scripts/board.mjs attest')
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'status') {
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs status <point> "<text>"')
    const at = berlinStamp()
    edit((html) => setCardStatus(html, point, words.join(' '), at), `status of ${point} restated (Stand ${at})`)
  } else if (cmd === 'now') {
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs now <point> "<status>"')
    const at = berlinStamp()
    edit(
      (html) => toNow(html, point, words.join(' '), { stamp: at }),
      `${point} is current work since ${at} (title and estimate taken from its queue card)`,
    )
  } else if (cmd === 'queue') {
    const [point, ...words] = rest
    if (!point) throw new Error('usage: board.mjs queue <point> ["<text>"]')
    edit((html) => toQueue(html, point, { text: words.join(' ') }), `${point} returned to the queue`)
  } else if (cmd === 'done') {
    const [point, ...words] = rest
    if (!point) throw new Error('usage: board.mjs done <point> ["<text>"]')
    const at = berlinStamp()
    edit((html) => toDone(html, point, { text: words.join(' '), end: at }), `${point} archived as done at ${at}`)
  } else if (cmd === 'vdzk-remove') {
    const fragment = rest.join(' ')
    if (!fragment) throw new Error('usage: board.mjs vdzk-remove "<title>"')
    edit((html) => removeVdzk(html, fragment), `open question removed: ${fragment}`)
  } else if (cmd === 'promote') {
    const [point, times, title, ...words] = rest
    if (!point || !times || !title || words.length === 0) {
      throw new Error('usage: board.mjs promote <point> "<times>" "<title>" "<status>"')
    }
    edit(
      (html) => promoteToNow(html, point, { title, times, status: words.join(' ') }),
      `${point} promoted to current work`,
    )
  } else if (cmd === 'focus') {
    const [point, ...words] = rest
    if (!point) throw new Error('usage: board.mjs focus <point> "<note>"')
    console.log(run(['scripts/focus.mjs', 'set', point, words.join(' ')]).trim())
  } else if (cmd === 'attest') {
    // Rotation first: a tick that pushed the Erledigt section past its cap would
    // otherwise fail the audit two steps later, after the Artifact call.
    console.log(run(['scripts/board-archive-rotate.mjs']).trim().split('\n')[0])
    console.log(run(['scripts/dashboard-guard.mjs', '--synced', '.batch-dashboard.html']).trim())
    console.log(run(['scripts/prep-guard.mjs', '--prepped']).trim())
  } else {
    console.error(
      'usage: board.mjs now|status|queue|done <point> "<text>" | vdzk-remove "<title>" | ' +
        'promote <point> "<times>" "<title>" "<status>" | focus <point> "<note>" | attest',
    )
    process.exitCode = 2
  }
} catch (e) {
  console.error(`board: ${e.message}`)
  process.exitCode = 1
}
