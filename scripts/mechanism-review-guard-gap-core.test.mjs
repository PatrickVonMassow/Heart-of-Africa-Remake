// THE REVIEW-GAP RULING (point 714): the guard stands down — with a measured,
// named report — while a range's review material cannot be assembled at all,
// and resumes blocking the moment it can. Every branch of the pure ruling is
// pinned here; the live trap this closes held every turn on main hostage to a
// review no caller could produce (measured 18.08.2026).
import { describe, it, expect } from 'vitest'
import { SPLITTER_SPELLINGS } from './mechanism-review-guard-gap.mjs'
import {
  criticalityGapPlan,
  decideReviewGap,
  formatCriticalityGap,
  formatReviewGap,
  guardOutcome,
  REVIEW_GAP_BUDGET_CHARS,
} from './mechanism-review-guard-gap-core.mjs'

const material = await import('./review-material-core.mjs').catch(() => null)

describe('decideReviewGap', () => {
  it('rules NO gap while the material fits — the ordinary demand stands', () => {
    const d = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS - 1 })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('fits')
  })

  it('resumes blocking AT the budget exactly — fitting means fitting', () => {
    expect(decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS }).gap).toBe(false)
  })

  it('rules a GAP for an over-budget range in a tree with no splitting tool', () => {
    // The cherry-pick case: the clause lands ahead of the pass tooling, on the
    // very tree the trap is live on.
    const d = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS * 3, planner: null })
    expect(d.gap).toBe(true)
    expect(d.reason).toBe('no-splitter')
  })

  it('rules NO gap where a split COVERS the range — the pass review is owed', () => {
    // Not a blanket waiver: material that can be produced pass by pass keeps
    // the demand standing.
    const d = decideReviewGap({
      measuredChars: REVIEW_GAP_BUDGET_CHARS * 3,
      planner: { available: true, covers: true, uncoverable: [] },
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('splits')
  })

  it('rules a GAP where even the split cannot carry the range, naming the files', () => {
    const d = decideReviewGap({
      measuredChars: REVIEW_GAP_BUDGET_CHARS * 3,
      planner: { available: true, covers: false, uncoverable: ['docs/huge.md'] },
    })
    expect(d.gap).toBe(true)
    expect(d.reason).toBe('split-cannot-cover')
    expect(d.uncoverable).toEqual(['docs/huge.md'])
  })

  it('NEVER rules a gap from a failed measurement — it says so instead of assuming', () => {
    // Waiving the gate on an unmeasured claim would be the unearned clearance
    // this point exists to prevent: the check that cannot tell keeps blocking.
    for (const broken of [
      { measurementError: 'git exploded' },
      { measuredChars: null },
      { measuredChars: Number.NaN },
      { measuredChars: -1 },
      {},
    ]) {
      const d = decideReviewGap(broken)
      expect(d.gap, JSON.stringify(broken)).toBe(false)
      expect(d.reason).toBe('unmeasured')
    }
  })

  it('a measurement error outranks a plausible size — the error is the truth', () => {
    const d = decideReviewGap({ measuredChars: 10, measurementError: 'partial read' })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('unmeasured')
    expect(d.detail).toContain('partial read')
  })
})

describe('formatReviewGap', () => {
  const base = 'a'.repeat(40)
  const head = 'b'.repeat(40)

  it('names the range, the measured size and the budget — the spec’s own three', () => {
    const decision = decideReviewGap({ measuredChars: 3_014_107, planner: null })
    const text = formatReviewGap({ baseline: base, head, decision })
    expect(text).toContain(`${base.slice(0, 12)}..${head.slice(0, 12)}`)
    expect(text).toContain('3014107')
    expect(text).toContain(String(REVIEW_GAP_BUDGET_CHARS))
  })

  it('states the resume rule and that records keep their standing — no cleared-gate reading', () => {
    const decision = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS + 1, planner: null })
    const text = formatReviewGap({ baseline: base, head, decision })
    expect(text).toMatch(/RESUMES blocking/)
    expect(text).toMatch(/keep their standing/)
  })

  it('lists what even a split cannot carry', () => {
    const decision = decideReviewGap({
      measuredChars: REVIEW_GAP_BUDGET_CHARS * 5,
      planner: { available: true, covers: false, uncoverable: ['docs/tasks-archive.md'] },
    })
    const text = formatReviewGap({ baseline: base, head, decision })
    expect(text).toContain('docs/tasks-archive.md')
  })
})

