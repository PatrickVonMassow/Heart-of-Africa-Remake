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
  it.each([
    ['Detail', DETAIL],
    ['Evidence', 'docs/acceptance-evidence.md'],
  ])('matches bare and backticked %s paths', (keyword, doc) => {
    const pointer = pointerRe(keyword, doc)
    expect(`   ${keyword}: ${doc} §12.`.match(pointer)[1]).toBe('12')
    expect(`   ${keyword}: \`${doc}\` §12.`.match(pointer)[1]).toBe('12')
  })

  it('does not cross pointer families', () => {
    const detail = pointerRe('Detail', DETAIL)
    expect(detail.test('   Evidence: `docs/acceptance-evidence.md` §12.')).toBe(false)
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
    // Criteria 1 and 3 carry no `Evidence:` line, and the evidence document has
    // no section for them: a criterion whose condition is already one short
    // statement needs neither (CLAUDE.md §7.1 nos. 1, 11, 18).
    const evidenceDoc = ['# evidence', '', '## 2. Two perspectives.', '', 'the proof chain', ''].join('\n')
    expect(checkPointers(section, evidenceDoc, 'Evidence', 'docs/acceptance-evidence.md')).toEqual({
      misdirected: [],
      unresolved: [],
      orphans: [],
    })
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
  // The direction a moved criterion rots most quietly: the section is still
  // there and the criterion is still numbered, so a check that only asked "does
  // a criterion with that number exist" would call this sound. The pointer is
  // what is gone, and the section it named is what goes unreferenced.
  it('leaves the section unreferenced, and says so', () => {
    const typo = section.replace(`Detail: ${DETAIL} §3.`, 'Detail: docs/acceptance-criteria-details.md §3.')
    const v = checkPointers(typo, detailDoc, 'Detail', DETAIL)
    expect(v.unresolved).toEqual([]) // the mistyped line is no pointer at all
    expect(v.orphans).toEqual([3])
  })

  it('reports a DELETED pointer the same way', () => {
    const gone = section.replace(`   Detail: ${DETAIL} §3.\n`, '')
    expect(checkPointers(gone, detailDoc, 'Detail', DETAIL).orphans).toEqual([3])
  })

  it('catches a pointer that names the WRONG criterion', () => {
    const wrong = section.replace(`Detail: ${DETAIL} §3.`, `Detail: ${DETAIL} §2.`)
    const v = checkPointers(wrong, detailDoc, 'Detail', DETAIL)
    expect(v.misdirected).toEqual(['§2 under criterion 3'])
    expect(v.orphans).toEqual([3]) // and nobody points at §3 any more
  })
})

describe('checkPointers — an ORPHANED section', () => {
  it('names a section number that no criterion points at', () => {
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
