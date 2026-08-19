// THE BOARD TRANSPORT (point 400, delta D) — the board goes live from a script,
// so EVERY session can publish it, and comes back over plain HTTPS, so a check
// can read the PAGE rather than a record of an attempt.
//
//   node scripts/board-publish.mjs           # push the board live
//   node scripts/board-publish.mjs --check   # fetch the live page and judge it
//   node scripts/board-publish.mjs --url     # print the URLs and exit
//
// WHY A SCRIPT AND NOT A TOOL. The board used to be publishable only through a
// tool the headless successor session (`claude -p`, spawned by the OS launcher)
// does not have. On 28.07.2026 that session edited the board and recorded a
// deferral: in the flagship mode — user away, batch resurrected by the scheduler
// — the board could not be updated AT ALL. A commit and a push it has.
//
// WHERE IT LANDS, AND WHY NOT ON `main`.
//   content : an ORPHAN branch `board` of this repository, ONE commit that is
//             force-updated on every publish. Nothing accumulates — the history
//             is a single object, replaced. `main` is untouched, so a board
//             publish is not a source change: it triggers no CI (which watches
//             `main` and `feat/**`) and no Pages deploy (which rebuilds the game
//             AND every frozen version tag — minutes of runner time for a status
//             card). A publish every few minutes is therefore free.
//   viewer  : public/board/index.html, deployed with the site by the workflow
//             that already runs. It is a SOURCE file, committed once; it fetches
//             the content branch at load. So the reader gets one stable URL
//             while the content behind it moves without a deploy.
//
// THE FLOOR OF "CURRENT". The push itself lands in seconds, but
// raw.githubusercontent serves with `cache-control: max-age=300`. `--check`
// therefore fetches with a cache-buster AND tolerates `LIVE_GRACE_MS` of
// disagreement (board-currency-core): a page that differs while the publish is
// still settling is reported as 'settling', not as an alarm. Only a page that is
// still behind past the grace — or one that cannot be read at all — is a fault.
//
// FAIL LOUD, NOT SILENT. A failed publish is PERSISTED (`publishFailed`), which
// is what the watchdog in scripts/batch-autostart.mjs reports when the session
// itself is wedged and no Stop hook will ever run again.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeTextAtomic } from './atomic-write.mjs'
import { REPO_ROOT, STATE_PATH, readJson, mergeState } from './dashboard-state.mjs'
import { normaliseLineEndings, projectNowForPublish, refreshFooter, upgradeNowCards } from './board-core.mjs'
import { gatherActiveWorkSource, openPointNumbers } from './active-work-source.mjs'
import { withBoardEditLock } from './board-edit-lock.mjs'
import { currentSetting, settingProblemLine } from './sol-share.mjs'
import { applyFooterNote } from './sol-share-core.mjs'
import { structureViolations } from './board-structure-core.mjs'
import { QUEUE_STUB_META, parseTasks } from './dashboard-guard-core.mjs'
import { ESTIMATE_CMD, TITLE_CMD, boardTitleReport, parseTaskTitles } from './board-queue-core.mjs'
import {
  ARCHIVE_CONTENT_URL,
  ARCHIVE_FILE,
  BOARD_CONTENT_URL,
  BOARD_FILE,
  BOARD_PAGE_URL,
  BOARD_REF,
  LIVE_GRACE_MS,
  boardMissingPoints,
  liveBoardVerdict,
  liveCheckUrl,
  openFingerprintOfTasks,
  pagesFailurePatch,
  pagesPublishPatch,
  stampFingerprint,
} from './board-currency-core.mjs'

/** SHA-256 of the exact bytes published — the same digest dashboard-state uses. */
const sha256 = (text) => createHash('sha256').update(Buffer.from(text)).digest('hex')

/** No fetch in this repository waits for ever; a hung socket must not hang a CLI. */
const FETCH_TIMEOUT_MS = 15000

