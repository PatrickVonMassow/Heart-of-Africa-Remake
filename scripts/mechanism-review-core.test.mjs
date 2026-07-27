// The four-eyes gate on mechanisms, pinned at its decision layer (point 377).
//
// Every case here is a state the rule has actually been in: a guard changed and
// nobody reviewed it (the pre-push gate, which then turned out to wave through
// the files this repo measures in its unit layer), a review by the model that
// wrote the thing, a refusal that must not be treated as advice, and the twenty-
// odd guards that predate the gate and owe nothing.
import { describe, it, expect } from 'vitest'
import {
  BLOCKING_VERDICT,
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
  isMechanismPath,
  mechanismPathsIn,
  modelFromTrailers,
  parseModel,
  sameModel,
  validateRecord,
  VERDICTS,
} from './mechanism-review-core.mjs'

const SCRIPTS = [
  'mechanism-review-guard.mjs',
  'mechanism-review-core.mjs',
  'mechanism-review.mjs',
  'render-verify-guard.mjs',
  'render-verify-core.mjs',
  'render-verify-state.mjs',
  'pre-push-gate.mjs',
  'pre-push-gate-core.mjs',
  'notify.mjs',
  'balance.mjs',
]
const opts = { scriptFiles: SCRIPTS }

describe('isMechanismPath', () => {
  it('catches the guards, their cores and their tests', () => {
    for (const p of [
      'scripts/render-verify-guard.mjs',
      'scripts/render-verify-core.mjs',
      'scripts/model-guard-core.test.mjs',
      'scripts/tasks-archive-guard.mjs',
    ]) {
      expect(isMechanismPath(p, opts), p).toBe(true)
    }
  })

  it('catches the gates and the versioned git hooks', () => {
    expect(isMechanismPath('scripts/pre-push-gate.mjs', opts)).toBe(true)
    expect(isMechanismPath('scripts/pre-push-gate-core.mjs', opts)).toBe(true)
    expect(isMechanismPath('scripts/git-hooks/pre-commit', opts)).toBe(true)
    expect(isMechanismPath('scripts/git-hooks/pre-push', opts)).toBe(true)
  })

  it('catches the CLI half that sits BESIDE a guard, by name', () => {
    // mechanism-review.mjs writes the ledger this gate reads; weakening it would
    // defeat the gate just as surely as editing the guard.
    expect(isMechanismPath('scripts/mechanism-review.mjs', opts)).toBe(true)
  })

  it('stops at ONE decoration — the deliberate edge of the "beside one" rule', () => {
    // render-verify-state.mjs is a helper of a guard, but its stem is not the
    // guard's, and walking prefixes to reach it would also sweep in
    // dashboard-state.mjs — routine board tooling. A gate that fires on ordinary
    // edits teaches people to wave it off, so the reach stops here and widening
    // it is an edit of isMechanismPath, in a reviewable diff.
    expect(isMechanismPath('scripts/render-verify-state.mjs', opts)).toBe(false)
  })

  it('leaves ordinary code, docs and unrelated tooling alone', () => {
    for (const p of [
      'src/render/water.ts',
      'docs/analysis_de/vibe-coding-anleitung.md',
      'scripts/notify.mjs',
      'scripts/balance.mjs',
      'CLAUDE.md',
      'scripts/git-hooks/',
    ]) {
      expect(isMechanismPath(p, opts), p).toBe(false)
    }
  })

  it('does not mistake a mention of a guard core for the guard itself', () => {
    // Without a sibling listing the "beside one" rule cannot fire, and inventing
    // a match would have the gate demand reviews for unrelated helpers.
    expect(isMechanismPath('scripts/mechanism-review.mjs', { scriptFiles: [] })).toBe(false)
    expect(isMechanismPath('scripts/render-verify-guard.mjs', { scriptFiles: [] })).toBe(true)
  })

  it('accepts Windows-style separators, which is what git-on-Windows can hand it', () => {
    expect(isMechanismPath('scripts\\model-guard.mjs', opts)).toBe(true)
  })

  it('filters a commit file list down to the mechanism paths', () => {
    expect(
      mechanismPathsIn(['src/ui/Hud.tsx', 'scripts/pre-push-gate.mjs', 'README.md'], opts),
    ).toEqual(['scripts/pre-push-gate.mjs'])
  })
})

describe('model identity', () => {
  it('reads family and version out of a trailer designation', () => {
    expect(parseModel('Claude Opus 4.8 <noreply@anthropic.com>')).toMatchObject({
      family: 'opus',
      version: '4.8',
    })
    expect(parseModel('Fable 5')).toMatchObject({ family: 'fable', version: '5' })
  })

  it('calls the same model the same, however it was written down', () => {
    expect(sameModel('Claude Opus 5 <noreply@anthropic.com>', 'opus 5')).toBe(true)
    expect(sameModel('opus', 'Claude Opus 5')).toBe(true)
  })

  it('treats a different family or a different version as a different model', () => {
    expect(sameModel('Fable 5', 'Claude Opus 5')).toBe(false)
    expect(sameModel('Claude Opus 4.8', 'Claude Opus 5')).toBe(false)
  })

  it('never claims a self-review it cannot prove', () => {
    // A merge commit carries no model trailer. Refusing a review over authorship
    // nobody can read would block a turn on an unanswerable question.
    expect(sameModel('', 'Claude Opus 5')).toBe(false)
    expect(sameModel('Claude Opus 5', '')).toBe(false)
  })

  it('picks the Claude co-author out of a trailer field, ignoring the humans', () => {
    expect(modelFromTrailers('Patrick von Massow <p@example.com>;Claude Opus 5 <n@a.com>')).toMatch(
      /Claude Opus 5/,
    )
    expect(modelFromTrailers('Patrick von Massow <p@example.com>')).toBe('')
    expect(modelFromTrailers('')).toBe('')
  })
})

