// Pins the cross-vendor review decision (work-order point 624).
//
// The cases are chosen around the one failure this mechanism exists to prevent:
// a review nobody ran being recorded as done. So every failure kind gets its own
// case, and the recorded model is asserted to follow the RUN rather than the
// preference in both directions.
import { describe, expect, it } from 'vitest'
import { validateRecord, VERDICTS } from './mechanism-review-core.mjs'
import {
  addedFilesAreCoveredByPatch,
  buildReviewPrompt,
  classifyOutcome,
  codexArgs,
  coverageDecision,
  decideReview,
  fallbackReviewerFor,
  FALLBACK_MODEL_NAME,
  formatRecordCommand,
  formatReviewMaterial,
  formatReviewReport,
  isUnknownModelRefusal,
  modelsInTrailerField,
  newFilePathsIn,
  OUTCOME,
  parseVerdict,
  PROBE_MAX_AGE_MS,
  probeFreshness,
  savedAuthPathFrom,
  claudeReviewerFor,
  CLAUDE_REVIEW_CHAIN,
  solAuthored,
  SECOND_FALLBACK_MODEL_NAME,
  SOL_MODEL_ID,
  SOL_MODEL_NAME,
  SOL_REASONING_EFFORT,
} from './review-sol-core.mjs'

const solSays = (verdict = 'merge', evidence = 'read the diff and the guard test; the fail-open path is covered') =>
  `I checked the change.\n\nVERDICT: ${verdict}\nEVIDENCE: ${evidence}\n`

// `shortfall: null` is the material accounting's explicit "the round provably
// carried everything" — the only value that lets a decision become ready.
const okRun = (text = solSays()) => ({
  outcome: classifyOutcome({ exitCode: 0, stdout: text }),
  parsed: parseVerdict(text),
  shortfall: null,
})

