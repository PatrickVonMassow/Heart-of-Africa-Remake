// The doc-consistency suite's decision layer (points 466/555). The suite itself
// is pure Node and cheap to run, but its whole value is what it REFUSES, and a
// refusal is only worth what its cases prove: a criterion whose section is
// present, one whose section is missing, and a section no criterion carries —
// the three ways a moved criterion can rot. The live documents are checked by
// the suite (`node scripts/verify/docs.mjs`); what is pinned here is the
// judgment.
import { describe, it, expect } from 'vitest'
import { checkCompanion, companionRules, criteriaSection, criterionNumbers, sectionNumbers } from './docs.mjs'

const DETAIL = 'docs/acceptance-criteria-detail.md'

/** A §7.1 in miniature, in the real shape: number, bold title, condition. The
 *  companion documents carry the rest under the SAME numbers. */
const section = [
  '### 7.1 Acceptance Criteria (POC target)',
  '',
  '1. **Build/start.** Everything builds.',
  '',
  '2. **Two perspectives.** Both views exist.',
  '',
  '3. **World model.** The 1890 geography holds.',
  '',
].join('\n')

const detailDoc = [
  '# detail',
  '',
  '## 1. Build/start.',
  '',
  'The long version.',
  '',
  '## 2. Two perspectives.',
  '',
  'The long version.',
  '',
  '## 3. World model.',
  '',
  'The long version.',
  '',
].join('\n')

describe('criteriaSection', () => {
  it('cuts the block between the two headings', () => {
    expect(criteriaSection('intro\n### 7.1 a\nbody\n### 7.2 b\ntail')).toBe('### 7.1 a\nbody\n')
  })

  it('is empty when a heading is missing or out of order, rather than throwing', () => {
    expect(criteriaSection('### 7.2 only')).toBe('')
    expect(criteriaSection('### 7.2 b\n### 7.1 a')).toBe('')
    expect(criteriaSection(null)).toBe('')
  })
})

describe('the two readers', () => {
  it('read the criteria numbers and the section numbers', () => {
    expect(criterionNumbers(section)).toEqual([1, 2, 3])
    expect(sectionNumbers(detailDoc)).toEqual([1, 2, 3])
  })

  it('do not mistake a numbered list item for a criterion or a heading', () => {
    expect(criterionNumbers('4. no bold title here\n5. **Real.** yes')).toEqual([5])
    expect(sectionNumbers('### 2. deeper heading\n## 7. Real.')).toEqual([7])
  })

  it('are total on junk', () => {
    expect(criterionNumbers(undefined)).toEqual([])
    expect(sectionNumbers(null)).toEqual([])
  })
})

describe('checkCompanion — every criterion has its section', () => {
  it('finds nothing to report', () => {
    expect(checkCompanion(section, detailDoc)).toEqual({ criterionCount: 3, missing: [], orphans: [] })
  })

  it('names the criterion whose section is MISSING', () => {
    const without3 = detailDoc.slice(0, detailDoc.indexOf('## 3.'))
    expect(checkCompanion(section, without3)).toMatchObject({ missing: [3], orphans: [] })
  })

  it('reports an empty companion document as every criterion missing', () => {
    expect(checkCompanion(section, '')).toMatchObject({ missing: [1, 2, 3], orphans: [] })
  })

  // The direction a moved criterion rots most quietly: the section is still
  // there and correctly numbered, so a check that only asked "does every
  // criterion have a section" would call this sound. The criterion is what is
  // gone, and the section it stood for is what nobody carries any more.
  it('names an ORPHANED section that no criterion carries', () => {
    const extra = detailDoc + '\n## 99. Invented.\n\nnobody asked for this\n'
    expect(checkCompanion(section, extra)).toMatchObject({ missing: [], orphans: [99] })
  })

  it('reports a RENUMBERED criterion from both sides at once', () => {
    const renumbered = section.replace('3. **World model.**', '4. **World model.**')
    expect(checkCompanion(renumbered, detailDoc)).toMatchObject({ missing: [4], orphans: [3] })
  })

  it('is total on junk input', () => {
    expect(checkCompanion(null, null)).toEqual({ criterionCount: 0, missing: [], orphans: [] })
  })
})

describe('companionRules — the number judged is part of the verdict', () => {
  it('makes a vanished §7.1 two findings instead of two vacuous passes', () => {
    const rules = companionRules('detail', DETAIL, checkCompanion('', ''))

    expect(rules.map(({ ok }) => ok)).toEqual([false, false])
    expect(rules.every(({ name }) => name.includes('(0 criteria judged)'))).toBe(true)
    expect(rules.every(({ detail }) => detail === 'no criteria matched')).toBe(true)
  })

  it('states the non-zero criterion count on every passing rule', () => {
    const rules = companionRules('detail', DETAIL, checkCompanion(section, detailDoc))

    expect(rules.map(({ ok }) => ok)).toEqual([true, true])
    expect(rules.every(({ name }) => name.includes('(3 criteria judged)'))).toBe(true)
    expect(rules.map(({ detail }) => detail)).toEqual(['all present', 'none'])
  })

  it('names the offending numbers on a failing rule', () => {
    const rules = companionRules('evidence', 'docs/acceptance-evidence.md', checkCompanion(section, '## 2. Two perspectives.\n'))

    expect(rules[0]).toMatchObject({ ok: false, detail: '§1, §3' })
    expect(rules[1]).toMatchObject({ ok: true, detail: 'none' })
  })

  it('counts one criterion in the singular', () => {
    expect(companionRules('detail', DETAIL, checkCompanion('1. **Only.** one', '## 1. Only.'))[0].name).toContain(
      '(1 criterion judged)',
    )
  })
})
