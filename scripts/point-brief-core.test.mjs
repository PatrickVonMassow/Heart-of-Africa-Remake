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
import { CALL_DISCIPLINE_DE, callDisciplineTopics } from './batch-autostart-core.mjs'
import {
  ACCEPTANCE_CRITERION_FALLBACK_MAX,
  ADOPTION_DEPTH_CAP,
  BriefError,
  BRIEF_TOKEN_CEILING,
  CALL_DISCIPLINE,
  DOC_WINDOW,
  classifyPointRefs,
  acceptanceCriteriaFrom,
  aliasesFor,
  assembleBrief,
  buildBrief,
  buildDocRegistry,
  compareSectionIds,
  estimateTokens,
  extractPointRefs,
  findPoint,
  parseDesignSections,
  parseSliceDeclarations,
  parseWorkOrderPoints,
  sliceDocsFor,
  pointTitle,
  resolveSectionRefs,
  workOrderFingerprint,
} from './point-brief-core.mjs'

const ROOT = resolve(process.cwd())

const TASKS = [
  '# TASKS',
  '',
  '## Checklist',
  '',
  '- [ ] 400. AN OPEN POINT — it references design.md §4.2 and, later, §19.8.',
  '  It also says: the ports of point 288 are known from the start.',
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
  '1. **Build/start.** It builds.',
  '22. **Health and afflictions.** The health system is implemented.',
  '',
  '### 7.2 Self-Verification',
  'The procedure.',
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

/** A work order that also holds a point 22 — the §22 / criterion-22 collision. */
const ALL_WITH_22 = `${ALL}\n\n- [x] 22. AN ARCHIVED POINT about the ocean at full zoom-out.`

const args = { tasksText: ALL, designText: DESIGN, claudeText: CLAUDE, docs: DOCS }

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
    expect(p.body).toContain('the ports of point 288')
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

describe('the ambiguity the cascade cannot resolve (fix 1)', () => {
  it('keeps every OTHER candidate that holds the same id', () => {
    // design.md §8 and CLAUDE.md §8 both exist; peoples-1890 §8 too, and it is
    // named in the spec. The winner is a cascade decision, so the losers must
    // survive it — otherwise the map states a guess as a fact.
    const [ref] = resolveIn('peoples-1890 §8 is the record')
    expect(ref.docPath).toBe('docs/peoples-1890.md')
    expect(ref.alsoIn.map((a) => a.docPath).sort()).toEqual(['CLAUDE.md', 'design.md'])
  })

  it('leaves alsoIn empty when the winner is the ONLY document holding the id', () => {
    expect(resolveIn('§4.2 applies')[0].alsoIn).toEqual([])
  })

  it('does NOT count a document the spec never named and that is no default', () => {
    // fauna-behaviour-1890 has §B2.1 but is unnamed here, so it is no candidate
    // and no alternative reading — listing it would be noise, not honesty.
    const [ref] = resolveIn('peoples-1890 §3.1 is the finding')
    expect(ref.alsoIn).toEqual([])
  })

  it('flags BOTH sides when ONE id wins for TWO documents inside one spec', () => {
    const refs = resolveIn('the research docs (peoples-1890 §8) and the rule in CLAUDE.md §8')
    const peoples = refs.find((r) => r.docPath === 'docs/peoples-1890.md')
    const claude = refs.find((r) => r.docPath === 'CLAUDE.md')
    expect(peoples.alsoIn.map((a) => a.docPath)).toContain('CLAUDE.md')
    expect(claude.alsoIn.map((a) => a.docPath)).toContain('docs/peoples-1890.md')
  })

  it('prints the loser, with its TITLE, on the map line', () => {
    const tasks = ALL.replace('design.md §4.2 and, later, §19.8', 'peoples-1890 §8')
    const { brief } = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(brief).toMatch(/§8 → docs\/peoples-1890\.md §8 .*AMBIGUOUS: .*design\.md "Valuables"/)
    expect(brief).toMatch(/ALSO have a §8/)
  })
})

describe('a bare §N that may be a CLAUDE.md §7.1 criterion (fix 2)', () => {
  it('reads the criteria out of §7.1 — list items, which no heading parser sees', () => {
    const criteria = acceptanceCriteriaFrom(parseDesignSections(CLAUDE))
    expect(criteria.get(22)).toBe('Health and afflictions')
    expect(criteria.get(1)).toBe('Build/start')
    expect(criteria.has(400)).toBe(false)
  })

  const with22 = ALL_WITH_22.replace('design.md §4.2 and, later, §19.8', '§22 the poor-condition vultures')

  it('names BOTH readings on the map line of a work-order-point resolution', () => {
    const { brief } = buildBrief({ ...args, tasksText: with22, number: 400 })
    expect(brief).toMatch(/§22 → WORK-ORDER POINT 22/)
    expect(brief).toMatch(/ACCEPTANCE CRITERION 22 "Health and afflictions"/)
  })

  it('warns on the CROSS-REFERENCE line too — that is where the claim is asserted', () => {
    const { brief } = buildBrief({ ...args, tasksText: with22, number: 400 })
    expect(brief).toMatch(
      /point 22 \[done\]: AN ARCHIVED POINT[\s\S]*?acceptance criterion 22 "Health and afflictions" — not this point\./,
    )
  })

  it('says nothing about a number §7.1 does not carry', () => {
    const { brief } = buildBrief({ ...args, number: 400 })
    expect(brief).toContain('point 288 [done]:')
    expect(brief).not.toMatch(/criterion 288/)
  })

  it('falls back to the documented 1..32 range when CLAUDE.md cannot be read', () => {
    const { brief } = buildBrief({ ...args, tasksText: with22, claudeText: '', number: 400 })
    expect(brief).toMatch(/ACCEPTANCE CRITERION 22/)
  })
})

describe('the SOURCE REVISION stamp (fix 3)', () => {
  it('fingerprints the work-order CONTENT, line endings normalised', () => {
    expect(workOrderFingerprint(ALL)).toBe(workOrderFingerprint(ALL.replace(/\n/g, '\r\n')))
    expect(workOrderFingerprint(ALL)).not.toBe(workOrderFingerprint(`${ALL}\n- [ ] 402. New.`))
  })

  it('prints ONE header line with HEAD, the dirty flag and the fingerprint', () => {
    const { brief } = buildBrief({ ...args, number: 401, revision: { head: 'abc1234', dirty: true } })
    const line = brief.split('\n').find((l) => l.startsWith('SOURCE REVISION:'))
    expect(line).toContain('HEAD abc1234 +dirty')
    expect(line).toContain(`work-order ${workOrderFingerprint(ALL)}`)
    expect(brief.split('\n').filter((l) => l.startsWith('SOURCE REVISION:'))).toHaveLength(1)
  })

  it('distinguishes a CLEAN tree from an UNKNOWN one — no git answer is not clean', () => {
    const clean = buildBrief({ ...args, number: 401, revision: { head: 'abc1234', dirty: false } }).brief
    expect(clean).toContain('HEAD abc1234 · work-order')
    const unknown = buildBrief({ ...args, number: 401 }).brief
    expect(unknown).toMatch(/HEAD unknown \+dirty\?/)
  })

  it('changes under the SAME HEAD when the work order was edited — the reason it exists', () => {
    const rev = { head: 'abc1234', dirty: true }
    const stampOf = (text) =>
      buildBrief({ ...args, tasksText: text, number: 401, revision: rev }).brief
        .split('\n')
        .find((l) => l.startsWith('SOURCE REVISION:'))
    expect(stampOf(ALL)).not.toBe(stampOf(ALL.replace('no references at all', 'no references, revised')))
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
      'It also says: the ports of point 288 are known from the start.',
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

// ---------------------------------------------------------------------------
// ADOPTION (point 516): a point that declares ANOTHER point's specification
// binding must carry it, not name it. Measured on point 488, whose brief named
// the very specification it called binding and sent its agent to cut a second
// brief before it could start.
// ---------------------------------------------------------------------------
describe('adoption — the specification a point declares binding', () => {
  const ADOPTION_TASKS = [
    '# TASKS',
    '',
    "- [ ] 700. THE ADOPTING POINT. Point 701's specification is binding with one",
    '  amendment from point 702: the band follows the walkable boundary.',
    '',
    '- [ ] 703. THE CHAIN HEAD — per point 700 the whole arrangement holds here too.',
    '',
    '- [ ] 704. A MERE MENTION: the fragile family of point 701 is the reason, and',
    '  point 702 moved the village.',
    '',
    '- [ ] 705. A DEAD ADOPTION — per point 999, which no work order has.',
    '',
    '- [ ] 706. TALKS ABOUT THE WORDING: point 700 reads "per point 701", which is a',
    '  quotation of an adopting phrase, not an adoption.',
    '',
    '- [ ] 707. THE CRITERION COLLISION — per pt. 22 the health bar keeps its badges.',
    '',
    '- [ ] 708. A CYCLE — per point 709.',
    '',
    '- [ ] 709. THE OTHER HALF OF THE CYCLE — per point 708.',
    '',
    '- [ ] 710. THE EXPLICIT FORM — per work-order point 22, the ocean point.',
    '',
    '## Archive',
    '',
    '- [x] 701. THE ADOPTED SPECIFICATION. It cites design.md §4.2, demands the band',
    '  sit at the same radius the leave check uses, and per point 702 reads the',
    '  boundary shape from one source.',
    '',
    '- [x] 702. THE AMENDING POINT — the walkable region is no longer a plain circle.',
    '',
    '- [x] 22. AN ARCHIVED POINT about the ocean at full zoom-out.',
  ].join('\n')

  const adoptArgs = { tasksText: ADOPTION_TASKS, designText: DESIGN, claudeText: CLAUDE, docs: DOCS }
  const build = (n) => buildBrief({ ...adoptArgs, number: n })
  const bodyOf = (n) => findPoint(ADOPTION_TASKS, n).body

  it('reads an ADOPTING wording as adoption and a MENTIONING one as a mention', () => {
    const adopting = classifyPointRefs(bodyOf(700), { selfNumber: 700 })
    expect(adopting.adopted.map((a) => a.number)).toEqual([701])
    expect(adopting.adopted[0].pattern).toBe('possessive-spec')
    // 702 is named for orientation — the amendment is stated in the sentence.
    expect(classifyPointRefs(bodyOf(704), { selfNumber: 704 }).adopted).toEqual([])
  })

  it('recognises every adopting construction the queue writes', () => {
    const forms = [
      ['per point 701', 'per'],
      ['as specified in point 701', 'as-specified-in'],
      ['the rules of point 701 hold', 'spec-of'],
      ['according to point 701', 'according-to'],
      ['governed by point 701', 'governed-by'],
      ['unchanged from point 701', 'unchanged-from'],
      ['it implements point 701', 'implements'],
      ['it follows point 701', 'follows'],
      ['point 701 is binding', 'binding'],
      ["point 701's specification", 'possessive-spec'],
    ]
    for (const [text, pattern] of forms) {
      const { adopted } = classifyPointRefs(`Something, ${text}, and then more.`)
      expect(adopted.map((a) => a.number), text).toEqual([701])
      expect(adopted[0].pattern, text).toBe(pattern)
    }
  })

  it('does NOT read an ordinary reference as adoption', () => {
    for (const text of [
      'the fragile family of point 701',
      'one amendment from point 701',
      'point 701 moved the village',
      'delivered under point 701, which closed it',
    ]) {
      expect(classifyPointRefs(`A sentence: ${text}.`).adopted, text).toEqual([])
    }
  })

  it('carries the adopted specification VERBATIM, under its number', () => {
    const { brief, adopted } = build(700)
    expect(adopted.map((a) => a.number)).toEqual([701, 702])
    expect(brief).toContain('--- ADOPTED SPECIFICATIONS')
    expect(brief).toContain(bodyOf(701))
    expect(brief).toContain('[work-order point 701 (done), ADOPTED by point 700')
  })

  it('leaves a merely mentioned point at its ONE identifying line', () => {
    const { brief } = build(704)
    expect(brief).not.toContain('--- ADOPTED SPECIFICATIONS')
    expect(brief).not.toContain(bodyOf(701))
    expect(brief).toContain('point 701 [done]:')
  })

  it('adds NOTHING to a brief that adopts nothing — the whole value is the size', () => {
    // Not one line: the brief is worth ~1.8k tokens against ~108k of wholesale
    // reading, and a block printed for every point would spend that saving on
    // points the change does not concern.
    const { brief } = build(704)
    for (const marker of ['--- ADOPTED SPECIFICATIONS', 'DEPTH CAP', 'DEEPER THAN THE CAP', '→ ADOPTED']) {
      expect(brief, marker).not.toContain(marker)
    }
  })

  it('resolves ONE further level and STATES the cap instead of applying it silently', () => {
    const { brief, adopted, adoptionBeyond } = build(703)
    expect(adopted.map((a) => `${a.number}@${a.depth}`)).toEqual(['700@1', '701@2'])
    expect(brief).toContain(`DEPTH CAP ${ADOPTION_DEPTH_CAP}:`)
    // 702 is adopted by 701, which already sits at the cap — named, never dropped.
    expect(adoptionBeyond.map((b) => b.number)).toEqual([702])
    expect(brief).toContain('DEEPER THAN THE CAP')
    expect(brief).toContain('node scripts/point-brief.mjs 702')
    expect(brief).not.toContain(bodyOf(702))
  })

  it('FAILS LOUDLY on an adopted point that resolves nowhere', () => {
    expect(() => build(705)).toThrow(BriefError)
    expect(() => build(705)).toThrow(/adopts the specification of point 999/)
  })

  it('names each adopted point AS ADOPTED on the reference map', () => {
    const map = build(700)
      .brief.split('\n')
      .filter((l) => l.startsWith('- point '))
    expect(map.some((l) => /^- point 701 → ADOPTED: its specification is binding here/.test(l))).toBe(true)
    expect(map.some((l) => l.includes('carried in full above, depth 1'))).toBe(true)
    expect(map.some((l) => /^- point 702 → ADOPTED: /.test(l) && l.includes('depth 2'))).toBe(true)
  })

  it('names a § the ADOPTED point cites — without carrying that section', () => {
    const { brief } = build(700)
    expect(brief).toContain('§4.2 → design.md §4.2 "Peoples (22)" — cited by ADOPTED point 701')
    expect(brief).not.toContain('[from design.md §4.2]')
  })

  it('treats an adopting phrase inside a QUOTATION as a mention, and says so', () => {
    const { brief, adopted, adoptionQuoted } = build(706)
    expect(adopted).toEqual([])
    expect(adoptionQuoted.map((q) => q.number)).toEqual([701])
    expect(brief).toContain('stands inside a QUOTATION')
    expect(brief).not.toContain(bodyOf(701))
  })

  it('refuses to inline a number that may be a §7.1 CRITERION instead', () => {
    // "per pt. 22" in this corpus means the health CRITERION, not the archived
    // point 22 about the ocean. Carrying the wrong body under a heading that
    // says it is binding is the one error the brief must not make.
    const { brief, adopted, adoptionAmbiguous } = build(707)
    expect(adopted).toEqual([])
    expect(adoptionAmbiguous.map((a) => a.number)).toEqual([22])
    expect(brief).toContain('ACCEPTANCE CRITERION 22 "Health and afflictions"')
    expect(brief).toContain('node scripts/point-brief.mjs 22')
    expect(brief).not.toContain('--- ADOPTED SPECIFICATIONS')
    // It stays an ordinary cross-reference, with the criterion warning it always had.
    expect(brief).toContain('point 22 [done]:')
  })

  it('carries it anyway when the spec writes "work-order point", which decides it', () => {
    const { brief, adopted } = build(710)
    expect(adopted.map((a) => a.number)).toEqual([22])
    expect(brief).toContain(bodyOf(22))
  })

  it('survives a CYCLE instead of walking it forever', () => {
    const { adopted } = build(708)
    expect(adopted.map((a) => a.number)).toEqual([709])
  })

  it('drops the adopted point from the identification list — it is carried, not named', () => {
    // 701 is adopted directly, 702 through 701: both are in the brief in full,
    // so an identification line for either would only repeat their first words.
    const { brief, referenced } = build(700)
    expect(referenced).toEqual([])
    expect(brief).not.toContain('--- CROSS-REFERENCED POINTS')
  })
})

// ---------------------------------------------------------------------------
// THE SLICE DOCUMENT (point 516 item 5): one level out from the sections. The
// brief named design.md sections and knew no other spec document, so
// docs/communication-poc-spec.md — which pins the loop for the whole 477–488
// slice — was found only through a code comment while point 487 was built.
// ---------------------------------------------------------------------------
describe('the spec document a point’s slice belongs to', () => {
  const SPEC_DOC = [
    '# The communication PoC',
    '',
    'The brief answers the open question for a first playable slice. This',
    'document is the reference the work-order points 477–488 cite; it states the',
    'decisions the brief left to the build.',
  ].join('\n')
  const ONE_POINT_DOC = ['# Levers', '', 'Second phase of work-order point 361. The figures live here.'].join('\n')
  const LATE_MENTION = [
    '# A long document',
    ...Array.from({ length: 30 }, (_, i) => `Line ${i} of ordinary prose.`),
    'It should be filed as a work-order point 477 like everything else.',
  ].join('\n')
  const SLICE_DOCS = [
    { path: 'docs/communication-poc-spec.md', text: SPEC_DOC },
    { path: 'docs/picture-check-levers.md', text: ONE_POINT_DOC },
    { path: 'docs/batch-autonomy.md', text: LATE_MENTION },
  ]

  it('reads a declared RANGE, and a single declared point', () => {
    const decls = parseSliceDeclarations(SLICE_DOCS)
    const range = decls.find((d) => d.path === 'docs/communication-poc-spec.md')
    expect(range.numbers).toHaveLength(12)
    expect(range.numbers[0]).toBe(477)
    expect(range.numbers.at(-1)).toBe(488)
    expect(range.scope).toBe('work-order points 477–488')
    expect(range.declaration).toBe('This document is the reference the work-order points 477–488 cite')
    expect(decls.find((d) => d.path === 'docs/picture-check-levers.md').numbers).toEqual([361])
  })

  it('takes a declaration only from the OPENING — deeper down it is prose', () => {
    // The measured false positive: docs/batch-autonomy.md talks about filing a
    // work-order point 2000 lines in, and governs no slice at all.
    expect(parseSliceDeclarations(SLICE_DOCS).some((d) => d.path === 'docs/batch-autonomy.md')).toBe(false)
    expect(sliceDocsFor(SLICE_DOCS, 477).map((d) => d.path)).toEqual(['docs/communication-poc-spec.md'])
  })

  it('NAMES the document in the brief of every point in the slice', () => {
    const tasks = ['# TASKS', '', '- [ ] 487. DIGGING AT THE ROCK. The loop is learn, understand, dig.'].join('\n')
    const { brief, sliceDocs } = buildBrief({ ...args, tasksText: tasks, docs: SLICE_DOCS, number: 487 })
    expect(sliceDocs.map((d) => d.path)).toEqual(['docs/communication-poc-spec.md'])
    expect(brief).toContain("--- THE SPEC DOCUMENT THIS POINT'S SLICE BELONGS TO ---")
    expect(brief).toContain('docs/communication-poc-spec.md — declares itself for work-order points 477–488')
    // Named, never carried: the document is thousands of words, and the brief's
    // whole value is that it is not.
    expect(brief).not.toContain('it states the decisions the brief left to the build')
  })

  it('says an unnamed slice document is a FINDING, not a search task', () => {
    const tasks = ['# TASKS', '', '- [ ] 487. DIGGING AT THE ROCK.'].join('\n')
    const { brief } = buildBrief({ ...args, tasksText: tasks, docs: SLICE_DOCS, number: 487 })
    expect(brief).toMatch(/is NOT named here is a FINDING, not a search task/)
    expect(brief).toMatch(/declare its work-order points in its opening lines/)
  })

  it('adds nothing to the brief of a point no document declares', () => {
    const tasks = ['# TASKS', '', '- [ ] 700. A POINT NO SPEC DOCUMENT CLAIMS.'].join('\n')
    const { brief, sliceDocs } = buildBrief({ ...args, tasksText: tasks, docs: SLICE_DOCS, number: 700 })
    expect(sliceDocs).toEqual([])
    expect(brief).not.toContain("--- THE SPEC DOCUMENT THIS POINT'S SLICE BELONGS TO ---")
  })

  it('ignores an absurd range rather than claiming hundreds of points', () => {
    const junk = [{ path: 'docs/junk.md', text: '# J\n\nSee work-order points 1-9999 for context.' }]
    expect(parseSliceDeclarations(junk)).toEqual([])
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

// ---------------------------------------------------------------------------
// The return protocol (point 458): what the agent writes BACK is part of the
// brief, because the report is the only thing that enters the main session.
// ---------------------------------------------------------------------------
describe('the WHAT YOU RETURN block', () => {
  /** Every field the block must demand — the whole reason it exists. */
  const REQUIRED = [
    [/WORK-ORDER POINT NUMBER/, 'the point number'],
    [/BRANCH NAME/, 'the branch'],
    [/COMMIT SHAs, in the order/, 'the SHAs in order'],
    [/npm run build/, 'the build gate'],
    [/npm run lint/, 'the lint gate'],
    [/npm run test:unit/, 'the unit gate'],
    [/each browser suite BY NAME/, 'the browser suites'],
    [/VERDICT/, 'a verdict per gate'],
    [/CHANGED FILES as PATHS ONLY/, 'changed files as paths'],
    [/OPEN ITEMS AND ESCALATIONS/, 'open items'],
    [/did this BRIEF SUFFICE, and what was MISSING/, 'the point-365 question'],
  ]

  it('closes an assembled brief — and is the FINAL section, after the notes', () => {
    const brief = assembleBrief({
      point: { number: 400, done: false, body: 'x' },
      notes: ['a note'],
    })
    expect(brief).toContain('--- WHAT YOU RETURN ---')
    expect(brief.indexOf('--- WHAT YOU RETURN ---')).toBeGreaterThan(brief.indexOf('--- NOTES ---'))
    // Nothing may follow it: a demand buried mid-document is read as background.
    expect(brief.slice(brief.indexOf('--- WHAT YOU RETURN ---'))).not.toContain('\n--- ')
  })

  /**
   * The BLOCK's own text, not the whole brief. Asserting against the brief would
   * let a future HEADER line that happens to mention a gate command stand in for
   * a dropped demand — the check must fail when the block loses one.
   */
  const blockOf = (point) => {
    const brief = assembleBrief({ point })
    const at = brief.indexOf('--- WHAT YOU RETURN ---')
    expect(at, 'the brief has no return block at all').toBeGreaterThan(-1)
    return brief.slice(at)
  }

  it('names EVERY field it demands back', () => {
    const block = blockOf({ number: 400, done: false, body: 'x' })
    for (const [re, what] of REQUIRED) expect(block, `demands ${what}`).toMatch(re)
  })

  it('names the point number it is the protocol for', () => {
    expect(assembleBrief({ point: { number: 458, done: false, body: 'x' } })).toContain(
      'WORK-ORDER POINT NUMBER (458)',
    )
  })

  it('FORBIDS the prose the merge does not read, and says why', () => {
    const block = blockOf({ number: 400, done: false, body: 'x' })
    for (const banned of ['diffs', 'file contents', 'command logs', 'code blocks', 'restated spec text']) {
      expect(block, `forbids ${banned}`).toContain(banned)
    }
    expect(block).toMatch(/merge reads git .*never reads your report/)
  })

  it('gives the length as GUIDANCE, never as a cap that could truncate an escalation', () => {
    const block = blockOf({ number: 400, done: false, body: 'x' })
    expect(block).toMatch(/under ~40 lines/)
    expect(block).toMatch(/GUIDANCE, not a cap/)
    expect(block).toMatch(/never truncate/)
  })

  it('survives a brief with no sections, no cross-references and no notes', () => {
    const block = blockOf({ number: 401, done: false, body: 'x' })
    for (const [re] of REQUIRED) expect(block).toMatch(re)
  })

  it('rides along on a real built brief — OPEN and ARCHIVED alike', () => {
    for (const n of [400, 401, 288]) {
      const { brief } = buildBrief({ ...args, number: n })
      expect(brief, `point ${n}`).toContain('--- WHAT YOU RETURN ---')
      expect(brief).toContain(`WORK-ORDER POINT NUMBER (${n})`)
    }
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

  const briefOf = (n) => {
    const b = built.find((x) => x.point.number === n)
    expect(b, `point ${n} must be in the corpus for this check to mean anything`).toBeTruthy()
    return b.result.brief
  }
  const mapLines = (n, prefix) => briefOf(n).split('\n').filter((l) => l.startsWith(prefix))

  it('names the OTHER document holding the id — the real point-265 §4.4 collision', () => {
    // design.md §4.4 "Landmarks" and docs/fauna-behaviour-1890.md §4.4 "Vultures
    // and the dying animal". The spec means the former (it says so: "folklore
    // landmark"); the cascade hands two of the three occurrences to the latter.
    // Existence cannot settle it, so BOTH lines must name the alternative.
    const design = mapLines(265, '- §4.4 → design.md')
    const fauna = mapLines(265, '- §4.4 → docs/fauna-behaviour-1890.md')
    expect(design).toHaveLength(1)
    expect(fauna).toHaveLength(1)
    expect(design[0]).toMatch(/AMBIGUOUS: docs\/fauna-behaviour-1890\.md "Vultures and the dying animal" ALSO has a §4\.4/)
    expect(fauna[0]).toMatch(/AMBIGUOUS: design\.md "Landmarks" ALSO has a §4\.4/)
  })

  it('de-silences the point-160 residual — its §8/§9 also live in the research docs', () => {
    for (const [id, doc] of [['8', 'docs/peoples-1890.md'], ['9', 'docs/climate-1890.md']]) {
      const line = mapLines(160, `- §${id} → design.md`)
      expect(line, `point 160 resolves §${id} to design.md`).toHaveLength(1)
      expect(line[0]).toContain('AMBIGUOUS:')
      expect(line[0]).toContain(doc)
    }
  })

  it('names the §7.1 criterion behind a bare §22 — the real point-265 case', () => {
    const brief = briefOf(265)
    expect(brief).toMatch(
      /§22 → WORK-ORDER POINT 22 .*AMBIGUOUS: may instead mean CLAUDE\.md §7\.1 ACCEPTANCE CRITERION 22 "Health and afflictions"/,
    )
    // The cross-reference list is where the wrong point is actually asserted.
    expect(brief).toMatch(
      /point 22 \[done\]:[\s\S]*?\n {2}AMBIGUOUS: .*acceptance criterion 22 "Health and afflictions" — not this point\./,
    )
  })

  it('flags EVERY corpus reference whose id another candidate document also holds', () => {
    const missing = []
    let flagged = 0
    for (const { point, result } of built) {
      for (const r of result.refs) {
        if (!r.alsoIn?.length) continue
        flagged++
        const line = result.brief.split('\n').find((l) => l.startsWith(`- §${r.id} → ${r.docPath} `))
        if (!line || !line.includes('AMBIGUOUS:')) missing.push(`${point.number}: §${r.id} unflagged`)
      }
    }
    expect(missing).toEqual([])
    // Teeth: a corpus scan that matched nothing would pass while proving nothing.
    expect(flagged).toBeGreaterThan(20)
  })

  it('flags EVERY corpus §N that could be a §7.1 acceptance criterion instead', () => {
    const criteria = acceptanceCriteriaFrom(registry.claude.sections)
    expect(criteria.size).toBeGreaterThan(30)
    const missing = []
    let flagged = 0
    for (const { point, result } of built) {
      for (const r of result.refs) {
        if (r.how !== 'work-order-point' || !criteria.has(Number(r.id))) continue
        flagged++
        if (!result.brief.includes(`§${r.id} → WORK-ORDER POINT ${r.id}`)) continue
        const line = result.brief.split('\n').find((l) => l.startsWith(`- §${r.id} → WORK-ORDER POINT`))
        if (!line.includes(`ACCEPTANCE CRITERION ${r.id}`)) missing.push(`${point.number}: §${r.id} unflagged`)
      }
    }
    expect(missing).toEqual([])
    expect(flagged).toBeGreaterThan(0)
  })

  it('stamps every brief with the work order it was cut from', () => {
    const fingerprint = workOrderFingerprint(tasksText)
    for (const { point, result } of built) {
      const line = result.brief.split('\n').find((l) => l.startsWith('SOURCE REVISION:'))
      expect(line, `point ${point.number} has no revision stamp`).toBeTruthy()
      expect(line).toContain(`work-order ${fingerprint}`)
    }
  })

  it('resolves references into the research documents at all (H2)', () => {
    const hit = new Set()
    for (const { result } of built) {
      for (const r of result.refs) if (r.docPath && r.docPath.startsWith('docs/')) hit.add(r.docPath)
    }
    expect([...hit].sort()).toContain('docs/peoples-1890.md')
    expect([...hit].sort()).toContain('docs/fauna-behaviour-1890.md')
  })

  it('closes EVERY brief with the return protocol (point 458)', () => {
    const off = []
    for (const { point, result } of built) {
      const tail = result.brief.slice(result.brief.lastIndexOf('--- '))
      if (!tail.startsWith('--- WHAT YOU RETURN ---')) off.push(`${point.number}: does not close with it`)
      else if (!tail.includes(`WORK-ORDER POINT NUMBER (${point.number})`)) {
        off.push(`${point.number}: the block names the wrong point`)
      }
    }
    expect(off).toEqual([])
  })

  // ADOPTION over the REAL corpus (point 516). The synthetic cases above pin the
  // classifier; these pin the two things only the real work order can show —
  // that the measured case is fixed, and that the classifier stayed off the
  // hundreds of points it must not touch.
  it('carries point 352’s specification in full into the brief for 488 — the measured case', () => {
    const p352 = points.find((p) => p.number === 352)
    expect(p352, 'point 352 must be in the corpus for this check to mean anything').toBeTruthy()
    const brief = briefOf(488)
    expect(brief).toContain('--- ADOPTED SPECIFICATIONS')
    expect(brief).toContain(p352.body)
    expect(brief).toMatch(/- point 352 → ADOPTED: its specification is binding here/)
  })

  it('carries EVERY adopted body verbatim, and only where a point really adopts', () => {
    const off = []
    let adopting = 0
    for (const { point, result } of built) {
      if (result.adopted.length) adopting++
      for (const a of result.adopted) {
        if (!result.brief.includes(a.point.body)) off.push(`${point.number}: adopted ${a.number} not carried`)
        if (!result.brief.includes(`point ${a.number} → ADOPTED`)) off.push(`${point.number}: ${a.number} unmapped`)
      }
      if (!result.adopted.length && !result.adoptionBeyond.length) {
        if (result.brief.includes('--- ADOPTED SPECIFICATIONS')) off.push(`${point.number}: empty adoption block`)
      }
    }
    expect(off).toEqual([])
    // The corpus really does adopt — a classifier that matched nothing would
    // pass every assertion above while delivering the old, starving brief.
    expect(adopting).toBeGreaterThan(0)
    // …and it stays the exception: adoption is a wording a handful of points
    // use, so a match on a large share of the queue means the patterns drifted
    // into ordinary reference prose.
    expect(adopting).toBeLessThan(points.length / 10)
  })

  it('never inlines a point number that could be a §7.1 criterion instead', () => {
    // Point 84's "per pt. 32" means the RENDER-PIPELINE criterion, not the
    // work-order point 32 about design.md's prose.
    const off = built.flatMap(({ point, result }) =>
      result.adopted.filter((a) => a.number <= ACCEPTANCE_CRITERION_FALLBACK_MAX && !/work-order/i.test(a.phrase))
        .map((a) => `${point.number}: inlined the ambiguous ${a.number}`),
    )
    expect(off).toEqual([])
    expect(briefOf(84)).toMatch(/point 32 → adopting wording .* ACCEPTANCE CRITERION 32/)
  })

  it('names docs/communication-poc-spec.md to the whole slice it declares', () => {
    // The measured case: point 487 found this document through a code comment.
    const claimed = built.filter(({ result }) =>
      result.sliceDocs.some((d) => d.path === 'docs/communication-poc-spec.md'),
    )
    expect(claimed.map((b) => b.point.number).sort((a, b) => a - b)).toEqual([
      477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488,
    ])
    expect(briefOf(487)).toContain('docs/communication-poc-spec.md — declares itself for work-order points 477–488')
  })

  it('claims no point no document declares — the block stays the exception', () => {
    const withDoc = built.filter(({ result }) => result.sliceDocs.length)
    expect(withDoc.length).toBeGreaterThan(0)
    expect(withDoc.length).toBeLessThan(points.length / 10)
    const off = built
      .filter(
        ({ result }) =>
          !result.sliceDocs.length && result.brief.includes("--- THE SPEC DOCUMENT THIS POINT'S SLICE"),
      )
      .map((b) => b.point.number)
    expect(off).toEqual([])
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

  // ONE TURN, SEVERAL CALLS (point 593). Enforcement is by prompt, so the only
  // thing a test can hold is DELIVERY: the paragraph must reach every delegated
  // agent, and it must not drift apart from the German rendering the batch
  // resume prompt carries.
  it('hands every brief the call-discipline paragraph', () => {
    const off = built.filter(({ result }) => !result.brief.includes(CALL_DISCIPLINE.join('\n')))
    expect(off.map((b) => b.point.number)).toEqual([])
  })
})

describe('the call-discipline paragraph, English side (point 593)', () => {
  const en = CALL_DISCIPLINE.join('\n')

  it('covers every named topic', () => {
    const missing = callDisciplineTopics()
      .filter((t) => !t.en.test(en))
      .map((t) => t.id)
    expect(missing).toEqual([])
  })

  it('says the same thing as the German rendering in the batch prompt', () => {
    // The two prompts are in different languages, so the shared topic table is
    // the only thing that can compare them. An edit that drops "screenshots in
    // small groups" from ONE of the two fails here rather than drifting.
    const drifted = callDisciplineTopics()
      .filter((t) => t.en.test(en) !== t.de.test(CALL_DISCIPLINE_DE))
      .map((t) => t.id)
    expect(drifted).toEqual([])
  })

  it('excludes both ways the shortcut goes wrong', () => {
    expect(en).toMatch(/stays SEQUENTIAL/)
    expect(en).toMatch(/acting on a value you have not seen/)
    expect(en).toMatch(/MUTABLE state/)
  })

  it('keeps judgment quality ahead of batching for the picture check', () => {
    // Point 375's shutter is worth nothing if a frame is shrunk to fit more
    // reads into one turn, so the paragraph says so explicitly.
    expect(en).toMatch(/judgment quality outranks batching/)
    expect(en).toMatch(/full resolution/)
  })
})
