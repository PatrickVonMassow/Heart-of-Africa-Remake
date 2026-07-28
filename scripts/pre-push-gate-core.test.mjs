// The pre-push gate's decision (point 302). The rule it defends: CI must never
// be the first place a broken state is noticed, because a red run mails the
// user and a later fix does not unsend that mail.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { LEVEL } from './verify/machine-load-core.mjs'
import {
  FULL_GATE,
  GATE_COMMANDS,
  LIGHT_GATE,
  LOAD_LEVELS,
  PROTECTED_REF,
  UNAVAILABLE,
  decide,
  formatVerdict,
  gatePlan,
  gatePlanForPush,
  isProseOnlyPath,
  needsOpeningLoadReading,
  normaliseLoad,
  parsePushInput,
  runGate,
  shouldRetryAfterRed,
  worseLoad,
  DROP_ACK_ENV,
  GATE_STATE_FILE,
  TEST_FILE_PATTERNS,
  countTestFilesOnDisk,
  evaluateTestFileCount,
  formatUnitTotals,
  globToRegExp,
  looksLikeRunnerFailure,
  matchesTestPattern,
  parseGateState,
  parseUnitTotals,
  testFileBaseline,
  testFileRoots,
  withTestFileBaseline,
} from './pre-push-gate-core.mjs'

describe('parsePushInput', () => {
  it('reads git own pre-push lines', () => {
    const refs = parsePushInput(
      'refs/heads/main abc123 refs/heads/main def456\n' +
        'refs/heads/feat/x 111 refs/heads/feat/x 222\n',
    )
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ remoteRef: 'refs/heads/main', localSha: 'abc123', remoteSha: 'def456' })
    expect(refs[0].deleting).toBe(false)
  })

  it('marks an all-zero local sha as a deletion', () => {
    const [ref] = parsePushInput('(delete) 0000000000000000000000000000000000000000 refs/heads/old abc')
    expect(ref.deleting).toBe(true)
  })

  it('survives empty, blank and malformed input rather than throwing', () => {
    expect(parsePushInput('')).toEqual([])
    expect(parsePushInput('\n  \n')).toEqual([])
    expect(parsePushInput(null)).toEqual([])
    // A line without a remote ref is not a push target.
    expect(parsePushInput('onlyonefield')).toEqual([])
  })
})

describe('isProseOnlyPath — deliberately tiny, because docs are measured here', () => {
  it('accepts only what no test can read: the git-ignored board and the frames', () => {
    expect(isProseOnlyPath('.batch-dashboard.html')).toBe(true)
    expect(isProseOnlyPath('verification/travel-webgpu.png')).toBe(true)
  })

  it('refuses the documents this repository measures in its unit layer', () => {
    // Each of these is READ by a test that runs in npm run test:unit, so a
    // prose fast path over them would be green locally and red in CI — the
    // exact failure this gate exists to prevent (second-model finding).
    expect(isProseOnlyPath('TASKS.md')).toBe(false)
    expect(isProseOnlyPath('docs/tasks-archive.md')).toBe(false)
    expect(isProseOnlyPath('CLAUDE.md')).toBe(false)
    expect(isProseOnlyPath('design.md')).toBe(false)
    expect(isProseOnlyPath('docs/graphics-detail-levels.md')).toBe(false)
  })

  it('refuses everything a gate step can measure', () => {
    expect(isProseOnlyPath('src/config/balance.ts')).toBe(false)
    expect(isProseOnlyPath('scripts/board-core.mjs')).toBe(false)
    expect(isProseOnlyPath('package.json')).toBe(false)
    expect(isProseOnlyPath('.github/workflows/ci.yml')).toBe(false)
    expect(isProseOnlyPath('')).toBe(false)
  })

  it('reads a Windows path the same as a POSIX one', () => {
    expect(isProseOnlyPath('verification\\shot.png')).toBe(true)
    expect(isProseOnlyPath('src\\App.tsx')).toBe(false)
  })
})

describe('gatePlan', () => {
  it('runs everything CI runs on a push to the deployed branch', () => {
    const plan = gatePlan({ remoteRef: PROTECTED_REF, files: ['src/App.tsx'] })
    expect(plan.steps).toEqual(FULL_GATE)
  })

  it('takes the light gate only for the board and the frames, and never skips the audit', () => {
    const plan = gatePlan({ remoteRef: PROTECTED_REF, files: ['.batch-dashboard.html', 'verification/a.png'] })
    expect(plan.steps).toEqual(LIGHT_GATE)
    expect(plan.steps).toContain('audit')
  })

  it('takes the full gate when ONE file among the prose can break something', () => {
    const plan = gatePlan({ remoteRef: PROTECTED_REF, files: ['.batch-dashboard.html', 'src/App.tsx'] })
    expect(plan.steps).toEqual(FULL_GATE)
  })

  it('takes the full gate on main when the changed files are unknown', () => {
    // An unresolvable range must not read as "nothing to check".
    expect(gatePlan({ remoteRef: PROTECTED_REF, files: [] }).steps).toEqual(FULL_GATE)
  })

  it('keeps a feature branch on the light gate — agents push per commit', () => {
    const plan = gatePlan({ remoteRef: 'refs/heads/feat/369-orphan', files: ['src/App.tsx'] })
    expect(plan.steps).toEqual(LIGHT_GATE)
    expect(plan.reason).toMatch(/not refs\/heads\/main/)
  })

  it('checks nothing when a ref is being deleted', () => {
    expect(gatePlan({ remoteRef: PROTECTED_REF, deleting: true }).steps).toEqual([])
  })
})

describe('gatePlanForPush', () => {
  it('takes the widest plan when one push carries several refs', () => {
    const plan = gatePlanForPush([
      { remoteRef: 'refs/heads/feat/x', files: ['src/App.tsx'] },
      { remoteRef: PROTECTED_REF, files: ['src/App.tsx'] },
    ])
    expect(plan.steps).toEqual(FULL_GATE)
  })

  it('reports nothing to push for an empty or nonsense list', () => {
    expect(gatePlanForPush([]).steps).toEqual([])
    expect(gatePlanForPush(null).steps).toEqual([])
  })
})

