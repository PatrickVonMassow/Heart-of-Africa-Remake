import { describe, expect, it } from 'vitest'
import {
  commitsForFiles,
  endStateArtefacts,
  newestReading,
  eligibleReviewer,
  outstandingFiles,
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

  it('keeps a historically mixed-vendor file as one artefact routed by its final author', () => {
    const file = 'scripts/shared-guard.mjs'
    const plan = planAuthorshipGroups({
      commits: [commit('a', 'Claude Opus 5', [file]), commit('b', 'GPT-5.6 Sol', [file])],
    })
    expect(plan.mixedFiles).toEqual([])
    expect(plan.groups).toEqual([
      expect.objectContaining({
        kind: 'files',
        vendor: 'openai',
        commits: [sha('a'), sha('b')],
        files: [file],
        reviewer: 'Opus 5',
      }),
    ])
  })

  it('plans one file once after eight commits touch it', () => {
    const file = 'scripts/queue-calibration.mjs'
    const commits = Array.from({ length: 8 }, (_, index) =>
      commit(String.fromCharCode(97 + index), 'GPT-5.6 Sol', [file]))
    const plan = planAuthorshipGroups({ commits, endStateFiles: [file] })
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({
      kind: 'files',
      files: [file],
      reviewer: 'Opus 5',
    })
    expect(plan.groups[0].commits).toHaveLength(8)
    expect(plan.superseded).toEqual([
      expect.objectContaining({ file, reason: 'intermediate states superseded within the range' }),
    ])
  })

  it('drops a path reverted to its base state and names why', () => {
    const file = 'scripts/reverted-guard.mjs'
    const state = endStateArtefacts({
      commits: [commit('a', 'Claude Opus 5', [file]), commit('b', 'Claude Opus 5', [file])],
      endStateFiles: [],
    })
    expect(state.artefacts).toEqual([])
    expect(state.dropped).toEqual([
      { file, reason: 'end state identical to the base', commits: [sha('a'), sha('b')] },
    ])
  })

  it('names a group with no eligible reviewer instead of assigning an author', () => {
    const plan = planAuthorshipGroups({
      commits: [
        { sha: sha('a'), authorModels: ['GPT-5.6 Sol', 'Opus 5', 'Fable 5', 'Opus 4.8'], files: ['x'] },
      ],
    })
    expect(plan.groups[0].reviewer).toBe('')
    expect(plan.groups[0].reviewerVendor).toBe('')
    expect(plan.groups[0].unreviewableReason).toMatch(/every configured reviewer vendor authored part/)
    expect(plan.unreviewable).toEqual([plan.groups[0]])
  })

  it('reports a contribution co-authored by both vendors as unreviewable', () => {
    const plan = planAuthorshipGroups({
      commits: [
        {
          sha: sha('a'),
          authorModels: ['GPT-5.6 Sol', 'Claude Opus 5'],
          files: ['scripts/shared-guard.mjs'],
        },
      ],
    })
    expect(plan.groups[0]).toMatchObject({
      reviewer: '',
      reviewerVendor: '',
      unreviewableReason: expect.stringMatching(/every configured reviewer vendor authored part/),
    })
    expect(plan.unreviewable).toEqual([plan.groups[0]])
  })

  it('splits a mixed-authorship range and names the eligible vendor for each part', () => {
    const plan = planAuthorshipGroups({
      commits: [
        commit('a', 'Claude Opus 5', ['scripts/claude-guard.mjs']),
        commit('b', 'GPT-5.6 Sol', ['scripts/sol-guard.mjs']),
      ],
    })
    expect(plan.groups).toEqual([
      expect.objectContaining({
        vendor: 'anthropic',
        reviewer: 'GPT-5.6 Sol',
        reviewerVendor: 'openai',
        files: ['scripts/claude-guard.mjs'],
      }),
      expect.objectContaining({
        vendor: 'openai',
        reviewer: 'Opus 5',
        reviewerVendor: 'anthropic',
        files: ['scripts/sol-guard.mjs'],
      }),
    ])
  })

  it('names missing authorship as unreviewable instead of guessing a second model', () => {
    const plan = planAuthorshipGroups({ commits: [{ sha: sha('a'), files: ['unknown-guard.mjs'] }] })
    expect(plan.groups[0]).toMatchObject({
      vendor: 'unknown',
      authors: [],
      reviewer: '',
      reviewerVendor: '',
      unreviewableReason: expect.stringMatching(/authorship vendor is unknown/),
      files: ['unknown-guard.mjs'],
    })
    expect(plan.groups[0].unreviewableReason).toMatch(
      /--since <the last reviewed sha>.*bounded 1\/1 pass/,
    )
    expect(plan.unreviewable).toEqual([plan.groups[0]])
  })

  it('attributes a trailerless merge to the contribution at its merged-parent tip', () => {
    const ledger = '.claude/mechanism-reviews.jsonl'
    const plan = planAuthorshipGroups({
      commits: [
        { ...commit('a', 'GPT-5.6 Sol', ['sol-only']), parentShas: [] },
        { ...commit('b', 'Claude Opus 5', [ledger]), parentShas: [] },
        { sha: sha('c'), parentShas: [sha('a'), sha('b')], files: [ledger] },
      ],
    })
    expect(plan.groups).toEqual([
      expect.objectContaining({ files: ['sol-only'], commits: [sha('a')], reviewer: 'Opus 5' }),
      expect.objectContaining({
        files: [ledger],
        commits: [sha('b'), sha('c')],
        authors: ['Claude Opus 5'],
        reviewer: 'GPT-5.6 Sol',
      }),
    ])
    expect(plan.unreviewable).toEqual([])
  })

  it('requires the other vendor even when another same-vendor model is not an author', () => {
    expect(eligibleReviewer(['Claude Fable 5'])).toBe('GPT-5.6 Sol')
    expect(eligibleReviewer(['GPT-5.6 Sol'])).toBe('Opus 5')
    expect(vendorOf('Claude Opus 5 <noreply@anthropic.com>')).toBe('anthropic')
  })
})

