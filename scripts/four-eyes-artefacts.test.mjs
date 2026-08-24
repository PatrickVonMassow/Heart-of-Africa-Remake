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
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { isTrackedInGit } from './git-tracked.mjs'

const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8')
const HALF_A = 'docs/four-eyes/676-blind-a-opus5'
const HALF_B = 'docs/four-eyes/676-blind-b-sol'
const UNION = 'docs/four-eyes/676-union.json'
const DOC = 'docs/handover-architecture.md'
const LEDGER = '.claude/mechanism-reviews.jsonl'

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

  it('keeps half B\'s verbatim text and its parsed form the same list — file column included', () => {
    const parsed = JSON.parse(read(`${HALF_B}.json`)).entries
    const verbatim = [...read(`${HALF_B}.md`).matchAll(/^(B\d+) \| ([^|]+) \| (.+)$/gm)]
    expect(verbatim.length).toBe(parsed.length)
    for (const [i, m] of verbatim.entries()) {
      expect(m[1]).toBe(parsed[i].id)
      // The FILE a finding is attributed to is part of the finding: an id and
      // defect that match while the file drifted would relocate the claim.
      expect(m[2].trim().replaceAll('`', '')).toBe(String(parsed[i].file ?? '').replaceAll('`', ''))
      // Backticks were stripped when the raw output was parsed into JSON; nothing
      // else may differ.
      expect(m[3].replaceAll('`', '')).toBe(parsed[i].defect.replaceAll('`', ''))
    }
  })

  it('the four raw halves are byte-pinned: they are FROZEN evidence, and any edit is a conscious event', () => {
    // Section-id and count comparisons bind structure, not content: a claim
    // rewritten INSIDE an existing section — in the prose or in the JSON —
    // would pass them all. The halves are the immutable inputs of a finished
    // blind stage, so their exact bytes are pinned; whoever must change one
    // updates this pin in the same commit and thereby signs the change.
    const createHash = crypto.createHash
    const pins = {
      [`${HALF_A}.md`]: 'e770546ef0715e40791dc30a4e678e53bcbf68b533c9420f1d772db8bc9f633a',
      [`${HALF_A}.json`]: '6710c68848f2b36152e806dfaa47e759dbd73504520083897f40969acdf16822',
      [`${HALF_B}.md`]: '09bcbe2aafc724197c96a54d6920d81052973215970af015533e8b7e211360bd',
      [`${HALF_B}.json`]: 'c9a6cd98bcd5940ea31e179e783eab73bb5c6ea4fe69e3b1594024e768f6868f',
    }
    for (const [rel, sha] of Object.entries(pins)) {
      expect(createHash('sha256').update(read(rel)).digest('hex'), rel).toBe(sha)
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

  it('states the fold arithmetic in the units it actually has, recomputed from the union', () => {
    // Cross-vendor review of point 834 found the document's own count sentence
    // mixing two units: "61 union entries (18 merged, 5 only A, 47 only B)" adds
    // up to 70, because 18 counts SOURCE IDENTIFIERS while the other three count
    // ENTRIES. The receipt still balanced — nothing recomputed the prose.
    const entries = JSON.parse(read(UNION)).entries
    const from = entries.map((e) => e.from)
    const counts = {
      unionEntries: entries.length,
      mergedRows: from.filter((f) => f.length > 1).length,
      identifiersInMergedRows: from.filter((f) => f.length > 1).reduce((n, f) => n + f.length, 0),
      singleRows: from.filter((f) => f.length === 1).length,
      onlyA: from.filter((f) => f.length === 1 && f[0].startsWith('A')).length,
      onlyB: from.filter((f) => f.length === 1 && f[0].startsWith('B')).length,
      sourceIdentifiers: from.reduce((n, f) => n + f.length, 0),
    }
    // The units are only separable if they genuinely differ; if a future fold made
    // them coincide, this case would pass while proving nothing.
    expect(counts.mergedRows).not.toBe(counts.identifiersInMergedRows)
    expect(counts.singleRows + counts.mergedRows).toBe(counts.unionEntries)
    expect(counts.onlyA + counts.onlyB).toBe(counts.singleRows)
    expect(counts.identifiersInMergedRows + counts.singleRows).toBe(counts.sourceIdentifiers)

    const doc = read(DOC).replace(/\s+/g, ' ')
    const stated = [
      `${counts.sourceIdentifiers} SOURCE IDENTIFIERS`,
      `${counts.unionEntries} UNION ENTRIES`,
      `${counts.mergedRows} merged rows consuming ${counts.identifiersInMergedRows} identifiers`,
      `${counts.singleRows} rows carrying one identifier each`,
      `${counts.onlyA} only A, ${counts.onlyB} only B`,
    ]
    for (const phrase of stated) expect(doc, phrase).toContain(phrase)
  })

  it('carries every acceptance condition half A states in prose into the entry parsed from it', () => {
    // The section binding above compares STRUCTURE. Cross-vendor review of point
    // 834 found what that lets through: A8's prose states an acceptance condition
    // ("Success is that figure falling while the number of points landed per day
    // does not") and the counted JSON entry named only the measurements. The
    // accounting then claims every input entry was folded, while the requirement
    // the entry exists to impose never reached the counted half.
    // A stated success condition is the one prose sentence that can be bound
    // mechanically, so it is: wherever half A says "Success is …", the entries of
    // that section must say it too.
    const md = read(`${HALF_A}.md`)
    const entries = JSON.parse(read(`${HALF_A}.json`)).entries
    const norm = (t) => t.replace(/\s+/g, ' ').replaceAll('`', '').trim()
    const stated = md
      .split(/^## /m)
      .slice(1)
      .flatMap((section) => {
        const id = section.match(/^(A\d+)\./)[1]
        return [...section.matchAll(/Success is [^.]*\./g)].map((m) => [id, norm(m[0])])
      })
    // If the prose ever stops stating one, this case must not silently pass.
    expect(stated.length).toBeGreaterThan(0)
    for (const [id, sentence] of stated) {
      const text = entries.filter((e) => e.id.replace(/[a-c]$/, '') === id).map((e) => norm(e.defect)).join(' ')
      expect(text, `${id}: ${sentence}`).toContain(sentence)
    }
  })

  it('agrees with the fold receipt recorded in the ledger, recomputed from the union', () => {
    // The receipt is the row that authorized everything built on this fold, and
    // nothing recomputed it against the artefacts it claims to have counted. Its
    // wording is the one the accounting printed on 22.08.2026 and stays as
    // printed; what it ASSERTS is checked here instead.
    //
    // AND IT IS THE 676 ROW, IDENTIFIED (cross-vendor review of point 889): this
    // used to take the LAST ledger line carrying any accounting string, so the
    // next unrelated fold recorded anywhere in the repository would have become
    // the thing under test, and a row naming a HALF-AUTHOR as merger would have
    // satisfied it. The row is picked by the sources it says it read, there must
    // be exactly one, and it has to name Fable 5 — the model that wrote neither
    // half — as the merger.
    const rows = read(LEDGER)
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => r.mode === 'blind-parallel' && Array.isArray(r.halfSources))
      .filter((r) => r.halfSources.join('|') === `${HALF_A}.json|${HALF_B}.json`)
    expect(rows, 'the 676 fold is recorded exactly once').toHaveLength(1)
    const row = rows[0]
    // The union is read at the ROW'S sha, like everything else this case
    // recomputes — the audit is of the historical fold, not of the working tree.
    const entries = JSON.parse(
      execFileSync('git', ['show', `${row.sha}:${row.unionSource}`], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }),
    ).entries
    const from = entries.map((e) => e.from)

    // EVERYTHING RECOMPUTED HERE IS READ AT THE ROW'S OWN SHA (re-review rounds
    // 5 and 6): the audit is of the historical fold, so working-tree or HEAD
    // reads would let later edits rot a true row or dress up a false one.
    const atRow = (rel) =>
      execFileSync('git', ['show', `${row.sha}:${rel}`], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
    const halfModel = (half) => JSON.parse(atRow(`${half}.json`)).model
    expect(row.halfAuthors).toEqual([halfModel(HALF_A), halfModel(HALF_B)])
    // THE MERGER WROTE NEITHER HALF — the one rule the fold step exists to keep.
    // The committed union at the row's sha is the authority on who folded it;
    // the row carries that spelling, and it is the Fable family.
    expect(row.mergedBy).toBe(JSON.parse(atRow(row.unionSource)).mergedBy)
    expect(row.mergedBy).toMatch(/Fable/)
    expect(row.halfAuthors).not.toContain(row.mergedBy)
    // …and the row names the exact blobs it counted, so the claim above is
    // re-derivable from the repository rather than read off two strings.
    const oid = (rel) => execFileSync('git', ['rev-parse', `${row.sha}:${rel}`], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).trim()
    expect(row.halfBlobs).toEqual([oid(`${HALF_A}.json`), oid(`${HALF_B}.json`)])
    expect(row.unionBlob).toBe(oid(row.unionSource))

    const m = /^(\d+) A \+ (\d+) B entries → (\d+) union entries \((\d+) of the (\d+) input entries merged, (\d+) only A, (\d+) only B\)/.exec(row.accounting)
    expect(m, `not a receipt line: ${row.accounting}`).not.toBe(null)
    const [a, b, union, merged, inputs, onlyA, onlyB] = m.slice(1).map(Number)
    const single = (side) => from.filter((f) => f.length === 1 && f[0].startsWith(side)).length
    expect(union).toBe(entries.length)
    expect(merged).toBe(from.filter((f) => f.length > 1).reduce((n, f) => n + f.length, 0))
    expect(onlyA).toBe(single('A'))
    expect(onlyB).toBe(single('B'))
    expect(a).toBe(JSON.parse(atRow(`${HALF_A}.json`)).entries.length)
    expect(b).toBe(JSON.parse(atRow(`${HALF_B}.json`)).entries.length)
    // The denominator the merged count is OF — read past, and so unchecked, by
    // the receipt pattern this case used to carry.
    expect(inputs).toBe(a + b)
    expect(merged + onlyA + onlyB).toBe(inputs)
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
