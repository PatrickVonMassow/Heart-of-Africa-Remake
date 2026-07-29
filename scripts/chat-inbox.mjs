// ONE TICK OF "HAS THE USER WRITTEN ANYTHING" — the reader half of the channel.
//
//   node scripts/chat-inbox.mjs            # poll, spool, print one json line
//   node scripts/chat-inbox.mjs --pending  # print the spool without polling
//   node scripts/chat-inbox.mjs --ack <n>  # consume the oldest n spooled messages
//
// It fetches the INBOX topic over ntfy's JSON poll endpoint, drops everything
// unsigned / mis-signed / stale / already seen (scripts/chat-core.mjs decides,
// purely), writes what survives into the spool DIRECTORY .claude/chat-spool/ —
// one file per message, atomically (scripts/chat-spool.mjs explains why it is a
// directory and not the stage-1 .jsonl) — and advances the cursor in
// .claude/chat-state.json. A stage-1 .jsonl left on disk is migrated into that
// directory on the first tick and archived, never dropped.
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
// twice, because the ledger travels with the spool (see `seededLedger`). The
// ledger counts CONSUMED messages too: a message the session has already read is
// exactly the one a re-poll must not hand over a second time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { readSecret } from './chat-secret.mjs'
import { DEFAULT_MAX_AGE_MS, deriveTopics, ingest, parseNtfyPoll, pollUrl, seenKeys, sinceParam } from './chat-core.mjs'
import { claimOldest, knownMessages, migrateLegacySpool, pruneConsumed, readPending, spoolMessage } from './chat-spool.mjs'

export const STATE_PATH = repoPath('.claude', 'chat-state.json')

const FETCH_TIMEOUT_MS = 15000

const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/**
 * THE LEDGER A LOST STATE FILE CANNOT LOSE. The spool is the record of what was
 * already accepted — waiting AND consumed — so the seen-ids are rebuilt from it
 * and unioned with whatever the state file still has. That is what makes a reset
 * cursor harmless: the poll re-reads the window, and every message already on
 * the spool is dropped as a duplicate rather than delivered a second time.
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
  // The migration runs before ANY read of the spool, on every path: a stage-1
  // .jsonl must never be half-visible to one command and invisible to the next.
  migrateLegacySpool()

  if (args.includes('--pending')) {
    const pending = readPending()
    say({ ok: true, pending: pending.length, messages: pending })
    process.exit(0)
  }

  if (args.includes('--ack')) {
    // One atomic rename per message — no read-slice-rewrite of a shared file, so
    // an ack concurrent with a poll's append can lose nothing.
    const n = Number(args[args.indexOf('--ack') + 1])
    const taken = claimOldest(n)
    say({ ok: true, acked: taken.length, pending: readPending().length })
    process.exit(0)
  }

  const secret = readSecret()
  if (!secret) {
    // Not configured is not an error: the channel is opt-in, and the launcher
    // ticks on every machine whether or not the user has paired a phone.
    say({ ok: true, configured: false, accepted: 0, pending: readPending().length })
    process.exit(0)
  }

  const maxAgeMs = Number(process.env.HOA_CHAT_MAX_AGE_MS) > 0 ? Number(process.env.HOA_CHAT_MAX_AGE_MS) : DEFAULT_MAX_AGE_MS
  const { inbox } = await deriveTopics(secret)
  const state = readJson(STATE_PATH) ?? {}
  const spool = readPending()
  // Consumed messages seed the ledger as much as waiting ones do — see
  // seededLedger. `spool` alone would let a message the session has already read
  // back in for as long as ntfy still caches it.
  const seeded = { cursor: state.cursor, seen: seededLedger(state, knownMessages()) }

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
    // The topic this body came FROM, and therefore the direction the signature
    // must have been made for. An agent-signed OUTBOX envelope copied verbatim
    // onto the inbox drops here as `bad-signature` — see DIRECTIONS in
    // chat-core.mjs. Never read a direction off the wire.
    direction: 'inbox',
    now: Date.now(),
    maxAgeMs,
    state: seeded,
  })

  for (const message of accepted) spoolMessage(message)
  // Bound the consumed archive without ever shortening the ledger inside the
  // window in which the transport could still replay a message.
  pruneConsumed()
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, `${JSON.stringify({ ...next, updatedAt: Date.now() }, null, 2)}\n`, 'utf8')

  // Re-read rather than concatenate: between the poll and here the running
  // session's per-tool-call delivery may have consumed part of the spool, and a
  // message it has already shown must not ride into a spawn prompt as well.
  const pending = readPending()
  say({
    ok: true,
    configured: true,
    accepted: accepted.length,
    // The reasons, never the rejected text: a mis-signed message is exactly the
    // one whose content must not reach a log the agent reads.
    dropped: dropped.map((d) => d.reason),
    pending: pending.length,
    // The WHOLE waiting spool, not only what this tick added: the launcher
    // decides for itself which of them a spawn still needs to hear about.
    messages: pending,
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
