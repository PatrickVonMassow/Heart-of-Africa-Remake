// The point brief's pure core (point 365 A). Synthetic fixtures pin the
// behaviour; the real work order and design.md are swept at the end, because the
// brief's promise — the right point, every referenced section, no dangling
// reference, and a size that stays a saving — has to hold on TODAY's documents.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { readTasksAll } from './tasks-source.mjs'
import {
  BriefError,
  BRIEF_TOKEN_CEILING,
  assembleBrief,
  buildBrief,
  classifySectionRefs,
  compareSectionIds,
  estimateTokens,
  extractDesignSectionRefs,
  extractPointRefs,
  findPoint,
  parseDesignSections,
  parseWorkOrderPoints,
  pointTitle,
  resolveDesignSections,
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

const CLAUDE = ['# CLAUDE.md', '', '### 7.1 Acceptance Criteria', 'The criteria.'].join('\n')

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

describe('extractDesignSectionRefs', () => {
  it('collects every section a spec names, in numeric order', () => {
    expect(extractDesignSectionRefs('see §19.8, §4.2 and design.md §4.10 plus §4').design).toEqual([
      '4',
      '4.2',
      '4.10',
      '19.8',
    ])
  })

  it('attributes a § to the document named just before it', () => {
    const r = extractDesignSectionRefs('CLAUDE.md §6 stands, design.md §4.2 applies')
    expect(r.design).toEqual(['4.2'])
    expect(r.foreign).toEqual(['CLAUDE.md §6'])
  })

  it('decides an id ONCE — an explicit foreign attribution covers a later bare mention', () => {
    // The real shape in point 365: the retrospective's §3.27 named beside the
    // file, then again bare. Per-occurrence attribution made the bare one a
    // dangling design.md section — a false hard failure.
    const r = extractDesignSectionRefs(
      'settled in `docs/analysis_de/retro.md` §3.27 and must not be re-derived. ' +
        'A long stretch of unrelated prose follows here so the lookback window cannot reach ' +
        'back to the filename any more, and then the text says: exactly what §3.27 was about.',
    )
    expect(r.design).toEqual([])
    expect(r.foreign).toEqual(['docs/analysis_de/retro.md §3.27'])
  })

  it('understands the retrospective by its prose name, not only its filename', () => {
    const r = extractDesignSectionRefs('the retrospective §3.12/§8 covers this class')
    expect(r.design).toEqual([])
    expect(r.foreign.length).toBe(2)
  })

  it('sorts section ids numerically, not as strings', () => {
    expect(['4.10', '4.2', '4'].sort(compareSectionIds)).toEqual(['4', '4.2', '4.10'])
  })
})

describe('extractPointRefs', () => {
  it('resolves the reference forms the queue uses, and never itself', () => {
    const refs = extractPointRefs(
      'per point 288 and points 175/177, plus pt. 30 and pts. 12, 13 — and point 400 is this one.',
      400,
    )
    expect(refs).toEqual([12, 13, 30, 175, 177, 288])
  })

  it('is empty for a spec that names none', () => {
    expect(extractPointRefs('nothing to see here', 401)).toEqual([])
  })
})

describe('parseDesignSections', () => {
  const sections = parseDesignSections(DESIGN)

  it('indexes every numbered heading', () => {
    expect([...sections.keys()]).toEqual(['4', '4.1', '4.2', '17', '17.2', '19', '19.8'])
  })

  it('carries a subsection verbatim and stops at the next heading', () => {
    const s = sections.get('4.2')
    expect(s.text).toContain('Twenty-two peoples')
    expect(s.text).not.toContain('User Interface')
  })

  it('carries only the intro of a top-level section, plus its subsection index', () => {
    const s = sections.get('4')
    expect(s.text).toContain('Intro to settlements')
    expect(s.text).not.toContain('Twenty-two peoples')
    expect(s.children.map((c) => c.id)).toEqual(['4.1', '4.2'])
  })
})

describe('resolveDesignSections', () => {
  it('returns the sections a spec names', () => {
    expect(resolveDesignSections(DESIGN, ['4.2', '19.8']).map((s) => s.id)).toEqual(['4.2', '19.8'])
  })

  it('FAILS LOUDLY on a section the document no longer contains', () => {
    expect(() => resolveDesignSections(DESIGN, ['4.2', '4.9'])).toThrow(BriefError)
    expect(() => resolveDesignSections(DESIGN, ['4.9'])).toThrow(/§4\.9/)
  })
})

describe('classifySectionRefs', () => {
  it('separates design sections, CLAUDE.md sections, point numbers and the dangling rest', () => {
    const r = classifySectionRefs({
      ids: ['4.2', '7.1', '288', '99.9'],
      designText: DESIGN,
      claudeText: CLAUDE,
      tasksText: ALL,
    })
    expect(r).toEqual({
      designIds: ['4.2'],
      claudeIds: ['7.1'],
      pointNumbers: [288],
      missing: ['99.9'],
    })
  })
})

describe('buildBrief', () => {
  const args = { tasksText: ALL, designText: DESIGN, claudeText: CLAUDE }

  it('builds the brief for an OPEN point with its design sections and cross-references', () => {
    const { brief, designRefs, referenced } = buildBrief({ ...args, number: 400 })
    expect(designRefs).toEqual(['4.2', '19.8'])
    expect(brief).toContain('AN OPEN POINT')
    expect(brief).toContain('Twenty-two peoples')
    expect(brief).toContain('Calves stay with the herd')
    expect(referenced).toEqual([
      { number: 288, found: true, done: true, title: pointTitle(findPoint(ALL, 288)) },
    ])
    // The cross-reference is an identifying line, not the referenced body.
    expect(brief).toContain('point 288 [done]:')
    expect(brief).not.toContain('no discovery bounty for them,\n  and the label')
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
    expect(brief).toMatch(/design\.md/)
    expect(brief).toMatch(/WHOLESALE/)
    expect(brief).toMatch(/MAY read any NAMED file/)
    expect(brief).toMatch(/ESCALATE/)
  })

  it('FAILS LOUDLY on an unknown point number', () => {
    expect(() => buildBrief({ ...args, number: 999 })).toThrow(BriefError)
    expect(() => buildBrief({ ...args, number: 999 })).toThrow(/no work-order point 999/)
  })

  it('FAILS LOUDLY on a design.md section the document no longer contains', () => {
    const renumbered = DESIGN.replace('### 19.8 Family life in the herds', '### 19.9 Family life')
    expect(() => buildBrief({ ...args, designText: renumbered, number: 400 })).toThrow(/§19\.8/)
  })

  it('names, rather than drops, what it does not carry', () => {
    const tasks = ALL.replace(
      'It also says: per point 288 the ports are known from the start.',
      'It also says: CLAUDE.md §7.1 binds, and §288 combat applies.',
    )
    const { brief } = buildBrief({ ...args, tasksText: tasks, number: 400 })
    expect(brief).toContain('CLAUDE.md §7.1')
    expect(brief).toMatch(/§288 where a WORK-ORDER POINT number is meant/)
    expect(brief).toContain('point 288 [done]:')
  })
})

describe('assembleBrief', () => {
  it('omits the empty parts instead of printing empty headings', () => {
    const brief = assembleBrief({ point: { number: 1, done: false, body: 'x' } })
    expect(brief).not.toContain('DESIGN SECTIONS')
    expect(brief).not.toContain('CROSS-REFERENCED')
    expect(brief).not.toContain('NOTES')
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

describe('the real work order and design.md', () => {
  const tasksText = readTasksAll(resolve(ROOT, 'TASKS.md'), resolve(ROOT, 'docs/tasks-archive.md'))
  const designPath = resolve(ROOT, 'design.md')
  const designText = existsSync(designPath) ? readFileSync(designPath, 'utf8') : ''
  const claudePath = resolve(ROOT, 'CLAUDE.md')
  const claudeText = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : ''
  const open = parseWorkOrderPoints(tasksText).filter((p) => !p.done)

  it('has open points to brief at all', () => {
    expect(open.length).toBeGreaterThan(0)
  })

  it('briefs EVERY open point without a dangling reference', () => {
    const broken = []
    for (const p of open) {
      try {
        buildBrief({ tasksText, designText, claudeText, number: p.number })
      } catch (e) {
        broken.push(`${p.number}: ${e.message}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('keeps every open point’s brief under the measured ceiling', () => {
    // Measured 27.07.2026: median ~1.7k tokens, largest open point ~10.3k.
    // Over the ceiling means a spec has outgrown what a brief can carry.
    const over = open
      .map((p) => ({ n: p.number, t: buildBrief({ tasksText, designText, claudeText, number: p.number }).tokens }))
      .filter((x) => x.t > BRIEF_TOKEN_CEILING)
    expect(over).toEqual([])
  })

  it('is far cheaper than the reading assignment it replaces', () => {
    // The whole point: one brief against the documents an agent used to read.
    const wholesale = estimateTokens(tasksText) + estimateTokens(designText)
    const brief = buildBrief({ tasksText, designText, claudeText, number: open[0].number }).tokens
    expect(brief * 5).toBeLessThan(wholesale)
  })
})