describe('guardOutcome — the junction where a do-not-merge could be waved through', () => {
  // The trap's second door (measured 18.08.2026): the block came from a
  // RECORDED do-not-merge, not from a missing record, and the gap never fired.
  // The key is the measurement alone — never the verdict's prose.

  it('a standing verdict on a range that FITS blocks exactly as before — whatever it said', () => {
    const gap = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS - 1 })
    expect(guardOutcome({ blocked: true, gap }).action).toBe('block')
  })

  it('a standing verdict on a range that SPLITS into covering passes blocks — the pass review is owed', () => {
    const gap = decideReviewGap({
      measuredChars: REVIEW_GAP_BUDGET_CHARS * 3,
      planner: { available: true, covers: true, uncoverable: [] },
    })
    expect(guardOutcome({ blocked: true, gap }).action).toBe('block')
  })

  it('a block on a range that measures over budget and uncoverable degrades to the report', () => {
    const gap = decideReviewGap({
      measuredChars: REVIEW_GAP_BUDGET_CHARS * 3,
      planner: { available: true, covers: false, uncoverable: ['docs/huge.md'] },
    })
    expect(guardOutcome({ blocked: true, gap }).action).toBe('report-gap')
  })

  it('the same range, once it fits again, blocks again — the gap suspends, never clears', () => {
    const over = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS * 3, planner: null })
    const fits = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS - 1 })
    expect(guardOutcome({ blocked: true, gap: over }).action).toBe('report-gap')
    expect(guardOutcome({ blocked: true, gap: fits }).action).toBe('block')
  })

  it('an absent or failed ruling BLOCKS — fail-closed on the judgment', () => {
    expect(guardOutcome({ blocked: true, gap: null }).action).toBe('block')
    const unmeasured = decideReviewGap({ measurementError: 'git exploded' })
    expect(guardOutcome({ blocked: true, gap: unmeasured }).action).toBe('block')
  })

  it('an unblocked turn clears, gap ruling or none', () => {
    expect(guardOutcome({ blocked: false, gap: null }).action).toBe('clear')
  })
})

describe('formatReviewGap — the record door says so', () => {
  it('names the standing do-not-merge records and that their demand is suspended, not satisfied', () => {
    const decision = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS * 3, planner: null })
    const text = formatReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      decision,
      standingRecords: 2,
    })
    expect(text).toContain('2 do-not-merge record(s) stand on this range')
    expect(text).toContain('SUSPENDED for material, not satisfied')
  })

  it('says nothing about records where the block had none', () => {
    const decision = decideReviewGap({ measuredChars: REVIEW_GAP_BUDGET_CHARS * 3, planner: null })
    const text = formatReviewGap({ baseline: 'a'.repeat(40), head: 'b'.repeat(40), decision })
    expect(text).not.toContain('do-not-merge record(s)')
  })
})