describe('classifyOutcome — how a codex run ended', () => {
  it('an exit 0 is the only outcome that may count as a review', () => {
    expect(classifyOutcome({ exitCode: 0, stdout: 'anything' })).toMatchObject({ ok: true, kind: OUTCOME.OK })
  })

  it('names an unreachable host', () => {
    for (const msg of [
      'error sending request for url (https://chatgpt.com/backend-api/codex)',
      'dns error: failed to lookup address information: Name or service not known',
      'ECONNREFUSED 127.0.0.1:443',
    ]) {
      const out = classifyOutcome({ exitCode: 1, stderr: msg })
      expect(out).toMatchObject({ ok: false, kind: OUTCOME.UNREACHABLE })
      expect(out.cause).toMatch(/reach/i)
    }
  })

  it('names an expired login', () => {
    const out = classifyOutcome({ exitCode: 1, stderr: 'You are not logged in. Run `codex login`.' })
    expect(out).toMatchObject({ ok: false, kind: OUTCOME.LOGIN_EXPIRED })
    expect(out.cause).toMatch(/login/i)
  })

  it('names an exhausted allowance, and does not mistake it for a login problem', () => {
    const out = classifyOutcome({ exitCode: 1, stderr: "You've hit your usage limit. Try again later. (429)" })
    expect(out).toMatchObject({ ok: false, kind: OUTCOME.ALLOWANCE_EXHAUSTED })
  })

  it('calls a dead connection unreachable, even when its text also mentions a limit', () => {
    // 11.08.2026: the real message from a container whose firewall entry for
    // chatgpt.com had gone stale. Reported as an exhausted allowance it sent the
    // user to his billing page while 96 % of his weekly limit stood unused — and
    // it hid a cause that was ours to fix.
    const real =
      'ERROR: Reconnecting... 5/5 | ERROR: stream disconnected before completion: ' +
      'error sending request for url (https://chatgpt.com/backend-api/codex/responses)'
    expect(classifyOutcome({ exitCode: 1, stderr: real })).toMatchObject({
      ok: false,
      kind: OUTCOME.UNREACHABLE,
    })
    // A bare mention of a limit does not outrank a dead socket…
    expect(
      classifyOutcome({ exitCode: 1, stderr: 'rate limit hint\nerror sending request for url (…)' }),
    ).toMatchObject({ kind: OUTCOME.UNREACHABLE })
    // …but a server that actually REFUSED does, however the stream ended afterwards.
    // Codex retries, so a real 429 and a reconnect storm share one transcript, and
    // calling that unreachable would send us hunting a firewall that is fine
    // (GPT-5.6 Sol, reviewing the first version of this fix).
    expect(
      classifyOutcome({
        exitCode: 1,
        stderr: 'attempt 1: 429 Too Many Requests\nReconnecting... 3/5\nstream disconnected before completion',
      }),
    ).toMatchObject({ kind: OUTCOME.ALLOWANCE_EXHAUSTED })
    // But a NAKED status code is not the server refusing. Codex reconnects through
    // 403s and prints `last status: 429` as the last thing it saw, on accounts with
    // allowance to spare — that run died in transport, and calling it a spent account
    // is the original mistake one round further along (GPT-5.6 Sol, second review).
    expect(
      classifyOutcome({
        exitCode: 1,
        stderr: 'websocket 403\nReconnecting... 5/5\nstream disconnected; last status: 429',
      }),
    ).toMatchObject({ kind: OUTCOME.UNREACHABLE })
    // And a genuine quota verdict on its own is still read as one.
    expect(classifyOutcome({ exitCode: 1, stderr: 'You have hit your usage limit. (429)' })).toMatchObject({
      kind: OUTCOME.ALLOWANCE_EXHAUSTED,
    })
  })

  it('names a refused model id — the id is honoured, not substituted', () => {
    const msg = 'The requested model is not supported when using Codex with a ChatGPT account.'
    expect(classifyOutcome({ exitCode: 1, stderr: msg })).toMatchObject({ kind: OUTCOME.MODEL_REFUSED })
    expect(isUnknownModelRefusal(msg)).toBe(true)
    expect(isUnknownModelRefusal('everything went fine')).toBe(false)
  })

  it('separates "codex is not installed" from an ordinary error exit', () => {
    const enoent = Object.assign(new Error('spawnSync codex ENOENT'), { code: 'ENOENT' })
    expect(classifyOutcome({ spawnError: enoent })).toMatchObject({ ok: false, kind: OUTCOME.NOT_INSTALLED })
    expect(classifyOutcome({ exitCode: 7, stderr: 'something odd happened' })).toMatchObject({
      ok: false,
      kind: OUTCOME.ERROR_EXIT,
    })
  })

  it('a kill on the time budget is a timeout, not an error exit', () => {
    expect(classifyOutcome({ timedOut: true, exitCode: 1 })).toMatchObject({ ok: false, kind: OUTCOME.TIMEOUT })
  })

  it('reads a REAL spawnSync timeout, which arrives as an error AND a signal', () => {
    // The shape node actually returns: `{ error: ETIMEDOUT, signal: 'SIGTERM',
    // status: null }`. Asking about the error first classified every timeout as
    // a nondescript error exit (four-eyes finding, 10.08.2026).
    const err = Object.assign(new Error('spawnSync codex ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(classifyOutcome({ spawnError: err, exitCode: 1, timedOut: true })).toMatchObject({ kind: OUTCOME.TIMEOUT })
    expect(classifyOutcome({ spawnError: err, exitCode: 1, timedOut: false })).toMatchObject({ kind: OUTCOME.TIMEOUT })
  })

  it('the bubblewrap warning codex prints on stderr does not fail a green run', () => {
    const noise = 'warning: bubblewrap sandbox unavailable, continuing'
    expect(classifyOutcome({ exitCode: 0, stderr: noise, stdout: solSays() }).ok).toBe(true)
  })
})

describe('parseVerdict — only a real verdict is a verdict', () => {
  it('reads the verdict and its evidence', () => {
    expect(parseVerdict(solSays('merge-with-fixes', 'two findings, both in the parser'))).toMatchObject({
      ok: true,
      verdict: 'merge-with-fixes',
      evidence: 'two findings, both in the parser',
    })
  })

  it('survives markdown emphasis and a leading bullet', () => {
    expect(parseVerdict('- **VERDICT:** `do-not-merge`\n- **EVIDENCE:** the fallback records a verdict nobody gave')).toMatchObject(
      { ok: true, verdict: 'do-not-merge' },
    )
  })

  it('takes the LAST pair, so a quoted instruction cannot shadow the answer', () => {
    const text = `End with:\nVERDICT: <merge|do-not-merge>\n\n…\n\n${solSays('merge', 'checked every branch of the classifier')}`
    expect(parseVerdict(text)).toMatchObject({ ok: true, verdict: 'merge' })
  })

  it('refuses a verdict word the recorder would not accept', () => {
    expect(parseVerdict('VERDICT: looks good\nEVIDENCE: I read the whole diff carefully')).toMatchObject({ ok: false })
    expect(parseVerdict('no structured answer at all')).toMatchObject({ ok: false })
    expect(parseVerdict('no structured answer at all').error).toMatch(/VERDICT/)
  })

  it('refuses an evidence line that says nothing, including the placeholder itself', () => {
    expect(parseVerdict('VERDICT: merge\nEVIDENCE: fine')).toMatchObject({ ok: false })
    expect(parseVerdict('VERDICT: merge\nEVIDENCE: <one line naming what you checked>')).toMatchObject({ ok: false })
  })

  it('refuses a reviewer that says it could not see the change, whatever verdict it gave', () => {
    // The very first real run answered do-not-merge because none of its commands
    // reached the repository — a valid verdict word for a review that never
    // happened (four-eyes finding, 10.08.2026).
    for (const evidence of [
      'I could not read the diff, so no line-level review actually ran',
      'None of my commands reached the repository, so nothing was verified',
      'We were unable to access the files under review',
    ]) {
      expect(parseVerdict(`VERDICT: do-not-merge\nEVIDENCE: ${evidence}`)).toMatchObject({ ok: false })
      expect(parseVerdict(`VERDICT: merge\nEVIDENCE: ${evidence}`)).toMatchObject({ ok: false })
    }
    // …but an ordinary finding that merely contains "could not" is a review.
    expect(
      parseVerdict('VERDICT: merge-with-fixes\nEVIDENCE: the parser could not handle a CRLF patch; everything else read clean'),
    ).toMatchObject({ ok: true })
  })

  it('does NOT route a real verdict to the fallback because its FINDINGS use the net’s words', () => {
    // Measured 18.08.2026 (point 714, pass 2): Sol reviewed the review tooling
    // itself, its findings named a file that ends up "with no patch"
    // association, and the clean do-not-merge below it was reported as "the
    // reviewer says it could not see the change" — a FALSE fallback, which is
    // the mirror image of the bug the net exists for. This message is that
    // answer's shape: a findings body, then the two closing lines.
    const answer = [
      'Findings:',
      '1. review-material-core.mjs — parseDiffHeader misparses valid unquoted renames whose',
      '   destination contains " b/": the real destination then loses its patch association',
      '   while a fictitious dest.txt with no patch enters the plan.',
      '2. review-material-core.mjs — parsePassFiles collapses paths, so a file the range',
      '   touched can look covered although its content was not supplied to any pass.',
      'VERDICT: do-not-merge',
      'EVIDENCE: Checked the full supplied core and CLI-test material; found an unquoted-rename misassociation that leaves a file with no patch, and non-round-trippable pass-file paths',
    ].join('\n')
    expect(parseVerdict(answer)).toMatchObject({ ok: true, verdict: 'do-not-merge' })
  })

  it('still refuses the genuine admission, first person or bare', () => {
    expect(
      parseVerdict('VERDICT: do-not-merge\nEVIDENCE: Checked what I was given, but I could not read the diff itself'),
    ).toMatchObject({ ok: false })
    expect(
      parseVerdict('VERDICT: do-not-merge\nEVIDENCE: no patch arrived on stdin, so nothing here judges the change'),
    ).toMatchObject({ ok: false })
  })

  it('requires the pair to be the LAST two lines, not two matches from anywhere', () => {
    const spliced = 'VERDICT: merge\n\nSome later paragraph.\n\nEVIDENCE: read the whole diff and the tests'
    expect(parseVerdict(spliced)).toMatchObject({ ok: false })
    expect(parseVerdict(`intro\n${solSays('merge', 'read the whole diff and the tests')}`)).toMatchObject({ ok: true })
  })
})

describe('decideReview — the recorded model follows the RUN, never the preference', () => {
  it('a reachable Sol reviews, and is recorded as the reviewer', () => {
    const d = decideReview(okRun())
    expect(d).toMatchObject({ model: SOL_MODEL_NAME, fellBack: false, ready: true, verdict: 'merge' })
  })

  it('is NOT ready without delivery evidence — a clean exit is not a carried round', () => {
    // `ready` rested on outcome.ok && parsed.ok alone (escalation round): the
    // exit code says nothing about whether the material reached the reviewer.
    // A present shortfall refuses, and a caller that never asked refuses too.
    const run = okRun()
    expect(decideReview({ ...run, shortfall: undefined }).ready).toBe(false)
    expect(decideReview({ ...run, shortfall: { reason: 'unverified' } }).ready).toBe(false)
    // The verdict itself is still reported — the findings are worth having.
    expect(decideReview({ ...run, shortfall: { reason: 'unverified' } }).verdict).toBe('merge')
  })

  it.each([
    ['an unreachable host', { exitCode: 1, stderr: 'error sending request for url' }, OUTCOME.UNREACHABLE],
    ['an expired login', { exitCode: 1, stderr: 'not logged in' }, OUTCOME.LOGIN_EXPIRED],
    ['an exhausted allowance', { exitCode: 1, stderr: 'usage limit reached' }, OUTCOME.ALLOWANCE_EXHAUSTED],
    ['any error exit', { exitCode: 9, stderr: 'panicked at src/main.rs' }, OUTCOME.ERROR_EXIT],
  ])('%s hands the review to Fable and records NO verdict', (_name, run, kind) => {
    const d = decideReview({ outcome: classifyOutcome(run), parsed: { ok: false } })
    expect(d).toMatchObject({ model: FALLBACK_MODEL_NAME, fellBack: true, ready: false, verdict: '', evidence: '', kind })
    expect(d.cause).toBeTruthy()
  })

  it('a run that exits 0 but says nothing usable is also a fallback — not a green review', () => {
    const d = decideReview(okRun('I had a look and it seems fine.'))
    expect(d).toMatchObject({ model: FALLBACK_MODEL_NAME, fellBack: true, ready: false, kind: OUTCOME.NO_VERDICT })
  })

  it('does not hand a Fable-authored commit to Fable — that is the self-review both gates refuse', () => {
    const failed = { outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: { ok: false } }
    expect(decideReview({ ...failed, authorModel: 'Claude Fable 5 <noreply@anthropic.com>' }).model).toBe(
      SECOND_FALLBACK_MODEL_NAME,
    )
    expect(decideReview({ ...failed, authorModel: 'Claude Opus 5 <noreply@anthropic.com>' }).model).toBe(
      FALLBACK_MODEL_NAME,
    )
    expect(fallbackReviewerFor('')).toBe(FALLBACK_MODEL_NAME)
  })

  it('looks at EVERY author in the reviewed range, and picks one that wrote none of it', () => {
    // One record clears every commit it contains, so the reviewer must have
    // authored NO part of the range — picking Opus 5 for an Opus+Fable range
    // (the second round's fix) is a self-review of half of it (third round).
    expect(fallbackReviewerFor(['Claude Opus 5', 'Claude Fable 5'])).toBe('Opus 4.8')
    expect(fallbackReviewerFor(['Claude Opus 5', 'Claude Opus 4.8'])).toBe(FALLBACK_MODEL_NAME)
    expect(fallbackReviewerFor(['Claude Fable 5'])).toBe(SECOND_FALLBACK_MODEL_NAME)
  })

  it('sees BOTH models when one commit names two co-authors', () => {
    // modelFromTrailers answers "who wrote this" with the first name; for "who
    // may not review this" that would hide the second (third round).
    const field = 'Claude Opus 5 <noreply@anthropic.com>;Claude Fable 5 <noreply@anthropic.com>'
    expect(modelsInTrailerField(field)).toHaveLength(2)
    expect(fallbackReviewerFor(modelsInTrailerField(field))).toBe('Opus 4.8')
    expect(modelsInTrailerField('Patrick <p@example.com>')).toEqual([])
  })

  it('names NOBODY when every model in the chain authored part of the range', () => {
    const none = fallbackReviewerFor(['Claude Opus 5', 'Claude Fable 5', 'Claude Opus 4.8'])
    expect(none).toBe('')
    const d = decideReview({
      outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }),
      parsed: { ok: false },
      authorModel: ['Claude Opus 5', 'Claude Fable 5', 'Claude Opus 4.8'],
    })
    const report = formatReviewReport({ decision: d, sha: 'a'.repeat(40), mode: 'review' })
    expect(report).toMatch(/cannot be recorded/)
    // No record command at all: there is nobody to record.
    expect(report).not.toContain('mechanism-review.mjs --record')
  })

  it('tells the operator to hand it to the model the record NAMES', () => {
    const d = decideReview({
      outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }),
      parsed: { ok: false },
      authorModel: 'Claude Fable 5',
    })
    const report = formatReviewReport({ decision: d, sha: 'a'.repeat(40), mode: 'review' })
    expect(report).toContain(SECOND_FALLBACK_MODEL_NAME)
    // An instruction naming Fable beside a command naming Opus is how a
    // self-review gets recorded.
    expect(report).not.toMatch(/Hand it to Fable/)
  })

  it.each([
    ['a timeout', { timedOut: true }],
    ['an error exit', { exitCode: 9, stderr: 'panicked at src/main.rs' }],
    ['a dead host', { exitCode: 1, stderr: 'error sending request for url' }],
  ])('prints NO record command after %s — a failed delivery offers no record in any shape', (_n, run) => {
    const d = decideReview({ outcome: classifyOutcome(run), parsed: { ok: false } })
    const report = formatReviewReport({ decision: d, sha: 'a'.repeat(40), mode: 'review' })
    expect(report).toContain('NO RECORD COMMAND IS PRINTED')
    expect(report).not.toContain('mechanism-review.mjs --record')
    expect(report).toContain(FALLBACK_MODEL_NAME)
  })

  it('still hands a NO-VERDICT run on with the placeholder template — its transfer completed', () => {
    const d = decideReview(okRun('I had a look and it seems fine.'))
    const report = formatReviewReport({ decision: d, sha: 'a'.repeat(40), mode: 'review' })
    expect(report).toContain('mechanism-review.mjs --record')
    expect(report).toMatch(/--verdict <merge\|merge-with-fixes\|do-not-merge>/)
  })

  it('never names Sol on a failed run, and never names Fable on a successful one', () => {
    expect(decideReview({ outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: parseVerdict(solSays()) }).model).toBe(
      FALLBACK_MODEL_NAME,
    )
    expect(decideReview(okRun(solSays('do-not-merge', 'the fallback path records a verdict nobody gave'))).model).toBe(
      SOL_MODEL_NAME,
    )
  })
})

