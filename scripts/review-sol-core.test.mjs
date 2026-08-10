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
  probeFreshness,
  savedAuthPathFrom,
  SECOND_FALLBACK_MODEL_NAME,
  SOL_MODEL_ID,
  SOL_MODEL_NAME,
  SOL_REASONING_EFFORT,
} from './review-sol-core.mjs'

const solSays = (verdict = 'merge', evidence = 'read the diff and the guard test; the fail-open path is covered') =>
  `I checked the change.\n\nVERDICT: ${verdict}\nEVIDENCE: ${evidence}\n`

const okRun = (text = solSays()) => ({
  outcome: classifyOutcome({ exitCode: 0, stdout: text }),
  parsed: parseVerdict(text),
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
})
