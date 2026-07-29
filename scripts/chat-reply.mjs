// THE WRITER HALF — an agent reply on its way to the phone.
//
//   node scripts/chat-reply.mjs "text"     # post to the OUTBOX topic
//   echo "text" | node scripts/chat-reply.mjs
//
// The reply is SIGNED with the same secret and the same canonical form as an
// incoming message, and the page VERIFIES it. That is not symmetry for its own
// sake: without it, anyone who ever learned the outbox topic could put words in
// the agent's mouth on the user's own board — and the user would act on them.
//
// Exits 0 on success, 1 on a failure it could not send, and says which. It is
// called from a session, not from the launcher, so a failure here may be loud.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { readSecret } from './chat-secret.mjs'
import { repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { deriveTopics, makeEnvelope, publishUrl } from './chat-core.mjs'

const FETCH_TIMEOUT_MS = 15000

// --- THE RECEIPT OF A SENT REPLY ------------------------------------------------
//
// The only EVIDENCE that a session actually ANSWERED (four-eyes review
// 29.07.2026, finding 1b). The message watcher may not mark a message consumed
// on the responder's exit CODE: a responder that reads its prompt, does nothing
// and ends its turn cleanly exits 0, and acking on that alone would take the
// user's instruction off the spool with nobody having answered it — a silent
// loss, worse than the wait the watcher exists to remove.
//
// So the ack asks for proof of an ACTION, and this file is the only place that
// can produce it: a reply the transport ACCEPTED. Written after `res.ok`, never
// before. Best effort in both directions — a receipt that cannot be written
// costs one duplicated message, never the send.

export const RECEIPT_PATH = repoPath('.claude', 'chat-reply-receipt.json')

export function recordReplyReceipt({ id = null, at = Date.now(), path = RECEIPT_PATH } = {}) {
  try {
    writeJsonAtomic(path, { at, id })
    return true
  } catch {
    return false
  }
}

/** The moment of the last SENT reply, or null. TOTAL. */
export function readReplyReceipt(path = RECEIPT_PATH) {
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'))
    return r && Number.isFinite(r.at) ? { at: Number(r.at), id: r.id ?? null } : null
  } catch {
    return null
  }
}

/** Read stdin when no text argument was given. */
async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * PUT ONE SIGNED ENVELOPE ON THE OUTBOX — and write NO receipt.
 *
 * Not everything the machine posts to the phone is an ANSWER. The launcher's
 * inbox tick posts drop notices through here (chat-core's `dropNoticeDecision`),
 * and a receipt for one of those would be a lie the watcher acts on: it would
 * read "a reply went out after the spawn" and mark the user's message consumed
 * with nobody having answered it — the silent loss `ackPlan` exists to prevent.
 * So the receipt belongs to `sendReply` alone.
 */
export async function postOutbox({ secret, text, id = randomUUID(), ts = Date.now(), fetchImpl = fetch }) {
  const { outbox } = await deriveTopics(secret)
  // Signed FOR the outbox: the direction is inside the signed string, so this
  // envelope cannot be copied onto the inbox and read there as the user's own
  // words (see DIRECTIONS in chat-core.mjs).
  const envelope = await makeEnvelope({ secret, direction: 'outbox', text, id, ts })
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error('chat reply timed out')), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(publishUrl(outbox), {
      method: 'POST',
      // No Title/Tags header: an ntfy push notification would carry the text
      // into the phone's notification shade, i.e. onto a lock screen, for a
      // message the user is about to read on the board anyway.
      headers: { 'Content-Type': 'application/json', Priority: 'min' },
      body: JSON.stringify(envelope),
      signal: ac.signal,
    })
    return { ok: res.ok, status: res.status, id: envelope.id }
  } finally {
    clearTimeout(timer)
  }
}

/** An AGENT'S ANSWER on its way to the phone: the same post, plus the receipt
 *  that proves a session acted. Written ONLY for a send the transport accepted.
 *  `receiptPath` exists so a test can prove that without writing into `.claude/`. */
export async function sendReply({ receiptPath = RECEIPT_PATH, ...args }) {
  const r = await postOutbox(args)
  if (r.ok) recordReplyReceipt({ id: r.id, path: receiptPath })
  return r
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/chat-reply.mjs')) {
  const secret = readSecret()
  if (!secret) {
    console.error('no chat secret — run: node scripts/chat-secret.mjs --init')
    process.exit(1)
  }
  const text = (process.argv.slice(2).join(' ') || (await readStdin())).trim()
  if (!text) {
    console.error('nothing to send (pass the text as an argument or on stdin)')
    process.exit(1)
  }
  try {
    const r = await sendReply({ secret, text })
    console.log(r.ok ? `sent (${r.id})` : `NOT sent: HTTP ${r.status}`)
    process.exit(r.ok ? 0 : 1)
  } catch (e) {
    console.error(`NOT sent: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
