// design.md's section numbers are load-bearing, and shortening it must not
// cost one (work-order point 367).
//
// WHY THIS EXISTS: CLAUDE.md §7.1 and dozens of work-order specs cite design.md
// BY NUMBER, and `scripts/point-brief.mjs` resolves those numbers mechanically
// when it assembles an agent's brief. So a section that is deleted, renumbered
// or moved without a pointer does not produce an error anywhere — it quietly
// stops being found, which is precisely the failure the last document
// compression suffered (retrospective §3.30: "der gefährlichste ist der, der
// nicht scheitert, sondern nur nichts mehr findet").
//
// The guard is therefore a RATCHET, not a snapshot: the set of section numbers
// design.md carried before the compression must still RESOLVE afterwards —
// either in design.md itself or in a neighbour document that holds the block
// under the same number. Adding a section is free; losing one fails here.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptanceCriteriaFrom, parseDesignSections } from './point-brief-core.mjs'
import { CLAUDE_PATH, DESIGN_PATH, REPO_ROOT } from './doc-corpus.mjs'

/**
 * Documents that hold design.md sections under design.md's OWN numbers. A block
 * moved out of design.md keeps its number and lands in one of these; design.md
 * keeps a pointer at the old place (asserted below), so both the human and the
 * brief resolver still find it.
 */
export const DESIGN_NEIGHBOUR_DOCS = ['docs/design-reference.md']

/** The blocks moved out by point 367: id → the document that now holds them. */
export const MOVED_SECTIONS = {
  '19.14': 'docs/design-reference.md',
  '19.15': 'docs/design-reference.md',
  '21.2': 'docs/design-reference.md',
}

/**
 * Every section number design.md carried at 9fc8efa, the commit before point
 * 367's compression. FROZEN ON PURPOSE: this is the "before" side of the
 * subset check, so it is extended only when a genuinely NEW section is added,
 * never trimmed to make a removal pass.
 */
export const BASELINE_SECTION_IDS = [
  '1',
  '2', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7',
  '3', '3.1', '3.2', '3.3',
  '4', '4.1', '4.2', '4.3', '4.4', '4.5',
  '5', '5.1',
  '6', '6.1', '6.2', '6.3',
  '7',
  '8',
  '9',
  '10',
  '11', '11.1', '11.2', '11.3',
  '12',
  '13', '13.1', '13.2', '13.3', '13.4',
  '14', '14.1', '14.2', '14.3', '14.4',
  '15', '15.1', '15.2', '15.3', '15.4', '15.5', '15.6',
  '16', '16.1', '16.2', '16.3',
  '17', '17.1', '17.2', '17.3', '17.4', '17.5', '17.6', '17.7', '17.8',
  '18',
  '19', '19.1', '19.2', '19.3', '19.4', '19.5', '19.6', '19.7', '19.8',
  '19.16', '19.9', '19.10', '19.11', '19.12', '19.13', '19.14', '19.15',
  '20',
  '21', '21.1', '21.2', '21.3', '21.4',
]

const read = (p) => readFileSync(p, 'utf8')
const designText = read(DESIGN_PATH)
const claudeText = read(CLAUDE_PATH)
const design = parseDesignSections(designText)
const claude = parseDesignSections(claudeText)
const neighbours = DESIGN_NEIGHBOUR_DOCS.map((path) => ({
  path,
  sections: parseDesignSections(read(resolve(REPO_ROOT, path))),
}))

/** Where a design.md section number resolves today, or [] if nowhere. */
const homesOf = (id) => [
  ...(design.has(id) ? [DESIGN_PATH.endsWith('design.md') ? 'design.md' : DESIGN_PATH] : []),
  ...neighbours.filter((n) => n.sections.has(id)).map((n) => n.path),
]

/**
 * The 32 acceptance criteria as §7.1 carries them, number → title. FROZEN like
 * BASELINE_SECTION_IDS above and for the same reason: point 768 cut §7.1 to number and
 * title alone, so the numbers and titles ARE the contract now — `point-brief.mjs`
 * resolves a bare `§22` through them and the closing reports against them. A contiguous
 * run of non-empty titles is not enough to pin that (cross-vendor review, round 2):
 * reordering the criteria and renumbering them 1–32 satisfies it exactly.
 *
 * Extending this is free. TRIMMING it, renumbering an entry or retitling one is a
 * deliberate edit here, in the commit that changes §7.1 — never a green surprise.
 */
export const ACCEPTANCE_CRITERIA_BASELINE = {
  1: "Build/start",
  2: "Two perspectives",
  3: "World model",
  4: "Movement and time",
  5: "Port city",
  6: "Village and cultural contact",
  7: "Language and communication",
  8: "Chronicle/journal",
  9: "Status bar",
  10: "Goal scaffolding",
  11: "Game graphics",
  12: "Atmosphere",
  13: "Real geodata",
  14: "Lighting and post-processing",
  15: "Lively settlements",
  16: "Settlement collision",
  17: "Localization",
  18: "Lint and dependency hygiene",
  19: "Journal voice/read-aloud",
  20: "Comfort and audio settings",
  21: "Water realism",
  22: "Health and afflictions",
  23: "Random events",
  24: "Deadline and successor",
  25: "Trade economy",
  26: "Standing with the natives",
  27: "Camps",
  28: "Saving/loading",
  29: "Animated handwriting",
  30: "Gamepad and position query",
  31: "Orientation and panorama wildlife",
  32: "Render pipeline upgrades",
}

