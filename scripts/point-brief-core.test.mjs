// The point brief's pure core (point 365 A). Synthetic fixtures pin the
// behaviour; the REAL corpus — all 365 points, open and archived, against
// design.md, CLAUDE.md and every document under docs/ — is swept at the end.
//
// The sweep is the load-bearing half. This tool is about to hand every delegated
// task its whole spec, so the failure that matters is not a crash: it is a brief
// that reads complete and carries the WRONG section. That happened — the brief
// for point 330 carried design.md §8 verbatim where the spec said
// "peoples-1890 §8", with no note. So the sweep asserts faithfulness over the
// whole corpus rather than sampling it: the spec verbatim, every `§` accounted
// for, and no section carried from a document the spec never named.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readTasksAll } from './tasks-source.mjs'
import { readDocCorpus } from './doc-corpus.mjs'
import {
  BriefError,
  BRIEF_TOKEN_CEILING,
  DOC_WINDOW,
  aliasesFor,
  assembleBrief,
  buildBrief,
  buildDocRegistry,
  compareSectionIds,
  estimateTokens,
  extractPointRefs,
  findPoint,
  parseDesignSections,
  parseWorkOrderPoints,
  pointTitle,
  resolveSectionRefs,
} from './point-brief-core.mjs'

const ROOT = resolve(process.cwd())

const TASKS = [
  '# TASKS',
  '',
  '## Checklist',
  '',
  '- [ ] 400. AN OPEN POINT — it references design.md §4.2 and, later, §19.8.',
  '  It also says: per point 288 the ports are known from the start.',
  '',
  '- [ ] 401. ANOTHER OPEN POINT with no references at all.',
  '',
  '## Closing (only after all points)',
  '',
  '- [ ] Something that is not a numbered point.',
].join('\n')

const ARCHIVE = [
  '# TASKS-Archiv',
  '',
  '- [x] 288. PORTS ARE KNOWN FROM THE START — no discovery bounty for them,',
  '  and the label shows the name (design.md §17.2).',
].join('\n')

const ALL = `${TASKS}\n${ARCHIVE}`

const DESIGN = [
  '# Design',
  '',
  '## 4. Settlements',
  'Intro to settlements.',
  '',
  '### 4.1 Port Cities (10)',
  'Ports.',
  '',
  '### 4.2 Peoples (22)',
  'Twenty-two peoples, each with its own organising principle.',
  '',
  '## 8. Valuables',
  'The value matrix.',
  '',
  '## 17. User Interface',
  '',
  '### 17.2 Discovery-gated labels',
  'A place shows "?" until it is discovered.',
  '',
  '## 19. Atmosphere and Immersion',
  '',
  '### 19.8 Family life in the herds',
  'Calves stay with the herd; a parent rescues.',
].join('\n')

const CLAUDE = [
  '# CLAUDE.md',
  '',
  '### 7.1 Acceptance Criteria',
  'The criteria.',
  '',
  '## 8. Outside This Run',
  'Not in scope.',
].join('\n')

const PEOPLES = [
  '# Peoples 1890',
  '',
  '## 3. The seasonal work calendar',
  'Intro.',
  '',
  '### 3.1 The hungry season IS the rainy season',
  'The intuition is backwards.',
  '',
  '## 8. Research → game',
  'What was implemented, and how.',
].join('\n')

const FAUNA = [
  '# Bird flight',
  '',
  '## B1. Bird flight escape',
  'Prey birds fly off.',
  '',
  '## B2. Aerial predators',
  'Raptors.',
  '',
  '### B2.1 Per-region table',
  'Falcons, per region.',
].join('\n')

const DOCS = [
  { path: 'docs/peoples-1890.md', text: PEOPLES },
  { path: 'docs/fauna-behaviour-1890.md', text: FAUNA },
]

const REGISTRY = buildDocRegistry({ designText: DESIGN, claudeText: CLAUDE, docs: DOCS })
const resolveIn = (spec, opts) => resolveSectionRefs(spec, REGISTRY, opts).refs
const mapOf = (spec, opts) =>
  Object.fromEntries(resolveIn(spec, opts).map((r) => [`${r.docPath ?? r.how}|${r.id}`, r.how]))

