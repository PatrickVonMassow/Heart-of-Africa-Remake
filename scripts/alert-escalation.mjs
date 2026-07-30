// THE ESCALATION LADDER (point 434, remainder of part 1) — the I/O half.
// Every decision is in scripts/alert-escalation-core.mjs; this file keeps the
// ladder state, pauses the batch on the last rung, writes the board card and
// logs the reason.
//
// It is called from `scripts/notify.mjs`, i.e. from EVERY local alert: the
// launcher, the board watchdog, the model guard, the deferral command and the
// child-retry layer. The external GitHub watchdog is not affected — it posts to
// ntfy directly from a runner that has no repository state, which is exactly
// what makes it the layer with no shared local cause of death.
//
//   node scripts/alert-escalation.mjs --status         the ladder, per alert
//   node scripts/alert-escalation.mjs --clear "<key>"  the condition cleared
//   node scripts/alert-escalation.mjs --clear-all
//
// TWO DELIBERATE ASYMMETRIES, both worth knowing before changing anything here:
//
//  1. FAIL-OPEN MEANS DELIVER. Everywhere else in this repository fail-open
//     means "let the session act". On an alerting path it means SEND: an
//     unreadable ladder file, a locked state, a throw anywhere in here — all of
//     them end in the message going out at the caller's own priority. An alert
//     silently swallowed by its own throttle is worse than a duplicate buzz.
//  2. THE LADDER DOES NOT STAND DOWN FOR A NON-OWNER. The other guards do,
//     because they gate what a SESSION may do. This one governs a CHANNEL, and
//     its principal caller — the OS launcher — owns no lock and never will; a
//     lock-keyed stand-down would switch the ladder off precisely in the
//     unattended case it exists for. What it DOES stand down for is a batch that
//     is already paused: the pause is a state, not an action to repeat. The
//     off-switch for everything else is the environment variable
//     HOA_ALERT_ESCALATION=off, which delivers every alert unthrottled.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import {
  advanceLadder,
  alertKey,
  clearLadder,
  describeEscalation,
  escalationDecision,
  escalationPauseReason,
  ladderEntry,
} from './alert-escalation-core.mjs'

// One gitignored directory for both resilience layers' runtime state — see the
// same note in scripts/child-retry.mjs.
export const LADDER_PATH = repoPath('.claude/resilience/alert-escalation.json')
export const LOG_PATH = repoPath('.claude/resilience/alert-escalation.log')

/** Created on demand: a fresh checkout has no .claude/resilience/. */
function ensureDir(path) {
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    /* already there, or unwritable — the caller's own try/catch decides */
  }
}

/** ntfy priorities, weakest first — used to make sure the ladder can only ever
 *  RAISE a caller's priority, never lower it. A capability-breach alert stays
 *  urgent on its first send even though rung 0's own priority is default. */
export const PRIORITY_ORDER = ['min', 'low', 'default', 'high', 'urgent']

export function higherPriority(a, b) {
  const ia = PRIORITY_ORDER.indexOf(String(a))
  const ib = PRIORITY_ORDER.indexOf(String(b))
  if (ia < 0) return b ?? a
  if (ib < 0) return a
  return ia >= ib ? a : b
}

export function readLadder(path = LADDER_PATH) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'))
    return s && typeof s === 'object' ? s : { alerts: {} }
  } catch {
    return { alerts: {} }
  }
}

export function writeLadder(state, path = LADDER_PATH) {
  ensureDir(path)
  writeJsonAtomic(path, state)
}

export function logLine(text, path = LOG_PATH) {
  try {
    appendFileSync(path, `${new Date().toISOString()} ${text}\n`)
  } catch {
    /* a log that cannot be written must never cost the alert */
  }
}

function berlinStamp(now = new Date()) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)
}

/** The board card for the last rung — best effort; the log and the pause file
 *  carry the reason even when the board cannot be written. */
export function boardCard(title, question, { cwd = REPO_ROOT } = {}) {
  try {
    execFileSync(process.execPath, ['scripts/board.mjs', 'vdzk-add', title, question], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/**
 * The pause API, imported LAZILY: scripts/batch-lock.mjs resolves its paths with
 * `fileURLToPath(new URL(…, import.meta.url))`, which THROWS under a test runner
 * (see scripts/repo-paths.mjs). A top-level import would take every module that
 * reaches notify.mjs down with it.
 */
async function pauseApi() {
  return import('./batch-lock.mjs')
}

/**
 * ASK THE LADDER whether this alert goes out, and act on the last rung.
 *
 * @returns {Promise<{deliver: boolean, priority: string|null, decision: object|null}>}
 *          `priority` is the ladder's own — the caller raises its own with it.
 */
export async function escalate({
  title,
  message = '',
  key = null,
  priority = 'default',
  now = Date.now(),
  env = process.env,
  // Injected in the unit layer so the REAL rung logic is exercised there: the
  // pause API is a lazy import that throws under a test runner, and without an
  // injection point every test would fall through the fail-open catch below and
  // prove only that failing open works.
  pause = null,
  board = boardCard,
  ladderPath = LADDER_PATH,
  logPath = LOG_PATH,
} = {}) {
  if (String(env.HOA_ALERT_ESCALATION ?? '').toLowerCase() === 'off') {
    return { deliver: true, priority: null, decision: null, disabled: true }
  }
  try {
    const k = key ?? alertKey(title, message)
    const state = readLadder(ladderPath)
    const { isPaused, setPaused } = pause ?? (await pauseApi())
    const paused = isPaused()
    const decision = escalationDecision({ key: k, now, entry: ladderEntry(state, k), paused })

    if (decision.action === 'suppress') {
      logLine(`[${k}] ${describeEscalation(decision)}`, logPath)
      return { deliver: false, priority: decision.priority, decision }
    }

    if (decision.action === 'pause-and-send') {
      const reason = escalationPauseReason(title, decision, berlinStamp(new Date(now)))
      setPaused(reason)
      board(
        'Batch pausiert: Alarm blieb unbeantwortet',
        `${reason} Bitte prüfen, was die Meldung ausgelöst hat, und die Pause danach aufheben.`,
      )
      logLine(`[${k}] PAUSED THE BATCH — ${decision.reason}`, logPath)
    }

    writeLadder(advanceLadder(state, { key: k, decision, now }), ladderPath)
    logLine(`[${k}] ${describeEscalation(decision)}`, logPath)
    return { deliver: true, priority: higherPriority(priority, decision.priority), decision }
  } catch (e) {
    // FAIL-OPEN = DELIVER.
    logLine(`escalation failed, delivering unthrottled: ${e?.message ?? e}`, logPath)
    return { deliver: true, priority: null, decision: null, error: String(e?.message ?? e) }
  }
}

// --- CLI ------------------------------------------------------------------------

const isCli = process.argv[1]?.endsWith('alert-escalation.mjs')
if (isCli) {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--clear')
  if (argv.includes('--clear-all')) {
    writeLadder({ alerts: {} })
    console.log('alert ladder cleared')
  } else if (i >= 0 && argv[i + 1]) {
    writeLadder(clearLadder(readLadder(), argv[i + 1]))
    console.log(`alert ladder cleared for "${argv[i + 1]}"`)
  } else {
    const { alerts } = readLadder()
    const rows = Object.entries(alerts ?? {})
    console.log(`alert ladder (${LADDER_PATH})`)
    for (const [k, e] of rows) {
      console.log(`  rung ${e.rung} after ${e.sends} sends, last ${new Date(e.lastSentAt).toISOString()} — ${k}`)
    }
    if (!rows.length) console.log('  no alert is climbing')
  }
  process.exit(0)
}
