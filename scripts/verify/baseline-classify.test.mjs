// Pins the red-triage logic of scripts/verify/baseline-classify-core.mjs
// (point 294): the repeat signature (same check twice vs different checks), the
// baseline classification (green→red = regression, red→red = pre-existing), the
// weak changed-file relatedness, and the printed report.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  allChecks,
  baselineRunDeath,
  baselineShortfall,
  checkFromName,
  checkKey,
  classifyAgainstBaseline,
  consoleErrorChecks,
  countCheckLines,
  failedChecks,
  foldBaselineRuns,
  formatBaselineReport,
  normaliseErrorText,
  parseCheckLines,
  clearInheritedBaselineLane,
  onBaselineLane,
  suiteLaneEnv,
} from './baseline-classify-core.mjs'
import { currentRunIsClean, parseWrapperArgs } from './baseline-classify.mjs'

// The live 27.07.2026 case: enrichments failed twice at DIFFERENT checks.
const RUN_1 = [
  'PASS  the traveller reaches the savanna — 12 objects',
  'FAIL  the streamed dressing does not grow — 0 objects at all',
  'FAIL  an elephant herd mourns at the graveyard — released:false',
  'PASS  the crocodile eye knobs sit above the snout — 2 knobs',
  'console errors: 0',
].join('\n')

describe('parsing a suite output', () => {
  it('reads name and detail from every result line', () => {
    const checks = parseCheckLines(RUN_1)
    expect(checks).toHaveLength(4)
    expect(checks[1]).toMatchObject({ status: 'FAIL', name: 'the streamed dressing does not grow', detail: '0 objects at all' })
    expect(checks[3].status).toBe('PASS')
  })

  it('ignores lines that are not result lines', () => {
    expect(parseCheckLines('# starting dev server\nPASSING through the desert\nERR: boom')).toEqual([])
  })

  it('takes a name without a detail', () => {
    expect(parseCheckLines('FAIL  the map opens')[0]).toMatchObject({ name: 'the map opens', detail: '' })
  })

  it('folds measured numbers into the comparison key so the same check matches across runs', () => {
    expect(checkKey('12 vultures circle')).toBe(checkKey('4 vultures circle'))
    expect(checkKey('the  map   opens')).toBe('the map opens')
    expect(checkKey('vultures circle')).not.toBe(checkKey('vultures land'))
  })

  it('does not mistake the suites own summary lines for checks', () => {
    // flow.mjs ends with `FAILURES: 2`, preview.mjs prints a bare `FAIL`.
    expect(parseCheckLines('FAILURES: 2\nFAIL\nALL CHECKS PASSED')).toEqual([])
    // flow.mjs prints its checks without a detail — those ARE checks.
    expect(parseCheckLines('FAIL  the ferry sails to Zanzibar')).toHaveLength(1)
  })

  it('tallies the printed result lines and never counts a summary line as a check', () => {
    // MEASURED 05.09.2026, webgpu flow at 23:21: the runner counted flow.mjs's
    // own closing `FAILURES: 0` as one failing check and printed a red that
    // named nothing, which nobody could then own.
    const out = [
      'PASS  the ferry sails to Zanzibar',
      'PASS  the journal writes its arrival entry',
      'FAIL  the chief answers — no reply',
      'console errors: 0',
      'FAILURES: 1',
    ].join('\n')
    expect(countCheckLines(out)).toEqual({ pass: 2, fail: 1 })
    // preview.mjs prints a bare `FAIL` with no name: not a check either, and a
    // non-zero exit still speaks for itself.
    expect(countCheckLines('FAIL\nFAILURES: 0')).toEqual({ pass: 0, fail: 0 })
    // The same check printed twice is counted twice — this is the raw tally the
    // run's headline reports, not the de-duplicated list.
    expect(countCheckLines('PASS  a\nPASS  a')).toEqual({ pass: 2, fail: 0 })
  })

  it('lists failing and all-reached checks de-duplicated', () => {
    expect(failedChecks(RUN_1).map((c) => c.name)).toEqual([
      'the streamed dressing does not grow',
      'an elephant herd mourns at the graveyard',
    ])
    expect(allChecks(RUN_1)).toHaveLength(4)
    expect(failedChecks('FAIL  a — 1\nFAIL  a — 2')).toHaveLength(1)
  })
})