describe('per-file end-state review baseline', () => {
  const usable = () => true
  const row = ({ head, files, contained, verdict = 'merge', at = 100, model = 'GPT-5.6 Sol' }) => ({
    sha: head,
    model,
    verdict,
    at,
    containedShas: contained,
    pass: { index: 1, total: 1, files, endState: head },
  })

  it('keeps a covered file clear after a later commit touches only another file', () => {
    const first = commit('a', 'Claude Opus 5', ['covered'])
    const later = commit('b', 'Claude Opus 5', ['other'])
    const result = outstandingFiles({
      commits: [first, later],
      endStateFiles: ['covered', 'other'],
      recordUsable: usable,
      records: [row({ head: first.sha, files: ['covered'], contained: [first.sha] })],
    })
    expect(result.covered.map((artefact) => artefact.file)).toEqual(['covered'])
    expect(result.outstanding.map((artefact) => artefact.file)).toEqual(['other'])
  })

  it('owes only a covered file changed by a later commit', () => {
    const first = commit('a', 'Claude Opus 5', ['covered'])
    const later = commit('b', 'Claude Opus 5', ['covered'])
    const result = outstandingFiles({
      commits: [first, later],
      endStateFiles: ['covered'],
      recordUsable: usable,
      records: [row({ head: first.sha, files: ['covered'], contained: [first.sha] })],
    })
    expect(result.covered).toEqual([])
    expect(result.outstanding.map((artefact) => artefact.file)).toEqual(['covered'])
  })

  it('does not accept a same-vendor reviewer for the file\'s final author', () => {
    const changes = [
      commit('a', 'Claude Opus 5', ['shared']),
      commit('b', 'GPT-5.6 Sol', ['shared']),
    ]
    const result = outstandingFiles({
      commits: changes,
      endStateFiles: ['shared'],
      recordUsable: usable,
      records: [row({
        head: changes[1].sha,
        files: ['shared'],
        contained: changes.map((change) => change.sha),
        model: 'GPT-5.6 Sol',
      })],
    })
    expect(result.covered).toEqual([])
    expect(result.outstanding.map((artefact) => artefact.file)).toEqual(['shared'])
  })

  it('rescues historical scoped coverage when the review contains the file\'s latest change', () => {
    const change = commit('a', 'Claude Opus 5', ['shared'])
    const legacy = {
      ...row({ head: change.sha, files: ['shared'], contained: [change.sha] }),
      pass: { index: 1, total: 1, files: ['shared'], commits: [change.sha] },
    }
    expect(outstandingFiles({
      commits: [change],
      endStateFiles: ['shared'],
      recordUsable: usable,
      records: [legacy],
    }).covered.map((artefact) => artefact.file)).toEqual(['shared'])
  })

  it('does not let historical scoped coverage clear a file changed after that review', () => {
    const reviewed = commit('a', 'Claude Opus 5', ['shared'])
    const latest = commit('b', 'Claude Opus 5', ['shared'])
    const legacy = {
      ...row({ head: reviewed.sha, files: ['shared'], contained: [reviewed.sha] }),
      pass: { index: 1, total: 1, files: ['shared'], commits: [reviewed.sha] },
    }
    expect(outstandingFiles({
      commits: [reviewed, latest],
      endStateFiles: ['shared'],
      recordUsable: usable,
      records: [legacy],
    }).outstanding.map((artefact) => artefact.file)).toEqual(['shared'])
  })

  it('keeps a newer refusal visible and lets a later clearance settle it', () => {
    const change = commit('a', 'Claude Opus 5', ['guard'])
    const base = { head: change.sha, files: ['guard'], contained: [change.sha] }
    const refused = outstandingFiles({
      commits: [change],
      endStateFiles: ['guard'],
      recordUsable: usable,
      records: [row({ ...base, verdict: 'merge', at: 100 }), row({ ...base, verdict: 'do-not-merge', at: 200 })],
    })
    expect(refused.refusals).toHaveLength(1)
    expect(refused.outstanding).toHaveLength(1)
    const cleared = outstandingFiles({
      commits: [change],
      endStateFiles: ['guard'],
      recordUsable: usable,
      records: [row({ ...base, verdict: 'do-not-merge', at: 100 }), row({ ...base, verdict: 'merge', at: 200 })],
    })
    expect(cleared.refusals).toEqual([])
    expect(cleared.covered).toHaveLength(1)
  })

  it('rebuilds authorship history for only the still-owed files', () => {
    const commits = [
      commit('a', 'Claude Opus 5', ['shared', 'done']),
      commit('b', 'Claude Opus 5', ['shared']),
    ]
    const debt = outstandingFiles({ commits, endStateFiles: ['shared', 'done'], records: [], recordUsable: usable })
    const rebuilt = commitsForFiles(debt.outstanding.filter((artefact) => artefact.file === 'shared'))
    expect(rebuilt.map((change) => [change.sha, change.files])).toEqual([
      [sha('a'), ['shared']],
      [sha('b'), ['shared']],
    ])
  })

  it('lets one recorded pass clear its files in the mechanism gate', () => {
    const head = sha('a')
    const pending = {
      ...commit('a', 'Claude Opus 5', ['a', 'shared']),
      subject: 'change two mechanism files',
      coveringRecordShas: [head],
    }
    const record = {
      ...row({ head, files: ['a'], contained: [head], at: 1_787_000_000_000 }),
      evidence: 'checked file a against its complete end-state patch',
      mode: 'review',
    }
    const partial = evaluateMechanismReview({
      baseline: sha('0'),
      head,
      records: [record],
      pendingCommits: [pending],
      endStateFiles: ['a', 'shared'],
    })
    expect(partial.block).toBe(true)
    expect(partial.findings.map((finding) => finding.commit.files)).toEqual([['shared']])

    const second = {
      ...record,
      at: record.at + 1,
      pass: { index: 2, total: 2, files: ['shared'], endState: head },
      evidence: 'checked shared against its complete end-state patch',
    }
    expect(evaluateMechanismReview({
      baseline: sha('0'),
      head,
      records: [record, second],
      pendingCommits: [pending],
      endStateFiles: ['a', 'shared'],
    }).block).toBe(false)
  })

  it('keeps that gate clearance after another file changes, but not after this file changes', () => {
    const reviewed = sha('a')
    const record = {
      ...row({ head: reviewed, files: ['covered'], contained: [reviewed], at: 1_787_000_000_000 }),
      evidence: 'checked covered against its complete end-state patch',
      mode: 'review',
    }
    const first = {
      ...commit('a', 'Claude Opus 5', ['covered']),
      coveringRecordShas: [reviewed],
    }
    const other = { ...commit('b', 'Claude Opus 5', ['other']), coveringRecordShas: [] }
    const afterOther = evaluateMechanismReview({
      baseline: sha('0'),
      head: other.sha,
      records: [record],
      pendingCommits: [first, other],
      endStateFiles: ['covered', 'other'],
    })
    expect(afterOther.findings.map((finding) => finding.commit.files)).toEqual([['other']])

    const changedAgain = { ...commit('c', 'Claude Opus 5', ['covered']), coveringRecordShas: [] }
    const afterSame = evaluateMechanismReview({
      baseline: sha('0'),
      head: changedAgain.sha,
      records: [record],
      pendingCommits: [first, changedAgain],
      endStateFiles: ['covered'],
    })
    expect(afterSame.findings.map((finding) => finding.commit.files)).toEqual([['covered']])
  })

  it('demands nothing for a path reverted out of the end state', () => {
    expect(evaluateMechanismReview({
      baseline: sha('0'),
      head: sha('b'),
      records: [],
      pendingCommits: [
        commit('a', 'Claude Opus 5', ['reverted']),
        commit('b', 'Claude Opus 5', ['reverted']),
      ],
      endStateFiles: [],
    }).block).toBe(false)
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

  it('reports the material the owed passes carry, not the unsplit assembly', () => {
    // The unsplit figure counts every group's whole-file assembly, so it stood
    // at 466106 beside a one-round plan carrying 116875 — four times the budget
    // beside a count of one, which reads as a count that cannot be true.
    const passes = [{ index: 1, rawSize: 116_875 }]
    expect(summarizeReviewDebt({
      outstanding: [{ file: 'a' }],
      sizedPlan: { passes, rawSize: 466_106 },
    })).toEqual({ passCount: 1, materialChars: 116_875, groups: passes })
  })

  it('names a part-measured plan unavailable rather than reporting the passes it could size', () => {
    // Treating an unsized pass as zero understates the debt by exactly the
    // passes nobody measured — a smaller number that still reads as a fact.
    const passes = [{ index: 1, rawSize: 100 }, { index: 2 }]
    expect(summarizeReviewDebt({
      outstanding: [{ file: 'a' }],
      sizedPlan: { passes, rawSize: 1000 },
    })).toEqual({ passCount: 2, materialChars: null, groups: passes })
  })

  it('names a non-numeric rawSize unavailable instead of coercing it to zero', () => {
    // `Number(null)` and `Number('')` are 0, so an unmeasured assembly would
    // have reported ZERO material for owed work — a cleared-looking figure.
    for (const rawSize of [null, '', '466106', undefined]) {
      expect(summarizeReviewDebt({
        outstanding: [{ file: 'a' }],
        sizedPlan: { passes: [{ index: 1 }], rawSize },
      })).toEqual({ passCount: null, materialChars: null, groups: [] })
    }
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

describe('the reading selector on its own', () => {
  // Exported and callable directly, so it normalizes rather than trusting the
  // caller: a numeric string is not a time, and an absent stamp is the oldest.
  // The LINE is the position in the list, so a reading carries no line of its own.
  const reading = (verdict, at) => ({ record: { verdict }, at })

  it('never coerces a numeric string into a time', () => {
    expect(newestReading([reading('merge', '900'), reading('do-not-merge', 5)]).record.verdict)
      .toBe('do-not-merge')
  })

  it('never lets an unclocked clearance overtake a clocked reading', () => {
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '5']) {
      expect(newestReading([reading('do-not-merge', 5), reading('merge', at)]).record.verdict)
        .toBe('do-not-merge')
    }
  })

  it('does not let an unclocked clearance settle an unclocked refusal — only a clocked one does', () => {
    // Neither row can be placed in time, and clearing is the dangerous
    // direction, so the refusal stands. It is not a freeze: a properly stamped
    // clearance settles it, whichever line it lands on.
    expect(newestReading([reading('do-not-merge', null), reading('merge', null)]).record.verdict)
      .toBe('do-not-merge')
    expect(newestReading([reading('do-not-merge', null), reading('merge', 5)]).record.verdict).toBe('merge')
    expect(newestReading([reading('merge', 5), reading('do-not-merge', null)]).record.verdict)
      .toBe('do-not-merge')
  })

  it('lets the last line rule where no reading carries a clock at all', () => {
    expect(newestReading([reading('merge', null), reading('merge-with-fixes', null)]).record.verdict)
      .toBe('merge-with-fixes')
  })

  it('keeps a refusal appended after the newest clocked reading', () => {
    // The line is the only evidence an unclocked row carries, and it proves
    // this much: the refusal came after the clearance.
    expect(newestReading([reading('merge', 500), reading('do-not-merge', undefined)]).record.verdict)
      .toBe('do-not-merge')
    expect(newestReading([reading('do-not-merge', undefined), reading('merge', 500)]).record.verdict)
      .toBe('merge')
  })

  it('answers nothing for no readings', () => {
    expect(newestReading([])).toBe(null)
  })
})