describe('parseWorkOrderPoints', () => {
  it('reads open and archived points out of the concatenated work order', () => {
    const points = parseWorkOrderPoints(ALL)
    expect(points.map((p) => p.number)).toEqual([400, 401, 288])
    expect(points.find((p) => p.number === 288).done).toBe(true)
    expect(points.find((p) => p.number === 400).done).toBe(false)
  })

  it('keeps the whole continuation body and stops at the next point', () => {
    const p = findPoint(ALL, 400)
    expect(p.body).toContain('AN OPEN POINT')
    expect(p.body).toContain('per point 288')
    expect(p.body).not.toContain('ANOTHER OPEN POINT')
  })

  it('does not take a heading or an unnumbered bullet for a point', () => {
    expect(parseWorkOrderPoints(ALL).some((p) => p.body.includes('not a numbered point'))).toBe(false)
  })

  it('accepts an upper-case tick and a missing space after the dot', () => {
    const points = parseWorkOrderPoints('- [X] 7.Tight text\n- [ ] 8. Loose text')
    expect(points.map((p) => [p.number, p.done, p.body])).toEqual([
      [7, true, 'Tight text'],
      [8, false, 'Loose text'],
    ])
  })

  it('un-indents the continuation by exactly two, keeping DEEPER indentation intact', () => {
    // Not cosmetic: a nested list or an indented block in the spec must reach the
    // reader with its structure, or the brief is no longer verbatim.
    const p = findPoint(['- [ ] 9. Head', '  flat', '    * nested', '      deeper'].join('\n'), 9)
    expect(p.body).toBe('Head\nflat\n  * nested\n    deeper')
  })

  it('does NOT let a quoted point start or heading inside a code fence cut the body', () => {
    // A body truncated at a quoted example is a silently incomplete spec — the
    // exact failure this whole module exists to prevent.
    const text = [
      '- [ ] 10. Shows the work-order syntax:',
      '  ```',
      '  - [ ] 11. this is an EXAMPLE, not a point',
      '  ## and this is an example heading',
      '  ```',
      '  and the spec continues here.',
      '- [ ] 12. The real next point.',
    ].join('\n')
    const points = parseWorkOrderPoints(text)
    expect(points.map((p) => p.number)).toEqual([10, 12])
    expect(points[0].body).toContain('this is an EXAMPLE')
    expect(points[0].body).toContain('and the spec continues here.')
  })

  it('records the source line span, so a caller can prove the body verbatim', () => {
    const p = findPoint(ALL, 400)
    const lines = ALL.split('\n')
    expect(lines[p.startLine]).toContain('400. AN OPEN POINT')
    expect(lines.slice(p.startLine, p.endLine).at(-1).trim()).not.toBe('')
  })

  it('strips a byte-order mark rather than losing the first point to it', () => {
    expect(parseWorkOrderPoints('﻿- [ ] 5. First').map((p) => p.number)).toEqual([5])
  })
})

describe('findPoint', () => {
  it('finds an OPEN number', () => {
    expect(findPoint(ALL, 401).body).toContain('ANOTHER OPEN POINT')
  })

  it('finds an ARCHIVED number', () => {
    expect(findPoint(ALL, 288).body).toContain('PORTS ARE KNOWN FROM THE START')
  })

  it('returns null for an unknown number', () => {
    expect(findPoint(ALL, 999)).toBeNull()
  })
})

describe('the § pattern — what is a reference and what is prose', () => {
  it('reads plain, lettered and part references', () => {
    const ids = resolveIn('design.md §4.2, fauna-behaviour-1890.md §B2.1 and §B').map((r) => r.id)
    expect(ids).toEqual(['4.2', 'B2.1', 'B'])
  })

  it('is not fooled by the prose the corpus really contains', () => {
    // Both live in the work order: "the README cites no §s" and "the § numbering".
    expect(resolveIn('the README cites no §s, and the § numbering is unchanged')).toEqual([])
    expect(resolveIn('§Blah is a word, not a section')).toEqual([])
  })

  it('stops the id at punctuation, a possessive or a slash chain', () => {
    const ids = resolveIn("design.md §4.2's rule, §19.8: the herd, §4.1/§17.2.").map((r) => r.id)
    expect(ids).toEqual(['4.2', '19.8', '4.1', '17.2'])
  })

  it('reports a named RANGE, which resolving the endpoints alone would hide', () => {
    const { ranges } = resolveSectionRefs('design.md §4.1-§4.2 covers it', REGISTRY)
    expect(ranges).toEqual(['§4.1–§4.2'])
  })
})

