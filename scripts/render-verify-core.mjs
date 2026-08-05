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

/**
 * The WebGPU FEATURE LEVEL a run came up at (point 505) — 'core', 'compatibility', or
 * null when the question does not apply or cannot be answered.
 *
 * Why a third signal beside the backend: three.js always requests the `compatibility`
 * feature level and then decides by whether the device carries `core-features-and-limits`.
 * A core adapter runs the player's path; a COMPAT adapter runs three's compat branches
 * and loses MSAA, which the player never does. A lane on Dawn's OpenGLES backend reports
 * hardware-like adapter strings and draws a real picture at the compat level, so "WebGPU
 * plus a drawn pixel" no longer distinguishes the two — the same confusion class as a
 * software rasteriser reported as the GPU.
 *
 * `info` is what assertBackend reads off the running renderer:
 *   { isWebGPU, compatibilityMode, coreFeatures }
 * The device feature is authoritative; three's own `compatibilityMode` answers only where
 * the device could not be asked. Anything unreadable answers null, never 'core' — the
 * level is only ever claimed on evidence. Total: never throws on partial input.
 */
export function featureLevelOf(info) {
  if (!info || info.isWebGPU !== true) return null
  if (info.coreFeatures === true) return 'core'
  if (info.coreFeatures === false) return 'compatibility'
  return info.compatibilityMode === true ? 'compatibility' : null
}

/**
 * The scripts under scripts/verify/ that DRIVE NO BROWSER: the orchestrator,
 * the server plumbing, the pure decision cores and the Node-only checks. The
 * harness RUNS the suites, it does not draw, so a change here cannot move a
 * pixel and owes no picture — three such commits on 27.07.2026 each cost a real
 * suite run and a turn before this list existed (docs/picture-check-levers.md
 * §5).
 *
 * A DENYLIST, deliberately, not an allowlist: an unrecognised verify script
 * stays IN the render set, so a NEW browser suite is covered from its first
 * commit and only a new HELPER needs an entry here. render-verify-core.test.mjs
 * re-derives the membership from the directory (a file is in the render set iff
 * it imports playwright or the shared browser/boot helpers) and fails when this
 * list drifts from the files.
 */
export const NON_RENDER_VERIFY = new Set([
  '_server.mjs', // vite start/stop plumbing shared by the runner and the classifier
  'animalShare.mjs', // the animal-vs-water decision layer; enrichments.mjs feeds it pixels
  'backend-lane-core.mjs', // WHICH lanes exist and whether a renderer is software; the check drives the browser
  'baseline-classify-core.mjs',
  'baseline-classify.mjs',
  'docs.mjs',
  'fixedWaits.mjs',
  'footingSeries.mjs', // the slope-footing verdict; polish.mjs hands it the samples
  'frameSubject-core.mjs',
  'frameSubject.mjs', // the frame shutter's decision layer; the suites hand it their page
  'launch-args-core.mjs', // the launcher's PLATFORM policy; _browser.mjs opens the browser
  'liveness.mjs', // main-thread liveness ATTRIBUTION; the suites do the driving
  'machine-load-core.mjs',
  'machine-load.mjs',
  'run-all.mjs',
  'sceneReady-core.mjs', // the scene-readiness verdict; frameSubject.mjs polls the page for it
  'snowMetric.mjs', // the snow-vs-sand pixel verdict; enrichments.mjs feeds it a crop
  'system-chrome.mjs', // WHERE the lane's browser is on this host; _browser.mjs opens it
  'textureLeak.mjs', // the texture-delta decision layer; settings.mjs runs it
  'tiers.mjs',
  'ttsCache.mjs',
])

/**
 * Is this repo path part of the RENDER SET — code whose change can alter the
 * rendered picture on either backend? Covers the scene/render/HUD trees, the
 * renderer entry, TSL shader files, the WORLD-GEOMETRY sources that feed the
 * rendered terrain, and the browser verify suites' own screenshot/measurement
 * code (a suite change can mask a backend bug just as a shader change can cause
 * one). Paths are git-style; backslashes are tolerated.
 */
