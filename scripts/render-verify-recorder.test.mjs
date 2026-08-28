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
import { MAX_CAPTURE_CHARS, MAX_LINE_CHARS, MAX_RED_IDENTITIES, tapOutput } from './render-verify-recorder.mjs'

/** Text that is distinct in LETTERS, so the parser's own normalisation (digits,
 *  hex runs and URLs are folded away) cannot collapse it. That is exactly the
 *  content the ceiling exists for: a page error carrying a generated word mints
 *  a fresh red identity every time it prints, and no parser can fold it. */
const tag = (i) => String(i).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
import { consoleErrorChecks, failedChecks, parseCheckLines } from './verify/baseline-classify-core.mjs'
import { RETRY_ENV, chargeFor, chargeReds, droppedLinesOf, formatSuspectEnv, isIncompleteRecording, markVariedDetails, runVerdict } from './render-verify-core.mjs'

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
  // The real armed shape: the tap records varied identities beside the lines.
  const state = { lines: [], variedKeys: new Set(), crashed: false }
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

  it('keeps a repeated line ONCE — repetition is chatter, identity is the red (point 734)', () => {
    const { state, out } = tapped()
    for (let i = 0; i < 1000; i++) out.write('ERR: the same per-frame validation error\n')
    out.write('FAIL  the one check that failed — 3 of 4\n')
    expect(state.lines).toEqual([
      'ERR: the same per-frame validation error',
      'FAIL  the one check that failed — 3 of 4',
    ])
  })

  // A `console errors: <texts>` SUMMARY LINE CARRIES SEVERAL REDS (review
  // finding, 28.08.2026). Keying it by its FIRST parsed error collapsed two
  // such lines that shared that first one: the second line left the buffer, and
  // the reds only it carried never reached failedChecks — gone without being
  // fixed, charged or filed, and not even marked as varied.
  it('keeps two summary lines that share a first error but carry different further ones', () => {
    const { state, out } = tapped()
    out.write("console errors: ['the shared first error', 'the second error']\n")
    out.write("console errors: ['the shared first error', 'a THIRD error only this line saw']\n")
    expect(state.lines).toHaveLength(2)
    // Every red of both lines survives into the accounting the guard reads.
    expect(failedChecks(state.lines.join('\n')).map((c) => c.name)).toEqual([
      'console error: the shared first error',
      'console error: the second error',
      'console error: a THIRD error only this line saw',
    ])
    // A summary line that repeats identically is still chatter, kept once.
    out.write("console errors: ['the shared first error', 'the second error']\n")
    expect(state.lines).toHaveLength(2)
    // And a single-red line keys exactly as it always did — one entry per
    // identity, whichever of the two line shapes carried it.
    const single = tapped()
    single.out.write('ERR: the shared first error\n')
    single.out.write("console errors: ['the shared first error']\n")
    expect(single.state.lines).toHaveLength(1)
    expect(consoleErrorChecks(single.state.lines[0])).toHaveLength(1)
    expect(parseCheckLines(single.state.lines[0])).toEqual([])
  })

  // THE COMBINATION IS NOT AN IDENTITY (review finding, 28.08.2026, round 13).
  // Keying a line by its parts JOINED made `[A,B]`, `[A,C]`, `[B,C]` three keys
  // over two reds, so a suite that varies how it groups its summary lines minted
  // combinatorially many keys without ever printing a new red. A line now earns
  // its slot only by bringing an identity nothing kept yet.
  it('drops a line whose reds are ALL already kept, and does not call that a truncation', () => {
    const { state, out } = tapped()
    out.write("console errors: ['error A', 'error B']\n")
    out.write("console errors: ['error A', 'error C']\n")
    // Every red of this third line is already in the buffer under a kept line.
    out.write("console errors: ['error B', 'error C']\n")
    expect(state.lines).toHaveLength(2)
    // Nothing was LOST, so nothing is truncated — dropping pure repetition is
    // not a half-recording, and the counter is never even reached.
    expect(state.droppedLines ?? 0).toBe(0)
    expect(failedChecks(state.lines.join('\n')).map((c) => c.name)).toEqual([
      'console error: error A',
      'console error: error B',
      'console error: error C',
    ])
  })

  // THE CEILING, AND THAT IT IS LOUD (review finding, 28.08.2026, round 13).
  // "Bounded by the suite's checks and its distinct console errors" holds for
  // the checks and not for the errors: a page erroring with a UUID, a hash or a
  // generated path mints a fresh identity every print, which the parser cannot
  // fold away. Past the ceiling the buffer stops and the run says INCOMPLETE
  // RECORDING — the loud failure, never a silent half-recording.
  it('stops at the ceiling and counts what it refused', () => {
    const { state, out } = tapped()
    for (let i = 0; i < MAX_RED_IDENTITIES + 40; i++) out.write(`ERR: page error in span ${tag(i)}\n`)
    expect(state.lines).toHaveLength(MAX_RED_IDENTITIES)
    expect(state.droppedLines).toBe(40)
    // Repetition of an already-kept red still costs nothing after the ceiling.
    out.write(`ERR: page error in span ${tag(0)}\n`)
    expect(state.droppedLines).toBe(40)
  })

  // ONE LINE CAN CARRY AS MANY REDS AS THE PAGE PRINTED (review finding,
  // 28.08.2026, round 14). Asking "is the buffer full yet" and then adding every
  // fresh identity the line brought was no ceiling: a single `console errors:
  // [...]` summary could take the buffer, and the record with it, arbitrarily
  // far past the limit without ever marking the run incomplete. The line is
  // weighed whole.
  it('refuses a single summary line that alone would exceed the ceiling', () => {
    const { state, out } = tapped()
    const many = Array.from({ length: MAX_RED_IDENTITIES + 10 }, (_, i) => `'error ${tag(i)}'`).join(', ')
    out.write(`console errors: [${many}]\n`)
    // Nothing was kept — the line does not fit — and the refusal is LOUD.
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
    // A line that DOES fit is still kept whole afterwards.
    out.write("console errors: ['a red that fits']\n")
    expect(state.lines).toHaveLength(1)
  })

  it('never lets the kept identities exceed the ceiling across several fat lines', () => {
    const { state, out } = tapped()
    const chunk = (from, n) => Array.from({ length: n }, (_, i) => `'error ${tag(from + i)}'`).join(', ')
    out.write(`console errors: [${chunk(0, 400)}]\n`)
    out.write(`console errors: [${chunk(400, 400)}]\n`)
    // The second line's 400 fresh identities do not fit beside the first's 400.
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines).toBe(1)
    expect(failedChecks(state.lines.join('\n')).length).toBe(400)
    // …and a small line that still fits is taken.
    out.write(`console errors: [${chunk(800, 50)}]\n`)
    expect(failedChecks(state.lines.join('\n')).length).toBe(450)
    expect(state.droppedLines).toBe(1)
  })

  // A REPEATED RED IS ONE IDENTITY, HOWEVER OFTEN THE LINE PRINTS IT (review
  // finding, 28.08.2026, round 14). Counting the line's PARTS instead of its
  // identities made an ordinary repeated-error summary exceed the ceiling and
  // marked the run incomplete — a FALSE truncation, which blocks the render set
  // exactly the way this point exists to stop.
  it('counts one repeated red once against the ceiling', () => {
    const { state, out } = tapped()
    const same = Array.from({ length: MAX_RED_IDENTITIES + 100 }, () => "'the one page error'").join(', ')
    out.write(`console errors: [${same}]\n`)
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines ?? 0).toBe(0)
    expect(failedChecks(state.lines.join('\n'))).toHaveLength(1)
  })

  // A REFUSED LINE REMEMBERS NOTHING (review finding, 28.08.2026, round 14).
  // The varied-measurement map used to be filled before the ceiling was
  // consulted, so a refused line could fill it without a single line being
  // kept; a later, kept red then found no room in it, and its second, different
  // reading was dropped as repetition with nothing marking it — so a narrow
  // charge could own that red on the one reading that survived.
  it('does not let a refused line starve the variation tracking of a kept red', () => {
    const { state, out } = tapped()
    const many = Array.from({ length: MAX_RED_IDENTITIES + 10 }, (_, i) => `'refused ${tag(i)}'`).join(', ')
    out.write(`console errors: [${many}]\n`)
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
    // A red that arrives afterwards is kept, and its measurement IS watched.
    out.write('ERR: the kept error at frame 1: 1.42 m\n')
    out.write('ERR: the kept error at frame 4: 0.02 m\n')
    expect(state.lines).toHaveLength(1)
    const reds = markVariedDetails(failedChecks(state.lines.join('\n')), state.variedKeys)
    expect(reds).toHaveLength(1)
    expect(reds[0].detailVaried).toBe(true)
  })

  // AN IDENTITY CEILING IS NOT A MEMORY BOUND (review finding, 28.08.2026,
  // round 14). A summary repeating ONE error a million times brings a single
  // identity, so it was kept whole — and the retained string grew with the
  // page's output rather than with its red set, which is the exhausted process
  // the whole ceiling exists to prevent.
  it('refuses a single line longer than a line may be, and says so', () => {
    const { state, out } = tapped()
    out.write(`ERR: ${'x'.repeat(MAX_LINE_CHARS + 10)}\n`)
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
  })

  it('stops at the character budget even while identities are still free', () => {
    const { state, out } = tapped()
    // Each line brings ONE new identity and half a line's worth of text, so the
    // budget runs out after about 128 of them — long before the 500 identities.
    const body = 'y'.repeat(Math.floor(MAX_LINE_CHARS / 2))
    const fits = Math.floor(MAX_CAPTURE_CHARS / MAX_LINE_CHARS) * 2
    for (let i = 0; i < fits + 40; i++) out.write(`ERR: page error ${tag(i)} ${body}\n`)
    expect(state.lines.length).toBeLessThan(fits + 40)
    expect(state.lines.length).toBeGreaterThan(fits / 2)
    expect(state.droppedLines).toBeGreaterThan(0)
    expect(state.lines.join('\n').length).toBeLessThanOrEqual(MAX_CAPTURE_CHARS)
  })

  // A line WITHIN the per-line budget that brings nothing new costs nothing,
  // however long it is — counting it would be a FALSE truncation, and a false
  // truncation blocks the gate.
  it('drops a long REPETITION for free, without calling it a truncation', () => {
    const { state, out } = tapped()
    out.write('ERR: the one page error\n')
    out.write(`ERR: the one page error${' '.repeat(Math.floor(MAX_LINE_CHARS / 2))}\n`)
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines ?? 0).toBe(0)
  })

  // AND THE REFUSAL DOES NOT DEPEND ON HOW THE PROCESS CHUNKED ITS WRITES
  // (review finding, 28.08.2026, round 15). An overlong line assembled across
  // several writes is damaged by the pending cap and refused; one delivered
  // whole was dropped for free where its content happened to be repetition, so
  // the same output was a truncation or not depending on the write boundaries.
  // The per-line budget is now asked of every result line, before it is parsed.
  it('refuses an overlong line the same way however it arrived', () => {
    const whole = tapped()
    whole.out.write(`ERR: page error${'z'.repeat(MAX_LINE_CHARS)}\n`)
    expect(whole.state.lines).toHaveLength(0)
    expect(whole.state.droppedLines).toBe(1)

    const split = tapped()
    split.out.write('ERR: page error')
    for (let i = 0; i < 4; i++) split.out.write('z'.repeat(MAX_LINE_CHARS / 2))
    split.out.write('\n')
    expect(split.state.lines).toHaveLength(0)
    expect(split.state.droppedLines).toBe(1)
    // Both streams recover: the next whole line is kept normally.
    for (const t of [whole, split]) {
      t.out.write('ERR: an ordinary error after the flood\n')
      expect(t.state.lines).toEqual(['ERR: an ordinary error after the flood'])
      expect(t.state.droppedLines).toBe(1)
    }
  })

  // ...AND THE VARIED MEASUREMENT IS ASKED PER RED, NOT PER LINE (review
  // finding, 28.08.2026). Two summary lines with DIFFERENT membership have two
  // different composite keys, so both are kept and the line comparison never
  // ran — while `failedChecks` still keeps only the FIRST reading of the error
  // they share. That second reading was lost with nothing marking it, which is
  // exactly the silent loss this mechanism exists to prevent.
  it('marks a shared error whose measurement varied between two differently-made lines', () => {
    const { state, out } = tapped()
    out.write("console errors: ['the shared error at frame 1: 1.42 m', 'the second error']\n")
    out.write("console errors: ['the shared error at frame 4: 0.02 m', 'a THIRD error only this line saw']\n")
    // Both lines are kept — their membership differs — so every red survives.
    expect(state.lines).toHaveLength(2)
    const reds = markVariedDetails(failedChecks(state.lines.join('\n')), state.variedKeys)
    // The shared error reached the record ONCE, carrying the first reading.
    const shared = reds.filter((r) => r.name.includes('the shared error at frame'))
    expect(shared).toHaveLength(1)
    expect(shared[0].detail).toContain('1.42 m')
    // ...and it is marked, so a narrow charge refuses it instead of owning it
    // on the one reading that survived.
    expect(shared[0].detailVaried).toBe(true)
    const narrow = [{ point: 999, match: /the shared error/i, detailMatch: /1\.42 m/, why: 'the first reading' }]
    expect(chargeFor(shared[0], { ledger: narrow })).toBeNull()
    // The reds that printed once are NOT marked — the mark is per red identity,
    // never a property of the line they arrived on.
    for (const r of reds.filter((x) => !x.name.includes('the shared error at frame'))) {
      expect(r.detailVaried, r.name).toBeUndefined()
    }
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
    expect(pointOf('settlement walker (goat)')).toBe(642)
    // The leak was point 546's until it was fixed; with the point ticked its
    // ledger entry expired, so the same line now charges to nobody.
    expect(pointOf('render-resource-leak')).toBeNull()
    expect(pointOf('a NEW check nobody has filed')).toBeNull()
  })

  it('keeps the printed measurement on the stored red, through the real tap', () => {
    // A red that reaches the record carries the MEASUREMENT it printed, not
    // only its name (point 734, review finding F1). Without it the ledger's
    // narrowest instrument — `detailMatch` — could never be applied to a run
    // already on disk, so an entry written today reached nothing recorded
    // yesterday, which is the retroactivity this point exists to deliver.
    const { state, out, flush } = tapped()
    out.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    flush()
    const [stored] = chargeReds(failedChecks(state.lines.join('\n')), { suite: 'polish', backend: 'webgpu' })
    expect(stored.detail).toContain('1.42 m walked inside 0.31 m')
    expect(stored.point).toBe(694)
  })

  it('refuses a NARROW charge when the same check printed two different measurements', () => {
    // The record holds one entry per check key, so the second measurement of a
    // check that failed twice is dropped (review finding, 28.08.2026). If a
    // signature matched the FIRST one, the second — which nothing owns — would
    // disappear behind the charge. It is marked instead, and the narrow charge
    // refuses it: loudly uncharged beats quietly excused.
    const { state, out, flush } = tapped()
    out.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    out.write('FAIL  no child walks without getting anywhere — worst child 4 at 51.0s, 0.02 m walked inside 0.30 m\n')
    flush()
    // The buffer kept ONE line for the key — and remembered that a second,
    // different one came.
    expect(state.lines).toHaveLength(1)
    expect(state.variedKeys.size).toBe(1)
    const output = state.lines.join('\n')
    const [stored] = chargeReds(markVariedDetails(failedChecks(output), state.variedKeys), { suite: 'polish', backend: 'webgpu' })
    expect(stored.detailVaried).toBe(true)
    expect(stored.point).toBeNull()
    // The mark survives to the RE-READ, or owned() would charge afterwards what
    // the recorder refused.
    expect(chargeFor(stored, { suite: 'polish', backend: 'webgpu' })).toBeNull()

    // One measurement, one reading: the ordinary case is untouched.
    const single = tapped()
    single.out.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    single.flush()
    const one = single.state.lines.join('\n')
    const [ok] = chargeReds(markVariedDetails(failedChecks(one), single.state.variedKeys), {
      suite: 'polish',
      backend: 'webgpu',
    })
    expect(ok.detailVaried).toBeUndefined()
    expect(ok.point).toBe(694)
  })

  it('charges the same output to the OTHER point on the other lane, where the goat red is real', () => {
    // The WebGPU entry disclaims the hardware lane in its own words, so a
    // hardware-lane occurrence is charged to nobody and blocks. Charging it to
    // the point that must classify it was tried and refused by the cross-vendor
    // review: an open owner would excuse every later red of the same wording on
    // the lane whose verdicts we trust.
    // THE OWNER MOVED 20.08.2026 from 506 to 642, which inherited its mechanism
    // when 506 was folded away — a charge to a ticked point expires. Only the
    // number changed; the lane split this case pins did not.
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
    expect(chargeReds(failedChecks(line), { suite: 'polish', backend: 'webgpu' }).map((r) => r.point)).toEqual([642])
  })
})