describe('resolveSectionRefs — which document a § belongs to', () => {
  it('takes the document named just before it', () => {
    expect(mapOf('CLAUDE.md §7.1 stands, design.md §4.2 applies')).toEqual({
      'CLAUDE.md|7.1': 'named-nearby',
      'design.md|4.2': 'named-nearby',
    })
  })

  it('defaults a bare § to design.md — the documented habit of this queue', () => {
    expect(mapOf('§4.2 applies')).toEqual({ 'design.md|4.2': 'design-default' })
  })

  it('resolves the SAME id to DIFFERENT documents inside one spec', () => {
    // The real shape of point 330: "peoples-1890 §8 … (CLAUDE.md §8)". A resolver
    // that decides one owner per id must report one of them wrongly.
    const refs = resolveIn('the research docs (peoples-1890 §8) and the rule in CLAUDE.md §8')
    expect(refs.map((r) => `${r.docPath} §${r.id}`)).toEqual([
      'docs/peoples-1890.md §8',
      'CLAUDE.md §8',
    ])
  })

  it('prefers design.md over CLAUDE.md for a bare id both documents have', () => {
    expect(mapOf('§8 applies')).toEqual({ 'design.md|8': 'design-default' })
  })

  it('reaches back past any window to a document named far earlier — if it HAS the id', () => {
    // Point 142 names docs/peoples-1890.md once at the top and cites §3.1
    // hundreds of characters below; no fixed lookback window can span that.
    const spec = `see docs/peoples-1890.md for the research. ${'filler text. '.repeat(40)} and §3.1 is the finding.`
    expect(mapOf(spec)).toEqual({ 'docs/peoples-1890.md|3.1': 'named-earlier' })
  })

  it('does NOT let a far-away document steal an id it does not have', () => {
    // Same point 142: §19.8 there means design.md, although peoples-1890.md was
    // named far above. Existence decides, attribution only orders the candidates.
    const spec = `see docs/peoples-1890.md for the research. ${'filler text. '.repeat(40)} and §19.8 is the renderer.`
    expect(mapOf(spec)).toEqual({ 'design.md|19.8': 'design-default' })
  })

  it('honours a PROSE document name only when the § follows it directly', () => {
    // Measured on the corpus: "peoples §3.1" is a citation, while "sixteen
    // peoples unchanged … the §4.2 rule" is not. Adjacency is the only signal.
    expect(mapOf('the hungry season -> peoples §3.1')).toEqual({
      'docs/peoples-1890.md|3.1': 'named-nearby',
    })
    expect(mapOf('sixteen peoples were unchanged, and the §4.2 rule still holds')).toEqual({
      'design.md|4.2': 'design-default',
    })
  })

  it('gives a hyphenated basename a short reach, not the filename’s generous one', () => {
    expect(DOC_WINDOW.file).toBeGreaterThan(DOC_WINDOW.basename)
    expect(DOC_WINDOW.stem).toBe(0)
    expect(mapOf('peoples-1890 §8 is the record')).toEqual({ 'docs/peoples-1890.md|8': 'named-nearby' })
  })

  it('resolves a bare capital as the whole lettered PART of its document', () => {
    const [ref] = resolveIn('docs/fauna-behaviour-1890.md §B settles it')
    expect(ref.kind).toBe('part')
    expect(ref.members).toEqual(['B1', 'B2', 'B2.1'])
  })

  it('recognises a § that is really a work-order POINT number', () => {
    expect(mapOf('§288 combat applies', { pointNumbers: new Set([288]) })).toEqual({
      'work-order-point|288': 'work-order-point',
    })
  })

  it('marks what resolves nowhere as dangling instead of guessing', () => {
    expect(resolveIn('§99.9 applies')[0].how).toBe('dangling')
  })

  it('reads a § standing ALONE in backticks as the notation, not a citation', () => {
    // Point 365 itself writes "including a LETTERED section (`§B`)". That is the
    // form being named, not a reference — and hard-failing on it would block the
    // brief for a perfectly healthy point.
    expect(resolveIn('including a LETTERED section (`§99.9`)')[0].how).toBe('notation')
  })

  it('still resolves a backticked reference that DOES exist — only failure is downgraded', () => {
    // Skipping backticked references outright would be a silent omission, which
    // is exactly the class this tool must not have.
    expect(mapOf('see `§4.2` for the rule')).toEqual({ 'design.md|4.2': 'design-default' })
  })

  it('does NOT downgrade a § inside a code span that holds more than the reference', () => {
    // "`docs/x.md` §3.5" and the like are ordinary citations; only a span whose
    // whole content is the reference is the notation.
    expect(resolveIn('`docs/peoples-1890.md §99.9` applies')[0].how).toBe('dangling')
  })

  it('counts repeated occurrences of one reference once', () => {
    const refs = resolveIn('§4.2 and later §4.2 again')
    expect(refs).toHaveLength(1)
    expect(refs[0].occurrences).toHaveLength(2)
  })
})

