// The accounting that makes a blind-parallel MERGE countable, pinned (point 634).
//
// The failure this layer exists for is silent: the merge folds two lists into
// one, and an entry that quietly fails to appear in the union reads exactly like
// an entry that was merged. So the cases below are all about the arithmetic —
// an input entry missing from the union, a `merged with` naming an ID that does
// not exist, an entry counted twice — plus the identity rule (the merge goes to
// the model that wrote neither list) and the cheap shape that keeps it cheap
// (identical pairs collapsed for free, only the candidates put to the merger).
import { describe, it, expect } from 'vitest'
import { ACCOUNTING_RECEIPT } from './mechanism-review-core.mjs'
import {
  accountUnion,
  candidatePairs,
  CANDIDATE_THRESHOLD,
  contentWords,
  entryKey,
  exactDuplicates,
  formatAccounting,
  normalizePath,
  normalizeText,
  parseEntryLines,
  parseListText,
  readList,
  similarity,
  summaryLine,
  validateInputs,
  validateList,
  validateMerger,
} from './blind-merge-core.mjs'

const listA = readList('A', {
  model: 'Opus 5',
  entries: [
    { id: 'A1', file: 'src/world/river.ts', defect: 'the ribbon tears at the delta' },
    { id: 'A2', file: 'src/ui/hud.tsx', defect: 'the health badge overlaps the date' },
    { id: 'A3', file: 'scripts/verify/travel.mjs', defect: 'the frame is written before the wait' },
  ],
})
const listB = readList('B', {
  model: 'GPT-5.6 Sol',
  entries: [
    { id: 'B1', file: 'src/ui/hud.tsx', defect: 'affliction badge sits on top of the calendar text' },
    { id: 'B2', file: 'src/state/save.ts', defect: 'the snapshot drops the gift inventory' },
  ],
})

/** The union a correct merge produces for the two lists above. */
const goodUnion = {
  mergedBy: 'Fable 5',
  entries: [
    { id: 'U1', from: ['A1'] },
    // A FOLD says what the one finding is; a pass-through entry needs no line.
    { id: 'U2', from: ['A2', 'B1'], defect: 'the affliction badge overlaps the date in the status bar' },
    { id: 'U3', from: ['A3'] },
    { id: 'U4', from: ['B2'] },
  ],
}

