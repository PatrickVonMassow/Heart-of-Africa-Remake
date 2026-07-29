import { describe, expect, it } from 'vitest'
import {
  CLOCK_SKEW_MS,
  DEFAULT_MAX_AGE_MS,
  MAX_TEXT_LEN,
  PROTOCOL,
  SEEN_MAX,
  assessEvent,
  canonicalMessage,
  constantTimeEqual,
  deriveTopics,
  ingest,
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

/** One ntfy poll frame carrying a signed envelope. `id` is the TRANSPORT id,
 *  `msgId` the envelope's own — they are different identities on purpose. */
const event = async ({
  id = 'nfy1',
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
  message: JSON.stringify(await makeEnvelope({ secret, id: msgId, ts, text })),
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
    const canon = canonicalMessage({ id: 'a', ts: 1, text: 'b\nc' })
    expect(canon).toBe(`${PROTOCOL}\n"a"\n"1"\n"b\\nc"`)
    // The ambiguity a raw join had: a newline moved between fields collided.
    expect(canonicalMessage({ id: 'a', ts: 1, text: 'b\nc' })).not.toBe(
      canonicalMessage({ id: 'a\n1', ts: 'b', text: 'c' }),
    )
  })

  it('signs to the frozen vector', async () => {
    expect(await signMessage(VECTOR.secret, VECTOR.message)).toBe(VECTOR.sig)
  })

  it('verifies a valid signature and rejects one made with another secret', async () => {
    expect(await verifyMessage(SECRET, VECTOR.message, VECTOR.sig)).toBe(true)
    expect(await verifyMessage(OTHER, VECTOR.message, VECTOR.sig)).toBe(false)
  })

  it('rejects anything that is not a 64-hex signature', async () => {
    for (const bad of ['', 'zz', VECTOR.sig.slice(0, 63), `${VECTOR.sig}0`, VECTOR.sig.toUpperCase(), null, 42]) {
      expect(await verifyMessage(SECRET, VECTOR.message, bad)).toBe(false)
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
  const good = { v: PROTOCOL, id: 'm1', ts: NOW, text: 'x', sig: VECTOR.sig }

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
    const env = await makeEnvelope({ secret: SECRET, text: `a${ESC}b`, id: 'r1', ts: NOW })
    expect(env.text).toBe('a b')
    expect(await verifyMessage(SECRET, { id: env.id, ts: env.ts, text: env.text }, env.sig)).toBe(true)
  })

  it('is total', () => {
    for (const bad of [null, undefined, 42, {}]) expect(() => sanitizeText(bad)).not.toThrow()
  })
})
