// The regression's suite→tier→backend map (point 204). run-all.mjs spawns
// servers and child processes, so its wiring is proven here at the decision
// level instead of by running every suite twice: which suites a tier picks,
// which backend(s) a command covers, and which suites a WebGPU pass skips.
import { describe, it, expect } from 'vitest'
import {
  DEV_SUITES, SMALL_SUITES, WEBGL_ONLY_SUITES,
  parseArgs, planBackends, selectBackend, skippedSuites, suitesFor,
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
    for (const s of ['enrichments', 'polish', 'settings', 'invariants', 'handwriting', 'gamepad']) {
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
    expect(parseArgs([])).toEqual({ tier: null, filter: [], fullRun: true, isLargeEquivalent: true })
  })

  it('reads an explicit tier token, leaving no filter behind', () => {
    expect(parseArgs(['small'])).toEqual({ tier: 'small', filter: [], fullRun: true, isLargeEquivalent: false })
    expect(parseArgs(['large'])).toEqual({ tier: 'large', filter: [], fullRun: true, isLargeEquivalent: true })
  })

  it('reads a bare suite filter as a quick single run (no preflight, not LARGE)', () => {
    const a = parseArgs(['flow', 'polish'])
    expect(a).toEqual({ tier: null, filter: ['flow', 'polish'], fullRun: false, isLargeEquivalent: false })
  })

  it('reads an explicit `large` WITH a filter as a preflighted both-backends run of that suite', () => {
    const a = parseArgs(['large', 'polish'])
    expect(a).toEqual({ tier: 'large', filter: ['polish'], fullRun: true, isLargeEquivalent: true })
  })
})

describe('backend selection (mirrors _browser.mjs)', () => {
  it('defaults to WebGL 2 and only "webgpu" (any case) selects WebGPU', () => {
    expect(selectBackend(undefined)).toBe('webgl')
    expect(selectBackend('')).toBe('webgl')
    expect(selectBackend('webgl')).toBe('webgl')
    expect(selectBackend('nonsense')).toBe('webgl')
    expect(selectBackend('WebGPU')).toBe('webgpu')
  })
})

describe('suite selection per tier and backend', () => {
  it('runs the whole LARGE set on WebGL 2', () => {
    expect(suitesFor({ tier: null, backend: 'webgl' })).toEqual(DEV_SUITES)
    expect(suitesFor({ tier: 'large', backend: 'webgl' })).toEqual(DEV_SUITES)
  })

  it('drops exactly touch/voice on the WebGPU pass, and reports them as skipped', () => {
    const webgpu = suitesFor({ tier: 'large', backend: 'webgpu' })
    expect(webgpu).not.toContain('touch')
    expect(webgpu).not.toContain('voice')
    expect(webgpu).toEqual(DEV_SUITES.filter((s) => !WEBGL_ONLY_SUITES.includes(s)))
    expect(skippedSuites({ tier: 'large', backend: 'webgpu' })).toEqual(['touch', 'voice'])
    // Nothing is silently dropped on the WebGL 2 pass.
    expect(skippedSuites({ tier: 'large', backend: 'webgl' })).toEqual([])
  })

  it('runs the SMALL gate on its own set, in LARGE order', () => {
    expect(suitesFor({ tier: 'small', backend: 'webgl' })).toEqual(
      DEV_SUITES.filter((s) => SMALL_SUITES.includes(s)),
    )
  })

  it('honours a suite filter and ignores unknown names', () => {
    expect(suitesFor({ tier: null, filter: ['polish', 'flow'], backend: 'webgl' })).toEqual(['flow', 'polish'])
    expect(suitesFor({ tier: null, filter: ['build', 'lint', 'unit'], backend: 'webgl' })).toEqual([])
    // A filtered WebGPU run still drops the WebGL2-only suite it named.
    expect(suitesFor({ tier: null, filter: ['flow', 'voice'], backend: 'webgpu' })).toEqual(['flow'])
  })
})

describe('both-backends LARGE wiring (point 204b)', () => {
  it('plans WebGL 2 first (full) then WebGPU (no preflight) for a bare LARGE run', () => {
    for (const argv of [[], ['large']]) {
      const { isLargeEquivalent } = parseArgs(argv)
      expect(planBackends({ isLargeEquivalent, verifyGl: undefined })).toEqual([
        { backend: 'webgl', skipPreflight: false },
        { backend: 'webgpu', skipPreflight: true },
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
    const perBackend = plan.map((p) => suitesFor({ tier, backend: p.backend }))
    const renderSuites = DEV_SUITES.filter((s) => !WEBGL_ONLY_SUITES.includes(s) && s !== 'docs')
    for (const s of renderSuites) for (const run of perBackend) expect(run).toContain(s)
  })
})
