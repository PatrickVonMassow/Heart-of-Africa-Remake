// One-off backfill (point 1535, user 17.11.2026): every done card on the board
// and on its archive page shows "Umgesetzte Maßnahmen" instead of "Stand der
// Umsetzung". The measures texts live in `board-done-measures.json`, written
// from each point's merged `feat/<N>-*` branch; a point with no unique merge on
// main, or with no text, gets "Maßnahmen nicht mehr nachvollziehbar.".
//
//   node scripts/board-done-backfill.mjs --dry      # report only, write nothing
//   node scripts/board-done-backfill.mjs            # rewrite both files in place
//   node scripts/board-done-backfill.mjs --subjects <N>   # a point's branch subjects
//
// Afterwards: node scripts/board-publish.mjs (the board itself is not published here).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { withBoardEditLock } from './board-edit-lock.mjs'
import { attributablePoints, backfillArchive, backfillBoard, measuresLookup, mergedPoint } from './board-done-backfill-core.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const ARCHIVE = resolve(REPO_ROOT, '.batch-dashboard-archive.html')
const TEXTS = resolve(REPO_ROOT, 'scripts', 'board-done-measures.json')

const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
// The owner's local main; a clone without one (a cloud checkout) reads origin/main.
const mainRef = () => {
  try {
    git('rev-parse', '--verify', '-q', 'main')
    return 'main'
  } catch {
    return 'origin/main'
  }
}
const mainMerges = () =>
  git('log', mainRef(), '--first-parent', '--merges', '--format=%H %s')
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ sha: line.slice(0, 40), subject: line.slice(41) }))

const args = process.argv.slice(2)
try {
  if (args[0] === '--subjects') {
    const point = Number(args[1])
    if (!Number.isInteger(point)) throw new Error('usage: board-done-backfill.mjs --subjects <point>')
    for (const { sha, subject } of mainMerges().filter((m) => mergedPoint(m.subject) === point)) {
      console.log(`${subject}\n${git('log', '--no-merges', '--format=  %s', `${sha}^1..${sha}^2`)}`)
    }
    process.exit(0)
  }
  const dry = args.includes('--dry')
  const texts = JSON.parse(readFileSync(TEXTS, 'utf8'))
  const lookup = measuresLookup(texts, attributablePoints(mainMerges().map((m) => m.subject)))
  const run = () => {
    const report = []
    for (const [file, transform] of [
      [BOARD, backfillBoard],
      [ARCHIVE, backfillArchive],
    ]) {
      if (!existsSync(file)) {
        report.push(`${file}: missing, skipped`)
        continue
      }
      const { html, cards } = transform(readFileSync(file, 'utf8'), lookup)
      const count = (o) => cards.filter((c) => c.outcome === o).length
      const unknown = cards.filter((c) => c.outcome === 'unknown').map((c) => c.point ?? '?')
      report.push(
        `${file}: ${count('written')} written, ${count('unknown')} not attributable` +
          `${unknown.length ? ` [${unknown.join(', ')}]` : ''}, ${count('kept')} already in the new form`,
      )
      if (!dry) writeFileSync(file, html)
    }
    return report
  }
  const report = dry ? run() : withBoardEditLock(run)
  console.log(report.join('\n'))
  console.log(dry ? 'dry run: nothing written' : 'written; publish with: node scripts/board-publish.mjs')
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
