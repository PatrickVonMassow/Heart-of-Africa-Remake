// Shared browser launcher for the verify suites (point 184, Pillar 3 — the WebGPU
// lane). Every suite historically called chromium.launch itself with the ANGLE args
// on Playwright's BUNDLED Chromium, whose headless requestDevice fails, so they
// silently ran the WebGL2 path (the old "WebGPU is untestable headless" belief). The
// 19.07.2026 breakthrough: SYSTEM Chrome (channel:'chrome') with --headless=new +
// --enable-unsafe-webgpu renders the REAL WebGPU backend headless on a secure-context
// (localhost) page. This module centralises the launch so the backend is one env var,
// and asserts the backend that initialised is the one requested — no silent fallback
// (the guardrail, the whole point of the lane).
import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { chromium } from 'playwright'
import { armRunRecorder, markBackendAsserted } from '../render-verify-recorder.mjs'
import { systemChromeCandidates, verifyLaunchOptions, webgpuLaneVerdict } from './launch-args-core.mjs'

// Which backend the verify run targets. 'webgpu' = system Chrome, headless=new (the
// player's primary backend); 'webgl' = the bundled Chromium with ANGLE (the WebGL2
// fallback the game still ships). During the lane's roll-in the default stays 'webgl'
// (the historical behaviour, so any un-migrated normal run is byte-for-byte
// unchanged); it flips to 'webgpu' only once every suite is proven green AND
// flake-free on WebGPU (point 184's condition b), per the user's tier design.
export const VERIFY_GL = (process.env.VERIFY_GL ?? 'webgl').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'

/** Is this an executable file? (Total — an unreadable path is simply "no".) */
function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** The first system-browser candidate that exists, or null. A bare name is looked up on
 *  PATH; an absolute path is probed directly. Returns null on a platform the pure core
 *  declines to probe (Windows, macOS), where Playwright resolves the channel itself.
 *  The path returned is the one the lane LAUNCHES — see webgpuLaunchOptions. */
function findSystemChrome(platform = process.platform) {
  for (const candidate of systemChromeCandidates(platform)) {
    if (isAbsolute(candidate)) {
      if (isExecutable(candidate)) return candidate
      continue
    }
    for (const dir of String(process.env.PATH ?? '').split(delimiter)) {
      if (!dir) continue
      const full = join(dir, candidate)
      if (isExecutable(full)) return full
    }
  }
  return null
}

/** Launch the browser for the requested backend. WebGPU needs a SYSTEM Chrome/Chromium
 *  — Playwright's bundled Chromium fails requestDevice headless; the system browser with
 *  --headless=new works on a secure-context page (the point-184 breakthrough). The
 *  WebGL2 lane uses the bundled Chromium with the ANGLE backend its PLATFORM can
 *  provide (point 475 — `d3d11` is Direct3D and exists only on Windows; the args come
 *  from launch-args-core.mjs, which keeps Windows byte for byte).
 *
 *  Nothing here installs a browser. The bring-up is one documented command,
 *  `npm run verify:bringup` (scripts/verify/README.md): a suite that silently
 *  downloaded ~180 MB mid-regression would be a surprise, not a convenience. */
export async function launchVerifyBrowser() {
  // The probe runs ONCE and its result is what LAUNCHES: the verdict and the launch
  // options read the same path, so the browser the bring-up reports is the browser the
  // lane opens (point 475 — see webgpuLaunchOptions).
  let systemChrome = null
  if (VERIFY_GL === 'webgpu') {
    systemChrome = findSystemChrome()
    // The lane is either run for real or declared unrunnable — never quietly served by
    // the other backend. Thrown BEFORE the recorder is armed, so a host without a
    // system Chrome/Chromium leaves no run record at all and render-verify-guard cannot
    // read the attempt as WebGPU coverage (point 475, condition 3).
    const verdict = webgpuLaneVerdict({ platform: process.platform, systemChrome })
    if (!verdict.available) throw new Error(verdict.reason)
  }
  // Render-verify evidence (user mandate 22.07.2026): record this suite run —
  // backend, exit code, screenshots — from inside the process, so the Stop-hook
  // guard (scripts/render-verify-guard.mjs) can enforce that every render change
  // was verified on BOTH backends. Observe-only; can never fail the suite.
  armRunRecorder(VERIFY_GL)
  return chromium.launch(verifyLaunchOptions(VERIFY_GL, process.platform, process.env.VERIFY_ANGLE, systemChrome))
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
