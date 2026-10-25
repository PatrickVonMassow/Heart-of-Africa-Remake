// Pins the cross-vendor review decision (work-order point 624).
//
// The cases are chosen around the one failure this mechanism exists to prevent:
// a review nobody ran being recorded as done. So every failure kind gets its own
// case, and the recorded model is asserted to follow the RUN rather than the
// preference in both directions.
import { describe, expect, it } from 'vitest'
import { reviewIdentityProblem, validateRecord, VERDICTS } from './mechanism-review-core.mjs'
import { modelTrailerIdentities } from './model-guard-core.mjs'
import {
  addedFilesAreCoveredByPatch,
  buildReviewPrompt,
  classifyOutcome,
  codexArgs,
  coverageDecision,
  decideReview,
  automaticReviewer,
  fallbackReviewerFor,
  formatRecordCommand,
  formatReviewerCommand,
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
  authoredByLane,
  REVIEW_CHAINS,
  reviewChain,
  reviewerDescriptor,
  reviewerForRole,
  unresolvedAuthors,
} from './cross-review-core.mjs'
import { readState, writeState } from './lane-switch-core.mjs'
import { CROSS, EXECUTION_ROLES, LANES, LEGACY, MAIN, SCARCE, VENDORS, executionTarget, lane, trailerFor } from './model-lanes.mjs'

const SCARCE_OFF = readState(JSON.stringify(writeState('off', { why: 'test', by: 'test', now: 1 })))

// Every name below is read from the lane registry (scripts/model-lanes.mjs).
const CROSS_NAME = CROSS.displayName
const MAIN_NAME = MAIN.displayName
const SCARCE_NAME = SCARCE.displayName
const FALLBACK_NAME = MAIN.fallback.displayName
/** The cross lane's retired DISPLAY spellings (not its ids), oldest last. */
const RETIRED_CROSS = CROSS.retired.filter((name) => /\s/.test(name))
/** The three names the cross lane has carried — one lane, whichever is used. */
const CROSS_NAMES = [CROSS_NAME, ...RETIRED_CROSS]
const crossAddress = VENDORS[CROSS.vendor].trailerAddress
const MAIN_TRAILER = trailerFor('main')
const SCARCE_TRAILER_NAME = SCARCE.trailerName
const FALLBACK_TRAILER_NAME = MAIN.fallback.trailerName
/** How the trailer reader spells a model name back (hyphens become spaces). */
const guardSpelling = (name) => name.replace(/-/g, ' ')

const astraSays = (verdict = 'merge', evidence = 'read the diff and the guard test; the fail-open path is covered') =>
  `I checked the change.\n\nVERDICT: ${verdict}\nEVIDENCE: ${evidence}\n`

// `shortfall: null` is the material accounting's explicit "the round provably
// carried everything" — the only value that lets a decision become ready.
const okRun = (text = astraSays()) => ({
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
    // (cross-vendor review of the first version of this fix).
    expect(
      classifyOutcome({
        exitCode: 1,
        stderr: 'attempt 1: 429 Too Many Requests\nReconnecting... 3/5\nstream disconnected before completion',
      }),
    ).toMatchObject({ kind: OUTCOME.ALLOWANCE_EXHAUSTED })
    // But a NAKED status code is not the server refusing. Codex reconnects through
    // 403s and prints `last status: 429` as the last thing it saw, on accounts with
    // allowance to spare — that run died in transport, and calling it a spent account
    // is the original mistake one round further along (cross-vendor review, second round).
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
    expect(classifyOutcome({ exitCode: 0, stderr: noise, stdout: astraSays() }).ok).toBe(true)
  })
})

