// The regression's suite→tier→backend map (point 204). run-all.mjs spawns
// servers and child processes, so its wiring is proven here at the decision
// level instead of by running every suite twice: which suites a tier picks,
// which backend(s) a command covers, and which suites a WebGPU pass skips.
import { readFile } from 'node:fs/promises'
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BACKEND, DEV_SUITES, SMALL_SUITES, WEBGL_ONLY_SUITES,
  laneFor, parseArgs, planBackends, selectBackend, skippedSuites, suitesFor,
} from './tiers.mjs'

describe('tier sets (point 173)', () => {
  it('keeps SMALL a strict, non-empty subset of the LARGE set', () => {
    expect(SMALL_SUITES.length).toBeGreaterThan(0)
    expect(SMALL_SUITES.length).toBeLessThan(DEV_SUITES.length)
    for (const s of SMALL_SUITES) expect(DEV_SUITES).toContain(s)
  })

  it('names every suite once and covers the render suites in LARGE', () => {
    expect(new Set(DEV_SUITES).size).toBe(DEV_SUITES.length)
    // The pixel/screenshot-heavy suites are exactly what the WebGPU pass exists
    // for — they must be in the LARGE set, not only in someone's manual run.
    for (const s of ['enrichments', 'polish', 'settings', 'invariants', 'handwriting', 'gamepad', 'startup']) {
      expect(DEV_SUITES).toContain(s)
    }
  })

  it('keeps the WebGL2-only exception to the two documented suites', () => {
    expect(WEBGL_ONLY_SUITES).toEqual(['touch', 'voice'])
    for (const s of WEBGL_ONLY_SUITES) expect(DEV_SUITES).toContain(s)
  })
})

describe('argument parsing', () => {
  it('reads the bare default as a full LARGE-equivalent run', () => {
    expect(parseArgs([])).toEqual({ tier: null, filter: [], flags: [], section: null, baseline: false, fullRun: true, isLargeEquivalent: true })
  })

  it('reads an explicit tier token, leaving no filter behind', () => {
    expect(parseArgs(['small'])).toEqual({ tier: 'small', filter: [], flags: [], section: null, baseline: false, fullRun: true, isLargeEquivalent: false })
    expect(parseArgs(['large'])).toEqual({ tier: 'large', filter: [], flags: [], section: null, baseline: false, fullRun: true, isLargeEquivalent: true })
  })

  it('reads a bare suite filter as a quick single run (no preflight, not LARGE)', () => {
    const a = parseArgs(['flow', 'polish'])
    expect(a).toEqual({ tier: null, filter: ['flow', 'polish'], flags: [], section: null, baseline: false, fullRun: false, isLargeEquivalent: false })
  })

  it('reads an explicit `large` WITH a filter as a preflighted both-backends run of that suite', () => {
    const a = parseArgs(['large', 'polish'])
    expect(a).toEqual({ tier: 'large', filter: ['polish'], flags: [], section: null, baseline: false, fullRun: true, isLargeEquivalent: true })
  })

  it('reads --baseline as a flag, never as a suite filter (point 294)', () => {
    const a = parseArgs(['--baseline'])
    expect(a.baseline).toBe(true)
    // The flag must not look like a filter: a bare `npm test -- --baseline`
    // stays the full LARGE run with its preflight and both backends.
    expect(a.filter).toEqual([])
    expect(a.fullRun).toBe(true)
    expect(a.isLargeEquivalent).toBe(true)
    expect(parseArgs(['large', '--baseline', 'polish']).filter).toEqual(['polish'])
    expect(parseArgs(['polish']).baseline).toBe(false)
  })

  it('reads --section=<name> as a value flag, never as a suite filter (point 566)', () => {
    const a = parseArgs(['enrichments', '--section=crocodile'])
    expect(a.section).toBe('crocodile')
    expect(a.filter).toEqual(['enrichments'])
    // Bare `--section` parses as an EMPTY request, which the runner refuses with
    // the attached form — the value would otherwise have landed in `filter` and
    // silently run a second suite instead.
    expect(parseArgs(['enrichments', '--section']).section).toBe('')
    expect(parseArgs(['enrichments']).section).toBe(null)
  })
})


