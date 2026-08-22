// The document-budget guard's decision core (user 26.07.2026), plus the real
// files: the point of the budgets is that they hold TODAY, so the shipped
// documents are measured here rather than only synthetic ones.
import { beforeEach, describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOC_BUDGETS,
  measure,
  evaluateDocBudgets,
  fenceTracker,
  withoutCodeSpans,
  formatDocBudgetVerdict,
  proseRationaleFindings,
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
  const budgets = [{ path: 'X.md', maxLines: 3, maxWords: 5, slackWords: 5, why: 'because' }]

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
      [{ path: 'MEMORY.md', maxLines: 4, maxWords: 20, slackWords: 20, maxEntryWords: 4, why: 'hook only' }],
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

describe('the ratchet — headroom cannot be banked', () => {
  // ONE ceiling, THREE sizes: the point of the ratchet is that both directions refuse.
  const budgets = [{ path: 'X.md', maxLines: 999, maxWords: 100, slackWords: 10, why: 'read constantly' }]
  const doc = (words) => ({ path: 'X.md', text: Array.from({ length: words }, (_, i) => 'w' + i).join(' ') })

  it('refuses a document ABOVE its ceiling, exactly as it always did', () => {
    const v = evaluateDocBudgets([doc(101)], budgets)
    expect(v.block).toBe(true)
    expect(v.findings.map((f) => f.kind)).toEqual(['words'])
  })

  it('refuses a document more than the slack BELOW its ceiling, and says to lower it', () => {
    const v = evaluateDocBudgets([doc(89)], budgets)
    expect(v.block).toBe(true)
    expect(v.findings.map((f) => f.kind)).toEqual(['headroom'])
    expect(v.findings[0].actual).toBe('11 words below its ceiling of 100')
    expect(v.findings[0].budget).toBe('at most 10')
    expect(formatDocBudgetVerdict(v)).toContain('LOWER THE CEILING TO WHAT YOU ACHIEVED')
  })

  it('passes a document inside the slack, at both ends of it', () => {
    expect(evaluateDocBudgets([doc(100)], budgets).block).toBe(false)
    expect(evaluateDocBudgets([doc(90)], budgets).block).toBe(false)
  })

  it('reads the slack PER DOCUMENT rather than deriving it from the size', () => {
    // Same text, same ceiling, different declared slack — only the declaration decides.
    const generous = [{ ...budgets[0], slackWords: 40 }]
    expect(evaluateDocBudgets([doc(70)], generous).block).toBe(false)
    expect(evaluateDocBudgets([doc(70)], budgets).block).toBe(true)
    // And a ceiling ten times the size does not grant ten times the slack: a fraction
    // would let the big document drift while the small one could not.
    const big = [{ ...budgets[0], maxWords: 1000, slackWords: 10 }]
    expect(evaluateDocBudgets([{ path: 'X.md', text: doc(989).text }], big).block).toBe(true)
  })

  it('refuses a budget that declares no usable slack, rather than switching the ratchet off', () => {
    for (const slackWords of [undefined, null, -1, 12.5, '10', NaN]) {
      const broken = [{ ...budgets[0], slackWords }]
      const v = evaluateDocBudgets([doc(100)], broken)
      expect(v.block, String(slackWords) + ' must refuse').toBe(true)
      expect(v.findings[0].kind).toBe('ratchet slack is not a whole number of words')
    }
  })

  it('reports the outgrown ceiling ALONE when the document is over it', () => {
    // A document above its ceiling is not also "too far below" it — one refusal, one remedy.
    const v = evaluateDocBudgets([doc(200)], budgets)
    expect(v.findings.map((f) => f.kind)).toEqual(['words'])
  })

  it('every shipped budget declares a slack, so no document can quietly stop ratcheting', () => {
    for (const budget of DOC_BUDGETS) {
      expect(Number.isInteger(budget.slackWords), budget.path + ' declares no slackWords').toBe(true)
      expect(budget.slackWords, budget.path).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('fenceTracker — one CommonMark fence rule for both readers', () => {
  const run = (lines) => lines.map((l) => { const t = track.next(l); return `${t.furniture ? 'F' : '.'}${t.open ? 'O' : '.'}` })
  let track
  beforeEach(() => { track = fenceTracker() })

  it('opens and closes on a symmetric run', () => {
    expect(run(['```', 'x', '```', 'y'])).toEqual(['FO', '.O', 'F.', '..'])
  })

  it('does not close a longer opener with a shorter run', () => {
    expect(run(['````', '```', 'still inside', '````'])).toEqual(['FO', 'FO', '.O', 'F.'])
  })

  it('does not let a tilde close a backtick block', () => {
    expect(run(['```', '~~~', '```'])).toEqual(['FO', 'FO', 'F.'])
  })

  it('refuses a backtick opener whose info string carries a backtick', () => {
    // It opens nothing AND it is not furniture: it is an ordinary prose line (round 2).
    expect(run(['``` a`b', 'not code'])).toEqual(['..', '..'])
  })

  it('allows only spaces and tabs behind a closing run', () => {
    expect(run(['```', '``` and a word', '```  \t'])).toEqual(['FO', 'FO', 'F.'])
  })

  it('does not call a refused backtick opener furniture — it is prose', () => {
    // ```lang ` … is not a fence, so it must be READ, not skipped (round 2).
    expect(run(['``` a`b because it argues'])).toEqual(['..'])
  })

  it('is total on missing input', () => {
    expect(fenceTracker().next(undefined)).toEqual({ furniture: false, open: false })
  })
})

describe('proseRationaleFindings — the file instructs, it does not argue', () => {
  const find = (text) => proseRationaleFindings(text, { path: 'CLAUDE.md', why: 'read every turn' })

  it('reports an ARGUING line', () => {
    const v = find('- Push after every commit, because a session that dies takes the tree with it.')
    expect(v).toHaveLength(1)
    expect(v[0].kind).toContain('prose rationale (line 1')
    expect(v[0].kind).toContain('because')
  })

  it('does NOT report the instructing form of the same rule', () => {
    expect(find('- Push after every commit; report a failed push.')).toEqual([])
  })

  it('reports each of the argument constructions it watches for', () => {
    const arguing = [
      'The reason for the tier map is the cost of a browser run.',
      'That is why the branch ends at the merge.',
      'This guard exists to stop the file growing back.',
      'The ceiling is tight so that nobody banks headroom.',
      'Historically the work order held finished points.',
      'We learned this from the 434k session.',
      'It turned out the guard hung in no chain.',
      'The archive used to hold open points.',
      'The floor, measured 20.08.2026, stood at 58,000 tokens.',
    ]
    for (const line of arguing) expect(find(line), line).toHaveLength(1)
  })

  it('leaves a contrast between two instructions alone — "rather than" is not an argument', () => {
    expect(find('- Use TSL rather than raw GLSL/WGSL; do not make game behavior Chrome-only.')).toEqual([])
  })

  it('ignores fenced blocks and inline code, which are commands and not prose', () => {
    expect(find('```\nnode scripts/x.mjs --because\n```\n')).toEqual([])
    expect(find('- Run `git commit --because-flag` before pushing.')).toEqual([])
  })

  it('reports one finding per line, at the first marker, and names the line number', () => {
    const v = find('fine line\n- It exists to explain, because it argues twice.')
    expect(v).toHaveLength(1)
    expect(v[0].kind).toContain('line 2')
  })

  // ROUND 1 OF THE CROSS-VENDOR REVIEW found all three of these, each a false result
  // out of a shortcut: an asymmetric fence, a longer code-span delimiter, and an
  // adverb between "exists" and its purpose.
  it('does not let an inner ``` close a four-backtick block, in either direction', () => {
    const text = [
      '````',
      'node x --because',
      '```',
      'still inside the block, because a shorter run does not close it',
      '````',
      '- a clean rule',
    ].join('\n')
    expect(find(text)).toEqual([])
  })

  it('reads the prose AFTER a fence closes, rather than swallowing it', () => {
    const v = find(['```', 'code because code', '```', '- The reason is written here.'].join('\n'))
    expect(v).toHaveLength(1)
    expect(v[0].kind).toContain('line 4')
  })

  it('blanks a code span of ANY delimiter length, not only one backtick', () => {
    expect(find('- Run ``git commit --because-flag`` before pushing.')).toEqual([])
    expect(find('- Run ```x --because``` first.')).toEqual([])
  })

  it('leaves an unclosed backtick run alone instead of swallowing the line', () => {
    expect(find('- The reason is a stray ` backtick.')).toHaveLength(1)
  })

  it('reads a line whose backtick run opens no fence', () => {
    expect(find('``` a`b because it argues')).toHaveLength(1)
  })

  it('closes a code span only on a run of the SAME length', () => {
    // A two-backtick opener is not closed by the first two of a three-backtick run, so
    // the text between them was never code and is read (round 2).
    expect(find('- Run ``--because``` here.')).toHaveLength(1)
    expect(find('- Run ``--because`` here.')).toEqual([])
  })

  it('lets a LONGER run stand inside a valid span, which is what it is for', () => {
    // ``cmd ``` --because`` is one two-backtick span; a matcher that cannot traverse the
    // three-backtick run inside it leaves the code exposed as prose (round 3).
    expect(find('- Run ``cmd ``` --because`` here.')).toEqual([])
    expect(withoutCodeSpans('a ``x ``` y`` b')).toBe('a             b')
  })

  it('leaves an unmatched opener literal and still finds the span after it', () => {
    expect(withoutCodeSpans('``a `b` c')).toBe('``a     c')
  })

  it('keeps its offsets in code UNITS, so an astral character does not slide the blanking', () => {
    // matchAll reports UTF-16 offsets; indexing a code-point array with them moved the
    // span left by one per emoji and erased the prose behind it (round 4).
    expect(withoutCodeSpans('🐘🐘 `safe` because')).toBe('🐘🐘        because')
    expect(find('- 🐘🐘 `--because` is a flag.')).toEqual([])
    expect(find('- 🐘🐘 `flag` because it is slow.')).toHaveLength(1)
  })

  it('leaves a binding condition alone — only an ADVERB may stand before the purpose', () => {
    expect(find('If the lock exists and belongs to the session, keep it.')).toEqual([])
    expect(find('Keep the record where it exists and points to a live branch.')).toEqual([])
  })

  it('catches an adverb between the verb and its purpose', () => {
    for (const line of [
      'This guard exists only to stop headroom being banked.',
      'The ceiling exists purely because the file grew back.',
      'It exists to be lowered.',
    ]) {
      expect(find(line), line).toHaveLength(1)
    }
  })

  // NOT A MISS BUT THE RULE: binding text carrying its own argument is still argument
  // in this document, and the rewrite is one line ("…; slowness is not a reason").
  it('reports an INSTRUCTION that carries its own argument', () => {
    expect(find('- Never skip a required test because it is slow.')).toHaveLength(1)
    expect(find('- Never skip a required test; slowness is not a reason.')).toEqual([])
  })

  it('is total on missing input', () => {
    expect(proseRationaleFindings(undefined)).toEqual([])
  })

  it('is wired into the budget only for the document that declares it', () => {
    const arguing = { path: 'X.md', text: 'a rule, because of a reason' }
    const watched = [{ path: 'X.md', maxLines: 9, maxWords: 9, slackWords: 9, noProseRationale: true, why: 'w' }]
    const unwatched = [{ path: 'X.md', maxLines: 9, maxWords: 9, slackWords: 9, why: 'w' }]
    expect(evaluateDocBudgets([arguing], watched).block).toBe(true)
    expect(evaluateDocBudgets([arguing], unwatched).block).toBe(false)
  })

  it('is declared for CLAUDE.md, the document the user named', () => {
    expect(DOC_BUDGETS.find((b) => b.path === 'CLAUDE.md').noProseRationale).toBe(true)
  })
})

describe('formatDocBudgetVerdict', () => {
  it('says nothing when everything fits', () => {
    expect(formatDocBudgetVerdict({ block: false, findings: [] })).toBe('')
  })

  it('names the file, the numbers and BOTH ways out', () => {
    const text = formatDocBudgetVerdict(
      evaluateDocBudgets([{ path: 'X.md', text: 'a b c\nd e f\ng h i\nj k l\n' }], [
        { path: 'X.md', maxLines: 3, maxWords: 5, slackWords: 5, why: 'because' },
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
      slackWords: 9999,
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
