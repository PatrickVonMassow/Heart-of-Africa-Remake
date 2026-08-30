// Decision-logic sweep of the render-verify Stop-hook guard
// (render-verify-core): a committed render change without a passing verify run
// on BOTH backends blocks (naming the missing backend and the exact command), a
// covered or non-render change allows, the loud deferral valve allows for the
// current HEAD only, and partial/malformed inputs never throw (the wrapper's
// fail-open depends on the core being total). The regression that motivated the
// guard — the point-210 coast fix called done after a WebGL2-only check while
// the WebGPU picture was still stepped — is pinned explicitly.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  BACKENDS,
  NON_RENDER_VERIFY,
  featureLevelOf,
  isRenderPath,
  isBackendSensitivePath,
  coveringRun,
  suggestSuite,
  baselineFor,
  evaluate,
  pointStatusesFrom,
  chargeablePoints,
  chargeFor,
  chargeReds,
  markVariedDetails,
  runVerdict,
  formatSuspectEnv,
  parseSuspectEnv,
  parseSuspectReds,
  suspectRedsOf,
  unexplainedRuns,
  isIncompleteRecording,
  incompleteClosureFor,
  crashClosureFor,
  droppedLinesOf,
  runIdentity,
  derivedRedKey,
  SUSPECT_UNNAMED,
  TRUNCATED_KIND,
} from './render-verify-core.mjs'
import { RED_CHARGES } from './render-verify-charges.mjs'
import { checkKey, failedChecks } from './verify/baseline-classify-core.mjs'
import { readTasksAll } from './tasks-source.mjs'

const VERIFY_DIR = join(dirname(fileURLToPath(import.meta.url)), 'verify')