describe('aliasesFor', () => {
  it('derives the filename, the hyphenated basename and the prose stem', () => {
    expect(aliasesFor('docs/peoples-1890.md').map((a) => a.style)).toEqual(['file', 'basename', 'stem'])
    expect(aliasesFor('design.md').map((a) => a.style)).toEqual(['file', 'stem'])
  })
})

describe('parseDesignSections', () => {
  const sections = parseDesignSections(DESIGN)

  it('indexes every numbered heading', () => {
    expect([...sections.keys()]).toEqual(['4', '4.1', '4.2', '8', '17', '17.2', '19', '19.8'])
  })

  it('carries a subsection verbatim and stops at the next heading', () => {
    const s = sections.get('4.2')
    expect(s.text).toContain('Twenty-two peoples')
    expect(s.text).not.toContain('Valuables')
  })

  it('carries only the intro of a top-level section, plus its subsection index', () => {
    const s = sections.get('4')
    expect(s.text).toContain('Intro to settlements')
    expect(s.text).not.toContain('Twenty-two peoples')
    expect(s.children.map((c) => c.id)).toEqual(['4.1', '4.2'])
  })

  it('indexes lettered headings — the research documents number their halves that way', () => {
    expect([...parseDesignSections(FAUNA).keys()]).toEqual(['B1', 'B2', 'B2.1'])
  })

  it('lets the FIRST of two headings with the same id win, rather than shadowing it', () => {
    const dup = parseDesignSections('## 3. First\nOne.\n\n## 3. Second\nTwo.')
    expect(dup.get('3').title).toBe('First')
    expect(dup.get('3').text).toContain('One.')
  })

  it('sorts lettered ids apart from numeric ones, and numbers numerically', () => {
    expect(['4.10', 'B2', '4.2', '4', 'B1'].sort(compareSectionIds)).toEqual([
      '4', '4.2', '4.10', 'B1', 'B2',
    ])
  })
})

describe('extractPointRefs', () => {
  it('resolves the reference forms the queue uses, and never itself', () => {
    const refs = extractPointRefs(
      'per point 288 and points 175/177, plus pt. 30, pts. 12, 13 and pt 42 — and point 400 is this one.',
      400,
    )
    expect(refs).toEqual([12, 13, 30, 42, 175, 177, 288])
  })

  it('is empty for a spec that names none', () => {
    expect(extractPointRefs('nothing to see here', 401)).toEqual([])
  })
})

