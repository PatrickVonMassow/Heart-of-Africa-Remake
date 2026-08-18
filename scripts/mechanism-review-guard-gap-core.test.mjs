// THE REVIEW-GAP RULING (point 714): the guard stands down — with a measured,
// named report — while a range's review material cannot be assembled at all,
// and resumes blocking the moment it can. Every branch of the pure ruling is
// pinned here; the live trap this closes held every turn on main hostage to a
// review no caller could produce (measured 18.08.2026).
import { describe, it, expect } from 'vitest'
import {
  decideReviewGap,
  formatReviewGap,
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

describe('the budget mirror', () => {
  it.skipIf(!material)('equals MATERIAL_BUDGET_CHARS wherever the splitting tool exists', () => {
    // Declared apart so the clause survives a tree without the tool; pinned
    // equal so the two never drift where both exist.
    expect(REVIEW_GAP_BUDGET_CHARS).toBe(material.MATERIAL_BUDGET_CHARS)
  })
})
