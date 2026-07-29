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
import { readSecretStatus } from './chat-secret.mjs'
import { DEFAULT_MAX_AGE_MS, deriveTopics, ingest, parseNtfyPoll, pollUrl, seenKeys, sinceParam } from './chat-core.mjs'
import { postOutbox } from './chat-reply.mjs'
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

/**
 * THE STATE A FAILED SPOOL WRITE MUST LEAVE BEHIND. PURE.
 *
 * `ingest` records every ACCEPTED message in the ledger, on the assumption that
 * accepting it also puts it on disk. When the write then fails, the obvious code
 * writes that ledger anyway — and the message exists nowhere: the next poll drops
 * it as already-seen and the user's words are gone silently. Stage 1 could not
 * reach this state, because `appendFileSync` threw BEFORE the state write and the
 * cursor simply never advanced.
 *
 * So a tick that could not write everything does not advance PAST it: the failed
 * message's ids are struck from BOTH ledgers AND the cursor is left where it was,
 * because the cursor is what decides whether the next poll still sees the event
 * at all (a one-second overlap would not reach a message a minute older than the
 * newest one). Everything that DID reach the disk stays in the ledger, so nothing
 * is spooled twice.
 */
export function stateAfterSpool({ next, previousCursor, failed = [] }) {
  const seen = Array.isArray(next?.seen) ? next.seen : []
  // The age-bounded envelope ledger travels with the state file; a flood may
  // evict a transport id, never one of these (see envelopeRetentionMs).
  const envelopes = Array.isArray(next?.envelopes) ? next.envelopes : []
  // Who has already been told their message was dropped. Untouched by a spool
  // failure — those are DROPS, not messages that were meant to reach the disk.
  const notified = Array.isArray(next?.notified) ? next.notified : []
  if (failed.length === 0) return { cursor: next?.cursor, seen, envelopes, notified }
  const lost = new Set(failed.flatMap((m) => seenKeys({ ntfyId: m?.ntfyId, envelopeId: m?.id })))
  const lostIds = new Set(failed.map((m) => m?.id).filter(Boolean))
  return {
    cursor: Number.isFinite(previousCursor) ? Number(previousCursor) : undefined,
    seen: seen.filter((k) => !lost.has(k)),
    envelopes: envelopes.filter((e) => !lostIds.has(e?.id)),
    notified,
  }
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

// The CLI half is GATED: scripts/chat-inbox.test.mjs imports `seededLedger` and
// `stateAfterSpool`, and an unguarded top-level body would poll the network on
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

  const status = readSecretStatus()
  if (status.state === 'absent') {
    // Not configured is not an error: the channel is opt-in, and the launcher
    // ticks on every machine whether or not the user has paired a phone.
    say({ ok: true, configured: false, accepted: 0, pending: readPending().length })
    process.exit(0)
  }
  if (status.state !== 'ok') {
    // A secret this machine cannot read is a FAULT, not an unpaired machine:
    // the topics cannot be derived, so every message the user sends is dropped
    // where nobody sees it. `ok: false` is what the launcher logs and reports.
    say({ ok: false, reason: `chat secret unreadable (${status.reason})`, configured: true, accepted: 0, pending: readPending().length })
    process.exit(0)
  }
  const secret = status.secret

  const maxAgeMs = Number(process.env.HOA_CHAT_MAX_AGE_MS) > 0 ? Number(process.env.HOA_CHAT_MAX_AGE_MS) : DEFAULT_MAX_AGE_MS
  const { inbox } = await deriveTopics(secret)
  const state = readJson(STATE_PATH) ?? {}
  const spool = readPending()
  // Consumed messages seed the ledger as much as waiting ones do — see
  // seededLedger. `spool` alone would let a message the session has already read
  // back in for as long as ntfy still caches it.
  const seeded = {
    cursor: state.cursor,
    seen: seededLedger(state, knownMessages()),
    // Carried through untouched: `ingest` prunes them by age and hands them back.
    envelopes: Array.isArray(state.envelopes) ? state.envelopes : [],
    notified: Array.isArray(state.notified) ? state.notified : [],
  }

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

  const { accepted, dropped, notices, state: next } = await ingest({
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

  // A write that failed is NOT a message that was received: it must stay out of
  // the ledger, or it is lost for good (see stateAfterSpool). `already-spooled`
  // is a success — the file is on disk, this poll merely re-read the event.
  const failed = []
  const failures = []
  for (const message of accepted) {
    const r = spoolMessage(message)
    if (!r.ok && r.reason !== 'already-spooled') {
      failed.push(message)
      failures.push(r.reason)
    }
  }
  // Bound the consumed archive without ever shortening the ledger inside the
  // window in which the transport could still replay a message.
  pruneConsumed()
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  const persisted = stateAfterSpool({ next, previousCursor: seeded.cursor, failed })
  writeFileSync(STATE_PATH, `${JSON.stringify({ ...persisted, updatedAt: Date.now() }, null, 2)}\n`, 'utf8')

  // THE SENDER LEARNS THAT THEIR MESSAGE DID NOT LAND. The page renders a sent
  // message like any other, so a drop the user could act on has to travel back
  // as a signed OUTBOX notice — `dropNoticeDecision` has already decided which
  // ones qualify (a verified envelope only, never a failed signature: the outbox
  // must not answer an attacker probing the topic).
  //
  // Posted with `postOutbox`, never `sendReply`: a notice is not an ANSWER, and a
  // reply receipt written here would make the watcher mark the user's message
  // consumed with nobody having answered it.
  //
  // BEST EFFORT, AFTER the state write. A notice that cannot be posted costs one
  // notice; it may never cost the poll, and the ledger that makes it
  // at-most-once is already on disk.
  let noticesSent = 0
  for (const n of notices) {
    if (!n.text) continue
    try {
      const r = await postOutbox({ secret, text: n.text })
      if (r.ok) noticesSent++
    } catch {
      /* the transport is down for this post — the log line below says so */
    }
  }

  // Re-read rather than concatenate: between the poll and here the running
  // session's per-tool-call delivery may have consumed part of the spool, and a
  // message it has already shown must not ride into a spawn prompt as well.
  const pending = readPending()
  say({
    // A failed write is reported LOUDLY (the launcher logs `reason`): the message
    // is still on the transport and will be re-accepted next tick, but a spool
    // this machine cannot write is a fault the log must name.
    ok: failed.length === 0,
    ...(failed.length > 0
      ? { reason: `spool write failed for ${failed.length} message(s): ${[...new Set(failures)].join('; ')}` }
      : {}),
    configured: true,
    accepted: accepted.length - failed.length,
    // The reasons, never the rejected text: a mis-signed message is exactly the
    // one whose content must not reach a log the agent reads.
    dropped: dropped.map((d) => d.reason),
    // How many drop notices went back to the phone, and how many were planned:
    // a difference is a post the transport refused, and the launcher logs it.
    ...(notices.length > 0 ? { notices: noticesSent, noticesPlanned: notices.length } : {}),
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
