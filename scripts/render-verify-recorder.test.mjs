// What a RED verify run leaves behind for the accounting (point 550).
//
// The recorder taps the run's own output for the lines a suite already prints —
// `FAIL  <name> — <detail>`, `ERR: <text>` — and the guard decides from them
// whether every red is charged to an open point. Two properties matter more than
// the parsing: the tap can NEVER disturb the suite (the original write is always
// called, with the original arguments and its return value), and a run that DIED
// rather than reported is recognised as such, because a crash prints no FAIL line
// yet exits non-zero exactly like a reported failure.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { tapOutput } from './render-verify-recorder.mjs'
import { failedChecks } from './verify/baseline-classify-core.mjs'
import { RETRY_ENV, TRUNCATED_KIND, chargeReds, formatSuspectEnv, runVerdict } from './render-verify-core.mjs'

// The record is stubbed, not written: these cases exercise the REAL arming and
// the REAL exit handler, and a test must never append to the checkout's own
// render-verify state.
const { recorded } = vi.hoisted(() => ({ recorded: [] }))
vi.mock('./render-verify-state.mjs', () => ({
  recordRun: (run) => recorded.push(run),
}))

// The armed cases drive the REAL tap on process.stdout, so the pre-test write is
// saved and restored: a test must neither print a suite's fake output into the
// run log nor leave a wrapper behind for the next one.
let stdoutWrite = null
beforeEach(() => {
  stdoutWrite = process.stdout.write
})
afterEach(() => {
  process.stdout.write = stdoutWrite
})

/** Arm a FRESH recorder instance (the module keeps one armed run per process)
 *  under a chosen suite name, and return the record its exit handler writes. */
async function armed(suite = 'polish') {
  vi.resetModules()
  const mod = await import('./render-verify-recorder.mjs')
  const argv = process.argv[1]
  process.argv[1] = `/x/${suite}.mjs`
  // A sink UNDER the tap: the tap wraps this, so the test's lines are captured
  // exactly as in a real run but never reach the terminal.
  process.stdout.write = () => true
  mod.armRunRecorder('webgpu')
  process.argv[1] = argv
  return {
    /** Fire the real exit handler and read what THIS instance recorded. */
    exit(code) {
      const before = recorded.length
      process.emit('exit', code)
      return recorded.slice(before).at(-1)
    },
  }
}

/** A stand-in for process.stdout/stderr that records what it was handed. */
function fakeStream() {
  const written = []
  return {
    written,
    write(chunk, ...rest) {
      written.push([chunk, ...rest])
      return 'the original return value'
    },
  }
}

function tapped() {
  const state = { lines: [], crashed: false }
  const out = fakeStream()
  const err = fakeStream()
  const flush = tapOutput(state, [
    [out, false],
    [err, true],
  ])
  return { state, out, err, flush }
}

describe('tapOutput — observe-only', () => {
  it('passes every write through unchanged, arguments and return value alike', () => {
    const { out } = tapped()
    const cb = () => {}
    expect(out.write('PASS  something\n', 'utf8', cb)).toBe('the original return value')
    expect(out.written).toEqual([['PASS  something\n', 'utf8', cb]])
  })

  it('keeps the run\'s FAIL and ERR lines, and drops the PASS flood', () => {
    const { state, out } = tapped()
    out.write('PASS  a check that held\nFAIL  the goat stance — worst travel 0.967\n')
    out.write('ERR: [ASSERT] render-resource-leak — renderTargets grew back\n')
    expect(state.lines).toEqual([
      'FAIL  the goat stance — worst travel 0.967',
      'ERR: [ASSERT] render-resource-leak — renderTargets grew back',
    ])
  })

  it('joins a line split across two writes', () => {
    const { state, out } = tapped()
    out.write('FAIL  a check ')
    out.write('cut in half\n')
    expect(state.lines).toEqual(['FAIL  a check cut in half'])
  })

  it('flushes a last line that never got its newline', () => {
    const { state, out, flush } = tapped()
    out.write('FAIL  the run died mid-line')
    expect(state.lines).toEqual([])
    flush()
    expect(state.lines).toEqual(['FAIL  the run died mid-line'])
  })

  it('reads a Buffer write', () => {
    const { state, out } = tapped()
    out.write(Buffer.from('FAIL  a buffered check\n', 'utf8'))
    expect(state.lines).toEqual(['FAIL  a buffered check'])
  })

  it('never lets a collector failure reach the suite', () => {
    const { out } = tapped()
    const hostile = {
      toString() {
        throw new Error('hostile chunk')
      },
    }
    expect(() => out.write(hostile)).not.toThrow()
    expect(out.written.length).toBe(1)
  })
})

