// THE BOARD WATCHDOG (point 400, delta E) — one tick of "is the live board
// still telling the truth", run as its OWN process by scripts/batch-autostart.mjs.
//
//   node scripts/board-watchdog.mjs [--last-key <k>] [--streak <n>] [--quiet]
//
// It fetches the live page, compares the open-point fingerprint it carries with
// the work order, and sends the ntfy alert when the page is behind or unreadable
// — or when a publish has been due or has failed for longer than a launcher
// tick, which is the case where the session is wedged and no Stop hook will ever
// run again. It prints ONE json line for its caller and always exits 0: a board
// check may never be a reason for the launcher to fail.
//
// A FETCH THAT FAILS IS NOT A BOARD THAT IS GONE (point 562). Every probe is
// RETRIED at once before it counts as anything; a failed currency probe is
// corroborated against the OTHER transport (the viewer host the reader opens);
// and only consecutive full failures of both count toward the escalation, whose
// last rung pauses the batch. On 08.08.2026 a flickering fetch — interleaved with
// successful probes of the same URL, while `--check` reported CURRENT — climbed
// that ladder and stopped every point in the queue. The streak lives with the
// caller (`--streak`, returned in the json line), exactly like `--last-key`.
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
  BOARD_PAGE_URL,
  LIVE_GRACE_MS,
  liveBoardVerdict,
  liveCheckUrl,
  openFingerprintOfTasks,
  watchdogDecision,
} from './board-currency-core.mjs'
import {
  PROBE_ATTEMPTS,
  PROBE_RETRY_DELAY_MS,
  UNREACHABLE_STREAK,
  classifyBoardProbe,
  nextFailureStreak,
  probeResult,
  probeVerdict,
} from './board-probe-core.mjs'
import { pastEtaCards } from './batch-in-flight-core.mjs'
import { berlinMinutes } from './dashboard-guard.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] ?? '') : null
}
const lastKey = flag('--last-key') || null
const priorStreak = Number(flag('--streak')) || 0
const quiet = args.includes('--quiet')

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const now = Date.now()

/** Always a result, never a throw — the caller reads one json line. */
const say = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ONE attempt at one URL. Never throws — a failure is data, like everywhere on
 *  this path. The body is consumed either way, so no socket is left half-read. */
async function attempt(url) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error('board fetch timed out after 15000 ms')), 15000)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ac.signal })
    const body = await res.text()
    return res.ok ? { ok: true, body } : { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

/** One PROBE: `PROBE_ATTEMPTS` attempts, briefly spaced, folded into one result.
 *  A success at any attempt is a success (point 562, rule 2) — the retry is what
 *  keeps a flicker from ever reaching the escalation at all. */
async function probe(url, { attempts = PROBE_ATTEMPTS, delayMs = PROBE_RETRY_DELAY_MS } = {}) {
  const tries = []
  for (let i = 0; i < Math.max(1, attempts); i++) {
    if (i > 0) await sleep(delayMs)
    const r = await attempt(typeof url === 'function' ? url() : url)
    tries.push(r)
    if (r.ok) break
  }
  return probeResult(tries)
}

try {
  // THE CURRENCY TRANSPORT first: raw.githubusercontent.com is the host that
  // carries the fingerprint, so it is the only one that can answer "is the board
  // current". A fresh cache-buster per attempt, or the retry would be served the
  // same cached answer as the attempt it is meant to second-guess.
  const currency = await probe(() => liveCheckUrl(BOARD_CONTENT_URL, Date.now()))
  // …AND THE VIEWER only when that failed: a different host, asked purely for
  // reachability. It carries no fingerprint (it fetches the content at load), so
  // it can never say the board is CURRENT — only that the board is not gone.
  const viewer = currency.ok ? null : await probe(`${BOARD_PAGE_URL}?t=${Date.now()}`)

  const kind = classifyBoardProbe({ currency, viewer })
  const streak = nextFailureStreak({ streak: priorStreak, kind })
  const reach = probeVerdict({ kind, streak, threshold: UNREACHABLE_STREAK, currency, viewer })
  const liveHtml = currency.ok ? currency.body : null
  const fetchError = currency.ok ? null : currency.error

  // THE PUBLISHED PROMISE (point 661): the now-cards of the LIVE page whose
  // "~HH:MM" has already passed, judged here because this child is the only tick
  // layer that holds the page. Pure and fail-open — no page, no clock or no
  // now-card all answer [] — and the LAUNCHER decides what is worth a line
  // (staleEtaLogLine, batch-autostart-core.mjs), so the threshold lives in one
  // place beside its sibling checks.
  const etaOverdue = pastEtaCards({ html: liveHtml, nowMinutes: berlinMinutes() })

  const state = readJson(join(REPO, '.claude', 'dashboard-state.json')) ?? {}
  let expected = null
  try {
    expected = openFingerprintOfTasks(readFileSync(join(REPO, 'TASKS.md'), 'utf8'))
  } catch {
    // An unreadable work order means there is nothing to compare against, and
    // liveBoardVerdict says so ('unknown') rather than inventing a fault.
  }

  const live = liveBoardVerdict({
    liveHtml,
    fetchError,
    expected,
    publishedAt: Number(state.pagesPublishedAt) || 0,
    now,
    graceMs: LIVE_GRACE_MS,
  })
  // A FAILED FETCH IS JUDGED BY THE PROBE, NOT BY THE CURRENCY CHECK (point 562).
  // `liveBoardVerdict` can only ever say 'unreachable' about a body it never got,
  // and that is precisely the claim this point forbids: the fetch failing says
  // nothing about the board's currency. A body that DID arrive and carries no
  // fingerprint keeps its 'unreachable' — that is a broken board, not a socket.
  const v = currency.ok ? live : { ...live, verdict: reach.verdict, reason: reach.reason }
  const d = watchdogDecision({ ...v, state, now, lastKey })
  // `notified` is what notify() ACTUALLY did, not what was decided (four-eyes
  // NEW-4). It returns false on a missing topic or a failed POST and never
  // throws, so reporting the intention would let the caller key a fault whose
  // one alert never left the machine — and a keyed fault is never announced
  // again. A transient POST failure would silence a standing problem for good.
  const sent = d.notify && !quiet ? await notify(d.title, d.message, d.priority) : false

  say({
    verdict: v.verdict,
    reason: v.reason,
    live: v.live,
    expected: v.expected,
    notified: !!sent,
    title: d.title,
    message: d.message,
    // null when there is NOTHING to report — the caller forgets its key then, so
    // the next fault is announced again instead of being swallowed as a repeat.
    key: d.key,
    // The CONSECUTIVE-failure count, handed back so the caller keeps it between
    // ticks (point 562, rule 3). A probe that succeeded returns 0, which is what
    // makes an alternating sequence unable to climb.
    streak,
    probe: kind,
    // The live page's now-cards whose "~HH:MM" has passed (point 661); the
    // launcher filters and logs.
    etaOverdue,
    // A retry that RESCUED the probe is worth a log line and nothing else.
    rescued: !!(currency.rescued || viewer?.rescued),
  })
} catch (e) {
  // A crash here must not look like a clean probe: the streak is handed back
  // UNCHANGED, so an unreadable tick neither advances nor resets the count.
  say({ verdict: 'error', reason: (e && e.message) || String(e), notified: false, key: null, streak: priorStreak })
}
