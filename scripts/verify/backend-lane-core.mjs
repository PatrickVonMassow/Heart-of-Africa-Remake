// The pure half of the backend-lane check (point 493), so the decisions it makes are
// testable without a browser: which lanes this host can open, and whether the renderer a
// lane came up with is a software rasteriser.
//
// WHERE the browser is stays system-chrome.mjs's job (point 475) — that walk exists once
// and two copies naming different browsers is the exact failure it was written to end.
import { webglLaunchOptions, webgpuLaunchOptions, WEBGPU_UNAVAILABLE } from './launch-args-core.mjs'

/** The lanes to probe, in report order. A lane with no launch options carries the REASON
 *  in its place, so the check prints why rather than a bare failure. */
export function laneRenderers(systemChrome, platform = process.platform, baseEnv, galliumOverride) {
  const webgl = { name: 'webgl2', launchOptions: webglLaunchOptions(platform, undefined, baseEnv, galliumOverride) }
  if (systemChrome) {
    return [
      webgl,
      { name: 'webgpu', launchOptions: webgpuLaunchOptions(systemChrome, platform, baseEnv, galliumOverride) },
    ]
  }
  return [
    webgl,
    {
      name: 'webgpu',
      launchOptions: null,
      reason:
        `${WEBGPU_UNAVAILABLE}: no system Chrome on this host, and Playwright's bundled ` +
        'Chromium is not a substitute (point 184 — its headless requestDevice fails). ' +
        'Install one: sudo bash scripts/verify-host-setup.sh',
    },
  ]
}

/** Is this renderer string a software rasteriser? The picture it draws is CORRECT — that is
 *  the trap. Only the clock betrays it, so the check has to name it rather than pass it. */
export function softwareRendererVerdict(renderer, hints) {
  if (typeof renderer !== 'string' || renderer.length === 0) {
    return { software: false, reason: 'no renderer string' }
  }
  const lowered = renderer.toLowerCase()
  const hit = hints.find((hint) => lowered.includes(hint))
  return hit
    ? { software: true, reason: `renderer names "${hit}" — the GPU is not being used` }
    : { software: false, reason: 'renderer names no software rasteriser' }
}
