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
  ORIGIN_MACHINE,
  ORIGIN_USER,
  PLACE_AHEAD,
  PLACE_LAST,
  originOf,
  BOUNDARY_SEED_CMD,
  boundaryUnarmedMessage,
  releaseBoundaryBreaches,
  releaseBoundaryMessage,
  releaseBoundaryState,
  seedBoundary,
  statesHighUrgency,
} from './queue-rank-core.mjs'
import { RELEASE_TAG_POINT } from './board-queue-core.mjs'

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
    // The ORIGIN travels with the decision (point 789) — an unstated one is the
    // machine's, so a prune can never quietly hand a point the user's exemption.
    expect(pruneRankRecord(record, [616]).ranked).toEqual({
      616: { at: '', why: 'b', origin: ORIGIN_MACHINE, place: PLACE_LAST },
    })
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
    // Both readable: the STAGED copy wins, since HEAD can be the staler of the
    // two and restoring it would put a closed point back into the baseline.
    expect(recordProvenanceFrom({ headOk: true, indexOk: true, known: true }).restore).toBe(
      'git checkout -- .claude/queue-rank.json',
    )
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
      seedRecord(null, [9], { why: 'w', tracked: true, present: false, restore: 'git checkout deadbee^ -- x' })
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

  it('refuses to arm a record the repository carries but the checkout is MISSING', () => {
    // The escape the refusal itself used to describe: the gate blocks, the
    // tracked record goes aside, the checkout reads as unarmed, and --seed takes
    // the WHOLE current order — outstanding appends included — on one collective
    // reason. A record the repository knows is restored instead of re-armed.
    let thrown = null
    try {
      seedRecord(null, [9, 5, 4], { why: 'alles passt schon', at: 't', tracked: true, present: false })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeTruthy()
    expect(thrown.message).toContain(RESTORE_CMD)
    // …but a record that is THERE and simply carries no baseline is armed
    // normally. Refusing it too left nothing to run at all: the guard blocks as
    // unarmed, --ranked cannot make a baseline, and arming was refused — a loop
    // with no answer. This gate defends against the append DEFAULT going
    // unnoticed, not against somebody editing the tracked record by hand.
    expect(seedRecord({ ranked: {} }, [9, 5, 4], { why: 'repairing', at: 't', tracked: true }).settled.points).toEqual([
      4, 5, 9,
    ])
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
    expect(parseRankRecord('{"ranked":{"615":{"at":"t","why":"w"}}}').ranked[615]).toEqual({
      at: 't',
      why: 'w',
      place: PLACE_LAST,
    })
  })
  it('separates ABSENT from TORN — the one asks for the baseline, the other stays quiet', () => {
    // Both used to read as "nothing recorded yet", which made an unreadable file
    // BLOCK every appended point; now one is unarmed and the other no verdict.
    // ABSENCE IS `null` AND NOTHING ELSE: the reader passes `existsSync(p) ?
    // readFileSync(p) : null`, so a string — even an empty one — means the file
    // is THERE.
    for (const raw of [null, undefined]) {
      expect(parseRankRecord(raw)).toEqual({ ranked: {}, settled: null, boundary: null, torn: false })
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
      expect(parseRankRecord(raw)).toEqual({ ranked: {}, settled: null, boundary: null, torn: true })
    }
  })
  it('reads a stored baseline, dropping junk inside it', () => {
    const r = parseRankRecord('{"settled":{"at":"t","why":"w","points":[9,"5",5,0,-2,"x"]}}')
    expect(r).toEqual({ ranked: {}, settled: { at: 't', why: 'w', points: [5, 9] }, boundary: null, torn: false })
  })
  it('drops a decision that states no reason', () => {
    expect(parseRankRecord('{"ranked":{"300":{}}}').ranked).toEqual({})
    expect(parseRankRecord('{"ranked":{"300":{"at":"t"}}}').ranked).toEqual({})
    expect(parseRankRecord('{"ranked":{"300":{"why":"weil"}}}').ranked[300]).toEqual({
      at: '',
      why: 'weil',
      place: PLACE_LAST,
    })
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
    expect(normaliseRankRecord({ torn: true })).toEqual({ ranked: {}, settled: null, boundary: null, torn: false })
    // The one thing that DOES mark a record torn survives being normalised again.
    expect(normaliseRankRecord(parseRankRecord('{"ranked":{')).torn).toBe(true)
    // And nothing writes the field back: the repaired record carries no `torn`.
    expect('torn' in recordRank(parseRankRecord(claims), 3, { why: 'w' })).toBe(false)
  })
  it('drops hostile entries instead of trusting them', () => {
    const r = normaliseRankRecord({ ranked: { 0: { why: 'x' }, '-2': { why: 'x' }, z: {}, 7: 'no', 8: { why: ' w ' } } })
    expect(r).toEqual({
      ranked: { 8: { at: '', why: 'w', place: PLACE_LAST } },
      settled: null,
      boundary: null,
      torn: false,
    })
    for (const raw of [null, 42, [], { ranked: 'no' }, { settled: 'no' }, { settled: { points: 7 } }]) {
      expect(normaliseRankRecord(raw)).toEqual({ ranked: {}, settled: null, boundary: null, torn: false })
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


// ---- THE RELEASE BOUNDARY (point 789) --------------------------------------
//
// The append gate above asks whether the END of the order is right and accepts
// both answers. It says nothing about a ticket the MACHINE filed for itself and
// ranked in FRONT of the release — which is how eight of them came to stand
// there on 20.08.2026, until the user moved them back by hand and asked for the
// mechanism. Every case below is a synthetic order: the boundary is whatever
// position the release point currently holds, never a number this module knows.
//
// The FROZEN front (`boundary`) is what grandfathers the order that predates the
// rule. It was the moving provenance baseline in the first cut, and a
// cross-vendor review (GPT-5.6 Sol, 21.08.2026) showed that to be a two-turn
// bypass: settle anywhere, then move the point in front of the release, and
// nothing ever asked.

/** A body that STATES high urgency through the tag every point carries. */
const HIGH = 'Some spec text.\n  Criticality: high — it would otherwise ship broken.'

/** A body that states the opposite, which is the ordinary case. */
const MEDIUM = 'Some spec text.\n  Criticality: medium — no product defect.'

describe('URGENCY is read off what the point STATES', () => {
  it('accepts the high tag, in either spelling', () => {
    expect(statesHighUrgency(HIGH)).toBe(true)
    expect(statesHighUrgency('Criticality: HIGH — blocking.')).toBe(true)
  })
  it('accepts a NAMED blocking condition without a tag', () => {
    expect(statesHighUrgency('The launcher spawns twice and this stops the batch until it is fixed.')).toBe(true)
    expect(statesHighUrgency('It blocks the release: the tag cannot be cut while it stands.')).toBe(true)
    expect(statesHighUrgency('It blocks a lane — no Sol-authored point can be served.')).toBe(true)
    expect(statesHighUrgency('It holds a red that cannot otherwise close.')).toBe(true)
  })
  it('requires the QUALIFICATION the spec names, not just the word "red"', () => {
    // "holds a red" alone matched a body that says the opposite of the condition,
    // and stopping at "cannot" matched a red that cannot do something else.
    expect(statesHighUrgency('It holds a red temporarily, but the red can otherwise close.')).toBe(false)
    expect(statesHighUrgency('It holds a red that cannot reproduce the defect.')).toBe(false)
    expect(statesHighUrgency('It holds a red which cannot close until the lane is fixed.')).toBe(true)
  })
  it('does NOT read a DENIED blocking condition as a claim', () => {
    expect(statesHighUrgency('No behaviour is wrong and this does not stop the batch.')).toBe(false)
    expect(statesHighUrgency('Nothing blocks the release here.')).toBe(false)
    expect(statesHighUrgency('It never blocks a lane.')).toBe(false)
    expect(statesHighUrgency('It neither stops the batch nor blocks the release.')).toBe(false)
    expect(statesHighUrgency('No process blocks the release.')).toBe(false)
    // A COMMA does not end the clause: the denial governs across it.
    expect(statesHighUrgency('It does not, in practice, stop the batch.')).toBe(false)
    // …and neither does the HARD WRAP every point body in this work order has.
    expect(statesHighUrgency('The cost is a stale reading; it does not\n  stop the batch.')).toBe(false)
    // A contrast word DOES end it, because the second half is a claim again.
    expect(statesHighUrgency('It does not block a lane, but it stops the batch.')).toBe(true)
    // …and so does every sentence end, not only the full stop.
    expect(statesHighUrgency('It does not block a lane! It stops the batch.')).toBe(true)
    expect(statesHighUrgency('Does it block a lane? It stops the batch.')).toBe(true)
  })
  it('reads an ordinary point as NOT high — the tag, the prose and the silence alike', () => {
    expect(statesHighUrgency(MEDIUM)).toBe(false)
    expect(statesHighUrgency('It is annoying and the batch would be nicer without it.')).toBe(false)
    expect(statesHighUrgency('')).toBe(false)
    expect(statesHighUrgency(undefined)).toBe(false)
  })
})

describe('ORIGIN is stated, never inherited by omission', () => {
  it('records the machine by default and the user only when asked', () => {
    expect(recordRank({}, 7, { why: 'w' }).ranked[7].origin).toBe(ORIGIN_MACHINE)
    expect(recordRank({}, 7, { why: 'w', origin: ORIGIN_USER }).ranked[7].origin).toBe(ORIGIN_USER)
  })
  it('refuses an origin it does not know rather than filing it as machine work', () => {
    expect(() => recordRank({}, 7, { why: 'w', origin: 'users' })).toThrow(/--origin must be machine or user/)
  })
  it('records WHICH placement was decided, and refuses one it does not know', () => {
    expect(recordRank({}, 7, { why: 'w' }).ranked[7].place).toBe(PLACE_LAST)
    expect(recordRank({}, 7, { why: 'w', place: PLACE_AHEAD }).ranked[7].place).toBe(PLACE_AHEAD)
    expect(() => recordRank({}, 7, { why: 'w', place: 'front' })).toThrow(/place must be last or ahead/)
  })
  it('does not let a FRONT reason answer the append question after the point drops back', () => {
    // The mirror image of the stale-rank bypass: each gate accepts only the
    // decision that was actually taken about its own placement.
    const front = { 700: { at: '', why: 'it cannot wait', origin: ORIGIN_MACHINE, place: PLACE_AHEAD } }
    expect(unrankedAppends([9, 5, 700], settledAt([5, 9], front))).toEqual([700])
    const last = { 700: { at: '', why: 'nothing waits on it', origin: ORIGIN_MACHINE, place: PLACE_LAST } }
    expect(unrankedAppends([9, 5, 700], settledAt([5, 9], last))).toEqual([])
  })
  it('reads a missing, old or damaged origin as the MACHINE', () => {
    expect(originOf({ ranked: { 7: { why: 'w' } } }, 7)).toBe(ORIGIN_MACHINE)
    expect(originOf({ ranked: { 7: { why: 'w', origin: 'users' } } }, 7)).toBe(ORIGIN_MACHINE)
    expect(originOf({}, 7)).toBe(ORIGIN_MACHINE)
    expect(originOf({ ranked: { 7: { why: 'w', origin: ORIGIN_USER } } }, 7)).toBe(ORIGIN_USER)
  })
  it('keeps a hand-edited reason to ONE line, so the record cannot carry a paragraph', () => {
    const paragraph = parseRankRecord('{"ranked":{"7":{"why":"first line\\n\\nsecond line"}},"settled":{"at":"t","points":[7]}}')
    expect(paragraph.ranked[7].why).toBe('first line second line')
  })
})

describe('THE RELEASE BOUNDARY — what may stand in front of the release', () => {
  // 50 is the release point. The FROZEN front remembers what stood in front of
  // it when the rule landed; the baseline is beside it and plays no part here.
  const armed = (ranked = {}, front = []) => ({
    ranked,
    settled: { at: 't', points: [50, 90] },
    boundary: { at: 't', why: 'the order as it stood', points: front },
  })
  const state = (open, record, bodies) => releaseBoundaryState(open, record, { releasePoint: 50, bodies })
  const breach = (open, record, bodies) => releaseBoundaryBreaches(open, record, { releasePoint: 50, bodies })

  it('blocks a machine-filed point that states high urgency but records no reason', () => {
    expect(breach([60, 50, 90], armed(), { 60: HIGH })).toEqual([{ point: 60, cause: 'unrecorded' }])
  })

  it('lets it stand once the reason is recorded', () => {
    const record = armed({
      60: { at: '', why: 'It holds the red that blocks every push.', origin: ORIGIN_MACHINE, place: PLACE_AHEAD },
    })
    expect(breach([60, 50, 90], record, { 60: HIGH })).toEqual([])
    // A STALE "last is right" reason is NOT that decision: ranked behind the
    // release, then moved in front, it explains nothing about standing here.
    const stale = armed({ 60: { at: '', why: 'nothing waits on it', origin: ORIGIN_MACHINE, place: PLACE_LAST } })
    expect(breach([60, 50, 90], stale, { 60: HIGH })).toEqual([{ point: 60, cause: 'unrecorded' }])
  })

  it('blocks a machine-filed point that states no urgency AT ALL — recorded or not', () => {
    expect(breach([60, 50, 90], armed(), { 60: MEDIUM })).toEqual([{ point: 60, cause: 'not-high' }])
    const recorded = armed({ 60: { at: '', why: 'I would like it sooner.', origin: ORIGIN_MACHINE } })
    // A recorded reason cannot make a point urgent: the urgency is in the POINT.
    expect(breach([60, 50, 90], recorded, { 60: MEDIUM })).toEqual([{ point: 60, cause: 'not-high' }])
  })

  it('says nothing about the same point once it stands BEHIND the release', () => {
    expect(breach([50, 90, 60], armed(), { 60: MEDIUM })).toEqual([])
  })

  it('exempts a point the USER ranked there, however unurgent it reads', () => {
    const record = armed({ 60: { at: '', why: 'Der Nutzer will es zuerst.', origin: ORIGIN_USER } })
    expect(breach([60, 50, 90], record, { 60: MEDIUM })).toEqual([])
  })

  it('moves the boundary with the release point rather than remembering an index', () => {
    // The SAME order and the SAME record, with the release point re-sequenced:
    // 60 stands in front of it in the first reading and behind it in the second.
    const record = armed()
    expect(breach([60, 50, 90], record, { 60: MEDIUM })).toEqual([{ point: 60, cause: 'not-high' }])
    expect(breach([50, 60, 90], record, { 60: MEDIUM })).toEqual([])
    // And a release point that has CLOSED leaves no boundary to break.
    expect(state([60, 90], record, { 60: MEDIUM }).state).toBe('no-boundary')
  })

  it('grandfathers only the FROZEN front — not whatever the baseline has since absorbed', () => {
    // THE BYPASS THE REVIEW FOUND. 90 is remembered by the provenance baseline
    // and was NOT in front of the release when the rule landed, so moving it
    // there afterwards is exactly the act the rule refuses — in two turns rather
    // than one. Reading the baseline as the exemption made that silent.
    expect(breach([90, 50], armed(), { 90: MEDIUM })).toEqual([{ point: 90, cause: 'not-high' }])
    // A point the freeze DOES name is left alone, whatever it states.
    expect(breach([90, 50], armed({}, [90]), { 90: MEDIUM })).toEqual([])
  })

  it('asks for the arming instead of falling silent where no front was frozen', () => {
    const unarmed = state([60, 50, 90], { ranked: {}, settled: { at: 't', points: [50, 90] } }, { 60: MEDIUM })
    expect(unarmed.state).toBe('unarmed')
    expect(unarmed.ahead).toEqual([60])
    expect(unarmed.breaches).toEqual([])
    expect(boundaryUnarmedMessage(unarmed.ahead, 50)).toContain('RELEASE BOUNDARY NOT ARMED')
    expect(boundaryUnarmedMessage(unarmed.ahead, 50)).toContain(BOUNDARY_SEED_CMD)
  })

  it('draws no verdict from a record it cannot read', () => {
    expect(state([60, 50], parseRankRecord('{oops'), { 60: MEDIUM }).state).toBe('torn')
    expect(breach([60, 50], parseRankRecord('{oops'), { 60: MEDIUM })).toEqual([])
  })

  it('states the refusal, and names EVERY remedy that actually closes it', () => {
    expect(releaseBoundaryMessage([{ point: 60, cause: 'unrecorded' }], 50)).toBe(
      'MACHINE-FILED POINT IN FRONT OF THE RELEASE: point(s) 60 stand before point 50 without having earned the ' +
        'place. The user ruled on 20.08.2026 that a point the MACHINE files itself — a drained finding, a charged ' +
        'red, a review finding, a guard remedy — is ranked by its urgency, and only a high one may stand before ' +
        'the release. Point(s) 60 do state high urgency, but nothing records why they cannot wait: MOVE the block ' +
        'inside TASKS.md to BEHIND point 50, or record the reason in one line — node scripts/queue-rank.mjs ' +
        '--ahead <N> --why "<why it cannot wait for the release>". A point the USER asked for ' +
        'is exempt, and says so: node scripts/queue-rank.mjs --ranked <N> --origin user --why "<one line>". And ' +
        'where the move lands the block at the END of the order, the append gate asks about that placement in ' +
        'the same turn — answer it with node scripts/queue-rank.mjs --ranked <N> --why "<one line>".',
    )
    const notHigh = releaseBoundaryMessage([{ point: 60, cause: 'not-high' }], 50)
    expect(notHigh).toContain('MOVE the block inside TASKS.md to BEHIND point 50')
    expect(notHigh).toContain('say so IN THE POINT and rank it there')
    expect(releaseBoundaryMessage([], 50)).toBe('')
    expect(releaseBoundaryMessage(null, 50)).toBe('')
  })

  it('keeps the release number OUT of the ranking code — one copy, in the order module', () => {
    // The prose may QUOTE the user's instruction, which names the number; the
    // CODE may not, or the boundary would have two homes and the second would be
    // the one nobody updates when the release point moves.
    const code = readFileSync(resolve(REPO_ROOT, 'scripts/queue-rank-core.mjs'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .join('\n')
    expect(code).not.toContain(String(RELEASE_TAG_POINT))
  })
})

describe('ARMING the front — once, by hand, with a reason', () => {
  const unarmed = { ranked: {}, settled: { at: 't', points: [50, 90] } }

  it('freezes exactly what stands in front of the release today', () => {
    const next = seedBoundary(unarmed, [60, 61, 50, 90], { releasePoint: 50, why: 'the legacy order', at: 't' })
    expect(next.boundary).toEqual({ at: 't', why: 'the legacy order', points: [60, 61] })
    // …and the parts it did not touch are still there.
    expect(next.settled.points).toEqual([50, 90])
  })

  it('refuses a second arming, which would grandfather the breach it is looking at', () => {
    const armed = seedBoundary(unarmed, [60, 50], { releasePoint: 50, why: 'w', at: 't' })
    expect(() => seedBoundary(armed, [61, 60, 50], { releasePoint: 50, why: 'again', at: 't' })).toThrow(
      /already carries a frozen release front/,
    )
  })

  it('refuses without a reason, and where the release point is not in the order', () => {
    expect(() => seedBoundary(unarmed, [60, 50], { releasePoint: 50, why: '  ' })).toThrow(/--why is required/)
    expect(() => seedBoundary(unarmed, [60, 90], { releasePoint: 50, why: 'w' })).toThrow(/is not in the open work order/)
  })

  it('refuses to re-arm a record the repository CARRIES but the checkout is missing', () => {
    // The removal route: refuse, move the record aside, arm again, and today's
    // front — breaches and all — becomes the legacy order.
    expect(() =>
      seedBoundary(unarmed, [60, 50], { releasePoint: 50, why: 'w', tracked: true, present: false }),
    ).toThrow(/is missing here, but this repository carries it/)
    // A record that is THERE arms normally — it is the REMOVAL that is refused.
    expect(
      seedBoundary(unarmed, [60, 50], { releasePoint: 50, why: 'w', at: 't', tracked: true, present: true }).boundary
        .points,
    ).toEqual([60])
  })

  it('refuses to write over a torn record', () => {
    expect(() => seedBoundary(parseRankRecord('{oops'), [60, 50], { releasePoint: 50, why: 'w' })).toThrow(
      TORN_RECORD_MESSAGE,
    )
  })
})

describe('a breach FREEZES the baseline, exactly as an unranked append does', () => {
  it('refuses to grow the remembered set while a breach stands', () => {
    const record = settledAt([50, 90])
    // Without the breach the settle takes today's order …
    expect(settleRecord([60, 50, 90], record, { at: 'now' }).record.settled.points).toEqual([50, 60, 90])
    // … and with it, nothing grows: 60 must stay judged or the rule sees it once.
    expect(settleRecord([60, 50, 90], record, { at: 'now', blocked: [60] })).toEqual({ changed: false, record: null })
  })
  it('still SHRINKS while a breach stands — a closed point may never re-enter unquestioned', () => {
    const record = settledAt([50, 90])
    const next = settleRecord([60, 50], record, { at: 'now', blocked: [60] })
    expect(next.changed).toBe(true)
    expect(next.record.settled.points).toEqual([50])
  })
  it('ignores a blocked point that is not in the order at all', () => {
    const record = settledAt([50, 90])
    expect(settleRecord([50, 90], record, { at: 'now', blocked: [999] })).toEqual({ changed: false, record: null })
  })
})

describe('the FROZEN front survives every write, and only ever shrinks', () => {
  const withFront = (points, front) => ({
    ranked: { 60: { at: '', why: 'w', origin: ORIGIN_MACHINE } },
    settled: { at: 't', points },
    boundary: { at: 't', why: 'legacy', points: front },
  })

  it('rides through a settle that WRITES, a decision and a prune', () => {
    // The settle must actually WRITE, or this asserts nothing: 70 is appended
    // and answered, so the baseline grows — and the front must survive that.
    const answered = {
      ranked: { 70: { at: '', why: 'last is right', origin: ORIGIN_MACHINE } },
      settled: { at: 't', points: [50, 60] },
      boundary: { at: 't', why: 'legacy', points: [60] },
    }
    const settled = settleRecord([60, 50, 70], answered, { at: 'now' })
    expect(settled.changed).toBe(true)
    expect(settled.record.settled.points).toEqual([50, 60, 70])
    expect(settled.record.boundary).toEqual({ at: 't', why: 'legacy', points: [60] })
    const record = withFront([50, 60], [60])
    expect(recordRank(record, 60, { why: 'again' }).boundary.points).toEqual([60])
    expect(pruneRankRecord(record, [60, 50]).boundary.points).toEqual([60])
  })

  it('drops a grandfathered point the work order TICKS, even with no open points left', () => {
    // The empty-order branch carried the front through untouched, so a point that
    // closed while the order read empty kept its exemption into its reopen.
    const settled = settleRecord([], withFront([50, 60], [60]), { at: 'now', closed: [60] })
    expect(settled.changed).toBe(true)
    expect(settled.record.boundary.points).toEqual([])
    expect(settled.record.settled.points).toEqual([50])
  })

  it('drops a grandfathered point that has CLOSED, so its reopen is judged', () => {
    const record = withFront([50, 60], [60])
    expect(pruneRankRecord(record, [50]).boundary.points).toEqual([])
    const settled = settleRecord([50], record, { at: 'now' })
    expect(settled.changed).toBe(true)
    expect(settled.record.boundary.points).toEqual([])
  })

  it('narrows nothing from an order that reads as EMPTY', () => {
    // Absence proves nothing about a work order — the same rule the baseline has.
    expect(pruneRankRecord(withFront([50, 60], [60]), []).boundary.points).toEqual([60])
  })

  it('is TORN when it is present but unreadable, never read as never-armed', () => {
    expect(parseRankRecord('{"settled":{"at":"t","points":[1]},"boundary":42}').torn).toBe(true)
    expect(parseRankRecord('{"settled":{"at":"t","points":[1]},"boundary":{"points":"no"}}').torn).toBe(true)
  })
})
