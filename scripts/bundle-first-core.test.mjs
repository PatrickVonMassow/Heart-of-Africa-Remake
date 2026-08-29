// Decision-logic sweep of the bundle-first Stop-hook guard (bundle-first-core):
// a point placed in a bundle passes, one placed nowhere blocks, one on the
// "Not bundled" list passes, and every fail-open exit allows. The last case is
// the one the point was written for — the membership is reconciled against the
// FULL open set, so a point that silently LEFT a bundle is caught by the same
// comparison as one that never joined.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'
import { parseOpenPoints } from './queue-order-guard-core.mjs'
import {
  BUNDLES_HEADING,
  UNBUNDLED_MARKER,
  referenceList,
  parseBundles,
  parseUnbundled,
  unplacedPoints,
  duplicateHomes,
  statusLine,
  evaluate,
} from './bundle-first-core.mjs'

/** The real document's shape, so a fixture cannot drift away from it. */
function workPackages({ bundles = [['Dorfleben', 'A', '#350, #351']], unbundled = ['- **#285** — the leak hunt.'] } = {}) {
  const rows = bundles.map(([name, id, points]) => `| **${name}** | ${id} | What it is | ${points} |`).join('\n')
  return `# Work packages (bundles)

Prose above the table, mentioning 30.07.2026 and point 471.

${BUNDLES_HEADING}

| Name | Id | What it is | Points |
|---|---|---|---|
${rows}

${UNBUNDLED_MARKER}, each for its own reason:

${unbundled.join('\n')}

## Order of work

Kommunikation first.
`
}

const tasks = (open, done = []) =>
  [...open.map((n) => `- [ ] ${n}. Open point ${n}.`), ...done.map((n) => `- [x] ${n}. Done point ${n}.`)].join('\n')

describe('referenceList — the cell marks its references', () => {
  it('reads the marked numbers and nothing else', () => {
    expect(referenceList('#350, #351, #394 (the rest landed 30.07.2026 — 308, 410)')).toEqual([350, 351, 394])
    expect(referenceList('#958, #1000, #1002')).toEqual([958, 1000, 1002])
    expect(referenceList('  #442 #443\t#450 ')).toEqual([442, 443, 450])
    expect(referenceList('')).toEqual([])
    expect(referenceList(null)).toEqual([])
  })

  // THE THREE SHAPES THE FOUR REFUSED ROUNDS COULD NOT SETTLE (point 1003): a
  // date, a four-digit quantity, and a number standing in front of a month name.
  // None of them carries the marker, so none of them is read — and the reader
  // needs neither a strip list nor a digit bound to say so.
  it('reads nothing out of the prose, wherever the prose stands', () => {
    const cell = '#884, #1002 (measured 2026-08-28 and on 24. August 2026: the header ran 1440 px wide, ' +
      'and 97 August 2026 named nothing — see 999 and point 2026)'
    expect(referenceList(cell)).toEqual([884, 1002])
  })

  // A LEADING LIST WOULD NOT HAVE BEEN ENOUGH (fifth-round review finding): a
  // cell that OPENS with a date or a measurement opens with digits, and a
  // position-based reader places 2026, 30 and 1440 out of them.
  it('places nothing for a cell that opens with a date or a measurement', () => {
    expect(referenceList('2026-08-28 — the day the reader was widened')).toEqual([])
    expect(referenceList('30.07.2026 the scheme was cut')).toEqual([])
    expect(referenceList('1440 px wide, measured on the wide zoom')).toEqual([])
  })

  // NO DIGIT CEILING (the reason the reader was widened in the first place): a
  // reference is the marker and any run of digits, of any length.
  it('has neither a digit bound nor a date filter left', () => {
    expect(referenceList('#7, #42, #999, #1000, #12345')).toEqual([7, 42, 999, 1000, 12345])
    expect(referenceList('#2026, #1900 — years that really are point numbers')).toEqual([2026, 1900])
  })

  // A RUN OF DIGITS IS ONLY A REFERENCE WHILE IT SURVIVES BEING A NUMBER
  // (round-eleven review finding): past 2^53 two different runs collapse onto
  // the same value, and two references reading as one point would be reported
  // as a point standing in two homes.
  it('drops a digit run no number can spell back, and keeps every one it can', () => {
    // 2^53 converts exactly and stays a reference; 2^53+1 does not and would
    // have aliased onto it.
    expect(referenceList('#9007199254740992')).toEqual([9007199254740992])
    expect(referenceList('#9007199254740993, #350')).toEqual([350])
    expect(referenceList('#9007199254740991')).toEqual([9007199254740991])
    // A leading zero is a spelling of the same number, not a different one.
    expect(referenceList('#0350')).toEqual([350])
    // And so is exponential notation: past 10^21 a number spells ITSELF
    // differently, which is no reason to lose a reference that converts
    // exactly (round-thirteen review finding).
    expect(referenceList('#1000000000000000000000')).toEqual([1e21])
    // A run too long to be any integer is not a reference at all.
    expect(referenceList(`#${'9'.repeat(400)}`)).toEqual([])
  })

  it('reads no half-marked or embedded number', () => {
    expect(referenceList('a#350')).toEqual([])
    expect(referenceList('#350a')).toEqual([])
    expect(referenceList('##350')).toEqual([])
    expect(referenceList('the points are 350 and 351')).toEqual([])
  })

  // THE MARKER OPENS ONLY WHERE A REFERENCE CAN OPEN (review findings). Every
  // Markdown shape that carries a `#` and is not a reference, beside the ones
  // that are.
  it('reads a reference in every place one may stand', () => {
    expect(referenceList('#123')).toEqual([123])
    expect(referenceList('#123, #124 #125')).toEqual([123, 124, 125])
    expect(referenceList('**#123**, __#124__, *#125*, (#126), [#127]')).toEqual([123, 124, 125, 126, 127])
    expect(referenceList('- #285 — the leak hunt.')).toEqual([285])
    expect(referenceList('#393.')).toEqual([393])
  })

  it('reads none of the Markdown shapes that merely carry a hash', () => {
    expect(referenceList('a brace written as &#123; in the cell')).toEqual([])
    expect(referenceList('see [the section](#123) for the reason')).toEqual([])
    expect(referenceList('https://example.com/page#123')).toEqual([])
    expect(referenceList('a code span `#123` in the prose')).toEqual([])
    expect(referenceList('an escaped \\#123')).toEqual([])
    expect(referenceList('a#350')).toEqual([])
    expect(referenceList('#350a')).toEqual([])
    expect(referenceList('##350')).toEqual([])
  })
})

