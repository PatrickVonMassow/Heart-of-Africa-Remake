// THE DURABLE STATE STORE'S DECISIONS (point 892, step 2), swept without a
// filesystem: what replay calls an ordinary crash and what it calls corruption,
// what the derived snapshot carries and what it quarantines, and how a sealed
// snapshot judges its own bytes on the way back in.
import { describe, it, expect } from 'vitest'
import { frameEntry } from './batch-schema-core.mjs'
import {
  JOURNAL_KINDS,
  appliedKeys,
  deriveSnapshot,
  publishIntent,
  readSnapshotText,
  replayJournal,
  sealSnapshotText,
  splitFrames,
  unconfirmedIntents,
} from './batch-state-core.mjs'

const line = (entry) => {
  const framed = frameEntry(entry)
  if (!framed.ok) throw new Error(framed.reason)
  return framed.line
}

const stateRecord = (over = {}) => ({
  state: 'running',
  actor: 'daemon',
  fence: 7,
  at: 1000,
  lastCommit: null,
  lastPushedSha: null,
  ...over,
})

describe('splitFrames', () => {
  it('keeps each delimiter with its line and hands the undelimited tail on as-is', () => {
    expect(splitFrames('a\nb\nc')).toEqual(['a\n', 'b\n', 'c'])
    expect(splitFrames('a\n')).toEqual(['a\n'])
    expect(splitFrames('')).toEqual([])
    expect(splitFrames(undefined)).toEqual([])
  })
})

describe('replayJournal', () => {
  it('replays a healthy journal: ok, in order, high water from the fences', () => {
    const text = line({ seq: 1, fence: 6, kind: 'fence-transition' }) + line({ seq: 2, fence: 7, kind: 'command', key: 'k1' })
    const replay = replayJournal(text)
    expect(replay.verdict).toBe('ok')
    expect(replay.entries.map((e) => e.seq)).toEqual([1, 2])
    expect(replay.droppedTail).toBeNull()
    expect(replay.highWater).toBe(7)
  })

  it('reads a truncated FINAL record as an ordinary crash: dropped, reported, still ok', () => {
    const whole = line({ seq: 1, fence: 7, kind: 'command', key: 'k1' })
    const partial = line({ seq: 2, fence: 7, kind: 'command', key: 'k2' }).slice(0, 20)
    const replay = replayJournal(whole + partial)
    expect(replay.verdict).toBe('ok')
    expect(replay.entries).toHaveLength(1)
    expect(replay.droppedTail).toMatchObject({ index: 1 })
    expect(replay.droppedTail.reason).toMatch(/truncated/)
  })

  it('reads a checksum mismatch as corruption wherever it stands — even on the final line', () => {
    const good = line({ seq: 1, fence: 7, kind: 'command', key: 'k1' })
    const tampered = line({ seq: 2, fence: 7, kind: 'command', key: 'k2' }).replace('"k2"', '"kX"')
    const replay = replayJournal(good + tampered)
    expect(replay.verdict).toBe('corrupt')
    expect(replay.corruption[0].reason).toMatch(/checksum mismatch/)
  })

  it('reads a truncation BEFORE the final line as corruption: an append-only file cannot contain it', () => {
    const cut = line({ seq: 1, fence: 7, kind: 'command', key: 'k1' }).slice(0, 10) + '\n'
    const good = line({ seq: 2, fence: 7, kind: 'command', key: 'k2' })
    const replay = replayJournal(cut + good)
    expect(replay.verdict).toBe('corrupt')
  })

  it('refuses a seq that repeats or steps backwards as corruption, and allows a gap', () => {
    const a = line({ seq: 3, fence: 7, kind: 'command', key: 'k1' })
    const repeat = line({ seq: 3, fence: 7, kind: 'command', key: 'k2' })
    expect(replayJournal(a + repeat).verdict).toBe('corrupt')
    const gap = a + line({ seq: 9, fence: 7, kind: 'command', key: 'k2' })
    expect(replayJournal(gap).verdict).toBe('ok')
  })

  it('quarantines an unknown kind in place instead of condemning the journal', () => {
    const replay = replayJournal(line({ seq: 1, fence: 7, kind: 'weather-report' }))
    expect(replay.verdict).toBe('ok')
    expect(replay.entries[0].quarantine).toMatch(/unknown kind/)
  })

  it('names every kind the lane journals, and only those', () => {
    expect(JOURNAL_KINDS).toEqual([
      'fence-transition',
      'command',
      'attempt-state',
      'publish-intent',
      'publish-confirmed',
      'daemon-lifecycle',
    ])
  })
})

describe('appliedKeys', () => {
  it('rebuilds the applied set from command entries and never from quarantined ones', () => {
    const entries = replayJournal(
      line({ seq: 1, fence: 7, kind: 'command', key: 'k1' }) + line({ seq: 2, fence: 7, kind: 'weather-report', key: 'k2' }),
    ).entries
    const keys = appliedKeys(entries)
    expect(keys.has('k1')).toBe(true)
    expect(keys.has('k2')).toBe(false)
  })
})

