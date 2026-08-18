import { describe, expect, it } from 'vitest'
import {
  commitsForContributions,
  eligibleReviewer,
  outstandingContributions,
  planAuthorshipGroups,
  summarizeReviewDebt,
  vendorOf,
} from './mechanism-review-range-core.mjs'
import { evaluateMechanismReview } from './mechanism-review-core.mjs'

const sha = (letter) => letter.repeat(40)
const commit = (id, authorModel, files) => ({ sha: sha(id), authorModel, files })

describe('authorship-cut mechanism review planning', () => {
  it('groups single-vendor files and names an other-vendor reviewer', () => {
    const plan = planAuthorshipGroups({
      commits: [
        commit('a', 'Claude Opus 5', ['scripts/a-guard.mjs']),
        commit('b', 'Claude Fable 5', ['scripts/b-guard.mjs']),
      ],
    })
    expect(plan.groups).toEqual([
      expect.objectContaining({
        kind: 'files',
        vendor: 'anthropic',
        files: ['scripts/a-guard.mjs', 'scripts/b-guard.mjs'],
        commits: [sha('a'), sha('b')],
        reviewer: 'GPT-5.6 Sol',
      }),
    ])
  })

  it('reports a mixed-vendor file and cuts it at commit boundaries', () => {
    const file = 'scripts/shared-guard.mjs'
    const plan = planAuthorshipGroups({
      commits: [commit('a', 'Claude Opus 5', [file]), commit('b', 'GPT-5.6 Sol', [file])],
    })
    expect(plan.mixedFiles).toEqual([file])
    expect(plan.groups).toEqual([
      expect.objectContaining({ kind: 'commit', commits: [sha('a')], files: [file], reviewer: 'GPT-5.6 Sol' }),
      expect.objectContaining({ kind: 'commit', commits: [sha('b')], files: [file], reviewer: 'Opus 5' }),
    ])
  })

  it('names a group with no eligible reviewer instead of assigning an author', () => {
    const plan = planAuthorshipGroups({
      commits: [
        { sha: sha('a'), authorModels: ['GPT-5.6 Sol', 'Opus 5', 'Fable 5', 'Opus 4.8'], files: ['x'] },
      ],
    })
    expect(plan.groups[0].reviewer).toBe('')
    expect(plan.unreviewable).toEqual([plan.groups[0]])
  })

  it('names missing authorship as unreviewable instead of guessing a second model', () => {
    const plan = planAuthorshipGroups({ commits: [{ sha: sha('a'), files: ['unknown-guard.mjs'] }] })
    expect(plan.groups[0]).toMatchObject({
      vendor: 'unknown',
      authors: [],
      reviewer: '',
      files: ['unknown-guard.mjs'],
    })
    expect(plan.unreviewable).toEqual([plan.groups[0]])
  })

  it('requires the other vendor even when another same-vendor model is not an author', () => {
    expect(eligibleReviewer(['Claude Fable 5'])).toBe('GPT-5.6 Sol')
    expect(eligibleReviewer(['GPT-5.6 Sol'])).toBe('Opus 5')
    expect(vendorOf('Claude Opus 5 <noreply@anthropic.com>')).toBe('anthropic')
  })
})