describe('parseBundles', () => {
  it('reads the table rows and skips the header and separator by shape', () => {
    const bundles = parseBundles(
      workPackages({
        bundles: [
          ['Dorfleben', 'A', '#350, #351, #356'],
          ['Modell & Wächter', 'J', '#432, #437 — the rest landed 30.07.2026 (298, 306)'],
        ],
      }),
    )
    expect(bundles.map((b) => b.id)).toEqual(['A', 'J'])
    expect(bundles[0].name).toBe('Dorfleben')
    // 298 and 306 stand unmarked in the PROSE, so they are not members of this
    // bundle: the marker is what places a point (point 1003).
    expect([...bundles[1].points].sort((a, b) => a - b)).toEqual([432, 437])
  })

  it('returns nothing when the bundles heading is absent', () => {
    expect(parseBundles('# Work packages\n\nno table here')).toEqual([])
    expect(parseBundles(null)).toEqual([])
  })

  it('stops at the "Not bundled" marker, so an exemption is never read as a bundle', () => {
    const bundles = parseBundles(workPackages({ unbundled: ['- **184, 200** — the big audits.'] }))
    expect(bundles).toHaveLength(1)
    expect([...bundles[0].points]).toEqual([350, 351])
  })
})

describe('parseUnbundled', () => {
  it('reads each bullet with the reason beside it', () => {
    const { points, bullets } = parseUnbundled(
      workPackages({ unbundled: ['- **#184, #200, #203** — the big audits.', '- **#174** — a release.'] }),
    )
    expect([...points].sort((a, b) => a - b)).toEqual([174, 184, 200, 203])
    expect(bullets[0].reason).toBe('the big audits.')
  })

  it('accepts a bare listing — the section heading carries the reasons', () => {
    const { points } = parseUnbundled(workPackages({ unbundled: ['- **#285**.'] }))
    expect([...points]).toEqual([285])
  })

  it('reads a bullet whose markers are not bold, so a plainly written exemption is not drift', () => {
    const { points, bullets } = parseUnbundled(
      workPackages({ unbundled: ['- #285 — the leak hunt.', '- #174, #224 — releases.', '- #393.'] }),
    )
    expect([...points].sort((a, b) => a - b)).toEqual([174, 224, 285, 393])
    expect(bullets[0].reason).toBe('the leak hunt.')
    expect(bullets[2].reason).toBe('')
  })

  it('passes a point exempted in the plain spelling', () => {
    const wp = workPackages({ bundles: [['Dorfleben', 'A', '#350']], unbundled: ['- #285 — the leak hunt.'] })
    expect(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: wp }).block).toBe(false)
  })

  // THE EXEMPTION BULLET IS PROSE TOO (round-ten review finding): the bundle
  // cells were proved against dates, quantities and code spans, the exemption
  // reasons never were — and they run through the SAME reader, so a regression
  // confined to them would have gone unseen. A number the reason merely
  // mentions may not exempt a point from its bundle.
  it('reads nothing out of an exemption REASON, whatever the reason contains', () => {
    const { points, bullets } = parseUnbundled(
      workPackages({
        unbundled: [
          '- **#285** — measured 2026-08-28 at 1440 px over 96 files; `#350` is a code span and 471 is prose.',
        ],
      }),
    )
    expect([...points]).toEqual([285])
    expect(bullets[0].points).toEqual([285])
  })

  // EVERY MARKDOWN BULLET MARKER (round-thirteen review finding): a `+` bullet
  // or one indented under the paragraph is a list item like any other, and one
  // the reader does not see is an exemption that does not count and a numbering
  // that has shifted.
  it('reads a `+`, a `*` and an indented bullet, and numbers them where they stand', () => {
    const { points, bullets } = parseUnbundled(
      workPackages({
        unbundled: ['+ **#285** — the leak hunt.', '* **#512** — the asterisk.', '  - **#393**.', '- **#174** — a release.'],
      }),
    )
    expect([...points].sort((a, b) => a - b)).toEqual([174, 285, 393, 512])
    expect(bullets.map((b) => b.index)).toEqual([1, 2, 3, 4])
  })

  // A MARKER ALONE ON ITS LINE stays unread, and that is the SAFE direction:
  // the reader places nothing, so the points under it are reported as unplaced
  // and the guard BLOCKS. Nothing hides — a reader is sent to look
  // (round-thirteen review finding; the shape itself is point 1004's).
  it('reads nothing from a bullet whose marker stands alone on its line', () => {
    const md = workPackages({ unbundled: ['-', '  **#285** — the leak hunt.'] })
    expect(parseUnbundled(md).points.size).toBe(0)
    expect(evaluate({ tasksMd: tasks([285]), workPackagesMd: md }).block).toBe(true)
  })

  it('ignores a prose bullet that starts with no number', () => {
    const { points } = parseUnbundled(workPackages({ unbundled: ['- **Urlaubsfestigkeit** was cut later.'] }))
    expect(points.size).toBe(0)
  })

  it('is empty when the marker is absent', () => {
    expect(parseUnbundled('nothing here').points.size).toBe(0)
  })
})

