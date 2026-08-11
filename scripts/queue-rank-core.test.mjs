// Pure sweep of the APPEND GATE (point 590): a point appended to the work order
// is ranked once, deliberately, and WHICH point counts as appended is read off
// provenance rather than off the numbers or the positions.
//
// The failures under test are the ones that actually happened: the freshly
// appended 589 landing at the very back of the board unnoticed (09.08.2026), and
// the two refutations a cross-vendor review put to the first cuts of this gate —
// the SURVIVOR left standing last by a closing, and the DESCENDING appends that
// slipped past a running-maximum walk (10.08.2026).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { openPointsOf } from './board-queue-core.mjs'
import { readTasksOpen } from './tasks-source.mjs'
import {
  RANK_RECORD_PATH,
  appendGateState,
  normaliseRankRecord,
  parseRankRecord,
  pruneRankRecord,
  recordRank,
  seedRecord,
  settleRecord,
  unrankedAppends,
} from './queue-rank-core.mjs'

/** A record whose baseline says "these points were here when the order was last settled". */
const settledAt = (points, ranked = {}) => ({ ranked, settled: { at: '2026-08-10T09:00:00.000Z', points } })

describe('PROVENANCE — which points are new since the order was last settled', () => {
  it('asks about every point appended behind the baseline, whatever its number', () => {
    // The DESCENDING append the position heuristic swallowed: 4 and 3 both came
    // in behind [9, 5], and only the last of them was ever questioned.
    const state = appendGateState([9, 5, 4, 3], settledAt([5, 9]))
    expect(state.state).toBe('pending')
    expect(state.pending).toEqual([4, 3])
    expect(state.appended).toEqual([4, 3])
  })
  it('never asks again about a point that has stood there all along', () => {
    // The FALSE BLOCK on closure: [9, 5, 4] with 4 ranked becomes [9, 5] when 4
    // lands, and 5 — a survivor, not an append — was asked about as if it were
    // new. Position cannot tell the two apart; the baseline can.
    const before = settledAt([4, 5, 9], { 4: { at: '', why: 'nothing waits on it' } })
    expect(appendGateState([9, 5, 4], before).pending).toEqual([])
    const afterClosing = appendGateState([9, 5], before)
    expect(afterClosing.state).toBe('settled')
    expect(afterClosing.pending).toEqual([])
  })
  it('leaves a NEW point placed deliberately INSIDE the order alone', () => {
    // Standing ahead of a remembered point IS the judgment — that is the "move
    // it in TASKS.md" answer the gate asks for.
    const state = appendGateState([700, 9, 5], settledAt([5, 9]))
    expect(state.inside).toEqual([700])
    expect(state.pending).toEqual([])
    expect(state.state).toBe('settled')
  })
  it('separates the moved point from the one now standing last', () => {
    const state = appendGateState([701, 9, 5, 700], settledAt([5, 9]))
    expect(state.inside).toEqual([701])
    expect(state.pending).toEqual([700])
  })
  it('asks about a new point placed before ANOTHER new one — two appends in one turn', () => {
    // Neither stands before a REMEMBERED point, so neither carries a judgment.
    // Reading "before another new point" as one would let the earlier of the two
    // through unasked, which is the silent escape this gate was rebuilt to close.
    expect(unrankedAppends([9, 5, 701, 700], settledAt([5, 9]))).toEqual([701, 700])
  })
  it('does not ask about a remembered point that was deliberately moved to the END', () => {
    // The position heuristic read `[10, 9, 4]` re-ordered to `[9, 4, 10]` as a
    // fresh append and demanded a decision for a move that WAS the decision.
    expect(appendGateState([9, 4, 10], settledAt([4, 9, 10])).pending).toEqual([])
  })
  it('is answered by the RECORD that last is right', () => {
    let record = settledAt([585, 590, 509])
    record = recordRank(record, 615, { why: 'nothing depends on it', at: '2026-08-10T09:00:00.000Z' })
    record = recordRank(record, 616, { why: 'post-release work' })
    expect(unrankedAppends([585, 590, 509, 615, 616], record)).toEqual([])
    expect(record.ranked[615].why).toBe('nothing depends on it')
    expect(record.ranked[615].at).toBe('2026-08-10T09:00:00.000Z')
    // The DISCRIMINATING half: without that record the same order still asks.
    expect(unrankedAppends([585, 590, 509, 615, 616], settledAt([585, 590, 509]))).toEqual([615, 616])
  })
  it('asks when a point re-enters the order after having been closed', () => {
    // A REOPENED point is new again: the baseline dropped it when it closed, so
    // it cannot ride back in on its old membership.
    const closed = settleRecord([9, 5], settledAt([4, 5, 9], { 4: { at: '', why: 'w' } }), { at: 't' })
    expect(closed.changed).toBe(true)
    expect(closed.record.settled.points).toEqual([5, 9])
    expect(unrankedAppends([9, 5, 4], closed.record)).toEqual([4])
  })
  it('demands the baseline ONCE where none was ever recorded, instead of falling silent', () => {
    // A fresh checkout owes one answer for the whole order (--seed), never one
    // block per open point — and never a free pass either.
    for (const record of [null, undefined, {}, { ranked: {} }]) {
      const state = appendGateState([1, 2, 3], record)
      expect(state.state).toBe('unarmed')
      expect(state.pending).toEqual([])
    }
  })
  it('stays QUIET on an unreadable record — a guard draws no verdict from torn state', () => {
    for (const raw of ['{"ranked":{', '[]', '{"settled":42}', '{"settled":{"points":"no"}}']) {
      const state = appendGateState([9, 5, 4], parseRankRecord(raw))
      expect(state.state).toBe('torn')
      expect(state.pending).toEqual([])
    }
  })
  it('does not count an entry that gives no reason — by ANY route', () => {
    // A hand-written or half-merged `{"ranked":{"616":{}}}` used to silence the
    // gate for that point for ever, and emptying it used to read as "never
    // armed", which silenced the gate a second way. The baseline settles both:
    // armed is armed, and a reasonless entry decides nothing.
    const bare = parseRankRecord('{"ranked":{"2":{},"3":{"why":"   "}},"settled":{"at":"t","points":[1]}}')
    expect(unrankedAppends([1, 2, 3], bare)).toEqual([2, 3])
    const half = parseRankRecord('{"ranked":{"2":{"why":"weil"},"3":{}},"settled":{"at":"t","points":[1]}}')
    expect(unrankedAppends([1, 2, 3], half)).toEqual([3])
    // …and a wholly ascending open order is judged exactly the same way.
    expect(
      unrankedAppends([1, 2, 3], parseRankRecord('{"ranked":{"3":{}},"settled":{"at":"t","points":[1,2]}}')),
    ).toEqual([3])
  })
  it('survives junk instead of throwing inside a guard', () => {
    expect(unrankedAppends(null, settledAt([1]))).toEqual([])
    expect(unrankedAppends(['x', null], settledAt([1]))).toEqual([])
    expect(appendGateState([1, 2], 'garbage').state).toBe('unarmed')
  })
  it('reads a point listed twice in the open order as one point', () => {
    // `openPointsOf` does not deduplicate; a repeated number would otherwise be
    // both remembered and appended at once.
    expect(unrankedAppends([9, 5, 5], settledAt([5, 9]))).toEqual([])
    expect(unrankedAppends([9, 5, 4, 4], settledAt([5, 9]))).toEqual([4])
  })
  it('refuses a decision with no reason and a number that is not a point', () => {
    expect(() => recordRank(null, 615, { why: '   ' })).toThrow(/--why/)
    expect(() => recordRank(null, 615, {})).toThrow(/--why/)
    for (const bad of [0, -1, 'x', 1.5]) expect(() => recordRank(null, bad, { why: 'w' })).toThrow(/point number/)
  })
  it('refuses to write over a torn record instead of replacing every decision in it', () => {
    expect(() => recordRank(parseRankRecord('{"ranked":{'), 615, { why: 'w' })).toThrow(/does not parse/)
    expect(() => seedRecord(parseRankRecord('{"ranked":{'), [1, 2], { why: 'w' })).toThrow(/does not parse/)
  })
  it('is pure — recording does not mutate what it was given', () => {
    const before = settledAt([615], { 615: { at: '', why: 'w' } })
    recordRank(before, 616, { why: 'x' })
    settleRecord([615], before, { at: 't' })
    expect(before).toEqual(settledAt([615], { 615: { at: '', why: 'w' } }))
  })
  it('carries the baseline through a decision and a prune', () => {
    const record = recordRank(settledAt([615]), 616, { why: 'b' })
    expect(record.settled.points).toEqual([615])
    expect(pruneRankRecord(record, [616]).ranked).toEqual({ 616: { at: '', why: 'b' } })
    expect(pruneRankRecord(record, [616]).settled.points).toEqual([615])
  })
})