describe('decide', () => {
  it('blocks on any red and names every failed step', () => {
    const v = decide([{ step: 'build', ok: true }, { step: 'lint', ok: false }])
    expect(v).toEqual({ blocked: true, failed: ['lint'], unavailable: [], retried: [] })
  })

  it('passes an all-green run', () => {
    expect(decide(FULL_GATE.map((step) => ({ step, ok: true })))).toEqual({
      blocked: false, failed: [], unavailable: [], retried: [],
    })
  })

  it('does not block on an empty or malformed result list — the wrapper fails open', () => {
    expect(decide([]).blocked).toBe(false)
    expect(decide(null).blocked).toBe(false)
    expect(decide([null, undefined]).blocked).toBe(false)
  })
})

describe('formatVerdict', () => {
  it('names the failing command, and does NOT advertise its own bypass', () => {
    const msg = formatVerdict({ blocked: true, failed: ['unit'] }, { reason: 'push to the deployed branch' })
    expect(msg).toMatch(/PUSH BLOCKED/)
    expect(msg).toContain(GATE_COMMANDS.unit.join(' '))
    // Most pushes here are made by autonomous agents; a failure message that
    // names the escape hatch invites the escape (second-model finding).
    expect(msg).not.toMatch(/--no-verify/)
  })

  it('says why it passed, so a light gate is never mistaken for a full one', () => {
    expect(formatVerdict({ blocked: false, failed: [] }, { reason: 'prose and board only' })).toMatch(
      /green \(prose and board only\)/,
    )
  })
})

describe('runGate — a synthetic failing state stops the push', () => {
  it('stops at the first red and never runs the rest', () => {
    const ran = []
    const results = runGate(FULL_GATE, (step) => {
      ran.push(step)
      return step !== 'lint'
    })
    expect(ran).toEqual(['build', 'lint'])
    expect(decide(results)).toEqual({ blocked: true, failed: ['lint'], unavailable: [], retried: [] })
  })

  it('runs every step when they all pass', () => {
    const results = runGate(FULL_GATE, () => true)
    expect(results.map((r) => r.step)).toEqual(FULL_GATE)
    expect(decide(results).blocked).toBe(false)
  })

  it('treats anything but a literal true as a failure', () => {
    // A runner returning an exit code, undefined or a truthy object must not be
    // read as success — that is how a gate silently stops gating.
    expect(decide(runGate(['lint'], () => 0)).blocked).toBe(true)
    expect(decide(runGate(['lint'], () => undefined)).blocked).toBe(true)
    expect(decide(runGate(['lint'], () => ({}))).blocked).toBe(true)
  })

  it('fails SOFT on a step that could not run at all, and keeps going', () => {
    // The house rule: fail-soft on an environment transient, fail-loud on a
    // product defect. An unreachable registry must not make the repository
    // unpushable (second-model finding).
    const ran = []
    const results = runGate(FULL_GATE, (step) => {
      ran.push(step)
      return step === 'audit' ? UNAVAILABLE : true
    })
    expect(ran).toEqual(FULL_GATE)
    const v = decide(results)
    expect(v.blocked).toBe(false)
    expect(v.unavailable).toEqual(['audit'])
  })

  it('says in the green line what was NOT checked, so a gap is never silent', () => {
    const msg = formatVerdict({ blocked: false, failed: [], unavailable: ['audit'] }, { reason: 'x' })
    expect(msg).toMatch(/audit could not run and was NOT checked/)
  })

  it('hands the runner the command the core owns, not one the caller invents', () => {
    const seen = []
    runGate(['audit'], (step, cmd) => {
      seen.push([step, cmd])
      return true
    })
    expect(seen).toEqual([['audit', GATE_COMMANDS.audit]])
  })
})

