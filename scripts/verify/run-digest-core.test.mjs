// Decision-logic sweep of the logged verify invocation's core (point 373 e).
//
// The load-bearing property is asymmetric and each half is pinned here: a run's
// unstructured BULK is dropped (that is the whole saving), while everything a
// RED run is read for survives — the failing suite's name, the failing checks'
// and tests' names, the retry notices, the final verdict and a raw tail. A
// digest that dropped a failure would cost a whole rerun, so the tests are
// written against realistic runner output, not against the patterns.
import { describe, it, expect } from 'vitest'
import {
  DEFAULTS,
  applyBudget,
  buildDigest,
  classifyLine,
  createSelector,
  failureSurface,
  formatDuration,
  resultName,
  selectLines,
  showWindow,
} from './run-digest-core.mjs'

/** A green preflight exactly as run-all.mjs prints it (measured 07.08.2026). */
const GREEN_PREFLIGHT = [
  '# quiet-machine check (point 296): MACHINE STATE UNKNOWN',
  '      GPU load NOT measured (no GPU busy counter on this host) — the device the render suites draw with was not read',
  '      → the machine could not be read — proceeding, but nothing here proves the run was quiet',
  '# type-check + production build…',
  'PASS  build        (tsc -b + vite build, exit 0)',
  '# lint (oxlint)…',
  'PASS  lint         (oxlint, exit 0)',
  '# unit + component tests (vitest, jsdom)…',
  'PASS  test-types   (tsc -p tsconfig.vitest.json)',
  'PASS  unit         (vitest jsdom, 7593 tests, exit 0)',
  '',
  'ALL GREEN — 3 suites run',
]

/** A red vitest stage: the runner's verdict line, then the raw dump it echoes. */
function redUnitRun({ dumpLines = 400 } = {}) {
  const dump = []
  for (let i = 0; i < dumpLines; i++) {
    dump.push(
      `  ❯ src/world/world.test.ts:${i}:5`,
      `    AssertionError: expected ${i} to be ${i + 1}`,
      `     ${i}|      expect(a).toBe(b)`,
      '',
    )
  }
  return [
    '# unit + component tests (vitest, jsdom)…',
    'PASS  test-types   (tsc -p tsconfig.vitest.json)',
    'FAIL  unit         (vitest jsdom, ? tests, exit 1)',
    ' FAIL  src/world/world.test.ts > village clearance > keeps the river band clear',
    ' FAIL  src/state/store.test.ts > checkpoint > restores afflictions',
    ...dump,
    'Test Files  2 failed | 210 passed (212)',
    '     Tests  2 failed | 7591 passed (7593)',
    '',
    '1 SUITE(S) FAILED — vitest failed, skipping the browser suites',
  ]
}

/** A red browser suite: the runner's own indented FAIL/ERR echo. */
const RED_SUITE = [
  'PASS  docs         14 pass, 0 fail, 0 console-errors (exit 0)',
  'FAIL  enrichments  9 pass, 2 fail, 1 console-errors (exit 1)',
  '      FAIL  crocodile eye knobs sit above the waterline',
  '      FAIL  hunt staging reaches the feeding phase',
  '      ERR: TypeError: Cannot read properties of undefined',
  '↻ retry enrichments once — a first-try failure may be a rotating staging flake (point 200)',
  'FAIL  enrichments  9 pass, 1 fail, 0 console-errors (exit 1)',
  '      FAIL  crocodile eye knobs sit above the waterline',
  '',
  '1 SUITE(S) FAILED — 18 suites run',
]

describe('resultName', () => {
  it('reads the unit out of the runner’s padded verdict lines', () => {
    expect(resultName('PASS  docs         7 pass, 0 fail, 0 console-errors (exit 0)')).toBe('docs')
    expect(resultName('FAIL  unit         (vitest jsdom, ? tests, exit 1)')).toBe('unit')
    expect(resultName('SKIP  touch        (WebGL2-only — not run on WebGPU)')).toBe('touch')
    expect(resultName('PASS  crossbrowser  4 pass, 0 fail, 2 skip')).toBe('crossbrowser')
  })

  it('rejects a TEST’s own console line — the misattribution seen on the first red run', () => {
    // Printed by a jsdom test, not by the runner: one space after the name.
    expect(resultName('FAIL  frame 18-worldmodel-bambara — the scene never finished drawing')).toBe(null)
  })

  it('still accepts a name long enough to have eaten the 12-column padding', () => {
    expect(resultName('FAIL  averylongsuitename 3 pass, 1 fail')).toBe('averylongsuitename')
  })

  it('accepts a bare verdict line with nothing after the name', () => {
    expect(resultName('FAIL  preview')).toBe('preview')
  })
})