describe('unplacedPoints', () => {
  it('subtracts both the bundles and the exemptions', () => {
    const bundles = [{ points: new Set([350, 351]) }]
    expect(unplacedPoints(new Set([350, 351, 285, 999]), bundles, new Set([285]))).toEqual([999])
  })

  it('tolerates missing arguments', () => {
    expect(unplacedPoints(null, null, null)).toEqual([])
  })
})

// THE OTHER HALF OF "EXACTLY ONCE" (round-ten review finding). `unplacedPoints`
// unions the memberships and can therefore only see a point with NO home; these
// cases are the ones it cannot see.
describe('duplicateHomes', () => {
  it('names a point standing in two bundle rows, and where it stands', () => {
    const bundles = [{ id: 'A', points: new Set([350, 351]) }, { id: 'J', points: new Set([351]) }]
    expect(duplicateHomes(new Set([350, 351]), bundles, new Set())).toEqual([{ point: 351, homes: ['A', 'J'] }])
  })

  it('names a point standing in a bundle AND in the exemption list', () => {
    const bundles = [{ id: 'A', points: new Set([285]) }]
    expect(duplicateHomes(new Set([285]), bundles, new Set([285]))).toEqual([
      { point: 285, homes: ['A', 'Not bundled'] },
    ])
  })

  it('says nothing about a CLOSED point named twice — only the open set is the measure', () => {
    const bundles = [{ id: 'A', points: new Set([200]) }, { id: 'J', points: new Set([200]) }]
    expect(duplicateHomes(new Set([350]), bundles, new Set([200]))).toEqual([])
  })

  it('reads two rows carrying the SAME id as two homes, and says which row', () => {
    const bundles = [
      { id: 'A', points: new Set([350]), list: [350] },
      { id: 'A', points: new Set([350]), list: [350] },
    ]
    expect(duplicateHomes(new Set([350]), bundles, new Set())).toEqual([
      { point: 350, homes: ['A (row 1)', 'A (row 2)'] },
    ])
  })

  it('counts the ENTRY, not the sighting — a repeat inside one home is one home', () => {
    const bundles = [{ id: 'A', points: new Set([350]), list: [350, 350] }]
    expect(duplicateHomes(new Set([350]), bundles, new Set())).toEqual([])
    const bullets = { points: new Set([285]), bullets: [{ index: 1, points: [285, 285] }] }
    expect(duplicateHomes(new Set([285]), [], bullets)).toEqual([])
  })

  it('tolerates missing arguments', () => {
    expect(duplicateHomes(null, null, null)).toEqual([])
  })
})

