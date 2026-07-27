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

// How long the shutter gives the picture to arrive before it judges. Generous
// on purpose: the bird's-eye camera settles in a fixed number of FRAMES, so on
// a machine carrying three agents that stretch is wall-clock long, and a tight
// budget would fail a frame the player would have seen. It costs nothing on a
// quiet machine (the wait ends on the condition) and only delays a real refusal.
const DEFAULT_TIMEOUT = 15000

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
    for (let i = 0; i < all.length; i++) {
      const el = all[i]
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const shown = cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.01
      const inView = r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
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
    probe.reason = anyShown
      ? d.element + ' lies outside the viewport'
      : d.element + ' is hidden (display/visibility/opacity)'
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
 * Capture one frame. Refuses — loudly, without writing the file — when the
 * declared subject is not in the picture.
 */
export async function captureFrame(page, outDir, name, decl, { timeout = DEFAULT_TIMEOUT } = {}) {
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
  const path = `${outDir}${d.frame}.png`
  const options = decl.clip ? { path, clip: decl.clip } : { path }
  // Returns the PNG buffer, like `page.screenshot` itself — a few frames are
  // ALSO a pixel probe (settings.mjs reads the TRAA frame's mean luma).
  const buffer = decl.locator ? await page.locator(decl.locator).screenshot(options) : await page.screenshot(options)
  console.log(formatFramePass(d, probe))
  return buffer
}

/** Bind the shutter to a page and an output directory: `shot(name, declaration)`. */
export function frameShutter(page, outDir, opts = {}) {
  return (name, decl) => captureFrame(page, outDir, name, decl, opts)
}