describe('buildBrief', () => {
  const args = { tasksText: ALL, designText: DESIGN, claudeText: CLAUDE, docs: DOCS }

  it('builds the brief for an OPEN point with its design sections and cross-references', () => {
    const { brief, designRefs, referenced } = buildBrief({ ...args, number: 400 })
    expect(designRefs).toEqual(['4.2', '19.8'])
    expect(brief).toContain('AN OPEN POINT')
    expect(brief).toContain('Twenty-two peoples')
    expect(brief).toContain('Calves stay with the herd')
    expect(referenced).toEqual([
      { number: 288, found: true, done: true, title: pointTitle(findPoint(ALL, 288)) },
    ])
    expect(brief).toContain('point 288 [done]:')
    expect(brief).not.toContain('no discovery bounty for them,\n  and the label')
  })

  it('LABELS every carried section with the document it came from', () => {
    // Without the label a wrong resolution is invisible; with it the reader sees
    // "[from design.md §8]" where the spec said peoples-1890 and can catch it.
    const { brief } = buildBrief({ ...args, number: 400 })
    expect(brief).toContain('[from design.md §4.2]')
    expect(brief).toContain('[from design.md §19.8]')
  })

  it('lists EVERY § of the spec in the reference map, with where it went', () => {
    const tasks = ALL.replace(
      'It also says: per point 288 the ports are known from the start.',
      'It also says: peoples-1890 §3.1 and CLAUDE.md §7.1 and §288 combat apply.',
    )
    const { brief } = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(brief).toContain('§4.2 → design.md §4.2')
    expect(brief).toContain('§19.8 → design.md §19.8')
    expect(brief).toContain('§3.1 → docs/peoples-1890.md §3.1')
    expect(brief).toContain('§7.1 → CLAUDE.md §7.1')
    expect(brief).toMatch(/§288 → WORK-ORDER POINT 288/)
  })

  it('does NOT carry a section of a document other than design.md', () => {
    const tasks = ALL.replace('design.md §4.2 and, later, §19.8', 'peoples-1890 §3.1')
    const { brief, designRefs } = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(designRefs).toEqual([])
    expect(brief).not.toContain('The intuition is backwards')
    expect(brief).toContain('§3.1 → docs/peoples-1890.md §3.1')
    expect(brief).toMatch(/NAMED in the reference map, not carried/)
  })

  it('builds the brief for an ARCHIVED point and says it is archived', () => {
    const { brief, designRefs } = buildBrief({ ...args, number: 288 })
    expect(brief).toContain('POINT 288 (DONE/ARCHIVED)')
    expect(designRefs).toEqual(['17.2'])
    expect(brief).toContain('A place shows "?" until it is discovered')
  })

  it('states the read rules: no wholesale read, named lookups allowed, escalate', () => {
    const { brief } = buildBrief({ ...args, number: 401 })
    expect(brief).toMatch(/Do NOT read TASKS\.md/)
    expect(brief).toMatch(/WHOLESALE/)
    expect(brief).toMatch(/MAY read any NAMED file/)
    expect(brief).toMatch(/ESCALATE/)
  })

  it('FAILS LOUDLY on an unknown point number', () => {
    expect(() => buildBrief({ ...args, number: 999 })).toThrow(BriefError)
    expect(() => buildBrief({ ...args, number: 999 })).toThrow(/no work-order point 999/)
  })

  it('FAILS LOUDLY on a reference no document contains — and NAMES what was searched', () => {
    // The old message blamed design.md alone, so points 142 and 160 sent their
    // reader hunting a design.md renumbering for sections that were never there.
    const renumbered = DESIGN.replace('### 19.8 Family life in the herds', '### 19.9 Family life')
    let caught
    try {
      buildBrief({ ...args, designText: renumbered, number: 400 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BriefError)
    expect(caught.message).toMatch(/§19\.8/)
    for (const doc of ['design.md', 'CLAUDE.md', 'docs/peoples-1890.md', 'docs/fauna-behaviour-1890.md']) {
      expect(caught.message, `names ${doc}`).toContain(doc)
    }
  })

  it('warns about a named RANGE, whose middle sections it cannot carry', () => {
    const tasks = ALL.replace('design.md §4.2 and, later, §19.8', 'design.md §4.1-§4.2')
    const { brief } = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(brief).toMatch(/RANGE\(S\) §4\.1–§4\.2/)
    expect(brief).toMatch(/must be read on demand/)
  })

  it('says plainly when it carries no design section, instead of leaving a gap', () => {
    const { brief } = buildBrief({ ...args, number: 401 })
    expect(brief).toMatch(/no design\.md section is carried/)
  })
})

describe('assembleBrief', () => {
  it('omits the empty parts instead of printing empty headings', () => {
    const brief = assembleBrief({ point: { number: 1, done: false, body: 'x' } })
    expect(brief).not.toContain('--- SECTIONS THE SPEC REFERENCES')
    expect(brief).not.toContain('--- CROSS-REFERENCED')
    expect(brief).not.toContain('--- REFERENCE MAP')
    expect(brief).not.toContain('--- NOTES')
  })
})

describe('pointTitle', () => {
  it('shortens to one identifying line', () => {
    const long = { body: `${'word '.repeat(80)}end` }
    const t = pointTitle(long)
    expect(t.length).toBeLessThanOrEqual(141)
    expect(t.endsWith('…')).toBe(true)
  })

  it('leaves a short body whole and flattens its line breaks', () => {
    expect(pointTitle({ body: 'A short\n  title' })).toBe('A short title')
  })
})

// ---------------------------------------------------------------------------
// THE REAL CORPUS — every point, open and archived (H1).
// ---------------------------------------------------------------------------
describe('faithfulness over the WHOLE work order', () => {
  const tasksText = readTasksAll(resolve(ROOT, 'TASKS.md'), resolve(ROOT, 'docs/tasks-archive.md'))
  const designPath = resolve(ROOT, 'design.md')
  const designText = existsSync(designPath) ? readFileSync(designPath, 'utf8') : ''
  const claudePath = resolve(ROOT, 'CLAUDE.md')
  const claudeText = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : ''
  const docs = readDocCorpus(resolve(ROOT, 'docs'), ROOT)
  const registry = buildDocRegistry({ designText, claudeText, docs })
  const sourceLines = tasksText.replace(/\r\n/g, '\n').split('\n')
  const points = parseWorkOrderPoints(tasksText)
  const open = points.filter((p) => !p.done)

  /** Build every brief once; the assertions below all read this. */
  const built = []
  const failures = []
  for (const p of points) {
    try {
      built.push({ point: p, result: buildBrief({ tasksText, designText, claudeText, docs, number: p.number, registry }) })
    } catch (e) {
      failures.push(`${p.number} (${p.done ? 'archived' : 'OPEN'}): ${e.message}`)
    }
  }

  it('has a corpus worth sweeping — open points, archived points and research docs', () => {
    expect(points.length).toBeGreaterThan(300)
    expect(open.length).toBeGreaterThan(0)
    expect(points.filter((p) => p.done).length).toBeGreaterThan(0)
    expect(docs.map((d) => d.path)).toContain('docs/peoples-1890.md')
    expect(docs.map((d) => d.path)).toContain('docs/fauna-behaviour-1890.md')
  })

  it('briefs EVERY point — open AND archived — without a dangling reference', () => {
    expect(failures).toEqual([])
    expect(built).toHaveLength(points.length)
  })

  it('carries each spec VERBATIM — reconstructed from the source lines, not trusted', () => {
    // Independent of the parser: re-cut the point out of the raw work order,
    // undo the two-space indent the file uses for continuations, and demand the
    // brief contain exactly that. Catches truncation and any paraphrase.
    const off = []
    for (const { point, result } of built) {
      const raw = sourceLines.slice(point.startLine, point.endLine)
      const rebuilt = [
        raw[0].replace(/^- \[[ xX]\] \d+\.\s?/, ''),
        ...raw.slice(1).map((l) => l.replace(/^ {2}/, '')),
      ].join('\n')
      if (point.body !== rebuilt) off.push(`${point.number}: body differs from its source lines`)
      else if (!result.brief.includes(point.body)) off.push(`${point.number}: brief does not carry the body`)
    }
    expect(off).toEqual([])
  })

  it('accounts for EVERY § of every spec in the reference map — none silently dropped', () => {
    const off = []
    for (const { point, result } of built) {
      const inSpec = new Set(
        [...point.body.matchAll(/§+\s*((?:[A-Z](?:\d+(?:\.\d+)*)?)|(?:\d+(?:\.\d+)*))(?![A-Za-z0-9])/g)].map(
          (m) => m[1],
        ),
      )
      const mapped = new Set(result.refs.map((r) => r.id))
      for (const id of inSpec) if (!mapped.has(id)) off.push(`${point.number}: §${id} missing from the map`)
      for (const r of result.refs) {
        if (!result.brief.includes(`§${r.id} →`)) off.push(`${point.number}: §${r.id} not printed in the brief`)
      }
    }
    expect(off).toEqual([])
  })

  it('never carries a section from a document the spec did not name', () => {
    // Only design.md's sections are carried, and each is labelled with it. The
    // second half is the real assertion: the carried text must be byte-identical
    // to that section of design.md — never another document's section of the
    // same number.
    const designSections = parseDesignSections(designText)
    const off = []
    for (const { point, result } of built) {
      for (const s of result.sections) {
        if (s.docPath !== 'design.md') off.push(`${point.number}: carried from ${s.docPath}`)
        const real = designSections.get(s.id)
        if (!real) off.push(`${point.number}: carried §${s.id}, which design.md does not have`)
        else if (real.text !== s.text) off.push(`${point.number}: carried §${s.id} does not match design.md`)
        if (!result.brief.includes(`[from design.md §${s.id}]`)) {
          off.push(`${point.number}: §${s.id} carried without its source label`)
        }
      }
    }
    expect(off).toEqual([])
  })

  it('honours an EXPLICIT foreign attribution — the wrong-substitution case (F2)', () => {
    // Independent of the resolver's cascade: scan each spec for the plain
    // "<document> §<id>" adjacency, and demand the brief resolved that § to that
    // document. Before the fix, point 330's "peoples-1890 §8" was carried as
    // design.md §8, verbatim and unremarked.
    const others = docs.filter((d) => d.path !== 'design.md')
    const off = []
    let checked = 0
    for (const { point, result } of built) {
      for (const doc of others) {
        const base = doc.path.slice(doc.path.lastIndexOf('/') + 1).replace(/\.md$/, '')
        const re = new RegExp(`${base}(?:\\.md)?\\s*§\\s*((?:[A-Z](?:\\d+(?:\\.\\d+)*)?)|(?:\\d+(?:\\.\\d+)*))(?![A-Za-z0-9])`, 'g')
        for (const m of point.body.matchAll(re)) {
          const id = m[1]
          if (!parseDesignSections(doc.text).has(id)) continue // the doc lacks it — the cascade may look elsewhere
          checked++
          const ref = result.refs.find((r) => r.id === id && r.docPath === doc.path)
          if (!ref) off.push(`${point.number}: "${base} §${id}" was not resolved to ${doc.path}`)
        }
      }
    }
    expect(off).toEqual([])
    // The check must actually have had something to check — a corpus scan that
    // silently matched nothing would pass while proving nothing.
    expect(checked).toBeGreaterThan(10)
  })

  it('resolves references into the research documents at all (H2)', () => {
    const hit = new Set()
    for (const { result } of built) {
      for (const r of result.refs) if (r.docPath && r.docPath.startsWith('docs/')) hit.add(r.docPath)
    }
    expect([...hit].sort()).toContain('docs/peoples-1890.md')
    expect([...hit].sort()).toContain('docs/fauna-behaviour-1890.md')
  })

  it('keeps EVERY brief — archived ones too — under the measured ceiling', () => {
    const over = built
      .map(({ point, result }) => ({ n: point.number, t: result.tokens }))
      .filter((x) => x.t > BRIEF_TOKEN_CEILING)
    expect(over).toEqual([])
  })

  it('is far cheaper than the reading assignment it replaces', () => {
    const wholesale = estimateTokens(tasksText) + estimateTokens(designText)
    const median = built.map((b) => b.result.tokens).sort((a, b) => a - b)[Math.floor(built.length / 2)]
    expect(median * 20).toBeLessThan(wholesale)
  })
})
