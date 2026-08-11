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
//
// A run covers a backend when it is CLEAN (exit 0) or ACCOUNTED FOR (point 550):
// every failing check and console error in it charged to an OPEN work-order
// point. The two are never conflated — see runVerdict.

import { RED_CHARGES } from './render-verify-charges.mjs'

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
  'eavesColumn.mjs', // the head-clearance verdict over a recorded window; polish.mjs records it
  'fixedWaits.mjs',
  'footingSeries.mjs', // the slope-footing verdict; polish.mjs hands it the samples
  'frameSubject-core.mjs',
  'frameSubject.mjs', // the frame shutter's decision layer; the suites hand it their page
  'launch-args-core.mjs', // the launcher's PLATFORM policy; _browser.mjs opens the browser
  'liveness.mjs', // main-thread liveness ATTRIBUTION; the suites do the driving
  'machine-load-core.mjs',
  'machine-load.mjs',
  'run-all.mjs',
  'run-digest-core.mjs', // which of a run's OUTPUT lines the caller reads; it draws nothing
  'run-logged.mjs', // the logging wrapper around run-all; it spawns the runner, it does not render
  'run-record.mjs', // the run's own bookkeeping file (point 592); it counts frames, it draws none
  'run-wait-core.mjs', // the poll budget and the receipt's shape; pure arithmetic over a run
  'run-wait.mjs', // AWAITS a run instead of polling it; it opens no page
  'sceneReady-core.mjs', // the scene-readiness verdict; frameSubject.mjs polls the page for it
  'sectionScope.mjs', // a TEXT audit of the suites' section blocks; it opens no page
  'sections.mjs', // WHICH block of a suite a --section run selects; the suite does the driving
  'snowMetric.mjs', // the snow-vs-sand pixel verdict; enrichments.mjs feeds it a crop
  'spawnAssertion.mjs', // a TEXT audit of the test files' spawn assertions; it opens no page
  'stanceSlip.mjs', // the planted-foot verdict over a sample series; polish.mjs records the samples
  'system-chrome.mjs', // WHERE the lane's browser is on this host; _browser.mjs opens it
  'tagFrameReading.mjs', // the tag frame's readability verdict; polish.mjs takes the reading
  'textureLeak.mjs', // the texture-delta decision layer; settings.mjs runs it
  'tiers.mjs',
  'ttsCache.mjs',
  'verify-seed.mjs', // builds the seeded URL a suite opens; it never opens one itself
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
 * WHICH WORK-ORDER POINTS MAY CARRY A CHARGE (point 550). Parsed from the whole
 * work order — TASKS.md plus docs/tasks-archive.md, handed in as one text — into
 * `{ number → 'open' | 'deferred' | 'done' }`.
 *
 * Only an OPEN point is chargeable. A ticked one is not: a red that outlives the
 * point that owned it is a red nobody is working on, which is precisely the
 * blanket exception this mechanism must not become. A DEFERRED point is not
 * chargeable either — deferred means nobody is working on it, so charging to it
 * would park a red indefinitely.
 *
 * `done` WINS over any other reading of the same number, whichever file it came
 * from: the split is guarded elsewhere, and if it ever breaks, the conservative
 * answer (this point is finished, its exceptions have expired) is the safe one.
 * Total: never throws on partial input.
 */
export function pointStatusesFrom(text) {
  const statuses = new Map()
  for (const line of String(text ?? '').split('\n')) {
    const m = /^- \[([ x*~])\] (\d+)\./.exec(line)
    if (!m) continue
    const point = Number(m[2])
    const status = m[1] === 'x' ? 'done' : /\bDEFERRED\b/.test(line) ? 'deferred' : 'open'
    if (statuses.get(point) === 'done') continue
    statuses.set(point, status)
  }
  return statuses
}

/** The chargeable (open, non-deferred) point numbers of a work-order text. */
export function chargeablePoints(text) {
  const out = []
  for (const [point, status] of pointStatusesFrom(text)) if (status === 'open') out.push(point)
  return out
}

