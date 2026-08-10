// The poll budget, the wait plan and the receipt (point 592) — pure, so the
// rule that replaces polling is pinned rather than remembered.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  BLOCKING_LIMIT_MS,
  FIRST_WAIT_FRACTION,
  HUNG_FACTOR,
  MAX_POLLS,
  MIN_WAIT_MS,
  SUITE_FRAMES,
  SUITE_RUNTIME_S,
  UNMEASURED_SUITES,
  backendsFrom,
  buildReceipt,
  expectedFrames,
  expectedRuntimeMs,
  formatReceipt,
  framesVerdict,
  nextWaitMs,
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
 */
function measuredTable() {
  const text = readFileSync(join(ROOT, 'docs', 'picture-check-cost.md'), 'utf8')
  const rows = new Map()
  for (const line of text.split(/\r?\n/)) {
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

  it('reproduces the document’s own SMALL and LARGE totals', () => {
    // SMALL: 19 shots, 469.3 s (docs/picture-check-cost.md §1, "Tier totals").
    expect(expectedFrames(SMALL_SUITES).frames).toBe(19)
    expect(Math.round(expectedRuntimeMs(SMALL_SUITES).ms / 100) / 10).toBe(469.3)
    // LARGE, one backend: 93 shots, 2536.0 s — over the suites plus the preview.
    const large = [...DEV_SUITES, 'preview']
    expect(expectedFrames(large).frames).toBe(93)
    expect(Math.round(expectedRuntimeMs(large).ms / 100) / 10).toBe(2536.0)
  })
})

describe('suite lookups', () => {
  it('answers in milliseconds, and null for what was never measured', () => {
    expect(suiteRuntimeMs('world')).toBe(73_100)
    expect(suiteFrames('world')).toBe(8)
    expect(suiteRuntimeMs('docs')).toBeNull()
    expect(suiteFrames('docs')).toBeNull()
    expect(suiteRuntimeMs('no-such-suite')).toBeNull()
  })

  it('NAMES the unmeasured members of a selection instead of counting them as zero', () => {
    const { ms, unmeasured, measured } = expectedRuntimeMs(['world', 'docs', 'startup'])
    expect(ms).toBe(73_100)
    expect(unmeasured).toEqual(['docs', 'startup'])
    expect(measured).toBe(1)
    expect(expectedFrames(['world', 'docs']).unmeasured).toEqual(['docs'])
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

  it('falls back to the pinned VERIFY_GL, then to the lane default', () => {
    expect(backendsFrom({ lines: [], verifyGl: 'webgpu' })).toEqual(['WebGPU'])
    expect(backendsFrom({ lines: [], verifyGl: '', fallback: 'webgl' })).toEqual(['WebGL 2'])
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

  it('flags a stale expectation rather than a failure when there are MORE', () => {
    expect(framesVerdict({ expected: 8, written: 9 }).status).toBe('extra')
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