// The failure this repository actually had a second time (point 389): the gate
// measured the MACHINE. `npm run test:unit` passed standing alone, three times,
// while the same command inside the gate went red under two working agents. The
// asymmetry of point 296 decides it — load produces false REDS, never false
// greens — so a red under load buys ONE re-run, and nothing else moves.
describe('a red under load is not evidence — the gate re-runs it once (point 389)', () => {
  /** A runner scripted per step: an array of outcomes, one per attempt. */
  const scripted = (script, log = []) => (step, _cmd, opts = {}) => {
    log.push({ step, attempt: opts.attempt })
    const outcomes = script[step] ?? [true]
    return outcomes[Math.min((opts.attempt ?? 1) - 1, outcomes.length - 1)]
  }

  it('blocks a red taken on a QUIET machine immediately, with no retry', () => {
    const log = []
    const notices = []
    const results = runGate(['lint'], scripted({ lint: [false, true] }, log), {
      readLoad: () => ({ level: 'quiet', reasons: ['CPU 2 %, no competing run'] }),
      onNotice: (l) => notices.push(l),
    })
    // The second outcome in the script is green — and must never be reached.
    expect(log).toEqual([{ step: 'lint', attempt: 1 }])
    expect(decide(results).blocked).toBe(true)
    expect(notices).toEqual([])
  })

  it('re-runs the failing step ONCE on a loaded machine and uses the second result', () => {
    const log = []
    const notices = []
    const results = runGate(['lint', 'audit'], scripted({ lint: [false, true] }, log), {
      readLoad: () => ({ level: 'loaded', reasons: ['CPU 45 % across 16 cores'] }),
      onNotice: (l) => notices.push(l),
    })
    expect(log).toEqual([
      { step: 'lint', attempt: 1 },
      { step: 'lint', attempt: 2 },
      { step: 'audit', attempt: 1 },
    ])
    const v = decide(results)
    expect(v.blocked).toBe(false)
    expect(v.retried).toEqual(['lint'])
    // Visible, always: a silent retry would hide a real intermittent defect.
    expect(notices[0]).toMatch(/RETRY — lint was red on a machine that is loaded/)
    expect(notices[0]).toMatch(/CPU 45 %/)
    expect(notices[0]).toMatch(/A second red blocks the push/)
    expect(notices[1]).toMatch(/lint passed on the re-run/)
    expect(notices).toHaveLength(2)
  })

  it('blocks a step that fails TWICE, whatever the machine says', () => {
    for (const level of ['quiet', 'busy', 'loaded', 'unknown']) {
      const log = []
      const results = runGate(['lint'], scripted({ lint: [false, false] }, log), { readLoad: () => ({ level }) })
      const v = decide(results)
      expect(v.blocked, `a double red must block on a ${level} machine`).toBe(true)
      expect(v.failed).toEqual(['lint'])
      // One retry, never two.
      expect(log.length).toBe(level === 'quiet' ? 1 : 2)
    }
  })

  it('emits the retry line in EXACTLY the retry case', () => {
    const green = []
    runGate(FULL_GATE, () => true, { readLoad: () => ({ level: 'loaded' }), onNotice: (l) => green.push(l) })
    expect(green).toEqual([])

    const quietRed = []
    runGate(['lint'], () => false, { readLoad: () => ({ level: 'quiet' }), onNotice: (l) => quietRed.push(l) })
    expect(quietRed).toEqual([])

    const loadedRed = []
    runGate(['lint'], () => false, { readLoad: () => ({ level: 'busy' }), onNotice: (l) => loadedRed.push(l) })
    expect(loadedRed[0]).toMatch(/RETRY/)
    expect(loadedRed[1]).toMatch(/failed AGAIN — this red is evidence/)
  })

  it('retries where the quiet could not be verified — unmeasured is not quiet', () => {
    expect(shouldRetryAfterRed('quiet')).toBe(false)
    for (const level of ['busy', 'loaded', 'unknown', undefined, null, '']) {
      expect(shouldRetryAfterRed(level), `${level} is not quiet`).toBe(true)
    }
  })

  it('treats a load probe that THROWS as unmeasured, not as quiet', () => {
    const log = []
    const results = runGate(['lint'], scripted({ lint: [false, true] }, log), {
      readLoad: () => {
        throw new Error('powershell died')
      },
    })
    expect(log).toHaveLength(2)
    expect(decide(results).blocked).toBe(false)
  })

  it('behaves exactly as before when no load reader is injected', () => {
    const log = []
    const results = runGate(['lint'], scripted({ lint: [false, true] }, log))
    expect(log).toEqual([{ step: 'lint', attempt: 1 }])
    expect(decide(results).blocked).toBe(true)
  })

  it('keeps failing soft when the RE-RUN cannot run at all, and does not call that a pass', () => {
    const notices = []
    const results = runGate(['audit', 'unit'], (step, _cmd, { attempt }) =>
      step === 'audit' ? (attempt === 1 ? false : UNAVAILABLE) : true, {
      readLoad: () => ({ level: 'loaded' }),
      onNotice: (l) => notices.push(l),
    })
    const v = decide(results)
    expect(v.blocked).toBe(false)
    expect(v.unavailable).toEqual(['audit'])
    expect(v.retried).toEqual(['audit'])
    // It neither passed nor was re-measured — saying "passed on the re-run" here
    // would assert something untrue (four-eyes finding).
    expect(notices[1]).toMatch(/the re-run of audit could not RUN — it was neither confirmed nor cleared/)
    expect(notices[1]).not.toMatch(/passed/)
  })
})

describe('the load reading is taken where a storm can hide (point 389)', () => {
  it('takes an opening reading only for the minute-long steps', () => {
    // Measured 28.07.2026: the probe costs 2.6 s, lint 0.5 s and audit 1.6 s. A
    // pre-reading would more than double a feature-branch push for a spike that
    // cannot hide inside a half-second run.
    expect(needsOpeningLoadReading(LIGHT_GATE)).toBe(false)
    expect(needsOpeningLoadReading(FULL_GATE)).toBe(true)
    expect(needsOpeningLoadReading(['unit'])).toBe(true)
    expect(needsOpeningLoadReading([])).toBe(false)
    expect(needsOpeningLoadReading(null)).toBe(false)
  })

  it('asks the probe once at the start and once per red on the full gate', () => {
    const asked = []
    runGate(FULL_GATE, (step) => step !== 'unit', {
      readLoad: (q) => {
        asked.push(q)
        return { level: 'quiet' }
      },
    })
    expect(asked).toEqual([{ when: 'start', step: null }, { when: 'red', step: 'unit' }])
  })

  it('never spends a probe on a green light-gate push', () => {
    const asked = []
    runGate(LIGHT_GATE, () => true, { readLoad: (q) => asked.push(q) })
    expect(asked).toEqual([])
  })

  it('does not let a lull AFTER the storm certify a red', () => {
    // The probe is a snapshot: a red produced while a neighbour built can be
    // followed a second later by a quiet reading. The worse of the two decides.
    const notices = []
    const readings = [{ level: 'loaded', reasons: ['a competing vitest run'] }, { level: 'quiet' }]
    const results = runGate(['unit'], (_step, _cmd, { attempt }) => attempt !== 1, {
      readLoad: () => readings.shift(),
      onNotice: (l) => notices.push(l),
    })
    expect(decide(results)).toMatchObject({ blocked: false, retried: ['unit'] })
    // Both readings were spent, and the retry named the LOADED one.
    expect(readings).toEqual([])
    expect(notices[0]).toMatch(/a competing vitest run/)
  })

  it('picks the least quiet reading, and normalises whatever shape it gets', () => {
    expect(worseLoad({ level: 'quiet' }, { level: 'busy' }).level).toBe('busy')
    expect(worseLoad({ level: 'loaded' }, { level: 'quiet' }).level).toBe('loaded')
    expect(worseLoad({ level: 'quiet' }, { level: 'unknown' }).level).toBe('unknown')
    expect(worseLoad(null, 'busy').level).toBe('busy')
    expect(worseLoad('quiet', null).level).toBe('quiet')
    expect(worseLoad(null, null)).toBe(null)
    expect(normaliseLoad(undefined).level).toBe('unknown')
    expect(normaliseLoad('quiet')).toEqual({ level: 'quiet', why: '' })
    expect(normaliseLoad({ level: 'busy', reasons: ['a', 'b'] }).why).toBe('a; b')
    // Normalising an already normalised reading keeps its reason — worseLoad
    // does exactly that on its way to the retry line.
    expect(worseLoad({ level: 'quiet' }, normaliseLoad({ level: 'busy', reasons: ['CPU 45 %'] })).why).toBe('CPU 45 %')
  })

  it('says in the verdict that a green only came on a re-run', () => {
    expect(formatVerdict({ blocked: false, failed: [], retried: ['unit'] }, { reason: 'x' })).toMatch(
      /unit was re-run once after a red taken under load/,
    )
    const blocked = formatVerdict({ blocked: true, failed: ['unit'], retried: ['unit'] }, { reason: 'x' })
    expect(blocked).toMatch(/unit was red on BOTH runs/)
    // It says the re-run did not CLEAR the red — never that the load was not the
    // cause. That assertion was false and was measured false on 28.07.2026: the
    // load never went away between the two runs, so a second red under the same
    // constant load rules nothing out (four-eyes correction).
    expect(blocked).not.toMatch(/the load was not the cause/)
    expect(blocked).toMatch(/may well have persisted across both/)
    // A step re-run GREEN, with a later step red, must not be reported as twice-failed.
    expect(formatVerdict({ blocked: true, failed: ['unit'], retried: ['lint'] }, { reason: 'x' })).not.toMatch(
      /red on BOTH runs/,
    )
  })

  it('never THROWS while formatting a block — the wrapper fails open on a throw', () => {
    // A formatting error would turn a blocked push into an allowed one, which is
    // the one direction this gate must never move.
    expect(() => formatVerdict({ blocked: true, failed: ['unit'], retried: null, unavailable: null })).not.toThrow()
    expect(() => formatVerdict({ blocked: true })).not.toThrow()
    expect(() => formatVerdict()).not.toThrow()
    expect(formatVerdict({ blocked: true, failed: ['unit'], retried: null })).toMatch(/PUSH BLOCKED/)
  })
})

