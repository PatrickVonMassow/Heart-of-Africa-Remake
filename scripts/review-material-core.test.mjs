import { describe, expect, it } from 'vitest'
import {
  assembleMaterial,
  formatBudgetNotice,
  formatPassFiles,
  formatPassManifest,
  formatShortfall,
  MANIFEST_END,
  manifestAllowance,
  MATERIAL_BUDGET_CHARS,
  materialShortfall,
  parseDiffHeader,
  parsePassFiles,
  parsePassSpec,
  passByIndex,
  passComposition,
  planPasses,
  planShortfall,
  sentMaterialMatches,
  splitPatchByFile,
  undecodablePaths,
  unquoteGitPath,
  worstVerdict,
} from './review-material-core.mjs'

const file = (path, size, ch = 'x') => ({ path, text: ch.repeat(size) })
const patchFor = (paths) =>
  paths.map((p) => [`diff --git a/${p} b/${p}`, 'index 1..2 100644', `--- a/${p}`, `+++ b/${p}`, '+one line'].join('\n')).join('\n')

describe('the assembly says what it could not hold', () => {
  it('reports a complete round as fitting, and lists every file it sent', () => {
    const out = assembleMaterial({
      stat: ' a | 2 +-',
      patch: patchFor(['a.mjs', 'b.mjs']),
      files: [file('a.mjs', 40), file('b.mjs', 40)],
      budget: 10_000,
    })
    expect(out.fit).toBe(true)
    expect(out.sent).toEqual(['a.mjs', 'b.mjs'])
    expect(out.truncated).toEqual([])
    expect(out.omitted).toEqual([])
    expect(out.text).toContain('=== FILE (current content): a.mjs ===')
  })

  it('carries the patch BYTE-EXACT — a rename to a trailing-space destination survives', () => {
    // `rename to new ` names a path ending in a space; the old trim ate that
    // space with the final newline while `patchTruncated` stayed false, so the
    // normalised assembly still matched what was sent (cross-vendor review,
    // fourth round). A silent edit to the artefact is not an accounting.
    const patch = 'diff --git a/old b/new \nsimilarity index 100%\nrename from old\nrename to new \n'
    const out = assembleMaterial({ stat: ' old => new | 0', patch, budget: 10_000 })
    expect(out.patchTruncated).toBe(false)
    expect(out.fit).toBe(true)
    expect(out.text).toContain('rename to new \n')
  })

  it('NAMES the file it had to cut, and stops calling the round complete', () => {
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [file('big.md', 5000)], budget: 1500 })
    expect(out.fit).toBe(false)
    expect(out.truncated).toEqual(['big.md'])
    expect(out.sent).toEqual([])
  })

  it('NAMES the file it had no budget left for at all', () => {
    const out = assembleMaterial({
      stat: 's',
      patch: 'p',
      files: [file('first.md', 4000), file('second.md', 1)],
      budget: 1200,
    })
    expect(out.omitted).toEqual(['second.md'])
    expect(out.fit).toBe(false)
  })

  it('counts a cut PATCH as a short-fall of its own, not only the files', () => {
    const out = assembleMaterial({ stat: 's', patch: 'p'.repeat(50_000), files: [], budget: 4000 })
    expect(out.patchTruncated).toBe(true)
    expect(out.fit).toBe(false)
  })

  it('counts a cut DIFFSTAT too — a range whose shape did not fit is not a whole round', () => {
    const out = assembleMaterial({ stat: 's'.repeat(9000), patch: 'p', files: [], budget: 4000 })
    expect(out.statTruncated).toBe(true)
    expect(out.fit).toBe(false)
  })

  it('measures the COMPLETE material, not only what survived the cut', () => {
    const out = assembleMaterial({ stat: '', patch: '', files: [file('big.md', 50_000)], budget: 1000 })
    expect(out.rawSize).toBe(50_000)
    expect(out.size).toBeLessThan(1200)
  })

  it('treats a declared patch-only file as covered, not as a loss', () => {
    const out = assembleMaterial({
      stat: 's',
      patch: patchFor(['archive.md']),
      files: [file('archive.md', 90_000)],
      budget: 10_000,
      patchOnly: ['archive.md'],
    })
    expect(out.fit).toBe(true)
    expect(out.patchOnly).toEqual(['archive.md'])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('FILE CONTENT NOT SENT')
    expect(out.text).not.toContain('x'.repeat(200))
  })

  // …but the NOTE it travels as costs room, and pushing it with none left put
  // the round over its ceiling while the loss list stayed empty (cross-vendor
  // review, second round).
  it('does not spend room it has not got on the patch-only notes', () => {
    const out = assembleMaterial({
      stat: 's',
      patch: 'p',
      files: [file('a.md', 9), file('b.md', 9), file('c.md', 9), file('d.md', 9)],
      budget: 400,
      patchOnly: ['a.md', 'b.md', 'c.md', 'd.md'],
    })
    // The notes stop where the room does, and what is left over is an OMISSION —
    // which is a loss, so the round is not complete and no record may rest on it.
    expect(out.patchOnly.length).toBeLessThan(4)
    expect(out.omitted.length).toBeGreaterThan(0)
    expect(out.fit).toBe(false)
  })

  it('keeps every round it CALLS complete inside its budget', () => {
    // The invariant the flags alone did not carry: a declared coverage may cost
    // room, so "nothing was cut" must never outvote the measured size.
    for (const budget of [600, 1200, 5000, 20_000]) {
      const out = assembleMaterial({
        stat: 's'.repeat(300),
        patch: patchFor(['a.md', 'b.md', 'c.md']),
        files: [file('a.md', 200), file('b.md', 400), file('c.md', 900)],
        budget,
        patchOnly: ['c.md'],
      })
      if (out.fit) expect(out.size, `budget ${budget}`).toBeLessThanOrEqual(budget)
    }
  })

  it('never calls a round complete whose text is over the ceiling', () => {
    // The frames the assembly writes belong to no file's reservation, so the
    // measured text — not the empty loss list — is what answers "did it fit".
    const out = assembleMaterial({ stat: '', patch: '', files: [], budget: 5 })
    expect(out.size).toBeGreaterThan(5)
    expect(out.truncated).toEqual([])
    expect(out.omitted).toEqual([])
    expect(out.fit).toBe(false)
    const said = formatShortfall(materialShortfall({ assembly: out, sent: out.text }), { sha: 'abc1234' })
    expect(said).toContain('over the ceiling')
  })

  it('is fine with a commit that only deleted files', () => {
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [], budget: 10_000 })
    expect(out.fit).toBe(true)
    expect(out.text).toContain('=== PATCH ===')
  })

  it('survives a nonsense budget rather than throwing at the reviewer', () => {
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [file('a', 10)], budget: 0 })
    expect(typeof out.text).toBe('string')
    expect(out.fit).toBe(false)
  })
})