describe('tapOutput — a run that DIED rather than reported', () => {
  // WHAT THIS FAKE CANNOT PROVE (four-eyes finding F4): node prints an UNCAUGHT
  // exception from C++ straight to fd 2, so it never reaches a patched
  // stream.write at all. This case pins the probe for the stderr a suite writes
  // ITSELF; the real crash path is the uncaughtExceptionMonitor wiring below,
  // and the child-process case after it proves node really fires it.
  it('flags a stack trace on stderr as a crash', () => {
    const { state, err } = tapped()
    err.write('TimeoutError: page.waitForFunction: Timeout 300000ms exceeded\n    at run (/x/benchmark.mjs:89:7)\n')
    expect(state.crashed).toBe(true)
  })

  it('does not flag an ordinary red — a suite that reports is not a suite that crashed', () => {
    const { state, out, err } = tapped()
    out.write('FAIL  the goat stance — worst travel 0.967\n')
    err.write('vite dev server ready\n')
    expect(state.crashed).toBe(false)
  })
})

describe('the captured lines charge the way the guard reads them', () => {
  it('turns a red run\'s output into charged reds', () => {
    const { state, out, flush } = tapped()
    out.write('PASS  a check that held\n')
    out.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    out.write('ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22\n')
    out.write('FAIL  a NEW check nobody has filed — 3 of 4\n')
    flush()
    const reds = chargeReds(failedChecks(state.lines.join('\n')), { suite: 'polish', backend: 'webgpu' })
    const pointOf = (needle) => reds.find((r) => r.name.includes(needle))?.point
    expect(reds.length).toBe(3)
    expect(pointOf('settlement walker (goat)')).toBe(506)
    // The leak was point 546's until it was fixed; with the point ticked its
    // ledger entry expired, so the same line now charges to nobody.
    expect(pointOf('render-resource-leak')).toBeNull()
    expect(pointOf('a NEW check nobody has filed')).toBeNull()
  })

  it('charges the same output to the OTHER point on the other lane, where the goat red is real', () => {
    // 506 is the software lane's rate problem and disclaims the hardware lane in
    // its own words, so a hardware-lane occurrence is charged to nobody and
    // blocks. Charging it to the point that must classify it was tried and
    // refused by the cross-vendor review: an open owner would excuse every later
    // red of the same wording on the lane whose verdicts we trust.
    const lines = 'FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967'
    const reds = chargeReds(failedChecks(lines), { suite: 'polish', backend: 'webgl' })
    expect(reds.map((r) => r.point)).toEqual([null])
  })

  it('charges a render-target leak to nothing, at maasai-village or anywhere else', () => {
    // Point 546 fixed the maasai-village leak and its entry left the ledger
    // with the tick, so no leak line is excused any more — wherever it appears,
    // it is a red the change under review has to answer for.
    for (const place of ['maasai-village|medium', 'cairo']) {
      const line = `ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:${place}: 19 -> 22 (+3, allowed +2)`
      expect(chargeReds(failedChecks(line), { suite: 'polish', backend: 'webgl' }).map((r) => r.point)).toEqual([null])
    }
  })

  it('charges a red to nothing outside the suite its evidence was taken in (F2)', () => {
    const line = 'FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967'
    expect(chargeReds(failedChecks(line), { suite: 'flow', backend: 'webgpu' }).map((r) => r.point)).toEqual([null])
    expect(chargeReds(failedChecks(line), { suite: 'polish', backend: 'webgpu' }).map((r) => r.point)).toEqual([506])
  })
})

