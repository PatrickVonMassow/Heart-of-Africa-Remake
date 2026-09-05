import { describe, expect, it } from 'vitest'
import { buildContributionPassPlan, formatContributionPassPlan } from './review-astra.mjs'
import { formatMechanismReviewVerdict } from './mechanism-review-core.mjs'

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
    expect(formatContributionPassPlan(plan)).not.toContain('--pass')
    expect(formatContributionPassPlan(plan)).toContain('--file "scripts/example-guard.mjs"')
  })

  it('prints the exact outstanding file subset into every runnable command', () => {
    const files = ['scripts/remaining guard.mjs', 'scripts/literal-$value.mjs']
    const plan = buildContributionPassPlan({
      commits: [commit('a', files)],
      buildPlan: () => sized({
        passes: [{ index: 1, total: 1, files }],
      }),
    })

    const text = formatContributionPassPlan(plan)
    expect(text).toContain('--file "scripts/remaining guard.mjs"')
    expect(text).toContain('--file "scripts/literal-\\$value.mjs"')
  })

  it('lets the runnable planner replace a stale thirteen-pass repair index', () => {
    const owed = commit('a')
    const plan = buildContributionPassPlan({ commits: [owed], buildPlan: () => sized() })
    const planText = formatContributionPassPlan(plan)
    const verdict = {
      block: true,
      findings: [{
        kind: 'incomplete-passes',
        commit: owed,
        records: [],
        passes: { total: 13, have: 4, missing: [5, 6, 7, 8, 9, 10, 11, 12, 13], uncovered: [] },
      }],
    }
    const refusal = formatMechanismReviewVerdict(verdict, {
      contributionPlan: plan,
      contributionPlanText: planText,
    })

    expect(refusal).toContain('historical split')
    expect(refusal).toContain('measures 1 runnable pass')
    expect(refusal).toContain(`--sha ${owed.sha} --since ${owed.parentShas[0]}`)
    expect(refusal).not.toContain('--pass 5')
    expect(refusal).not.toContain('--pass 1')
  })

  it('prints exactly the count and indices of a contribution that really splits', () => {
    const plan = buildContributionPassPlan({
      commits: [commit('a', ['scripts/a-guard.mjs', 'scripts/b.mjs'])],
      buildPlan: () => sized({
        fits: false,
        passes: [
          { index: 1, total: 2, files: ['scripts/a-guard.mjs'], reviewer: 'Opus 5' },
          { index: 2, total: 2, files: ['scripts/b.mjs'], reviewer: 'Opus 5' },
        ],
      }),
    })
    const text = formatContributionPassPlan(plan)
    expect(plan.passCount).toBe(2)
    expect(text).toContain('2 runnable passes')
    expect(text.match(/--pass 1\b/g)).toHaveLength(1)
    expect(text.match(/--pass 2\b/g)).toHaveLength(1)
    expect(text).not.toContain('--pass 3')
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
