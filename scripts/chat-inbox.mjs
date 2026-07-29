// ONE TICK OF "HAS THE USER WRITTEN ANYTHING" — the reader half of the channel.
//
//   node scripts/chat-inbox.mjs            # poll, spool, print one json line
//   node scripts/chat-inbox.mjs --pending  # print the spool without polling
//   node scripts/chat-inbox.mjs --ack <n>  # drop the oldest n spooled messages
//
// It fetches the INBOX topic over ntfy's JSON poll endpoint, drops everything
// unsigned / mis-signed / stale / already seen (scripts/chat-core.mjs decides,
// purely), appends what survives to .claude/chat-spool.jsonl and advances the
// cursor in .claude/chat-state.json.
//
// FAIL-SOFT, ALWAYS EXIT 0. Its caller is scripts/batch-autostart.mjs, whose job
// is resurrecting a dead batch: a chat poll may never be the reason that fails.
// Every error path prints `{ ok: false, reason }` and exits 0.
//
// IT RUNS AS ITS OWN PROCESS for the same reason the board watchdog does: on
// this platform a `process.exit()` after any `fetch` tears undici's socket down
// mid-close and ABORTS the process (exit 127, `Assertion failed: !(handle->flags
// & UV_HANDLE_CLOSING)`), and the launcher exits that way at fifteen points.
//
// THE CURSOR IS NOT THE DEDUPE. It only narrows the next poll; the ledger of
// seen ids in the state file is what guarantees once-only delivery. Delete the
// state file and the whole retention window is re-read — and nothing is spooled
// twice, because the ledger travels with the spool (see `seededLedger`).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { readSecret } from './chat-secret.mjs'
import { DEFAULT_MAX_AGE_MS, deriveTopics, ingest, parseNtfyPoll, pollUrl, seenKeys, sinceParam } from './chat-core.mjs'

export const STATE_PATH = repoPath('.claude', 'chat-state.json')
export const SPOOL_PATH = repoPath('.claude', 'chat-spool.jsonl')

const FETCH_TIMEOUT_MS = 15000

const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** Every spooled message, oldest first. TOTAL — a torn line is skipped. */
export function readSpool(path = SPOOL_PATH) {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * THE LEDGER A LOST STATE FILE CANNOT LOSE. The spool is the record of what was
 * already delivered, so the seen-ids are rebuilt from it and unioned with
 * whatever the state file still has. That is what makes a reset cursor harmless:
 * the poll re-reads the window, and every message already on the spool is
 * dropped as a duplicate rather than delivered a second time.
 */
export function seededLedger(state, spool) {
  const fromState = Array.isArray(state?.seen) ? state.seen : []
  const fromSpool = spool.flatMap((m) => seenKeys({ ntfyId: m.ntfyId, envelopeId: m.id }))
  return [...new Set([...fromSpool, ...fromState])]
}

/** A timed fetch whose timer is CLEARED again — an `AbortSignal.timeout` leaves
 *  a libuv handle that a following exit tears down mid-close on Windows. */
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(`chat poll timed out after ${ms} ms`)), ms)
  try {
    return await fetch(url, { cache: 'no-store', signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// The CLI half is GATED: scripts/chat-inbox.test.mjs imports `readSpool` and
// `seededLedger`, and an unguarded top-level body would poll the network on
// every test run.
const args = process.argv.slice(2)
const isCli = Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/chat-inbox.mjs'))

async function tick() {
  if (args.includes('--pending')) {
    const pending = readSpool()
    say({ ok: true, pending: pending.length, messages: pending })
    process.exit(0)
  }

  if (args.includes('--ack')) {
    const n = Number(args[args.indexOf('--ack') + 1])
    const rest = readSpool().slice(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
    writeFileSync(SPOOL_PATH, rest.map((m) => JSON.stringify(m)).join('\n') + (rest.length ? '\n' : ''), 'utf8')
    say({ ok: true, pending: rest.length })
    process.exit(0)
  }

  const secret = readSecret()
  if (!secret) {
    // Not configured is not an error: the channel is opt-in, and the launcher
    // ticks on every machine whether or not the user has paired a phone.
    say({ ok: true, configured: false, accepted: 0, pending: readSpool().length })
    process.exit(0)
  }

  const maxAgeMs = Number(process.env.HOA_CHAT_MAX_AGE_MS) > 0 ? Number(process.env.HOA_CHAT_MAX_AGE_MS) : DEFAULT_MAX_AGE_MS
  const { inbox } = await deriveTopics(secret)
  const state = readJson(STATE_PATH) ?? {}
  const spool = readSpool()
  const seeded = { cursor: state.cursor, seen: seededLedger(state, spool) }

  let body = null
  let fetchError = null
  try {
    const res = await fetchWithTimeout(pollUrl(inbox, sinceParam(seeded, { maxAgeMs })))
    const text = await res.text() // consumed either way — no half-read socket
    if (!res.ok) fetchError = `HTTP ${res.status} ${res.statusText}`
    else body = text
  } catch (e) {
    fetchError = (e && e.message) || 'fetch failed'
  }

  if (fetchError !== null) {
    say({ ok: false, reason: fetchError, accepted: 0, pending: spool.length })
    process.exit(0)
  }

  const { accepted, dropped, state: next } = await ingest({
    events: parseNtfyPoll(body),
    secret,
    now: Date.now(),
    maxAgeMs,
    state: seeded,
  })

  if (accepted.length > 0) {
    mkdirSync(dirname(SPOOL_PATH), { recursive: true })
    appendFileSync(SPOOL_PATH, `${accepted.map((m) => JSON.stringify(m)).join('\n')}\n`, 'utf8')
  }
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, `${JSON.stringify({ ...next, updatedAt: Date.now() }, null, 2)}\n`, 'utf8')

  say({
    ok: true,
    configured: true,
    accepted: accepted.length,
    // The reasons, never the rejected text: a mis-signed message is exactly the
    // one whose content must not reach a log the agent reads.
    dropped: dropped.map((d) => d.reason),
    pending: spool.length + accepted.length,
    // The WHOLE spool, not only what this tick added: the launcher decides for
    // itself which of them a spawn still needs to hear about, and the spool
    // stays untouched for the consumer that acknowledges it.
    messages: [...spool, ...accepted],
  })
  process.exit(0)
}

if (isCli) {
  try {
    await tick()
  } catch (e) {
    say({ ok: false, reason: (e && e.message) || String(e), accepted: 0 })
    process.exit(0)
  }
}
