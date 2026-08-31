import { describe, expect, it } from 'vitest'
import { formatAuthorshipPlan, formatContributionPassPlan } from './review-sol.mjs'

const sha = 'a'.repeat(40)
const base = 'b'.repeat(40)
const pass = {
  index: 1,
  total: 2,
  size: 1200,
  endState: sha,
  rangeBase: base,
  files: ['scripts/example-guard.mjs'],
  reviewer: 'Opus 5',
  reviewerVendor: 'anthropic',
}

describe('printed review pass commands', () => {
  it('carries the measured baseline and assigned reviewer in the authorship plan', () => {
    const text = formatAuthorshipPlan({
      budget: 200_000,
      rawSize: 2400,
      fits: false,
      passes: [pass],
      mixedFiles: [],
      unreviewable: [],
      dropped: [],
      superseded: [],
    }, { sha })

    expect(text).toContain(
      `node scripts/review-sol.mjs --sha ${sha} --since ${base} ` +
        '--reviewer opus --brief "<what to judge>" --pass 1',
    )
  })

  it('carries the assigned reviewer in the contribution-scoped plan', () => {
    const text = formatContributionPassPlan({
      passCount: 1,
      contributions: [{
        sha,
        base,
        fits: true,
        passes: [{ ...pass, total: 1 }],
        uncoverable: [],
        unreviewable: [],
      }],
    })

    expect(text).toContain(
      `node scripts/review-sol.mjs --sha ${sha} --since ${base} ` +
        '--reviewer opus --brief "<what to judge>"',
    )
  })
})
