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

/**
 * THE TWO DIRECTIONS, AND WHY THE SIGNATURE MUST NAME ONE (four-eyes review,
 * 29.07.2026 — this was a real hole, found before the first device was paired).
 *
 * The first cut signed only `(protocol, id, ts, text)` and used ONE key for both
 * directions. Nothing in that string said which topic the envelope belonged to,
 * so an agent-signed OUTBOX envelope could be copied verbatim and POSTed to the
 * INBOX: same key, same canonical form, a transport id the inbox ledger had
 * never seen — it verified, spooled, and reached the spawn prompt AS THE USER'S
 * WORDS. Nobody needs the secret for that. The ntfy.sh operator sees both topics
 * and every plaintext envelope; so does a TLS-inspecting proxy on the phone's
 * network, because the page polls both.
 *
 * ATTRIBUTION IS THE ONE PROPERTY THE HMAC EXISTS FOR, so the direction is bound
 * INTO the signed string. It is deliberately NOT carried on the wire: the
 * verifier supplies it from the topic it actually read, so a replay is judged
 * against the channel it arrived on rather than against a label an attacker
 * copied along with everything else.
 */
export const DIRECTIONS = Object.freeze(['inbox', 'outbox'])

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

/** How many ids the TRANSPORT ledger remembers. These are cheap and disposable:
 *  an ntfy id says only "this exact post was looked at once", so losing the
 *  oldest ones costs at most one re-verification. The ENVELOPE ids do NOT live
 *  under this cap — see `pruneIdLedger`. */
export const SEEN_MAX = 500

/**
 * THE ENVELOPE LEDGER IS BOUNDED BY THE ACCEPTANCE WINDOW, NOT BY A COUNT.
 *
 * Both id kinds used to share one `SEEN_MAX`-capped array, and dropped events
 * were pushed into it too — so ~500 junk posts to a known inbox topic EVICTED
 * the accepted envelope ids, and a captured envelope could then be replayed
 * under a fresh transport id and be accepted a second time. A count can always
 * be outrun; the window in which a replay is possible cannot, because an
 * envelope older than it is refused as `stale` whatever the ledger says.
 *
 * So an accepted envelope id is kept for exactly that window — `maxAgeMs` plus
 * the clock skew, past which `assessEvent` can never accept it again — and the
 * transport ids go on rotating as before.
 */
export function envelopeRetentionMs(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const ms = Number(maxAgeMs)
  return (Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_MAX_AGE_MS) + CLOCK_SKEW_MS
}

/**
 * A DISK BOUND, NOT A REPLAY BOUND. Only the holder of the secret can produce
 * envelopes that are accepted at all, so this ceiling cannot be reached by an
 * attacker — it exists so a state file cannot grow without limit under a fault
 * nobody foresaw. It is far above what a person types in twelve hours, and what
 * it drops first is the entry nearest to expiring anyway.
 */
export const ID_LEDGER_MAX = 5000

/**
 * PRUNE AN ID LEDGER BY AGE. PURE and TOTAL — junk entries are skipped.
 *
 * `entries` are `{ id, at }`, oldest first on the way out, one entry per id
 * (the newest `at` wins). An entry whose `at` lies AHEAD of `now` is kept: a
 * phone clock running a little fast is not a reason to forget a message.
 */
export function pruneIdLedger(entries, { now = Date.now(), retentionMs = DEFAULT_MAX_AGE_MS, cap = ID_LEDGER_MAX } = {}) {
  const byId = new Map()
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e !== 'object') continue
    const id = typeof e.id === 'string' && e.id !== '' ? e.id : null
    const at = Number(e.at)
    if (!id || !Number.isFinite(at) || now - at > retentionMs) continue
    const prev = byId.get(id)
    if (!prev || at > prev.at) byId.set(id, { id, at })
  }
  const list = [...byId.values()].sort((a, b) => a.at - b.at)
  return list.length > cap ? list.slice(-cap) : list
}

/** The ledger keys an envelope-id list contributes to a verification lookup. */
export const envelopeKeys = (entries) => (Array.isArray(entries) ? entries : []).map((e) => `m:${e?.id}`)

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
 *
 * `direction` comes FIRST after the protocol and is REQUIRED: an unknown one
 * throws rather than quietly producing a stable-but-meaningless signature, so a
 * caller that forgets it fails loudly instead of signing something nothing will
 * ever accept (see DIRECTIONS).
 */
export function canonicalMessage({ direction, id, ts, text }) {
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`unknown chat direction: ${JSON.stringify(direction)} (expected ${DIRECTIONS.join(' or ')})`)
  }
  return [
    PROTOCOL,
    JSON.stringify(direction),
    JSON.stringify(String(id)),
    JSON.stringify(String(ts)),
    JSON.stringify(String(text)),
  ].join('\n')
}

