// The poll budget, the wait plan and the receipt (point 592) — pure, so the
// rule that replaces polling is pinned rather than remembered.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  BLOCKING_LIMIT_MS,
  COUNTED_SUITE_FRAMES,
  FIRST_WAIT_FRACTION,
  HUNG_FACTOR,
  MAX_POLLS,
  MIN_WAIT_MS,
  SEPTEMBER_BANDS,
  SUITE_FRAMES,
  SUITE_RUNTIME_S,
  UNMEASURED_SUITES,
  backendsFrom,
  buildReceipt,
  expectedFrames,
  expectedRuntimeMs,
  formatReceipt,
  formatObservedBand,
  framesVerdict,
  nextWaitMs,
  observedBand,
  planRun,
  pollBudget,
  suiteFrames,
  suiteRuntimeMs,
  waitPlan,
} from './run-wait-core.mjs'
import { DEV_SUITES, SMALL_SUITES } from './tiers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * The measured table of docs/picture-check-cost.md §1, parsed back out of the
 * document. Only the per-suite rows: a backticked name in the first cell.
 *
 * ANCHORED TO §1 ALONE (point 1083). The shape "backticked name, then a
 * `<n> s` cell" is not unique to that table — §7 records the September runtime
 * bands in a table of the same shape — so the scan is bounded between the §1
 * heading and the NEXT heading of ANY level. Unanchored, a later section's row
 * would silently join the pinned constants and the lockstep test would hold the
 * runner to a number nobody pinned it to.
 *
 * ANY level, and that is not pedantry (Astra, four-eyes round 1): a `##+` guard
 * reads straight through a later `# Heading`, which is exactly the boundary a
 * document reorganised into parts would grow.
 */
function section1(text = readFileSync(join(ROOT, 'docs', 'picture-check-cost.md'), 'utf8')) {
  const lines = String(text).split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+1\./.test(line))
  if (start < 0) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^#{1,6}\s/.test(line))
  return end < 0 ? rest : rest.slice(0, end)
}

function measuredTable(lines = section1()) {
  const rows = new Map()
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 8) continue
    const name = /^`([\w-]+)`$/.exec(cells[1])?.[1]
    if (!name) continue
    const shots = Number(cells[2])
    const seconds = Number(/^([\d.]+)\s*s$/.exec(cells[6])?.[1])
    if (!Number.isFinite(shots) || !Number.isFinite(seconds)) continue
    rows.set(name, { shots, seconds })
  }
  return rows
}