describe('a truncation notice INSIDE the material proves nothing', () => {
  // The point's own clause: the notice is written into the material, so a check
  // that scans the text answers about the wrong thing in BOTH directions.
  it('does not call a round short because a reviewed FILE contains the marker', () => {
    const decoy = '… [TRUNCATED: 40207 characters not shown]\n=== FILE OMITTED ENTIRELY (material budget spent): x ==='
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [{ path: 'core.mjs', text: decoy }], budget: 10_000 })
    expect(out.text).toContain('[TRUNCATED:')
    expect(out.fit).toBe(true)
    expect(materialShortfall({ assembly: out, sent: out.text })).toBeNull()
  })

  it('still refuses a round that really was cut, marker or no marker', () => {
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [file('big.md', 9000)], budget: 1500 })
    const short = materialShortfall({ assembly: out, sent: out.text })
    expect(short?.reason).toBe('over-budget')
    expect(short?.truncated).toEqual(['big.md'])
  })
})

describe('what was assembled against what was sent', () => {
  const assembly = assembleMaterial({ stat: 's', patch: 'p', files: [file('a.mjs', 20)], budget: 10_000 })

  it('clears a round whose text went out unchanged', () => {
    expect(sentMaterialMatches(assembly, assembly.text)).toMatchObject({ known: true, matches: true })
    expect(materialShortfall({ assembly, sent: assembly.text })).toBeNull()
  })

  it('refuses when the caller sent something else', () => {
    const short = materialShortfall({ assembly, sent: `${assembly.text.slice(0, 20)}… (rebuilt elsewhere)` })
    expect(short?.reason).toBe('sent-differs')
    expect(materialShortfall({ assembly, sent: '' })?.reason).toBe('sent-differs')
  })

  it('refuses when the caller cannot say what it sent — the fail-open direction', () => {
    expect(materialShortfall({ assembly })?.reason).toBe('unverified')
    expect(materialShortfall({ assembly, sent: null })?.reason).toBe('unverified')
    expect(materialShortfall({ assembly, sent: 42 })?.reason).toBe('unverified')
  })

  it('refuses when there is no accounting at all', () => {
    expect(materialShortfall({})?.reason).toBe('unverified')
    expect(materialShortfall({ assembly: {}, sent: 'x' })?.reason).toBe('unverified')
  })

  // THE ECHO PINS THE CALL SITE, NOT THE TRANSPORT (escalation round): the
  // string the caller hands the spawn is the string it compares against, so an
  // identical pair proves only that no variable was swapped. Where the process
  // layer reported an error mid-hand-off, whether the material arrived is
  // UNKNOWN — and unknown refuses, even though the echo still matches.
  it('refuses a round whose hand-off the process layer reported broken', () => {
    const short = materialShortfall({
      assembly,
      sent: assembly.text,
      transportError: 'the run was killed on its time budget, mid-stream',
    })
    expect(short?.reason).toBe('unverified')
    expect(short?.detail).toContain('did not complete')
    expect(short?.detail).toContain('time budget')
    expect(formatShortfall(short, { sha: 'abc1234' })).toContain('NO RECORD COMMAND IS PRINTED')
  })

  it('does not read an empty transport report as a problem', () => {
    expect(materialShortfall({ assembly, sent: assembly.text, transportError: '' })).toBeNull()
    expect(materialShortfall({ assembly, sent: assembly.text, transportError: '  ' })).toBeNull()
  })
})