/** Hex HMAC-SHA256 over the canonical message. Throws on an unknown direction. */
export async function signMessage(secret, message) {
  const bytes = enc.encode(canonicalMessage(message)) // before importKey: fail fast
  const key = await hmacKey(secret)
  return toHex(await crypto.subtle.sign('HMAC', key, bytes))
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

/**
 * Does this signature hold under `secret` FOR THIS DIRECTION? `message` must
 * carry the direction the verifier read the envelope from — never one taken off
 * the wire. An unknown direction makes `signMessage` throw, and a throw here is
 * a `false`, so a caller that forgets it rejects everything rather than
 * accepting everything.
 */
export async function verifyMessage(secret, message, signature) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false
  try {
    return constantTimeEqual(await signMessage(secret, message), signature)
  } catch {
    return false
  }
}

/**
 * Build the wire envelope for a text. Used by the page (direction `inbox`) and
 * by chat-reply (direction `outbox`).
 *
 * The direction is signed but NOT written into the envelope: putting it on the
 * wire would only invite a reader to trust the label instead of the channel.
 */
export async function makeEnvelope({ secret, direction, text, id, ts = Date.now() }) {
  const body = { v: PROTOCOL, id: String(id), ts: Number(ts), text: sanitizeText(text) }
  return { ...body, sig: await signMessage(secret, { ...body, direction }) }
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
 *   bad-signature  a signature that does not hold under the secret FOR THE
 *                  DIRECTION this event was read from — an envelope signed for
 *                  the other topic lands here, which is the whole point of
 *                  binding the direction (see DIRECTIONS)
 *   stale          older than the window (or further ahead than the skew)
 *   duplicate      its ENVELOPE id is in the ledger — the replay of a verified
 *                  message under a fresh transport id
 *
 * `direction` is the topic the caller POLLED, never anything off the wire.
 */
export async function assessEvent({
  event,
  secret,
  direction = 'inbox',
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  seen = [],
}) {
  if (!event || typeof event !== 'object' || event.event !== 'message') {
    return { accept: false, reason: 'not-a-message' }
  }
  const ntfyId = typeof event.id === 'string' ? event.id : null
  const ledger = new Set(Array.isArray(seen) ? seen : [])
  if (ntfyId && ledger.has(`n:${ntfyId}`)) return { accept: false, reason: 'duplicate', ntfyId }

  const parsed = parseEnvelope(event.message)
  if (!parsed.ok) return { accept: false, reason: parsed.reason, ntfyId }
  const { id, ts, text, sig } = parsed.envelope

  const ok = await verifyMessage(secret, { direction, id, ts, text }, sig)
  if (!ok) return { accept: false, reason: 'bad-signature', ntfyId }

  // From here the signature HELD for this direction, so the envelope is genuinely
  // one of ours and a drop of it may be reported back to the sender. `verified`
  // is what carries that fact out — nothing above this line ever sets it, which
  // is what keeps the outbox from answering an attacker's probes (see
  // `dropNoticeDecision`).
  const age = now - ts
  if (age > maxAgeMs || age < -CLOCK_SKEW_MS) {
    return { accept: false, reason: 'stale', ntfyId, verified: true, envelopeId: id, ts }
  }

  if (ledger.has(`m:${id}`)) return { accept: false, reason: 'duplicate', ntfyId, verified: true, envelopeId: id, ts }

  return {
    accept: true,
    reason: 'ok',
    message: { id, ts, text: sanitizeText(text), ntfyId, receivedAt: now },
  }
}

// --- THE DROP NOTICE: a message that did not land must not LOOK delivered -------
//
// The page renders a sent message like any other — display never asks whether the
// machine accepted it. So a message dropped here (a phone clock further ahead
// than the skew is enough) left the user with a delivered-looking message the
// agent never received: the exact failure shape this channel exists to prevent,
// mirrored. A drop that the SENDER can do something about therefore goes back to
// the OUTBOX as a signed notice, and the page shows it beside the message.
//
// ONLY A VERIFIED ENVELOPE EVER EARNS ONE. A message that fails the signature
// check gets nothing at all: answering those would make the outbox an ORACLE for
// an attacker probing the inbox topic — post junk, watch the outbox, learn that
// somebody is listening and how the machine judges it. `verified` is set only
// after the HMAC held for the direction the event was read from.

/**
 * The drop reasons a notice is sent for.
 *
 * `stale` only, and the omissions are deliberate:
 *   - `bad-signature` / `unsigned` / `malformed` — not our sender; see the oracle
 *     note above.
 *   - `duplicate` — the ORIGINAL was accepted and delivered, so the user's words
 *     did land; a notice would say the opposite. It would also hand a captured
 *     envelope an amplifier: replay it and the machine posts on demand.
 */
export const NOTIFIABLE_DROP_REASONS = Object.freeze(['stale'])

/** At most this many notices per poll. A burst of stale messages is a broken
 *  clock, not a conversation — one poll may not turn it into an outbox flood. */
export const MAX_DROP_NOTICES = 3

/**
 * A timestamp as the board reader reads it. TOTAL — null for a junk value, an
 * ISO string where the runtime has no usable ICU data.
 */
export function formatChatStamp(ts, { locale = 'de-DE', timeZone = 'Europe/Berlin' } = {}) {
  // `typeof`, not `Number(…)`: `Number(null)` is 0, and 0 is finite, so a MISSING
  // stamp would be formatted as 01.01.1970 and printed to the user as the time
  // they sent their message (the `stampOf` lesson of chat-watcher-core.mjs).
  const n = typeof ts === 'number' && Number.isFinite(ts) ? ts : NaN
  if (!Number.isFinite(n)) return null
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(n))
  } catch {
    return new Date(n).toISOString()
  }
}

