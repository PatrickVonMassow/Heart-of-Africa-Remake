// THE PROVENANCE CHAIN OF A BLIND-PARALLEL STAGE, pinned end to end.
//
// Cross-vendor review of point 834 found the chain from raw half to union to
// ledger row held only by convention: the same content sits in a `.md` and a
// `.json` half with nothing comparing them, and the union exists both as the
// table implementers read in docs/handover-architecture.md and as the JSON the
// accounting counted, with nothing keeping the two in agreement. Either could
// drift and the recorded receipt would still balance.
//
// These cases are that missing binding. They read the shipped artefacts, not
// fixtures, because the artefacts are the thing under test.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { isTrackedInGit } from './git-tracked.mjs'

const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8')
const HALF_A = 'docs/four-eyes/676-blind-a-opus5'
const HALF_B = 'docs/four-eyes/676-blind-b-sol'
const UNION = 'docs/four-eyes/676-union.json'
const DOC = 'docs/handover-architecture.md'

/** The union table of the architecture document, in the union's own shape. */
function unionFromDocument(text) {
  return [...text.matchAll(/^\| (M\d+) \| ([^|]+) \| (.+?) \|$/gm)].map((m) => ({
    id: m[1],
    from: [...m[2].matchAll(/\b(A\d+[a-c]?|B\d+)\b/g)].map((x) => x[1]),
    defect: m[3].trim(),
  }))
}

describe('the 676 stage is auditable from its raw halves', () => {
  it('carries both halves as TRACKED artefacts, which is what makes them evidence', () => {
    for (const rel of [`${HALF_A}.json`, `${HALF_A}.md`, `${HALF_B}.json`, `${HALF_B}.md`, UNION]) {
      expect(isTrackedInGit(rel), rel).toBe(true)
    }
  })

  it('names the author of each half in the file the tooling actually reads', () => {
    // Half A's own heading claims Fable 5 and is wrong; the transcript metadata
    // says Claude Opus 5 (676-provenance.md). The file the tooling reads carries
    // the true author, and the verbatim half keeps the mislabel as evidence.
    expect(JSON.parse(read(`${HALF_A}.json`)).model).toBe('Claude Opus 5')
    expect(read(`${HALF_A}.md`)).toMatch(/Proposal A — Fable 5/)
    expect(JSON.parse(read(`${HALF_B}.json`)).model).toBe('GPT-5.6 Sol')
  })

  it('keeps the counted union and the published table the same union', () => {
    // The implementers read the table; the accounting counted the JSON. Nothing
    // bound them before this case, so the JSON could balance while the table said
    // something else.
    const stored = JSON.parse(read(UNION))
    expect(stored.entries).toEqual(unionFromDocument(read(DOC)))
    // THE UNION NAMES ITS VALID MERGER: half A is Claude's and half B is Sol's, so
    // the model that wrote neither is Fable 5, which folded the stage on 22.08.2026
    // once the owner had lifted its suspension. The two earlier folds by the halves'
    // own authors remain recorded as the weaker two-model fallback this replaced.
    expect(stored.mergedBy).toBe('Claude Fable 5')
    expect(stored.mergedByNote).toMatch(/wrote neither half/i)
    expect(stored.mergedByNote).toMatch(/replaces the two recorded fallback folds/i)
    expect(read(DOC)).toMatch(/weaker two-model fallback/i)
  })

  it('keeps half B\'s verbatim text and its parsed form the same list', () => {
    const parsed = JSON.parse(read(`${HALF_B}.json`)).entries
    const verbatim = [...read(`${HALF_B}.md`).matchAll(/^(B\d+) \| ([^|]+) \| (.+)$/gm)]
    expect(verbatim.length).toBe(parsed.length)
    for (const [i, m] of verbatim.entries()) {
      expect(m[1]).toBe(parsed[i].id)
      // Backticks were stripped when the raw output was parsed into JSON; nothing
      // else may differ.
      expect(m[3].replaceAll('`', '')).toBe(parsed[i].defect.replaceAll('`', ''))
    }
  })

  it('accounts for every half-A section in the entries parsed out of it, and back', () => {
    // Half A is PROSE, not a line list: the proposal argues in eight numbered
    // sections and the JSON splits three of them (A3, A5, A6) into the separate
    // claims they actually make, which is why its ids carry sub-letters. The
    // binding is therefore weaker than half B's and is stated as what it is —
    // every section is represented by at least one entry, and every entry belongs
    // to a section that exists. Neither side can gain or lose a claim unnoticed.
    const sections = [...read(`${HALF_A}.md`).matchAll(/^## (A\d+)\./gm)].map((m) => m[1])
    const entries = JSON.parse(read(`${HALF_A}.json`)).entries.map((e) => e.id)
    expect(sections).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'])
    const base = (id) => id.replace(/[a-c]$/, '')
    for (const id of entries) expect(sections, id).toContain(base(id))
    for (const section of sections) expect(entries.some((id) => base(id) === section), section).toBe(true)
    // And the sub-lettering is contiguous where it is used, so no split claim
    // silently disappeared between the prose and the parsed form.
    for (const section of sections) {
      const lettered = entries.filter((id) => base(id) === section && id !== section)
      const letters = lettered.map((id) => id.slice(-1))
      expect(letters).toEqual(letters.length ? ['a', 'b', 'c'].slice(0, letters.length) : [])
    }
  })

  it('leaves no reference in the union that the halves cannot answer', () => {
    const ids = new Set([
      ...JSON.parse(read(`${HALF_A}.json`)).entries.map((e) => e.id),
      ...JSON.parse(read(`${HALF_B}.json`)).entries.map((e) => e.id),
    ])
    const claimed = JSON.parse(read(UNION)).entries.flatMap((e) => e.from)
    expect(claimed.length).toBe(ids.size)
    for (const id of claimed) expect(ids.has(id), id).toBe(true)
    expect(new Set(claimed).size).toBe(claimed.length)
  })
})