describe('the patch, split per file', () => {
  it('gives each file its own section', () => {
    const sections = splitPatchByFile(patchFor(['a.mjs', 'b.mjs']))
    expect(sections.map((s) => s.path)).toEqual(['a.mjs', 'b.mjs'])
    expect(sections[0].text).toContain('diff --git a/a.mjs b/a.mjs')
    expect(sections[0].text).not.toContain('b.mjs')
  })

  it('finds nothing in an empty patch', () => {
    expect(splitPatchByFile('')).toEqual([])
    expect(splitPatchByFile(null)).toEqual([])
  })

  // A PATH GIT QUOTED IS STILL A PATH (cross-vendor review, second round): read
  // literally it matched no section and resolved in no `git show`, so the file
  // travelled in no pass and nothing said it was missing.
  it('reads a QUOTED header as the path git meant', () => {
    const quoted = 'scripts/we\tird.mjs'
    const sections = splitPatchByFile(
      [`diff --git "a/scripts/we\\tird.mjs" "b/scripts/we\\tird.mjs"`, '--- a/x', '+++ b/x', '+one'].join('\n'),
    )
    expect(sections.map((s) => s.path)).toEqual([quoted])
  })

  it('decodes the escapes git writes, bytes and all', () => {
    expect(unquoteGitPath('"a/x\\ty"')).toBe('a/x\ty')
    expect(unquoteGitPath('"a/say \\"so\\""')).toBe('a/say "so"')
    expect(unquoteGitPath('"a/back\\\\slash"')).toBe('a/back\\slash')
    // Octal escapes are BYTES: two of them are one UTF-8 character.
    expect(unquoteGitPath('"docs/\\303\\244.md"')).toBe('docs/ä.md')
    // Anything git did not quote comes back untouched.
    expect(unquoteGitPath('scripts/plain.mjs')).toBe('scripts/plain.mjs')
    expect(unquoteGitPath('')).toBe('')
  })

  it('picks the split whose two halves match where a path itself holds " b/"', () => {
    const header = parseDiffHeader('diff --git a/dir b/file.mjs b/dir b/file.mjs')
    expect(header).toEqual({ a: 'dir b/file.mjs', b: 'dir b/file.mjs' })
  })

  it('is not fooled into calling an ordinary line a header', () => {
    expect(parseDiffHeader('index 1..2 100644')).toBeNull()
    expect(parseDiffHeader('diff --git nothing-like-a-path')).toBeNull()
    expect(parseDiffHeader('diff --git "a/never closes')).toBeNull()
    expect(parseDiffHeader(null)).toBeNull()
  })

  it('names a RENAME by where it landed, quoted or not', () => {
    expect(parseDiffHeader('diff --git a/old.mjs b/new.mjs')).toEqual({ a: 'old.mjs', b: 'new.mjs' })
    expect(parseDiffHeader('diff --git "a/o\\tld.mjs" "b/n\\tew.mjs"')).toEqual({ a: 'o\tld.mjs', b: 'n\tew.mjs' })
  })

  // AN AMBIGUOUS RENAME IS DECIDED BY ITS OWN LINES (cross-vendor review, third
  // round): `a/old.txt b/new b/dest.txt` reads as a rename to `dest.txt` or to
  // `new b/dest.txt` with equal right, and the wrong guess dropped the real
  // destination's patch association while a fictitious path entered the plan.
  it('reads an ambiguous rename destination from the rename from/to lines', () => {
    const lookahead = ['similarity index 90%', 'rename from old.txt', 'rename to new b/dest.txt']
    expect(parseDiffHeader('diff --git a/old.txt b/new b/dest.txt', lookahead)).toEqual({
      a: 'old.txt',
      b: 'new b/dest.txt',
    })
    // …and the mirror image, where the SOURCE carries the ` b/`.
    expect(
      parseDiffHeader('diff --git a/old b/x.txt b/y.txt', ['rename from old b/x.txt', 'rename to y.txt']),
    ).toEqual({ a: 'old b/x.txt', b: 'y.txt' })
    // Copies name their paths the same way.
    expect(
      parseDiffHeader('diff --git a/old.txt b/new b/dest.txt', ['copy from old.txt', 'copy to new b/dest.txt']),
    ).toEqual({ a: 'old.txt', b: 'new b/dest.txt' })
    // A QUOTED from/to line is decoded like every other git path.
    expect(
      parseDiffHeader('diff --git a/old.txt b/x b/y', ['rename from old.txt', 'rename to "x b/\\ty"']),
    ).toEqual({ a: 'old.txt', b: 'x b/\ty' })
  })

  it('stops reading rename lines at the first hunk or the next file', () => {
    // A `rename to` inside ADDED CONTENT sits below a hunk header and must not
    // rewrite the header above it.
    const lookahead = ['index 1..2 100644', '@@ -1 +1 @@', '+rename to smuggled.txt']
    expect(parseDiffHeader('diff --git a/old.txt b/new b/dest.txt', lookahead)).toEqual({
      a: 'old.txt b/new',
      b: 'dest.txt',
    })
  })

  it('gives an ambiguous rename SECTION the destination its own lines name', () => {
    const patch = [
      'diff --git a/old.txt b/new b/dest.txt',
      'similarity index 95%',
      'rename from old.txt',
      'rename to new b/dest.txt',
      '--- a/old.txt',
      '+++ b/new b/dest.txt',
      '@@ -1 +1 @@',
      '+changed',
      patchFor(['plain.mjs']),
    ].join('\n')
    const sections = splitPatchByFile(patch)
    expect(sections.map((s) => s.path)).toEqual(['new b/dest.txt', 'plain.mjs'])
    expect(sections[0].text).toContain('rename to new b/dest.txt')
  })
})