describe('the measured constants stay in lockstep with docs/picture-check-cost.md §1', () => {
  const table = measuredTable()

  it('finds the table at all (a moved section must fail loudly, not silently pass)', () => {
    expect(table.size).toBeGreaterThanOrEqual(16)
  })

  it('reads §1 ALONE — a later section of the same shape cannot join the pinned constants', () => {
    // The failure this forbids (point 1083): §7 records the September runtime
    // bands in a table of the same shape, and an unanchored scan would hold
    // SUITE_RUNTIME_S to a row nobody pinned it to.
    const doc = [
      '# What one rendered-picture check costs',
      '',
      '## 1. Per suite: screenshots, bytes, runtime',
      '',
      '| Suite | Shots | Dimensions | Bytes | Tokens | Median runtime | n |',
      '| --- | ---: | --- | ---: | ---: | ---: | ---: |',
      '| `flow` | 8 | 1280×800 | 1 | 1 | 140.4 s | 4 |',
      '',
      '## 7. September 2026',
      '',
      '| Suite | Shots | Dimensions | Bytes | Tokens | Median runtime | n |',
      '| --- | ---: | --- | ---: | ---: | ---: | ---: |',
      '| `flow` | 99 | 1280×800 | 1 | 1 | 999.9 s | 4 |',
    ].join('\n')
    const rows = measuredTable(section1(doc))
    expect([...rows.keys()]).toEqual(['flow'])
    expect(rows.get('flow')).toEqual({ shots: 8, seconds: 140.4 })

    // …and a heading of ANY level ends it, not just a `##`. A document split
    // into parts grows `# Part two` boundaries, and a `##+` guard reads through
    // one as if it were body text.
    const parted = doc.replace('## 7. September 2026', '# Part two — September 2026')
    const partedRows = measuredTable(section1(parted))
    expect([...partedRows.keys()]).toEqual(['flow'])
    expect(partedRows.get('flow')).toEqual({ shots: 8, seconds: 140.4 })
  })

  it('carries the September bands beside the July table, never inside it', () => {
    // §1 stays the planning baseline; §7 is the outlier band printed next to it.
    expect(SEPTEMBER_BANDS.kinds.large.medianMin).toBe(118.8)
    expect(SEPTEMBER_BANDS.kinds.polish.medianMin).toBe(55.2)
    expect(SEPTEMBER_BANDS.kinds.section.medianMin).toBe(2.9)
    for (const band of Object.values(SEPTEMBER_BANDS.kinds)) {
      expect(band.lowMin).toBeLessThanOrEqual(band.medianMin)
      expect(band.medianMin).toBeLessThanOrEqual(band.highMin)
      expect(band.n).toBeGreaterThan(0)
    }
    // The load caveat travels WITH the numbers — a band read as a target is the
    // one way this section does harm.
    expect(SEPTEMBER_BANDS.load).toMatch(/not a target/)
  })

  it('carries every measured suite with the document’s own runtime and shot count', () => {
    for (const [name, row] of table) {
      expect(SUITE_RUNTIME_S[name], `runtime of ${name}`).toBe(row.seconds)
      expect(SUITE_FRAMES[name], `shots of ${name}`).toBe(row.shots)
    }
    expect(Object.keys(SUITE_RUNTIME_S).sort()).toEqual([...table.keys()].sort())
    expect(Object.keys(SUITE_FRAMES).sort()).toEqual([...table.keys()].sort())
  })

  it('names every DEV suite either measured or explicitly unmeasured', () => {
    for (const suite of DEV_SUITES) {
      const known = suite in SUITE_RUNTIME_S || UNMEASURED_SUITES.includes(suite)
      expect(known, `${suite} is neither measured nor listed as unmeasured`).toBe(true)
    }
  })

  it('gives EVERY suite a frame count, measured or counted from its source', () => {
    // The gap this closes: `startup` writes one shutter frame and is absent from
    // the table, so a LARGE run wrote 94 against an expectation of 93 and every
    // clean receipt reported a discrepancy.
    for (const suite of [...DEV_SUITES, 'preview']) {
      expect(suiteFrames(suite), `${suite} has no frame count`).not.toBeNull()
    }
    expect(COUNTED_SUITE_FRAMES.startup).toBe(1)
  })

  it('reproduces the document’s own SMALL and LARGE totals', () => {
    // SMALL: 19 shots, 469.3 s (docs/picture-check-cost.md §1, "Tier totals").
    // `docs` rides along in that tier and writes none, which is why the shot
    // total is the document's while the runtime total names it unmeasured.
    expect(expectedFrames(SMALL_SUITES).frames).toBe(19)
    expect(Math.round(expectedRuntimeMs(SMALL_SUITES).ms / 100) / 10).toBe(469.3)
    // LARGE, one backend: the document's 93 shots plus `startup`'s single frame,
    // which the recorder never logged; 2536.0 s over the suites plus the preview.
    const large = [...DEV_SUITES, 'preview']
    expect(expectedFrames(large).frames).toBe(94)
    expect(Math.round(expectedRuntimeMs(large).ms / 100) / 10).toBe(2536.0)
  })
})

describe('planRun — what the command will really do', () => {
  it('plans a bare LARGE as two passes and adds the preview to the first only', () => {
    const plan = planRun({ argv: ['large'], verifyGl: undefined })
    expect(plan.passes).toHaveLength(2)
    expect(plan.suites).toContain('preview')
    // 2536.0 s (full pass + preview) + the render-only WebGPU pass.
    expect(plan.expectedMs).toBeGreaterThan(2_536_000)
    expect(plan.expectedFrames).toBe(94)
  })

  it('reports the LANE a suite really opens, not the pass it sits in', () => {
    // `voice` is WebGL2-only and is ROUTED there inside a WebGPU gate
    // (tiers.mjs laneFor). Reporting the pass would name a backend no suite used.
    expect(planRun({ argv: ['voice'], verifyGl: undefined }).backends).toEqual(['webgl'])
    expect(planRun({ argv: ['world'], verifyGl: undefined }).backends).toEqual(['webgpu'])
    expect(planRun({ argv: ['small'], verifyGl: undefined }).backends).toEqual(['webgpu', 'webgl'])
  })

  it('honours a pinned backend', () => {
    expect(planRun({ argv: ['large'], verifyGl: 'webgl' }).passes).toHaveLength(1)
    expect(planRun({ argv: ['world'], verifyGl: 'webgl' }).backends).toEqual(['webgl'])
  })
})