describe('the armed recorder — the REAL wiring, not a stand-in', () => {
  const openPoints = [506]

  it('records a red run with its charged reds, and the run then accounts', async () => {
    const run = await armed('polish')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    const record = run.exit(1)
    expect(record.exit).toBe(1)
    expect(record.crashed).toBe(false)
    expect(record.reds.map((r) => r.point)).toEqual([506])
    expect(runVerdict(record, { openPoints }).status).toBe('accounted')
  })

  it('marks a run whose process raised an uncaught exception, and that run never accounts (F1)', async () => {
    const run = await armed('polish')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    // What node does to a suite that dies at a top-level await: the monitor
    // fires, the exit handler runs afterwards. Emitted here rather than thrown,
    // because a real throw would take the test runner with it — the child
    // process below proves node really fires it.
    process.emit('uncaughtExceptionMonitor', new Error('page.waitForFunction: Timeout 300000ms exceeded'))
    const record = run.exit(1)
    expect(record.crashed).toBe(true)
    expect(runVerdict(record, { openPoints }).status).toBe('red')
  })

  it('turns a capture that hit its cap into an INCOMPLETE RECORDING, not a red (F3, point 734)', async () => {
    const run = await armed('polish')
    // A per-frame assert flood, then the one new red that must not vanish.
    for (let i = 0; i < 420; i++) {
      process.stdout.write(
        'ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22\n',
      )
    }
    process.stdout.write('FAIL  a brand-new check nobody has filed — 3 of 4\n')
    const record = run.exit(1)
    expect(record.reds[0].point).toBeNull()
    expect(record.reds[0].name).toMatch(/exceeded the capture cap/)
    // The truncation is said as a FIELD, not only as a red's wording, and its
    // kind is one no charge may name.
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBeGreaterThan(0)
    expect(record.reds[0].kind).toBe(TRUNCATED_KIND)
    // NOT an unexplained red: there is nothing in it to explain.
    expect(runVerdict(record, { openPoints }).status).toBe('incomplete')
    expect(runVerdict(record, { openPoints }).covers).toBe(false)
  })

  // A truncated run that still exited 0 is the case the old accounting could not
  // see at all: `dropped` was only consulted on a red exit, so a "pass" whose
  // result lines were thrown away covered a backend. It must not.
  it('records the truncation even when the run exited 0, and that run covers nothing', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 420; i++) process.stdout.write('ERR: something the suite decided to tolerate\n')
    const record = run.exit(0)
    expect(record.truncated).toBe(true)
    expect(record.reds).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('incomplete')
    expect(runVerdict(record, { openPoints }).covers).toBe(false)
  })

  it('leaves a green run with no accounting at all', async () => {
    const run = await armed('polish')
    const record = run.exit(0)
    expect(record.exit).toBe(0)
    expect(record.reds).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('clean')
  })

  // Point 566: the env → record → refusal chain, end to end on the real wiring.
  // The recorder reads the variable the runner set rather than trusting the
  // suite to declare its own partiality, and that stamp is what stops a
  // one-section run from ever counting as backend coverage.
  it('stamps a run started under VERIFY_SECTION partial, and that run never covers', async () => {
    const before = process.env.VERIFY_SECTION
    process.env.VERIFY_SECTION = 'crocodile-ambush'
    try {
      const run = await armed('enrichments')
      const record = run.exit(0)
      expect(record.partial).toBe(true)
      expect(record.section).toBe('crocodile-ambush')
      // Exit 0 and every check green — and still not coverage.
      const verdict = runVerdict(record, { openPoints })
      expect(verdict.status).toBe('partial')
      expect(verdict.covers).toBe(false)
    } finally {
      if (before === undefined) delete process.env.VERIFY_SECTION
      else process.env.VERIFY_SECTION = before
    }
  })

  it('leaves a run without the variable unstamped, so it can still cover', async () => {
    const before = process.env.VERIFY_SECTION
    delete process.env.VERIFY_SECTION
    try {
      const run = await armed('enrichments')
      const record = run.exit(0)
      expect(record.partial).toBeUndefined()
      expect(record.section).toBeUndefined()
      expect(runVerdict(record, { openPoints }).covers).toBe(true)
    } finally {
      if (before !== undefined) process.env.VERIFY_SECTION = before
    }
  })

  // Point 640: the same chain for the RETRY. The runner knows a run is the second
  // attempt; the suite cannot, and the "PASSED ON RETRY" log line was the only
  // trace it left. Now the record carries it and the gate reads it.
  it('stamps the retry SUSPECT with what the first attempt failed on, and it covers nothing', async () => {
    const before = process.env[RETRY_ENV]
    process.env[RETRY_ENV] = formatSuspectEnv(['settlement walker (goat): the planted foot holds its ground spot'])
    try {
      const run = await armed('polish')
      const record = run.exit(0)
      expect(record.suspect).toBe(true)
      expect(record.suspectOf).toEqual([
        { name: 'settlement walker (goat): the planted foot holds its ground spot', kind: 'check' },
      ])
      const verdict = runVerdict(record, { openPoints })
      expect(verdict.status).toBe('suspect')
      expect(verdict.covers).toBe(false)
    } finally {
      if (before === undefined) delete process.env[RETRY_ENV]
      else process.env[RETRY_ENV] = before
    }
  })

  it('leaves a first attempt unstamped — the runner blanks the variable, so a stale export condemns nothing', async () => {
    const before = process.env[RETRY_ENV]
    process.env[RETRY_ENV] = ''
    try {
      const run = await armed('polish')
      const record = run.exit(0)
      expect(record.suspect).toBeUndefined()
      expect(runVerdict(record, { openPoints }).covers).toBe(true)
    } finally {
      if (before === undefined) delete process.env[RETRY_ENV]
      else process.env[RETRY_ENV] = before
    }
  })
})

describe('node really fires uncaughtExceptionMonitor where the tap cannot see (F1)', () => {
  it('fires it for a top-level-await rejection, whose trace bypasses a patched stderr.write', () => {
    const fixture = [
      "import { writeSync } from 'node:fs'",
      // The tap, as the recorder installs it.
      'let tapped = 0',
      'process.stderr.write = () => { tapped++; return true }',
      'let sawMonitor = false',
      "process.on('uncaughtExceptionMonitor', () => { sawMonitor = true })",
      // writeSync goes to fd 2 directly, so the patched write cannot hide it.
      "process.on('exit', () => writeSync(2, `MONITOR:${sawMonitor} TAPPED:${tapped}\\n`))",
      // Exactly the shape of an uncaught Playwright timeout in a suite.
      "await Promise.reject(new Error('page.waitForFunction: Timeout 300000ms exceeded'))",
    ].join('\n')
    let stderr = ''
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', fixture], {
        encoding: 'utf8',
        windowsHide: true,
        // Captured, not forwarded: the fixture's crash trace belongs in the
        // assertion, not in the run log.
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      stderr = String(e.stderr ?? '')
    }
    expect(stderr).toMatch(/MONITOR:true/)
    // The tap saw NOTHING of the crash — the finding this fix answers.
    expect(stderr).toMatch(/TAPPED:0/)
  })
})
