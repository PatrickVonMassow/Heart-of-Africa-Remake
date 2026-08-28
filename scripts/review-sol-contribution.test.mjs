import { describe, expect, it } from 'vitest'
import { buildContributionPassPlan, formatContributionPassPlan } from './review-sol.mjs'

const commit = (letter, files = ['scripts/example-guard.mjs']) => ({
  sha: letter.repeat(40),
  subject: `Change ${letter}`,
  parentShas: [letter.toUpperCase().repeat(40)],
  files,
  authorModels: ['GPT-5.6 Sol'],
})

const sized = (over = {}) => ({
  fits: true,
  passes: [{ index: 1, total: 1, files: ['scripts/example-guard.mjs'] }],
  uncoverable: [],
  unreviewable: [],
  rawSize: 1200,
  budget: 200_000,
  statTruncated: false,
  ...over,
})

describe('the guard plan is bounded by each contribution', () => {
  it('measures every commit against its own parent and keeps pass numbering local', () => {
    const seen = []
    const plan = buildContributionPassPlan({
      commits: [commit('a'), commit('b')],
      buildPlan: (args) => {
        seen.push(args)
        return sized()
      },
    })
    expect(seen.map(({ sha, base, paths }) => ({ sha, base, paths }))).toEqual([
      { sha: 'a'.repeat(40), base: 'A'.repeat(40), paths: ['scripts/example-guard.mjs'] },
      { sha: 'b'.repeat(40), base: 'B'.repeat(40), paths: ['scripts/example-guard.mjs'] },
    ])
    expect(plan.passCount).toBe(2)
    expect(plan.contributions.map((entry) => entry.passes[0].index)).toEqual([1, 1])
  })

  it('does not let one unassemblable contribution erase a sibling runnable command', () => {
    const plan = buildContributionPassPlan({
      commits: [commit('a'), commit('b', ['scripts/huge-guard.mjs'])],
      buildPlan: ({ sha }) => sha.startsWith('a')
        ? sized()
        : sized({
            fits: false,
            passes: [],
            rawSize: 500_000,
            uncoverable: [{ path: 'scripts/huge-guard.mjs', reason: 'complete diff exceeds one round' }],
          }),
    })
    const text = formatContributionPassPlan(plan)
    expect(text).toContain(`--sha ${'a'.repeat(40)} --since ${'A'.repeat(40)}`)
    expect(text).toContain(`UNASSEMBLABLE ${'b'.repeat(7)} Change b`)
    expect(text).toContain('scripts/huge-guard.mjs')
  })

  it('names a missing first-parent boundary as unmeasured, never as an empty fit', () => {
    const plan = buildContributionPassPlan({ commits: [{ ...commit('a'), parentShas: [] }] })
    expect(plan.contributions[0]).toMatchObject({ passes: [], planningError: expect.any(String) })
    expect(formatContributionPassPlan(plan)).toContain('UNMEASURED')
  })
})