describe('console errors as pseudo-checks (world and i18n print no FAIL line)', () => {
  const OUT = [
    'console errors: 2',
    'ERR: TypeError: r.dispose is not a function at http://localhost:52311/src/render/pipeline.ts:42:9',
    'ERR: WebGL: INVALID_OPERATION',
  ].join('\n')

  it('reads the ERR lines and folds URL, port and line numbers out of the identity', () => {
    const errs = consoleErrorChecks(OUT)
    expect(errs).toHaveLength(2)
    expect(errs[0].kind).toBe('console')
    expect(errs[0].name).toContain('<url>')
    expect(errs[0].name).not.toContain('52311')
    expect(normaliseErrorText('boom at http://localhost:1/a.ts:1:2')).toBe('boom at <url>')
  })

  it('reads the texts from a console-errors line that carries them, and ignores a bare count', () => {
    expect(consoleErrorChecks("console errors: [ 'a broken shader', 'a missing texture' ]")).toHaveLength(2)
    expect(consoleErrorChecks('CONSOLE ERRORS: first one | second one')).toHaveLength(2)
    expect(consoleErrorChecks('console errors: 0\nCONSOLE ERRORS: none')).toEqual([])
  })

  it('counts a console error the baseline never produced as a real regression', () => {
    const baseline = 'PASS  the map draws\nconsole errors: 0'
    const classified = classifyAgainstBaseline({
      currentFailed: failedChecks(OUT),
      baselineFailed: failedChecks(baseline),
      baselineChecks: allChecks(baseline),
    })
    expect(classified.map((c) => c.verdict)).toEqual(['real-regression', 'real-regression'])
  })

  it('can be switched off for a caller that only wants the printed checks', () => {
    expect(failedChecks(OUT, { includeConsoleErrors: false })).toEqual([])
  })

  it('keeps its kind when the check travels as a bare NAME between processes', () => {
    // run-all hands the failing checks to the classifier wrapper on the command
    // line; without the kind, the "absent on baseline means it did not happen"
    // rule would silently stop applying to the console-gated suites.
    const name = consoleErrorChecks(OUT)[1].name
    expect(checkFromName(name)).toMatchObject({ kind: 'console', key: checkKey(name) })
    expect(checkFromName('the map opens').kind).toBe('check')
    // A name carrying an em dash is CUT at it, exactly as parseCheckLines cuts
    // the printed line — the two must key alike or the comparison never matches,
    // and no check name can survive the dash through parsing anyway.
    expect(checkFromName('a check — with a dash').name).toBe('a check')
    expect(checkFromName('a check — with a dash').key).toBe(allChecks('PASS  a check — with a dash')[0].key)
  })

  it('classifies a console error handed over as a bare name as a real regression', () => {
    const baseline = 'PASS  the map draws'
    const classified = classifyAgainstBaseline({
      currentFailed: [consoleErrorChecks(OUT)[1].name],
      baselineFailed: failedChecks(baseline),
      baselineChecks: allChecks(baseline),
    })
    expect(classified[0].verdict).toBe('real-regression')
  })
})

