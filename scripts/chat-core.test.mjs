import { describe, expect, it } from 'vitest'
import {
  CLOCK_SKEW_MS,
  DIRECTIONS,
  DEFAULT_MAX_AGE_MS,
  ID_LEDGER_MAX,
  MAX_TEXT_LEN,
  PROTOCOL,
  SEEN_MAX,
  assessEvent,
  canonicalMessage,
  constantTimeEqual,
  MAX_DROP_NOTICES,
  deriveTopics,
  chatInboxLogLines,
  dropNoticeDecision,
  dropNoticeText,
  envelopeRetentionMs,
  formatChatStamp,
  ingest,
  pruneIdLedger,
  makeEnvelope,
  parseEnvelope,
  parseNtfyPoll,
  pollUrl,
  publishUrl,
  sanitizeText,
  signMessage,
  TEST_VECTOR,
  sinceParam,
  verifyMessage,
} from './chat-core.mjs'

const SECRET = 'hoa-test-secret'
const OTHER = 'not-the-secret'
const NOW = 1_700_000_000_000

/** The frozen cross-implementation vector, shared with the page (chat-core). */
const VECTOR = TEST_VECTOR
const IN_MSG = { ...VECTOR.message, direction: 'inbox' }
const OUT_MSG = { ...VECTOR.message, direction: 'outbox' }

/** One ntfy poll frame carrying a signed envelope. `id` is the TRANSPORT id,
 *  `msgId` the envelope's own — they are different identities on purpose. */
const event = async ({
  id = 'nfy1',
  direction = 'inbox',
  msgId = 'm1',
  time = Math.round(NOW / 1000),
  secret = SECRET,
  ts = NOW,
  text = 'hallo',
} = {}) => ({
  id,
  time,
  event: 'message',
  topic: 't',
  message: JSON.stringify(await makeEnvelope({ secret, direction, id: msgId, ts, text })),
})

describe('topic derivation', () => {
  it('is deterministic and matches the frozen cross-implementation vector', async () => {
    const a = await deriveTopics(VECTOR.secret)
    const b = await deriveTopics(VECTOR.secret)
    expect(a).toEqual(b)
    expect(a.inbox).toBe(VECTOR.inbox)
    expect(a.outbox).toBe(VECTOR.outbox)
  })

  it('gives the two directions DIFFERENT topics, so one leak is not both', async () => {
    const { inbox, outbox } = await deriveTopics(SECRET)
    expect(inbox).not.toBe(outbox)
  })

  it('trims, so a trailing newline in the secret file pairs with a pasted secret', async () => {
    expect(await deriveTopics(`  ${SECRET}\n`)).toEqual(await deriveTopics(SECRET))
  })

  it('carries no fragment of the secret and is a legal ntfy topic', async () => {
    const { inbox, outbox } = await deriveTopics(SECRET)
    for (const t of [inbox, outbox]) {
      expect(t).toMatch(/^hoa-[0-9a-f]{32}$/)
      expect(t).not.toContain(SECRET)
    }
  })

  it('changes completely with the secret, and refuses an empty one', async () => {
    const a = await deriveTopics(SECRET)
    const b = await deriveTopics(OTHER)
    expect(a.inbox).not.toBe(b.inbox)
    await expect(deriveTopics('   ')).rejects.toThrow()
  })
})

describe('canonical form and signing', () => {
  it('quotes every field, so no two different messages share a canonical form', () => {
    const canon = canonicalMessage({ direction: 'inbox', id: 'a', ts: 1, text: 'b\nc' })
    expect(canon).toBe(`${PROTOCOL}\n"inbox"\n"a"\n"1"\n"b\\nc"`)
    // The ambiguity a raw join had: a newline moved between fields collided.
    expect(canonicalMessage({ direction: 'inbox', id: 'a', ts: 1, text: 'b\nc' })).not.toBe(
      canonicalMessage({ direction: 'inbox', id: 'a\n1', ts: 'b', text: 'c' }),
    )
  })

  it('signs to the frozen vector', async () => {
    expect(await signMessage(VECTOR.secret, { ...VECTOR.message, direction: 'inbox' })).toBe(VECTOR.inboxSig)
    expect(await signMessage(VECTOR.secret, { ...VECTOR.message, direction: 'outbox' })).toBe(VECTOR.outboxSig)
  })

  it('verifies a valid signature and rejects one made with another secret', async () => {
    expect(await verifyMessage(SECRET, IN_MSG, VECTOR.inboxSig)).toBe(true)
    expect(await verifyMessage(OTHER, IN_MSG, VECTOR.inboxSig)).toBe(false)
  })

  it('rejects anything that is not a 64-hex signature', async () => {
    for (const bad of ['', 'zz', VECTOR.inboxSig.slice(0, 63), `${VECTOR.inboxSig}0`, VECTOR.inboxSig.toUpperCase(), null, 42]) {
      expect(await verifyMessage(SECRET, IN_MSG, bad)).toBe(false)
    }
  })

  it('compares length-independently and without an early exit', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(constantTimeEqual(null, undefined)).toBe(true) // both '' — never throws
  })
})

