// Keeps the board's Erledigt section at its cap (point 371) by moving the
// oldest cards onto the archive page. Every tick adds a card, so without this
// the guard's `erledigt-overflow` would be a chore to fix by hand each time —
// and a rule that is tedious to satisfy is a rule that gets waived.
//
//   node scripts/board-archive-rotate.mjs        # rotate and report
//   node scripts/board-archive-rotate.mjs --check # report only, exit 1 if due
//
// The two files are published artefacts, not sources (both are git-ignored):
// rotate, then republish BOTH via the Artifact tool.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { ERLEDIGT_ON_BOARD } from './dashboard-guard-core.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const ARCHIVE = resolve(REPO_ROOT, '.batch-dashboard-archive.html')
const CARD = /<details>\s*<summary>[\s\S]*?<\/details>\s*/g

/** The Erledigt section's inner HTML, and where it sits in the board. */
function erledigtSpan(html) {
  const start = html.indexOf('<details class="sect">\n<summary><h2>Erledigt</h2></summary>')
  if (start < 0) throw new Error('Erledigt section not found — did the board markup change?')
  const footer = html.indexOf('<footer', start)
  return { start, end: footer < 0 ? html.length : footer }
}

const check = process.argv.includes('--check')
const board = readFileSync(BOARD, 'utf8')
const { start, end } = erledigtSpan(board)
const section = board.slice(start, end)
const cards = section.match(CARD) ?? []
const over = cards.length - ERLEDIGT_ON_BOARD

if (over <= 0) {
  console.log(`board holds ${cards.length}/${ERLEDIGT_ON_BOARD} done cards — nothing to rotate`)
  process.exit(0)
}
if (check) {
  console.error(`board holds ${cards.length} done cards — ${over} due to move to the archive page`)
  process.exit(1)
}
if (!existsSync(ARCHIVE)) throw new Error(`archive page missing: ${ARCHIVE}`)

const moved = cards.slice(ERLEDIGT_ON_BOARD)
let newSection = section
for (const c of moved) newSection = newSection.replace(c, '')
writeFileSync(BOARD, board.slice(0, start) + newSection + board.slice(end))

// The archive lists newest first, like the board, so the overflow goes on top.
const archive = readFileSync(ARCHIVE, 'utf8')
const anchor = archive.indexOf('<h2>')
const at = archive.indexOf('\n', archive.indexOf('</h2>', anchor)) + 1
writeFileSync(ARCHIVE, archive.slice(0, at) + moved.join('') + archive.slice(at))

const after = (readFileSync(BOARD, 'utf8').slice(start).match(CARD) ?? []).length
console.log(`moved ${moved.length} card(s) to the archive; board now holds ${cards.length - moved.length}`)
if (cards.length - moved.length !== ERLEDIGT_ON_BOARD) throw new Error('rotation left the wrong count')
console.log('republish BOTH pages via the Artifact tool, then run dashboard-guard --synced')
void after