describe('the passes a range too large is cut into', () => {
  it('leaves a range that fits in one pass', () => {
    const plan = planPasses({
      stat: 's',
      patch: patchFor(['a.mjs']),
      files: [file('a.mjs', 100)],
      budget: 20_000,
    })
    expect(plan.fits).toBe(true)
    expect(plan.passes).toHaveLength(1)
  })

  it('CUTS THROUGH THE FILE SET so every file lands in exactly one pass', () => {
    const paths = ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs']
    const plan = planPasses({
      stat: 's',
      patch: patchFor(paths),
      files: paths.map((p) => file(p, 3000)),
      budget: 10_000,
    })
    expect(plan.fits).toBe(false)
    expect(plan.passes.length).toBeGreaterThan(1)
    const covered = plan.passes.flatMap((p) => p.files)
    expect([...covered].sort()).toEqual([...paths].sort())
    expect(covered).toHaveLength(new Set(covered).size)
    for (const pass of plan.passes) expect(pass.total).toBe(plan.passes.length)
  })

  it('sends a file bigger than a whole round as its DIFF, and says so', () => {
    const plan = planPasses({
      stat: 's',
      patch: patchFor(['archive.md', 'guard.mjs']),
      files: [file('archive.md', 400_000), file('guard.mjs', 500)],
      budget: 10_000,
    })
    const holder = plan.passes.find((p) => p.files.includes('archive.md'))
    expect(holder.patchOnly).toEqual(['archive.md'])
    expect(plan.uncoverable).toEqual([])
    expect(plan.passes.flatMap((p) => p.files)).toContain('guard.mjs')
  })

  it('names a file whose DIFF alone exceeds a round as beyond reach, and covers it in NO pass', () => {
    const huge = ['diff --git a/x.md b/x.md', `+${'y'.repeat(30_000)}`].join('\n')
    const plan = planPasses({ stat: 's', patch: huge, files: [file('x.md', 10)], budget: 5000 })
    expect(plan.uncoverable.map((u) => u.path)).toEqual(['x.md'])
    expect(plan.passes.flatMap((p) => p.files)).not.toContain('x.md')
    expect(plan.fits).toBe(false)
  })

  it('costs a deleted file from the patch alone, so it is not lost from the plan', () => {
    const plan = planPasses({ stat: 's', patch: patchFor(['gone.mjs']), files: [], budget: 20_000 })
    expect(plan.passes[0].files).toEqual(['gone.mjs'])
  })

  it('gives a pass whose patch outgrows the standing half-share the room it needs', () => {
    const plan = planPasses({
      stat: 's',
      patch: ['diff --git a/a.mjs b/a.mjs', `+${'z'.repeat(7000)}`].join('\n'),
      files: [file('a.mjs', 10)],
      budget: 10_000,
    })
    expect(plan.passes[0].patchRoom).toBeGreaterThan(Math.floor(10_000 * 0.5))
  })

  it('does NOT call a range fitting whose DIFFSTAT exceeds its share — the assembly will refuse it', () => {
    // Math.min silently assumed the cut, so the plan said one fitting pass
    // while assembleMaterial marked the same round statTruncated: the plan-only
    // hand-off paths then offered a whole-range record for material that
    // cannot fit (cross-vendor review, fourth round).
    const budget = 10_000
    const plan = planPasses({
      stat: 's'.repeat(2000), // over the 5% share of 10_000
      patch: patchFor(['a.mjs']),
      files: [file('a.mjs', 100)],
      budget,
    })
    expect(plan.statTruncated).toBe(true)
    expect(plan.fits).toBe(false)
    // …and the refusal it produces names the diffstat, not a futile pass list:
    // every pass carries the whole stat, so no pass can assemble complete.
    const shortfall = planShortfall(plan)
    expect(shortfall).not.toBeNull()
    const text = formatShortfall(shortfall, { sha: 'a'.repeat(40), plan })
    expect(text).toContain('NO RECORD COMMAND IS PRINTED')
    expect(text).toContain('DIFFSTAT ALONE')
    expect(text).toContain('NARROWER range')
    expect(text).not.toContain('--pass 1')
    expect(formatBudgetNotice(plan, { sha: 'a'.repeat(40) })).toContain('DIFFSTAT ALONE')
    // The assembly agrees: the same parts do not fit one round.
    const assembly = assembleMaterial({ stat: 's'.repeat(2000), patch: patchFor(['a.mjs']), files: [file('a.mjs', 100)], budget })
    expect(assembly.statTruncated).toBe(true)
    expect(assembly.fit).toBe(false)
  })

  it('plans nothing for a range that touched nothing', () => {
    const plan = planPasses({ stat: '', patch: '', files: [], budget: 10_000 })
    expect(plan.passes).toEqual([])
    expect(plan.fits).toBe(true)
  })

  it('hands back one pass by number, and null for a pass that does not exist', () => {
    const paths = ['a.mjs', 'b.mjs', 'c.mjs']
    const plan = planPasses({ stat: 's', patch: patchFor(paths), files: paths.map((p) => file(p, 4000)), budget: 10_000 })
    expect(passByIndex(plan, 1).index).toBe(1)
    expect(passByIndex(plan, 99)).toBeNull()
    expect(passByIndex(null, 1)).toBeNull()
  })

  it('produces a plan whose passes the ASSEMBLY then confirms as fitting', () => {
    // The plan is advisory and the assembly is authority — so the two must agree
    // on a plan the planner itself calls complete, or every pass would refuse.
    // Each pass carries its MANIFEST, exactly as the command assembles it: the
    // plan reserved that room, and the confirmation must spend it.
    const paths = ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs', 'e.mjs']
    const files = paths.map((p, i) => file(p, 2000 + i * 700))
    const patch = patchFor(paths)
    const plan = planPasses({ stat: ' x | 1 +', patch, files, budget: 12_000 })
    expect(plan.fits).toBe(false)
    const sections = new Map(splitPatchByFile(patch).map((s) => [s.path, s.text]))
    for (const pass of plan.passes) {
      const out = assembleMaterial({
        stat: ' x | 1 +',
        patch: pass.files.map((p) => sections.get(p)).join('\n'),
        files: files.filter((f) => pass.files.includes(f.path)),
        budget: 12_000,
        patchRoom: pass.patchRoom,
        patchOnly: pass.patchOnly,
        manifest: formatPassManifest(plan, pass),
      })
      expect(out.fit).toBe(true)
    }
  })
})

