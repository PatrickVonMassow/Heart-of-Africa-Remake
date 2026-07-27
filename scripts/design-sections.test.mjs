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

  it('resolves every § it cites', () => {
    const cited = [...new Set([...claudeText.matchAll(/§\s?(\d+(?:\.\d+)*)/g)].map((m) => m[1]))]
    expect(cited.length).toBeGreaterThan(50) // the extraction itself must not silently find nothing
    const dangling = cited.filter(
      (id) => homesOf(id).length === 0 && !claude.has(id) && !criteria.has(Number(id)),
    )
    expect(dangling, `CLAUDE.md cites sections nothing holds: ${dangling.join(', ')}`).toEqual([])
  })

  it('finds the acceptance criteria it needs to resolve the bare numbers', () => {
    expect(criteria.size).toBeGreaterThan(20)
  })
})