describe('suite lookups', () => {
  it('answers in milliseconds, and null for what was never measured', () => {
    expect(suiteRuntimeMs('world')).toBe(73_100)
    expect(suiteFrames('world')).toBe(8)
    expect(suiteRuntimeMs('docs')).toBeNull()
    expect(suiteFrames('docs')).toBe(0)
    expect(suiteRuntimeMs('no-such-suite')).toBeNull()
    expect(suiteFrames('no-such-suite')).toBeNull()
  })

  it('NAMES the unmeasured members of a selection instead of counting them as zero', () => {
    const { ms, unmeasured, measured } = expectedRuntimeMs(['world', 'docs', 'startup'])
    expect(ms).toBe(73_100)
    expect(unmeasured).toEqual(['docs', 'startup'])
    expect(measured).toBe(1)
    expect(expectedFrames(['world', 'docs']).unmeasured).toEqual([])
    expect(expectedFrames(['world', 'no-such-suite']).unmeasured).toEqual(['no-such-suite'])
  })

  it('counts a suite once however often it is named, and multiplies only TIME by the passes', () => {
    expect(expectedRuntimeMs(['world', 'world']).ms).toBe(73_100)
    expect(expectedRuntimeMs(['world'], { passes: 2 }).ms).toBe(146_200)
    // Frames do NOT double: the second backend pass overwrites the same files.
    expect(expectedFrames(['world', 'world']).frames).toBe(8)
  })
})

describe('nextWaitMs — the first wait is 0.9 × the measured median, not 30 s', () => {
  it('spends 0.9 of the expectation on the FIRST wait', () => {
    expect(nextWaitMs({ polls: 0, expectedMs: 140_400 })).toBe(Math.round(140_400 * FIRST_WAIT_FRACTION))
  })

  it('subtracts what has already elapsed', () => {
    expect(nextWaitMs({ polls: 0, expectedMs: 140_400, elapsedMs: 60_000 })).toBe(Math.round(140_400 * 0.9) - 60_000)
  })

  it('never goes below the floor — a one-second re-check is a poll by another name', () => {
    expect(nextWaitMs({ polls: 0, expectedMs: 140_400, elapsedMs: 140_000 })).toBe(MIN_WAIT_MS)
    expect(nextWaitMs({ polls: 3, expectedMs: 20_000 })).toBe(MIN_WAIT_MS)
    expect(nextWaitMs({ polls: 0, expectedMs: null })).toBe(MIN_WAIT_MS)
  })

  it('shortens after the first look, and never exceeds the blocking budget', () => {
    expect(nextWaitMs({ polls: 1, expectedMs: 900_000 })).toBe(90_000)
    expect(nextWaitMs({ polls: 0, expectedMs: 2_536_000 })).toBe(BLOCKING_LIMIT_MS)
  })
})

describe('pollBudget — five looks, then block or call it hung', () => {
  it('ends the moment the run is over', () => {
    const v = pollBudget({ polls: 2, running: false })
    expect(v.verdict).toBe('finished')
    expect(v.message).toMatch(/receipt/)
  })

  it('counts down and warns on the last one', () => {
    expect(pollBudget({ polls: 0, expectedMs: 100_000, elapsedMs: 10_000 })).toMatchObject({ verdict: 'poll', remaining: MAX_POLLS })
    expect(pollBudget({ polls: MAX_POLLS - 1, expectedMs: 100_000, elapsedMs: 10_000 }).message).toMatch(/LAST one/)
  })

  it('refuses a sixth poll and names the two ways out', () => {
    const v = pollBudget({ polls: MAX_POLLS, expectedMs: 100_000, elapsedMs: 10_000 })
    expect(v.verdict).toBe('exhausted')
    expect(v.remaining).toBe(0)
    expect(v.message).toMatch(/--await/)
    expect(v.message).toMatch(/hung/)
  })

  it('calls a run HUNG past the factor, whatever the poll count', () => {
    const v = pollBudget({ polls: 1, expectedMs: 100_000, elapsedMs: 100_000 * HUNG_FACTOR + 1 })
    expect(v.verdict).toBe('hung')
  })

  it('does not invent a hang when nothing was measured', () => {
    expect(pollBudget({ polls: 1, expectedMs: null, elapsedMs: 9_000_000 }).verdict).toBe('poll')
  })
})

