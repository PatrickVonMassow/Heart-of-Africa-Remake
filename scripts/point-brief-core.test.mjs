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
  BriefError,
  BRIEF_TOKEN_CEILING,
  CALL_DISCIPLINE,
  DOC_WINDOW,
  VERIFICATION_LADDER,
  acceptanceCriteriaFrom,
  aliasesFor,
  assembleBrief,
  buildBrief,
  buildDocRegistry,
  compareSectionIds,
  estimateTokens,
  extractPointRefs,
  findPoint,
  isRenderPoint,
  orientationBlock,
  parseDesignSections,
  parseDiffSuiteMap,
  pathsIn,
  plannedCheck,
  parseWorkOrderPoints,
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
    expect(brief).not.toContain('THE VERIFICATION LADDER')
  })

  it('puts the ladder AFTER the spec — it is only readable once the point is known', () => {
    const brief = assembleBrief({
      point: { number: 1, done: false, body: 'the spec body' },
      ladder: VERIFICATION_LADDER,
    })
    expect(brief.indexOf('the spec body')).toBeLessThan(brief.indexOf('THE VERIFICATION LADDER'))
  })
})

// ---------------------------------------------------------------------------
// The verification ladder (point 595): the cheap rung is only worth anything
// BEFORE the run, so the brief carries it for every point that can move a
// picture — and says in the same breath what it does NOT prove.
// ---------------------------------------------------------------------------
describe('the verification ladder', () => {
  it('classifies a point that names the picture, a backend or a browser suite as a render point', () => {
    for (const spec of [
      'the rendered coast still steps on WebGPU',
      'a screenshot of the chief hut',
      'the enrichments.mjs staging pins the wrong cell',
      'the herds pop in at zoom 0.5',
      'the shader builds off the critical path',
    ]) {
      expect(isRenderPoint(spec), spec).toBe(true)
    }
  })

  it('leaves a point that touches no picture alone', () => {
    for (const spec of [
      'the commit-msg hook refuses a trailer naming no model',
      'TASKS.md is split into open points and an archive',
      'the chat inbox hands untrusted input on as input, not authorization',
    ]) {
      expect(isRenderPoint(spec), spec).toBe(false)
    }
  })

  it('carries the ladder in a render point’s brief and not in another’s', () => {
    const tasks = ALL.replace('AN OPEN POINT', 'A RENDER POINT — the rendered river shows steps')
    const rendered = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(rendered.render).toBe(true)
    expect(rendered.brief).toContain('THE VERIFICATION LADDER')
    const plain = buildBrief({ ...args, number: 401 })
    expect(plain.render).toBe(false)
    expect(plain.brief).not.toContain('THE VERIFICATION LADDER')
  })

  it('names the cheapest rung AND refuses to let it count as the proof', () => {
    const text = VERIFICATION_LADDER.join('\n')
    // The rung nobody was routed to (point 566, unused until 09.08.2026) …
    expect(text).toMatch(/--section=<name>/)
    expect(text).toMatch(/run-all\.mjs <suite> --section=list/)
    // … the unit layer's half of the SAME rule, not a second one …
    expect(text).toMatch(/vitest run <path>/)
    expect(text).toMatch(/--changed/)
    expect(text).toMatch(/tsc --incremental/)
    // … and what none of it proves.
    expect(text).toMatch(/NEVER AN ACCEPTANCE/)
    expect(text).toMatch(/PARTIAL/)
    expect(text).toMatch(/WHOLE suite/)
  })

  it('binds the final proof to the merge candidate and to a reported git HEAD', () => {
    const text = VERIFICATION_LADDER.join('\n')
    expect(text).toMatch(/EXACTLY ONCE/)
    expect(text).toMatch(/Merge `main` INTO your/)
    expect(text).toMatch(/git rev-parse HEAD/)
    // The shared final regression must not be read as licence to merge first and
    // photograph afterwards — that block-loop cost ~30 turns on 24.07.2026.
    expect(text).toMatch(/PICTURE proof stays ON THE BRANCH/)
  })

  it('states that a red is a red, with no cosmetic class to wave one through', () => {
    const text = VERIFICATION_LADDER.join('\n')
    expect(text).toMatch(/A RED IS A RED/)
    expect(text).toMatch(/cosmetic/)
  })

  it('stays inside the brief’s width, like every other carried block', () => {
    for (const line of VERIFICATION_LADDER) expect(line.length, line).toBeLessThanOrEqual(100)
  })
})

