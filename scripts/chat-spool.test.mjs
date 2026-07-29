// THE SPOOL AS A DIRECTORY, AND THE ONE-TIME MIGRATION INTO IT.
//
// What is proved here is the consumption protocol: a message is claimed by a
// RENAME before it is shown, so it is delivered exactly once even when two
// readers race; a delivered message stays readable for the replay ledger; and a
// stage-1 .jsonl on disk is carried over rather than lost.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONSUMED_RETENTION_MS,
  claimMessage,
  claimOldest,
  consumedDir,
  deliverPendingMessages,
  isSpooled,
  knownMessages,
  migrateLegacySpool,
  pruneConsumed,
  readConsumed,
  readLegacyJsonl,
  readPending,
  spoolMessage,
} from './chat-spool.mjs'

const dirs = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'hoa-spool-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const NOW = 1_700_000_000_000
const msg = (over = {}) => ({ id: 'm1', ts: NOW, text: 'hallo', ntfyId: 'n1', receivedAt: NOW, ...over })

describe('one file per message', () => {
  it('writes and reads back, oldest first', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg({ id: 'm2', ntfyId: 'n2', text: 'zweite', receivedAt: NOW + 10 }), dir)
    spoolMessage(msg({ text: 'erste' }), dir)
    expect(readPending(dir).map((m) => m.text)).toEqual(['erste', 'zweite'])
  })

  it('creates the directory itself — the channel may be paired at any moment', () => {
    const dir = join(tmp(), 'deep', 'spool')
    expect(spoolMessage(msg(), dir).ok).toBe(true)
    expect(readPending(dir)).toHaveLength(1)
  })

  it('never writes the same message twice, however often the poll re-reads it', () => {
    const dir = join(tmp(), 'spool')
    expect(spoolMessage(msg(), dir).ok).toBe(true)
    expect(spoolMessage(msg({ text: 'geaendert' }), dir)).toMatchObject({ ok: false, reason: 'already-spooled' })
    expect(readPending(dir).map((m) => m.text)).toEqual(['hallo'])
  })

  it('refuses a message whose id could not be a file name', () => {
    const dir = join(tmp(), 'spool')
    expect(spoolMessage({ id: '../escape', ntfyId: '../escape', text: 'x' }, dir)).toMatchObject({ ok: false, reason: 'unusable-id' })
    expect(readPending(dir)).toEqual([])
  })

  it('skips a torn file instead of losing the directory', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    writeFileSync(join(dir, 'torn.json'), '{"id":"x",')
    expect(readPending(dir).map((m) => m.id)).toEqual(['m1'])
  })

  it('ignores a half-written temp file', () => {
    const dir = join(tmp(), 'spool')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'n9.json.tmp-1234-0'), JSON.stringify(msg({ id: 'm9', ntfyId: 'n9' })))
    expect(readPending(dir)).toEqual([])
  })

  it('reads an absent directory as empty, not as an error', () => {
    expect(readPending(join(tmp(), 'nothing'))).toEqual([])
    expect(readConsumed(join(tmp(), 'nothing'))).toEqual([])
    expect(knownMessages(join(tmp(), 'nothing'))).toEqual([])
  })
})

describe('claiming is the delivery — a rename only one caller can win', () => {
  it('moves the file aside and hands the message back', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    const taken = claimMessage('n1.json', dir)
    expect(taken.text).toBe('hallo')
    expect(readPending(dir)).toEqual([])
    expect(readConsumed(dir).map((m) => m.id)).toEqual(['m1'])
  })

  it('yields null on the second claim of the same file', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    expect(claimMessage('n1.json', dir)).not.toBeNull()
    expect(claimMessage('n1.json', dir)).toBeNull()
  })

  it('yields null for a file that was never there', () => {
    expect(claimMessage('nope.json', join(tmp(), 'spool'))).toBeNull()
  })

  it('claims the oldest n and leaves the rest waiting', () => {
    const dir = join(tmp(), 'spool')
    for (let i = 0; i < 3; i++) spoolMessage(msg({ id: `m${i}`, ntfyId: `n${i}`, receivedAt: NOW + i }), dir)
    expect(claimOldest(2, dir).map((m) => m.id)).toEqual(['m0', 'm1'])
    expect(readPending(dir).map((m) => m.id)).toEqual(['m2'])
    for (const bad of [0, -1, NaN, undefined]) expect(claimOldest(bad, dir)).toEqual([])
  })

  it('keeps a consumed message readable — the replay ledger is seeded from it', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    claimMessage('n1.json', dir)
    expect(knownMessages(dir).map((m) => m.id)).toEqual(['m1'])
    // …and a re-poll of the same ntfy cache cannot re-spool it.
    expect(isSpooled(msg(), dir)).toBe(true)
    expect(spoolMessage(msg(), dir)).toMatchObject({ ok: false, reason: 'already-spooled' })
  })
})