describe('criticalityGapPlan — which criticality blocks may degrade at all', () => {
  const sha = 'c'.repeat(40)
  const backed = (kind, s = sha, point = 700) => ({ kind, tick: { number: point }, records: [{ sha: s }] })

  it('plans the record-backed refusals, each with its point and sha', () => {
    const plan = criticalityGapPlan([backed('unresolved'), backed('unanswered', 'd'.repeat(40), 712)])
    expect(plan).toEqual([
      { point: 700, sha },
      { point: 712, sha: 'd'.repeat(40) },
    ])
  })

  it('refuses the whole plan when ANY finding demands a fresh review a caller can always produce', () => {
    for (const kind of ['no-review', 'self-review', 'not-in-history']) {
      expect(criticalityGapPlan([backed('unresolved'), backed(kind)]), kind).toBe(null)
    }
  })

  it('refuses on a record whose sha cannot name a range — unmeasurable never waives', () => {
    expect(criticalityGapPlan([backed('unresolved', '')])).toBe(null)
    expect(criticalityGapPlan([{ kind: 'unresolved', tick: { number: 1 }, records: [] }])).toBe(null)
    expect(criticalityGapPlan([])).toBe(null)
  })

  it('plans EVERY record a finding carries, not only the first (round-2 pass 2)', () => {
    // One reviewable record among several is a demand somebody can meet;
    // measuring only records[0] would report a gap over it.
    const two = { kind: 'unresolved', tick: { number: 700 }, records: [{ sha }, { sha: 'd'.repeat(40) }] }
    expect(criticalityGapPlan([two])).toEqual([
      { point: 700, sha },
      { point: 700, sha: 'd'.repeat(40) },
    ])
    const second = { kind: 'unresolved', tick: { number: 700 }, records: [{ sha }, { sha: 'not-a-sha' }] }
    expect(criticalityGapPlan([second])).toBe(null)
  })
})

