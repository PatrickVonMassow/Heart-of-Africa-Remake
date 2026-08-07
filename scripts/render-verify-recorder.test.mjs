// What a RED verify run leaves behind for the accounting (point 550).
//
// The recorder taps the run's own output for the lines a suite already prints —
// `FAIL  <name> — <detail>`, `ERR: <text>` — and the guard decides from them
// whether every red is charged to an open point. Two properties matter more than
// the parsing: the tap can NEVER disturb the suite (the original write is always
// called, with the original arguments and its return value), and a run that DIED
// rather than reported is recognised as such, because a crash prints no FAIL line
// yet exits non-zero exactly like a reported failure.
import { describe, it, expect } from 'vitest'
import { tapOutput } from './render-verify-recorder.mjs'
import { failedChecks } from './verify/baseline-classify-core.mjs'
import { chargeReds } from './render-verify-core.mjs'

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
    expect(pointOf('render-resource-leak')).toBe(546)
    expect(pointOf('a NEW check nobody has filed')).toBeNull()
  })

  it('charges the same output differently on the other lane, where the goat red is real', () => {
    const lines = 'FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967'
    const reds = chargeReds(failedChecks(lines), { suite: 'polish', backend: 'webgl' })
    expect(reds.map((r) => r.point)).toEqual([null])
  })
})