describe('classifying against the baseline', () => {
  const current = failedChecks('FAIL  a river notch appears\nFAIL  the ground edge is dark\nFAIL  a brand new check')
  const baselineOut = 'PASS  a river notch appears\nFAIL  the ground edge is dark'

  it('separates a real regression, a pre-existing red and a check the baseline never ran', () => {
    const classified = classifyAgainstBaseline({
      currentFailed: current,
      baselineFailed: failedChecks(baselineOut),
      baselineChecks: allChecks(baselineOut),
    })
    expect(classified.map((c) => c.verdict)).toEqual(['real-regression', 'pre-existing', 'inconclusive'])
  })

  it('never reads a baseline run that died early as a clean bill of health', () => {
    const classified = classifyAgainstBaseline({ currentFailed: current, baselineFailed: [], baselineChecks: [] })
    expect(classified.every((c) => c.verdict === 'inconclusive')).toBe(true)
  })

  it('folds repeated baseline runs: red in every run is red, red in some is unstable', () => {
    const folded = foldBaselineRuns([
      'PASS  a river notch appears\nFAIL  the ground edge is dark\nFAIL  a herd gathers',
      'PASS  a river notch appears\nFAIL  the ground edge is dark\nPASS  a herd gathers',
    ])
    expect(folded.failed.map((c) => c.name)).toEqual(['the ground edge is dark'])
    expect(folded.flaky.map((c) => c.name)).toEqual(['a herd gathers'])
    expect(folded.checks).toHaveLength(3)
    expect(folded.ran).toBe(true)
  })

  it('reports a baseline run that produced nothing as not-run', () => {
    expect(foldBaselineRuns(['PASS  a check', 'Error: Target closed']).ran).toBe(false)
    expect(foldBaselineRuns([]).ran).toBe(false)
  })

  it('resolves nothing when the check flaked on the baseline itself', () => {
    const classified = classifyAgainstBaseline({
      currentFailed: ['the ground edge is dark'],
      baselineFailed: [],
      baselineChecks: ['the ground edge is dark'],
      baselineFlaky: ['the ground edge is dark'],
    })
    expect(classified[0].verdict).toBe('baseline-flaky')
  })

  // point 418: the 29.07.2026 case — two baseline passes of `enrichments` each
  // ended after 55 of 243 checks, exit 1 with ZERO failing checks. That is a
  // lane that DIED, and it must not read as "the check is newer than the baseline".
  describe('a baseline run that DIED before the end', () => {
    const shortRun = 'PASS  the traveller reaches the savanna\nPASS  a herd gathers'

    it('reads fewer checks than the current run with no failure as a death, and names the last check', () => {
      const death = baselineRunDeath({
        checks: allChecks(shortRun),
        failed: failedChecks(shortRun),
        exitCode: 1,
        currentCheckCount: 243,
      })
      expect(death).toMatchObject({ reached: 2, expected: 243, failures: 0, exitCode: 1, signature: 'short-and-silent' })
      expect(death.lastCheck).toBe('a herd gathers')
    })

    it('reads a non-zero exit without a single FAIL line as a death even with no yardstick', () => {
      expect(baselineRunDeath({ checks: allChecks(shortRun), failed: [], exitCode: 1 })).toMatchObject({ signature: 'silent' })
    })

    it('leaves a healthy run alone: full length, and a red run that exits 1 WITH failures', () => {
      expect(baselineRunDeath({ checks: allChecks(shortRun), failed: [], exitCode: 0, currentCheckCount: 2 })).toBeNull()
      const red = 'PASS  the traveller reaches the savanna\nFAIL  a herd gathers'
      expect(baselineRunDeath({ checks: allChecks(red), failed: failedChecks(red), exitCode: 1, currentCheckCount: 2 })).toBeNull()
    })

    it('never calls a run that REPORTED failures a death, however much shorter it is', () => {
      // The serverless suites run the BASELINE's own script copy, so a change
      // that adds checks leaves a legitimately red baseline permanently
      // shorter. Annulling that valid triage is the same false alarm the
      // died-early verdict exists to prevent, only pointing the other way.
      const red = 'PASS  a\nPASS  b\nFAIL  c'
      expect(baselineRunDeath({ checks: allChecks(red), failed: failedChecks(red), exitCode: 1, currentCheckCount: 245 })).toBeNull()
    })

    it('reports a short run that DID report as a caveat instead, leaving the verdicts standing', () => {
      const red = 'PASS  a\nPASS  b\nFAIL  c'
      const folded = foldBaselineRuns([{ output: red, exitCode: 1 }], { currentCheckCount: 245 })
      expect(folded.died).toBe(false)
      expect(folded.deaths).toEqual([])
      expect(folded.shortfalls).toEqual([{ run: 1, reached: 3, expected: 245, failures: 1, lastCheck: 'c' }])
      // The classification is untouched: a check the short baseline DID fail
      // still reads pre-existing, not "not classified".
      const classified = classifyAgainstBaseline({
        currentFailed: ['c'],
        baselineFailed: folded.failed,
        baselineChecks: folded.checks,
        baselineDied: folded.died,
      })
      expect(classified[0].verdict).toBe('pre-existing')
      const text = formatBaselineReport({ suite: 'docs', ref: 'abc', classified, shortfalls: folded.shortfalls }).join('\n')
      expect(text).toContain('the verdicts above stand')
      expect(text).not.toContain('DIED')
      expect(text).not.toContain('Fix the lane first')
    })

    it('says nothing about a short run that reported and is NOT short of the current count', () => {
      const red = 'PASS  a\nFAIL  b'
      expect(baselineShortfall({ checks: allChecks(red), failed: failedChecks(red), currentCheckCount: 2 })).toBeNull()
      // …nor about a run with no failures at all — that is the death path.
      expect(baselineShortfall({ checks: allChecks(red), failed: [], currentCheckCount: 245 })).toBeNull()
    })

    it('never calls a run that EXITED ZERO a death, however few checks it counted', () => {
      // Some checks are conditional on what the app produced, so a healthy
      // baseline may legitimately count a few short. The exit is the suite's
      // last statement: reaching it means reaching the end.
      expect(baselineRunDeath({ checks: allChecks(shortRun), failed: [], exitCode: 0, currentCheckCount: 243 })).toBeNull()
    })

    it('says nothing rather than guessing when no exit code was handed in', () => {
      expect(baselineRunDeath({ checks: allChecks(shortRun), failed: [], currentCheckCount: 2 })).toBeNull()
    })

    it('is not confused with a run that produced nothing at all (that is the not-ran case)', () => {
      expect(baselineRunDeath({ checks: [], failed: [], exitCode: 1, currentCheckCount: 243 })).toBeNull()
    })

    it('folds the deaths per run, with the exit codes the wrapper hands over', () => {
      const folded = foldBaselineRuns(
        [
          { output: shortRun, exitCode: 1 },
          { output: shortRun, exitCode: 1 },
        ],
        { currentCheckCount: 243 },
      )
      expect(folded.died).toBe(true)
      expect(folded.deaths.map((d) => d.run)).toEqual([1, 2])
      expect(folded.ran).toBe(true) // it DID produce output — it just stopped early
    })

    it('still reads bare output strings, and calls a full-length pair healthy', () => {
      const folded = foldBaselineRuns([shortRun, shortRun], { currentCheckCount: 2 })
      expect(folded.died).toBe(false)
      expect(folded.deaths).toEqual([])
    })

    it('verdicts DIED, not INCONCLUSIVE, for a check the dead baseline never reached', () => {
      const classified = classifyAgainstBaseline({
        currentFailed: ['a calf in a strong current drowns', 'a herd gathers'],
        baselineFailed: [],
        baselineChecks: allChecks(shortRun),
        baselineDied: true,
      })
      expect(classified.map((c) => c.verdict)).toEqual(['baseline-died', 'real-regression'])
    })

    it('does not clear a console error on a dead baseline through the absence rule', () => {
      const classified = classifyAgainstBaseline({
        currentFailed: [checkFromName('console error: boom')],
        baselineFailed: [],
        baselineChecks: allChecks(shortRun),
        baselineDied: true,
      })
      expect(classified[0].verdict).toBe('baseline-died')
    })

    it('prints the death LOUDLY above the verdicts, with the last check and the kept log', () => {
      const lines = formatBaselineReport({
        suite: 'enrichments',
        ref: '25e0f0f (merge-base with main)',
        classified: [{ check: 'a calf drowns', key: 'a calf drowns', verdict: 'baseline-died' }],
        deaths: [{ run: 2, reached: 55, expected: 243, lastCheck: 'a herd gathers', failures: 0, exitCode: 1 }],
        logs: ['local/verify-baseline-logs/enrichments-baseline-run2.log'],
      })
      const text = lines.join('\n')
      expect(text).toContain('THE BASELINE LANE DIED: run 2 ended after 55 of the current run\'s 243 checks')
      expect(text).toContain('last check reached: "a herd gathers"')
      expect(text).toContain('enrichments-baseline-run2.log')
      // The death is stated BEFORE the per-check verdicts, and no verdict claims a triage.
      expect(lines.findIndex((l) => l.includes('DIED'))).toBeLessThan(lines.findIndex((l) => l.includes('a calf drowns:')))
      expect(text).toContain('NOT "newer than the baseline"')
    })

    it('names the changed suite file as the first suspect when the lane died', () => {
      const withChange = formatBaselineReport({
        suite: 'enrichments',
        ref: '25e0f0f',
        classified: [],
        deaths: [{ run: 1, reached: 55, expected: 243, lastCheck: 'a herd gathers', failures: 0, exitCode: 1 }],
        suiteFileChanged: true,
      })
      expect(withChange.join('\n')).toContain('FIRST SUSPECT: scripts/verify/enrichments.mjs changed since the baseline')
      const noChange = formatBaselineReport({
        suite: 'enrichments',
        ref: '25e0f0f',
        classified: [],
        deaths: [{ run: 1, reached: 55, expected: 243, lastCheck: 'a herd gathers', failures: 0, exitCode: 1 }],
        suiteFileChanged: false,
      })
      expect(noChange.join('\n')).not.toContain('FIRST SUSPECT')
    })
  })

  it('round-trips a DASHED console pseudo-check through --failed without losing its identity', () => {
    // src/systems/devAssert.ts prints `[ASSERT] <code> — <detail>`, and
    // consoleErrorChecks keys the WHOLE normalised text. run-all hands console
    // names to the wrapper through --failed, so cutting at the dash here would
    // key a pre-existing assert differently from its own baseline form and
    // report it as SUSPECT.
    const produced = consoleErrorChecks('ERR: [ASSERT] calf-without-parent — id 17 at 4.2,-9.1')[0]
    const round = checkFromName(produced.name)
    expect(round.kind).toBe('console')
    expect(round.name).toBe(produced.name)
    expect(round.key).toBe(produced.key)
    // …and the verdict it drives is the pre-existing one, not a regression.
    const baseline = 'PASS  the map draws\nERR: [ASSERT] calf-without-parent — id 4 at 1.0,-2.0'
    const classified = classifyAgainstBaseline({
      currentFailed: [checkFromName(produced.name)],
      baselineFailed: failedChecks(baseline),
      baselineChecks: allChecks(baseline),
    })
    expect(classified[0].verdict).toBe('pre-existing')
  })

  it('keys a name pasted WITH its result prefix and detail the same as the parsed line', () => {
    // What a human actually copies out of a console into --failed.
    const parsed = allChecks('PASS  a calf in a strong current drowns — {"drowned":true}')[0]
    const pasted = checkFromName('FAIL  a calf in a strong current drowns — {"drowned":false}')
    expect(pasted.name).toBe('a calf in a strong current drowns')
    expect(pasted.key).toBe(parsed.key)
    // A console pseudo-check keeps its kind through the same trimming.
    expect(checkFromName('console error: boom — at foo.js').kind).toBe('console')
  })

  it('accepts plain check names as well as parsed checks', () => {
    const classified = classifyAgainstBaseline({
      currentFailed: ['the ground edge is dark'],
      baselineFailed: ['the ground edge is dark'],
      baselineChecks: ['the ground edge is dark'],
    })
    expect(classified[0].verdict).toBe('pre-existing')
  })
})