describe('the baseline moves only when nothing is outstanding', () => {
  it('advances to today’s open set once every question is answered', () => {
    const record = recordRank(settledAt([5, 9]), 4, { why: 'last is right' })
    const out = settleRecord([9, 5, 4], record, { at: '2026-08-11T00:00:00.000Z' })
    expect(out.changed).toBe(true)
    expect(out.record.settled).toEqual({ at: '2026-08-11T00:00:00.000Z', points: [4, 5, 9] })
    // …and the decision about a point that has since closed is dropped with it.
    expect(settleRecord([9, 5], record, { at: 't' }).record.ranked).toEqual({})
  })
  it('does NOT advance while a question stands — the append would be swallowed', () => {
    // The safety property: were the baseline to move here, 4 would be part of
    // "the order as judged" from the next run on, unanswered and invisible.
    expect(settleRecord([9, 5, 4], settledAt([5, 9]), { at: 't' })).toEqual({ changed: false, record: null })
    // Nor on a torn record, nor before anybody armed the gate at all.
    expect(settleRecord([9, 5], parseRankRecord('{"ranked":{'), { at: 't' }).changed).toBe(false)
    expect(settleRecord([9, 5], null, { at: 't' }).changed).toBe(false)
  })
  it('writes nothing when the baseline already says what stands', () => {
    expect(settleRecord([9, 5], settledAt([5, 9]), { at: 't' })).toEqual({ changed: false, record: null })
  })
  it('never erases the baseline over an order that reads as empty', () => {
    // A work order that is unreadable, half-written or mid-merge parses to zero
    // open points; taking that as "settled" would hand every point back as an
    // append the moment it read normally again.
    for (const empty of [[], null, 'garbage']) {
      expect(settleRecord(empty, settledAt([5, 9]), { at: 't' })).toEqual({ changed: false, record: null })
    }
  })
  it('--seed arms the whole open order at once, with its reason', () => {
    const seeded = seedRecord(null, [9, 5, 4], { why: 'arming baseline', at: 't' })
    expect(seeded.settled).toEqual({ at: 't', why: 'arming baseline', points: [4, 5, 9] })
    expect(unrankedAppends([9, 5, 4], seeded)).toEqual([])
    // Everything appended AFTER the arming is decided one by one again.
    expect(unrankedAppends([9, 5, 4, 3], seeded)).toEqual([3])
    expect(() => seedRecord(null, [9], { why: '  ' })).toThrow(/--why/)
  })
})