/**
 * The ledger entry that owns this red, or null. `red` is one entry of the run
 * record's `reds` — `{ name, kind }` as the recorder wrote it — and `suite` /
 * `backend` are the run's own, so a charge scoped to one lane cannot excuse the
 * other. Total: a malformed entry matches nothing rather than throwing.
 */
export function chargeFor(red, { suite = '', backend = '', ledger = RED_CHARGES } = {}) {
  const name = String(red?.name ?? '')
  if (!name) return null
  for (const charge of Array.isArray(ledger) ? ledger : []) {
    try {
      if (!charge || !Number.isInteger(charge.point)) continue
      if (charge.suite && charge.suite !== suite) continue
      if (charge.backend && charge.backend !== backend) continue
      if (charge.kind && red?.kind && charge.kind !== red.kind) continue
      if (!charge.match?.test?.(name)) continue
      return charge
    } catch {
      /* a broken ledger entry charges nothing — the red stays unaccounted */
    }
  }
  return null
}

/** Every red of a run, each with the point it is charged to (null: nothing owns
 *  it). Written into the run record at record time, so the record itself names
 *  what was charged and a later ledger edit cannot bless a run after the fact. */
export function chargeReds(reds, { suite = '', backend = '', ledger = RED_CHARGES } = {}) {
  return (Array.isArray(reds) ? reds : []).map((red) => {
    const charge = chargeFor(red, { suite, backend, ledger })
    return {
      name: String(red?.name ?? '').slice(0, 200),
      key: red?.key ?? '',
      kind: red?.kind === 'console' ? 'console' : 'check',
      point: charge ? charge.point : null,
    }
  })
}

/**
 * THE ENV VAR THAT MARKS A RETRY (point 640). run-all.mjs sets it on the RETRY
 * child only, carrying what the FIRST attempt failed on; the recorder stamps the
 * record SUSPECT from it. Same principle as the section flag: the runner knows a
 * run is a retry, the suite cannot, and a suite must not be able to forget it.
 */
export const RETRY_ENV = 'VERIFY_RETRY_AFTER'

/** What run-all puts in that variable: the first attempt's failing check names,
 *  newline-separated. A retry that has no names to give (a crash, a wall-timeout
 *  kill) still says SOMETHING — the run is a retry either way, and an empty value
 *  would read as "not a retry". Bounded, because it travels in an environment. */
export const SUSPECT_UNNAMED = 'the first attempt failed without naming a check'
const MAX_SUSPECT_NAMES = 8
const MAX_SUSPECT_NAME_LEN = 200

/** A value as text, or '' — `String(x)` itself throws on an object whose
 *  toString does, and these two must be total on whatever a suite printed. */
function text(value) {
  try {
    return String(value ?? '')
  } catch {
    return ''
  }
}

/** Format the names for the env var. Total: never throws. */
export function formatSuspectEnv(names) {
  const list = (Array.isArray(names) ? names : [])
    .map((n) => (text(n?.name) || text(n)).trim())
    .filter(Boolean)
    .slice(0, MAX_SUSPECT_NAMES)
    .map((n) => n.slice(0, MAX_SUSPECT_NAME_LEN))
  return (list.length ? list : [SUSPECT_UNNAMED]).join('\n')
}

/** Read it back. `[]` means "this run is not a retry" — an unset or blank value
 *  must never mark an ordinary run suspect (a stale export would else condemn
 *  every run in the shell). Total: never throws. */
export function parseSuspectEnv(value) {
  return text(value)
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, MAX_SUSPECT_NAMES)
}

