// THE QUEUE GENERATOR (point 400, delta C) — rebuild the Warteschlange from the
// work order plus the board's own prose, instead of maintaining it card by card.
//
//   node scripts/board-queue.mjs                    # rebuild the queue section
//   node scripts/board-queue.mjs --check            # report what would change
//   node scripts/board-queue.mjs set <N> "<text>"   # write one point's prose
//   node scripts/board-queue.mjs set <N> --title --text-stdin      # …its German title
//   node scripts/board-queue.mjs set <N> --estimate "~2 h"         # …its estimate
//   node scripts/board-queue.mjs import             # add cards the data lacks, from the board
//
// GERMAN TEXT GOES IN ON STDIN (point 439, the rule of point 410): `--text-stdin`
// fills whichever field it follows, so an umlaut never passes through a Windows
// shell. Until it existed, a session that tried to pipe prose in stored the
// literal string `--text-stdin` as the card body, and six cards showed the user a
// command-line flag where their explanation belonged.
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
import { normaliseLineEndings } from './board-core.mjs'
import {
  ESTIMATE_CMD,
  QUEUE_DATA_PATH,
  SET_STDIN_FLAG,
  TITLE_CMD,
  buildQueueSection,
  gatedEntryPoints,
  importQueueFromHtml,
  mergeQueueImport,
  openPointsOf,
  parseQueueDataFile,
  parseSetArgs,
  parseTaskTitles,
  queueImportOffenders,
  setQueueEntry,
  unestimatedPoints,
  untranslatedTitlePoints,
} from './board-queue-core.mjs'
import { carrierPath } from './findings-paths.mjs'
import { pendingRequests, requestRoute } from './findings-request-core.mjs'
import { gateReport, gateSets } from './user-gate-core.mjs'

const state = readJson(STATE_PATH) ?? {}
const boardFile = resolve(REPO_ROOT, state.dashboardPath ?? '.batch-dashboard.html')
const dataFile = resolve(REPO_ROOT, QUEUE_DATA_PATH)
const tasksFile = resolve(REPO_ROOT, 'TASKS.md')
const [cmd, ...rest] = process.argv.slice(2)

// A file that does not PARSE is not an empty one (point 530, four-eyes finding
// 1): treating it as empty is how a rewrite loses every card the board does not
// render. It stops the command instead — for `set` no less than for `import`.
const readData = () => parseQueueDataFile(existsSync(dataFile) ? readFileSync(dataFile, 'utf8') : null, { path: QUEUE_DATA_PATH })
const writeData = (d) => writeTextAtomic(dataFile, `${JSON.stringify(d, null, 2)}\n`)

// STDIN IS READ ONCE, AND ONLY WHEN ASKED FOR (the rule of point 410): reading
// fd 0 unconditionally would block every call with no pipe attached.
const stdinText = process.argv.includes(SET_STDIN_FLAG)
  ? (() => {
      try {
        return normaliseLineEndings(readFileSync(0, 'utf8')).trim()
      } catch (e) {
        throw new Error(`${SET_STDIN_FLAG} could not read stdin (${e.code ?? e.message}) — pipe the text in`)
      }
    })()
  : ''

/** Everything the generator has to SAY about the cards it just rendered. */
function reportEntries(entries, tasksText = '') {
  const say = (points, what, cmd) => {
    if (points.length) console.log(`  ${what}: ${points.join(', ')} — ${cmd}`)
  }
  // THE RECORDED "WHY" IS SURFACED HERE (point 450). The queue skips a gated
  // point after recording why it waits; that record must be readable without
  // opening the work order, or the skip is indistinguishable from a point
  // quietly falling off the board.
  const gated = gatedEntryPoints(entries)
  if (gated.length) {
    console.log(`  waiting on the user (skipped, card says so): ${gated.join(', ')}`)
    for (const line of gateReport(tasksText)) console.log(`  ${line.trim()}`)
    console.log('  give each one a "Von dir zu klären" card, and clear it with: node scripts/defer-for-user.mjs --clear <N>')
  }
  say(entries.filter((e) => e.stub).map((e) => e.point), 'no prose yet', 'node scripts/board-queue.mjs set <N> "<text>"')
  // THE FALLBACK IS REPORTED (point 439): these cards carry the ENGLISH,
  // upper-case work-order headline (or the bare number) into a German board.
  say(untranslatedTitlePoints(entries), 'title still the work order’s (English)', TITLE_CMD)
  say(unestimatedPoints(entries), 'no estimate yet', ESTIMATE_CMD)
}

/**
 * The requests other windows deposited in the findings carrier (point 462).
 * FAIL-SOFT on purpose: the carrier lives in the memory directory, outside the
 * repository, and a missing or half-written one must cost the queue rebuild
 * nothing — the board is the more important of the two.
 */