describe('envelope parsing', () => {
  const good = { v: PROTOCOL, id: 'm1', ts: NOW, text: 'x', sig: VECTOR.inboxSig }

  it('accepts a well-formed envelope, as an object or as a json string', () => {
    expect(parseEnvelope(good).ok).toBe(true)
    expect(parseEnvelope(JSON.stringify(good)).ok).toBe(true)
  })

  it('names an envelope with no signature "unsigned", not "malformed"', () => {
    expect(parseEnvelope({ ...good, sig: undefined })).toEqual({ ok: false, reason: 'unsigned' })
    expect(parseEnvelope({ ...good, sig: '' })).toEqual({ ok: false, reason: 'unsigned' })
  })

  it('rejects a foreign protocol version, a bad id and a non-numeric timestamp', () => {
    expect(parseEnvelope({ ...good, v: 'hoa-chat-2' }).ok).toBe(false)
    expect(parseEnvelope({ ...good, id: 'has spaces' }).ok).toBe(false)
    expect(parseEnvelope({ ...good, id: 'x'.repeat(129) }).ok).toBe(false)
    expect(parseEnvelope({ ...good, ts: 'soon' }).ok).toBe(false)
    expect(parseEnvelope({ ...good, text: 42 }).ok).toBe(false)
  })

  it('never throws on junk', () => {
    for (const bad of [null, undefined, 42, '', 'not json', '{', [], {}]) {
      expect(() => parseEnvelope(bad)).not.toThrow()
      expect(parseEnvelope(bad).ok).toBe(false)
    }
  })
})

describe('one event, accepted or dropped', () => {
  it('accepts a valid signed message', async () => {
    const v = await assessEvent({ event: await event(), secret: SECRET, now: NOW })
    expect(v.accept).toBe(true)
    expect(v.message.text).toBe('hallo')
    expect(v.message.ntfyId).toBe('nfy1')
  })

  it('DROPS an unsigned message', async () => {
    const raw = { id: 'n', time: 1, event: 'message', message: JSON.stringify({ v: PROTOCOL, id: 'm', ts: NOW, text: 'x' }) }
    expect(await assessEvent({ event: raw, secret: SECRET, now: NOW })).toMatchObject({ accept: false, reason: 'unsigned' })
  })

  it('DROPS a mis-signed message — a signature from another secret', async () => {
    const v = await assessEvent({ event: await event({ secret: OTHER }), secret: SECRET, now: NOW })
    expect(v).toMatchObject({ accept: false, reason: 'bad-signature' })
  })

  it('DROPS a message whose text was tampered with after signing', async () => {
    const e = await event()
    const env = JSON.parse(e.message)
    e.message = JSON.stringify({ ...env, text: 'rm -rf /' })
    expect(await assessEvent({ event: e, secret: SECRET, now: NOW })).toMatchObject({ reason: 'bad-signature' })
  })

  it('DROPS a stale message — older than the window', async () => {
    const old = NOW - DEFAULT_MAX_AGE_MS - 1000
    const v = await assessEvent({ event: await event({ ts: old }), secret: SECRET, now: NOW })
    expect(v).toMatchObject({ accept: false, reason: 'stale' })
  })

  it('keeps a message just inside the window, and tolerates a little clock skew', async () => {
    const edge = NOW - DEFAULT_MAX_AGE_MS + 1000
    expect((await assessEvent({ event: await event({ ts: edge }), secret: SECRET, now: NOW })).accept).toBe(true)
    const ahead = NOW + CLOCK_SKEW_MS - 1000
    expect((await assessEvent({ event: await event({ ts: ahead }), secret: SECRET, now: NOW })).accept).toBe(true)
    const wayAhead = NOW + CLOCK_SKEW_MS + 60_000
    expect(await assessEvent({ event: await event({ ts: wayAhead }), secret: SECRET, now: NOW })).toMatchObject({
      reason: 'stale',
    })
  })

  it('respects a shortened window (the value is calibratable)', async () => {
    const e = await event({ ts: NOW - 60_000 })
    expect((await assessEvent({ event: e, secret: SECRET, now: NOW })).accept).toBe(true)
    expect(await assessEvent({ event: e, secret: SECRET, now: NOW, maxAgeMs: 30_000 })).toMatchObject({ reason: 'stale' })
  })

  it('ignores ntfy control frames without calling them a fault', async () => {
    for (const kind of ['open', 'keepalive', 'poll_request']) {
      expect(await assessEvent({ event: { event: kind }, secret: SECRET, now: NOW })).toMatchObject({
        reason: 'not-a-message',
      })
    }
  })
})

