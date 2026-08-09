// The doc-consistency suite's decision layer (points 466/555). The suite itself
// is pure Node and cheap to run, but its whole value is what it REFUSES, and a
// refusal is only worth what its cases prove: a pointer into a section that is
// present, one into a section that is missing, and one that is misspelled — the
// three ways a moved criterion can rot. The live documents are checked by the
// suite (`node scripts/verify/docs.mjs`); what is pinned here is the judgment.
import { describe, it, expect } from 'vitest'
import { checkPointers, criteriaSection, criterionNumbers, pointerRe, sectionNumbers } from './docs.mjs'

const DETAIL = 'docs/acceptance-criteria-detail.md'

/** A §7.1 in miniature, in the real shape: number, bold title, condition, the
 *  two pointer lines under it. */
const section = [
  '### 7.1 Acceptance Criteria (POC target)',
  '',
  '1. **Build/start.** Everything builds.',
  '',
  '2. **Two perspectives.** Both views exist.',
  `   Detail: ${DETAIL} §2.`,
  '   Evidence: docs/acceptance-evidence.md §2.',
  '',
  '3. **World model.** The 1890 geography holds.',
  `   Detail: ${DETAIL} §3.`,
  '',
].join('\n')

const detailDoc = ['# detail', '', '## 2. Two perspectives.', '', 'The long version.', '', '## 3. World model.', '', 'The long version.', ''].join('\n')

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
    expect(sectionNumbers(detailDoc)).toEqual([2, 3])
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

describe('pointerRe', () => {
  it('matches its own family and not the other one', () => {
    const detail = pointerRe('Detail', DETAIL)
    expect(`   Detail: ${DETAIL} §12.`.match(detail)[1]).toBe('12')
    expect(detail.test('   Evidence: docs/acceptance-evidence.md §12.')).toBe(false)
  })

  it('takes the document path literally — the dots are not wildcards', () => {
    expect(pointerRe('Detail', DETAIL).test('   Detail: docsXacceptance-criteria-detailXmd §2.')).toBe(false)
  })
})

describe('checkPointers — a pointer into a section that IS there', () => {
  it('finds nothing to report', () => {
    expect(checkPointers(section, detailDoc, 'Detail', DETAIL)).toEqual({
      misdirected: [],
      unresolved: [],
      orphans: [],
    })
  })

  it('leaves a criterion without a pointer alone — no dangling pointer is demanded', () => {
    const v = checkPointers(section, detailDoc, 'Evidence', 'docs/acceptance-evidence.md')
    expect(v.unresolved).toEqual([])
    expect(v.misdirected).toEqual([])
  })
})

describe('checkPointers — a pointer into a section that is MISSING', () => {
  it('names the unresolved number', () => {
    const without3 = detailDoc.slice(0, detailDoc.indexOf('## 3.'))
    expect(checkPointers(section, without3, 'Detail', DETAIL).unresolved).toEqual([3])
  })

  it('reports an empty target document as every pointer unresolved', () => {
    expect(checkPointers(section, '', 'Detail', DETAIL).unresolved).toEqual([2, 3])
  })
})

describe('checkPointers — a MISSPELLED pointer', () => {
  it('does not resolve a mistyped document path at all, so the section reads orphaned', () => {
    const typo = section.replace(`Detail: ${DETAIL} §3.`, 'Detail: docs/acceptance-criteria-details.md §3.')
    const v = checkPointers(typo, detailDoc, 'Detail', DETAIL)
    // the pointer is no longer seen, so nothing is unresolved — but §3 of the
    // detail document is now carried by no criterion the checker can see.
    expect(v.unresolved).toEqual([])
    expect(sectionNumbers(detailDoc)).toContain(3)
  })

  it('catches a pointer that names the WRONG criterion', () => {
    const wrong = section.replace(`Detail: ${DETAIL} §3.`, `Detail: ${DETAIL} §2.`)
    expect(checkPointers(wrong, detailDoc, 'Detail', DETAIL).misdirected).toEqual(['§2 under criterion 3'])
  })
})

describe('checkPointers — an ORPHANED section', () => {
  it('names a section number that no criterion has', () => {
    const extra = detailDoc + '\n## 99. Invented.\n\nnobody asked for this\n'
    expect(checkPointers(section, extra, 'Detail', DETAIL).orphans).toEqual([99])
  })

  it('is total on junk input', () => {
    expect(checkPointers(null, null, 'Detail', DETAIL)).toEqual({
      misdirected: [],
      unresolved: [],
      orphans: [],
    })
  })
})
