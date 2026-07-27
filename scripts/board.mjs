// Point 372 — one command for the board instead of six.
//
// Keeping the board current used to cost six tool calls per change (edit,
// publish, Artifact, --synced, focus, prep), several times per point, each
// billed at the whole context. That is also why the board lagged: a six-step
// ritual gets postponed, a one-step one does not.
//
//   node scripts/board.mjs status <point> "<text>"   # restate a now-card's status
//   node scripts/board.mjs focus  <point> "<note>"   # declare focus + stamp
//   node scripts/board.mjs attest                    # rotate, publish, audit, confirm
//
// The Artifact publish is tool-bound and cannot be scripted, so the loop is
// exactly: (1) an editing command, (2) the Artifact call, (3) `attest`.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { berlinStamp, setCardStatus } from './board-core.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const run = (args) => execFileSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' })


const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'status') {
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs status <point> "<text>"')
    const at = berlinStamp()
    writeFileSync(BOARD, setCardStatus(readFileSync(BOARD, 'utf8'), point, words.join(' '), at))
    console.log(`status of ${point} restated (Stand ${at})`)
    console.log(run(['scripts/dashboard-publish.mjs']).trim().split('\n').pop())
    console.log('NEXT: publish the scratchpad file via the Artifact tool, then: node scripts/board.mjs attest')
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
    console.error('usage: board.mjs status <point> "<text>" | focus <point> "<note>" | attest')
    process.exitCode = 2
  }
} catch (e) {
  console.error(`board: ${e.message}`)
  process.exitCode = 1
}