describe('the record the command prints', () => {
  it('is complete and ACCEPTED by the recorder after a Sol review', () => {
    const d = decideReview(okRun())
    const cmd = formatRecordCommand({ sha: 'a'.repeat(40), ...d, mode: 'review', point: 624 })
    expect(cmd).toContain('--model "GPT-5.6 Sol"')
    expect(cmd).toContain('--verdict merge')
    expect(cmd).toContain('--point 624')
    expect(
      validateRecord({
        sha: 'a'.repeat(40),
        model: d.model,
        verdict: d.verdict,
        evidence: d.evidence,
        authoredBy: 'Claude Opus 5 <noreply@anthropic.com>',
        mode: 'review',
      }),
    ).toMatchObject({ ok: true })
  })

  it('is REFUSED by the recorder after a fallback — a review nobody ran cannot be recorded', () => {
    const d = decideReview({ outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: { ok: false } })
    const cmd = formatRecordCommand({ sha: 'b'.repeat(40), ...d, mode: 'review' })
    expect(cmd).toContain(`--model "${FALLBACK_MODEL_NAME}"`)
    expect(cmd).toContain(`<${VERDICTS.join('|')}>`)
    expect(
      validateRecord({ sha: 'b'.repeat(40), model: d.model, verdict: '', evidence: '', mode: 'review' }).ok,
    ).toBe(false)
    // …and it stays refused if somebody fills in a verdict but leaves the
    // evidence placeholder standing: a long placeholder must not pass for a line.
    const placeholder = /--evidence "([^"]+)"/.exec(cmd)[1]
    expect(
      validateRecord({ sha: 'b'.repeat(40), model: d.model, verdict: 'merge', evidence: placeholder, mode: 'review' }).ok,
    ).toBe(false)
  })

  it('is NOT printed at all when the review saw less than the record would clear', () => {
    const d = decideReview(okRun())
    const report = formatReviewReport({
      decision: d,
      sha: 'a'.repeat(40),
      mode: 'review',
      partial: { reviewedBase: 'b'.repeat(40), coverageBase: 'c'.repeat(40) },
    })
    expect(report).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(report).not.toContain('mechanism-review.mjs --record')
    // The verdict itself is still reported — the review happened, it just does
    // not cover what a record at this sha would clear.
    expect(report).toContain('merge')
  })

  it('never prints a record command while the decision is not READY, whatever the defaults', () => {
    // Round 4, pass 3: decideReview correctly answers ready:false for a round
    // whose delivery accounting it was never shown — and the report printed the
    // record command anyway, because its own shortfall parameter defaulted to
    // null, the accounting's word for "provably complete". The report now rests
    // on the decision, so a caller that never asked the accounting gets the
    // unverified refusal, not a command.
    const decision = decideReview({
      outcome: classifyOutcome({ exitCode: 0, stdout: solSays() }),
      parsed: parseVerdict(solSays()),
      // no shortfall handed over at all — the accounting was never consulted
    })
    expect(decision.fellBack).toBe(false)
    expect(decision.ready).toBe(false)
    const report = formatReviewReport({ decision, sha: 'a'.repeat(40) })
    expect(report).not.toContain('mechanism-review.mjs --record')
    expect(report).toContain('NO RECORD COMMAND IS PRINTED')
    expect(report).toContain('never asked the material accounting')
  })

  it('refuses the same way when ready is false although a null shortfall reached the report', () => {
    // The two inputs contradicting each other must resolve toward the refusal:
    // ready is the decision's word, and null alone must not outvote it.
    const decision = {
      model: SOL_MODEL_NAME,
      fellBack: false,
      ready: false,
      verdict: 'merge',
      evidence: 'read the diff end to end',
    }
    const report = formatReviewReport({ decision, sha: 'b'.repeat(40), shortfall: null })
    expect(report).not.toContain('--record')
    expect(report).toContain('NO RECORD COMMAND IS PRINTED')
  })

  it('is NOT printed at all when the round did not carry the material (point 714)', () => {
    const report = formatReviewReport({
      decision: decideReview(okRun()),
      sha: 'a'.repeat(40),
      mode: 'review',
      shortfall: {
        reason: 'over-budget',
        truncated: ['scripts/context-fence-guard.mjs'],
        omitted: ['scripts/context-fence-core.test.mjs'],
        budget: 200_000,
        size: 200_000,
        rawSize: 900_000,
      },
    })
    expect(report).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(report).not.toContain('mechanism-review.mjs --record')
    // Every file the reviewer never saw is NAMED — the whole failure was that
    // this list existed only inside the material.
    expect(report).toContain('scripts/context-fence-guard.mjs')
    expect(report).toContain('scripts/context-fence-core.test.mjs')
    // …and the reviewer's answer is still reported: the findings are worth having.
    expect(report).toContain('merge')
  })

  // TWO REASONS ARE NOT ONE (cross-vendor review, second round): the narrowed
  // range returned before the short-fall, so a round that ALSO overflowed named
  // none of the files nobody read.
  it('names the lost files even when the range was narrowed as well', () => {
    const report = formatReviewReport({
      decision: decideReview(okRun()),
      sha: 'a'.repeat(40),
      mode: 'review',
      partial: { reviewedBase: 'b'.repeat(40), coverageBase: 'c'.repeat(40) },
      shortfall: {
        reason: 'over-budget',
        truncated: ['scripts/lost.mjs'],
        omitted: [],
        budget: 200_000,
        size: 200_000,
        rawSize: 900_000,
      },
    })
    expect(report).toContain('scripts/lost.mjs')
    expect(report).not.toContain('mechanism-review.mjs --record')
  })

  // The hand-over paths print the record command without spending a round, so a
  // short-fall there must still say WHOSE review it is waiting for.
  it('keeps naming the reviewer when a hand-over is refused a record', () => {
    const swap = formatReviewReport({
      decision: decideReview({ outcome: { ok: false, kind: 'self-review', cause: 'Sol authored it' }, parsed: {}, authorModel: ['GPT-5.6 Sol'] }),
      sha: 'a'.repeat(40),
      mode: 'review',
      shortfall: { reason: 'needs-passes', passes: [{ index: 1, files: ['x.mjs'] }], budget: 10, rawSize: 99, truncated: [], omitted: [] },
    })
    expect(swap).toContain('ROLE SWAP')
    expect(swap).toContain('Opus 5')
    expect(swap).toContain('does not fit ONE review round')
    expect(swap).not.toContain('mechanism-review.mjs --record')

    const down = formatReviewReport({
      decision: decideReview({ outcome: { ok: false, kind: 'unreachable', cause: 'the host could not be reached' }, parsed: {} }),
      sha: 'a'.repeat(40),
      mode: 'review',
      shortfall: { reason: 'unplanned', detail: 'never measured', truncated: [], omitted: [], budget: 1, size: 0, rawSize: 0 },
    })
    expect(down).toContain(FALLBACK_MODEL_NAME)
    expect(down).toContain('unknown fit refuses')
  })

  it('carries the pass a verdict covers, so a composition can be recorded', () => {
    const report = formatReviewReport({
      decision: decideReview(okRun()),
      sha: 'a'.repeat(40),
      mode: 'review',
      pass: { index: 1, total: 3, files: ['scripts/a.mjs', 'scripts/b.mjs'] },
    })
    expect(report).toContain('--pass 1/3')
    expect(report).toContain('--pass-files "scripts/a.mjs,scripts/b.mjs"')
    expect(report).toContain('PASS 1/3')
    expect(report).toMatch(/NOT cleared until every pass is recorded/)
  })

  it('stops promising a next pass once the last one is reviewed', () => {
    const report = formatReviewReport({
      decision: decideReview(okRun()),
      sha: 'a'.repeat(40),
      mode: 'review',
      pass: { index: 3, total: 3, files: ['scripts/c.mjs'] },
    })
    expect(report).toContain('--pass 3/3')
    expect(report).not.toMatch(/NOT cleared until every pass is recorded/)
  })

  it('decides coverage strictly: only an EQUAL base is full coverage', () => {
    // The deciding line itself, not just the report it feeds: reverting it must
    // redden a test (four-eyes finding, fifth round).
    const b = 'b'.repeat(40)
    expect(coverageDecision({ reviewedBase: b, coverageBase: b })).toBeNull()
    expect(coverageDecision({ reviewedBase: b, coverageBase: 'c'.repeat(40) })).toMatchObject({ reviewedBase: b })
    // An unanswerable merge-base is NOT an answer of "everything".
    expect(coverageDecision({ reviewedBase: b, coverageBase: '' })).toMatchObject({
      coverageBase: 'an unknown commit',
    })
    expect(coverageDecision({ reviewedBase: '', coverageBase: '' })).not.toBeNull()
  })

  it('is not printed either when the coverage could not be determined at all', () => {
    // An unanswerable merge-base is not an answer of "full coverage": that
    // fail-open printed a record for a range nobody had bounded (fourth round).
    const report = formatReviewReport({
      decision: decideReview(okRun()),
      sha: 'a'.repeat(40),
      mode: 'review',
      partial: { reviewedBase: 'b'.repeat(40), coverageBase: 'an unknown commit' },
    })
    expect(report).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(report).toContain('an unknown commit')
  })

  it('the report names the cause in one loud line on a fallback', () => {
    const d = decideReview({ outcome: classifyOutcome({ exitCode: 1, stderr: 'usage limit' }), parsed: { ok: false } })
    const report = formatReviewReport({ decision: d, sha: 'c'.repeat(40), mode: 'review' })
    expect(report.split('\n')[0]).toMatch(/FALLBACK/)
    expect(report).toMatch(/allowance/i)
    expect(report).toMatch(/NOT done/)
  })

  it('quotes an evidence line containing a double quote instead of breaking the command line', () => {
    const cmd = formatRecordCommand({
      sha: 'd'.repeat(40),
      model: SOL_MODEL_NAME,
      verdict: 'merge',
      evidence: 'the "no-verdict" branch is covered',
      mode: 'review',
    })
    expect(cmd).toContain('\\"no-verdict\\"')
  })
})

