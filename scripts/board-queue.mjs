// THE QUEUE GENERATOR (point 400, delta C) — rebuild the Warteschlange from the
// work order plus the board's own prose, instead of maintaining it card by card.
//
//   node scripts/board-queue.mjs                    # rebuild the queue section
//   node scripts/board-queue.mjs --check            # report what would change
//   node scripts/board-queue.mjs set <N> "<text>"   # write one point's prose
//   node scripts/board-queue.mjs import             # seed the data from the board
//
// WHY IT HAD TO EXIST (four-eyes review, NEW-1). `board-publish.mjs` refuses a
// board that does not show every open point, and the case that triggers that
// refusal is precisely a freshly appended work-order point with no card
// anywhere. `board.mjs queue <N>` cannot serve it: that command MOVES a
// current-work card back to the queue and throws when there is none. So without
// this CLI the only way out was hand-editing the board HTML — the very thing
// that broke the board three times on 28.07.2026.
//
// TWO WRITERS ON ONE HTML IS THE TRAP the core's header warns about, so the
// generator takes an EXCLUDE set derived from the LIVE document: every point the
// now-cards and "Von dir zu klären" already claim. A card re-added for a point
// already promoted would trip the double-listing invariant (4b) and block the
// turn that published it.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeTextAtomic } from './atomic-write.mjs'
import { REPO_ROOT, STATE_PATH, readJson } from './dashboard-state.mjs'
import { parseKlaerungPoints, parseNowCardPoints } from './dashboard-guard-core.mjs'
import {
  QUEUE_DATA_PATH,
  buildQueueSection,
  importQueueFromHtml,
  openPointsOf,
  parseTaskTitles,
  setQueueEntry,
} from './board-queue-core.mjs'

const state = readJson(STATE_PATH) ?? {}
const boardFile = resolve(REPO_ROOT, state.dashboardPath ?? '.batch-dashboard.html')
const dataFile = resolve(REPO_ROOT, QUEUE_DATA_PATH)
const tasksFile = resolve(REPO_ROOT, 'TASKS.md')
const [cmd, ...rest] = process.argv.slice(2)

const readData = () => (existsSync(dataFile) ? readJson(dataFile) : null)
const writeData = (d) => writeTextAtomic(dataFile, `${JSON.stringify(d, null, 2)}\n`)

/** Board, work order and the exclusions the other sections already own. */
function inputs() {
  if (!existsSync(boardFile)) throw new Error(`board not found: ${boardFile}`)
  const html = readFileSync(boardFile, 'utf8')
  const tasks = readFileSync(tasksFile, 'utf8')
  return {
    html,
    open: openPointsOf(tasks),
    titles: parseTaskTitles(tasks),
    // Erledigt is NOT excluded: a point there is closed, so it is not open, and
    // the open set already leaves it out. Excluding it too would hide a point
    // that is open AND wrongly archived — a real inconsistency the audit reports.
    exclude: [...parseNowCardPoints(html), ...parseKlaerungPoints(html)],
  }
}

try {
  if (cmd === 'set') {
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board-queue.mjs set <N> "<text>"')
    writeData(setQueueEntry(readData(), point, { body: words.join(' ') }))
    console.log(`queue prose for point ${point} stored in ${QUEUE_DATA_PATH}`)
    console.log('Render it into the board: node scripts/board-queue.mjs')
  } else if (cmd === 'import') {
    // The one-time migration: seed the data from a board that still carries a
    // hand-written queue, so the switch to the generator throws no prose away.
    const data = importQueueFromHtml(readFileSync(boardFile, 'utf8'))
    writeData(data)
    console.log(`imported ${Object.keys(data.points).length} queue card(s) into ${QUEUE_DATA_PATH}`)
  } else if (cmd === '--check' || cmd === undefined) {
    const { html, open, titles, exclude } = inputs()
    const built = buildQueueSection(html, { open, data: readData(), exclude, titles })
    const stubs = built.entries.filter((e) => e.stub).map((e) => e.point)
    if (cmd === '--check') {
      console.log(`${built.entries.length} queue card(s) would be rendered${built.html === html ? ' (no change)' : ''}`)
      if (stubs.length) console.log(`  no prose yet: ${stubs.join(', ')} — node scripts/board-queue.mjs set <N> "<text>"`)
      process.exitCode = built.html === html ? 0 : 1
    } else {
      // Atomic (point 443, four-eyes F3): a kill mid-write leaves torn bytes that
      // the doctor's board repair would push to the public page.
      if (built.html !== html) writeTextAtomic(boardFile, built.html)
      console.log(`queue rebuilt from the work order: ${built.entries.length} card(s)${built.html === html ? ' (unchanged)' : ''}`)
      if (stubs.length) console.log(`  no prose yet: ${stubs.join(', ')} — node scripts/board-queue.mjs set <N> "<text>"`)
      console.log('Publish it: node scripts/board-publish.mjs')
    }
  } else {
    console.error('usage: board-queue.mjs [--check] | set <N> "<text>" | import')
    process.exitCode = 2
  }
} catch (e) {
  console.error(`board-queue: ${e.message}`)
  process.exitCode = 1
}