describe('the wrapper CLI', () => {
  it('never assumes the context of supplied check names or logs', () => {
    expect(parseWrapperArgs(['polish', '--failed', 'jar']).currentContext).toBe('unknown')
    expect(parseWrapperArgs(['polish', '--current-out', 'large.log']).currentContext).toBe('unknown')
    expect(parseWrapperArgs(['--current-context', 'in-pass', 'polish'])).toMatchObject({ suite: 'polish', currentContext: 'in-pass' })
    expect(parseWrapperArgs(['polish', '--current-context', 'standalone']).currentContext).toBe('standalone')
    expect(parseWrapperArgs(['polish', '--current-context', 'typo']).currentContext).toBe('unknown')
  })

  it('accepts a structured report destination without mistaking it for a suite', () => {
    expect(parseWrapperArgs(['--report-file', '/tmp/report.json', 'crossbrowser'])).toMatchObject({ suite: 'crossbrowser', reportFile: '/tmp/report.json' })
  })

  it('reads the suite, the flags and their values, with the safe defaults', () => {
    const a = parseWrapperArgs(['enrichments', '--ref', 'HEAD~1', '--runs', '3', '--failed', 'a herd gathers', '--strict'])
    expect(a).toMatchObject({ suite: 'enrichments', ref: 'HEAD~1', runs: 3, strict: true, keep: false })
    expect(a.failed).toEqual(['a herd gathers'])
    // Two baseline passes by default — one is as flake-prone as the run being triaged.
    expect(parseWrapperArgs(['polish'])).toMatchObject({ suite: 'polish', ref: null, runs: 2, strict: false })
  })

  it('never takes a flag value for the suite name, and takes repeated --failed', () => {
    const a = parseWrapperArgs(['--ref', 'main', 'world', '--failed', 'one', '--failed', 'two'])
    expect(a.suite).toBe('world')
    expect(a.failed).toEqual(['one', 'two'])
    expect(parseWrapperArgs(['--runs', '0', 'world']).runs).toBe(1)
  })

  it('takes the current run length run-all hands over, and defaults it to unknown', () => {
    expect(parseWrapperArgs(['enrichments', '--current-checks', '243']).currentChecks).toBe(243)
    expect(parseWrapperArgs(['enrichments']).currentChecks).toBe(0)
  })
})