describe('validateRecord', () => {
  const good = {
    sha: 'a'.repeat(40),
    model: 'Fable 5',
    verdict: 'merge',
    evidence: 'read the core and the wrapper, ran the spawned-hook cases',
    authoredBy: 'Claude Opus 5',
  }

  it('accepts a complete record by a different model', () => {
    expect(validateRecord(good)).toEqual({ ok: true, errors: [] })
  })

  it('names every verdict the rule allows', () => {
    expect(VERDICTS).toEqual(['merge', 'merge-with-fixes', 'do-not-merge'])
    for (const verdict of VERDICTS) expect(validateRecord({ ...good, verdict }).ok).toBe(true)
  })

  it('REFUSES a self-review rather than warning about it', () => {
    const r = validateRecord({ ...good, model: 'Claude Opus 5' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/SELF-REVIEW is refused/)
  })

  it('refuses an unknown verdict, a missing model and a token evidence line', () => {
    expect(validateRecord({ ...good, verdict: 'looks fine' }).ok).toBe(false)
    expect(validateRecord({ ...good, model: '  ' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'ok' }).ok).toBe(false)
    expect(validateRecord({ ...good, sha: 'not-a-sha' }).ok).toBe(false)
  })

  it('accepts a record whose commit has no readable author model', () => {
    // Unknown authorship is not evidence of a self-review; refusing here would
    // make a merge commit unrecordable.
    expect(validateRecord({ ...good, authoredBy: '' }).ok).toBe(true)
  })
})

describe('evaluateMechanismReview', () => {
  const commit = (over = {}) => ({
    sha: 'c'.repeat(40),
    subject: 'Give the pre-push gate its fast path',
    at: 1000,
    authorModel: 'Claude Opus 5',
    files: ['scripts/pre-push-gate-core.mjs'],
    coveringRecordShas: [],
    ...over,
  })
  const record = (over = {}) => ({
    sha: 'c'.repeat(40),
    model: 'Fable 5',
    verdict: 'merge',
    evidence: 'checked the fast path against the unit layer',
    at: 2000,
    authoredBy: 'Claude Opus 5',
    ...over,
  })

  it('BLOCKS a changed mechanism with no record at all', () => {
    const v = evaluateMechanismReview({ baseline: 'b', head: 'h', pendingCommits: [commit()], records: [] })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('no-review')
    const text = formatMechanismReviewVerdict(v)
    expect(text).toMatch(/FOUR-EYES GATE ON MECHANISMS/)
    expect(text).toContain('scripts/pre-push-gate-core.mjs')
    expect(text).toMatch(/mechanism-review\.mjs --record/)
  })

  it('PASSES once a DIFFERENT model has recorded a review', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record()],
    })
    expect(v.block).toBe(false)
    expect(formatMechanismReviewVerdict(v)).toBe('')
  })

  it('REFUSES a review by the authoring model — and says so', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record({ model: 'Claude Opus 5' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('self-review')
    expect(formatMechanismReviewVerdict(v)).toMatch(/a self-review is not a review/)
  })

  it('BLOCKS on a do-not-merge verdict as loudly as on a missing record', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record({ verdict: BLOCKING_VERDICT, evidence: 'the fast path skips the tested files' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('do-not-merge')
    expect(formatMechanismReviewVerdict(v)).toMatch(/DO-NOT-MERGE/)
    expect(formatMechanismReviewVerdict(v)).toMatch(/the fast path skips the tested files/)
  })

  it('lets a later review supersede an earlier refusal', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40), 'd'.repeat(40)] })],
      records: [
        record({ verdict: 'do-not-merge', at: 1000 }),
        record({ sha: 'd'.repeat(40), verdict: 'merge-with-fixes', at: 5000 }),
      ],
    })
    expect(v.block).toBe(false)
  })

  it('ignores a half-written ledger line instead of clearing on it', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record({ verdict: '' })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('no-review')
  })

  it('leaves a turn that changed no mechanism completely alone', () => {
    const v = evaluateMechanismReview({ baseline: 'b', head: 'h', pendingCommits: [], records: [] })
    expect(v).toMatchObject({ block: false, clear: true, bootstrap: false })
  })

  it('grandfathers everything that predates the baseline', () => {
    // The twenty-odd guards already in the tree owe no retroactive review: with
    // no baseline armed yet nothing is pending, and the wrapper then pins it at
    // the current HEAD — model-guard's own mechanism, not a second one.
    const v = evaluateMechanismReview({ baseline: null, head: 'h', pendingCommits: [commit()], records: [] })
    expect(v).toMatchObject({ block: false, bootstrap: true })
  })

  it('reports EVERY offending commit, not just the first', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [
        commit({ sha: '1'.repeat(40), subject: 'first' }),
        commit({ sha: '2'.repeat(40), subject: 'second', files: ['scripts/git-hooks/pre-push'] }),
      ],
      records: [],
    })
    expect(v.findings).toHaveLength(2)
    const text = formatMechanismReviewVerdict(v)
    expect(text).toContain('1111111')
    expect(text).toContain('2222222')
    expect(text).toContain('scripts/git-hooks/pre-push')
  })

  it('does not let a record for an UNRELATED commit clear the gate', () => {
    // coveringRecordShas is what ancestry resolved; a record outside it must not
    // be picked up by sha similarity or by being the only one in the ledger.
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: [] })],
      records: [record({ sha: 'f'.repeat(40) })],
    })
    expect(v.block).toBe(true)
  })
})
