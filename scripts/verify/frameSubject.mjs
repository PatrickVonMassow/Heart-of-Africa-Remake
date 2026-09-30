// THE FRAME SHUTTER (point 375): a verification frame is written only after its
// subject has been proven to be IN the rendered picture.
//
// Why the check sits here and not in an assertion afterwards: a suite's asserts
// never look at the frame, and the frames are not comparable between runs
// (point 361), so nothing downstream can notice a picture that missed its
// subject. The shutter is the last moment at which the live camera can still be
// asked — and asked the way CLAUDE.md §7.2 demands: by PROJECTING the subject
// through the camera (`__camera.onScreen`/`ndc` in the bird's-eye view, the
// place camera's own matrices inside a settlement), never against an assumed
// radius.
//
// It also gives the picture a bounded chance to arrive before judging: the wait
// is on the CONDITION (subject projected inside the frame, camera settled), not
// on the wall clock — the same rule `fixedWaits.mjs` enforces. A frame that
// never gets its subject in view is refused, named and NOT written.
//
// And it waits for the picture to be DRAWN before it opens (point 489): a
// subject projects into an empty grey frame exactly as well as into a finished
// one, so proving the aim is not enough. The scene counts as drawn when the
// renderer's own per-frame counters stand still (`sceneReady-core.mjs`); a frame
// that never gets there is refused just as loudly as a mis-aimed one. A HUD
// `element` frame skips the wait and a frame taken deliberately in motion
// (`settle: false`) waits only for a picture to be there — see `sceneReadyMode`.
//
// Usage in a suite:
//   import { frameShutter } from './frameSubject.mjs'
//   const shot = frameShutter(page, OUT)
//   await shot('12-worldmodel-lake-victoria', { world: { lat: -0.8, lon: 33 }, label: 'Lake Victoria' })
//   await shot('98-place-plan', { element: '.map-place-plan', label: 'the town plan' })
//   await shot('115-savanna-dry', { general: 'the whole savanna dressing is the subject' })
//
// A check that only MEASURES pixels (no file, no subject) takes the same route
// for its budget:
//   const buf = await capturePixels(page, 'TRAA mean luma')
import {
  normaliseDeclaration,
  judgeFrameSubject,
  formatFrameFailure,
  formatFramePass,
} from './frameSubject-core.mjs'
import {
  SCENE_READY_DEFAULTS,
  awaitSceneReady,
  formatSceneReadyFailure,
  formatSceneReadyPass,
  sceneReadyMode,
} from './sceneReady-core.mjs'

// How long the shutter gives the picture to arrive before it judges. Generous
// on purpose: the bird's-eye camera settles in a fixed number of FRAMES, so on
// a machine carrying three agents that stretch is wall-clock long, and a tight
// budget would fail a frame the player would have seen. It costs nothing on a
// quiet machine (the wait ends on the condition) and only delays a real refusal.
const DEFAULT_TIMEOUT = 15000

// How long a CAPTURE may take — the ONE budget for both shapes the harness
// takes pictures in: the frame WRITE below and the pathless pixel PROBE
// (`capturePixels`) a check measures luma or colour on. Separate from the
// subject budget above, because it measures something else: that one waits for
// the subject to be in the picture (a judgment), this one waits for the browser
// to hand the pixels over (I/O). Passing nothing let either inherit Playwright's
// silent 30 s default, and on a host that rendered through SwiftShader with no
// GPU (the Linux lane before point 493) a capture under suite load exceeded that — `enrichments` died on the
// map-overlay write 4700 lines before its own subject, on main as much as on any
// branch, and the timeout named neither the harness nor the machine; its seven
// pixel probes carried the same undeclared deadline. A slow capture is not a
// failed check; a hung one still fails, four times later.
export const CAPTURE_BUDGET_MS = 120000

/**
 * Runs INSIDE the page. Returns the probe when the subject is in the picture,
 * `null` while it is not (so `waitForFunction` keeps polling on the animation
 * frame), and always the full probe when `report` is set — that last shape is
 * what the failure message is written from.
 * Self-contained by necessity: Playwright ships this function's source into the
 * page, so it may not reference anything from this module.
 */