describe('the recorder accepts the reviewer the rule now prefers (point 624)', () => {
  it('takes "GPT-5.6 Sol" as a review model', () => {
    expect(
      validateRecord({
        sha: 'e'.repeat(40),
        model: SOL_MODEL_NAME,
        verdict: 'merge',
        evidence: 'read the diff and both tests; the fallback path is the one that matters',
        authoredBy: 'Claude Opus 5 <noreply@anthropic.com>',
        mode: 'review',
      }),
    ).toMatchObject({ ok: true })
  })

  it('does not read Sol as a self-review of Claude-authored work', () => {
    for (const author of ['Claude Opus 5 <noreply@anthropic.com>', 'Claude Fable 5', 'Claude Opus 4.8']) {
      const check = validateRecord({
        sha: 'f'.repeat(40),
        model: SOL_MODEL_NAME,
        verdict: 'merge',
        evidence: 'a cross-vendor reviewer is never the same eyes as the author',
        authoredBy: author,
        mode: 'review',
      })
      expect(check.ok).toBe(true)
    }
  })
})

describe('the material the reviewer is handed', () => {
  const material = (files, budget) =>
    formatReviewMaterial({ stat: ' a | 2 +-', patch: 'diff --git a/a b/a', files, budget })

  it('carries the diffstat, the patch and each file with its path', () => {
    const out = material([{ path: 'scripts/a.mjs', text: 'export const a = 1' }])
    expect(out).toContain('=== DIFFSTAT ===')
    expect(out).toContain('diff --git a/a b/a')
    expect(out).toContain('=== FILE (current content): scripts/a.mjs ===')
    expect(out).toContain('export const a = 1')
  })

  it('CUTS VISIBLY rather than quietly, so a review never reports on half a file', () => {
    const out = material([{ path: 'big.md', text: 'x'.repeat(5000) }], 1500)
    expect(out).toMatch(/TRUNCATED: \d+ characters not shown/)
    expect(out.length).toBeLessThan(3000)
  })

  it('names a file it had no budget left for instead of dropping it silently', () => {
    const out = material([{ path: 'first.md', text: 'y'.repeat(4000) }, { path: 'second.md', text: 'z' }], 1200)
    expect(out).toContain('=== FILE OMITTED ENTIRELY (material budget spent): second.md ===')
  })

  it('is fine with a commit that only deleted files', () => {
    expect(material([])).toContain('=== PATCH ===')
  })

  it('CAPS THE PATCH TOO, so a large diff cannot eat every file', () => {
    // Measured on this branch: an uncapped patch spent the whole budget and the
    // reviewer saw none of the six scripts it was asked to judge.
    const out = formatReviewMaterial({
      stat: 's',
      patch: 'p'.repeat(50_000),
      files: [{ path: 'a.mjs', text: 'the file the review is actually about' }],
      budget: 4000,
    })
    expect(out.length).toBeLessThan(4500)
    expect(out).toMatch(/TRUNCATED/)
    expect(out).toContain('the file the review is actually about')
  })
})