describe('classifyLine', () => {
  it('names the runner’s own structured lines', () => {
    expect(classifyLine('PASS  world        12 pass')).toBe('result')
    expect(classifyLine('FAIL  unit         (exit 1)')).toBe('result')
    expect(classifyLine('SKIP  touch        (WebGL2-only)')).toBe('result')
    expect(classifyLine('# lint (oxlint)…')).toBe('heading')
    expect(classifyLine('===== LARGE regression — backend 1/2: WebGL 2 =====')).toBe('banner')
    expect(classifyLine('ALL GREEN — 18 suites run')).toBe('final')
    expect(classifyLine('3 SUITE(S) FAILED — 18 suites run')).toBe('final')
    // Point 566: the line that says the green headline above it covers ONE
    // section must survive the digest's budget, like any other conclusion.
    expect(classifyLine('PARTIAL — only section "rivers" of enrichments ran; the suite is NOT covered by this run')).toBe('final')
    expect(classifyLine('↻ retry world once')).toBe('flake')
    expect(classifyLine('⚠ PASSED ON RETRY  world')).toBe('flake')
    expect(classifyLine('      FAIL  hunt staging reaches the feeding phase')).toBe('echo')
    expect(classifyLine('      ERR: TypeError: x is undefined')).toBe('echo')
    expect(classifyLine('      | at Object.<anonymous>')).toBe('echo')
  })

  it('drops the unstructured bulk — the whole point of the mechanism', () => {
    expect(classifyLine('    AssertionError: expected 1 to be 2')).toBe(null)
    expect(classifyLine('  ❯ src/world/world.test.ts:12:5')).toBe(null)
    expect(classifyLine('dist/assets/index-Ck3f.js   3,512.44 kB │ gzip: 902.11 kB')).toBe(null)
    expect(classifyLine('')).toBe(null)
  })

  it('never throws on non-strings', () => {
    expect(classifyLine(undefined)).toBe(null)
    expect(classifyLine(null)).toBe(null)
    expect(classifyLine(42)).toBe(null)
  })
})

describe('selectLines', () => {
  it('keeps a heading’s indented continuation (the quiet-machine report)', () => {
    const kinds = selectLines(GREEN_PREFLIGHT).map((e) => e.kind)
    expect(kinds.filter((k) => k === 'continuation')).toHaveLength(2)
    expect(selectLines(GREEN_PREFLIGHT)).toHaveLength(GREEN_PREFLIGHT.length - 1) // the blank line
  })

  it('does NOT keep an indented failure dump — it follows a verdict, not a heading', () => {
    const selected = selectLines(redUnitRun({ dumpLines: 200 }))
    expect(selected.some((e) => /AssertionError/.test(e.line))).toBe(false)
    expect(selected.some((e) => /❯/.test(e.line))).toBe(false)
  })

  it('keeps vitest’s own FAIL lines, which name the failing tests', () => {
    const selected = selectLines(redUnitRun())
    expect(selected.filter((e) => e.kind === 'echo').map((e) => e.line.trim())).toEqual([
      'FAIL  src/world/world.test.ts > village clearance > keeps the river band clear',
      'FAIL  src/state/store.test.ts > checkpoint > restores afflictions',
    ])
  })

  it('is the same decision in bulk and streaming', () => {
    const select = createSelector()
    const streamed = GREEN_PREFLIGHT.map((l) => select(l)).filter(Boolean)
    expect(streamed).toEqual(selectLines(GREEN_PREFLIGHT).map((e) => e.kind))
  })

  it('tolerates an empty or absent run', () => {
    expect(selectLines([])).toEqual([])
    expect(selectLines(undefined)).toEqual([])
  })
})