describe('backend selection (mirrors _browser.mjs)', () => {
  it('makes WEBGPU the everyday lane an unpinned run gets (point 571)', () => {
    expect(DEFAULT_BACKEND).toBe('webgpu')
    expect(selectBackend(undefined)).toBe('webgpu')
    expect(selectBackend('WebGPU')).toBe('webgpu')
  })

  it('keeps a PINNED value exactly as pinned — nothing is upgraded to the default', () => {
    expect(selectBackend('webgl')).toBe('webgl')
    // `VERIFY_GL=` in a shell arrives as '', and an unknown value is not a
    // licence to run the player's lane: both stay on the regression lane.
    expect(selectBackend('')).toBe('webgl')
    expect(selectBackend('nonsense')).toBe('webgl')
  })

  it('mirrors the default of _browser.mjs, the module the suites actually read', async () => {
    const source = await readFile('scripts/verify/_browser.mjs', 'utf8')
    expect(source).toMatch(/process\.env\.VERIFY_GL \?\? 'webgpu'/)
  })
})

describe('the WebGL2-only suites keep a real lane (point 571)', () => {
  it('routes touch/voice to WebGL 2 on a WebGPU pass, and leaves the rest alone', () => {
    for (const s of WEBGL_ONLY_SUITES) {
      expect(laneFor(s, 'webgpu')).toBe('webgl')
      expect(laneFor(s, 'webgl')).toBe('webgl')
    }
    for (const s of ['polish', 'flow', 'collision']) {
      expect(laneFor(s, 'webgpu')).toBe('webgpu')
      expect(laneFor(s, 'webgl')).toBe('webgl')
    }
  })

  it('keeps voice IN the everyday SMALL gate now that the gate runs on WebGPU', () => {
    const small = suitesFor({ tier: 'small', backend: DEFAULT_BACKEND })
    expect(small).toContain('voice')
    expect(skippedSuites({ tier: 'small', backend: DEFAULT_BACKEND })).toEqual([])
    // …and it runs there on WebGL 2, the only lane that can drive it.
    expect(laneFor('voice', DEFAULT_BACKEND)).toBe('webgl')
  })

  it('never resolves a named WebGL2-only suite to NOTHING', () => {
    for (const s of WEBGL_ONLY_SUITES) {
      const picked = suitesFor({ tier: null, filter: [s], backend: DEFAULT_BACKEND })
      expect(picked).toEqual([s])
      expect(laneFor(picked[0], DEFAULT_BACKEND)).toBe('webgl')
    }
  })

  it('drops them ONLY where a companion WebGL 2 pass already ran them', () => {
    const opts = { tier: 'large', backend: 'webgpu', webglOnlyCovered: true }
    expect(suitesFor(opts)).toEqual(DEV_SUITES.filter((s) => !WEBGL_ONLY_SUITES.includes(s)))
    expect(skippedSuites(opts)).toEqual(['touch', 'voice'])
    // The WebGL 2 pass of the same command drops nothing.
    expect(skippedSuites({ tier: 'large', backend: 'webgl', webglOnlyCovered: false })).toEqual([])
  })
})

describe('suite selection per tier and backend', () => {
  it('runs the whole LARGE set on WebGL 2', () => {
    expect(suitesFor({ tier: null, backend: 'webgl' })).toEqual(DEV_SUITES)
    expect(suitesFor({ tier: 'large', backend: 'webgl' })).toEqual(DEV_SUITES)
  })

  it('drops exactly touch/voice on the SECOND (WebGPU) pass of a both-backends run', () => {
    const webgpu = suitesFor({ tier: 'large', backend: 'webgpu', webglOnlyCovered: true })
    expect(webgpu).not.toContain('touch')
    expect(webgpu).not.toContain('voice')
    expect(webgpu).toEqual(DEV_SUITES.filter((s) => !WEBGL_ONLY_SUITES.includes(s)))
    expect(skippedSuites({ tier: 'large', backend: 'webgpu', webglOnlyCovered: true })).toEqual(['touch', 'voice'])
    // Nothing is silently dropped on the WebGL 2 pass.
    expect(skippedSuites({ tier: 'large', backend: 'webgl' })).toEqual([])
    // …nor on a STANDALONE WebGPU run, which has no companion pass to lean on:
    // there they stay in the set and laneFor puts them on WebGL 2 (point 571).
    expect(suitesFor({ tier: 'large', backend: 'webgpu' })).toEqual(DEV_SUITES)
    expect(skippedSuites({ tier: 'large', backend: 'webgpu' })).toEqual([])
  })

  it('runs the SMALL gate on its own set, in LARGE order', () => {
    expect(suitesFor({ tier: 'small', backend: 'webgl' })).toEqual(
      DEV_SUITES.filter((s) => SMALL_SUITES.includes(s)),
    )
  })

  it('honours a suite filter and ignores unknown names', () => {
    expect(suitesFor({ tier: null, filter: ['polish', 'flow'], backend: 'webgl' })).toEqual(['flow', 'polish'])
    expect(suitesFor({ tier: null, filter: ['build', 'lint', 'unit'], backend: 'webgl' })).toEqual([])
    // A filtered WebGPU run KEEPS the WebGL2-only suite it named — it runs it on
    // WebGL 2 (laneFor). Dropping it would answer `npm test -- voice` with nothing.
    expect(suitesFor({ tier: null, filter: ['flow', 'voice'], backend: 'webgpu' })).toEqual(['flow', 'voice'])
  })
})