describe('a file the patch already carries whole', () => {
  it('is not sent a second time', () => {
    const patch = [
      'diff --git a/scripts/new.mjs b/scripts/new.mjs',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/scripts/new.mjs',
      '+export const a = 1',
      'diff --git a/scripts/old.mjs b/scripts/old.mjs',
      'index 2222222..3333333 100644',
    ].join('\n')
    const added = newFilePathsIn(patch)
    expect(added.has('scripts/new.mjs')).toBe(true)
    expect(added.has('scripts/old.mjs')).toBe(false)
  })

  it('finds nothing in a patch that adds nothing', () => {
    expect(newFilePathsIn('diff --git a/a b/a\nindex 1..2 100644').size).toBe(0)
    expect(newFilePathsIn('').size).toBe(0)
  })

  it('is sent after all once the patch no longer fits, or it would be in neither half', () => {
    expect(addedFilesAreCoveredByPatch(100, 1000, 0.5)).toBe(true)
    expect(addedFilesAreCoveredByPatch(900, 1000, 0.5)).toBe(false)
  })
})

describe('the model-id probe receipt', () => {
  it('warns when the id has never been proven honoured here', () => {
    expect(probeFreshness(null)).toMatchObject({ fresh: false })
    expect(probeFreshness({ at: Date.now() })).toMatchObject({ fresh: false })
    expect(probeFreshness(null).warning).toMatch(/--probe/)
  })

  it('accepts a recent PASS and expires an old one', () => {
    const now = Date.parse('2026-08-10T12:00:00Z')
    expect(probeFreshness({ at: now - 86_400_000, refused: true }, now)).toMatchObject({ fresh: true })
    expect(probeFreshness({ at: now - 60 * 86_400_000, refused: true }, now)).toMatchObject({ fresh: false })
  })

  it('expires the moment the codex it was taken with changes, whatever its age', () => {
    // The receipt survives container rebuilds, so a proof taken with another
    // binary, version or account says nothing about the run being attributed
    // now (fifth cross-vendor round).
    const now = Date.parse('2026-08-10T12:00:00Z')
    const fresh = { at: now - 60_000, refused: true, fingerprint: 'abc123' }
    expect(probeFreshness(fresh, now, PROBE_MAX_AGE_MS, 'abc123')).toMatchObject({ fresh: true })
    expect(probeFreshness(fresh, now, PROBE_MAX_AGE_MS, 'deadbeef')).toMatchObject({ fresh: false })
    // A receipt from before fingerprinting cannot be tied to this codex either.
    expect(probeFreshness({ at: now - 60_000, refused: true }, now, PROBE_MAX_AGE_MS, 'abc123')).toMatchObject({
      fresh: false,
    })
  })
})