describe('failureSurface', () => {
  it('names the failing suite and the checks under it', () => {
    const units = failureSurface(RED_SUITE)
    expect(units.map((u) => u.name)).toEqual(['enrichments', 'enrichments'])
    expect(units[0].details).toEqual([
      'FAIL  crocodile eye knobs sit above the waterline',
      'FAIL  hunt staging reaches the feeding phase',
      'ERR: TypeError: Cannot read properties of undefined',
    ])
  })

  it('names the failing stage and the failing TESTS under it', () => {
    const units = failureSurface(redUnitRun())
    expect(units).toHaveLength(1)
    expect(units[0].name).toBe('unit')
    expect(units[0].details[0]).toContain('src/world/world.test.ts > village clearance')
  })

  it('counts the details it did not list, so nothing looks complete that is not', () => {
    const units = failureSurface(RED_SUITE, { maxDetails: 1 })
    expect(units[0].details).toHaveLength(1)
    expect(units[0].detailCount).toBe(3)
  })

  it('reports nothing for a green run', () => {
    expect(failureSurface(GREEN_PREFLIGHT)).toEqual([])
  })

  it('does not attribute a later suite’s echoes to an earlier failure', () => {
    const units = failureSurface(['FAIL  a  (exit 1)', '      FAIL  one', 'PASS  b  (exit 0)', '      FAIL  stray'])
    expect(units).toHaveLength(1)
    expect(units[0].details).toEqual(['FAIL  one'])
  })

  it('keeps a test’s own FAIL console line out of the failing-unit list', () => {
    const units = failureSurface([
      'FAIL  unit         (vitest jsdom, ? tests, exit 1)',
      'FAIL  frame 18-worldmodel-bambara — the scene never finished drawing',
      ' FAIL  src/config/balance.test.ts > fixed design values',
    ])
    expect(units.map((u) => u.name)).toEqual(['unit'])
    expect(units[0].details).toEqual(['FAIL  src/config/balance.test.ts > fixed design values'])
  })
})

describe('applyBudget', () => {
  const entries = (n, kind) => Array.from({ length: n }, (_, i) => ({ kind, line: `${kind === 'result' ? 'PASS' : 'x'} ${i}` }))

  it('leaves a run within budget untouched', () => {
    const list = entries(10, 'result')
    expect(applyBudget(list, 120)).toEqual({ kept: list, dropped: 0 })
  })

  it('drops low-priority lines first, and from the front', () => {
    const list = [...entries(10, 'result'), { kind: 'echo', line: '      FAIL  the one that matters' }]
    const { kept, dropped } = applyBudget(list, 5)
    expect(dropped).toBe(6)
    expect(kept).toHaveLength(5)
    expect(kept.at(-1).line).toContain('the one that matters')
    expect(kept[0].line).toBe('PASS 6')
  })

  it('keeps a FAIL verdict when the PASS verdicts go', () => {
    const list = [{ kind: 'result', line: 'FAIL  world  (exit 1)' }, ...entries(10, 'result')]
    const { kept } = applyBudget(list, 3)
    expect(kept[0].line).toBe('FAIL  world  (exit 1)')
  })

  it('drops high-priority lines only when nothing else is left', () => {
    const list = Array.from({ length: 6 }, (_, i) => ({ kind: 'echo', line: `      FAIL  ${i}` }))
    const { kept, dropped } = applyBudget(list, 2)
    expect(dropped).toBe(4)
    expect(kept.map((e) => e.line)).toEqual(['      FAIL  4', '      FAIL  5'])
  })
})