describe('evaluate — the rule', () => {
  const wp = workPackages({
    bundles: [
      ['Dorfleben', 'A', '#350, #351'],
      ['Modell & Wächter', 'J', '#432, #437'],
    ],
    unbundled: ['- **#285** — the leak hunt, it sweeps the whole codebase.'],
  })

  it('passes an appended point that joined a bundle', () => {
    expect(evaluate({ tasksMd: tasks([350, 437]), workPackagesMd: wp }).block).toBe(false)
  })

  it('BLOCKS an appended point that joined nothing, and names it with the remedy', () => {
    const v = evaluate({ tasksMd: tasks([350, 540]), workPackagesMd: wp })
    expect(v.block).toBe(true)
    expect(v.missing).toEqual([540])
    expect(v.reason).toMatch(/540/)
    expect(v.reason).toMatch(/bundle-first-not-new-point/)
    expect(v.reason).toMatch(/Not bundled/)
  })

  it('passes a point on the "Not bundled" list', () => {
    expect(evaluate({ tasksMd: tasks([285]), workPackagesMd: wp }).block).toBe(false)
  })

  it('catches a point that silently LEFT a bundle — the full open set is reconciled', () => {
    // 351 is open and was in bundle A; the scheme no longer mentions it.
    const shrunk = workPackages({ bundles: [['Dorfleben', 'A', '#350']], unbundled: ['- **#285**.'] })
    const v = evaluate({ tasksMd: tasks([350, 351]), workPackagesMd: shrunk })
    expect(v.block).toBe(true)
    expect(v.missing).toEqual([351])
  })

  it('ignores CLOSED and DEFERRED points — only the open set is the measure', () => {
    const md = tasks([350], [900]) + '\n- [ ] 901. Parked DEFERRED until the tag.'
    expect(evaluate({ tasksMd: md, workPackagesMd: wp }).block).toBe(false)
  })

  it('BLOCKS a point standing in two bundle rows, and names both homes', () => {
    const twice = workPackages({
      bundles: [['Dorfleben', 'A', '#350, #351'], ['Modell & Wächter', 'J', '#351']],
      unbundled: ['- **#285**.'],
    })
    const v = evaluate({ tasksMd: tasks([350, 351, 285]), workPackagesMd: twice })
    expect(v.block).toBe(true)
    expect(v.missing).toEqual([])
    expect(v.duplicates).toEqual([{ point: 351, homes: ['A', 'J'] }])
    expect(v.reason).toMatch(/351 \(A and J\)/)
    expect(v.reason).toMatch(/EXACTLY once/)
  })

  it('BLOCKS a point that is both bundled and exempted', () => {
    const both = workPackages({
      bundles: [['Dorfleben', 'A', '#350, #285']],
      unbundled: ['- **#285** — the leak hunt.'],
    })
    const v = evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: both })
    expect(v.block).toBe(true)
    expect(v.duplicates).toEqual([{ point: 285, homes: ['A', '"Not bundled" bullet 1'] }])
    expect(v.reason).toMatch(/285 \(A and "Not bundled" bullet 1\)/)
  })

  // EVERY OCCURRENCE, NOT EVERY CONTAINER (round-eleven review finding). The
  // exemption section used to be read as one union, so a point written into two
  // bullets counted as one placement and the message could not say which two
  // entries to look at.
  it('numbers an exemption entry where it stands, not among the ones that parsed', () => {
    const withProse = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **Urlaubsfestigkeit** was cut later and lists nothing.', '- **#285**.', '- **#285** again.'],
    })
    const v = evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: withProse })
    expect(v.block).toBe(true)
    expect(v.duplicates).toEqual([
      { point: 285, homes: ['"Not bundled" bullet 2', '"Not bundled" bullet 3'] },
    ])
  })

  it('BLOCKS a point written into TWO exemption bullets, naming both', () => {
    const twice = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **#285** — the leak hunt.', '- **#393**.', '- **#285** — filed again by another session.'],
    })
    const v = evaluate({ tasksMd: tasks([350, 285, 393]), workPackagesMd: twice })
    expect(v.block).toBe(true)
    expect(v.missing).toEqual([])
    expect(v.duplicates).toEqual([
      { point: 285, homes: ['"Not bundled" bullet 1', '"Not bundled" bullet 3'] },
    ])
    expect(v.reason).toMatch(/bullet 1 and "Not bundled" bullet 3/)
  })

  // A REPEAT INSIDE ONE ENTRY IS NOT A SECOND HOME (round-fifteen review
  // finding). Counting sightings rather than entries made `#350, #350` in one
  // cell block a document whose point has exactly one home — the guard
  // blocking on a formatting nicety instead of on the drift it exists to catch.
  it('passes a point written twice into the SAME bundle cell — one entry is one home', () => {
    const twice = workPackages({
      bundles: [['Dorfleben', 'A', '#350, #351, #350']],
      unbundled: ['- **#285**.'],
    })
    expect(evaluate({ tasksMd: tasks([350, 351, 285]), workPackagesMd: twice })).toMatchObject({
      block: false,
      checked: true,
    })
  })

  it('passes a point named twice inside ONE exemption bullet', () => {
    const twice = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **#285**, and #285 again in the same reason.'],
    })
    expect(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: twice }).block).toBe(false)
  })

  it('reports an unplaced point and a doubled one in the SAME verdict', () => {
    const twice = workPackages({
      bundles: [['Dorfleben', 'A', '#350, #351'], ['Modell & Wächter', 'J', '#351']],
      unbundled: ['- **#285**.'],
    })
    const v = evaluate({ tasksMd: tasks([350, 351, 285, 999]), workPackagesMd: twice })
    expect(v.block).toBe(true)
    expect(v.missing).toEqual([999])
    expect(v.duplicates).toEqual([{ point: 351, homes: ['A', 'J'] }])
    expect(v.reason).toMatch(/999/)
    expect(v.reason).toMatch(/351 \(A and J\)/)
  })

  it('truncates a long list instead of printing a wall', () => {
    const many = Array.from({ length: 60 }, (_, i) => 600 + i)
    const v = evaluate({ tasksMd: tasks(many), workPackagesMd: wp })
    expect(v.block).toBe(true)
    expect(v.missing).toHaveLength(60)
    expect(v.reason).toMatch(/… and 20 more/)
  })
})