/**
 * WHAT ONE RECORDED RUN IS WORTH (point 550). Five verdicts, and the difference
 * between the first two must stay visible everywhere it is reported:
 *
 *   clean     — exit 0. The picture was judged and nothing was red.
 *   accounted — the run failed, but EVERY red in it (failing check and console
 *               error alike) is charged to an OPEN work-order point named in the
 *               record. It proves the picture on that backend as far as this
 *               change is concerned, and it is never called a pass.
 *   red       — anything else: a red charged to nothing, a red charged to a point
 *               that is finished or deferred, a failure the run never reported
 *               (a crash prints no FAIL line), or a run that ended in a crash.
 *   partial   — a `--section` run (point 566): one named block of the suite ran,
 *               so the record says nothing about the rest. Judged FIRST, before
 *               the exit code, because its exit code is exactly what must not
 *               clear the gate.
 *   suspect   — it PASSED ON THE RETRY (point 640): the first attempt of the same
 *               suite failed, and nothing about the second run explains why. "It
 *               worked the next time" is consistent with a fixed defect, a rare
 *               one, a timing race and an idle machine — it distinguishes none of
 *               them, so it proves nothing and covers nothing. Judged before the
 *               exit code for the same reason as partial: the exit 0 is exactly
 *               what must not clear the gate. The way OUT is a cause: fix it, or
 *               charge the red to the open point that owns it, or file it as one.
 *
 * A retry that failed AGAIN is not judged here — its own reds are, below: two
 * failures are evidence, and a red every one of whose checks a known open point
 * owns stays ACCOUNTED FOR whether it was a retry or not.
 *
 * `openPoints` is the chargeable set (chargeablePoints); omitted, NOTHING is
 * chargeable and only a clean run covers — the strict default, so a caller that
 * has not read the work order can never widen the gate by accident.
 */
export function runVerdict(run, { openPoints = null } = {}) {
  if (!run || typeof run !== 'object') {
    return { status: 'red', covers: false, charges: [], unaccounted: [] }
  }
  // A `--section` run (point 566) exercised ONE named block of the suite. It is
  // the repair loop's instrument, not evidence about the picture the rest of the
  // suite draws — so it never covers a backend, however clean it exited.
  if (run.partial === true) {
    const which = typeof run.section === 'string' && run.section ? `"${run.section}"` : 'one section'
    return {
      status: 'partial',
      covers: false,
      charges: [],
      unaccounted: [{ name: `the run covered only section ${which} of the suite (--section)`, point: null }],
    }
  }
  if (run.suspect === true && Number(run.exit) === 0) {
    const names = parseSuspectEnv((Array.isArray(run.suspectOf) ? run.suspectOf : []).join('\n'))
    const which = names.length ? names.map((n) => `"${n}"`).join('; ') : SUSPECT_UNNAMED
    return {
      status: 'suspect',
      covers: false,
      charges: [],
      unaccounted: [
        {
          name: `it passed only on the RETRY — the first attempt failed on ${which}, and nothing here says why`,
          point: null,
        },
      ],
    }
  }
  if (Number(run.exit) === 0) return { status: 'clean', covers: true, charges: [], unaccounted: [] }
  if (run.crashed === true) {
    return {
      status: 'red',
      covers: false,
      charges: [],
      unaccounted: [{ name: 'the run ended in a crash, not in its own report', point: null }],
    }
  }
  const reds = Array.isArray(run.reds) ? run.reds : []
  if (reds.length === 0) {
    return {
      status: 'red',
      covers: false,
      charges: [],
      unaccounted: [{ name: 'the run failed without reporting a single red', point: null }],
    }
  }
  const open = new Set(Array.isArray(openPoints) ? openPoints : openPoints ? [...openPoints] : [])
  const charges = []
  const unaccounted = []
  for (const red of reds) {
    const name = String(red?.name ?? '(unnamed red)')
    const point = Number.isInteger(red?.point) ? red.point : null
    if (point === null) unaccounted.push({ name, point: null })
    else if (!open.has(point)) unaccounted.push({ name, point })
    else charges.push({ name, point })
  }
  if (unaccounted.length > 0) return { status: 'red', covers: false, charges, unaccounted }
  return { status: 'accounted', covers: true, charges, unaccounted: [] }
}