describe('the rank record degrades, it never throws inside a guard', () => {
  it('reads a stored file', () => {
    expect(parseRankRecord('{"ranked":{"615":{"at":"t","why":"w"}}}').ranked[615]).toEqual({ at: 't', why: 'w' })
  })
  it('separates ABSENT from TORN — the one asks for the baseline, the other stays quiet', () => {
    // Both used to read as "nothing recorded yet", which made an unreadable file
    // BLOCK every appended point; now one is unarmed and the other no verdict.
    for (const raw of [null, undefined, '  \n ']) {
      expect(parseRankRecord(raw)).toEqual({ ranked: {}, settled: null, torn: false })
    }
    for (const raw of [
      '{"ranked":{',
      'not json at all',
      '[]',
      '42',
      '{"ranked":"no"}',
      '{"ranked":[]}',
      '{"settled":"gestern"}',
      '{"settled":{"at":"t"}}',
      '{"settled":{"points":{"1":true}}}',
    ]) {
      expect(parseRankRecord(raw)).toEqual({ ranked: {}, settled: null, torn: true })
    }
  })
  it('reads a stored baseline, dropping junk inside it', () => {
    const r = parseRankRecord('{"settled":{"at":"t","why":"w","points":[9,"5",5,0,-2,"x"]}}')
    expect(r).toEqual({ ranked: {}, settled: { at: 't', why: 'w', points: [5, 9] }, torn: false })
  })
  it('drops a decision that states no reason', () => {
    expect(parseRankRecord('{"ranked":{"300":{}}}').ranked).toEqual({})
    expect(parseRankRecord('{"ranked":{"300":{"at":"t"}}}').ranked).toEqual({})
    expect(parseRankRecord('{"ranked":{"300":{"why":"weil"}}}').ranked[300]).toEqual({ at: '', why: 'weil' })
  })
  it('drops hostile entries instead of trusting them', () => {
    const r = normaliseRankRecord({ ranked: { 0: { why: 'x' }, '-2': { why: 'x' }, z: {}, 7: 'no', 8: { why: ' w ' } } })
    expect(r).toEqual({ ranked: { 8: { at: '', why: 'w' } }, settled: null, torn: false })
    for (const raw of [null, 42, [], { ranked: 'no' }, { settled: 'no' }, { settled: { points: 7 } }]) {
      expect(normaliseRankRecord(raw)).toEqual({ ranked: {}, settled: null, torn: false })
    }
  })
  it('names the tracked record, so no caller invents a second path', () => {
    expect(RANK_RECORD_PATH).toBe('.claude/queue-rank.json')
  })
})

describe('the LIVE record, which is what every checkout inherits', () => {
  it('carries a readable, ARMED provenance baseline', () => {
    // Armed and parseable is what a clone must inherit; WHETHER a point is
    // currently outstanding is the Stop guard's question, not this layer's — a
    // red unit test for an unanswered bookkeeping decision would stop CI for
    // something no build broke.
    const record = parseRankRecord(readFileSync(resolve(REPO_ROOT, RANK_RECORD_PATH), 'utf8'))
    expect(record.torn).toBe(false)
    expect(record.settled).not.toBeNull()
    expect(appendGateState(openPointsOf(readTasksOpen()), record).state).not.toBe('unarmed')
  })
})