// ---------------------------------------------------------------------------
// The orientation in the CODE (point 598): the paths the spec names, what lives
// around them, and the check that proves the point — generated, and framed as a
// hint, because a stale or bossy list misdirects.
// ---------------------------------------------------------------------------
describe('pathsIn — what counts as a path the spec names', () => {
  it('reads the paths out of backticks and out of plain prose alike', () => {
    const spec = 'It changes `src/world/rivers.ts` and scripts/verify/polish.mjs, and docs/climate-1890.md §9.'
    expect(pathsIn(spec)).toEqual(['src/world/rivers.ts', 'scripts/verify/polish.mjs', 'docs/climate-1890.md'])
  })

  it('keeps a directory, and counts one spelling of it', () => {
    expect(pathsIn('under `src/ui/` — and src/ui/ again')).toEqual(['src/ui/'])
  })

  it('names the root documents the corpus cites without a directory', () => {
    expect(pathsIn('CLAUDE.md §7.2 and TASKS.md say so')).toEqual(['CLAUDE.md', 'TASKS.md'])
  })

  it('is NOT fooled by the slash-carrying prose this corpus really writes', () => {
    // Every one of these appears in the work order; presenting any as a file
    // would send the reader hunting for something that does not exist.
    const spec = 'store/systems logic and journal/TTS, and/or the 24.07.2026 note, ' +
      'served from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main'
    expect(pathsIn(spec)).toEqual([])
  })

  it('is total on junk', () => {
    expect(pathsIn(null)).toEqual([])
    expect(pathsIn(undefined)).toEqual([])
  })
})

describe('the work order’s own diff→suite mapping', () => {
  const MAP_TEXT = [
    'Diff → browser-suite mapping: `src/i18n/` → i18n · store/systems logic → Vitest',
    'only (flow if the core loop is touched) · `src/scenes/place/` → collision,',
    'polish, settings · `src/world/` → world, enrichments · `scripts/verify/X.mjs` → X itself ·',
    '`*.md` → docs. When unsure, include the suite.',
    '',
    'Something else entirely.',
  ].join('\n')

  it('parses the paragraph rather than keeping a copy of it', () => {
    const map = parseDiffSuiteMap(MAP_TEXT)
    expect(map.map((e) => e.subject)).toContain('`src/world/`')
    expect(map.find((e) => e.subject === '`src/world/`').suites).toBe('world, enrichments')
    // The prose subjects survive as prose — nothing is dropped for being unmatchable.
    expect(map.some((e) => e.subject === 'store/systems logic')).toBe(true)
  })

  it('stops at the paragraph and is total when there is none', () => {
    expect(parseDiffSuiteMap(MAP_TEXT).some((e) => /Something else/.test(e.subject))).toBe(false)
    expect(parseDiffSuiteMap('no mapping here')).toEqual([])
    expect(parseDiffSuiteMap(null)).toEqual([])
  })

  it('resolves a path to the suites its rule names, and the wildcard to the suite itself', () => {
    const map = parseDiffSuiteMap(MAP_TEXT)
    const { byRule } = plannedCheck(['src/world/rivers.ts', 'scripts/verify/polish.mjs', 'docs/x.md'], map)
    expect(byRule.find((r) => r.paths.includes('src/world/rivers.ts')).suites).toEqual(['world', 'enrichments'])
    expect(byRule.find((r) => r.paths.includes('scripts/verify/polish.mjs')).suites).toEqual(['polish'])
    expect(byRule.find((r) => r.paths.includes('docs/x.md')).suites).toEqual(['docs'])
  })

  it('NAMES what no rule covers instead of passing over it', () => {
    const { byRule, unmapped } = plannedCheck(['public/logo.png'], parseDiffSuiteMap(MAP_TEXT))
    expect(byRule).toEqual([])
    expect(unmapped).toEqual(['public/logo.png'])
  })

  it('reads the REAL paragraph in the work order, so the brief cannot quote a mapping nobody keeps', () => {
    const map = parseDiffSuiteMap(readFileSync(resolve(ROOT, 'TASKS.md'), 'utf8'))
    expect(map.length, 'the preamble names a diff→suite mapping').toBeGreaterThan(4)
    const { byRule } = plannedCheck(['src/world/x.ts', 'scripts/verify/enrichments.mjs'], map)
    expect(byRule.flatMap((r) => r.suites)).toContain('world')
    expect(byRule.flatMap((r) => r.suites)).toContain('enrichments')
  })
})

