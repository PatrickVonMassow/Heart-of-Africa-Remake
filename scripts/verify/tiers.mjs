// The regression's suite→tier→BACKEND map, as pure functions (point 204).
//
// run-all.mjs is an orchestrator that spawns servers and child processes, so
// its wiring cannot be unit-tested as it stands. The DECISIONS it makes —
// which suites a tier runs, which backend(s) a command covers, and which
// suites a WebGPU pass must skip — are plain data transformations and live
// here, where the Vitest layer pins them (scripts/verify/tiers.test.mjs).
// run-all.mjs imports them; keep scripts/verify/README.md in lockstep.

/**
 * Every browser/data suite of the LARGE tier, in run order. `docs` is a pure
 * Node check that rides along for a single report.
 */
export const DEV_SUITES = [
  'docs', 'world', 'i18n', 'flow', 'health', 'events', 'collision', 'handwriting',
  'polish', 'gamepad', 'touch', 'voice', 'settings', 'enrichments', 'invariants',
]

/**
 * The SMALL everyday gate (point 173): fast, low-flake core coverage — doc/i18n
 * consistency, the one E2E core loop, health/events/collision and TTS. A strict
 * subset of DEV_SUITES.
 */
export const SMALL_SUITES = ['docs', 'i18n', 'flow', 'health', 'events', 'collision', 'voice']

/**
 * WebGL2-ONLY suites (user decision 20.07.2026): headless WebGPU under system
 * Chrome can drive neither touch's CDP touch events nor voice's TTS speak
 * state, and BOTH were verified to render correctly on the WebGL 2 path — so a
 * WebGPU pass SKIPS them (logged, never a silent gap) instead of false-failing
 * on a harness limitation. Everything else runs on the selected backend.
 */
export const WEBGL_ONLY_SUITES = ['touch', 'voice']

/** The renderer backend a VERIFY_GL value selects (mirrored from _browser.mjs). */
export function selectBackend(verifyGl) {
  return String(verifyGl ?? 'webgl').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'
}

/**
 * Split the CLI args into the tier token and the suite-name filter, and derive
 * the two run shapes that follow from them:
 *   fullRun          — do the preflight (build + lint + unit): the bare default
 *                      or an explicit tier; a bare suite filter skips it.
 *   isLargeEquivalent — this command runs the WHOLE LARGE set (+ preview), so
 *                      it is the one that covers BOTH backends.
 */
export function parseArgs(argv) {
  const tier = argv.includes('small') ? 'small' : argv.includes('large') ? 'large' : null
  const filter = argv.filter((a) => a !== 'small' && a !== 'large')
  return {
    tier,
    filter,
    fullRun: tier !== null || filter.length === 0,
    isLargeEquivalent: tier === 'large' || (tier === null && filter.length === 0),
  }
}

/**
 * The suites this invocation runs on `backend`, in run order: the tier's set
 * (or the explicit filter, intersected with the known suites), minus the
 * WebGL2-only ones on a WebGPU pass.
 */
export function suitesFor({ tier, filter = [], backend = 'webgl' }) {
  const chosen = filter.length ? DEV_SUITES.filter((s) => filter.includes(s)) : tier === 'small' ? SMALL_SUITES : DEV_SUITES
  return chosen.filter((s) => !(backend === 'webgpu' && WEBGL_ONLY_SUITES.includes(s)))
}

/** The suites `backend` drops from this invocation (logged as an explicit SKIP). */
export function skippedSuites({ tier, filter = [], backend = 'webgl' }) {
  const chosen = filter.length ? DEV_SUITES.filter((s) => filter.includes(s)) : tier === 'small' ? SMALL_SUITES : DEV_SUITES
  return chosen.filter((s) => backend === 'webgpu' && WEBGL_ONLY_SUITES.includes(s))
}

/**
 * Which backend pass(es) a command covers — the point-204(b) both-backends
 * wiring. A LARGE-equivalent run with NO pinned VERIFY_GL re-invokes itself
 * twice: the full LARGE on WebGL 2 (preflight + preview), then the render
 * suites on WebGPU (the backend-agnostic build/lint/unit preflight and the prod
 * preview were already proven, so they are skipped). A pinned VERIFY_GL, the
 * SMALL tier and a bare single-suite filter each stay a single-backend pass.
 *
 * Returns [] when this process should just run itself on `selectBackend(verifyGl)`.
 */
export function planBackends({ isLargeEquivalent, verifyGl, ranBoth = false }) {
  if (!isLargeEquivalent || verifyGl !== undefined || ranBoth) return []
  return [
    { backend: 'webgl', skipPreflight: false },
    { backend: 'webgpu', skipPreflight: true },
  ]
}