// THE STRUCTURAL FINDING OF THE FOURTH CROSS-VENDOR ROUND: three of four passes
// were refused a conclusion because the whole-range diffstat named files the
// pass deliberately did not carry, and nothing in the material said so. The
// material of a pass must state its own shape INSIDE the material.
describe('the manifest a pass carries — the material states its own shape', () => {
  const splitPlan = () => {
    const paths = ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs']
    return {
      paths,
      plan: planPasses({
        stat: 's',
        patch: patchFor(paths),
        files: paths.map((p) => file(p, 3000)),
        budget: 10_000,
      }),
    }
  }

  it('names which pass this is, what it carries, and what is absent BY DESIGN with its pass', () => {
    const { plan } = splitPlan()
    expect(plan.passes.length).toBeGreaterThan(1)
    const first = plan.passes[0]
    const text = formatPassManifest(plan, first)
    expect(text).toContain(`=== REVIEW PASS 1/${plan.passes.length} `)
    for (const path of first.files) expect(text).toContain(`· ${path} — complete`)
    expect(text).toContain('ABSENT BY DESIGN')
    for (const other of plan.passes.slice(1)) {
      for (const path of other.files) {
        expect(text).toContain(`· ${path} → pass ${other.index}/${plan.passes.length}`)
      }
    }
    // The two kinds of absence are stated as OPPOSITE things.
    expect(text).toContain('NOT truncated')
    expect(text).toContain(MANIFEST_END)
  })

  it('marks a DIFF-ONLY file as a delivery level, distinct from an absence', () => {
    const plan = planPasses({
      stat: 's',
      patch: patchFor(['archive.md', 'guard.mjs', 'other.mjs']),
      files: [file('archive.md', 400_000), file('guard.mjs', 6000), file('other.mjs', 6000)],
      budget: 10_000,
    })
    const holder = plan.passes.find((p) => p.patchOnly.includes('archive.md'))
    const text = formatPassManifest(plan, holder)
    expect(text).toContain('· archive.md — DIFF ONLY, by design')
    expect(text).not.toContain('· archive.md — complete')
  })

  it('names the files beyond the reach of any pass, so nobody assumes they were read', () => {
    const huge = ['diff --git a/x.md b/x.md', `+${'y'.repeat(30_000)}`].join('\n')
    const plan = planPasses({
      stat: 's',
      patch: `${huge}\n${patchFor(['a.mjs'])}`,
      files: [file('x.md', 10), file('a.mjs', 10)],
      budget: 5000,
    })
    expect(plan.uncoverable.map((u) => u.path)).toEqual(['x.md'])
    const text = formatPassManifest(plan, plan.passes[0])
    expect(text).toContain('BEYOND THE REACH OF ANY PASS')
    expect(text).toContain('· x.md')
  })

  it('never outgrows the room the plan reserved for it', () => {
    // The allowance is computable before the passes exist; the real manifest
    // must stay inside it for every pass, or the assembly refuses a pass the
    // plan called complete — one paid round later.
    const paths = Array.from({ length: 40 }, (_, i) => `scripts/some-quite-long-directory/name-${i}.mjs`)
    const plan = planPasses({
      stat: 's'.repeat(300),
      patch: patchFor(paths),
      files: paths.map((p) => file(p, 4000)),
      budget: 12_000,
    })
    expect(plan.passes.length).toBeGreaterThan(2)
    const allowance = manifestAllowance(paths)
    for (const pass of plan.passes) {
      expect(formatPassManifest(plan, pass).length).toBeLessThanOrEqual(allowance)
    }
  })

  it('travels at the TOP of the material and inside its measured size', () => {
    const manifest = 'M'.repeat(60)
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [], budget: 10_000, manifest })
    expect(out.text.startsWith(manifest)).toBe(true)
    const bare = assembleMaterial({ stat: 's', patch: 'p', files: [], budget: 10_000 })
    expect(out.size).toBe(bare.size + manifest.length + 1)
  })

  it('counts against the ceiling — a manifest nobody reserved room for fails the fit', () => {
    const bare = assembleMaterial({ stat: 's', patch: 'p', files: [], budget: 60 })
    expect(bare.fit).toBe(true)
    const out = assembleMaterial({ stat: 's', patch: 'p', files: [], budget: 60, manifest: 'M'.repeat(60) })
    expect(out.fit).toBe(false)
  })
})

