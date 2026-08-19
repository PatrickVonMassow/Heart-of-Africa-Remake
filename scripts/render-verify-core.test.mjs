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
  runVerdict,
  formatSuspectEnv,
  parseSuspectEnv,
  parseSuspectReds,
  suspectRedsOf,
  unexplainedRuns,
  isIncompleteRecording,
  incompleteClosureFor,
  droppedLinesOf,
  SUSPECT_UNNAMED,
} from './render-verify-core.mjs'
import { RED_CHARGES } from './render-verify-charges.mjs'
import { failedChecks } from './verify/baseline-classify-core.mjs'
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

  it('survives a broken ledger entry rather than throwing', () => {
    const broken = [{ point: 1, match: null }, { point: 2, match: /x/ }, null]
    expect(() => chargeFor(red('x'), { ledger: broken })).not.toThrow()
    expect(chargeFor(red('x'), { ledger: broken }).point).toBe(2)
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

  it('does NOT talk a CRASH away with a charge — a run that died judged no picture', () => {
    const ledger = [{ point: 506, match: /goat/, why: 'the software lane cannot draw fast enough' }]
    const crashed = redRun('webgpu', 1500, [red('goat stance', 506)], { crashed: true })
    const result = evaluate(renderChange({ runs: [crashed, run('webgpu', 2000), run('webgl', 2100)], openPoints, ledger }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNEXPLAINED RED/)
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
describe('an INCOMPLETE RECORDING is its own class, and has its own way out (point 734)', () => {
  const openPoints = [506, 546]
  // The two shapes on file: what the recorder writes TODAY (the field), and what
  // it wrote before the field existed (the synthetic red under its stable key) —
  // the runs of 13.08.2026 are the second kind and must be recognised.
  const truncatedNow = (backend, at, overrides = {}) =>
    redRun(backend, at, [red('a check that DID fit in the buffer')], {
      truncated: true,
      droppedLines: 115,
      ...overrides,
    })
  const truncatedLegacy = (backend, at) =>
    redRun(backend, at, [
      { name: "115 further result line(s) exceeded the capture cap — this run's reds were NOT all read", key: 'capture-truncated', kind: 'check', point: null },
      red('console error: THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError', null, 'console'),
    ])
  const closure = (backend, suite, at) => ({ backend, suite, at, evidence: 'the host cannot run a browser suite (point 732)' })

  it('recognises both record shapes, and reads how much was lost', () => {
    expect(isIncompleteRecording(truncatedNow('webgpu', 1500))).toBe(true)
    expect(isIncompleteRecording(truncatedLegacy('webgpu', 1500))).toBe(true)
    expect(isIncompleteRecording(redRun('webgpu', 1500, [red('an ordinary red')]))).toBe(false)
    expect(droppedLinesOf(truncatedNow('webgpu', 1500))).toBe(115)
    expect(droppedLinesOf(truncatedLegacy('webgpu', 1500))).toBe(115)
    expect(droppedLinesOf(run('webgpu', 1500))).toBe(0)
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
      renderChange({ runs, openPoints, incompleteClosures: [closure('webgpu', 'polish', 1600)] }),
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/UNEXPLAINED RED/)
  })

  it('a SIGNED-OFF incomplete recording stops blocking a later render edit — with no --defer', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    const runs = [broken, run('webgpu', 2000), run('webgl', 2100)]
    expect(evaluate(renderChange({ runs, openPoints })).decision).toBe('block')
    const result = evaluate(
      renderChange({ runs, openPoints, incompleteClosures: [closure('webgpu', 'polish', 1500)], deferral: null }),
    )
    expect(result.decision).toBe('allow')
  })

  it('signs off ONE run, never a suite/backend pair — the NEXT truncated run blocks again', () => {
    const first = truncatedLegacy('webgpu', 1500)
    const second = truncatedLegacy('webgpu', 2500)
    const closures = [closure('webgpu', 'polish', 1500)]
    expect(unexplainedRuns([first], 1000, { openPoints, incompleteClosures: closures })).toEqual([])
    const still = unexplainedRuns([first, second], 1000, { openPoints, incompleteClosures: closures })
    expect(still.map((u) => u.at)).toEqual([2500])
    expect(still[0].status).toBe('incomplete')
  })

  // The closure discards a RECORD; it never says the picture was fine. A backend
  // with nothing but a signed-off run behind it is still uncovered.
  it('never turns a signed-off run into coverage', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    const closures = [closure('webgpu', 'polish', 1500)]
    expect(coveringRun([broken], 'webgpu', 1000, { openPoints })).toBeNull()
    const result = evaluate(renderChange({ runs: [broken, run('webgl', 2100)], openPoints, incompleteClosures: closures }))
    expect(result.decision).toBe('block')
    expect(result.reason).toMatch(/RENDER CHANGE NOT VERIFIED ON WEBGPU/)
  })

  it('is total on malformed closures and records', () => {
    const broken = truncatedLegacy('webgpu', 1500)
    expect(() => unexplainedRuns([broken], 1000, { openPoints, incompleteClosures: [null, 7, {}] })).not.toThrow()
    expect(unexplainedRuns([broken], 1000, { openPoints, incompleteClosures: [null, 7, {}] })).toHaveLength(1)
    expect(isIncompleteRecording(null)).toBe(false)
    expect(incompleteClosureFor(null, null)).toBeNull()
    expect(droppedLinesOf({ droppedLines: 'many' })).toBe(0)
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
    }
  })

  it('charges only points the work order still holds OPEN (a ticked point expires its entries)', () => {
    const open = new Set(chargeablePoints(readTasksAll()))
    expect(RED_CHARGES.filter((c) => !open.has(c.point)).map((c) => c.point)).toEqual([])
  })

  // THE TWO LANES ANSWER TO DIFFERENT POINTS, and that separation is the whole
  // value of the charge (13.08.2026). Point 506 is the software lane's rate
  // problem and says in its own words that on WebGL 2 the check "stays a real
  // red" — so it must never swallow a hardware-lane occurrence. When one
  // appeared, it did not become 506's: it became point 671, which must classify
  // it by measurement. The pairing below is what stops the two from merging back
  // together, and 671's entry dies with 671, which is the point of the charge.
  it('charges the goat-stance red to a DIFFERENT point on each lane', () => {
    const goat = red('settlement walker (goat): the planted foot holds its ground spot')
    expect(chargeFor(goat, { suite: 'polish', backend: 'webgpu' }).point).toBe(506)
    expect(chargeFor(goat, { suite: 'polish', backend: 'webgl' })).toBeNull()
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

  it('a detailMatch charge fires at RECORD time and can never be applied afterwards', () => {
    // MEASURED 14.08.2026, through the real parser and the real recorder path.
    // A suite prints `FAIL  <name> — <detail>`; failedChecks parses the detail
    // out, so chargeReds CAN read it and stamps the point. What it then STORES
    // is name/key/kind/point — the detail is dropped, and 0 of 99 recorded reds
    // carry one. So the ledger's promise that a charge "counts at once, no
    // re-run needed" holds for `match` and NOT for `detailMatch`: a red that was
    // already recorded can never be charged retroactively, which is why a
    // WebGPU children red of 14.08.2026 stayed unexplained after its entry was
    // written. Point 694 owns the repair. Fail-safe either way — an unmatched
    // red stays loudly uncharged, it is never blessed.
    const line =
      'FAIL  no child walks without getting anywhere — worst child 1 at 0.29 % of its own judged ' +
      'time — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m  [--section=children-motion]'
    const [parsed] = failedChecks(line)
    expect(parsed.detail).toContain('1.42 m walked inside 0.31 m')

    // At record time the charge sees the detail and stamps the owner.
    const [stored] = chargeReds([parsed], { suite: 'polish', backend: 'webgpu' })
    expect(stored.point).toBe(694)

    // What survives into the record carries no detail.
    expect(stored.detail).toBeUndefined()

    // AND THE CASE THAT ACTUALLY BIT: a red recorded BEFORE the entry existed —
    // uncharged, and without the detail the new entry would need. Adding the
    // entry afterwards cannot reach it, however the ledger now reads.
    const [beforeTheRule] = chargeReds([parsed], { suite: 'polish', backend: 'webgpu', ledger: [] })
    expect(beforeTheRule.point).toBeNull()
    expect(beforeTheRule.detail).toBeUndefined()
    expect(chargeFor(beforeTheRule, { suite: 'polish', backend: 'webgpu' })).toBeNull()
  })

  it('charges the same composition on the OTHER backend to the same owner, by its own signature', () => {
    // The WebGL-2-only scoping was disproved the night it was written: the same
    // composition appeared on WebGPU at a different measurement (point 694).
    // Each entry still answers for ITS signature alone — which is precisely why
    // 694 must replace them both with a rule about the SHAPE.
    const child = (detail) => ({ ...red('no child walks without getting anywhere'), detail })
    const onWebgpu = child('worst child 1 at 0.29 % — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m')
    expect(chargeFor(onWebgpu, { suite: 'polish', backend: 'webgpu' }).point).toBe(694)
    // Not on the other backend, and no blanket over the check itself.
    expect(chargeFor(onWebgpu, { suite: 'polish', backend: 'webgl' })).toBeNull()
    expect(
      chargeFor(child('worst child 2 at 18.4 % — worst child 2 at 3.0s, 9.10 m walked inside 0.12 m'), {
        suite: 'polish',
        backend: 'webgpu',
      }),
    ).toBeNull()
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
