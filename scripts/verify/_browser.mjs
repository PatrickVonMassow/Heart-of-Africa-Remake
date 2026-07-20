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

// Which backend the verify run targets. 'webgpu' = system Chrome, headless=new (the
// player's primary backend); 'webgl' = the bundled Chromium with ANGLE (the WebGL2
// fallback the game still ships). During the lane's roll-in the default stays 'webgl'
// (the historical behaviour, so any un-migrated normal run is byte-for-byte
// unchanged); it flips to 'webgpu' only once every suite is proven green AND
// flake-free on WebGPU (point 184's condition b), per the user's tier design.
export const VERIFY_GL = (process.env.VERIFY_GL ?? 'webgl').toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'

/** Launch the browser for the requested backend. WebGPU needs SYSTEM Chrome —
 *  Playwright's bundled Chromium fails requestDevice headless; channel:'chrome' with
 *  --headless=new works on a secure-context page (the point-184 breakthrough). The
 *  WebGL2 lane keeps the historical bundled-Chromium + ANGLE D3D11 launch. */
export async function launchVerifyBrowser() {
  if (VERIFY_GL === 'webgpu') {
    return chromium.launch({
      channel: 'chrome',
      args: ['--headless=new', '--enable-unsafe-webgpu', '--enable-gpu'],
    })
  }
  return chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
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
  return info
}