describe('both-backends LARGE wiring (point 204b)', () => {
  it('plans WebGL 2 first (full) then WebGPU (no preflight) for a bare LARGE run', () => {
    for (const argv of [[], ['large']]) {
      const { isLargeEquivalent } = parseArgs(argv)
      expect(planBackends({ isLargeEquivalent, verifyGl: undefined })).toEqual([
        { backend: 'webgl', skipPreflight: false, webglOnlyCovered: false },
        { backend: 'webgpu', skipPreflight: true, webglOnlyCovered: true },
      ])
    }
  })

  it('stays single-backend when VERIFY_GL is pinned (the per-backend clear command)', () => {
    const { isLargeEquivalent } = parseArgs(['large'])
    expect(planBackends({ isLargeEquivalent, verifyGl: 'webgpu' })).toEqual([])
    expect(planBackends({ isLargeEquivalent, verifyGl: 'webgl' })).toEqual([])
  })

  it('stays single-backend for the SMALL tier and a bare suite filter', () => {
    expect(planBackends({ ...parseArgs(['small']), verifyGl: undefined })).toEqual([])
    expect(planBackends({ ...parseArgs(['flow']), verifyGl: undefined })).toEqual([])
  })

  it('runs an explicitly-LARGE single suite on both backends (`npm test -- large polish`)', () => {
    const a = parseArgs(['large', 'polish'])
    expect(planBackends({ ...a, verifyGl: undefined }).map((p) => p.backend)).toEqual(['webgl', 'webgpu'])
    for (const p of planBackends({ ...a, verifyGl: undefined })) {
      expect(suitesFor({ tier: a.tier, filter: a.filter, backend: p.backend })).toEqual(['polish'])
    }
  })

  it('never recurses: a re-invoked pass plans no further passes', () => {
    const { isLargeEquivalent } = parseArgs([])
    expect(planBackends({ isLargeEquivalent, verifyGl: undefined, ranBoth: true })).toEqual([])
  })

  it('covers every render suite on BOTH backends across the planned passes', () => {
    const { tier, isLargeEquivalent } = parseArgs([])
    const plan = planBackends({ isLargeEquivalent, verifyGl: undefined })
    const perBackend = plan.map((p) => suitesFor({ tier, backend: p.backend, webglOnlyCovered: p.webglOnlyCovered }))
    const renderSuites = DEV_SUITES.filter((s) => !WEBGL_ONLY_SUITES.includes(s) && s !== 'docs')
    for (const s of renderSuites) for (const run of perBackend) expect(run).toContain(s)
    // The WebGL2-only pair is covered EXACTLY ONCE, on WebGL 2 — never zero times.
    for (const s of WEBGL_ONLY_SUITES) {
      const lanes = plan
        .filter((p, i) => perBackend[i].includes(s))
        .map((p) => laneFor(s, p.backend))
      expect(lanes).toEqual(['webgl'])
    }
  })

  it('sends the everyday commands to WebGPU while LARGE keeps both lanes (point 571)', () => {
    // The everyday gate and a per-point suite pick: one pass, on the player's backend.
    for (const argv of [['small'], ['polish'], ['flow', 'collision']]) {
      const a = parseArgs(argv)
      expect(planBackends({ ...a, verifyGl: undefined })).toEqual([])
      expect(selectBackend(process.env.VERIFY_GL_UNSET_FOR_TEST)).toBe('webgpu')
    }
    // LARGE is unchanged: still the regression lane FIRST, then the player's.
    const large = planBackends({ ...parseArgs(['large']), verifyGl: undefined })
    expect(large.map((p) => p.backend)).toEqual(['webgl', 'webgpu'])
  })
})