describe('the printed report', () => {
  it.each(['in-pass', 'unknown'])('qualifies every regression when candidate context is %s', (currentContext) => {
    const classified = classifyAgainstBaseline({
      currentFailed: ['jar', 'another check', checkFromName('console error: boom')],
      baselineFailed: [], baselineChecks: ['jar', 'another check'],
    })
    const report = formatBaselineReport({ suite: 'polish', ref: 'abc1234', classified, currentContext })
    const claims = report.filter((line) => line.includes('SUSPECT'))
    expect(claims).toHaveLength(3)
    for (const claim of claims) {
      expect(claim).toContain(`baseline standalone, candidate ${currentContext}`)
      expect(claim).toContain('causation unproven')
      expect(claim).toContain(currentContext === 'unknown' ? 'COMPARABILITY UNKNOWN' : 'NOT LIKE-FOR-LIKE')
    }
  })

  it.each(['standalone', 'standalone section "adult-errands"'])('compares matching %s contexts without a mismatch warning', (context) => {
    const report = formatBaselineReport({ suite: 'polish', ref: 'abc1234',
      classified: [{ check: 'jar', verdict: 'real-regression' }], currentContext: context, baselineContext: context,
    }).join('\n')
    expect(report).toContain('SUSPECT — green on baseline, red now; UNCONFIRMED (settle it with three narrow --section rungs on a quiet machine, not another full pass)')
    expect(report).not.toContain('NOT LIKE-FOR-LIKE')
    expect(report).not.toContain('COMPARABILITY UNKNOWN')
  })

  it('does not claim a supplied whole-suite result matches an inherited baseline section filter', () => {
    const report = formatBaselineReport({ suite: 'polish', ref: 'abc1234',
      classified: [{ check: 'jar', verdict: 'real-regression' }], currentContext: 'standalone',
      baselineContext: 'standalone section "adult-errands"',
    }).join('\n')
    expect(report).toContain('NOT LIKE-FOR-LIKE (baseline standalone section "adult-errands", candidate standalone; causation unproven)')
  })

  it('prints one verdict line per check, the backend, and flags a changed suite file', () => {
    const lines = formatBaselineReport({
      suite: 'polish',
      ref: 'abc1234',
      backend: 'webgpu',
      classified: [{ check: 'the ground edge is dark', key: 'k', verdict: 'pre-existing' }],
      suiteFileChanged: true,
      infraChanged: ['package-lock.json'],
    })
    expect(lines[0]).toContain('backend WebGPU')
    expect(lines[1]).toContain('PRE-EXISTING')
    expect(lines.join('\n')).toContain('scripts/verify/polish.mjs itself differs')
    expect(lines.join('\n')).toContain('package-lock.json')
  })

  it('says NOT classified when the baseline run produced nothing', () => {
    const lines = formatBaselineReport({ suite: 'polish', ref: 'abc1234', classified: [], baselineRan: false, note: 'dev server never bound' })
    expect(lines.join('\n')).toContain('NOT classified')
    expect(lines.join('\n')).toContain('dev server never bound')
  })
})