export function probeFrameSubject(d) {
  const w = window
  const g = w.__game && w.__game.getState ? w.__game.getState() : null
  const probe = { ok: false, available: true, mode: g ? g.mode : null, placeId: g ? g.placeId : null }
  const done = () => (d.report ? probe : probe.ok ? probe : null)

  if (d.scene && probe.mode && probe.mode !== d.scene) return done()
  if (d.kind === 'general') {
    probe.ok = true
    return done()
  }
  if (d.kind === 'place') {
    probe.ok = probe.placeId === d.place
    return done()
  }
  if (d.kind === 'element') {
    // EVERY match, not just the first. A selector like `.building-highlight`
    // names a KIND of thing (one marker per important building) and the picture
    // shows the subject when ANY of them is on screen; judging `querySelector`'s
    // first match would decide the frame by DOM order and could refuse a picture
    // the player plainly sees. It is not a softer test — a match still has to be
    // visible in the viewport — only a correctly aimed one.
    const all = [].slice.call(document.querySelectorAll(d.element))
    probe.matches = all.length
    probe.viewport = { w: window.innerWidth, h: window.innerHeight }
    if (!all.length) {
      probe.available = false
      probe.reason = 'no element matches ' + d.element
      return done()
    }
    let anyShown = false
    let anySized = false
    for (let i = 0; i < all.length; i++) {
      const el = all[i]
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const shown = cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.01
      const sized = r.width > 1 && r.height > 1
      if (shown && sized) anySized = true
      const inView = sized && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
      if (shown) anyShown = true
      // Report the match the reader should look at: the visible one if there is
      // one, else the first (the failure text then names where it sat).
      if (!probe.rect || (shown && inView)) probe.rect = { x: r.x, y: r.y, w: r.width, h: r.height }
      if (shown && inView) {
        probe.visible = true
        probe.ok = true
        return done()
      }
    }
    probe.visible = false
    // Say which of the three ways it failed: nothing rendered at all, rendered
    // but with no size to see, or drawn somewhere off the frame. "Outside the
    // viewport" for a 0x0 wrapper would send the next reader after the aim when
    // the element has nothing to show.
    probe.reason = !anyShown
      ? d.element + ' is hidden (display/visibility/opacity)'
      : !anySized
        ? d.element + ' has no rendered size (a zero-size box is not a picture)'
        : d.element + ' lies outside the viewport'
    return done()
  }
  if (d.kind === 'world') {
    const cam = w.__camera
    if (!cam || !cam.ndc) {
      probe.available = false
      probe.reason = 'window.__camera is not installed — the bird’s-eye scene is not mounted'
      return done()
    }
    probe.ndc = cam.ndc(d.point.x, d.point.z, d.world.y)
    probe.onScreen = !!cam.onScreen(d.point.x, d.point.z, d.world.y)
    probe.settled = cam.settled ? !!cam.settled() : null
    if (g && g.pos) probe.player = { x: g.pos.x, z: g.pos.z }
    probe.ok = probe.onScreen && !(d.settle && probe.settled === false)
    return done()
  }
  // 'local' — a subject inside a settlement, projected through the place camera
  // itself (there is no __camera hook there), by the same matrix math.
  const cam = w.__placeCamera
  if (!cam || !cam.projectionMatrix || !cam.matrixWorldInverse) {
    probe.available = false
    probe.reason = 'window.__placeCamera is not installed — no settlement scene is mounted'
    return done()
  }
  const apply = (e, v) => [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
  const eye = apply(cam.matrixWorldInverse.elements, [d.local.x, d.local.y, d.local.z, 1])
  const clip = apply(cam.projectionMatrix.elements, eye)
  const cw = clip[3]
  const behind = !(cw > 0)
  probe.ndc = behind ? { x: 0, y: 0, z: 2 } : { x: clip[0] / cw, y: clip[1] / cw, z: clip[2] / cw }
  probe.onScreen = !behind && Math.abs(probe.ndc.x) <= 1 && Math.abs(probe.ndc.y) <= 1 && probe.ndc.z < 1
  probe.ok = probe.onScreen
  return done()
}

/**
 * Runs INSIDE the page. Installs the scene sampler on first call and returns the
 * buffer it has collected since — `null` when this page has no renderer hook to
 * sample (the production build).
 *
 * The sampler runs CONTINUOUSLY rather than only while a capture waits, for two
 * reasons: a scene that has stood finished for a minute is then ready at once
 * instead of costing every frame a fresh quiet window, and the buffer spans the
 * moment BEFORE the capture, so a jump that has just torn the old region down is
 * still visible in the window and cannot be mistaken for a settled picture.
 *
 * Self-contained by necessity: Playwright ships this function's source into the
 * page, so it may not reference anything from this module.
 */
export function sampleSceneCounts(cfg) {
  const w = window
  if (!w.__renderer) return null
  if (!w.__sceneReadySampler) {
    w.__sceneReadySamples = w.__sceneReadySamples || []
    w.__sceneReadySampler = setInterval(() => w.__sampleSceneCounts && w.__sampleSceneCounts(), cfg.everyMs)
  }
  w.__sampleSceneCounts = () => {
    const r = w.__renderer && w.__renderer.info && w.__renderer.info.render
    if (!r) return
    const list = w.__sceneReadySamples
    // The PER-FRAME counters. `info.render.calls` is cumulative (render passes
    // since start-up) and climbs on a finished scene as fast as on a building
    // one, which is exactly the false signal this wait exists to replace.
    list.push({ t: Date.now(), drawCalls: r.drawCalls || 0, triangles: r.triangles || 0 })
    const cut = Date.now() - cfg.keepMs
    while (list.length && list[0].t < cut) list.shift()
  }
  // Sample on the way out too, so the buffer ALWAYS carries this instant. Left
  // to the interval alone there is a sampling period in which a jump has already
  // torn the old region down while the buffer still shows only the settled
  // readings from before it — a window that looks quiet and would open the
  // shutter on an empty picture.
  w.__sampleSceneCounts()
  return w.__sceneReadySamples.slice()
}

/**
 * Wait until the scene has finished drawing (point 489). Returns the verdict;
 * the caller decides what a timeout means. Never waits for a page that has no
 * renderer hook — there is no scene there to be ready.
 */
export async function waitForSceneReady(page, opts = {}) {
  const o = { ...SCENE_READY_DEFAULTS, ...opts }
  const cfg = { everyMs: Math.max(100, Math.min(500, o.pollMs)), keepMs: Math.max(30000, o.quietMs * 4) }
  return awaitSceneReady({
    ...o,
    read: () => page.evaluate(sampleSceneCounts, cfg),
    sleep: (ms) => page.waitForTimeout(ms),
  })
}

/**
 * The stand candidates around a subject, nearest ring first: the subject
 * itself, then 16 bearings every 0.02 degrees out to 0.3. A sampled search —
 * the first still candidate, not guaranteed the nearest one.
 */
export function standCandidates(lat, lon, { maxDeg = 0.3, stepDeg = 0.02, bearings = 16 } = {}) {
  const out = [[lat, lon]]
  for (let i = 1; i * stepDeg <= maxDeg + 1e-9; i++) {
    for (let k = 0; k < bearings; k++) {
      const t = (k / bearings) * 2 * Math.PI
      out.push([lat + i * stepDeg * Math.sin(t), lon + i * stepDeg * Math.cos(t)])
    }
  }
  return out
}

/**
 * Jump to stand BESIDE a water subject (point 1145). The current sweeps the
 * traveller only on water (store.driftCurrent, design.md §11): set down in the
 * Zambezi or the Nile he drifted 3-4.5 degrees downstream within the wait, the
 * camera followed, and the frame missed its subject. So he stands on the first
 * candidate that is dry land or water without current (a lake); the subject
 * stays the declared point. Returns the stand, or `null` after printing a FAIL
 * line when no candidate is still — then it does NOT jump, and the caller
 * skips the frame rather than photograph a drifting traveller.
 */
export async function jumpBeside(page, lat, lon, frame = `(${lat}, ${lon})`) {
  const candidates = standCandidates(lat, lon)
  const at = await page.evaluate(async (cs) => {
    const current = await import('/src/systems/current.ts')
    const g = window.__game.getState()
    const still = ([la, lo]) => {
      if (!['water', 'ocean'].includes(window.__terrainType(la, lo, g.seed))) return true
      const d = current.currentDriftDegPerSecond(la, lo, false)
      return d.lat === 0 && d.lon === 0
    }
    const i = cs.findIndex(still)
    if (i >= 0) g.debugJumpTo(cs[i][0], cs[i][1])
    return i
  }, candidates)
  if (at < 0) {
    console.log(`FAIL  frame ${frame} — no stand clear of the current within 0.3 degrees of lat ${lat}, lon ${lon}; the frame was not taken`)
    return null
  }
  return candidates[at]
}

// A REFUSED FRAME IS ONE FAILED CHECK, NOT A DEAD RUN (point 1145). The shutter
// used to THROW, so one mis-aimed frame killed the node process: the run
// reported nothing, covered no backend, and left a crash record only a
// hand-signed sign-off could clear. Now the refusal prints its `FAIL` line,
// writes no file, returns `null`, and marks the run red — the suite finishes
// and every other check still counts. A caller that measures the returned
// buffer skips that measurement on `null`; the frame's own FAIL already
// carries the red.
const refused = []

/** The frames this process refused so far (name and reason). */
export function refusedFrames() {
  return refused.slice()
}

/**
 * Take back a refusal a SELF-TEST provoked on purpose, so it does not redden the
 * run. Returns the reason it was refused for, or `null` when it was not refused.
 */
export function expectRefusal(frame) {
  const at = refused.findIndex((r) => r.frame === frame)
  if (at < 0) return null
  const [{ reason }] = refused.splice(at, 1)
  if (!refused.length) process.exitCode = 0
  return reason
}

/**
 * Mark the run red for a refused frame. Suites end with an explicit
 * `process.exit(<own verdict>)`, which would override `process.exitCode`, so
 * `process.exit` is wrapped once to keep a clean-looking exit from turning a
 * refused frame green (the run recorder parses the reds only of a non-zero exit).
 */
function recordRefusal(frame, reason) {
  refused.push({ frame, reason })
  process.exitCode = 1
  if (process.exit.__frameRefusals) return
  const exit = process.exit.bind(process)
  // Node reads `'0'`, `null` and `undefined` as success too: only an explicit
  // failing code passes through unchanged.
  const guarded = (code) => exit(refused.length && !(Number(code ?? 0) > 0) ? 1 : code)
  guarded.__frameRefusals = true
  process.exit = guarded
}

/**
 * Capture one frame. Refuses — loudly, without writing the file — when the
 * declared subject is not in the picture, or when the scene never finished
 * drawing. A refusal returns `null` and fails its check; it does not throw.
 */
export async function captureFrame(page, outDir, name, decl, { timeout = DEFAULT_TIMEOUT, scene = {}, beforeCapture } = {}) {
  const d = normaliseDeclaration(name, decl)
  const started = Date.now()
  let probe = null
  if (d.kind === 'general') {
    probe = await page.evaluate(probeFrameSubject, { ...d, report: true })
  } else {
    try {
      const handle = await page.waitForFunction(probeFrameSubject, d, { timeout })
      probe = await handle.jsonValue()
      await handle.dispose()
    } catch {
      probe = await page.evaluate(probeFrameSubject, { ...d, report: true })
    }
  }
  if (probe) probe.waitedMs = Date.now() - started
  const verdict = judgeFrameSubject(d, probe)
  if (!verdict.ok) {
    console.log(formatFrameFailure(d, probe, verdict))
    recordRefusal(d.frame, `its subject is not in the rendered picture — ${verdict.reason}`)
    return null
  }
  // The AIM is judged first and the picture second, in that order on purpose: a
  // mis-aimed frame is refused in seconds instead of after the (deliberately
  // generous) readiness wait, and the aim cannot go stale while the world
  // streams in — a settled camera stays put during the wait (a `settle: false`
  // frame is shot in motion by choice).
  let sceneVerdict = null
  const mode = sceneReadyMode(d)
  if (mode !== 'none') {
    sceneVerdict = await waitForSceneReady(page, { mode, ...scene })
    if (sceneVerdict.timedOut) {
      console.log(formatSceneReadyFailure(d.frame, sceneVerdict, scene))
      recordRefusal(d.frame, `the scene never finished drawing — ${sceneVerdict.reason}`)
      return null
    }
  }
  // A short live action starts only after readiness, so the readiness wait
  // cannot consume the very performance the frame is meant to show.
  if (beforeCapture) await beforeCapture()
  const path = `${outDir}${d.frame}.png`
  const options = decl.clip
    ? { path, clip: decl.clip, timeout: CAPTURE_BUDGET_MS }
    : { path, timeout: CAPTURE_BUDGET_MS }
  // Returns the PNG buffer, like `page.screenshot` itself — a few frames are
  // ALSO a pixel probe (settings.mjs reads the TRAA frame's mean luma).
  const buffer = decl.locator ? await page.locator(decl.locator).screenshot(options) : await page.screenshot(options)
  console.log(formatFramePass(d, probe) + formatSceneReadyPass(sceneVerdict))
  return buffer
}

/**
 * Take a PIXEL PROBE: a screenshot with no `path`, returning the PNG buffer a
 * check measures luma, colour or motion on. It writes no file and declares no
 * subject — it is a measurement, not evidence — but it is still a capture, so it
 * carries the SAME budget as the write above instead of Playwright's silent
 * default (point 492).
 *
 * `site` names the check that took it, so an exceeded budget reads as the
 * harness saying which measurement outran it rather than as a bare Playwright
 * timeout thrown thousands of lines from the check that was running.
 */
export async function capturePixels(page, site, { clip, locator, timeout = CAPTURE_BUDGET_MS } = {}) {
  // A per-site override may raise or lower the budget, but never REMOVE it:
  // Playwright reads `timeout: 0` as "no deadline", which is precisely the hang
  // this helper exists to bound (four-eyes review 06.08.2026 — the constant was
  // pinned against 0, the override was not).
  if (!(timeout > 0)) {
    throw new Error(
      `pixel probe "${site}": timeout ${timeout} disables the deadline — the capture budget may be ` +
        'raised or lowered per site, never switched off (scripts/verify/frameSubject.mjs).',
    )
  }
  const options = clip ? { clip, timeout } : { timeout }
  const started = Date.now()
  try {
    return locator ? await page.locator(locator).screenshot(options) : await page.screenshot(options)
  } catch (error) {
    // Only a BUDGET failure is retold as one. A page crash or a closed target is
    // a different fact, and calling it "the machine, not the product" would send
    // the reader after the wrong cause — it is rethrown untouched, call log and all.
    const reason = error && error.message ? error.message.split('\n')[0] : String(error)
    if (!/timeout/i.test(reason)) throw error
    const waited = ((Date.now() - started) / 1000).toFixed(1)
    throw new Error(
      `pixel probe "${site}": the verification harness allowed the capture ${Math.round(timeout / 1000)} s ` +
        `and no pixels arrived (waited ${waited} s${clip ? `, clip ${clip.width}x${clip.height}` : ''}` +
        `${locator ? `, locator ${locator}` : ''}). A capture this slow means the machine, not the product — ${reason}`,
    )
  }
}

/** Bind the shutter to a page and an output directory: `shot(name, declaration)`. */
export function frameShutter(page, outDir, opts = {}) {
  return (name, decl) => captureFrame(page, outDir, name, decl, opts)
}
