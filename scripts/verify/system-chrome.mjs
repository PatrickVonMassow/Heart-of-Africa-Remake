// Where the WebGPU lane's browser IS on this host (point 475) — the impure half of the
// launch policy; launch-args-core.mjs stays side-effect-free and only says WHAT counts.
//
// Shared on purpose: the bring-up REPORT (scripts/verify-bringup.mjs) and the LAUNCH
// (scripts/verify/_browser.mjs) each carried their own copy of this walk, and the two
// naming different browsers is exactly the failure the point had to fix. One probe, so
// they cannot drift apart again.
import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { systemChromeCandidates } from './launch-args-core.mjs'

/** Is this an executable file? (Total — an unreadable path is simply "no".) */
export function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The first candidate that exists, or null. A bare name is looked up on `pathVar` (the
 * host's PATH), an absolute candidate is probed directly. Returns null on a platform
 * the pure core declines to probe (Windows, macOS), where Playwright resolves the
 * `chrome` channel itself.
 *
 * The path returned is the one the lane LAUNCHES — see webgpuLaunchOptions. The
 * parameters are what make this testable without depending on the runner's image.
 */
export function findSystemChrome(platform = process.platform, pathVar = process.env.PATH, exists = isExecutable) {
  for (const candidate of systemChromeCandidates(platform)) {
    if (isAbsolute(candidate)) {
      if (exists(candidate)) return candidate
      continue
    }
    for (const dir of String(pathVar ?? '').split(delimiter)) {
      if (!dir) continue
      const full = join(dir, candidate)
      if (exists(full)) return full
    }
  }
  return null
}