describe('the armed recorder — the REAL wiring, not a stand-in', () => {
  const openPoints = [642]

  it('records a red run with its charged reds, and the run then accounts', async () => {
    const run = await armed('polish')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    const record = run.exit(1)
    expect(record.exit).toBe(1)
    expect(record.crashed).toBe(false)
    expect(record.reds.map((r) => r.point)).toEqual([642])
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

  // Point 734, the chosen half: red lines are NEVER dropped. A per-frame flood
  // of one identical error used to overflow the 400-line buffer and turn the run
  // into a half-recorded fragment; now repetition collapses at the capture and
  // every observed red keeps its identity, so no record is ever "incomplete".
  it('keeps every observed red under a per-frame flood — no truncation, no marker (point 734)', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 420; i++) {
      process.stdout.write(
        'ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22\n',
      )
    }
    process.stdout.write('FAIL  a brand-new check nobody has filed — 3 of 4\n')
    const record = run.exit(1)
    expect(record.truncated).toBeUndefined()
    expect(record.droppedLines).toBeUndefined()
    // BOTH reds, each with its identity: the flooded assert and the new check.
    expect(record.reds.map((r) => r.name)).toEqual([
      'a brand-new check nobody has filed',
      'console error: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22',
    ])
    // An ordinary red, closable the three ordinary ways — never 'incomplete'.
    expect(runVerdict(record, { openPoints }).status).toBe('red')
    expect(runVerdict(record, { openPoints }).covers).toBe(false)
  })

  // THE FLOOD THAT IS NOT REPETITION (review finding, 28.08.2026). Keeping each
  // distinct LINE was no bound at all: a per-frame error whose text carries a
  // counter prints a new distinct line every frame, so the buffer grew without
  // limit — and an exhausted process DIES, which turns a run full of observed
  // reds into a crash record that a signature can then close. The bound is the
  // red's IDENTITY, which the parser normalises the counter out of.
  it('bounds the buffer by the red\'s identity, not by the line, under a counting flood', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 500; i++) {
      process.stdout.write(
        `ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: ${19 + i} -> ${22 + i}\n`,
      )
    }
    const record = run.exit(1)
    // ONE red, not five hundred — and no truncation, because nothing was lost
    // that the record does not name.
    expect(record.reds).toHaveLength(1)
    expect(record.truncated).toBeUndefined()
    expect(record.reds[0].name).toMatch(/render-resource-leak/)
    // And the run says so: the measurement did not hold still, so no narrow
    // charge may own this red on the single reading that survived.
    expect(record.reds[0].detailVaried).toBe(true)
    expect(runVerdict(record, { openPoints }).status).toBe('red')
  })

  it('records a run that hit the ceiling as an INCOMPLETE RECORDING with its way out', async () => {
    const run = await armed('polish')
    for (let i = 0; i < MAX_RED_IDENTITIES + 7; i++) {
      process.stdout.write(`ERR: page error in span ${tag(i)}\n`)
    }
    const record = run.exit(1)
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBe(7)
    expect(droppedLinesOf(record)).toBe(7)
    expect(isIncompleteRecording(record)).toBe(true)
    // The record stays BOUNDED — that is the whole point of the ceiling.
    expect(record.reds.length).toBe(MAX_RED_IDENTITIES)
    // And it leaves the guard by the incomplete class, not as an unexplained
    // red and not through a hand-written deferral.
    expect(runVerdict(record, { openPoints }).status).toBe('incomplete')
    // EVERY red it DID record keeps its chargeable name, which is what makes
    // the three closings of point 640 reachable for them.
    expect(record.reds.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true)
    expect(new Set(record.reds.map((r) => r.key)).size).toBe(MAX_RED_IDENTITIES)
  })

  // …and the same at the RECORD, which is where the unbounded growth would
  // actually have been paid for: `record.reds` is re-parsed from the kept lines,
  // so a fat line kept past the ceiling would put every red it carried on disk.
  it('keeps record.reds under the ceiling when the reds arrive on fat summary lines', async () => {
    const run = await armed('polish')
    const chunk = (from, n) => Array.from({ length: n }, (_, i) => `'error ${tag(from + i)}'`).join(', ')
    process.stdout.write(`console errors: [${chunk(0, 400)}]\n`)
    process.stdout.write(`console errors: [${chunk(400, 400)}]\n`)
    const record = run.exit(1)
    expect(record.reds.length).toBe(400)
    expect(record.reds.length).toBeLessThanOrEqual(MAX_RED_IDENTITIES)
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBe(1)
    expect(runVerdict(record, { openPoints }).status).toBe('incomplete')
  })

  // A green run records no reds at all, so red lines it dropped cost it
  // nothing — calling it incomplete would block a genuinely passing run.
  it('never calls an exit-0 run incomplete, however much it printed', async () => {
    const run = await armed('polish')
    for (let i = 0; i < MAX_RED_IDENTITIES + 7; i++) {
      process.stdout.write(`ERR: page error in span ${tag(i)}\n`)
    }
    const record = run.exit(0)
    expect(record.truncated).toBeUndefined()
    expect(record.droppedLines).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('clean')
  })

  // The finding the old cap could not survive (round 5, finding 4): hundreds of
  // DISTINCT reds. 60 were stored and the rest silently discarded — observed
  // reds losing their identity, i.e. the half-recording the spec forbids. Now
  // the record carries the whole set. (Distinct in LETTERS, because checkKey
  // folds digits.)
  it('stores hundreds of DISTINCT observed reds whole — no cap discards one', async () => {
    const run = await armed('polish')
    const name = (i) => `check ${String(i).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])} broke`
    for (let i = 0; i < 401; i++) process.stdout.write(`FAIL  ${name(i)} — detail\n`)
    const record = run.exit(1)
    expect(record.truncated).toBeUndefined()
    expect(record.reds.length).toBe(401)
    expect(record.reds[0].name).toBe(name(0))
    expect(record.reds.at(-1).name).toBe(name(400))
    const verdict = runVerdict(record, { openPoints })
    expect(verdict.status).toBe('red')
    // Every one of them still actionable: all 401 are reported unaccounted.
    expect(verdict.unaccounted.length).toBe(401)
  })

  // A flood the suite itself tolerated: exit 0 means every check passed, and
  // with nothing dropped there is nothing unread — the run is a clean pass, as
  // it always was for a tolerated error below the old cap.
  it('leaves an exit-0 run clean under the same flood — nothing was dropped, nothing is unread', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 420; i++) process.stdout.write('ERR: something the suite decided to tolerate\n')
    const record = run.exit(0)
    expect(record.truncated).toBeUndefined()
    expect(record.reds).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('clean')
  })

  // The tail line is read whatever the exit code (review, 19.08.2026): a red
  // printed as the process dies carries no newline, and it must reach the record
  // like any other — there is no cap left for it to overflow.
  it('records a red whose line never got its newline, beyond where the old cap ended', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 400; i++) process.stdout.write(`ERR: a tolerated console error #${i}\n`)
    process.stdout.write('FAIL  the line the old cap would have eaten — and it never got its newline')
    const record = run.exit(1)
    expect(record.truncated).toBeUndefined()
    expect(record.reds.map((r) => r.name)).toContain('the line the old cap would have eaten')
    expect(runVerdict(record, { openPoints }).status).toBe('red')
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

  // Point 595: the record names the TREE it was taken on, so "the full proof ran
  // on the exact merge candidate" is checkable instead of claimed.
  it('records the git HEAD the run was taken on, and whether that tree was dirty', async () => {
    const run = await armed('polish')
    const record = run.exit(0)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim()
    expect(record.head).toBe(head)
    expect(typeof record.dirty).toBe('boolean')
    // Evidence, not a gate: naming the tree may never change what a run is worth.
    expect(runVerdict(record, { openPoints }).covers).toBe(true)
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
