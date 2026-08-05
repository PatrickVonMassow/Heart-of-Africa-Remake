// Shared browser launcher for the verify suites (point 184, Pillar 3 — the WebGPU
// lane). Every suite historically called chromium.launch itself with the ANGLE args
// on Playwright's BUNDLED Chromium, whose headless requestDevice fails, so they
// silently ran the WebGL2 path (the old "WebGPU is untestable headless" belief). The
// 19.07.2026 breakthrough: SYSTEM Chrome (channel:'chrome') with --headless=new +
// --enable-unsafe-webgpu renders the REAL WebGPU backend headless on a secure-context
// (localhost) page. This module centralises the launch so the backend is one env var,
// and asserts the backend that initialised is the one requested — no silent fallback
// (the guardrail, the whole point of the lane).
import { chromium } from 'playwright'
import { armRunRecorder, markBackendAsserted } from '../render-verify-recorder.mjs'
import { verifyLaunchOptions, webgpuLaneVerdict } from './launch-args-core.mjs'
import { findSystemChrome } from './system-chrome.mjs'

// Which backend the verify run targets. 'webgpu' = system Chrome, headless=new (the
// player's primary backend); 'webgl' = the bundled Chromium with ANGLE (the WebGL2
// fallback the game still ships). During the lane's roll-in the default stays 'webgl'
// (the historical behaviour, so any un-migrated normal run is byte-for-byte
// unchanged); it flips to 'webgpu' only once every suite is proven green AND
// flake-free on WebGPU (point 184's condition b), per the user's tier design.
export const VERIFY_GL = (process.env.VERIFY_GL ?? 'webgl').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'

/** Launch the browser for the requested backend. WebGPU needs a SYSTEM Chrome/Chromium
 *  — Playwright's bundled Chromium fails requestDevice headless; the system browser with
 *  --headless=new works on a secure-context page (the point-184 breakthrough). The
 *  WebGL2 lane uses the bundled Chromium with the ANGLE backend its PLATFORM can
 *  provide (point 475 — `d3d11` is Direct3D and exists only on Windows; the args come
 *  from launch-args-core.mjs, which keeps Windows byte for byte).
 *
 *  Nothing here installs a browser. The bring-up is one documented command,
 *  `npm run verify:bringup` (scripts/verify/README.md): a suite that silently
 *  downloaded ~180 MB mid-regression would be a surprise, not a convenience.
 *
 *  The options POSE a host and no suite passes them: `platform` names the platform to
 *  decide by, and `systemChrome` short-circuits the probe (null = "this host has no
 *  browser", undefined = "probe it"). They exist because the ordering below is
 *  load-bearing — the throw must happen BEFORE armRunRecorder — and proving that on a
 *  machine that HAS a system Chrome would otherwise mean launching a real browser
 *  (scripts/verify/launch-order.test.mjs). */
export async function launchVerifyBrowser({ platform = process.platform, systemChrome } = {}) {
  // The probe runs ONCE and its result is what LAUNCHES: the verdict and the launch
  // options read the same path, so the browser the bring-up reports is the browser the
  // lane opens (point 475 — see webgpuLaunchOptions).
  let chrome = systemChrome ?? null
  if (VERIFY_GL === 'webgpu') {
    if (systemChrome === undefined) chrome = findSystemChrome(platform)
    // The lane is either run for real or declared unrunnable — never quietly served by
    // the other backend. Thrown BEFORE the recorder is armed, so a host without a
    // system Chrome/Chromium leaves no run record at all and render-verify-guard cannot
    // read the attempt as WebGPU coverage (point 475, condition 3).
    const verdict = webgpuLaneVerdict({ platform, systemChrome: chrome })
    if (!verdict.available) throw new Error(verdict.reason)
  }
  // Render-verify evidence (user mandate 22.07.2026): record this suite run —
  // backend, exit code, screenshots — from inside the process, so the Stop-hook
  // guard (scripts/render-verify-guard.mjs) can enforce that every render change
  // was verified on BOTH backends. Observe-only; can never fail the suite.
  armRunRecorder(VERIFY_GL)
  return chromium.launch(
    // process.env is handed over so the lane can pin the Gallium driver in it (point 493:
    // unpinned, Mesa 25 silently serves llvmpipe and every suite runs on the CPU).
    verifyLaunchOptions(VERIFY_GL, platform, process.env.VERIFY_ANGLE, chrome, process.env, process.env.VERIFY_GALLIUM),
  )
}

/** Guardrail (point 184): throw if the backend that actually initialised is not the
 *  one requested. A WebGPU run that silently fell back to WebGL2 would give false
 *  confidence — exactly what the lane must prevent. Call once after the game has
 *  loaded (window.__renderer is set in App.tsx after renderer.init()). */
export async function assertBackend(page) {
  const info = await page.evaluate(() => {
    const r = /** @type {any} */ (window).__renderer
    return r ? { isWebGPU: r.backend?.isWebGPUBackend === true } : null
  })
  if (!info) throw new Error('assertBackend: window.__renderer not found — the game did not finish loading')
  if (VERIFY_GL === 'webgpu' && !info.isWebGPU) {
    throw new Error(
      'assertBackend: VERIFY_GL=webgpu but the renderer initialised on WebGL2 — the headless WebGPU lane silently fell back (needs system Chrome + a real GPU)',
    )
  }
  if (VERIFY_GL === 'webgl' && info.isWebGPU) {
    throw new Error('assertBackend: VERIFY_GL=webgl but the renderer initialised on WebGPU — the fallback lane is not exercising WebGL2')
  }
  markBackendAsserted() // render-verify evidence: the backend was CONFIRMED, not assumed
  return info
}

