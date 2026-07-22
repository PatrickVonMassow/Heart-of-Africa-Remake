// Decision-logic sweep of the render-verify Stop-hook guard
// (render-verify-core): a committed render change without a passing verify run
// on BOTH backends blocks (naming the missing backend and the exact command), a
// covered or non-render change allows, the loud deferral valve allows for the
// current HEAD only, and partial/malformed inputs never throw (the wrapper's
// fail-open depends on the core being total). The regression that motivated the
// guard — the point-210 coast fix called done after a WebGL2-only check while
// the WebGPU picture was still stepped — is pinned explicitly.
import { describe, it, expect } from 'vitest'
import {
  BACKENDS,
  isRenderPath,
  coveringRun,
  suggestSuite,
  baselineFor,
  evaluate,
} from './render-verify-core.mjs'

/** A passing run record as the recorder writes it. */
function run(backend, at, overrides = {}) {
  return { backend, suite: 'enrichments', startedAt: at - 60_000, at, exit: 0, asserted: true, ...overrides }
}

/** The motivating scenario: a committed water-shader change, edited at t=1000. */
function renderChange(overrides = {}) {
  return {
    head: 'def5678',
    clearedHead: 'abc1234',
    changedRenderPaths: ['src/scenes/travel/waterSurface.ts'],
    latestChangeAt: 1000,
    runs: [],
    deferral: null,
    ...overrides,
  }
}

describe('BACKENDS', () => {
  it('requires exactly the two shipped backends', () => {
    expect(BACKENDS).toEqual(['webgpu', 'webgl'])
  })
})

describe('isRenderPath', () => {
  it('matches the render/scene/HUD trees, the renderer entry and TSL shaders', () => {
    expect(isRenderPath('src/render/fauna.ts')).toBe(true)
    expect(isRenderPath('src/scenes/travel/waterSurface.ts')).toBe(true)
    expect(isRenderPath('src/ui/Hud.tsx')).toBe(true)
    expect(isRenderPath('src/App.tsx')).toBe(true)
    expect(isRenderPath('src/systems/glow.tsl.ts')).toBe(true)
  })
  it('tolerates backslash (Windows git-config) separators', () => {
    expect(isRenderPath('src\\scenes\\travel\\waterSurface.ts')).toBe(true)
  })
  it('matches browser verify suites but not the pure-node runner/checks', () => {
    expect(isRenderPath('scripts/verify/enrichments.mjs')).toBe(true)
    expect(isRenderPath('scripts/verify/_browser.mjs')).toBe(true)
    expect(isRenderPath('scripts/verify/run-all.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/docs.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/ttsCache.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/README.md')).toBe(false)
  })
  it('ignores logic/store/docs paths (a pure logic change needs no dual picture)', () => {
    expect(isRenderPath('src/state/store.ts')).toBe(false)
    expect(isRenderPath('src/systems/season.ts')).toBe(false)
    expect(isRenderPath('src/i18n/en.ts')).toBe(false)
    expect(isRenderPath('docs/climate-1890.md')).toBe(false)
    expect(isRenderPath('TASKS.md')).toBe(false)
    expect(isRenderPath('scripts/render-verify-core.mjs')).toBe(false)
  })
  it('is total on garbage input', () => {
    expect(isRenderPath(null)).toBe(false)
    expect(isRenderPath(undefined)).toBe(false)
    expect(isRenderPath('')).toBe(false)
    expect(isRenderPath(42)).toBe(false)
  })
})

describe('coveringRun', () => {
  it('finds the most recent passing run of the backend at/after since', () => {
    const runs = [run('webgpu', 2000), run('webgpu', 3000), run('webgl', 4000)]
    expect(coveringRun(runs, 'webgpu', 1000).at).toBe(3000)
  })
  it('rejects runs that predate the last render edit (they never saw the final code)', () => {
    expect(coveringRun([run('webgpu', 500)], 'webgpu', 1000)).toBeNull()
  })
  it('rejects failed runs — a crashed suite proves nothing about the picture', () => {
    expect(coveringRun([run('webgpu', 2000, { exit: 1 })], 'webgpu', 1000)).toBeNull()
  })
  it('never crosses backends', () => {
    expect(coveringRun([run('webgl', 2000)], 'webgpu', 1000)).toBeNull()
  })
  it('is total on garbage', () => {
    expect(coveringRun(null, 'webgpu', 0)).toBeNull()
    expect(coveringRun([null, {}, 'x'], 'webgpu', 0)).toBeNull()
  })
})

describe('suggestSuite', () => {
  it('names the most recently run suite', () => {
    expect(suggestSuite([run('webgl', 1, { suite: 'flow' }), run('webgpu', 2, { suite: 'polish' })])).toBe('polish')
  })
  it('falls back to enrichments on no usable record', () => {
    expect(suggestSuite([])).toBe('enrichments')
    expect(suggestSuite([run('webgl', 1, { suite: 'unknown' })])).toBe('enrichments')
    expect(suggestSuite(null)).toBe('enrichments')
  })
})

describe('evaluate — non-render changes pass freely', () => {
  it('allows and advances the baseline when HEAD moved with no render diff', () => {
    const r = evaluate(renderChange({ changedRenderPaths: [] }))
    expect(r).toEqual({ decision: 'allow', clear: true })
  })
  it('does not advance the baseline when HEAD did not move', () => {
    const r = evaluate(renderChange({ changedRenderPaths: [], head: 'abc1234' }))
    expect(r.decision).toBe('allow')
    expect(r.clear).toBe(false)
  })
})

