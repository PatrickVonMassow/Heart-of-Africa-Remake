// Pure decision core for the SCENE-READINESS WAIT (point 489).
//
// A frame must wait for the PICTURE, not for the clock. The shutter (point 375)
// proves the frame's SUBJECT is in the picture — but a subject projects into an
// empty grey frame exactly as well as into a finished one, so the shutter alone
// accepted frames the world had not been drawn into yet. Measured on the Linux
// container host: after entering the travel scene the renderer climbed from 99
// draw calls / 5.5k triangles at 5 s to 222 / 745k at 30 s. Two suites wrote
// blank frames through that gap and exited 0 — `world` a 47 kB empty village,
// `collision` an empty `52-collision-port-wall.png` — because both waited on
// something that an EMPTY scene satisfies FASTEST of all (a healthy frame rate).
//
// The signal that means "the picture is finished" is the renderer's own
// per-frame counters standing still: `info.render.drawCalls` and
// `info.render.triangles`. Not the cumulative `info.render.calls` — that one
// counts render passes since start-up and climbs forever, on every host, built
// or not.
//
// The judgement is on the SPREAD over a trailing window, not on growth alone: a
// count that FALLS is a region unloading after a jump, which is no more a
// finished picture than one that climbs. The window is wide because the
// streaming curve is STEPPED (point 499 traced a 4 s plateau mid-build), and the
// tolerance is RELATIVE because a finished scene never stands perfectly still —
// wildlife and dressing entering and leaving the frustum moved the counts by
// 1-7 % of their value in every measured settled state, while a half-built one
// moved by 20-98 %.
//
// Everything here is data-in / verdict-out so the Vitest layer can pin it
// (`scripts/verify/sceneReady.test.mjs`); the browser work — installing the
// in-page sampler, polling it, refusing the frame — lives in
// `scripts/verify/frameSubject.mjs`.

/**
 * Calibrated on the container host this point was measured on (05.08.2026);
 * every value is overridable per capture.
 * - `quietMs`   how long the counters must hold still. 5 s: the streaming curve
 *               plateaus for up to ~4 s mid-build (point 499).
 * - `tolerance` relative spread that still counts as "standing still".
 * - `minTriangles` a floor no drawn scene falls below; the measured blank frame
 *               stood at 5.5k, every real one at 99k and up.
 * - `minSamples` fewer readings than this cannot describe a window.
 * - `pollMs`    how often the in-page buffer is read out.
 * - `timeoutMs` generous on purpose: a wait that ends too early writes a false
 *               picture, one that ends late only costs seconds.
 */
export const SCENE_READY_DEFAULTS = {
  quietMs: 5000,
  tolerance: 0.1,
  minTriangles: 20000,
  minSamples: 4,
  pollMs: 500,
  timeoutMs: 120000,
}

/**
 * Does this frame's subject live in the drawn scene?
 *
 * Everything does EXCEPT an `element` frame: a HUD/overlay subject is DOM, it is
 * complete the moment it is on screen, and making it wait for the world behind
 * it would only slow the suites down. A frame may state it either way with
 * `sceneReady: true|false` — an element drawn over the scene can opt in, and a
 * page without a scene at all (the production preview) opts out.
 */
export function needsSceneReady(d) {
  if (typeof d?.sceneReady === 'boolean') return d.sceneReady
  return d?.kind !== 'element'
}

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** min/max/spread of one metric over the window, plus its relative spread. */
function spreadOf(samples, key) {
  let min = Infinity
  let max = -Infinity
  for (const s of samples) {
    const v = finite(s?.[key])
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!samples.length) return { min: 0, max: 0, spread: 0, ratio: 0 }
  const spread = max - min
  return { min, max, spread, ratio: max > 0 ? spread / max : spread > 0 ? 1 : 0 }
}

const round = (n) => Math.round(n)

/**
 * Is the scene finished building?
 *
 * `samples` is the in-page buffer: `[{ t, drawCalls, triangles }, …]`, oldest
 * first, `t` in wall-clock ms. `null`/`undefined` means the page could not be
 * asked at all (no `window.__renderer` — a production build has no dev hook);
 * that is reported as `unavailable`, NOT as "not ready", because no amount of
 * waiting would change it.
 *
 * Returns { ready, reason, unavailable?, spanMs, samples, drawCalls, triangles }.
 */
