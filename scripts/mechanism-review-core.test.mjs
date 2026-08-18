// The four-eyes gate on mechanisms, pinned at its decision layer (point 377).
//
// Every case here is a state the rule has actually been in: a guard changed and
// nobody reviewed it (the pre-push gate, which then turned out to wave through
// the files this repo measures in its unit layer), a review by the model that
// wrote the thing, a refusal that must not be treated as advice, and the twenty-
// odd guards that predate the gate and owe nothing.
import { describe, it, expect } from 'vitest'
import {
  BLIND_PARALLEL,
  BLOCKING_VERDICT,
  evaluateMechanismReview,
  formatArgErrors,
  formatMechanismReviewVerdict,
  isMechanismPath,
  KNOWN_FLAGS,
  MERGE_ACCOUNTING_SINCE,
  mechanismPathsIn,
  modelFromTrailers,
  modelsFromTrailers,
  MODES,
  nearestFlag,
  parseArgs,
  parseModel,
  receiptBalances,
  sameModel,
  validateMode,
  validatePass,
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

  it('catches the two files that disarm the chain without matching any name rule', () => {
    // The Stop-chain registration and the spawned-hook proof: deleting one line
    // of the first silently kills any guard, and gutting the second removes the
    // only evidence that the hooks fire at all.
    expect(isMechanismPath('.claude/settings.json', opts)).toBe(true)
    expect(isMechanismPath('scripts/guard-hooks.test.mjs', opts)).toBe(true)
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

  // POINT 667: Sol authors as well as reviews, so "who wrote this" must read its
  // trailer too — every self-review refusal downstream is built on that answer.
  it('reads a Sol-authored commit as authored, and by ONE model', () => {
    expect(modelFromTrailers('GPT-5.6 Sol <noreply@openai.com>')).toBe('GPT-5.6 Sol <noreply@openai.com>')
    expect(modelsFromTrailers('Patrick von Massow <p@example.com>;GPT-5.6 Sol <n@o.com>')).toEqual([
      'GPT-5.6 Sol <n@o.com>',
    ])
    // A HUMAN IS STILL NOT A MODEL, however their address reads (2nd round):
    // the test used to run against the raw trailer, so `<build@sol.example>`
    // made a person a model author — and would refuse their reviewer as a self.
    expect(modelsFromTrailers('Patrick <build@sol.example>')).toEqual([])
    expect(modelFromTrailers('Patrick <build@sol.example>')).toBe('')
    // Both halves of Sol's name are the same model, whichever is written.
    expect(sameModel('GPT-5.6 Sol <noreply@openai.com>', 'Sol')).toBe(true)
    expect(sameModel('GPT-5.6 Sol', 'GPT-5.6 Sol')).toBe(true)
    expect(sameModel('GPT-5.6 Sol', 'Claude Opus 5')).toBe(false)
    expect(parseModel('GPT-5.6 Sol')).toMatchObject({ family: 'sol', version: '5.6' })
  })

  it('refuses Sol reviewing what Sol authored, and lets Claude review it', () => {
    const record = {
      sha: 'b'.repeat(40),
      verdict: 'merge',
      evidence: 'read the routing core and its cases; the hard-case branch is covered',
      authoredBy: 'GPT-5.6 Sol <noreply@openai.com>',
      mode: 'review',
    }
    const self = validateRecord({ ...record, model: 'GPT-5.6 Sol' })
    expect(self.ok).toBe(false)
    expect(self.errors.join(' ')).toMatch(/SELF-REVIEW is refused/)
    expect(validateRecord({ ...record, model: 'Sol' }).ok).toBe(false)
    expect(validateRecord({ ...record, model: 'Opus 5' }).ok).toBe(true)
  })
})

describe('validateRecord', () => {
  const good = {
    sha: 'a'.repeat(40),
    model: 'Fable 5',
    verdict: 'merge',
    evidence: 'read the core and the wrapper, ran the spawned-hook cases',
    authoredBy: 'Claude Opus 5',
    mode: 'review',
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

  it('refuses an evidence line that says the reviewer never saw the change', () => {
    // The runner already falls back on such an answer; the recorder must refuse
    // the same sentence typed by hand, or the hole reopens one line lower.
    expect(validateRecord({ ...good, evidence: 'Repository access failed before inspection' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'I could not read the diff, so nothing was checked' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'I did not have access to the diff or changed files' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'the patch was not supplied, so this is not a review' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'the diff could not be read, so no review took place' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'I was not able to inspect the diff at all' }).ok).toBe(false)
    expect(
      validateRecord({ ...good, evidence: 'I could not verify the attached change because the repository was unavailable' }).ok,
    ).toBe(false)
    // …while an ordinary finding that merely contains the words is a review.
    expect(validateRecord({ ...good, evidence: 'the guard could not see a renamed file; fixed in the diff' }).ok).toBe(true)
  })

  it('refuses an evidence line still in its angle brackets, however long', () => {
    // The commands that print a record command for a review still to be done
    // leave `<…>` standing; the length rule alone would wave a long one through.
    expect(validateRecord({ ...good, evidence: '<what the review actually checked>' }).ok).toBe(false)
    expect(validateRecord({ ...good, evidence: 'the <core> was read against its spec' }).ok).toBe(true)
  })

  it('accepts a record whose commit has no readable author model', () => {
    // Unknown authorship is not evidence of a self-review; refusing here would
    // make a merge commit unrecordable.
    expect(validateRecord({ ...good, authoredBy: '' }).ok).toBe(true)
  })
})

/** A receipt in exactly the shape blind-merge.mjs prints for a balanced union. */
const RECEIPT = '3 A + 2 B entries → 4 union entries (2 merged, 2 only A, 1 only B): every input entry accounted for'

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
    // Written since the merge rule landed, so a blind-parallel row here owes its
    // merger and its count (the older rows are grandfathered by date).
    at: MERGE_ACCOUNTING_SINCE + 2000,
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

  it('REFUSES a hand-edited row whose UNION was merged by an author of it', () => {
    // The ledger is a tracked text file; the recorder's refusal of a self-merge
    // has to hold at the gate too, or an edited row walks straight past it
    // (four-eyes finding on point 634).
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record({ mode: 'blind-parallel', mergedBy: 'Opus 5', accounting: RECEIPT })],
    })
    expect(v.block).toBe(true)
    expect(v.findings[0].kind).toBe('self-review')
    expect(formatMechanismReviewVerdict(v)).toMatch(/self-merge is where a finding disappears/)
  })

  it('takes the same row once a third model merged it, or the fallback is recorded', () => {
    const pending = [commit({ coveringRecordShas: ['c'.repeat(40)] })]
    const third = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: pending,
      records: [record({ mode: 'blind-parallel', mergedBy: 'GPT-5.6 Sol', accounting: RECEIPT })],
    })
    expect(third.block).toBe(false)
    const fallback = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: pending,
      records: [
        record({
          mode: 'blind-parallel',
          mergedBy: 'Opus 5',
          accounting: RECEIPT,
          mergeFallback: 'Sol was unreachable',
        }),
      ],
    })
    expect(fallback.block).toBe(false)
  })

  it('leaves the rows written BEFORE the rule landed alone, and no younger one', () => {
    const pending = [commit({ coveringRecordShas: ['c'.repeat(40)] })]
    // A row from before MERGE_ACCOUNTING_SINCE carries neither field and stands.
    const legacy = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: pending,
      records: [record({ mode: 'blind-parallel', at: MERGE_ACCOUNTING_SINCE - 1 })],
    })
    expect(legacy.block).toBe(false)
    // A row written since owes both — leaving the fields out is not a legacy row.
    for (const over of [
      {},
      { mergedBy: 'GPT-5.6 Sol' },
      { mergedBy: 'GPT-5.6 Sol', accounting: 'I counted them all' },
    ]) {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: pending,
        records: [record({ mode: 'blind-parallel', at: MERGE_ACCOUNTING_SINCE + 1, ...over })],
      })
      expect(v.block, JSON.stringify(over)).toBe(true)
      expect(v.findings[0].kind).toBe('self-review')
    }
    expect(
      formatMechanismReviewVerdict(
        evaluateMechanismReview({
          baseline: 'b',
          head: 'h',
          pendingCommits: pending,
          records: [record({ mode: 'blind-parallel', at: MERGE_ACCOUNTING_SINCE + 1, mergedBy: 'GPT-5.6 Sol' })],
        }),
      ),
    ).toMatch(/no count of it/)
  })

  it('does NOT read a row with no timestamp as a legacy one', () => {
    // Omitting `at` together with the merger and the count was a way past every
    // check (four-eyes review, third round): unstamped is not old.
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [{ sha: 'c'.repeat(40), model: 'Fable 5', verdict: 'merge', mode: 'blind-parallel' }],
    })
    expect(v.block).toBe(true)
  })

  it('judges the two-model FALLBACK instead of accepting any word in the field', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record({ mode: 'blind-parallel', mergedBy: 'Opus 5', accounting: RECEIPT, mergeFallback: 'x' })],
    })
    expect(v.block).toBe(true)
  })

  it('refuses a receipt whose numbers do not add up', () => {
    const cooked = '3 A + 2 B entries → 4 union entries (1 merged, 1 only A, 1 only B): every input entry accounted for'
    expect(receiptBalances(cooked)).toBe(false)
    expect(receiptBalances(RECEIPT)).toBe(true)
    // and the arithmetic edges the shape alone would wave through
    expect(receiptBalances('1 A + 1 B entries → 2 union entries (0 merged, 2 only A, 0 only B): every input entry accounted for')).toBe(false)
    expect(receiptBalances('0 A + 0 B entries → 3 union entries (0 merged, 0 only A, 0 only B): every input entry accounted for')).toBe(false)
    // The union's SIZE follows from the dispositions: two entries that were not
    // merged cannot share one union entry, and folds cannot outnumber the pairs.
    expect(receiptBalances('1 A + 1 B entries → 1 union entries (0 merged, 1 only A, 1 only B): every input entry accounted for')).toBe(false)
    expect(receiptBalances('2 A + 2 B entries → 4 union entries (4 merged, 0 only A, 0 only B): every input entry accounted for')).toBe(false)
    expect(receiptBalances('2 A + 2 B entries → 2 union entries (4 merged, 0 only A, 0 only B): every input entry accounted for')).toBe(true)
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit({ coveringRecordShas: ['c'.repeat(40)] })],
      records: [record({ mode: 'blind-parallel', mergedBy: 'GPT-5.6 Sol', accounting: cooked })],
    })
    expect(v.block).toBe(true)
  })

  it('refuses a merge by a SECOND co-author of the commit', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [
        commit({ coveringRecordShas: ['c'.repeat(40)], authorModels: ['Claude Opus 5', 'Claude Fable 5'] }),
      ],
      records: [record({ mode: 'blind-parallel', mergedBy: 'Fable 5', accounting: RECEIPT })],
    })
    expect(v.block).toBe(true)
    expect(formatMechanismReviewVerdict(v)).toMatch(/self-merge/)
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

  // POINT 714: a range whose material no single round can hold is reviewed in
  // passes over the FILE SET, and one pass clears nothing on its own.
  describe('a review split into passes', () => {
    // The commit's OWN mechanism file travels in pass 1: a composition covers
    // what its passes NAME, so a split whose files never mention the changed
    // guard covers nothing about it (cross-vendor review, first round).
    const MECH = 'scripts/pre-push-gate-core.mjs'
    const pass = (index, total, over = {}) =>
      record({
        pass: { index, total, files: index === 1 ? [MECH, 'scripts/f1.mjs'] : [`scripts/f${index}.mjs`] },
        at: MERGE_ACCOUNTING_SINCE + 1000 + index,
        ...over,
      })
    const covered = { coveringRecordShas: ['c'.repeat(40)] }

    it('BLOCKS while a pass is still missing, and names which', () => {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 3), pass(3, 3)],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].kind).toBe('incomplete-passes')
      const text = formatMechanismReviewVerdict(v)
      expect(text).toContain('split into 3 passes')
      expect(text).toContain('missing pass 2')
      expect(text).toContain('--pass 2')
    })

    it('CLEARS once every pass of the split is on record', () => {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 3), pass(2, 3), pass(3, 3)],
      })
      expect(v.block).toBe(false)
    })

    it('takes the WORST verdict of the composition — one refusing pass refuses the range', () => {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 2), pass(2, 2, { verdict: 'do-not-merge' })],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].kind).toBe('do-not-merge')
    })

    it('keeps a WHOLE-RANGE record at the same sha working beside the passes', () => {
      // The multimap: keyed by sha alone, the last row won and the earlier ones
      // vanished — which is how a pass record could read as a whole-range review.
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 3), record({ at: MERGE_ACCOUNTING_SINCE + 9000 })],
      })
      expect(v.block).toBe(false)
    })

    it('does not let a pass of a self-review compose anything', () => {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 2, { model: 'Claude Opus 5' }), pass(2, 2, { model: 'Claude Opus 5' })],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].kind).toBe('self-review')
    })

    // THE HOLE THE FIRST CROSS-VENDOR ROUND FOUND: the count of passes was the
    // whole check, so any two records marked 1/2 and 2/2 cleared the commit —
    // whatever files they named, and even when they both named the same one.
    it('BLOCKS when every pass is on record but none of them names what the commit changed', () => {
      const elsewhere = (index, total) =>
        record({
          pass: { index, total, files: [`scripts/f${index}.mjs`] },
          at: MERGE_ACCOUNTING_SINCE + 2000 + index,
        })
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [elsewhere(1, 2), elsewhere(2, 2)],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].kind).toBe('incomplete-passes')
      expect(v.findings[0].passes.uncovered).toEqual(['scripts/pre-push-gate-core.mjs'])
      const text = formatMechanismReviewVerdict(v)
      expect(text).toContain('nobody read them')
      expect(text).toContain('scripts/pre-push-gate-core.mjs')
      // …and it does not claim a pass is missing, because none is.
      expect(text).not.toContain('missing pass')
    })

    it('BLOCKS when both passes name the SAME file', () => {
      const same = (index, total) =>
        record({
          pass: { index, total, files: ['scripts/f1.mjs'] },
          at: MERGE_ACCOUNTING_SINCE + 3000 + index,
        })
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [same(1, 2), same(2, 2)],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].kind).toBe('incomplete-passes')
    })

    // A file the plan calls UNCOVERABLE (no round can hold even its diff) is in
    // no pass at all, so a complete-looking composition must not clear the commit
    // that touched it.
    it('BLOCKS while a file BEYOND the reach of any pass went unnamed', () => {
      const beyond = commit({ ...covered, files: ['scripts/pre-push-gate-core.mjs', 'scripts/huge-guard.mjs'] })
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [beyond],
        records: [pass(1, 2), pass(2, 2)],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].passes.uncovered).toEqual(['scripts/huge-guard.mjs'])
      expect(formatMechanismReviewVerdict(v)).toContain('scripts/huge-guard.mjs')
    })

    it('CLEARS when the passes name more than the commit itself touched', () => {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 2), pass(2, 2)],
      })
      expect(v.block).toBe(false)
    })

    it('does not mix two different splits of the same sha into one coverage', () => {
      const v = evaluateMechanismReview({
        baseline: 'b',
        head: 'h',
        pendingCommits: [commit(covered)],
        records: [pass(1, 2), pass(2, 3), pass(3, 3)],
      })
      expect(v.block).toBe(true)
      expect(v.findings[0].kind).toBe('incomplete-passes')
    })
  })
})