describe('evaluate — the fail-open exits', () => {
  // A FAIL-OPEN PINS BOTH HALVES OF THE DECISION (round-eighteen review
  // finding): asserting only `block` lets a fail-open regress to
  // `{ block: false, checked: true }`, where `statusLine` then reports the
  // invariant as MEASURED on a document nothing measured.
  const failsOpen = (result) => expect({ block: result.block, checked: result.checked }).toEqual({
    block: false,
    checked: false,
  })

  // A FAIL-OPEN SAYS SO (round-fourteen review finding). Every exit below
  // returns the same DECISION as a clean document, and `--status` reported the
  // invariant as verified for all of them; `checked` is what tells the two
  // apart, so it is asserted beside the decision rather than on its own.
  it('marks every allowed-without-judging exit as NOT checked', () => {
    const renamed = workPackages({ bundles: [['Dorfleben', 'A', '#350']] }).replace(BUNDLES_HEADING, '## The packages')
    for (const inputs of [
      { tasksMd: tasks([540]), workPackagesMd: '' },
      { tasksMd: tasks([350, 285]), workPackagesMd: renamed },
      { tasksMd: '', workPackagesMd: workPackages() },
      // The other half-restructure: the rows parse, the exemption marker was
      // renamed (round-fifteen review finding — this shape was allowed but
      // never asserted as unjudged).
      {
        tasksMd: tasks([350, 285]),
        workPackagesMd: workPackages({ bundles: [['Dorfleben', 'A', '#350']] }).replace(
          UNBUNDLED_MARKER,
          '**Deliberately outside a bundle**',
        ),
      },
      // And a table whose rows no longer have the table's shape.
      {
        tasksMd: tasks([350, 351]),
        workPackagesMd: workPackages({ bundles: [['Dorfleben', 'A', '#350']] }).replace(
          '| **Dorfleben** | A |',
          '- **Dorfleben** (A):',
        ),
      },
    ]) {
      const v = evaluate(inputs)
      expect(v.block, JSON.stringify(inputs).slice(0, 60)).toBe(false)
      expect(v.checked, JSON.stringify(inputs).slice(0, 60)).toBe(false)
    }
    // And a document it really did read reports the opposite.
    const clean = workPackages({ bundles: [['Dorfleben', 'A', '#350']], unbundled: ['- **#285**.'] })
    expect(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: clean })).toMatchObject({
      block: false,
      checked: true,
    })
  })

  it('allows an unreadable or absent work-packages file', () => {
    for (const inputs of [
      { tasksMd: tasks([540]), workPackagesMd: '' },
      { tasksMd: tasks([540]) },
      { tasksMd: tasks([540]), workPackagesMd: null },
    ]) {
      // `checked` beside the decision (round-seventeen review finding): these
      // exits allow WITHOUT judging, and a regression that reported them as
      // judged would make statusLine claim the invariant here.
      expect(evaluate(inputs), JSON.stringify(inputs)).toMatchObject({ block: false, checked: false })
    }
  })

  it('allows the OTHER half-restructure — the exemptions parse, the table heading does not', () => {
    const renamed = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **#285** — the leak hunt.'],
    }).replace(BUNDLES_HEADING, '## The work packages')
    failsOpen(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: renamed }))
  })

  it('allows a table whose rows changed shape while both headings stand', () => {
    const reshaped = workPackages({ bundles: [['Dorfleben', 'A', '#350']] })
      .replace('| **Dorfleben** | A |', '- **Dorfleben** (A):')
    failsOpen(evaluate({ tasksMd: tasks([350, 351]), workPackagesMd: reshaped }))
  })

  it('allows a PARTIALLY restructured document — the rows parse, the exemptions do not', () => {
    const renamed = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **#285** — the leak hunt.'],
    }).replace(UNBUNDLED_MARKER, '**Deliberately outside a bundle**')
    failsOpen(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: renamed }))
  })

  it('allows a RESTRUCTURED document — a parse miss is not a drift finding', () => {
    failsOpen(evaluate({ tasksMd: tasks([540]), workPackagesMd: '# Work packages\n\nrewritten, no table' }))
  })

  it('allows an empty or unreadable work order, and says it measured nothing', () => {
    failsOpen(evaluate({ tasksMd: '', workPackagesMd: workPackages() }))
    failsOpen(evaluate({ tasksMd: null, workPackagesMd: workPackages() }))
  })

  it('allows rather than throwing on rubbish input, and says it measured nothing', () => {
    failsOpen(evaluate())
    failsOpen(evaluate({ tasksMd: 42, workPackagesMd: 42 }))
  })
})

// WHAT --status SAYS is a decision, and it lives in the core so a case can
// reach it (round-fifteen review finding): the wrapper used to choose between
// the two sentences itself, where reverting the choice left every test green.
describe('statusLine', () => {
  it('reports the invariant only where it was measured', () => {
    expect(statusLine({ block: false, checked: true })).toMatch(/exactly one home/)
  })

  it('names a fail-open instead of claiming the invariant', () => {
    const line = statusLine({ block: false, checked: false })
    expect(line).toMatch(/NOT CHECKED/)
    expect(line).not.toMatch(/exactly one home\./)
  })

  it('prints the block reason itself when there is one', () => {
    expect(statusLine({ block: true, reason: 'BUNDLE MEMBERSHIP DRIFTED: 1 open point' })).toMatch(/DRIFTED/)
  })

  it('treats an absent verdict as unjudged rather than as a pass', () => {
    expect(statusLine(null)).toMatch(/NOT CHECKED/)
    expect(statusLine({})).toMatch(/NOT CHECKED/)
  })
})