describe('evaluate — the dual-backend gate', () => {
  it('allows a render change once BOTH backends have a passing run after the edit', () => {
    const r = evaluate(renderChange({ runs: [run('webgpu', 2000), run('webgl', 2500)] }))
    expect(r).toEqual({ decision: 'allow', clear: true })
  })
  it('blocks the point-210 regression: only WebGL2 verified — names WEBGPU + the exact command', () => {
    const r = evaluate(renderChange({ runs: [run('webgl', 2000)] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOT VERIFIED ON WEBGPU/)
    expect(r.reason).toContain('VERIFY_GL=webgpu node scripts/verify/run-all.mjs enrichments')
    expect(r.reason).not.toMatch(/VERIFY_GL=webgl /)
    expect(r.reason).toContain('src/scenes/travel/waterSurface.ts')
  })
  it('blocks the mirror case: only WebGPU verified — names webgl', () => {
    const r = evaluate(renderChange({ runs: [run('webgpu', 2000)] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOT VERIFIED ON WEBGL/)
    expect(r.reason).toContain('VERIFY_GL=webgl node scripts/verify/run-all.mjs enrichments')
  })
  it('blocks with no runs at all — names EITHER BACKEND and both commands', () => {
    const r = evaluate(renderChange())
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/EITHER BACKEND/)
    expect(r.reason).toContain('VERIFY_GL=webgpu node scripts/verify/run-all.mjs')
    expect(r.reason).toContain('VERIFY_GL=webgl node scripts/verify/run-all.mjs')
    expect(r.reason).toContain('--defer')
  })
  it('blocks when a backend was only verified BEFORE the last render edit', () => {
    // webgpu ran at 800, the file was edited again at 1000 → the run is stale.
    const r = evaluate(renderChange({ runs: [run('webgpu', 800), run('webgl', 2000)] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/WEBGPU/)
  })
  it('ignores failed runs for coverage', () => {
    const r = evaluate(renderChange({ runs: [run('webgpu', 2000, { exit: 1 }), run('webgl', 2000)] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/WEBGPU/)
  })
  it('suggests the most recently run suite in the command', () => {
    const r = evaluate(renderChange({ runs: [run('webgl', 2000, { suite: 'polish' })] }))
    expect(r.reason).toContain('VERIFY_GL=webgpu node scripts/verify/run-all.mjs polish')
  })
  it('caps the listed paths but still blocks on many changes', () => {
    const paths = Array.from({ length: 9 }, (_, i) => `src/render/f${i}.ts`)
    const r = evaluate(renderChange({ changedRenderPaths: paths }))
    expect(r.decision).toBe('block')
    expect(r.reason).toContain('…')
  })
})

describe('baselineFor — the per-branch verified baseline (feature-branch workflow)', () => {
  const state = {
    clearedHead: 'featTip99', // legacy scalar — last cleared anywhere (here: the branch)
    clearedHeads: { main: 'mainBase1', 'feat/42-water': 'featTip99' },
  }
  it('picks each branch its OWN baseline', () => {
    expect(baselineFor(state, 'main')).toBe('mainBase1')
    expect(baselineFor(state, 'feat/42-water')).toBe('featTip99')
  })
  it('the branch-switch case: back on main, the baseline is main’s own entry, never the branch tip', () => {
    // Before the per-branch map, switching feat/42-water -> main compared main
    // against the branch tip and re-showed the verified branch work as pending.
    expect(baselineFor(state, 'main')).not.toBe(state.clearedHead)
  })
  it('falls back to the legacy scalar for a branch without an entry (first visit)', () => {
    expect(baselineFor({ clearedHead: 'abc1234' }, 'feat/7-new')).toBe('abc1234')
    expect(baselineFor(state, 'feat/7-new')).toBe('featTip99')
  })
  it('null when no baseline exists at all (the wrapper bootstraps)', () => {
    expect(baselineFor({}, 'main')).toBeNull()
    expect(baselineFor(null, 'main')).toBeNull()
  })
  it('total on malformed input', () => {
    expect(() => baselineFor({ clearedHeads: 'garbage', clearedHead: 42 }, 'main')).not.toThrow()
    expect(baselineFor({ clearedHeads: null, clearedHead: '' }, '')).toBeNull()
  })
})

describe('evaluate — the loud deferral valve', () => {
  it('allows a deferral covering the CURRENT head, flagged and consumed', () => {
    const r = evaluate(renderChange({ deferral: { head: 'def5678', reason: 'washed-out headless WebGPU', at: 1 } }))
    expect(r).toEqual({ decision: 'allow', clear: true, deferred: true })
  })
  it('re-blocks once HEAD moved past the deferred commit', () => {
    const r = evaluate(renderChange({ deferral: { head: 'abc1234', reason: 'old', at: 1 } }))
    expect(r.decision).toBe('block')
  })
})

describe('evaluate — totality and fail-open posture', () => {
  it('never throws on empty, null, or malformed input', () => {
    expect(() => evaluate()).not.toThrow()
    expect(() => evaluate(null)).not.toThrow()
    expect(() => evaluate({})).not.toThrow()
    expect(() =>
      evaluate({ head: 42, clearedHead: null, changedRenderPaths: 'garbage', latestChangeAt: NaN, runs: 'x', deferral: 7 }),
    ).not.toThrow()
  })
  it('allows (without advancing the baseline) when the path list is garbage', () => {
    const r = evaluate(renderChange({ changedRenderPaths: 'garbage' }))
    expect(r.decision).toBe('allow')
    expect(r.clear).toBeUndefined()
  })
  it('empty input reads as nothing enforceable → allow', () => {
    expect(evaluate({}).decision).toBe('allow')
  })
  it('accepts any recorded passing runs when no edit time is known (NaN → since 0)', () => {
    const r = evaluate(renderChange({ latestChangeAt: NaN, runs: [run('webgpu', 5), run('webgl', 5)] }))
    expect(r.decision).toBe('allow')
  })
})