describe('THE HOOK DUTY: deliverPendingMessages', () => {
  it('says nothing at all on an empty spool', () => {
    const dir = join(tmp(), 'spool')
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
    mkdirSync(dir, { recursive: true })
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
  })

  it('emits exactly the additionalContext JSON for a waiting message', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg({ text: 'bitte v0.3 vorbereiten' }), dir)
    const out = deliverPendingMessages({ dir, ownsBatch: true })
    const parsed = JSON.parse(out)
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('bitte v0.3 vorbereiten')
  })

  it('says nothing the SECOND time — the same message is never re-injected', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    expect(deliverPendingMessages({ dir, ownsBatch: true })).not.toBe('')
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
  })

  it('delivers a message that arrives BETWEEN two calls', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toContain('hallo')
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
    spoolMessage(msg({ id: 'm2', ntfyId: 'n2', text: 'noch etwas', receivedAt: NOW + 1 }), dir)
    const out = deliverPendingMessages({ dir, ownsBatch: true })
    expect(out).toContain('noch etwas')
    expect(out).not.toContain('hallo')
  })

  it('carries two waiting messages in one call, oldest first', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg({ id: 'm1', ntfyId: 'n1', text: 'erste', receivedAt: NOW }), dir)
    spoolMessage(msg({ id: 'm2', ntfyId: 'n2', text: 'zweite', receivedAt: NOW + 5 }), dir)
    const ctx = JSON.parse(deliverPendingMessages({ dir, ownsBatch: true })).hookSpecificOutput.additionalContext
    expect(ctx).toContain('2 new')
    expect(ctx.indexOf('erste')).toBeLessThan(ctx.indexOf('zweite'))
    expect(readPending(dir)).toEqual([])
  })

  it('stands down for a session that does not own the batch — and consumes nothing', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    expect(deliverPendingMessages({ dir, ownsBatch: false })).toBe('')
    expect(readPending(dir)).toHaveLength(1)
  })

  it('stands down while the batch is paused — and consumes nothing', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    expect(deliverPendingMessages({ dir, ownsBatch: true, paused: true })).toBe('')
    expect(readPending(dir)).toHaveLength(1)
  })

  it('fails open and silent on a corrupt spool', () => {
    const dir = join(tmp(), 'spool')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'n1.json'), 'not json at all')
    writeFileSync(join(dir, 'n2.json'), '{"id":')
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
  })

  it('fails open and silent when the spool path is not a directory at all', () => {
    const p = join(tmp(), 'spool')
    writeFileSync(p, 'i am a file')
    expect(deliverPendingMessages({ dir: p, ownsBatch: true })).toBe('')
  })

  it('emits only what it actually claimed', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    // A reader that loses the race: the file is gone between the listing and the
    // claim. Nothing may be emitted for it.
    const pending = readPending(dir)
    rmSync(join(dir, pending[0].file), { force: true })
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
  })

  it('leaves the overflow of a flood waiting instead of injecting it all', () => {
    const dir = join(tmp(), 'spool')
    for (let i = 0; i < 9; i++) spoolMessage(msg({ id: `m${i}`, ntfyId: `n${i}`, receivedAt: NOW + i }), dir)
    const first = JSON.parse(deliverPendingMessages({ dir, ownsBatch: true })).hookSpecificOutput.additionalContext
    expect(first).toContain('5 new')
    expect(readPending(dir)).toHaveLength(4)
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toContain('4 new')
    expect(deliverPendingMessages({ dir, ownsBatch: true })).toBe('')
  })
})