describe('parseVerdict — only a real verdict is a verdict', () => {
  it('reads the verdict and its evidence', () => {
    expect(parseVerdict(astraSays('merge-with-fixes', 'two findings, both in the parser'))).toMatchObject({
      ok: true,
      verdict: 'merge-with-fixes',
      evidence: 'two findings, both in the parser',
    })
  })

  it('quotes the EVIDENCE from the raw line byte-for-byte — the strip must not rewrite it', () => {
    // This string reaches the ledger via --record; a stripped copy rewrote
    // src/__init__.py into src/init.py.
    const evidence = 'checked src/__init__.py and the __slots__ handling end to end'
    expect(parseVerdict(`prose\n\nVERDICT: merge\nEVIDENCE: ${evidence}`)).toMatchObject({
      ok: true,
      evidence,
    })
  })

  it('rules the placeholder on the STRIPPED capture — decoration cannot smuggle it', () => {
    const parsed = parseVerdict('prose\n\nVERDICT: merge\nEVIDENCE: **<one line naming what you actually checked>**')
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('no usable EVIDENCE line')
  })

  it('survives markdown emphasis and a leading bullet', () => {
    expect(parseVerdict('- **VERDICT:** `do-not-merge`\n- **EVIDENCE:** the fallback records a verdict nobody gave')).toMatchObject(
      { ok: true, verdict: 'do-not-merge' },
    )
  })

  it('never fabricates a label from a mid-word backtick (landing-round pass 7)', () => {
    // Deleting backtick runs outright merged word fragments: VERD`ICT: read
    // as VERDICT: and a fabricated pair was accepted as the terminal fields.
    expect(parseVerdict('VERD`ICT: merge\nEVID`ENCE: read the whole diff and the tests').ok).toBe(false)
    const receipted = 'looked.\n\nREC`EIPT: abcd1234abcd1234\nVERDICT: merge\nEVIDENCE: read the whole diff and the tests'
    expect(parseVerdict(receipted, { receipt: 'abcd1234abcd1234' }).ok).toBe(false)
    // …while PAIRED backtick decoration around a label still unwraps.
    expect(parseVerdict('`VERDICT:` merge\n`EVIDENCE:` read the whole diff and the tests')).toMatchObject({
      ok: true,
      verdict: 'merge',
    })
  })

  it('drops a bare code-fence line rather than letting it displace the terminal pair', () => {
    expect(parseVerdict('VERDICT: merge\nEVIDENCE: read the whole diff and the tests\n```')).toMatchObject({
      ok: true,
      verdict: 'merge',
    })
  })

  it('takes the LAST pair, so a quoted instruction cannot shadow the answer', () => {
    const text = `End with:\nVERDICT: <merge|do-not-merge>\n\n…\n\n${astraSays('merge', 'checked every branch of the classifier')}`
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
    // An UNPAIRED marker survives the pair strip and shielded the anchored
    // placeholder test (landing round): ruled on the net-only spelling too.
    expect(parseVerdict('VERDICT: merge\nEVIDENCE: _<one line naming what you checked>')).toMatchObject({ ok: false })
    // A leading bullet shields nothing either (fourth landing round).
    expect(parseVerdict('VERDICT: merge\nEVIDENCE: - <one line naming what you checked>')).toMatchObject({ ok: false })
  })

  it('refuses a reviewer that says it could not see the change, whatever verdict it gave', () => {
    // The very first real run answered do-not-merge because none of its commands
    // reached the repository — a valid verdict word for a review that never
    // happened (four-eyes finding, 10.08.2026).
    for (const evidence of [
      'I could not read the diff, so no line-level review actually ran',
      'None of my commands reached the repository, so nothing was verified',
      'We were unable to access the files under review',
      // No second inspection verb after the receive verb (landing-round pass
      // 2): what was never received was never reviewed.
      'I did not receive the patch',
      'We never got the material for this range',
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
    // Measured 18.08.2026 (point 714, pass 2): the cross lane reviewed the review tooling
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

  // FINDING 8 (fourth cross-vendor round, pass 4): `sentInput` proves only the
  // hand-off to the spawn — a child can exit 0 with a parseable verdict without
  // ever reading its stdin. The token stands only on the material's LAST line,
  // never in the prompt, so echoing it back is evidence of the read.
  it('demands the material RECEIPT back where one was issued', () => {
    const good = `looked closely.\n\nRECEIPT: abcd1234abcd1234\nVERDICT: merge\nEVIDENCE: read the whole diff and its tests`
    expect(parseVerdict(good, { receipt: 'abcd1234abcd1234' })).toMatchObject({ ok: true, verdict: 'merge' })
    const missing = parseVerdict(astraSays(), { receipt: 'abcd1234abcd1234' })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain('no RECEIPT')
    const wrong = parseVerdict(good, { receipt: 'ffff0000ffff0000' })
    expect(wrong.ok).toBe(false)
    expect(wrong.error).toContain('does not match')
    // …and a message shaped for a receipt but asked without one still parses
    // as before: the last two lines are the pair.
    expect(parseVerdict(astraSays())).toMatchObject({ ok: true, verdict: 'merge' })
  })

  it('requires the pair to be the LAST two lines, not two matches from anywhere', () => {
    const spliced = 'VERDICT: merge\n\nSome later paragraph.\n\nEVIDENCE: read the whole diff and the tests'
    expect(parseVerdict(spliced)).toMatchObject({ ok: false })
    expect(parseVerdict(`intro\n${astraSays('merge', 'read the whole diff and the tests')}`)).toMatchObject({ ok: true })
  })
})

describe('decideReview — the recorded model follows the RUN, never the preference', () => {
  it('maps every model either review chain can name to this runnable command', () => {
    expect(EXECUTION_ROLES.map((role) => reviewerForRole(role).name)).toEqual([MAIN_NAME, CROSS_NAME, SCARCE_NAME, FALLBACK_NAME])
    for (const model of [...reviewChain('crossUnavailable'), ...reviewChain('crossAuthored')]) {
      const reviewer = reviewerDescriptor(model)
      expect(reviewer, model).toMatchObject({ name: model, runtime: 'claude' })
      expect(formatReviewerCommand({ model, sha: 'a'.repeat(40), brief: 'read both end-state files' })).toContain(
        `--reviewer ${reviewer.key}`,
      )
    }
  })

  it('turns the real mixed-author ineligibility into a runnable scarce-lane command', () => {
    const decision = decideReview({
      ...okRun(),
      authorModel: [RETIRED_CROSS.at(-1), MAIN.trailerName],
    })
    expect(decision).toMatchObject({ model: SCARCE_NAME, kind: OUTCOME.SELF_REVIEW, ready: false })
    expect(formatReviewerCommand({
      model: decision.model,
      sha: '16793dd'.padEnd(40, '0'),
      brief: 'read the guide and brevity core at their end state',
      point: 977,
    })).toMatch(/^node scripts\/cross-review\.mjs --reviewer scarce /)
  })

  it('a reachable cross lane reviews, and is recorded as the reviewer', () => {
    const d = decideReview(okRun())
    expect(d).toMatchObject({ model: CROSS_NAME, fellBack: false, ready: true, verdict: 'merge' })
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
  ])('%s hands the review to the scarce lane and records NO verdict', (_name, run, kind) => {
    const d = decideReview({ outcome: classifyOutcome(run), parsed: { ok: false } })
    expect(d).toMatchObject({ model: SCARCE_NAME, fellBack: true, ready: false, verdict: '', evidence: '', kind })
    expect(d.cause).toBeTruthy()
  })

  it('a run that exits 0 but says nothing usable is also a fallback — not a green review', () => {
    const d = decideReview(okRun('I had a look and it seems fine.'))
    expect(d).toMatchObject({ model: SCARCE_NAME, fellBack: true, ready: false, kind: OUTCOME.NO_VERDICT })
  })

  it('does not hand a scarce-authored commit to the scarce lane — that is the self-review both gates refuse', () => {
    const failed = { outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: { ok: false } }
    expect(decideReview({ ...failed, authorModel: trailerFor('scarce') }).model).toBe(
      MAIN_NAME,
    )
    expect(decideReview({ ...failed, authorModel: MAIN_TRAILER }).model).toBe(
      SCARCE_NAME,
    )
    expect(fallbackReviewerFor('')).toBe(SCARCE_NAME)
  })

  it('removes the scarce lane from both review directions while its switch refuses it', () => {
    const failed = { outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: { ok: false } }
    expect(decideReview({ ...failed, scarceState: SCARCE_OFF }).model).toBe(MAIN_NAME)
    expect(fallbackReviewerFor('', SCARCE_OFF)).toBe(MAIN_NAME)
    expect(decideReview({ authorModel: [RETIRED_CROSS.at(-1), MAIN_NAME], scarceState: SCARCE_OFF }).model).toBe(FALLBACK_NAME)
    expect(decideReview({ ...failed, authorModel: [MAIN_NAME, FALLBACK_NAME], scarceState: SCARCE_OFF })).toMatchObject({
      model: '',
      chain: [MAIN_NAME, FALLBACK_NAME],
    })
  })

  it('looks at EVERY author in the reviewed range, and picks one that wrote none of it', () => {
    // One record clears every commit it contains, so the reviewer must have
    // authored NO part of the range — picking the main chain for a main+scarce range
    // (the second round's fix) is a self-review of half of it (third round).
    expect(fallbackReviewerFor([MAIN.trailerName, SCARCE_TRAILER_NAME])).toBe(FALLBACK_NAME)
    expect(fallbackReviewerFor([MAIN.trailerName, FALLBACK_TRAILER_NAME])).toBe(SCARCE_NAME)
    expect(fallbackReviewerFor([SCARCE_TRAILER_NAME])).toBe(MAIN_NAME)
  })

  it('sees BOTH models when one commit names two co-authors', () => {
    // modelFromTrailers answers "who wrote this" with the first name; for "who
    // may not review this" that would hide the second (third round).
    const field = `${MAIN_TRAILER};${trailerFor('scarce')}`
    expect(modelsInTrailerField(field)).toHaveLength(2)
    expect(fallbackReviewerFor(modelsInTrailerField(field))).toBe(FALLBACK_NAME)
    expect(modelsInTrailerField('Patrick <p@example.com>')).toEqual([])
  })

  it('reads the reviewer separately, so reviewer credit is not authorship', () => {
    const identities = modelTrailerIdentities(
      'Separate review identity\n\n' +
        `Co-Authored-By: ${MAIN_TRAILER}\n` +
        `Reviewed-By: ${RETIRED_CROSS.at(-1)} <${crossAddress}>\n`,
    )
    expect(identities).toEqual({ authors: [MAIN_NAME], reviewers: [guardSpelling(RETIRED_CROSS.at(-1))] })
    expect(reviewIdentityProblem(identities.reviewers[0], { authorModels: identities.authors })).toBe('')
  })

  it('treats the three pre-fix reviewer credits as ambiguous co-authorship, never inferred review', () => {
    // These immutable ledger-only commits intended the cross lane as reviewer and the main chain
    // as author. Their shared Co-Authored-By key cannot prove that intent, so
    // the ledger remains their reviewer record and trailer readers correctly
    // treat both lines as authorship. New commits use Reviewed-By instead.
    for (const [sha, lines] of [
      [
        '836b187bf5c92d086c603e0fe4ba9a09a7408547',
        [`${RETIRED_CROSS.at(-1)} <${crossAddress}>`, MAIN_TRAILER],
      ],
      [
        'fd02a519a03e1680f1c6c5b182987c42b4b3424d',
        [`${RETIRED_CROSS.at(-1)} <${crossAddress}>`, MAIN_TRAILER],
      ],
      [
        '1f24975053368939872dd1182bf71860e783a7ce',
        [MAIN_TRAILER, `${RETIRED_CROSS.at(-1)} <${crossAddress}>`],
      ],
    ]) {
      const identities = modelTrailerIdentities(
        `${sha}\n\n` +
          lines.map((line) => `Co-Authored-By: ${line}`).join('\n') +
          '\n',
      )
      expect(new Set(identities.authors), sha).toEqual(new Set([MAIN_NAME, guardSpelling(RETIRED_CROSS.at(-1))]))
      expect(identities.reviewers, sha).toEqual([])
    }
  })

  it('names NOBODY when every model in the chain authored part of the range', () => {
    const none = fallbackReviewerFor([MAIN.trailerName, SCARCE_TRAILER_NAME, FALLBACK_TRAILER_NAME])
    expect(none).toBe('')
    const d = decideReview({
      outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }),
      parsed: { ok: false },
      authorModel: [MAIN.trailerName, SCARCE_TRAILER_NAME, FALLBACK_TRAILER_NAME],
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
      authorModel: SCARCE_TRAILER_NAME,
    })
    const report = formatReviewReport({ decision: d, sha: 'a'.repeat(40), mode: 'review' })
    expect(report).toContain(MAIN_NAME)
    // An instruction naming the scarce lane beside a command naming the main chain
    // is how a self-review gets recorded.
    expect(report).not.toContain(`Hand it to ${SCARCE_NAME}`)
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
    expect(report).toContain(SCARCE_NAME)
  })

  it('still hands a NO-VERDICT run on with the placeholder template — its transfer completed', () => {
    const d = decideReview(okRun('I had a look and it seems fine.'))
    const report = formatReviewReport({ decision: d, sha: 'a'.repeat(40), mode: 'review' })
    expect(report).toContain('mechanism-review.mjs --record')
    expect(report).toMatch(/--verdict <merge\|merge-with-fixes\|do-not-merge>/)
  })

  it('never names the cross lane on a failed run, and never a handover reviewer on a successful one', () => {
    expect(decideReview({ outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: parseVerdict(astraSays()) }).model).toBe(
      SCARCE_NAME,
    )
    expect(decideReview(okRun(astraSays('do-not-merge', 'the fallback path records a verdict nobody gave'))).model).toBe(
      CROSS_NAME,
    )
  })
})

describe('the record the command prints', () => {
  it('is complete and ACCEPTED by the recorder after a cross-lane review', () => {
    const d = decideReview(okRun())
    const cmd = formatRecordCommand({ sha: 'a'.repeat(40), ...d, mode: 'review', point: 624 })
    expect(cmd).toContain(`--model "${CROSS_NAME}"`)
    expect(cmd).toContain('--verdict merge')
    expect(cmd).toContain('--point 624')
    expect(
      validateRecord({
        sha: 'a'.repeat(40),
        model: d.model,
        verdict: d.verdict,
        evidence: d.evidence,
        authoredBy: MAIN_TRAILER,
        mode: 'review',
      }),
    ).toMatchObject({ ok: true })
  })

  it('is REFUSED by the recorder after a fallback — a review nobody ran cannot be recorded', () => {
    const d = decideReview({ outcome: classifyOutcome({ exitCode: 1, stderr: 'not logged in' }), parsed: { ok: false } })
    const cmd = formatRecordCommand({ sha: 'b'.repeat(40), ...d, mode: 'review' })
    expect(cmd).toContain(`--model "${SCARCE_NAME}"`)
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
      outcome: classifyOutcome({ exitCode: 0, stdout: astraSays() }),
      parsed: parseVerdict(astraSays()),
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
      model: CROSS_NAME,
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
      decision: decideReview({ outcome: { ok: false, kind: 'self-review', cause: 'the cross lane authored it' }, parsed: {}, authorModel: [RETIRED_CROSS.at(-1)] }),
      sha: 'a'.repeat(40),
      mode: 'review',
      shortfall: { reason: 'needs-passes', passes: [{ index: 1, files: ['x.mjs'] }], budget: 10, rawSize: 99, truncated: [], omitted: [] },
    })
    expect(swap).toContain('ROLE SWAP')
    expect(swap).toContain(MAIN_NAME)
    expect(swap).toContain('does not fit ONE review round')
    expect(swap).not.toContain('mechanism-review.mjs --record')

    const down = formatReviewReport({
      decision: decideReview({ outcome: { ok: false, kind: 'unreachable', cause: 'the host could not be reached' }, parsed: {} }),
      sha: 'a'.repeat(40),
      mode: 'review',
      shortfall: { reason: 'unplanned', detail: 'never measured', truncated: [], omitted: [], budget: 1, size: 0, rawSize: 0 },
    })
    expect(down).toContain(SCARCE_NAME)
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
    expect(report).toContain('clears the listed files at aaaaaaa')
  })

  it('prints a bounded one-round record as scoped end-state coverage', () => {
    const report = formatReviewReport({
      decision: decideReview(okRun()),
      sha: 'a'.repeat(40),
      mode: 'review',
      pass: { index: 1, total: 1, files: ['scripts/a.mjs'], endState: 'a'.repeat(40) },
    })
    expect(report).toContain('--pass 1/1')
    expect(report).toContain('SCOPED PASS')
    expect(report).toContain('clears the listed files at aaaaaaa')
    expect(report).not.toContain('range too large')
  })

  it('sends the caller to the LEDGER for the remainder, never to a guessed next number', () => {
    // Round-3 pass 6 kept the warning on every pass; round-4 pass 6 removed
    // the numeric hint entirely — passes run in any order, so "next: k+1"
    // recommended already-recorded passes and fell silent on unrecorded ones
    // whenever the highest number ran first.
    for (const index of [1, 3]) {
      const report = formatReviewReport({
        decision: decideReview(okRun()),
        sha: 'a'.repeat(40),
        mode: 'review',
        pass: { index, total: 3, files: ['scripts/c.mjs'] },
      })
      expect(report).toContain('clears the listed files at aaaaaaa')
      expect(report).toContain('mechanism-review.mjs --list')
      expect(report).not.toMatch(/next: --pass/)
    }
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
      model: CROSS_NAME,
      verdict: 'merge',
      evidence: 'the "no-verdict" branch is covered',
      mode: 'review',
    })
    expect(cmd).toContain('\\"no-verdict\\"')
  })
})