export function isRenderPath(path) {
  if (typeof path !== 'string' || path === '') return false
  const p = path.replace(/\\/g, '/')
  // A Vitest file is never a render path, wherever it lives: it runs in jsdom,
  // opens no browser and cannot move a pixel. The rule was first written for
  // the files beside the browser suites (below); the guard then demanded a
  // picture for a jsdom test added under src/ui/, which is the same pointless
  // errand one folder over — and an errand-sending guard is one you learn to
  // wave through.
  if (/\.test\.(ts|tsx|mjs|js)$/.test(p)) return false
  if (p.startsWith('src/render/') || p.startsWith('src/scenes/') || p.startsWith('src/ui/')) return true
  // World geometry IS the picture's first draft: the coast contour, the terrain
  // heightfield, the river courses and the landmark coordinates all reach the
  // frame through the renderer without ever mentioning it. The founding case of
  // the whole both-backend rule — the point-210 stepped coast, still stepped on
  // WebGPU after a WebGL2-only "done" — changed src/world/redSea.ts and nothing
  // else, and the guard as first written would not have demanded a picture for
  // it. Measured before widening (docs/picture-check-levers.md §5): the class
  // adds 18 of 1220 first-parent commits, of which 14 the corpus-derived
  // exception list would have missed — every one a visible-geometry change
  // (bicubic DEM sampling, the smoothed coast, levelled lake beds, the moved
  // Meroë field). No exception for the text-only module here: the whole
  // directory is one sentence, and lore.ts has never been touched alone.
  if (p.startsWith('src/world/')) return true
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
 * under src/scenes/ and the world-geometry sources under src/world/. That is not
 * caution for its own sake — the flora jitter of point 175 (a per-instance
 * attribute racing its re-upload) and the texture-count dip of point 334 both
 * appeared on ONE backend from code that looks backend-neutral, and src/world/
 * carries the strongest witness of all: point 210's coast was cut in redSea.ts,
 * looked right on WebGL 2, and was still stepped on WebGPU. A file needs no
 * renderer API in it to render differently on the two backends. A cleverer rule
 * would have missed every one of them.
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

/**
 * `featureLevel` narrows the query to runs recorded AT that level (point 505): asked for
 * 'core', a compat run — and a record from before the level was written at all — counts
 * for nothing, because an unrecorded level is not evidence of the player's path. Omitted,
 * the query is level-agnostic and the answer is exactly what it always was; the guard
 * itself asks that way, so a compat lane still proves the WebGPU picture rather than
 * blocking every render change on a host that has no core adapter.
 */
export function coveringRun(runs, backend, since, { featureLevel = null } = {}) {
  if (!Array.isArray(runs)) return null
  let best = null
  for (const r of runs) {
    if (!r || r.backend !== backend) continue
    if (Number(r.exit) !== 0) continue
    if (featureLevel && r.featureLevel !== featureLevel) continue
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

/**
 * A concrete suite name for the block message.
 *
 * The old rule was "whatever ran last, else `enrichments`", which ignored the
 * change entirely and ratcheted: one `enrichments` run made the project's most
 * expensive suite (37 frames, 60,687 reviewing tokens, 951 s) the standing
 * suggestion for every later, unrelated change. Point 361 measured that price
 * and replayed the cheaper candidates against the historical picture-caught
 * bugs; a GENERAL path→suite map was rejected there — the flora jitter and the
 * invisible season both turn on src/scenes/travel/TravelScene.tsx, whose frames
 * live in `world` AND `enrichments` AND `polish`, so a map that routes it
 * correctly routes it everywhere and saves nothing (docs/picture-check-levers.md
 * §3.4).
 *
 * The one narrowing that survived the replay is the DOM-only class. When EVERY
 * changed render path is under src/ui/, the change is HTML — the class this
 * file already trusts enough to drop the second backend (isBackendSensitivePath)
 * and that src/ui/domOnly.test.ts keeps free of three.js. `flow` covers the HUD
 * and the end-to-end flow in 8 frames: 10,672 tokens and 140 s, i.e. 5.7× the
 * tokens and 6.8× the wall clock off that class. No corpus row contradicts it —
 * none of the eight is a src/ui/-only change.
 *
 * Anything else keeps the old behaviour exactly.
 */
export function suggestSuite(runs, changedRenderPaths) {
  if (
    Array.isArray(changedRenderPaths) &&
    changedRenderPaths.length > 0 &&
    changedRenderPaths.every((p) => isRenderPath(p) && !isBackendSensitivePath(p))
  ) {
    return 'flow'
  }
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
  const suite = suggestSuite(runs, changedRenderPaths)
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