// THE TWO IDENTITY ROUTES MUST AGREE (cross-vendor review, 01.09.2026). One
// reads a check out of a RUN's output, the other out of a PASTED `--failed`
// line, and the triage compares the two by key. When only the parser learned
// that an empty detail leaves a two-character separator behind, the same check
// read the two ways produced two keys and the comparison answered
// `inconclusive` — the 06.08.2026 bug surviving on the half nobody fixed.
describe('an empty-detail check keys the same from a run and from a pasted line', () => {
  const PRINTED = 'member hoa-state-2026-08-31-42.png is present'

  it('strips the empty-detail separator on both routes', () => {
    const [parsed] = parseCheckLines(`FAIL  ${PRINTED} — `)
    const pasted = checkFromName(`FAIL  ${PRINTED} — `)

    expect(parsed.name).toBe(PRINTED)
    expect(pasted.name).toBe(PRINTED)
    expect(pasted.key).toBe(parsed.key)
  })

  it('still cuts an ordinary detail, and keeps a console line whole', () => {
    expect(checkFromName(`FAIL  ${PRINTED} — laplacian mean 1.02`).name).toBe(PRINTED)
    const consoleLine = 'console error: THREE.WebGPURenderer: something — with a dash'
    expect(checkFromName(consoleLine).name).toBe(consoleLine)
  })

  it('leaves a HYPHEN alone — only the em-dash separator is a separator', () => {
    expect(checkFromName('FAIL  the frame is off-centre').name).toBe('the frame is off-centre')
    expect(checkFromName('FAIL  the em—dash inside a word').name).toBe('the em—dash inside a word')
  })

  it('pins the ONE ambiguity it cannot resolve: a label genuinely ending in the separator', () => {
    // `FAIL  <name> — <detail>` is the producer convention, so a label whose own
    // last characters are the separator followed by the protocol's own empty
    // detail separator prints TWO separators. Both identity routes lose the
    // label's terminal one and produce the same key; their detail fields differ
    // because only the run parser sees the first delimiter. That exact lossy
    // boundary is pinned rather than being replaced by the ordinary one-dash
    // empty-detail case (cross-vendor review, GPT-5.6 Sol at effort high).
    const printed = 'FAIL  the rock is a class of thing —  — '
    const [parsed] = parseCheckLines(printed)
    const pasted = checkFromName(printed)
    expect(parsed.name).toBe('the rock is a class of thing')
    expect(parsed.detail).toBe('—')
    expect(pasted.name).toBe('the rock is a class of thing')
    expect(pasted.detail).toBe('')
    expect(pasted.key).toBe(parsed.key)
  })

  it('does not cut a BARE separator down to nothing', () => {
    // The line parser drops a check with no name (`if (!name) continue`); this
    // route has no such guard, so the degenerate input is pinned rather than
    // left to surprise a caller (cross-vendor review, 01.09.2026).
    expect(checkFromName('FAIL   —').name).toBe('—')
    expect(checkFromName('FAIL   — ').name).toBe('—')
  })

  it('cuts at the FIRST separator when a name carries both forms', () => {
    expect(checkFromName('FAIL  the check — measured 1.02 —').name).toBe('the check')
  })
})

