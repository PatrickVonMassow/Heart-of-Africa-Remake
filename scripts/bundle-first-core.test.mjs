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

  it('reads no half-marked or embedded number', () => {
    expect(referenceList('a#350')).toEqual([])
    expect(referenceList('#350a')).toEqual([])
    expect(referenceList('##350')).toEqual([])
    expect(referenceList('the points are 350 and 351')).toEqual([])
  })

  // THE BOUNDARIES ARE MARKDOWN'S (review finding). Two shapes that carry a `#`
  // and are not references, and one that is a reference and used to be missed.
  it('is not fooled by an HTML entity or an anchor, and reads an emphasised marker', () => {
    expect(referenceList('a brace written as &#123; in the cell')).toEqual([])
    expect(referenceList('see [the section](#123) for the reason')).toEqual([])
    expect(referenceList('__#123__ and *#124*')).toEqual([123, 124])
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

  it('truncates a long list instead of printing a wall', () => {
    const many = Array.from({ length: 60 }, (_, i) => 600 + i)
    const v = evaluate({ tasksMd: tasks(many), workPackagesMd: wp })
    expect(v.block).toBe(true)
    expect(v.missing).toHaveLength(60)
    expect(v.reason).toMatch(/… and 20 more/)
  })
})

describe('evaluate — the fail-open exits', () => {
  it('allows an unreadable or absent work-packages file', () => {
    expect(evaluate({ tasksMd: tasks([540]), workPackagesMd: '' }).block).toBe(false)
    expect(evaluate({ tasksMd: tasks([540]) }).block).toBe(false)
    expect(evaluate({ tasksMd: tasks([540]), workPackagesMd: null }).block).toBe(false)
  })

  it('allows the OTHER half-restructure — the exemptions parse, the table heading does not', () => {
    const renamed = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **#285** — the leak hunt.'],
    }).replace(BUNDLES_HEADING, '## The work packages')
    expect(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: renamed }).block).toBe(false)
  })

  it('allows a table whose rows changed shape while both headings stand', () => {
    const reshaped = workPackages({ bundles: [['Dorfleben', 'A', '#350']] })
      .replace('| **Dorfleben** | A |', '- **Dorfleben** (A):')
    expect(evaluate({ tasksMd: tasks([350, 351]), workPackagesMd: reshaped }).block).toBe(false)
  })

  it('allows a PARTIALLY restructured document — the rows parse, the exemptions do not', () => {
    const renamed = workPackages({
      bundles: [['Dorfleben', 'A', '#350']],
      unbundled: ['- **#285** — the leak hunt.'],
    }).replace(UNBUNDLED_MARKER, '**Deliberately outside a bundle**')
    expect(evaluate({ tasksMd: tasks([350, 285]), workPackagesMd: renamed }).block).toBe(false)
  })

  it('allows a RESTRUCTURED document — a parse miss is not a drift finding', () => {
    expect(evaluate({ tasksMd: tasks([540]), workPackagesMd: '# Work packages\n\nrewritten, no table' }).block).toBe(
      false,
    )
  })

  it('allows an empty or unreadable work order', () => {
    expect(evaluate({ tasksMd: '', workPackagesMd: workPackages() }).block).toBe(false)
    expect(evaluate({ tasksMd: null, workPackagesMd: workPackages() }).block).toBe(false)
  })

  it('allows rather than throwing on rubbish input', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ tasksMd: 42, workPackagesMd: 42 }).block).toBe(false)
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

  // THE MIGRATION CHANGED NO MEMBERSHIP (point 1003). What the prose reader
  // placed the day before the migration is a MEASUREMENT, and it is kept as one
  // — reproducing that reader here would read the MIGRATED cells and prove
  // nothing (review finding). The fixture is never regenerated; it ages out on
  // its own, because a point that closes leaves the open set on both sides.
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
  it('gives every open point exactly one home', () => {
    const open = parseOpenPoints(readFileSync(repoPath('TASKS.md'), 'utf8'))
    expect(open.size).toBeGreaterThan(100)
    const homes = new Map()
    for (const bundle of parseBundles(md)) {
      for (const n of bundle.points) if (open.has(n)) homes.set(n, [...(homes.get(n) ?? []), bundle.id])
    }
    for (const n of parseUnbundled(md).points) {
      if (open.has(n)) homes.set(n, [...(homes.get(n) ?? []), 'Not bundled'])
    }
    // Every open point has A home, so the count below cannot pass on an empty
    // map (review finding), and none has two.
    expect(homes.size).toBe(open.size)
    const twice = [...homes].filter(([, where]) => where.length > 1)
    expect(twice.map(([n, where]) => `${n}: ${where.join(' + ')}`)).toEqual([])
  })

  // THE HOME IS THE RIGHT ONE, not merely a single one (review finding of the
  // sixth round: the coverage and count checks cannot see a point filed under
  // the wrong bundle). A point's own spec names its bundle, so the table is
  // measured against the work order rather than against itself.
  it('files every open point under the bundle its own spec names', () => {
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
    const home = new Map()
    for (const bundle of bundles) for (const n of bundle.points) home.set(n, bundle.id)
    const unbundled = parseUnbundled(md).points

    let checked = 0
    const wrong = []
    for (const n of open) {
      const named = /^\s*Bundle:\s*(.+?)\s*$/m.exec(blocks.get(n) ?? '')
      if (!named) continue
      // The line often continues into prose about coupling, so the bundle is
      // the NAME the line starts with.
      const bundle = bundles.find((b) => named[1].startsWith(b.name))
      if (!bundle) continue
      checked += 1
      const filed = home.get(n) ?? (unbundled.has(n) ? 'Not bundled' : 'nowhere')
      if (filed !== bundle.id) wrong.push(`${n}: spec says ${bundle.id}, table says ${filed}`)
    }
    // The skips are COUNTED rather than tolerated (review finding): every open
    // point whose spec names a bundle of this table is checked, and the two
    // counts have to agree, so a spec that stops resolving is a failure here
    // instead of a silent skip.
    const nameable = [...open].filter((n) => {
      const named = /^\s*Bundle:\s*(.+?)\s*$/m.exec(blocks.get(n) ?? '')
      return Boolean(named && bundles.some((b) => named[1].startsWith(b.name)))
    })
    expect(nameable.length).toBeGreaterThan(100)
    expect(checked).toBe(nameable.length)
    expect(wrong).toEqual([])
  })

  // AND THE POINTS WHOSE SPEC NAMES NO BUNDLE (review finding of the seventh
  // round: the test above skips them, so one could be filed anywhere). They have
  // no outside authority, so the measure is the bundle's OWN text: the bundle a
  // point is filed under must be one that talks about it. A point moved to an
  // unrelated bundle fails here even though its spec says nothing.
  it('files a point whose spec names no bundle where that bundle itself names it', () => {
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
    const cellOf = new Map()
    const section = md.slice(md.indexOf(BUNDLES_HEADING))
    const table = section.slice(0, section.indexOf(UNBUNDLED_MARKER))
    for (const line of table.split('\n')) {
      const cells = line.split('|').map((c) => c.trim())
      if (cells.length < 6 || !/^[A-Z]$/.test(cells[2])) continue
      cellOf.set(cells[2], cells[4])
    }
    const unbundled = parseUnbundled(md).points

    let checked = 0
    const strangers = []
    for (const bundle of bundles) {
      for (const n of bundle.points) {
        if (!open.has(n) || unbundled.has(n)) continue
        const named = /^\s*Bundle:\s*(.+?)\s*$/m.exec(blocks.get(n) ?? '')
        if (named && bundles.some((b) => named[1].startsWith(b.name))) continue
        checked += 1
        if (!new RegExp(`\\b${n}\\b`).test(cellOf.get(bundle.id) ?? '')) {
          strangers.push(`${n}: filed under ${bundle.id}, which never names it`)
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
    expect(strangers).toEqual([])
  })
})
