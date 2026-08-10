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
  mechanismPathsIn,
  modelFromTrailers,
  MODES,
  nearestFlag,
  parseArgs,
  parseModel,
  sameModel,
  validateMode,
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

  it('accepts it once the mode is named', () => {
    expect(validateRecord({ ...good, mode: 'review' })).toEqual({ ok: true, errors: [] })
    expect(validateRecord({ ...good, mode: 'blind-parallel' }).ok).toBe(true)
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
