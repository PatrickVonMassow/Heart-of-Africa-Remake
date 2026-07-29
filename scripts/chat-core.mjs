// THE CHAT CHANNEL'S DECIDING HALF — pure, no I/O, no clock of its own.
//
// The board is READ from a phone; this is the way back. The transport is ntfy
// (already a dependency of scripts/notify.mjs): one INBOX topic carries phone →
// agent, one OUTBOX topic carries agent → phone.
//
// WHY THE CRYPTO IS THE POINT AND NOT A LATER HARDENING. The board page is
// PUBLIC — anything embedded in it is public. A topic name in that HTML would be
// an open port into a session that runs with permissions pre-granted and a
// GitHub token on disk; the realistic worst case is command execution on the
// user's machine. So:
//   - the topics are DERIVED from a shared secret (SHA-256), never written into
//     any tracked file and never into the published page. The page asks the user
//     for the secret once and keeps it in localStorage; the machine keeps it in
//     the git-ignored .claude/chat-secret.
//   - every message carries an HMAC-SHA256 over its canonical (id, ts, text).
//     Anything unsigned, mis-signed, stale or already seen is DROPPED here.
// The signature is authentication, NOT authorisation: a verified message is
// still untrusted INPUT. It may never authorise an outward-facing or
// irreversible step (tag, publish, force-push, delete) — see docs/batch-autonomy.md.
//
// WEBCRYPTO ONLY, ON PURPOSE. The browser half of this protocol lives as a
// literal inside public/board/index.html (a deployed page cannot import a Node
// module), so both halves are written against the same `crypto.subtle` API and
// the SAME derivation strings. scripts/chat-core.test.mjs extracts the page's
// block, runs it in Node and asserts byte-identical topics and signatures — a
// drift between the two would silently split the channel in half.

/** Protocol tag. It is part of every signed string, so a future v2 message can
 *  never verify against a v1 secret by accident. */
export const PROTOCOL = 'hoa-chat-1'

/** Human-recognisable prefix; the entropy is the 128 bits behind it. The
 *  DIRECTION is deliberately not in the name — a leaked topic should not also
 *  announce which of the two is the one the agent reads. */
export const TOPIC_PREFIX = 'hoa'

/** ntfy.sh caches a message for 12 hours ("Messages you publish are temporarily
 *  cached on our servers (default: 12 hours)", https://docs.ntfy.sh/privacy/;
 *  the server default `cache-duration: 12h`, https://docs.ntfy.sh/config/).
 *  The acceptance window matches it: beyond retention a replay is impossible
 *  anyway, and a shorter window would silently discard a message the user sent
 *  while the batch was down. Calibratable — the CLI reads HOA_CHAT_MAX_AGE_MS. */
export const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** A phone clock runs a little ahead sometimes; that is not an attack. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000

/** Longer than a phone user types, short enough that a flood cannot fill a disk. */
export const MAX_TEXT_LEN = 2000

/** How many ids the replay ledger remembers. Two per message (the ntfy id and
 *  the envelope id), so this is ~250 messages — far past a 12-hour window. */
export const SEEN_MAX = 500

const enc = new TextEncoder()

const toHex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/**
 * The two topic names for one secret. ASYNC (WebCrypto is).
 *
 * Derivation is domain-separated per direction, so knowing one topic reveals
 * nothing about the other. The result is `hoa-<32 hex>` = 128 bits, which is
 * what makes the name unguessable rather than merely unpublished.
 */
export async function deriveTopics(secret) {
  const s = String(secret ?? '').trim()
  if (!s) throw new Error('chat secret is empty')
  const inbox = await sha256Hex(`${PROTOCOL}|topic|inbox|${s}`)
  const outbox = await sha256Hex(`${PROTOCOL}|topic|outbox|${s}`)
  return { inbox: `${TOPIC_PREFIX}-${inbox.slice(0, 32)}`, outbox: `${TOPIC_PREFIX}-${outbox.slice(0, 32)}` }
}

/**
 * The exact bytes that get signed. Every field is JSON-QUOTED before it is
 * joined, so no field can contain the separator and no combination of values can
 * be re-cut into a DIFFERENT message with the same canonical form. (Joining the
 * raw values was ambiguous: {id:'a\n1', ts:'b', text:'c'} produced the identical
 * string as {id:'a', ts:1, text:'b\nc'} — a test caught it before this shipped.)
 * `JSON.stringify` is byte-identical in Node and in every browser, which is what
 * lets the page's copy of this protocol agree with this one.
 */