/** A passing run record as the recorder writes it. */
function run(backend, at, overrides = {}) {
  // `startedAt` sits just before `at`: these fixtures model runs that BEGAN
  // after the edit they are judged against, which is what a real repair loop
  // does. The case where a run began BEFORE the edit has its own tests below.
  return { backend, suite: 'enrichments', startedAt: at - 10, at, exit: 0, asserted: true, ...overrides }
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
    expect(isRenderPath('scripts/verify/fixedWaits.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/README.md')).toBe(false)
  })
  // Regression witnesses (27.07.2026): three commits touching ONLY harness
  // scripts that draw nothing each demanded a full both-backend picture check.
  it('never treats the non-drawing harness as a render path', () => {
    expect(isRenderPath('scripts/verify/machine-load.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/machine-load-core.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/baseline-classify.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/_server.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/tiers.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/liveness.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/textureLeak.mjs')).toBe(false)
  })
  // A DENYLIST, so an unknown verify script defaults INTO the set: a suite added
  // tomorrow is covered from its first commit without touching this file.
  it('keeps an unrecognised verify script in the render set', () => {
    expect(isRenderPath('scripts/verify/brandNewSuite.mjs')).toBe(true)
  })
  // Regression witness: a *.test.mjs beside the suites runs in jsdom and never
  // opens a browser. Treating it as a render path demanded a two-backend
  // browser run for editing a pure text scanner.
  it('never treats a Vitest file beside the suites as a render path', () => {
    expect(isRenderPath('scripts/verify/fixedWaits.test.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/tiers.test.mjs')).toBe(false)
    expect(isRenderPath('scripts/verify/textureLeak.test.mjs')).toBe(false)
  })
  // Point 376: world geometry reaches the frame without naming the renderer —
  // the coast contour, the heightfield, the river courses, the landmark spots.
  it('matches the world-geometry sources that feed the rendered terrain', () => {
    expect(isRenderPath('src/world/redSea.ts')).toBe(true)
    expect(isRenderPath('src/world/terrain.ts')).toBe(true)
    expect(isRenderPath('src/world/coastVector.ts')).toBe(true)
    expect(isRenderPath('src/world/hydro.ts')).toBe(true)
    expect(isRenderPath('src/world/data/landmarks.ts')).toBe(true)
    expect(isRenderPath('src\\world\\redSea.ts')).toBe(true)
    // …but a Vitest file beside them still is not one.
    expect(isRenderPath('src/world/redSea.test.ts')).toBe(false)
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

  // Point 361: the old rule ignored the change and ratcheted — one enrichments
  // run made the 37-frame, 951-second suite the standing suggestion forever.
  // Only the DOM-only narrowing survived the historical replay.
  it('sends a DOM-only change to flow instead of the 37-frame suite', () => {
    const runs = [run('webgl', 1, { suite: 'enrichments' })]
    expect(suggestSuite(runs, ['src/ui/Hud.tsx'])).toBe('flow')
    expect(suggestSuite([], ['src/ui/Hud.tsx', 'src/ui/DebugMenu.tsx'])).toBe('flow')
  })
  it('does not narrow when any changed path can render per backend', () => {
    const runs = [run('webgl', 1, { suite: 'polish' })]
    expect(suggestSuite(runs, ['src/ui/Hud.tsx', 'src/render/water.ts'])).toBe('polish')
    expect(suggestSuite(runs, ['src/scenes/travel/TravelScene.tsx'])).toBe('polish')
    // The general path→suite map was REJECTED by the replay; travel-scene code
    // must keep the old suggestion, not acquire a new one.
    expect(suggestSuite([], ['src/scenes/travel/TravelScene.tsx'])).toBe('enrichments')
  })
  it('ignores a path list that is empty, absent or not render paths', () => {
    expect(suggestSuite([], [])).toBe('enrichments')
    expect(suggestSuite([], null)).toBe('enrichments')
    expect(suggestSuite([], ['README.md'])).toBe('enrichments')
    // A jsdom test under src/ui/ is not a render path at all (isRenderPath),
    // so it must not smuggle a suite suggestion out of this branch.
    expect(suggestSuite([], ['src/ui/Hud.test.tsx'])).toBe('enrichments')
  })
  it('names flow in the block message for a DOM-only change', () => {
    const r = evaluate(renderChange({ changedRenderPaths: ['src/ui/Hud.tsx'] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toContain('run-all.mjs flow')
    expect(r.reason).not.toContain('run-all.mjs enrichments')
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

  it('hands browser and throttle work to the successor after the context fence closes', () => {
    const r = evaluate(renderChange({
      fence: { closed: true, successor: 'the successor session' },
      sessionId: 'sealed-session',
    }))
    expect(r).toMatchObject({ decision: 'defer', deferred: true, debt: { decision: 'block' } })
    expect(r.reason).toContain('render-verify-guard')
    expect(r.reason).toContain('successor session')
    expect(r.reason).toContain('batch-boundary.mjs --clear')
    expect(r.clear).toBeUndefined()
  })

  it('still demands the pending render work on the successor\'s first turn', () => {
    const r = evaluate(renderChange({
      fence: { closed: false, successor: 'the successor session' },
      sessionId: 'successor-session',
    }))
    expect(r.decision).toBe('block')
    expect(r.reason).toContain('verify/run-all.mjs')
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

// ---------------------------------------------------------------------------
// The DOM exemption (user 26.07.2026): the HUD renders identically under either
// backend, so a change there owes ONE picture, not two. Everything else in the
// render set stays dual — the witnesses are point 175 and point 334, which both
// appeared on a single backend from code that looks backend-neutral.
describe('isBackendSensitivePath — where two pictures are actually needed', () => {
  it('exempts the DOM overlays but still counts them as render paths', () => {
    for (const p of ['src/ui/Hud.tsx', 'src/ui/Dialogs.tsx', 'src/ui/MapOverlay.tsx']) {
      expect(isRenderPath(p)).toBe(true)
      expect(isBackendSensitivePath(p)).toBe(false)
    }
  })

  it('keeps everything that draws into the canvas dual-backend', () => {
    for (const p of [
      'src/render/materials.ts',
      'src/render/water.tsl.ts',
      'src/App.tsx',
      'src/scenes/travel/waterSurface.ts',
      'src/scenes/place/PlaceScene.tsx',
      'scripts/verify/polish.mjs',
    ]) {
      expect(isBackendSensitivePath(p)).toBe(true)
    }
  })

  it('says no to paths outside the render set entirely', () => {
    for (const p of ['src/state/store.ts', 'TASKS.md', '', null]) {
      expect(isBackendSensitivePath(p)).toBe(false)
    }
  })

  it('a HUD-only change is cleared by ONE passing run, either backend', () => {
    const base = {
      head: 'head123',
      clearedHead: 'old1234',
      changedRenderPaths: ['src/ui/Hud.tsx'],
      latestChangeAt: 1000,
    }
    for (const backend of ['webgpu', 'webgl']) {
      const r = evaluate({ ...base, runs: [run(backend, 2000)] })
      expect(r.decision).toBe('allow')
    }
    expect(evaluate({ ...base, runs: [] }).decision).toBe('block')
  })

  it('a canvas change is NOT cleared by one run — the point-210 rule is intact', () => {
    const r = evaluate({
      head: 'head123',
      clearedHead: 'old1234',
      changedRenderPaths: ['src/ui/Hud.tsx', 'src/render/materials.ts'],
      latestChangeAt: 1000,
      runs: [run('webgl', 2000)],
    })
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/WEBGPU/)
  })
})

// Regression witness (26.07.2026): a Vitest file added under src/ui/ demanded a
// browser picture, because the rule that exempts them was written only for the
// files beside the browser suites. A jsdom test cannot move a pixel wherever it
// lives.
describe('isRenderPath — Vitest files are never render paths', () => {
  it('exempts them under the render trees too, not only beside the suites', () => {
    for (const p of [
      'src/ui/domOnly.test.ts',
      'src/ui/Hud.test.tsx',
      'src/render/fauna.test.ts',
      'src/scenes/place/layout.test.ts',
      'scripts/verify/tiers.test.mjs',
    ]) {
      expect(isRenderPath(p)).toBe(false)
      expect(isBackendSensitivePath(p)).toBe(false)
    }
  })

  it('still catches the production files beside them', () => {
    expect(isRenderPath('src/ui/Hud.tsx')).toBe(true)
    expect(isRenderPath('src/render/fauna.ts')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The founding case, replayed as a commit (point 376). `9284f05` — "Crop the
// Gulf-of-Suez head cleanly" — is the fix for corpus row 1, the stepped coast
// that was called done after a WebGL2-only check while WebGPU still showed the
// steps (docs/picture-check-cost.md §4). Its diff is these two files and
// nothing else, and the guard as first written classified neither as a render
// path: it would have waved through the very bug it exists because of.
describe('the point-210 commit (9284f05) — the bug the guard exists for', () => {
  const CHANGED = ['src/world/redSea.test.ts', 'src/world/redSea.ts']

  it('is a render change, and a backend-sensitive one', () => {
    expect(CHANGED.filter(isRenderPath)).toEqual(['src/world/redSea.ts'])
    expect(CHANGED.some(isBackendSensitivePath)).toBe(true)
  })

  it('demands the picture on BOTH backends — a WebGL2-only run does not clear it', () => {
    const commit = {
      head: 'head9284',
      clearedHead: 'old01fa8',
      changedRenderPaths: CHANGED.filter(isRenderPath),
      latestChangeAt: 1000,
    }
    expect(evaluate({ ...commit, runs: [] }).decision).toBe('block')
    const webglOnly = evaluate({ ...commit, runs: [run('webgl', 2000)] })
    expect(webglOnly.decision).toBe('block')
    expect(webglOnly.reason).toMatch(/NOT VERIFIED ON WEBGPU/)
    expect(webglOnly.reason).toContain('src/world/redSea.ts')
    expect(evaluate({ ...commit, runs: [run('webgl', 2000), run('webgpu', 2100)] }).decision).toBe(
      'allow',
    )
  })
})

// ---------------------------------------------------------------------------
// The harness denylist is a claim about the FILES, so it is checked against
// them rather than against itself: a script under scripts/verify/ belongs to
// the render set exactly when it drives a browser (playwright directly, or the
// shared _browser/_boot helpers). A new suite is therefore covered by default
// and a new helper fails here until it is listed — the list can go stale, the
// directory cannot.
describe('featureLevelOf (point 505 — the third signal beside backend and pixel)', () => {
  // What assertBackend reads off the running renderer, in the two shapes that matter.
  const core = { isWebGPU: true, compatibilityMode: false, coreFeatures: true }
  const compat = { isWebGPU: true, compatibilityMode: true, coreFeatures: false }

  it('names the player\'s adapter core', () => {
    expect(featureLevelOf(core)).toBe('core')
  })

  it('names the GLES lane\'s adapter compatibility', () => {
    expect(featureLevelOf(compat)).toBe('compatibility')
  })

  it('trusts the DEVICE feature over three\'s own flag when the two disagree', () => {
    // `core-features-and-limits` is the spec's answer; compatibilityMode is three's
    // reading of it. If a three version ever set the flag on a core device, the record
    // must still say core — the guard's question is which adapter the run really had.
    expect(featureLevelOf({ isWebGPU: true, compatibilityMode: true, coreFeatures: true })).toBe('core')
    expect(featureLevelOf({ isWebGPU: true, compatibilityMode: false, coreFeatures: false })).toBe('compatibility')
  })

  it('falls back to three\'s flag only where the device could not be asked', () => {
    expect(featureLevelOf({ isWebGPU: true, compatibilityMode: true, coreFeatures: null })).toBe('compatibility')
  })

  it('never CLAIMS core without evidence — an unreadable level is null', () => {
    expect(featureLevelOf({ isWebGPU: true, compatibilityMode: false, coreFeatures: null })).toBe(null)
    expect(featureLevelOf({ isWebGPU: true })).toBe(null)
  })

  it('answers null for the WebGL 2 lane, where the question does not apply', () => {
    expect(featureLevelOf({ isWebGPU: false, compatibilityMode: false, coreFeatures: null })).toBe(null)
  })

  it('is total on partial input — the wrapper\'s fail-open depends on it', () => {
    for (const bad of [null, undefined, 0, '', [], { isWebGPU: 'yes' }]) {
      expect(() => featureLevelOf(bad)).not.toThrow()
      expect(featureLevelOf(bad)).toBe(null)
    }
  })
})

describe('coveringRun and the feature level (point 505)', () => {
  const since = 1000
  const coreRun = run('webgpu', 2000, { featureLevel: 'core' })
  const compatRun = run('webgpu', 2100, { featureLevel: 'compatibility' })
  const legacyRun = run('webgpu', 2200) // recorded before the level was written at all

  it('books a core run as core coverage', () => {
    expect(coveringRun([coreRun], 'webgpu', since, { featureLevel: 'core' })).toEqual(coreRun)
  })

  it('books a compat run as compat coverage', () => {
    expect(coveringRun([compatRun], 'webgpu', since, { featureLevel: 'compatibility' })).toEqual(compatRun)
  })

  it('NEVER lets a compat run pass as core coverage — the point of the third signal', () => {
    expect(coveringRun([compatRun], 'webgpu', since, { featureLevel: 'core' })).toBe(null)
    // …not even when it is the newest run on that backend.
    expect(coveringRun([coreRun, compatRun], 'webgpu', since, { featureLevel: 'core' })).toEqual(coreRun)
  })

  it('treats an UNRECORDED level as no evidence of the core path', () => {
    expect(coveringRun([legacyRun], 'webgpu', since, { featureLevel: 'core' })).toBe(null)
  })

  it('stays level-agnostic when nothing is asked — the guard keeps working as before', () => {
    // Deliberate: on a host whose only WebGPU adapter is compat, demanding core here
    // would block every render change forever with no way to clear it. The level is
    // RECORDED so a reader can tell; the gate still judges by backend.
    expect(coveringRun([compatRun], 'webgpu', since)).toEqual(compatRun)
    expect(coveringRun([legacyRun], 'webgpu', since)).toEqual(legacyRun)
  })

  it('still refuses a failed run whatever level it claims', () => {
    const failed = run('webgpu', 2300, { featureLevel: 'core', exit: 1 })
    expect(coveringRun([failed], 'webgpu', since, { featureLevel: 'core' })).toBe(null)
    expect(coveringRun([failed], 'webgpu', since)).toBe(null)
  })

  it('survives a missing options argument and a malformed one', () => {
    expect(coveringRun([coreRun], 'webgpu', since, {})).toEqual(coreRun)
    expect(() => coveringRun([coreRun], 'webgpu', since, undefined)).not.toThrow()
  })
})

describe('NON_RENDER_VERIFY matches the actual scripts/verify/ tree', () => {
  const scripts = readdirSync(VERIFY_DIR)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((f) => ({ file: f, source: readFileSync(join(VERIFY_DIR, f), 'utf8') }))

  const drivesBrowser = ({ file, source }) =>
    file === '_browser.mjs' ||
    file === '_boot.mjs' ||
    /^import .*from '(playwright|\.\/_browser\.mjs|\.\/_boot\.mjs)'/m.test(source)

  it('finds the suites at all (a mis-resolved directory must not pass silently)', () => {
    expect(scripts.length).toBeGreaterThan(20)
    expect(scripts.filter(drivesBrowser).length).toBeGreaterThan(15)
  })

  it('classifies every verify script by whether it drives a browser', () => {
    const wrong = scripts
      .filter((s) => isRenderPath(`scripts/verify/${s.file}`) !== drivesBrowser(s))
      .map((s) => s.file)
    expect(wrong).toEqual([])
  })

  it('lists no script that no longer exists', () => {
    const present = new Set(scripts.map((s) => s.file))
    expect([...NON_RENDER_VERIFY].filter((f) => !present.has(f))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// POINT 550 — a run whose reds are each ACCOUNTED FOR
//
// The gate counted only an exit-0 run, and `polish` could not exit 0 for reasons
// belonging to OTHER points (the 546 render-target assert, the 506 goat stance on
// the software lane), so every change under scripts/verify/ could be cleared only
// by a hand-written --defer. A gate routinely overridden by hand stops being a
// gate. These cases pin the replacement AND its limits: nothing clears on a red
// charged to nothing, on a red charged to a finished point, or on a run that never
// said why it failed.
// ---------------------------------------------------------------------------

/** A red as the recorder writes it into the run record. */
const red = (name, point = null, kind = 'check') => ({ name, key: name.toLowerCase(), kind, point })

/**
 * THE TRUNCATION MARKER EXACTLY AS THE RECORDER WROTE IT, defined ONCE so the
 * cases cannot drift into two different "production" shapes (review finding,
 * 28.08.2026 — one fixture had shortened the name, and the tests that claimed to
 * drive the real record through a closure were driving a stand-in). Both shapes
 * carry the same name and the same stable key; only the KIND changed, when the
 * `truncated` kind was introduced.
 *
 * These are the records ALREADY ON FILE. Today's recorder writes the truncation
 * as a FIELD (`truncated: true, droppedLines: N`) when a run passes
 * MAX_RED_IDENTITIES — the class is alive, it is simply no longer written as a
 * synthetic red (round 14; an earlier version of this comment said the cap was
 * gone outright, which stopped being true when the ceiling was added).
 */
const truncationMarker = (dropped, kind) => ({
  name: `${dropped} further result line(s) exceeded the capture cap — this run's reds were NOT all read`,
  key: 'capture-truncated',
  kind,
  point: null,
})

/** A RED run carrying reds — the shape evaluate()/coveringRun() judge. */
const redRun = (backend, at, reds, overrides = {}) => ({
  backend,
  suite: 'polish',
  startedAt: at - 10,
  at,
  exit: 1,
  asserted: true,
  reds,
  crashed: false,
  ...overrides,
})

describe('pointStatusesFrom / chargeablePoints — which points may carry a charge', () => {
  const work = [
    '- [ ] 506. THE SOFTWARE LANE REDDENS AT CHECKS',
    '- [ ] 546. A SETTLEMENT VISIT STILL GROWS THE RESIDENT RENDER TARGETS',
    '- [ ] 999. SOMETHING DEFERRED — DEFERRED until the mechanic is settled',
    '- [x] 387. THE CHECKS THAT ARE RED ON MAIN ITSELF',
  ].join('\n')

  it('reads open, deferred and ticked points apart', () => {
    const s = pointStatusesFrom(work)
    expect(s.get(506)).toBe('open')
    expect(s.get(546)).toBe('open')
    expect(s.get(999)).toBe('deferred')
    expect(s.get(387)).toBe('done')
  })

  it('charges only OPEN points — a deferred one is nobody working on it either', () => {
    expect(chargeablePoints(work).sort((a, b) => a - b)).toEqual([506, 546])
  })

  it('lets a tick win over any other reading of the same number, in either order', () => {
    expect(pointStatusesFrom('- [x] 42. done\n- [ ] 42. stale open copy').get(42)).toBe('done')
    expect(pointStatusesFrom('- [ ] 42. stale open copy\n- [x] 42. done').get(42)).toBe('done')
  })

  it('is total on garbage', () => {
    expect(pointStatusesFrom(null).size).toBe(0)
    expect(chargeablePoints(undefined)).toEqual([])
  })
})

describe('chargeFor — the ledger charges NARROWLY', () => {
  const ledger = [
    { point: 506, suite: 'polish', backend: 'webgpu', kind: 'check', match: /goat/i, why: 'x' },
    { point: 546, kind: 'console', match: /render-resource-leak/i, why: 'y' },
  ]

  it('charges a matching red to its point', () => {
    const hit = chargeFor(red('settlement walker (goat): the planted foot holds'), {
      suite: 'polish',
      backend: 'webgpu',
      ledger,
    })
    expect(hit.point).toBe(506)
  })

  it('does not charge across the backend the evidence was taken on', () => {
    expect(
      chargeFor(red('settlement walker (goat): the planted foot holds'), { suite: 'polish', backend: 'webgl', ledger }),
    ).toBeNull()
  })

  it('does not charge across suites, or across check/console kinds', () => {
    expect(chargeFor(red('settlement walker (goat)'), { suite: 'flow', backend: 'webgpu', ledger })).toBeNull()
    expect(chargeFor(red('console error: render-resource-leak — renderTargets grew', null, 'check'), { ledger })).toBeNull()
  })

  it('charges a CONSOLE red through a console entry — the positive half of that kind', () => {
    // The mismatch above proves the kind is READ; on its own it would also pass
    // if console reds stopped charging altogether (second-model finding 2c —
    // the shipped ledger no longer holds a console entry to demonstrate it on).
    const line = 'ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22'
    const [console_] = failedChecks(line)
    expect(console_.kind).toBe('console')
    expect(chargeFor(console_, { ledger }).point).toBe(546)
  })

  it('refuses a kind-scoped charge on a red that carries NO kind — no evidence of the kind, no match', () => {
    // `charge.kind && red.kind && …` let a kindless (older/misclassified) red
    // slip through a console charge and then be owned() away (round 5, F1).
    const kindless = { name: 'console error: render-resource-leak — renderTargets grew', key: 'k', point: null }
    expect(chargeFor(kindless, { ledger })).toBeNull()
  })

  it('never charges a truncation entry, in EITHER record shape', () => {
    // What was never captured can be owned by nothing — not even by a ledger
    // entry broad enough to match the marker's own wording. The legacy shape
    // carries kind 'check' under the stable key, so the kind alone cannot say it.
    const catchAll = [{ point: 546, match: /further result line/i, why: 'a hostile catch-all' }]
    expect(chargeFor(truncationMarker(115, TRUNCATED_KIND), { ledger: catchAll })).toBeNull()
    expect(chargeFor(truncationMarker(115, 'check'), { ledger: catchAll })).toBeNull()
    // The KIND alone must say it too, for a record that carried no stable key —
    // and the case must be one the ledger WOULD otherwise own (review finding,
    // 28.08.2026, round 18). The old fixture was named "lines were dropped",
    // which the catch-all pattern does not match, so it stayed uncharged whether
    // the kind was read or ignored and proved nothing about the kind at all.
    const namedLikeTheMarker = { name: '115 further result line(s) exceeded the capture cap', key: 'x', point: null }
    expect(chargeFor({ ...namedLikeTheMarker, kind: 'check' }, { ledger: catchAll })?.point).toBe(546)
    expect(chargeFor({ ...namedLikeTheMarker, kind: TRUNCATED_KIND }, { ledger: catchAll })).toBeNull()
  })

  it('survives a broken ledger entry rather than throwing', () => {
    const broken = [{ point: 1, match: null }, { point: 2, match: /x/ }, null]
    expect(() => chargeFor(red('x'), { ledger: broken })).not.toThrow()
    expect(chargeFor(red('x'), { ledger: broken }).point).toBe(2)
  })

  // A MALFORMED ENTRY CHARGES NOTHING — NOT EVERYTHING (review finding,
  // 28.08.2026). A `test` function alone was enough to reach the stateless
  // clone, where a missing `source` became `new RegExp(undefined, '')`: the
  // EMPTY pattern, which matches every name there is. One typo in a
  // hand-passed ledger therefore owned the whole run.
  it('charges nothing through a pattern that only LOOKS like a regex', () => {
    const shaped = { global: true, test: () => true }
    expect(chargeFor(red('a check nobody filed'), { ledger: [{ point: 3, match: shaped, why: 'malformed' }] })).toBeNull()
    // The same for the narrow half: a broken `detailMatch` must not turn the
    // narrowest entry the ledger has into a catch-all either.
    const narrow = [{ point: 4, match: /goat/i, detailMatch: shaped, why: 'malformed detail' }]
    expect(chargeFor({ ...red('the goat stance'), detail: 'anything at all' }, { ledger: narrow })).toBeNull()
  })

  // THE ENTRY'S OWN `test` DECIDES NOTHING (review finding, 28.08.2026, round
  // 13). An object carrying two plausible strings AND a `test` reached the
  // matcher itself, so the ledger entry — not the pattern it names — answered
  // whether a red was charged. A forged matcher could charge every red, and an
  // alternating one could charge a red at record time and refuse the same red
  // when the record was re-read.
  it('never lets a forged matcher answer for its own pattern', () => {
    // Says true to everything, while its strings name a pattern that matches
    // nothing here. The compiled pattern wins, so nothing is charged.
    const forged = { source: 'nothing-like-this-check', flags: '', test: () => true }
    expect(chargeFor(red('the goat stance'), { ledger: [{ point: 3, match: forged, why: 'forged' }] })).toBeNull()
    // And the mirror: a matcher that says false while its strings DO match is
    // ignored just as completely, so the charge stands.
    const sullen = { source: 'goat', flags: 'i', test: () => false }
    expect(chargeFor(red('the goat stance'), { ledger: [{ point: 3, match: sullen, why: 'sullen' }] })?.point).toBe(3)
    // An ALTERNATING matcher is the stateful case reached by another road: the
    // same red must answer the same way however often it is asked.
    let flip = false
    const alternating = { source: 'goat', flags: '', test: () => (flip = !flip) }
    const entry = [{ point: 3, match: alternating, why: 'alternating' }]
    const asked = [1, 2, 3, 4].map(() => chargeFor(red('the goat stance'), { ledger: entry })?.point ?? null)
    expect(asked).toEqual([3, 3, 3, 3])
  })

  // A REAL REGEX NEVER HAS AN EMPTY SOURCE (`new RegExp('').source` is
  // `'(?:)'`), so an entry that carries one is malformed — and the empty
  // pattern matches EVERY name, which is the catch-all this contract forbids.
  it('refuses an EMPTY pattern source rather than charging everything', () => {
    expect(chargeFor(red('a check nobody filed'), { ledger: [{ point: 3, match: { source: '', flags: '' } }] })).toBeNull()
    // The genuine empty regex still behaves as the regex it is.
    expect(chargeFor(red('a check nobody filed'), { ledger: [{ point: 3, match: new RegExp('') }] })?.point).toBe(3)
  })
})

describe('runVerdict — clean, accounted for, or red', () => {
  const openPoints = [506, 546]

  it('calls an exit-0 run CLEAN and never accounted for', () => {
    const v = runVerdict(run('webgpu', 2000), { openPoints })
    expect(v.status).toBe('clean')
    expect(v.covers).toBe(true)
    expect(v.charges).toEqual([])
  })

  it('accounts for a run whose TWO reds both name open points, and names them', () => {
    const v = runVerdict(
      redRun('webgpu', 2000, [red('goat stance', 506), red('console error: leak', 546, 'console')]),
      { openPoints },
    )
    expect(v.status).toBe('accounted')
    expect(v.covers).toBe(true)
    expect(v.charges.map((c) => c.point)).toEqual([506, 546])
  })

  it('does NOT account for the same run when one red names nothing', () => {
    const v = runVerdict(redRun('webgpu', 2000, [red('goat stance', 506), red('a NEW check nobody filed')]), {
      openPoints,
    })
    expect(v.status).toBe('red')
    expect(v.covers).toBe(false)
    expect(v.unaccounted).toEqual([{ name: 'a NEW check nobody filed', point: null }])
  })

  it('does NOT account for a red naming a point that is ticked done', () => {
    const v = runVerdict(redRun('webgpu', 2000, [red('a stale exception', 387)]), { openPoints })
    expect(v.status).toBe('red')
    expect(v.unaccounted).toEqual([{ name: 'a stale exception', point: 387 }])
  })

  it('does NOT account for a failure the run never reported', () => {
    expect(runVerdict(redRun('webgpu', 2000, []), { openPoints }).status).toBe('red')
  })

  it('does NOT account for a run that crashed, however well charged its reds are', () => {
    const v = runVerdict(redRun('webgpu', 2000, [red('goat stance', 506)], { crashed: true }), { openPoints })
    expect(v.status).toBe('red')
    expect(v.unaccounted[0].name).toMatch(/crash/)
  })

  it('charges nothing when no work order was handed in — the strict default', () => {
    expect(runVerdict(redRun('webgpu', 2000, [red('goat stance', 506)])).status).toBe('red')
  })

  it('is total on garbage', () => {
    expect(runVerdict(null).covers).toBe(false)
    expect(runVerdict({ exit: 1, reds: 'nonsense' }, { openPoints }).covers).toBe(false)
    expect(() => runVerdict({ exit: 1, reds: [null, 7] }, { openPoints })).not.toThrow()
  })
})

describe('runVerdict — the run that passed only on the RETRY (point 640)', () => {
  const openPoints = [506, 546]
  /** The record the retry writes: it exited 0, and it carries what the FIRST
   *  attempt failed on. */
  const suspectRun = (backend, at, names = ['the goat stance — worst travel 0.967'], overrides = {}) => ({
    ...run(backend, at),
    suite: 'polish',
    suspect: true,
    suspectOf: names,
    ...overrides,
  })

  it('calls it SUSPECT even though it exited 0, and never lets it cover', () => {
    const v = runVerdict(suspectRun('webgpu', 2000), { openPoints })
    expect(v.status).toBe('suspect')
    expect(v.covers).toBe(false)
    expect(coveringRun([suspectRun('webgpu', 2000)], 'webgpu', 1000, { openPoints })).toBeNull()
  })

  it('names the check the first attempt failed on, so the red is not lost with the log line', () => {
    const v = runVerdict(suspectRun('webgpu', 2000, ['the goat stance', 'the eaves column']), { openPoints })
    expect(v.unaccounted).toHaveLength(1)
    expect(v.unaccounted[0].name).toMatch(/"the goat stance"; "the eaves column"/)
    expect(v.unaccounted[0].name).toMatch(/RETRY/)
  })

  it('says so even when the first attempt named no check (a crash, a timeout kill)', () => {
    expect(runVerdict(suspectRun('webgpu', 2000, []), { openPoints }).status).toBe('suspect')
  })

  it('BLOCKS a render change whose only evidence is a retry pass, and names the three ways out', () => {
    const result = evaluate(
      renderChange({ runs: [suspectRun('webgpu', 2000), suspectRun('webgl', 2000)], openPoints }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/passed only on the RETRY/)
    expect(result.reason).toMatch(/THREE WAYS/)
    expect(result.reason).toMatch(/CAUSE is named and fixed/)
    expect(result.reason).toMatch(/CHARGED/)
    expect(result.reason).toMatch(/becomes an OPEN point/)
    expect(result.reason).toMatch(/throttle-probe\.mjs/)
  })

  it('judges a retry that failed AGAIN on its reds, not on being a retry — a charged red still accounts', () => {
    const again = { ...redRun('webgpu', 2000, [red('goat stance', 506)]), suspect: true, suspectOf: ['goat stance'] }
    const v = runVerdict(again, { openPoints })
    expect(v.status).toBe('accounted')
    expect(v.covers).toBe(true)
  })

  it('leaves an ordinary run alone — only the recorded flag makes a run suspect', () => {
    expect(runVerdict({ ...run('webgpu', 2000), suspectOf: [] }, { openPoints }).status).toBe('clean')
    expect(runVerdict({ ...run('webgpu', 2000), suspect: false }, { openPoints }).status).toBe('clean')
  })

  it('is total on a malformed suspect record, and on a null options bag', () => {
    expect(() => runVerdict({ exit: 0, suspect: true, suspectOf: 'nonsense' }, { openPoints })).not.toThrow()
    expect(runVerdict({ exit: 0, suspect: true, suspectOf: null }, { openPoints }).covers).toBe(false)
    expect(() => runVerdict(run('webgpu', 1), null)).not.toThrow()
    expect(() => coveringRun([], 'webgpu', 0, null)).not.toThrow()
    expect(() => unexplainedRuns([], 0, null)).not.toThrow()
    expect(() => chargeFor(red('x'), null)).not.toThrow()
  })
})

describe('evaluate — a red is not closed by the runs that FOLLOWED it (point 640)', () => {
  const openPoints = [506, 546]
  const suspectRun = (backend, at) => ({ ...run(backend, at), suite: 'polish', suspect: true, suspectOf: ['the goat stance'] })
  const unfiled = (backend, at) => redRun(backend, at, [red('a NEW check nobody filed')])

  it('BLOCKS although a later clean run of both backends exists — the whole fourth route', () => {
    const result = evaluate(
      renderChange({
        runs: [unfiled('webgpu', 1500), run('webgpu', 2000), run('webgl', 2100)],
        openPoints,
      }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNEXPLAINED RED/)
    expect(result.reason).toMatch(/A LATER GREEN DOES NOT CLOSE IT/)
    expect(result.reason).toMatch(/a NEW check nobody filed/)
  })

  it('blocks the same way when the failure was a retry pass followed by a clean run', () => {
    const result = evaluate(
      renderChange({ runs: [suspectRun('webgpu', 1500), run('webgpu', 2000), run('webgl', 2100)], openPoints }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/passed only on the RETRY/)
  })

  it('blocks a clean run that a SUSPECT run followed — the order does not matter', () => {
    const result = evaluate(
      renderChange({ runs: [run('webgpu', 1500), run('webgl', 1600), suspectRun('webgpu', 2000)], openPoints }),
    )
    expect(result.decision).toBe('block')
  })

  it('names the three ways out and the throttle probe, and offers the loud deferral', () => {
    const { reason } = evaluate(
      renderChange({ runs: [unfiled('webgpu', 1500), run('webgpu', 2000), run('webgl', 2100)], openPoints }),
    )
    expect(reason).toMatch(/CAUSE is named and FIXED/)
    expect(reason).toMatch(/CHARGED in scripts\/render-verify-charges\.mjs/)
    expect(reason).toMatch(/becomes an OPEN point/)
    expect(reason).toMatch(/throttle-probe\.mjs polish --section=<name> --runs 8/)
    expect(reason).toMatch(/--defer/)
  })

  it('lets the FIX through — but only once the suite that reddened is shown green on the new code', () => {
    // The red is in `polish`; the two clean runs below are `polish` too, after
    // an edit that came after the red. That is a fix demonstrated, not asserted.
    const green = (backend, at) => ({ ...run(backend, at), suite: 'polish' })
    const result = evaluate(
      renderChange({
        latestChangeAt: 3000,
        runs: [unfiled('webgpu', 1500), green('webgpu', 3500), green('webgl', 3600)],
        openPoints,
      }),
    )
    expect(result).toEqual({ decision: 'allow', clear: true })
  })

  it('does NOT let an unrelated edit plus a green of ANOTHER suite drop the red', () => {
    // The old rule dropped every red older than the newest render edit, so an
    // edit that had nothing to do with it plus any covering run closed it —
    // silently, and without a cause.
    const result = evaluate(
      renderChange({
        latestChangeAt: 3000,
        runs: [unfiled('webgpu', 1500), run('webgpu', 3500), run('webgl', 3600)],
        openPoints,
      }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNEXPLAINED RED/)
  })

  it('does NOT let a green of the same suite on the SAME code drop it — that is repetition', () => {
    const green = (backend, at) => ({ ...run(backend, at), suite: 'polish' })
    const result = evaluate(
      renderChange({ runs: [unfiled('webgpu', 1500), green('webgpu', 2000), green('webgl', 2100)], openPoints }),
    )
    expect(result.decision).toBe('block')
  })

  it('lets a CHARGED red through — it is explained, and the run still accounts', () => {
    const charged = redRun('webgpu', 1500, [red('goat stance', 506)])
    const result = evaluate(renderChange({ runs: [charged, run('webgpu', 2000), run('webgl', 2100)], openPoints }))
    expect(result.decision).toBe('allow')
  })

  it('lets the loud DEFERRAL through — and NAMES the reds it waved, so the bypass has a price', () => {
    const result = evaluate(
      renderChange({
        runs: [unfiled('webgpu', 1500), suspectRun('webgl', 1600)],
        deferral: { head: 'def5678', reason: 'the red was the check helper, fixed off the render set', at: 1700 },
        openPoints,
      }),
    )
    expect(result).toMatchObject({ decision: 'allow', clear: true, deferred: true })
    expect(result.waved.map((w) => [w.backend, w.status])).toEqual([
      ['webgpu', 'red'],
      ['webgl', 'suspect'],
    ])
  })

  it('names EVERY red it waved, not one per run', () => {
    const twoReds = redRun('webgpu', 1500, [red('the first nobody filed'), red('the second nobody filed')])
    const result = evaluate(
      renderChange({
        runs: [twoReds],
        deferral: { head: 'def5678', reason: 'the dev server had died', at: 1700 },
        openPoints,
      }),
    )
    expect(result.waved.map((w) => w.name)).toEqual(['the first nobody filed', 'the second nobody filed'])
  })

  it('names both reds of a SUSPECT run, which runVerdict summarises into one sentence', () => {
    const twoNames = {
      ...run('webgpu', 1500),
      suite: 'polish',
      suspect: true,
      suspectOf: [{ name: 'the goat stance', kind: 'check' }, { name: 'the eaves column', kind: 'check' }],
    }
    const result = evaluate(
      renderChange({ runs: [twoNames], deferral: { head: 'def5678', reason: 'the lane was software', at: 1700 }, openPoints }),
    )
    expect(result.wavedCount).toBe(2)
    expect(result.waved.map((w) => w.name)).toEqual(['the goat stance', 'the eaves column'])
  })

  // ONE RED IS ITS KIND AND ITS NAME (review finding, 28.08.2026, round 17,
  // corrected in the whole-range pass 3). Keyed by the name alone, two reds of
  // the same text collapse into one waved entry and one count — two
  // observations reported as one, which is the understatement this list exists
  // to prevent. The RECORDER cannot make that pair: a console pseudo-check
  // always carries the `console error: ` prefix, so its name differs from any
  // check's. The kind in the key is therefore defence for a record that reaches
  // the gate from somewhere else — a hand-written state file, a foreign
  // checkout — and this case drives the two shapes the parser really mints from
  // one line, which the count must keep apart on their own.
  it('counts two reds of the same wording and different kind as two', () => {
    // The RECORDER cannot mint this pair — a console pseudo-check always carries
    // the `console error: ` prefix, so its name differs from any check's (review
    // finding, 28.08.2026, whole-range pass 3, which read the fixture as
    // unreachable and was right). The kind in the key is defence for a record
    // that reaches the gate from somewhere else: a hand-written state file, a
    // foreign checkout, a shape a later recorder change makes possible. Keyed by
    // the name alone these two collapse into one waved entry and one count —
    // two observations reported as one, which is the understatement this list
    // exists to prevent.
    const twoKinds = redRun('webgpu', 1500, [
      red('the eaves column', null, 'check'),
      red('the eaves column', null, 'console'),
    ])
    const result = evaluate(
      renderChange({
        runs: [twoKinds],
        deferral: { head: 'def5678', reason: 'the lane was software', at: 1700 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(2)
    expect(result.waved.map((w) => w.name)).toEqual(['the eaves column', 'the eaves column'])
  })

  // A SENTENCE ABOUT ONE RECORD IS COUNTED PER RECORD (review finding,
  // 28.08.2026, round 18). Two crashed records of the same suite print the
  // identical crash sentence and each owes its own disposition, so a key without
  // the record's identity reported two bypassed records as one. A RED stays
  // keyed WITHOUT it, because a real retry leaves two records of one failure.
  it('counts the crash sentence of each crashed record, and one red across a retry pair', () => {
    const crashedTwice = [
      { backend: 'webgpu', suite: 'startup', at: 1500, exit: 1, crashed: true, reds: [] },
      { backend: 'webgpu', suite: 'startup', at: 1600, exit: 1, crashed: true, reds: [] },
    ]
    const twice = evaluate(
      renderChange({
        runs: crashedTwice,
        deferral: { head: 'def5678', reason: 'the lane died twice', at: 1700 },
        openPoints,
      }),
    )
    expect(twice.wavedCount).toBe(2)
    // And the retry pair, unchanged: one failure, one waved red.
    const first = redRun('webgpu', 1500, [red('the eaves column')])
    const retry = {
      ...run('webgpu', 1600),
      suite: first.suite,
      suspect: true,
      suspectOf: [{ name: 'the eaves column', kind: 'check' }],
    }
    const pair = evaluate(
      renderChange({
        runs: [first, retry],
        deferral: { head: 'def5678', reason: 'the lane was software', at: 1700 },
        openPoints,
      }),
    )
    expect(pair.wavedCount).toBe(1)
  })

  it('keeps the TRUE count when the named list hits its cap', () => {
    const many = redRun('webgpu', 1500, Array.from({ length: 25 }, (_, i) => red(`nobody filed number ${i}`)))
    const result = evaluate(
      renderChange({ runs: [many], deferral: { head: 'def5678', reason: 'the dev server had died', at: 1700 }, openPoints }),
    )
    expect(result.wavedCount).toBe(25)
    expect(result.waved).toHaveLength(20)
  })

  it('quotes the red that is STILL open, not the one a charge has taken over', () => {
    const ledger = [{ point: 506, match: /the goat stance/, why: 'the software lane cannot draw fast enough' }]
    const mixed = redRun('webgpu', 1500, [red('the goat stance'), red('a NEW check nobody filed')])
    const green = (backend, at) => ({ ...run(backend, at), suite: 'polish' })
    const result = evaluate(renderChange({ runs: [mixed, green('webgpu', 2000), green('webgl', 2100)], openPoints, ledger }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/1 unaccounted red\(s\) — "a NEW check nobody filed"/)
    expect(result.reason).not.toMatch(/the goat stance/)
  })

  it('counts ONE failure once, though a real retry leaves two records of it', () => {
    // What run-all really writes: the first attempt's red record, then the
    // retry's suspect record carrying the same check name.
    const firstAttempt = redRun('webgpu', 1500, [red('the goat stance')])
    const retry = {
      ...run('webgpu', 1600),
      suite: 'polish',
      suspect: true,
      suspectOf: [{ name: 'the goat stance', kind: 'check' }],
    }
    const result = evaluate(
      renderChange({
        runs: [firstAttempt, retry],
        deferral: { head: 'def5678', reason: 'the lane was software', at: 1700 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(1)
    expect(result.waved).toHaveLength(1)
  })

  it('a deferral with nothing to wave says nothing — the list is evidence, not decoration', () => {
    const result = evaluate(
      renderChange({ runs: [], deferral: { head: 'def5678', reason: 'headless WebGPU washes the frame out', at: 1600 } }),
    )
    expect(result).toEqual({ decision: 'allow', clear: true, deferred: true })
  })

  it('ignores PARTIAL runs in both directions, so the throttle probe blocks nobody', () => {
    const probeRun = (at) => ({ ...redRun('webgpu', at, [red('the goat stance')]), partial: true, section: 'goat-stance' })
    const result = evaluate(
      renderChange({
        runs: [probeRun(1500), probeRun(1600), probeRun(1700), run('webgpu', 2000), run('webgl', 2100)],
        openPoints,
      }),
    )
    expect(result.decision).toBe('allow')
  })

  // The closing routes must work on a run that is ALREADY recorded: the charge is
  // stamped at record time, so a rule reading only the record would leave "charge
  // it" and "file it as a point" nominal — nothing but a code edit could ever
  // satisfy them (four-eyes finding, 11.08.2026).
  it('a red CHARGED after the fact stops blocking — no re-run, no code edit', () => {
    const ledger = [{ point: 641, match: /the Giza settlement edge/, why: 'filed 11.08.2026 as its own point' }]
    const runs = [
      redRun('webgpu', 1500, [red('the Giza settlement edge is drawn')]),
      run('webgpu', 2000),
      run('webgl', 2100),
    ]
    expect(evaluate(renderChange({ runs, openPoints })).decision).toBe('block')
    expect(evaluate(renderChange({ runs, openPoints: [...openPoints, 641], ledger })).decision).toBe('allow')
  })

  it('a SUSPECT run whose first-attempt check is charged stops blocking too', () => {
    const ledger = [{ point: 506, match: /the goat stance/, why: 'the software lane cannot draw fast enough' }]
    const runs = [suspectRun('webgpu', 1500), run('webgpu', 2000), run('webgl', 2100)]
    expect(evaluate(renderChange({ runs, openPoints })).decision).toBe('block')
    expect(evaluate(renderChange({ runs, openPoints, ledger })).decision).toBe('allow')
  })

  // The sixth-round review bullet (26.08.2026) claimed extending RED_CHARGES
  // reclassifies NOTHING already recorded, because `red.point` is stamped at
  // record time. Measured half true, and the half matters: COVERAGE is frozen
  // at record time by design (a later ledger edit cannot bless a finished run),
  // but the BLOCKING question re-reads the ledger as it stands — the 11.08.2026
  // four-eyes rule above — so a new entry DOES reach a run already on disk.
  // Pinned on the exact shape of the stored 13.08.2026 webgpu/settings records:
  // console reds carrying `point: null`, the feature level recorded.
  it('a run ALREADY on disk changes its disposition when the ledger gains its entry — but never becomes coverage', () => {
    // A RECORDER-SHAPED RECORD, NOT A HAND-WRITTEN ONE (review finding,
    // 28.08.2026). The fixture used to build the red through the local `red()`
    // helper, which normalises nothing, so the end-to-end case could have been
    // running against a name no recorder writes. The line below is copied
    // verbatim out of local/verify-baseline-logs/settings-baseline-*.log and
    // taken through the recorder's own parse and charge instead.
    const line =
      'ERR: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid TextureView] is invalid due to a previous error.'
    const reds = chargeReds(failedChecks(line), { suite: 'settings', backend: 'webgpu', ledger: [] })
    expect(reds).toHaveLength(1)
    expect(reds[0].kind).toBe('console')
    expect(reds[0].point).toBeNull()
    // What the recorder really stores: the error TEXT normalised to at most 120
    // characters behind the `console error: ` prefix, and the key derived from
    // that name rather than from the printed line. MEASURED against the 45
    // distinct console errors in the recorded settings logs: this variant of
    // the storm is 132 characters and survives whole, while the
    // `Invalid Texture "output-msaa"` variant of the SAME cascade is cut at 135
    // before the word "error" — which is why the ledger names that one by its
    // own alternative rather than by the shared sentence.
    expect(reds[0].name.length).toBe(132)
    expect(reds[0].name).toMatch(/is invalid due to a previous error\.$/)
    expect(reds[0].key).toBe(checkKey(reds[0].name))
    const stored = redRun('webgpu', 1500, reds, { suite: 'settings', featureLevel: 'compatibility' })
    expect(unexplainedRuns([stored], 1000, { openPoints, ledger: [] })).toHaveLength(1)
    const ledger = [{
      point: 506,
      suite: 'settings',
      backend: 'webgpu',
      featureLevel: 'compatibility',
      kind: 'console',
      match: /is invalid due to a previous error/i,
      why: 'measured 26.08.2026 on the stored 13.08. records',
    }]
    expect(unexplainedRuns([stored], 1000, { openPoints, ledger })).toEqual([])
    // The record's own charge stamp is what coverage reads: however the ledger
    // grows, the stored run stays non-covering — the backend needs a fresh run.
    expect(coveringRun([stored], 'webgpu', 1000, { openPoints })).toBeNull()
  })

  // THE SAME QUESTION FOR THE NARROWEST ENTRY, END TO END (review finding,
  // 28.08.2026). The case above proves retroactivity for `match`; a unit check
  // of `chargeFor` proves nothing about the path a record actually travels, so
  // the whole route is walked here — the recorder's own parse and charge, then
  // unexplainedRuns, then evaluate — with an entry that can only fire on the
  // measurement the record keeps.
  it('reaches a stored red through the WHOLE gate with a detailMatch entry, not just chargeFor', () => {
    const line =
      'FAIL  no child walks without getting anywhere — worst child 1 at 0.29 % of its own judged ' +
      'time — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m  [--section=children-motion]'
    // Recorded when NO ledger owned it, exactly as a run written before the entry.
    const reds = chargeReds(failedChecks(line), { suite: 'polish', backend: 'webgpu', ledger: [] })
    expect(reds.map((r) => r.point)).toEqual([null])
    const stored = redRun('webgpu', 1500, reds, { suite: 'polish' })

    // Without the entry the run blocks, and the gate blocks with it.
    expect(unexplainedRuns([stored], 1000, { openPoints, ledger: [] })).toHaveLength(1)
    expect(evaluate(renderChange({ runs: [stored, run('webgpu', 2000), run('webgl', 2100)], openPoints, ledger: [] })).decision).toBe('block')

    // The entry written TODAY reaches the record written yesterday.
    const ledger = [{
      point: 506,
      suite: 'polish',
      backend: 'webgpu',
      kind: 'check',
      match: /no child walks without getting anywhere/i,
      detailMatch: /1\.42 m walked inside 0\.31 m/i,
      why: 'the signature this red really printed',
    }]
    expect(unexplainedRuns([stored], 1000, { openPoints, ledger })).toEqual([])
    expect(evaluate(renderChange({ runs: [stored, run('webgpu', 2000), run('webgl', 2100)], openPoints, ledger })).decision).toBe('allow')

    // An entry whose signature the record does NOT carry still owns nothing —
    // the detail is read, not waved through because it exists.
    const wrong = [{ ...ledger[0], detailMatch: /9\.99 m walked inside 0\.01 m/i }]
    expect(unexplainedRuns([stored], 1000, { openPoints, ledger: wrong })).toHaveLength(1)

    // And it still does not COVER: the stamp the record carries is null.
    expect(coveringRun([stored], 'webgpu', 1000, { openPoints })).toBeNull()
  })

  // THE SAME ROUTE FOR A MEASUREMENT THAT DID NOT HOLD STILL (review finding,
  // 28.08.2026). The recorder test carries this case; the CORE test file did
  // not, and a review pass that reads the core alone would have kept every
  // carried case green against an implementation that ignores `detailVaried`.
  // The capture holds ONE line per identity, so a check that failed twice with
  // two different measurements reaches the record as one red carrying the
  // FIRST. A narrow charge that happened to match that reading must refuse it,
  // or the second, unowned observation vanishes behind the charge.
  it('refuses a NARROW charge on a record whose measurement VARIED, and blocks the gate with it', () => {
    const check = 'FAIL  no child walks without getting anywhere — worst child 1 at '
    // A SECOND, STABLE red in the same record — printed once, never varying.
    const sibling = 'FAIL  the goat stance holds — worst goat 2 at 3.00 m'
    const siblingLedger = [{
      point: 546,
      suite: 'polish',
      backend: 'webgpu',
      kind: 'check',
      match: /the goat stance holds/i,
      detailMatch: /worst goat 2 at 3\.00 m/i,
      why: 'the reading that did hold still',
    }]
    const first = `${check}22.2s, 1.42 m walked inside 0.31 m\n${sibling}`
    // What the tap saw: the same identity printing a second, different line —
    // and ONLY that identity.
    const varied = new Set(failedChecks(`${check}9.1s, 0.02 m walked inside 0.44 m`).map((c) => `${c.kind}:${c.key}`))
    const reds = chargeReds(markVariedDetails(failedChecks(first), varied), {
      suite: 'polish',
      backend: 'webgpu',
      ledger: [],
    })
    expect(reds).toHaveLength(2)
    // PER RED, NOT PER RUN (review finding, 28.08.2026, round 13). With a single
    // red in the fixture, a run-wide "some measurement moved" flag would pass
    // this case just as well. The sibling printed ONCE, so its own narrow charge
    // must still apply while the varied one's is refused.
    const [movedRed, stableRed] = reds
    expect(movedRed.detailVaried).toBe(true)
    expect(stableRed.detailVaried).toBeUndefined()
    expect(chargeFor(stableRed, { suite: 'polish', backend: 'webgpu', ledger: siblingLedger })?.point).toBe(546)
    const stored = redRun('webgpu', 1500, reds, { suite: 'polish' })
    const runs = [stored, run('webgpu', 2000), run('webgl', 2100)]
    const narrow = [{
      point: 506,
      suite: 'polish',
      backend: 'webgpu',
      kind: 'check',
      match: /no child walks without getting anywhere/i,
      detailMatch: /1\.42 m walked inside 0\.31 m/i,
      why: 'the one reading that survived the capture',
    }]
    // The narrow entry matches the kept reading exactly, and still owns nothing.
    expect(chargeFor(movedRed, { suite: 'polish', backend: 'webgpu', ledger: narrow })).toBeNull()
    const withSibling = [...narrow, ...siblingLedger]
    const still = unexplainedRuns([stored], 1000, { openPoints, ledger: withSibling })
    expect(still).toHaveLength(1)
    // ONLY the varied red is left unaccounted — the stable sibling is charged.
    expect(still[0].reds).toEqual(['no child walks without getting anywhere'])
    expect(evaluate(renderChange({ runs, openPoints, ledger: withSibling })).decision).toBe('block')

    // The CONTROL: the very same entry owns the very same red once the record
    // no longer says the measurement moved — so it is the mark that refuses it.
    const held = redRun('webgpu', 1500, chargeReds(failedChecks(first), { suite: 'polish', backend: 'webgpu', ledger: [] }), { suite: 'polish' })
    expect(evaluate(renderChange({ runs: [held, run('webgpu', 2000), run('webgl', 2100)], openPoints, ledger: [...narrow, ...siblingLedger] })).decision).toBe('allow')

    // And a BROAD entry is unaffected: it never claimed to read a measurement.
    const broad = [{ ...narrow[0], detailMatch: undefined }]
    expect(evaluate(renderChange({ runs, openPoints, ledger: [...broad, ...siblingLedger] })).decision).toBe('allow')
  })

  it('does NOT talk a CRASH away with a charge — a run that died judged no picture', () => {
    const ledger = [{ point: 506, match: /goat/, why: 'the software lane cannot draw fast enough' }]
    const crashed = redRun('webgpu', 1500, [red('goat stance', 506)], { crashed: true })
    const result = evaluate(renderChange({ runs: [crashed, run('webgpu', 2000), run('webgl', 2100)], openPoints, ledger }))
    expect(result.decision).toBe('block')
    // Since the sixth round the crash blocks under its OWN name — reporting it
    // as an unexplained red sent the reader hunting a defect the run never
    // reported. The charge still lifts nothing; only the message class moved.
    expect(result.reason).toMatch(/CRASHED RUN — NOT AN UNEXPLAINED RED/)
    expect(result.reason).not.toMatch(/UNEXPLAINED RED SINCE THE LAST RENDER EDIT/)
  })

  it('a charge to a point that is NOT open explains nothing', () => {
    const ledger = [{ point: 387, match: /the Giza settlement edge/, why: 'a point that has since been ticked' }]
    const runs = [redRun('webgpu', 1500, [red('the Giza settlement edge is drawn')]), run('webgpu', 2000), run('webgl', 2100)]
    expect(evaluate(renderChange({ runs, openPoints, ledger })).decision).toBe('block')
  })

  // Four-eyes, 11.08.2026: a run is judged by when it STARTED. A suite loads the
  // page at its beginning, so one that began before the edit tested the old code
  // however late it finished — it can neither prove the fix nor condemn it.
  it('does not let a run that BEGAN before the edit cover the code that followed', () => {
    const straddling = { ...run('webgpu', 2000), startedAt: 500 }
    expect(coveringRun([straddling], 'webgpu', 1000, { openPoints })).toBeNull()
  })

  it('carries a red from a run that STRADDLED the edit until that suite is shown green', () => {
    const straddling = { ...unfiled('webgpu', 2000), startedAt: 500 }
    expect(unexplainedRuns([straddling], 1000, { openPoints })).toHaveLength(1)
    const shownGone = { ...run('webgpu', 3000), suite: 'polish' }
    expect(unexplainedRuns([straddling, shownGone], 1000, { openPoints })).toEqual([])
  })

  it('unexplainedRuns is total, and reports oldest first', () => {
    expect(unexplainedRuns(null, 0)).toEqual([])
    expect(() => unexplainedRuns([null, 7, { at: 'soon' }], 0)).not.toThrow()
    const found = unexplainedRuns([unfiled('webgl', 2000), unfiled('webgpu', 1000)], 0, { openPoints })
    expect(found.map((u) => u.at)).toEqual([1000, 2000])
  })
})

// Point 734. The capture cap could produce a run nobody could ever close: point
// 640's three closings all need the red's identity, and a truncated recording has
// none — so it blocked every later render change until somebody hand-wrote a
// --defer, which is the waiver the charge ledger exists to abolish.
// THE IDENTITY A SIGNATURE BINDS BY, SPECIFIED HERE AND NOT BY ITS PRODUCER
// (review finding, 28.08.2026, round 13). Every closure test builds its `run`
// field with `runIdentity` itself, so the function was its own oracle: an
// identity of the wrong width, or one that stopped reading the reds, would have
// kept all of them green while binding one signature to several records.
describe('runIdentity — the content identity a closure names one record by', () => {
  /** One fixed record, so the digest below is a VALUE and not a restatement. */
  const fixture = {
    backend: 'webgpu',
    suite: 'settings',
    at: 1500,
    exit: 1,
    asserted: true,
    reds: [{ name: 'the goat stance', key: 'the-goat-stance', kind: 'check', point: null }],
  }

  it('is 128 bits of hex, pinned to a value', () => {
    // Pinned deliberately: a silent change of digest or of the canonical text
    // it is taken over invalidates every signature already on disk, and this
    // is the line that says so out loud.
    expect(runIdentity(fixture)).toBe('3910f0dcae369a6c4c3f787dc621fb3c')
    expect(runIdentity(fixture)).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is canonical — key order and a round trip through disk change nothing', () => {
    const reordered = {
      reds: [{ point: null, kind: 'check', key: 'the-goat-stance', name: 'the goat stance' }],
      asserted: true,
      exit: 1,
      at: 1500,
      suite: 'settings',
      backend: 'webgpu',
    }
    expect(runIdentity(reordered)).toBe(runIdentity(fixture))
    expect(runIdentity(JSON.parse(JSON.stringify(fixture)))).toBe(runIdentity(fixture))
  })

  // THE RESIDUAL IS PART OF THE IDENTITY. Two records of the same suite, the
  // same backend and the same stamp that differ only in what they RECORDED are
  // different runs, and one signature must not close both.
  it('separates records that differ ONLY in their reds', () => {
    const charged = { ...fixture, reds: [{ ...fixture.reds[0], point: 506 }] }
    const renamed = { ...fixture, reds: [{ ...fixture.reds[0], name: 'the goat stance held' }] }
    const detailed = { ...fixture, reds: [{ ...fixture.reds[0], detail: 'worst goat 2 at 3.00 m' }] }
    const extra = { ...fixture, reds: [...fixture.reds, { name: 'a second red', key: 'a-second-red', kind: 'check', point: null }] }
    const none = { ...fixture, reds: [] }
    const ids = [charged, renamed, detailed, extra, none].map((r) => runIdentity(r))
    expect(new Set([...ids, runIdentity(fixture)]).size).toBe(6)
  })

  it('separates records that share a stamp but differ anywhere else', () => {
    const otherSuite = { ...fixture, suite: 'polish' }
    const otherBackend = { ...fixture, backend: 'webgl' }
    const startedInstead = { ...fixture, at: undefined, startedAt: 1500 }
    // THE CLOSURE-CRITICAL FIELDS BELONG IN THIS SET (review finding,
    // 28.08.2026, round 18). Suite, backend and stamp are what a SELECTOR reads;
    // what a SIGNATURE disposes of is decided by `crashed`, `truncated` and the
    // count of lines the cap ate. An identity blind to those would let one
    // evidence sentence close a record that lost different output — the very
    // thing binding a closure to content is for.
    const crashedToo = { ...fixture, crashed: true }
    const truncatedToo = { ...fixture, truncated: true, droppedLines: 115 }
    const droppedMore = { ...fixture, truncated: true, droppedLines: 116 }
    // EVERY FIELD A CLOSURE OR A COVERAGE READING TURNS ON (review finding,
    // 28.08.2026, round 23): six selected ones left the claim "the identity is
    // the whole record" untested for the rest.
    const otherExit = { ...fixture, exit: 2 }
    const otherLevel = { ...fixture, featureLevel: 'core' }
    const otherShots = { ...fixture, screenshotCount: 3 }
    const otherSuspect = { ...fixture, suspect: true, suspectOf: [{ name: 'the first attempt', kind: 'check' }] }
    const otherReds = { ...fixture, reds: [{ name: 'a check nobody owns', key: 'k', kind: 'check', point: null }] }
    const otherPartial = { ...fixture, partial: true, section: 'boot' }
    const ids = [
      otherSuite,
      otherBackend,
      startedInstead,
      crashedToo,
      truncatedToo,
      droppedMore,
      otherExit,
      otherLevel,
      otherShots,
      otherSuspect,
      otherReds,
      otherPartial,
    ].map((r) => runIdentity(r))
    expect(new Set([...ids, runIdentity(fixture)]).size).toBe(13)
  })

  // THE TWO DERIVATIONS ARE HELD TOGETHER BY A CASE (review finding, 28.08.2026,
  // round 20). `redKeyOf` needs the parser's key for a red that carries none,
  // and this module may not import it: the guard harness copies the top-level
  // scripts alone, so a reach into scripts/verify/ makes every guard
  // unspawnable. So the derivation is duplicated, and asked of both here.
  it('derives a red key exactly as the parser does', () => {
    for (const name of [
      'the goat stance',
      'FAIL  worst child 1 at 22.2s, 1.42 m walked inside 0.31 m',
      '  Mixed   CASE   and   spacing  ',
      'console error: renderTargets grew back at place:maasai-village: 19 -> 22',
      '',
    ]) {
      expect(derivedRedKey(name), name).toBe(checkKey(name))
    }
  })

  it('answers null for a non-record and never throws', () => {
    expect(runIdentity(null)).toBeNull()
    expect(runIdentity('a string')).toBeNull()
    expect(runIdentity(7)).toBeNull()
    const circular = { backend: 'webgpu' }
    circular.self = circular
    expect(() => runIdentity(circular)).not.toThrow()
  })
})

describe('an INCOMPLETE RECORDING is its own class, and has its own way out (point 734)', () => {
  const openPoints = [506, 546]
  // The two shapes on file: what the recorder writes TODAY (the field), and what
  // it wrote before the field existed (the synthetic red under its stable key) —
  // the runs of 13.08.2026 are the second kind and must be recognised.
  /** The synthetic entry the recorder unshifts for the lines the cap ate, in the
   *  kind no charge may name. */
  const truncationNow = truncationMarker(115, TRUNCATED_KIND)
  /** EXACTLY what the recorder writes today: the FIELDS, and behind them the
   *  reds that did fit in the buffer. No synthetic entry — the recorder stopped
   *  writing one when the truncation became a field, and a fixture that keeps
   *  it cannot show whether the logic still leans on the marker (review finding,
   *  28.08.2026, round 15; the doc here claimed the current shape while building
   *  the old one). The two marker shapes keep their own fixtures below. */
  const truncatedNow = (backend, at, observed = [red('a check that DID fit in the buffer')], overrides = {}) =>
    redRun(backend, at, [...observed], {
      truncated: true,
      droppedLines: 115,
      ...overrides,
    })
  /** The intermediate shape: the field AND the synthetic entry in the kind no
   *  charge may name. Kept because `isTruncationEntry` still recognises it. */
  const truncatedWithMarker = (backend, at, observed = [red('a check that DID fit in the buffer')], overrides = {}) =>
    redRun(backend, at, [truncationNow, ...observed], {
      truncated: true,
      droppedLines: 115,
      ...overrides,
    })
  const truncationEntry = truncationMarker(115, 'check')
  /** A record from before the field existed, carrying ONLY the truncation. */
  const truncatedLegacy = (backend, at) => redRun(backend, at, [truncationEntry])
  /** The same, but it also recorded a red it really did observe. */
  const truncatedWithRed = (backend, at, name = 'console error: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError') =>
    redRun(backend, at, [truncationEntry, red(name, null, 'console')])
  // THE REDS AN UNLIFTED TRUNCATION DID RECORD ARE NAMED BESIDE THE LOST ONES
  // (review finding, 28.08.2026, round 17). The record used to report only the
  // cap sentence, so a DEFERRAL — which waves the whole record through — paid
  // for one thing and carried away every red the run really printed.
  it('names the reds an unlifted truncation did record, so a deferral pays for them too', () => {
    const record = truncatedNow('webgpu', 1500, [red('a check nobody owns'), red('the goat stance', 506)])
    const found = unexplainedRuns([record], 1000, { openPoints })
    expect(found).toHaveLength(1)
    expect(found[0].status).toBe('incomplete')
    // The blocking sentence is still the lost recording alone: one thing to
    // dispose of, and nothing in the record can explain it.
    expect(found[0].unaccounted).toHaveLength(1)
    expect(found[0].unaccounted[0].name).toMatch(/capture cap dropped 115 result line/)
    // The COST, though, is the lost recording plus every red nobody owns. The
    // goat stance is charged to an open point, so it was never part of a bypass.
    expect(found[0].reds).toEqual([
      "the capture cap dropped 115 result line(s) — this run's reds were NOT all recorded, so nothing in it can be explained",
      'a check nobody owns',
    ])
    const result = evaluate(
      renderChange({
        runs: [record],
        deferral: { head: 'def5678', reason: 'the host lost its browser mid-suite', at: 1700 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(2)
    expect(result.waved.map((w) => w.name)).toEqual([
      "the capture cap dropped 115 result line(s) — this run's reds were NOT all recorded, so nothing in it can be explained",
      'a check nobody owns',
    ])
  })

  // A LIFTED TRUNCATION CARRIES ITS KEYS TOO (review finding, 28.08.2026, round
  // 18). Without them the deferral fell back to the name alone, so two reds of
  // the same wording and different kind collapsed into one waved entry — in the
  // one branch where the lost part is already forgiven and only the recorded
  // reds are left to pay for. As above, the recorder cannot mint that pair; the
  // keys defend a record that reaches the gate from somewhere else.
  it('counts a check and a console error of the same wording in a LIFTED truncation too', () => {
    const record = truncatedNow('webgpu', 1500, [
      // RECORDER-REACHABLE SHAPES (review finding, 28.08.2026, whole-range pass
      // 3): a console pseudo-check always carries the `console error: ` prefix,
      // so a bare console red of a check's wording is a shape the recorder
      // cannot produce, and asserting over it proved nothing about records.
      red('console errors: the eaves column', null, 'check'),
      red('console errors: the eaves column', null, 'console'),
    ])
    const later = { ...run('webgpu', 2000), suite: record.suite }
    const found = unexplainedRuns([record, later], 1000, { openPoints })
    expect(found.map((u) => u.status)).toEqual(['red'])
    const result = evaluate(
      renderChange({
        runs: [record, later],
        deferral: { head: 'def5678', reason: 'the flood was the dev server', at: 2100 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(2)
  })

  /** A closure AS THE CLI WRITES IT: bound to one record's content identity
   *  (round-5 review, 19.08.2026 — a stamp was not an identity). */
  const closureOf = (run_, evidence = 'the host cannot run a browser suite (point 732)') => ({
    run: runIdentity(run_),
    backend: run_.backend,
    suite: run_.suite,
    at: run_.at ?? null,
    evidence,
  })

  it('recognises every record shape, and reads how much was lost', () => {
    expect(isIncompleteRecording(truncatedNow('webgpu', 1500))).toBe(true)
    // The intermediate shape — field AND synthetic entry — and the legacy one,
    // which carries the entry alone. Both are still on file.
    expect(isIncompleteRecording(truncatedWithMarker('webgpu', 1500))).toBe(true)
    expect(droppedLinesOf(truncatedWithMarker('webgpu', 1500))).toBe(115)
    // It blocks as an incomplete recording, and the marker itself is never a
    // red anybody has to explain — signed off, only the observed red is left.
    const withMarker = truncatedWithMarker('webgpu', 1500)
    expect(unexplainedRuns([withMarker], 1000, { openPoints })[0].status).toBe('incomplete')
    const closed = unexplainedRuns([withMarker], 1000, { openPoints, incompleteClosures: [closureOf(withMarker)] })
    expect(closed[0].reds).toEqual(['a check that DID fit in the buffer'])
    expect(isIncompleteRecording(truncatedLegacy('webgpu', 1500))).toBe(true)
    expect(isIncompleteRecording(redRun('webgpu', 1500, [red('an ordinary red')]))).toBe(false)
    expect(droppedLinesOf(truncatedNow('webgpu', 1500))).toBe(115)
    expect(droppedLinesOf(truncatedLegacy('webgpu', 1500))).toBe(115)
    expect(droppedLinesOf(run('webgpu', 1500))).toBe(0)
  })

  // THE MARKER IS A SHAPE, NOT A KEY (review finding, 28.08.2026). `checkKey`
  // lowercases and collapses a printed label, so the stable key
  // `capture-truncated` is an identity a real check can parse to — and a red
  // wearing it was dropped from the residual and closed by an incomplete
  // signature, i.e. laundered by the next sign-off. Only the marker's own name
  // form counts with that key.
  it('refuses an OBSERVED red that merely parses to the marker\'s key', () => {
    const impostor = { name: 'capture truncated', key: 'capture-truncated', kind: 'check', point: null }
    const observed = redRun('webgpu', 1500, [impostor])
    expect(isIncompleteRecording(observed)).toBe(false)
    expect(runVerdict(observed, { openPoints }).status).toBe('red')
    // It blocks as the red it is, and no incomplete signature reaches it.
    const found = unexplainedRuns([observed], 1000, {
      openPoints,
      incompleteClosures: [closureOf(observed)],
    })
    expect(found.map((u) => u.status)).toEqual(['red'])
    expect(found[0].reds).toEqual(['capture truncated'])
    // The real marker — the recorder's own name form — is unaffected.
    expect(isIncompleteRecording(truncatedLegacy('webgpu', 1500))).toBe(true)
  })

  it('classifies a capped run as INCOMPLETE, never as an unexplained red', () => {
    for (const r of [truncatedNow('webgpu', 1500), truncatedLegacy('webgpu', 1500)]) {
      const verdict = runVerdict(r, { openPoints })
      expect(verdict.status).toBe('incomplete')
      expect(verdict.covers).toBe(false)
      expect(verdict.unaccounted[0].name).toMatch(/were NOT all recorded/)
    }
  })

  // The loud half of the cap: an exit 0 whose result lines were thrown away is a
  // pass nobody read, so it must not cover a backend either.
  it('refuses a TRUNCATED run as coverage even when it exited 0', () => {
    const green = { ...run('webgpu', 1500), truncated: true, droppedLines: 7 }
    expect(runVerdict(green, { openPoints }).status).toBe('incomplete')
    expect(coveringRun([green], 'webgpu', 1000, { openPoints })).toBeNull()
  })

  // A --section probe stays the harmless instrument point 566 made it, whatever
  // its output volume: partial is judged first and blocks nobody.
  it('leaves a PARTIAL run partial, even when it truncated', () => {
    const probe = { ...truncatedNow('webgpu', 1500), partial: true, section: 'goat-stance' }
    expect(runVerdict(probe, { openPoints }).status).toBe('partial')
  })

  it('says WHICH IT IS: an incomplete recording is named apart from an unexplained red', () => {
    const result = evaluate(
      renderChange({ runs: [truncatedLegacy('webgpu', 1500), run('webgpu', 2000), run('webgl', 2100)], openPoints }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/INCOMPLETE RECORDING — NOT AN UNEXPLAINED RED/)
    expect(result.reason).toMatch(/--incomplete/)
    // It must NOT send the reader hunting a defect that was never captured.
    expect(result.reason).not.toMatch(/UNEXPLAINED RED SINCE THE LAST RENDER EDIT/)
  })

  // Round-5 finding 3: with backend coverage still MISSING, the message read
  // only each backend's LATEST run — an older unclosed incomplete recording hid
  // behind a later genuine red, and the reader was sent hunting the red alone,
  // never told a recording was broken too.
  it('names an unclosed incomplete recording even while coverage is missing and a later red stands in front', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    const laterRed = redRun('webgpu', 1600, [red('a NEW check nobody filed')])
    const result = evaluate(renderChange({ runs: [broken, laterRed], openPoints }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/RENDER CHANGE NOT VERIFIED/)
    expect(result.reason).toMatch(/UNACCOUNTED red\(s\)/)
    expect(result.reason).toMatch(/INCOMPLETE RECORDING — NOT AN UNEXPLAINED RED/)
  })

  it('still names an ordinary unexplained red as one, beside an incomplete recording', () => {
    const unfiled = redRun('webgpu', 1600, [red('a NEW check nobody filed')])
    const result = evaluate(
      renderChange({ runs: [truncatedLegacy('webgpu', 1500), unfiled, run('webgpu', 2000), run('webgl', 2100)], openPoints }),
    )
    expect(result.reason).toMatch(/UNEXPLAINED RED SINCE THE LAST RENDER EDIT/)
    expect(result.reason).toMatch(/INCOMPLETE RECORDING/)
  })

  it('a genuinely unexplained red is NOT closable this way — the closure is per run', () => {
    const unfiled = redRun('webgpu', 1600, [red('a NEW check nobody filed')])
    const runs = [unfiled, run('webgpu', 2000), run('webgl', 2100)]
    const result = evaluate(
      renderChange({ runs, openPoints, incompleteClosures: [closureOf(unfiled)] }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNEXPLAINED RED/)
  })

  it('a SIGNED-OFF incomplete recording stops blocking a later render edit — with no --defer', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    const runs = [broken, run('webgpu', 2000), run('webgl', 2100)]
    expect(evaluate(renderChange({ runs, openPoints })).decision).toBe('block')
    const result = evaluate(
      renderChange({ runs, openPoints, incompleteClosures: [closureOf(broken)], deferral: null }),
    )
    expect(result.decision).toBe('allow')
  })

  // THE LINE BETWEEN THIS AND A WAIVER (review finding, 19.08.2026). The
  // signature closes what nobody could record; it must not touch what the run
  // DID record, or a suite could be flooded on purpose to bury a real red.
  it('signs off only the LOST part — a red the run really recorded keeps blocking', () => {
    const broken = truncatedWithRed('webgpu', 1500)
    const runs = [broken, run('webgpu', 2000), run('webgl', 2100)]
    const closures = [closureOf(broken)]
    const result = evaluate(renderChange({ runs, openPoints, incompleteClosures: closures }))
    expect(result.decision).toBe('block')
    // And it is now reported as the RED it is, not as an incomplete recording.
    const still = unexplainedRuns(runs, 1000, { openPoints, incompleteClosures: closures })
    expect(still).toHaveLength(1)
    expect(still[0].status).toBe('red')
    expect(still[0].reds[0]).toMatch(/GPUValidationError/)
  })

  it('...and stops blocking once that observed red is CHARGED to an open point', () => {
    const broken = truncatedWithRed('webgpu', 1500)
    const ledger = [{ point: 506, kind: 'console', match: /GPUValidationError/, why: 'the compat lane cannot multisample' }]
    const runs = [broken, run('webgpu', 2000), run('webgl', 2100)]
    const closures = [closureOf(broken)]
    expect(evaluate(renderChange({ runs, openPoints, incompleteClosures: closures })).decision).toBe('block')
    expect(evaluate(renderChange({ runs, openPoints, incompleteClosures: closures, ledger })).decision).toBe('allow')
  })

  it('a closure carrying no EVIDENCE closes nothing — that is the whole difference', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    const blank = [{ ...closureOf(broken), evidence: '   ' }]
    const none = [{ ...closureOf(broken), evidence: undefined }]
    expect(unexplainedRuns([broken], 1000, { openPoints, incompleteClosures: blank })).toHaveLength(1)
    expect(unexplainedRuns([broken], 1000, { openPoints, incompleteClosures: none })).toHaveLength(1)
  })

  // One signature must bind ONE record. The stamp route let a closure written
  // for `{at: 100}` also close a DIFFERENT run named only by `startedAt: 100`
  // (runStamp falls back), and two parallel runs sharing a millisecond were not
  // separable at all (round 5, findings 2/5). Content identity separates every
  // pair that differs in ANY field — and identifies a record with no stamp too.
  it('binds by CONTENT: a shared millisecond closes no second run, and an undated record is still closable', () => {
    const byAt = truncatedLegacy('webgpu', 100)
    const byStart = { ...truncatedLegacy('webgpu', 100), at: undefined, startedAt: 100 }
    const signed = closureOf(byAt)
    expect(incompleteClosureFor(byAt, [signed])).toEqual(signed)
    // The finding-2 collision: same runStamp reading, different run — unclosed.
    expect(incompleteClosureFor(byStart, [signed])).toBeNull()
    // The finding-5 collision: two parallel runs in the same millisecond.
    const parallel = { ...truncatedLegacy('webgpu', 100), screenshotCount: 3 }
    expect(incompleteClosureFor(parallel, [signed])).toBeNull()
    expect(incompleteClosureFor(parallel, [closureOf(parallel)])).not.toBeNull()
    // A record with NO readable stamp has a content identity all the same — it
    // used to be closable by NOTHING (the stated residual of the last round).
    const undated = { ...truncatedLegacy('webgpu', 1500), at: undefined, startedAt: undefined }
    expect(incompleteClosureFor(undated, [closureOf(undated)])).not.toBeNull()
    // And a closure that names no identity closes nothing, whatever its stamps.
    expect(incompleteClosureFor(byAt, [{ backend: 'webgpu', suite: 'polish', at: 100, evidence: 'signed' }])).toBeNull()
  })

  it('cannot be RE-RECORDED either without a readable timestamp of its own', () => {
    const undated = { ...truncatedLegacy('webgpu', 1500), at: null, startedAt: null }
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    expect(unexplainedRuns([undated, again], 1000, { openPoints })).toHaveLength(1)
  })

  it('signs off ONE run, never a suite/backend pair — the NEXT truncated run blocks again', () => {
    const first = truncatedLegacy('webgpu', 1500)
    const second = truncatedLegacy('webgpu', 2500)
    const closures = [closureOf(first)]
    expect(unexplainedRuns([first], 1000, { openPoints, incompleteClosures: closures })).toEqual([])
    const still = unexplainedRuns([first, second], 1000, { openPoints, incompleteClosures: closures })
    expect(still.map((u) => u.at)).toEqual([2500])
    expect(still[0].status).toBe('incomplete')
  })

  // The advertised first remedy has to WORK, or the signature is the only exit
  // and the mechanism is a waiver after all (review finding, 19.08.2026).
  it('a real RE-RECORDING closes it — a covering run of the same suite and backend, later, on this code', () => {
    const broken = { ...truncatedLegacy('webgpu', 1500), suite: 'polish' }
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    expect(unexplainedRuns([broken], 1000, { openPoints })).toHaveLength(1)
    expect(unexplainedRuns([broken, again], 1000, { openPoints })).toEqual([])
  })

  // ONE RULE FOR COVERING, EVERY CALLER (review finding F2, 28.08.2026).
  // `shownGone` and `reRecorded` used to hand `runVerdict` a `ledger` that it
  // never destructured — a dead argument that read as if a later ledger edit
  // could make a past run cover a backend and thereby retake a lost reading.
  // It cannot: coverage is a claim about pixels somebody looked at. The red in
  // the candidate run stops BLOCKING through `owned()` all the same, so the two
  // readings stay different questions rather than contradicting answers.
  it('a candidate run owned only by TODAY\u2019s ledger does not re-record a truncation', () => {
    const broken = { ...truncatedLegacy('webgpu', 1500), suite: 'polish' }
    // Recorded uncharged (point: null), the way a run written before the entry is.
    const candidate = redRun('webgpu', 2000, [red('the goat stance', null)], { suite: 'polish' })
    const ledger = [{ point: 506, match: /the goat stance/, why: 'written after both runs were recorded' }]

    // The candidate covers on neither reading — its own charge stamp is null.
    expect(runVerdict(candidate, { openPoints }).covers).toBe(false)
    expect(runVerdict(candidate, { openPoints, ledger }).covers).toBe(false)

    // So the truncation is NOT lifted, and it is still reported as incomplete.
    const still = unexplainedRuns([broken, candidate], 1000, { openPoints, ledger })
    expect(still.map((u) => u.status)).toEqual(['incomplete'])
    // And the candidate's own red is not among the blockers: the ledger owns it.
    expect(still).toHaveLength(1)
  })

  // The re-run stops at exactly the same line as the signature: it closes the
  // LOST part, never a red the run really recorded. Letting it skip the
  // accounting laundered every red in a truncated run (review, 19.08.2026).
  it('but a RE-RECORDING launders nothing — a red the truncated run recorded still blocks', () => {
    const broken = { ...truncatedWithRed('webgpu', 1500), suite: 'polish' }
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    const still = unexplainedRuns([broken, again], 1000, { openPoints })
    expect(still).toHaveLength(1)
    expect(still[0].status).toBe('red')
    expect(still[0].reds[0]).toMatch(/GPUValidationError/)
  })

  // THE SHAPE THE RECORDER REALLY WRITES (review, 19.08.2026). Every case that
  // drives a truncated record through a closure or a re-recording built it by
  // hand in the legacy shape, so nothing pinned that a PRODUCTION record — the
  // field, the count, the synthetic entry and the reds that did fit — keeps its
  // observed reds and covers nothing once the truncation is answered.
  it('keeps a PRODUCTION-shaped record\'s observed reds through both routes, and covers nothing', () => {
    const broken = truncatedNow('webgpu', 1500)
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    expect(runVerdict(broken, { openPoints }).status).toBe('incomplete')
    for (const [runs, closures] of [
      [[broken, again], null],
      [[broken], [closureOf(broken)]],
    ]) {
      const still = unexplainedRuns(runs, 1000, { openPoints, incompleteClosures: closures })
      expect(still).toHaveLength(1)
      expect(still[0].status).toBe('red')
      // The synthetic entry is gone — that IS the part the route closed — and
      // the red the run really recorded is what is left standing.
      expect(still[0].reds).toEqual(['a check that DID fit in the buffer'])
    }
    // And neither route turns it into coverage: the backend still needs a run.
    expect(coveringRun([broken], 'webgpu', 1000, { openPoints })).toBeNull()
    const result = evaluate(
      renderChange({
        runs: [broken, run('webgl', 2100)],
        openPoints,
        incompleteClosures: [closureOf(broken)],
      }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/RENDER CHANGE NOT VERIFIED ON WEBGPU/)
  })

  it('...and that observed red closes the ordinary way on a production-shaped record too', () => {
    const broken = truncatedNow('webgpu', 1500, [red('the drummer struck without a message')])
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    const ledger = [{ point: 546, kind: 'check', match: /the drummer struck/, why: 'filed as the point that owns it' }]
    expect(unexplainedRuns([broken, again], 1000, { openPoints })).toHaveLength(1)
    expect(unexplainedRuns([broken, again], 1000, { openPoints, ledger })).toEqual([])
  })

  // A RETRY THAT ALSO TRUNCATED (review, 19.08.2026). It exited 0, so the
  // recorder wrote it NO reds of its own — its real failure is the first
  // attempt's, in `suspectOf`. Judging the residual from `r.reds` therefore
  // dropped that whole first attempt the moment the truncation was lifted, and
  // the run left the list silently: the retry laundered what the flood could not.
  const truncatedRetry = (backend, at, first = 'a NEW check nobody filed', overrides = {}) => ({
    backend,
    suite: 'polish',
    startedAt: at - 10,
    at,
    exit: 0,
    asserted: true,
    truncated: true,
    droppedLines: 115,
    suspect: true,
    suspectOf: [{ name: first, kind: 'check' }],
    ...overrides,
  })

  it('keeps a truncated RETRY suspect once the truncation is lifted — by either route', () => {
    const broken = truncatedRetry('webgpu', 1500)
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    // Route (1), the re-recording, and route (2), the signature: both close the
    // lost measurement and neither may close the first attempt.
    for (const [runs, closures] of [
      [[broken, again], null],
      [[broken], [closureOf(broken)]],
    ]) {
      const still = unexplainedRuns(runs, 1000, { openPoints, incompleteClosures: closures })
      expect(still).toHaveLength(1)
      expect(still[0].status).toBe('suspect')
      expect(still[0].reds).toEqual(['a NEW check nobody filed'])
    }
  })

  it('...and lets that first attempt close the ordinary ways, once it is CHARGED', () => {
    const broken = truncatedRetry('webgpu', 1500, 'the drummer struck without a message')
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    const ledger = [{ point: 506, kind: 'check', match: /the drummer struck/, why: 'the software lane cannot answer a rate question' }]
    expect(unexplainedRuns([broken, again], 1000, { openPoints })).toHaveLength(1)
    expect(unexplainedRuns([broken, again], 1000, { openPoints, ledger })).toEqual([])
  })

  it('but only that pair: another suite, another backend, or an older run proves nothing', () => {
    const broken = { ...truncatedLegacy('webgpu', 1500), suite: 'polish' }
    const otherSuite = { ...run('webgpu', 2000), suite: 'settings' }
    const otherBackend = { ...run('webgl', 2000), suite: 'polish' }
    const earlier = { ...run('webgpu', 1200), suite: 'polish' }
    const alsoTruncated = { ...run('webgpu', 2000), suite: 'polish', truncated: true, droppedLines: 3 }
    for (const other of [otherSuite, otherBackend, earlier, alsoTruncated]) {
      // The broken run is STILL listed. (`alsoTruncated` brings its own entry —
      // a run that truncated cannot re-record anything for anybody.)
      expect(unexplainedRuns([broken, other], 1000, { openPoints }).some((u) => u.at === 1500)).toBe(true)
    }
  })

  // And the fourth closing stays shut where it belongs: a RED is an observation,
  // and no later green un-observes it (point 640).
  it('does NOT extend the re-run route to an ordinary red', () => {
    const unfiled = redRun('webgpu', 1500, [red('a NEW check nobody filed')])
    expect(unexplainedRuns([unfiled, { ...run('webgpu', 2000), suite: 'polish' }], 1000, { openPoints })).toHaveLength(1)
  })

  // The closure discards a RECORD; it never says the picture was fine. A backend
  // with nothing but a signed-off run behind it is still uncovered.
  it('never turns a signed-off run into coverage', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    const closures = [closureOf(broken)]
    expect(coveringRun([broken], 'webgpu', 1000, { openPoints })).toBeNull()
    const result = evaluate(renderChange({ runs: [broken, run('webgl', 2100)], openPoints, incompleteClosures: closures }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/RENDER CHANGE NOT VERIFIED ON WEBGPU/)
  })

  // A CRASH OUTRANKS THE TRUNCATION. A run that died judged no picture, and a
  // crashed run that also flooded its output must not be liftable by one
  // INCOMPLETE signature (review, 19.08.2026). The crash has its own signed
  // route since the sixth round — a different list, a different judgment — and
  // this pin is what keeps the two from ever serving each other.
  it('never lifts a run that CRASHED by an incomplete-recording signature, whatever its recording lost', () => {
    const crashedToo = { ...truncatedLegacy('webgpu', 1500), crashed: true }
    expect(runVerdict(crashedToo, { openPoints }).status).toBe('red')
    expect(runVerdict(crashedToo, { openPoints }).unaccounted[0].name).toMatch(/crash/)
    const closures = [closureOf(crashedToo)]
    const again = { ...run('webgpu', 2000), suite: 'polish' }
    for (const runs of [[crashedToo], [crashedToo, again]]) {
      expect(unexplainedRuns(runs, 1000, { openPoints, incompleteClosures: closures })).toHaveLength(1)
    }
  })

  // The remedy printed on a missing backend has to name what is REALLY blocking:
  // advising a second signature for a red resolves nothing (review, 19.08.2026).
  it('names the surviving RED, not the signed-off truncation, on a missing backend', () => {
    const broken = truncatedWithRed('webgpu', 1500)
    const result = evaluate(
      renderChange({
        runs: [broken, run('webgl', 2100)],
        openPoints,
        incompleteClosures: [closureOf(broken)],
      }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNACCOUNTED red\(s\) — "console error: THREE\.WebGPURenderer/)
    expect(result.reason).not.toMatch(/sign the recording off/)
  })

  // The same reading: these are CALLER inputs, not shapes a JSON file holds.
  it('is total on malformed closures and records, whatever a caller hands it', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    expect(() => unexplainedRuns([broken], 1000, { openPoints, incompleteClosures: [null, 7, {}] })).not.toThrow()
    expect(unexplainedRuns([broken], 1000, { openPoints, incompleteClosures: [null, 7, {}] })).toHaveLength(1)
    expect(isIncompleteRecording(null)).toBe(false)
    expect(incompleteClosureFor(null, null)).toBeNull()
    expect(droppedLinesOf({ droppedLines: 'many' })).toBe(0)
    // `Number(Symbol())` THROWS, and these records come off disk (review
    // finding, 19.08.2026) — total means total.
    expect(() => droppedLinesOf({ droppedLines: Symbol('x') })).not.toThrow()
    expect(() => incompleteClosureFor({ backend: 'webgpu', suite: 'polish', at: Symbol('x') }, [{ backend: 'webgpu', suite: 'polish', at: 1, evidence: 'e' }])).not.toThrow()
  })

  // The gate's own totality, judged where it costs most: an exception inside the
  // decision reaches the wrapper, which fails OPEN and allows the very turn the
  // gate meant to stop. `Number()` throws on a symbol and `[...x]` on a truthy
  // non-iterable, and both sit on the decision path (review, 19.08.2026).
  // NOT ONLY WHAT JSON CAN HOLD (review finding, 28.08.2026, round 29, which
  // read the title as claiming that). A symbol never comes off disk; it comes
  // from a CALLER — the recorder hands these functions live values, a test or a
  // future guard may hand them anything, and `Number(symbol)` throws where a
  // `null` merely reads as absent. The point is the totality of the decision
  // path, so the hostile value is the one that would take the gate down.
  it('never throws on a record or a point set, whatever a caller hands it', () => {
    const nasty = { backend: 'webgpu', suite: 'polish', at: Symbol('t'), startedAt: Symbol('s'), exit: Symbol('e'), reds: [red('x')] }
    expect(() => runVerdict(nasty, { openPoints })).not.toThrow()
    expect(() => unexplainedRuns([nasty], 1000, { openPoints })).not.toThrow()
    for (const bad of [{}, 7, 'nope', true]) {
      expect(() => runVerdict(redRun('webgpu', 1500, [red('x', 506)]), { openPoints: bad })).not.toThrow()
      expect(() => unexplainedRuns([redRun('webgpu', 1500, [red('x')])], 1000, { openPoints: bad })).not.toThrow()
    }
    // An unreadable exit code is a FAILED run, never a clean pass — and `null`,
    // `''` and `false` are unreadable, though Number() calls each of them 0.
    for (const exit of [Symbol('e'), null, '', false, 'nope', undefined]) {
      expect(runVerdict({ backend: 'webgpu', suite: 'polish', at: 1500, exit }, { openPoints }).status).toBe('red')
    }
  })

  // A finite but out-of-range timestamp makes `toISOString()` throw — and that
  // call sits inside the BLOCK MESSAGE, where a throw costs the gate its verdict
  // and the wrapper allows the very turn it meant to stop.
  it('builds its block message on an out-of-range timestamp rather than throwing', () => {
    const broken = { ...truncatedLegacy('webgpu', 1e18), startedAt: 1e18 }
    const runs = [broken, run('webgpu', 2000), run('webgl', 2100)]
    let result
    expect(() => {
      result = evaluate(renderChange({ runs, openPoints }))
    }).not.toThrow()
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/INCOMPLETE RECORDING/)
  })
})

// Point 734, sixth round. A crash was the one verdict with NO way out inside
// the window: runVerdict returns `charges: []` for it at any time, so extending
// the ledger reclassifies nothing, and the three closings of point 640 cannot
// reach a run that reported no red — the only exit left was the hand --defer.
// The signed crash closure is the named way out: "we read the kept log; the run
// died; there is no report here to judge" — a disposition, never a pass.
describe('a CRASHED run is its own class, and has its own signed way out (point 734, sixth round)', () => {
  const openPoints = [506, 546]
  /** EXACTLY the shape on disk for the 19.08.2026 webgpu/startup crashes:
   *  exit 1, `crashed: true`, an empty red list. */
  const crashedRun = (backend, at, overrides = {}) =>
    redRun(backend, at, [], { crashed: true, suite: 'startup', ...overrides })
  /** A closure as the --crashed CLI writes it: content identity plus evidence. */
  const crashClosure = (run_, evidence = 'local/verify-logs shows the browser died by SIGKILL; no report exists') => ({
    run: runIdentity(run_),
    backend: run_.backend,
    suite: run_.suite,
    at: run_.at ?? null,
    evidence,
    closedAt: 9999,
  })

  it('reports the crash as its OWN status, apart from red and incomplete', () => {
    const found = unexplainedRuns([crashedRun('webgpu', 1500)], 1000, { openPoints })
    expect(found).toHaveLength(1)
    expect(found[0].status).toBe('crashed')
    expect(found[0].reds).toEqual(['the run ended in a crash, not in its own report'])
  })

  // THE DISPOSITION REACHES A RUN ALREADY ON DISK: nothing about the record
  // changes — the closure is written beside it, and the same record stops
  // blocking. That is the retroactivity the sixth-round bullet demands.
  it('a signed crash closure lifts the recorded run, retroactively and without a --defer', () => {
    const r = crashedRun('webgpu', 1500)
    expect(unexplainedRuns([r], 1000, { openPoints })).toHaveLength(1)
    expect(unexplainedRuns([r], 1000, { openPoints, crashClosures: [crashClosure(r)] })).toEqual([])
  })

  // A CLOSURE IS RETAINED BY THE RUN IT NAMES, NOT BY WHEN IT WAS SIGNED
  // (review finding, 28.08.2026, round 13). Every closure in these fixtures was
  // stamped 9999 against a window opening at 1000, so "signed long before the
  // window" was never actually tried — and the decision must not read
  // `closedAt` at all: the run it names is either still in the window or gone
  // with it, and the moment of signing says nothing either way.
  it('lifts its run however old the signature is, and even with no signing stamp at all', () => {
    const r = crashedRun('webgpu', 1500)
    const ancient = { ...crashClosure(r), closedAt: 1 }
    const unstamped = { ...crashClosure(r) }
    delete unstamped.closedAt
    expect(unexplainedRuns([r], 1000, { openPoints, crashClosures: [ancient] })).toEqual([])
    expect(unexplainedRuns([r], 1000, { openPoints, crashClosures: [unstamped] })).toEqual([])
    // And the mirror: a signature stamped in the future lifts no OTHER run.
    const another = crashedRun('webgpu', 1600)
    expect(unexplainedRuns([another], 1000, { openPoints, crashClosures: [{ ...crashClosure(r), closedAt: 1e15 }] })).toHaveLength(1)
  })

  // WHAT THE BLOCK MESSAGE SAYS ABOUT A RUN NOBODY DATED (review finding,
  // 28.08.2026, round 13). The undated fixtures were all signed off in the same
  // breath, so no assertion ever read the sentence written about one while it
  // still blocks — and `number(null)` is 0, so it claimed 1970.
  it('names an undated blocking run as undated, never as the epoch', () => {
    const undated = { backend: 'webgpu', suite: 'startup', exit: 1, crashed: true, reds: [] }
    const found = unexplainedRuns([undated], 1000, { openPoints })
    expect(found).toHaveLength(1)
    expect(found[0].at).toBeNull()
    const result = evaluate(renderChange({ runs: [undated, run('webgl', 2100)], openPoints }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/webgpu\/startup @undated/)
    expect(result.reason).not.toMatch(/1970-01-01/)
  })

  it('binds by content identity — a closure for another run, or without evidence, lifts nothing', () => {
    const r = crashedRun('webgpu', 1500)
    const other = crashedRun('webgpu', 1600)
    expect(unexplainedRuns([r], 1000, { openPoints, crashClosures: [crashClosure(other)] })).toHaveLength(1)
    expect(unexplainedRuns([r], 1000, { openPoints, crashClosures: [{ ...crashClosure(r), evidence: '  ' }] })).toHaveLength(1)
    expect(crashClosureFor(r, [crashClosure(r)])).toEqual(crashClosure(r))
    expect(crashClosureFor(r, [{ ...crashClosure(r), run: '' }])).toBeNull()
  })

  it('never lets a charge or a later green lift a crash — only the signature does', () => {
    // A recorded red the ledger could own, and a later covering run of the SAME
    // suite/backend inside the window: neither lifts a crash. The recorded
    // rounds pinned both directions — a run that died judged no picture, and
    // "it worked the next time" explains nothing about why it died.
    const withRed = crashedRun('webgpu', 1500, { reds: [red('goat stance', 506)] })
    const later = { ...run('webgpu', 2000), suite: 'startup' }
    expect(unexplainedRuns([withRed, later], 1000, { openPoints }).map((u) => u.status)).toEqual(['crashed'])
  })

  // A SUSPECT RECORD MAY STILL CARRY REDS OF ITS OWN (review finding,
  // 28.08.2026, round 17). "A run that exited 0 recorded nothing" holds for an
  // ordinary retry and fails for the record that reached CRASH_LINE while its
  // process still ended 0: that record keeps every red it printed before dying,
  // and substituting the first attempt's marker for them threw them away.
  it('keeps the own reds of a crashed retry record beside the first attempt', () => {
    const crashedRetry = {
      ...crashedRun('webgpu', 1500, { reds: [red('what it printed before dying')] }),
      exit: 0,
      suspect: true,
      suspectOf: [{ name: 'what the first attempt failed on', kind: 'check' }],
    }
    // Unsigned it is a crash, and the cost it carries names both observations.
    const found = unexplainedRuns([crashedRetry], 1000, { openPoints })
    expect(found.map((u) => u.status)).toEqual(['crashed'])
    expect(found[0].reds).toEqual([
      'the run ended in a crash, not in its own report',
      'what the first attempt failed on',
      'what it printed before dying',
    ])
    // Signed, the crash sentence goes and both observations stay.
    const residual = unexplainedRuns([crashedRetry], 1000, {
      openPoints,
      crashClosures: [crashClosure(crashedRetry)],
    })
    expect(residual[0].reds).toEqual([
      'what the first attempt failed on',
      'what it printed before dying',
    ])
  })

  // AND THE TWO LISTS ARE JOINED BY IDENTITY, NOT BY NAME (review finding,
  // 28.08.2026, round 18). Two reds of the same text and different kind are two
  // observations, and a name-only set discarded the record's own. The recorder
  // cannot mint this pair — a console pseudo-check always carries its prefix —
  // so this is the same defence for a record that reaches the gate from
  // somewhere else (whole-range pass 3).
  it('keeps a console red the first attempt reported as a check of the same wording', () => {
    const crashedRetry = {
      ...crashedRun('webgpu', 1500, { reds: [red('the eaves column', null, 'console')] }),
      exit: 0,
      suspect: true,
      suspectOf: [{ name: 'the eaves column', kind: 'check' }],
    }
    expect(unexplainedRuns([crashedRetry], 1000, { openPoints })[0].reds).toEqual([
      'the run ended in a crash, not in its own report',
      'the eaves column',
      'the eaves column',
    ])
  })

  // The cross-family locks: each signature closes only what it names.
  it('an INCOMPLETE closure does not lift a crash, and a CRASH closure does not lift a mere truncation', () => {
    const truncation = truncationMarker(9, 'check')
    const crashedAndTruncated = crashedRun('webgpu', 1500, { reds: [truncation] })
    // The incomplete signature bounces off the crash (round-5 order: a crash
    // outranks the truncation, and no one signature may serve both families)…
    expect(
      unexplainedRuns([crashedAndTruncated], 1000, {
        openPoints,
        incompleteClosures: [crashClosure(crashedAndTruncated)],
      }),
    ).toHaveLength(1)
    // …and the CRASH signature closes the crash, leaving the LOST RECORDING
    // exactly where it was (review finding, 28.08.2026). This record used to
    // vanish on the crash signature alone, which meant the run that both died
    // and lost lines was cleared by a signature that spoke about neither. Each
    // family signs its own sentence, so this record now needs both.
    const afterCrash = unexplainedRuns([crashedAndTruncated], 1000, {
      openPoints,
      crashClosures: [crashClosure(crashedAndTruncated)],
    })
    expect(afterCrash.map((u) => u.status)).toEqual(['incomplete'])
    // With BOTH signatures it is closed — and only then.
    expect(
      unexplainedRuns([crashedAndTruncated], 1000, {
        openPoints,
        crashClosures: [crashClosure(crashedAndTruncated)],
        incompleteClosures: [crashClosure(crashedAndTruncated)],
      }),
    ).toEqual([])
    // And a truncated run that did NOT crash is untouched by a crash closure.
    const merelyTruncated = redRun('webgpu', 1600, [truncation])
    expect(
      unexplainedRuns([merelyTruncated], 1000, { openPoints, crashClosures: [crashClosure(merelyTruncated)] }).map((u) => u.status),
    ).toEqual(['incomplete'])
  })

  // The signature closes the CRASH, and stops at the same line the incomplete
  // closure stops at (review finding, 28.08.2026): the crash branch used to
  // `continue` over the whole record once signed, so a check the suite really
  // printed FAIL for vanished with it — neither fixed, charged, nor filed.
  it('signs off the crash and NOT a red the run printed before it died', () => {
    const withRed = crashedRun('webgpu', 1500, { reds: [red('a check nobody owns', null)] })
    const closures = [crashClosure(withRed)]
    // Unsigned, the CRASH is what blocks — the red is not hunted for.
    expect(unexplainedRuns([withRed], 1000, { openPoints }).map((u) => u.status)).toEqual(['crashed'])
    // Signed, the crash sentence is gone and the observed red stands in its place.
    const residual = unexplainedRuns([withRed], 1000, { openPoints, crashClosures: closures })
    expect(residual.map((u) => u.status)).toEqual(['red'])
    expect(residual[0].reds).toEqual(['a check nobody owns'])
    // Charged to an open point, that red is accounted for and the record clears.
    const owned_ = crashedRun('webgpu', 1500, { reds: [red('goat stance', 506)] })
    expect(unexplainedRuns([owned_], 1000, { openPoints, crashClosures: [crashClosure(owned_)] })).toEqual([])
    // And a crashed run that printed nothing behaves exactly as it always has.
    const bare = crashedRun('webgpu', 1500)
    expect(unexplainedRuns([bare], 1000, { openPoints, crashClosures: [crashClosure(bare)] })).toEqual([])
  })

  // THE UNSIGNED CRASH CARRIES ITS PRINTED REDS INTO THE DEFERRAL RECORD
  // (review finding, 28.08.2026). The crash sentence is what BLOCKS and what
  // the reader is told to dispose of — that stays. But the entry's `reds` is
  // what a deferral enumerates as its waved-through cost, and reporting only
  // the crash sentence there understated that cost by every check the suite had
  // really printed FAIL for: those observations left with the deferral and
  // nothing ever named them.
  it('an UNSIGNED crash still names the reds it printed, so a deferral cannot wave them through in silence', () => {
    const withRed = crashedRun('webgpu', 1500, {
      reds: [red('a check nobody owns'), red('a second nobody owns')],
    })
    // The blocking sentence is unchanged: one crash, no defect to hunt.
    const found = unexplainedRuns([withRed], 1000, { openPoints })
    expect(found.map((u) => u.status)).toEqual(['crashed'])
    expect(found[0].unaccounted.map((u) => u.name)).toEqual([
      'the run ended in a crash, not in its own report',
    ])
    // And the record names what it really saw, crash sentence first.
    expect(found[0].reds).toEqual([
      'the run ended in a crash, not in its own report',
      'a check nobody owns',
      'a second nobody owns',
    ])
    // Which is what the deferral has to pay for: three, not one.
    const result = evaluate(
      renderChange({
        runs: [withRed],
        deferral: { head: 'def5678', reason: 'the lane died mid-suite', at: 1700 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(3)
    expect(result.waved.map((w) => w.name)).toEqual([
      'the run ended in a crash, not in its own report',
      'a check nobody owns',
      'a second nobody owns',
    ])
  })

  // The synthetic truncation marker is NOT quoted as a red anybody can act on —
  // it stands for the lines nobody recorded. But the LOST RECORDING is still
  // named, in the words the incomplete class uses (review finding, 28.08.2026,
  // round 17): a deferral that named the crash and the reds the run got out, and
  // said nothing about the lines nobody read, still understated what it waved.
  it('names the lost recording beside the crash, and never the marker itself', () => {
    const both = crashedRun('webgpu', 1500, { reds: [truncationMarker(9, 'check'), red('a check nobody owns')] })
    const found = unexplainedRuns([both], 1000, { openPoints })
    expect(found[0].reds).toEqual([
      'the run ended in a crash, not in its own report',
      "the capture cap dropped 9 result line(s) — this run's reds were NOT all recorded, so nothing in it can be explained",
      'a check nobody owns',
    ])
    // The blocking sentence is still the crash alone: one thing to dispose of.
    expect(found[0].unaccounted.map((u) => u.name)).toEqual([
      'the run ended in a crash, not in its own report',
    ])
  })

  // A NAMELESS RED IS STILL A RED (review finding, 28.08.2026, round 22).
  // Dropping the entries whose name is empty took them out of the COUNT as well,
  // so a deferral over a crashed run understated what it waved by exactly the
  // reds nobody could name — and the ordinary path has called such a red
  // "(unnamed red)" all along.
  it('counts a nameless red a crashed run printed, under the name the rest of the gate gives it', () => {
    const nameless = crashedRun('webgpu', 1500, { reds: [{ name: '', key: '', kind: 'check', point: null }] })
    const found = unexplainedRuns([nameless], 1000, { openPoints })
    expect(found[0].reds).toEqual(['the run ended in a crash, not in its own report', '(unnamed red)'])
    const result = evaluate(
      renderChange({
        runs: [nameless],
        deferral: { head: 'def5678', reason: 'the lane died mid-suite', at: 1700 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(2)
  })

  // AND EVERY BRANCH KEEPS ITS NAMELESS REDS (review finding, 28.08.2026, round
  // 23). The crash branch was repaired in round 22; the ordinary one still
  // dropped them outright, so a run carrying a named and an unnamed red reported
  // one waved cost instead of two.
  it('counts a nameless red beside a named one in an ORDINARY run', () => {
    const mixed = redRun('webgpu', 1500, [
      red('a check nobody owns'),
      { name: '', key: '', kind: 'check', point: null },
      { name: '', key: 'another', kind: 'console', point: null },
    ])
    const found = unexplainedRuns([mixed], 1000, { openPoints })
    expect(found[0].reds).toEqual(['a check nobody owns', '(unnamed red)', '(unnamed red)'])
    const result = evaluate(
      renderChange({
        runs: [mixed],
        deferral: { head: 'def5678', reason: 'the lane was software', at: 1700 },
        openPoints,
      }),
    )
    expect(result.wavedCount).toBe(3)
  })

  // A crash that did NOT truncate says nothing about a lost recording.
  it('says nothing about a lost recording where none was lost', () => {
    const only = crashedRun('webgpu', 1500, { reds: [red('a check nobody owns')] })
    expect(unexplainedRuns([only], 1000, { openPoints })[0].reds).toEqual([
      'the run ended in a crash, not in its own report',
      'a check nobody owns',
    ])
  })

  // THE SAME LINE, HELD AGAINST AN `exit: 0` RECORD (review finding,
  // 28.08.2026). A stack can reach CRASH_LINE — or uncaughtExceptionMonitor can
  // fire — while the process still ends 0. Signing that crash used to erase the
  // whole record: `afterCrashClosure` clears `crashed`, `runVerdict` then took
  // the clean-exit branch BEFORE it read the reds, answered `clean`, and
  // unexplainedRuns dropped the run with every red it had printed.
  it('does not let a signed crash on an exit-0 record erase the reds it printed', () => {
    const r = crashedRun('webgpu', 1500, { exit: 0, reds: [red('a check nobody owns', null)] })
    // Unsigned, the crash is what blocks — unchanged.
    expect(unexplainedRuns([r], 1000, { openPoints }).map((u) => u.status)).toEqual(['crashed'])
    // Signed, the observed red stands in its place instead of vanishing.
    const residual = unexplainedRuns([r], 1000, { openPoints, crashClosures: [crashClosure(r)] })
    expect(residual.map((u) => u.status)).toEqual(['red'])
    expect(residual[0].reds).toEqual(['a check nobody owns'])
    // …and it still holds the gate, named as itself.
    const gate = evaluate(
      renderChange({
        runs: [r, { ...run('webgpu', 2000), suite: 'startup' }, run('webgl', 2100)],
        openPoints,
        crashClosures: [crashClosure(r)],
      }),
    )
    expect(gate.decision).toBe('block')
    expect(gate.reason).toMatch(/a check nobody owns/)
    // The three ordinary closings still work on it, and an exit-0 crash with
    // nothing in it is still closed by its signature alone.
    const owned_ = crashedRun('webgpu', 1500, { exit: 0, reds: [red('goat stance', 506)] })
    expect(unexplainedRuns([owned_], 1000, { openPoints, crashClosures: [crashClosure(owned_)] })).toEqual([])
    const bare = crashedRun('webgpu', 1500, { exit: 0 })
    expect(unexplainedRuns([bare], 1000, { openPoints, crashClosures: [crashClosure(bare)] })).toEqual([])
    // AND THE CLEAN-EXIT BRANCH KEEPS ITS OWN JOB: a record that never crashed
    // is still read by its exit code, not dragged into the list by its reds.
    expect(unexplainedRuns([{ ...r, crashed: false }], 1000, { openPoints })).toEqual([])
  })

  it('a signed-off crash still covers NOTHING — the backend needs a real run', () => {
    const r = crashedRun('webgpu', 1500)
    const closures = [crashClosure(r)]
    expect(runVerdict(r, { openPoints }).covers).toBe(false)
    expect(coveringRun([r], 'webgpu', 1000, { openPoints })).toBeNull()
    const result = evaluate(renderChange({ runs: [r, run('webgl', 2100)], openPoints, crashClosures: closures }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/RENDER CHANGE NOT VERIFIED ON WEBGPU/)
    // …and the signed-off record is not quoted as an unaccounted red there.
    expect(result.reason).not.toMatch(/ended in a crash/)
  })

  it('names an unsigned crash as its own class in BOTH block branches', () => {
    const r = crashedRun('webgpu', 1500)
    // Beside full coverage…
    const covered = evaluate(
      renderChange({ runs: [r, { ...run('webgpu', 2000), suite: 'startup' }, run('webgl', 2100)], openPoints }),
    )
    expect(covered.decision).toBe('block')
    expect(covered.reason).toMatch(/CRASHED RUN — NOT AN UNEXPLAINED RED/)
    // …and behind a missing backend, where it must not hide (round-5 finding 3).
    const missing = evaluate(renderChange({ runs: [r, run('webgl', 2100)], openPoints }))
    expect(missing.decision).toBe('block')
    expect(missing.reason).toMatch(/CRASHED RUN — NOT AN UNEXPLAINED RED/)
    expect(missing.reason).not.toMatch(/UNACCOUNTED red\(s\) — "the run ended in a crash/)
  })

  // AND A SIGNED CRASH'S RESIDUAL RED IS NAMED THERE TOO (review finding,
  // 28.08.2026, round 19). The crash branch of the block message returned
  // unconditionally, so once the crash was signed and a red the run printed
  // before it died still stood, the one thing really blocking that backend went
  // unnamed: the crash paragraph no longer applied, the crash sentence must not
  // be quoted, and nothing was left to say.
  it('names the red a SIGNED crash still leaves behind the missing backend', () => {
    const r = crashedRun('webgpu', 1500, { reds: [red('a check nobody owns')] })
    const result = evaluate(
      renderChange({ runs: [r, run('webgl', 2100)], openPoints, crashClosures: [crashClosure(r)] }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNACCOUNTED red\(s\) — "a check nobody owns"/)
    // Never the crash sentence, and never the "already signed off, so it
    // neither blocks nor proves anything" line — it does block.
    expect(result.reason).not.toMatch(/"the run ended in a crash/)
    expect(result.reason).not.toMatch(/neither blocks nor proves anything/)
  })

  it('is total on malformed closures', () => {
    const r = crashedRun('webgpu', 1500)
    expect(() => unexplainedRuns([r], 1000, { openPoints, crashClosures: [null, 7, {}] })).not.toThrow()
    expect(crashClosureFor(null, [crashClosure(r)])).toBeNull()
    expect(() => crashClosureFor(r, 'nope')).not.toThrow()
  })
})

describe('the retry marker travels in the environment (point 640)', () => {
  it('formats the first attempt\'s failing checks, and reads them back', () => {
    const value = formatSuspectEnv([{ name: 'the goat stance' }, 'the eaves column'])
    expect(parseSuspectEnv(value)).toEqual(['the goat stance', 'the eaves column'])
  })

  it('carries each red\'s KIND, so a console charge answers a console red and not a check', () => {
    const value = formatSuspectEnv([
      { name: 'console error: renderTargets grew back', kind: 'console' },
      { name: 'the goat stance', kind: 'check' },
    ])
    expect(parseSuspectReds(value)).toEqual([
      { name: 'console error: renderTargets grew back', kind: 'console' },
      { name: 'the goat stance', kind: 'check' },
    ])
  })

  it('reads a record written before the kind travelled — bare names are checks', () => {
    expect(suspectRedsOf({ suspectOf: ['the goat stance'] })).toEqual([{ name: 'the goat stance', kind: 'check' }])
    expect(suspectRedsOf({ suspectOf: [{ name: 'a leak', kind: 'console' }] })).toEqual([
      { name: 'a leak', kind: 'console' },
    ])
    expect(suspectRedsOf(null)).toEqual([])
  })

  it('does not release a CONSOLE red on a charge written for a check of the same wording', () => {
    const openPoints = [506]
    const suspectConsole = {
      ...run('webgpu', 1500),
      suite: 'polish',
      suspect: true,
      suspectOf: [{ name: 'console error: the label layer threw', kind: 'console' }],
    }
    const runs = [suspectConsole, run('webgpu', 2000), run('webgl', 2100)]
    const checkOnly = [{ point: 506, kind: 'check', match: /the label layer threw/, why: 'a charge for a failing check' }]
    const consoleOnly = [{ point: 506, kind: 'console', match: /the label layer threw/, why: 'the charge that fits' }]
    expect(evaluate(renderChange({ runs, openPoints, ledger: checkOnly })).decision).toBe('block')
    expect(evaluate(renderChange({ runs, openPoints, ledger: consoleOnly })).decision).toBe('allow')
  })

  it('never formats to an empty value — a nameless failure still marks the retry', () => {
    expect(parseSuspectEnv(formatSuspectEnv([]))).toEqual([SUSPECT_UNNAMED])
  })

  it('reads an unset or blank variable as "not a retry" — a stale export condemns nothing', () => {
    expect(parseSuspectEnv(undefined)).toEqual([])
    expect(parseSuspectEnv('')).toEqual([])
    expect(parseSuspectEnv('  \n \n')).toEqual([])
  })

  it('bounds what it puts in an environment variable, and SAYS what it dropped', () => {
    const many = Array.from({ length: 40 }, (_, i) => `check ${i} `.padEnd(500, 'x'))
    const parsed = parseSuspectEnv(formatSuspectEnv(many))
    expect(parsed).toHaveLength(9)
    for (const name of parsed.slice(0, 8)) expect(name.length).toBeLessThanOrEqual(200)
    // The ninth entry is the truncation itself, so the dropped reds cannot go
    // quiet once the eight that fitted are charged.
    expect(parsed[8]).toMatch(/32 further red\(s\) of the first attempt were NOT carried/)
  })

  it('a truncated first attempt cannot be charged away', () => {
    const openPoints = [506]
    const marker = formatSuspectEnv(Array.from({ length: 12 }, (_, i) => ({ name: `red number ${i}` })))
    const suspectMany = { ...run('webgpu', 1500), suite: 'polish', suspect: true, suspectOf: parseSuspectReds(marker) }
    // A DELIBERATELY BROAD charge: even one that matches the truncation entry's
    // wording cannot own it, because what was never carried is not chargeable.
    const ledger = [{ point: 506, match: /red|further|first attempt/, why: 'as broad as a ledger entry gets' }]
    const runs = [suspectMany, run('webgpu', 2000), run('webgl', 2100)]
    const result = evaluate(renderChange({ runs, openPoints, ledger }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/NOT carried/)
  })
})

describe('coveringRun / evaluate — the accounted-for run clears the gate', () => {
  const openPoints = [506, 546]
  const accountedRun = (backend) => redRun(backend, 2000, [red('goat stance', 506)])

  it('counts an accounted-for run as coverage — but only with the open points in hand', () => {
    expect(coveringRun([accountedRun('webgpu')], 'webgpu', 1000, { openPoints })).not.toBeNull()
    expect(coveringRun([accountedRun('webgpu')], 'webgpu', 1000)).toBeNull()
  })

  it('clears a dual-backend change on two accounted-for runs and REPORTS the charges', () => {
    const result = evaluate(renderChange({ runs: [accountedRun('webgpu'), accountedRun('webgl')], openPoints }))
    expect(result.decision).toBe('allow')
    expect(result.clear).toBe(true)
    expect(result.accounted.map((a) => [a.backend, a.charges[0].point])).toEqual([
      ['webgpu', 506],
      ['webgl', 506],
    ])
  })

  it('reports NO accounting for a clean pass — the record keeps the two apart', () => {
    const result = evaluate(renderChange({ runs: [run('webgpu', 2000), run('webgl', 2000)], openPoints }))
    expect(result).toEqual({ decision: 'allow', clear: true })
  })

  it('still blocks when one backend carries an unaccounted red, and says which', () => {
    const result = evaluate(
      renderChange({
        runs: [accountedRun('webgpu'), redRun('webgl', 2000, [red('a NEW check nobody filed')])],
        openPoints,
      }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNACCOUNTED red/)
    expect(result.reason).toMatch(/a NEW check nobody filed/)
    expect(result.reason).toMatch(/render-verify-charges\.mjs/)
  })

  it('blocks a red charged to a point that is no longer open (the exception expired)', () => {
    const stale = redRun('webgpu', 2000, [red('a stale exception', 387)])
    const result = evaluate(renderChange({ runs: [stale, redRun('webgl', 2000, [red('x', 506)])], openPoints }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/point 387 is not open/)
  })
})

describe('the shipped charge ledger', () => {
  it('carries a well-formed entry for every known red', () => {
    expect(RED_CHARGES.length).toBeGreaterThan(0)
    for (const c of RED_CHARGES) {
      expect(Number.isInteger(c.point)).toBe(true)
      expect(c.match).toBeInstanceOf(RegExp)
      expect(String(c.why).length).toBeGreaterThan(40)
      if (c.backend) expect(BACKENDS).toContain(c.backend)
      if (c.kind) expect(['check', 'console']).toContain(c.kind)
      if (c.detailMatch) expect(c.detailMatch).toBeInstanceOf(RegExp)
      // NO STATEFUL FLAG (review finding, 28.08.2026): `g` and `y` keep
      // `lastIndex` across calls, so one entry would alternate between owning a
      // red and missing it, by call order alone.
      for (const re of [c.match, c.detailMatch]) {
        if (!re) continue
        expect(re.global).toBe(false)
        expect(re.sticky).toBe(false)
      }
    }
  })

  // The backstop for a ledger handed in by a caller rather than shipped here:
  // a stateful pattern must still answer the same for every red it is asked
  // about, and answer the same at record time and on the re-read.
  it('answers a stateful ledger regex identically on every red it is asked about', () => {
    const ledger = [{
      point: 506,
      match: /goat stance/g,
      detailMatch: /the planted foot/g,
      why: 'a hand-passed ledger whose author reached for the g flag',
    }]
    const one = { ...red('the goat stance again'), detail: 'the planted foot slid' }
    const two = { ...red('the goat stance once more'), detail: 'the planted foot slid' }
    for (const r of [one, two, one, two]) {
      expect(chargeFor(r, { suite: 'polish', backend: 'webgpu', ledger })?.point).toBe(506)
    }
  })

  it('charges only points the work order still holds OPEN (a ticked point expires its entries)', () => {
    const open = new Set(chargeablePoints(readTasksAll()))
    expect(RED_CHARGES.filter((c) => !open.has(c.point)).map((c) => c.point)).toEqual([])
  })

  // THE TWO LANES ANSWER TO DIFFERENT POINTS, and that separation is the whole
  // value of the charge (13.08.2026). The WebGPU entry says in its own words that
  // on WebGL 2 the check "stays a real red" — so it must never swallow a
  // hardware-lane occurrence. When one appeared, it did not join it: it became
  // point 671, which must classify it by measurement. The pairing below is what
  // stops the two from merging back together, and 671's entry dies with 671,
  // which is the point of the charge.
  // THE OWNER MOVED 20.08.2026: point 506 was folded into 642, which carries its
  // mechanism, and a charge to a ticked point expires. The number changed; the
  // pairing this case exists for did not.
  // THE INVARIANT THAT ENDS THIS FINDING RATHER THAN ANSWERING IT AGAIN (review
  // finding, 28.08.2026, rounds 17 and 18, which named nine such entries between
  // them). Every WebGPU entry rests on a measurement taken on THIS host, where
  // every run that recorded a level recorded COMPATIBILITY and no core-level run
  // has ever been written — so an entry without a level would excuse, on the
  // core adapter the player runs, a red nobody has ever measured there. The
  // field is meaningless on WebGL, so a WebGL entry must not carry one.
  it('scopes every WebGPU entry to a feature level, and no WebGL entry to any', () => {
    for (const c of RED_CHARGES) {
      if (c.backend === 'webgpu') expect(c.featureLevel, `point ${c.point} / ${c.suite}`).toBe('compatibility')
      else expect(c.featureLevel, `point ${c.point} / ${c.suite}`).toBeUndefined()
    }
  })

  it('charges the goat-stance red to a DIFFERENT point on each lane', () => {
    const goat = red('settlement walker (goat): the planted foot holds its ground spot')
    expect(chargeFor(goat, { suite: 'polish', backend: 'webgpu', featureLevel: 'compatibility' }).point).toBe(642)
    // THE LANE MUST BE THE ONLY THING THAT DIFFERS (cross-vendor review, GPT-5.6
    // Sol, 30.08.2026): without the level this observation was null for TWO
    // reasons at once — the next case already proves a missing level alone does
    // it — so 642 could have been widened across lanes with this pin still green.
    expect(chargeFor(goat, { suite: 'polish', backend: 'webgl', featureLevel: 'compatibility' })).toBeNull()
  })

  // THE ENTRY RESTS ON THE LANE IT MEASURED (review finding, 28.08.2026). Its
  // own evidence says the refutation holds because the measured WebGPU lane
  // reports COMPATIBILITY — so the core adapter the player runs was never
  // measured, and the same check there is a red nobody has explained.
  it('leaves the goat stance a real red on the core adapter and on a run that recorded no level', () => {
    const goat = red('settlement walker (goat): the planted foot holds its ground spot')
    expect(chargeFor(goat, { suite: 'polish', backend: 'webgpu', featureLevel: 'core' })).toBeNull()
    expect(chargeFor(goat, { suite: 'polish', backend: 'webgpu' })).toBeNull()
  })

  // THE STARTUP FREEZE CARRIED NEITHER BACKEND NOR LEVEL (review finding,
  // 28.08.2026), while its evidence names exactly one restored compatibility
  // adapter — so it would have excused the same freeze on WebGL 2 and on core,
  // where nobody has ever measured it. Both recorded reds carry that level.
  it('charges the startup freeze to the restored compatibility lane alone', () => {
    const freeze = red('the loading picture never freezes longer than the balance budget (4000 ms, design.md §21.2)')
    const scoped = { suite: 'startup', backend: 'webgpu', kind: 'check' }
    expect(chargeFor(freeze, { ...scoped, featureLevel: 'compatibility' }).point).toBe(733)
    expect(chargeFor(freeze, { ...scoped, featureLevel: 'core' })).toBeNull()
    expect(chargeFor(freeze, { ...scoped })).toBeNull()
    expect(chargeFor(freeze, { suite: 'startup', backend: 'webgl', kind: 'check', featureLevel: 'compatibility' })).toBeNull()
  })

  // THE MSAA CHECK ENTRY HELD NO KIND (review finding, 28.08.2026). Every name
  // it lists is a check the suite prints; the console side of the same cascade
  // has its own entry and its own signature. Unscoped, a console red carrying
  // one of these texts — which nobody measured — would have been excused.
  it('charges the MSAA cascade CHECK names as checks, never as console errors', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', featureLevel: 'compatibility' }
    for (const name of ['TRAA off again: no new console errors', 'F9 low: the frame still draws']) {
      expect(chargeFor(red(name, null, 'check'), scoped).point).toBe(514)
      expect(chargeFor(red(name, null, 'console'), scoped)).toBeNull()
    }
  })

  // The entry excuses the assertion that was MEASURED, never the walker it was
  // measured on (cross-vendor review of c33b031, finding 2). A different check
  // under the same label is a red nobody has measured, and it must stay a red.
  it('leaves another check under the same goat label uncharged', () => {
    const neighbour = red('settlement walker (goat): stays out of the compound fence (point 413)')
    expect(chargeFor(neighbour, { suite: 'polish', backend: 'webgpu' })).toBeNull()
  })

  it('charges only the measured children composition and leaves every other red uncovered', () => {
    const child = (detail) => ({
      ...red('no child walks without getting anywhere'),
      detail,
    })
    const measured = child(
      'worst child 3 at 0.39 % of its own judged time — worst child 3 at 8.9s, 1.29 m walked inside 0.32 m',
    )
    // The owner is 694, not the point that delivered the acceptance: an entry
    // charged to 666 would have expired at 666's own tick, taking the
    // acceptance with it on the very landing that made it.
    expect(chargeFor(measured, { suite: 'polish', backend: 'webgl' }).point).toBe(694)

    // The player-reported permanent shiver has the same check label, but not
    // the accepted single-event signature. Missing details are equally unsafe,
    // and the evidence names WebGL 2 only: all three remain real reds.
    const shiver = child('worst child 3 at 99.89 % — worst child 3 at 0.1s, 3.41 m walked inside 0.14 m')
    expect(chargeFor(shiver, { suite: 'polish', backend: 'webgl' })).toBeNull()
    expect(chargeFor(red('no child walks without getting anywhere'), { suite: 'polish', backend: 'webgl' })).toBeNull()
    expect(chargeFor(measured, { suite: 'polish', backend: 'webgpu' })).toBeNull()
  })

  it('a detailMatch charge reaches a red that was RECORDED BEFORE its entry existed', () => {
    // MEASURED 14.08.2026, through the real parser and the real recorder path,
    // and REPAIRED 28.08.2026 (point 734, review finding F1). A suite prints
    // `FAIL  <name> — <detail>`; failedChecks parses the detail out, so
    // chargeReds can read it and stamp the point. What it STORED used to be
    // name/key/kind/point alone — the detail was dropped, 0 of 99 recorded reds
    // carried one — so `owned()` re-reading the ledger over a stored red always
    // saw an empty detail and refused. The ledger's promise that a charge
    // "counts at once, no re-run needed" therefore held for `match` and NOT for
    // `detailMatch`, the narrowest kind it has, which is why a WebGPU children
    // red of 14.08.2026 stayed unexplained after its entry was written.
    const line =
      'FAIL  no child walks without getting anywhere — worst child 1 at 0.29 % of its own judged ' +
      'time — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m  [--section=children-motion]'
    const [parsed] = failedChecks(line)
    expect(parsed.detail).toContain('1.42 m walked inside 0.31 m')

    // At record time the charge sees the detail and stamps the owner.
    const [stored] = chargeReds([parsed], { suite: 'polish', backend: 'webgpu', featureLevel: 'compatibility' })
    expect(stored.point).toBe(694)

    // AND THE MEASUREMENT SURVIVES INTO THE RECORD, which is what makes the
    // charge re-readable at all.
    expect(stored.detail).toContain('1.42 m walked inside 0.31 m')

    // THE CASE THAT ACTUALLY BIT: a red recorded BEFORE the entry existed —
    // uncharged then, because the ledger of that day owned nothing. Reading the
    // ledger over the STORED red today now reaches it, and that is the
    // retroactivity point 734 promises.
    const lane = { suite: 'polish', backend: 'webgpu', featureLevel: 'compatibility' }
    const [beforeTheRule] = chargeReds([parsed], { ...lane, ledger: [] })
    expect(beforeTheRule.point).toBeNull()
    expect(beforeTheRule.detail).toContain('1.42 m walked inside 0.31 m')
    expect(chargeFor(beforeTheRule, lane)?.point).toBe(694)
    // …on the lane it was measured on, and nowhere else.
    expect(chargeFor(beforeTheRule, { ...lane, featureLevel: 'core' })).toBeNull()

    // A RED THAT PRINTED NO MEASUREMENT ADDS NO FIELD — records of such reds
    // keep exactly the shape they have always had.
    const [plain] = chargeReds([{ name: 'frame 11-worldmodel-khartoum-confluence', kind: 'check' }], {
      suite: 'world',
      backend: 'webgpu',
    })
    expect(plain.detail).toBeUndefined()
  })

  it('charges the STORED red, so a signature past the record\u2019s bound matches at neither time', () => {
    // The record is bounded (200 characters of detail), and the charge is
    // evaluated against that bounded text. Were the unbounded parse charged
    // instead, a signature sitting past the bound would stamp a point at record
    // time that the stored red could never reproduce — the record would claim an
    // owner nothing can re-derive. Both readings say the same thing here.
    const ledger = [{ point: 694, suite: 'polish', kind: 'check', match: /flooded check/i, detailMatch: /BURIED SIGNATURE/ }]
    const red = {
      name: 'flooded check',
      key: 'flooded check',
      kind: 'check',
      detail: `${'x'.repeat(300)} BURIED SIGNATURE`,
    }
    // The parse would match; the record cannot keep the signature.
    expect(chargeFor(red, { suite: 'polish', backend: 'webgpu', ledger })?.point).toBe(694)
    const [stored] = chargeReds([red], { suite: 'polish', backend: 'webgpu', ledger })
    expect(stored.detail).toHaveLength(200)
    expect(stored.point).toBeNull()
    expect(chargeFor(stored, { suite: 'polish', backend: 'webgpu', ledger })).toBeNull()
  })

  it('charges the same composition on the OTHER backend to the same owner, by its own signature', () => {
    // The WebGL-2-only scoping was disproved the night it was written: the same
    // composition appeared on WebGPU at a different measurement (point 694).
    // Each entry still answers for ITS signature alone — which is precisely why
    // 694 must replace them both with a rule about the SHAPE.
    const child = (detail) => ({ ...red('no child walks without getting anywhere'), detail })
    const onWebgpu = child('worst child 1 at 0.29 % — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m')
    const lane = { suite: 'polish', backend: 'webgpu', featureLevel: 'compatibility' }
    expect(chargeFor(onWebgpu, lane).point).toBe(694)
    // Not on the other backend, not on the core adapter, and no blanket over the
    // check itself.
    expect(chargeFor(onWebgpu, { suite: 'polish', backend: 'webgl' })).toBeNull()
    expect(chargeFor(onWebgpu, { ...lane, featureLevel: 'core' })).toBeNull()
    expect(
      chargeFor(child('worst child 2 at 18.4 % — worst child 2 at 3.0s, 9.10 m walked inside 0.12 m'), lane),
    ).toBeNull()
  })

  // A LANE FAULT MAY NOT EXCUSE THE PLAYER'S LANE (point 505 + review,
  // 19.08.2026). The compatibility adapter loses MSAA, so the MSAA cascade in
  // `settings` is that lane's own; on a CORE adapter each of those texts would be
  // a real defect, and three of them are generic WebGPU wording.
  it('charges the compatibility lane\'s MSAA cascade only where the run recorded that LEVEL', () => {
    // The recorded storm's own text: an error that SAYS it is downstream of one
    // already reported. The bare object name is not it — see the case below.
    // RECORDER-SHAPED, because the entry's narrow half reads the stored DETAIL
    // and a hand-built red carries none (review finding, 28.08.2026, round 20).
    const cascade = failedChecks(
      'ERR: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid TextureView] is invalid due to a previous error.',
    )[0]
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console' }
    expect(chargeFor(cascade, { ...scoped, featureLevel: 'compatibility' }).point).toBe(514)
    // The player's adapter, and a run that never recorded a level, are not it.
    expect(chargeFor(cascade, { ...scoped, featureLevel: 'core' })).toBeNull()
    expect(chargeFor(cascade, scoped)).toBeNull()
    // And still not another suite, backend or kind.
    expect(chargeFor(cascade, { suite: 'polish', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' })).toBeNull()
    expect(chargeFor(cascade, { suite: 'settings', backend: 'webgl', kind: 'console', featureLevel: 'compatibility' })).toBeNull()
  })

  // A charge reads ONE red at a time, so a generic object name could never tell
  // the measured cascade from an unrelated defect printing the same sentence
  // (review finding, 28.08.2026). What may be excused is a red that STATES it is
  // downstream — self-limiting, because the root it points back to is a red of
  // its own that nothing here charges.
  it('does NOT charge the bare cascade object names, nor the async pipeline error nobody owns', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    for (const t of [
      'console error: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid TextureView] is invalid',
      'console error: Invalid CommandBuffer from CommandEncoder',
      'console error: Async render pipeline creation failed',
    ]) {
      expect(chargeFor(red(t, null, 'console'), scoped), t).toBeNull()
    }
  })

  // THE DOWNSTREAM SENTENCE IS OWNED ONLY FOR THE OBJECT IT WAS MEASURED ON
  // (review finding, 28.08.2026). A charge reads ONE red, never the run, so
  // nothing can verify that the ROOT the sentence points back to is present and
  // still uncharged in the same record — which made the bare sentence own any
  // standalone downstream message on this lane wholesale.
  it('owns the cascade sentence only under the measured object name', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    // Recorder-shaped, from the ERR: lines of local/verify-baseline-logs.
    const asStored = (text_) =>
      chargeReds(failedChecks(`ERR: ${text_}`), { ...scoped, ledger: RED_CHARGES })[0]
    const measured = [
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid TextureView] is invalid due to a previous error.',
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid Texture "output-msaa"] is invalid due to a previous error.',
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid Texture "normal-msaa"] is invalid due to a previous error.',
    ]
    for (const t of measured) expect(asStored(t).point, t).toBe(514)
    // A downstream sentence from ANOTHER object stays a real red: 514's scope is
    // the objects it measured, and nothing here can see the root in the record.
    expect(
      asStored('THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid BindGroup] is invalid due to a previous error.').point,
    ).toBeNull()
    // THE TWO FORMS POINT 734 SAID MUST BE FILED HAVE THEIR POINT (1011, filed
    // 29.08.2026) AND STILL NO CHARGE — deliberately. A charge for them was
    // WRITTEN and then WITHDRAWN on 30.08.2026 after two cross-vendor rounds: the
    // stored console name is cut at 120 characters before the cascade's own
    // marker, and these texts share one derived key across seven pipeline
    // objects, so the recorder marks their detail VARIED and no detailMatch may
    // read it. Every pattern that matched the measured reds therefore also
    // matched an unrelated pipeline or command-buffer failure on the same lane.
    // Filing the point is a disposition; an over-broad charge is not. They stay
    // REAL REDS until point 990 lets a charge name the root it depends on.
    const stillRed = [
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid CommandBuffer from CommandEncoder "renderContext_1"] is invalid due to a previous error.',
      'THREE.WebGPURenderer: Async render pipeline creation failed (renderPipeline_x): [Invalid TextureView] is invalid due to a previous error.',
    ]
    // THE RED MUST EXIST BEFORE ITS CHARGE MAY BE NULL (cross-vendor review,
    // GPT-5.6 Sol, 30.08.2026): `?.point ?? null` would have passed just as well
    // if parsing or recording stopped producing a red at all, which is a
    // regression this pin is supposed to catch, not hide.
    for (const t of stillRed) {
      const stored = asStored(t)
      expect(stored, t).toBeTruthy()
      expect(stored.point, t).toBeNull()
    }
  })

  // THE MSAA TEXTURE ALTERNATIVE CARRIES ITS SENTENCE, NOT THE OBJECT NAME
  // (review finding, 28.08.2026, round 19). `Invalid Texture "output-msaa"` is
  // an ordinary WebGPU object name: any future defect touching either
  // attachment would have printed it and been charged here retroactively.
  it('charges the MSAA attachment errors through their sentence, never through the object name', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    const stored = (tex) =>
      failedChecks(
        `ERR: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid Texture "${tex}"] is invalid due to a previous error.`,
      )[0]
    for (const tex of ['output-msaa', 'normal-msaa']) {
      expect(chargeFor(stored(tex), scoped).point, tex).toBe(514)
    }
    // A different fault naming the same attachment is not the measured cascade.
    const elsewhere = failedChecks('ERR: resize failed while releasing Invalid Texture "output-msaa" mid-frame')[0]
    expect(chargeFor(elsewhere, scoped)).toBeNull()
  })

  it('charges the RGBA16Float family only through the EVIDENCED validation error, never the bare format name', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', featureLevel: 'compatibility' }
    // Recorder-shaped: the NAME is cut at "sup" by the 120-char normalisation,
    // and the DETAIL keeps 200 raw characters — which is where the word that
    // tells this root from another unsupported operation survives (round 20).
    const stored = (t) => failedChecks(`ERR: ${t}`)[0]
    const evidenced = stored(
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format (TextureFormat::RGBA16Float) does not support multisampling.',
    )
    expect(evidenced.name).toMatch(/does not sup$/)
    expect(chargeFor(evidenced, scoped).point).toBe(514)
    // ANOTHER unsupported operation on the same format reaches the SAME stored
    // name and must still stay a real red — that is what the detail is read for.
    const otherOperation = stored(
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format (TextureFormat::RGBA16Float) does not support storage binding.',
    )
    expect(otherOperation.name).toBe(evidenced.name)
    expect(chargeFor(otherOperation, scoped)).toBeNull()
    // A DIFFERENT RGBA16Float fault on the same lane is not the measured
    // cascade and must stay a real red (round-5 review, 19.08.2026).
    const other = stored('RGBA16Float storage binding is not allowed in this bind group')
    expect(chargeFor(other, scoped)).toBeNull()
  })

  // THE SAME LANE FAULT FROM THE CHECK SIDE. The console half was scoped to the
  // compatibility level while the CHECKS reporting the identical cascade were
  // charged unscoped, so one door was shut and the other left open: a matching
  // failure on the core adapter would still have been excused (review,
  // 19.08.2026).
  it('charges the MSAA cascade\'s CHECKS to that level too, not just its console errors', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'check' }
    for (const name of ['TRAA off again: no new console errors', 'F9 low: the frame still draws', 'Graphics levels: no new console errors across the F9 cycle']) {
      expect(chargeFor(red(name), { ...scoped, featureLevel: 'compatibility' }).point).toBe(514)
      // The player's adapter, and a run that recorded no level at all.
      expect(chargeFor(red(name), { ...scoped, featureLevel: 'core' })).toBeNull()
      expect(chargeFor(red(name), scoped)).toBeNull()
    }
  })

  // THE THIRD 514 ENTRY WAS THE ONE DOOR STILL OPEN (review finding,
  // 28.08.2026). Its own evidence names the WebGPU COMPATIBILITY lane — the
  // frame missing its subject there while WebGL 2 drew it minutes apart — but
  // it carried no level, so it would have retroactively excused the same frame
  // on the core adapter the player runs. The 17.08.2026 08:25 record it was
  // measured on carries featureLevel=compatibility, so the narrowing costs the
  // entry none of its evidence.
  it('charges the Victoria Falls frame to the COMPATIBILITY lane only, never to the core adapter', () => {
    const scoped = { suite: 'enrichments', backend: 'webgpu', kind: 'check' }
    // The stored name a frame check really carries (round 22 anchored the entry).
    const frame = red('frame 72-water-victoria-falls')
    expect(chargeFor(frame, { ...scoped, featureLevel: 'compatibility' }).point).toBe(514)
    expect(chargeFor(frame, { ...scoped, featureLevel: 'core' })).toBeNull()
    expect(chargeFor(frame, scoped)).toBeNull()
  })

  // A LEDGER PATTERN IS ANCHORED WHERE THE MEASURED NAME BEGINS (review finding,
  // 28.08.2026, round 22). The six MSAA check fragments floated free, so
  // "Graphics levels" inside ANY future settings check would have been charged
  // here. A stored check name is the label the suite printed, so its start is
  // exactly where these six begin.
  it('charges the MSAA checks only where their name BEGINS, not wherever it appears', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'check', featureLevel: 'compatibility' }
    expect(chargeFor(red('Graphics levels: no new console errors across the F9 cycle'), scoped).point).toBe(514)
    // The same words inside a different check are a red nobody measured…
    expect(chargeFor(red('the settings panel restores Graphics levels after a reload'), scoped)).toBeNull()
    expect(chargeFor(red('a later check mentioning F9 low in passing'), scoped)).toBeNull()
    // …and so is a future check that merely BEGINS with the same words (review
    // finding, 28.08.2026, round 25): the measured labels carry a colon, and
    // anchoring at the first words alone would have charged these.
    expect(chargeFor(red('Graphics levels and their labels survive a reload'), scoped)).toBeNull()
    expect(chargeFor(red('F9 low power mode is offered on this adapter'), scoped)).toBeNull()
  })

  // AND A NARROW HALF IS COUPLED TO THE ALTERNATIVE IT BELONGS TO (review
  // finding, 28.08.2026, round 22). `match` and `detailMatch` are asked
  // independently, so a red NAMED for the RGBA16Float root could pass the narrow
  // half on an unrelated cascade sentence elsewhere in its detail — the opposite
  // of what the root alternative claims to require.
  it('does not let one cascade sentence satisfy another alternative\u2019s detail', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    const crossed = {
      ...red(
        'console error: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format (TextureFormat::RGBA16Float) does not sup',
        null,
        'console',
      ),
      detail:
        'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid TextureView] is invalid due to a previous error.',
    }
    expect(chargeFor(crossed, scoped)).toBeNull()
  })

  // EACH ATTACHMENT AND EACH SENTENCE ANSWERS FOR ITSELF (review finding,
  // 28.08.2026, round 23). The two MSAA names shared one alternation, and the
  // two halves choose from it independently — so an OUTPUT name passed the
  // narrow half on a NORMAL detail. And the TextureView sentence was unanchored,
  // so it matched inside an async-pipeline message this entry's own evidence
  // says has no owner.
  it('does not let one MSAA attachment satisfy the other one\u2019s detail', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    const sentence = (tex) =>
      `THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid Texture "${tex}"] is invalid due to a previous error.`
    for (const tex of ['output-msaa', 'normal-msaa']) {
      expect(chargeFor(failedChecks(`ERR: ${sentence(tex)}`)[0], scoped).point, tex).toBe(514)
    }
    const crossed = { ...failedChecks(`ERR: ${sentence('output-msaa')}`)[0], detail: sentence('normal-msaa') }
    expect(chargeFor(crossed, scoped)).toBeNull()
  })

  // THE FOUR NARROWINGS THE CROSS-VENDOR REVIEW OF 30.08.2026 REQUIRED
  // (GPT-5.6 Sol, do-not-merge on ffc9c23). Each entry had been written against
  // the red it was measured on and matched a WIDER family than that red — which
  // is the one failure mode a charge must never have. These pin the narrow half
  // AND the measured half together: an entry that stops matching its own
  // evidence is as broken as one that matches everything.
  it('charges the archive composite only in the picture-loss shape', () => {
    const scoped = { suite: 'report', backend: 'webgpu', kind: 'check', featureLevel: 'compatibility' }
    const withDetail = (name, detail) => ({ ...red(name), detail })
    const composite = 'the archive holds picture, state, overlay and description'
    // WHAT 927 MEASURED: the three non-picture members present, no picture.
    expect(
      chargeFor(withDetail(composite, 'hoa-state-2026-08-29-42.json, hoa-state-2026-08-29-42-overlay.json, hoa-state-2026-08-29-42.txt'), scoped).point,
    ).toBe(927)
    // A LOST STATE OR A LOST OVERLAY IS A DEFECT NOBODY HAS MEASURED, and this
    // check reports all four members through one name — so without the detail the
    // entry would have excused them too.
    expect(chargeFor(withDetail(composite, 'hoa-state-2026-08-29-42.png, hoa-state-2026-08-29-42.txt'), scoped)).toBeNull()
    expect(chargeFor(withDetail(composite, 'hoa-state-2026-08-29-42.json, hoa-state-2026-08-29-42.txt'), scoped)).toBeNull()
    // THE LOST-STATE CASE HAD TO BE WRITTEN WITHOUT A SECOND REASON TO FAIL
    // (cross-vendor review, GPT-5.6 Sol, 30.08.2026): the two lines above also
    // lose the overlay or carry a picture, so each stayed null through a
    // CONSTRAINT OTHER than the state lookahead — and the entry's state
    // lookahead was in fact satisfied by the overlay's own `.json`. This detail
    // keeps overlay and description and drops state and picture, so it is null
    // only while the state member is required in its own right.
    expect(
      chargeFor(withDetail(composite, 'hoa-state-2026-08-29-42-overlay.json, hoa-state-2026-08-29-42.txt'), scoped),
    ).toBeNull()
    // AND THE STATE MEMBER IS THE ONE THE SUITE NAMES, not merely some other JSON
    // (cross-vendor review, GPT-5.6 Sol, round 2): an archive that shipped a
    // `metadata.json` in place of its state satisfied `a .json that is not the
    // overlay` and was charged as the measured picture loss.
    expect(
      chargeFor(withDetail(composite, 'metadata.json, hoa-state-2026-08-29-42-overlay.json, hoa-state-2026-08-29-42.txt'), scoped),
    ).toBeNull()
    // AND THE NAME MUST BE THE WHOLE MEMBER, not a prefix of another one (round 3):
    // the detail joins its members with a comma, so the state member ends where the
    // separator does — `<stem>.json.bak` is a different file.
    expect(
      chargeFor(
        withDetail(composite, 'hoa-state-2026-08-29-42.json.bak, hoa-state-2026-08-29-42-overlay.json, hoa-state-2026-08-29-42.txt'),
        scoped,
      ),
    ).toBeNull()
    // The boundary is the SEPARATOR the join writes, not a bare comma (round 4):
    // a member ending `.json,bak` is no more the state file than `.json.bak` is.
    expect(
      chargeFor(
        withDetail(composite, 'hoa-state-2026-08-29-42.json,bak, hoa-state-2026-08-29-42-overlay.json, hoa-state-2026-08-29-42.txt'),
        scoped,
      ),
    ).toBeNull()
    // A member whose OWN name carries the separator is indistinguishable from two
    // members (round 5), so the entry stops guessing boundaries and describes the
    // whole detail: three members, each built from the stem the suite writes.
    expect(
      chargeFor(
        withDetail(composite, 'hoa-state-2026-08-29-42.json, bak, hoa-state-2026-08-29-42-overlay.json, hoa-state-2026-08-29-42.txt'),
        scoped,
      ),
    ).toBeNull()
    // While the two checks that name the picture themselves need no detail.
    expect(chargeFor(red('the archive carries a screenshot'), scoped).point).toBe(927)
    expect(chargeFor(red('member hoa-state-2026-08-29-42.png is present'), scoped).point).toBe(927)
    // ANY OTHER PNG MEMBER IS A RED NOBODY HAS MEASURED: the wildcard that used
    // to stand here accepted every `member <anything>.png is present` the report
    // suite might grow (cross-vendor review, GPT-5.6 Sol, 30.08.2026).
    expect(chargeFor(red('member thumbnail.png is present'), scoped)).toBeNull()
  })

  it('excuses the timestamp row only where the red names the missing capability', () => {
    const scoped = { suite: 'benchmark', backend: 'webgpu', kind: 'check', featureLevel: 'compatibility' }
    const withDetail = (name, detail) => ({ ...red(name), detail })
    const named = withDetail('WebGPU: real GPU timestamps were measured for every row', '0/33 rows, reason "adapter without the timestamp-query feature"')
    expect(chargeFor(named, scoped).point).toBe(1012)
    // THE SAME CHECK WITHOUT THAT REASON IS A REAL REGRESSION. The feature level
    // does not test the capability, so a compatibility adapter that DOES expose
    // timestamp-query must keep this red — and the low-preset row, whose detail
    // names no capability at all, is deliberately not excused either.
    expect(chargeFor(withDetail('WebGPU: real GPU timestamps were measured for every row', '0/33 rows, reason "the pass recorded no queries"'), scoped)).toBeNull()
    expect(chargeFor(withDetail('WebGPU: real GPU timestamps were measured for the low-preset rows too', '0/3 low rows with gpu'), scoped)).toBeNull()
    // AND THE REASON MAY NOT RIDE ALONG WITH A SECOND FAILURE: unanchored, the
    // detail below carried the known capability gap AND a genuinely different
    // fault and was still excused (cross-vendor review, GPT-5.6 Sol, 30.08.2026).
    expect(
      chargeFor(
        withDetail(
          'WebGPU: real GPU timestamps were measured for every row',
          '0/33 rows, reason "adapter without the timestamp-query feature" and 4 rows reported a negative median',
        ),
        scoped,
      ),
    ).toBeNull()
  })

  it('lets the benchmark cascade charge cover that sentence ALONE', () => {
    const scoped = { suite: 'benchmark', backend: 'webgpu', kind: 'check', featureLevel: 'compatibility' }
    const sentence =
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format (TextureFormat::RGBA16Float) does not support multisampling.'
    const withDetail = (name, detail) => ({ ...red(name), detail })
    expect(chargeFor(withDetail('no console errors', sentence), scoped).point).toBe(514)
    // A NEW CONSOLE ERROR RIDING ALONG WITH THE KNOWN ONE IS NOT EXCUSED: the
    // detail is anchored at both ends, so the assertion cannot become a blanket.
    expect(chargeFor(withDetail('no console errors', `${sentence} TypeError: x is not a function`), scoped)).toBeNull()
    expect(chargeFor(withDetail('no console errors', 'TypeError: x is not a function'), scoped)).toBeNull()
    // BOTH ends: the two lines above only witness the TRAILING anchor, so the
    // leading one could have been dropped with every assertion still green
    // (cross-vendor review, GPT-5.6 Sol, 30.08.2026).
    expect(chargeFor(withDetail('no console errors', `TypeError: x is not a function ${sentence}`), scoped)).toBeNull()
  })

  it('charges the crossing to 698 only while the round actually opens runs', () => {
    const scoped = { suite: 'polish', backend: 'webgpu', kind: 'check', featureLevel: 'compatibility' }
    const density =
      'from one side of him to the other — 0 of 4 crossed his line; along the lane (0 = his line) ' +
      '[-11..25@1, -10..22@1, -24..0@1, -11..14@1] m, walked [67, 67, 67, 68] m, phases ' +
      '[run×16 part×72 roam×307] over 45s played, 3 tagged'
    const withDetail = (name, detail) => ({ ...red(name), detail })
    expect(chargeFor(withDetail('the children walk PAST the traveller', density), scoped).point).toBe(698)
    // A WINDOW THAT NEVER REACHED THE RUN PHASE IS A BROKEN ROUND, NOT THE
    // DENSITY 698 owns — point 698's claim is that the round runs and the
    // crossing merely falls outside the window.
    const noRun = density.replace('[run×16 part×72 roam×307]', '[part×72 roam×323]')
    expect(chargeFor(withDetail('the children walk PAST the traveller', noRun), scoped)).toBeNull()
  })

  it('charges the label fusion to 1010 only in the single-frame shape it measured', () => {
    const scoped = { suite: 'polish', backend: 'webgl', kind: 'check' }
    const withDetail = (name, detail) => ({ ...red(name), detail })
    const name = 'no two Ctrl labels fuse in the village crowd (point 628)'
    // WHAT 1010 MEASURED: one frame of ninety, deeper than the unreadable bar,
    // and the retry green — the loaded-host suspicion the point owes a probe for.
    const measured =
      '1/90 frames held a pair fused beyond 6 px (allowed 4), deepest 19 px ' +
      '["Ada"×"Njoro" 14×12 px], 4–7 labels across the sample — as deep as the 18 px unreadable bar'
    expect(chargeFor(withDetail(name, measured), scoped).point).toBe(1010)
    // A SUSTAINED FUSION IS A DIFFERENT DEFECT and must stay red: without a
    // detail constraint the bare check name charged this away too.
    expect(chargeFor(withDetail(name, measured.replace('1/90', '37/90')), scoped)).toBeNull()
    // So must a red that never crossed the unreadable bar — there the crowd is
    // over its allowed share of fused frames, which is not what 1010 observed.
    expect(
      chargeFor(
        withDetail(
          name,
          '7/90 frames held a pair fused beyond 6 px (allowed 4), deepest 9 px, 4–7 labels across the sample',
        ),
        scoped,
      ),
    ).toBeNull()
    // And a sample that never held the crowd proves nothing about fusion at all.
    expect(
      chargeFor(withDetail(name, 'the crowd did not hold: as few as 1 label(s) in a sampled frame (peak 6) — under the 2-label floor, nothing proven'), scoped),
    ).toBeNull()
    // THE WHOLE PRINTED LINE IS SPELLED OUT, NOT LEFT TO A WILDCARD (cross-vendor
    // review, GPT-5.6 Sol, round 2). `deepest N px.*unreadable bar` accepted any
    // text at all between the depth and the bar — including a detail that has lost
    // the label-floor reading the verdict always prints, which is a changed
    // measurement rather than the one 1010 owns.
    expect(
      chargeFor(
        withDetail(
          name,
          '1/90 frames held a pair fused beyond 6 px (allowed 4), deepest 19 px ' +
            '["Ada"×"Njoro" 14×12 px] — as deep as the 18 px unreadable bar',
        ),
        scoped,
      ),
    ).toBeNull()
  })

  it('leaves the async-pipeline message uncharged, though its family now has a point', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    const asyncForm = failedChecks(
      'ERR: THREE.WebGPURenderer: Async render pipeline creation failed (renderPipeline_x): [Invalid TextureView] is invalid due to a previous error.',
    )[0]
    expect(chargeFor(asyncForm, scoped)).toBeNull()
    // While the measured form, at the start of the stored name, still charges.
    const measured = failedChecks(
      'ERR: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: [Invalid TextureView] is invalid due to a previous error.',
    )[0]
    expect(chargeFor(measured, scoped).point).toBe(514)
    // AND THE BARE WORDINGS STAY UNCHARGED TOO — the shape an unrelated defect
    // prints. This is the over-reach the pins above exist for, and filing point
    // 1011 for the family did not widen it by one character.
    for (const bare of ['console error: Async render pipeline creation failed', 'console error: Invalid CommandBuffer from CommandEncoder']) {
      expect(chargeFor(red(bare, null, 'console'), scoped), bare).toBeNull()
    }
  })

  // A NARROW HALF IS ANCHORED WHERE THE STORED DETAIL BEGINS (review finding,
  // 28.08.2026, round 24). Unanchored, an expected sentence appearing anywhere
  // later in an unrelated detail satisfied the charge — the same crossing the
  // name half was anchored against.
  it('does not charge a cascade whose measured sentence only appears later in its detail', () => {
    const scoped = { suite: 'settings', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    const root =
      'THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format (TextureFormat::RGBA16Float) does not support multisampling.'
    expect(chargeFor(failedChecks(`ERR: ${root}`)[0], scoped).point).toBe(514)
    const buried = { ...failedChecks(`ERR: ${root}`)[0], detail: `a wrapper said: ${root}` }
    expect(chargeFor(buried, scoped)).toBeNull()
  })

  // AND THE VITE OPTIMIZER RED IS THE MEASURED MESSAGE, not the fragment
  // (review finding, 28.08.2026, round 24).
  it('charges the Vite optimizer red only under the wording that was recorded', () => {
    const scoped = { suite: 'startup', backend: 'webgpu', kind: 'console', featureLevel: 'compatibility' }
    const measured = red(
      'console error: Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)',
      null,
      'console',
    )
    expect(chargeFor(measured, scoped).point).toBe(939)
    expect(chargeFor(red('console error: the bundler logged Outdated Optimize Dep while idle', null, 'console'), scoped)).toBeNull()
  })

  // AND THE FALLS FRAME IS NARROWED TO THE FAILURE MODE ITS EVIDENCE NAMES
  // (review finding, 28.08.2026, round 25). It accounts for no recorded red
  // today, so reading the detail costs nothing — unlike the three entries point
  // 995 owns, where it would withdraw a standing charge.
  it('charges the falls frame only for the failure its evidence measured', () => {
    const scoped = { suite: 'world', backend: 'webgpu', kind: 'check', featureLevel: 'compatibility' }
    const measured = {
      ...red('frame 15-worldmodel-victoria-falls'),
      detail: 'its subject is not in the rendered picture: off the left and bottom edge of the frame',
    }
    expect(chargeFor(measured, scoped).point).toBe(627)
    const different = { ...red('frame 15-worldmodel-victoria-falls'), detail: 'the frame is a solid black plate' }
    expect(chargeFor(different, scoped)).toBeNull()
  })

  it('charges the fixed render-target leak to NOBODY — a mended red is a red again', () => {
    // Point 546 released the bird's-eye cascade shadow maps and its entry left
    // the ledger with the tick. Should the leak ever come back, it must count
    // against whatever change brought it, not be waved through by a dead
    // exception — that expiry is the whole reason the ledger names points.
    const leak = red(
      'console error: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village',
      null,
      'console',
    )
    expect(chargeFor(leak, { suite: 'polish', backend: 'webgl' })).toBeNull()
    expect(chargeFor(leak, { suite: 'polish', backend: 'webgpu' })).toBeNull()
  })
})
