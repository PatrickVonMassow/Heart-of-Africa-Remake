// The pure half of the backend-lane check (point 493), so the decisions it makes are
// testable without a browser: which lanes exist on this host, and whether the renderer a
// lane came up with is a software rasteriser.
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { systemChromeCandidates, webglLaunchOptions, webgpuLaunchOptions, WEBGPU_UNAVAILABLE } from './launch-args-core.mjs'

/** The first candidate that exists on this host, or null. Absolute paths are checked
 *  directly, bare names resolved on PATH — the same order the lane launches in. */
export function findSystemChrome(platform = process.platform, { exists = existsSync, which = whichOnPath } = {}) {
  for (const candidate of systemChromeCandidates(platform)) {
    if (candidate.includes('/')) {
      if (exists(candidate)) return candidate
      continue
    }
    const resolved = which(candidate)
    if (resolved) return resolved
  }
  return null
}

function whichOnPath(name) {
  try {
    return execFileSync('command', ['-v', name], { shell: true, encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}

/** The lanes to probe, in report order. A lane with no launch options carries the REASON
 *  in its place, so the check prints why rather than a bare failure. */
export function laneRenderers(systemChrome, platform = process.platform) {
  const webgl = { name: 'webgl2', launchOptions: webglLaunchOptions(platform) }
  if (systemChrome) {
    return [webgl, { name: 'webgpu', launchOptions: webgpuLaunchOptions(systemChrome) }]
  }
  return [
    webgl,
    {
      name: 'webgpu',
      launchOptions: null,
      reason:
        `${WEBGPU_UNAVAILABLE}: no system Chrome on this host. Playwright's bundled Chromium ` +
        'reports navigator.gpu as undefined here (measured 04.08.2026), so the lane cannot open. ' +
        'Install one: sudo bash scripts/verify-host-setup.sh',
    },
  ]
}

/** Is this renderer string a software rasteriser? The picture it draws is CORRECT — that is
 *  the trap. Only the speed betrays it, so the check has to name it rather than pass it. */
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
