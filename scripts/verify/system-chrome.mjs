// What this host HAS for the picture lanes (point 475, extended by point 505) — the
// impure half of the launch policy; launch-args-core.mjs stays side-effect-free and only
// says WHAT counts. Two questions live here: where the WebGPU lane's browser is, and
// whether the Mesa GL chain both Linux lanes ride is installed.
//
// Shared on purpose: the bring-up REPORT (scripts/verify-bringup.mjs) and the LAUNCH
// (scripts/verify/_browser.mjs) each carried their own copy of this walk, and the two
// naming different browsers is exactly the failure the point had to fix. One probe, so
// they cannot drift apart again.
import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { glChainProbePaths, systemChromeCandidates } from './launch-args-core.mjs'

/** Is this an executable file? (Total — an unreadable path is simply "no".) */
export function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Does this path exist at all? Shared libraries are not executable on Debian, so the
 *  chain probe below asks existence, not the X bit. (Total, like isExecutable.) */
export function fileExists(path) {
  try {
    accessSync(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Is the hardware GL chain installed here? True when EVERY library the pure core names
 * (glChainProbePaths) is found in at least one loader directory. Point 505: it decides
 * which flags the Linux WebGPU lane launches with — Dawn's OpenGLES backend on the card
 * where the chain is there, the software rasteriser where it is not.
 *
 * Off Linux there is nothing to probe and the answer is FALSE — not "no chain", but "this
 * question does not steer that platform's lane"; webgpuLaunchOptions ignores the flag
 * outside Linux and keeps Windows/macOS byte for byte.
 *
 * `exists` is injectable so the Vitest layer can pose a host without depending on the
 * runner's image.
 */
export function hasHardwareGlChain(platform = process.platform, exists = fileExists) {
  const groups = glChainProbePaths(platform)
  if (groups.length === 0) return false
  return groups.every((alternatives) => alternatives.some((path) => exists(path)))
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