describe('what the caller is told before the round is spent', () => {
  it('names the threshold and this range against it', () => {
    const plan = planPasses({ stat: 's', patch: patchFor(['a.mjs']), files: [file('a.mjs', 50)], budget: 20_000 })
    const notice = formatBudgetNotice(plan, { sha: 'abcdef1234' })
    expect(notice).toContain('20000 characters per round')
    expect(notice).toContain('It fits in one round.')
  })

  it('names every pass and its files when it does not fit', () => {
    const paths = ['a.mjs', 'b.mjs', 'c.mjs']
    const plan = planPasses({ stat: 's', patch: patchFor(paths), files: paths.map((p) => file(p, 4000)), budget: 10_000 })
    const notice = formatBudgetNotice(plan, { sha: 'abcdef1234567' })
    expect(notice).toContain('PASSES over the FILE SET')
    expect(notice).toContain('--pass 1')
    for (const p of paths) expect(notice).toContain(p)
    expect(notice).toContain('splitting by COMMIT does not help')
  })

  it('names the files beyond reach of any pass', () => {
    const huge = ['diff --git a/x.md b/x.md', `+${'y'.repeat(30_000)}`].join('\n')
    const plan = planPasses({ stat: 's', patch: huge, files: [file('x.md', 10)], budget: 5000 })
    expect(formatBudgetNotice(plan, { sha: 'aaaaaaa' })).toContain('BEYOND REACH')
  })
})

describe('the refusal a short-fall prints', () => {
  const shortfallFor = (overrides) =>
    formatShortfall({ reason: 'over-budget', truncated: [], omitted: [], budget: 200_000, size: 1, rawSize: 2, ...overrides })

  it('never prints a record command, and names every file that was lost', () => {
    const text = shortfallFor({ truncated: ['scripts/a.mjs'], omitted: ['scripts/b.mjs'] })
    expect(text).toContain('NO RECORD COMMAND IS PRINTED')
    expect(text).toContain('TRUNCATED: scripts/a.mjs')
    expect(text).toContain('OMITTED ENTIRELY: scripts/b.mjs')
    expect(text).not.toContain('mechanism-review.mjs --record')
  })

  it('names a cut patch and a cut diffstat as their own losses', () => {
    const text = shortfallFor({ statTruncated: true, patchTruncated: true })
    expect(text).toContain('the DIFFSTAT was cut')
    expect(text).toContain('the PATCH was cut')
  })

  it('says plainly when it could not tell whether the material fitted', () => {
    const text = formatShortfall({ reason: 'unverified', detail: 'the caller did not say what it sent' })
    expect(text).toContain('cannot tell')
    expect(text).toContain('NO RECORD COMMAND IS PRINTED')
  })

  it('says plainly when the sent text is not the assembled one', () => {
    const text = formatShortfall({ reason: 'sent-differs', detail: 'what was sent is 3 characters' })
    expect(text).toContain('not what was assembled')
  })

  // EVERY BRANCH NAMES THE LOST FILES (cross-vendor review, second round): the
  // two "cannot tell" reasons returned before the list, so the refusal that knew
  // which files were dropped printed none of them.
  it('names the lost files even where it cannot vouch for the round', () => {
    const account = { truncated: ['scripts/a.mjs'], omitted: ['scripts/b.mjs'], budget: 200, size: 400, rawSize: 900 }
    const unverified = formatShortfall({ reason: 'unverified', detail: 'nothing said', ...account })
    expect(unverified).toContain('TRUNCATED: scripts/a.mjs')
    expect(unverified).toContain('OMITTED ENTIRELY: scripts/b.mjs')
    expect(unverified).toContain('over the ceiling')
    const differs = formatShortfall({ reason: 'sent-differs', detail: 'sizes differ', ...account })
    expect(differs).toContain('TRUNCATED: scripts/a.mjs')
    expect(differs).toContain('OMITTED ENTIRELY: scripts/b.mjs')
  })

  it('stays quiet about losses where the accounting recorded none', () => {
    const text = formatShortfall({ reason: 'unverified', detail: 'no assembly accounting was produced' })
    expect(text).not.toContain('TRUNCATED')
    expect(text).not.toContain('What the accounting saw')
  })
})

// A RECORD IS REFUSED BEFORE A ROUND IS EVER SPENT, too: the hand-over paths
// print a whole-range template without assembling anything, and an unmeasured
// range is an unknown fit (cross-vendor review, second round).
describe('the refusal a PLAN alone produces', () => {
  const oversized = () =>
    planPasses({
      stat: 's',
      patch: patchFor(['a.mjs', 'b.mjs']),
      files: [file('a.mjs', 8000), file('b.mjs', 8000)],
      budget: 10_000,
    })

  it('is null while the range fits one round', () => {
    expect(planShortfall(planPasses({ stat: 's', patch: patchFor(['a.mjs']), files: [file('a.mjs', 10)], budget: 10_000 }))).toBeNull()
  })

  it('refuses an unmeasured range rather than assuming it fits', () => {
    for (const nothing of [null, undefined, {}, { fits: 'maybe' }]) {
      const short = planShortfall(nothing)
      expect(short?.reason).toBe('unplanned')
      expect(formatShortfall(short, { sha: 'abcdef1' })).toContain('unknown fit refuses')
    }
  })

  it('names the passes the hand-over must be split into', () => {
    const short = planShortfall(oversized())
    expect(short.reason).toBe('needs-passes')
    const text = formatShortfall(short, { sha: 'abcdef1' })
    expect(text).toContain('does not fit ONE review round')
    expect(text).toContain('--pass 1')
    expect(text).toContain('a.mjs')
    expect(text).not.toContain('mechanism-review.mjs --record')
  })

  it('names what NO pass can hold, so no record claims to have read it', () => {
    const huge = ['diff --git a/x.md b/x.md', `+${'y'.repeat(30_000)}`].join('\n')
    const plan = planPasses({ stat: 's', patch: `${huge}\n${patchFor(['a.mjs'])}`, files: [file('a.mjs', 100)], budget: 5000 })
    const text = formatShortfall(planShortfall(plan), { sha: 'abcdef1' })
    expect(text).toContain('BEYOND REACH')
    expect(text).toContain('x.md')
  })

  it('lists the passes to run instead, when a plan is at hand', () => {
    const paths = ['a.mjs', 'b.mjs', 'c.mjs']
    const plan = planPasses({ stat: 's', patch: patchFor(paths), files: paths.map((p) => file(p, 4000)), budget: 10_000 })
    const text = formatShortfall(
      { reason: 'over-budget', truncated: ['a.mjs'], omitted: [], budget: 10_000, size: 1, rawSize: 2 },
      { sha: 'abcdef1', plan },
    )
    expect(text).toContain('--pass 1')
  })
})