describe('the recorder accepts the reviewer the rule now prefers (point 624)', () => {
  it('takes the cross lane as a review model', () => {
    expect(
      validateRecord({
        sha: 'e'.repeat(40),
        model: CROSS_NAME,
        verdict: 'merge',
        evidence: 'read the diff and both tests; the fallback path is the one that matters',
        authoredBy: MAIN_TRAILER,
        mode: 'review',
      }),
    ).toMatchObject({ ok: true })
  })

  it('does not read the cross lane as a self-review of main-chain or scarce-lane work', () => {
    for (const author of [MAIN_TRAILER, SCARCE_TRAILER_NAME, FALLBACK_TRAILER_NAME]) {
      const check = validateRecord({
        sha: 'f'.repeat(40),
        model: CROSS_NAME,
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
  // The patch must CARRY each file's section: a carried file whose diff is not
  // in the patch is refused as an omission (round-1 pass-3 finding, 18.08.2026).
  const sectionFor = (p) => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, '+x'].join('\n')
  const material = (files, budget) =>
    formatReviewMaterial({
      stat: ' a | 2 +-',
      patch: files.length ? files.map((f) => sectionFor(f.path)).join('\n') : 'diff --git a/a b/a',
      files,
      budget,
    })

  it('carries the diffstat, the patch and each file with its path', () => {
    const out = material([{ path: 'scripts/a.mjs', text: 'export const a = 1' }])
    expect(out).toContain('=== DIFFSTAT ===')
    expect(out).toContain('diff --git a/scripts/a.mjs b/scripts/a.mjs')
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
    expect(savedAuthPathFrom('/workspace/hoa/.git', '/workspace/hoa')).toBe('/workspace/hoa/local/codex-auth.json')
  })

  it('falls back to the current checkout when git answers nothing', () => {
    expect(savedAuthPathFrom('', '/repo')).toBe('/repo/local/codex-auth.json')
    expect(savedAuthPathFrom('   \n', '/repo')).toBe('/repo/local/codex-auth.json')
    expect(savedAuthPathFrom('/srv/hoa.git', '/repo')).toBe('/repo/local/codex-auth.json')
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
    expect(args[args.indexOf('-m') + 1]).toBe(lane('cross').modelId)
    expect(args).toContain(`model_reasoning_effort=${CROSS.reasoningEffort}`)
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

  it('demands the RECEIPT in the answer shape without ever containing the token', () => {
    const token = 'abcd1234abcd1234'
    const prompt = buildReviewPrompt({ sha: 'abc', brief: 'x', receipt: token })
    expect(prompt).toContain('EXACTLY these three lines')
    expect(prompt).toContain('RECEIPT: <the hex token')
    // The whole worth of the receipt: the prompt NEVER carries it, so only a
    // child that read the material to its end can echo it.
    expect(prompt).not.toContain(token)
    expect(buildReviewPrompt({ sha: 'abc', brief: 'x' })).toContain('EXACTLY these two lines')
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

describe('the reviewer is chosen by lane vendor, read from the registry', () => {
  it('takes the reasoning effort of every codex review from the cross lane record', () => {
    expect(CROSS.reasoningEffort).toBe('high')
    const args = codexArgs({ cwd: '/repo', outputFile: '/tmp/out.txt', prompt: 'judge this' })
    expect(args[args.indexOf('-c') + 1]).toBe('model_reasoning_effort=high')
    expect(args[args.indexOf('-m') + 1]).toBe(lane('cross').modelId)
  })

  it('treats the three cross-lane names pairwise as ONE lane — none may review another', () => {
    expect(CROSS_NAMES).toHaveLength(3)
    for (const reviewer of CROSS_NAMES) {
      expect(reviewerDescriptor(reviewer), reviewer).toMatchObject({ key: 'cross', runtime: 'codex' })
      for (const author of CROSS_NAMES) {
        expect(authoredByLane('cross', author), `${reviewer} / ${author}`).toBe(true)
        expect(automaticReviewer([author])?.key, author).not.toBe('cross')
        const d = decideReview({ ...okRun(), authorModel: [author] })
        expect(d, `${reviewer} reviewing ${author}`).toMatchObject({ kind: OUTCOME.SELF_REVIEW, ready: false, ranBy: '' })
      }
    }
  })

  it('never picks a reviewer of the same vendor as an author, whatever its role', () => {
    for (const record of LANES) {
      const reviewer = automaticReviewer([record.displayName])
      expect(reviewer, record.role).toBeTruthy()
      expect(reviewer.vendor, record.role).not.toBe(record.vendor)
    }
    // A main-chain range goes to the cross lane, never to the scarce lane beside it.
    expect(automaticReviewer([MAIN_NAME]).key).toBe('cross')
    expect(automaticReviewer([SCARCE_NAME]).key).toBe('cross')
    expect(automaticReviewer([CROSS_NAME]).key).toBe('main')
    // Authors of both vendors leave no vendor-independent lane: the handover chain decides.
    expect(automaticReviewer([MAIN_NAME, CROSS_NAME])).toBeNull()
    // The scarce lane drops out while switched off; the main chain is not a fallback for it.
    expect(automaticReviewer([CROSS_NAME], { scarceState: SCARCE_OFF }).key).toBe('main')
  })

  it('fails closed on an author of no known vendor', () => {
    expect(unresolvedAuthors(['Alice'])).toEqual(['Alice'])
    expect(unresolvedAuthors([])).toHaveLength(1)
    expect(unresolvedAuthors([MAIN_TRAILER])).toEqual([])
    expect(automaticReviewer(['Alice'])).toBeNull()
    expect(automaticReviewer([MAIN_NAME, 'Alice'])).toBeNull()
  })

  it('finds a third vendor in a synthetic registry, through the registry argument', () => {
    const third = Object.freeze({
      role: 'third',
      vendor: 'synthetic',
      displayName: 'Nano 2',
      trailerName: 'Nano 2',
      modelId: 'nano-2',
      familyWords: Object.freeze(['nano']),
      retired: Object.freeze([]),
      runtime: 'claude',
      reasoningEffort: 'medium',
      scarce: false,
    })
    const registry = [...LANES, third]
    expect(automaticReviewer([MAIN_NAME, CROSS_NAME])).toBeNull()
    expect(automaticReviewer([MAIN_NAME, CROSS_NAME], { registry })).toMatchObject({ key: 'third', name: 'Nano 2' })
    // The data order still comes first where it has an eligible lane.
    expect(automaticReviewer([MAIN_NAME], { registry }).key).toBe('cross')
    expect(reviewerDescriptor('Nano 2', registry)).toMatchObject({ key: 'third' })
    expect(reviewerDescriptor('Nano 2')).toBeNull()
    expect(executionTarget('third', registry).name).toBe('Nano 2')
  })

  it('takes --reviewer as a role only — no model name and no former key', () => {
    for (const role of EXECUTION_ROLES) expect(reviewerForRole(role).key).toBe(role)
    for (const key of Object.keys(LEGACY.cliKeys)) expect(reviewerForRole(key), key).toBeNull()
    expect(reviewerForRole(CROSS_NAME)).toBeNull()
  })
})

// POINT 667: the REVERSED direction. The cross lane authors too now, and the failure
// this mechanism exists to prevent has a mirror image: a review recorded as the cross
// lane's over a range it WROTE. That reads green at both gates and is nobody's second
// pair of eyes.
describe('the reversed direction — where the CROSS LANE authored', () => {
  const CROSS_COMMIT = `${RETIRED_CROSS.at(-1)} <${crossAddress}>`

  it('recognises the cross lane as an author in every spelling of its name', () => {
    const familyWord = CROSS.familyWords[0][0].toUpperCase() + CROSS.familyWords[0].slice(1)
    for (const author of [CROSS_COMMIT, ...CROSS_NAMES, CROSS.modelId, ...CROSS.retired, familyWord, [MAIN.trailerName, CROSS_COMMIT]]) {
      expect(authoredByLane('cross', author), String(author)).toBe(true)
    }
    for (const author of ['', `${MAIN.trailerName} <x@y>`, [MAIN.trailerName, SCARCE_TRAILER_NAME], 'Patrick <p@x>']) {
      expect(authoredByLane('cross', author), String(author)).toBe(false)
    }
  })

  it('hands a cross-authored range to the main chain — the lane that also lands it', () => {
    expect(REVIEW_CHAINS.crossAuthored[0]).toBe('main')
    expect(reviewChain('crossAuthored')[0]).toBe(MAIN_NAME)
    expect(decideReview({ authorModel: CROSS_COMMIT }).model).toBe(MAIN_NAME)
    // …and skips a handover model that authored part of the range.
    expect(decideReview({ authorModel: [CROSS_COMMIT, `${MAIN.trailerName} <x@y>`] }).model).toBe(SCARCE_NAME)
    expect(decideReview({ authorModel: [CROSS_COMMIT, `${MAIN.trailerName} <x@y>`, `${SCARCE_TRAILER_NAME} <x@y>`] }).model).toBe(FALLBACK_NAME)
    // Every candidate authored part of it: no reviewer, said plainly.
    expect(decideReview({ authorModel: [CROSS_COMMIT, MAIN.trailerName, SCARCE_TRAILER_NAME, FALLBACK_TRAILER_NAME] }).model).toBe('')
  })

  it('refuses to record a SUCCESSFUL cross-lane run over a range the cross lane authored', () => {
    // The dangerous case: the run worked and came back with a clean verdict.
    // Recording it would be a self-review that reads green at both gates.
    const d = decideReview({ ...okRun(), authorModel: [CROSS_COMMIT] })
    expect(d.kind).toBe(OUTCOME.SELF_REVIEW)
    expect(d.ready).toBe(false)
    expect(d.verdict).toBe('')
    expect(d.ranBy).toBe('')
    expect(d.model).toBe(MAIN_NAME)
    expect(d.cause).toMatch(/AUTHORED/)
  })

  it('leaves the ordinary direction exactly as it was', () => {
    const d = decideReview({ ...okRun(), authorModel: [`${MAIN.trailerName} <x@y>`] })
    expect(d).toMatchObject({ model: CROSS_NAME, ranBy: CROSS_NAME, verdict: 'merge', ready: true })
    // The cross lane unavailable over main-chain work still falls back to the scarce lane.
    expect(fallbackReviewerFor(`${MAIN.trailerName} <x@y>`)).toBe(SCARCE_NAME)
    expect(fallbackReviewerFor(`${SCARCE_TRAILER_NAME} <x@y>`)).toBe(MAIN_NAME)
  })

  it('reports a role swap as a role swap, not as a failure, and invents no verdict', () => {
    const d = decideReview({ ...okRun(), authorModel: [CROSS_COMMIT] })
    const text = formatReviewReport({ decision: d, sha: 'abcdef1234567', mode: 'review', point: '667' })
    expect(text).toMatch(/ROLE SWAP/)
    expect(text).not.toMatch(/FALLBACK/)
    expect(text).toMatch(/AUTHORED part of abcdef1/)
    expect(text).toMatch(/runs the suites, judges the picture and lands/)
    // The printed record command carries the PLACEHOLDER, so a hand that pastes
    // it without having the review done gets a refusal from the recorder.
    expect(text).toContain(`--model "${MAIN_NAME}"`)
    expect(text).toContain(`--verdict <${VERDICTS.join('|')}>`)
    expect(validateRecord({
      sha: 'abcdef1234567',
      model: MAIN_NAME,
      verdict: '<merge|merge-with-fixes|do-not-merge>',
      evidence: '<what the review actually checked>',
      authoredBy: CROSS_COMMIT,
      mode: 'review',
    }).ok).toBe(false)
  })

  it('says so when the whole chain authored the range', () => {
    const d = decideReview({
      ...okRun(),
      authorModel: [CROSS_COMMIT, MAIN.trailerName, SCARCE_TRAILER_NAME, FALLBACK_TRAILER_NAME],
    })
    const text = formatReviewReport({ decision: d, sha: 'abcdef1234567' })
    expect(d.model).toBe('')
    expect(text).toMatch(/cannot be recorded/)
    expect(text).not.toMatch(/--record/)
  })
})