/**
 * A timed fetch whose timer is CLEARED again.
 *
 * `AbortSignal.timeout` leaves a libuv handle alive that a following
 * `process.exit` tears down mid-close: on Windows that aborts the process with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exit code 127 —
 * observed on the very first `--check`, where it turned an honest "the board is
 * unreachable" (exit 1) into a crash. An explicit controller with a cleared
 * timeout leaves nothing behind.
 */
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(`timed out after ${ms} ms`)), ms)
  try {
    return await fetch(url, { cache: 'no-store', signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

const args = process.argv.slice(2)
const lockedByCaller = args.length === 1 && args[0] === '--locked'
const git = (a, opts = {}) =>
  execFileSync('git', a, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8', ...opts }).trim()

if (args.includes('--url')) {
  console.log(`board page   : ${BOARD_PAGE_URL}`)
  console.log(`board content: ${BOARD_CONTENT_URL}`)
  console.log(`archive      : ${ARCHIVE_CONTENT_URL}`)
  process.exit(0)
}

const state = readJson(STATE_PATH) ?? {}
const boardFile = resolve(REPO_ROOT, state.dashboardPath ?? '.batch-dashboard.html')
const archiveFile = resolve(REPO_ROOT, '.batch-dashboard-archive.html')
const tasksPath = resolve(REPO_ROOT, 'TASKS.md')

/** The fingerprint the live page is expected to carry (null when unreadable). */
function expectedFingerprint() {
  try {
    return openFingerprintOfTasks(readFileSync(tasksPath, 'utf8'))
  } catch {
    return null
  }
}

// ---- --check: judge the LIVE page ----------------------------------------
// This is the acceptance test of the whole point: it asks the URL, not the
// state file. An unreadable page is never 'current' — a green check over an
// unread board is the one outcome this must not be able to produce.
if (args.includes('--check')) {
  const expected = expectedFingerprint()
  let liveHtml = null
  let fetchError = null
  try {
    const res = await fetchWithTimeout(liveCheckUrl(BOARD_CONTENT_URL))
    // The body is consumed either way, so no socket is left half-read.
    const body = await res.text()
    if (!res.ok) fetchError = `HTTP ${res.status} ${res.statusText}`
    else liveHtml = body
  } catch (e) {
    fetchError = (e && e.message) || 'fetch failed'
  }
  const publishedAt = Number(state.pagesPublishedAt) || 0
  const v = liveBoardVerdict({ liveHtml, fetchError, expected, publishedAt, graceMs: LIVE_GRACE_MS })
  console.log(`live board : ${BOARD_CONTENT_URL}`)
  console.log(`viewer     : ${BOARD_PAGE_URL}`)
  console.log(`work order : ${expected ?? '<unreadable>'}`)
  console.log(`live page  : ${v.live ?? '<none>'}`)
  console.log(`verdict    : ${v.verdict.toUpperCase()}${v.reason ? ` — ${v.reason}` : ''}`)
  // 'settling' and 'unknown' are not faults: the first is the deploy/CDN floor
  // this check exists to tolerate, the second says honestly that there was
  // nothing to compare against.
  //
  // exitCode, NOT process.exit: exiting here would tear down undici's keep-alive
  // socket mid-close, and on Windows that aborts the process with
  // `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and code 127 — the
  // very first `--check` did exactly that, turning an honest "the board is
  // unreachable" (exit 1) into a crash a caller cannot read. The sockets are
  // unref'd, so the process ends by itself once the loop drains.
  process.exitCode = v.verdict === 'behind' || v.verdict === 'unreachable' ? 1 : 0
} else {
  if (args.length > 0 && !lockedByCaller) {
    console.error('usage: node scripts/board-publish.mjs [--check | --url]')
    process.exit(1)
  }
  if (lockedByCaller) publish()
  else {
    try {
      // The lock-owning parent stays alive while the publishing child runs.
      // `publish()` has deliberate `process.exit(1)` failure paths; running it
      // in the owner process would skip the lock's finally/release and leave a
      // live-pid lock wedged for the rest of this process.
      withBoardEditLock(() => execFileSync(process.execPath, [process.argv[1], '--locked'], {
        windowsHide: true,
        cwd: REPO_ROOT,
        stdio: 'inherit',
      }))
    } catch (error) {
      if (Number.isInteger(error?.status)) process.exitCode = error.status || 1
      else {
        console.error(`board-publish FAILED — serialized publish could not run: ${error?.message ?? error}`)
        process.exitCode = 1
      }
    }
  }
}

// ---- publish --------------------------------------------------------------
// A function, not top-level code, so `--check` above can end the run by setting
// an exit CODE rather than calling process.exit — see the note there. Nothing in
// here awaits, so hoisting it costs the straight-line reading nothing.
function publish() {
if (!existsSync(boardFile)) {
  console.error(`board-publish: repo board not found: ${boardFile}`)
  process.exit(1)
}

const fail = (reason) => {
  mergeState(pagesFailurePatch({ reason }))
  console.error(`board-publish FAILED — ${reason}`)
  console.error('The failure is recorded; the launcher watchdog reports it if no session retries.')
  process.exit(1)
}

// The footer's date and open-point count are derived, not typed — same parse as
// the audit, so the two cannot disagree.
try {
  const html = readFileSync(boardFile, 'utf8')
  const tasksText = readFileSync(tasksPath, 'utf8')
  const { open } = parseTasks(tasksText)
  const activeWork = gatherActiveWorkSource({ tasksText })
  const projected = projectNowForPublish(html, activeWork, { knownPoints: openPointNumbers(tasksText) }).html
  // LF-NORMALISED HERE TOO (point 439). This is the last write before the bytes
  // go out, so whatever wrote the file before — a hand edit in Windows text mode
  // included — the published board and the local one agree on their newlines,
  // and the archive rotation can still find its section next time.
  // …and the SOL ROUTING note beside it (point 654): while the share switch is off its
  // default, the board says so, so nobody wonders why a diagnosis came back in another
  // voice. At the default it says nothing, and a stale note is removed rather than left
  // standing — `refreshFooter` keeps every segment it does not own, this one included.
  const share = currentSetting()
  if (share.problem) console.error(settingProblemLine(share, 'board-publish'))
  // UPGRADED LAST (point 655). The naming gate below demands the numbered chip
  // strictly, and the board is one living file whose cards may still carry their
  // number inside the title. `board.mjs` lifts them on every edit; doing it here
  // too means a board that was last written by an older version can still be
  // published — a strict gate must never be reachable without a way out.
  const refreshed = normaliseLineEndings(
    upgradeNowCards(applyFooterNote(refreshFooter(projected, { openCount: open.length }), share)),
  )
  if (refreshed !== html) {
    // Atomic (point 443, four-eyes F3) — and this one writes the very file the
    // next lines read, hash and push to the public page.
    writeTextAtomic(boardFile, refreshed)
    console.log(`footer refreshed: ${open.length} open point(s)`)
    if (upgradeNowCards(html) !== html) console.log('current-work card(s) lifted into the numbered chip')
  }
} catch (e) {
  // A publish must never be blocked by the footer; the audit still catches a
  // stale one, and saying why beats failing silently.
  console.error(`board-publish: footer not refreshed (${e.message})`)
}

// ONE read of the board from here on: the gates below, the bytes that go out and
// the hash that is recorded must all be the SAME bytes, or a gate passes on one
// version while another is published.
const repoBytes = readFileSync(boardFile, 'utf8')

// STRUCTURE BEFORE PUBLISH: a malformed board must not be publishable at all.
// The gate sits before the bytes leave, exactly as in dashboard-publish.mjs —
// a board broken by an edit reached the reader three times in one evening.
const broken = structureViolations(repoBytes)
if (broken.length) {
  console.error(`board-publish REFUSED — the board is structurally broken (${broken.length}):`)
  for (const v of broken) console.error(`  [${v.code}] ${v.msg}`)
  console.error('Repair the markup first, with scripts/board.mjs rather than text replacement.')
  process.exit(1)
}

const fingerprint = expectedFingerprint()
if (!fingerprint) fail('the work order could not be read, so the page would carry no fingerprint')

// THE STAMP MUST NOT LIE. The fingerprint says "this board shows these points",
// so a board that is MISSING one may not carry it: it would go live stamped
// current and both `--check` and the watchdog would then be green over exactly
// the missing-card staleness of 28.07.2026. This is invariant (4) of the Stop
// audit, applied EARLIER — a board that could never be attested must not be
// publishable either, the same reasoning the structure gate above rests on. No
// deadlock: editing the board is never blocked by any gate, and the deny that
// asks for a publish fires at most once per turn.
let openPoints = []
try { openPoints = parseTasks(readFileSync(tasksPath, 'utf8')).open } catch { /* judged unreadable above */ }
const uncovered = boardMissingPoints(repoBytes, openPoints)
if (uncovered.length) {
  console.error(`board-publish REFUSED — the board does not show open point(s) ${uncovered.join(', ')}.`)
  console.error('Publishing it would stamp a fingerprint claiming it does, and the watchdog would')
  console.error('then report the board as current while the reader is missing work.')
  // NAME A REMEDY THAT WORKS (four-eyes NEW-1). `board.mjs queue <N>` MOVES a
  // current-work card back to the queue and throws when there is none — and the
  // case that lands here is exactly a freshly appended point with no card
  // anywhere. The generator is what serves it.
  console.error('Give each of them a card: node scripts/board-queue.mjs   (rebuilds the queue')
  console.error('from the work order; a point with no prose yet gets a stub, which is enough to')
  console.error('publish). Write the prose with: node scripts/board-queue.mjs set <N> "<text>".')
  process.exit(1)
}

// THE PUBLISH SAYS WHAT THE READER WILL SEE (point 439). A card whose title is
// still the work order's own headline reaches the German board in ENGLISH and in
// CAPITALS, and one carrying the named "no estimate yet" marker shows no
// expected duration — both pass every gate, which is why the first came back a
// second time. Reported, never refused: the board must stay publishable, the
// session must simply not be able to publish these unknowingly.
try {
  const report = boardTitleReport(repoBytes, parseTaskTitles(readFileSync(tasksPath, 'utf8')))
  if (report.untranslated.length) {
    console.error(`board-publish: point(s) ${report.untranslated.join(', ')} still carry the ENGLISH work-order`)
    console.error(`  headline as their card title. Give them German ones: ${TITLE_CMD}`)
  }
  if (report.unestimated.length) {
    console.error(`board-publish: point(s) ${report.unestimated.join(', ')} have no estimate — their card shows`)
    console.error(`  "${QUEUE_STUB_META}" instead of an expected duration. Set one: ${ESTIMATE_CMD}`)
  }
} catch (e) {
  console.error(`board-publish: the card-title report could not be built (${e.message})`)
}

// The fingerprint is stamped on the way OUT, never into the repo file: the repo
// bytes are what every publish record attests, and moving them under that record
// would make the board look stale on every publish.
const published = stampFingerprint(repoBytes, fingerprint)
const archive = existsSync(archiveFile) ? readFileSync(archiveFile, 'utf8') : null

// A tree built with plumbing: no checkout, no index, no branch switch. The
// working tree this runs in is left completely untouched — the publisher must be
// safe to call in the middle of any other work, including from a worktree.
let commit = null
try {
  // `hash-object --stdin -w` writes the object straight from memory: no temp
  // file, and nothing that could be left behind on a failure path.
  const hashBlob = (content) => git(['hash-object', '-w', '--stdin'], { input: content })
  const entries = [`100644 blob ${hashBlob(published)}\t${BOARD_FILE}`]
  if (archive !== null) entries.push(`100644 blob ${hashBlob(archive)}\t${ARCHIVE_FILE}`)
  const tree = git(['mktree'], { input: `${entries.join('\n')}\n` })
  // NO PARENT — one orphan commit, force-pushed. The branch never grows, so a
  // publish every few minutes costs the repository a single replaced object
  // instead of a history nobody reads.
  const who = {
    GIT_AUTHOR_NAME: 'hoa-board',
    GIT_AUTHOR_EMAIL: 'board@localhost',
    GIT_COMMITTER_NAME: 'hoa-board',
    GIT_COMMITTER_EMAIL: 'board@localhost',
  }
  commit = git(['commit-tree', tree, '-m', `board ${new Date().toISOString()} (${fingerprint})`], {
    env: { ...process.env, ...who },
  })
} catch (e) {
  fail(`could not build the board commit: ${(e && e.message) || e}`)
}

try {
  git(['push', '--force', 'origin', `${commit}:${BOARD_REF}`], { stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  fail(`the push to ${BOARD_REF} was rejected: ${(e && (e.stderr || e.message)) || e}`)
}

// Hash the bytes that were actually published, not a fourth read of the file:
// an edit landing during the push would otherwise be attested as live while the
// OLD bytes went out (four-eyes finding 5).
mergeState(pagesPublishPatch({ fileHash: sha256(repoBytes), fingerprint }))
console.log(`board PUBLISHED (${fingerprint}) — commit ${commit.slice(0, 12)} on ${BOARD_REF}`)
console.log(`  live in seconds, cached up to ${Math.round(LIVE_GRACE_MS / 60000)} min: ${BOARD_PAGE_URL}`)
console.log('  verify against the PAGE: node scripts/board-publish.mjs --check')
}