// ---------------------------------------------------------------------------
// THE ARGUMENT PARSER (point 540). The case that cost the work: `--point 298`
// handed to a CLI that did not know the flag, dropped without a word, so the
// criticality gate reported "no review recorded for this point" while the
// verdict for that commit sat in the ledger.
// ---------------------------------------------------------------------------
describe('parseArgs — a known command line', () => {
  const full = [
    '--record', 'abc1234',
    '--model', 'Fable 5',
    '--verdict', 'merge',
    '--evidence', 'read the core against its spec',
    '--point', '298',
  ]

  it("parses the full record form into the record builder's own field names", () => {
    const p = parseArgs(full)
    expect(p.ok, p.errors.join('\n')).toBe(true)
    expect(p.mode).toBe('record')
    expect(p.values).toEqual({
      sha: 'abc1234',
      model: 'Fable 5',
      verdict: 'merge',
      evidence: 'read the core against its spec',
      point: '298',
    })
  })

  it('does not care in which order the flags arrive', () => {
    const p = parseArgs(['--point', '298', '--verdict', 'merge', '--record', 'abc1234'])
    expect(p.ok, p.errors.join('\n')).toBe(true)
    expect(p.values.point).toBe('298')
    expect(p.values.sha).toBe('abc1234')
  })

  it('reads --list and the bare invocation as the same ledger read', () => {
    for (const argv of [['--list'], []]) {
      const p = parseArgs(argv)
      expect(p.ok, p.errors.join('\n')).toBe(true)
      expect(p.mode).toBe('list')
    }
  })

  it('takes a value that merely LOOKS odd — a lone dash, a number, spaces', () => {
    const p = parseArgs(['--record', 'abc1234', '--model', '-x 4.8', '--evidence', '  spaced  '])
    expect(p.ok, p.errors.join('\n')).toBe(true)
    expect(p.values.model).toBe('-x 4.8')
    expect(p.values.evidence).toBe('  spaced  ')
  })

  it('leaves the REQUIRED-flag question to validateRecord, whose usage is unchanged', () => {
    // Omitting --verdict is not a PARSE error: the parser judges only what it
    // was given, so the one message naming the required set stays in one place.
    const p = parseArgs(['--record', 'abc1234'])
    expect(p.ok, p.errors.join('\n')).toBe(true)
    expect(p.values.verdict).toBeUndefined()
    const v = validateRecord({ sha: 'abc1234' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toContain('--verdict')
  })
})

describe('parseArgs — an argument it does not recognise', () => {
  it('refuses an unknown flag and NAMES it, rather than dropping it', () => {
    const p = parseArgs(['--record', 'abc1234', '--status'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('unknown flag --status')
  })

  it('names EVERY unknown flag, not only the first', () => {
    const p = parseArgs(['--frobnicate', '--wibble'])
    expect(p.ok).toBe(false)
    const text = p.errors.join('\n')
    expect(text).toContain('--frobnicate')
    expect(text).toContain('--wibble')
  })

  it('reports a MISSPELLED known flag and points at the one that was meant', () => {
    // The exact shape of the failure this point exists for: one letter off, and
    // the value behind it disappears.
    const p = parseArgs(['--record', 'abc1234', '--poin', '298'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('unknown flag --poin')
    expect(p.errors.join('\n')).toContain('did you mean --point')
    expect(p.values.point).toBeUndefined()
  })

  it('reports an ABBREVIATED known flag the same way', () => {
    const p = parseArgs(['--mod', 'Fable 5'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('unknown flag --mod')
    expect(p.errors.join('\n')).toContain('did you mean --model')
  })

  it('does not report the swallowed value of an unknown flag a SECOND time', () => {
    const p = parseArgs(['--poin', '298'])
    expect(p.errors).toHaveLength(1)
  })

  it('suggests nothing when nothing is close — a wrong guess is worse than none', () => {
    const p = parseArgs(['--status'])
    expect(p.errors.join('\n')).toContain('unknown flag --status')
    expect(p.errors.join('\n')).not.toContain('did you mean')
  })

  it('refuses a stray argument that belongs to no flag', () => {
    const p = parseArgs(['--record', 'abc1234', 'leftover'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('leftover')
  })

  it('refuses the --flag=value form instead of reading it as an unknown flag', () => {
    const p = parseArgs(['--point=298'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('--point <value>')
  })

  it('refuses a flag given twice, where one value would vanish silently', () => {
    const p = parseArgs(['--point', '298', '--point', '540'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('--point given more than once')
  })

  it('refuses a flag whose value is missing at the end of the line', () => {
    const p = parseArgs(['--record'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('--record expects a value')
  })

  it('refuses a flag whose value is swallowed by the NEXT flag', () => {
    const p = parseArgs(['--evidence', '--verdict', 'merge'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('--evidence expects a value')
  })

  it('refuses --list mixed with the record flags — they are different commands', () => {
    const p = parseArgs(['--list', '--record', 'abc1234'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toMatch(/one or the other/)
  })

  it('refuses an unknown flag even beside --list, which used to short-circuit', () => {
    const p = parseArgs(['--list', '--wibble'])
    expect(p.ok).toBe(false)
    expect(p.errors.join('\n')).toContain('--wibble')
  })

  it('never throws on rubbish input', () => {
    for (const argv of [null, undefined, ['--'], ['---'], ['', ' '], [42]]) {
      expect(() => parseArgs(argv)).not.toThrow()
    }
  })
})

describe('the flag surface itself', () => {
  it('nearestFlag returns a KNOWN flag or nothing at all', () => {
    for (const token of ['--poin', '--mod', '--reccord', '--zzzzzzzzzz', '']) {
      const near = nearestFlag(token)
      if (near) expect(KNOWN_FLAGS.has(near)).toBe(true)
    }
  })

  it('formatArgErrors names every refusal on its own line', () => {
    const text = formatArgErrors(['unknown flag --a', 'unknown flag --b'])
    expect(text).toContain('--a')
    expect(text).toContain('--b')
    expect(text.split('\n').length).toBeGreaterThan(2)
  })

  it('knows the pass flags, and lands their values where the record reads them', () => {
    const p = parseArgs(['--record', 'abc1234', '--pass', '1/3', '--pass-files', 'a.mjs,b.mjs'])
    expect(p.ok).toBe(true)
    expect(p.values.pass).toBe('1/3')
    expect(p.values.passFiles).toBe('a.mjs,b.mjs')
  })
})

// ---------------------------------------------------------------------------
// THE PASS COMPOSITION (point 714). A range whose material no single review
// round can hold is reviewed in passes over the FILE SET, and a record that
// names one pass must say which files it read — or it claims a coverage nobody
// can check.
// ---------------------------------------------------------------------------
describe('validatePass', () => {
  it('accepts a pass that names its number, its total and its files', () => {
    const v = validatePass({ pass: '2/4', passFiles: 'scripts/a.mjs, scripts/b.mjs' })
    expect(v.ok).toBe(true)
    expect(v.pass).toEqual({ index: 2, total: 4, files: ['scripts/a.mjs', 'scripts/b.mjs'] })
  })

  it('is silent on an ordinary record, which names no pass at all', () => {
    expect(validatePass({})).toEqual({ ok: true, errors: [], pass: null })
    expect(validatePass({ pass: '', passFiles: '' }).pass).toBeNull()
  })

  it('REFUSES a pass that does not say what it read', () => {
    const v = validatePass({ pass: '1/2' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toContain('--pass-files')
  })

  it('REFUSES a file list belonging to no pass', () => {
    const v = validatePass({ passFiles: 'scripts/a.mjs' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toContain('--pass')
  })

  it('REFUSES a single-pass split — that is an ordinary whole-range record', () => {
    expect(validatePass({ pass: '1/1', passFiles: 'scripts/a.mjs' }).ok).toBe(false)
  })

  it('REFUSES a pass number outside its own split, and a malformed spec', () => {
    expect(validatePass({ pass: '5/3', passFiles: 'a.mjs' }).ok).toBe(false)
    expect(validatePass({ pass: 'two of three', passFiles: 'a.mjs' }).ok).toBe(false)
  })

  it('REFUSES a file list of nothing but separators', () => {
    expect(validatePass({ pass: '1/2', passFiles: ' , , ' }).ok).toBe(false)
  })

  it('is asked by validateRecord, so a broken pass cannot be WRITTEN', () => {
    const base = {
      sha: 'a'.repeat(40),
      model: 'GPT-5.6 Sol',
      verdict: 'merge',
      evidence: 'read both scripts of this pass end to end',
      mode: 'review',
      authoredBy: 'Claude Opus 5',
    }
    expect(validateRecord({ ...base, pass: '1/2', passFiles: 'scripts/a.mjs' }).ok).toBe(true)
    expect(validateRecord({ ...base, pass: '1/2' }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// THE FOUR-EYES MODE (point 541). Only the convergent half had an enforcer;
// nothing recorded whether a DIVERGENT step ran blind parallel or as a review of
// an already-finished list. No guard can detect that, so the recorder asks.
// ---------------------------------------------------------------------------
describe('validateMode', () => {
  it('names both modes of CLAUDE.md §6 and nothing else', () => {
    expect(MODES).toEqual(['review', 'blind-parallel'])
    expect(BLIND_PARALLEL).toBe('blind-parallel')
    for (const mode of MODES) expect(validateMode({ mode }).ok).toBe(true)
  })

  it('REFUSES a missing mode instead of defaulting one, and names the choice', () => {
    for (const mode of [undefined, '', '   ', null]) {
      const v = validateMode({ mode })
      expect(v.ok).toBe(false)
      const text = v.errors.join('\n')
      expect(text).toContain('--mode')
      // The refusal has to state WHICH two, or it only says "you forgot
      // something" — the reader then guesses, which is what 540 is about.
      for (const m of MODES) expect(text).toContain(m)
      expect(text).toMatch(/no default/i)
    }
  })

  it('refuses a mode that is neither, naming what was given', () => {
    const v = validateMode({ mode: 'four-eyes' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toContain('four-eyes')
  })

  it('accepts the same-model fallback framing under blind-parallel', () => {
    const v = validateMode({
      mode: 'blind-parallel',
      framing: 'second run framed as a maintainer inheriting the code',
    })
    expect(v.ok, v.errors.join('\n')).toBe(true)
  })

  it('REJECTS that framing under a review, where it would describe nothing', () => {
    const v = validateMode({ mode: 'review', framing: 'second run framed as a hostile tester' })
    expect(v.ok).toBe(false)
    const text = v.errors.join('\n')
    expect(text).toContain('--framing')
    expect(text).toMatch(/meaningless/)
    expect(text).toContain('blind-parallel')
  })

  it('refuses a token framing — a stance, not a word', () => {
    expect(validateMode({ mode: 'blind-parallel', framing: 'x' }).ok).toBe(false)
  })

  it('does not blame the framing when the mode itself is missing', () => {
    // Two errors for one mistake sends the reader to fix the wrong flag.
    const v = validateMode({ framing: 'framed as a player trying to break it' })
    expect(v.errors.filter((e) => e.includes('meaningless'))).toHaveLength(0)
  })
})

describe('validateRecord carries the mode', () => {
  const good = {
    sha: 'a'.repeat(40),
    model: 'Fable 5',
    verdict: 'merge',
    evidence: 'read the core and the wrapper against the spec',
    authoredBy: 'Claude Opus 5',
  }

  it('refuses an otherwise complete record that names no mode', () => {
    const v = validateRecord(good)
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toContain('--mode')
  })

  /** A blind-parallel record names the third model AND carries the count. */
  const counted = {
    mode: 'blind-parallel',
    mergedBy: 'GPT-5.6 Sol',
    accounting: '7 A + 5 B entries → 9 union entries (6 merged, 4 only A, 2 only B): every input entry accounted for',
  }

  it('accepts it once the mode is named', () => {
    expect(validateRecord({ ...good, mode: 'review' })).toEqual({ ok: true, errors: [] })
    expect(validateRecord({ ...good, ...counted }).ok, validateRecord({ ...good, ...counted }).errors).toBe(true)
  })

  it('refuses a blind-parallel record that names no merging model', () => {
    const v = validateRecord({ ...good, ...counted, mergedBy: '' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toMatch(/no merging model named/i)
  })

  it('refuses a merge by either of the two models that wrote the lists', () => {
    for (const who of ['Fable 5', 'Claude Opus 5']) {
      const v = validateRecord({ ...good, ...counted, mergedBy: who })
      expect(v.ok, who).toBe(false)
      expect(v.errors.join('\n')).toMatch(/may not merge them/i)
    }
  })

  it('refuses a merge by a SECOND model named in the trailers, not only the first', () => {
    // modelFromTrailers reads one author; a commit can name two, and the second
    // must not be able to merge its own list (four-eyes finding on this point).
    const v = validateRecord({
      ...good,
      ...counted,
      authors: ['Claude Opus 5', 'Claude Fable 5'],
      mergedBy: 'Fable 5',
    })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toMatch(/may not merge them/i)
  })

  it('REFUSES A BLIND-PARALLEL RECORD WITH NO COUNT, and one whose count did not balance', () => {
    const v = validateRecord({ ...good, ...counted, accounting: '' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toMatch(/COUNTED, not trusted/)
    const red = validateRecord({
      ...good,
      ...counted,
      accounting: '7 A + 5 B entries → 8 union entries: 1 accounting error(s) — the union does not account',
    })
    expect(red.ok).toBe(false)
    expect(red.errors.join('\n')).toMatch(/not the line blind-merge.mjs prints/)
    expect(validateRecord({ ...good, ...counted, accounting: 'I merged them carefully' }).ok).toBe(false)
  })

  it('lets the recorded two-model fallback through, and refuses one naming no model', () => {
    const fb = { ...good, ...counted, mergedBy: 'Fable 5' }
    expect(validateRecord({ ...fb, mergeFallback: 'GPT-5.6 Sol was unreachable all session' }).ok).toBe(true)
    expect(validateRecord({ ...fb, mergeFallback: 'nobody else was around' }).ok).toBe(false)
    expect(validateRecord({ ...fb, mergeFallback: 'none' }).ok).toBe(false)
  })

  it('refuses a merging model or a count under a review, which folds nothing', () => {
    const v = validateRecord({ ...good, mode: 'review', mergedBy: 'GPT-5.6 Sol' })
    expect(v.ok).toBe(false)
    expect(v.errors.join('\n')).toMatch(/meaningless under --mode review/i)
    const c = validateRecord({ ...good, mode: 'review', accounting: counted.accounting })
    expect(c.ok).toBe(false)
    expect(c.errors.join('\n')).toMatch(/--accounting is meaningless/i)
  })

  it('does not blame the merger when the mode itself is missing', () => {
    // Same reason as the framing: two errors for one mistake sends the reader
    // to fix the wrong flag.
    expect(validateRecord(good).errors.filter((e) => /merg|accounting/i.test(e))).toHaveLength(0)
  })

  it('reads every Claude co-author out of the trailers, not just the first', () => {
    expect(modelsFromTrailers('Claude Opus 5 <a@b>; Claude Fable 5 <c@d>')).toEqual([
      'Claude Opus 5 <a@b>',
      'Claude Fable 5 <c@d>',
    ])
    expect(modelsFromTrailers('Someone Else <x@y>')).toEqual([])
    // The single-author read stays what it was — the gate compares one to one.
    expect(modelFromTrailers('Claude Opus 5 <a@b>; Claude Fable 5 <c@d>')).toBe('Claude Opus 5 <a@b>')
  })

  it('still refuses a self-review, whichever mode is claimed', () => {
    for (const mode of MODES) {
      const v = validateRecord({ ...good, model: 'Claude Opus 5', mode })
      expect(v.ok).toBe(false)
      expect(v.errors.join(' ')).toMatch(/SELF-REVIEW is refused/)
    }
  })
})

describe('the mode is required to WRITE a record, never to READ one', () => {
  // The ledger is tracked in git and outlives the CLI that wrote it: 129 rows
  // predate this flag. A gate that suddenly discounted them would report "no
  // review recorded" for reviews that were performed and recorded.
  const legacy = (over = {}) => ({
    sha: 'r'.repeat(40),
    model: 'Fable 5',
    verdict: 'merge',
    evidence: 'a verdict recorded before --mode existed',
    at: 1,
    ...over,
  })
  const commit = (over = {}) => ({
    sha: '1'.repeat(40),
    subject: 'change a guard',
    authorModel: 'Claude Opus 5',
    files: ['scripts/demo-guard.mjs'],
    coveringRecordShas: ['r'.repeat(40)],
    ...over,
  })

  it('clears the gate on a row that carries no mode at all', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit()],
      records: [legacy()],
    })
    expect(v.block, formatMechanismReviewVerdict(v)).toBe(false)
  })

  it('clears it just the same on a row that carries one', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit()],
      records: [legacy({ mode: 'review' })],
    })
    expect(v.block).toBe(false)
  })

  it('does not let an unknown mode on a row turn a recorded review into none', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [commit()],
      records: [legacy({ mode: 'nonsense-from-a-hand-edit' })],
    })
    expect(v.block).toBe(false)
  })
})

describe('the refusal teaches the command that actually works', () => {
  it('names --mode in the record command it prints', () => {
    const v = evaluateMechanismReview({
      baseline: 'b',
      head: 'h',
      pendingCommits: [
        {
          sha: '1'.repeat(40),
          subject: 'change a guard',
          authorModel: 'Claude Opus 5',
          files: ['scripts/demo-guard.mjs'],
          coveringRecordShas: [],
        },
      ],
      records: [],
    })
    const text = formatMechanismReviewVerdict(v)
    expect(text).toContain('--mode')
    for (const m of MODES) expect(text).toContain(m)
  })
})