describe('the saved login survives what it has to survive', () => {
  it('is kept in the MAIN checkout, not in a worktree that gets deleted', () => {
    expect(savedAuthPathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/agent-1')).toBe(
      '/workspace/hoa/local/codex-auth.json',
    )
  })

  it('falls back to the current checkout when git answers nothing', () => {
    expect(savedAuthPathFrom('', '/repo')).toBe('/repo/local/codex-auth.json')
    expect(savedAuthPathFrom('   \n', '/repo')).toBe('/repo/local/codex-auth.json')
  })

  it('handles a windows path and a trailing separator', () => {
    expect(savedAuthPathFrom('C:\\src\\hoa\\.git\\', 'C:\\src\\hoa\\wt', { sep: '\\' })).toBe(
      'C:\\src\\hoa\\local\\codex-auth.json',
    )
  })
})

describe('the codex command line is the rule, not a preference of the caller', () => {
  it('pins the model id, the reasoning effort and a read-only sandbox', () => {
    const args = codexArgs({ cwd: '/repo', outputFile: '/tmp/out.txt', prompt: 'judge this' })
    expect(args.slice(0, 2)).toEqual(['exec', '--skip-git-repo-check'])
    expect(args).toContain('--sandbox')
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only')
    expect(args[args.indexOf('-m') + 1]).toBe(SOL_MODEL_ID)
    expect(args).toContain(`model_reasoning_effort=${SOL_REASONING_EFFORT}`)
    expect(args[args.indexOf('-C') + 1]).toBe('/repo')
    expect(args.at(-1)).toBe('judge this')
  })

  it('the prompt puts the artefact before any rationale, and fixes the answer shape', () => {
    const prompt = buildReviewPrompt({ sha: '1234567', brief: 'does the fallback ever invent a verdict?' })
    expect(prompt).toContain('COMMIT UNDER REVIEW: 1234567')
    // The material is named, and demanded READ FIRST, before the question — the
    // transport appends it after the prompt, so the ordering has to be said.
    expect(prompt.indexOf('MATERIAL IS ATTACHED')).toBeLessThan(prompt.indexOf('WHAT TO JUDGE'))
    expect(prompt).toMatch(/READ IT IN FULL FIRST/)
    expect(prompt).toMatch(/no rationale from the author is included/)
    expect(prompt).toContain(`VERDICT: <${VERDICTS.join('|')}>`)
    expect(prompt).toMatch(/CONVERGENT review/)
    expect(buildReviewPrompt({ sha: 'abc', brief: 'x', mode: 'blind-parallel' })).toMatch(/DIVERGENT step/)
  })

  it('asks a DIVERGENT run for the countable entry shape, and a review for none', () => {
    // The two lists are merged by a third model and counted entry by entry
    // (point 634), which an unnumbered prose list cannot survive.
    const divergent = buildReviewPrompt({ sha: 'abc', brief: 'x', mode: 'blind-parallel' })
    expect(divergent).toMatch(/ONE ENTRY PER LINE/)
    expect(divergent).toMatch(/B<n> \| <file> \| <the defect in/)
    expect(divergent).toMatch(/cannot be counted/)
    expect(buildReviewPrompt({ sha: 'abc', brief: 'x' })).not.toMatch(/ONE ENTRY PER LINE/)
  })

  it('tells a PASS reviewer the manifest governs absence, and a whole-range one nothing of it', () => {
    // The structural finding of the fourth cross-vendor round: every pass
    // verdict degraded into a coverage refusal because nothing told the
    // reviewer which absences were design. The prompt now says it, and the
    // material's own manifest says it again where the files are listed.
    const prompt = buildReviewPrompt({ sha: 'abc', brief: 'x', pass: { index: 2, total: 3 } })
    expect(prompt).toContain('THIS IS PASS 2 OF 3')
    expect(prompt).toMatch(/OPENS WITH A\nMANIFEST/)
    expect(prompt).toMatch(/absent is NOT truncated/)
    expect(prompt).toMatch(/covers exactly the files this pass carries/)
    expect(buildReviewPrompt({ sha: 'abc', brief: 'x' })).not.toContain('THIS IS PASS')
  })
})

