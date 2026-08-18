import { describe, expect, it } from 'vitest'
import {
  assembleMaterial,
  formatBudgetNotice,
  formatShortfall,
  MATERIAL_BUDGET_CHARS,
  materialShortfall,
  parsePassFiles,
  parsePassSpec,
  passByIndex,
  passComposition,
  planPasses,
  sentMaterialMatches,
  splitPatchByFile,
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
    const paths = ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs', 'e.mjs']
    const files = paths.map((p, i) => file(p, 2000 + i * 700))
    const patch = patchFor(paths)
    const plan = planPasses({ stat: ' x | 1 +', patch, files, budget: 12_000 })
    const sections = new Map(splitPatchByFile(patch).map((s) => [s.path, s.text]))
    for (const pass of plan.passes) {
      const out = assembleMaterial({
        stat: ' x | 1 +',
        patch: pass.files.map((p) => sections.get(p)).join('\n'),
        files: files.filter((f) => pass.files.includes(f.path)),
        budget: 12_000,
        patchRoom: pass.patchRoom,
        patchOnly: pass.patchOnly,
      })
      expect(out.fit).toBe(true)
    }
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
    expect(parsePassFiles('a.mjs, b.mjs ,')).toEqual(['a.mjs', 'b.mjs'])
    expect(parsePassFiles('')).toEqual([])
    expect(parsePassFiles(undefined)).toEqual([])
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
    const [group] = passComposition([rec(1, 2), rec(2, 2)], { expect: ['f1.mjs', ' f1.mjs ', '', null, 'f2.mjs'] })
    expect(group.uncovered).toEqual([])
    expect(group.complete).toBe(true)
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
