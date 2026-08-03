// Pure launch policy for the verify browsers (point 475). scripts/verify/_browser.mjs
// is the single launcher for every browser suite; this module holds the decisions it
// makes, side-effect-free, so the Vitest layer can sweep them without opening a
// browser (scripts/verify/launch-args-core.test.mjs).
//
// Why it exists (measured 03.08.2026, when the project moved to a Linux container):
// the WebGL 2 lane launched with `--use-angle=d3d11`, a Direct3D backend that exists
// only on Windows, and the WebGPU lane launched `channel:'chrome'` — a system Chrome
// that is simply absent on the new host. Neither failure was a code bug; both were a
// hard-coded HOST assumption. The lane args are therefore chosen BY PLATFORM here,
// and the WebGPU lane states out loud when the host cannot run it at all instead of
// quietly producing a WebGL 2 run under a WebGPU label.

/** The ANGLE backend each platform can actually provide.
 *
 *  win32 keeps `d3d11` — the historical value, unchanged byte for byte; the Windows
 *  host is the one this project has always verified on and nothing about it moved.
 *
 *  Linux headless gets `swiftshader`: the container has no GPU, no DRI driver and no
 *  system libEGL/libGL, so ANGLE's `gl` backend has no native driver to sit on. Chrome
 *  ≥120 does NOT silently fall back to software rendering for WebGL when the GPU path
 *  fails (it needs an explicit opt-in), so a `gl` lane on such a host does not degrade
 *  gracefully — it yields a context-less page and the suite dies at `window.__renderer`.
 *  SwiftShader is ANGLE's own bundled software backend, ships inside the browser
 *  download and needs nothing from the host. A Linux machine WITH a GPU can be pointed
 *  at its hardware backend through VERIFY_ANGLE (below) without touching this file.
 *
 *  darwin gets `metal`, the only backend ANGLE has there.
 */
const ANGLE_BY_PLATFORM = {
  win32: 'd3d11',
  darwin: 'metal',
  linux: 'swiftshader',
}

/** Fallback for a platform not named above — software, so it cannot assume a driver. */
const ANGLE_FALLBACK = 'swiftshader'

/** The ANGLE backend for the WebGL 2 lane. `override` is the raw VERIFY_ANGLE value:
 *  an escape hatch for a host whose graphics stack differs from its platform's norm
 *  (a Linux box with a real GPU wanting `gl` or `vulkan`). Empty/absent means "decide
 *  by platform". */
export function angleBackend(platform, override) {
  const forced = typeof override === 'string' ? override.trim().toLowerCase() : ''
  if (forced) return forced
  return ANGLE_BY_PLATFORM[platform] ?? ANGLE_FALLBACK
}

/** Chromium's sandbox needs unprivileged user namespaces, which container images
 *  routinely withhold; every headless CI Linux run therefore passes --no-sandbox.
 *  Windows and macOS keep exactly the argument list they always had. */
function platformArgs(platform) {
  return platform === 'linux' ? ['--no-sandbox'] : []
}

/** Launch options for the WebGL 2 fallback lane (Playwright's bundled Chromium). */
export function webglLaunchOptions(platform, angleOverride) {
  return {
    args: [
      '--enable-unsafe-webgpu',
      `--use-angle=${angleBackend(platform, angleOverride)}`,
      '--enable-gpu',
      ...platformArgs(platform),
    ],
  }
}

/** Launch options for the WebGPU lane. The flags are unchanged on every platform: the
 *  point-184 breakthrough is a SYSTEM browser with --headless=new (Playwright's bundled
 *  Chromium fails requestDevice headless), and nothing about the host changes which
 *  flags that needs — only WHETHER the host has such a browser (see webgpuLaneVerdict).
 *
 *  `systemChrome` is the executable the caller PROBED (systemChromeCandidates →
 *  findSystemChrome). When there is one it is handed over as `executablePath`, so the
 *  lane opens EXACTLY the binary the bring-up reported. That is the whole point: the
 *  `chrome` CHANNEL resolves, inside playwright-core's registry, to /opt/google/chrome/
 *  chrome and its beta/dev/canary siblings and nothing else, so a host whose browser
 *  sits anywhere else — a distro `chromium`, a snap, a Chrome installed off that path —
 *  was reported "present" and then died on Playwright's generic channel error. With the
 *  path handed through, the report and the launch cannot disagree: Playwright takes
 *  executablePath in preference to the channel registry, and a path that vanished in
 *  between fails naming the path. `channel` is dropped in that case — it only ever
 *  selected the registry entry this launch no longer consults.
 *
 *  With nothing probed (Windows, macOS — see systemChromeCandidates) the options are
 *  byte for byte the historical `channel:'chrome'` launch and Playwright resolves it. */
