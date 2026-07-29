// THE BOARD WATCHDOG (point 400, delta E) — one tick of "is the live board
// still telling the truth", run as its OWN process by scripts/batch-autostart.mjs.
//
//   node scripts/board-watchdog.mjs [--last-key <k>] [--quiet]
//
// It fetches the live page, compares the open-point fingerprint it carries with
// the work order, and sends the ntfy alert when the page is behind or unreadable
// — or when a publish has been due or has failed for longer than a launcher
// tick, which is the case where the session is wedged and no Stop hook will ever
// run again. It prints ONE json line for its caller and always exits 0: a board
// check may never be a reason for the launcher to fail.
//
// WHY A SEPARATE PROCESS, and not a block inside the launcher. On this platform
// a `process.exit()` after any `fetch` tears undici's socket down mid-close and
// ABORTS the process (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`,
// exit 127). The launcher exits that way at fifteen different points, and its
// real job is resurrecting a dead batch — so it must not hold a fetch at all.
// A child process is also containment no try/catch can match: whatever happens
// in here, the resurrection above it is untouched.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { notify } from './notify.mjs'
import {
  BOARD_CONTENT_URL,
  LIVE_GRACE_MS,
  liveBoardVerdict,
  liveCheckUrl,
  openFingerprintOfTasks,
  watchdogDecision,
} from './board-currency-core.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] ?? '') : null
}
const lastKey = flag('--last-key') || null
const quiet = args.includes('--quiet')

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const now = Date.now()

/** Always a result, never a throw — the caller reads one json line. */
const say = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`) }

try {
  let liveHtml = null
  let fetchError = null
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error('board fetch timed out after 15000 ms')), 15000)
  try {
    const res = await fetch(liveCheckUrl(BOARD_CONTENT_URL, now), { cache: 'no-store', signal: ac.signal })
    // The body is consumed either way, so no socket is left half-read.
    const body = await res.text()
    if (!res.ok) fetchError = `HTTP ${res.status} ${res.statusText}`
    else liveHtml = body
  } catch (e) {
    fetchError = (e && e.message) || 'fetch failed'
  } finally {
    clearTimeout(timer)
  }

  const state = readJson(join(REPO, '.claude', 'dashboard-state.json')) ?? {}
  let expected = null
  try {
    expected = openFingerprintOfTasks(readFileSync(join(REPO, 'TASKS.md'), 'utf8'))
  } catch {
    // An unreadable work order means there is nothing to compare against, and
    // liveBoardVerdict says so ('unknown') rather than inventing a fault.
  }

  const v = liveBoardVerdict({
    liveHtml,
    fetchError,
    expected,
    publishedAt: Number(state.pagesPublishedAt) || 0,
    now,
    graceMs: LIVE_GRACE_MS,
  })
  const d = watchdogDecision({ ...v, state, now, lastKey })
  if (d.notify && !quiet) await notify(d.title, d.message, d.priority)

  say({
    verdict: v.verdict,
    reason: v.reason,
    live: v.live,
    expected: v.expected,
    notified: !!(d.notify && !quiet),
    title: d.title,
    message: d.message,
    // null when there is NOTHING to report — the caller forgets its key then, so
    // the next fault is announced again instead of being swallowed as a repeat.
    key: d.key,
  })
} catch (e) {
  say({ verdict: 'error', reason: (e && e.message) || String(e), notified: false, key: null })
}