/**
 * The notice the phone shows. GERMAN — it is read on the board, where everything
 * around it is German. Null for a reason that earns no notice.
 *
 * IT NEVER ECHOES THE MESSAGE TEXT. The two topics are derived separately so
 * that knowing one reveals nothing about the other; quoting inbox content into
 * the outbox would hand exactly that away. The timestamp is enough to identify
 * which message it was, and it comes out of the SIGNED envelope.
 */
export function dropNoticeText({ reason, when = null } = {}) {
  if (reason !== 'stale') return null
  const stamp = when ? ` von ${when}` : ''
  return (
    `Zustellung fehlgeschlagen: Deine Nachricht${stamp} ist NICHT angekommen — sie lag außerhalb des ` +
    'Annahmefensters (zu alt, oder die Uhr des Geräts weicht zu weit ab). Bitte prüfe Datum und Uhrzeit ' +
    'am Telefon und schicke sie noch einmal.'
  )
}

/**
 * DOES THIS DROP EARN A NOTICE? PURE.
 *
 * Returns { notify, reason } — the reason names the gate that decided, so the
 * live path, a dry run and the tests all speak the same words.
 */
export function dropNoticeDecision({ verdict, notified = [], sent = 0, max = MAX_DROP_NOTICES } = {}) {
  const no = (reason) => ({ notify: false, reason })
  if (!verdict || verdict.accept === true) return no('accepted')
  if (verdict.verified !== true) return no('unverified')
  if (!NOTIFIABLE_DROP_REASONS.includes(verdict.reason)) return no('not-notifiable')
  if (typeof verdict.envelopeId !== 'string' || verdict.envelopeId === '') return no('no-envelope-id')
  // One notice per message, ever — a replay under fresh transport ids may not
  // become a notice generator.
  if ((Array.isArray(notified) ? notified : []).some((e) => e?.id === verdict.envelopeId)) return no('already-notified')
  if (!(Number(sent) < Number(max))) return no('rate-limited')
  return { notify: true, reason: verdict.reason }
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
 *
 * `direction` is the topic these events were POLLED from and is passed straight
 * through to the verification — an envelope signed for the other one drops as
 * `bad-signature`.
 *
 * THE STATE HAS TWO LEDGERS, and that is the fix for the flood (see
 * `envelopeRetentionMs`). `seen` stays what it was — the count-capped list of
 * transport ids, which dropped events still push into — while `envelopes` holds
 * every ACCEPTED envelope id under its own age-bounded retention, so no volume
 * of junk can evict one inside the window in which it could still be replayed.
 * Accepted envelope ids go into BOTH: the duplicate storage costs nothing and
 * keeps a reader of an older state file working unchanged.
 */
export async function ingest({
  events,
  secret,
  direction = 'inbox',
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  state = {},
} = {}) {
  const list = Array.isArray(events) ? events : []
  const seen = Array.isArray(state.seen) ? [...state.seen] : []
  const retentionMs = envelopeRetentionMs(maxAgeMs)
  const envelopes = pruneIdLedger(state.envelopes, { now, retentionMs })
  // Which dropped envelopes the sender has already been told about. Anchored on
  // the moment of the NOTICE, not on the message's own stamp: a stale message is
  // stale by definition, so its stamp would expire the entry at once and the
  // next replay would earn a second notice.
  const notified = pruneIdLedger(state.notified, { now, retentionMs })
  // What the verification actually reads: the transport ledger PLUS every
  // envelope id still inside its window, whether or not `seen` still holds it.
  const lookup = [...seen, ...envelopeKeys(envelopes)]
  let cursor = Number.isFinite(state.cursor) ? Number(state.cursor) : 0

  const accepted = []
  const dropped = []
  /** What the caller must POST to the outbox — see the drop-notice section. */
  const notices = []
  for (const event of list) {
    if (event && event.event === 'message' && Number.isFinite(event.time)) {
      cursor = Math.max(cursor, Number(event.time))
    }
    const verdict = await assessEvent({ event, secret, direction, now, maxAgeMs, seen: lookup })
    if (verdict.accept) {
      accepted.push(verdict.message)
      const keys = seenKeys({ ntfyId: verdict.message.ntfyId, envelopeId: verdict.message.id })
      seen.push(...keys)
      lookup.push(...keys)
      // The envelope's OWN timestamp is the anchor: it is what decides how much
      // longer the message could be accepted, so it is what decides how much
      // longer it must be refused.
      envelopes.push({ id: verdict.message.id, at: verdict.message.ts })
    } else if (verdict.reason !== 'not-a-message') {
      dropped.push({ reason: verdict.reason, ntfyId: verdict.ntfyId ?? null })
      // A message that failed to verify is remembered too, so a mis-signed
      // message re-read from the cache is not re-reported every quarter hour.
      // Transport ids only — this is exactly the path a flood comes down, and
      // it may not reach the envelope ledger.
      if (verdict.ntfyId) {
        seen.push(`n:${verdict.ntfyId}`)
        lookup.push(`n:${verdict.ntfyId}`)
      }
      // A drop the SENDER can act on goes back to them; everything else stays
      // silent. The ledger entry is written whether or not the post later
      // succeeds: the transport id is already remembered, so this message will
      // never be judged again, and a notice is at-most-once by design.
      const plan = dropNoticeDecision({ verdict, notified, sent: notices.length })
      if (plan.notify) {
        notices.push({
          id: verdict.envelopeId,
          reason: verdict.reason,
          ts: verdict.ts ?? null,
          text: dropNoticeText({ reason: verdict.reason, when: formatChatStamp(verdict.ts) }),
        })
        notified.push({ id: verdict.envelopeId, at: now })
      }
    }
  }

  return {
    accepted,
    dropped,
    notices,
    state: {
      cursor,
      seen: seen.slice(-SEEN_MAX),
      envelopes: pruneIdLedger(envelopes, { now, retentionMs }),
      notified: pruneIdLedger(notified, { now, retentionMs }),
    },
  }
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
 *
 * The two signatures are the SAME message in the two directions, and they
 * DIFFER — that difference is the fix for the replay hole DIRECTIONS describes,
 * pinned as a value rather than only as an argument.
 *
 * NEVER PAIR A REAL DEVICE WITH THIS SECRET. `hoa-test-secret` is published in
 * this repository, so the two topics below are LIVE, PUBLIC ntfy topics that
 * anyone reading the source can poll and post to. They exist to compare two
 * implementations, not to carry anything.
 */
export const TEST_VECTOR = Object.freeze({
  secret: 'hoa-test-secret',
  inbox: 'hoa-38fdec7f90f796a6bb17f532fd061ced',
  outbox: 'hoa-dafacbb4e108a19c0c3f6850f845ce63',
  message: Object.freeze({ id: 'abc', ts: 1700000000000, text: 'hallo' }),
  inboxSig: 'ee7eb72f69dd277b7dc5e782270d43a7b489dbefc5ee6d9fc02e2e4e85fc844a',
  outboxSig: 'c9c9c129102ae7bedf8ef766bc4c2630fc01dc8e012c438827c95e7c89c70fc8',
})

/** The poll URL for a topic. Kept here so both CLIs build it identically. */
export const pollUrl = (topic, since) =>
  `https://ntfy.sh/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`

/**
 * The STREAMING URL for a topic — the same `/json` endpoint without `poll=1`,
 * which keeps one connection open and pushes each message as a line as it
 * arrives (https://docs.ntfy.sh/subscribe/api/). scripts/chat-watcher.mjs
 * subscribes through it so an idle machine answers within seconds instead of at
 * the next launcher tick.
 *
 * IT IS THIS AND NOT `/sse` ON PURPOSE. Both are one long-lived connection, so
 * both avoid the rate limits a tight poll runs into; the difference is the frame.
 * `/sse` wraps the same object in `data: ` lines, i.e. a SECOND parser beside
 * `parseNtfyLine` and a second place for a protocol change to be missed. The
 * JSON stream is byte-for-byte what `parseNtfyPoll` already reads, so the
 * verification path of a streamed message and of a polled one is literally the
 * same code.
 */
export const streamUrl = (topic, since) =>
  `https://ntfy.sh/${encodeURIComponent(topic)}/json?since=${encodeURIComponent(since)}`

/** The publish URL for a topic. */
export const publishUrl = (topic) => `https://ntfy.sh/${encodeURIComponent(topic)}`