describe('reading and validating the two input lists', () => {
  it('accepts a bare array as well as the { model, entries } shape', () => {
    const bare = readList('B', [{ id: 'B1', file: 'x.ts', defect: 'a defect line' }])
    expect(bare.entries).toHaveLength(1)
    expect(bare.model).toBe('')
    expect(readList('A', { model: 'Opus 5', entries: [] }).model).toBe('Opus 5')
    expect(readList('A', null).entries).toEqual([])
  })

  it('reads the line form the review prompt asks for, bullets and table pipes and all', () => {
    const text = [
      'Here is what I found:',
      '',
      '- B1 | src/ui/hud.tsx | the badge overlaps the date',
      '| B2 | src/state/save.ts | the snapshot drops the gift inventory |',
      'B3 | | a defect with no file named',
      'and that is the whole list.',
    ].join('\n')
    const list = parseListText('B', text)
    expect(list.entries.map((e) => e.id)).toEqual(['B1', 'B2', 'B3'])
    expect(list.entries[1]).toEqual({
      id: 'B2',
      file: 'src/state/save.ts',
      defect: 'the snapshot drops the gift inventory',
    })
    expect(list.entries[2].file).toBe('')
    expect(validateInputs(readList('A', []), list).ok).toBe(true)
  })

  it('REPORTS a line that was meant to be an entry and carries no id', () => {
    // Skipping it quietly turned an unnumbered list into an EMPTY one, which an
    // empty union accounts for perfectly (four-eyes review, second round).
    const list = parseListText('B', 'src/x.ts | the ribbon tears\nsrc/y.ts | the save drops gifts')
    const { ok, errors } = validateList(list)
    expect(ok).toBe(false)
    expect(errors.join('\n')).toMatch(/meant to be an entry but carries no id/)
    expect(errors.join('\n')).toMatch(/not one entry could be read/)
  })

  it('REPORTS a finding written without pipes beside well-formed ones', () => {
    // The dangerous shape is the MIXED list: one good row makes the list look
    // readable while the other entry is silently gone (four-eyes, fourth round).
    const list = parseListText('B', ['- B1 | src/x.ts | the ribbon tears', '- B2: the save drops gifts'].join('\n'))
    expect(list.entries.map((e) => e.id)).toEqual(['B1'])
    const { ok, errors } = validateList(list)
    expect(ok).toBe(false)
    expect(errors.join('\n')).toMatch(/B2: the save drops gifts/)
  })

  it('still ignores ordinary prose around the list', () => {
    const list = parseListText(
      'B',
      ['Here is what I found in the diff:', 'B1 | src/x.ts | the ribbon tears', 'That is all.'].join('\n'),
    )
    expect(validateList(list).ok).toBe(true)
    expect(list.entries).toHaveLength(1)
  })

  it('an unreadable list can never be accounted for by an empty union', () => {
    const b = parseListText('B', 'no ids | nothing here')
    expect(validateInputs(parseListText('A', '[]'), b).ok).toBe(false)
  })

  it('takes a genuinely empty file as an empty list', () => {
    expect(validateList(parseListText('B', '   ')).ok).toBe(true)
  })

  it('keeps a defect line that contains a pipe of its own', () => {
    const [entry] = parseEntryLines('A1 | src/x.ts | the a | b split breaks')
    expect(entry.defect).toBe('the a | b split breaks')
  })

  it('skips a prose line and a markdown table header rather than inventing an entry', () => {
    expect(parseEntryLines('| id | file | defect |\n|----|----|----|\nnothing here at all')).toEqual([])
  })

  it('prefers JSON when the file is JSON', () => {
    expect(parseListText('A', '{"model":"Opus 5","entries":[{"id":"A1","file":"x","defect":"y"}]}').model).toBe(
      'Opus 5',
    )
  })

  it('refuses an entry with no id — it could never be accounted for', () => {
    const bad = readList('A', [{ file: 'x.ts', defect: 'something is wrong here' }])
    const { ok, errors } = validateList(bad)
    expect(ok).toBe(false)
    expect(errors.join(' ')).toMatch(/no id/i)
  })

  it('refuses a repeated id inside one list and across the two lists', () => {
    const dup = readList('A', [
      { id: 'A1', file: 'x.ts', defect: 'one' },
      { id: 'A1', file: 'y.ts', defect: 'two' },
    ])
    expect(validateList(dup).errors.join(' ')).toMatch(/unique/i)
    const collide = validateInputs(listA, readList('B', [{ id: 'A1', file: 'z.ts', defect: 'three' }]))
    expect(collide.ok).toBe(false)
    expect(collide.errors.join(' ')).toMatch(/BOTH lists/i)
  })

  it('refuses an entry with no defect line', () => {
    expect(validateList(readList('A', [{ id: 'A1', file: 'x.ts' }])).errors.join(' ')).toMatch(/defect line/i)
  })

  it('passes the two well-formed lists', () => {
    expect(validateInputs(listA, listB)).toEqual({ ok: true, errors: [] })
  })
})