describe('THE MIGRATION off the stage-1 .jsonl', () => {
  const legacyLines = (path, messages) =>
    writeFileSync(path, `${messages.map((m) => JSON.stringify(m)).join('\n')}\n`, 'utf8')

  it('reads a stage-1 spool and skips a torn line', () => {
    const p = join(tmp(), 'chat-spool.jsonl')
    writeFileSync(p, `${JSON.stringify(msg())}\n{"id":"b",\n${JSON.stringify(msg({ id: 'm3', ntfyId: 'n3' }))}\n`)
    expect(readLegacyJsonl(p).map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(readLegacyJsonl(join(tmp(), 'nothing.jsonl'))).toEqual([])
  })

  it('carries every message over as WAITING and archives the old file', () => {
    const base = tmp()
    const legacyPath = join(base, 'chat-spool.jsonl')
    const dir = join(base, 'chat-spool')
    legacyLines(legacyPath, [msg({ text: 'erste' }), msg({ id: 'm2', ntfyId: 'n2', text: 'zweite', receivedAt: NOW + 1 })])
    expect(migrateLegacySpool({ legacyPath, dir, now: NOW })).toMatchObject({ migrated: 2, skipped: 0, archived: true })
    expect(readPending(dir).map((m) => m.text)).toEqual(['erste', 'zweite'])
    // Nothing is deleted: the user's words survive the format change.
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}.migrated-${NOW}`)).toBe(true)
    expect(readFileSync(`${legacyPath}.migrated-${NOW}`, 'utf8')).toContain('erste')
  })

  it('is a no-op when there is no stage-1 spool', () => {
    const base = tmp()
    expect(migrateLegacySpool({ legacyPath: join(base, 'none.jsonl'), dir: join(base, 'spool') })).toMatchObject({ migrated: 0, archived: false })
  })

  it('runs twice without delivering anything twice', () => {
    const base = tmp()
    const legacyPath = join(base, 'chat-spool.jsonl')
    const dir = join(base, 'chat-spool')
    legacyLines(legacyPath, [msg()])
    migrateLegacySpool({ legacyPath, dir, now: NOW })
    // A second file appearing under the old name (a rescued backup, a half-done
    // first run) migrates into the SAME file names and adds nothing.
    legacyLines(legacyPath, [msg()])
    expect(migrateLegacySpool({ legacyPath, dir, now: NOW + 1 })).toMatchObject({ migrated: 0, skipped: 1 })
    expect(readPending(dir)).toHaveLength(1)
  })

  it('does not resurrect a message the session has already consumed', () => {
    const base = tmp()
    const legacyPath = join(base, 'chat-spool.jsonl')
    const dir = join(base, 'chat-spool')
    spoolMessage(msg(), dir)
    claimMessage('n1.json', dir)
    legacyLines(legacyPath, [msg()])
    expect(migrateLegacySpool({ legacyPath, dir, now: NOW })).toMatchObject({ migrated: 0, skipped: 1 })
    expect(readPending(dir)).toEqual([])
  })
})

describe('the consumed archive is bounded, but never inside the replay window', () => {
  it('keeps a fresh message and drops one far past the transport cache', () => {
    const dir = join(tmp(), 'spool')
    spoolMessage(msg(), dir)
    spoolMessage(msg({ id: 'm2', ntfyId: 'n2' }), dir)
    claimMessage('n1.json', dir)
    claimMessage('n2.json', dir)
    const old = join(consumedDir(dir), 'n1.json')
    const longAgo = new Date(Date.now() - CONSUMED_RETENTION_MS - 60_000)
    utimesSync(old, longAgo, longAgo)
    expect(pruneConsumed(dir)).toMatchObject({ removed: 1 })
    expect(readdirSync(consumedDir(dir))).toEqual(['n2.json'])
  })

  it('is a no-op on an absent archive', () => {
    expect(pruneConsumed(join(tmp(), 'nothing'))).toMatchObject({ removed: 0 })
  })
})