export function judgeSceneReady(samples, opts = {}) {
  const o = { ...SCENE_READY_DEFAULTS, ...opts }
  const now = typeof o.now === 'number' ? o.now : Date.now()
  if (samples == null) {
    return {
      ready: false,
      unavailable: true,
      reason: 'window.__renderer is not installed — this page draws no scene the readiness of which could be judged',
      spanMs: 0,
      samples: 0,
      drawCalls: spreadOf([], 'drawCalls'),
      triangles: spreadOf([], 'triangles'),
    }
  }
  const all = Array.isArray(samples) ? samples.filter((s) => s && Number.isFinite(s.t)) : []
  // The window REACHES BACK past the quiet period rather than starting inside
  // it: the last reading taken at or before the boundary is kept, so a window
  // that covers `quietMs` really does span `quietMs`. Starting at the first
  // sample INSIDE the boundary would leave the span one sampling interval short
  // of the quiet time forever, and no scene could ever be called ready.
  const edge = all.findLastIndex((s) => s.t <= now - o.quietMs)
  const win = edge >= 0 ? all.slice(edge) : all.slice()
  const drawCalls = spreadOf(win, 'drawCalls')
  const triangles = spreadOf(win, 'triangles')
  const spanMs = win.length ? win[win.length - 1].t - win[0].t : 0
  const base = { spanMs, samples: win.length, drawCalls, triangles }

  if (!all.length) return { ...base, ready: false, reason: 'the renderer has not been sampled yet' }
  if (triangles.max <= 0 || drawCalls.max <= 0) {
    return { ...base, ready: false, reason: 'no frame has been drawn yet (0 draw calls)' }
  }
  if (win.length < o.minSamples || spanMs < o.quietMs) {
    return {
      ...base,
      ready: false,
      reason: `the scene has stood still for only ${round(spanMs)} ms of the ${o.quietMs} ms the wait asks for (${win.length} reading(s))`,
    }
  }
  if (triangles.max < o.minTriangles) {
    return {
      ...base,
      ready: false,
      reason: `only ${triangles.max} triangles are drawn — below the ${o.minTriangles} a drawn scene never falls under, so this is empty paper`,
    }
  }
  if (triangles.ratio > o.tolerance) {
    return {
      ...base,
      ready: false,
      reason: `the triangle count is still moving (${triangles.min} → ${triangles.max} within ${round(spanMs)} ms, ${(triangles.ratio * 100).toFixed(1)} %)`,
    }
  }
  if (drawCalls.ratio > o.tolerance) {
    return {
      ...base,
      ready: false,
      reason: `the draw-call count is still moving (${drawCalls.min} → ${drawCalls.max} within ${round(spanMs)} ms, ${(drawCalls.ratio * 100).toFixed(1)} %)`,
    }
  }
  return {
    ...base,
    ready: true,
    reason: `${drawCalls.max} draw calls and ${triangles.max} triangles held still for ${round(spanMs)} ms`,
  }
}

/**
 * Poll until the scene is ready, or say that it never was.
 *
 * The I/O is injected — `read()` returns the sample buffer (or `null`), `sleep`
 * waits, `now` reads the clock — so the whole wait INCLUDING its timeout path is
 * pinned in the Vitest layer without a browser. Never throws: the caller decides
 * what a timeout means for its frame.
 */
export async function awaitSceneReady({ read, sleep, now = Date.now, ...opts } = {}) {
  const o = { ...SCENE_READY_DEFAULTS, ...opts }
  const started = now()
  for (;;) {
    const verdict = judgeSceneReady(await read(), { ...o, now: now() })
    const waitedMs = now() - started
    if (verdict.ready || verdict.unavailable) return { ...verdict, timedOut: false, waitedMs }
    if (waitedMs >= o.timeoutMs) return { ...verdict, timedOut: true, waitedMs }
    await sleep(o.pollMs)
  }
}

/**
 * The loud refusal. First line keeps the `FAIL  <name> — <detail>` shape the run
 * triage parses (`baseline-classify-core.mjs`), so a frame refused for an
 * unfinished picture is a check like any other.
 */
export function formatSceneReadyFailure(frame, verdict, opts = {}) {
  const o = { ...SCENE_READY_DEFAULTS, ...opts }
  return [
    `FAIL  frame ${frame} — the scene never finished drawing: ${verdict.reason}`,
    `      waited ${round(verdict.waitedMs ?? 0)} ms of ${o.timeoutMs} ms; last reading ${verdict.drawCalls.max} draw calls / ${verdict.triangles.max} triangles`,
    `      The frame was NOT written. A half-drawn picture is a false one (point 489):`,
    `      give the host more time (timeoutMs), or fix what keeps the scene from settling.`,
  ].join('\n')
}

/** The one-line note that goes with a frame the wait cleared. */
export function formatSceneReadyPass(verdict) {
  if (!verdict) return ''
  if (verdict.unavailable) return ' [scene readiness not judged — the page installs no renderer hook]'
  return ` [scene ready: ${verdict.drawCalls.max} draw calls / ${verdict.triangles.max} triangles, waited ${round(verdict.waitedMs ?? 0)} ms]`
}