describe('the real docs/work-packages.md', () => {
  const md = readFileSync(repoPath('docs/work-packages.md'), 'utf8')

  // A silent restructure would make the guard fail open for ever — it would
  // simply stop finding a table and allow every turn. This is the tripwire.
  it('still parses into bundles and an exemption list', () => {
    const bundles = parseBundles(md)
    expect(bundles.length).toBeGreaterThan(5)
    for (const b of bundles) {
      expect(b.id, JSON.stringify(b)).toMatch(/^[A-Z]$/)
      expect(b.name.length, b.id).toBeGreaterThan(2)
      expect(b.points.size, b.id).toBeGreaterThan(0)
    }
    expect(parseUnbundled(md).points.size).toBeGreaterThan(0)
  })

  // A COUNT, NOT A FLOOR (round-ten review finding). "More than five bundles"
  // passes while half the table goes unread, and every completeness check below
  // filters to OPEN points — so a row holding only closed points could vanish
  // from the reader's view without a single case turning red. These two counts
  // come from the document's own shape, so a row or a bullet that stops parsing
  // is a failure rather than a silence.
  // THE ORACLE IS ONE FUNCTION, USED ON THE REAL DOCUMENT AND ON A SYNTHETIC
  // ONE (round-seventeen review finding): a tripwire that only ever runs on a
  // clean document can be loosened without a case noticing, so the same counts
  // are taken of a document deliberately written in the shapes the parser
  // cannot read.
  const structuralCounts = (doc) => {
    const section = doc.slice(doc.indexOf(BUNDLES_HEADING), doc.indexOf(UNBUNDLED_MARKER))
    // COUNTED BY THE SHAPE OF THE DOCUMENT, NOT BY THE PARSER'S OWN RULE
    // (round-eleven, sixteen and seventeen review findings): a count that
    // recognises exactly what the parser recognises goes blind wherever the
    // parser does. TWO cell separators are enough, so a row that leaves its
    // leading pipe off and a row truncated after its id are both seen.
    const rows = section.split('\n').filter((line) => (line.match(/\|/g) ?? []).length >= 2)
    const tail = doc.slice(doc.indexOf(UNBUNDLED_MARKER))
    const end = tail.indexOf('\n## ')
    // WIDER THAN THE PARSER ON PURPOSE (round-twelve and round-fourteen review
    // findings): the parser reads every bullet marker up to three spaces in,
    // and this count takes ANY indentation and a marker standing alone at the
    // end of its line as well.
    const bullets = (end < 0 ? tail : tail.slice(0, end))
      .split('\n')
      .filter((line) => /^\s*[-*+](\s|$)/.test(line))
    return { rows, bullets, separators: rows.filter((line) => /^\|[\s|:-]+$/.test(line.trim())) }
  }

  it('parses EVERY bundle row and EVERY exemption bullet the document writes', () => {
    const { rows, bullets, separators } = structuralCounts(md)
    expect(separators).toHaveLength(1)
    expect(rows.length).toBeGreaterThan(7)
    // Only the header and its separator may fail to parse.
    expect(parseBundles(md)).toHaveLength(rows.length - 2)
    expect(bullets.length).toBeGreaterThan(5)
    expect(parseUnbundled(md).bullets).toHaveLength(bullets.length)
  })

  it('the oracle SEES the shapes the parser cannot, so loosening it turns red', () => {
    const base = md.slice(0, md.indexOf(UNBUNDLED_MARKER))
    const tail = md.slice(md.indexOf(UNBUNDLED_MARKER))
    for (const row of ['**Neu** | Z | What it is | #999 |', '| **Neu** | Z']) {
      const doc = `${base}${row}\n\n${tail}`
      expect(structuralCounts(doc).rows.length, row).toBe(structuralCounts(md).rows.length + 1)
      expect(parseBundles(doc), row).toHaveLength(parseBundles(md).length)
    }
    // Inserted on its own line after the marker's line, so the bullet is a
    // bullet rather than a continuation of the sentence that introduces them.
    const afterMarkerLine = tail.indexOf('\n') + 1
    // The indentation case sits BEYOND the parser's three-space rule
    // (round-eighteen review finding): two spaces is a shape the parser reads,
    // so it would have proved nothing about the oracle being wider. Four spaces
    // is a code block to Markdown and to the parser, and still a line the
    // oracle has to see. Each case asserts BOTH halves — the oracle counts one
    // more, the parser reads exactly as many as before.
    const withBullet = (bullet) => `${base}${tail.slice(0, afterMarkerLine)}\n${bullet}\n${tail.slice(afterMarkerLine)}`
    // BEYOND THE PARSER'S REACH (round-eighteen review finding): two spaces is
    // a shape the parser reads, so it proved nothing about the oracle being
    // wider. Four spaces is a code block to Markdown and to the parser, and a
    // marker alone on its line carries no reference — both are lines only the
    // oracle sees, and the parser must read exactly as many entries as before.
    for (const bullet of ['    - **#999**.', '-']) {
      const doc = withBullet(bullet)
      expect(structuralCounts(doc).bullets.length, bullet).toBe(structuralCounts(md).bullets.length + 1)
      expect(parseUnbundled(doc).bullets, bullet).toHaveLength(parseUnbundled(md).bullets.length)
    }
    // And a `+` bullet is a shape BOTH read since round thirteen, so here the
    // two counts have to move together.
    const plus = withBullet('+ **#999** — another shape.')
    expect(structuralCounts(plus).bullets.length).toBe(structuralCounts(md).bullets.length + 1)
    expect(parseUnbundled(plus).bullets).toHaveLength(parseUnbundled(md).bullets.length + 1)
  })

  // THE FIXTURE IS A MEASUREMENT, AND IT SAYS SO ITSELF (round-ten review
  // finding). Its header is prose and proves nothing; what proves its
  // provenance is its CONTENT. The prose reader took every 1-to-4-digit token
  // in a cell, so its reading is full of numbers that were never points —
  // ordinals, quantities, the leftovers of dates. The marker reader cannot
  // produce a single one of them, so a fixture regenerated from today's reader
  // could not carry them and the comparison below would be tautological. These
  // two assertions are what makes it not one.
  it('carries the prose reader\'s own noise, which the marked reader cannot produce', () => {
    const measured = JSON.parse(readFileSync(repoPath('scripts/fixtures/work-packages-placed-before-1003.json'), 'utf8'))
    expect(measured.document).toMatch(/^[0-9a-f]{40}$/)

    const placedNow = new Set(parseUnbundled(md).points)
    for (const bundle of parseBundles(md)) for (const n of bundle.points) placedNow.add(n)

    const noise = measured.placed.filter((n) => !placedNow.has(n))
    expect(noise.length).toBeGreaterThan(100)
    // Numbers no work-order point ever carried: the work order starts well
    // above 100, so these can only come from prose.
    expect(measured.placed.filter((n) => n < 100).length).toBeGreaterThan(10)
  })

  it('still places every point the prose reader placed and the work order still has open', () => {
    const measured = JSON.parse(readFileSync(repoPath('scripts/fixtures/work-packages-placed-before-1003.json'), 'utf8'))
    const open = parseOpenPoints(readFileSync(repoPath('TASKS.md'), 'utf8'))
    expect(open.size).toBeGreaterThan(100)
    const placedThen = measured.placed.filter((n) => open.has(n))
    // The old reader placed 609 numbers, most of which were never points; what
    // matters is the OPEN ones, and there must still be a real set of them.
    expect(placedThen.length).toBeGreaterThan(100)

    const bundles = parseBundles(md)
    const placedNow = new Set(parseUnbundled(md).points)
    for (const bundle of bundles) for (const n of bundle.points) placedNow.add(n)
    expect(placedThen.filter((n) => !placedNow.has(n))).toEqual([])

    // And nothing OPEN is placed today that the measurement does not carry —
    // except points appended after it, which no earlier document could hold.
    const measuredMax = Math.max(...measured.placed)
    const gained = [...open].filter((n) => placedNow.has(n) && !measured.placed.includes(n) && n <= measuredMax)
    expect(gained).toEqual([])

    // Everything open is placed, which is the guard's own verdict.
    expect(unplacedPoints(open, bundles, placedNow)).toEqual([])
  })

  // EXACTLY ONE BUNDLE (the document's own invariant, review finding of the
  // fifth round). The prose reader placed a point wherever another bundle's
  // prose happened to name it, and `unplacedPoints` unions the memberships, so
  // a point in two bundles could never fail. Marked references make the
  // membership canonical, which makes the invariant checkable — here.
  it('prints through the core, so the CLI cannot answer with a sentence of its own', async () => {
    const { spawnSync } = await import('node:child_process')
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { withoutGitLocalEnvironment } = await import('./repo-paths.mjs')

    // BOTH BRANCHES, NEITHER OF THEM CONDITIONAL (round-eighteen review
    // finding): judging the LIVE checkout made applicability depend on whether
    // this run happens to own the batch lock, so the delegation branch could go
    // unexercised — reverting the wrapper's `statusLine(result)` to a sentence
    // of its own left the suite green. The run gets its own checkout instead,
    // and `HOA_REPO_ROOT` is what every path in the wrapper resolves from, the
    // batch lock included.
    const root = mkdtempSync(join(tmpdir(), 'bundle-first-cli-'))
    try {
      const tasksMd = tasks([350, 285])
      const workPackagesMd = workPackages()
      mkdirSync(join(root, 'docs'), { recursive: true })
      writeFileSync(join(root, 'TASKS.md'), tasksMd)
      writeFileSync(join(root, 'docs', 'work-packages.md'), workPackagesMd)
      const run = () =>
        spawnSync(process.execPath, [repoPath('scripts/bundle-first-guard.mjs'), '--status'], {
          encoding: 'utf8',
          windowsHide: true,
          env: { ...withoutGitLocalEnvironment(process.env), HOA_REPO_ROOT: root },
        })

      const measured = run()
      expect(measured.stderr).toBe('')
      expect(measured.status).toBe(0)
      expect(measured.stdout.trim()).toBe(statusLine(evaluate({ tasksMd, workPackagesMd })))
      expect(measured.stdout.trim()).toMatch(/exactly one home/)

      // ON MORE THAN ONE DOCUMENT, because a wrapper that answers with a
      // sentence of its own gets the clean case right by accident. The same
      // checkout with an unreadable work order is a fail-open, and there the
      // wrapper's own sentence and the core's differ.
      writeFileSync(join(root, 'TASKS.md'), '# Work order\n\nnothing open\n')
      const failedOpen = run()
      expect(failedOpen.status).toBe(0)
      expect(failedOpen.stdout.trim()).toBe(
        statusLine(evaluate({ tasksMd: '# Work order\n\nnothing open\n', workPackagesMd })),
      )
      expect(failedOpen.stdout.trim()).toMatch(/NOT CHECKED/)

      // The other branch, from the same checkout, is the stand-down sentence —
      // and every way into it exits 0 and says which one it took. The reader
      // resolves its paths against the checkout it is GIVEN, so a checkout
      // missing either document is answered rather than thrown at.
      rmSync(join(root, 'TASKS.md'))
      const noWorkOrder = run()
      expect(noWorkOrder.status).toBe(0)
      expect(noWorkOrder.stdout.trim()).toBe('bundle-first-guard: not applicable — no TASKS.md in this checkout')

      rmSync(join(root, 'docs'), { recursive: true })
      const noDocument = run()
      expect(noDocument.status).toBe(0)
      expect(noDocument.stdout.trim()).toBe(
        'bundle-first-guard: not applicable — no docs/work-packages.md in this checkout',
      )

      mkdirSync(join(root, '.claude'), { recursive: true })
      writeFileSync(join(root, '.claude', 'batch-paused'), '')
      const stoodDown = run()
      expect(stoodDown.status).toBe(0)
      expect(stoodDown.stdout.trim()).toBe('bundle-first-guard: not applicable — the batch is paused')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('gives every open point exactly one home', () => {
    const open = parseOpenPoints(readFileSync(repoPath('TASKS.md'), 'utf8'))
    expect(open.size).toBeGreaterThan(100)
    const bundles = parseBundles(md)
    const exemptions = parseUnbundled(md)

    // AT LEAST ONE: nothing open is unplaced.
    expect(unplacedPoints(open, bundles, exemptions.points)).toEqual([])
    // AND AT MOST ONE, read the way the guard reads it (round-twelve review
    // finding): building the map out of the parsers' SETS threw a repeat inside
    // one cell or across two bullets away before it could be counted, so the
    // real document could acquire either duplication and this test would still
    // pass. `duplicateHomes` is the production reading and sees both.
    expect(
      duplicateHomes(open, bundles, exemptions).map((d) => `${d.point}: ${d.homes.join(' + ')}`),
    ).toEqual([])
    // And the map is not empty — every open point really was looked at.
    const placed = new Set(exemptions.points)
    for (const bundle of bundles) for (const n of bundle.points) placed.add(n)
    expect([...open].filter((n) => placed.has(n))).toHaveLength(open.size)
  })

  // THE HOME IS THE RIGHT ONE, not merely a single one — and EVERY open point
  // is judged, with nothing skipped (review findings over several rounds: a
  // count can be met by other points, and a `continue` is a silent pass). Each
  // point has an outside authority and the test says which: its own spec names
  // a bundle, or the document BEFORE the migration carried it in a list
  // position. Nothing is measured against the migrated document itself, and the
  // two authorities together must cover the whole open set.
  it('files every open point where its authority says, and has an authority for each', () => {
    const measured = JSON.parse(readFileSync(repoPath('scripts/fixtures/work-packages-placed-before-1003.json'), 'utf8'))
    const tasksMd = readFileSync(repoPath('TASKS.md'), 'utf8')
    const open = parseOpenPoints(tasksMd)
    expect(open.size).toBeGreaterThan(100)
    const blocks = new Map()
    let current = null
    for (const line of tasksMd.split('\n')) {
      const m = /^- \[( |x)\] (\d+)\./.exec(line)
      if (m) { current = Number(m[2]); blocks.set(current, line); continue }
      if (current !== null) blocks.set(current, `${blocks.get(current)}\n${line}`)
    }
    const bundles = parseBundles(md)
    const filed = new Map()
    for (const bundle of bundles) for (const n of bundle.points) filed.set(n, bundle.id)
    for (const n of parseUnbundled(md).points) filed.set(n, 'Not bundled')

    const bySpec = []
    const byPriorList = []
    const withoutAuthority = []
    const wrong = []
    for (const n of [...open].sort((a, b) => a - b)) {
      const named = /^\s*Bundle:\s*(.+?)\s*$/m.exec(blocks.get(n) ?? '')
      // The line often runs on into prose about coupling, so the bundle is the
      // NAME it starts with.
      const spec = named ? bundles.find((b) => named[1].startsWith(b.name)) : null
      const listedThen = measured.listedIn[String(n)]
      if (spec) {
        bySpec.push(n)
        if (filed.get(n) !== spec.id) wrong.push(`${n}: spec says ${spec.id}, table says ${filed.get(n) ?? 'nowhere'}`)
      } else if (listedThen) {
        byPriorList.push(n)
        if (!listedThen.includes(filed.get(n))) {
          wrong.push(`${n}: filed under ${filed.get(n) ?? 'nowhere'}, listed then in ${listedThen.join(', ')}`)
        }
      } else {
        withoutAuthority.push(n)
      }
    }
    expect(wrong).toEqual([])
    // NOTHING WAS SKIPPED: the two authorities partition the whole open set, so
    // there is no bucket a wrong home could fall into unjudged.
    expect(withoutAuthority).toEqual([])
    expect(bySpec.length + byPriorList.length).toBe(open.size)
    expect(bySpec.length).toBeGreaterThanOrEqual(176)
  })
})