/**
 * The most recent COVERING run of `backend` recorded at/after `since` (the last
 * render-file edit) — or null. Covering means clean (exit 0) or, with
 * `openPoints` handed in, ACCOUNTED FOR: every red charged to an open point
 * (runVerdict). A crashed/unexplained failure proves nothing about the picture.
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
export function coveringRun(runs, backend, since, { featureLevel = null, openPoints = null } = {}) {
  if (!Array.isArray(runs)) return null
  let best = null
  for (const r of runs) {
    if (!r || r.backend !== backend) continue
    if (!runVerdict(r, { openPoints }).covers) continue
    if (featureLevel && r.featureLevel !== featureLevel) continue
    const at = Number(r.at ?? 0)
    if (at < since) continue
    if (!best || at > Number(best.at ?? 0)) best = r
  }
  return best
}

/**
 * EVERY RUN IN THE WINDOW THAT FAILED AND WAS NEVER EXPLAINED (point 640) — an
 * unaccounted red, or a pass that only came on the retry.
 *
 * This is what stops the fourth closing. Refusing the retry's own record was
 * only half of it: the gate reads the most recent COVERING run, so running the
 * same code again until it comes up green cleared it just as well — which is
 * the very argument the point forbids. A red therefore stays in force until
 * something explains it: a fix (which edits a render file and moves the window
 * past the red), a CHARGE to the open point that owns it, a point of its own, or
 * the loud deferral valve.
 *
 * PARTIAL (`--section`) runs are excluded in BOTH directions: they are not
 * evidence about the picture, so they neither cover a backend nor condemn one.
 * That is also what lets the throttle probe reproduce a red eight times over
 * without blocking anybody's turn.
 *
 * Total: never throws on partial input.
 */