describe('the observed band a plan prints under its expectation (point 1083)', () => {
  it('gives a both-backend LARGE the 115–121 min band it really ran in', () => {
    const plan = planRun({ argv: ['large'], verifyGl: undefined })
    expect(plan.observedBand?.key).toBe('large')
    // The plan says ~81 min; the band says 115–121. Both are printed, and the
    // gap between them is the whole point: 118 reads as inside it, 200 does not.
    expect(plan.expectedMs).toBeLessThan(plan.observedBand.medianMin * 60_000)
    const lines = formatObservedBand(plan.observedBand)
    expect(lines[0]).toContain('115.3–120.9 min')
    expect(lines[0]).toContain('docs/picture-check-cost.md §7')
    expect(lines.join('\n')).toContain('aborted early')
    expect(lines.join('\n')).toContain('not a target')
  })

  it('gives a whole polish pass its own band, and the section run the cheap one', () => {
    expect(planRun({ argv: ['polish'], verifyGl: 'webgpu' }).observedBand?.key).toBe('polish')
    const section = planRun({ argv: ['polish', '--section=adult-errands'], verifyGl: 'webgpu' })
    expect(section.section).toBe('adult-errands')
    expect(section.observedBand?.key).toBe('section')
    // The expectation above it is still the WHOLE suite's, and the band says so.
    expect(formatObservedBand(section.observedBand).join('\n')).toContain('quotes the WHOLE suite')
  })

  it('does not quote polish minutes for another suite’s section', () => {
    const plan = planRun({ argv: ['enrichments', '--section=crocodile-hidden'], verifyGl: 'webgpu' })
    expect(plan.observedBand?.elsewhere).toBe('enrichments')
    expect(formatObservedBand(plan.observedBand).join('\n')).toContain('NOT measured on `enrichments`')
  })

  it('withholds the LARGE band from a run that is not the shape it measured', () => {
    // The five measured runs were BOTH-backend. `VERIFY_GL=webgl npm test` is
    // one pass and roughly half the work: handing it 115–121 min would make a
    // normal run look fast, which is the opposite of what the band is for.
    const both = planRun({ argv: ['large'], verifyGl: undefined })
    const pinned = planRun({ argv: ['large'], verifyGl: 'webgl' })
    expect(both.passes).toHaveLength(2)
    expect(pinned.passes).toHaveLength(1)
    expect(both.observedBand?.key).toBe('large')
    expect(pinned.observedBand).toBeNull()
    expect(observedBand({ isLargeEquivalent: true, passes: 1 })).toBeNull()
  })

  it('reports no band where nothing measured one, rather than the nearest', () => {
    expect(planRun({ argv: ['small'], verifyGl: 'webgpu' }).observedBand).toBeNull()
    expect(planRun({ argv: ['flow'], verifyGl: 'webgpu' }).observedBand).toBeNull()
    expect(observedBand({})).toBeNull()
    expect(formatObservedBand(null)).toEqual([])
  })

  it('quotes no fraction it did not measure', () => {
    // 55.2 / 2.9 is ~19x, not "a fiftieth". A band that overstates its own
    // saving is the same defect as a plan that understates its own cost.
    const text = Object.values(SEPTEMBER_BANDS.kinds)
      .map((band) => `${band.label} ${band.note ?? ''}`)
      .join('\n')
    expect(text).not.toMatch(/fiftieth|fraction of/)
    const section = planRun({ argv: ['enrichments', '--section=x'], verifyGl: 'webgpu' })
    expect(formatObservedBand(section.observedBand).join('\n')).toMatch(/says nothing about them/)
  })
})

describe('waitPlan — blocking call or completion notification', () => {
  it('blocks in the foreground for anything inside the harness call limit', () => {
    const plan = waitPlan({ expectedMs: 140_400 })
    expect(plan.shape).toBe('blocking')
    expect(plan.timeoutMs).toBeLessThanOrEqual(BLOCKING_LIMIT_MS)
    expect(plan.timeoutMs).toBeGreaterThan(140_400)
  })

  it('sends a 42-minute LARGE run to the background, because no blocking call may take that long', () => {
    const plan = waitPlan({ expectedMs: 2_536_000 })
    expect(plan.shape).toBe('background')
    expect(plan.message).toMatch(/notification/)
  })

  it('refuses to invent an interval for an unmeasured selection', () => {
    expect(waitPlan({ expectedMs: null }).shape).toBe('background')
  })
})