/** Wait until a numeric page reading STOPS changing, then return it (point 200):
 *  a lerp/settle takes a variable number of frames under load, so a fixed wall
 *  wait either flakes (too short) or wastes time (too long). `readFn` is a page
 *  arrow returning a number; the poll returns once two successive reads settleMs
 *  apart differ by <= eps, or at the timeout (the caller's assert then judges the
 *  settled value). */
export async function waitForStable(page, readFn, { eps = 1e-3, settleMs = 200, timeout = 8000 } = {}) {
  const start = Date.now()
  let prev = await page.evaluate(readFn)
  while (Date.now() - start < timeout) {
    await page.waitForTimeout(settleMs)
    const cur = await page.evaluate(readFn)
    if (typeof cur === 'number' && typeof prev === 'number' && Math.abs(cur - prev) <= eps) return cur
    prev = cur
  }
  return prev
}

/** Wait until EVERY numeric field of a page reading stops changing, and SAY whether
 *  it actually settled (point 499).
 *
 *  `waitForStable` above watches ONE number and returns the last value at its
 *  timeout, indistinguishable from a settled one. On the container host — where the
 *  frame rate is a fraction of the Windows machine these waits were calibrated on —
 *  a settlement lerp ran past the 6 s window, and three `polish` checks then measured
 *  a HALF-LERPED state and reported it as a product failure (dry sky grayMix 0.146
 *  instead of 0, wet sun 2.348 instead of 1.44). Given the time it needs, every one
 *  of those values reaches its target exactly.
 *
 *  Two things follow, and this helper is both: watch the fields the caller ASSERTS
 *  rather than one proxy beside them, and report `settled` so a timeout fails as
 *  "the reading never settled" instead of as a wrong measurement.
 *
 *  `requireChange` covers the OTHER half of the same trap, and the measured one: a
 *  setting pushed into the scene does not take hold in the same instant, so a poll
 *  started right after it finds the reading still standing where it was and calls
 *  that settled — the dry season measured grayMix 0.146 after 1.5 s of quiet that
 *  was simply the pause before the lerp began. With it, the quiet only counts once
 *  the reading has actually MOVED, and a reading that never moves inside the
 *  timeout is reported `settled: false` rather than read as an answer. */
export async function waitForReadingStable(page, readFn, { eps = 1e-3, settleMs = 500, samples = 3, requireChange = false, timeout = 60000 } = {}) {
  const numbersOf = (v) => {
    const out = []
    const walk = (x) => {
      if (typeof x === 'number') out.push(x)
      else if (x && typeof x === 'object') for (const k of Object.keys(x).sort()) walk(x[k])
    }
    walk(v)
    return out
  }
  const start = Date.now()
  let prev = await page.evaluate(readFn)
  let quiet = 0
  let moved = !requireChange
  while (Date.now() - start < timeout) {
    await page.waitForTimeout(settleMs)
    const cur = await page.evaluate(readFn)
    const a = numbersOf(prev)
    const b = numbersOf(cur)
    const still = a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) <= eps)
    if (!still) moved = true
    quiet = still ? quiet + 1 : 0
    prev = cur
    if (moved && quiet >= samples) return { value: cur, settled: true, moved: true, waitedMs: Date.now() - start }
  }
  return { value: prev, settled: false, moved, waitedMs: Date.now() - start }
}

/** Wait until the scene has finished BUILDING, not until a clock runs out (point 499).
 *
 *  The renderer streams a scene in over many seconds: measured on the container host,
 *  first-person Cairo stood at 12 792 triangles and a BLACK picture after 6 s, a flat
 *  untextured wash after 7.7 s, and only at ~16.7 s carried its ground micro-structure
 *  (72 751 triangles). Every suite that photographed it after a fixed 4 s wait was
 *  therefore measuring an unfinished scene and blaming the product for it.
 *
 *  The condition is the renderer's OWN geometry count: it must pass a floor and then
 *  stop GROWING. Growth only — animals and dressing make it wobble downward as things
 *  leave the frustum, and waiting for that to stop would never return.
 *
 *  `settleMs` is 5 s because the curve is STEPPED, not smooth: traced at 250 ms on the
 *  container host, the count sat still at 33 346 from 9.0 s to 13.2 s and only reached
 *  its final 83 037 at 24.6 s, with the ground detail appearing at 18.8 s. A shorter
 *  settle returns inside one of those plateaus — a 700 ms one returned at 10.5 s and
 *  38 280 triangles, on a picture that was still black. */
export async function waitForSceneBuilt(page, { minTriangles = 20000, settleMs = 5000, pollMs = 200, timeout = 120000 } = {}) {
  const read = () => page.evaluate(() => window.__renderer?.info?.render?.triangles ?? 0)
  const start = Date.now()
  let peak = 0
  let quietSince = null
  while (Date.now() - start < timeout) {
    const tris = await read()
    if (tris > peak) {
      peak = tris
      quietSince = null
    } else if (peak >= minTriangles) {
      quietSince ??= Date.now()
      if (Date.now() - quietSince >= settleMs) return { triangles: peak, built: true, waitedMs: Date.now() - start }
    }
    await page.waitForTimeout(pollMs)
  }
  return { triangles: peak, built: false, waitedMs: Date.now() - start }
}