describe('design.md section numbers', () => {
  it('still resolves every number it carried before the point-367 compression', () => {
    const lost = BASELINE_SECTION_IDS.filter((id) => homesOf(id).length === 0)
    expect(lost, `design.md section numbers that no longer resolve anywhere: ${lost.join(', ')}`).toEqual([])
  })

  it('keeps a pointer in design.md for every block that moved out', () => {
    for (const [id, home] of Object.entries(MOVED_SECTIONS)) {
      const section = design.get(id)
      // The number stays a design.md heading — a bare § still resolves there …
      expect(section, `design.md lost its §${id} pointer heading`).toBeTruthy()
      // … and the pointer names the document that actually holds the block, so
      // the chain never dead-ends at a heading with nothing under it.
      expect(section.text, `design.md §${id} does not name its new home`).toContain(home)
      const neighbour = neighbours.find((n) => n.path === home)
      expect(neighbour?.sections.has(id), `${home} does not carry §${id}`).toBe(true)
    }
  })

  it('does not let a moved block be duplicated instead of moved', () => {
    // The pointer is a few lines; the record is the long text. If design.md
    // still held the whole block, the "move" would only have added a copy.
    for (const id of Object.keys(MOVED_SECTIONS)) {
      const here = design.get(id).text.length
      const there = neighbours.find((n) => n.path === MOVED_SECTIONS[id]).sections.get(id).text.length
      expect(here, `design.md §${id} still holds the full record`).toBeLessThan(there / 2)
    }
  })
})