describe('buildDigest', () => {
  it('costs a fraction of a red transcript and still names every failure', () => {
    const lines = redUnitRun({ dumpLines: 500 })
    const d = buildDigest({ lines, command: 'verify large', exitCode: 1, logPath: 'local/verify-logs/x.log' })
    expect(d.stats.rawLines).toBeGreaterThan(2000)
    expect(d.stats.digestLines).toBeLessThan(d.stats.rawLines / 10)
    expect(d.text).toContain('FAILING (1): unit')
    expect(d.text).toContain('src/world/world.test.ts > village clearance')
    expect(d.text).toContain('local/verify-logs/x.log')
  })

  it('prints the raw tail on a failure — the net under an unpatterned crash', () => {
    const d = buildDigest({ lines: redUnitRun({ dumpLines: 5 }), exitCode: 1, tailLines: 6 })
    expect(d.text).toContain('── last 6 non-empty line(s) ──')
    expect(d.text).toContain('Tests  2 failed | 7591 passed')
  })

  it('prints no tail for a green run — nothing to diagnose', () => {
    const d = buildDigest({ lines: GREEN_PREFLIGHT, exitCode: 0, logPath: 'local/verify-logs/g.log' })
    expect(d.text).not.toContain('non-empty line(s)')
    expect(d.text).toContain('ALL GREEN — 3 suites run')
    expect(d.stats.failing).toEqual([])
  })

  it('offers the way back to the log only when something is actually hidden', () => {
    const nothingHidden = buildDigest({ lines: GREEN_PREFLIGHT, exitCode: 0, logPath: 'local/verify-logs/g.log' })
    expect(nothingHidden.text).not.toContain('--show')
    const dumpHidden = buildDigest({ lines: redUnitRun({ dumpLines: 20 }), exitCode: 1, logPath: 'local/verify-logs/r.log' })
    expect(dumpHidden.text).toContain('--show local/verify-logs/r.log --tail 120')
    expect(dumpHidden.text).toContain('--grep "FAIL|ERR:|Error"')
  })

  it('prints the tail when nothing structured was recognised at all', () => {
    const d = buildDigest({ lines: ['some other tool', 'wrote this'], exitCode: 0, tailLines: 5 })
    expect(d.text).toContain('non-empty line(s)')
    expect(d.text).toContain('wrote this')
  })

  it('omits the structured block in streaming mode (it already went out live)', () => {
    const live = buildDigest({ lines: RED_SUITE, exitCode: 1, includeKept: false })
    const quiet = buildDigest({ lines: RED_SUITE, exitCode: 1, includeKept: true })
    expect(quiet.text.split('\n').length).toBeGreaterThan(live.text.split('\n').length)
    // Either shape names the failure — that is not what the flag trades away.
    expect(live.text).toContain('FAILING (2): enrichments, enrichments')
    expect(quiet.text).toContain('↻ retry enrichments once')
  })

  it('clips a single monstrous line instead of letting it blow the budget', () => {
    const d = buildDigest({ lines: [`      ERR: ${'x'.repeat(5000)}`], exitCode: 1, maxLineChars: 80 })
    for (const l of d.lines) expect(l.length).toBeLessThanOrEqual(200)
  })

  it('says how many structured lines the budget dropped', () => {
    const many = Array.from({ length: 300 }, (_, i) => `PASS  suite${i}      ok`)
    const d = buildDigest({ lines: many, exitCode: 0, maxKeptLines: 20, includeKept: true })
    expect(d.text).toMatch(/280 earlier structured line\(s\) dropped/)
  })

  it('reports a killed run without pretending it passed', () => {
    const d = buildDigest({ lines: ['# type-check…'], command: 'verify large (killed by SIGKILL)', exitCode: 1 })
    expect(d.text).toContain('killed by SIGKILL')
    expect(d.text).toContain('exit 1')
  })

  it('never throws on missing input', () => {
    expect(() => buildDigest()).not.toThrow()
    expect(buildDigest().stats.rawLines).toBe(0)
  })

  it('has bounds a caller can rely on', () => {
    expect(DEFAULTS.maxKeptLines).toBeGreaterThan(0)
    expect(DEFAULTS.tailLines).toBeGreaterThan(0)
  })
})

describe('showWindow', () => {
  const log = Array.from({ length: 500 }, (_, i) => (i % 100 === 0 ? `FAIL  suite${i}` : `line ${i}`))

  it('returns the tail, bounded by max', () => {
    const win = showWindow(log, { tail: 50 })
    expect(win.lines).toHaveLength(50)
    expect(win.lines.at(-1)).toBe('line 499')
    expect(win.truncated).toBe(450)
  })

  it('filters first, then tails', () => {
    const win = showWindow(log, { grep: 'FAIL', tail: 3 })
    expect(win.matched).toBe(5)
    expect(win.lines).toEqual(['FAIL  suite200', 'FAIL  suite300', 'FAIL  suite400'])
  })

  it('caps the answer even when the tail asks for more', () => {
    expect(showWindow(log, { tail: 400, max: 10 }).lines).toHaveLength(10)
  })

  it('accepts a regex and is case-insensitive by default', () => {
    expect(showWindow(['Fail here', 'ok'], { grep: 'fail' }).matched).toBe(1)
    expect(showWindow(['Fail here', 'ok'], { grep: /fail/i }).matched).toBe(1)
  })
})

describe('formatDuration', () => {
  it('reads as a comparison a human can make', () => {
    expect(formatDuration(38_000)).toBe('38s')
    expect(formatDuration(252_000)).toBe('4m 12s')
    expect(formatDuration(NaN)).toBe('?')
  })
})
