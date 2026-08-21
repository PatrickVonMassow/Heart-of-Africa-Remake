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
  workOrderPoints,
} from './doc-budget-core.mjs'
import { docBudgetPath } from './doc-budget-guard.mjs'

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

  it('blocks a memory entry that grows past the hook-only ceiling', () => {
    const v = evaluateDocBudgets(
      [{ path: 'MEMORY.md', text: '- short hook\n- this entry has far too many words for its index line\n' }],
      [{ path: 'MEMORY.md', maxLines: 4, maxWords: 20, maxEntryWords: 4, why: 'hook only' }],
    )
    expect(v.findings.map((f) => f.kind)).toEqual(['entry words (line 2)'])
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
    const docs = DOC_BUDGETS.map((budget) => {
      const full = docBudgetPath(budget, { repoRoot: ROOT })
      return { path: budget.path, text: existsSync(full) ? readFileSync(full, 'utf8') : null }
    })
    const v = evaluateDocBudgets(docs)
    expect(formatDocBudgetVerdict(v)).toBe('')
    expect(v.block).toBe(false)
  })

  it('budgets every document that is read on a per-turn basis', () => {
    const paths = DOC_BUDGETS.map((b) => b.path)
    expect(paths).toContain('CLAUDE.md')
    expect(paths).toContain('TASKS.md')
    expect(paths).toContain('MEMORY.md')
    expect(paths).toContain('global-CLAUDE.md')
  })

  it('resolves user documents without pretending they live in the repository', () => {
    expect(docBudgetPath({ path: 'MEMORY.md', location: 'project-memory' }, { home: '/u' })).toBe(
      '/u/.claude/projects/-workspace-hoa/memory/MEMORY.md',
    )
    expect(docBudgetPath({ path: 'global-CLAUDE.md', location: 'user-global' }, { home: '/u' })).toBe(
      '/u/.claude/CLAUDE.md',
    )
  })

  // Point 555 moved §7.1 out of CLAUDE.md, so the detail file is now where the
  // criteria grow. A cut whose DESTINATION is uncapped buys nothing for long.
  it('budgets the destination of the §7.1 cut too', () => {
    expect(DOC_BUDGETS.map((b) => b.path)).toContain('docs/acceptance-criteria-detail.md')
  })
})