export function canonicalMessage({ id, ts, text }) {
  return [PROTOCOL, JSON.stringify(String(id)), JSON.stringify(String(ts)), JSON.stringify(String(text))].join('\n')
}

/** Hex HMAC-SHA256 over the canonical message. */
export async function signMessage(secret, message) {
  const key = await hmacKey(secret)
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(canonicalMessage(message))))
}

/** Length-independent hex compare — no early exit on the first differing byte. */
export function constantTimeEqual(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

/** Does this envelope's signature hold under `secret`? */
export async function verifyMessage(secret, message, signature) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false
  try {
    return constantTimeEqual(await signMessage(secret, message), signature)
  } catch {
    return false
  }
}

/** Build the wire envelope for a text. Used by the page and by chat-reply. */
export async function makeEnvelope({ secret, text, id, ts = Date.now() }) {
  const body = { v: PROTOCOL, id: String(id), ts: Number(ts), text: sanitizeText(text) }
  return { ...body, sig: await signMessage(secret, body) }
}

/**
 * Strip what must never reach a terminal, a log or a prompt: C0/C1 controls
 * (ANSI escapes among them) survive nothing useful and read as an injection
 * attempt. Newline and tab are kept — people type them.
 */
export function sanitizeText(text) {
  let out = ''
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0)
    const control = (c < 32 && c !== 9 && c !== 10) || c === 127 || (c >= 128 && c < 160)
    out += control ? ' ' : ch
    if (out.length >= MAX_TEXT_LEN) break
  }
  return out.slice(0, MAX_TEXT_LEN)
}

