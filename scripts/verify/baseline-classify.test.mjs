// Pins the red-triage logic of scripts/verify/baseline-classify-core.mjs
// (point 294): the repeat signature (same check twice vs different checks), the
// baseline classification (green→red = regression, red→red = pre-existing), the
// weak changed-file relatedness, and the printed report.
import { describe, expect, it } from 'vitest'
import {
  allChecks,
  baselineRunDeath,
  changeRelatedness,
  checkFromName,
  checkKey,
  classifyAgainstBaseline,
  consoleErrorChecks,
  failedChecks,
  foldBaselineRuns,
  formatBaselineReport,
  formatRepeatReport,
  normaliseErrorText,
  parseCheckLines,
  repeatSignature,
} from './baseline-classify-core.mjs'
import { parseWrapperArgs } from './baseline-classify.mjs'

// The live 27.07.2026 case: enrichments failed twice at DIFFERENT checks.
const RUN_1 = [
  'PASS  the traveller reaches the savanna — 12 objects',
  'FAIL  the streamed dressing does not grow — 0 objects at all',
  'FAIL  an elephant herd mourns at the graveyard — released:false',
  'PASS  the crocodile eye knobs sit above the snout — 2 knobs',
  'console errors: 0',
].join('\n')

const RUN_2 = [
  'PASS  the traveller reaches the savanna — 11 objects',
  'PASS  the streamed dressing does not grow — 41 objects',
  'PASS  an elephant herd mourns at the graveyard — released:true',
  'FAIL  the crocodile eye knobs sit above the snout — 0 knobs',
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

  it('lists failing and all-reached checks de-duplicated', () => {
    expect(failedChecks(RUN_1).map((c) => c.name)).toEqual([
      'the streamed dressing does not grow',
      'an elephant herd mourns at the graveyard',
    ])
    expect(allChecks(RUN_1)).toHaveLength(4)
    expect(failedChecks('FAIL  a — 1\nFAIL  a — 2')).toHaveLength(1)
  })
})

describe('the repeat signature of two runs', () => {
  it('calls DIFFERENT checks in the two runs a load signature, not a real failure', () => {
    const sig = repeatSignature({ first: RUN_1, second: RUN_2 })
    expect(sig.verdict).toBe('load-signature')
    expect(sig.stable).toEqual([])
    expect(sig.onlyFirst.map((c) => c.name)).toEqual([
      'the streamed dressing does not grow',
      'an elephant herd mourns at the graveyard',
    ])
    expect(sig.onlySecond.map((c) => c.name)).toEqual(['the crocodile eye knobs sit above the snout'])
    expect(sig.headline).toMatch(/LOAD/)
  })

  it('calls the SAME check failing twice a candidate real failure', () => {
    const sig = repeatSignature({ first: RUN_1, second: 'FAIL  an elephant herd mourns at the graveyard — released:false' })
    expect(sig.verdict).toBe('candidate-real')
    expect(sig.stable.map((c) => c.name)).toEqual(['an elephant herd mourns at the graveyard'])
    expect(sig.onlyFirst.map((c) => c.name)).toEqual(['the streamed dressing does not grow'])
  })

  it('matches a stable check across runs even when its detail numbers differ', () => {
    const sig = repeatSignature({ first: 'FAIL  12 vultures circle — 3 seen', second: 'FAIL  9 vultures circle — 1 seen' })
    expect(sig.verdict).toBe('candidate-real')
  })

  it('reports a green retry as cleared', () => {
    const sig = repeatSignature({ first: RUN_1, second: RUN_2, secondOk: true })
    expect(sig.verdict).toBe('flake-cleared')
  })

  it('refuses a verdict when a run printed no FAIL line at all (crash, timeout kill)', () => {
    const crash = repeatSignature({ first: RUN_1, second: 'Error: page.evaluate: Target closed' })
    expect(crash.verdict).toBe('unknown')
    // The headline must say which run went silent, and say it the right way
    // round — it is the sentence a human reads when nothing else is readable.
    expect(crash.headline).toBe('run 2 printed no FAIL line at all — a crash or a wall-timeout kill; read the output')
    expect(repeatSignature({ first: 'boom', second: 'boom' }).headline).toMatch(/^neither run printed a FAIL line at all/)
    expect(repeatSignature({ first: RUN_1, second: '', secondRan: false }).verdict).toBe('unknown')
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

  it('gives a console-only red a repeat signature instead of "unknown"', () => {
    const sig = repeatSignature({ first: OUT, second: 'ERR: WebGL: INVALID_OPERATION' })
    expect(sig.verdict).toBe('candidate-real')
    expect(sig.stable[0].name).toContain('INVALID_OPERATION')
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

describe('the weak changed-file relatedness signal', () => {
  it('marks a check whose name meets the diff, and one that does not', () => {
    const rel = changeRelatedness({
      checks: failedChecks(RUN_1),
      changedFiles: ['src/scenes/travel/floraStreaming.ts', 'src/config/balance.ts'],
    })
    expect(rel[0]).toMatchObject({ related: true })
    expect(rel[0].tokens).toContain('stream')
    expect(rel[1].related).toBe(false)
  })

  it('splits camelCase file names into words', () => {
    const rel = changeRelatedness({ checks: ['the crocodile eye knobs'], changedFiles: ['src/systems/CrocodileBody.tsx'] })
    expect(rel[0].tokens).toEqual(['crocodile'])
  })

  it('says nothing rather than false when there is no diff list', () => {
    expect(changeRelatedness({ checks: ['anything at all'], changedFiles: [] })[0].related).toBeNull()
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
  it('names the load signature and points at the quiet-machine rule', () => {
    const lines = formatRepeatReport({ suite: 'enrichments', signature: repeatSignature({ first: RUN_1, second: RUN_2 }) })
    expect(lines[0]).toContain('DIFFERENT checks')
    expect(lines.join('\n')).toContain('QUIET machine')
    expect(lines.join('\n')).not.toContain('a real failure, not a flake')
  })

  it('names the stable check and the baseline command on a candidate real failure', () => {
    const sig = repeatSignature({ first: RUN_1, second: 'FAIL  the streamed dressing does not grow — 0 objects' })
    const lines = formatRepeatReport({
      suite: 'enrichments',
      signature: sig,
      relatedness: changeRelatedness({ checks: sig.stable, changedFiles: ['src/scenes/travel/floraStreaming.ts'] }),
    })
    expect(lines[0]).toContain('CANDIDATE REAL FAILURE')
    expect(lines.join('\n')).toContain('touches the diff: stream')
    expect(lines.join('\n')).toContain('baseline-classify.mjs enrichments')
  })

  it('names the rotating checks beside a stable one', () => {
    const sig = repeatSignature({
      first: 'FAIL  the stable one\nFAIL  a rotating one',
      second: 'FAIL  the stable one\nFAIL  another rotating one',
    })
    expect(sig.verdict).toBe('candidate-real')
    expect(sig.headline).toContain('rotated between the runs')
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