export function webgpuLaunchOptions(systemChrome = null) {
  const args = ['--headless=new', '--enable-unsafe-webgpu', '--enable-gpu']
  const executablePath = typeof systemChrome === 'string' ? systemChrome.trim() : ''
  return executablePath ? { executablePath, args } : { channel: 'chrome', args }
}

/** The options `_browser.mjs` hands chromium.launch for the requested backend. */
export function verifyLaunchOptions(backend, platform, angleOverride, systemChrome) {
  return backend === 'webgpu' ? webgpuLaunchOptions(systemChrome) : webglLaunchOptions(platform, angleOverride)
}

/** The loud headline of an unrunnable WebGPU lane. Verbatim in the thrown error so a
 *  log or a guard can recognise it without parsing prose. */
export const WEBGPU_UNAVAILABLE = 'WebGPU backend unavailable on this host'

/** Executables that can serve the WebGPU lane, in probe order. Names without a
 *  separator are looked up on PATH by the caller; the rest are absolute.
 *
 *  A distro `chromium` counts, and only because the resolved path is HANDED to the
 *  launch (webgpuLaunchOptions): a full Chromium build is the same engine, while the
 *  `chrome` channel alone would never have found it. Whether a given build really
 *  brings up a headless WebGPU adapter is not a question any probe can answer — the
 *  lane's own assertBackend answers it, loudly, on the running renderer.
 *
 *  Windows returns NOTHING deliberately — not "no Chrome", but "do not probe": Chrome's
 *  install location there varies (per-user, per-machine, an enterprise path), Playwright
 *  has resolved the `chrome` channel from the registry for years, and a probe that
 *  guessed wrong would break the one host this project has always verified on. macOS is
 *  left unprobed for the same reason. The probe exists for the Linux container the point
 *  measured, where the lane's absence is the whole finding. */
export function systemChromeCandidates(platform) {
  if (platform !== 'linux') return []
  return [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]
}

/**
 * Can the WebGPU lane run here? `systemChrome` is the executable the caller resolved
 * from systemChromeCandidates (null when none exists).
 *
 * On an unprobed platform the answer is "yes, let Playwright resolve the channel" —
 * that is the historical path, and a failure there still surfaces as Playwright's own
 * loud launch error. On a probed platform with nothing found, the answer is an explicit
 * UNAVAILABLE verdict. The caller throws it; it never downgrades to WebGL 2, and
 * because nothing launches, the run recorder is never armed — so no record exists for
 * render-verify-guard to mistake for WebGPU coverage.
 */
export function webgpuLaneVerdict({ platform, systemChrome } = {}) {
  if (systemChrome) return { available: true, systemChrome }
  if (systemChromeCandidates(platform).length === 0) {
    return { available: true, systemChrome: null, probed: false }
  }
  return {
    available: false,
    systemChrome: null,
    probed: true,
    reason:
      `${WEBGPU_UNAVAILABLE}: the lane needs a SYSTEM Chrome/Chromium (launched by path, ` +
      "--headless=new, point 184 — Playwright's bundled Chromium has no headless WebGPU " +
      'adapter), and none of ' +
      `[${systemChromeCandidates(platform).join(', ')}] exists on this ${platform} host. ` +
      'Install one (see the host bring-up in scripts/verify/README.md) and re-run. This run is ' +
      'NOT silently downgraded to WebGL 2: a WebGL 2 picture is no evidence about the WebGPU one ' +
      '(point 210), so nothing is recorded as backend coverage.',
  }
}
