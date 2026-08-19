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
  'docs', 'startup', 'world', 'i18n', 'flow', 'health', 'events', 'collision', 'handwriting',
  'polish', 'gamepad', 'touch', 'voice', 'settings', 'enrichments', 'invariants',
  'benchmark', 'report',
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
 * state, and BOTH were verified to render correctly on the WebGL 2 path — so
 * they are never launched on WebGPU, and never false-fail on a harness
 * limitation. Everything else runs on the selected backend.
 *
 * WHERE they run changed with the lane swap (point 571): they are ROUTED to
 * WebGL 2 (`laneFor`) wherever a run picks them, so `voice` stays inside the
 * everyday SMALL gate rather than dropping out of it when that gate moved to
 * WebGPU. They are SKIPPED only where a companion WebGL 2 pass in the SAME
 * command already ran them — the second pass of a both-backends LARGE run.
 */
export const WEBGL_ONLY_SUITES = ['touch', 'voice']

/**
 * The backend an unpinned run uses (point 571, user 09.08.2026). WebGPU is the
 * PLAYER's backend, and every one-backend defect on record showed there while
 * WebGL 2 stayed green (points 210/334/506) — never the other way round. So the
 * everyday lane (the SMALL tier, a bare suite filter) is WebGPU, and WebGL 2 is
 * the REGRESSION lane, run by every LARGE. Measured on this host, WebGPU is not
 * the slower lane, so the swap costs no run time.
 */
export const DEFAULT_BACKEND = 'webgpu'

/**
 * Suites that need NO dev server: pure Node checks that read the checkout
 * itself. Naming them keeps a `docs`-only run free of a vite start-up (and lets
 * the baseline classifier run the BASELINE tree's own copy of such a script,
 * since there is no server whose code could differ instead).
 */
export const SERVERLESS_SUITES = ['docs']

/** Does this suite selection need a dev server at all? */
export function needsDevServer(suites) {
  return (suites ?? []).some((s) => !SERVERLESS_SUITES.includes(s))
}

/** Does this selection need the fast GPU-backend preflight? Pure Node suites and
 *  build/lint/unit selections do not; every Chromium suite and the production preview
 *  do. Kept pure so the runner cannot silently move the probe onto every command. */
export function needsGpuBackendProbe(suites, { preview = false } = {}) {
  return preview || needsDevServer(suites)
}

/** The renderer backend a VERIFY_GL value selects (mirrored from _browser.mjs).
 *  UNSET means the everyday lane, DEFAULT_BACKEND; any other value than 'webgpu'
 *  (including an empty string, which a shell writes for `VERIFY_GL=`) is the
 *  WebGL 2 regression lane, so a pinned value is never quietly upgraded. */
export function selectBackend(verifyGl) {
  return String(verifyGl ?? DEFAULT_BACKEND).toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'
}

/**
 * The backend ONE suite runs on inside a pass on `backend` (point 571). The
 * WebGL2-only suites are routed to WebGL 2 instead of being dropped, so making
 * WebGPU the everyday lane cannot silently take `voice` out of the SMALL gate.
 * run-all.mjs sets VERIFY_GL per suite from this, so each suite's run record
 * names the backend it really opened.
 */
export function laneFor(suite, backend) {
  return WEBGL_ONLY_SUITES.includes(suite) ? 'webgl' : backend
}

/**
 * Split the CLI args into the tier token, the suite-name filter and the flags,
 * and derive the two run shapes that follow from them:
 *   fullRun          — do the preflight (build + lint + unit): the bare default
 *                      or an explicit tier; a bare suite filter skips it.
 *   isLargeEquivalent — this command runs the WHOLE LARGE set (+ preview), so
 *                      it is the one that covers BOTH backends.
 *   baseline         — `--baseline` (or VERIFY_BASELINE=1): classify a suite
 *                      that failed twice against the pre-change baseline
 *                      (point 294). Flags are VALUE-LESS on purpose: a
 *                      `--flag <value>` pair would leave the value looking like
 *                      a suite filter and silently turn a LARGE run into a
 *                      single-suite, single-backend one.
 *   section          — `--section=<name>`: run ONE declared section of the named
 *                      suite (point 566). It carries a value, so it is written
 *                      ATTACHED for exactly the reason above; `--section` bare
 *                      parses as '' and the runner refuses it with the right
 *                      form rather than running the whole suite.
 */
export function parseArgs(argv) {
  const tier = argv.includes('small') ? 'small' : argv.includes('large') ? 'large' : null
  const flags = argv.filter((a) => a.startsWith('-'))
  const filter = argv.filter((a) => a !== 'small' && a !== 'large' && !a.startsWith('-'))
  const sectionFlag = flags.find((f) => f === '--section' || f.startsWith('--section='))
  return {
    tier,
    filter,
    flags,
    section: sectionFlag === undefined ? null : sectionFlag.slice('--section='.length),
    baseline: flags.includes('--baseline'),
    fullRun: tier !== null || filter.length === 0,
    isLargeEquivalent: tier === 'large' || (tier === null && filter.length === 0),
  }
}

/** The tier's set, or the explicit filter intersected with the known suites. */
function chosenSuites(tier, filter) {
  return filter.length ? DEV_SUITES.filter((s) => filter.includes(s)) : tier === 'small' ? SMALL_SUITES : DEV_SUITES
}

/**
 * The suites this invocation runs, in run order. `webglOnlyCovered` says a
 * companion WebGL 2 pass in the SAME command already ran the WebGL2-only suites
 * — true only for the WebGPU pass of a both-backends LARGE run, where running
 * them again would just repeat that pass. Everywhere else they stay in the set
 * and `laneFor` puts them on WebGL 2.
 */
export function suitesFor({ tier, filter = [], backend = DEFAULT_BACKEND, webglOnlyCovered = false }) {
  const drop = backend === 'webgpu' && webglOnlyCovered
  return chosenSuites(tier, filter).filter((s) => !(drop && WEBGL_ONLY_SUITES.includes(s)))
}

/** The suites this invocation drops (logged as an explicit SKIP, never a silent gap). */
export function skippedSuites({ tier, filter = [], backend = DEFAULT_BACKEND, webglOnlyCovered = false }) {
  const drop = backend === 'webgpu' && webglOnlyCovered
  return chosenSuites(tier, filter).filter((s) => drop && WEBGL_ONLY_SUITES.includes(s))
}

/**
 * Which backend pass(es) a command covers — the point-204(b) both-backends
 * wiring. A LARGE-equivalent run with NO pinned VERIFY_GL re-invokes itself
 * twice: the full LARGE on WebGL 2 (preflight + preview), then the render
 * suites on WebGPU (the backend-agnostic build/lint/unit preflight and the prod
 * preview were already proven, so they are skipped). A pinned VERIFY_GL, the
 * SMALL tier and a bare single-suite filter each stay a single-backend pass —
 * on the everyday lane, DEFAULT_BACKEND, unless VERIFY_GL says otherwise.
 *
 * `webglOnlyCovered` marks the pass whose companion already ran touch/voice, so
 * only that one drops them (see suitesFor).
 *
 * Returns [] when this process should just run itself on `selectBackend(verifyGl)`.
 */
export function planBackends({ isLargeEquivalent, verifyGl, ranBoth = false }) {
  if (!isLargeEquivalent || verifyGl !== undefined || ranBoth) return []
  return [
    { backend: 'webgl', skipPreflight: false, webglOnlyCovered: false },
    { backend: 'webgpu', skipPreflight: true, webglOnlyCovered: true },
  ]
}