describe('the count — every input entry is accounted for', () => {
  it('passes a union that accounts for every entry, and names each disposition', () => {
    const r = accountUnion({ a: listA, b: listB, union: goodUnion })
    expect(r.ok).toBe(true)
    expect(r.findings).toEqual([])
    expect(r.counts).toMatchObject({ a: 3, b: 2, union: 4, accounted: 5, merged: 2, onlyA: 2, onlyB: 1 })
    const byId = Object.fromEntries(r.dispositions.map((d) => [d.id, d.disposition]))
    expect(byId).toEqual({
      A1: 'only A',
      A2: 'merged with B1',
      A3: 'only A',
      B1: 'merged with A2',
      B2: 'only B',
    })
  })

  it('REPORTS AN INPUT ENTRY MISSING FROM THE UNION, with its id', () => {
    const union = { entries: goodUnion.entries.filter((e) => e.id !== 'U4') }
    const r = accountUnion({ a: listA, b: listB, union })
    expect(r.ok).toBe(false)
    const dropped = r.findings.filter((f) => f.kind === 'unaccounted')
    expect(dropped).toHaveLength(1)
    expect(dropped[0].id).toBe('B2')
    expect(dropped[0].list).toBe('B')
    expect(dropped[0].message).toContain('B2')
    expect(dropped[0].message).toMatch(/dropped, not merged/i)
    // and it is missing from the accounted count, not silently counted
    expect(r.counts.accounted).toBe(4)
  })

  it('reports a whole side lost — the failure mode that reads as a clean merge', () => {
    const r = accountUnion({ a: listA, b: listB, union: { entries: [{ id: 'U1', from: ['A1', 'A2', 'A3'] }] } })
    expect(r.findings.filter((f) => f.kind === 'unaccounted').map((f) => f.id)).toEqual(['B1', 'B2'])
  })

  it('REPORTS A `merged with` NAMING AN ID THAT DOES NOT EXIST', () => {
    const union = { entries: [...goodUnion.entries, { id: 'U5', from: ['B7'] }] }
    const r = accountUnion({ a: listA, b: listB, union })
    expect(r.ok).toBe(false)
    const unknown = r.findings.filter((f) => f.kind === 'unknown-id')
    expect(unknown).toHaveLength(1)
    expect(unknown[0].id).toBe('B7')
    expect(unknown[0].union).toBe('U5')
    expect(unknown[0].message).toMatch(/no entry of either list/i)
  })

  it('a mistyped id is BOTH an unknown id and a dropped entry, never only one', () => {
    const union = { entries: goodUnion.entries.map((e) => (e.id === 'U4' ? { id: 'U4', from: ['B22'] } : e)) }
    const r = accountUnion({ a: listA, b: listB, union })
    expect(r.findings.map((f) => f.kind).sort()).toEqual(['unaccounted', 'unknown-id'])
  })

  it('reports an entry claimed by two union entries', () => {
    const union = { entries: [...goodUnion.entries, { id: 'U5', from: ['A1'] }] }
    const r = accountUnion({ a: listA, b: listB, union })
    const doubled = r.findings.filter((f) => f.kind === 'double-counted')
    expect(doubled).toHaveLength(1)
    expect(doubled[0].id).toBe('A1')
    expect(doubled[0].message).toContain('U1')
    expect(doubled[0].message).toContain('U5')
  })

  it('reports an entry named twice inside ONE union entry', () => {
    const union = { entries: [{ id: 'U1', from: ['A1', 'A1'] }] }
    const r = accountUnion({ a: listA, b: listB, union })
    expect(r.findings.find((f) => f.kind === 'double-counted').message).toMatch(/twice in union entry U1/)
  })

  it('REFUSES A FOLD THAT SAYS NOTHING — the way to satisfy the count by cheating', () => {
    // Counting alone would pass a union that folds every id into one content-free
    // entry: every entry "accounted for" while the findings are gone.
    const all = { entries: [{ id: 'U1', from: ['A1', 'A2', 'A3', 'B1', 'B2'] }] }
    const r = accountUnion({ a: listA, b: listB, union: all })
    expect(r.ok).toBe(false)
    const f = r.findings.find((x) => x.kind === 'no-defect')
    expect(f.union).toBe('U1')
    expect(f.message).toMatch(/folds 5 entries/)
  })

  it('accepts the same fold once it says what the one finding is', () => {
    const all = { entries: [{ id: 'U1', from: ['A1', 'A2', 'A3', 'B1', 'B2'], defect: 'one HUD layout defect' }] }
    expect(accountUnion({ a: listA, b: listB, union: all }).ok).toBe(true)
  })

  it('asks no defect line of a pass-through entry, which has its source text', () => {
    expect(accountUnion({ a: listA, b: listB, union: goodUnion }).findings).toEqual([])
  })

  it('reports a union entry that stands for nothing', () => {
    const r = accountUnion({ a: listA, b: listB, union: { entries: [...goodUnion.entries, { id: 'U5', from: [] }] } })
    expect(r.findings.find((f) => f.kind === 'empty-from').union).toBe('U5')
  })

  it('reports two union entries sharing one id — every other message names them', () => {
    const union = { entries: [{ id: 'U1', from: ['A1'] }, { id: 'U1', from: ['A2'] }] }
    const r = accountUnion({ a: listA, b: listB, union })
    expect(r.findings.some((f) => f.kind === 'duplicate-union-id')).toBe(true)
  })

  it('accepts a bare array of union entries and names an unnamed one by position', () => {
    const r = accountUnion({ a: listA, b: listB, union: [{ from: ['A1'] }] })
    expect(r.dispositions.find((d) => d.id === 'A1').union).toBe('#1')
  })

  it('an empty union accounts for nothing and says so entry by entry', () => {
    const r = accountUnion({ a: listA, b: listB, union: { entries: [] } })
    expect(r.findings.filter((f) => f.kind === 'unaccounted')).toHaveLength(5)
    expect(r.ok).toBe(false)
  })

  it('two empty lists and an empty union is vacuously accounted for', () => {
    const empty = readList('A', [])
    const r = accountUnion({ a: empty, b: readList('B', []), union: { entries: [] } })
    expect(r.ok).toBe(true)
    expect(r.counts).toMatchObject({ accounted: 0, merged: 0 })
  })

  it('a three-way fold is a merge for every entry in it', () => {
    const a = readList('A', [
      { id: 'A1', file: 'x.ts', defect: 'one' },
      { id: 'A2', file: 'x.ts', defect: 'two' },
    ])
    const b = readList('B', [{ id: 'B1', file: 'x.ts', defect: 'three' }])
    const union = { entries: [{ id: 'U1', from: ['A1', 'A2', 'B1'], defect: 'the same defect, said three ways' }] }
    const r = accountUnion({ a, b, union })
    expect(r.ok).toBe(true)
    expect(r.dispositions.find((d) => d.id === 'A1').disposition).toBe('merged with A2, B1')
    expect(r.counts.merged).toBe(3)
  })
})