describe('the orientation block', () => {
  const files = [
    { path: 'src/world/rivers.ts', exists: true, header: 'The river courses of the 1890 map.' },
    { path: 'src/world/gone.ts', exists: false, header: null },
  ]
  const dirs = [{ dir: 'src/world/', count: 26, note: 'coastVector.ts, geo.ts, …' }]
  const check = { byRule: [{ rule: '`src/world/`', suites: ['world'], paths: ['src/world/rivers.ts'] }], unmapped: [] }

  it('is framed as a HINT and never as an instruction', () => {
    const text = orientationBlock({ files, dirs, check }).join('\n')
    expect(text).toMatch(/GENERATED HINT/)
    expect(text).toMatch(/the spec decides/)
    expect(text).toMatch(/NOT a list of files to change/)
  })

  it('carries each file’s own header and says plainly when a named path is not in the tree', () => {
    const text = orientationBlock({ files, dirs, check }).join('\n')
    expect(text).toContain('The river courses of the 1890 map.')
    expect(text).toMatch(/src\/world\/gone\.ts — NOT IN THE TREE/)
  })

  it('names the suite AND its cheapest rung, capped so a forty-section suite cannot flood the brief', () => {
    const many = Array.from({ length: 40 }, (_, i) => `block-${i}`)
    const text = orientationBlock({ files, dirs, check, sections: { world: many } }).join('\n')
    expect(text).toContain('block-0')
    expect(text).not.toContain('block-39')
    expect(text).toMatch(/\+28 more: node scripts\/verify\/run-all\.mjs world --section=list/)
  })

  it('prints nothing at all when there is nothing to say', () => {
    expect(orientationBlock({})).toEqual([])
    expect(orientationBlock({ check: { byRule: [], unmapped: [] } })).toEqual([])
  })
})

describe('the orientation inside a brief', () => {
  const tasks = ALL.replace(
    'AN OPEN POINT — it references design.md §4.2 and, later, §19.8.',
    'AN OPEN POINT — it changes `src/world/rivers.ts` per design.md §4.2 and, later, §19.8.',
  ).replace('## Checklist', '## Checklist\n\nDiff → browser-suite mapping: `src/world/` → world, enrichments.\n')

  it('is absent when the caller hands in no reader — the module itself does no I/O', () => {
    const { brief } = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(brief).not.toContain('--- ORIENTATION')
  })

  it('is built from what the reader returns, and hands the reader the resolved suites', () => {
    let asked = null
    const { brief, namedPaths, check } = buildBrief({
      ...args,
      tasksText: tasks,
      number: 400,
      readTree: (q) => {
        asked = q
        return { files: [{ path: 'src/world/rivers.ts', exists: true, header: 'The rivers.' }], dirs: [], sections: {} }
      },
    })
    // design.md is named by the spec and deliberately NOT pointed at: the brief
    // already carries its sections, and "look in design.md" is in every spec.
    expect(namedPaths).toEqual(['src/world/rivers.ts'])
    expect(check.byRule[0].suites).toEqual(['world', 'enrichments'])
    expect(asked).toEqual({ paths: ['src/world/rivers.ts'], suites: ['world', 'enrichments'] })
    expect(brief).toContain('--- ORIENTATION')
    expect(brief).toContain('The rivers.')
  })

  it('loses the BLOCK and never the brief when the reader throws', () => {
    const { brief } = buildBrief({
      ...args,
      tasksText: tasks,
      number: 400,
      readTree: () => {
        throw new Error('the tree is gone')
      },
    })
    expect(brief).not.toContain('--- ORIENTATION')
    expect(brief).toContain('AN OPEN POINT')
  })

  it('stands AFTER the spec, where "where to look" first means something', () => {
    const { brief } = buildBrief({
      ...args,
      tasksText: tasks,
      number: 400,
      readTree: () => ({ files: [{ path: 'src/world/rivers.ts', exists: true, header: 'The rivers.' }] }),
    })
    expect(brief.indexOf('AN OPEN POINT')).toBeLessThan(brief.indexOf('--- ORIENTATION'))
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
