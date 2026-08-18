import { describe, expect, it } from 'vitest'
import {
  commitsForContributions,
  newestReading,
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

  it('lets a later refusal overturn an earlier clearance of the same contribution', () => {
    const row = (verdict, at) => ({
      sha: sha('b'),
      model: 'Opus 5',
      verdict,
      at,
      containedShas: [sha('b')],
      pass: { files: ['b'], commits: [sha('b')] },
    })
    const result = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [row('merge', 100), row('do-not-merge', 200)],
    })
    // The gate blocks on the newest verdict, so the plan must still owe this
    // file — counting the older clearance would hide it from every later plan.
    expect(result.outstanding.some((c) => c.file === 'b')).toBe(true)
    expect(result.covered.some((c) => c.file === 'b')).toBe(false)
    expect(result.refusals).toHaveLength(1)
  })

  it('lets a later clearance settle a contribution an earlier round refused', () => {
    const row = (verdict, at) => ({
      sha: sha('b'),
      model: 'Opus 5',
      verdict,
      at,
      containedShas: [sha('b')],
      pass: { files: ['b'], commits: [sha('b')] },
    })
    const result = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [row('do-not-merge', 100), row('merge', 200)],
    })
    expect(result.covered.some((c) => c.file === 'b')).toBe(true)
    expect(result.refusals).toHaveLength(0)
  })

  it('reads the clock, not the ledger position, when the rows arrive out of order', () => {
    const row = (verdict, at) => ({
      sha: sha('b'),
      model: 'Opus 5',
      verdict,
      at,
      containedShas: [sha('b')],
      pass: { files: ['b'], commits: [sha('b')] },
    })
    // The refusal is the NEWER reading but stands FIRST in the array.
    const result = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [row('do-not-merge', 200), row('merge', 100)],
    })
    expect(result.outstanding.some((c) => c.file === 'b')).toBe(true)
    expect(result.refusals).toHaveLength(1)
  })

  it('lets the last line win an equal timestamp, in both directions', () => {
    const row = (verdict) => ({
      sha: sha('b'),
      model: 'Opus 5',
      verdict,
      at: 100,
      containedShas: [sha('b')],
      pass: { files: ['b'], commits: [sha('b')] },
    })
    const cleared = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [row('do-not-merge'), row('merge')],
    })
    expect(cleared.covered.some((c) => c.file === 'b')).toBe(true)
    const refused = outstandingContributions({
      commits,
      recordUsable: usable,
      records: [row('merge'), row('do-not-merge')],
    })
    expect(refused.outstanding.some((c) => c.file === 'b')).toBe(true)
  })

  // An unreadable clock used to decide every later comparison: `NaN >= NaN` is
  // false, so the first such row won forever and a clearance could bury the
  // refusal that came after it. A numeric string and an absent stamp were worse
  // than unreadable — they were silently READ as a time and as the epoch.
  const row = (verdict, at) => ({
    sha: sha('b'),
    model: 'Opus 5',
    verdict,
    ...(at === undefined ? {} : { at }),
    containedShas: [sha('b')],
    pass: { files: ['b'], commits: [sha('b')] },
  })
  const owed = (records) => outstandingContributions({ commits, recordUsable: usable, records })

  for (const [name, at] of [
    ['NaN', Number.NaN],
    ['an infinite stamp', Number.POSITIVE_INFINITY],
    ['a negative infinite stamp', Number.NEGATIVE_INFINITY],
    ['a string', 'yesterday'],
    ['a numeric string', '300'],
    ['an explicit null', null],
    ['no stamp at all', undefined],
  ]) {
    it(`does not let a clearance carrying ${name} bury the refusal appended after it`, () => {
      const result = owed([row('merge', at), row('do-not-merge', 200)])
      expect(result.outstanding.some((c) => c.file === 'b')).toBe(true)
      expect(result.refusals).toHaveLength(1)
    })

    it(`lets a reading appended later settle a refusal carrying ${name}`, () => {
      // The counter-danger to the one above: a rule that let an unplaceable
      // refusal win would freeze this contribution as owed for good, and an
      // unsatisfiable gate is what this point exists to remove.
      const result = owed([row('do-not-merge', at), row('merge', 500)])
      expect(result.covered.some((c) => c.file === 'b')).toBe(true)
      expect(result.refusals).toHaveLength(0)
    })
  }

  it('does not let an unclocked row between them bury the refusal the clock calls newest', () => {
    // The pairwise comparison this replaced was no order at all: the unclocked
    // middle row beat the refusal on ledger position, the last clearance beat
    // that row the same way, and the scan cleared what the clock says is
    // refused. The same three rows in any arrangement must owe.
    const rows = [row('do-not-merge', 300), row('merge', undefined), row('merge', 100)]
    for (const records of [rows, [rows[2], rows[1], rows[0]], [rows[1], rows[0], rows[2]]]) {
      const result = owed(records)
      expect(result.outstanding.some((c) => c.file === 'b')).toBe(true)
      expect(result.refusals).toHaveLength(1)
    }
  })

  it('reads a ledger a branch merge reordered by the clock, not by the line', () => {
    // Concurrent branches append independently and a merge may place an older
    // clearance after a newer refusal; both carry clocks, so the clock rules.
    const result = owed([row('do-not-merge', 900), row('merge', 100)])
    expect(result.outstanding.some((c) => c.file === 'b')).toBe(true)
  })

  it('still lets a lone record with no clock rule its contribution', () => {
    const result = owed([row('merge', undefined)])
    expect(result.covered.some((c) => c.file === 'b')).toBe(true)
    expect(result.refusals).toHaveLength(0)
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
  const reading = (verdict, at, index) => ({ record: { verdict }, at, index })

  it('never coerces a numeric string into a time', () => {
    expect(newestReading([reading('merge', '900', 0), reading('do-not-merge', 5, 1)]).record.verdict)
      .toBe('do-not-merge')
  })

  it('sorts an unusable clock before every clocked reading, whatever its line', () => {
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '5']) {
      expect(newestReading([reading('do-not-merge', 5, 0), reading('merge', at, 1)]).record.verdict)
        .toBe('do-not-merge')
    }
  })

  it('falls back to the ledger line only where neither reading carries a clock', () => {
    expect(newestReading([reading('do-not-merge', null, 0), reading('merge', null, 1)]).record.verdict)
      .toBe('merge')
  })

  it('answers nothing for no readings', () => {
    expect(newestReading([])).toBe(null)
  })
})