describe('the pass flag', () => {
  it('reads k/n', () => {
    expect(parsePassSpec('2/3')).toMatchObject({ ok: true, index: 2, total: 3 })
    expect(parsePassSpec(' 1 / 2 ')).toMatchObject({ ok: true, index: 1, total: 2 })
  })

  it('refuses a single pass — that is an ordinary record', () => {
    expect(parsePassSpec('1/1').ok).toBe(false)
  })

  it('refuses a pass number outside its own total', () => {
    expect(parsePassSpec('4/3').ok).toBe(false)
    expect(parsePassSpec('0/3').ok).toBe(false)
  })

  it('refuses anything that is not k/n', () => {
    for (const bad of ['', 'two of three', '2', '2/', 'a/b', null]) expect(parsePassSpec(bad).ok).toBe(false)
  })

  it('reads the file list, and treats an empty one as empty', () => {
    expect(parsePassFiles('a.mjs,b.mjs,')).toMatchObject({ ok: true, files: ['a.mjs', 'b.mjs'] })
    expect(parsePassFiles('')).toMatchObject({ ok: true, files: [] })
    expect(parsePassFiles(undefined)).toMatchObject({ ok: true, files: [] })
  })

  // ONE round-trippable representation for a git path (cross-vendor review,
  // third round): the old `.split(',').map(trim)` could not carry a comma or an
  // edge space at all, and ` x` COLLAPSED into `x` — a coverage claim about a
  // path nobody named.
  it('round-trips a path with a comma, a quote, a trailing space and __C__ intact', () => {
    const odd = ['scripts/a,b.mjs', 'scripts/say "so".mjs', 'scripts/git-hooks/check ', ' lead', 'scripts/x__C__y.mjs', 'plain.mjs']
    const written = formatPassFiles(odd)
    expect(parsePassFiles(written)).toEqual({ ok: true, files: odd, errors: [] })
  })

  it('round-trips a MULTI-BYTE character inside a quoted path, not as mojibake', () => {
    // `"😀,x"` used to parse back as replacement characters: the unquoter
    // walked UTF-16 code units, so each half of the surrogate pair went to
    // Buffer alone — and distinct legal paths could collapse into one spelling
    // in the coverage accounting (cross-vendor review, fourth round).
    const odd = ['😀,x', 'scripts/ä,ö.mjs']
    expect(parsePassFiles(formatPassFiles(odd))).toEqual({ ok: true, files: odd, errors: [] })
    expect(unquoteGitPath('"a/\\303\\244.mjs"')).toBe('a/ä.mjs')
  })

  it('REFUSES a path carrying U+FFFD — the spelling that cannot name one file', () => {
    // Bytes that are not valid UTF-8 decode to U+FFFD, and two DIFFERENT such
    // paths become the same string; a record under that spelling could clear a
    // file nobody read. The named residual errs to refusing: a file genuinely
    // named with U+FFFD is refused alongside, indistinguishably.
    expect(undecodablePaths(['ok.mjs', 'bad�name'])).toEqual(['bad�name'])
    const out = parsePassFiles('ok.mjs,bad�name')
    expect(out.ok).toBe(false)
    expect(out.errors.join('\n')).toContain('U+FFFD')
    // …and the quoted spelling of invalid bytes decodes to the same refusal.
    const viaOctal = parsePassFiles('"bad\\377name"')
    expect(viaOctal.ok).toBe(false)
  })

  it('round-trips control characters as git octal escapes', () => {
    const odd = ['scripts/we\tird.mjs', 'nl\nin-name']
    expect(parsePassFiles(formatPassFiles(odd))).toMatchObject({ ok: true, files: odd })
    expect(formatPassFiles(['scripts/we\tird.mjs'])).toBe('"scripts/we\\011ird.mjs"')
  })

  it('REFUSES a bare token with edge whitespace instead of trimming it into another path', () => {
    const out = parsePassFiles('a.mjs, b.mjs')
    expect(out.ok).toBe(false)
    expect(out.errors.join('\n')).toContain('whitespace')
    expect(out.errors.join('\n')).toContain('C-quoted')
    // The collapse is exactly what must not happen: ` b.mjs` is not `b.mjs`.
    expect(out.files).not.toContain('b.mjs')
  })

  it('REFUSES an unclosed quote and a quote not ending at a comma', () => {
    expect(parsePassFiles('"a.mjs').ok).toBe(false)
    expect(parsePassFiles('"a.mjs"x,b.mjs').ok).toBe(false)
  })

  it('leaves a plain list unquoted for the human reading the command', () => {
    expect(formatPassFiles(['bulk-a.txt', 'bulk-b.txt'])).toBe('bulk-a.txt,bulk-b.txt')
  })
})