export function unexplainedRuns(runs, since, { openPoints = null } = {}) {
  const from = Number.isFinite(since) ? since : 0
  const out = []
  for (const r of Array.isArray(runs) ? runs : []) {
    if (!r || typeof r !== 'object') continue
    const at = Number(r.at ?? 0)
    if (!Number.isFinite(at) || at < from) continue
    const verdict = runVerdict(r, { openPoints })
    if (verdict.status !== 'red' && verdict.status !== 'suspect') continue
    out.push({
      backend: typeof r.backend === 'string' ? r.backend : 'unknown',
      suite: typeof r.suite === 'string' && r.suite ? r.suite : 'unknown',
      at,
      status: verdict.status,
      unaccounted: verdict.unaccounted,
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The most recent run of `backend` since `since`, covering or not — what the
 *  block message reads to say WHY the last attempt did not count. */
export function latestRun(runs, backend, since) {
  if (!Array.isArray(runs)) return null
  let best = null
  for (const r of runs) {
    if (!r || r.backend !== backend) continue
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
 *   openPoints         the chargeable work-order points (chargeablePoints); without
 *                      them only a clean exit-0 run covers (point 550)
 *
 * Returns { decision:'allow', clear?, deferred?, accounted? } or
 * { decision:'block', reason }. `clear` tells the wrapper to advance the verified
 * baseline to `head`; `accounted` lists the runs that covered a backend on
 * ACCOUNTED-FOR reds rather than on a clean pass, so the wrapper can record and
 * report the difference.
 */
export function evaluate(input) {
  const {
    head = '',
    clearedHead = '',
    changedRenderPaths = [],
    latestChangeAt = 0,
    runs = [],
    deferral = null,
    openPoints = null,
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
  const opts = { openPoints }
  // Two backends only where the two backends can DIFFER; otherwise one passing
  // run is the whole proof, and the second is a picture inspection bought for
  // nothing (user 26.07.2026).
  const dual = changedRenderPaths.some(isBackendSensitivePath)

  // A RED IS NOT CLOSED BY THE RUNS THAT FOLLOWED IT (point 640). Refusing the
  // retry's own record was only half the job: the gate reads the most recent
  // COVERING run, so re-running the same code until it came up green cleared it
  // just as well — "it passed three times since" wearing a mechanism's clothes.
  // So an unexplained failure in the window holds the gate whatever came after,
  // and the way out is a CAUSE: fix it (which moves the window past the red),
  // charge it to the open point that owns it, file it as a point, or record the
  // loud deferral.
  const unexplained = unexplainedRuns(runs, since, opts)

  const covering = new Map(BACKENDS.map((b) => [b, coveringRun(runs, b, since, opts)]))
  const missing = dual
    ? BACKENDS.filter((b) => !covering.get(b))
    : BACKENDS.some((b) => covering.get(b))
      ? []
      : [BACKENDS[0]]

  // Coverage exists, but something in the window failed and was never explained.
  // (Where a backend is missing too, the message below says so with the same
  // three ways out — this one is for the case the old gate waved through.)
  if (missing.length === 0 && unexplained.length > 0) {
    const named = unexplained
      .slice(0, 3)
      .map((u) => {
        const what = u.status === 'suspect' ? 'passed only on the RETRY' : `${u.unaccounted.length} unaccounted red(s)`
        const first = u.unaccounted[0]?.name
        return `${u.backend}/${u.suite}: ${what}${first ? ` — "${first}"` : ''}`
      })
      .join(' | ')
    return {
      decision: 'block',
      reason:
        `UNEXPLAINED RED SINCE THE LAST RENDER EDIT: ${unexplained.length} recorded run(s) failed and nothing ` +
        `says why — ${named}${unexplained.length > 3 ? ', …' : ''}. A LATER GREEN DOES NOT CLOSE IT (point 640): ` +
        'three greens are consistent with a fixed defect, a rare one, a timing race and an idle machine alike. ' +
        'A red closes in exactly THREE ways: (1) its CAUSE is named and FIXED — the fix edits the code, which ' +
        'moves this window past the red; (2) it is CHARGED in scripts/render-verify-charges.mjs to the OPEN ' +
        'point that owns it; (3) it becomes an OPEN point of its own. Is it load? MEASURE it: ' +
        `node scripts/throttle-probe.mjs ${unexplained[0].suite} --section=<name> --runs 8. If the cause lies ` +
        'outside the render set (a fixed helper, a dead dev server), say so loudly instead: ' +
        'node scripts/render-verify-guard.mjs --defer "<reason>".',
    }
  }

  if (missing.length === 0) {
    // An ACCOUNTED-FOR run is never reported as a clean pass: name every red it
    // carried and the point it was charged to, so the record keeps the difference.
    const accounted = []
    for (const b of BACKENDS) {
      const run = covering.get(b)
      if (!run) continue
      const verdict = runVerdict(run, opts)
      if (verdict.status !== 'accounted') continue
      accounted.push({ backend: b, suite: run.suite ?? 'unknown', at: run.at ?? 0, charges: verdict.charges })
    }
    return accounted.length > 0
      ? { decision: 'allow', clear: true, accounted }
      : { decision: 'allow', clear: true }
  }

  // WHY the last attempt on a missing backend did not count — the actionable
  // half of the block message: an unaccounted red is either a real finding, or a
  // known one whose point is missing from the charge ledger.
  const whyNot = []
  for (const b of missing) {
    const run = latestRun(runs, b, since)
    if (!run) continue
    const verdict = runVerdict(run, opts)
    if (verdict.unaccounted.length === 0) continue
    const named = verdict.unaccounted
      .slice(0, 3)
      .map((u) => (u.point === null ? `"${u.name}" (charged to nothing)` : `"${u.name}" (point ${u.point} is not open)`))
      .join('; ')
    whyNot.push(
      `${b}: the last run (${run.suite ?? 'unknown'}) failed with ${verdict.unaccounted.length} ` +
        `UNACCOUNTED red(s) — ${named}${verdict.unaccounted.length > 3 ? ', …' : ''}`,
    )
  }

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
      `touch render path(s) [${shown}], but no COVERING verify-suite run — clean, or red with ` +
      'EVERY red charged to an open work-order point — on ' +
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
      'both backends. ' +
      (whyNot.length
        ? `WHY THE LAST ATTEMPT DID NOT COUNT — ${whyNot.join(' | ')}. A RED CLOSES IN EXACTLY ` +
          'THREE WAYS (point 640): (1) its CAUSE is named and fixed; (2) it is CHARGED in ' +
          'scripts/render-verify-charges.mjs to the OPEN point that owns it, and the run then ' +
          'counts as ACCOUNTED FOR (never as a pass); (3) it becomes an OPEN point of its own. ' +
          'Running it again until it passes is none of them. To ask whether it is load rather ' +
          'than argue it: node scripts/throttle-probe.mjs <suite> --section=<name> --runs 8. '
        : '') +
      'ONLY if one backend genuinely cannot be judged headless (e.g. a washed-out ' +
      'WebGPU frame — that is a FINDING, not a pass), record a loud deferral: ' +
      'node scripts/render-verify-guard.mjs --defer "<reason>".',
  }
}