describe('CLAUDE.md references into design.md', () => {
  // CLAUDE.md's §7.1 acceptance criteria are numbered LIST ITEMS, not headings,
  // and are cited as bare `§22` / `pt. 30` — point-brief-core resolves them the
  // same way, so this test accepts them exactly as the brief generator does.
  const criteria = acceptanceCriteriaFrom(claude)
  // EVERY NUMBER OF A CITATION, NOT ONLY THE FIRST (cross-vendor review of point 768).
  // The moved conditions write `§§8–10` and `§§15.2–15.3/16.1`, and an extractor that
  // takes the number straight after the `§` reads one of them and calls the rest
  // covered — so a section deleted out of the middle of a range passed green, which is
  // the exact failure this whole file exists to prevent.
  const RUN = /§+\s?(\d+(?:\.\d+)*(?:\s*[–—\-/,]\s*\d+(?:\.\d+)*)*)/g
  const expand = (run) => {
    const parts = run.split(/\s*[/,]\s*/)
    const out = []
    for (const part of parts) {
      // A range names every number BETWEEN its ends, dotted or not (cross-vendor review
      // round 2: §§17.1–17.3 claimed cover for §17.2 without ever checking it). A dotted
      // range counts on its last component and only where both ends share a prefix.
      const range = /^(\d+(?:\.\d+)*)\s*[–—-]\s*(\d+(?:\.\d+)*)$/.exec(part)
      if (range) {
        const [a, b] = [range[1].split('.'), range[2].split('.')]
        const prefix = a.slice(0, -1)
        const sharedPrefix = a.length === b.length && prefix.join('.') === b.slice(0, -1).join('.')
        const [from, to] = [Number(a.at(-1)), Number(b.at(-1))]
        if (sharedPrefix && Number.isInteger(from) && Number.isInteger(to) && from <= to) {
          for (let n = from; n <= to; n++) out.push([...prefix, n].join('.'))
        } else {
          out.push(range[1], range[2])
        }
        continue
      }
      for (const id of part.split(/\s*[–—-]\s*/)) if (id) out.push(id)
    }
    return out
  }
  const citedIn = (text) => [...new Set([...text.matchAll(RUN)].flatMap((m) => expand(m[1])))]
  // WHAT A BARE NUMBER MAY RESOLVE THROUGH DEPENDS ON WHO WROTE IT (cross-vendor review,
  // rounds 2 and 3). In CLAUDE.md a bare `§22` may mean acceptance criterion 22 — a list
  // item no section resolver reaches — and a `§9` may mean its own heading, so both
  // escapes are open there ('all').
  //
  // In the DETAIL document almost every `§` means a design.md section, and design.md
  // numbers its top-level sections with the same INTEGERS CLAUDE.md does: with the
  // escapes open, deleting design §8, §9 or §10 read green through a same-numbered
  // criterion or heading. So integers must resolve in design.md and nowhere else there.
  // A DOTTED id is unambiguous — design.md has no §7.1 — and the detail document does
  // cite the build order's own §7.1 once, legitimately, which is why 'dotted' exists
  // rather than a flat refusal that would have to be papered over.
  const dangling = (cited, { claudeResolve = false, criteriaResolve = false } = {}) =>
    cited.filter(
      (id) =>
        homesOf(id).length === 0 &&
        !(claudeResolve === 'all' && claude.has(id)) &&
        !(claudeResolve === 'dotted' && id.includes('.') && claude.has(id)) &&
        !(criteriaResolve && criteria.has(Number(id))),
    )

  it('reads every number of a multi-section citation', () => {
    expect(citedIn('see §§8–10 and §§15.2–15.3/16.1 and §7')).toEqual([
      '8', '9', '10', '15.2', '15.3', '16.1', '7',
    ])
  })

  it('expands a DOTTED range across the section it steps over', () => {
    expect(citedIn('see §§17.1–17.4')).toEqual(['17.1', '17.2', '17.3', '17.4'])
    // Ends that share no prefix are not arithmetic; only what is written is claimed.
    expect(citedIn('see §§17.1–19.2')).toEqual(['17.1', '19.2'])
  })

  it('lets neither a criterion NOR a CLAUDE.md heading cover a missing design section', () => {
    // Both escapes are real: 9 is an acceptance criterion AND a CLAUDE.md heading, so a
    // design §9 deleted under the detail document's feet must still be reported.
    expect(criteria.has(9)).toBe(true)
    expect(claude.has('9')).toBe(true)
    const withoutDesign = (id) => (homesOf(id).length === 0 ? [id] : [])
    expect(dangling(['9'], { claudeResolve: 'dotted' })).toEqual(withoutDesign('9'))
    // A DOTTED build-order id still resolves there, and only a dotted one.
    expect(dangling(['7.1'], { claudeResolve: 'dotted' })).toEqual([])
    // …while the build order's own citations keep both escapes, which is why they are flags.
    expect(dangling(['999'], { claudeResolve: 'all', criteriaResolve: true })).toEqual(['999'])
  })

  it('resolves every § it cites', () => {
    const cited = citedIn(claudeText)
    // The floor is a sentinel against an extraction that silently finds nothing, not a
    // size target. It stood at 50 while §7.1 carried one condition per criterion; point
    // 768 cut those conditions to docs/acceptance-criteria-detail.md, which is checked
    // below, and the citations left in the always-loaded file are a handful.
    expect(cited.length).toBeGreaterThan(3)
    const bad = dangling(cited, { claudeResolve: 'all', criteriaResolve: true })
    expect(bad, `CLAUDE.md cites sections nothing holds: ${bad.join(', ')}`).toEqual([])
  })

  // THE CHECK FOLLOWS THE TEXT IT WAS WRITTEN FOR (point 768). The §7.1 conditions were
  // where CLAUDE.md cited design.md by number, and the cut moved them rather than
  // deleting them — so the resolution check moves with them, or the cut would buy the
  // per-turn saving by dropping the guard on dozens of references.
  it('resolves every § the acceptance-criteria detail cites, where those conditions now live', () => {
    const detail = readFileSync(resolve(REPO_ROOT, 'docs/acceptance-criteria-detail.md'), 'utf8')
    const cited = citedIn(detail)
    expect(cited.length).toBeGreaterThan(50)
    const bad = dangling(cited, { claudeResolve: 'dotted' })
    expect(bad, `docs/acceptance-criteria-detail.md cites sections nothing holds: ${bad.join(', ')}`).toEqual([])
  })

  // THE CUT MAY NOT COST A CRITERION, AND MAY NOT MOVE ONE (cross-vendor review of
  // point 768). "More than twenty parse" stayed green through the loss of eleven of
  // them and through a wholesale renumbering — the two failures the compaction of §7.1
  // could actually produce. The numbers are therefore pinned as a contiguous run from
  // 1, in ascending DOCUMENT order, never fewer than the 32 the POC target carries;
  // adding a criterion is free, losing or reordering one is not.
  it('keeps every acceptance criterion, numbered from 1 in document order', () => {
    const numbered = [...claude.get('7.1').text.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)]
    const numbers = numbered.map((m) => Number(m[1]))
    expect(numbers.length).toBeGreaterThanOrEqual(32)
    expect(numbers).toEqual(numbers.map((_, i) => i + 1))
    expect(numbered.every((m) => m[2].trim().length > 0)).toBe(true)
    // And what point-brief-core resolves is exactly that list, in the same order.
    expect([...criteria.keys()]).toEqual(numbers)
  })

  it('keeps each criterion AT ITS NUMBER, under its own title', () => {
    for (const [number, title] of Object.entries(ACCEPTANCE_CRITERIA_BASELINE)) {
      expect(criteria.get(Number(number)), `acceptance criterion ${number} is gone`).toBe(title)
    }
  })

  it('finds the acceptance criteria it needs to resolve the bare numbers', () => {
    expect(criteria.size).toBeGreaterThanOrEqual(32)
  })
})