// The lane marker decides whether a suite may stand a block down because the
// PRE-change app cannot pose it. The classifier spawns BOTH trees through one
// helper, so a constant there exempted the candidate too, and an omitted marker
// let a stale environment exempt the pass (GPT-6 Astra, review of fea5ce9).
describe('the baseline lane marker', () => {
  it('marks the baseline lane and only the baseline lane', () => {
    expect(onBaselineLane(suiteLaneEnv({ baselineLane: true }))).toBe(true)
    expect(onBaselineLane(suiteLaneEnv({ baselineLane: false }))).toBe(false)
  })

  it('writes the candidate lane rather than leaving an inherited marker standing', () => {
    const inherited = { VERIFY_BASELINE_LANE: '1', PATH: '/usr/bin' }
    const env = suiteLaneEnv({ baselineLane: false, env: inherited })
    expect(env.VERIFY_BASELINE_LANE).toBe('0')
    expect(onBaselineLane(env)).toBe(false)
    expect(env.PATH).toBe('/usr/bin')
  })

  it('defaults to the candidate lane when no lane is stated', () => {
    expect(onBaselineLane(suiteLaneEnv())).toBe(false)
    expect(onBaselineLane(suiteLaneEnv({ env: { VERIFY_BASELINE_LANE: '1' } }))).toBe(false)
  })

  it('carries BASE_URL only when there is one, and never loses the lane to it', () => {
    const withUrl = suiteLaneEnv({ baselineLane: true, baseUrl: 'http://localhost:4173' })
    expect(withUrl.BASE_URL).toBe('http://localhost:4173')
    expect(onBaselineLane(withUrl)).toBe(true)
    expect('BASE_URL' in suiteLaneEnv({ baselineLane: true })).toBe(false)
  })

  it('reads only the exact marker value as the baseline lane', () => {
    for (const value of ['0', '', 'true', 'yes', '11', undefined]) {
      expect(onBaselineLane({ VERIFY_BASELINE_LANE: value })).toBe(false)
    }
    expect(onBaselineLane({})).toBe(false)
  })
})

