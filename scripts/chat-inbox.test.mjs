// THE INBOX'S FILE-LEVEL HALF: what survives a lost state file.
//
// chat-core proves the DECISION (unsigned/mis-signed/stale/duplicate drop);
// this proves the plumbing around it, and one property in particular: the
// dedupe ledger is rebuilt FROM THE SPOOL, so deleting or corrupting
// .claude/chat-state.json re-reads the whole retention window and still spools
// nothing twice. A cursor is a shortcut, never the guarantee.
//
// The spool's own file layout — one file per message, the claim, the migration
// off the stage-1 .jsonl — is proved in scripts/chat-spool.test.mjs.
import { describe, expect, it } from 'vitest'
import { seededLedger, stateAfterSpool } from './chat-inbox.mjs'
import { TEST_VECTOR, ingest, makeEnvelope } from './chat-core.mjs'

const NOW = 1_700_000_000_000
const secret = TEST_VECTOR.secret

const frame = async ({ ntfyId, msgId, text, ts = NOW, direction = 'inbox' }) => ({
  id: ntfyId,
  time: Math.round(ts / 1000),
  event: 'message',
  topic: 't',
  message: JSON.stringify(await makeEnvelope({ secret, direction, id: msgId, ts, text })),
})

describe('A MESSAGE WHOSE SPOOL WRITE FAILED IS NOT RECORDED AS SEEN', () => {
  const next = {
    cursor: 5000,
    seen: ['n:n1', 'm:m1', 'n:n2', 'm:m2'],
    envelopes: [{ id: 'm1', at: NOW }, { id: 'm2', at: NOW }],
  }

  it('keeps both ledgers and the new cursor when everything reached the disk', () => {
    expect(stateAfterSpool({ next, previousCursor: 4000, failed: [] })).toEqual({
      cursor: 5000,
      seen: next.seen,
      envelopes: next.envelopes,
      notified: [],
    })
  })

  it('strikes the failed message from the AGE-BOUNDED ledger too, or it is lost for good', () => {
    const r = stateAfterSpool({ next, previousCursor: 4000, failed: [{ id: 'm2', ntfyId: 'n2' }] })
    expect(r.envelopes).toEqual([{ id: 'm1', at: NOW }])
  })

  it('strikes the failed message from the ledger, so the next poll re-accepts it', () => {
    const r = stateAfterSpool({ next, previousCursor: 4000, failed: [{ id: 'm2', ntfyId: 'n2' }] })
    expect(r.seen).toEqual(['n:n1', 'm:m1'])
    expect(r.seen).not.toContain('n:n2')
    expect(r.seen).not.toContain('m:m2')
  })

  it('leaves the CURSOR where it was, or the re-poll would not even see the event', () => {
    expect(stateAfterSpool({ next, previousCursor: 4000, failed: [{ id: 'm2', ntfyId: 'n2' }] }).cursor).toBe(4000)
    // No previous cursor at all: the next poll re-reads the whole window, which
    // is the conservative direction — the ledger stops anything spooling twice.
    expect(stateAfterSpool({ next, previousCursor: undefined, failed: [{ id: 'm2' }] }).cursor).toBeUndefined()
  })

  it('keeps the messages that DID reach the disk in the ledger', () => {
    const r = stateAfterSpool({ next, previousCursor: 4000, failed: [{ id: 'm2', ntfyId: 'n2' }] })
    expect(r.seen).toContain('n:n1')
    expect(r.seen).toContain('m:m1')
  })

  it('strikes a message that carried no ntfy id by its envelope id alone', () => {
    const state = { cursor: 9, seen: ['m:m7'], envelopes: [{ id: 'm7', at: NOW }] }
    const r = stateAfterSpool({ next: state, previousCursor: 3, failed: [{ id: 'm7', ntfyId: null }] })
    expect(r).toEqual({ cursor: 3, seen: [], envelopes: [], notified: [] })
  })

  it('survives junk instead of throwing on the state write path', () => {
    expect(() => stateAfterSpool({ next: null, previousCursor: NaN, failed: [null] })).not.toThrow()
    expect(stateAfterSpool({ next: undefined, previousCursor: 1, failed: [] })).toEqual({
      cursor: undefined,
      seen: [],
      envelopes: [],
      notified: [],
    })
  })
})

