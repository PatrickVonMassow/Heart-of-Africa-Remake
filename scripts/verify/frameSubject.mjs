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
// that never gets there is refused just as loudly as a mis-aimed one. Only a
// HUD `element` frame skips the wait — see `needsSceneReady`.
//
// Usage in a suite:
//   import { frameShutter } from './frameSubject.mjs'
//   const shot = frameShutter(page, OUT)
//   await shot('12-worldmodel-lake-victoria', { world: { lat: -0.8, lon: 33 }, label: 'Lake Victoria' })
//   await shot('98-place-plan', { element: '.map-place-plan', label: 'the town plan' })
//   await shot('115-savanna-dry', { general: 'the whole savanna dressing is the subject' })
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
  needsSceneReady,
} from './sceneReady-core.mjs'

// How long the shutter gives the picture to arrive before it judges. Generous
// on purpose: the bird's-eye camera settles in a fixed number of FRAMES, so on
// a machine carrying three agents that stretch is wall-clock long, and a tight
// budget would fail a frame the player would have seen. It costs nothing on a
// quiet machine (the wait ends on the condition) and only delays a real refusal.
const DEFAULT_TIMEOUT = 15000

// How long the WRITE of the picture may take. Separate from the probe budget
// above, because it measures something else: the probe waits for the subject to
// be in the picture (a judgment), this waits for the browser to hand the pixels
// over (I/O). Passing nothing let it inherit Playwright's silent 30 s default,
// and on a host that renders through SwiftShader with no GPU a full-page or
// element capture under suite load exceeds that — `enrichments` died on the
// map-overlay capture 4700 lines before its own subject, on main as much as on
// any branch, and the timeout named neither the shutter nor the machine. A slow
// capture is not a failed check; a hung one still fails, four times later.
const CAPTURE_TIMEOUT = 120000

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

  if (d.scene && probe.mode && probe.mode !== d.scene) {
    probe.reason = 'the game was in ' + probe.mode + ' mode, not ' + d.scene
    return done()
  }
  if (d.kind === 'general') {
    probe.ok = true
    return done()
  }
  if (d.kind === 'place') {
    probe.ok = probe.placeId === d.place
    if (!probe.ok) probe.reason = 'the game stood in ' + (probe.placeId || 'no settlement') + ', not in ' + d.place
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
    if (!probe.ok && probe.onScreen) probe.reason = 'the camera was still travelling to its target'
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
  if (w.__placePlayer) probe.player = { x: w.__placePlayer.x, z: w.__placePlayer.z }
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
 * Capture one frame. Refuses — loudly, without writing the file — when the
 * declared subject is not in the picture, or when the scene never finished
 * drawing.
 */
export async function captureFrame(page, outDir, name, decl, { timeout = DEFAULT_TIMEOUT, scene = {} } = {}) {
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
    const message = formatFrameFailure(d, probe, verdict)
    console.log(message)
    throw new Error(`frame ${d.frame}: its subject is not in the rendered picture — ${verdict.reason}`)
  }
  // The AIM is judged first and the picture second, in that order on purpose: a
  // mis-aimed frame is refused in seconds instead of after the (deliberately
  // generous) readiness wait, and the aim cannot go stale while the world
  // streams in — nothing moves the camera during the wait.
  let sceneVerdict = null
  if (needsSceneReady(d)) {
    sceneVerdict = await waitForSceneReady(page, scene)
    if (sceneVerdict.timedOut) {
      console.log(formatSceneReadyFailure(d.frame, sceneVerdict, scene))
      throw new Error(`frame ${d.frame}: the scene never finished drawing — ${sceneVerdict.reason}`)
    }
  }
  const path = `${outDir}${d.frame}.png`
  const options = decl.clip
    ? { path, clip: decl.clip, timeout: CAPTURE_TIMEOUT }
    : { path, timeout: CAPTURE_TIMEOUT }
  // Returns the PNG buffer, like `page.screenshot` itself — a few frames are
  // ALSO a pixel probe (settings.mjs reads the TRAA frame's mean luma).
  const buffer = decl.locator ? await page.locator(decl.locator).screenshot(options) : await page.screenshot(options)
  console.log(formatFramePass(d, probe) + formatSceneReadyPass(sceneVerdict))
  return buffer
}

/** Bind the shutter to a page and an output directory: `shot(name, declaration)`. */
export function frameShutter(page, outDir, opts = {}) {
  return (name, decl) => captureFrame(page, outDir, name, decl, opts)
}