describe('per-contribution review baseline', () => {
  const commits = [
    commit('a', 'Claude Opus 5', ['a', 'shared']),
    commit('b', 'GPT-5.6 Sol', ['b', 'shared']),
  ]
  const usable = () => true

  it('retires only the commit/file pairs a scoped pass actually read', () => {
    const result = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [
        {
          sha: sha('b'),
          model: 'GPT-5.6 Sol',
          verdict: 'merge',
          containedShas: new Set([sha('a'), sha('b')]),
          pass: { files: ['a', 'shared'], commits: [sha('a')] },
        },
      ],
    })
    expect(result.covered.map((c) => [c.sha, c.file])).toEqual([
      [sha('a'), 'a'],
      [sha('a'), 'shared'],
    ])
    expect(result.outstanding.map((c) => [c.sha, c.file])).toEqual([
      [sha('b'), 'b'],
      [sha('b'), 'shared'],
    ])
  })

  it('does not let a reviewer retire its own contribution to a mixed file', () => {
    const result = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [
        {
          sha: sha('b'),
          model: 'GPT-5.6 Sol',
          verdict: 'merge',
          containedShas: new Set([sha('a'), sha('b')]),
          pass: { files: ['shared'], commits: [sha('a'), sha('b')] },
        },
      ],
    })
    expect(result.covered.map((c) => c.sha)).toEqual([sha('a')])
    expect(result.outstanding.some((c) => c.sha === sha('b') && c.file === 'shared')).toBe(true)
  })

  it('keeps a read refusal visible and owed', () => {
    const result = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [
        {
          sha: sha('b'),
          model: 'Opus 5',
          verdict: 'do-not-merge',
          containedShas: [sha('b')],
          pass: { files: ['b'], commits: [sha('b')] },
        },
      ],
    })
    expect(result.refusals).toHaveLength(1)
    expect(result.outstanding.some((c) => c.file === 'b')).toBe(true)
  })

  it('rebuilds the next plan with only still-owed files', () => {
    const debt = outstandingContributions({ commits, records: [], recordUsable: usable })
    const rebuilt = commitsForContributions(debt.outstanding.filter((c) => c.file === 'shared'))
    expect(rebuilt.map((c) => [c.sha, c.files])).toEqual([
      [sha('a'), ['shared']],
      [sha('b'), ['shared']],
    ])
  })

  it('removes a recorded scoped file from the mechanism gate\'s next demand', () => {
    const head = sha('b')
    const record = {
      sha: head,
      model: 'GPT-5.6 Sol',
      verdict: 'merge',
      evidence: 'checked file a against its complete contribution patch',
      mode: 'review',
      at: 1_787_000_000_000,
      pass: { index: 1, total: 2, files: ['a'], commits: [sha('a')] },
    }
    const verdict = evaluateMechanismReview({
      baseline: sha('0'),
      head,
      records: [record],
      pendingCommits: [
        {
          ...commits[0],
          subject: 'change two mechanism files',
          coveringRecordShas: [head],
        },
      ],
    })
    expect(verdict.block).toBe(true)
    expect(verdict.findings[0].commit.files).toEqual(['shared'])
  })

  it('clears a commit once scoped passes have read each file', () => {
    const head = sha('b')
    const rows = ['a', 'shared'].map((file, index) => ({
      sha: head,
      model: 'GPT-5.6 Sol',
      verdict: 'merge',
      evidence: `checked ${file} against its complete contribution patch`,
      mode: 'review',
      at: 1_787_000_000_000 + index,
      pass: { index: index + 1, total: 2, files: [file], commits: [sha('a')] },
    }))
    const verdict = evaluateMechanismReview({
      baseline: sha('0'),
      head,
      records: rows,
      pendingCommits: [{ ...commits[0], coveringRecordShas: [head] }],
    })
    expect(verdict.block).toBe(false)
  })
})

describe('visible review debt', () => {
  it('reports the sized pass count and material, not the smaller authorship-group count', () => {
    const passes = [{ index: 1 }, { index: 2 }, { index: 3 }]
    expect(summarizeReviewDebt({
      outstanding: [{ file: 'a' }],
      sizedPlan: { passes, rawSize: 462_972 },
    })).toEqual({ passCount: 3, materialChars: 462_972, groups: passes })
  })

  it('distinguishes cleared debt from an unavailable measurement', () => {
    expect(summarizeReviewDebt({ outstanding: [] })).toEqual({ passCount: 0, materialChars: 0, groups: [] })
    expect(summarizeReviewDebt({ outstanding: [{ file: 'a' }] })).toEqual({
      passCount: null,
      materialChars: null,
      groups: [],
    })
  })
})
