// The document-budget guard's decision core (user 26.07.2026), plus the real
// files: the point of the budgets is that they hold TODAY, so the shipped
// documents are measured here rather than only synthetic ones.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOC_BUDGETS,
  measure,
  evaluateDocBudgets,
  formatDocBudgetVerdict,
} from './doc-budget-core.mjs'

const ROOT = resolve(process.cwd())

describe('measure', () => {
  it('counts lines and words', () => {
    expect(measure('a b\nc\n')).toEqual({ lines: 3, words: 3 })
  })

  it('stops at the heading when one is given — the preamble case', () => {
    const text = 'intro line\nsecond\n## Checklist\n- [ ] 1. a point with many words here\n'
    expect(measure(text, /^## Checklist/)).toEqual({ lines: 2, words: 3 })
  })

  it('measures the whole file when the heading is absent', () => {
    expect(measure('a\nb\n', /^## Nope/).lines).toBe(3)
  })

  it('is total on missing input', () => {
    expect(measure(undefined)).toEqual({ lines: 1, words: 0 })
  })
})

describe('evaluateDocBudgets', () => {
  const budgets = [{ path: 'X.md', maxLines: 3, maxWords: 5, why: 'because' }]

  it('passes a document inside its budget', () => {
    expect(evaluateDocBudgets([{ path: 'X.md', text: 'a b\nc\n' }], budgets).block).toBe(false)
  })

  it('blocks on lines and on words separately', () => {
    const v = evaluateDocBudgets([{ path: 'X.md', text: 'a b c\nd e f\ng h i\nj k l\n' }], budgets)
    expect(v.findings.map((f) => f.kind).sort()).toEqual(['lines', 'words'])
  })

  it('is exact at the boundary (a trailing newline counts as its own line)', () => {
    expect(evaluateDocBudgets([{ path: 'X.md', text: 'a\nb' }], budgets).block).toBe(false)
    expect(evaluateDocBudgets([{ path: 'X.md', text: 'a\nb\nc' }], budgets).block).toBe(false)
    expect(evaluateDocBudgets([{ path: 'X.md', text: 'a\nb\nc\n' }], budgets).block).toBe(true)
  })

  it('skips a missing file rather than failing it', () => {
    expect(evaluateDocBudgets([{ path: 'X.md', text: null }], budgets).block).toBe(false)
    expect(evaluateDocBudgets([], budgets).block).toBe(false)
    expect(evaluateDocBudgets(undefined, budgets).block).toBe(false)
  })
})

describe('formatDocBudgetVerdict', () => {
  it('says nothing when everything fits', () => {
    expect(formatDocBudgetVerdict({ block: false, findings: [] })).toBe('')
  })

  it('names the file, the numbers and BOTH ways out', () => {
    const text = formatDocBudgetVerdict(
      evaluateDocBudgets([{ path: 'X.md', text: 'a b c\nd e f\ng h i\nj k l\n' }], [
        { path: 'X.md', maxLines: 3, maxWords: 5, why: 'because' },
      ]),
    )
    expect(text).toContain('X.md')
    expect(text).toMatch(/CUT/)
    expect(text).toMatch(/RAISE/)
    expect(text).toContain('doc-budget-core.mjs')
  })
})

describe('the real documents', () => {
  it('are all within budget', () => {
    const docs = DOC_BUDGETS.map(({ path }) => {
      const full = resolve(ROOT, path)
      return { path, text: existsSync(full) ? readFileSync(full, 'utf8') : null }
    })
    const v = evaluateDocBudgets(docs)
    expect(formatDocBudgetVerdict(v)).toBe('')
    expect(v.block).toBe(false)
  })

  it('budgets every document that is read on a per-turn basis', () => {
    const paths = DOC_BUDGETS.map((b) => b.path)
    expect(paths).toContain('CLAUDE.md')
    expect(paths).toContain('TASKS.md')
  })

  // Point 555 moved §7.1 out of CLAUDE.md, so the detail file is now where the
  // criteria grow. A cut whose DESTINATION is uncapped buys nothing for long.
  it('budgets the destination of the §7.1 cut too', () => {
    expect(DOC_BUDGETS.map((b) => b.path)).toContain('docs/acceptance-criteria-detail.md')
  })
})