describe('the per-point ceiling of the work order', () => {
  const order = (...points) =>
    ['# Work order', '', '## Checklist', '', ...points].join('\n')
  // `- [ ] N.` is four whitespace-separated tokens, so the body carries the rest.
  const point = (n, words) => `- [ ] ${n}. ${Array.from({ length: words - 4 }, (_, i) => 'w' + i).join(' ')}`
  const budget = [
    {
      path: 'TASKS.md',
      until: /^## Checklist/,
      maxLines: 999,
      maxWords: 9999,
      why: 'preamble',
      perPoint: { maxWords: 20, why: 'a brief pays a point spec in full at every delegation' },
    },
  ]

  it('splits the file into points, attributing continuation lines to the point above', () => {
    const points = workOrderPoints(order('- [ ] 7. one two', '  three four', '- [x] 8. five'))
    expect(points.map((p) => p.number)).toEqual([7, 8])
    expect(points[0].words).toBe(8) // four tokens of checkbox, then four words over two lines
    // `- [x]` is ONE token where `- [ ]` is two, so a ticked point measures one lower.
    // Irrelevant against a ceiling in the thousands, but it is what the tokenizer does.
    expect(points[1].words).toBe(4)
  })

  it('is green when the largest point sits ON the ceiling', () => {
    const text = order(point(11, 20), point(12, 9))
    expect(evaluateDocBudgets([{ path: 'TASKS.md', text }], budget).block).toBe(false)
  })

  it('goes RED one word over, and names the point', () => {
    const text = order(point(11, 20), point(12, 21))
    const verdict = evaluateDocBudgets([{ path: 'TASKS.md', text }], budget)
    expect(verdict.block).toBe(true)
    expect(verdict.findings.map((f) => f.kind)).toEqual(['point 12 words'])
    expect(verdict.findings[0].actual).toBe(21)
    expect(verdict.findings[0].budget).toBe(20)
  })

  it('judges nothing per point while the ceiling is unset — the mechanism ships before its number', () => {
    const unset = [{ ...budget[0], perPoint: { maxWords: 0, why: 'not measured yet' } }]
    const text = order(point(11, 500))
    expect(evaluateDocBudgets([{ path: 'TASKS.md', text }], unset).block).toBe(false)
  })

  it('does not split on a COLUMN-ZERO checkbox inside an INDENTED fence', () => {
    // Both halves matter and the first version of this case had neither: the specimen
    // must sit at column zero (an indented one START ignores anyway, so the test would
    // pass without any fence tracking), and the fence must be indented, which is what
    // the work order actually writes and what a column-zero-only rule let through.
    const text = order(
      '- [ ] 11. ' + Array.from({ length: 12 }, (_, i) => 'w' + i).join(' '),
      '  It prints this remedy:',
      '   ```',
      '- [ ] 99. a specimen line that only looks like a point',
      '   ```',
      '  and then says one more thing here',
    )
    const points = workOrderPoints(text)
    expect(points.map((p) => p.number)).toEqual([11])
    expect(evaluateDocBudgets([{ path: 'TASKS.md', text }], budget).block).toBe(true)
  })

  it('needs a closer at least as long as its opener, so a shorter run does not end the block', () => {
    const points = workOrderPoints(
      order('- [ ] 11. one', '````', '```', '- [ ] 12. still inside the longer fence', '````', '- [ ] 13. out'),
    )
    expect(points.map((p) => p.number)).toEqual([11, 13])
  })

  it('does not let a run with text after it close a block', () => {
    const points = workOrderPoints(
      order('- [ ] 11. one', '```', '``` still an info line', '- [ ] 12. inside', '```', '- [ ] 13. out'),
    )
    expect(points.map((p) => p.number)).toEqual([11, 13])
  })

  it('closes a fence only with its own marker, so a tilde never ends a backtick block', () => {
    const points = workOrderPoints(
      order('- [ ] 11. one', '```', '~~~', '- [ ] 12. still inside the backtick fence', '```', '- [ ] 13. out'),
    )
    expect(points.map((p) => p.number)).toEqual([11, 13])
  })

  it('REFUSES a ceiling that is not a whole number of words instead of switching itself off', () => {
    for (const bad of [-1, 12.5, '20', Number.NaN, undefined]) {
      const broken = [{ ...budget[0], perPoint: { maxWords: bad, why: 'typo' } }]
      const verdict = evaluateDocBudgets([{ path: 'TASKS.md', text: order(point(11, 5)) }], broken)
      expect(verdict.block, `${String(bad)} must refuse`).toBe(true)
      expect(verdict.findings[0].kind).toBe('per-point ceiling is not a whole number of words')
    }
  })


  it('REFUSES a declared ceiling whose field is missing or misspelled', () => {
    for (const perPoint of [{}, { maxWord: 20, why: 'typo' }, { why: 'no number at all' }]) {
      const broken = [{ ...budget[0], perPoint }]
      const verdict = evaluateDocBudgets([{ path: 'TASKS.md', text: order(point(11, 5)) }], broken)
      expect(verdict.block, JSON.stringify(perPoint) + ' must refuse').toBe(true)
      expect(verdict.findings[0].kind).toBe('per-point ceiling is not a whole number of words')
    }
  })

  it('REFUSES an explicit null block, which is a declaration and not an absence', () => {
    const broken = [{ ...budget[0], perPoint: null }]
    const verdict = evaluateDocBudgets([{ path: 'TASKS.md', text: order(point(11, 5)) }], broken)
    expect(verdict.block).toBe(true)
    expect(verdict.findings[0].kind).toBe('per-point ceiling is not a whole number of words')
  })

  it('does not let a non-breaking space behind a fence close the block', () => {
    const points = workOrderPoints(
      order('- [ ] 11. one', '```', '```\u00a0', '- [ ] 12. inside', '```', '- [ ] 13. out'),
    )
    expect(points.map((p) => p.number)).toEqual([11, 13])
  })

  it('lets spaces and tabs behind a closing run close it, as CommonMark does', () => {
    const points = workOrderPoints(order('- [ ] 11. one', '```', '- [ ] 12. inside', '``` \t ', '- [ ] 13. out'))
    expect(points.map((p) => p.number)).toEqual([11, 13])
  })

  it('judges nothing when no per-point block is declared at all', () => {
    const none = [{ ...budget[0], perPoint: undefined }]
    expect(evaluateDocBudgets([{ path: 'TASKS.md', text: order(point(11, 500)) }], none).block).toBe(false)
  })

  it('measures the WHOLE file per point, not only the part before the preamble marker', () => {
    // The preamble budget stops at the Checklist heading; the point ceiling must not,
    // or it would judge no point at all.
    const text = order(point(11, 40))
    expect(evaluateDocBudgets([{ path: 'TASKS.md', text }], budget).block).toBe(true)
  })
})
