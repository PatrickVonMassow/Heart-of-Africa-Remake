// Pure decision logic of the render-verify Stop-hook guard
// (render-verify-guard.mjs is the thin I/O wrapper). Kept side-effect-free so
// the Vitest layer can sweep every rule without git/fs
// (scripts/render-verify-core.test.mjs).
//
// The guard exists because on 22.07.2026 the point-210 sea-coast fix was called
// "done" after a WebGL2-only headless check while the user's real backend
// (WebGPU) still showed the stepped coast — the fix never touched the water
// shader's path. Standing rule (user, enforced not reminded): every
// GUI/rendering/shader change must be verified on BOTH renderer backends
// (`VERIFY_GL=webgpu` AND `VERIFY_GL=webgl`), judged by the rendered picture,
// before it is committed/ticked/called done. This core decides, from committed
// render-path changes and the mechanically recorded verify runs, whether the
// turn may end. Fail-open is the WRAPPER's job; this core only decides on the
// inputs it is handed and must never throw on partial ones.

/** Both renderer backends the game ships; each needs a passing verify run. */
export const BACKENDS = ['webgpu', 'webgl']

// Verify suites that are NOT rendering code (pure-node runner/checks): a change
// there does not require a dual-backend picture.
const NON_RENDER_VERIFY = new Set(['run-all.mjs', 'docs.mjs', 'ttsCache.mjs', 'fixedWaits.mjs'])

/**
 * Is this repo path part of the RENDER SET — code whose change can alter the
 * rendered picture on either backend? Covers the scene/render/HUD trees, the
 * renderer entry, TSL shader files, and the browser verify suites' own
 * screenshot/measurement code (a suite change can mask a backend bug just as a
 * shader change can cause one). Paths are git-style; backslashes are tolerated.
 */
export function isRenderPath(path) {
  if (typeof path !== 'string' || path === '') return false
  const p = path.replace(/\\/g, '/')
  if (p.startsWith('src/render/') || p.startsWith('src/scenes/') || p.startsWith('src/ui/')) return true
  if (p === 'src/App.tsx') return true // renderer setup / scene switch
  if (p.includes('.tsl.')) return true // TSL shader modules wherever they live
  // A *.test.mjs beside the suites is a VITEST file: it runs in jsdom, never
  // opens a browser and cannot touch a picture. Classifying it as a render path
  // demanded a two-backend browser run for editing a pure text scanner — and a
  // guard that sends you on pointless errands is one you learn to wave through.
  if (/^scripts\/verify\/.+\.test\.mjs$/.test(p)) return false
  const suite = p.match(/^scripts\/verify\/([^/]+\.mjs)$/)
  if (suite && !NON_RENDER_VERIFY.has(suite[1])) return true
  return false
}

/**
 * The most recent PASSING run of `backend` recorded at/after `since` (the last
 * render-file edit) — or null. Only exit-0 runs count: a crashed/failed suite
 * proves nothing about the picture.
 */
/**
 * Can a change to this path render DIFFERENTLY on the two backends? Only such a
 * change needs the expensive dual-backend picture, and picture inspection is the
 * costliest thing this project does (user 26.07.2026).
 *
 * The exemption is deliberately NARROW: everything in the render set stays
 * dual-backend except the DOM. The HUD, the dialogs, the map and journal
 * overlays under src/ui/ are HTML — the browser draws them identically whichever
 * renderer holds the canvas, so a second run inspects the same pixels twice. A
 * change there still owes ONE passing run: it can break the picture, just not
 * per backend.
 *
 * Everything else stays dual, including the pure geometry/behaviour modules
 * under src/scenes/. That is not caution for its own sake — the flora jitter of
 * point 175 (a per-instance attribute racing its re-upload) and the texture-count
 * dip of point 334 both appeared on ONE backend from code that looks
 * backend-neutral. A cleverer rule would have missed them.
 */
export function isBackendSensitivePath(path) {
  if (!isRenderPath(path)) return false
  return !String(path).replace(/\\/g, '/').startsWith('src/ui/')
}

// The exemption's premise — that src/ui/ holds no 3-D code — is not asserted
// here but pinned by src/ui/domOnly.test.ts, which fails the moment a file
// there imports three.js. A path rule alone would have aged silently.
//
// KNOWN LIMIT (four-eyes review, 26.07.2026): a few HUD elements render
// backend-CONDITIONAL text — the WebGL2 fallback notice, the debug backend row,
// the benchmark's headline series. Their pixels do not differ per backend, but
// their CONTENT does, and a single run may satisfy this gate on the backend
// whose branch the change does not exercise. When a diff touches such a branch,
// run the backend it describes; the guard cannot tell branches apart.

export function coveringRun(runs, backend, since) {
  if (!Array.isArray(runs)) return null
  let best = null
  for (const r of runs) {
    if (!r || r.backend !== backend) continue
    if (Number(r.exit) !== 0) continue
    const at = Number(r.at ?? 0)
    if (at < since) continue
    if (!best || at > Number(best.at ?? 0)) best = r
  }
  return best
}

