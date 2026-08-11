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
  RESTORE_CMD,
  TORN_RECORD_MESSAGE,
  alreadyArmedMessage,
  appendGateState,
  normaliseRankRecord,
  parseRankRecord,
  pruneRankRecord,
  recordProvenanceFrom,
  recordRank,
  removedRecordMessage,
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
    // An EXISTING empty file is the same class: the CLI used to overwrite it
    // while the guard blocked as if the gate had never been armed.
    expect(() => recordRank(parseRankRecord(''), 615, { why: 'w' })).toThrow(/does not parse/)
    expect(() => seedRecord(parseRankRecord(''), [1, 2], { why: 'w' })).toThrow(/does not parse/)
    expect(appendGateState([1, 2], parseRankRecord('')).state).toBe('torn')
    // The refusal names the RESTORE, not the removal: a torn record moved aside
    // reads as unarmed, which is the same door the arming refusal had to close.
    expect(TORN_RECORD_MESSAGE).toContain(RESTORE_CMD)
    expect(TORN_RECORD_MESSAGE).not.toMatch(/aside/)
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
  it('DOES drop a closed point while a question stands, so its reopen is still asked about', () => {
    // The escape a cross-vendor review found: blocking every write while a
    // question stood also kept CLOSED points in the baseline. Baseline [1, 2]
    // with 3 outstanding — 2 lands, and 2 then reopens behind 3.
    const base = settledAt([1, 2])
    const narrowed = settleRecord([1, 3], base, { at: 'ignored' })
    expect(narrowed.changed).toBe(true)
    expect(narrowed.record.settled.points).toEqual([1])
    // Same settlement, minus what closed — not a new one.
    expect(narrowed.record.settled.at).toBe(base.settled.at)
    // 3 is STILL outstanding, and the reopened 2 is asked about like any append.
    expect(unrankedAppends([1, 3, 2], narrowed.record)).toEqual([3, 2])
    // Without the shrink both questions vanished at once: 2 read as a survivor
    // and 3 as deliberately placed inside it.
    expect(unrankedAppends([1, 3, 2], base)).toEqual([])
    // It shrinks and never grows: nothing new enters the baseline here.
    expect(narrowed.record.settled.points).not.toContain(3)
    // Nothing to drop → nothing written, even with a question standing.
    expect(settleRecord([1, 2, 3], base, { at: 't' })).toEqual({ changed: false, record: null })
  })
  it('never writes an INFERRED decision, whatever a single reading suggests', () => {
    // Two reviews pull opposite ways here, and this is the resolution. A point
    // standing ahead of a remembered one is judged BY ITS NEIGHBOUR, and the
    // neighbour can close: baseline [1, 2], 3 moved to [1, 3, 2], 4 outstanding —
    // when 2 lands, [1, 3, 4] asks about 3 a second time. Recording the placement
    // would end that, and would freeze a TRANSIENT reading (a half-written file,
    // an order mid-move) into a decision nobody took, never asked about again.
    const base = settledAt([1, 2])
    const moved = settleRecord([1, 3, 2, 4], base, { at: 'now' })
    expect(moved).toEqual({ changed: false, record: null })
    // The placement is read live, not stored: while 2 stands, 3 is not asked about.
    expect(unrankedAppends([1, 3, 2, 4], base)).toEqual([4])
    // THE PRICE, pinned: once 2 lands, 3 is asked again — one command answers it
    // (--ranked 3 --why …), and no reading can ever silence it by itself.
    const closed = settleRecord([1, 3, 4], base, { at: 'later' })
    expect(closed.record.settled.points).toEqual([1])
    expect(closed.record.ranked).toEqual({})
    expect(unrankedAppends([1, 3, 4], closed.record)).toEqual([3, 4])
    const answered = recordRank(closed.record, 3, { why: 'moved ahead of 2 deliberately' })
    expect(unrankedAppends([1, 3, 4], answered)).toEqual([4])
  })

  it('reads every git state it is shown, not just the string it prints', () => {
    // WHETHER THE RECORD IS CARRIED and WHICH COMMAND RESTORES IT are separate
    // questions. Any index entry answers the first — an unmerged conflict side is
    // no restorable copy but is proof the repository has the record, and reading
    // it as "never carried" reopens the removal route. Only a candidate that
    // PARSES answers the second: a remedy handing back torn bytes walks the caller
    // from one refusal into the next.
    expect(RESTORE_CMD).toBe('git checkout HEAD -- .claude/queue-rank.json')
    expect(recordProvenanceFrom({ headOk: true })).toEqual({ tracked: true, restore: RESTORE_CMD })
    expect(recordProvenanceFrom({ indexOk: true, known: true })).toEqual({
      tracked: true,
      restore: 'git checkout -- .claude/queue-rank.json',
    })
    expect(recordProvenanceFrom({ removedIn: 'c0f0baca', known: true }).restore).toBe(
      'git checkout c0f0baca^ -- .claude/queue-rank.json',
    )
    // A SHA-256 repository names 64 hex digits; the 40-digit rule read that as no
    // commit at all and handed the removal route back.
    expect(recordProvenanceFrom({ removedIn: 'a'.repeat(64), known: true })).toEqual({
      tracked: true,
      restore: `git checkout ${'a'.repeat(64)}^ -- .claude/queue-rank.json`,
    })
    // Carried, but nothing readable to name: still refused, and pointed at the
    // state rather than at a command that cannot work.
    const stuck = recordProvenanceFrom({ known: true })
    expect(stuck.tracked).toBe(true)
    expect(stuck.restore).toBe('')
    expect(removedRecordMessage(stuck.restore)).toContain('git log --oneline -- .claude/queue-rank.json')
    // A revision that is not one is never printed as a command.
    for (const junk of ['', '   ', 'HEAD~1; rm -rf /', null]) {
      expect(recordProvenanceFrom({ removedIn: junk, known: true }).restore).toBe('')
    }
    // And the ONE state arming exists for: git knows nothing of the path.
    expect(recordProvenanceFrom()).toEqual({ tracked: false, restore: RESTORE_CMD })
    // The refusal carries the command the caller established, not a fixed one.
    expect(TORN_RECORD_MESSAGE).toContain(RESTORE_CMD)
    let thrown = null
    try {
      seedRecord(null, [9], { why: 'w', tracked: true, restore: 'git checkout deadbee^ -- x' })
    } catch (e) {
      thrown = e
    }
    expect(thrown.message).toContain('git checkout deadbee^ -- x')
  })
  it('writes nothing when the baseline already says what stands', () => {
    expect(settleRecord([9, 5], settledAt([5, 9]), { at: 't' })).toEqual({ changed: false, record: null })
  })
  it('never erases the baseline over an order that reads as empty', () => {
    // A work order that is unreadable, half-written or mid-merge parses to zero
    // open points; taking that as "settled" would hand every point back as an
    // append the moment it read normally again. Absence proves nothing here.
    for (const empty of [[], null, 'garbage']) {
      expect(settleRecord(empty, settledAt([5, 9]), { at: 't' })).toEqual({ changed: false, record: null })
    }
    // …and a bad read shows no ticks either, so it drops nothing.
    expect(settleRecord([], settledAt([4]), { at: 't' })).toEqual({ changed: false, record: null })
  })
  it('drops a point the work order TICKS, even with no open points left at all', () => {
    // The last question this gate used to miss: baseline [4], 4 lands, the order
    // reads empty so nothing was written, and 4 reopening at the end was never
    // asked about. A tick is positive evidence — a mangled file can fail to show
    // one, but it cannot invent one — so it settles what absence could not.
    const finished = settleRecord([], settledAt([4], { 4: { at: '', why: 'w' } }), { at: 't', closed: [4] })
    expect(finished.changed).toBe(true)
    expect(finished.record.settled.points).toEqual([])
    expect(finished.record.ranked).toEqual({})
    // The reopen is now asked about like any point standing at the append default.
    expect(unrankedAppends([4], finished.record)).toEqual([4])
    // Ticks for points the baseline never held change nothing.
    expect(settleRecord([], settledAt([4]), { at: 't', closed: [7, 8] })).toEqual({ changed: false, record: null })
    // And the gate is still ARMED afterwards — an emptied baseline is not an
    // absent one, so nothing reads as a clean slate.
    expect(appendGateState([4], finished.record).state).toBe('pending')
  })
  it('sees the closure through the whole event sequence, and states what it cannot see', () => {
    // THE SEQUENCE, not the two states separately: baseline [4] → 4 lands and the
    // order reads empty → 4 reopens at the end.
    let record = settledAt([4])
    record = settleRecord([], record, { at: 't1', closed: [4] }).record
    expect(unrankedAppends([4], record)).toEqual([4])
    // THE RESIDUAL, pinned rather than discovered later: where NO readable
    // observation falls between the closing and the reopen — the archive
    // unreadable at that one moment — the transition is not seen and the reopen
    // is not asked about. Every rule that would close it (an empty order empties
    // the baseline) erases the baseline on a mangled TASKS.md instead, and hands
    // back every open point as an append at once.
    const unseen = settleRecord([], settledAt([4]), { at: 't1', closed: [] })
    expect(unseen.changed).toBe(false)
    expect(unrankedAppends([4], settledAt([4]))).toEqual([])
  })
  it('--seed arms the whole open order at once, with its reason', () => {
    const seeded = seedRecord(null, [9, 5, 4], { why: 'arming baseline', at: 't' })
    expect(seeded.settled).toEqual({ at: 't', why: 'arming baseline', points: [4, 5, 9] })
    expect(unrankedAppends([9, 5, 4], seeded)).toEqual([])
    // Everything appended AFTER the arming is decided one by one again.
    expect(unrankedAppends([9, 5, 4, 3], seeded)).toEqual([3])
    expect(() => seedRecord(null, [9], { why: '  ' })).toThrow(/--why/)
  })

  it('--seed is NOT an escape hatch: it refuses an armed record with questions standing', () => {
    // The hole a cross-vendor review found: the very turn the gate was blocking
    // could reseed and settle every outstanding append on one collective reason.
    let thrown = null
    try {
      seedRecord(settledAt([5, 9]), [9, 5, 4, 3], { why: 'alles passt schon', at: 't' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeTruthy()
    expect(thrown.message).toMatch(/already armed/)
    // It names what is outstanding and points at the per-point command.
    expect(thrown.message).toMatch(/4, 3/)
    expect(thrown.message).toMatch(/--ranked/)
  })

  it('refuses an armed record with NOTHING outstanding too', () => {
    // Chosen deliberately: re-seeding a settled record expresses nothing
    // `settleRecord` has not already written, so a second door would only have
    // to be argued about.
    expect(() => seedRecord(settledAt([5, 9]), [9, 5], { why: 'nochmal', at: 't' })).toThrow(/already armed/)
    expect(() => seedRecord(settledAt([5, 9]), [9, 5], { why: 'nochmal', at: 't' })).not.toThrow(/outstanding/)
  })

  it('refuses to arm a record the repository still carries — that was the way round the refusal', () => {
    // The escape the refusal itself used to describe: the gate blocks, the
    // tracked record goes aside, the checkout reads as unarmed, and --seed takes
    // the WHOLE current order — outstanding appends included — on one collective
    // reason. Arming is for a repository that never had a baseline; a record it
    // knows is restored instead.
    let thrown = null
    try {
      seedRecord(null, [9, 5, 4], { why: 'alles passt schon', at: 't', tracked: true })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeTruthy()
    expect(thrown.message).toContain(RESTORE_CMD)
    // The genuine first arming — a repository that has never carried the record —
    // is untouched.
    expect(seedRecord(null, [9, 5, 4], { why: 'arming', at: 't' }).settled.points).toEqual([4, 5, 9])
  })

  it('hands out no recipe for getting round itself', () => {
    // A refusal that names the bypass is the bypass. Neither branch may describe
    // moving, deleting or re-creating the record.
    for (const message of [alreadyArmedMessage([]), alreadyArmedMessage([4, 3])]) {
      expect(message).not.toMatch(/aside|delete|remove|rename|unarmed/i)
    }
  })

  it('still refuses a torn record before it ever asks whether it is armed', () => {
    expect(() => seedRecord(parseRankRecord('{"ranked":{'), [1, 2], { why: 'w' })).toThrow(/does not parse/)
  })
})

describe('the rank record degrades, it never throws inside a guard', () => {
  it('reads a stored file', () => {
    expect(parseRankRecord('{"ranked":{"615":{"at":"t","why":"w"}}}').ranked[615]).toEqual({ at: 't', why: 'w' })
  })
  it('separates ABSENT from TORN — the one asks for the baseline, the other stays quiet', () => {
    // Both used to read as "nothing recorded yet", which made an unreadable file
    // BLOCK every appended point; now one is unarmed and the other no verdict.
    // ABSENCE IS `null` AND NOTHING ELSE: the reader passes `existsSync(p) ?
    // readFileSync(p) : null`, so a string — even an empty one — means the file
    // is THERE.
    for (const raw of [null, undefined]) {
      expect(parseRankRecord(raw)).toEqual({ ranked: {}, settled: null, torn: false })
    }
    for (const raw of [
      // An EXISTING zero-byte or whitespace-only file. It used to read as absent,
      // which had both halves backwards: the guard blocked as unarmed while the
      // CLI wrote straight over the file.
      '',
      '   ',
      '\n\t \n',
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
  it('lets NO record declare itself torn — the mark is the parser’s alone', () => {
    // The escape: a syntactically PERFECT file carrying `"torn": true` used to
    // disable the gate for ever and lock the door behind it — the guard drew no
    // verdict, and every CLI write was refused as unreadable, so nothing could
    // repair the file that did it.
    const claims = '{"ranked":{},"settled":{"at":"t","points":[1,2]},"torn":true}'
    expect(parseRankRecord(claims).torn).toBe(false)
    expect(appendGateState([1, 2, 3], parseRankRecord(claims)).state).toBe('pending')
    expect(unrankedAppends([1, 2, 3], parseRankRecord(claims))).toEqual([3])
    // …and the file stays repairable, rather than refusing every write.
    expect(() => recordRank(parseRankRecord(claims), 3, { why: 'last is right' })).not.toThrow()
    expect(normaliseRankRecord({ torn: true })).toEqual({ ranked: {}, settled: null, torn: false })
    // The one thing that DOES mark a record torn survives being normalised again.
    expect(normaliseRankRecord(parseRankRecord('{"ranked":{')).torn).toBe(true)
    // And nothing writes the field back: the repaired record carries no `torn`.
    expect('torn' in recordRank(parseRankRecord(claims), 3, { why: 'w' })).toBe(false)
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