describe('the ledger is seeded from the spool, not only from the cursor file', () => {
  it('rebuilds both id kinds for every spooled message', () => {
    const spool = [{ id: 'm1', ntfyId: 'n1' }, { id: 'm2', ntfyId: 'n2' }]
    expect(seededLedger({}, spool).sort()).toEqual(['m:m1', 'm:m2', 'n:n1', 'n:n2'])
  })

  it('unions with whatever the state file still holds, without duplicating', () => {
    const spool = [{ id: 'm1', ntfyId: 'n1' }]
    const led = seededLedger({ seen: ['n:n1', 'n:n9'] }, spool)
    expect(new Set(led)).toEqual(new Set(['m:m1', 'n:n1', 'n:n9']))
    expect(led).toHaveLength(3)
  })

  it('survives junk state', () => {
    for (const bad of [null, undefined, 42, { seen: 'nope' }]) expect(() => seededLedger(bad, [])).not.toThrow()
  })
})

describe('THE CASE THE POINT WAS WRITTEN FOR: a lost or corrupt cursor', () => {
  it('re-reads the whole window and spools nothing twice', async () => {
    const events = [
      await frame({ ntfyId: 'n1', msgId: 'm1', text: 'erste' }),
      await frame({ ntfyId: 'n2', msgId: 'm2', text: 'zweite' }),
    ]
    const first = await ingest({ events, secret, now: NOW })
    expect(first.accepted.map((m) => m.text)).toEqual(['erste', 'zweite'])

    // The state file is gone. Everything the process still has is the spool.
    const spool = first.accepted
    const rebuilt = { cursor: undefined, seen: seededLedger(null, spool) }
    const second = await ingest({ events, secret, now: NOW, state: rebuilt })
    expect(second.accepted).toEqual([])
    expect(second.dropped.map((d) => d.reason)).toEqual(['duplicate', 'duplicate'])

    // And a genuinely NEW message still gets through on that same reset.
    const withNew = [...events, await frame({ ntfyId: 'n3', msgId: 'm3', text: 'dritte' })]
    const third = await ingest({ events: withNew, secret, now: NOW, state: rebuilt })
    expect(third.accepted.map((m) => m.text)).toEqual(['dritte'])
  })

  it('a CORRUPT cursor (garbage, or from the future) changes nothing about delivery', async () => {
    const events = [await frame({ ntfyId: 'n1', msgId: 'm1', text: 'erste' })]
    const first = await ingest({ events, secret, now: NOW })
    for (const cursor of ['nonsense', NaN, -5, 9_999_999_999]) {
      const again = await ingest({ events, secret, now: NOW, state: { cursor, seen: first.state.seen } })
      expect(again.accepted).toEqual([])
    }
  })
})

describe('the spool never takes a message from the wrong channel', () => {
  it('drops an agent-signed reply replayed onto the inbox, spool untouched', async () => {
    const mine = await frame({ ntfyId: 'n1', msgId: 'm1', text: 'echte Nutzernachricht' })
    const stolen = await frame({ ntfyId: 'n2', msgId: 'm2', text: 'v0.3 taggen', direction: 'outbox' })
    const r = await ingest({ events: [mine, stolen], secret, direction: 'inbox', now: NOW })
    expect(r.accepted.map((m) => m.text)).toEqual(['echte Nutzernachricht'])
    expect(r.dropped).toEqual([{ reason: 'bad-signature', ntfyId: 'n2' }])
    // And the ledger seeded from that spool still lets nothing through later.
    const led = seededLedger(null, r.accepted)
    const again = await ingest({ events: [mine, stolen], secret, direction: 'inbox', now: NOW, state: { seen: led } })
    expect(again.accepted).toEqual([])
  })
})