describe('assessReviewGap — the wrapper cannot waive on its own failure (round-2 pass 2)', () => {
  // Injected git and splitter loader: no repository is touched, and each
  // failure shape is played directly against the wrapper.
  const bigRun = (args) => {
    if (args[0] === 'diff' && args.includes('--stat')) return 'stat'
    if (args[0] === 'diff' && args.includes('--name-only')) return 'big.md\0'
    if (args[0] === 'diff') return 'x'.repeat(REVIEW_GAP_BUDGET_CHARS * 2)
    if (args[0] === 'show') return 'body'
    return ''
  }
  // The genuine-absence shape names THE SPLITTER ITSELF — by one of its exact
  // spellings, not a basename (round-4 pass 2) — as the unfindable module; the
  // same code with any other spelling is a broken tool.
  const absent = Object.assign(
    new Error(`Cannot find module '${SPLITTER_SPELLINGS[SPLITTER_SPELLINGS.length - 1]}' imported from x`),
    { code: 'ERR_MODULE_NOT_FOUND' },
  )

  it('a splitter that exists but CRASHES on load rules unmeasured — the gate keeps blocking', async () => {
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: bigRun,
      loadTool: () => Promise.reject(new Error('syntax error in tool')),
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('unmeasured')
    expect(d.detail).toContain('could not load')
  })

  it('a planner that THROWS rules unmeasured — never no-splitter', async () => {
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: bigRun,
      loadTool: () =>
        Promise.resolve({
          MATERIAL_BUDGET_CHARS: REVIEW_GAP_BUDGET_CHARS,
          planPasses: () => {
            throw new Error('planner exploded')
          },
        }),
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('unmeasured')
    expect(d.detail).toContain('planner failed')
  })

  it('only a genuinely ABSENT splitting tool rules no-splitter on size alone', async () => {
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: bigRun,
      loadTool: () => Promise.reject(absent),
    })
    expect(d.gap).toBe(true)
    expect(d.reason).toBe('no-splitter')
  })

  it('a splitter whose own TRANSITIVE import is missing is broken, not absent (round-3 pass 2)', async () => {
    // Node raises ERR_MODULE_NOT_FOUND for both shapes; only the one naming
    // the splitter itself proves the tree without the tool.
    const transitive = Object.assign(
      new Error("Cannot find module '/repo/scripts/repo-paths.mjs' imported from /repo/scripts/review-material-core.mjs"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    )
    // …including one that merely SHARES the splitter's basename elsewhere in
    // the tree (round-4 pass 2).
    const sameBasename = Object.assign(
      new Error("Cannot find module '/repo/vendor/review-material-core.mjs' imported from /repo/scripts/review-material-core.mjs"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    )
    for (const shape of [sameBasename]) {
      const { assessReviewGap: assess } = await import('./mechanism-review-guard-gap.mjs')
      const ruled = await assess({
        baseline: 'a'.repeat(40),
        head: 'b'.repeat(40),
        run: bigRun,
        loadTool: () => Promise.reject(shape),
      })
      expect(ruled.gap).toBe(false)
      expect(ruled.reason).toBe('unmeasured')
    }
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: bigRun,
      loadTool: () => Promise.reject(transitive),
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('unmeasured')
    expect(d.detail).toContain('could not load')
  })

  it('issues its git calls as EXACT argument arrays — no shell, nothing reordered (round-6 pass 3)', async () => {
    const seen = []
    const recordingRun = (args) => {
      seen.push(args)
      return bigRun(args)
    }
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: recordingRun,
      loadTool: () => Promise.reject(absent),
    })
    const range = `${'a'.repeat(40)}..${'b'.repeat(40)}`
    expect(seen).toEqual([
      ['diff', '--stat', range],
      ['diff', '--no-ext-diff', '--no-textconv', range],
      ['diff', '--name-only', '-z', range],
      ['show', `${'b'.repeat(40)}:big.md`],
    ])
  })

  it('a blob read that fails for anything but ABSENCE rules unmeasured (final-round pass 3)', async () => {
    // Swallowing every show failure shrank the measurement, and an over-budget
    // range could rule its own gap over a PARTIAL reading.
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const broken = (args) => {
      if (args[0] === 'show') throw new Error('fatal: unable to read blob (corrupt loose object)')
      return bigRun(args)
    }
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: broken,
      loadTool: () => Promise.reject(absent),
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('unmeasured')

    // …while git's own "absent" still contributes nothing and the ruling proceeds.
    const deleted = (args) => {
      if (args[0] === 'show') throw new Error("fatal: path 'big.md' does not exist in 'bbbb'")
      return bigRun(args)
    }
    const ruled = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: deleted,
      loadTool: () => Promise.reject(absent),
    })
    expect(ruled.reason).toBe('no-splitter')
  })

  it('the splitter’s own fit ruling outranks the raw size (final-round pass 3)', async () => {
    // The raw sum omits delivery overhead, so rendered material just over the
    // budget read as fitting; where the tool measured, its answer rules.
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const smallRun = (args) => {
      if (args[0] === 'diff' && args.includes('--stat')) return 'stat'
      if (args[0] === 'diff' && args.includes('--name-only')) return 'a.md\0'
      if (args[0] === 'diff') return 'x'.repeat(1000)
      if (args[0] === 'show') return 'body'
      return ''
    }
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: smallRun,
      loadTool: () =>
        Promise.resolve({
          MATERIAL_BUDGET_CHARS: REVIEW_GAP_BUDGET_CHARS,
          // The tool says: does NOT fit once rendered, but a split covers it.
          planPasses: () => ({ fits: false, statTruncated: false, uncoverable: [], passes: [{}, {}] }),
        }),
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('splits')
  })

  it('a covering split from the real planner shape keeps the demand standing', async () => {
    const { assessReviewGap } = await import('./mechanism-review-guard-gap.mjs')
    const d = await assessReviewGap({
      baseline: 'a'.repeat(40),
      head: 'b'.repeat(40),
      run: bigRun,
      loadTool: () =>
        Promise.resolve({
          MATERIAL_BUDGET_CHARS: REVIEW_GAP_BUDGET_CHARS,
          planPasses: () => ({ statTruncated: false, uncoverable: [], passes: [{}, {}] }),
        }),
    })
    expect(d.gap).toBe(false)
    expect(d.reason).toBe('splits')
  })
})

describe('formatCriticalityGap', () => {
  it('names each point, its record range and the resume rule', () => {
    const decision = decideReviewGap({ measuredChars: 3_000_000, planner: null })
    const text = formatCriticalityGap([{ point: 700, sha: 'e'.repeat(40), decision }])
    expect(text).toContain('point 700')
    expect(text).toContain('e'.repeat(12))
    expect(text).toContain('3000000')
    expect(text).toMatch(/RESUMES blocking/)
  })
})

describe('the budget mirror', () => {
  it.skipIf(!material)('equals MATERIAL_BUDGET_CHARS wherever the splitting tool exists', () => {
    // Declared apart so the clause survives a tree without the tool; pinned
    // equal so the two never drift where both exist.
    expect(REVIEW_GAP_BUDGET_CHARS).toBe(material.MATERIAL_BUDGET_CHARS)
  })
})