// The wrapper reads the machine through another script's --json output, and a
// silently drifted shape would degrade EVERY reading to `unknown` — which turns
// "a quiet red blocks immediately" into "every red buys a retry", on every
// machine, with nothing red to notice it (four-eyes finding).
describe('the load probe contract the wrapper depends on', () => {
  // ASYNC on purpose: a spawnSync here blocks the vitest worker thread, and a
  // blocked worker misses its own `onTaskUpdate` RPC — measured, it turned the
  // whole unit run red (all 4037 tests passing, "Errors 1 error", exit 1) while
  // the identical run without this file exited 0.
  it('answers with a top-level level from the known set, and its reasons', async () => {
    const { code, stdout } = await new Promise((done) => {
      execFile(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/verify/machine-load.mjs'), '--json'],
        // Forced, so this pins the SHAPE in a fixed moment rather than measuring
        // the machine — the documented wiring self-test of point 296.
        { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, VERIFY_LOAD_FORCE: 'busy' }, timeout: 30000 },
        // A NON-ZERO exit is expected here: the probe exits 2 on a machine that
        // is not quiet. The wrapper reads its stdout, not its status, and this
        // test pins exactly that.
        (err, out) => done({ code: err?.code ?? 0, stdout: out }),
      )
    })
    expect(code).toBe(2)
    const parsed = JSON.parse(stdout)
    expect(LOAD_LEVELS).toContain(parsed.level)
    expect(parsed.level).toBe('busy')
    expect(Array.isArray(parsed.reasons)).toBe(true)
  })

  it('knows exactly the four levels machine-load-core classifies into', () => {
    expect([...LOAD_LEVELS].sort()).toEqual([...Object.values(LEVEL)].sort())
  })
})

// The failure this repository actually had: a pre-push gate existed while
// core.hooksPath was unset, so it could never fire. Presence is not wiring.
describe('the gate is wired, not merely present', () => {
  const read = (p) => readFileSync(resolve(REPO_ROOT, p), 'utf8')

  it('has a versioned pre-push hook that calls the gate', () => {
    const hook = read('scripts/git-hooks/pre-push')
    expect(hook).toMatch(/^#!\/bin\/sh/)
    expect(hook).toContain('scripts/pre-push-gate.mjs')
    // A worktree on a branch that predates the gate must stay pushable.
    expect(hook).toContain('[ -f scripts/pre-push-gate.mjs ] || exit 0')
  })

  it('wires core.hooksPath from npm install rather than from memory', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.prepare).toContain('scripts/enable-hooks.mjs')
    expect(read('scripts/enable-hooks.mjs')).toContain('core.hooksPath')
  })
})