describe('backendsFrom — read from the run, never guessed', () => {
  it('reads both passes off the runner’s own banners', () => {
    const lines = [
      '===== LARGE regression — backend 1/2: WebGL 2 (full, with preflight) =====',
      'PASS  world        8 pass',
      '===== LARGE regression — backend 2/2: WebGPU (render suites; preflight/preview already proven) =====',
    ]
    expect(backendsFrom({ lines })).toEqual(['WebGL 2', 'WebGPU'])
  })

  it('falls back to the pinned VERIFY_GL, then to the plan’s lane list', () => {
    expect(backendsFrom({ lines: [], verifyGl: 'webgpu' })).toEqual(['WebGPU'])
    expect(backendsFrom({ lines: [], verifyGl: '', fallback: 'webgl' })).toEqual(['WebGL 2'])
    // A WebGPU gate containing a WebGL2-only suite really opened BOTH.
    expect(backendsFrom({ lines: [], fallback: ['webgpu', 'webgl'] })).toEqual(['WebGPU', 'WebGL 2'])
    expect(backendsFrom({ lines: [], fallback: ['webgl', 'nonsense'] })).toEqual(['WebGL 2'])
  })

  it('answers UNKNOWN rather than guessing', () => {
    expect(backendsFrom({ lines: ['PASS  world  8 pass'] })).toEqual([])
    expect(backendsFrom({ lines: [], verifyGl: 'vulkan' })).toEqual([])
  })
})

describe('framesVerdict — the half the shutter cannot see', () => {
  it('passes on an exact match', () => {
    expect(framesVerdict({ expected: 93, written: 93 })).toMatchObject({ status: 'ok' })
  })

  it('names a run that photographed less than it owes', () => {
    const v = framesVerdict({ expected: 93, written: 60 })
    expect(v.status).toBe('short')
    expect(v.message).toMatch(/33 FRAME\(S\) MISSING/)
  })

  it('treats MORE frames as a floor being out of date, not as an alarm', () => {
    const v = framesVerdict({ expected: 8, written: 9 })
    expect(v.status).toBe('extra')
    expect(v.message).toMatch(/floor, not a ceiling/)
    expect(v.message).not.toMatch(/MISSING/)
  })

  it('says UNKNOWN rather than satisfied when there is no expectation', () => {
    expect(framesVerdict({ expected: null, written: 12 }).status).toBe('unknown')
    expect(framesVerdict({ expected: 12, written: null }).status).toBe('unknown')
  })
})

describe('the completion receipt', () => {
  const green = buildReceipt({
    command: 'verify large',
    tier: 'large',
    suites: ['world', 'flow'],
    backends: ['WebGL 2', 'WebGPU'],
    head: 'abc1234',
    branch: 'feat/592-await-the-wait',
    logPath: 'local/verify-logs/x.log',
    exitCode: 0,
    durationMs: 2_536_000,
    polls: 0,
    failing: [],
    framesExpected: 16,
    framesWritten: 16,
  })

  it('is an object with every field a reader of a finished run needs', () => {
    expect(green.green).toBe(true)
    expect(green.frames.status).toBe('ok')
    const text = formatReceipt(green).join('\n')
    expect(text).toMatch(/GREEN \(exit 0\)/)
    expect(text).toMatch(/world, flow/)
    expect(text).toMatch(/WebGL 2 \+ WebGPU/)
    expect(text).toMatch(/abc1234 \(feat\/592-await-the-wait\)/)
    expect(text).toMatch(/local\/verify-logs\/x\.log/)
    expect(text).toMatch(/frames: 16\/16/)
    expect(text).toMatch(/polls: {3}0 \(awaited, not polled\)/)
    expect(text).toMatch(/failing: none/)
  })

  it('prints the failing names UNCUT — every unit and every detail', () => {
    const details = Array.from({ length: 12 }, (_, i) => `FAIL  check number ${i} with a very long explanatory sentence`)
    const red = buildReceipt({
      command: 'verify enrichments',
      suites: ['enrichments'],
      exitCode: 1,
      failing: [{ name: 'enrichments', details }],
      framesExpected: 37,
      framesWritten: 31,
    })
    const text = formatReceipt(red).join('\n')
    expect(red.green).toBe(false)
    for (const d of details) expect(text).toContain(d)
    expect(text).toMatch(/6 FRAME\(S\) MISSING/)
  })

  it('says so when the backend could not be established', () => {
    const text = formatReceipt(buildReceipt({ exitCode: 0, backends: [] })).join('\n')
    expect(text).toMatch(/backend: UNKNOWN/)
  })

  it('reports a polled run as polled', () => {
    const text = formatReceipt(buildReceipt({ exitCode: 0, polls: 3 })).join('\n')
    expect(text).toMatch(new RegExp(`polls: {3}3 of ${MAX_POLLS}`))
  })
})