// POINT 667: the REVERSED direction. Sol authors too now, and the failure this
// mechanism exists to prevent has a mirror image: a review recorded as Sol's
// over a range Sol WROTE. That reads green at both gates and is nobody's second
// pair of eyes.
describe('the reversed direction — where SOL authored', () => {
  const SOL_COMMIT = 'GPT-5.6 Sol <noreply@openai.com>'

  it('recognises Sol as an author in every spelling of its name', () => {
    for (const author of [SOL_COMMIT, 'GPT-5.6 Sol', 'Sol', 'gpt-5.6-sol', ['Claude Opus 5', SOL_COMMIT]]) {
      expect(solAuthored(author), String(author)).toBe(true)
    }
    for (const author of ['', 'Claude Opus 5 <x@y>', ['Claude Opus 5', 'Claude Fable 5'], 'Patrick <p@x>']) {
      expect(solAuthored(author), String(author)).toBe(false)
    }
  })

  it('hands a Sol-authored range to Opus 5 — the model that also lands it', () => {
    expect(CLAUDE_REVIEW_CHAIN[0]).toBe('Opus 5')
    expect(claudeReviewerFor(SOL_COMMIT)).toBe('Opus 5')
    // …and skips a Claude model that authored part of the range.
    expect(claudeReviewerFor([SOL_COMMIT, 'Claude Opus 5 <x@y>'])).toBe('Fable 5')
    expect(claudeReviewerFor([SOL_COMMIT, 'Claude Opus 5 <x@y>', 'Claude Fable 5 <x@y>'])).toBe('Opus 4.8')
    // Every candidate authored part of it: no reviewer, said plainly.
    expect(claudeReviewerFor([SOL_COMMIT, 'Claude Opus 5', 'Claude Fable 5', 'Claude Opus 4.8'])).toBe('')
  })

  it('refuses to record a SUCCESSFUL Sol run over a range Sol authored', () => {
    // The dangerous case: the run worked and came back with a clean verdict.
    // Recording it would be a self-review that reads green at both gates.
    const d = decideReview({ ...okRun(), authorModel: [SOL_COMMIT] })
    expect(d.kind).toBe(OUTCOME.SELF_REVIEW)
    expect(d.ready).toBe(false)
    expect(d.verdict).toBe('')
    expect(d.ranBy).toBe('')
    expect(d.model).toBe('Opus 5')
    expect(d.cause).toMatch(/AUTHORED/)
  })

  it('leaves the ordinary direction exactly as it was', () => {
    const d = decideReview({ ...okRun(), authorModel: ['Claude Opus 5 <x@y>'] })
    expect(d).toMatchObject({ model: SOL_MODEL_NAME, ranBy: SOL_MODEL_NAME, verdict: 'merge', ready: true })
    // Sol unavailable over Claude-authored work still falls back to Fable.
    expect(fallbackReviewerFor('Claude Opus 5 <x@y>')).toBe(FALLBACK_MODEL_NAME)
    expect(fallbackReviewerFor('Claude Fable 5 <x@y>')).toBe(SECOND_FALLBACK_MODEL_NAME)
  })

  it('reports a role swap as a role swap, not as a failure, and invents no verdict', () => {
    const d = decideReview({ ...okRun(), authorModel: [SOL_COMMIT] })
    const text = formatReviewReport({ decision: d, sha: 'abcdef1234567', mode: 'review', point: '667' })
    expect(text).toMatch(/ROLE SWAP/)
    expect(text).not.toMatch(/FALLBACK/)
    expect(text).toMatch(/AUTHORED part of abcdef1/)
    expect(text).toMatch(/runs the suites, judges the picture and lands/)
    // The printed record command carries the PLACEHOLDER, so a hand that pastes
    // it without having the review done gets a refusal from the recorder.
    expect(text).toContain('--model "Opus 5"')
    expect(text).toContain(`--verdict <${VERDICTS.join('|')}>`)
    expect(validateRecord({
      sha: 'abcdef1234567',
      model: 'Opus 5',
      verdict: '<merge|merge-with-fixes|do-not-merge>',
      evidence: '<what the review actually checked>',
      authoredBy: SOL_COMMIT,
      mode: 'review',
    }).ok).toBe(false)
  })

  it('says so when the whole chain authored the range', () => {
    const d = decideReview({
      ...okRun(),
      authorModel: [SOL_COMMIT, 'Claude Opus 5', 'Claude Fable 5', 'Claude Opus 4.8'],
    })
    const text = formatReviewReport({ decision: d, sha: 'abcdef1234567' })
    expect(d.model).toBe('')
    expect(text).toMatch(/cannot be recorded/)
    expect(text).not.toMatch(/--record/)
  })
})