/** Parse one ntfy JSON line. TOTAL — junk yields null, never a throw. */
export function parseNtfyLine(line) {
  if (typeof line !== 'string' || line.trim() === '') return null
  try {
    const o = JSON.parse(line)
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

/** Parse an ntfy `?poll=1` body (newline-delimited JSON). TOTAL. */
export function parseNtfyPoll(body) {
  return String(body ?? '')
    .split('\n')
    .map(parseNtfyLine)
    .filter(Boolean)
}

/** Shape check on the envelope inside an ntfy message. TOTAL. */
export function parseEnvelope(raw) {
  const o = typeof raw === 'string' ? parseNtfyLine(raw) : raw
  if (!o || typeof o !== 'object') return { ok: false, reason: 'malformed' }
  if (o.v !== PROTOCOL) return { ok: false, reason: 'malformed' }
  if (typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(o.id)) return { ok: false, reason: 'malformed' }
  if (!Number.isFinite(o.ts)) return { ok: false, reason: 'malformed' }
  if (typeof o.text !== 'string') return { ok: false, reason: 'malformed' }
  if (typeof o.sig !== 'string' || o.sig === '') return { ok: false, reason: 'unsigned' }
  return { ok: true, envelope: { v: o.v, id: o.id, ts: Number(o.ts), text: o.text, sig: o.sig } }
}

/** The ledger keys one message occupies: the transport's id AND the envelope's. */
export const seenKeys = ({ ntfyId, envelopeId }) =>
  [ntfyId ? `n:${ntfyId}` : null, envelopeId ? `m:${envelopeId}` : null].filter(Boolean)

/**
 * ONE ntfy event → accept or drop, with the reason. ASYNC (verification is).
 *
 * Drop reasons, in the order they are decided:
 *   not-a-message  the event is an `open`/`keepalive`/`poll_request` frame
 *   duplicate      its ntfy id is already in the ledger — decided FIRST, so a
 *                  re-read of the cache costs no verification and a message
 *                  once rejected is never re-reported as a fresh fault
 *   malformed      no parseable envelope of this protocol version
 *   unsigned       an envelope with no signature at all
 *   bad-signature  a signature that does not hold under the secret
 *   stale          older than the window (or further ahead than the skew)
 *   duplicate      its ENVELOPE id is in the ledger — the replay of a verified
 *                  message under a fresh transport id
 */
export async function assessEvent({ event, secret, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS, seen = [] }) {
  if (!event || typeof event !== 'object' || event.event !== 'message') {
    return { accept: false, reason: 'not-a-message' }
  }
  const ntfyId = typeof event.id === 'string' ? event.id : null
  const ledger = new Set(Array.isArray(seen) ? seen : [])
  if (ntfyId && ledger.has(`n:${ntfyId}`)) return { accept: false, reason: 'duplicate', ntfyId }

  const parsed = parseEnvelope(event.message)
  if (!parsed.ok) return { accept: false, reason: parsed.reason, ntfyId }
  const { id, ts, text, sig } = parsed.envelope

  const ok = await verifyMessage(secret, { id, ts, text }, sig)
  if (!ok) return { accept: false, reason: 'bad-signature', ntfyId }

  const age = now - ts
  if (age > maxAgeMs || age < -CLOCK_SKEW_MS) return { accept: false, reason: 'stale', ntfyId }

  if (ledger.has(`m:${id}`)) return { accept: false, reason: 'duplicate', ntfyId }

  return {
    accept: true,
    reason: 'ok',
    message: { id, ts, text: sanitizeText(text), ntfyId, receivedAt: now },
  }
}

/**
 * A whole poll response → what to spool and what the next state is. ASYNC, PURE.
 *
 * THE CURSOR IS NOT THE DEDUPE (the delivery discipline this point was written
 * with). The cursor only narrows the next poll; the LEDGER of seen ids is what
 * guarantees a message is spooled once. So a lost, reset or corrupt cursor
 * replays the whole retention window through here and produces nothing twice —
 * which is exactly what scripts/chat-core.test.mjs proves.
 *
 * The cursor advances over EVERY message event, dropped ones included: a message
 * that will never be accepted must not hold the window open for ever.
 */
export async function ingest({ events, secret, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS, state = {} } = {}) {
  const list = Array.isArray(events) ? events : []
  const seen = Array.isArray(state.seen) ? [...state.seen] : []
  let cursor = Number.isFinite(state.cursor) ? Number(state.cursor) : 0

  const accepted = []
  const dropped = []
  for (const event of list) {
    if (event && event.event === 'message' && Number.isFinite(event.time)) {
      cursor = Math.max(cursor, Number(event.time))
    }
    const verdict = await assessEvent({ event, secret, now, maxAgeMs, seen })
    if (verdict.accept) {
      accepted.push(verdict.message)
      seen.push(...seenKeys({ ntfyId: verdict.message.ntfyId, envelopeId: verdict.message.id }))
    } else if (verdict.reason !== 'not-a-message') {
      dropped.push({ reason: verdict.reason, ntfyId: verdict.ntfyId ?? null })
      // A message that failed to verify is remembered too, so a mis-signed
      // message re-read from the cache is not re-reported every quarter hour.
      if (verdict.ntfyId) seen.push(`n:${verdict.ntfyId}`)
    }
  }

  return { accepted, dropped, state: { cursor, seen: seen.slice(-SEEN_MAX) } }
}

/**
 * The `since=` value for the next poll. ntfy accepts a duration, a unix
 * timestamp, a message id or `all` (https://docs.ntfy.sh/subscribe/api/); a
 * timestamp is used because it survives a message id falling out of the cache.
 * One second of overlap is deliberate — the ledger deduplicates, and a message
 * landing in the same second as the cursor must not be skipped.
 */
export function sinceParam(state = {}, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const cursor = Number(state?.cursor)
  if (Number.isFinite(cursor) && cursor > 0) return String(Math.max(0, Math.floor(cursor) - 1))
  return `${Math.max(1, Math.round(maxAgeMs / 1000))}s`
}

/**
 * THE SHARED TEST VECTOR — the only thing holding the two implementations of
 * this protocol together. The browser half is a literal inside
 * public/board/index.html (a deployed page cannot import this module), so both
 * scripts/chat-core.test.mjs and scripts/chat-viewer.test.mjs assert against
 * these fixed values. A change to a derivation string, the topic length or the
 * canonical form breaks them on BOTH sides at once, which is the point.
 */
export const TEST_VECTOR = Object.freeze({
  secret: 'hoa-test-secret',
  inbox: 'hoa-38fdec7f90f796a6bb17f532fd061ced',
  outbox: 'hoa-dafacbb4e108a19c0c3f6850f845ce63',
  message: Object.freeze({ id: 'abc', ts: 1700000000000, text: 'hallo' }),
  sig: '79feb5a148880c950c9285a713199811d5611579b94dba6d1665ade82af1fbeb',
})

/** The poll URL for a topic. Kept here so both CLIs build it identically. */
export const pollUrl = (topic, since) =>
  `https://ntfy.sh/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`

/** The publish URL for a topic. */
export const publishUrl = (topic) => `https://ntfy.sh/${encodeURIComponent(topic)}`
