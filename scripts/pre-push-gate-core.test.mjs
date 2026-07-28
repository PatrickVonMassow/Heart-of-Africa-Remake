// The pre-push gate's decision (point 302). The rule it defends: CI must never
// be the first place a broken state is noticed, because a red run mails the
// user and a later fix does not unsend that mail.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
    expect(blocked).toMatch(/unit failed TWICE — the load was not the cause/)
    // A step re-run GREEN, with a later step red, must not be reported as twice-failed.
    expect(formatVerdict({ blocked: true, failed: ['unit'], retried: ['lint'] }, { reason: 'x' })).not.toMatch(/TWICE/)
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