describe('delivery discipline — the ledger, not the cursor, is the dedupe', () => {
  it('spools a message once', async () => {
    const events = [await event()]
    const r = await ingest({ events, secret: SECRET, now: NOW })
    expect(r.accepted).toHaveLength(1)
    const again = await ingest({ events, secret: SECRET, now: NOW, state: r.state })
    expect(again.accepted).toHaveLength(0)
    expect(again.dropped).toEqual([{ reason: 'duplicate', ntfyId: 'nfy1' }])
  })

  it('DOES NOT REPLAY across a RESET cursor — the seen-ids still hold', async () => {
    const events = [await event()]
    const first = await ingest({ events, secret: SECRET, now: NOW })
    expect(first.accepted).toHaveLength(1)
    // The cursor is lost/corrupt; only the ledger survives. This is the case the
    // point was written for: the whole retention window is re-read.
    const reset = { cursor: 0, seen: first.state.seen }
    const second = await ingest({ events, secret: SECRET, now: NOW, state: reset })
    expect(second.accepted).toHaveLength(0)
  })

  it('catches a REPLAY under a fresh transport id — same envelope, new ntfy id', async () => {
    const e = await event({ id: 'nfy1' })
    const first = await ingest({ events: [e], secret: SECRET, now: NOW })
    const replay = { ...e, id: 'nfy2' }
    const second = await ingest({ events: [replay], secret: SECRET, now: NOW, state: first.state })
    expect(second.accepted).toHaveLength(0)
    expect(second.dropped[0].reason).toBe('duplicate')
  })

  it('advances the cursor over dropped messages too, so a bad one cannot pin the window', async () => {
    const bad = await event({ id: 'nfy9', time: 5000, secret: OTHER })
    const r = await ingest({ events: [bad], secret: SECRET, now: NOW })
    expect(r.accepted).toHaveLength(0)
    expect(r.state.cursor).toBe(5000)
  })

  it('remembers a mis-signed message so it is not re-reported every tick', async () => {
    const bad = await event({ id: 'nfyX', secret: OTHER })
    const r1 = await ingest({ events: [bad], secret: SECRET, now: NOW })
    expect(r1.dropped[0].reason).toBe('bad-signature')
    const r2 = await ingest({ events: [bad], secret: SECRET, now: NOW, state: r1.state })
    expect(r2.dropped[0].reason).toBe('duplicate')
  })

  it('keeps several distinct messages, in order, and caps the ledger', async () => {
    const events = []
    for (let i = 0; i < 5; i++) events.push(await event({ id: `n${i}`, msgId: `e${i}`, text: `m${i}`, time: 1000 + i }))
    const r = await ingest({ events, secret: SECRET, now: NOW })
    expect(r.accepted.map((m) => m.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4'])
    expect(r.state.cursor).toBe(1004)
    expect(r.state.seen.length).toBeLessThanOrEqual(SEEN_MAX)
  })

  it('never throws on a junk poll body or junk state', async () => {
    for (const events of [null, undefined, 'nope', 42, [null, 5, {}]]) {
      await expect(ingest({ events, secret: SECRET, now: NOW })).resolves.toBeTruthy()
    }
    await expect(ingest({ events: [], secret: SECRET, state: 'broken' })).resolves.toBeTruthy()
  })
})

describe('A DROPPED MESSAGE DOES NOT LOOK DELIVERED — the drop notice', () => {
  /** The only notifiable drop: a clock running further AHEAD than the skew. Such
   *  a message can never have been accepted at any earlier moment, because its
   *  age was more negative then — so "it was delivered long ago" is impossible. */
  const AHEAD_TS = NOW + CLOCK_SKEW_MS + 60_000
  /** The other half of `stale`: too OLD. Never notified — see the tests below. */
  const EXPIRED_TS = NOW - DEFAULT_MAX_AGE_MS - 60_000

  it('produces EXACTLY ONE notice for a clock-ahead message, naming the reason in German', async () => {
    const e = await event({ id: 'nfy1', msgId: 'vorgestellt', ts: AHEAD_TS })
    const r = await ingest({ events: [e], secret: SECRET, now: NOW })
    expect(r.accepted).toEqual([])
    expect(r.dropped.map((d) => d.reason)).toEqual(['stale'])
    expect(r.notices).toHaveLength(1)
    expect(r.notices[0].id).toBe('vorgestellt')
    expect(r.notices[0].text).toContain('Zustellung fehlgeschlagen')
    expect(r.notices[0].text).toContain('Uhr')
    // Never the message's own words: the two topics are derived separately so
    // that knowing one reveals nothing about the other.
    expect(r.notices[0].text).not.toContain('hallo')
  })

  it('produces NO notice for a bad signature — the outbox is not an oracle', async () => {
    const forged = await event({ id: 'nfyX', msgId: 'forged', ts: AHEAD_TS, secret: OTHER })
    const r = await ingest({ events: [forged], secret: SECRET, now: NOW })
    expect(r.dropped.map((d) => d.reason)).toEqual(['bad-signature'])
    expect(r.notices).toEqual([])
  })

  it('NEVER tells the user a DELIVERED message did not arrive (four-eyes finding F1)', async () => {
    // A message is accepted and acted on; its envelope id then expires from the
    // ledger; a replay of the very same envelope arrives past the window. It is
    // `stale` and verified, and its id was never notified — so the naive gate
    // would tell the user that an instruction which already ran never arrived.
    const e = await event({ id: 'nfy1', msgId: 'geliefert', text: 'v0.3 taggen' })
    const first = await ingest({ events: [e], secret: SECRET, now: NOW })
    expect(first.accepted).toHaveLength(1)
    const later = NOW + DEFAULT_MAX_AGE_MS + CLOCK_SKEW_MS + 60_000
    const replay = await ingest({ events: [{ ...e, id: 'nfy2' }], secret: SECRET, now: later, state: first.state })
    expect(replay.accepted).toEqual([])
    expect(replay.dropped[0].reason).toBe('stale')
    expect(replay.notices).toEqual([])
  })

  it('says nothing for an EXPIRED message at all — delivered or not is no longer knowable', async () => {
    const old = await event({ id: 'nfy1', msgId: 'alt', ts: EXPIRED_TS })
    const r = await ingest({ events: [old], secret: SECRET, now: NOW })
    expect(r.dropped[0].reason).toBe('stale')
    expect(r.notices).toEqual([])
  })

  it('produces no notice for an unsigned, malformed or control frame either', async () => {
    const raw = (message) => ({ id: 'nfyZ', time: 1, event: 'message', topic: 't', message })
    const events = [
      raw(JSON.stringify({ v: PROTOCOL, id: 'x', ts: NOW, text: 'hi' })),
      raw('not json at all'),
      { event: 'keepalive' },
    ]
    const r = await ingest({ events, secret: SECRET, now: NOW })
    expect(r.notices).toEqual([])
  })

  it('produces no notice for a DUPLICATE — the original DID land', async () => {
    const e = await event({ id: 'nfy1', msgId: 'm1' })
    const first = await ingest({ events: [e], secret: SECRET, now: NOW })
    expect(first.accepted).toHaveLength(1)
    const replay = { ...e, id: 'nfy2' }
    const second = await ingest({ events: [replay], secret: SECRET, now: NOW, state: first.state })
    expect(second.dropped[0].reason).toBe('duplicate')
    expect(second.notices).toEqual([])
  })

  it('notices the same envelope only ONCE, however often it is re-posted', async () => {
    const e = await event({ id: 'nfy1', msgId: 'vorgestellt', ts: AHEAD_TS })
    const first = await ingest({ events: [e], secret: SECRET, now: NOW })
    expect(first.notices).toHaveLength(1)
    expect(first.state.notified.map((n) => n.id)).toEqual(['vorgestellt'])
    // Re-posted under a transport id nothing has seen: still one notice in all.
    const again = await ingest({ events: [{ ...e, id: 'nfy2' }], secret: SECRET, now: NOW + 1000, state: first.state })
    expect(again.dropped[0].reason).toBe('stale')
    expect(again.notices).toEqual([])
  })

  // Point 430 A — the residual the four-eyes review of 417 left standing on
  // purpose. A clock-ahead message becomes acceptable simply by WAITING: its
  // stamp is fixed while `now` advances. So a replay after the wait, with its
  // transport id evicted from the count-capped `seen` by a flood in between,
  // could be accepted minutes after the sender was told it had NOT arrived.
  it('never ACCEPTS an envelope the sender was already told did not arrive', async () => {
    const e = await event({ id: 'nfy1', msgId: 'vorgestellt', ts: AHEAD_TS })
    const first = await ingest({ events: [e], secret: SECRET, now: NOW })
    expect(first.notices).toHaveLength(1)
    // The clock has caught up — the very same envelope is now inside the window —
    // and the flood has evicted its transport id from `seen`.
    const caughtUp = AHEAD_TS + 1000
    const flooded = { ...first.state, seen: [] }
    const again = await ingest({ events: [{ ...e, id: 'nfy2' }], secret: SECRET, now: caughtUp, state: flooded })
    expect(again.accepted).toEqual([]) // NOT delivered — the notice stands
    expect(again.dropped.map((d) => d.reason)).toEqual(['duplicate'])
    expect(again.notices).toEqual([]) // and no second, contradicting notice
    // The refusal survives the state round trip, so the next tick behaves alike.
    expect(again.state.notified.map((n) => n.id)).toEqual(['vorgestellt'])
  })

  it('refuses it within the SAME tick too, not only from the next state read', async () => {
    const e = await event({ id: 'nfy1', msgId: 'vorgestellt', ts: AHEAD_TS })
    // Two copies in one response: the notice is written for the first, and the
    // second may neither be accepted nor earn a notice of its own.
    const r = await ingest({ events: [e, { ...e, id: 'nfy2' }], secret: SECRET, now: NOW })
    expect(r.notices).toHaveLength(1)
    expect(r.accepted).toEqual([])
  })

  it('caps a BURST — a broken clock may not become an outbox flood', async () => {
    const events = []
    for (let i = 0; i < MAX_DROP_NOTICES + 4; i++) {
      events.push(await event({ id: `nfy${i}`, msgId: `vor${i}`, ts: AHEAD_TS }))
    }
    const r = await ingest({ events, secret: SECRET, now: NOW })
    expect(r.dropped).toHaveLength(events.length)
    expect(r.notices).toHaveLength(MAX_DROP_NOTICES)
    // Only what was actually announced is recorded as announced.
    expect(r.state.notified).toHaveLength(MAX_DROP_NOTICES)
  })

  // Point 430 B — the second residual: the launcher's log used an `if/else if`
  // chain, so a tick whose SPOOL WRITE failed took the first branch and the
  // drop-notice clause never ran. A refused notice must never be silent.
  it('logs BOTH the spool fault and the refused notice from one tick', () => {
    const lines = chatInboxLogLines({
      ok: false,
      reason: 'spool write failed for 1 message(s): EPERM',
      configured: true,
      accepted: 0,
      dropped: ['stale'],
      notices: 0,
      noticesPlanned: 1,
      pending: 3,
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('spool write failed')
    expect(lines[1]).toContain('DROP NOTICE NOT SENT: 1 of 1')
  })

  it('keeps the ordinary tick as quiet as it was', () => {
    // Nothing happened: no line at all, so a quarter-hourly tick writes nothing.
    expect(chatInboxLogLines({ ok: true, configured: true, accepted: 0, dropped: [], pending: 0 })).toEqual([])
    // Not paired on this machine: the documented silent opt-out.
    expect(chatInboxLogLines({ ok: true, configured: false, accepted: 0 })).toEqual([])
    // Notices all sent: the counts agree, so they earn no word.
    const sent = chatInboxLogLines({
      ok: true, configured: true, accepted: 1, dropped: ['stale'], notices: 1, noticesPlanned: 1, pending: 2,
    })
    expect(sent).toEqual(['chat inbox: 1 new, 2 pending (dropped: stale)'])
    // And it is total.
    for (const bad of [null, undefined, 42, 'nope']) expect(chatInboxLogLines(bad)).toEqual([])
    expect(chatInboxLogLines({ ok: false, configured: true })).toEqual(['chat inbox: unknown fault'])
  })

  it('gates each drop purely, with the deciding gate named', () => {
    const verdict = { accept: false, reason: 'stale', staleKind: 'ahead', verified: true, envelopeId: 'a', ts: NOW }
    expect(dropNoticeDecision({ verdict })).toEqual({ notify: true, reason: 'ahead' })
    expect(dropNoticeDecision({ verdict: { ...verdict, verified: false } }).reason).toBe('unverified')
    expect(dropNoticeDecision({ verdict: { ...verdict, reason: 'duplicate' } }).reason).toBe('not-notifiable')
    // The EXPIRED half of `stale` is the one that cannot be told apart from a
    // message delivered long ago — it is refused by the same gate.
    expect(dropNoticeDecision({ verdict: { ...verdict, staleKind: 'expired' } }).reason).toBe('not-notifiable')
    expect(dropNoticeDecision({ verdict: { ...verdict, staleKind: undefined } }).reason).toBe('not-notifiable')
    expect(dropNoticeDecision({ verdict: { ...verdict, envelopeId: '' } }).reason).toBe('no-envelope-id')
    expect(dropNoticeDecision({ verdict, notified: [{ id: 'a', at: NOW }] }).reason).toBe('already-notified')
    expect(dropNoticeDecision({ verdict, sent: MAX_DROP_NOTICES }).reason).toBe('rate-limited')
    expect(dropNoticeDecision({ verdict: { accept: true } }).reason).toBe('accepted')
    for (const bad of [null, undefined, 42, 'nope']) {
      expect(() => dropNoticeDecision({ verdict: bad })).not.toThrow()
      expect(dropNoticeDecision({ verdict: bad }).notify).toBe(false)
    }
  })

  it('writes a notice only for a reason it has words for', () => {
    expect(dropNoticeText({ reason: 'ahead', when: '12.11.23, 14:32' })).toContain('12.11.23, 14:32')
    expect(dropNoticeText({ reason: 'ahead' })).toContain('Zustellung fehlgeschlagen')
    for (const reason of ['stale', 'expired', 'duplicate', 'bad-signature', 'unsigned', 'malformed', null, undefined]) {
      expect(dropNoticeText({ reason })).toBeNull()
    }
    expect(dropNoticeText()).toBeNull()
  })

  it('formats a stamp a person can read, and refuses to invent one', () => {
    expect(formatChatStamp(NOW)).toMatch(/\d/)
    for (const bad of [null, undefined, NaN, 'soon', {}]) expect(formatChatStamp(bad)).toBeNull()
  })

  it('lets the NOTIFIED ledger go once the message could not be replayed anyway', async () => {
    const e = await event({ id: 'nfy1', msgId: 'vorgestellt', ts: AHEAD_TS })
    const first = await ingest({ events: [e], secret: SECRET, now: NOW })
    const later = NOW + DEFAULT_MAX_AGE_MS + CLOCK_SKEW_MS + 1000
    const aged = await ingest({ events: [], secret: SECRET, now: later, state: first.state })
    expect(aged.state.notified).toEqual([])
  })
})

describe('THE LEDGER CANNOT BE FLOODED OUT — envelope ids are bounded by the window', () => {
  /** A junk post to a known topic: it never verifies, but it costs a ledger
   *  entry. The cheap way to try to evict something that matters. */
  const junk = async (n) => ({ id: `junk-${n}`, time: Math.round(NOW / 1000), event: 'message', topic: 't', message: JSON.stringify({ v: PROTOCOL, id: `j${n}`, ts: NOW, text: 'x', sig: 'f'.repeat(64) }) })

  it('refuses a REPLAY after a flood of SEEN_MAX+ dropped transport ids', async () => {
    const real = await event({ id: 'nfy1', msgId: 'mine' })
    const first = await ingest({ events: [real], secret: SECRET, now: NOW })
    expect(first.accepted).toHaveLength(1)

    const flood = []
    for (let i = 0; i < SEEN_MAX + 50; i++) flood.push(await junk(i))
    const flooded = await ingest({ events: flood, secret: SECRET, now: NOW, state: first.state })
    expect(flooded.accepted).toHaveLength(0)
    // The transport ledger HAS been evicted — that is expected and cheap …
    expect(flooded.state.seen).not.toContain('m:mine')
    // … but the envelope ledger still holds the accepted id inside its window.
    expect(flooded.state.envelopes.map((e) => e.id)).toContain('mine')

    // The replay: same envelope, a transport id nothing has seen.
    const replay = { ...real, id: 'nfy-replay' }
    const after = await ingest({ events: [replay], secret: SECRET, now: NOW, state: flooded.state })
    expect(after.accepted).toHaveLength(0)
    expect(after.dropped[0].reason).toBe('duplicate')
  })

  it('lets an envelope id go once it is PAST the window — it can only be stale by then', async () => {
    const real = await event({ id: 'nfy1', msgId: 'mine' })
    const first = await ingest({ events: [real], secret: SECRET, now: NOW })
    const later = NOW + DEFAULT_MAX_AGE_MS + CLOCK_SKEW_MS + 1000
    const aged = await ingest({ events: [], secret: SECRET, now: later, state: first.state })
    expect(aged.state.envelopes).toHaveLength(0)
    // And the message it forgot is refused anyway — by age, not by memory.
    const replay = { ...real, id: 'nfy-replay' }
    const after = await ingest({ events: [replay], secret: SECRET, now: later, state: aged.state })
    expect(after.accepted).toHaveLength(0)
    expect(after.dropped[0].reason).toBe('stale')
  })

  it('keeps DROPPED events out of the envelope ledger entirely', async () => {
    const bad = await event({ id: 'nfyX', msgId: 'forged', secret: OTHER })
    const r = await ingest({ events: [bad], secret: SECRET, now: NOW })
    expect(r.state.envelopes).toEqual([])
    expect(r.state.seen).toContain('n:nfyX')
  })

  it('follows a shortened acceptance window', () => {
    expect(envelopeRetentionMs(60_000)).toBe(60_000 + CLOCK_SKEW_MS)
    expect(envelopeRetentionMs()).toBe(DEFAULT_MAX_AGE_MS + CLOCK_SKEW_MS)
    for (const bad of [0, -1, NaN, 'nope', null]) expect(envelopeRetentionMs(bad)).toBe(DEFAULT_MAX_AGE_MS + CLOCK_SKEW_MS)
  })
})

describe('pruneIdLedger — bounded by age, not by count', () => {
  it('drops what is past the retention and keeps what is inside it', () => {
    const entries = [{ id: 'old', at: NOW - 5000 }, { id: 'new', at: NOW - 100 }]
    expect(pruneIdLedger(entries, { now: NOW, retentionMs: 1000 }).map((e) => e.id)).toEqual(['new'])
  })

  it('keeps an entry whose stamp runs AHEAD of now — a fast phone clock is not a reason to forget', () => {
    expect(pruneIdLedger([{ id: 'ahead', at: NOW + 60_000 }], { now: NOW, retentionMs: 1000 })).toHaveLength(1)
  })

  it('keeps one entry per id, the newest stamp winning, oldest first', () => {
    const r = pruneIdLedger([{ id: 'a', at: 3 }, { id: 'b', at: 1 }, { id: 'a', at: 5 }], { now: 5, retentionMs: 100 })
    expect(r).toEqual([{ id: 'b', at: 1 }, { id: 'a', at: 5 }])
  })

  it('applies the disk ceiling by dropping what is nearest to expiring', () => {
    const entries = []
    for (let i = 0; i < 12; i++) entries.push({ id: `e${i}`, at: NOW - (12 - i) })
    const r = pruneIdLedger(entries, { now: NOW, retentionMs: 1000, cap: 5 })
    expect(r).toHaveLength(5)
    expect(r.map((e) => e.id)).toEqual(['e7', 'e8', 'e9', 'e10', 'e11'])
    expect(ID_LEDGER_MAX).toBeGreaterThan(SEEN_MAX)
  })

  it('is TOTAL — junk entries are skipped, never thrown on', () => {
    for (const bad of [null, undefined, 'nope', 42, [null, 5, {}, { id: 7, at: 1 }, { id: 'x' }, { id: 'y', at: 'soon' }]]) {
      expect(() => pruneIdLedger(bad, { now: NOW, retentionMs: 1000 })).not.toThrow()
      expect(pruneIdLedger(bad, { now: NOW, retentionMs: 1000 })).toEqual([])
    }
  })
})

describe('poll plumbing', () => {
  it('parses newline-delimited json and skips torn lines', () => {
    const body = `{"event":"open"}\n\nnot json\n{"event":"message","id":"a"}\n`
    expect(parseNtfyPoll(body)).toEqual([{ event: 'open' }, { event: 'message', id: 'a' }])
    expect(parseNtfyPoll(null)).toEqual([])
  })

  it('asks for the whole window without a cursor, and overlaps a second with one', () => {
    expect(sinceParam({})).toBe(`${Math.round(DEFAULT_MAX_AGE_MS / 1000)}s`)
    expect(sinceParam({ cursor: 1_700_000_500 })).toBe('1700000499')
    expect(sinceParam({ cursor: 'nonsense' })).toBe(`${Math.round(DEFAULT_MAX_AGE_MS / 1000)}s`)
  })

  it('builds encoded ntfy urls', () => {
    expect(pollUrl('hoa-abc', '10s')).toBe('https://ntfy.sh/hoa-abc/json?poll=1&since=10s')
    expect(publishUrl('hoa-abc')).toBe('https://ntfy.sh/hoa-abc')
  })
})

describe('text hygiene — a chat message is untrusted input', () => {
  it('strips control characters (ANSI escapes among them) but keeps newline and tab', () => {
    const ESC = String.fromCharCode(27)
    const NUL = String.fromCharCode(0)
    const cleaned = sanitizeText(`a${ESC}[31mred${NUL} b\t c\n d`)
    expect(cleaned).not.toContain(ESC)
    expect(cleaned).not.toContain(NUL)
    expect(cleaned).toContain('\t')
    expect(cleaned).toContain('\n')
  })

  it('clamps a flood to the maximum length', () => {
    expect(sanitizeText('x'.repeat(MAX_TEXT_LEN * 3))).toHaveLength(MAX_TEXT_LEN)
  })

  it('sanitises on the way OUT too, so a signed reply carries no escape', async () => {
    const ESC = String.fromCharCode(27)
    const env = await makeEnvelope({ secret: SECRET, direction: 'inbox', text: `a${ESC}b`, id: 'r1', ts: NOW })
    expect(env.text).toBe('a b')
    expect(await verifyMessage(SECRET, { direction: 'inbox', id: env.id, ts: env.ts, text: env.text }, env.sig)).toBe(true)
  })

  it('is total', () => {
    for (const bad of [null, undefined, 42, {}]) expect(() => sanitizeText(bad)).not.toThrow()
  })
})

// --- THE DIRECTION IS PART OF THE SIGNATURE ----------------------------------
//
// The four-eyes review (29.07.2026) found the hole this section closes: with
// `(protocol, id, ts, text)` signed under ONE key for both topics, an
// agent-signed OUTBOX envelope copied verbatim onto the INBOX verified, had a
// transport id the inbox ledger had never seen, and was spooled and handed to
// the spawn prompt AS THE USER'S WORDS. No secret required — the ntfy operator
// and any TLS-inspecting proxy on the phone's network see both topics and every
// plaintext envelope.
describe('cross-direction replay', () => {
  it('signs the SAME message differently in each direction', async () => {
    const a = await signMessage(SECRET, IN_MSG)
    const b = await signMessage(SECRET, OUT_MSG)
    expect(a).not.toBe(b)
    expect(a).toBe(VECTOR.inboxSig)
    expect(b).toBe(VECTOR.outboxSig)
  })

  it('REJECTS an outbox signature offered as an inbox message, and the reverse', async () => {
    expect(await verifyMessage(SECRET, IN_MSG, VECTOR.outboxSig)).toBe(false)
    expect(await verifyMessage(SECRET, OUT_MSG, VECTOR.inboxSig)).toBe(false)
  })

  it('DROPS an agent-signed envelope replayed onto the inbox', async () => {
    // Exactly the attack: the agent's reply, copied off the outbox and POSTed to
    // the inbox under a transport id the inbox has never seen.
    const reply = await event({ id: 'nfy-stolen', msgId: 'agent-1', direction: 'outbox', text: 'taggen und veroeffentlichen' })
    const v = await assessEvent({ event: reply, secret: SECRET, direction: 'inbox', now: NOW })
    expect(v).toMatchObject({ accept: false, reason: 'bad-signature' })
    const r = await ingest({ events: [reply], secret: SECRET, direction: 'inbox', now: NOW })
    expect(r.accepted).toEqual([])
  })

  it('DROPS a user-signed envelope replayed onto the outbox — the page is protected too', async () => {
    const sent = await event({ id: 'nfy-echo', msgId: 'user-1', direction: 'inbox', text: 'hallo' })
    const v = await assessEvent({ event: sent, secret: SECRET, direction: 'outbox', now: NOW })
    expect(v).toMatchObject({ accept: false, reason: 'bad-signature' })
  })

  it('still accepts each envelope on the topic it was signed for', async () => {
    const toAgent = await event({ id: 'n-in', msgId: 'in-1', direction: 'inbox' })
    expect((await assessEvent({ event: toAgent, secret: SECRET, direction: 'inbox', now: NOW })).accept).toBe(true)
    const toPhone = await event({ id: 'n-out', msgId: 'out-1', direction: 'outbox' })
    expect((await assessEvent({ event: toPhone, secret: SECRET, direction: 'outbox', now: NOW })).accept).toBe(true)
  })

  it('defaults to the inbox — the direction the agent side reads', async () => {
    const toAgent = await event({ direction: 'inbox' })
    expect((await assessEvent({ event: toAgent, secret: SECRET, now: NOW })).accept).toBe(true)
  })

  it('FAILS LOUDLY on a forgotten or unknown direction rather than signing something meaningless', async () => {
    for (const bad of [undefined, null, '', 'INBOX', 'both', 42]) {
      expect(() => canonicalMessage({ direction: bad, id: 'a', ts: 1, text: 'x' })).toThrow(/direction/)
      await expect(signMessage(SECRET, { direction: bad, id: 'a', ts: 1, text: 'x' })).rejects.toThrow(/direction/)
      // …and a verifier that forgot it rejects everything rather than accepting it.
      expect(await verifyMessage(SECRET, { direction: bad, ...VECTOR.message }, VECTOR.inboxSig)).toBe(false)
    }
  })

  it('names exactly the two directions', () => {
    expect(DIRECTIONS).toEqual(['inbox', 'outbox'])
    expect(Object.isFrozen(DIRECTIONS)).toBe(true)
  })
})