// The pass drops an inherited marker ONCE, for every child it spawns. Writing
// the lane per spawn site was incomplete: run-all also starts the cross-browser
// check and Vitest (GPT-6 Astra, confirming review of a175498).
describe('the pass drops an inherited baseline marker', () => {
  it('removes the marker rather than overwriting it with a falsy value', () => {
    const env = { VERIFY_BASELINE_LANE: '1', PATH: '/usr/bin' }
    clearInheritedBaselineLane(env)
    expect('VERIFY_BASELINE_LANE' in env).toBe(false)
    expect(onBaselineLane(env)).toBe(false)
    expect(env.PATH).toBe('/usr/bin')
  })

  it('is harmless when there was no marker', () => {
    const env = { PATH: '/usr/bin' }
    expect(() => clearInheritedBaselineLane(env)).not.toThrow()
    expect(onBaselineLane(env)).toBe(false)
  })

  it('leaves a child spawned from the cleared environment off the baseline lane', () => {
    const passEnv = clearInheritedBaselineLane({ VERIFY_BASELINE_LANE: '1' })
    expect(onBaselineLane({ ...passEnv, BASE_URL: 'http://x' })).toBe(false)
  })

  // THE WIRING, NOT ONLY THE HELPER. Five cases that only exercise the helper
  // would all stay green if the call were deleted, which is exactly what the
  // review said about the previous round. The property is "no child of the pass
  // inherits the marker", and it holds only if the pass clears its OWN
  // environment before it spawns anything.
  it('is called by run-all before the pass spawns anything', () => {
    const source = readFileSync('scripts/verify/run-all.mjs', 'utf8')
    const cleared = source.indexOf('clearInheritedBaselineLane(process.env)')
    const firstSpawn = source.indexOf('spawnSync(')
    expect(cleared).toBeGreaterThan(-1)
    expect(firstSpawn).toBeGreaterThan(-1)
    expect(cleared).toBeLessThan(firstSpawn)
  })

  it('leaves run-all with no baseline-lane write of its own', () => {
    const source = readFileSync('scripts/verify/run-all.mjs', 'utf8')
    expect(source).not.toMatch(/VERIFY_BASELINE_LANE\s*:/)
  })
})

// A CURRENT RUN THAT DIED BEFORE NAMING ANYTHING IS NOT A CLEAN TREE — the CLI's
// false-clean path (cross-vendor review, 17.09.2026).
describe('the current tree must actually be clean to be called clean', () => {
  it('calls a run that named nothing clean only when it also ended cleanly', () => {
    expect(currentRunIsClean({ failed: [], exitCode: 0 })).toBe(true)
    expect(currentRunIsClean({ failed: [], exitCode: 1 })).toBe(false)
    expect(currentRunIsClean({ failed: [], exitCode: null })).toBe(false)
  })

  it('says nothing about a run that DID name a failing check — that is the ordinary path', () => {
    expect(currentRunIsClean({ failed: [{ key: 'a' }], exitCode: 1 })).toBe(false)
    expect(currentRunIsClean({ failed: [{ key: 'a' }], exitCode: 0 })).toBe(false)
  })
})