function carrierRequests() {
  try {
    return pendingRequests(readFileSync(carrierPath(), 'utf8')).map((r) => ({
      at: r.at,
      title: r.title,
      route: requestRoute(r),
    }))
  } catch {
    return []
  }
}

/** Board, work order and the exclusions the other sections already own. */
function inputs() {
  if (!existsSync(boardFile)) throw new Error(`board not found: ${boardFile}`)
  const html = readFileSync(boardFile, 'utf8')
  const tasks = readFileSync(tasksFile, 'utf8')
  return {
    html,
    tasks,
    open: openPointsOf(tasks),
    titles: parseTaskTitles(tasks),
    // The user gate (point 450): which points wait on the user, which he has
    // answered, and since when.
    gates: gateSets(tasks),
    requests: carrierRequests(),
    // Erledigt is NOT excluded: a point there is closed, so it is not open, and
    // the open set already leaves it out. Excluding it too would hide a point
    // that is open AND wrongly archived — a real inconsistency the audit reports.
    exclude: [...parseNowCardPoints(html), ...parseKlaerungPoints(html)],
  }
}

try {
  if (cmd === 'set') {
    const parsed = parseSetArgs(rest)
    if (parsed.stdinField) {
      if (!stdinText) throw new Error(`${SET_STDIN_FLAG} was given but nothing arrived on stdin`)
      if (parsed[parsed.stdinField]) {
        throw new Error(`${SET_STDIN_FLAG} takes the WHOLE ${parsed.stdinField} — drop the argument text`)
      }
      parsed[parsed.stdinField] = stdinText
    }
    const fields = ['title', 'body', 'estimate'].filter((f) => parsed[f])
    if (!parsed.point || fields.length === 0) {
      throw new Error('usage: board-queue.mjs set <N> ["<text>"] [--title …] [--estimate "~2 h"] [--text-stdin]')
    }
    writeData(setQueueEntry(readData(), parsed.point, parsed))
    console.log(`${fields.join(' + ')} for point ${parsed.point} stored in ${QUEUE_DATA_PATH}`)
    console.log('Render it into the board: node scripts/board-queue.mjs')
  } else if (cmd === 'import') {
    // Seed the data from cards the board carries but the data does not know yet.
    // ADDITIVE ONLY (point 530): a stored body is never replaced, and nothing is
    // written at all while the result would put an over-long card on the board.
    const { data, added, kept } = mergeQueueImport(readData(), importQueueFromHtml(readFileSync(boardFile, 'utf8')), {
      titles: parseTaskTitles(readFileSync(tasksFile, 'utf8')),
    })
    const offenders = queueImportOffenders(data)
    if (offenders.length) {
      throw new Error(
        `import refused — ${offenders.length} card(s) would go on the board too long or unbroken: ` +
          `${offenders.map((o) => `${o.point}: ${o.reason}`).join(' | ')}. ` +
          'Nothing was written. Give each of them its paragraphs back (a blank line splits them): ' +
          'node scripts/board-queue.mjs set <N> --text-stdin',
      )
    }
    writeData(data)
    console.log(
      `import: ${added.length} card(s) added${added.length ? ` (${added.join(', ')})` : ''}, ` +
        `${kept} already known (stored fields kept, empty ones filled from the board) → ${QUEUE_DATA_PATH}`,
    )
  } else if (cmd === '--check' || cmd === undefined) {
    const { html, tasks, open, titles, exclude, requests, gates } = inputs()
    const built = buildQueueSection(html, { open, data: readData(), exclude, titles, requests, gates })
    const saySoIfRequests = () => {
      if (requests.length) {
        console.log(`  ${requests.length} deposited request(s) named under the queue — node scripts/finding.mjs --requests`)
      }
    }
    if (cmd === '--check') {
      console.log(`${built.entries.length} queue card(s) would be rendered${built.html === html ? ' (no change)' : ''}`)
      reportEntries(built.entries, tasks)
      saySoIfRequests()
      process.exitCode = built.html === html ? 0 : 1
    } else {
      // Atomic (point 443, four-eyes F3): a kill mid-write leaves torn bytes that
      // the doctor's board repair would push to the public page. LF-normalised
      // (point 439) so a hand edit's CRLF cannot outlive one rebuild.
      const out = normaliseLineEndings(built.html)
      if (out !== html) writeTextAtomic(boardFile, out)
      console.log(`queue rebuilt from the work order: ${built.entries.length} card(s)${out === html ? ' (unchanged)' : ''}`)
      reportEntries(built.entries, tasks)
      saySoIfRequests()
      console.log('Publish it: node scripts/board-publish.mjs')
    }
  } else {
    console.error('usage: board-queue.mjs [--check] | set <N> ["<text>"] [--title …] [--estimate …] | import')
    process.exitCode = 2
  }
} catch (e) {
  console.error(`board-queue: ${e.message}`)
  process.exitCode = 1
}