describe('the composition a set of pass records rests on', () => {
  const rec = (index, total, extra = {}) => ({
    sha: 'abc1234',
    verdict: 'merge',
    at: 100 + index,
    pass: { index, total, files: [`f${index}.mjs`] },
    ...extra,
  })

  it('is complete only when every pass is on record', () => {
    const [group] = passComposition([rec(1, 3), rec(2, 3)])
    expect(group.complete).toBe(false)
    expect(group.missing).toEqual([3])
    const [full] = passComposition([rec(1, 3), rec(2, 3), rec(3, 3)])
    expect(full.complete).toBe(true)
    expect(full.files).toEqual(['f1.mjs', 'f2.mjs', 'f3.mjs'])
  })

  it('keeps the later verdict when one pass was reviewed twice', () => {
    const groups = passComposition([
      rec(1, 2, { verdict: 'do-not-merge', at: 10 }),
      rec(1, 2, { verdict: 'merge', at: 20 }),
      rec(2, 2),
    ])
    expect(groups[0].complete).toBe(true)
    expect(worstVerdict(groups[0].records)).toBe('merge')
  })

  it('keeps two different splits of the same sha apart', () => {
    const groups = passComposition([rec(1, 2), rec(1, 3), rec(2, 3), rec(3, 3)])
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.total === 2).complete).toBe(false)
    expect(groups.find((g) => g.total === 3).complete).toBe(true)
  })

  it('ignores records that carry no usable pass marker', () => {
    expect(passComposition([{ sha: 'a', verdict: 'merge' }, rec(1, 1), { pass: { index: 'x', total: 3 } }])).toEqual([])
    expect(passComposition()).toEqual([])
  })

  // THE COUNT IS ONLY HALF THE COVERAGE (cross-vendor review, first round): two
  // passes that both name the same file count as 1/2 and 2/2 and cleared a range
  // whose other files nobody had read.
  it('is INCOMPLETE while a file it must cover appears in no pass', () => {
    const [group] = passComposition([rec(1, 2), rec(2, 2)], { expect: ['f1.mjs', 'f2.mjs', 'guard.mjs'] })
    expect(group.missing).toEqual([])
    expect(group.uncovered).toEqual(['guard.mjs'])
    expect(group.complete).toBe(false)
  })

  it('is INCOMPLETE when every pass names the SAME file', () => {
    const both = { pass: { index: 1, total: 2, files: ['same.mjs'] } }
    const [group] = passComposition(
      [rec(1, 2, both), rec(2, 2, { pass: { index: 2, total: 2, files: ['same.mjs'] } })],
      { expect: ['same.mjs', 'other.mjs'] },
    )
    expect(group.uncovered).toEqual(['other.mjs'])
    expect(group.complete).toBe(false)
  })

  it('is complete when the passes name MORE than was expected of them', () => {
    const [group] = passComposition([rec(1, 2), rec(2, 2)], { expect: ['f2.mjs'] })
    expect(group.uncovered).toEqual([])
    expect(group.complete).toBe(true)
  })

  it('asks for nothing when the caller has nothing to compare against', () => {
    const [group] = passComposition([rec(1, 2), rec(2, 2)])
    expect(group.uncovered).toEqual([])
    expect(group.complete).toBe(true)
  })

  it('ignores blank and duplicated entries in the expected set', () => {
    const [group] = passComposition([rec(1, 2), rec(2, 2)], { expect: ['f1.mjs', 'f1.mjs', '', null, 'f2.mjs'] })
    expect(group.uncovered).toEqual([])
    expect(group.complete).toBe(true)
  })

  // BYTE-EXACT COVERAGE (cross-vendor review, third round): ` x` and `x` are
  // two legal paths; trimming the expected set collapsed them into one entry,
  // so a union could look complete without covering both.
  it('does NOT collapse a path with edge whitespace into its trimmed spelling', () => {
    const passes = [
      { sha: 'abc1234', verdict: 'merge', at: 101, pass: { index: 1, total: 2, files: ['scripts/git-hooks/check'] } },
      { sha: 'abc1234', verdict: 'merge', at: 102, pass: { index: 2, total: 2, files: ['f2.mjs'] } },
    ]
    const [group] = passComposition(passes, { expect: ['scripts/git-hooks/check ', 'f2.mjs'] })
    expect(group.uncovered).toEqual(['scripts/git-hooks/check '])
    expect(group.complete).toBe(false)
    // …and the honest spelling covers it.
    passes[0].pass.files = ['scripts/git-hooks/check ']
    const [honest] = passComposition(passes, { expect: ['scripts/git-hooks/check ', 'f2.mjs'] })
    expect(honest.complete).toBe(true)
  })

  it('takes the WORST verdict of a composition as the whole range verdict', () => {
    expect(worstVerdict([{ verdict: 'merge' }, { verdict: 'do-not-merge' }])).toBe('do-not-merge')
    expect(worstVerdict([{ verdict: 'merge' }, { verdict: 'merge-with-fixes' }])).toBe('merge-with-fixes')
    expect(worstVerdict([{ verdict: 'merge' }])).toBe('merge')
    expect(worstVerdict([])).toBe('')
  })
})

describe('the budget itself', () => {
  it('is the measured 200k the 17.08.2026 overflow was taken against', () => {
    expect(MATERIAL_BUDGET_CHARS).toBe(200_000)
  })
})