describe('publishIntent', () => {
  const oid = 'a'.repeat(40)
  const oid2 = 'b'.repeat(40)

  it('accepts a move naming both object ids, and null before for a ref being created', () => {
    expect(publishIntent({ publicationId: 'p1', moves: [{ ref: 'refs/heads/x', beforeOid: oid, afterOid: oid2 }] }).ok).toBe(true)
    expect(publishIntent({ publicationId: 'p1', moves: [{ ref: 'refs/hoa/coordinator', beforeOid: null, afterOid: oid2 }] }).ok).toBe(true)
  })

  it('refuses an intent that cannot be resolved against objects later', () => {
    expect(publishIntent({ publicationId: '', moves: [{ ref: 'refs/heads/x', beforeOid: oid, afterOid: oid2 }] }).ok).toBe(false)
    expect(publishIntent({ publicationId: 'p1', moves: [] }).ok).toBe(false)
    expect(publishIntent({ publicationId: 'p1', moves: [{ ref: 'main', beforeOid: oid, afterOid: oid2 }] }).ok).toBe(false)
    expect(publishIntent({ publicationId: 'p1', moves: [{ ref: 'refs/heads/x', afterOid: oid2 }] }).ok).toBe(false)
    expect(publishIntent({ publicationId: 'p1', moves: [{ ref: 'refs/heads/x', beforeOid: oid, afterOid: 'HEAD' }] }).ok).toBe(false)
  })
})

describe('unconfirmedIntents', () => {
  it('lists exactly the intents no confirmation answers — quarantined ones included', () => {
    const entries = [
      { seq: 1, fence: 7, kind: 'publish-intent', publicationId: 'p1' },
      { seq: 2, fence: 7, kind: 'publish-confirmed', publicationId: 'p1' },
      { seq: 3, fence: 7, kind: 'publish-intent', publicationId: 'p2' },
      { seq: 4, fence: 7, kind: 'publish-intent', publicationId: 'p3', quarantine: 'fence not in force at this position' },
    ]
    expect(unconfirmedIntents(entries).map((e) => e.publicationId)).toEqual(['p2', 'p3'])
  })

  it('a QUARANTINED confirmation suppresses nothing: the intent stays for recovery', () => {
    const entries = [
      { seq: 1, fence: 7, kind: 'publish-intent', publicationId: 'p1' },
      { seq: 2, fence: 7, kind: 'publish-confirmed', publicationId: 'p1', quarantine: 'unknown kind revision' },
    ]
    expect(unconfirmedIntents(entries).map((e) => e.publicationId)).toEqual(['p1'])
  })

  it('a confirmation BEFORE its intent answers an earlier reused id, not this intent', () => {
    const entries = [
      { seq: 1, fence: 7, kind: 'publish-confirmed', publicationId: 'p1' },
      { seq: 2, fence: 7, kind: 'publish-intent', publicationId: 'p1' },
    ]
    expect(unconfirmedIntents(entries).map((e) => e.publicationId)).toEqual(['p1'])
    // …while the ordered pair still confirms.
    const ordered = [
      { seq: 1, fence: 7, kind: 'publish-intent', publicationId: 'p1' },
      { seq: 2, fence: 7, kind: 'publish-confirmed', publicationId: 'p1' },
    ]
    expect(unconfirmedIntents(ordered)).toEqual([])
  })

  it('ONE confirmation answers ONE intent: a reused id must not erase every earlier intent under it', () => {
    // Two different intents share an id — the frame can only validate
    // "nonempty", so uniqueness is a writer's claim, not a fact. A single
    // confirmation answers the nearest preceding intent; the other one stays
    // listed for the remote to answer, instead of vanishing from reconciliation.
    const entries = [
      { seq: 1, fence: 7, kind: 'publish-intent', publicationId: 'p1', moves: [{ ref: 'refs/heads/a' }] },
      { seq: 3, fence: 7, kind: 'publish-intent', publicationId: 'p1', moves: [{ ref: 'refs/heads/b' }] },
      { seq: 4, fence: 7, kind: 'publish-confirmed', publicationId: 'p1' },
    ]
    const open = unconfirmedIntents(entries)
    expect(open).toHaveLength(1)
    expect(open[0].seq).toBe(1)
    // Two confirmations answer both.
    expect(unconfirmedIntents([...entries, { seq: 5, fence: 7, kind: 'publish-confirmed', publicationId: 'p1' }])).toEqual([])
  })
})