/**
 * The verified baseline sha for `branch` (feature-branch workflow): the
 * per-branch `clearedHeads[branch]` entry when one exists, else the legacy
 * scalar `clearedHead` — which may sit on ANOTHER branch after a `git switch`;
 * the wrapper diffs from `git merge-base(baseline, HEAD)` so a cross-branch
 * scalar can never produce a reversed diff that re-arms the gate on a mere
 * branch switch. Null when the state holds no baseline at all (the wrapper
 * then bootstraps at the current HEAD). Total: never throws.
 */
export function baselineFor(state, branch) {
  try {
    const map = state && state.clearedHeads
    if (map && typeof map === 'object' && branch && typeof map[branch] === 'string' && map[branch]) {
      return map[branch]
    }
    const legacy = state && state.clearedHead
    return typeof legacy === 'string' && legacy ? legacy : null
  } catch {
    return null
  }
}

/** A concrete suite name for the block message: the most recently run one. */
export function suggestSuite(runs) {
  if (Array.isArray(runs)) {
    for (let i = runs.length - 1; i >= 0; i--) {
      const s = runs[i] && runs[i].suite
      if (typeof s === 'string' && s !== '' && s !== 'unknown') return s
    }
  }
  return 'enrichments'
}

const ALLOW = { decision: 'allow' }

/**
 * Decide whether the turn may end. Inputs (all optional — missing data errs
 * fail-open, matching the wrapper's contract):
 *   head               current git HEAD
 *   clearedHead        HEAD of the last dual-backend-verified (or deferred) state
 *   changedRenderPaths render-set paths in the clearedHead..HEAD diff
 *   latestChangeAt     max mtime (ms) of those files — a run older than the last
 *                      edit cannot have seen the final code
 *   runs               recorded verify runs (render-verify-recorder.mjs)
 *   deferral           { head, reason, at } — the loud escape valve, current HEAD only
 *
 * Returns { decision:'allow', clear?, deferred? } or { decision:'block', reason }.
 * `clear` tells the wrapper to advance the verified baseline to `head`.
 */
export function evaluate(input) {
  const {
    head = '',
    clearedHead = '',
    changedRenderPaths = [],
    latestChangeAt = 0,
    runs = [],
    deferral = null,
  } = input ?? {}

  // Garbage where the path list should be: fail open, but do NOT advance the
  // baseline (the next healthy evaluation still sees the full window).
  if (!Array.isArray(changedRenderPaths)) return ALLOW

  // No render change since the verified baseline: nothing to enforce. Advance
  // the baseline when HEAD moved so diff windows stay short.
  if (changedRenderPaths.length === 0) {
    return { decision: 'allow', clear: !!head && head !== clearedHead }
  }

  // The loud escape valve: an explicit deferral covers the CURRENT head only —
  // any further commit reopens the gate.
  if (deferral && head && deferral.head === head) {
    return { decision: 'allow', clear: true, deferred: true }
  }

  const since = Number.isFinite(latestChangeAt) ? latestChangeAt : 0
  // Two backends only where the two backends can DIFFER; otherwise one passing
  // run is the whole proof, and the second is a picture inspection bought for
  // nothing (user 26.07.2026).
  const dual = changedRenderPaths.some(isBackendSensitivePath)
  const missing = dual
    ? BACKENDS.filter((b) => !coveringRun(runs, b, since))
    : BACKENDS.some((b) => coveringRun(runs, b, since))
      ? []
      : [BACKENDS[0]]
  if (missing.length === 0) return { decision: 'allow', clear: true }

  const shown =
    changedRenderPaths.slice(0, 6).join(', ') + (changedRenderPaths.length > 6 ? ', …' : '')
  const suite = suggestSuite(runs)
  const cmds = missing
    .map((b) => `VERIFY_GL=${b} node scripts/verify/run-all.mjs ${suite}`)
    .join('  AND  ')
  const label = missing.length === 2 ? 'EITHER BACKEND' : missing[0].toUpperCase()
  return {
    decision: 'block',
    reason:
      `RENDER CHANGE NOT VERIFIED ON ${label}: commits since ${String(clearedHead).slice(0, 7)} ` +
      `touch render path(s) [${shown}], but no PASSING verify-suite run on ` +
      missing.join(' or ') +
      ' is recorded since the last render-file edit. Standing rule (enforced — the point-210 ' +
      'coast fix read "done" on WebGL2 while the WebGPU picture was still stepped): every ' +
      'GUI/rendering/shader fix is judged by the rendered PICTURE before it counts as done — ' +
      (dual
        ? 'and on BOTH backends, because this change can render differently on each. '
        : 'here ONE backend suffices: the change is DOM-only, and the browser draws the HUD ' +
          'identically whichever renderer holds the canvas. ') +
      `Run: ${cmds} (pick the suite whose screenshots show the changed view — ` +
      'passing runs are recorded automatically by the suite itself), then INSPECT the frames of ' +
      'both backends. ONLY if one backend genuinely cannot be judged headless (e.g. a washed-out ' +
      'WebGPU frame — that is a FINDING, not a pass), record a loud deferral: ' +
      'node scripts/render-verify-guard.mjs --defer "<reason>".',
  }
}
