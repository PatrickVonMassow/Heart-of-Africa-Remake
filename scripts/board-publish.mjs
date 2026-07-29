// THE BOARD TRANSPORT (point 400, delta D) — the board goes live from a script,
// so EVERY session can publish it, and comes back over plain HTTPS, so a check
// can read the PAGE rather than a record of an attempt.
//
//   node scripts/board-publish.mjs           # push the board live
//   node scripts/board-publish.mjs --check   # fetch the live page and judge it
//   node scripts/board-publish.mjs --url     # print the URLs and exit
//
// WHY A SCRIPT AND NOT THE ARTIFACT TOOL. The headless successor session
// (`claude -p`, spawned by the OS launcher) has NO Artifact tool. On 28.07.2026
// it edited the board and recorded `publishDeferred: "headless successor session
// — no Artifact tool available here"`: in the flagship mode — user away, batch
// resurrected by the scheduler — the board could not be updated AT ALL. A commit
// and a push are things that session has.
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT, STATE_PATH, readJson, mergeState, sha256File } from './dashboard-state.mjs'
import { refreshFooter } from './board-core.mjs'
import { structureViolations } from './board-structure-core.mjs'
import { parseTasks } from './dashboard-guard-core.mjs'
import {
  ARCHIVE_CONTENT_URL,
  ARCHIVE_FILE,
  BOARD_CONTENT_URL,
  BOARD_FILE,
  BOARD_PAGE_URL,
  BOARD_REF,
  LIVE_GRACE_MS,
  liveBoardVerdict,
  liveCheckUrl,
  openFingerprintOfTasks,
  pagesFailurePatch,
  pagesPublishPatch,
  stampFingerprint,
} from './board-currency-core.mjs'

const args = process.argv.slice(2)
const git = (a, opts = {}) => execFileSync('git', a, { cwd: REPO_ROOT, encoding: 'utf8', ...opts }).trim()

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
    const res = await fetch(liveCheckUrl(BOARD_CONTENT_URL), { cache: 'no-store' })
    if (!res.ok) fetchError = `HTTP ${res.status} ${res.statusText}`
    else liveHtml = await res.text()
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
  process.exit(v.verdict === 'behind' || v.verdict === 'unreachable' ? 1 : 0)
}

if (args.length > 0) {
  console.error('usage: node scripts/board-publish.mjs [--check | --url]')
  process.exit(1)
}

// ---- publish --------------------------------------------------------------
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
  const { open } = parseTasks(readFileSync(tasksPath, 'utf8'))
  const refreshed = refreshFooter(html, { openCount: open.length })
  if (refreshed !== html) {
    writeFileSync(boardFile, refreshed)
    console.log(`footer refreshed: ${open.length} open point(s)`)
  }
} catch (e) {
  // A publish must never be blocked by the footer; the audit still catches a
  // stale one, and saying why beats failing silently.
  console.error(`board-publish: footer not refreshed (${e.message})`)
}

// STRUCTURE BEFORE PUBLISH: a malformed board must not be publishable at all.
// The gate sits before the bytes leave, exactly as in dashboard-publish.mjs —
// a board broken by an edit reached the reader three times in one evening.
const broken = structureViolations(readFileSync(boardFile, 'utf8'))
if (broken.length) {
  console.error(`board-publish REFUSED — the board is structurally broken (${broken.length}):`)
  for (const v of broken) console.error(`  [${v.code}] ${v.msg}`)
  console.error('Repair the markup first, with scripts/board.mjs rather than text replacement.')
  process.exit(1)
}

const fingerprint = expectedFingerprint()
if (!fingerprint) fail('the work order could not be read, so the page would carry no fingerprint')

// The fingerprint is stamped on the way OUT, never into the repo file: the repo
// bytes are what the Artifact mirror attests, and moving them under that record
// would make the mirror look stale on every publish.
const published = stampFingerprint(readFileSync(boardFile, 'utf8'), fingerprint)
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

mergeState(pagesPublishPatch({ fileHash: sha256File(boardFile), fingerprint }))
console.log(`board PUBLISHED (${fingerprint}) — commit ${commit.slice(0, 12)} on ${BOARD_REF}`)
console.log(`  live in seconds, cached up to ${Math.round(LIVE_GRACE_MS / 60000)} min: ${BOARD_PAGE_URL}`)
console.log('  verify against the PAGE: node scripts/board-publish.mjs --check')
