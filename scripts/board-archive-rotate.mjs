// Keeps the board's Erledigt section and its decision log at their caps (point
// 371; the log since the user order of 22.09.2026) by moving the oldest cards
// onto the archive page. Every tick adds a card, so without this
// the guard's `erledigt-overflow` would be a chore to fix by hand each time —
// and a rule that is tedious to satisfy is a rule that gets waived.
//
//   node scripts/board-archive-rotate.mjs        # rotate and report
//   node scripts/board-archive-rotate.mjs --check # report only, exit 1 if due
//
// The two files are published artefacts, not sources (both are git-ignored):
// rotate, then publish — board-publish.mjs pushes BOTH pages in one commit.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { ENTSCHEIDUNGEN_ON_BOARD, ERLEDIGT_ON_BOARD } from './dashboard-guard-core.mjs'
import { rotateBoardArchives } from './board-core.mjs'
import { REPUBLISH } from './board-remedy.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const ARCHIVE = resolve(REPO_ROOT, '.batch-dashboard-archive.html')

const check = process.argv.includes('--check')
// NORMALISED BEFORE ANYTHING IS MEASURED (point 439): a board an editor wrote
// back in Windows text mode made the rotation throw mid-`attest`, so both files
// are read and written back LF-normalised.
const rawBoard = readFileSync(BOARD, 'utf8')
if (!existsSync(ARCHIVE)) throw new Error(`archive page missing: ${ARCHIVE}`)
const rawArchive = readFileSync(ARCHIVE, 'utf8')
// BOTH CAPPED SECTIONS IN ONE PASS (user order 22.09.2026): Erledigt and the
// decision log each keep their newest cards; the rest go to their own section
// of the one archive page, and both link paragraphs are rewritten with counts.
const r = rotateBoardArchives({ board: rawBoard, archive: rawArchive })
const due = r.moved.done + r.moved.log

if (check) {
  if (due) {
    console.error(`board holds ${r.moved.done} done and ${r.moved.log} decision card(s) over the cap — due to move to the archive page`)
    process.exit(1)
  }
  console.log(`board is within its caps (${ERLEDIGT_ON_BOARD} done, ${ENTSCHEIDUNGEN_ON_BOARD} decisions) — nothing to rotate`)
  process.exit(0)
}
if (r.board !== rawBoard) writeFileSync(BOARD, r.board)
if (r.archive !== rawArchive) writeFileSync(ARCHIVE, r.archive)
if (!due) {
  console.log(`board within its caps (${ERLEDIGT_ON_BOARD} done, ${ENTSCHEIDUNGEN_ON_BOARD} decisions) — nothing to rotate`)
  process.exit(0)
}
console.log(`moved ${r.moved.done} done and ${r.moved.log} decision card(s) to the archive (archive: ${r.archived.done} done, ${r.archived.log} decisions)`)
console.log(`${REPUBLISH} (the publisher pushes board and archive together)`)
