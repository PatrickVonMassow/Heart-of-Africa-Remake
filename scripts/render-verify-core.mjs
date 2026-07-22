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
const NON_RENDER_VERIFY = new Set(['run-all.mjs', 'docs.mjs', 'ttsCache.mjs'])

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
  const suite = p.match(/^scripts\/verify\/([^/]+\.mjs)$/)
  if (suite && !NON_RENDER_VERIFY.has(suite[1])) return true
  return false
}

/**
 * The most recent PASSING run of `backend` recorded at/after `since` (the last
 * render-file edit) — or null. Only exit-0 runs count: a crashed/failed suite
 * proves nothing about the picture.
 */
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
  const missing = BACKENDS.filter((b) => !coveringRun(runs, b, since))
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
      'GUI/rendering/shader fix is judged by the rendered PICTURE on BOTH backends before it ' +
      `counts as done. Run: ${cmds} (pick the suite whose screenshots show the changed view — ` +
      'passing runs are recorded automatically by the suite itself), then INSPECT the frames of ' +
      'both backends. ONLY if one backend genuinely cannot be judged headless (e.g. a washed-out ' +
      'WebGPU frame — that is a FINDING, not a pass), record a loud deferral: ' +
      'node scripts/render-verify-guard.mjs --defer "<reason>".',
  }
}
