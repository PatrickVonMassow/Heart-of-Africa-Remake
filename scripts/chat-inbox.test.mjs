// THE INBOX'S FILE-LEVEL HALF: what survives a lost state file.
//
// chat-core proves the DECISION (unsigned/mis-signed/stale/duplicate drop);
// this proves the plumbing around it, and one property in particular: the
// dedupe ledger is rebuilt FROM THE SPOOL, so deleting or corrupting
// .claude/chat-state.json re-reads the whole retention window and still spools
// nothing twice. A cursor is a shortcut, never the guarantee.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readSpool, seededLedger } from './chat-inbox.mjs'
import { TEST_VECTOR, ingest, makeEnvelope } from './chat-core.mjs'

const dirs = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'hoa-chat-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const NOW = 1_700_000_000_000
const secret = TEST_VECTOR.secret

const frame = async ({ ntfyId, msgId, text, ts = NOW, direction = 'inbox' }) => ({
  id: ntfyId,
  time: Math.round(ts / 1000),
  event: 'message',
  topic: 't',
  message: JSON.stringify(await makeEnvelope({ secret, direction, id: msgId, ts, text })),
})

describe('the spool file', () => {
  it('reads back what was written, oldest first', () => {
    const p = join(tmp(), 'spool.jsonl')
    writeFileSync(p, `${JSON.stringify({ id: 'a', text: 'one' })}\n${JSON.stringify({ id: 'b', text: 'two' })}\n`)
    expect(readSpool(p).map((m) => m.text)).toEqual(['one', 'two'])
  })

  it('skips a torn line instead of losing the file', () => {
    const p = join(tmp(), 'spool.jsonl')
    writeFileSync(p, `${JSON.stringify({ id: 'a', text: 'one' })}\n{"id":"b",\n${JSON.stringify({ id: 'c', text: 'three' })}\n`)
    expect(readSpool(p).map((m) => m.text)).toEqual(['one', 'three'])
  })

  it('is empty, not an error, when there is no file at all', () => {
    expect(readSpool(join(tmp(), 'nothing.jsonl'))).toEqual([])
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