describe('who may merge', () => {
  it('accepts the model that wrote neither list', () => {
    expect(validateMerger({ mergedBy: 'Fable 5', authors: ['Opus 5', 'GPT-5.6 Sol'] })).toMatchObject({ ok: true })
  })

  it('refuses the model that authored one of the lists', () => {
    const r = validateMerger({ mergedBy: 'Opus 5', authors: ['Opus 5', 'GPT-5.6 Sol'] })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/may not merge/i)
  })

  it('refuses a merge with no model named at all', () => {
    expect(validateMerger({ mergedBy: '', authors: ['Opus 5', 'GPT-5.6 Sol'] }).ok).toBe(false)
  })

  it('lets a recorded two-model fallback through, and marks it as one', () => {
    const r = validateMerger({
      mergedBy: 'Opus 5',
      authors: ['Opus 5', 'Opus 5'],
      fallback: 'GPT-5.6 Sol was unreachable and Fable 5 was not available in this session',
    })
    expect(r).toMatchObject({ ok: true, fallback: true })
  })

  it('refuses a fallback that names no model — otherwise it is a free pass', () => {
    const r = validateMerger({
      mergedBy: 'Opus 5',
      authors: ['Opus 5'],
      fallback: 'there was nobody else around today',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/NAME the model/i)
  })

  it('refuses a fallback claimed where none was needed', () => {
    const r = validateMerger({
      mergedBy: 'Fable 5',
      authors: ['Opus 5', 'GPT-5.6 Sol'],
      fallback: 'no third model was reachable',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/no fallback was needed/i)
  })

  it('refuses a fallback that says nothing', () => {
    expect(validateMerger({ mergedBy: 'Opus 5', authors: ['Opus 5'], fallback: 'no' }).ok).toBe(false)
  })

  it('reads the same model through a differently written name', () => {
    expect(validateMerger({ mergedBy: 'Claude Opus 5', authors: ['Opus 5'] }).ok).toBe(false)
    expect(validateMerger({ mergedBy: 'Opus 4.8', authors: ['Opus 5'] }).ok).toBe(true)
  })
})

describe('the cheap shape — what the merger is actually asked', () => {
  it('collapses the identical pairs for free, one to one', () => {
    const a = readList('A', [
      { id: 'A1', file: 'src/x.ts', defect: 'The ribbon tears.' },
      { id: 'A2', file: 'src/x.ts', defect: 'the ribbon tears' },
    ])
    const b = readList('B', [{ id: 'B1', file: './src/X.ts', defect: 'the  ribbon tears!' }])
    expect(exactDuplicates(a, b)).toEqual([{ a: 'A1', b: 'B1' }])
  })

  it('puts the near-miss pairs to the merger and leaves the identical ones out', () => {
    const pairs = candidatePairs(listA, listB)
    expect(pairs.map((p) => `${p.a}↔${p.b}`)).toContain('A2↔B1')
    expect(pairs.every((p) => p.a !== 'A1')).toBe(true)
  })

  it('same file is a candidate on its own, whatever words the two models chose', () => {
    const a = readList('A', [{ id: 'A1', file: 'src/x.ts', defect: 'alpha beta gamma' }])
    const b = readList('B', [{ id: 'B1', file: 'src/x.ts', defect: 'delta epsilon zeta' }])
    const [pair] = candidatePairs(a, b)
    expect(pair).toMatchObject({ a: 'A1', b: 'B1', sameFile: true })
  })

  it('an unrelated pair in different files is never put to the merger', () => {
    const a = readList('A', [{ id: 'A1', file: 'src/x.ts', defect: 'the river ribbon tears at the delta' }])
    const b = readList('B', [{ id: 'B1', file: 'src/y.ts', defect: 'the save snapshot drops gifts' }])
    expect(candidatePairs(a, b)).toEqual([])
  })

  it('sorts the strongest candidate first', () => {
    const a = readList('A', [{ id: 'A1', file: '', defect: 'the ribbon tears at the delta mouth' }])
    const b = readList('B', [
      { id: 'B1', file: '', defect: 'ribbon tears delta mouth badly' },
      { id: 'B2', file: '', defect: 'the ribbon tears somewhere unrelated entirely' },
    ])
    const pairs = candidatePairs(a, b, { threshold: 0.1 })
    expect(pairs[0].b).toBe('B1')
    expect(pairs[0].similarity).toBeGreaterThan(pairs[1].similarity)
  })

  it('the threshold is the one the command uses', () => {
    expect(CANDIDATE_THRESHOLD).toBeGreaterThan(0)
    expect(CANDIDATE_THRESHOLD).toBeLessThan(1)
  })
})

describe('the text helpers the comparison rests on', () => {
  it('normalizes a path the way two models would write it differently', () => {
    expect(normalizePath('./src\\World\\River.ts')).toBe('src/world/river.ts')
    expect(normalizePath(null)).toBe('')
  })

  it('reduces a defect line to what it says', () => {
    expect(normalizeText('The ribbon TEARS, badly!')).toBe('the ribbon tears badly')
  })

  it('drops the stopwords from the comparison', () => {
    expect(contentWords('the ribbon is in the delta')).toEqual(['ribbon', 'delta'])
  })

  it('scores an empty line as no similarity at all', () => {
    expect(similarity('', 'anything at all')).toBe(0)
    expect(similarity('ribbon delta', 'ribbon delta')).toBe(1)
  })

  it('keys two identical findings the same and two different ones apart', () => {
    expect(entryKey({ file: 'src/x.ts', defect: 'A tear!' })).toBe(entryKey({ file: './SRC/x.ts', defect: 'a tear' }))
    expect(entryKey({ file: 'src/x.ts', defect: 'a tear' })).not.toBe(entryKey({ file: 'src/y.ts', defect: 'a tear' }))
  })
})

describe('the report', () => {
  it('says in one line that everything is accounted for', () => {
    const line = summaryLine(accountUnion({ a: listA, b: listB, union: goodUnion }))
    expect(line).toMatch(/3 A \+ 2 B entries → 4 union entries/)
    expect(line).toMatch(/every input entry accounted for/)
  })

  it('names the dropped entry in the printed report, not just a count', () => {
    const r = accountUnion({ a: listA, b: listB, union: { entries: [{ id: 'U1', from: ['A1'] }] } })
    const text = formatAccounting(r)
    expect(text).toContain('B2')
    expect(text).toMatch(/accounting error/i)
    expect(text).toMatch(/only A.*only B.*merged with/s)
  })

  it('THE RECORDER ACCEPTS EXACTLY THE LINE THIS PRINTS, and only when it balances', () => {
    // The two halves live in different files and must not drift: the recorder's
    // receipt pattern is asserted against a REAL summary line, not a copy of it.
    const green = summaryLine(accountUnion({ a: listA, b: listB, union: goodUnion }))
    expect(ACCOUNTING_RECEIPT.test(green)).toBe(true)
    const red = summaryLine(accountUnion({ a: listA, b: listB, union: { entries: [{ id: 'U1', from: ['A1'] }] } }))
    expect(ACCOUNTING_RECEIPT.test(red)).toBe(false)
    expect(ACCOUNTING_RECEIPT.test('I merged the lists carefully')).toBe(false)
    // ANCHORED: a line that merely contains the words, or negates them, is not
    // the receipt (four-eyes review, second round).
    expect(ACCOUNTING_RECEIPT.test('1 A + 1 B entries → 2 union entries (x): not every input entry accounted for'))
      .toBe(false)
    expect(ACCOUNTING_RECEIPT.test(`I claim: ${green}, believe me`)).toBe(false)
  })

  it('a green report is the summary line alone', () => {
    const r = accountUnion({ a: listA, b: listB, union: goodUnion })
    expect(formatAccounting(r)).toBe(summaryLine(r))
  })
})