describe('deriveSnapshot', () => {
  it('folds attempt states to the LAST valid record per attempt', () => {
    const entries = [
      { seq: 1, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord() },
      { seq: 2, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'checkpointing' }) },
    ]
    const snap = deriveSnapshot(entries, { batchId: 'b' })
    expect(snap.attempts).toHaveLength(1)
    expect(snap.attempts[0].state.state).toBe('checkpointing')
    expect(snap.lastSeq).toBe(2)
  })

  it('quarantines an attempt-state that fails its own validation instead of carrying it', () => {
    const entries = [
      { seq: 1, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: { state: 'running' } },
      { seq: 2, fence: 7, kind: 'attempt-state', record: stateRecord() },
    ]
    const snap = deriveSnapshot(entries, { batchId: 'b' })
    expect(snap.attempts).toHaveLength(0)
    expect(snap.quarantined).toHaveLength(2)
    expect(snap.quarantined[1].reason).toMatch(/names no attempt/)
  })

  it('enforces the transition law on replay: terminal work can never fold back to running', () => {
    // Both records are individually well-formed; their SEQUENCE is what is
    // illegal. Folding the second in would produce a running snapshot for an
    // attempt that already landed — terminal work run twice.
    const entries = [
      { seq: 1, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'running' }) },
      { seq: 2, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'ready-for-review', lastPushedSha: 'e'.repeat(40) }) },
      { seq: 3, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'landing', lastPushedSha: 'e'.repeat(40) }) },
      { seq: 4, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'landed', lastPushedSha: 'e'.repeat(40) }) },
      { seq: 5, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'running' }) },
    ]
    const snap = deriveSnapshot(entries, { batchId: 'b' })
    expect(snap.attempts[0].state.state).toBe('landed')
    expect(snap.quarantined).toHaveLength(1)
    expect(snap.quarantined[0]).toMatchObject({ seq: 5 })
    expect(snap.quarantined[0].reason).toMatch(/illegal transition landed -> running/)
    // A skipped state is equally illegal on replay: running -> landed directly.
    const skipped = deriveSnapshot(
      [
        { seq: 1, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'running' }) },
        { seq: 2, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'landed', lastPushedSha: 'e'.repeat(40) }) },
      ],
      { batchId: 'b' },
    )
    expect(skipped.attempts[0].state.state).toBe('running')
    expect(skipped.quarantined).toHaveLength(1)
  })

  it('a repeat of the same NON-terminal state is an update; a terminal repeat quarantines', () => {
    const update = deriveSnapshot(
      [
        { seq: 1, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'running' }) },
        { seq: 2, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'running', lastPushedSha: 'e'.repeat(40) }) },
      ],
      { batchId: 'b' },
    )
    expect(update.attempts[0].state.lastPushedSha).toBe('e'.repeat(40))
    expect(update.quarantined).toHaveLength(0)
    const terminalRepeat = deriveSnapshot(
      [
        { seq: 1, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'failed', reason: 'x' }) },
        { seq: 2, fence: 7, kind: 'attempt-state', batchId: 'b', pointId: 'p', attemptId: 'a1', record: stateRecord({ state: 'failed', reason: 'y' }) },
      ],
      { batchId: 'b' },
    )
    expect(terminalRepeat.attempts[0].state.reason).toBe('x')
    expect(terminalRepeat.quarantined).toHaveLength(1)
  })

  it('carries the applied keys and the unresolved publications a successor must chase', () => {
    const entries = [
      { seq: 1, fence: 7, kind: 'command', key: 'k1' },
      { seq: 2, fence: 7, kind: 'publish-intent', publicationId: 'p9' },
    ]
    const snap = deriveSnapshot(entries, { batchId: 'b' })
    expect(snap.appliedKeys).toEqual(['k1'])
    expect(snap.unconfirmedIntents).toEqual(['p9'])
  })
})

describe('snapshot sealing and read-back', () => {
  it('round-trips a sealed body and refuses a body that carries the seal key', () => {
    const sealed = sealSnapshotText({ batchId: 'b', lastSeq: 4 })
    expect(sealed.ok).toBe(true)
    const back = readSnapshotText(sealed.text)
    expect(back.ok).toBe(true)
    expect(back.snapshot).toMatchObject({ batchId: 'b', lastSeq: 4, v: 1 })
    expect(sealSnapshotText({ c: 'x' }).ok).toBe(false)
    expect(sealSnapshotText([]).ok).toBe(false)
  })

  it('judges a missing snapshot as missing and a tampered one as corrupt, never as state', () => {
    expect(readSnapshotText(null)).toMatchObject({ ok: false, verdict: 'missing' })
    const sealed = sealSnapshotText({ batchId: 'b' }).text
    expect(readSnapshotText(sealed.replace('"b"', '"x"'))).toMatchObject({ ok: false, verdict: 'corrupt' })
    expect(readSnapshotText('{ half of a snap')).toMatchObject({ ok: false, verdict: 'corrupt' })
    expect(readSnapshotText('{"v":1}')).toMatchObject({ ok: false, verdict: 'corrupt', reason: 'the snapshot carries no checksum' })
  })

  it('refuses a snapshot one schema version ahead as corrupt rather than guessing at it', () => {
    const sealed = sealSnapshotText({ batchId: 'b' }, { v: 2 })
    expect(sealed.ok).toBe(true)
    const back = readSnapshotText(sealed.text)
    expect(back.ok).toBe(false)
    expect(back.reason).toMatch(/ahead/)
  })
})