describe('the commands are the ones CI runs', () => {
  it('defines a command for every step of both gates', () => {
    for (const step of new Set([...FULL_GATE, ...LIGHT_GATE])) {
      expect(GATE_COMMANDS[step], `no command for gate step ${step}`).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// A passing count over a set that silently SHRANK (point 404).
//
// 28.07.2026: one unit run reported 3546 passing tests while 34 test FILES had
// failed to load; the run an hour earlier had 4214 tests over 153 files. An
// unloadable suite does not fail — it vanishes from the totals — so the report
// read GREENER than a red run and every gate waved it through.
// ---------------------------------------------------------------------------

const ESC = String.fromCharCode(27)
/** A vitest summary as it really arrives: coloured, even through a pipe. */
const summary = (files, tests) =>
  `${ESC}[2m Test Files ${ESC}[22m ${ESC}[1m${ESC}[32m${files} passed${ESC}[39m${ESC}[22m${ESC}[90m (${files})${ESC}[39m\n` +
  `${ESC}[2m      Tests ${ESC}[22m ${ESC}[1m${ESC}[32m${tests} passed${ESC}[39m${ESC}[22m${ESC}[90m (${tests})${ESC}[39m\n`

describe('parseUnitTotals — reading how large the evidence base was', () => {
  it('reads both numbers out of a plain summary', () => {
    expect(parseUnitTotals(' Test Files  153 passed (153)\n      Tests  4214 passed (4214)\n')).toMatchObject({
      files: 153,
      tests: 4214,
    })
  })

  it('strips the colour escapes vitest emits even through a pipe', () => {
    expect(parseUnitTotals(summary(153, 4214))).toMatchObject({ files: 153, tests: 4214 })
  })

  it('takes the parenthesised TOTAL, not only what passed', () => {
    const out = ' Test Files  34 failed | 119 passed (153)\n      Tests  3 failed | 4211 passed (4214)\n'
    expect(parseUnitTotals(out)).toMatchObject({ files: 153, tests: 4214, failedFiles: 34, failedTests: 3 })
  })

  it('sums the named categories where a line carries no total', () => {
    expect(parseUnitTotals(' Test Files  2 failed | 5 passed\n      Tests  9 passed | 1 skipped\n')).toMatchObject({
      files: 7,
      tests: 10,
    })
  })

  it('never mistakes the "Test Files" line for the "Tests" line', () => {
    // The labels overlap; a sloppy regex reads the file count as the test count.
    expect(parseUnitTotals(' Test Files  1 passed (1)\n').tests).toBeNull()
  })

  it('takes the LAST summary, because a failure report prints the words earlier', () => {
    const out = 'Test Files 3 failed\nsome noise\n Test Files  153 passed (153)\n      Tests  4214 passed (4214)\n'
    expect(parseUnitTotals(out).files).toBe(153)
  })

  it('counts the FAILURES a summary names, and zero where it names none', () => {
    expect(parseUnitTotals(summary(153, 4214))).toMatchObject({ failedFiles: 0, failedTests: 0 })
    expect(parseUnitTotals('no summary at all')).toMatchObject({ failedFiles: null, failedTests: null })
  })

  it('a garbled parse yields nulls and NEVER throws', () => {
    for (const input of ['', null, undefined, 'no summary here at all', 'Test Files  who knows', {}, 42]) {
      expect(() => parseUnitTotals(input)).not.toThrow()
      expect(parseUnitTotals(input).files).toBeNull()
    }
  })

  // stdout and stderr are concatenated for DISPLAY, and the parser takes the
  // LAST occurrence — so a stray count arriving on stderr after the real summary
  // would win and yield a WRONG number, which is worse than no number. No
  // current producer emits one; the hypothesis is closed cheaply (four-eyes).
  describe('when the two streams are kept apart, STDOUT decides', () => {
    it('prefers the summary vitest printed on stdout over a later one on stderr', () => {
      const v = parseUnitTotals({
        stdout: ' Test Files  153 passed (153)\n      Tests  4214 passed (4214)\n',
        stderr: ' Test Files  1 passed (1)\n      Tests  1 passed (1)\n',
      })
      expect(v).toMatchObject({ files: 153, tests: 4214 })
    })

    it('still lets stderr FILL a number stdout does not carry', () => {
      const v = parseUnitTotals({ stdout: ' Test Files  153 passed (153)\n', stderr: '      Tests  4214 passed (4214)\n' })
      expect(v).toMatchObject({ files: 153, tests: 4214 })
    })

    it('reads a stream pair with nothing in it as unreadable rather than throwing', () => {
      expect(() => parseUnitTotals({ stdout: '', stderr: '' })).not.toThrow()
      expect(parseUnitTotals({ stdout: '', stderr: '' }).files).toBeNull()
      expect(parseUnitTotals({ stdout: null, stderr: undefined }).tests).toBeNull()
    })
  })
})

describe('looksLikeRunnerFailure — a runner that DIED is not a test that failed', () => {
  it('recognises a complete passing summary beside a non-zero exit', () => {
    // Measured three times on 28.07.2026: every test passing, exit 1, on a
    // `[vitest-worker]: Timeout calling "onTaskUpdate"` under constant load.
    expect(looksLikeRunnerFailure(parseUnitTotals(summary(153, 4245)))).toBe(true)
  })

  it('does NOT claim it where a test really failed, or where nothing could be read', () => {
    expect(looksLikeRunnerFailure(parseUnitTotals(' Test Files  1 failed | 152 passed (153)\n      Tests  2 failed | 4243 passed (4245)\n'))).toBe(false)
    expect(looksLikeRunnerFailure(parseUnitTotals('nothing readable'))).toBe(false)
    expect(looksLikeRunnerFailure()).toBe(false)
  })
})

describe('formatUnitTotals — both numbers in the gate own line', () => {
  it('reads "153 files / 4214 tests"', () => {
    expect(formatUnitTotals({ files: 153, tests: 4214 })).toBe('153 files / 4214 tests')
  })

  it('says what it could not read instead of inventing a zero', () => {
    expect(formatUnitTotals({ files: null, tests: 4214 })).toBe('an unreadable file count / 4214 tests')
    expect(formatUnitTotals()).toBe('an unreadable file count / an unreadable test count')
  })
})

describe('the baseline state — the gate own memory of the last green run', () => {
  it('is a git-ignored path, so it is never pushed between checkouts', () => {
    expect(GATE_STATE_FILE).toBe('.claude/pre-push-gate-state.json')
    expect(readFileSync(resolve(REPO_ROOT, '.gitignore'), 'utf8')).toContain(GATE_STATE_FILE)
  })

  it('survives a missing, empty or garbled file rather than throwing', () => {
    for (const input of ['', null, undefined, 'not json', '[]', '"a string"', '7']) {
      expect(() => parseGateState(input)).not.toThrow()
      expect(testFileBaseline(parseGateState(input))).toBeNull()
    }
  })

  it('round-trips a recorded count', () => {
    const state = withTestFileBaseline({}, { files: 153, tests: 4214, at: '2026-07-28T00:00:00.000Z' })
    expect(testFileBaseline(state)).toBe(153)
    expect(testFileBaseline(parseGateState(JSON.stringify(state)))).toBe(153)
  })

  it('keeps whatever else the file carried, so the state can grow', () => {
    const state = withTestFileBaseline({ somethingElse: 'kept' }, { files: 10, tests: 20 })
    expect(state.somethingElse).toBe('kept')
  })

  it('leaves an auditable trace ONLY where the escape hatch was used', () => {
    expect(withTestFileBaseline({}, { files: 153, tests: 4214, onDisk: 153 }).unit).not.toHaveProperty(
      'acknowledgedDropFrom',
    )
    const waved = withTestFileBaseline({}, { files: 119, tests: 3546, onDisk: 153, acknowledgedDropFrom: 153 })
    expect(waved.unit.acknowledgedDropFrom).toBe(153)
    expect(waved.unit.onDisk).toBe(153)
    // It round-trips, so the trace survives the next read of the file.
    expect(parseGateState(JSON.stringify(waved)).unit.acknowledgedDropFrom).toBe(153)
  })

  it('refuses a nonsense count rather than recording it as a baseline', () => {
    expect(testFileBaseline(withTestFileBaseline({}, { files: 'lots' }))).toBeNull()
    expect(testFileBaseline(withTestFileBaseline({}, { files: -1 }))).toBeNull()
    expect(testFileBaseline(withTestFileBaseline({}, {}))).toBeNull()
  })
})

describe('evaluateTestFileCount — a shrinking evidence base is as serious as a failure', () => {
  // `onDisk` defaults to "every executed file is all there is", i.e. a healthy
  // tree; the cases that matter set it explicitly.
  const run = (files, baseline, { tests = 4214, unitOk = true, onDisk = files, acknowledged = false } = {}) =>
    evaluateTestFileCount({ totals: { files, tests, failedFiles: 0, failedTests: 0 }, baseline, unitOk, onDisk, acknowledged })

  it('a HIGHER count passes and advances the baseline', () => {
    const v = run(160, 153)
    expect(v.blocked).toBe(false)
    expect(v.status).toBe('grew')
    expect(v.nextBaseline).toBe(160)
    expect(v.line).toContain('160 files / 4214 tests')
  })

  it('an EQUAL count passes and leaves the baseline where it is', () => {
    const v = run(153, 153)
    expect(v.blocked).toBe(false)
    expect(v.status).toBe('same')
    expect(v.nextBaseline).toBe(153)
  })

  it('a LOWER count is RED and names BOTH numbers', () => {
    // The incident, replayed: 153 files / 4214 tests became 119 / 3546, with all
    // 153 files still lying in the tree.
    const v = run(119, 153, { tests: 3546, onDisk: 153 })
    expect(v.blocked).toBe(true)
    expect(v.status).toBe('missing-suites')
    expect(v.line).toMatch(/PUSH BLOCKED/)
    expect(v.line).toContain('119')
    expect(v.line).toContain('153')
    // Both totals, not only the file count — the report that read greener said
    // 3546 tests, and that number is the reader own anchor to the incident.
    expect(v.line).toContain('119 files / 3546 tests')
    expect(v.line).toContain(GATE_COMMANDS.unit.join(' '))
  })

  it('a MISSING baseline records and passes — the first run never blocks', () => {
    const v = run(153, null)
    expect(v.blocked).toBe(false)
    expect(v.status).toBe('first')
    expect(v.nextBaseline).toBe(153)
    expect(v.line).toContain('153 files / 4214 tests')
    // Fail-open on first use, stated in the line the developer reads.
    expect(v.line).toMatch(/never blocks/i)
    expect(evaluateTestFileCount({ totals: { files: 153 } }).blocked).toBe(false)
  })

  it('does NOT compare against a hard-coded number — only against the last green run', () => {
    // The same count is fine under one baseline and red under another; nothing
    // in the module knows how many suites this repository "should" have.
    expect(run(500, 400).blocked).toBe(false)
    expect(run(500, 600, { onDisk: null }).blocked).toBe(true)
  })

  it('never blocks on an unreadable count, and never records one', () => {
    const v = evaluateTestFileCount({ totals: parseUnitTotals('garbage'), baseline: 153, onDisk: 153 })
    expect(v.blocked).toBe(false)
    expect(v.status).toBe('unreadable')
    expect(v.nextBaseline).toBe(153)
    expect(v.line).toContain('153 files')
  })

  it('takes no baseline from a RED unit run — its count says nothing about the true size', () => {
    const v = run(119, 153, { tests: 3546, unitOk: false, onDisk: 153 })
    expect(v.status).toBe('red-run')
    expect(v.nextBaseline).toBe(153)
    // Already blocked by the step itself; a second block would only add noise.
    expect(v.blocked).toBe(false)
  })

  it('names what was OBSERVED when the runner died instead of asserting a cause', () => {
    // Measured 28.07.2026: all tests passing, exit non-zero, under constant load
    // from parallel agents. The gate must not call that the code, and must not
    // pass it either — a run that could not finish proved nothing.
    const v = evaluateTestFileCount({
      totals: parseUnitTotals(summary(153, 4245)),
      baseline: 153,
      unitOk: false,
      onDisk: 153,
    })
    expect(v.status).toBe('red-run')
    expect(v.runnerLikelyDied).toBe(true)
    expect(v.blocked).toBe(false)
    expect(v.line).toMatch(/NO failing test/)
    expect(v.line).toMatch(/exited non-zero/)
    expect(v.line).toMatch(/onTaskUpdate/)
    expect(v.line).toMatch(/may be loaded/)
    expect(v.line).toMatch(/It still blocks/)
    // The honest version of the old claim: it does NOT assert the code was fine.
    expect(v.line).not.toMatch(/the load was not the cause/)
  })

  it('survives being called with nothing at all', () => {
    expect(() => evaluateTestFileCount()).not.toThrow()
    expect(evaluateTestFileCount().blocked).toBe(false)
  })
})

// The four-eyes finding this gate was rebuilt for: block-ONCE-and-record waved
// through exactly the failure it exists to catch. A damaged tree dropped 153
// files to 119, push #1 blocked and recorded 119, push #2 — the tree still
// damaged, 34 suites still invisible — passed, because 119 === 119. And in this
// repository most pushes come from autonomous agents whose natural reaction to a
// red gate is `npm ci` and another push.
//
// The discriminator is on disk: a DELETED suite leaves the tree, an UNLOADABLE
// one does not.
describe('the on-disk floor: re-running does not clear what re-running did not fix', () => {
  const run = (files, baseline, onDisk, extra = {}) =>
    evaluateTestFileCount({ totals: { files, tests: files * 30, failedFiles: 0, failedTests: 0 }, baseline, onDisk, ...extra })

  it('BLOCKS the second push too, while the suites are still lying in the tree', () => {
    const first = run(119, 153, 153)
    expect(first.blocked).toBe(true)
    // Nothing is recorded, so the baseline the next run compares against is the
    // one from the last HEALTHY run — not the damaged count.
    expect(first.nextBaseline).toBe(153)
    const second = run(119, first.nextBaseline, 153)
    expect(second.blocked).toBe(true)
    expect(second.status).toBe('missing-suites')
  })

  it('blocks even where the count matches the baseline exactly — the tree still disagrees', () => {
    // The poisoned-baseline case: if 119 had somehow been recorded, 119 === 119
    // must STILL not pass while 34 files did not run.
    const v = run(119, 119, 153)
    expect(v.blocked).toBe(true)
    expect(v.status).toBe('missing-suites')
    expect(v.line).toMatch(/34 test files in this checkout did NOT run/)
    expect(v.line).toMatch(/still lying in it/)
  })

  it('closes the fresh-checkout hole: a first run over a damaged tree records NOTHING', () => {
    // A fresh clone or worktree starts with no baseline and used to record
    // whatever it first saw — including an already-shrunk count (finding 2.2).
    const v = run(119, null, 153)
    expect(v.blocked).toBe(true)
    expect(v.status).toBe('missing-suites')
    expect(v.nextBaseline).toBeNull()
    expect(v.line).toMatch(/no baseline is recorded/)
  })

  it('ACCEPTS a genuinely deleted suite at once, with no second push and no flag', () => {
    // The file left the tree, so the drop is explained: 152 ran, 152 are there.
    const v = run(152, 153, 152)
    expect(v.blocked).toBe(false)
    expect(v.status).toBe('shrank-deleted')
    expect(v.nextBaseline).toBe(152)
    expect(v.line).toMatch(/GONE from the tree rather than failing to load/)
    expect(v.line).toContain('152')
  })

  it('blocks a drop it cannot verify because the tree could not be counted', () => {
    const v = run(119, 153, null)
    expect(v.blocked).toBe(true)
    expect(v.status).toBe('shrank-unverified')
    expect(v.nextBaseline).toBe(153)
    expect(v.line).toMatch(/could not be counted/)
    expect(v.line).toMatch(/re-running alone will not clear this/)
  })

  it('never blocks on MORE files than the tree lists — an untracked new suite is not a shrink', () => {
    // The floor only ever fires downwards; a suite written but not yet visible
    // to whatever listed the tree must not read as damage.
    expect(run(154, 153, 153).blocked).toBe(false)
    expect(run(154, 153, 153).status).toBe('grew')
  })

  it('offers a NAMED acknowledgement as the second escape hatch, and records it as such', () => {
    const v = run(119, 153, 153, { acknowledged: true })
    expect(v.blocked).toBe(false)
    expect(v.status).toBe('acknowledged')
    expect(v.nextBaseline).toBe(119)
    expect(v.line).toContain(DROP_ACK_ENV)
    // Named in the blocking message too, so the hatch is findable without being
    // the thing a re-run stumbles into.
    expect(run(119, 153, 153).line).toContain(`${DROP_ACK_ENV}=1`)
  })

  it('leaves the acknowledgement inert where nothing was unexplained', () => {
    // The flag must not become a general "record whatever ran" switch.
    expect(run(153, 153, 153, { acknowledged: true }).status).toBe('same')
    expect(run(152, 153, 152, { acknowledged: true }).status).toBe('shrank-deleted')
  })
})

describe('counting the test files a checkout holds', () => {
  it('mirrors the include globs vitest itself collects with', () => {
    // The floor is only as good as this mirror: an include list changed in the
    // config without this constant would silently detune it, so the two are
    // pinned identical here rather than trusted to stay in step.
    const config = readFileSync(resolve(REPO_ROOT, 'vitest.config.ts'), 'utf8')
    const include = /include:\s*\[([^\]]*)\]/.exec(config)
    expect(include, 'vitest.config.ts no longer declares test.include as a literal array').toBeTruthy()
    const patterns = [...include[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns).toEqual(TEST_FILE_PATTERNS)
  })

  it('matches exactly what those globs cover, and nothing else', () => {
    expect(matchesTestPattern('src/state/ui.test.ts')).toBe(true)
    expect(matchesTestPattern('src/ui/Hud.test.tsx')).toBe(true)
    expect(matchesTestPattern('src/App.test.ts')).toBe(true)
    expect(matchesTestPattern('scripts/pre-push-gate-core.test.mjs')).toBe(true)
    expect(matchesTestPattern('scripts/verify/tiers.test.mjs')).toBe(true)
    // Not test files, or not in a collected root.
    expect(matchesTestPattern('src/state/ui.ts')).toBe(false)
    expect(matchesTestPattern('src/state/ui.test.js')).toBe(false)
    expect(matchesTestPattern('scripts/pre-push-gate-core.mjs')).toBe(false)
    expect(matchesTestPattern('scripts/verify/tiers.test.ts')).toBe(false)
    expect(matchesTestPattern('docs/x.test.ts')).toBe(false)
    expect(matchesTestPattern('')).toBe(false)
    expect(matchesTestPattern(null)).toBe(false)
  })

  it('reads a Windows path the same as a POSIX one', () => {
    expect(matchesTestPattern('src\\state\\ui.test.ts')).toBe(true)
  })

  it('walks only the roots the globs start in — never the whole repository', () => {
    // The one moment this count matters is the moment node_modules is the broken
    // thing; a walk of the repository root would descend straight into it.
    expect([...testFileRoots()].sort()).toEqual(['scripts', 'src'])
    expect(testFileRoots(['a/b/**/*.test.mjs'])).toEqual(['a/b'])
    expect(testFileRoots(['*.test.mjs'])).toEqual(['.'])
  })

  it('counts each matching path once and ignores the rest', () => {
    const tree = [
      'src/a.test.ts', 'src/deep/b.test.tsx', 'src/a.test.ts',
      'src/a.ts', 'scripts/c.test.mjs', 'scripts/c.mjs', 'src/notes.md',
    ]
    expect(countTestFilesOnDisk(tree)).toBe(3)
    expect(countTestFilesOnDisk([])).toBe(0)
    expect(countTestFilesOnDisk(null)).toBe(0)
  })

  it('agrees with the number this repository actually holds', () => {
    // A live wiring check: the same walk the wrapper does, against a tree that
    // really exists. A glob translation that silently matched nothing would pass
    // every synthetic case above and make the floor a no-op.
    const roots = testFileRoots()
    const found = []
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(resolve(dir, entry.name), rel)
        else if (entry.isFile()) found.push(rel)
      }
    }
    for (const root of roots) walk(resolve(REPO_ROOT, root), root)
    // This very file is one of them, so the count can never legitimately be 0.
    expect(countTestFilesOnDisk(found)).toBeGreaterThan(50)
    expect(found.filter((f) => matchesTestPattern(f))).toContain('scripts/pre-push-gate-core.test.mjs')
  })

  it('translates the glob forms these patterns use, and nothing exotic', () => {
    expect(globToRegExp('src/**/*.test.{ts,tsx}').test('src/a/b/c.test.tsx')).toBe(true)
    // `**/` must span ZERO directories as well as many.
    expect(globToRegExp('src/**/*.test.ts').test('src/c.test.ts')).toBe(true)
    // `*` stays inside one segment.
    expect(globToRegExp('src/*.test.ts').test('src/a/b.test.ts')).toBe(false)
    expect(globToRegExp('src/?.test.ts').test('src/a.test.ts')).toBe(true)
    // A dot is a literal, not "any character".
    expect(globToRegExp('src/a.test.ts').test('src/axtest.ts')).toBe(false)
    // Anchored at both ends: a suffix match is not a match.
    expect(globToRegExp('src/a.test.ts').test('other/src/a.test.ts')).toBe(false)
    expect(globToRegExp('src/a.test.ts').test('src/a.test.tsx')).toBe(false)
    expect(() => globToRegExp('src/{unclosed')).not.toThrow()
  })
})

describe('the count reaches the verdict (point 404)', () => {
  const green = FULL_GATE.map((step) => ({ step, ok: true }))

  it('blocks the push on a shrink even though every step passed', () => {
    const count = evaluateTestFileCount({ totals: { files: 119, tests: 3546 }, baseline: 153 })
    const verdict = decide(green, count)
    expect(verdict.blocked).toBe(true)
    expect(verdict.failed).toEqual([])
    const msg = formatVerdict(verdict, { reason: 'push to the deployed branch' })
    expect(msg).toMatch(/PUSH BLOCKED/)
    expect(msg).toContain('119')
    expect(msg).toContain('153')
    // Blocked by the count ALONE: no empty "the fast gate is red: " headline.
    expect(msg).not.toMatch(/the fast gate is red: *$/m)
  })

  it('reports both numbers on a GREEN push too, so a shrink is visible before it blocks', () => {
    const count = evaluateTestFileCount({ totals: { files: 153, tests: 4214 }, baseline: 153 })
    const msg = formatVerdict(decide(green, count), { reason: 'push to the deployed branch' })
    expect(msg).toContain('153 files / 4214 tests')
    expect(msg).toMatch(/pre-push gate: green/)
  })

  it('still names a red STEP when both it and the count are unhappy', () => {
    const count = evaluateTestFileCount({ totals: { files: 119 }, baseline: 153 })
    const msg = formatVerdict(decide([{ step: 'lint', ok: false }], count), { reason: 'push to the deployed branch' })
    expect(msg).toContain('the fast gate is red: lint')
    expect(msg).toContain('119')
  })

  it('leaves the verdict shape untouched where no count was taken', () => {
    expect(decide(green)).toEqual({ blocked: false, failed: [], unavailable: [], retried: [] })
    expect(decide(green, null)).toEqual({ blocked: false, failed: [], unavailable: [], retried: [] })
  })
})

describe('the wrapper actually asks the question', () => {
  const wrapper = readFileSync(resolve(REPO_ROOT, 'scripts/pre-push-gate.mjs'), 'utf8')

  it('captures the unit output rather than only inheriting it', () => {
    // Without a captured stream there is nothing to count, and the gate would be
    // present but blind — the failure mode this repository already had once.
    expect(wrapper).toContain('evaluateTestFileCount')
    expect(wrapper).toContain('parseUnitTotals')
    expect(wrapper).toMatch(/'inherit', 'pipe', 'pipe'/)
  })

  it('prints the captured output, so nothing disappears from the scrollback', () => {
    expect(wrapper).toContain('unitOutput.stdout')
    expect(wrapper).toMatch(/process\.stdout\.write\(/)
  })

  it('keeps the two streams APART, so stdout can win the summary', () => {
    // Concatenating them before the parse is exactly what let a hypothetical
    // stray stderr count take the last-occurrence prize.
    expect(wrapper).toMatch(/unitOutput = \{ stdout:/)
  })

  it('COUNTS the checkout, not only its own memory', () => {
    // Without this call the gate is back to block-once-and-record, which waves
    // through the second push of a still-damaged tree (four-eyes finding).
    expect(wrapper).toContain('countTestFilesOnDisk')
    expect(wrapper).toContain('testFileRoots')
    expect(wrapper).toMatch(/onDisk: countTestFilesInCheckout\(\)/)
    // The walk must skip the directory that is broken in the very case this
    // count exists for.
    expect(wrapper).toContain("entry.name === 'node_modules'")
  })

  it('reads the acknowledgement from the environment the core names', () => {
    expect(wrapper).toContain('DROP_ACK_ENV')
    expect(wrapper).toMatch(/process\.env\[DROP_ACK_ENV\]/)
  })

  it('writes the baseline ATOMICALLY, with this repository own Windows retry', () => {
    // A torn write garbles the JSON, which parses back as "no baseline" — the
    // gate would silently forget the number it exists to remember.
    expect(wrapper).toContain("from './atomic-write.mjs'")
    expect(wrapper).toContain('tryWriteJsonAtomic(gateStatePath()')
    expect(wrapper).not.toMatch(/writeFileSync\(gateStatePath/)
  })
})
