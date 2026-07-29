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
import { randomUUID } from 'node:crypto'
import { readSecret } from './chat-secret.mjs'
import { deriveTopics, makeEnvelope, publishUrl } from './chat-core.mjs'

const FETCH_TIMEOUT_MS = 15000

/** Read stdin when no text argument was given. */
async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

export async function sendReply({ secret, text, id = randomUUID(), ts = Date.now(), fetchImpl = fetch }) {
  const { outbox } = await deriveTopics(secret)
  const envelope = await makeEnvelope({ secret, text, id, ts })
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
